// クラウド版の通し検証: wrangler dev + 偽YouTube API
const B = 'http://127.0.0.1:8787', Y = 'http://127.0.0.1:8899';
const A = { Authorization: 'Bearer admin-test-key-0123456789' };
const OK = 'overlay-test-key-0123456789';
let fails = 0;
const check = (label, cond, extra = '') => { console.log((cond ? '✅ ' : '❌ ') + label + (extra ? '  ' + extra : '')); if (!cond) fails++; };
async function call(path, body, headers = {}) {
  const r = await fetch(B + path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
}
const mock = body => fetch(Y, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const mockState = async () => (await fetch(Y + '/state')).json();
const admin = async () => (await call('/api/admin/state', null, A)).data;
const msg = (id, ch, name, text, extra = {}) => ({ id, snippet: { type: 'textMessageEvent', textMessageDetails: { messageText: text } }, authorDetails: { channelId: ch, displayName: name, ...extra } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const V1 = 'UC' + 'b'.repeat(22), V2 = 'UC' + 'c'.repeat(22), VID = 'abcdefghijk';
const resetLocks = () => call('/api/admin/refresh', {}, A);

// 1. 設定と自動検出
let r = await call('/api/admin/config', { channel_id: '@example', video_id: '', poll_seconds: 15 }, A);
check('@ハンドルからチャンネルIDを解決', r.data?.channel_id === 'UC' + 'a'.repeat(22), JSON.stringify(r.data));
let s = await admin();
check('配信前は待機状態', s.live.is_live === false && s.status.state === 'waiting', s.status.message);
check('配信前は拡張に計測対象を渡さない', (await call('/api/public')).data.video === null);
check('APIキー・管理キーは管理APIでも返さない', !JSON.stringify(s).includes('test-key') || JSON.stringify(s).includes('overlay-test-key'), '');
await mock({ live: true });
await resetLocks();
s = await admin();
check('ライブ開始を自動検出（URL貼り付け不要）', s.live.is_live && s.live.id === VID, s.status.message);
{ const pub = (await call('/api/public')).data;
  check('拡張には動画IDとチャンネル名だけを公開', JSON.stringify(Object.keys(pub).sort()) === JSON.stringify(['app', 'channel', 'version', 'video']) && JSON.stringify(pub.video) === JSON.stringify({ id: VID, is_live: true }) && /^UC/.test(pub.channel.id), JSON.stringify(pub)); }

// 2. 合言葉連携
r = await call('/api/link/start', {});
check('合言葉を発行', /^\d{6}$/.test(r.data.code), r.data.code);
const { code, claim } = r.data;
check('書き込み前は待機', (await call('/api/link/claim', { claim })).data.pending === true);
await mock({ chat: [msg('m1', V1, '視聴者B', 'こんにちは👋'), msg('m2', V1, '視聴者B', `！ＬＩＮＫ　${code.replace(/\d/g, d => String.fromCharCode(0xFF10 + +d))}`), msg('m1', V1, '視聴者B', '重複'),
  { id: 'm3', snippet: { type: 'superChatEvent', superChatDetails: { userComment: 'スパチャ' } }, authorDetails: { channelId: V1, displayName: '視聴者B', isChatSponsor: true } },
  { id: 'm4', snippet: { type: 'newSponsorEvent' }, authorDetails: { channelId: V2, displayName: 'C' } }] });
await resetLocks();
r = await call('/api/link/claim', { claim });
check('全角の合言葉でも連携完了', !!r.data.token && r.data.name === '視聴者B', JSON.stringify(r.data).slice(0, 80));
const tok = { Authorization: 'Bearer ' + r.data.token };
check('同じ合言葉は再利用できない', (await call('/api/link/claim', { claim })).status === 410);
let me = (await call('/api/me', null, tok)).data;
check('コメント集計（重複・通知・合言葉は除外）', me.viewer.comments === 2 && me.viewer.characters === 10, `comments=${me.viewer.comments} chars=${me.viewer.characters}`);
check('メンバーを検出・参加配信1回', me.viewer.member === 1 && me.viewer.streams === 1);
check('実績獲得（はじめの一言・メンバーの証）', me.viewer.awards.length === 2, me.viewer.awards.map(a => a.trophy).join(','));
check('他人の合言葉なしでは他人の記録は見られない', (await call('/api/me', null, { Authorization: 'Bearer xxx' })).status === 401);

// 3. OBS演出
let o = await call('/api/overlay?key=' + OK + '&after=0');
check('OBSに獲得演出', o.data.events.some(e => e.title === 'メンバーの証' && e.name === '視聴者B'));
check('OBSキー違いは拒否', (await call('/api/overlay?key=bad')).status === 401);
check('after=abc でも落ちない', (await call('/api/overlay?key=' + OK + '&after=abc')).status === 200);

// 4. 視聴時間
const dev = 'device-aaaaaaaaaaaa'; let seq = 1;
const hb = (seconds, d = dev, video = VID) => call('/api/heartbeat', { video, device: d, sequence: seq++, seconds }, tok);
r = await hb(10); check('最初の送信は0秒（基準点）', r.data.credited === 0, JSON.stringify(r.data));
await sleep(10500); r = await hb(10); check('10秒後に10秒加算', Math.abs(r.data.credited - 10) < 0.01, JSON.stringify(r.data));
r = await hb(10, 'device-bbbbbbbbbbbb'); check('別タブは二重加算しない', r.data.reason === '別のタブで計測中');
seq -= 3; r = await hb(10); check('古い送信の再送は無視', r.data.reason === '受信済み'); seq += 5;
r = await hb(10, dev, 'zzzzzzzzzzz'); check('別の動画は拒否', r.status === 409);
r = await hb(25); check('過大な秒数は拒否', r.status === 400);

// 5. 停止と削除
await mock({ chat: [msg('m5', V2, '視聴者C', 'はじめまして'), msg('m6', V2, '視聴者C', '!trophy off'), msg('m7', V2, '視聴者C', 'まだいるよ')] });
await resetLocks();
s = await admin();
check('!trophy off で記録削除・以後も記録しない', !s.viewers.some(v => v.id === V2));
await mock({ chat: [msg('m8', V2, '視聴者C', '!trophy on'), msg('m9', V2, '視聴者C', '戻りました')] });
await resetLocks();
s = await admin();
check('!trophy on で再開', s.viewers.find(v => v.id === V2)?.comments === 1);
r = await call('/api/me/delete', {}, tok);
check('拡張から自分の記録を削除', r.status === 200 && (await call('/api/me', null, tok)).status === 401);
await mock({ chat: [msg('m10', V1, '視聴者B', '削除後のコメント')] }); await resetLocks();
check('削除した人は以後のコメントも記録しない', !(await admin()).viewers.some(v => v.id === V1));

// 6. 配信終了と割当量
await mock({ ended: true, live: false }); await resetLocks(); await resetLocks();
s = await admin();
check('配信終了を検出して待機へ', !s.live.is_live, s.status.message);
check('終了後は計測対象を公開しない', (await call('/api/public')).data.video === null);
const before = (await mockState()).calls.length;
for (let i = 0; i < 5; i++) await call('/api/overlay?key=' + OK);
await sleep(1500);
const after = (await mockState()).calls.length;
check('OBSを連続で開いても待機中はYouTubeを叩かない', after - before === 0, `${after - before}回`);
await mock({ quota: true, live: true, ended: false }); await resetLocks();
s = await admin();
check('割当量超過は30分待機', s.status.state === 'error' && s.status.message.includes('30分'), s.status.message);
await mock({ quota: false });

// 7. 認証・入力
check('管理キーなしは拒否', (await call('/api/admin/state')).status === 401);
check('JSON以外のPOSTは拒否', (await fetch(B + '/api/link/start', { method: 'POST', body: 'x' })).status === 415);
check('不正な色は拒否', (await call('/api/admin/style', { accent: 'red' }, A)).status === 400);
check('実績を追加すると既存記録も判定', (await call('/api/admin/trophy', { name: 'テスト', metric: 'comments', threshold: 1, icon: '⭐' }, A)).status === 200);
for (const p of ['/', '/overlay', '/privacy']) check('画面 ' + p, (await fetch(B + p)).status === 200);
check('ソースや設定は配信しない', (await fetch(B + '/src/worker.js')).status === 404 && (await fetch(B + '/wrangler.jsonc')).status === 404);

// 8. OBS表示だけでコメント取得が回る（手動操作なし）・定期実行
await mock({ live: true, ended: false, chat: [] }); await resetLocks();
await mock({ chat: [msg('m20', V2, '視聴者C', 'OBS経由')] });
await sleep(15500);
await call('/api/overlay?key=' + OK); await sleep(2500);
check('OBS表示中は自動でコメント取り込み', (await admin()).viewers.find(v => v.id === V2)?.comments === 2);
await mock({ chat: [msg('m21', V2, '視聴者C', '定期実行')] });
await sleep(15500);
await fetch(B + '/__scheduled?cron=*+*+*+*+*'); await sleep(2500);
check('OBSを閉じていても定期実行で取り込み', (await admin()).viewers.find(v => v.id === V2)?.comments === 3);
console.log(fails ? `\n${fails}件失敗` : '\nすべて合格'); process.exit(fails ? 1 : 0);
