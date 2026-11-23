import { handleWeb } from './web-accounts.js';
import { attachCelebrations, awardCelebrations, saveCelebration, bindEventLive } from './celebrations.js';
// 配信トロフィー クラウド版 (Cloudflare Workers + D1)
// 配信者のPCは何も公開しない。視聴者はGoogleログイン不要（チャットの合言葉で連携）。
const CHANNEL = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO = /^[A-Za-z0-9_-]{11}$/;
const METRICS = ['comments', 'characters', 'watch_seconds', 'streams', 'member', 'subscribed', 'event'];
const STYLE_DEFAULT = { x: 64, y: 810, width: 520, scale: 1, accent: '#d5fa66', background: '#161c25', text: '#ffffff', duration: 7, font_size: 24, radius: 24 };
const LINK_TTL = 15 * 60;
const SESSION_IDLE = 180 * 86400;
const now = () => Date.now() / 1000;

class UserError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

const SECURITY = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY, ...extra } });
// 共通拡張（chrome-extension://…）から呼ばれるAPI。Cookieは使わずBearerトークンだけなので、どこからでも呼べてよい
const EXTENSION_API = new Set(['/api/public', '/api/health', '/api/link/start', '/api/link/claim', '/api/heartbeat', '/api/me', '/api/me/delete', '/api/logout']);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Max-Age': '86400' };

async function sha256(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}
function num(value, low, high) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new UserError('数値を入力してください');
  if (value < low || value > high) throw new UserError(`数値は ${low}〜${high} の範囲で入力してください`);
  return value;
}

// ---------- settings ----------
async function getSetting(env, key, fallback = null) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();
  return row ? JSON.parse(row.value) : fallback;
}
const setStmt = (env, key, value) => env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, JSON.stringify(value));
const setSetting = (env, key, value) => setStmt(env, key, value).run();
// 同時に複数のリクエストが来ても、YouTubeへの問い合わせは1回だけにするためのロック
async function acquire(env, key, gap) {
  const t = now();
  const r = await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS REAL) <= ?3")
    .bind(key, JSON.stringify(t), t - gap).run();
  return r.meta.changes > 0;
}
async function setStatus(env, state, message) { await setSetting(env, 'status', { state, message, updated: now() }); }
async function channelId(env) { return (await getSetting(env, 'channel_id', '')) || env.CHANNEL_ID || ''; }

