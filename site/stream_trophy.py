"""Stream trophy (viewer guide and streamer setup) and other free streaming tools."""
from html import escape
from render import image


def _esc(value):
    return escape(value, quote=True)


def content(settings):
    """Viewer guide: install the shared extension."""
    config = settings['stream_trophy']
    download = _esc(config['download_url'])
    contact = _esc(settings['contact_url'])
    store = config.get('store_url')
    store_notice = (f'<p><a class="button" href="{_esc(store)}" rel="noopener noreferrer">Chromeウェブストアで追加する ↗</a></p><p>ストアから入れると、自動で最新版に更新されます。下のZIPは、ストアを使えない場合の手動の入れ方です。</p>'
                    if store else '<p>Chromeウェブストアで公開準備中です。現在はZIPを展開して、手動で読み込む方法をご案内しています。</p>')
    popup = image('/assets/screenshots/stream-trophy-popup.png', '拡張のポップアップ。連携中のチャンネルが一覧で表示されている', css='shot')
    collection = image('/assets/screenshots/stream-trophy-collection.png', 'トロフィー図鑑。コメント数や視聴時間と、獲得したトロフィーの一覧', css='shot')
    return f'''<nav class="crumb" aria-label="パンくず"><a href="/">ホーム</a><span>/</span><span>配信トロフィー</span></nav>
<section class="guide-hero"><div class="eyebrow">配信に参加する · 配信トロフィー</div><h1>コメントも、いっしょの時間も、<br>トロフィーに。</h1><p class="lead">「配信トロフィー」に対応しているYouTube配信で、コメントしたり配信を見たりすると、<br>あなただけのトロフィーが集まります。拡張は1つで、対応しているどの配信者にも使えます。</p><a class="button" href="{_esc(store) if store else download}" {'' if store else 'download'} rel="noopener noreferrer">{'拡張を追加する' if store else '拡張のZIPをダウンロード'}</a><p>PCのChrome・Edge向け · バージョン2.0.1 · Googleログイン不要</p><p><a class="textlink" href="/stream-trophy/streamers/">配信者の方へ：自分の配信で使う（無料） ↗</a></p></section>
<nav class="page-nav" aria-label="ページの内容"><a href="#join">参加のしかた</a><a href="#install">拡張の入れ方</a><a href="#commands">チャットコマンド</a><a href="#questions">よくある質問</a><a href="#privacy">データの取り扱い</a></nav>
<div class="guide-content">
<section class="content-section" id="join"><h2>参加のしかたは、2通り</h2><div class="guide-points"><article><h3>コメントするだけ</h3><p>対応している配信のチャットで、コメント数・総文字数・参加した配信の数・メンバーシップに応じてトロフィーが集まります。スマホからのコメントも対象です。準備は必要ありません。</p></article><article><h3>視聴時間も集める（PCのみ）</h3><p>PCのChromeかEdgeに拡張を入れて連携すると、ライブ配信を見ていた時間も記録されます。自分のトロフィー図鑑も開けます。</p></article></div><p>対応している配信は、概要欄に「配信トロフィー: https://…」と書かれています。拡張がこれを見つけると、画面の左下に「連携する」が出ます。専用のGoogleログインやアカウント連携の許可画面はありません。</p><div class="workflow-section">{popup}{collection}</div></section>
<section class="content-section" id="install"><h2>拡張の入れ方</h2>{store_notice}<ol class="steps">
<li><span><strong>ZIPをダウンロードする</strong>このページのボタンから <code>stream-trophy-extension-v2.0.0.zip</code> を保存します。</span></li>
<li><span><strong>ZIPをすべて展開する</strong>ZIPを右クリックして「すべて展開」を選びます。展開したフォルダーは、拡張を使う間は消さずに置いておきます。</span></li>
<li><span><strong>拡張の管理画面を開く</strong>Chromeのアドレス欄に <code>chrome://extensions</code> と入力します。Edgeでは <code>edge://extensions</code> です。</span></li>
<li><span><strong>デベロッパーモードをオンにする</strong>拡張の管理画面にある「デベロッパーモード」のスイッチをオンにします。</span></li>
<li><span><strong>展開したフォルダーを読み込む</strong>「パッケージ化されていない拡張機能を読み込む」を選び、<code>manifest.json</code> が入っているフォルダーを指定します。</span></li>
<li><span><strong>対応している配信を開く</strong>ライブ配信を開くと、左下に「連携する」が出ます（拡張のアイコンに「!」も付きます）。押すと合言葉が表示されます。</span></li>
<li><span><strong>合言葉をライブチャットに書く</strong><code>!link 123456</code> のような合言葉を、その配信のチャットへ1回送ります。数字は自分の画面に表示されたものを使ってください。</span></li>
<li><span><strong>連携できたことを確認する</strong>拡張の表示が「○○ さん × チャンネル名」に変われば完了です。あとはいつも通り配信を見るだけです。</span></li>
</ol><a class="button" href="{download}" download>ZIPをダウンロード</a><p>合言葉は15分有効です。期限が切れたら「新しい合言葉を発行」から出し直せます。旧版（1.0.0）を入れている方は、旧版を削除してからこの版を入れ、もう一度連携してください。</p><p>手動で入れた拡張について、ブラウザーから確認が表示される場合があります。名前・配布元・権限を確認し、不明な場合は読み込みを中止してください。</p></section>
<section class="content-section" id="commands"><h2>チャットコマンド</h2><p>対応している配信のライブチャットに書き込みます。チャンネルごとに別々に記録されます。</p><div class="guide-points"><article><h3><code>!link 123456</code></h3><p>拡張と連携します。数字は拡張に表示された合言葉に置き換えます。</p></article><article><h3><code>!trophy off</code></h3><p>そのチャンネルでの自分の記録・トロフィー・連携を削除し、以後の記録を止めます。</p></article><article><h3><code>!trophy on</code></h3><p>記録を再開します。削除前の記録は戻りません。</p></article></div></section>
<section class="content-section faq" id="questions"><h2>よくある質問</h2>
<details><summary>参加しないといけませんか？</summary><p>参加は任意です。記録されたくない場合は、その配信のライブチャットに <code>!trophy off</code> と書いてください。拡張を入れなくても、配信は今まで通り楽しめます。</p></details>
<details><summary>複数の配信者で使えますか？</summary><p>使えます。拡張は1つのまま、対応している配信を開くたびに「連携する」が出ます。記録とトロフィーはチャンネルごとに別々です。</p></details>
<details><summary>スマホやテレビで見た時間も記録されますか？</summary><p>視聴時間は拡張を入れたPCのブラウザーで見た分だけが対象です。スマホのYouTubeアプリやテレビで見た時間は記録されません。スマホからのコメントは対象です。</p></details>
<details><summary>どんなときに視聴時間が増えますか？</summary><p>対象のライブ配信を再生している間です。一時停止中・広告中・読み込み中・アーカイブは対象外です。倍速で見ても、実際の時間以上には増えません。拡張のスイッチで、チャンネルごとに記録を止められます。</p></details>
<details><summary>複数のタブで開くと二重に増えますか？</summary><p>複数のタブで見ても、同じ人の視聴時間が二重に増えない仕組みです。</p></details>
<details><summary>知らないサーバーに勝手につながりませんか？</summary><p>拡張がつなぐのは、配信の概要欄に書かれた接続先で、しかもその接続先が「いま見ている配信はライブ中」と答えた場合だけです。概要欄はチャンネルの持ち主しか書けないため、別のチャンネルになりすますことはできません。連携は、自分で合言葉をチャットに書いたときだけ行われます。</p></details>
<details><summary>トロフィーを取ったらどうなりますか？</summary><p>表示名とトロフィー名が配信画面に表示される場合があります。</p></details>
<details><summary>拡張をやめたいときは？</summary><p>拡張で各チャンネルを開き「このチャンネルでの自分の記録をすべて削除」を実行してから、拡張の管理画面で削除してください。</p></details>
</section>
<section class="content-section" id="privacy"><h2>データの取り扱い（拡張）</h2><ul class="feature-list"><li>拡張が読み取るのは、YouTubeの視聴ページの「動画ID」「再生状態（再生中・一時停止・広告など）」「概要欄の文字」だけです。コメント・閲覧履歴・検索・ほかのサイトは読み取りません。</li><li>概要欄は「配信トロフィー: https://…」の接続先を探すためだけに読み、どこにも送信しません。</li><li>連携した配信者のサーバーへ、そのライブ配信の動画ID・計測した視聴秒数・タブごとのランダムID・計測順序を示す値を、連携用トークンを使って送ります。記録はその配信者のサーバー（配信者自身のCloudflare）にだけ保存され、拡張の作者（きうい）や他の配信者には送られません。</li><li>配信者のサーバーは、チャットに公開されているチャンネルID・表示名・メンバーかどうか、コメントの件数・総文字数、参加した配信の数・視聴時間・獲得トロフィーを記録します。コメント本文は保存しません。詳しくは、各配信の接続先の <code>/privacy</code> ページをご覧ください。</li><li>拡張がブラウザーに保存するのは、連携先の一覧・連携用トークン・設定だけです。Googleアカウントのメールアドレス・登録チャンネル・視聴履歴にはアクセスしません。</li><li><code>!trophy off</code> または拡張の削除ボタンで、そのチャンネルでの記録を削除できます。拡張のスイッチをオフにするだけでは、既存の記録は削除されません。</li></ul></section>
<section class="content-section" id="contact"><h2>うまく動かないときは</h2><p>どの手順で、どんな表示が出たかを添えて、XのDMへお寄せください。</p><a class="button button-secondary" href="{contact}" rel="noopener noreferrer">Xで @kiwi_dori を開く ↗</a></section>
</div>'''


