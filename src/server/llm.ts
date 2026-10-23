export interface LLMResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export interface LLMClientConfig {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

export class OpenAICompatibleClient {
  public baseUrl: string;
  public model: string;
  public apiKey: string;

  constructor(config?: LLMClientConfig) {
    this.baseUrl = (config?.baseUrl || process.env.CANOPY_LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, '');
    this.model = config?.model || process.env.CANOPY_LLM_MODEL || 'models/gemma-4-26b-a4b-it';
    this.apiKey = config?.apiKey || process.env.CANOPY_LLM_API_KEY || process.env.GEMMA_API_KEY || '';
  }

  public async chat(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<LLMResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const payload = {
      model: this.model,
      messages,
      temperature: options?.temperature ?? 0.1,
      max_tokens: options?.maxTokens ?? 1024,
      response_format: { type: 'json_object' },
    };

    const startTime = performance.now();
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM call failed (${res.status} ${res.statusText}): ${errText}`);
    }

    const data: any = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const tokensIn = data.usage?.prompt_tokens ?? Math.ceil(JSON.stringify(messages).length / 4);
    const tokensOut = data.usage?.completion_tokens ?? Math.ceil(text.length / 4);

    return {
      text,
      tokensIn,
      tokensOut,
      latencyMs,
    };
  }
}
