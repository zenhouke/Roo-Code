#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")
const binDir = path.join(rootDir, "bin")
const packagePath = path.join(rootDir, "src", "package.json")

const args = process.argv.slice(2)
const help = args.includes("-h") || args.includes("--help")
const dryRun = args.includes("--dry-run")
const noUninstall = args.includes("--no-uninstall")
const editorArg = args.find((arg) => arg.startsWith("--editor="))
const editorCommand = editorArg?.slice("--editor=".length) || "code"
const version = args.find((arg) => !arg.startsWith("-"))

const usage = [
	"Usage: install.bat [version] [--editor=code|cursor|code-insiders] [--dry-run] [--no-uninstall]",
	"Examples:",
	"  install.bat 3.55.3",
	"  install.bat",
	"  install.bat 3.55.3 --editor=cursor",
].join("\n")

if (help) {
	console.log(usage)
	process.exit(0)
}

if (version && !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
	console.error(`Invalid version: ${version}`)
	console.error(usage)
	process.exit(1)
}

if (!existsSync(binDir)) {
	console.error(`VSIX directory not found: ${binDir}`)
	console.error("Run build.bat first.")
	process.exit(1)
}

const packageJson = JSON.parse(readFileSync(packagePath, "utf8"))
const extensionId = `${packageJson.publisher}.${packageJson.name}`

const findLatestVsix = () => {
	const files = readdirSync(binDir)
		.filter((file) => file.endsWith(".vsix"))
		.map((file) => {
			const fullPath = path.join(binDir, file)
			return { fullPath, mtimeMs: statSync(fullPath).mtimeMs }
		})
		.sort((a, b) => b.mtimeMs - a.mtimeMs)

	return files[0]?.fullPath
}

const vsixPath = version ? path.join(binDir, `${packageJson.name}-${version}.vsix`) : findLatestVsix()

if (!vsixPath || !existsSync(vsixPath)) {
	console.error(version ? `VSIX file not found: ${vsixPath}` : `No VSIX files found in ${binDir}`)
	console.error("Run build.bat first.")
	process.exit(1)
}

const runEditor = (editorArgs) => {
	console.log(`> ${editorCommand} ${editorArgs.join(" ")}`)
	if (dryRun) {
		return
	}

	const result = spawnSync(editorCommand, editorArgs, {
		cwd: rootDir,
		stdio: "inherit",
		shell: process.platform === "win32",
	})

	if (result.status !== 0) {
		process.exit(result.status ?? 1)
	}
}

console.log(`Installing ${vsixPath}`)
console.log(`Extension: ${extensionId}`)
console.log(`Editor: ${editorCommand}`)

if (!noUninstall) {
	console.log("\nUninstalling existing extension if present...")
	if (dryRun) {
		console.log(`> ${editorCommand} --uninstall-extension ${extensionId}`)
	} else {
		const result = spawnSync(editorCommand, ["--uninstall-extension", extensionId], {
			cwd: rootDir,
			stdio: "inherit",
			shell: process.platform === "win32",
		})

		if (result.status !== 0) {
			console.log("Existing extension was not installed, continuing.")
		}
	}
}

console.log("\nInstalling VSIX...")
runEditor(["--install-extension", vsixPath])

if (dryRun) {
	console.log("\nDry run complete.")
} else {
	console.log("\nInstalled. Restart VS Code to load the updated extension.")
}