// ---------- YouTube ----------
async function yt(env, resource, params) {
  if (!env.YOUTUBE_API_KEY) throw new UserError('YouTube APIキーが未設定です。セットアップをやり直してください');
  const url = new URL((env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3') + '/' + resource);
  for (const [k, v] of Object.entries({ ...params, key: env.YOUTUBE_API_KEY })) url.searchParams.set(k, String(v));
  let r;
  try { r = await fetch(url, { headers: { Accept: 'application/json' } }); }
  catch { throw new UserError('YouTube API に接続できません', 502); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const reason = data?.error?.errors?.[0]?.reason || '';
    const e = new UserError(`YouTube API エラー (${r.status}) ${reason}`.trim(), 502); e.reason = reason; throw e;
  }
  return data;
}

async function resolveChannel(env, input) {
  let value = String(input || '').trim();
  if (!value) return '';
  try { const u = new URL(value); if (/(^|\.)youtube\.com$/.test(u.hostname)) value = decodeURIComponent(u.pathname.split('/').filter(Boolean).slice(0, 2).join('/')); } catch {}
  value = value.replace(/^channel\//, '').replace(/\/.*$/, '');
  if (CHANNEL.test(value)) return value;
  if (value === 'c' || value === 'user') throw new UserError('チャンネルID（UC…）か @ハンドル を入力してください');
  const handle = value.startsWith('@') ? value : '@' + value;
  const data = await yt(env, 'channels', { part: 'id', forHandle: handle });
  const id = data.items?.[0]?.id;
  if (!id) throw new UserError('チャンネルが見つかりません: ' + handle);
  return id;
}

function parseVideo(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  if (VIDEO.test(value)) return value;
  try {
    const u = new URL(value);
    if (u.hostname.endsWith('youtu.be')) { const v = u.pathname.slice(1, 12); if (VIDEO.test(v)) return v; }
    const v = u.searchParams.get('v') || (u.pathname.match(/^\/(live|shorts)\/([A-Za-z0-9_-]{11})/) || [])[2];
    if (v && VIDEO.test(v)) return v;
  } catch {}
  throw new UserError('配信URLの形式が不正です');
}

async function detectLive(env, channel) {
  const manual = await getSetting(env, 'video_id', '');
  let ids = [];
  if (manual) ids = [manual];
  else {
    const list = await yt(env, 'playlistItems', { part: 'contentDetails', playlistId: 'UU' + channel.slice(2), maxResults: 5 });
    ids = (list.items || []).map(i => i.contentDetails?.videoId).filter(Boolean);
  }
  let live = { is_live: false, checked: now() };
  if (ids.length) {
    const data = await yt(env, 'videos', { part: 'snippet,liveStreamingDetails', id: ids.join(',') });
    const item = (data.items || []).find(i => i.snippet?.channelId === channel && i.snippet?.liveBroadcastContent === 'live'
      && i.liveStreamingDetails?.actualStartTime && !i.liveStreamingDetails?.actualEndTime);
    if (item) {
      live = { is_live: true, id: item.id, title: item.snippet.title || '', chat_id: item.liveStreamingDetails.activeLiveChatId || '', checked: now() };
      if (item.snippet.channelTitle) await setSetting(env, 'channel_title', String(item.snippet.channelTitle).slice(0, 100));
      await bindEventLive(env, live, item.liveStreamingDetails.actualStartTime);
    }
  }
  await setSetting(env, 'live', live);
  if (live.is_live) await setStatus(env, live.chat_id ? 'live' : 'watch_only', live.chat_id ? '配信中：' + live.title : '配信中（チャットなし）：' + live.title);
  else await setStatus(env, 'waiting', manual ? '指定した配信のライブ開始を待っています' : '次のライブ配信を待っています（自動検出）');
  return live;
}

async function pollChat(env, live) {
  const key = 'cursor:' + live.chat_id;
  const cursor = await getSetting(env, key, null);
  let data;
  try {
    data = await yt(env, 'liveChat/messages', { liveChatId: live.chat_id, part: 'id,snippet,authorDetails', maxResults: 2000, ...(cursor ? { pageToken: cursor } : {}) });
  } catch (e) {
    if (['liveChatEnded', 'liveChatNotFound', 'liveChatDisabled'].includes(e.reason)) {
      await setSetting(env, 'live', { is_live: false, checked: now() });
      await setStatus(env, 'waiting', '配信が終了しました。次のライブ配信を待っています');
      return;
    }
    throw e;
  }
  await ingest(env, data.items || [], live.id);
  await env.DB.batch([setStmt(env, key, data.nextPageToken || null),
    setStmt(env, 'chat_wait', Math.max(5, (data.pollingIntervalMillis || 5000) / 1000)),
    setStmt(env, 'last_sync', now())]);
}

// source: 'overlay'（OBS表示中）なら配信検出を1分ごと、'cron' なら5分ごと
async function tick(env, source) {
  try {
    const channel = await channelId(env);
    if (!channel || !env.YOUTUBE_API_KEY) { await setStatus(env, 'idle', 'チャンネルとAPIキーを設定してください'); return; }
    if (now() < await getSetting(env, 'backoff_until', 0)) return;
    let live = await getSetting(env, 'live', { is_live: false, checked: 0 });
    const detectGap = live.is_live ? 300 : source === 'overlay' ? 60 : 290;
    if (now() - (live.checked || 0) >= detectGap && await acquire(env, 'lock:detect', detectGap - 5)) live = await detectLive(env, channel);
    if (live.is_live && live.chat_id) {
      const gap = Math.max(await getSetting(env, 'poll_seconds', 20), await getSetting(env, 'chat_wait', 5)) - 1;
      if (await acquire(env, 'lock:chat', gap)) await pollChat(env, live);
    }
  } catch (e) {
    const quota = ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'].includes(e.reason);
    await setSetting(env, 'backoff_until', now() + (quota ? 1800 : 60));
    await setStatus(env, 'error', (e instanceof UserError ? e.message : '同期処理でエラーが発生しました') + (quota ? '（30分後に再試行）' : '（1分後に再試行）'));
    if (!(e instanceof UserError)) console.error(e);
  }
}

// ---------- 集計 ----------
const metricSql = "CASE t.metric WHEN 'comments' THEN v.comments WHEN 'characters' THEN v.characters WHEN 'watch_seconds' THEN v.watch_seconds WHEN 'streams' THEN v.streams WHEN 'member' THEN v.member WHEN 'subscribed' THEN COALESCE(v.subscribed,0) END";
async function evaluate(env, ids) {
  const chunks = [];
  if (ids === null) chunks.push(null);
  else { const list = [...new Set(ids)]; for (let i = 0; i < list.length; i += 80) chunks.push(list.slice(i, i + 80)); }
  const t = now();
  for (const chunk of chunks) {
    const where = chunk ? `AND v.id IN (${chunk.map(() => '?').join(',')})` : '';
    const { results } = await env.DB.prepare(`INSERT OR IGNORE INTO awards(viewer,trophy,created) SELECT v.id,t.id,? FROM viewers v JOIN trophies t ON t.enabled=1 WHERE ${metricSql} >= t.threshold ${where} RETURNING viewer,trophy`)
      .bind(t, ...(chunk || [])).all();
    if (results.length) await env.DB.batch(results.map(r => env.DB.prepare(
      "INSERT INTO events(viewer,payload,created) SELECT v.id, json_object('name',v.name,'title',t.name,'icon',t.icon,'trophy',t.id), ? FROM viewers v, trophies t WHERE v.id=? AND t.id=?").bind(t, r.viewer, r.trophy)));
  }
}

const participate = (env, viewer, video) => [
  env.DB.prepare('INSERT OR IGNORE INTO participation VALUES(?,?)').bind(viewer, video),
  env.DB.prepare('UPDATE viewers SET streams=(SELECT COUNT(*) FROM participation WHERE viewer=?1) WHERE id=?1').bind(viewer)];

async function deleteViewer(env, viewer, optout) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM events WHERE viewer=?').bind(viewer),
    env.DB.prepare('DELETE FROM viewers WHERE id=?').bind(viewer),
    ...(optout ? [env.DB.prepare('INSERT OR REPLACE INTO optout VALUES(?,?)').bind(viewer, now())] : [])]);
}

