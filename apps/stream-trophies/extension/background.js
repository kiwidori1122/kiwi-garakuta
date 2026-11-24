'use strict';
// 配信トロフィー 共通拡張
// 1つの拡張で、複数の配信者のサーバー（Cloudflare Workers）に接続する。
// 接続先は「配信の概要欄に書かれたURL」かつ「そのサーバーが、いま見ている配信をライブ中と答えた」場合だけ採用する。
function createBackground(chrome, fetch, TrophyCore, ALLOW_LOCAL = false) { // テスト用（http://127.0.0.1 を許可）
const blank={token:'',name:'',pending:null,enabled:true,title:'',channel:'',lastStatus:'',added:0};
const publicCache=new Map(); // origin -> {at,data,error}
const tabs=new Map();        // tabId -> {server,video}
const meters=new Map();      // tabId -> 視聴時間の送信待ち
let lastClaim=0;

function origin(value){const o=TrophyCore.endpoint(value);if(o.startsWith('http:')&&!ALLOW_LOCAL)throw new Error('接続先はHTTPSが必要です');return o;}
async function all(){const r=await chrome.storage.local.get(['servers','dismissed']);return {servers:r.servers||{},dismissed:r.dismissed||[]};}
async function getServer(o){const {servers}=await all();return servers[o]?{...blank,...servers[o]}:null;}
async function putServer(o,patch){const {servers}=await all();servers[o]={...blank,...servers[o],...patch};await chrome.storage.local.set({servers});return servers[o];}
async function dropServer(o){const {servers}=await all();delete servers[o];await chrome.storage.local.set({servers});}

async function call(o,path,body,token){
  const response=await fetch(o+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},
    body:body?JSON.stringify(body):undefined,redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    if(response.status===401&&token)await putServer(o,{token:'',name:'',lastStatus:'連携が切れました。もう一度連携してください'});
    const error=new Error(data.error||'サーバーに接続できません');error.status=response.status;throw error;
  }
  return data;
}
async function authed(o,path,body){const s=await getServer(o);if(!s?.token)throw Object.assign(new Error('連携が必要です'),{status:401});return call(o,path,body,s.token);}
// サーバーの公開情報（いまのライブ配信とチャンネル名）。15秒キャッシュ
async function publicConfig(o){
  const hit=publicCache.get(o);if(hit&&Date.now()-hit.at<15000){if(hit.error)throw hit.error;return hit.data;}
  try{const data=await call(o,'/api/public');publicCache.set(o,{at:Date.now(),data});
    const s=await getServer(o);const title=String(data.channel?.title||'').slice(0,100),channel=String(data.channel?.id||'');
    if(s&&(title&&s.title!==title||channel&&s.channel!==channel))await putServer(o,{...(title?{title}:{}),...(channel?{channel}:{})});
    return data;}
  catch(e){publicCache.set(o,{at:Date.now(),error:e});throw e;}
}
const liveOf=(data,video)=>!!(data?.video?.is_live&&data.video.id===video);

async function startLink(o){
  let s=await getServer(o);
  if(!s){const data=await publicConfig(o);if(!data||typeof data!=='object'||!('video' in data))throw new Error('配信トロフィーのサーバーではないようです');
    s=await putServer(o,{added:Date.now(),title:String(data.channel?.title||'').slice(0,100),channel:String(data.channel?.id||'')});}
  if(s.pending&&Date.now()<s.pending.expires-60000)return {...s.pending,title:s.title};
  const r=await call(o,'/api/link/start',{});
  const pending={code:r.code,claim:r.claim,expires:r.expires*1000};
  await putServer(o,{pending,lastStatus:''});return {...pending,title:s.title};
}
async function checkLink(o,force){
  const s=await getServer(o);
  if(!s)return {pending:false};
  if(s.token)return {linked:true,name:s.name};
  if(!s.pending)return {pending:false};
  if(Date.now()>s.pending.expires){await putServer(o,{pending:null});return {expired:true};}
  if(!force&&Date.now()-lastClaim<5000)return {pending:true};
  lastClaim=Date.now();
  try{
    const r=await call(o,'/api/link/claim',{claim:s.pending.claim});
    if(r.pending)return {pending:true};
    await putServer(o,{token:r.token,name:String(r.name||'').slice(0,100),pending:null,enabled:true,lastStatus:''});publicCache.delete(o);
    return {linked:true,name:r.name};
  }catch(e){if(e.status===410){await putServer(o,{pending:null});return {expired:true};}throw e;}
}

