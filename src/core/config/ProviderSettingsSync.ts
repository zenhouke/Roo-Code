import * as vscode from "vscode"
import { z } from "zod"

import { Package } from "../../shared/package"
import type { ContextProxy } from "./ContextProxy"
import type { ProviderProfiles, ProviderSettingsManager } from "./ProviderSettingsManager"
import { providerProfilesSchema } from "./ProviderSettingsManager"

export const PROVIDER_SETTINGS_SYNC_KEY = "syncedProviderProfiles"

const syncedProviderProfilesSchema = z.object({
	version: z.literal(1),
	updatedAt: z.number(),
	providerProfiles: providerProfilesSchema.extend({
		updatedAt: z.number().optional(),
	}),
})

type SyncedProviderProfiles = z.infer<typeof syncedProviderProfilesSchema>

type SyncOptions = {
	context: vscode.ExtensionContext
	providerSettingsManager: ProviderSettingsManager
}

type InitializeSyncOptions = SyncOptions & {
	contextProxy: ContextProxy
}

function isProviderSettingsSyncEnabled() {
	return vscode.workspace.getConfiguration(Package.name).get<boolean>("syncProviderSettings", false) === true
}

function withUpdatedAt(providerProfiles: ProviderProfiles, updatedAt: number): ProviderProfiles {
	return {
		...providerProfiles,
		updatedAt,
	} as ProviderProfiles
}

async function applyProviderProfiles(
	providerProfiles: ProviderProfiles,
	{ providerSettingsManager, contextProxy }: Pick<InitializeSyncOptions, "providerSettingsManager" | "contextProxy">,
) {
	await providerSettingsManager.import(providerProfiles)

	const currentProviderName = providerProfiles.currentApiConfigName
	const currentProvider = providerProfiles.apiConfigs[currentProviderName]

	await contextProxy.setValue("currentApiConfigName", currentProviderName)
	if (currentProvider) {
		await contextProxy.setProviderSettings(currentProvider)
	}
	await contextProxy.setValue("listApiConfigMeta", await providerSettingsManager.listConfig())
}

export async function syncProviderProfilesToGlobalState({
	context,
	providerSettingsManager,
	enabled,
}: SyncOptions & {
	enabled?: boolean
}) {
	const shouldSync = enabled ?? isProviderSettingsSyncEnabled()
	if (!shouldSync) {
		return
	}

	const updatedAt = Date.now()
	const providerProfiles = withUpdatedAt(await providerSettingsManager.export(), updatedAt)
	const syncedProviderProfiles: SyncedProviderProfiles = {
		version: 1,
		updatedAt,
		providerProfiles,
	}

	context.globalState.setKeysForSync([PROVIDER_SETTINGS_SYNC_KEY])
	await context.globalState.update(PROVIDER_SETTINGS_SYNC_KEY, syncedProviderProfiles)
}

export async function initializeProviderSettingsSync(
	outputChannel: vscode.OutputChannel,
	{ context, providerSettingsManager, contextProxy }: InitializeSyncOptions,
) {
	if (!isProviderSettingsSyncEnabled()) {
		return
	}

	context.globalState.setKeysForSync([PROVIDER_SETTINGS_SYNC_KEY])

	const syncedProviderProfilesResult = syncedProviderProfilesSchema.safeParse(
		context.globalState.get(PROVIDER_SETTINGS_SYNC_KEY),
	)

	if (!syncedProviderProfilesResult.success) {
		await syncProviderProfilesToGlobalState({ context, providerSettingsManager, enabled: true })
		return
	}

	const syncedProviderProfiles = syncedProviderProfilesResult.data
	const localProviderProfiles = await providerSettingsManager.export()
	const localUpdatedAt = localProviderProfiles.updatedAt ?? 0

	if (syncedProviderProfiles.updatedAt > localUpdatedAt) {
		outputChannel.appendLine("[ProviderSettingsSync] Importing provider profiles from VS Code Settings Sync")
		await applyProviderProfiles(syncedProviderProfiles.providerProfiles, { providerSettingsManager, contextProxy })
		return
	}

	await syncProviderProfilesToGlobalState({ context, providerSettingsManager, enabled: true })
}
