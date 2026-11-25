import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { ScanResponse } from '../../shared/types';
import type { AppConfig } from '../config';
import { ScanError } from '../errors';
import type { CardAnalyzer } from '../services/ai/types';
import { ACCEPTED_MIME_TYPES, prepareImage } from '../utils/image';

export function createScanRouter(config: AppConfig, analyzer: CardAnalyzer): Router {
  const router = Router();

  // Photos are held in memory only for the length of the request; nothing is written to disk.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.upload.maxBytes, files: 1, fields: 0, parts: 2 },
    fileFilter: (_req, file, cb) => {
      if (ACCEPTED_MIME_TYPES.includes(file.mimetype)) cb(null, true);
      else cb(new ScanError('unsupported_type', 415, `declared type ${file.mimetype}`));
    },
  }).single('image');

  router.post('/scan', upload, async (req: Request, res: Response<ScanResponse>, next: NextFunction) => {
    try {
      // Fail before doing any work so a missing key is obvious rather than silent.
      if (!analyzer.configured) throw new ScanError('not_configured', 503, 'DEEPSEEK_API_KEY is not set');
      if (!req.file?.buffer?.length) throw new ScanError('no_image', 400);

      const image = await prepareImage(req.file.buffer);
      const result = await analyzer.analyze(image);
      if (!result.recognized) throw new ScanError('not_a_card', 422);

      res.json({ success: true, card: result.card });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
