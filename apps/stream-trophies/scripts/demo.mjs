// ローカル動作確認（Cloudflareのアカウント不要・YouTubeにも接続しない）
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, wrangler, writeConfig, openUrl } from './common.mjs';
fs.writeFileSync(path.join(ROOT, '.dev.vars'), 'DEMO=1\nADMIN_KEY=demo-admin-key\nOVERLAY_KEY=demo-overlay-key\n');
if (!fs.existsSync(path.join(ROOT, 'wrangler.jsonc'))) writeConfig('00000000-0000-0000-0000-000000000000');
await wrangler(['d1', 'migrations', 'apply', 'DB', '--local'], { input: 'ignore' });
setTimeout(() => openUrl('http://127.0.0.1:8787/#admin=demo-admin-key'), 6000);
console.log('\nデモを起動します。止めるときはこの画面で Ctrl+C を押してください。\n');
await wrangler(['dev', '--port', '8787', '--ip', '127.0.0.1']);
