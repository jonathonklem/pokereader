/**
 * Photo handling in the browser: every picture is drawn to a canvas, shrunk and
 * re-encoded as JPEG before upload. That keeps uploads small (and cheap), fixes
 * phone rotation, and means the server only ever receives JPEG.
 */

/** Long side of the upload. DeepSeek scales to about 1300×1300 pixels' worth, so this keeps card text sharp without waste. */
const UPLOAD_MAX_SIDE = 1600;
const UPLOAD_QUALITY = 0.86;
/** The copy kept on the phone for the card screen and history. */
const KEEP_MAX_SIDE = 520;
const KEEP_QUALITY = 0.72;
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

export interface PreparedPhoto {
  /** JPEG to send to the server. */
  upload: Blob;
  /** Small JPEG data URL saved with the scan. */
  keep: string;
  /** SHA-256 of the upload, used to spot a photo that was already scanned. */
  hash: string | null;
}

export interface Crop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export class PhotoError extends Error {}

function render(source: CanvasImageSource, crop: Crop, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(crop.sw, crop.sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(crop.sw * scale));
  canvas.height = Math.max(1, Math.round(crop.sh * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('no canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new PhotoError('encode failed'))), 'image/jpeg', quality);
  });
}

async function sha256(blob: Blob): Promise<string | null> {
  // crypto.subtle only exists on https and localhost.
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function prepare(source: CanvasImageSource, crop: Crop): Promise<PreparedPhoto> {
  const upload = await toBlob(render(source, crop, UPLOAD_MAX_SIDE), UPLOAD_QUALITY);
  const keep = render(source, crop, KEEP_MAX_SIDE).toDataURL('image/jpeg', KEEP_QUALITY);
  return { upload, keep, hash: await sha256(upload) };
}

/** Grabs the current camera frame, cropped to the part of the video inside the on-screen guide. */
export function prepareFromVideo(video: HTMLVideoElement, guide: Element): Promise<PreparedPhoto> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new PhotoError('camera not ready');

  // The video is shown with object-fit: cover, so work out which pixels are under the guide.
  const view = video.getBoundingClientRect();
  const box = guide.getBoundingClientRect();
  const scale = Math.max(view.width / vw, view.height / vh);
  const offsetX = (view.width - vw * scale) / 2;
  const offsetY = (view.height - vh * scale) / 2;
  const margin = box.width * 0.08; // forgiving of a card that pokes out of the box

  const left = Math.max(0, (box.left - view.left - offsetX - margin) / scale);
  const top = Math.max(0, (box.top - view.top - offsetY - margin) / scale);
  const right = Math.min(vw, (box.right - view.left - offsetX + margin) / scale);
  const bottom = Math.min(vh, (box.bottom - view.top - offsetY + margin) / scale);

  return prepare(video, { sx: left, sy: top, sw: Math.max(1, right - left), sh: Math.max(1, bottom - top) });
}

/** Loads a photo picked from the gallery. */
export async function prepareFromFile(file: File): Promise<PreparedPhoto> {
  if (file.type && !file.type.startsWith('image/')) throw new PhotoError('not an image');
  if (file.size > MAX_SOURCE_BYTES) throw new PhotoError('too large');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError('cannot decode');
  }
  try {
    return await prepare(bitmap, { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height });
  } finally {
    bitmap.close();
  }
}