def streamers(settings):
    """Streamer guide: run your own trophy server."""
    config = settings['stream_trophy']
    server = _esc(config['server_download_url'])
    source = _esc(config['source_url'])
    contact = _esc(settings['contact_url'])
    admin = image('/assets/screenshots/stream-trophy-admin.png', '管理画面の「YouTube接続」。配信の状態と、概要欄に書く1行が表示されている', css='shot')
    collection = image('/assets/screenshots/stream-trophy-collection.png', '視聴者のトロフィー図鑑', css='shot')
    return f'''<nav class="crumb" aria-label="パンくず"><a href="/">ホーム</a><span>/</span><a href="/streaming/">配信者向け</a><span>/</span><span>配信トロフィー</span></nav>
<section class="guide-hero"><div class="eyebrow">配信者向け · 無料 · オープンソース</div><h1>あなたの配信にも、<br>視聴者トロフィーを。</h1><p class="lead">コメント数・視聴時間・参加回数・メンバーシップで、視聴者がトロフィーを集められます。<br>獲得するとOBSの配信画面に演出が出ます。サーバーは自分のCloudflare無料枠で動きます。</p><a class="button" href="{server}" download>配信者用セットを無料ダウンロード</a><p>Windows · Node.js 22.12以上 · Cloudflare無料アカウント · YouTube Data APIキー（無料）</p><p><a class="textlink" href="{source}" rel="noopener noreferrer">GitHubでソースを見る（MIT License） ↗</a></p></section>
<nav class="page-nav" aria-label="ページの内容"><a href="#features">できること</a><a href="#setup">はじめ方</a><a href="#viewers">視聴者への案内</a><a href="#faq">よくある質問</a></nav>
<div class="guide-content">
<section class="content-section" id="features"><h2>できること</h2><ul class="feature-list"><li><strong>トロフィーを自由に作れる</strong>：名前・アイコン・条件（コメント数、総文字数、視聴時間、参加した配信の数、メンバーシップ）を管理画面で追加・変更できます。</li><li><strong>限定イベントトロフィー</strong>：誕生日配信や記念配信で「おめでとう」とコメントした人に、1回だけ付与できます。</li><li><strong>OBSに獲得演出</strong>：ブラウザソースを1つ追加するだけ。位置・色・大きさは管理画面でドラッグして調整できます。</li><li><strong>配信のたびの作業なし</strong>：ライブ開始を自動で検出し、終わると待機に戻ります。</li><li><strong>拡張は全配信者で共通</strong>：視聴者用の拡張は、きういが配布している共通の拡張を使います。配信者がストアに拡張を出す必要はありません。</li><li><strong>あなたのPCは何も公開しません</strong>：記録は自分のCloudflare（無料枠）に保存され、ほかの配信者や作者には届きません。</li></ul><div class="workflow-section">{admin}{collection}</div></section>
<section class="content-section" id="setup"><h2>はじめ方（10分くらい）</h2><ol class="steps">
<li><span><strong>YouTube Data APIキーを作る</strong>Google Cloud Consoleでプロジェクトを作り、「YouTube Data API v3」を有効にして、「認証情報」からAPIキーを作ります。キーの「APIの制限」はYouTube Data API v3だけにし、「アプリケーションの制限」は「なし」のままにします。OAuthの設定は不要です。</span></li>
<li><span><strong>Cloudflareの無料アカウントを用意する</strong><a href="https://dash.cloudflare.com/sign-up" rel="noopener noreferrer">dash.cloudflare.com</a> で登録します。</span></li>
<li><span><strong>配信者用セットを展開して「セットアップ.bat」を実行</strong>ブラウザでCloudflareにログインし、APIキーと自分のチャンネル（@ハンドルでOK）を貼り付けると、あとは自動で進みます。Node.jsが入っていなければ、ダウンロードページが開きます。</span></li>
<li><span><strong>OBSにブラウザソースを追加</strong>できあがった「管理画面URL.txt」の「OBS ブラウザソース」のURLを、幅1920・高さ1080で追加します。</span></li>
<li><span><strong>配信の概要欄に1行書く</strong>「管理画面URL.txt」にある <code>配信トロフィー: https://…</code> の1行を、概要欄に入れます。YouTube Studioの「アップロード動画のデフォルト設定」に入れておくと、毎回書かずに済みます。</span></li>
</ol><a class="button" href="{server}" download>配信者用セットをダウンロード</a><p>管理画面とOBSのURLは他の人に見せないでください。概要欄の1行は公開して大丈夫です。</p></section>
<section class="content-section" id="viewers"><h2>視聴者への案内</h2><p>「PCのChrome・Edgeに拡張を入れると、視聴時間でもトロフィーが集まるよ」と、このページを案内してください。拡張を入れていない人も、コメントの実績は自動で集まります。</p><p><code>https://kiwi-garakuta.pages.dev/stream-trophy/</code></p><p>チャットに <code>!trophy off</code> と書いた人は記録が削除され、以後は記録されません。</p></section>
<section class="content-section faq" id="faq"><h2>よくある質問</h2>
<details><summary>本当に無料ですか？</summary><p>ツールは無料です。CloudflareのWorkers・D1と、YouTube Data APIの無料枠の範囲で動きます。配信中のコメント取得は1時間あたり約900ユニットで、1日の上限1万ユニットに対し、1日10時間くらいまで余裕があります。</p></details>
<details><summary>クレジット表記は必要ですか？</summary><p>任意です。MIT Licenseなので改造・再配布も自由です。概要欄などで紹介してもらえるとうれしいです。</p></details>
<details><summary>限定公開やメンバー限定の配信でも使えますか？</summary><p>自動検出できないことがあります。その場合は、管理画面「YouTube接続」の配信URL欄に貼ってください。</p></details>
<details><summary>アップデートするには？</summary><p>新しい版をダウンロードしてフォルダーの中身を上書きし、「更新.bat」を実行します。記録はそのまま残ります。「.setup-state.json」と「管理画面URL.txt」は消さないでください。</p></details>
<details><summary>MacやLinuxで使えますか？</summary><p>セットアップの手順はWindows向けに用意しています。中身はNode.jsのスクリプトなので、<code>npm ci</code> のあと <code>npm run setup</code> でも実行できます。</p></details>
</section>
<section class="content-section" id="more"><h2>ほかの配信者向けツール</h2><p><a class="textlink" href="/apex-rank-overlay/">Apexランク表示オーバーレイ — 今のランクと目標までの残りRPを頭の上に ↗</a></p></section>
<section class="content-section" id="contact"><h2>導入の相談・不具合</h2><p>使ってくれたら、ぜひ教えてください。どの手順で、どんな表示が出たかを添えて、XのDMへどうぞ。</p><a class="button button-secondary" href="{contact}" rel="noopener noreferrer">Xで @kiwi_dori を開く ↗</a></section>
</div>'''


