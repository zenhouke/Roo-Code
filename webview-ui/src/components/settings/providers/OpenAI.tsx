import { useCallback, useEffect, useMemo, useState } from "react"
import { useEvent } from "react-use"
import { Checkbox } from "vscrui"
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import {
	openAiModelInfoSaneDefaults,
	openAiNativeDefaultModelId,
	openAiNativeModels as staticOpenAiNativeModels,
	type ExtensionMessage,
	type ModelInfo,
	type OrganizationAllowList,
	type ProviderSettings,
	type ReasoningEffort,
} from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	StandardTooltip,
} from "@src/components/ui"

import { ModelPicker } from "../ModelPicker"
import { ThinkingBudget } from "../ThinkingBudget"
import { inputEventTransform, noTransform } from "../transforms"
import { convertHeadersToObject } from "../utils/headers"

type OpenAIProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	organizationAllowList?: OrganizationAllowList
	modelValidationError?: string
	selectedModelInfo?: ModelInfo
	simplifySettings?: boolean
}

export const OpenAI = ({
	apiConfiguration,
	setApiConfigurationField,
	organizationAllowList,
	modelValidationError,
	selectedModelInfo,
	simplifySettings,
}: OpenAIProps) => {
	const { t } = useAppTranslation()

	const [openAiNativeBaseUrlSelected, setOpenAiNativeBaseUrlSelected] = useState(
		!!apiConfiguration?.openAiNativeBaseUrl,
	)
	const [fetchedOpenAiNativeModelIds, setFetchedOpenAiNativeModelIds] = useState<string[]>([])
	const [customHeaders, setCustomHeaders] = useState<[string, string][]>(() =>
		Object.entries(apiConfiguration?.openAiNativeHeaders || {}),
	)

	const openAiNativeModels = useMemo(
		() =>
			Object.fromEntries(
				fetchedOpenAiNativeModelIds.map((modelId) => [
					modelId,
					staticOpenAiNativeModels[modelId as keyof typeof staticOpenAiNativeModels] ??
						openAiModelInfoSaneDefaults,
				]),
			),
		[fetchedOpenAiNativeModelIds],
	)

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	const handleAddCustomHeader = useCallback(() => {
		setCustomHeaders((prev) => [...prev, ["", ""]])
	}, [])

	const handleUpdateHeaderKey = useCallback((index: number, newKey: string) => {
		setCustomHeaders((prev) => {
			const updated = [...prev]

			if (updated[index]) {
				updated[index] = [newKey, updated[index][1]]
			}

			return updated
		})
	}, [])

	const handleUpdateHeaderValue = useCallback((index: number, newValue: string) => {
		setCustomHeaders((prev) => {
			const updated = [...prev]

			if (updated[index]) {
				updated[index] = [updated[index][0], newValue]
			}

			return updated
		})
	}, [])

	const handleRemoveCustomHeader = useCallback((index: number) => {
		setCustomHeaders((prev) => prev.filter((_, i) => i !== index))
	}, [])

	useEffect(() => {
		const timer = setTimeout(() => {
			setApiConfigurationField("openAiNativeHeaders", convertHeadersToObject(customHeaders))
		}, 300)

		return () => clearTimeout(timer)
	}, [customHeaders, setApiConfigurationField])

	const onMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data

		switch (message.type) {
			case "openAiNativeModels":
				setFetchedOpenAiNativeModelIds(message.openAiNativeModels ?? [])
				break
		}
	}, [])

	useEvent("message", onMessage)

	return (
		<>
			<Checkbox
				checked={openAiNativeBaseUrlSelected}
				onChange={(checked: boolean) => {
					setOpenAiNativeBaseUrlSelected(checked)

					if (!checked) {
						setApiConfigurationField("openAiNativeBaseUrl", "")
					}
				}}>
				{t("settings:providers.useCustomBaseUrl")}
			</Checkbox>
			{openAiNativeBaseUrlSelected && (
				<>
					<VSCodeTextField
						value={apiConfiguration?.openAiNativeBaseUrl || ""}
						type="url"
						onInput={handleInputChange("openAiNativeBaseUrl")}
						placeholder="https://api.openai.com/v1"
						className="w-full mt-1"
					/>
				</>
			)}
			<VSCodeTextField
				value={apiConfiguration?.openAiNativeApiKey || ""}
				type="password"
				onInput={handleInputChange("openAiNativeApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.openAiApiKey")}</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.apiKeyStorageNotice")}
			</div>
			{!apiConfiguration?.openAiNativeApiKey && (
				<VSCodeButtonLink href="https://platform.openai.com/api-keys" appearance="secondary">
					{t("settings:providers.getOpenAiApiKey")}
				</VSCodeButtonLink>
			)}

			<ModelPicker
				apiConfiguration={apiConfiguration}
				setApiConfigurationField={setApiConfigurationField}
				defaultModelId={openAiNativeDefaultModelId}
				models={openAiNativeModels}
				modelIdKey="apiModelId"
				serviceName="OpenAI"
				serviceUrl="https://platform.openai.com"
				organizationAllowList={organizationAllowList}
				errorMessage={modelValidationError}
				simplifySettings={simplifySettings}
				allowCustomModel={false}
			/>

			<Checkbox
				checked={apiConfiguration?.openAiNativeStreamingEnabled ?? true}
				onChange={handleInputChange("openAiNativeStreamingEnabled", noTransform)}>
				{t("settings:modelInfo.enableStreaming")}
			</Checkbox>

			<div>
				<Checkbox
					checked={apiConfiguration?.includeMaxTokens ?? true}
					onChange={handleInputChange("includeMaxTokens", noTransform)}>
					{t("settings:includeMaxOutputTokens")}
				</Checkbox>
				<div className="text-sm text-vscode-descriptionForeground ml-6">
					{t("settings:includeMaxOutputTokensDescription")}
				</div>
			</div>

			<div className="mb-4">
				<div className="flex justify-between items-center mb-2">
					<label className="block font-medium">{t("settings:providers.customHeaders")}</label>
					<StandardTooltip content={t("settings:common.add")}>
						<VSCodeButton appearance="icon" onClick={handleAddCustomHeader}>
							<span className="codicon codicon-add"></span>
						</VSCodeButton>
					</StandardTooltip>
				</div>
				{!customHeaders.length ? (
					<div className="text-sm text-vscode-descriptionForeground">
						{t("settings:providers.noCustomHeaders")}
					</div>
				) : (
					customHeaders.map(([key, value], index) => (
						<div key={index} className="flex items-center mb-2">
							<VSCodeTextField
								value={key}
								className="flex-1 mr-2"
								placeholder={t("settings:providers.headerName")}
								onInput={(event: any) => handleUpdateHeaderKey(index, event.target.value)}
							/>
							<VSCodeTextField
								value={value}
								className="flex-1 mr-2"
								placeholder={t("settings:providers.headerValue")}
								onInput={(event: any) => handleUpdateHeaderValue(index, event.target.value)}
							/>
							<StandardTooltip content={t("settings:common.remove")}>
								<VSCodeButton appearance="icon" onClick={() => handleRemoveCustomHeader(index)}>
									<span className="codicon codicon-trash"></span>
								</VSCodeButton>
							</StandardTooltip>
						</div>
					))
				)}
			</div>

			<div className="flex flex-col gap-1">
				<Checkbox
					checked={apiConfiguration.enableReasoningEffort ?? false}
					onChange={(checked: boolean) => {
						setApiConfigurationField("enableReasoningEffort", checked)

						if (!checked) {
							const { reasoningEffort: _, ...openAiNativeCustomModelInfo } =
								apiConfiguration.openAiNativeCustomModelInfo || openAiModelInfoSaneDefaults

							setApiConfigurationField("openAiNativeCustomModelInfo", openAiNativeCustomModelInfo)
						}
					}}>
					{t("settings:providers.setReasoningLevel")}
				</Checkbox>
				{!!apiConfiguration.enableReasoningEffort && (
					<ThinkingBudget
						apiConfiguration={{
							...apiConfiguration,
							reasoningEffort: apiConfiguration.openAiNativeCustomModelInfo?.reasoningEffort,
						}}
						setApiConfigurationField={(field, value) => {
							if (field === "reasoningEffort") {
								const openAiNativeCustomModelInfo =
									apiConfiguration.openAiNativeCustomModelInfo || openAiModelInfoSaneDefaults

								setApiConfigurationField("openAiNativeCustomModelInfo", {
									...openAiNativeCustomModelInfo,
									reasoningEffort: value as ReasoningEffort,
								})
							}
						}}
						modelInfo={{
							...(apiConfiguration.openAiNativeCustomModelInfo || openAiModelInfoSaneDefaults),
							supportsReasoningEffort: ["low", "medium", "high", "xhigh"],
						}}
					/>
				)}
			</div>

			<div className="flex flex-col gap-3">
				<div className="text-sm text-vscode-descriptionForeground whitespace-pre-line">
					{t("settings:providers.customModel.capabilities")}
				</div>

				<div>
					<VSCodeTextField
						value={
							apiConfiguration?.openAiNativeCustomModelInfo?.maxTokens?.toString() ||
							openAiModelInfoSaneDefaults.maxTokens?.toString() ||
							""
						}
						type="text"
						onInput={handleInputChange("openAiNativeCustomModelInfo", (event) => {
							const value = parseInt((event.target as HTMLInputElement).value)

							return {
								...(apiConfiguration?.openAiNativeCustomModelInfo || openAiModelInfoSaneDefaults),
								maxTokens: isNaN(value) ? undefined : value,
							}
						})}
						placeholder={t("settings:placeholders.numbers.maxTokens")}
						className="w-full">
						<label className="block font-medium mb-1">
							{t("settings:providers.customModel.maxTokens.label")}
						</label>
					</VSCodeTextField>
					<div className="text-sm text-vscode-descriptionForeground">
						{t("settings:providers.customModel.maxTokens.description")}
					</div>
				</div>

				<div>
					<VSCodeTextField
						value={
							apiConfiguration?.openAiNativeCustomModelInfo?.contextWindow?.toString() ||
							openAiModelInfoSaneDefaults.contextWindow?.toString() ||
							""
						}
						type="text"
						onInput={handleInputChange("openAiNativeCustomModelInfo", (event) => {
							const value = parseInt((event.target as HTMLInputElement).value)

							return {
								...(apiConfiguration?.openAiNativeCustomModelInfo || openAiModelInfoSaneDefaults),
								contextWindow: isNaN(value) ? openAiModelInfoSaneDefaults.contextWindow : value,
							}
						})}
						placeholder={t("settings:placeholders.numbers.contextWindow")}
						className="w-full">
						<label className="block font-medium mb-1">
							{t("settings:providers.customModel.contextWindow.label")}
						</label>
					</VSCodeTextField>
					<div className="text-sm text-vscode-descriptionForeground">
						{t("settings:providers.customModel.contextWindow.description")}
					</div>
				</div>

				<div>
					<div className="flex items-center gap-1">
						<Checkbox
							checked={
								apiConfiguration?.openAiNativeCustomModelInfo?.supportsImages ??
								openAiModelInfoSaneDefaults.supportsImages
							}
							onChange={handleInputChange("openAiNativeCustomModelInfo", (checked) => ({
								...(apiConfiguration?.openAiNativeCustomModelInfo || openAiModelInfoSaneDefaults),
								supportsImages: checked,
							}))}>
							<span className="font-medium">
								{t("settings:providers.customModel.imageSupport.label")}
							</span>
						</Checkbox>
						<StandardTooltip content={t("settings:providers.customModel.imageSupport.description")}>
							<i
								className="codicon codicon-info text-vscode-descriptionForeground"
								style={{ fontSize: "12px" }}
							/>
						</StandardTooltip>
					</div>
					<div className="text-sm text-vscode-descriptionForeground pt-1">
						{t("settings:providers.customModel.imageSupport.description")}
					</div>
				</div>

				<div>
					<div className="flex items-center gap-1">
						<Checkbox
							checked={apiConfiguration?.openAiNativeCustomModelInfo?.supportsPromptCache ?? false}
							onChange={handleInputChange("openAiNativeCustomModelInfo", (checked) => ({
								...(apiConfiguration?.openAiNativeCustomModelInfo || openAiModelInfoSaneDefaults),
								supportsPromptCache: checked,
							}))}>
							<span className="font-medium">{t("settings:providers.customModel.promptCache.label")}</span>
						</Checkbox>
						<StandardTooltip content={t("settings:providers.customModel.promptCache.description")}>
							<i
								className="codicon codicon-info text-vscode-descriptionForeground"
								style={{ fontSize: "12px" }}
							/>
						</StandardTooltip>
					</div>
					<div className="text-sm text-vscode-descriptionForeground pt-1">
						{t("settings:providers.customModel.promptCache.description")}
					</div>
				</div>

				<div>
					<VSCodeTextField
						value={
							apiConfiguration?.openAiNativeCustomModelInfo?.inputPrice?.toString() ??
							openAiModelInfoSaneDefaults.inputPrice?.toString() ??
							""
						}
						type="text"
						onChange={handleInputChange("openAiNativeCustomModelInfo", (event) => {
							const value = parseFloat((event.target as HTMLInputElement).value)

							return {
								...(apiConfiguration?.openAiNativeCustomModelInfo ?? openAiModelInfoSaneDefaults),
								inputPrice: isNaN(value) ? openAiModelInfoSaneDefaults.inputPrice : value,
							}
						})}
						placeholder={t("settings:placeholders.numbers.inputPrice")}
						className="w-full">
						<div className="flex items-center gap-1">
							<label className="block font-medium mb-1">
								{t("settings:providers.customModel.pricing.input.label")}
							</label>
							<StandardTooltip content={t("settings:providers.customModel.pricing.input.description")}>
								<i
									className="codicon codicon-info text-vscode-descriptionForeground"
									style={{ fontSize: "12px" }}
								/>
							</StandardTooltip>
						</div>
					</VSCodeTextField>
				</div>

				<div>
					<VSCodeTextField
						value={
							apiConfiguration?.openAiNativeCustomModelInfo?.outputPrice?.toString() ||
							openAiModelInfoSaneDefaults.outputPrice?.toString() ||
							""
						}
						type="text"
						onChange={handleInputChange("openAiNativeCustomModelInfo", (event) => {
							const value = parseFloat((event.target as HTMLInputElement).value)

							return {
								...(apiConfiguration?.openAiNativeCustomModelInfo || openAiModelInfoSaneDefaults),
								outputPrice: isNaN(value) ? openAiModelInfoSaneDefaults.outputPrice : value,
							}
						})}
						placeholder={t("settings:placeholders.numbers.outputPrice")}
						className="w-full">
						<div className="flex items-center gap-1">
							<label className="block font-medium mb-1">
								{t("settings:providers.customModel.pricing.output.label")}
							</label>
							<StandardTooltip content={t("settings:providers.customModel.pricing.output.description")}>
								<i
									className="codicon codicon-info text-vscode-descriptionForeground"
									style={{ fontSize: "12px" }}
								/>
							</StandardTooltip>
						</div>
					</VSCodeTextField>
				</div>

				{apiConfiguration?.openAiNativeCustomModelInfo?.supportsPromptCache && (
					<>
						<div>
							<VSCodeTextField
								value={
									apiConfiguration?.openAiNativeCustomModelInfo?.cacheReadsPrice?.toString() ?? "0"
								}
								type="text"
								onChange={handleInputChange("openAiNativeCustomModelInfo", (event) => {
									const value = parseFloat((event.target as HTMLInputElement).value)

									return {
										...(apiConfiguration?.openAiNativeCustomModelInfo ??
											openAiModelInfoSaneDefaults),
										cacheReadsPrice: isNaN(value) ? 0 : value,
									}
								})}
								placeholder={t("settings:placeholders.numbers.inputPrice")}
								className="w-full">
								<div className="flex items-center gap-1">
									<span className="font-medium">
										{t("settings:providers.customModel.pricing.cacheReads.label")}
									</span>
									<StandardTooltip
										content={t("settings:providers.customModel.pricing.cacheReads.description")}>
										<i
											className="codicon codicon-info text-vscode-descriptionForeground"
											style={{ fontSize: "12px" }}
										/>
									</StandardTooltip>
								</div>
							</VSCodeTextField>
						</div>
						<div>
							<VSCodeTextField
								value={
									apiConfiguration?.openAiNativeCustomModelInfo?.cacheWritesPrice?.toString() ?? "0"
								}
								type="text"
								onChange={handleInputChange("openAiNativeCustomModelInfo", (event) => {
									const value = parseFloat((event.target as HTMLInputElement).value)

									return {
										...(apiConfiguration?.openAiNativeCustomModelInfo ??
											openAiModelInfoSaneDefaults),
										cacheWritesPrice: isNaN(value) ? 0 : value,
									}
								})}
								placeholder={t("settings:placeholders.numbers.cacheWritePrice")}
								className="w-full">
								<div className="flex items-center gap-1">
									<label className="block font-medium mb-1">
										{t("settings:providers.customModel.pricing.cacheWrites.label")}
									</label>
									<StandardTooltip
										content={t("settings:providers.customModel.pricing.cacheWrites.description")}>
										<i
											className="codicon codicon-info text-vscode-descriptionForeground"
											style={{ fontSize: "12px" }}
										/>
									</StandardTooltip>
								</div>
							</VSCodeTextField>
						</div>
					</>
				)}

				<Button
					variant="secondary"
					onClick={() =>
						setApiConfigurationField("openAiNativeCustomModelInfo", openAiModelInfoSaneDefaults)
					}>
					{t("settings:providers.customModel.resetDefaults")}
				</Button>
			</div>

			{(() => {
				const allowedTiers = (selectedModelInfo?.tiers?.map((t) => t.name).filter(Boolean) || []).filter(
					(t) => t === "flex" || t === "priority",
				)
				if (allowedTiers.length === 0) return null

				return (
					<div className="flex flex-col gap-1 mt-2" data-testid="openai-service-tier">
						<div className="flex items-center gap-1">
							<label className="block font-medium mb-1">Service tier</label>
							<StandardTooltip content="For faster processing of API requests, try the priority processing service tier. For lower prices with higher latency, try the flex processing tier.">
								<i className="codicon codicon-info text-vscode-descriptionForeground text-xs" />
							</StandardTooltip>
						</div>

						<Select
							value={apiConfiguration.openAiNativeServiceTier || "default"}
							onValueChange={(value) =>
								setApiConfigurationField(
									"openAiNativeServiceTier",
									value as ProviderSettings["openAiNativeServiceTier"],
								)
							}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder={t("settings:common.select")} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="default">Standard</SelectItem>
								{allowedTiers.includes("flex") && <SelectItem value="flex">Flex</SelectItem>}
								{allowedTiers.includes("priority") && (
									<SelectItem value="priority">Priority</SelectItem>
								)}
							</SelectContent>
						</Select>
					</div>
				)
			})()}
		</>
	)
}
