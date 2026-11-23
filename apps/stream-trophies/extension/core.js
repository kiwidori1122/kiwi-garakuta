(function(root){
  'use strict';
  // 接続先（配信者のサーバー）のURLを検査して origin だけを返す
  function endpoint(value){
    const u=new URL(value);
    if(u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw new Error('接続先の形式が不正です');
    if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))throw new Error('接続先はHTTPSが必要です');
    return u.origin;
  }
  // 配信の概要欄から「配信トロフィー: https://…」の行を探す（最大3件）
  const MARK=/(?:配信トロフィー|stream[\s-]?trophy)\s*[:：]?\s*(https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?)\/?(?=$|[\s)）」』>,、。])/giu;
  function findServers(text){
    const out=[];
    for(const m of String(text||'').slice(0,20000).matchAll(MARK)){
      try{const o=endpoint(m[1]);if(!out.includes(o))out.push(o);}catch{}
      if(out.length>=3)break;
    }
    return out;
  }
  function playable(s){return !!(s&&s.video&&s.target&&s.video===s.target&&s.live&&!s.ad&&!s.paused&&!s.ended&&!s.seeking&&s.ready>=3&&s.rate>0&&Number.isFinite(s.position));}
  function watched(previous,current){if(!playable(previous)||!playable(current)||previous.video!==current.video)return 0;const elapsed=(current.at-previous.at)/1000;const moved=current.position-previous.position;if(elapsed<=0||elapsed>8||moved<=0||moved>elapsed*Math.max(previous.rate,current.rate)+1)return 0;return Math.min(elapsed,moved/Math.max(previous.rate,current.rate));}
  const api={endpoint,findServers,playable,watched};root.TrophyCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
