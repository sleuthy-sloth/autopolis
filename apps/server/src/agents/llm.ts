/**
 * llm.ts — minimal OpenAI-compatible chat client.
 *
 * Works against OpenRouter (default), Ollama, DeepSeek, or any OpenAI-compatible
 * endpoint: they all speak /chat/completions. Configure via env:
 *   AUTOPOLIS_LLM_BASE_URL  (default https://openrouter.ai/api/v1)
 *   AUTOPOLIS_LLM_API_KEY
 *   AUTOPOLIS_LLM_MODEL     (e.g. deepseek/deepseek-chat-v3-0324:free)
 */
export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function llmConfigFromEnv(): LlmConfig {
  return {
    baseUrl: process.env.AUTOPOLIS_LLM_BASE_URL ?? 'https://openrouter.ai/api/v1',
    apiKey: process.env.AUTOPOLIS_LLM_API_KEY ?? '',
    model: process.env.AUTOPOLIS_LLM_MODEL ?? 'deepseek/deepseek-chat-v3-0324:free',
  };
}

export class LlmError extends Error {}

/** Ask the model for a JSON object; returns the raw content string. */
export async function completeJson(
  cfg: LlmConfig,
  system: string,
  user: string,
): Promise<string> {
  if (!cfg.apiKey) throw new LlmError('no AUTOPOLIS_LLM_API_KEY configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) {
      throw new LlmError(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new LlmError('LLM returned no content');
    return content;
  } finally {
    clearTimeout(timer);
  }
}
