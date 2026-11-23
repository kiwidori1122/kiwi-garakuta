'use strict';
// 限定イベントトロフィーの設定（対象の配信・受付期間・判定する言葉）
(()=>{
  let current=null,dirty=false;
  const panel=document.createElement('form');panel.className='panel';panel.id='event-settings';panel.hidden=true;
  panel.innerHTML='<h3 id="event-heading">🎉 限定イベントトロフィー</h3><p>対象の配信で、決めた言葉を含むコメントを投稿した人に1回だけ付与します。配信URLが空の場合は、受付期間中に始まったライブを自動で対象にします。</p><label>獲得条件の説明（視聴者に表示）<input name="description" maxlength="80" placeholder="例：誕生日配信で、お祝いのコメントを投稿"></label><label>対象の配信URL<input name="video" type="text" placeholder="決まっていれば配信URLを指定"></label><div class="two-col"><label>受付開始（日本時間）<input name="starts" type="datetime-local" required></label><label>受付終了（日本時間）<input name="ends" type="datetime-local" required></label></div><label>判定する言葉（1行に1つ。大文字小文字・全角半角・空白の違いは無視）<textarea name="phrases" rows="5" style="width:100%;background:#0f151d;color:white;border:1px solid #344052;border-radius:8px;padding:12px;margin-top:8px" required></textarea></label><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="button lime" type="submit">この内容で保存</button><button class="button secondary" type="button" id="event-rename">名前・アイコンを編集</button><button class="button secondary" type="button" id="event-close">閉じる</button></div><p id="event-setting-status" role="status"></p>';
  document.querySelector('#trophies').append(panel);
  const date=t=>new Date(t*1000).toLocaleString('sv-SE',{timeZone:'Asia/Tokyo'}).slice(0,16).replace(' ','T');
  panel.oninput=()=>dirty=true;
  panel.querySelector('#event-close').onclick=()=>{panel.hidden=true;current=null;dirty=false;};
  panel.querySelector('#event-rename').onclick=()=>{if(current)openTrophy(current);};
  panel.onsubmit=async e=>{e.preventDefault();if(!current)return;const f=panel.elements;
    try{const result=await api('/api/admin/celebration',{id:current.id,description:f.description.value,video:f.video.value,starts:Date.parse(f.starts.value+':00+09:00')/1000,ends:Date.parse(f.ends.value+':00+09:00')/1000,phrases:f.phrases.value.split('\n').map(s=>s.trim()).filter(Boolean)});
      dirty=false;panel.querySelector('[role=status]').textContent=result.ready?'対象の配信と期間で、コメントを判定します。':'保存しました。受付期間中にライブが始まると自動で対象になります（URLを指定しても構いません）。';toast('限定トロフィーの設定を保存しました');await refresh();}
    catch(error){toast(error.message,true);}};
  window.editEventTrophy=t=>{
    if(!t)return;current=t;dirty=false;panel.hidden=false;
    const rule=state.celebration_rules?.find(r=>r.trophy===t.id);const f=panel.elements;
    panel.querySelector('#event-heading').textContent=(t.icon||'🎉')+' 限定イベント：'+t.name;
    const start=rule?.starts||Math.floor(Date.now()/1000/3600)*3600;
    f.description.value=rule?.description||'';f.video.value=rule?.video?'https://www.youtube.com/watch?v='+rule.video:'';
    f.starts.value=date(start);f.ends.value=date(rule?.ends||start+86400);f.phrases.value=(rule?.phrases||['おめでとう']).join('\n');
    panel.querySelector('[role=status]').textContent=rule?'':'まだ条件が保存されていません。内容を決めて保存してください。';
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  };
})();
