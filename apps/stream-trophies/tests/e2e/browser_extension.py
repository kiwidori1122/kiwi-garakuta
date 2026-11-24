"""実際のChromiumに拡張を読み込み、偽のYouTubeページで「見つける→連携→視聴時間の記録」を通しで確認する。
前提: mock_youtube.py と wrangler dev (127.0.0.1:8787, DEMO=1) が起動済みで、e2e_cloud.mjs と同じ .dev.vars。
使い方: python tests/e2e/browser_extension.py  （playwright と ffmpeg で作った test.mp4 が必要）
"""
import asyncio, json, os, shutil, sys, tempfile, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
W, Y = 'http://127.0.0.1:8787', 'http://127.0.0.1:8899'
ADMIN = {'Authorization': 'Bearer admin-test-key-0123456789'}
VID = 'abcdefghijk'
VIDEO = (ROOT / 'tests' / 'e2e' / 'test.mp4').read_bytes()
fails = 0

def check(label, ok, extra=''):
    global fails
    print(('✅ ' if ok else '❌ ') + label + (f'  {extra}' if extra else ''))
    fails += 0 if ok else 1

def http(url, body=None, headers=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={**({'Content-Type': 'application/json'} if body is not None else {}), **(headers or {})})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read() or b'null')

PAGE = f'''<!doctype html><html><body>
<div id="movie_player"><video class="html5-main-video" src="/test.mp4" muted autoplay loop playsinline></video></div>
<ytd-watch-metadata><div id="description">今日もApexやります！
配信トロフィー: <a href="https://www.youtube.com/redirect?q={urllib.request.quote(W, safe='')}">{W[:20]}...</a>
X: <a href="https://www.youtube.com/redirect?q=https%3A%2F%2Fx.com%2Fexample">x.com/example</a></div></ytd-watch-metadata>
</body></html>'''

async def main():
    # 1) サーバーをライブ中にする
    http(W + '/api/admin/config', {'channel_id': '@example', 'video_id': '', 'poll_seconds': 15}, ADMIN)
    http(Y, {'live': True}); http(W + '/api/admin/refresh', {}, ADMIN)
    pub = http(W + '/api/public')
    check('サーバーがライブ中を公開', pub['video'] and pub['video']['id'] == VID, json.dumps(pub, ensure_ascii=False))
    # 2) テスト用に http://127.0.0.1 を許可した拡張のコピー
    ext = Path(tempfile.mkdtemp()) / 'ext'
    shutil.copytree(ROOT / 'extension', ext)
    bg = ext / 'background.js'
    bg.write_text("self.TROPHY_ALLOW_LOCAL=true;\n" + bg.read_text(encoding='utf8'), encoding='utf8')
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(tempfile.mkdtemp(), channel='chromium', headless=True,
            args=[f'--disable-extensions-except={ext}', f'--load-extension={ext}', '--autoplay-policy=no-user-gesture-required'])
        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
        ext_id = sw.url.split('/')[2]
        async def route(r):
            if r.request.url.endswith('/test.mp4'):
                return await r.fulfill(status=200, body=VIDEO, headers={'Content-Type': 'video/mp4', 'Accept-Ranges': 'none'})
            await r.fulfill(status=200, body=PAGE, headers={'Content-Type': 'text/html; charset=utf-8'})
        await ctx.route('https://www.youtube.com/**', route)
        for pg in ctx.pages: await pg.close()
        page = await ctx.new_page()
        await page.goto(f'https://www.youtube.com/watch?v={VID}')
        await page.wait_for_timeout(500)
        await page.evaluate("document.querySelector('video').play().catch(()=>{})")
        toast = await page.wait_for_selector('#stream-trophy-toast', state='attached', timeout=20000)
        check('概要欄から対応配信を見つけて「連携する」を出す', toast is not None)
        # 3) 連携画面（トーストの「連携する」で開くページ）
        popup = await ctx.new_page()
        await popup.goto(f'chrome-extension://{ext_id}/popup.html?page=1&server={urllib.request.quote(W, safe="")}')
        code = ''
        for _ in range(40):
            code = (await popup.inner_text('#code')).split()[-1]
            if code.isdigit(): break
            await popup.wait_for_timeout(250)
        title = await popup.inner_text('#link-title')
        check('合言葉とチャンネル名を表示', len(code) == 6 and title == 'テストch', f'{code} / {title}')
        http(Y, {'chat': [{'id': 'm-link', 'snippet': {'type': 'textMessageEvent', 'textMessageDetails': {'messageText': f'!link {code}'}},
                          'authorDetails': {'channelId': 'UC' + 'v' * 22, 'displayName': '視聴者V'}}]})
        http(W + '/api/admin/refresh', {}, ADMIN)
        await popup.wait_for_selector('#detail:not([hidden])', timeout=30000)
        check('チャットの合言葉で連携完了', '視聴者V' in await popup.inner_text('#name'), await popup.inner_text('#name'))
        # 4) 視聴時間（10秒ごとに送信。サーバーは連続した送信の間隔だけ加算する）
        await page.bring_to_front()
        await page.evaluate("document.querySelector('video').play().catch(()=>{})")
        watch = 0
        for _ in range(16):
            await page.wait_for_timeout(5000)
            viewers = http(W + '/api/admin/state', headers=ADMIN)['viewers']
            watch = next((v['watch_seconds'] for v in viewers if v['id'] == 'UC' + 'v' * 22), 0)
            if watch > 0: break
        check('ライブを再生しているだけで視聴時間が増える', watch > 0, f'{watch:.1f}秒')
        # 5) 一覧と図鑑
        await popup.goto(f'chrome-extension://{ext_id}/popup.html?page=1')
        await popup.wait_for_selector('.server', timeout=5000)
        check('連携中のチャンネル一覧に出る', 'テストch' in await popup.inner_text('#servers'))
        col = await ctx.new_page()
        await col.goto(f'chrome-extension://{ext_id}/collection.html?server={urllib.request.quote(W, safe="")}')
        await col.wait_for_selector('.tile', timeout=10000)
        check('トロフィー図鑑を開ける', '視聴者V' in await col.inner_text('#greeting'))
        await col.screenshot(path=os.environ.get('SHOT_DIR', '/tmp') + '/collection.png', full_page=True)
        await popup.screenshot(path=os.environ.get('SHOT_DIR', '/tmp') + '/popup.png', full_page=True)
        await ctx.close()
    print('\nすべて合格' if not fails else f'\n{fails}件失敗')
    sys.exit(1 if fails else 0)

asyncio.run(main())
