const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createOverlay}=require('../overlay.js');

function overlay(hash){
  const requests=[];const nodes=new Map();
  const node=()=>({style:{setProperty(){}},classList:{remove(){},add(){}},textContent:'',innerHTML:'',hidden:false});
  const runtime={
    document:{documentElement:node(),getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}},
    location:{hash,search:'',reload(){}},window:{addEventListener(){}},
    localStorage:{getItem(){return null;},setItem(){}},setInterval(){return 1;},clearInterval(){},
    async fetch(url,options){requests.push({url:String(url),options});return {ok:true,json:async()=>({global:{rank:{rankName:'Platinum',rankScore:9610,rankDiv:3}}})};},
  };
  return {...createOverlay(runtime),requests,nodes};
}
test('rank requests use only the fixed official API and encoded parameters',async()=>{
  const o=overlay('#key=test-key&player='+encodeURIComponent('name&auth=evil')+'&platform=PC');
  const r=await o.fetchRank();assert.equal(r.score,9610);
  for(const q of o.requests){const u=new URL(q.url);assert.equal(u.origin,'https://api.mozambiquehe.re');assert.equal(u.pathname,'/bridge');assert.equal(u.searchParams.get('auth'),'test-key');assert.equal(u.searchParams.get('player'),'name&auth=evil');assert.equal(q.options.redirect,'error');assert.equal(q.options.credentials,'omit');}
});
test('URL-supplied relays cannot cause arbitrary external or internal requests',async()=>{
  for(const proxy of ['https://evil.example/leak','http://127.0.0.1','http://169.254.169.254','https://api.mozambiquehe.re.evil.example/','javascript:alert(1)']){
    const o=overlay('#key=secret&player=test&proxy='+encodeURIComponent(proxy));
    await assert.rejects(o.fetchRank(),/未登録の中継先/);assert.equal(o.requests.length,0,proxy);
  }
});
test('demo display does not need a key or send any network request',async()=>{
  const o=overlay('#demo=1');const r=await o.fetchRank();assert.equal(typeof r.score,'number');assert.equal(o.requests.length,0);
});
