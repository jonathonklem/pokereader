# PokéReader

Point a phone at a Pokémon card, tap the red button, and PokéReader explains the card in words a six year old can follow, and reads it aloud.

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js, Express
- **AI:** DeepSeek `deepseek-flash` (vision), called from the server only
- **Storage:** the browser's LocalStorage. No database, no accounts.

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
cp .env.example .env      # then put your key in DEEPSEEK_API_KEY
npm run dev
```

Open <http://localhost:5173>. The API runs on port 3000 and Vite proxies `/api` to it.

Without a key the app still starts, but the home screen shows a setup notice and every scan returns a clear "not set up" error. It never returns made-up card data.

### Getting a DeepSeek API key

1. Sign in at <https://platform.deepseek.com>.
2. Add credit under **Top up**. Scans fail with "card reader is not working" if the balance is empty (the server log says so).
3. Open **API keys**, create a key, and copy it. It is shown once.
4. Put it in `.env`:

   ```
   DEEPSEEK_API_KEY=sk-...
   ```

5. Restart the server.

The key is read only by the server. Do not put it in a `VITE_` variable or anywhere under `src/client`.

### Testing on a phone

Browsers only allow camera access on `https://` pages (and on `localhost`). Opening `http://192.168.x.x:5173` from a phone will load the app, but the camera screen will say it needs a safe page and offer **Pick a photo** instead. To use the live camera from a phone, deploy behind HTTPS (below) or use an HTTPS tunnel to your dev machine.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API server and Vite dev server, both with reload |
| `npm run build` | Type-check, build the browser app, bundle the server into `dist/` |
| `npm start` | Run the production build (serves the app and the API on `PORT`) |
| `npm test` | Server tests against a fake DeepSeek; no key or network needed |
| `npm run typecheck` | Type-check client and server |

## Deploy to a VPS

The production build is one Node process that serves both the app and the API. Put a reverse proxy in front of it for HTTPS, which the camera requires.

### Option A: Docker

```bash
git clone <your repo> pokereader && cd pokereader
cp .env.example .env && nano .env        # set DEEPSEEK_API_KEY
docker compose up -d --build
```

The container listens on `127.0.0.1:3000` and restarts on its own.

### Option B: Node and systemd

```bash
npm ci
npm run build
cp .env.example .env && nano .env        # set DEEPSEEK_API_KEY and TRUST_PROXY=1
```

`/etc/systemd/system/pokereader.service`:

```ini
[Unit]
Description=PokeReader
After=network.target

[Service]
WorkingDirectory=/opt/pokereader
ExecStart=/usr/bin/node dist/server/index.js
Environment=NODE_ENV=production
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now pokereader
```

### Option C: AWS Lambda

One function behind a public Function URL, which gives HTTPS (so the phone camera works) with no server to look after.

```bash
scripts/deploy-lambda.sh            # build and create or update; prints the URL
scripts/deploy-lambda.sh destroy    # remove the function, its URL, role and logs
```

It needs the AWS CLI with credentials and `DEEPSEEK_API_KEY` in `.env`. The URL is public and has no login: anyone who has it can spend your DeepSeek credit. The rate limit is kept per running copy of the function, so it is looser here than on a single server.

### Private access (Lambda behind Cloudflare Access)

The Function URL is public by default. To put a login in front of it:

1. Set `LAMBDA_ORIGIN_SECRET` in `.env` to a long random value and run `scripts/deploy-lambda.sh`.
   The function now answers 403 unless a request carries that value in the `x-origin-secret` header.
2. In Cloudflare, upload `cloudflare/worker.js` as a Worker with two bindings: `ORIGIN_HOST`
   (the Function URL hostname) and `ORIGIN_SECRET` (the same value, as a secret). Route your
   hostname to it (`app.example.com/*`) and add a proxied DNS record for that hostname.
3. In Cloudflare Zero Trust, add a self-hosted Access application for the hostname with an
   allow policy listing the email addresses that may log in.

Create the Access application before the DNS record, so the hostname is never reachable without a login.

### HTTPS in front (options A and B)

Caddy gets and renews the certificate for you. `/etc/caddy/Caddyfile`:

