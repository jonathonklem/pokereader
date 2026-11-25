import { ERROR_MESSAGES } from '../shared/messages';
import type { ScanErrorCode, ScanFailure } from '../shared/types';

/**
 * An error with a safe public code. `detail` is for the server log only and is
 * never sent to the browser.
 */
export class ScanError extends Error {
  constructor(
    public readonly code: ScanErrorCode,
    public readonly status: number,
    public readonly detail?: string,
  ) {
    super(code);
    this.name = 'ScanError';
  }
}

export function failureBody(code: ScanErrorCode): ScanFailure {
  return { success: false, error: { code, message: ERROR_MESSAGES[code] } };
}
