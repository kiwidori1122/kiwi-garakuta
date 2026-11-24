import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const isWin = process.platform === 'win32';
export const STATE_FILE = path.join(ROOT, '.setup-state.json');
export const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } };
export const saveState = s => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
// コマンドを実行。capture=true なら出力を返しつつ画面にも表示
export function run(cmd, args, { capture = false, input = 'inherit', env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, shell: false, windowsHide: true, env: { ...process.env, ...env }, stdio: [input, capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'] });
    let out = '';
    if (capture) for (const s of [child.stdout, child.stderr]) s.on('data', d => { out += d; process.stdout.write(d); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(out) : reject(Object.assign(new Error(`${cmd} ${args.join(' ')} が失敗しました (終了コード ${code})`), { out })));
  });
}
export const wrangler = (args, opts) => run(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), ...args], opts);
// vars: 任意の公開設定（例：公開Webページを使う場合の SITE_ORIGIN）。.setup-state.json の "vars" から渡す
export function writeConfig(databaseId, vars = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId)) throw new Error('データベースIDの形式が不正です');
  const t = fs.readFileSync(path.join(ROOT, 'wrangler.template.jsonc'), 'utf8');
  let out = t.replace('__DATABASE_ID__', databaseId);
  const clean = Object.fromEntries(Object.entries(vars || {}).filter(([k, v]) => /^[A-Z_][A-Z0-9_]*$/.test(k) && typeof v === 'string'));
  if (Object.keys(clean).length) out = out.replace(/\n}\s*$/, `,\n  "vars": ${JSON.stringify(clean)}\n}\n`);
  fs.writeFileSync(path.join(ROOT, 'wrangler.jsonc'), out);
}
// 視聴者向け拡張の配布ページ（共通拡張）
export const EXTENSION_PAGE = 'https://kiwi-garakuta.pages.dev/stream-trophy/';
export function deploymentOrigin(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash || u.pathname !== '/' || !/^stream-trophies\.[a-z0-9-]+\.workers\.dev$/.test(u.hostname)) throw new Error('公開URLはこのツールの https://stream-trophies.…workers.dev にしてください');
  return u.origin;
}
export function browserCommand(value, platform = process.platform) {
  const u = new URL(value);
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === '127.0.0.1')) || u.username || u.password) throw new Error('ブラウザーで開けないURLです');
  if (platform === 'win32') return [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'rundll32.exe'), ['url.dll,FileProtocolHandler', u.href]];
  return [platform === 'darwin' ? 'open' : 'xdg-open', [u.href]];
}
export const openUrl = url => { const [cmd,args] = browserCommand(url); return run(cmd,args).catch(() => {}); };
