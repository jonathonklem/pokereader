import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ERROR_MESSAGES } from '../../shared/messages';
import { Icon } from '../components/Icon';
import { scanCard } from '../lib/api';
import { PhotoError, prepareFromFile, prepareFromVideo, type PreparedPhoto } from '../lib/image';
import { navigate } from '../lib/router';
import { findByHash, saveScan } from '../lib/storage';

type Phase =
  | { name: 'starting' }
  | { name: 'live' }
  | { name: 'no-camera'; message: string }
  | { name: 'analyzing'; preview: string }
  | { name: 'failed'; message: string };

type Facing = 'environment' | 'user';

const WAITING_LINES = ['Looking at your card…', 'Reading the words…', 'Finding easy words for you…', 'Almost done…'];

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'The camera is turned off. Ask a grown-up to allow the camera, or pick a photo.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'I can not find a camera. You can pick a photo of your card.';
  }
  if (name === 'NotReadableError') {
    return 'Another app is using the camera. Close it and try again, or pick a photo.';
  }
  return 'The camera did not start. Try again, or pick a photo.';
}

export function ScannerScreen() {
  const [phase, setPhase] = useState<Phase>({ name: 'starting' });
  const [facing, setFacing] = useState<Facing>('environment');
  const [canFlip, setCanFlip] = useState(false);
  const [waitLine, setWaitLine] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const startId = useRef(0);

  const stopCamera = useCallback(() => {
    startId.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(
    async (wanted: Facing) => {
      stopCamera();
      const id = startId.current;
      setPhase({ name: 'starting' });

      if (!navigator.mediaDevices?.getUserMedia) {
        // Browsers only offer the camera on https:// (and localhost).
        setPhase({
          name: 'no-camera',
          message: window.isSecureContext
            ? 'This browser can not use the camera. You can pick a photo of your card.'
            : 'The camera only works on a safe (https) web page. For now, pick a photo of your card.',
        });
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          // "ideal" asks for the sharpest picture the phone offers without failing on older ones.
          video: { facingMode: { ideal: wanted }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        });
        if (id !== startId.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        // Keep small card text in focus where the phone lets us.
        const track = stream.getVideoTracks()[0];
        void track
          ?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
          .catch(() => undefined);

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        if (id !== startId.current) return;
        setPhase({ name: 'live' });

        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (id === startId.current) setCanFlip(devices.filter((d) => d.kind === 'videoinput').length > 1);
      } catch (err) {
        if (id === startId.current) setPhase({ name: 'no-camera', message: cameraErrorMessage(err) });
      }
    },
    [stopCamera],
  );

  // Open the camera on arrival; release it (and cancel any scan) on the way out.
  useEffect(() => {
    void startCamera('environment');
    return () => {
      stopCamera();
      requestRef.current?.abort();
    };
  }, [startCamera, stopCamera]);

  // Free the camera if the child switches apps, and bring it back on return.
  const phaseName = useRef(phase.name);
  phaseName.current = phase.name;
  useEffect(() => {
    const onVisibility = () => {
      const usingCamera = phaseName.current === 'live' || phaseName.current === 'starting';
      if (!usingCamera) return;
      if (document.hidden) stopCamera();
      else void startCamera(facing);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [facing, startCamera, stopCamera]);

  useEffect(() => {
    if (phase.name !== 'analyzing') return;
    setWaitLine(0);
    const timer = setInterval(() => setWaitLine((n) => Math.min(n + 1, WAITING_LINES.length - 1)), 3500);
    return () => clearInterval(timer);
  }, [phase.name]);

  /** The single place a photo becomes an API call. One photo, one request. */
  const analyze = useCallback(
    async (photo: PreparedPhoto) => {
      stopCamera();

      // Same photo as before? Reuse the saved answer instead of paying for another scan.
      const seen = findByHash(photo.hash);
      if (seen) {
        navigate({ name: 'card', id: seen.id }, { replace: true });
        return;
      }

      setPhase({ name: 'analyzing', preview: photo.keep });
      const controller = new AbortController();
      requestRef.current = controller;
      try {
        const result = await scanCard(photo.upload, controller.signal);
        if (controller.signal.aborted) return;
        if (result.success) {
          const saved = saveScan(result.card, photo.keep, photo.hash);
          navigate({ name: 'card', id: saved.id }, { replace: true });
        } else {
          setPhase({ name: 'failed', message: result.error.message });
        }
      } catch {
        // Cancelled by leaving the screen or tapping Stop.
      }
    },
    [stopCamera],
  );

  const capture = async () => {
    const video = videoRef.current;
    const guide = guideRef.current;
    if (phase.name !== 'live' || !video || !guide) return;
    try {
      await analyze(await prepareFromVideo(video, guide));
    } catch {
      setPhase({ name: 'failed', message: 'I could not take that picture. Please try again.' });
    }
  };

  const onFilePicked = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await analyze(await prepareFromFile(file));
    } catch (err) {
      stopCamera();
      const message =
        err instanceof PhotoError && err.message === 'too large' ? ERROR_MESSAGES.too_large : ERROR_MESSAGES.bad_image;
      setPhase({ name: 'failed', message });
    }
  };

  const flip = () => {
    const next: Facing = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    void startCamera(next);
  };

  const cancelScan = () => {
    requestRef.current?.abort();
    void startCamera(facing);
  };

  const pickPhoto = () => fileRef.current?.click();
  const showCamera = phase.name === 'starting' || phase.name === 'live';

  return (
    <main className="fixed inset-0 flex flex-col overflow-hidden bg-ink text-white">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFilePicked} />

      {/* The video stays mounted so the stream can attach before the first frame arrives. */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-label="Camera"
        className={`absolute inset-0 size-full object-cover ${showCamera ? '' : 'hidden'}`}
      />

      <header className="relative z-10 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => navigate({ name: 'home' })}
          className="sticker pressable flex items-center gap-1 bg-white py-2.5 pl-2.5 pr-4 font-display text-xl font-extrabold text-ink"
        >
          <Icon name="back" />
          Back
        </button>
        {showCamera && canFlip && (
          <button
            type="button"
            onClick={flip}
            aria-label="Switch camera"
            className="sticker pressable grid size-14 place-items-center bg-white text-ink"
          >
            <Icon name="flip" size={30} />
          </button>
        )}
      </header>

      {showCamera && (
        <>
          <div className="relative z-0 flex flex-1 items-center justify-center px-6">
            <div
              ref={guideRef}
              className="relative aspect-[63/88] max-h-full w-[min(78vw,26rem)] rounded-[1.6rem] border-[5px] border-white shadow-[0_0_0_200vmax_rgb(27_42_78/0.55)]"
            >
              {phase.name === 'starting' && (
                <p className="absolute inset-0 grid place-items-center text-center font-display text-2xl font-bold">
                  Opening the camera…
                </p>
              )}
            </div>
          </div>

          <footer className="relative z-10 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
            <p className="mb-4 text-center font-display text-2xl font-bold [text-shadow:0_2px_6px_rgb(0_0_0/0.6)]">
              Fit the whole card in the box
            </p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center">
              <button
                type="button"
                onClick={pickPhoto}
                className="sticker pressable flex w-fit flex-col items-center justify-self-start bg-white px-3 py-2 font-display text-base font-extrabold leading-tight text-ink"
              >
                <Icon name="photo" size={30} />
                Photo
              </button>
              <button
                type="button"
                onClick={capture}
                disabled={phase.name !== 'live'}
                aria-label="Take the picture"
                className="pressable grid size-24 place-items-center rounded-full border-[5px] border-white bg-berry shadow-[0_5px_0_0_rgb(0_0_0/0.45)] disabled:opacity-50"
              >
                <Icon name="camera" size={46} />
              </button>
              <span />
            </div>
          </footer>
        </>
      )}

      {phase.name === 'analyzing' && (
        <div role="status" aria-live="polite" className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <div className="relative w-[min(60vw,18rem)] overflow-hidden rounded-3xl border-[5px] border-white">
            <img src={phase.preview} alt="Your card" className="block w-full" />
            <span className="absolute inset-x-0 h-1.5 animate-sweep bg-sun shadow-[0_0_18px_6px_rgb(255_203_5/0.7)]" />
          </div>
          <p className="min-h-[2.5em] text-center font-display text-3xl font-extrabold">{WAITING_LINES[waitLine]}</p>
          <div aria-hidden="true" className="flex gap-3">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-4 animate-hop rounded-full bg-sun"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={cancelScan}
            className="rounded-full border-[2.5px] border-white/70 px-6 py-3 font-display text-xl font-bold"
          >
            Stop
          </button>
        </div>
      )}

      {(phase.name === 'failed' || phase.name === 'no-camera') && (
        <div className="relative z-10 flex flex-1 items-center justify-center px-5">
          <div role="alert" className="sticker w-full max-w-md animate-pop-in bg-white p-6 text-center text-ink">
            <p aria-hidden="true" className="text-6xl">
              {phase.name === 'failed' ? '🤔' : '📷'}
            </p>
            <p className="mt-3 font-display text-3xl font-extrabold leading-tight">
              {phase.name === 'failed' ? 'Oops!' : 'No camera'}
            </p>
            <p className="mt-2 text-xl font-bold leading-snug text-ink/80">{phase.message}</p>
            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={() => void startCamera(facing)}
                className="sticker pressable flex items-center justify-center gap-2 bg-berry px-5 py-4 font-display text-2xl font-extrabold text-white"
              >
                <Icon name="camera" size={32} />
                {phase.name === 'failed' ? 'Try again' : 'Try the camera'}
              </button>
              <button
                type="button"
                onClick={pickPhoto}
                className="sticker pressable flex items-center justify-center gap-2 bg-sun px-5 py-4 font-display text-2xl font-extrabold"
              >
                <Icon name="photo" size={32} />
                Pick a photo
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
