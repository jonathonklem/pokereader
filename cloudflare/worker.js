// Sits on the public hostname (behind Cloudflare Access) and forwards every request
// to the Lambda Function URL, adding the shared secret the function requires.
// Bindings: ORIGIN_HOST (plain text), ORIGIN_SECRET (secret).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.hostname = env.ORIGIN_HOST;
    url.port = '';

    const headers = new Headers(request.headers);
    headers.set('x-origin-secret', env.ORIGIN_SECRET);
    // The login cookie and token are for Cloudflare, not the app.
    headers.delete('cookie');
    headers.delete('cf-access-jwt-assertion');

    return fetch(url, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
  },
};
