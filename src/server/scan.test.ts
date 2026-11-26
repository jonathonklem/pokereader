/**
 * End-to-end tests for POST /api/scan against a fake DeepSeek server.
 * No real API key or network access is used. Run with: npm test
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import type { ScanResponse } from '../shared/types';
import { createApp } from './app';
import { loadConfig, type AppConfig } from './config';

const SECRET = 'sk-test-secret-never-leak';

type Upstream = (body: any, res: http.ServerResponse) => void;
let upstreamHandler: Upstream = () => undefined;
let upstreamCalls: any[] = [];
let upstreamAuth: string | undefined;
let upstream: http.Server;
let upstreamUrl = '';

const servers: http.Server[] = [];

function reply(content: string, finish = 'stop'): Upstream {
  return (_body, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ finish_reason: finish, message: { role: 'assistant', content } }] }));
  };
}

const PIKACHU = {
  success: true,
  card: {
    kind: 'pokemon',
    name: 'Pikachu',
    hp: '60',
    type: 'Electric',
    stage: 'Basic',
    evolvesFrom: null,
    attacks: [
      {
        name: 'Thunder Jolt',
        energyCost: ['Lightning', 'Colorless'],
        damage: 30,
        originalText: 'Flip a coin. If tails, this Pokémon does 10 damage to itself.',
        simpleExplanation: 'Pikachu zaps for 30. Flip a coin. On tails, Pikachu hurts itself a little.',
      },
    ],
    abilities: [],
    weakness: 'Fighting ×2',
    resistance: null,
    retreatCost: ['Colorless'],
    overallExplanation: 'Pikachu is a small electric Pokémon.',
    unclearParts: [],
  },
};

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function startApp(overrides: (c: AppConfig) => void = () => undefined): Promise<string> {
  const config = loadConfig({ DEEPSEEK_API_KEY: SECRET, DEEPSEEK_BASE_URL: upstreamUrl } as NodeJS.ProcessEnv);
  overrides(config);
  return listen(http.createServer(createApp(config)));
}

async function cardPhoto(): Promise<Buffer> {
  return sharp({ create: { width: 630, height: 880, channels: 3, background: '#f4d23c' } }).jpeg().toBuffer();
}

async function scan(base: string, file: Buffer, type = 'image/jpeg') {
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(file)], { type }), 'card.jpg');
  const res = await fetch(`${base}/api/scan`, { method: 'POST', body: form });
  const raw = await res.text();
  return { status: res.status, raw, body: JSON.parse(raw) as ScanResponse };
}

function expectFailure(result: { status: number; raw: string; body: ScanResponse }, status: number, code: string) {
  assert.equal(result.status, status);
  assert.equal(result.body.success, false);
  if (!result.body.success) {
    assert.equal(result.body.error.code, code);
    assert.ok(result.body.error.message.length > 0);
  }
  assert.ok(!result.raw.includes(SECRET), 'API key must never reach the client');
  assert.ok(!/stack|at \w+ \(|node_modules/.test(result.raw), 'no stack traces in responses');
}

before(async () => {
  upstream = http.createServer((req, res) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      upstreamAuth = req.headers.authorization;
      const body = JSON.parse(data);
      upstreamCalls.push({ url: req.url, body });
      upstreamHandler(body, res);
    });
  });
  upstreamUrl = await listen(upstream);
});

after(() => {
  for (const s of servers) {
    s.closeAllConnections();
    s.close();
  }
});

test('valid card: sends the photo to DeepSeek and returns normalized card data', async () => {
  upstreamCalls = [];
  upstreamHandler = reply(JSON.stringify(PIKACHU));
  const base = await startApp();
  const result = await scan(base, await cardPhoto());

  assert.equal(result.status, 200);
  assert.ok(result.body.success);
  if (!result.body.success) return;
  const card = result.body.card;
  assert.equal(card.name, 'Pikachu');
  assert.equal(card.hp, 60, 'hp string is coerced to a number');
  assert.equal(card.type, 'Lightning', '"Electric" is mapped to Lightning');
  assert.deepEqual(card.weakness, { type: 'Fighting', value: '×2' });
  assert.equal(card.retreatCost, 1, 'a list of symbols is counted');
  assert.equal(card.attacks[0]?.damage, '30');
  assert.deepEqual(card.rules, [], 'missing lists become empty lists');

  assert.equal(upstreamCalls.length, 1, 'exactly one API call per scan');
  const sent = upstreamCalls[0];
  assert.equal(sent.url, '/chat/completions');
  assert.equal(upstreamAuth, `Bearer ${SECRET}`);
  assert.equal(sent.body.model, 'deepseek-flash');
  assert.deepEqual(sent.body.response_format, { type: 'json_object' });
  assert.deepEqual(sent.body.thinking, { type: 'disabled' });
  assert.equal(sent.body.messages.length, 2, 'no conversation history is sent');
  assert.match(sent.body.messages[0].content, /six year old/);
  const image = sent.body.messages[1].content.find((p: any) => p.type === 'image_url');
  assert.match(image.image_url.url, /^data:image\/jpeg;base64,/);
  assert.ok(!result.raw.includes(SECRET));
});

test('trainer card with no attacks is supported', async () => {
  upstreamHandler = reply(
    JSON.stringify({
      success: true,
      card: {
        kind: 'Trainer',
        name: 'Potion',
        trainerType: 'Item',
        hp: null,
        rules: [
          {
            title: null,
            originalText: 'Heal 30 damage from 1 of your Pokémon.',
            simpleExplanation: 'Pick one of your Pokémon. Take 30 damage off it.',
          },
        ],
        overallExplanation: 'Potion makes a hurt Pokémon feel better.',
      },
    }),
  );
  const result = await scan(await startApp(), await cardPhoto());
  assert.ok(result.body.success);
  if (!result.body.success) return;
  assert.equal(result.body.card.kind, 'trainer');
  assert.equal(result.body.card.trainerType, 'Item');
  assert.deepEqual(result.body.card.attacks, []);
  assert.equal(result.body.card.retreatCost, null);
  assert.equal(result.body.card.rules.length, 1);
});

test('blurry card: unreadable parts come back as null plus a note, not a guess', async () => {
  upstreamHandler = reply(
    JSON.stringify({
      success: true,
      card: {
        kind: 'pokemon',
        name: 'Charmander',
        hp: null,
        type: 'Fire',
        attacks: [{ name: 'Ember', energyCost: [], damage: null, originalText: null, simpleExplanation: '' }],
        overallExplanation: 'Charmander is a fire Pokémon.',
        unclearParts: ['I could not read the HP.', 'I could not read what Ember does.'],
      },
    }),
  );
  const result = await scan(await startApp(), await cardPhoto());
  assert.ok(result.body.success);
  if (!result.body.success) return;
  assert.equal(result.body.card.hp, null);
  assert.equal(result.body.card.attacks[0]?.damage, null);
  assert.equal(result.body.card.attacks[0]?.simpleExplanation, 'I could not read this part clearly.');
  assert.equal(result.body.card.unclearParts.length, 2);
});

test('not a card: model says no card was found', async () => {
  upstreamHandler = reply(JSON.stringify({ success: false, message: 'That is a dog.' }));
  expectFailure(await scan(await startApp(), await cardPhoto()), 422, 'not_a_card');
});

test('blank reply is retried once', async () => {
  upstreamCalls = [];
  let n = 0;
  upstreamHandler = (body, res) => (n++ === 0 ? reply('   ') : reply(JSON.stringify(PIKACHU)))(body, res);
  const result = await scan(await startApp(), await cardPhoto());
  assert.ok(result.body.success);
  assert.equal(upstreamCalls.length, 2);
});

test('malformed JSON from the model is reported safely', async () => {
  upstreamHandler = reply('Sure! Here is the card: {name: Pikachu');
  expectFailure(await scan(await startApp(), await cardPhoto()), 502, 'ai_bad_response');
});

test('truncated reply is reported safely', async () => {
  upstreamHandler = reply('{"success": true, "card": {"name": "Pika', 'length');
  expectFailure(await scan(await startApp(), await cardPhoto()), 502, 'ai_bad_response');
});

test('DeepSeek server error does not leak upstream details', async () => {
  upstreamHandler = (_body, res) => {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: { message: 'internal upstream explosion trace-id-123' } }));
  };
  const result = await scan(await startApp(), await cardPhoto());
  expectFailure(result, 502, 'ai_unavailable');
  assert.ok(!result.raw.includes('explosion'));
});

test('rejected API key is reported as a setup problem', async () => {
  upstreamHandler = (_body, res) => {
    res.statusCode = 401;
    res.end('{}');
  };
  expectFailure(await scan(await startApp(), await cardPhoto()), 503, 'not_configured');
});

test('slow DeepSeek reply times out', async () => {
  upstreamHandler = () => undefined; // never answers
  const base = await startApp((c) => (c.deepseek.timeoutMs = 300));
  expectFailure(await scan(base, await cardPhoto()), 504, 'ai_timeout');
});

test('missing API key gives a clear configuration error and makes no API call', async () => {
  upstreamCalls = [];
  const base = await startApp((c) => (c.deepseek.apiKey = ''));
  expectFailure(await scan(base, await cardPhoto()), 503, 'not_configured');
  assert.equal(upstreamCalls.length, 0);
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.deepEqual(health, { ok: true, configured: false, cloudVoices: false });
});

test('unsupported file type is rejected', async () => {
  upstreamCalls = [];
  expectFailure(await scan(await startApp(), Buffer.from('hello'), 'text/plain'), 415, 'unsupported_type');
  assert.equal(upstreamCalls.length, 0);
});

test('a file that only claims to be a JPEG is rejected', async () => {
  upstreamCalls = [];
  expectFailure(await scan(await startApp(), Buffer.from('not really a jpeg'), 'image/jpeg'), 422, 'bad_image');
  assert.equal(upstreamCalls.length, 0);
});

test('a GIF renamed to JPEG is rejected by its real contents', async () => {
  const gif = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#fff' } }).gif().toBuffer();
  expectFailure(await scan(await startApp(), gif, 'image/jpeg'), 415, 'unsupported_type');
});

test('oversized upload is rejected', async () => {
  const base = await startApp((c) => (c.upload.maxBytes = 1024));
  expectFailure(await scan(base, await cardPhoto()), 413, 'too_large');
});

test('missing file is rejected', async () => {
  const base = await startApp();
  const res = await fetch(`${base}/api/scan`, { method: 'POST', body: new FormData() });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as ScanResponse & { success: false }).error.code, 'no_image');
});

test('rate limit stops repeated scans', async () => {
  upstreamHandler = reply(JSON.stringify(PIKACHU));
  const base = await startApp((c) => (c.rateLimit.max = 2));
  const photo = await cardPhoto();
  assert.equal((await scan(base, photo)).status, 200);
  assert.equal((await scan(base, photo)).status, 200);
  expectFailure(await scan(base, photo), 429, 'rate_limited');
});

test('origin secret, when set, blocks callers that do not send it', async () => {
  const base = await startApp((c) => (c.originSecret = 'only-the-proxy-knows'));
  assert.equal((await fetch(`${base}/api/health`)).status, 403);
  assert.equal((await fetch(`${base}/api/health`, { headers: { 'x-origin-secret': 'wrong' } })).status, 403);
  const ok = await fetch(`${base}/api/health`, { headers: { 'x-origin-secret': 'only-the-proxy-knows' } });
  assert.equal(ok.status, 200);
});

test('speak returns audio from the speaker, and rejects unknown voices and missing text', async () => {
  const asked: string[] = [];
  const config = loadConfig({ DEEPSEEK_API_KEY: SECRET, DEEPSEEK_BASE_URL: upstreamUrl } as NodeJS.ProcessEnv);
  const speaker = {
    speak: async (text: string, voice: string) => {
      asked.push(`${voice}:${text}`);
      return Buffer.from('fake-mp3');
    },
  };
  const base = await listen(http.createServer(createApp(config, { speaker })));
  const ok = await fetch(`${base}/api/speak?voice=Ruth&text=${encodeURIComponent('Zap!  Hello')}`);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type') ?? '', /audio\/mpeg/);
  assert.equal(Buffer.from(await ok.arrayBuffer()).toString(), 'fake-mp3');
  assert.deepEqual(asked, ['Ruth:Zap! Hello']);
  assert.equal((await fetch(`${base}/api/speak?voice=Zarvox&text=hi`)).status, 400);
  assert.equal((await fetch(`${base}/api/speak?voice=Ruth`)).status, 400);
  assert.equal((await fetch(`${base}/api/speak?voice=Ruth&text=${'a'.repeat(1501)}`)).status, 400);
  assert.equal(asked.length, 1);
  const health = (await (await fetch(`${base}/api/health`)).json()) as { cloudVoices: boolean };
  assert.equal(health.cloudVoices, true);
});

test('speak is off when cloud voices are not enabled', async () => {
  assert.equal((await fetch(`${await startApp()}/api/speak?voice=Ruth&text=hi`)).status, 404);
});
