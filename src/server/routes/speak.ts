import { Router, type NextFunction, type Request, type Response } from 'express';
import { CLOUD_VOICES, MAX_SPEECH_CHARS, type CloudVoiceId } from '../../shared/voices';
import { ScanError } from '../errors';
import type { Speaker } from '../services/speech/polly';

/**
 * GET /api/speak?voice=Ruth&text=...  ->  MP3 audio.
 * A GET so the browser's audio player can load it directly and keep it in its cache:
 * hearing the same card again costs nothing.
 */
export function createSpeakRouter(speaker: Speaker | null): Router {
  const router = Router();

  router.get('/speak', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!speaker) throw new ScanError('server_error', 404, 'speech is not enabled');
      const voice = CLOUD_VOICES.find((v) => v.id === req.query.voice)?.id as CloudVoiceId | undefined;
      const text = typeof req.query.text === 'string' ? req.query.text.replace(/\s+/g, ' ').trim() : '';
      if (!voice || !text || text.length > MAX_SPEECH_CHARS) {
        throw new ScanError('server_error', 400, 'bad speech request');
      }
      let audio: Buffer;
      try {
        audio = await speaker.speak(text, voice);
      } catch (err) {
        throw new ScanError('server_error', 502, `speech failed: ${err instanceof Error ? err.name : 'unknown'}`);
      }
      res.setHeader('Cache-Control', 'private, max-age=2592000, immutable');
      res.type('audio/mpeg').send(audio);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
