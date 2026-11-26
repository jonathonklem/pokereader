/**
 * The read-aloud voices offered when the server can make speech (Amazon Polly).
 * All use Polly's "neural" tier. The four adults also exist as "generative" (more expressive, about twice the price).
 */
export const CLOUD_VOICES = [
  { id: 'Ruth', label: 'Ruth (woman)', engine: 'neural' },
  { id: 'Matthew', label: 'Matthew (man)', engine: 'neural' },
  { id: 'Danielle', label: 'Danielle (woman)', engine: 'neural' },
  { id: 'Stephen', label: 'Stephen (man)', engine: 'neural' },
  { id: 'Ivy', label: 'Ivy (girl)', engine: 'neural' },
  { id: 'Kevin', label: 'Kevin (boy)', engine: 'neural' },
] as const;

export type CloudVoiceId = (typeof CLOUD_VOICES)[number]['id'];

/** Longest piece of text the server will speak in one request. */
export const MAX_SPEECH_CHARS = 1500;
