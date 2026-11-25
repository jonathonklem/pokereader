import type { CardData } from '../../../shared/types';
import type { PreparedImage } from '../../utils/image';

export type CardAnalysis = { recognized: true; card: CardData } | { recognized: false };

/**
 * The one seam between the app and whichever vision model reads the card.
 * To try another provider, implement this and pass it to createApp().
 */
export interface CardAnalyzer {
  readonly configured: boolean;
  analyze(image: PreparedImage): Promise<CardAnalysis>;
}
