// 限定イベントトロフィー：決めた配信・期間内に、決めた言葉を含むコメントをした人へ1回だけ付与する
// 例）誕生日配信で「おめでとう」、記念配信で「おめでとう」「888」など
export const BIRTHDAY_PHRASES=['おめでとう','おめでと','おたおめ','ハッピーバースデー','happybirthday','happybday','hbd'];
// 対象の配信URLが未設定のルールは、受付期間中に始まったライブへ自動で結び付ける
export async function bindEventLive(env,live,started){
  if(!live.is_live)return;
  const start=Date.parse(started)/1000;if(!Number.isFinite(start))return;
  await env.DB.prepare("UPDATE celebration_rules SET video=? WHERE video='' AND starts<=? AND ?<ends").bind(live.id,start,start).run();
}
const normalize=text=>String(text).normalize('NFKC').toLowerCase().replace(/[\s\u200b-\u200d\ufe0f]/gu,'');
export function matchesCelebration(rule,message,video){
  if(!rule.video||video!==rule.video||!Number.isFinite(message.published)||message.published<rule.starts||message.published>=rule.ends)return false;
  const text=normalize(message.text);
  return rule.phrases.some(phrase=>{const value=normalize(phrase);if(value==='hbd')return /(?:^|[^a-z0-9])hbd(?:$|[^a-z0-9])/u.test(text);return value&&text.includes(value);});
}
export async function attachCelebrations(env,trophies){
  const {results}=await env.DB.prepare('SELECT * FROM celebration_rules').all();
  return trophies.map(t=>{const event=results.find(e=>e.trophy===t.id);return event?{...t,event:{description:event.description,video_id:event.video,starts:event.starts,ends:event.ends}}:t;});
}
export async function awardCelebrations(env,messages,video){
  const {results}=await env.DB.prepare('SELECT e.* FROM celebration_rules e JOIN trophies t ON t.id=e.trophy WHERE t.enabled=1').all();
  for(const row of results){const rule={...row,phrases:JSON.parse(row.phrases)};for(const message of messages){
    if(!matchesCelebration(rule,message,video))continue;
    const result=await env.DB.prepare('INSERT OR IGNORE INTO awards(viewer,trophy,created) SELECT id,?,? FROM viewers WHERE id=? AND id NOT IN (SELECT viewer FROM optout) RETURNING viewer').bind(rule.trophy,message.published,message.viewer).all();
    if(result.results.length)await env.DB.prepare("INSERT INTO events(viewer,payload,created) SELECT v.id,json_object('name',v.name,'title',t.name,'icon',t.icon,'trophy',t.id),? FROM viewers v,trophies t WHERE v.id=? AND t.id=?").bind(Date.now()/1000,message.viewer,rule.trophy).run();
  }}
}
export async function saveCelebration(env,data,h){
  const {UserError,parseVideo}=h;
  const trophy=await env.DB.prepare("SELECT id FROM trophies WHERE id=? AND metric='event'").bind(String(data.id||'')).first();
  if(!trophy)throw new UserError('対象の限定トロフィーが不正です');
  const video=parseVideo(data.video||'');
  const starts=Number(data.starts),ends=Number(data.ends);
  if(!Number.isFinite(starts)||!Number.isFinite(ends)||ends<=starts||ends-starts>7*86400)throw new UserError('判定期間は7日以内で、開始より後の終了日時にしてください');
  const phrases=data.phrases;
  if(!Array.isArray(phrases)||!phrases.length||phrases.length>20||phrases.some(p=>typeof p!=='string'||!p.trim()||p.length>40))throw new UserError('お祝いの言葉は1〜40文字で、20個まで指定してください');
  const description=String(data.description||'').trim().slice(0,80)||'限定イベントでコメント';
  await env.DB.prepare('INSERT INTO celebration_rules(trophy,video,starts,ends,phrases,description) VALUES(?,?,?,?,?,?) ON CONFLICT(trophy) DO UPDATE SET video=excluded.video,starts=excluded.starts,ends=excluded.ends,phrases=excluded.phrases,description=excluded.description').bind(trophy.id,video,starts,ends,JSON.stringify(phrases.map(p=>p.trim())),description).run();
  return {ok:true,ready:!!video};
}
