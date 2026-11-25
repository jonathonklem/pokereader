import { ERROR_MESSAGES } from '../../shared/messages';
import type { HealthResponse, ScanErrorCode, ScanResponse } from '../../shared/types';

const SCAN_TIMEOUT_MS = 60_000;

function failure(code: ScanErrorCode): ScanResponse {
  return { success: false, error: { code, message: ERROR_MESSAGES[code] } };
}

/** Sends one photo to the server. Never throws: every problem becomes a ScanFailure. */
export async function scanCard(photo: Blob, signal?: AbortSignal): Promise<ScanResponse> {
  const form = new FormData();
  form.append('image', photo, 'card.jpg');

  const timeout = AbortSignal.timeout(SCAN_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch('/api/scan', {
      method: 'POST',
      body: form,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');
    return failure(timeout.aborted ? 'ai_timeout' : 'network');
  }

  try {
    const body = (await response.json()) as ScanResponse;
    if (body && typeof body === 'object' && 'success' in body) {
      if (body.success && body.card) return body;
      if (!body.success && body.error?.message) return body;
    }
  } catch {
    // Fall through: a proxy error page or a cut-off reply.
  }
  return failure(response.status === 413 ? 'too_large' : 'server_error');
}

export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch('/api/health');
    return response.ok ? ((await response.json()) as HealthResponse) : null;
  } catch {
    return null;
  }
}
