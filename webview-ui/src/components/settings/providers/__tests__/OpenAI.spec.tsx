import React from "react"
import { fireEvent, render, screen, waitFor } from "@/utils/test-utils"
import { OpenAI } from "../OpenAI"
import { ProviderSettings } from "@roo-code/types"
import { useEvent } from "react-use"

vi.mock("vscrui", () => ({
	Checkbox: ({ children, checked, onChange }: any) => (
		<label>
			<input type="checkbox" checked={checked} onChange={() => onChange(!checked)} />
			{children}
		</label>
	),
}))

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeButton: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
	VSCodeTextField: ({ children, value, onInput, placeholder, className, ...rest }: any) => (
		<div className={className}>
			{children}
			<input value={value} onChange={(e) => onInput?.(e)} placeholder={placeholder} {...rest} />
		</div>
	),
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@src/components/common/VSCodeButtonLink", () => ({
	VSCodeButtonLink: ({ children }: any) => <a>{children}</a>,
}))

vi.mock("@src/components/ui", () => ({
	Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
	Select: ({ children }: any) => <div>{children}</div>,
	SelectContent: ({ children }: any) => <div>{children}</div>,
	SelectItem: ({ children }: any) => <div>{children}</div>,
	SelectTrigger: ({ children }: any) => <div>{children}</div>,
	SelectValue: () => <span />,
	StandardTooltip: ({ children }: any) => <div>{children}</div>,
}))

vi.mock("../../ThinkingBudget", () => ({
	ThinkingBudget: () => <div data-testid="thinking-budget" />,
}))

const mockModelPicker = vi.fn()
vi.mock("../../ModelPicker", () => ({
	ModelPicker: (props: any) => {
		mockModelPicker(props)
		return <div data-testid="model-picker" />
	},
}))

vi.mock("react-use", () => ({
	useEvent: vi.fn(),
}))

describe("OpenAI provider settings", () => {
	const setApiConfigurationField = vi.fn()
	const apiConfiguration = {
		apiProvider: "openai-native",
		apiModelId: "gpt-4o",
		openAiNativeApiKey: "test-key",
	} as ProviderSettings

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("shows only fetched OpenAI Native models in the model picker", async () => {
		let messageHandler: ((event: MessageEvent) => void) | undefined
		vi.mocked(useEvent).mockImplementation((_name: string, handler: any) => {
			messageHandler = handler
		})

		render(
			<OpenAI
				apiConfiguration={apiConfiguration}
				setApiConfigurationField={setApiConfigurationField}
				organizationAllowList={{ allowAll: true, providers: {} }}
			/>,
		)

		expect(mockModelPicker).toHaveBeenLastCalledWith(
			expect.objectContaining({
				modelIdKey: "apiModelId",
				models: {},
			}),
		)

		messageHandler?.({
			data: {
				type: "openAiNativeModels",
				openAiNativeModels: ["gpt-4o", "new-response-model"],
			},
		} as MessageEvent)

		await waitFor(() => {
			expect(mockModelPicker).toHaveBeenLastCalledWith(
				expect.objectContaining({
					models: expect.objectContaining({
						"gpt-4o": expect.any(Object),
						"new-response-model": expect.any(Object),
					}),
				}),
			)
			expect(mockModelPicker.mock.lastCall?.[0].models).not.toHaveProperty("codex-mini-latest")
		})
	})

	it("writes OpenAI Native-specific option fields from the settings controls", () => {
		render(
			<OpenAI
				apiConfiguration={apiConfiguration}
				setApiConfigurationField={setApiConfigurationField}
				organizationAllowList={{ allowAll: true, providers: {} }}
			/>,
		)

		fireEvent.click(screen.getByLabelText("settings:modelInfo.enableStreaming"))
		expect(setApiConfigurationField).toHaveBeenCalledWith("openAiNativeStreamingEnabled", false)

		fireEvent.change(screen.getByPlaceholderText("settings:placeholders.numbers.maxTokens"), {
			target: { value: "32000" },
		})
		expect(setApiConfigurationField).toHaveBeenCalledWith(
			"openAiNativeCustomModelInfo",
			expect.objectContaining({ maxTokens: 32000 }),
		)

		fireEvent.click(screen.getByText("settings:providers.customModel.resetDefaults"))
		expect(setApiConfigurationField).toHaveBeenCalledWith("openAiNativeCustomModelInfo", expect.any(Object))
	})
})