```
cards.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

With nginx, proxy to `127.0.0.1:3000`, pass `X-Forwarded-For`, and set `client_max_body_size 10m;`.

Set `TRUST_PROXY=1` whenever a proxy is in front (the Compose file already does). Without it, every visitor shares one rate limit because the server only sees the proxy's address.

On the phone, open the site in Chrome and choose **Add to Home screen** to get an app icon.

## Settings

All optional except the key. See `.env.example`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | none | Required for scanning |
| `PORT` | `3000` | Port the server listens on |
| `DEEPSEEK_MODEL` | `deepseek-flash` | Vision model id |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | API base URL |
| `DEEPSEEK_THINKING` | `disabled` | `enabled` is slower and costs more; may help on hard-to-read cards |
| `DEEPSEEK_TIMEOUT_MS` | `45000` | Give up on a scan after this long |
| `MAX_UPLOAD_MB` | `8` | Largest accepted upload |
| `RATE_LIMIT_MAX` | `30` | Scans allowed per window, per IP address |
| `RATE_LIMIT_WINDOW_MINUTES` | `10` | Length of the rate-limit window |
| `TRUST_PROXY` | off | Set to `1` behind one reverse proxy |

## How a scan works

1. The browser grabs one camera frame (or a picked photo), crops to the on-screen box, shrinks it to 1600 px on the long side and encodes it as JPEG.
2. If that exact photo was scanned before, the saved result opens and no request is made.
3. Otherwise it is posted to `POST /api/scan`. The server checks the declared type, the size, and that the bytes really are a JPEG, PNG or WebP; fixes rotation; strips metadata; and re-encodes.
4. The server sends one request to DeepSeek: the system prompt, one short user line and the image. No history. JSON output is requested and thinking is off.
5. The reply is parsed, normalised and validated (`src/server/services/ai/normalize.ts`) before anything goes back to the browser.
6. The browser saves the card and its small picture to LocalStorage and shows the explanation. Reopening it from **My cards** never calls the API.

DeepSeek counts at most 1,024 tokens per image, so a scan is roughly 2,000 input tokens plus a few hundred output tokens.

Explanations of attacks, abilities and card text come from the AI. Explanations of things that mean the same on every card (HP, weakness, resistance, retreat, evolution stage, energy cost) are written once in `src/client/lib/explain.ts`, so they cost nothing and are worded the same every time.

## Project layout

```
src/
  shared/            Types and error messages used by both sides
  server/
    index.ts         Starts the server
    app.ts           Express app: security headers, rate limit, routes, error handling
    config.ts        Environment variables
    routes/scan.ts   POST /api/scan
    services/ai/     CardAnalyzer interface, DeepSeek implementation, prompt, validation
    utils/image.ts   Image checks and resizing (sharp)
    scan.test.ts     Tests against a fake DeepSeek
  client/
    App.tsx          Picks the screen from the URL hash
    screens/         HomeScreen, ScannerScreen, CardScreen
    components/      Logo, icons, energy chips
    lib/             api, image (canvas), storage, speech, explain, router
```

### Room for later features

Nothing below is built yet; these are the seams left for it.

- **Reading practice and word highlighting:** `lib/speech.ts` already speaks sentence by sentence and reports which section is active; `buildScript()` in `lib/explain.ts` is the single source of what gets read.
- **Battle assistant and turn guidance:** `CardData` in `src/shared/types.ts` is structured (costs, damage, modifiers), not just prose, and `CardAnalyzer` can gain more methods or another implementation.
- **Collection and child profiles:** all persistence goes through `lib/storage.ts`, so entries can gain a profile id or move to IndexedDB without touching the screens.
- **Offline access:** saved cards are already fully local; a service worker for the app shell is the missing piece.

## Security notes

- The API key lives in the server's environment only. It is never logged or returned.
- Uploads are limited by size, declared MIME type and actual file contents, and are held in memory only for the request.
- `/api/scan` is rate limited per IP address.
- The log records the route, status and an error code. It never records image data, the key or DeepSeek's response body.
- The browser only ever receives a fixed error code and a friendly message. No stack traces or upstream errors.
- `helmet` sets a strict Content-Security-Policy and related headers; camera permission is limited to the app's own origin.
- `.env` is in `.gitignore` and `.dockerignore`.

## Limitations

- It needs an internet connection to scan. Saved cards can be re-read offline only while the page is still open, because there is no service worker yet.
- Reading accuracy depends on the photo and on the model. Glare, sleeves, holographic foil and tiny text can cause missed or wrong details. The model is told to say what it could not read rather than guess, and the app shows that list, but a wrong reading stated with confidence is still possible.
- Energy symbols are icons, not text, so energy costs and retreat costs are the most likely fields to be misread.
- Text to speech uses whatever voices the phone has. Quality varies by device, and a phone with no English voice will read with the wrong accent or not at all. The app works without audio.
- The rate limit is kept in memory, so it resets on restart and is per process.
- History holds the 24 most recent cards on that one device and browser. Clearing site data erases it.
- English only.

PokéReader is an unofficial fan-made learning tool. It is not affiliated with or endorsed by Nintendo, Creatures, GAME FREAK or The Pokémon Company.

## License

MIT. See [LICENSE](LICENSE). The license covers this code only; Pokémon names, card text and artwork belong to their owners, and no card images are included here.
