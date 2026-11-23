'use strict';
// YouTubeの再生状態と、配信の概要欄にある「配信トロフィー: https://…」だけを読む。
// 動画の操作や、ページ内容（コメント・閲覧履歴など）の送信はしない。
(() => {
  const device=crypto.randomUUID();let previous=null,state=null,stateAt=0,sampling=false,toastShown='';
  const send=async body=>{const r=await chrome.runtime.sendMessage(body);if(!r?.ok)throw new Error(r?.error||'接続できません');return r.data;};
  // 概要欄の文字。長いURLは表示が「…」で省略されるので、リンクの文字をリンク先のURLに置き換えて読む
  function description(){
    const box=document.querySelector('ytd-watch-metadata #description, #description-inline-expander, ytd-video-secondary-info-renderer #description');
    if(!box)return '';
    const copy=box.cloneNode(true);
    for(const a of [...copy.querySelectorAll('a[href]')].slice(0,100)){
      try{const u=new URL(a.getAttribute('href'),location.href);const target=u.pathname==='/redirect'?(u.searchParams.get('q')||''):u.href;if(/^https?:\/\//.test(target))a.textContent=' '+target+' ';}catch{}
    }
    return (copy.textContent||'').slice(0,20000);
  }
  function toast(server,title){
    if(toastShown===server||document.getElementById('stream-trophy-toast'))return;toastShown=server;
    const host=document.createElement('div');host.id='stream-trophy-toast';
    const root=host.attachShadow({mode:'closed'});
    root.innerHTML='<style>div{position:fixed;left:24px;bottom:24px;z-index:2147483647;max-width:360px;background:#10161e;color:#edf1f7;border:1px solid #d5fa66;border-radius:12px;padding:14px 16px;font:13px/1.7 "Segoe UI","Yu Gothic UI",sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4)}b{color:#d5fa66}p{margin:0 0 10px}button{font:600 12px inherit;border-radius:8px;padding:7px 12px;cursor:pointer;border:0;margin-right:6px}.go{background:#d5fa66;color:#1a230c}.no{background:#202c3d;color:#e6eef9}</style><div role="dialog" aria-label="配信トロフィー"><p>🏆 <b></b> の配信は「配信トロフィー」に対応しています。連携すると、視聴時間やコメントでトロフィーが集まります。</p><button class="go">連携する</button><button class="no">今はしない</button></div>';
    root.querySelector('b').textContent=title||new URL(server).hostname;
    root.querySelector('.go').onclick=()=>{send({type:'open-link',server}).catch(()=>{});host.remove();};
    root.querySelector('.no').onclick=()=>{send({type:'dismiss',server}).catch(()=>{});host.remove();};
    document.documentElement.append(host);setTimeout(()=>host.remove(),30000);
  }
  async function tick(){if(sampling)return;sampling=true;try{
    const id=location.pathname==='/watch'?new URLSearchParams(location.search).get('v'):null;
    if(!id){previous=null;state=null;return;}
    if(!state||state.video!==id||Date.now()-stateAt>15000){state={...(await send({type:'page',video:id,candidates:TrophyCore.findServers(description())})),video:id};stateAt=Date.now();}
    if(state.offer)toast(state.offer.server,state.offer.title);
    if(!state.server||!state.linked||!state.enabled){previous=null;return;}
    const video=document.querySelector('video.html5-main-video');
    const sample={at:performance.now(),video:id,target:state.video,live:state.live===true,
      ad:!!document.querySelector('#movie_player.ad-showing, #movie_player.ad-interrupting'),
      paused:video?.paused??true,ended:video?.ended??true,seeking:video?.seeking??true,
      ready:video?.readyState??0,rate:video?.playbackRate??0,position:video?.currentTime??0};
    const seconds=TrophyCore.watched(previous,sample);previous=sample;
    if(TrophyCore.playable(sample))await send({type:'sample',server:state.server,video:id,seconds,device,sequence:Date.now()});
  }catch{previous=null;state=null;}finally{sampling=false;}}
  for(const type of ['pause','waiting','seeking','emptied','ended','ratechange'])document.addEventListener(type,()=>previous=null,true);
  document.addEventListener('yt-navigate-start',()=>{previous=null;state=null;toastShown='';document.getElementById('stream-trophy-toast')?.remove();});
  setInterval(tick,5000);tick();
})();
