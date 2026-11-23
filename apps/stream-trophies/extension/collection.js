'use strict';
const $=s=>document.querySelector(s);const fmt=n=>new Intl.NumberFormat('ja-JP',{maximumFractionDigits:1}).format(n);
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
const unit={comments:' コメント',characters:' 文字',streams:' 回'};
(async()=>{try{
  const server=new URLSearchParams(location.search).get('server')||'';
  const r=await chrome.runtime.sendMessage({type:'me',server});if(!r?.ok)throw new Error(r?.error||'読み込めません');
  const {viewer:v,trophies}=r.data;
  $('#greeting').textContent=v.name+' さんのコレクション';try{const st=await chrome.runtime.sendMessage({type:'status'});const me=st?.data?.servers?.find(x=>x.server===server);if(me?.title)$('#message').dataset.channel=me.title;}catch{}$('#message').textContent=($('#message').dataset.channel?$('#message').dataset.channel+' の配信で':'配信で')+'積み重ねた、あなたの記録。';
  $('#comments').textContent=fmt(v.comments);$('#characters').textContent=fmt(v.characters);$('#watch').textContent=fmt(v.watch_seconds/3600)+' h';$('#streams').textContent=fmt(v.streams)+' 回';
  const grid=$('#collection');
  for(const t of trophies){
    const award=v.awards.find(a=>a.trophy===t.id);const value=v[t.metric]||0;
    const tile=node('article',undefined,'tile'+(award?'':' locked'));tile.append(node('div',t.icon,'icon'),node('h3',t.name));
    const text=award?'獲得：'+new Date(award.created*1000).toLocaleDateString('ja-JP'):t.metric==='member'?'メンバーとしてコメントすると獲得':t.metric==='event'?'限定イベントで獲得':t.metric==='subscribed'?'チャンネル登録で獲得':t.metric==='watch_seconds'?fmt(value/3600)+' / '+fmt(t.threshold/3600)+' 時間':fmt(value)+' / '+fmt(t.threshold)+(unit[t.metric]||'');
    tile.append(node('p',text,'muted'));const bar=node('div',undefined,'bar');const fill=node('span');fill.style.width=(award?100:Math.min(1,value/t.threshold)*100)+'%';bar.append(fill);tile.append(bar);grid.append(tile);
  }
}catch(e){$('#message').textContent=e.message+'（拡張のアイコンから連携してください）';}})();
