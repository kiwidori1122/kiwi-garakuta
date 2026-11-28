"""Public guide for the Kiwi Helper Minecraft mod."""

import re
from urllib.parse import parse_qs, urlsplit

from render import esc, icon, image

ROUTE = '/kiwi-helper/'
TITLE = 'お手伝いさんbot Mod'
DESCRIPTION = 'キウイみたいな相棒に、マイクラの畑・牧場・露天掘り・整地・湧きつぶしをおまかせ。Java版26.3用の無料Modと導入手順。'
HERO_IMAGE = '/assets/screenshots/kiwi-helper-public.png'
HERO_ALT = 'きういちゃんの正面と斜め後ろ。背中に短い尾羽がある'


def video_url(value: str) -> str:
    if not value:
        return ''
    url = urlsplit(value)
    if url.scheme == 'https' and url.netloc == 'youtu.be':
        video_id = url.path.removeprefix('/')
    elif url.scheme == 'https' and url.netloc in {'youtube.com', 'www.youtube.com', 'm.youtube.com'} and url.path == '/watch':
        candidates = parse_qs(url.query).get('v', [])
        video_id = candidates[0] if len(candidates) == 1 else ''
    else:
        video_id = ''
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
        raise ValueError('Set kiwi_helper.youtube_url to a YouTube watch or share URL')
    return f'https://www.youtube.com/watch?v={video_id}'