// YouTubeのページから：いま見ている配信に対応するサーバーを探す
async function page(message,sender){
  const video=String(message.video||'');
  if(!/^[A-Za-z0-9_-]{11}$/.test(video))throw new Error('動画IDが不正です');
  const {servers,dismissed}=await all();
  // 連携待ちの合言葉があれば、チャットに書いた直後に自動で連携完了させる
  for(const [o,s] of Object.entries(servers))if(!s.token&&s.pending)checkLink(o,false).catch(()=>{});
  const known=Object.keys(servers);
  const candidates=(Array.isArray(message.candidates)?message.candidates:[]).slice(0,3).map(c=>{try{return origin(c);}catch{return null;}}).filter(Boolean);
  // 1) 登録済みのサーバーでライブ中のもの 2) 概要欄に書かれたサーバー の順で確認
  let found=null;
  for(const o of [...known.filter(o=>candidates.includes(o)),...known.filter(o=>!candidates.includes(o)),...candidates.filter(o=>!known.includes(o))]){
    const fromDescription=candidates.includes(o);
    if(!fromDescription&&!servers[o]?.token)continue; // 未連携のサーバーは概要欄にあるときだけ
    try{const data=await publicConfig(o);if(liveOf(data,video)){found={o,data};break;}}catch{}
  }
  if(!found){tabs.delete(sender.tab.id);setBadge(sender.tab.id,'');return {server:null};}
  const s=await getServer(found.o);
  tabs.set(sender.tab.id,{server:found.o,video});
  const title=String(found.data.channel?.title||s?.title||'');
  if(s?.token){setBadge(sender.tab.id,s.enabled?'':'off');return {server:found.o,title,linked:true,enabled:s.enabled,live:true};}
  setBadge(sender.tab.id,'!');
  return {server:found.o,title,linked:false,live:true,offer:dismissed.includes(found.o)||s?.pending?null:{server:found.o,title}};
}
function setBadge(tabId,text){try{chrome.action.setBadgeText({tabId,text});if(text)chrome.action.setBadgeBackgroundColor({tabId,color:text==='!'?'#d5fa66':'#5b6b80'});}catch{}}

async function sample(message,sender){
  const u=new URL(sender.tab.url||'about:blank');
  const bound=tabs.get(sender.tab.id);
  if(u.pathname!=='/watch'||u.searchParams.get('v')!==message.video||!bound||bound.video!==message.video||bound.server!==message.server)throw new Error('動画が一致しません');
  const o=bound.server;const s=await getServer(o);
  if(!s?.token||!s.enabled)return {ok:false};
  const cfg=await publicConfig(o);if(!liveOf(cfg,message.video))return {ok:false};
  if(!Number.isFinite(message.seconds)||message.seconds<0||message.seconds>8||typeof message.device!=='string'||message.device.length>128)throw new Error('計測値が不正です');
  const old=meters.get(sender.tab.id);const now=Date.now();const same=old&&old.device===message.device&&old.video===message.video&&old.server===o;
  const entry=same?old:{server:o,device:message.device,video:message.video,seconds:0,sent:0,seen:now};
  if(now-entry.seen>22000)entry.seconds=0;
  entry.seen=now;entry.seconds+=message.seconds;meters.set(sender.tab.id,entry);
  if(now-entry.sent<10000)return {ok:true};
  const seconds=Math.min(20,entry.seconds);entry.seconds=0;entry.sent=now;
  try{const r=await call(o,'/api/heartbeat',{video:message.video,device:entry.device,sequence:message.sequence,seconds},s.token);await putServer(o,{lastStatus:r.reason,lastSent:now});return r;}
  catch(e){await putServer(o,{lastStatus:e.message}).catch(()=>{});if(e.status===409)publicCache.delete(o);throw e;}
}

