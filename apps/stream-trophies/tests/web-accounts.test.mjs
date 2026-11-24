import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {bindEventLive} from '../src/celebrations.js';

const origin='http://127.0.0.1:8797',A='UC'+'a'.repeat(22),B='UC'+'b'.repeat(22);
let mf,db,mock,user=A,lastTokenBody='',tokenCount=0;
const hash=s=>createHash('sha256').update(s).digest('hex');
before(async()=>{
  mock=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;res.setHeader('Content-Type','application/json');
    if(req.url==='/token'){lastTokenBody=body;tokenCount++;res.end(JSON.stringify({access_token:'mock-google-private',token_type:'Bearer',expires_in:3600}));}
    else if(req.url.startsWith('/youtube/channels'))res.end(JSON.stringify({items:[{id:user,snippet:{title:user===A?'視聴者A':'視聴者B'}}]}));
    else if(req.url.startsWith('/youtube/subscriptions'))res.end(JSON.stringify({items:[{id:'registered'}]}));
    else{res.statusCode=404;res.end('{}');}});
  await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
  const bundle=await build({entryPoints:['src/worker.js'],bundle:true,write:false,format:'esm',target:'es2022',external:['node:crypto']});
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-06-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{DEMO:'1',SITE_ORIGIN:origin,GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret',GOOGLE_MOCK_BASE:'http://127.0.0.1:'+mock.address().port,ADMIN_KEY:'test-admin',OVERLAY_KEY:'test-overlay'}}));
  db=await mf.getD1Database('DB');
  for(const file of ['0001_init.sql','0002_web_accounts.sql','0003_celebrations.sql']){const sql=await readFile('migrations/'+file,'utf8');for(const statement of sql.split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();}
  await db.prepare('INSERT INTO viewers(id,name,created,comments,characters) VALUES(?,?,?,?,?)').bind(A,'元の表示名',1,125,10050).run();
  await db.prepare('INSERT INTO viewers(id,name,created,comments) VALUES(?,?,?,?)').bind(B,'他の視聴者',1,99).run();
});
after(async()=>{await mf?.dispose();await new Promise(resolve=>mock?.close(resolve));});
async function call(path,{body,cookie,site=origin}={}){return mf.dispatchFetch(origin+'/api/web/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:site}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual'});}
async function login(){const start=await call('oauth/login');assert.equal(start.status,302);const url=new URL(start.headers.get('Location'));const cookie=start.headers.get('Set-Cookie').split(';')[0];const response=await call('oauth/callback?'+new URLSearchParams({state:url.searchParams.get('state'),code:'valid-code'}),{cookie});assert.equal(response.status,303);const cookies=response.headers.getSetCookie();const session=cookies.find(c=>c.startsWith('demo_trophy_session='));assert.ok(session,'session cookie expected');return {cookie:session.split(';')[0],start,url,callback:response,oauthCookie:cookie};}
test('public catalog has rules but no private records or credentials',async()=>{const r=await call('catalog'),data=await r.json();assert.equal(r.status,200);assert.equal(data.google_ready,true);assert.equal(data.trophies.length,7);for(const hidden of ['viewers','sessions','GOOGLE_CLIENT_SECRET','ADMIN_KEY'])assert.equal(JSON.stringify(data).includes(hidden),false);});
test('anonymous cannot read records; foreign-origin writes rejected',async()=>{assert.equal((await call('me')).status,401);assert.equal((await call('logout',{body:{},site:'https://evil.example'})).status,403);assert.equal((await mf.dispatchFetch(origin+'/api/web/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);});
test('Google callback uses PKCE and preserves existing counts',async()=>{user=A;const result=await login();const u=result.url;assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.match(u.searchParams.get('scope'),/youtube.readonly/);const posted=new URLSearchParams(lastTokenBody);assert.equal(createHash('sha256').update(posted.get('code_verifier')).digest('base64url'),u.searchParams.get('code_challenge'));assert.equal(posted.get('redirect_uri'),origin+'/api/web/oauth/callback');const me=await(await call('me',{cookie:result.cookie})).json();assert.equal(me.viewer.id,A);assert.equal(me.viewer.comments,125);assert.equal(me.viewer.characters,10050);assert.equal(me.viewer.subscribed,1);assert.ok(me.viewer.awards.length>=2);assert.equal(me.viewers,undefined);assert.equal(JSON.stringify(me).includes(B),false);assert.equal(JSON.stringify(me).includes('mock-google-private'),false);assert.match(result.callback.headers.get('Set-Cookie'),/HttpOnly/);});
test('OAuth state is browser-bound and single-use',async()=>{const first=await call('oauth/login');const u=new URL(first.headers.get('Location'));let r=await call('oauth/callback?state='+u.searchParams.get('state')+'&code=x',{cookie:'demo_trophy_oauth=wrong'});assert.match(r.headers.get('Location'),/invalid_state/);const result=await login();const before=tokenCount;r=await call('oauth/callback?state='+result.url.searchParams.get('state')+'&code=x',{cookie:result.oauthCookie});assert.match(r.headers.get('Location'),/expired/);assert.equal(tokenCount,before);});
test('refresh prevents switching to another YouTube identity',async()=>{user=A;const a=await login();const start=await call('oauth/login?refresh=1',{cookie:a.cookie});const u=new URL(start.headers.get('Location'));user=B;const r=await call('oauth/callback?state='+u.searchParams.get('state')+'&code=x',{cookie:start.headers.get('Set-Cookie').split(';')[0]});assert.match(r.headers.get('Location'),/wrong_channel/);user=A;});
test('chat linking exchanges claim for HttpOnly session without browser bearer',async()=>{const r=await call('link/start',{body:{}}),pair=await r.json();assert.match(pair.code,/^\d{6}$/);assert.equal((await(await call('link/claim',{body:{claim:pair.claim}})).json()).pending,true);await db.prepare('UPDATE links SET viewer=?,name=? WHERE claim=?').bind(B,'視聴者B',hash(pair.claim)).run();const linked=await call('link/claim',{body:{claim:pair.claim}}),body=await linked.json();assert.equal(body.ok,true);assert.equal(body.token,undefined);const cookie=linked.headers.get('Set-Cookie').split(';')[0];assert.equal((await(await call('me',{cookie})).json()).viewer.id,B);assert.equal((await call('link/claim',{body:{claim:pair.claim}})).status,410);});
const admin=(path,body)=>mf.dispatchFetch(origin+'/api/admin/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-admin'},body:JSON.stringify(body)});
test('event trophy: created from admin, binds a live inside its window, awards matching comments once',async()=>{
  let r=await admin('trophy',{name:'誕生日の祝福',icon:'🎂',metric:'event',threshold:1,enabled:true});assert.equal(r.status,200);const {id}=await r.json();
  assert.equal((await admin('trophy',{id,name:'x',icon:'🎂',metric:'comments',threshold:1})).status,400);
  assert.equal((await admin('celebration',{id:'0000000000000001',starts:1,ends:2,phrases:['a']})).status,400);
  const starts=Date.parse('2026-11-22T00:00:00+09:00')/1000,ends=Date.parse('2026-11-23T12:00:00+09:00')/1000;
  r=await admin('celebration',{id,description:'誕生日配信でお祝い',video:'',starts,ends,phrases:['おめでとう','おめでと','おたおめ','hbd']});assert.equal(r.status,200);assert.equal((await r.json()).ready,false);
  await bindEventLive({DB:db},{is_live:true,id:'demovideo01'},'2026-11-21T20:00:00+09:00');
  assert.equal((await db.prepare('SELECT video FROM celebration_rules WHERE trophy=?').bind(id).first()).video,'');
  await bindEventLive({DB:db},{is_live:true,id:'demovideo01'},'2026-11-22T20:00:00+09:00');
  assert.equal((await db.prepare('SELECT video FROM celebration_rules WHERE trophy=?').bind(id).first()).video,'demovideo01');
  const send=(viewer,text,date)=>admin('demo-comment',{viewer,name:viewer===A?'視聴者A':'視聴者B',text,published_at:date});
  assert.equal((await send(A,'お誕生日おめでとう🎂','2026-11-22T20:01:00+09:00')).status,200);
  await send(A,'おたおめ！','2026-11-22T20:02:00+09:00');
  await send(B,'こんばんは','2026-11-22T20:01:00+09:00');
  await send(B,'おめでとう','2026-11-21T20:01:00+09:00');
  const {results}=await db.prepare('SELECT viewer FROM awards WHERE trophy=?').bind(id).all();
  assert.deepEqual(results.map(r=>r.viewer),[A]);
  const events=await db.prepare("SELECT COUNT(*) AS n FROM events WHERE json_extract(payload,'$.trophy')=?").bind(id).first();assert.equal(events.n,1);
});
test('extension API answers any origin (no cookies); admin API does not',async()=>{
  await db.prepare("INSERT INTO settings(key,value) VALUES('channel_id',?),('channel_title',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify('UC'+'c'.repeat(22)),JSON.stringify('テストch')).run();
  let r=await mf.dispatchFetch(origin+'/api/public',{headers:{Origin:'chrome-extension://abc'}});const d=await r.json();
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),'*');assert.equal(d.app,'stream-trophies');assert.equal(d.channel.title,'テストch');assert.equal(d.channel.id,'UC'+'c'.repeat(22));
  r=await mf.dispatchFetch(origin+'/api/heartbeat',{method:'OPTIONS',headers:{Origin:'chrome-extension://abc','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
  assert.equal(r.status,204);assert.match(r.headers.get('Access-Control-Allow-Headers'),/Authorization/);assert.equal(r.headers.get('Access-Control-Allow-Credentials'),null);
  r=await mf.dispatchFetch(origin+'/api/admin/state',{headers:{Authorization:'Bearer test-admin',Origin:'chrome-extension://abc'}});assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
  r=await mf.dispatchFetch(origin+'/api/admin/state',{method:'OPTIONS'});assert.equal(r.status,404);
});
test('expiry, logout, and deletion revoke access',async()=>{const a=await login();await call('logout',{body:{},cookie:a.cookie});assert.equal((await call('me',{cookie:a.cookie})).status,401);const second=await login();await db.prepare('UPDATE web_sessions SET expires=0 WHERE token=?').bind(hash(second.cookie.split('=')[1])).run();assert.equal((await call('me',{cookie:second.cookie})).status,401);const third=await login();assert.equal((await call('me/delete',{body:{},cookie:third.cookie})).status,200);assert.equal((await call('me',{cookie:third.cookie})).status,401);assert.ok(await db.prepare('SELECT viewer FROM optout WHERE viewer=?').bind(A).first());assert.equal(await db.prepare('SELECT id FROM viewers WHERE id=?').bind(A).first(),null);});


test('link codes use supported worker crypto and remain six decimal digits',async()=>{
  for(let i=0;i<4;i++){
    const r=await mf.dispatchFetch(origin+'/api/link/start',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.'+(i+1)},body:'{}'});
    assert.equal(r.status,200);const data=await r.json();assert.match(data.code,/^[1-9][0-9]{5}$/);assert.ok(data.claim);
  }
});
