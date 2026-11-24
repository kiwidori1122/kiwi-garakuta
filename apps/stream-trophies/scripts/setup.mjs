// 配信トロフィー クラウド版セットアップ
//   初回: Cloudflareにログイン → APIキーとチャンネルを入力 → あとは自動
//   2回目以降（--update）: 最新のコードを公開し直すだけ
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { ROOT, loadState, saveState, wrangler, writeConfig, openUrl, EXTENSION_PAGE, deploymentOrigin } from './common.mjs';

const update = process.argv.includes('--update');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q, def = '') => (await rl.question(def ? `${q} [Enterで「${def}」のまま]: ` : `${q}: `)).trim() || def;
const step = (n, text) => console.log(`\n━━ ${n}. ${text}`);
const state = loadState();
const key = () => crypto.randomBytes(32).toString('base64url');

try {
  step(1, 'Cloudflare にログイン');
  try { const who = await wrangler(['whoami'], { capture: true }); if (/not authenticated|You are not/i.test(who)) throw 0; }
  catch { console.log('ブラウザが開きます。Cloudflareにログイン（無料アカウントで可）して「Allow」を押してください。'); await wrangler(['login']); }

  let apiKey = '', channel = state.channel || '';
  if (!update) {
    step(2, 'YouTube の情報を入力');
    console.log('YouTube Data API v3 のAPIキー（Google Cloud Console →「APIとサービス」→「認証情報」で作成）');
    apiKey = await ask(state.deployed ? 'APIキー（変えない場合はEnter）' : 'APIキー');
    if (!apiKey && !state.deployed) throw new Error('APIキーが必要です');
    channel = await ask('あなたのチャンネル（@ハンドル / チャンネルURL / UC…のID）', channel);
    if (!channel) throw new Error('チャンネルが必要です');
  }

  step(3, 'データベースを準備');
  if (!state.databaseId) {
    await wrangler(['d1', 'create', 'stream-trophies'], { capture: true }).catch(e => { if (!/already exists/i.test(e.out || '')) throw e; });
    const list = JSON.parse((await wrangler(['d1', 'list', '--json'], { capture: true })).replace(/^[^\[]*/s, ''));
    state.databaseId = list.find(d => d.name === 'stream-trophies')?.uuid;
    if (!state.databaseId) throw new Error('データベースIDを取得できませんでした');
    saveState(state);
  }
  writeConfig(state.databaseId, state.vars);
  await wrangler(['d1', 'migrations', 'apply', 'DB', '--remote'], { input: 'ignore' });

  step(4, 'Cloudflare に公開');

  console.log('（初めての場合「workers.dev のサブドメインを登録しますか」と聞かれたら、好きな英数字の名前を入力してください）');
  const deployOutput = await wrangler(['deploy'], { capture: true });
  const detected = deployOutput.match(/https:\/\/stream-trophies\.[a-z0-9-]+\.workers\.dev\b/);
  let url = detected ? detected[0] : await ask('公開URL（上に表示された https://stream-trophies.…workers.dev）');
  url = deploymentOrigin(url);
  state.url = url; state.deployed = true; saveState(state);

  step(5, '秘密情報を登録');
  state.adminKey ||= key(); state.overlayKey ||= key(); saveState(state);
  const secrets = { ADMIN_KEY: state.adminKey, OVERLAY_KEY: state.overlayKey, ...(apiKey ? { YOUTUBE_API_KEY: apiKey } : {}) };
  const secretFile = path.join(os.tmpdir(), `trophy-secrets-${crypto.randomBytes(6).toString('hex')}.json`);
  fs.writeFileSync(secretFile, JSON.stringify(secrets), { mode: 0o600 });
  try { await wrangler(['secret', 'bulk', secretFile], { input: 'ignore' }); } finally { fs.rmSync(secretFile, { force: true }); }

  if (!update) {
    step(6, 'チャンネルを登録');
    let ok = false;
    for (let i = 0; i < 8 && !ok; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const r = await fetch(url + '/api/admin/config', { redirect: 'error', signal: AbortSignal.timeout(12000), method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + state.adminKey }, body: JSON.stringify({ channel_id: channel, video_id: '', poll_seconds: 20 }) });
        const d = await r.json();
        if (r.ok) { ok = true; state.channel = channel; saveState(state); console.log('チャンネルID:', d.channel_id); }
        else if (r.status !== 401) throw new Error(d.error);
      } catch (e) { if (i === 7) throw e; }
    }
    if (!ok) console.log('※ チャンネル登録を確認できませんでした。管理画面の「YouTube接続」から登録してください。');
  }

  const admin = `${state.url}/#admin=${state.adminKey}`, overlay = `${state.url}/overlay?key=${state.overlayKey}`;
  const line = `配信トロフィー: ${state.url}`;
  fs.writeFileSync(path.join(ROOT, '管理画面URL.txt'),
`配信トロフィー（このファイルは他の人に見せないでください）

■ 管理画面（ブックマーク推奨）
${admin}

■ OBS ブラウザソース（幅1920 × 高さ1080）
${overlay}

■ 配信の概要欄に書く1行（これは公開してOKです）
${line}

視聴者は共通の拡張「配信トロフィー」を入れるだけで、この1行から自動であなたの配信を見つけます。
拡張の配布ページ: ${EXTENSION_PAGE}
YouTube Studio の「アップロード動画のデフォルト設定」の説明に入れておくと、毎回書かずに済みます。
`, 'utf8');
  console.log(`\n━━ 配信の概要欄に、次の1行を書いてください（公開してOKです）\n\n    ${line}\n`);
  console.log(`\n✅ 完了しました。\n管理画面とOBS用URLは「管理画面URL.txt」に保存しました。`);
  await openUrl(admin);
} catch (e) {
  console.error('\n❌ ' + e.message + '\n解決しない場合は、この画面の内容をそのまま相談してください。');
  process.exitCode = 1;
} finally { rl.close(); }
