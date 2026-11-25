import type { AppConfig } from '../../config';
import { ScanError } from '../../errors';
import type { PreparedImage } from '../../utils/image';
import { normalizeAnalysis, parseModelJson } from './normalize';
import { SYSTEM_PROMPT, USER_PROMPT } from './prompt';
import type { CardAnalysis, CardAnalyzer } from './types';

/**
 * Reads a card photo with DeepSeek's vision model.
 *
 * Verified against https://api-docs.deepseek.com (Vision and JSON Output guides):
 * - POST {base}/chat/completions, OpenAI-style, Bearer auth.
 * - "deepseek-flash" is the model that accepts images.
 * - Images go in the user message as an image_url block holding a data: URL.
 * - response_format json_object requires the word "json" in the prompt, and the
 *   reply can occasionally come back blank, so one retry is built in.
 * - Thinking is on by default; it is switched off here to keep scans quick and cheap.
 */
export class DeepSeekAnalyzer implements CardAnalyzer {
  constructor(private readonly settings: AppConfig['deepseek']) {}

  get configured(): boolean {
    return this.settings.apiKey.length > 0;
  }

  async analyze(image: PreparedImage): Promise<CardAnalysis> {
    if (!this.configured) throw new ScanError('not_configured', 503, 'DEEPSEEK_API_KEY is not set');

    // One deadline covers the first try and the blank-reply retry.
    const signal = AbortSignal.timeout(this.settings.timeoutMs);
    let content = await this.request(image, signal);
    if (!content.trim()) content = await this.request(image, signal);
    if (!content.trim()) throw new ScanError('ai_bad_response', 502, 'blank reply twice');

    return normalizeAnalysis(parseModelJson(content));
  }

  private async request(image: PreparedImage, signal: AbortSignal): Promise<string> {
    const thinking = this.settings.thinking === 'enabled';
    const body = {
      model: this.settings.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: USER_PROMPT },
            {
              type: 'image_url',
              image_url: { url: `data:${image.mime};base64,${image.data.toString('base64')}`, detail: 'high' },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      thinking: { type: this.settings.thinking },
      // Thinking tokens count toward max_tokens, so leave room for them.
      max_tokens: thinking ? 12_000 : 3_000,
      ...(thinking ? {} : { temperature: 0.2 }),
      stream: false,
    };

    let response: Response;
    try {
      response = await fetch(`${this.settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.settings.apiKey}` },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new ScanError('ai_timeout', 504, 'DeepSeek request timed out');
      }
      throw new ScanError('ai_unavailable', 502, 'could not reach DeepSeek');
    }

    if (!response.ok) {
      // The upstream body is deliberately not read into the log or the reply.
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 401 || response.status === 403) {
        throw new ScanError('not_configured', 503, `DeepSeek rejected the API key (HTTP ${response.status})`);
      }
      const hint = response.status === 402 ? ' (account balance is empty)' : '';
      throw new ScanError('ai_unavailable', 502, `DeepSeek returned HTTP ${response.status}${hint}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new ScanError('ai_timeout', 504, 'DeepSeek response timed out');
      }
      throw new ScanError('ai_bad_response', 502, 'DeepSeek reply was not JSON');
    }

    const choice = (payload as { choices?: { finish_reason?: string; message?: { content?: unknown } }[] })
      .choices?.[0];
    if (!choice) throw new ScanError('ai_bad_response', 502, 'no choices in reply');
    if (choice.finish_reason === 'length') throw new ScanError('ai_bad_response', 502, 'reply was cut off');
    return typeof choice.message?.content === 'string' ? choice.message.content : '';
  }
}
