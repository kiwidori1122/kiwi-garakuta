function createOverlay(runtime) {
const { document, location, window, fetch, localStorage, setInterval, clearInterval } = runtime;
/* ===================== 設定 =====================
  設定は、このページのURLの「#」より後ろに書きます（setup.html で作れます）。
  「#」より後ろはサーバーに送られないので、APIキーが外に漏れません。
    key   … apexlegendsapi.com で取った無料のAPIキー（必須）
    uid   … プレイヤーのUID（数字）。名前で見つからないとき用。入れるとこちらを優先
    player… EA ID（プレイヤー名）
    platform … PC / PS4 / X1 / SWITCH（初期値 PC）
    goal  … 目標のティア（Gold / Platinum / Diamond / Master。初期値 Diamond）
    poll  … 取得間隔（秒、60〜600。初期値 120）
    reset … 「今日の増減」を数え直す時刻（0〜23時。初期値 18）
    scale … 表示の大きさ（0.5〜3。初期値 1）
    proxy … ZIP版で TRUSTED_PROXY_URL に登録した中継先だけを指定できる（key は送らない）
  =================================================== */
const TRUSTED_PROXY_URL = ""; // ZIP版の中継先を使う場合だけ、管理するHTTPS URLをここに固定する
const P = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
const clampNum = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const CONFIG = {
  API_KEY:    P.get("key") || "",
  PLAYER:     P.get("player") || "",
  PLAYER_UID: (P.get("uid") || "").replace(/\D/g, ""),
  PLATFORM:   ["PC","PS4","X1","SWITCH"].includes(P.get("platform")) ? P.get("platform") : "PC",
  PROXY_URL: P.get("proxy") || "",
  POLL_SEC:   clampNum(P.get("poll"), 60, 600, 120),
  SESSION_RESET_HOUR: clampNum(P.get("reset"), 0, 23, 18),
  GOAL:       P.get("goal") || "Diamond",

  // 各ディビジョンの開始RP(累計)。シーズンで変わることがあるので、ずれていたら書き換える
  // EA公式ヘルプ(ランクの仕組み)の必要RP表から計算した目安
  THRESHOLDS: [
    ["Rookie",4,0],["Rookie",3,250],["Rookie",2,500],["Rookie",1,750],
    ["Bronze",4,1000],["Bronze",3,1500],["Bronze",2,2000],["Bronze",1,2500],
    ["Silver",4,3000],["Silver",3,3500],["Silver",2,4000],["Silver",1,4500],
    ["Gold",4,5250],["Gold",3,6000],["Gold",2,6750],["Gold",1,7500],
    ["Platinum",4,8250],["Platinum",3,9000],["Platinum",2,9750],["Platinum",1,10750],
    ["Diamond",4,11750],["Diamond",3,12750],["Diamond",2,13750],["Diamond",1,14750],
    ["Master",0,15750],
  ],
};
// 目標ティアの開始RPと表示名
{ const g = CONFIG.THRESHOLDS.find(t => t[0] === CONFIG.GOAL) || CONFIG.THRESHOLDS.find(t => t[0] === "Diamond");
  CONFIG.GOAL = g[0]; CONFIG.GOAL_RP = g[2]; }
/* ================================================ */

const TIER = {
  "Unranked":     {ja:"ランク外",   color:"#9aa3b5"},
  "Rookie":       {ja:"ルーキー",   color:"#c9a27a"},
  "Bronze":       {ja:"ブロンズ",   color:"#d08b52"},
  "Silver":       {ja:"シルバー",   color:"#d7dde8"},
  "Gold":         {ja:"ゴールド",   color:"#ffd25a"},
  "Platinum":     {ja:"プラチナ",   color:"#5fe0e6"},
  "Diamond":      {ja:"ダイヤ",     color:"#6fa8ff"},
  "Master":       {ja:"マスター",   color:"#c77dff"},
  "Apex Predator":{ja:"プレデター", color:"#ff4d5e"},
};
const ROMAN = {1:"I",2:"II",3:"III",4:"IV"};

document.documentElement.style.setProperty("--scale", clampNum(P.get("scale"), 0.5, 3, 1));
const DEMO = P.has("demo");
CONFIG.GOAL_NAME = (TIER[CONFIG.GOAL] || TIER.Diamond).ja;

const $ = id => document.getElementById(id);
let last = null;
let STORE_KEY = "apexRankBase:demo";

function store(k, v){ try{ if(v===undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); }catch(e){ return null; } }

// 「今日」の区切り: SESSION_RESET_HOUR を日付の境目として扱う
function sessionKey(){
  const d = new Date(Date.now() - CONFIG.SESSION_RESET_HOUR*3600e3);
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

async function fetchRank(){
  if (DEMO) return demoRank();
  if (!CONFIG.PROXY_URL && !CONFIG.API_KEY) throw new Error("APIキー未設定（setup.htmlでURLを作ってください）");
  if (!CONFIG.PROXY_URL && !CONFIG.PLAYER_UID && !CONFIG.PLAYER) throw new Error("プレイヤー未設定");
  let url = new URL('https://api.mozambiquehe.re/bridge');
  if (CONFIG.PROXY_URL) {
    if (!TRUSTED_PROXY_URL || CONFIG.PROXY_URL !== TRUSTED_PROXY_URL) throw new Error('未登録の中継先です。ZIP版のTRUSTED_PROXY_URLで管理する接続先を指定してください');
    url = new URL(TRUSTED_PROXY_URL);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('中継先はHTTPSのURLにしてください');
  } else {
    url.searchParams.set('auth', CONFIG.API_KEY);
    url.searchParams.set(CONFIG.PLAYER_UID ? 'uid' : 'player', CONFIG.PLAYER_UID || CONFIG.PLAYER);
    url.searchParams.set('platform', CONFIG.PLATFORM);
  }
  // 設定が変わったら「今日の増減」の基準も分ける
  STORE_KEY = "apexRankBase:" + (CONFIG.PLAYER_UID || CONFIG.PLAYER || "proxy");
  const res = await fetch(url, {cache:"no-store", credentials:"omit", redirect:"error", referrerPolicy:"no-referrer", signal:AbortSignal.timeout(12000)});
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  if (j.Error) throw new Error(j.Error);
  const r = j.global && j.global.rank;
  if (r) { r.rankScore = Number(r.rankScore) || 0; r.rankDiv = Number(r.rankDiv) || 0; r.ladderPosPlatform = Number(r.ladderPosPlatform) || -1; }
  if (!r) throw new Error("rankが見つからない");
  return { name: r.rankName, div: r.rankDiv, score: r.rankScore, img: r.rankImg, ladder: r.ladderPosPlatform };
}

// ?demo で配置確認用。30秒ごとにRPが動く
let demoRP = 9500;
function demoRank(){
  demoRP += Math.round((Math.random()-.35)*180);
  const t = locate(demoRP);
  return { name: t.name, div: t.div, score: demoRP, img: "", ladder: -1 };
}

// RPから現在ディビジョンと次の区切りを求める
function locate(rp){
  const T = CONFIG.THRESHOLDS;
  let i = 0;
  while (i+1 < T.length && rp >= T[i+1][2]) i++;
  const cur = T[i], next = T[i+1];
  return { name:cur[0], div:cur[1], start:cur[2], end: next ? next[2] : null };
}

function render(r){
  const t = TIER[r.name] || TIER["Unranked"];
  document.documentElement.style.setProperty("--accent", t.color);

  if (r.img && /^https:\/\//.test(r.img)) { $("icon").src = r.img; $("icon").hidden = false; }
  else $("icon").hidden = true;

  const divTxt = (r.div && ROMAN[r.div] && r.name!=="Master" && r.name!=="Apex Predator") ? ROMAN[r.div] : "";
  let tierHtml = `${t.ja}<span class="div">${divTxt}</span>`;
  if (r.name==="Apex Predator" && r.ladder>0) tierHtml += `<span class="div">#${r.ladder}</span>`;
  $("tier").innerHTML = tierHtml; // TIERとROMANは固定の文字なので安全
  $("rp").textContent = `${r.score.toLocaleString()} RP`;

  // 今日の増減
  const sk = sessionKey();
  let base = store(STORE_KEY);
  if (!base || base.key !== sk) { base = {key:sk, rp:r.score}; store(STORE_KEY, base); }
  const d = r.score - base.rp;
  $("delta").textContent = `今日 ${d>0?"+":""}${d}`;
  $("delta").className = d>0?"up":d<0?"down":"zero";

  // ディビジョン内の進み具合
  const loc = locate(r.score);
  const pct = loc.end ? (r.score-loc.start)/(loc.end-loc.start)*100 : 100;
  $("fill").style.width = Math.max(0,Math.min(100,pct)) + "%";

  // 目標まで
  const left = CONFIG.GOAL_RP - r.score;
  $("goal").innerHTML = left > 0
    ? `${CONFIG.GOAL_NAME}まで あと <b>${left.toLocaleString()}</b> RP`
    : `${CONFIG.GOAL_NAME} 到達！`; // 数字と固定の文字だけ

  // 前回からの変化をポップ表示
  if (last) {
    const diff = r.score - last.score;
    if (diff !== 0) {
      const p = $("pop");
      p.textContent = (diff>0?"+":"") + diff;
      p.style.color = diff>0 ? "#6dffa0" : "#ff7b8a";
      p.classList.remove("show"); void p.offsetWidth; p.classList.add("show");
    }
    if (last.name !== r.name || last.div !== r.div) {
      const up = r.score > last.score;
      if (up) { const c=$("card"); c.classList.remove("levelup"); void c.offsetWidth; c.classList.add("levelup"); }
    }
  }
  last = r;
}

async function tick(){
  try {
    const r = await fetchRank();
    render(r);
    $("err").style.display = "none";
  } catch (e) {
    // 失敗しても前回の表示は残す
    $("err").textContent = "取得失敗: " + e.message;
    $("err").style.display = "block";
    if (!last) $("tier").textContent = "ランク取得待ち";
  }
}

window.addEventListener("hashchange", () => location.reload());
tick();
const timer = setInterval(tick, (DEMO ? 8 : CONFIG.POLL_SEC) * 1000);
return { fetchRank, stop: () => clearInterval(timer) };

}
if (typeof module !== "undefined" && module.exports) module.exports = { createOverlay };
else createOverlay(globalThis);
