import sharp from 'sharp';
import { ScanError } from '../errors';

export interface PreparedImage {
  data: Buffer;
  mime: 'image/jpeg';
  width: number;
  height: number;
}

/** What the browser is allowed to say it is sending. */
export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

/** DeepSeek scales images to roughly 1300×1300 pixels' worth, so more is wasted upload. */
const MAX_SIDE = 1568;
const MIN_SIDE = 200;

/**
 * Checks the bytes really are a supported image (the declared MIME type is not
 * trusted), fixes phone rotation, shrinks it and re-encodes as JPEG. Re-encoding
 * also drops EXIF data such as GPS location before anything leaves the server.
 */
export async function prepareImage(input: Buffer): Promise<PreparedImage> {
  try {
    const meta = await sharp(input, { limitInputPixels: 60_000_000 }).metadata();
    if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
      throw new ScanError('unsupported_type', 415, `format ${meta.format ?? 'unknown'}`);
    }
    if ((meta.width ?? 0) < MIN_SIDE || (meta.height ?? 0) < MIN_SIDE) {
      throw new ScanError('bad_image', 422, 'image too small');
    }
    const { data, info } = await sharp(input, { limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 86 })
      .toBuffer({ resolveWithObject: true });
    return { data, mime: 'image/jpeg', width: info.width, height: info.height };
  } catch (err) {
    if (err instanceof ScanError) throw err;
    throw new ScanError('bad_image', 422, 'image could not be decoded');
  }
}
