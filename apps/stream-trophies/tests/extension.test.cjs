const {test}=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const {watched,playable,endpoint,findServers}=require('../extension/core.js');

// ---------- core ----------
const base={video:'abcdefghijk',target:'abcdefghijk',live:true,ad:false,paused:false,ended:false,seeking:false,ready:4,rate:1,position:10,at:1000};
test('通常再生は経過秒を加算',()=>assert.equal(watched(base,{...base,position:15,at:6000}),5));
test('2倍速でも実時間以上は加算しない',()=>assert.equal(watched({...base,rate:2},{...base,rate:2,position:20,at:6000}),5));
for(const [k,v]of Object.entries({ad:true,paused:true,ended:true,seeking:true,ready:2,live:false,target:'other-video'}))test('除外: '+k,()=>{assert.equal(playable({...base,[k]:v}),false);assert.equal(watched(base,{...base,at:6000,position:15,[k]:v}),0);});
test('シーク・長い空白は加算しない',()=>{assert.equal(watched(base,{...base,at:6000,position:900}),0);assert.equal(watched(base,{...base,at:31000,position:40}),0);});
test('接続先はHTTPSのみ',()=>{assert.equal(endpoint('https://x.workers.dev'),'https://x.workers.dev');for(const bad of ['http://example.com','https://x.com/path','javascript:alert(1)'])assert.throws(()=>endpoint(bad));});
test('概要欄から接続先を見つける',()=>{
  assert.deepEqual(findServers('今日もよろしく！\n配信トロフィー: https://a.workers.dev\nX: https://x.com/me'),['https://a.workers.dev']);
  assert.deepEqual(findServers('配信トロフィー：https://b.example.com/ です'),['https://b.example.com']);
  assert.deepEqual(findServers('Stream Trophy https://c.workers.dev\nstream-trophy: https://c.workers.dev'),['https://c.workers.dev']);
  assert.deepEqual(findServers('https://a.workers.dev だけ'),[],'目印がないURLは使わない');
  assert.deepEqual(findServers('配信トロフィー: http://evil.example'),[],'HTTPは使わない');
  assert.deepEqual(findServers('配信トロフィー: https://a.workers.dev/path'),[],'パス付きは使わない');
  assert.equal(findServers(['1','2','3','4'].map(n=>`配信トロフィー: https://s${n}.workers.dev`).join('\n')).length,3);
});

// ---------- background ----------
const ID='a'.repeat(32);
const A='https://alice.workers.dev',B='https://bob.workers.dev',EVIL='https://evil.workers.dev';
function worker(initial={},servers={}){
  let listener,installed;const data=JSON.parse(JSON.stringify(initial));const requests=[];const opened=[];const badges={};
  const chrome={runtime:{getURL:p=>`chrome-extension://${ID}/`+p,onMessage:{addListener:fn=>listener=fn},onInstalled:{addListener:fn=>installed=fn}},
    storage:{local:{get:async keys=>Object.fromEntries([].concat(keys).filter(k=>k in data).map(k=>[k,JSON.parse(JSON.stringify(data[k]))])),set:async p=>Object.assign(data,JSON.parse(JSON.stringify(p)))}},
    action:{setBadgeText:({tabId,text})=>badges[tabId]=text,setBadgeBackgroundColor:()=>{}},
    tabs:{onRemoved:{addListener:()=>{}},create:async o=>opened.push(o.url)}};
  const ctx=vm.createContext({chrome,URL,URLSearchParams,AbortSignal,Date,Error,JSON,Map,Set,Object,Array,Number,String,Math,Promise,
    fetch:async(url,options)=>{const u=new URL(url);requests.push({origin:u.origin,path:u.pathname,options});const h=(servers[u.origin]||{})[u.pathname];
      if(!h)throw new TypeError('Failed to fetch');const out=[].concat(h(options));const s=typeof out[0]==='number'?out[0]:200;const b=typeof out[0]==='number'?out[1]:out[0];return {ok:s<400,status:s,json:async()=>b};}});
  ctx.self=ctx;ctx.importScripts=(...files)=>{for(const f of files)vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension',f),'utf8'),ctx);};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/background.js'),'utf8'),ctx);
  const send=(m,sender)=>new Promise(r=>listener(m,sender,r));
  const yt=(video='abcdefghijk',tab=1)=>({tab:{id:tab,url:'https://www.youtube.com/watch?v='+video},frameId:0,url:'https://www.youtube.com/watch?v='+video});
  return {send,data,requests,opened,badges,installed,ui:{url:`chrome-extension://${ID}/popup.html`},yt};
}
const live=(video,title)=>()=>({app:'stream-trophies',channel:{id:'UC'+'x'.repeat(22),title},video:video?{id:video,is_live:true}:null});
const linking=state=>({'/api/link/start':()=>({code:'123456',claim:'secret-claim',expires:Date.now()/1000+900}),'/api/link/claim':()=>state.linked?{token:'tok-'+state.name,name:state.name}:{pending:true}});
const V='abcdefghijk';