def content(settings):
    config = settings['kiwi_helper']
    version = config['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid Kiwi Helper version')
    filename = f'kiwihelper-{version}.jar'
    address = config['download_url']
    expected = f'https://github.com/kiwidori1122/kiwi-garakuta/releases/download/kiwi-helper-v{version}/{filename}'
    if address and address != expected:
        raise ValueError('Kiwi Helper download must match the configured release version')
    download = f'''<a class="button download-button" href="{esc(address)}" rel="noopener noreferrer">{icon('download')}Modをダウンロード（JAR）</a><p class="filename">{esc(filename)}</p>''' if address else '<p>ダウンロードは準備中です。</p>'
    video = video_url(config['youtube_url'])
    watch = f'''<a class="button" href="{esc(video)}" rel="noopener noreferrer">{icon('media')}YouTubeで見る</a>''' if video else '<p>YouTubeで公開後、このページから見られます。</p>'
    preview = image(HERO_IMAGE, HERO_ALT, lazy=False)
    recipe = image('/assets/screenshots/kiwi-helper-recipe.png', '作業台で鉄インゴット3個・レッドストーンダスト1個・板材1個から呼び鈴を作る画面')
    return f'''<nav class="crumb" aria-label="パンくず"><a href="/">ホーム</a><span>/</span><span>{TITLE}</span></nav>
<section class="tool-hero"><div><div class="eyebrow">Minecraft Java Edition</div><h1>{TITLE}</h1><p class="lead">キウイみたいな相棒に、マイクラの作業をおまかせ。1体につき、5つの職業からひとつ担当を選べます。</p></div>
<aside class="download-panel" id="download" aria-label="ダウンロード"><div class="download-meta"><strong>無料</strong><span>v{esc(version)}</span></div><p>Minecraft Java版 26.3 · NeoForge 26.3.0.118で動作確認 · Java 25</p>{download}<a href="#install">導入手順 {icon('arrow')}</a></aside></section>
<nav class="page-nav" aria-label="このページの内容"><a href="#video">紹介動画</a><a href="#install">導入方法</a><a href="#start">作業を始める</a><a href="#jobs">できること</a><a href="#faq">よくある質問</a></nav>
<figure class="shot">{preview}<figcaption>きういちゃんの正面と背面</figcaption></figure>
<div class="guide-content">
<section class="content-section" id="video"><h2>紹介動画</h2>{watch}</section>
<section class="content-section" id="install"><h2>導入方法</h2><ol class="steps">
<li><span><strong>NeoForgeを導入する</strong>Minecraft Java Edition 26.3用の <a href="https://projects.neoforged.net/neoforged/neoforge" rel="noopener noreferrer">NeoForge 26.3.0.118</a> と、64ビットのJava 25を使います。</span></li>
<li><span><strong>JARを <code>mods</code> フォルダーに入れる</strong>このページから保存したJARを展開せずに入れ、NeoForgeの環境で起動します。マルチプレイではサーバーと参加者全員のクライアントに同じJARを入れてください。</span></li></ol></section>
<section class="content-section" id="start"><h2>作業を始める</h2><ol class="steps">
<li><span><strong>呼び鈴を作って、きういちゃんを呼ぶ</strong>作業台の上段中央・中段左右に鉄インゴット、中段中央にレッドストーンダスト、下段中央に板材を置きます。できた呼び鈴を持ってブロックを右クリックします。</span></li>
<li><span><strong>作業範囲を囲む</strong>同じ職業のマーカーを対角に2本置き、空の手で順番に右クリックします。登録したマーカーを右クリックすると範囲が光ります。</span></li>
<li><span><strong>倉庫を用意する</strong>空色の倉庫マーカー2本を同じように登録し、中にチェストを置きます。作業に使う道具や材料を入れておくと、補充にも使われます。</span></li>
<li><span><strong>作業を割り当てる</strong>きういちゃんを右クリックし、範囲と倉庫を選んで作業開始。職業ごとに目標の高さや頭数を調整できます。</span></li></ol>
<figure class="shot">{recipe}<figcaption>お手伝いさんの呼び鈴のレシピ</figcaption></figure><p>マーカーはレッドストーントーチと染料で2本作れます。畑は黄緑、牧場は桃色、露天掘りは紫、整地は茶色、湧きつぶしは黄色、倉庫は空色です。</p></section>
<section class="content-section" id="jobs"><h2>できること</h2><div class="guide-points">
<article><h3>畑</h3><p>畑を耕し、水を張って、育った作物を収穫して植え直します。種や水入りバケツを倉庫へ。</p></article>
<article><h3>牧場</h3><p>種類ごとに頭数を管理し、繁殖・毛刈り・搾乳をします。餌・ハサミ・空のバケツを倉庫へ。</p></article>
<article><h3>湧きつぶし</h3><p>ブロック光が0で置ける場所を探し、倉庫の松明を設置します。</p></article>
<article><h3>整地</h3><p>高いところを削り、穴を土や丸石で埋め、草ブロックか土で仕上げます。土・丸石や仕上げ用の土または草ブロックを倉庫へ。</p></article>
<article><h3>露天掘り</h3><p>上の層から掘り、目標のY座標の層や岩盤の手前で止まります。水や溶岩を一時的に塞いだ丸石も掘り直し、外からの流入を防ぐ境界は残します。</p></article></div>
<p>整地と露天掘りでは、ジャングルの大木やツタ、カカオも作業前に片付けます。2体以上で担当区画を分け、全員が今の層を片付けてから次へ進みます。共有倉庫のチェストには集めた物が搬入されます。</p></section>
<section class="content-section faq" id="faq"><h2>よくある質問</h2>
<details><summary>作業が止まったときは？</summary><p>作業範囲と倉庫の割り当て、チェストの空き、種や松明などの補充品を確認してください。露天掘りで水や溶岩を塞ぐときは丸石を用意してください。</p></details>
<details><summary>ログアウト中も作業する？</summary><p>専用サーバーではチャンクローダーが有効な間、プレイヤーがいない状態でも稼働できます。整地と露天掘りは、作業を終えるとチャンクの読み込みを解除します。</p></details>
<details><summary>botの稼働数やチャンク読み込みは調整できる？</summary><p>サーバーの <code>config/kiwihelper-synced.toml</code> の <code>[work]</code> で、チャンクローダーのオン・オフ、プレイヤーごとの稼働数、1範囲のbot数とチャンク数の上限を調整できます。整地と露天掘りの不要品は <code>discardItems</code> にアイテムIDを登録します。初期設定ではすべて持ち帰ります。</p></details>
<details><summary>以前のバージョンで丸石が浮いているときは？</summary><p>同じ作業範囲と目標Yで露天掘りを再開すると、掘削範囲内の丸石を取り除けます。</p></details></section>
</div>'''
