import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, deploymentOrigin, browserCommand, wrangler } from '../scripts/common.mjs';

test('Windows arguments are passed literally without a command shell', async () => {
  const args = ['a&echo injected', 'quote" and spaces', '%PATH%', '$(echo injected)', 'x|whoami', '; exit 99'];
  const text = await run(process.execPath, ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', ...args], { capture: true });
  assert.deepEqual(JSON.parse(text.trim()), args);
});

test('deployment URLs allow only the fixed worker on workers.dev', () => {
  assert.equal(deploymentOrigin('https://stream-trophies.my-account.workers.dev/'), 'https://stream-trophies.my-account.workers.dev');
  for (const value of ['http://stream-trophies.a.workers.dev', 'https://evil.example', 'https://stream-trophies.a.workers.dev.evil.example', 'https://a@stream-trophies.a.workers.dev', 'https://stream-trophies.a.workers.dev:444', 'https://stream-trophies.a.workers.dev/path', 'https://127.0.0.1', 'https://169.254.169.254', 'https://stream-trophies.a.workers.dev/?x=1', 'https://stream-trophies.a.workers.dev/#x']) assert.throws(() => deploymentOrigin(value), value);
});

test('opening a browser never invokes cmd.exe or a shell', () => {
  const [cmd,args] = browserCommand('https://stream-trophies.a.workers.dev/#admin=test&x=test', 'win32');
  assert.match(cmd, /System32[\\/]rundll32\.exe$/);
  assert.equal(args.length, 2);
  assert.equal(args[1], 'https://stream-trophies.a.workers.dev/#admin=test&x=test');
  assert.deepEqual(browserCommand('http://127.0.0.1:8787/', 'darwin'), ['open', ['http://127.0.0.1:8787/']]);
  for (const u of ['file:///C:/Windows', 'javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com']) assert.throws(() => browserCommand(u));
});

test('Wrangler runs the installed CLI through Node without npx.cmd', async () => {
  const text = await wrangler(['--version'], { capture: true, env: { WRANGLER_SEND_METRICS: 'false' } });
  assert.match(text, /4\.164\.0/);
});


test('environment values cannot choose an arbitrary executable path', () => {
 const old=process.env.SystemRoot;
 try {
  process.env.SystemRoot='C:\\temp\\attacker';assert.throws(()=>browserCommand('https://example.com','win32'));
  process.env.SystemRoot='D:\\Windows';assert.match(browserCommand('https://example.com','win32')[0],/^D:[\\/]Windows[\\/]System32[\\/]rundll32\.exe$/);
 } finally { if(old===undefined)delete process.env.SystemRoot;else process.env.SystemRoot=old; }
});
