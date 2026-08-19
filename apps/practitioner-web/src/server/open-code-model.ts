import { createOpenAI } from "@ai-sdk/openai";

const OPENCODE_GO_DEFAULT_BASE_URL = "https://opencode.ai/zen/go/v1";
const OPENCODE_GO_DEFAULT_MODEL = "gpt-5.6-luna";

export interface OpenCodeModelOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly modelId?: string;
  readonly fetch?: typeof globalThis.fetch;
}

function opencodeProvider(options: OpenCodeModelOptions = {}) {
  return createOpenAI({
    name: "opencode-go",
    baseURL: options.baseUrl ?? process.env.OPENCODE_BASE_URL ?? OPENCODE_GO_DEFAULT_BASE_URL,
    apiKey: options.apiKey ?? process.env.OPENCODE_API_KEY,
    fetch: options.fetch
  });
}

export function createOpenCodeGoModel(options: OpenCodeModelOptions = {}) {
  const provider = opencodeProvider(options);
  const modelId = options.modelId ?? process.env.OPENCODE_MODEL_ID ?? OPENCODE_GO_DEFAULT_MODEL;
  return provider.responses(modelId);
}

export function getOpenCodeStatus() {
  return {
    configured: Boolean(process.env.OPENCODE_API_KEY),
    modelConfigured: Boolean(process.env.OPENCODE_MODEL_ID),
    protocol: process.env.OPENCODE_PROVIDER_PROTOCOL ?? "openai-responses",
    baseUrlConfigured: Boolean(process.env.OPENCODE_BASE_URL)
  } as const;
}
