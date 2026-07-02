import * as esbuild from "esbuild"
import * as fs from "fs"
import * as path from "path"
import * as https from "https"
import { fileURLToPath } from "url"
import process from "node:process"
import * as console from "node:console"
import { execFileSync } from "child_process"

import { copyPaths, copyWasms, copyLocales, setupLocaleWatcher } from "@roo-code/build"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function removeDirWithRetries(dirPath, retries = 5, retryDelayMs = 200) {
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			await fs.promises.rm(dirPath, { recursive: true, force: true })
			return
		} catch (error) {
			const isRetryable = error?.code === "ENOTEMPTY" || error?.code === "EBUSY" || error?.code === "EPERM"
			const isLastAttempt = attempt === retries

			if (!isRetryable || isLastAttempt) {
				throw error
			}

			await new Promise((resolve) => globalThis.setTimeout(resolve, retryDelayMs * (attempt + 1)))
		}
	}
}

function getRipgrepTarget() {
	const arch = process.arch

	switch (process.platform) {
		case "win32":
			return arch === "arm64" ? "aarch64-pc-windows-msvc" : arch === "ia32" ? "i686-pc-windows-msvc" : "x86_64-pc-windows-msvc"
		case "darwin":
			return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin"
		case "linux":
			return arch === "arm64" ? "aarch64-unknown-linux-musl" : arch === "arm" || arch === "armv7l" ? "arm-unknown-linux-gnueabihf" : "x86_64-unknown-linux-musl"
		default:
			throw new Error(`Unsupported platform for ripgrep download: ${process.platform}`)
	}
}

function downloadFile(url, destination) {
	return new Promise((resolve, reject) => {
		const request = https.get(url, { headers: { "User-Agent": "roo-code-build" } }, (response) => {
			if (response.statusCode === 301 || response.statusCode === 302) {
				response.resume()
				downloadFile(response.headers.location, destination).then(resolve, reject)
				return
			}

			if (response.statusCode !== 200) {
				response.resume()
				reject(new Error(`Download failed with status ${response.statusCode}: ${url}`))
				return
			}

			const file = fs.createWriteStream(destination)
			response.pipe(file)
			file.on("finish", () => file.close(resolve))
			file.on("error", reject)
		})

		request.on("error", reject)
	})
}

async function ensureRipgrepBinary(srcDir) {
	const ripgrepBinDir = path.join(srcDir, "node_modules", "@vscode", "ripgrep", "bin")
	const binName = process.platform === "win32" ? "rg.exe" : "rg"
	const binPath = path.join(ripgrepBinDir, binName)

	if (fs.existsSync(binPath)) {
		return
	}

	fs.mkdirSync(ripgrepBinDir, { recursive: true })

	const version = "v15.0.0"
	const target = getRipgrepTarget()
	const extension = process.platform === "win32" ? ".zip" : ".tar.gz"
	const archiveName = `ripgrep-${version}-${target}${extension}`
	const archivePath = path.join(process.env.TEMP || process.env.TMPDIR || srcDir, archiveName)
	const url = `https://github.com/microsoft/ripgrep-prebuilt/releases/download/${version}/${archiveName}`

	console.log(`[ripgrep] Downloading ${url}`)
	await downloadFile(url, archivePath)
	execFileSync("tar", ["-xf", archivePath, "-C", ripgrepBinDir], { stdio: "inherit" })

	if (!fs.existsSync(binPath)) {
		throw new Error(`ripgrep download completed but ${binPath} was not found`)
	}

	if (process.platform !== "win32") {
		fs.chmodSync(binPath, 0o755)
	}
}

async function main() {
	const name = "extension"
	const production = process.argv.includes("--production")
	const watch = process.argv.includes("--watch")
	const minify = production
	const sourcemap = true // Always generate source maps for error handling.

	/**
	 * @type {import('esbuild').BuildOptions}
	 */
	const buildOptions = {
		bundle: true,
		minify,
		sourcemap,
		logLevel: "silent",
		format: "cjs",
		sourcesContent: false,
		platform: "node",
	}

	const srcDir = __dirname
	const buildDir = __dirname
	const distDir = path.join(buildDir, "dist")

	await ensureRipgrepBinary(srcDir)

	if (fs.existsSync(distDir)) {
		console.log(`[${name}] Cleaning dist directory: ${distDir}`)
		await removeDirWithRetries(distDir)
	}

	/**
	 * @type {import('esbuild').Plugin[]}
	 */
	const plugins = [
		{
			name: "copyFiles",
			setup(build) {
				build.onEnd(() => {
					copyPaths(
						[
							["../README.md", "README.md"],
							["../CHANGELOG.md", "CHANGELOG.md"],
							["../LICENSE", "LICENSE"],
							["../.env", ".env", { optional: true }],
							["node_modules/@vscode/ripgrep/bin", "dist/bin/ripgrep"],
							["node_modules/vscode-material-icons/generated", "assets/vscode-material-icons"],
							["../webview-ui/audio", "webview-ui/audio"],
						],
						srcDir,
						buildDir,
					)
				})
			},
		},
		{
			name: "copyWasms",
			setup(build) {
				build.onEnd(() => copyWasms(srcDir, distDir))
			},
		},
		{
			name: "copyLocales",
			setup(build) {
				build.onEnd(() => copyLocales(srcDir, distDir))
			},
		},
		{
			name: "esbuild-problem-matcher",
			setup(build) {
				build.onStart(() => console.log("[esbuild-problem-matcher#onStart]"))
				build.onEnd((result) => {
					result.errors.forEach(({ text, location }) => {
						console.error(`✘ [ERROR] ${text}`)
						if (location && location.file) {
							console.error(`    ${location.file}:${location.line}:${location.column}:`)
						}
					})

					console.log("[esbuild-problem-matcher#onEnd]")
				})
			},
		},
	]

	/**
	 * @type {import('esbuild').BuildOptions}
	 */
	const extensionConfig = {
		...buildOptions,
		plugins,
		entryPoints: ["extension.ts"],
		outfile: "dist/extension.js",
		// global-agent must be external because it dynamically patches Node.js http/https modules
		// which breaks when bundled. It needs access to the actual Node.js module instances.
		// undici must be bundled because our VSIX is packaged with `--no-dependencies`.
		external: ["vscode", "esbuild", "global-agent"],
	}

	/**
	 * @type {import('esbuild').BuildOptions}
	 */
	const workerConfig = {
		...buildOptions,
		entryPoints: ["workers/countTokens.ts"],
		outdir: "dist/workers",
	}

	const [extensionCtx, workerCtx] = await Promise.all([
		esbuild.context(extensionConfig),
		esbuild.context(workerConfig),
	])

	if (watch) {
		await Promise.all([extensionCtx.watch(), workerCtx.watch()])
		copyLocales(srcDir, distDir)
		setupLocaleWatcher(srcDir, distDir)
	} else {
		await Promise.all([extensionCtx.rebuild(), workerCtx.rebuild()])
		await Promise.all([extensionCtx.dispose(), workerCtx.dispose()])
	}
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
