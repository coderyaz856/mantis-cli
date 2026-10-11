import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpMantisClient } from '../lib/impl/http-mantis-client.js';

const HTML = '<html><head><title>Error</title></head><body>gateway failure</body></html>';

function clientAnswering(status, body, contentType, t) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response(body, {
    status,
    statusText: 'Server Error',
    headers: { 'content-type': contentType },
  });
  return new HttpMantisClient({
    requireAuth: () => ({ apiBaseUrl: 'https://example.invalid', apiKey: 'test-key' }),
  });
}

test('an HTML error page reports the status the server actually returned', async (t) => {
  for (const status of [500, 502, 503, 504]) {
    const client = clientAnswering(status, HTML, 'text/html', t);
    await assert.rejects(
      client.request('GET', '/api/v1/me/spaces/'),
      (err) => {
        assert.match(err.message, new RegExp(`HTTP ${status}\\b`));
        assert.equal(err.status, status);
        return true;
      },
      `status ${status}`,
    );
  }
});

test('an HTML error page below 500 keeps reporting its own status', async (t) => {
  const client = clientAnswering(404, HTML, 'text/html', t);
  await assert.rejects(
    client.request('GET', '/api/v1/me/spaces/'),
    /Mantis API error \(HTTP 404\)/,
  );
});

test('a JSON error body is still passed through unchanged', async (t) => {
  const client = clientAnswering(502, JSON.stringify({ error: 'upstream timed out' }), 'application/json', t);
  await assert.rejects(client.request('GET', '/api/v1/me/spaces/'), /^Error: upstream timed out$/);
});
