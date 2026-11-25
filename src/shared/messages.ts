import type { ScanErrorCode } from './types';

/**
 * The only error text the browser ever sees. Written for a child, with a hint
 * for a grown-up where one is needed. Internal details stay in the server log.
 */
export const ERROR_MESSAGES: Record<ScanErrorCode, string> = {
  no_image: 'I did not get a picture. Please try again.',
  unsupported_type: 'I can not open that kind of picture. Try taking a new photo.',
  too_large: 'That picture is too big. Try taking a new photo.',
  bad_image: 'I could not open that picture. Try taking a new photo.',
  not_configured: 'PokéReader is not set up yet. Ask a grown-up to add the DeepSeek key.',
  not_a_card: 'I could not find a Pokémon card. Put the whole card in the box and try again.',
  ai_timeout: 'That took too long. Please try again.',
  ai_unavailable: 'My card reader is not working right now. Please try again soon.',
  ai_bad_response: 'I got mixed up reading that card. Please try again.',
  rate_limited: 'That is a lot of cards! Wait a few minutes, then try again.',
  network: 'I can not reach the internet. Check the Wi-Fi and try again.',
  server_error: 'Something went wrong. Please try again.',
};
