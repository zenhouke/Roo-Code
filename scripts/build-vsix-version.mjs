#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")
const packagePath = path.join(rootDir, "src", "package.json")

const version = process.argv[2]

const usage = "Usage: build.bat <version>\nExample: build.bat 3.55.3"

if (!version || version === "-h" || version === "--help") {
	console.log(usage)
	process.exit(version ? 0 : 1)
}

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
	console.error(`Invalid version: ${version}`)
	console.error(usage)
	process.exit(1)
}

const run = (command, args, options = {}) => {
	console.log(`\n> ${command} ${args.join(" ")}`)
	const result = spawnSync(command, args, {
		cwd: rootDir,
		stdio: "inherit",
		shell: process.platform === "win32",
		env: { ...process.env, ...options.env },
	})

	if (result.status !== 0 && !options.allowFailure) {
		process.exit(result.status ?? 1)
	}

	return result
}

const packageJson = JSON.parse(readFileSync(packagePath, "utf8"))
packageJson.version = version
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, "\t")}\n`)

console.log(`Set src/package.json version to ${version}`)

run("pnpm", ["install", "--frozen-lockfile"])

run("pnpm", ["exec", "turbo", "daemon", "stop"], { allowFailure: true })

const turboEnv = { TURBO_DAEMON: "false" }
run("pnpm", ["clean"], { env: turboEnv })
run("pnpm", ["vsix"], { env: turboEnv })

const vsixPath = path.join(rootDir, "bin", `roo-cline-${version}.vsix`)
if (!existsSync(vsixPath)) {
	console.error(`Expected VSIX was not created: ${vsixPath}`)
	process.exit(1)
}

console.log(`\nCreated ${vsixPath}`)
