import * as vscode from "vscode"

import type { ProviderProfiles } from "../ProviderSettingsManager"
import {
	PROVIDER_SETTINGS_SYNC_KEY,
	initializeProviderSettingsSync,
	syncProviderProfilesToGlobalState,
} from "../ProviderSettingsSync"

vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(),
	},
}))

const createProviderProfiles = (updatedAt: number): ProviderProfiles =>
	({
		currentApiConfigName: "remote-ready",
		apiConfigs: {
			"remote-ready": {
				id: "profile-id",
				apiProvider: "anthropic",
				apiKey: "test-key",
			},
		},
		modeApiConfigs: {
			code: "profile-id",
		},
		migrations: {
			rateLimitSecondsMigrated: true,
			openAiHeadersMigrated: true,
			consecutiveMistakeLimitMigrated: true,
			todoListEnabledMigrated: true,
			claudeCodeLegacySettingsMigrated: true,
		},
		updatedAt,
	}) as ProviderProfiles

describe("ProviderSettingsSync", () => {
	let providerSettingsManager: any
	let contextProxy: any
	let context: any
	let outputChannel: any

	beforeEach(() => {
		vi.clearAllMocks()

		providerSettingsManager = {
			export: vi.fn(),
			import: vi.fn().mockResolvedValue(undefined),
			listConfig: vi.fn().mockResolvedValue([
				{
					name: "remote-ready",
					id: "profile-id",
					apiProvider: "anthropic",
					modelId: undefined,
				},
			]),
		}

		contextProxy = {
			setValue: vi.fn().mockResolvedValue(undefined),
			setProviderSettings: vi.fn().mockResolvedValue(undefined),
		}

		context = {
			globalState: {
				get: vi.fn(),
				update: vi.fn().mockResolvedValue(undefined),
				setKeysForSync: vi.fn(),
			},
		}

		outputChannel = {
			appendLine: vi.fn(),
		}
	})

	it("mirrors provider profiles to VS Code Settings Sync when enabled", async () => {
		const providerProfiles = createProviderProfiles(0)
		providerSettingsManager.export.mockResolvedValue(providerProfiles)

		await syncProviderProfilesToGlobalState({ context, providerSettingsManager, enabled: true })

		expect(context.globalState.setKeysForSync).toHaveBeenCalledWith([PROVIDER_SETTINGS_SYNC_KEY])
		expect(context.globalState.update).toHaveBeenCalledWith(
			PROVIDER_SETTINGS_SYNC_KEY,
			expect.objectContaining({
				version: 1,
				providerProfiles: expect.objectContaining({
					currentApiConfigName: providerProfiles.currentApiConfigName,
					apiConfigs: providerProfiles.apiConfigs,
					updatedAt: expect.any(Number),
				}),
				updatedAt: expect.any(Number),
			}),
		)
	})

	it("does not mirror provider profiles when sync is disabled", async () => {
		await syncProviderProfilesToGlobalState({ context, providerSettingsManager, enabled: false })

		expect(providerSettingsManager.export).not.toHaveBeenCalled()
		expect(context.globalState.update).not.toHaveBeenCalled()
		expect(context.globalState.setKeysForSync).not.toHaveBeenCalled()
	})

	it("imports newer synced provider profiles into local secrets during activation", async () => {
		const syncedProfiles = createProviderProfiles(200)
		const localProfiles = createProviderProfiles(100)

		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
			get: vi.fn().mockReturnValue(true),
		} as any)
		context.globalState.get.mockReturnValue({
			version: 1,
			updatedAt: 200,
			providerProfiles: syncedProfiles,
		})
		providerSettingsManager.export.mockResolvedValue(localProfiles)

		await initializeProviderSettingsSync(outputChannel, {
			context,
			providerSettingsManager,
			contextProxy,
		})

		expect(providerSettingsManager.import).toHaveBeenCalledWith(syncedProfiles)
		expect(contextProxy.setValue).toHaveBeenCalledWith("currentApiConfigName", "remote-ready")
		expect(contextProxy.setProviderSettings).toHaveBeenCalledWith(syncedProfiles.apiConfigs["remote-ready"])
		expect(contextProxy.setValue).toHaveBeenCalledWith("listApiConfigMeta", [
			{
				name: "remote-ready",
				id: "profile-id",
				apiProvider: "anthropic",
				modelId: undefined,
			},
		])
	})

	it("keeps local provider profiles when they are newer than the synced mirror", async () => {
		const syncedProfiles = createProviderProfiles(100)
		const localProfiles = createProviderProfiles(200)

		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
			get: vi.fn().mockReturnValue(true),
		} as any)
		context.globalState.get.mockReturnValue({
			version: 1,
			updatedAt: 100,
			providerProfiles: syncedProfiles,
		})
		providerSettingsManager.export.mockResolvedValue(localProfiles)

		await initializeProviderSettingsSync(outputChannel, {
			context,
			providerSettingsManager,
			contextProxy,
		})

		expect(providerSettingsManager.import).not.toHaveBeenCalled()
		expect(context.globalState.update).toHaveBeenCalledWith(
			PROVIDER_SETTINGS_SYNC_KEY,
			expect.objectContaining({
				version: 1,
				providerProfiles: expect.objectContaining({
					currentApiConfigName: localProfiles.currentApiConfigName,
					apiConfigs: localProfiles.apiConfigs,
					updatedAt: expect.any(Number),
				}),
				updatedAt: expect.any(Number),
			}),
		)
	})
})