def apex_overlay(settings):
    """Apex rank overlay page."""
    config = settings['apex_rank_overlay']
    download = _esc(config['download_url'])
    source = _esc(config['source_url'])
    contact = _esc(settings['contact_url'])
    shot = image('/assets/screenshots/apex-rank-overlay.png', 'ランク表示オーバーレイ。プラチナIII、9,610 RP、今日の増減、ダイヤまであと2,140 RP', css='shot', lazy=False)
    return f'''<nav class="crumb" aria-label="パンくず"><a href="/">ホーム</a><span>/</span><a href="/streaming/">配信者向け</a><span>/</span><span>Apexランク表示オーバーレイ</span></nav>
<section class="guide-hero"><div class="eyebrow">配信者向け · 無料 · OBS</div><h1>今のランクと、<br>目標までの残りを頭の上に。</h1><p class="lead">Apex Legendsのランク・RP・今日の増減・目標ティアまでの残りRPを表示する、OBS用のブラウザソースです。<br>URLを作ってOBSに貼るだけ。インストールは要りません。</p><a class="button" href="/assets/apex-rank-overlay/setup.html">設定ページを開いてURLを作る</a><p>OBS Studio · 無料のAPIキー（Apex Legends Status）· PC / PS / Xbox / Switch</p>{shot}</section>
<nav class="page-nav" aria-label="ページの内容"><a href="#features">できること</a><a href="#setup">使い方</a><a href="#notes">注意点</a></nav>
<div class="guide-content">
<section class="content-section" id="features"><h2>できること</h2><ul class="feature-list"><li>ランクのアイコン・ティア名・ディビジョン・RPを表示します。枠の色はティアに合わせて変わります。</li><li>その日のRPの増減を表示します。数え直す時刻を決められるので、深夜配信の途中でリセットされません。</li><li>「ダイヤまであと○○RP」のように、目標ティアまでの残りを表示します。ランク上げ企画にぴったりです。</li><li>RPが動くと「+85」が浮かび、ディビジョンが上がると枠が光ります。</li><li>背景は透明。アバターの頭上や画面の端に置けます。</li></ul></section>
<section class="content-section" id="setup"><h2>使い方</h2><ol class="steps">
<li><span><strong>無料のAPIキーを取る</strong><a href="https://apexlegendsapi.com/" rel="noopener noreferrer">apexlegendsapi.com</a>（Apex Legends Status）でAPIキーを取得します。</span></li>
<li><span><strong>設定ページでURLを作る</strong><a href="/assets/apex-rank-overlay/setup.html">設定ページ</a>でAPIキーとEA ID（名前で出ないときはUID）、目標のティアを入れて「URLをコピー」を押します。</span></li>
<li><span><strong>OBSに貼る</strong>「ソース」の＋ →「ブラウザ」を追加し、URL欄に貼ります。幅460・高さ140くらいにして、アバターの頭上に置きます。</span></li>
</ol><a class="button" href="/assets/apex-rank-overlay/setup.html">設定ページを開く</a><p>自分のPCに置いて使いたい場合は、<a href="{download}" download>ZIP版（約12KB）</a>もあります。ソースは<a href="{source}" rel="noopener noreferrer">GitHub</a>で公開しています（MIT License）。</p></section>
<section class="content-section" id="notes"><h2>注意点</h2><ul class="feature-list"><li>URLにはAPIキーが入っています。配信画面や画面共有に映さないでください。キーはURLの「#」より後ろに入るため、このサイトのサーバーには送られません。</li><li>取得間隔を短くしすぎると、無料キーの回数制限にかかります。おすすめは120秒です。</li><li>RPの区切りは、EA公式ヘルプの表から計算した目安です。シーズンの変更でずれた場合は、ZIP版の <code>overlay.js</code> で直せます。</li><li>Apex Legends Statusの非公式APIを使います。EA・Respawnとは関係ありません。</li></ul></section>
<section class="content-section" id="contact"><h2>うまく動かないときは</h2><p>表示されたエラー（APIキーは伏せてください）を添えて、XのDMへどうぞ。</p><a class="button button-secondary" href="{contact}" rel="noopener noreferrer">Xで @kiwi_dori を開く ↗</a></section>
</div>'''