// コメントを集計（本文は保存しない）。チャットコマンド:
//   !link 123456 … 拡張との連携    !trophy off / !trophy on … 記録の停止・再開
async function ingest(env, items, video) {
  const parsed = [];
  for (const item of items) {
    const s = item.snippet || {}, a = item.authorDetails || {};
    let text = null;
    if (s.type === 'textMessageEvent') text = s.textMessageDetails?.messageText ?? '';
    else if (s.type === 'superChatEvent') text = s.superChatDetails?.userComment ?? null;
    if (text === null || !item.id || !CHANNEL.test(a.channelId || '')) continue;
    const command = text.normalize('NFKC').trim().toLowerCase();
    parsed.push({ id: item.id, viewer: a.channelId, name: String(a.displayName || '視聴者').slice(0, 100), text, command, member: a.isChatSponsor ? 1 : 0,published:Date.parse(s.publishedAt)/1000 });
  }
  if (!parsed.length) return;
  const t = now();
  const fresh = await env.DB.batch(parsed.map(p => env.DB.prepare('INSERT OR IGNORE INTO messages VALUES(?,?) RETURNING id').bind(p.id, t)));
  const list = parsed.filter((p, i) => fresh[i].results.length);
  if (!list.length) return;
  const viewers = [...new Set(list.map(p => p.viewer))];
  const opted = new Set();
  for (let i = 0; i < viewers.length; i += 80) {
    const chunk = viewers.slice(i, i + 80);
    const { results } = await env.DB.prepare(`SELECT viewer FROM optout WHERE viewer IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all();
    results.forEach(r => opted.add(r.viewer));
  }
  const stmts = [], touched = [];
  const flush = async () => { while (stmts.length) await env.DB.batch(stmts.splice(0, 90)); };
  for (const p of list) {
    const link = p.command.match(/^!\s*link\s*(\d{6})$/);
    if (link) {
      opted.delete(p.viewer);
      stmts.push(env.DB.prepare('DELETE FROM optout WHERE viewer=?').bind(p.viewer),
        env.DB.prepare('INSERT INTO viewers(id,name,created) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').bind(p.viewer, p.name, t),
        env.DB.prepare('UPDATE links SET viewer=?, name=? WHERE code=? AND viewer IS NULL AND expires>?').bind(p.viewer, p.name, link[1], t));
      continue;
    }
    if (/^!\s*trophy\s*off$/.test(p.command)) { await flush(); await deleteViewer(env, p.viewer, true); opted.add(p.viewer); continue; }
    if (/^!\s*trophy\s*on$/.test(p.command)) { opted.delete(p.viewer); stmts.push(env.DB.prepare('DELETE FROM optout WHERE viewer=?').bind(p.viewer)); continue; }
    if (opted.has(p.viewer)) continue;
    stmts.push(env.DB.prepare('INSERT INTO viewers(id,name,created,comments,characters,member) VALUES(?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, comments=comments+1, characters=characters+excluded.characters, member=MAX(member,excluded.member)')
      .bind(p.viewer, p.name, t, [...p.text].length, p.member), ...participate(env, p.viewer, video));
    touched.push(p.viewer);
  }
  await flush();
  const alive = touched.filter(v => !opted.has(v));
  if (alive.length) await evaluate(env, alive);
  if(alive.length)await awardCelebrations(env,list.filter(p=>alive.includes(p.viewer)&&!p.command.startsWith('!')),video);
}

async function heartbeat(env, viewer, body) {
  const { video, device, sequence, seconds } = body;
  num(seconds, 0, 20); num(sequence, 0, Number.MAX_SAFE_INTEGER);
  if (!Number.isInteger(sequence) || typeof device !== 'string' || device.length < 16 || device.length > 128 || !VIDEO.test(String(video))) throw new UserError('視聴セッションが不正です');
  const live = await getSetting(env, 'live', {});
  if (!live.is_live || live.id !== video) throw new UserError('現在ライブ中の配信だけ計測できます', 409);
  const row = await env.DB.prepare('SELECT heartbeat,device,sequence FROM viewers WHERE id=?').bind(viewer).first();
  if (!row) throw new UserError('連携をやり直してください', 401);
  const t = now();
  // 1人1系統：別タブ・別端末は25秒間は上書きできない
  if (row.device && row.device !== device && row.heartbeat != null && t - row.heartbeat < 25) return { credited: 0, reason: '別のタブで計測中' };
  if (row.device === device && sequence <= row.sequence) return { credited: 0, reason: '受信済み' };
  const elapsed = row.heartbeat != null ? t - row.heartbeat : 0;
  const credited = row.device === device && elapsed > 0 && elapsed <= 22 ? Math.min(seconds, elapsed) : 0;
  const r = await env.DB.prepare('UPDATE viewers SET watch_seconds=watch_seconds+?, heartbeat=?, device=?, sequence=? WHERE id=? AND heartbeat IS ?')
    .bind(credited, t, device, sequence, viewer, row.heartbeat).run();
  if (!r.meta.changes) return { credited: 0, reason: '計測中' };
  if (credited > 0) { await env.DB.batch(participate(env, viewer, video)); await evaluate(env, [viewer]); }
  return { credited, reason: '計測中' };
}

// ---------- 認証 ----------
function bearer(request) { const h = request.headers.get('Authorization') || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; }
function requireAdmin(request, env) { if (!safeEqual(bearer(request), env.ADMIN_KEY)) throw new UserError('管理画面URL（管理画面URL.txt）から開き直してください', 401); }
async function identify(request, env) {
  const token = bearer(request);
  if (!token) throw new UserError('連携が必要です', 401);
  const hash = await sha256(token), t = now();
  const row = await env.DB.prepare('SELECT viewer,last_used FROM sessions WHERE token=? AND last_used>?').bind(hash, t - SESSION_IDLE).first();
  if (!row) throw new UserError('連携が切れました。もう一度連携してください', 401);
  if (t - row.last_used > 86400) await env.DB.prepare('UPDATE sessions SET last_used=? WHERE token=?').bind(t, hash).run();
  return row.viewer;
}

async function readJson(request) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new UserError('JSONで送信してください', 415);
  const text = await request.text();
  if (text.length > 65536) throw new UserError('データが大きすぎます', 413);
  let body; try { body = JSON.parse(text || '{}'); } catch { throw new UserError('JSONデータが不正です'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new UserError('JSONデータが不正です');
  return body;
}

// ---------- 管理 ----------
async function adminState(env, request) {
  const [trophies, viewers, awards] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM trophies ORDER BY sort, rowid'),
    env.DB.prepare('SELECT id,name,comments,characters,watch_seconds,streams,member,created FROM viewers ORDER BY comments DESC, watch_seconds DESC LIMIT 1000'),
    env.DB.prepare('SELECT viewer,trophy,created FROM awards')]);
  const byViewer = {};
  for (const a of awards.results) (byViewer[a.viewer] ||= []).push(a);
  const origin = new URL(request.url).origin;
  return {
    trophies: await attachCelebrations(env,trophies.results), viewers: viewers.results.map(v => ({ ...v, awards: byViewer[v.id] || [] })),
    celebration_rules:(await env.DB.prepare('SELECT * FROM celebration_rules').all()).results.map(r=>({...r,phrases:JSON.parse(r.phrases)})),
    style: await getSetting(env, 'style', STYLE_DEFAULT), status: await getSetting(env, 'status', { state: 'idle', message: '起動しました' }),
    live: await getSetting(env, 'live', { is_live: false }), last_sync: await getSetting(env, 'last_sync', null),
    config: { channel_id: await channelId(env), video_id: await getSetting(env, 'video_id', ''), poll_seconds: await getSetting(env, 'poll_seconds', 20), api_key_set: !!env.YOUTUBE_API_KEY },
    overlay_url: origin + '/overlay?key=' + encodeURIComponent(env.OVERLAY_KEY || ''), description_line: '配信トロフィー: ' + origin, demo: env.DEMO === '1',
  };
}

async function saveTrophy(env, data) {
  if (!METRICS.includes(data.metric)) throw new UserError('実績の項目が不正です');
  const name = String(data.name || '').trim();
  if (!name || name.length > 60) throw new UserError('実績名は1〜60文字にしてください');
  const threshold = num(data.threshold, 1, 1e9);
  if (['member','subscribed','event'].includes(data.metric) && threshold !== 1) throw new UserError('メンバー・登録・限定イベントの条件値は1です');
  const id = String(data.id || [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join(''));
  if (!/^[a-f0-9]{16}$/.test(id)) throw new UserError('実績IDが不正です');
  const old = data.id ? await env.DB.prepare('SELECT metric FROM trophies WHERE id=?').bind(id).first() : null;
  if (old && (old.metric === 'event') !== (data.metric === 'event')) throw new UserError('限定イベントと通常のトロフィーは切り替えられません。新しく作ってください');
  await env.DB.prepare('INSERT INTO trophies(id,name,metric,threshold,icon,enabled,sort) VALUES(?,?,?,?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM trophies)) ON CONFLICT(id) DO UPDATE SET name=excluded.name,metric=excluded.metric,threshold=excluded.threshold,icon=excluded.icon,enabled=excluded.enabled')
    .bind(id, name, data.metric, threshold, String(data.icon || '🏆').slice(0, 12), data.enabled === false ? 0 : 1).run();
  if (data.metric === 'event') return { id };
  await evaluate(env, null);
  return { id };
}

async function saveStyle(env, data) {
  const ranges = { x: [0, 3840], y: [0, 2160], width: [240, 1200], scale: [0.5, 2], duration: [2, 30], font_size: [14, 60], radius: [0, 60] };
  const style = {};
  for (const [k, [lo, hi]] of Object.entries(ranges)) style[k] = num(data[k] ?? STYLE_DEFAULT[k], lo, hi);
  for (const k of ['accent', 'background', 'text']) {
    const c = data[k] ?? STYLE_DEFAULT[k];
    if (typeof c !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(c)) throw new UserError('色は #RRGGBB で指定してください');
    style[k] = c;
  }
  await setSetting(env, 'style', style);
}

async function saveConfig(env, data) {
  const channel = await resolveChannel(env, data.channel_id);
  const video = parseVideo(data.video_id);
  const poll = num(data.poll_seconds ?? 20, 15, 300);
  const previous = await channelId(env);
  await env.DB.batch([setStmt(env, 'channel_id', channel), ...(previous !== channel ? [setStmt(env, 'channel_title', '')] : []), setStmt(env, 'video_id', video), setStmt(env, 'poll_seconds', poll),
    setStmt(env, 'live', { is_live: false, checked: 0 }), setStmt(env, 'backoff_until', 0), env.DB.prepare("DELETE FROM settings WHERE key='lock:detect'")]);
  await setStatus(env, 'idle', '設定を保存しました。配信を確認しています');
  return { channel_id: channel };
}

async function demoSeed(env) {
  const t = now(), people = [['こはく', 128, 12640, 42120, 12, 1], ['mugi', 63, 4120, 18120, 8, 0], ['よるのねこ', 17, 1650, 3660, 3, 0], ['初見さん', 1, 14, 300, 1, 0]];
  await env.DB.batch(people.map(([name, c, ch, w, s, m], i) => env.DB.prepare('INSERT OR REPLACE INTO viewers(id,name,created,comments,characters,watch_seconds,streams,member) VALUES(?,?,?,?,?,?,?,?)')
    .bind('UC' + String(i).repeat(22), name, t, c, ch, w, s, m)));
  await evaluate(env, null);
}

// ---------- ルーティング ----------
async function api(request, env, ctx, url) {
  const path = url.pathname, method = request.method;
  if (method === 'GET' && path === '/api/health') return { ok: true };
  if (method === 'GET' && path === '/api/public') {
    const live = await getSetting(env, 'live', {});
    return { app: 'stream-trophies', version: 2, channel: { id: await channelId(env), title: await getSetting(env, 'channel_title', '') },
      video: live.is_live ? { id: live.id, is_live: true } : null };
  }
  if (method === 'GET' && path === '/api/overlay') {
    if (!safeEqual(url.searchParams.get('key') || '', env.OVERLAY_KEY)) throw new UserError('配信用URLのキーが不正です', 401);
    ctx.waitUntil(tick(env, 'overlay'));
    const after = Math.max(0, parseInt(url.searchParams.get('after') || '0', 10) || 0);
    const [latest, events] = await env.DB.batch([env.DB.prepare('SELECT COALESCE(MAX(id),0) AS m FROM events'),
      env.DB.prepare('SELECT id,payload FROM events WHERE id>? AND created>? ORDER BY id LIMIT 50').bind(after, now() - 120)]);
    return { events: events.results.map(r => ({ ...JSON.parse(r.payload), id: r.id })), latest_event: latest.results[0].m, style: await getSetting(env, 'style', STYLE_DEFAULT) };
  }
  if (method === 'GET' && path === '/api/admin/state') { requireAdmin(request, env); return adminState(env, request); }
  if (method === 'GET' && path === '/api/me') {
    const viewer = await identify(request, env);
    const [v, awards, trophies] = await env.DB.batch([
      env.DB.prepare('SELECT id,name,comments,characters,watch_seconds,streams,member,created FROM viewers WHERE id=?').bind(viewer),
      env.DB.prepare('SELECT trophy,created FROM awards WHERE viewer=?').bind(viewer),
      env.DB.prepare('SELECT id,name,metric,threshold,icon,enabled FROM trophies ORDER BY sort,rowid')]);
    const mine = awards.results;
    return { viewer: { ...v.results[0], awards: mine }, trophies: trophies.results.filter(t => t.enabled || mine.some(a => a.trophy === t.id)) };
  }
  if (method !== 'POST') throw new UserError('ページが見つかりません', 404);
  const body = await readJson(request);
  if (path.startsWith('/api/admin/')) {
    requireAdmin(request, env);
    switch (path) {
      case '/api/admin/style': await saveStyle(env, body); return { ok: true };
      case '/api/admin/trophy': return { ok: true, ...(await saveTrophy(env, body)) };
      case '/api/admin/celebration': return saveCelebration(env,body,{UserError,parseVideo});
      case '/api/admin/config': { const r = await saveConfig(env, body); await tick(env, 'overlay'); return r; }
      case '/api/admin/refresh':
        await env.DB.batch([setStmt(env, 'backoff_until', 0), env.DB.prepare("DELETE FROM settings WHERE key IN ('lock:detect','lock:chat')"),
          setStmt(env, 'live', { ...(await getSetting(env, 'live', {})), checked: 0 })]);
        await tick(env, 'overlay'); return { ok: true };
      case '/api/admin/preview':
        await env.DB.prepare('INSERT INTO events(viewer,payload,created) VALUES(?,?,?)').bind('preview', JSON.stringify({ name: 'プレビュー', title: 'いっしょの1時間', icon: '🏆', preview: true }), now()).run();
        return { ok: true };
      case '/api/admin/delete-viewer':
        if (!CHANNEL.test(String(body.viewer))) throw new UserError('視聴者IDが不正です');
        await deleteViewer(env, body.viewer, false); return { ok: true };
      case '/api/admin/demo-seed': if (env.DEMO !== '1') break; await demoSeed(env); return { ok: true };
      case '/api/admin/demo-comment': if (env.DEMO !== '1') break;
        await ingest(env, [{ id: 'demo-' + randomToken(9), snippet: { type: 'textMessageEvent',publishedAt:body.published_at||new Date().toISOString(), textMessageDetails: { messageText: String(body.text || 'こんにちは！').slice(0, 1000) } },
          authorDetails: { channelId: CHANNEL.test(body.viewer || '') ? body.viewer : 'UC' + '3'.repeat(22), displayName: body.name || '初見さん', isChatSponsor: !!body.member } }], 'demovideo01');
        return { ok: true };
    }
    throw new UserError('操作が見つかりません', 404);
  }
  switch (path) {
    case '/api/link/start': {
      const t = now();
      await env.DB.prepare('DELETE FROM links WHERE expires<?').bind(t).run();
      const active = (await env.DB.prepare('SELECT COUNT(*) AS n FROM links').first()).n;
      if (active > 300) throw new UserError('連携の受付が混み合っています。少し待ってからやり直してください', 429);
      const claim = randomToken(), hash = await sha256(claim);
      for (let i = 0; i < 5; i++) {
        const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
        const r = await env.DB.prepare('INSERT OR IGNORE INTO links(code,claim,expires) VALUES(?,?,?)').bind(code, hash, t + LINK_TTL).run();
        if (r.meta.changes) return { code, claim, expires: t + LINK_TTL };
      }
      throw new UserError('もう一度お試しください', 503);
    }
    case '/api/link/claim': {
      if (typeof body.claim !== 'string' || body.claim.length > 100) throw new UserError('連携情報が不正です');
      const hash = await sha256(body.claim);
      const row = await env.DB.prepare('SELECT * FROM links WHERE claim=?').bind(hash).first();
      if (!row || row.expires < now()) throw new UserError('合言葉の有効期限が切れました。新しい合言葉で連携してください', 410);
      if (!row.viewer) return { pending: true };
      const token = randomToken(), t = now();
      await env.DB.batch([env.DB.prepare('DELETE FROM links WHERE claim=?').bind(hash),
        env.DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await sha256(token), row.viewer, t, t)]);
      return { token, name: row.name };
    }
    case '/api/heartbeat': return heartbeat(env, await identify(request, env), body);
    case '/api/me/delete': await deleteViewer(env, await identify(request, env), true); return { ok: true };
    case '/api/logout': { const token = bearer(request); if (token) await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(await sha256(token)).run(); return { ok: true }; }
  }
  throw new UserError('操作が見つかりません', 404);
}

async function cleanup(env) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM messages WHERE created<?').bind(t - 3 * 86400),
    env.DB.prepare('DELETE FROM events WHERE created<?').bind(t - 86400),
    env.DB.prepare('DELETE FROM links WHERE expires<?').bind(t),
    env.DB.prepare('DELETE FROM sessions WHERE last_used<?').bind(t - SESSION_IDLE),
    env.DB.prepare('DELETE FROM web_sessions WHERE expires<?').bind(t),
    env.DB.prepare('DELETE FROM web_oauth WHERE expires<?').bind(t),
    env.DB.prepare('UPDATE viewers SET subscribed=NULL, subscription_checked=NULL WHERE subscription_checked<?').bind(t-30*86400)]);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if(url.pathname.startsWith('/api/web/')) {
      if(!env.SITE_ORIGIN)return json({error:'公開Webページは設定されていません'},404);
      try{return await handleWeb(request,env,ctx,url,{UserError,json,sha256,randomToken,getSetting,channelId,evaluate,deleteViewer,api,tick});}
      catch(e){return json({error:e instanceof UserError?e.message:'処理中にエラーが発生しました'},e instanceof UserError?e.status:500);}
    }
    if (url.pathname.startsWith('/api/')) {
      const cors = EXTENSION_API.has(url.pathname) ? CORS : {};
      if (request.method === 'OPTIONS') return new Response(null, { status: cors === CORS ? 204 : 404, headers: cors });
      try { return json(await api(request, env, ctx, url), 200, cors); }
      catch (e) {
        if (e instanceof UserError) return json({ error: e.message }, e.status, cors);
        console.error(e); return json({ error: '処理中にエラーが発生しました' }, 500, cors);
      }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => { await tick(env, 'cron'); if (new Date(event.scheduledTime).getUTCMinutes() % 30 === 0) await cleanup(env); })());
  },
};