async function fromYouTube(message,sender){
  const u=new URL(sender.tab.url||'about:blank');
  if(u.origin!=='https://www.youtube.com'||sender.frameId!==0)throw new Error('送信元が不正です');
  switch(message.type){
    case 'page':return page(message,sender);
    case 'sample':return sample(message,sender);
    case 'open-link':{const o=origin(message.server);const bound=tabs.get(sender.tab.id);if(bound?.server!==o)throw new Error('接続先が一致しません');
      await chrome.tabs.create({url:chrome.runtime.getURL('popup.html?page=1&server='+encodeURIComponent(o))});return {ok:true};}
    case 'dismiss':{const o=origin(message.server);const {dismissed}=await all();if(!dismissed.includes(o))await chrome.storage.local.set({dismissed:[...dismissed,o].slice(-200)});return {ok:true};}
  }
  throw new Error('不明な操作です');
}

async function fromUI(message){
  if(message.type==='status'){
    const {servers}=await all();
    const current=Number.isInteger(message.tab)?tabs.get(message.tab)||null:null;
    return {servers:Object.entries(servers).map(([o,s])=>({server:o,title:s.title,linked:!!s.token,name:s.name,enabled:s.enabled!==false,
      pending:s.pending?{code:s.pending.code,expires:s.pending.expires}:null,lastStatus:s.lastStatus||''})),current:current?.server||null};
  }
  const o=origin(message.server);
  switch(message.type){
    case 'add':{const data=await publicConfig(o);if(!data||typeof data!=='object'||!('video' in data))throw new Error('配信トロフィーのサーバーではないようです');
      await putServer(o,{added:Date.now(),title:String(data.channel?.title||'').slice(0,100)});return {ok:true};}
    case 'link':{const p=await startLink(o);return {code:p.code,expires:p.expires,title:p.title||''};}
    case 'new-code':{await putServer(o,{pending:null});const p=await startLink(o);return {code:p.code,expires:p.expires};}
    case 'check':return checkLink(o,true);
    case 'toggle':await putServer(o,{enabled:!!message.enabled,lastStatus:message.enabled?'視聴時間の記録を再開しました':'視聴時間の記録を止めました'});meters.clear();return {ok:true};
    case 'me':return authed(o,'/api/me');
    case 'delete':await authed(o,'/api/me/delete',{});await putServer(o,{token:'',name:'',pending:null,lastStatus:'記録を削除しました'});meters.clear();return {ok:true};
    case 'disconnect':{const s=await getServer(o);if(s?.token)await call(o,'/api/logout',{},s.token).catch(()=>{});await dropServer(o);meters.clear();return {ok:true};}
  }
  throw new Error('不明な操作です');
}
async function handle(message,sender){
  const own=sender.url?.startsWith(chrome.runtime.getURL(''));
  if(sender.tab&&!own)return fromYouTube(message,sender);
  if(!own)throw new Error('操作元が不正です');
  return fromUI(message);
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{handle(message||{},sender).then(data=>reply({ok:true,data}),e=>reply({ok:false,error:e.message||'接続できません'}));return true;});
chrome.tabs.onRemoved.addListener(id=>{tabs.delete(id);meters.delete(id);});
chrome.runtime.onInstalled.addListener(d=>{if(d.reason==='install')chrome.tabs.create({url:chrome.runtime.getURL('popup.html?welcome=1&page=1')});});

}
if (typeof module !== 'undefined' && module.exports) module.exports = { createBackground };
else { importScripts('core.js'); createBackground(chrome, fetch, TrophyCore, self.TROPHY_ALLOW_LOCAL === true); }
