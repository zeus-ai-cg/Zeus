// Shared registry of supported model providers. Used by both the Settings
// UI (to render provider cards + model pickers) and the server-side model
// resolver in routes/api/chat.ts (to know how to build a client for each).

export type ProviderId =
  "gemini" | "openai" | "anthropic" | "openrouter" | "groq" | "deepseek" | "mistral";

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  keyPlaceholder: string;
  keyHelpUrl: string;
  models: { id: string; label: string }[];
  /** True for providers whose API is OpenAI-compatible (chat completions shape). */
  openAiCompatible?: { baseURL: string };
  builtIn?: boolean;
};

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    keyPlaceholder: "AIza...",
    keyHelpUrl: "https://aistudio.google.com/app/apikey",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ],
    builtIn: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    keyPlaceholder: "sk-...",
    keyHelpUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    keyPlaceholder: "sk-ant-...",
    keyHelpUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    keyPlaceholder: "sk-or-...",
    keyHelpUrl: "https://openrouter.ai/keys",
    models: [
      { id: "openai/gpt-4o", label: "GPT-4o (via OpenRouter)" },
      { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6 (via OpenRouter)" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B (via OpenRouter)" },
    ],
    openAiCompatible: { baseURL: "https://openrouter.ai/api/v1" },
  },
  {
    id: "groq",
    label: "Groq",
    keyPlaceholder: "gsk_...",
    keyHelpUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
    ],
    openAiCompatible: { baseURL: "https://api.groq.com/openai/v1" },
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    keyPlaceholder: "sk-...",
    keyHelpUrl: "https://platform.deepseek.com/api_keys",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
    openAiCompatible: { baseURL: "https://api.deepseek.com/v1" },
  },
  {
    id: "mistral",
    label: "Mistral",
    keyPlaceholder: "...",
    keyHelpUrl: "https://console.mistral.ai/api-keys",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "mistral-small-latest", label: "Mistral Small" },
    ],
    openAiCompatible: { baseURL: "https://api.mistral.ai/v1" },
  },
];

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
