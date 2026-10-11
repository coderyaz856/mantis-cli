import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/mantis.js', import.meta.url));

// A stub API that answers every request with a server error, so the command
// fails before any prompt is shown. No network and no real credentials.
async function startFailingApi(t) {
  const server = http.createServer((req, res) => {
    req.resume();
    res.writeHead(503, { 'Content-Type': 'text/html' });
    res.end('<html><body>service unavailable</body></html>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function configuredHome(t, apiBaseUrl) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mantis-select-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.mantis'));
  fs.writeFileSync(path.join(home, '.mantis', 'config.json'), JSON.stringify({
    apiBaseUrl,
    apiKey: 'test-key',
    spaceId: '00000000-0000-0000-0000-000000000000',
    spaceStateId: '00000000-0000-0000-0000-000000000001',
  }));
  return home;
}

function runCli(args, home) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('select reports a failing API as an error, not as a crash', async (t) => {
  const apiBaseUrl = await startFailingApi(t);
  const home = configuredHome(t, apiBaseUrl);

  const { code, stdout, stderr } = await runCli(['select', 'space'], home);
  const output = stdout + stderr;

  assert.equal(code, 1);
  // the status itself is covered elsewhere; here the point is that the failure
  // is reported as a handled error rather than an uncaught exception
  assert.match(output, /Mantis server error/);
  assert.doesNotMatch(output, /at HttpMantisClient/, 'should not print a stack trace');
  assert.doesNotMatch(output, /^Node\.js v/m, 'should not print the Node banner');
});
