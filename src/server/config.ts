import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AppConfig {
  port: number;
  isProduction: boolean;
  deepseek: {
    /** Empty string when not configured. Never logged, never sent to the browser. */
    apiKey: string;
    baseUrl: string;
    model: string;
    thinking: 'enabled' | 'disabled';
    timeoutMs: number;
  };
  upload: { maxBytes: number };
  rateLimit: { windowMs: number; max: number };
  /** Passed to Express "trust proxy". False unless TRUST_PROXY is set. */
  trustProxy: boolean | number | string;
  /** Where the built browser app lives (dist/client). */
  clientDir: string;
  /**
   * When set, every request must carry this value in the x-origin-secret header.
   * Used when a proxy in front (e.g. a Cloudflare Worker behind Access) is the only allowed caller.
   */
  originSecret: string;
  /** True when the server may use Amazon Polly for read-aloud voices. */
  cloudVoices: boolean;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  const n = Number(value);
  return Number.isInteger(n) ? n : value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return {
    port: positiveNumber(env.PORT, 3000),
    isProduction: env.NODE_ENV === 'production',
    deepseek: {
      apiKey: (env.DEEPSEEK_API_KEY ?? '').trim(),
      baseUrl: (env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/+$/, ''),
      model: env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash',
      thinking: env.DEEPSEEK_THINKING === 'enabled' ? 'enabled' : 'disabled',
      timeoutMs: positiveNumber(env.DEEPSEEK_TIMEOUT_MS, 45_000),
    },
    upload: { maxBytes: positiveNumber(env.MAX_UPLOAD_MB, 8) * 1024 * 1024 },
    rateLimit: {
      windowMs: positiveNumber(env.RATE_LIMIT_WINDOW_MINUTES, 10) * 60_000,
      max: positiveNumber(env.RATE_LIMIT_MAX, 30),
    },
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    // The server bundle is dist/server/index.js, so the client build is next door.
    clientDir: path.resolve(here, '../client'),
    originSecret: (env.ORIGIN_SECRET ?? '').trim(),
    // On by default on AWS Lambda (the deploy script grants the permission). Elsewhere set POLLY_VOICES=true.
    cloudVoices: env.POLLY_VOICES ? env.POLLY_VOICES === 'true' : Boolean(env.AWS_LAMBDA_FUNCTION_NAME),
  };
}
