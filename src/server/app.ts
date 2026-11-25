import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import type { HealthResponse } from '../shared/types';
import type { AppConfig } from './config';
import { ScanError, failureBody } from './errors';
import { createScanRouter } from './routes/scan';
import { DeepSeekAnalyzer } from './services/ai/deepseek';
import type { CardAnalyzer } from './services/ai/types';

export function createApp(config: AppConfig, deps: { analyzer?: CardAnalyzer } = {}) {
  const analyzer = deps.analyzer ?? new DeepSeekAnalyzer(config.deepseek);
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  // Optional lock: only the proxy that knows the secret may call this server.
  if (config.originSecret) {
    const expected = Buffer.from(config.originSecret);
    app.use((req, res, next) => {
      const given = Buffer.from(req.get('x-origin-secret') ?? '');
      if (given.length === expected.length && timingSafeEqual(given, expected)) return next();
      res.status(403).type('text/plain').send('Forbidden');
    });
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          // Left to the reverse proxy; forcing it here breaks plain-http LAN testing.
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    next();
  });

  app.get('/api/health', (_req, res: Response<HealthResponse>) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, configured: analyzer.configured });
  });

  const scanLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json(failureBody('rate_limited'));
    },
  });
  app.use('/api/scan', scanLimiter);
  app.use('/api', createScanRouter(config, analyzer));
  app.use('/api', (_req, res) => {
    res.status(404).json(failureBody('server_error'));
  });

  // In production the same process serves the built browser app.
  const indexFile = path.join(config.clientDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.use(
      express.static(config.clientDir, {
        index: false,
        setHeaders: (res, filePath) => {
          const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
          res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexFile);
    });
  }

  // Every failure leaves through here: a safe code and message for the browser,
  // a one-line reason for the log. No stack traces, keys or image data in either.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    let failure: ScanError;
    if (err instanceof ScanError) failure = err;
    else if (err instanceof multer.MulterError) {
      failure =
        err.code === 'LIMIT_FILE_SIZE'
          ? new ScanError('too_large', 413, 'upload over size limit')
          : new ScanError('no_image', 400, `upload rejected: ${err.code}`);
    } else {
      failure = new ScanError('server_error', 500, err instanceof Error ? err.name : 'unknown error');
    }
    console.warn(
      `[scan] ${req.method} ${req.path} -> ${failure.status} ${failure.code}${failure.detail ? ` (${failure.detail})` : ''}`,
    );
    if (res.headersSent) return;
    res.status(failure.status).json(failureBody(failure.code));
  });

  return app;
}
