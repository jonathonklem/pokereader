import serverless from 'serverless-http';
import { createApp } from './app';
import { loadConfig } from './config';

/**
 * AWS Lambda entry point (used with a Lambda Function URL).
 * The same Express app as the standalone server, wrapped so Lambda can call it.
 * Deploy with scripts/deploy-lambda.sh.
 */
export const handler = serverless(createApp(loadConfig()), {
  // Sent back base64-encoded so pictures and fonts survive the trip through Lambda.
  binary: ['image/*', 'font/*', 'audio/*', 'application/octet-stream'],
});
