import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { CLOUD_VOICES, type CloudVoiceId } from '../../../shared/voices';

/** Turns text into spoken MP3 audio. */
export interface Speaker {
  speak(text: string, voice: CloudVoiceId): Promise<Buffer>;
}

/** Amazon Polly, using whatever AWS credentials the process already has (the Lambda role, or a local profile). */
export class PollySpeaker implements Speaker {
  private client = new PollyClient({});

  async speak(text: string, voice: CloudVoiceId): Promise<Buffer> {
    const engine = CLOUD_VOICES.find((v) => v.id === voice)?.engine ?? 'neural';
    const result = await this.client.send(
      new SynthesizeSpeechCommand({ Text: text, VoiceId: voice, Engine: engine, OutputFormat: 'mp3', TextType: 'text' }),
    );
    if (!result.AudioStream) throw new Error('Polly returned no audio');
    return Buffer.from(await result.AudioStream.transformToByteArray());
  }
}
