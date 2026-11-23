'use strict';
const $ = id => document.getElementById(id);
const fields = ['key','player','uid','platform','goal','poll','reset','scale'];
const base = new URL('overlay.html', location.href).href;
function build(demo){
  const p = new URLSearchParams();
  if (demo) { p.set('demo','1'); p.set('goal',$('goal').value); p.set('scale',$('scale').value); return base + '#' + p; }
  for (const f of fields) { const v = $(f).value.trim(); if (v) p.set(f, v); }
  if (p.get('platform') === 'PC') p.delete('platform');
  return base + '#' + p;
}
function ready(){ return $('key').value.trim() && ($('player').value.trim() || $('uid').value.trim()); }
function update(){
  $('url').textContent = ready() ? build(false) : 'APIキーとプレイヤーを入力すると、ここにURLが出ます';
}
for (const f of fields) $(f).addEventListener('input', update);
$('copy').onclick = async () => {
  if (!ready()) { $('msg').textContent = 'APIキーと、EA IDかUIDを入力してください'; return; }
  try { await navigator.clipboard.writeText(build(false)); $('msg').textContent = 'コピーしました。OBSのブラウザソースのURL欄に貼り付けてください'; }
  catch { $('msg').textContent = 'コピーできませんでした。上のURLを選択してコピーしてください'; }
  $('preview').src = build(false);
};
$('demo').onclick = () => { $('preview').src = build(true); $('msg').textContent = 'お試し表示です。数秒ごとにRPがランダムに動きます'; };
$('preview').src = build(true);
