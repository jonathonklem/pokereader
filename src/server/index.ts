import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.port, () => {
  console.log(`PokéReader listening on http://localhost:${config.port} (${config.isProduction ? 'production' : 'development'})`);
  if (!config.deepseek.apiKey) {
    console.warn('DEEPSEEK_API_KEY is not set. Scans will fail with a setup message until it is added to .env.');
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