test('インストール直後に案内ページを開く',async()=>{const w=worker();w.installed({reason:'install'});assert.match(w.opened[0],/popup\.html\?welcome=1/);});
test('概要欄の接続先が「この配信をライブ中」と答えたら、連携を提案する',async()=>{
  const w=worker({},{[A]:{'/api/public':live(V,'ありすch')}});
  const r=await w.send({type:'page',video:V,candidates:[A]},w.yt());
  assert.equal(r.ok,true);assert.equal(r.data.server,A);assert.equal(r.data.linked,false);assert.equal(r.data.offer.title,'ありすch');assert.equal(w.badges[1],'!');
});
test('別の配信をライブ中と答えるサーバーは採用しない（なりすまし防止）',async()=>{
  const w=worker({},{[EVIL]:{'/api/public':live('zzzzzzzzzzz','偽物')}});
  const r=await w.send({type:'page',video:V,candidates:[EVIL]},w.yt());
  assert.equal(r.data.server,null);
});
test('概要欄にない未連携のサーバーには問い合わせない',async()=>{
  const w=worker({servers:{[B]:{token:'',title:'ぼぶ'}}},{[B]:{'/api/public':live(V,'ぼぶ')}});
  const r=await w.send({type:'page',video:V,candidates:[]},w.yt());
  assert.equal(r.data.server,null);assert.equal(w.requests.length,0);
});
test('合言葉の発行から連携、視聴時間の送信まで（サーバーごと）',async()=>{
  const st={linked:false,name:'視聴者A'};let beats=[];
  const w=worker({},{[A]:{'/api/public':live(V,'ありすch'),...linking(st),'/api/heartbeat':o=>{beats.push(o);return {credited:5,reason:'計測中'};}}});
  await w.send({type:'page',video:V,candidates:[A]},w.yt());
  const c=await w.send({type:'link',server:A},w.ui);assert.equal(c.data.code,'123456');assert.equal(JSON.stringify(c).includes('secret-claim'),false);
  assert.equal((await w.send({type:'check',server:A},w.ui)).data.pending,true);
  st.linked=true;const r=await w.send({type:'check',server:A},w.ui);assert.equal(r.data.linked,true);
  assert.equal(w.data.servers[A].token,'tok-視聴者A');assert.equal(w.data.servers[A].pending,null);
  const p=await w.send({type:'page',video:V,candidates:[A]},w.yt());assert.equal(p.data.linked,true);assert.equal(p.data.offer,undefined);
  const s=await w.send({type:'sample',server:A,video:V,seconds:5,device:'d'.repeat(36),sequence:1},w.yt());
  assert.equal(s.ok,true);assert.equal(beats.length,1);assert.equal(beats[0].headers.Authorization,'Bearer tok-視聴者A');
});
test('ほかのサーバーへのサンプル送信は拒否する',async()=>{
  const w=worker({servers:{[A]:{token:'t',enabled:true}}},{[A]:{'/api/public':live(V,'a')}});
  await w.send({type:'page',video:V,candidates:[A]},w.yt());
  const s=await w.send({type:'sample',server:B,video:V,seconds:5,device:'d'.repeat(36),sequence:1},w.yt());
  assert.equal(s.ok,false);
});
test('連携済みのサーバーは、概要欄に書いていない配信でも見つける',async()=>{
  const w=worker({servers:{[A]:{token:'ta',enabled:true,title:'a'},[B]:{token:'tb',enabled:true,title:'b'}}},{[A]:{'/api/public':live('other123456','a')},[B]:{'/api/public':live(V,'b')}});
  const r=await w.send({type:'page',video:V,candidates:[]},w.yt());
  assert.equal(r.data.server,B);assert.equal(r.data.linked,true);
});
test('「今はしない」を押したサーバーは、もう提案しない',async()=>{
  const w=worker({},{[A]:{'/api/public':live(V,'a')}});
  await w.send({type:'page',video:V,candidates:[A]},w.yt());
  await w.send({type:'dismiss',server:A},w.yt());
  const r=await w.send({type:'page',video:V,candidates:[A]},w.yt());assert.equal(r.data.server,A);assert.equal(r.data.offer,null);
});
test('連携画面は、そのタブで見つけたサーバーだけ開ける',async()=>{
  const w=worker({},{[A]:{'/api/public':live(V,'a')}});
  assert.equal((await w.send({type:'open-link',server:A},w.yt())).ok,false);
  await w.send({type:'page',video:V,candidates:[A]},w.yt());
  assert.equal((await w.send({type:'open-link',server:A},w.yt())).ok,true);assert.match(w.opened[0],/server=https%3A%2F%2Falice/);
});
test('401が返ったら、そのサーバーの連携だけを外す',async()=>{
  const w=worker({servers:{[A]:{token:'ta'},[B]:{token:'tb'}}},{[A]:{'/api/me':()=>[401,{error:'連携が切れました'}]}});
  const r=await w.send({type:'me',server:A},w.ui);assert.equal(r.ok,false);assert.equal(w.data.servers[A].token,'');assert.equal(w.data.servers[B].token,'tb');
});
test('連携解除で一覧から消える。HTTPの接続先は追加できない',async()=>{
  const w=worker({servers:{[A]:{token:'ta'}}},{[A]:{'/api/logout':()=>({ok:true})}});
  await w.send({type:'disconnect',server:A},w.ui);assert.equal(A in w.data.servers,false);
  assert.equal((await w.send({type:'add',server:'http://alice.example'},w.ui)).ok,false);
});
test('YouTube以外のページからの操作は拒否',async()=>{
  const w=worker();const r=await w.send({type:'page',video:V,candidates:[A]},{tab:{id:1,url:'https://evil.example/'},frameId:0,url:'https://evil.example/'});assert.equal(r.ok,false);
  const u=await w.send({type:'delete',server:A},{tab:{id:1,url:'https://www.youtube.com/'},frameId:0,url:'https://www.youtube.com/'});assert.equal(u.ok,false);
});
test('状態にトークンや合言葉の秘密は含めない',async()=>{
  const w=worker({servers:{[A]:{token:'secret-token',pending:{code:'111111',claim:'secret-claim',expires:Date.now()+1e6}}}});
  const r=await w.send({type:'status'},w.ui);const text=JSON.stringify(r);
  assert.equal(text.includes('secret-token'),false);assert.equal(text.includes('secret-claim'),false);assert.equal(r.data.servers[0].linked,true);
});
