import * as oauth from 'oauth4webapi';
import {attachCelebrations} from './celebrations.js';

const GOOGLE = { issuer: 'https://accounts.google.com', authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth', token_endpoint: 'https://oauth2.googleapis.com/token' };
const SESSION_AGE = 30 * 86400;
const CHANNEL = /^UC[A-Za-z0-9_-]{22}$/;
const now = () => Date.now()/1000;

export function siteOrigin(env) {
  if (!env.SITE_ORIGIN) throw new Error('Web page is not configured');
  const url = new URL(env.SITE_ORIGIN);
  if (url.protocol !== 'https:' && !(env.DEMO === '1' && url.hostname === '127.0.0.1')) throw new Error('Invalid site origin');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid site origin');
  return url.origin;
}
function cookieName(env, type) { return (env.DEMO==='1'?'demo_':'__Host-')+'trophy_'+type; }
function readCookie(request, name) {
  const found=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
  return found?found.slice(name.length+1):'';
}
function setCookie(env, type, value, age) {
  return `${cookieName(env,type)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${siteOrigin(env).startsWith('https:')?'; Secure':''}`;
}
function redirect(env, error, cookies=[]) {
  const url=new URL(siteOrigin(env));
  url.hash='my';
  if(error)url.searchParams.set('auth_error',error);
  const headers=new Headers({Location:url.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  for(const cookie of cookies)headers.append('Set-Cookie',cookie);
  return new Response(null,{status:303,headers});
}
export function assertWebOrigin(request, env, UserError) {
  // An absent Origin is rejected for cookie-authenticated writes as well.
  if(request.method!=='GET'&&request.headers.get('Origin')!==siteOrigin(env))throw new UserError('この接続元からは操作できません',403);
}
function googleReady(env) { return !!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET); }

export async function handleWeb(request,env,ctx,url,h) {
  const {DB}=env;
  const {UserError,json,sha256,randomToken,getSetting,channelId,evaluate,deleteViewer,api}=h;
  assertWebOrigin(request,env,UserError);
  const path=url.pathname,method=request.method;
  async function session(required=true) {
    const token=readCookie(request,cookieName(env,'session'));
    if(!token){if(!required)return null;throw new UserError('自分の記録を見るにはログインしてください',401);}
    const row=await DB.prepare('SELECT viewer FROM web_sessions WHERE token=? AND expires>?').bind(await sha256(token),now()).first();
    if(!row&&required)throw new UserError('ログインの期限が切れました。もう一度ログインしてください',401);
    return row?.viewer||null;
  }
  async function browserSession(viewer) {
    const token=randomToken();
    await DB.prepare('INSERT INTO web_sessions(token,viewer,expires) VALUES(?,?,?)').bind(await sha256(token),viewer,now()+SESSION_AGE).run();
    return setCookie(env,'session',token,SESSION_AGE);
  }
  function googleFetch(input,options) {
    // Fake Google endpoints are usable only in the explicitly local test mode.
    if(env.DEMO==='1'&&env.GOOGLE_MOCK_BASE){const u=new URL(String(input));return fetch(env.GOOGLE_MOCK_BASE+(u.hostname==='oauth2.googleapis.com'?'/token':'/youtube'+u.pathname.replace('/youtube/v3',''))+u.search,options);}
    return fetch(input,options);
  }
  async function googleResource(resource,params,token) {
    const u=new URL('https://www.googleapis.com/youtube/v3/'+resource);for(const [k,v]of Object.entries(params))u.searchParams.set(k,v);
    const response=await googleFetch(u,{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
    if(!response.ok)throw new UserError('YouTubeのアカウント情報を確認できませんでした',502);
    return response.json();
  }
  if(method==='GET'&&path==='/api/web/catalog') {
    ctx.waitUntil(h.tick(env,'overlay'));
    const [{results},live,channel]=await Promise.all([DB.prepare('SELECT id,name,metric,threshold,icon,enabled FROM trophies WHERE enabled=1 ORDER BY sort,rowid').all(),getSetting(env,'live',{}),channelId(env)]);
    return json({trophies:await attachCelebrations(env,results),google_ready:googleReady(env),channel_id:channel,live:live.is_live?{id:live.id,title:live.title}:null});
  }
  if(method==='GET'&&path==='/api/web/me') {
    const viewer=await session();
    const [v,awards,trophies,optout]=await DB.batch([
      DB.prepare('SELECT id,name,comments,characters,watch_seconds,streams,member,subscribed,subscription_checked,created FROM viewers WHERE id=?').bind(viewer),
      DB.prepare('SELECT trophy,created FROM awards WHERE viewer=?').bind(viewer),
      DB.prepare('SELECT id,name,metric,threshold,icon,enabled FROM trophies ORDER BY sort,rowid'),
      DB.prepare('SELECT viewer FROM optout WHERE viewer=?').bind(viewer)]);
    if(!v.results[0])throw new UserError('記録が見つかりません。ログインをやり直してください',401);
    const mine=awards.results;
    return json({viewer:{...v.results[0],awards:mine,opted_out:!!optout.results.length},trophies:await attachCelebrations(env,trophies.results.filter(t=>t.enabled||mine.some(a=>a.trophy===t.id)))});
  }
  if(method==='GET'&&path==='/api/web/oauth/login') {
    if(!googleReady(env))return redirect(env,'not_configured');
    const refresh=url.searchParams.get('refresh')==='1';
    const pinned=refresh?await session():null;
    // Bound the number of unexpired authorization attempts.
    await DB.prepare('DELETE FROM web_oauth WHERE expires<?').bind(now()).run();
    if((await DB.prepare('SELECT COUNT(*) AS n FROM web_oauth').first()).n>=1000)throw new UserError('ログインが混み合っています。しばらくお待ちください',429);
    const state=oauth.generateRandomState(),verifier=oauth.generateRandomCodeVerifier();
    await DB.prepare('INSERT INTO web_oauth(state,verifier,viewer,expires) VALUES(?,?,?,?)').bind(await sha256(state),verifier,pinned,now()+600).run();
    const authURL=new URL(GOOGLE.authorization_endpoint);
    for(const [k,v]of Object.entries({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:siteOrigin(env)+'/api/web/oauth/callback',response_type:'code',scope:'https://www.googleapis.com/auth/youtube.readonly',state,code_challenge:await oauth.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256',access_type:'online',prompt:'select_account consent'}))authURL.searchParams.set(k,v);
    return new Response(null,{status:302,headers:{Location:authURL.href,'Set-Cookie':setCookie(env,'oauth',state,600),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
  if(method==='GET'&&path==='/api/web/oauth/callback') {
    const clear=setCookie(env,'oauth','',0),state=url.searchParams.get('state')||'';
    if(!state||state!==readCookie(request,cookieName(env,'oauth')))return redirect(env,'invalid_state',[clear]);
    const row=await DB.prepare('DELETE FROM web_oauth WHERE state=? AND expires>? RETURNING verifier,viewer').bind(await sha256(state),now()).first();
    if(!row)return redirect(env,'expired',[clear]);
    if(url.searchParams.has('error'))return redirect(env,'cancelled',[clear]);
    if(!googleReady(env))return redirect(env,'not_configured',[clear]);
    try {
      const client={client_id:env.GOOGLE_CLIENT_ID};
      const params=oauth.validateAuthResponse(GOOGLE,client,url,state);
      const response=await oauth.authorizationCodeGrantRequest(GOOGLE,client,oauth.ClientSecretPost(env.GOOGLE_CLIENT_SECRET),params,siteOrigin(env)+'/api/web/oauth/callback',row.verifier,{[oauth.customFetch]:googleFetch});
      const tokens=await oauth.processAuthorizationCodeResponse(GOOGLE,client,response);
      const channels=await googleResource('channels',{part:'id,snippet',mine:'true'},tokens.access_token);
      if(channels.items?.length!==1||!CHANNEL.test(channels.items[0].id))return redirect(env,'no_channel',[clear]);
      const account=channels.items[0];
      if(row.viewer&&row.viewer!==account.id)return redirect(env,'wrong_channel',[clear]);
      let subscribed=null,checked=null;
      try{const sub=await googleResource('subscriptions',{part:'id',mine:'true',forChannelId:await channelId(env),maxResults:'1'},tokens.access_token);subscribed=sub.items?.length?1:0;checked=now();}catch{/* Unknown must never be represented as unsubscribed. */}
      await DB.prepare('INSERT INTO viewers(id,name,created,subscribed,subscription_checked) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,subscribed=excluded.subscribed,subscription_checked=excluded.subscription_checked').bind(account.id,String(account.snippet?.title||'視聴者').slice(0,100),now(),subscribed,checked).run();
      await evaluate(env,[account.id]);
      // Google tokens are neither persisted nor returned to browser code.
      return redirect(env,null,[clear,await browserSession(account.id)]);
    } catch {return redirect(env,'google_failed',[clear]);}
  }
  if(method==='POST'&&path==='/api/web/link/start') {
    const body=await api(request,env,ctx,new URL('/api/link/start',url));
    return json(body);
  }
  if(method==='POST'&&path==='/api/web/link/claim') {
    ctx.waitUntil(h.tick(env,'overlay'));
    const result=await api(request,env,ctx,new URL('/api/link/claim',url));
    if(result.pending)return json(result);
    const hash=await sha256(result.token);
    const row=await DB.prepare('SELECT viewer FROM sessions WHERE token=?').bind(hash).first();
    if(!row)throw new UserError('連携できませんでした。やり直してください',401);
    const cookie=await browserSession(row.viewer);
    await DB.prepare('DELETE FROM sessions WHERE token=?').bind(hash).run();
    const response=json({ok:true,name:result.name});response.headers.append('Set-Cookie',cookie);return response;
  }
  if(method==='POST'&&path==='/api/web/logout') {
    const token=readCookie(request,cookieName(env,'session'));
    if(token)await DB.prepare('DELETE FROM web_sessions WHERE token=?').bind(await sha256(token)).run();
    const response=json({ok:true});response.headers.append('Set-Cookie',setCookie(env,'session','',0));return response;
  }
  if(method==='POST'&&path==='/api/web/me/delete') {
    await deleteViewer(env,await session(),true);
    const response=json({ok:true});response.headers.append('Set-Cookie',setCookie(env,'session','',0));return response;
  }
  throw new UserError('ページが見つかりません',404);
}
