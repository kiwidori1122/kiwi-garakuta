Apexランク表示 オーバーレイ v1.0.1
================================

アバターの頭上などに、Apex Legendsのランク・RP・今日の増減・目標までの残りRPを表示する、OBS用のブラウザソースです。
RPが動くと「+85」が浮かび、ディビジョンが上がると枠が光ります。枠の色はティアに合わせて変わります。

▼ いちばん簡単な使い方（ダウンロード不要）
  https://kiwi-garakuta.pages.dev/apex-rank-overlay/ の設定ページで、APIキーとEA IDを入れてURLを作り、
  OBSの「ブラウザ」ソースに貼るだけです。

▼ このZIPを使う場合（自分のPCで動かす）
  1. ZIPを展開して、フォルダを好きな場所に置きます
  2. setup.html をブラウザで開き、APIキーとEA ID（またはUID）を入れて「URLをコピー」
  3. OBSで「ソース」の＋ →「ブラウザ」を追加し、「ローカルファイル」のチェックは外したまま、URL欄に貼ります
  4. 幅 460・高さ 140 くらいにして、アバターの頭上に置きます

  APIキーは https://apexlegendsapi.com/ （Apex Legends Status）で無料で取得できます。

▼ 注意
  ・URLにはAPIキーが入っています。配信画面や画面共有に映さないでください。
  ・取得間隔を短くしすぎると、無料キーの回数制限にかかります（おすすめ120秒）。
  ・ランクの区切り（THRESHOLDS）は、EA公式ヘルプの表から計算した目安です。
    シーズンでずれたら overlay.js の THRESHOLDS を書き換えてください。
  ・Apex Legends Status の非公式APIを使います。EA・Respawnとは関係ありません。

作者：きうい（https://x.com/kiwi_dori）  MIT License（改造・再配布自由。クレジットは任意）

中継サーバーを使うZIP版では、overlay.js の TRUSTED_PROXY_URL に自分が管理するHTTPS接続先を固定してください。URLから任意の中継先を指定することはできません。
