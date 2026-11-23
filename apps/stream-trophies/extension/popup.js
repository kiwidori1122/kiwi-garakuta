'use strict';
const $=s=>document.querySelector(s);let timer,view='list',active=null,state=null;
const params=new URLSearchParams(location.search);
async function send(body){const r=await chrome.runtime.sendMessage(body);if(!r?.ok)throw new Error(r?.error||'拡張に接続できません');return r.data;}
function status(text,error=false){$('#status').textContent=text||'';$('#status').className=error?'error':'';}
const label=s=>s.title||(()=>{try{return new URL(s.server).hostname;}catch{return s.server;}})();
function show(id){for(const s of ['link','detail','list'])$('#'+s).hidden=s!==id;view=id;}
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
async function currentTab(){if(params.has('page'))return null;try{const [t]=await chrome.tabs.query({active:true,currentWindow:true});return t?.id;}catch{return null;}}

async function load(){
  clearTimeout(timer);
  state=await send({type:'status',tab:await currentTab()});
  const target=params.get('server');
  if(target&&!state.servers.some(s=>s.server===target&&s.linked)){params.delete('server');return openLink(target);}
  return list();
}
function list(){
  show('list');$('#welcome').hidden=!params.has('welcome');
  const box=$('#servers');box.replaceChildren();
  const linked=state.servers.filter(s=>s.linked);
  $('#empty').hidden=linked.length>0;
  for(const s of linked){
    const b=node('button',undefined,'server secondary');b.append(node('span',label(s),'title'),node('span',s.enabled?'記録中':'停止中','tag'+(s.enabled?'':' off')));
    b.onclick=()=>detail(s.server);box.append(b);
  }
  const cur=state.current&&state.servers.find(s=>s.server===state.current);
  $('#current').hidden=!state.current||!!cur?.linked;
  if(state.current&&!cur?.linked){$('#current-title').textContent=cur?label(cur):new URL(state.current).hostname;$('#current-link').onclick=()=>openLink(state.current);}
  status('');
}
async function openLink(server){
  show('link');active=server;
  const s=state.servers.find(x=>x.server===server);
  $('#link-title').textContent=s?label(s):'このチャンネル';$('#link-server').textContent=server;
  try{const p=await send({type:'link',server});if(p.title)$('#link-title').textContent=p.title;showCode(p);status('書き込みを待っています…');poll();}catch(e){status(e.message,true);}
}
function showCode(p){$('#code').textContent='!link '+p.code;const min=Math.max(0,Math.round((p.expires-Date.now())/60000));$('#expires').textContent='有効期限：あと約'+min+'分';}
async function poll(){
  if(view!=='link')return;
  try{const r=await send({type:'check',server:active});
    if(r.linked){status((r.name||'あなた')+' さんとして連携しました。違う場合は「連携を解除」してください');state=await send({type:'status'});return detail(active);}
    if(r.expired)return openLink(active);}catch(e){status(e.message,true);}
  timer=setTimeout(poll,3000);
}
async function detail(server){
  clearTimeout(timer);show('detail');active=server;
  const s=state.servers.find(x=>x.server===server)||{server};
  $('#name').textContent=(s.name||'あなた')+' さん × '+label(s);$('#enabled').checked=s.enabled!==false;
  if(s.lastStatus&&!$('#status').textContent)status(s.lastStatus);
  try{const d=await send({type:'me',server});$('#watch').textContent=(d.viewer.watch_seconds/3600).toLocaleString('ja-JP',{maximumFractionDigits:1});$('#count').textContent=d.viewer.awards.length;}
  catch(e){status(e.message,true);}
}
$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#code').textContent);status('コピーしました。チャット欄に貼り付けて送信してください');}catch{status('コピーできませんでした。手で入力してください',true);}};
$('#new-code').onclick=async()=>{try{showCode(await send({type:'new-code',server:active}));}catch(e){status(e.message,true);}};
$('#cancel-link').onclick=async()=>{clearTimeout(timer);view='list';await load();};
$('#back').onclick=()=>{status('');load();};
$('#enabled').onchange=async e=>{try{await send({type:'toggle',server:active,enabled:e.target.checked});status(e.target.checked?'記録を再開しました':'記録を止めました');state=await send({type:'status'});}catch(err){status(err.message,true);}};
$('#open-collection').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('collection.html?server='+encodeURIComponent(active))});
$('#privacy').onclick=e=>{e.preventDefault();chrome.tabs.create({url:active+'/privacy'});};
$('#disconnect').onclick=async()=>{try{await send({type:'disconnect',server:active});status('連携を解除しました');await load();}catch(e){status(e.message,true);}};
$('#delete').onclick=async()=>{if(!confirm('このチャンネルでのコメント数・視聴時間・トロフィーをすべて削除し、今後も記録しないようにします。よろしいですか？\n（もう一度連携すると再開できます）'))return;try{await send({type:'delete',server:active});await send({type:'disconnect',server:active});status('記録を削除しました');await load();}catch(e){status(e.message,true);}};
$('#add').onclick=async()=>{try{const server=new URL($('#manual').value.trim()).origin;await send({type:'add',server});state=await send({type:'status'});await openLink(server);}catch(e){status(e.message||'URLの形式が不正です',true);}};
load().catch(e=>status(e.message,true));
