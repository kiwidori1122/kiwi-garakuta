"""きういスマホ画面の動作確認（スマホなしで確認できる部分）。Windows・Linuxのどちらでも実行できる。"""
import datetime
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / 'common'))
sys.path.insert(0, str(ROOT))
import consumer_runtime  # noqa: E402
if os.name != 'nt':
    consumer_runtime.local_folder = lambda: Path(tempfile.gettempdir())
import core  # noqa: E402


def expect(cond, message):
    if not cond:
        raise AssertionError(message)


def main():
    pin = json.loads((ROOT / 'upstream-pin.json').read_text(encoding='utf8'))
    expect(pin['executable'] in pin['members'] and pin['adb'] in pin['members'], 'pin members')
    expect(pin['url'].startswith('https://github.com/Genymobile/scrcpy/releases/download/v5.0.1/'), 'pin url')
    for name, digest in pin['licenses'].items():
        expect(hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest, 'license digest ' + name)

    sample = '''* daemon not running; starting now at tcp:5037
* daemon started successfully
List of devices attached
R58M12ABCDE            device usb:1-1 product:a52qxx model:SM_A525F device:a52q transport_id:1
ZY22B3CDEF             unauthorized usb:1-2 transport_id:2
192.168.1.20:5555      offline
emulator-5554          no permissions (user in plugdev group; are your udev rules wrong?); see [http://developer.android.com/tools/device.html]
bad serial!            device
'''
    d = core.parse_devices(sample)
    expect([x['serial'] for x in d] == ['R58M12ABCDE', 'ZY22B3CDEF', '192.168.1.20:5555', 'emulator-5554'], 'serials')
    expect(d[0]['model'] == 'SM A525F' and d[0]['state'] == 'device', 'model')
    expect(d[1]['state'] == 'unauthorized' and d[3]['state'] == 'no permissions', 'states')
    expect('接続OK' in core.describe(d) and '許可' in core.describe(d), 'describe')
    expect('見つかりませんでした' in core.describe([]), 'describe empty')
    expect(core.label(d[1]) == 'Android端末（ZY22B3CDEF）', 'label')

    base = {'serial': 'R58M12ABCDE', 'quality': list(core.QUALITY)[0], 'bitrate': list(core.BITRATE)[0],
            'audio': core.AUDIO[0], 'control': core.CONTROL[0], 'screen': core.SCREEN[0], 'awake': core.AWAKE[0],
            'top': core.TOP[0]}
    a = core.build_args(base)
    expect(a[:6] == ['--serial', 'R58M12ABCDE', '--window-title', core.TITLE, '--video-bit-rate', '8M'], 'base args')
    expect('--stay-awake' in a and '--max-size' not in a and '--no-audio' not in a, 'defaults')
    b = core.build_args({**base, 'quality': '1280px（軽い）', 'audio': core.AUDIO[1], 'screen': core.SCREEN[1],
                         'top': core.TOP[1], 'bitrate': '軽量（4 Mbps）'})
    expect(b[b.index('--max-size') + 1] == '1280' and '--no-audio' in b and '--turn-screen-off' in b, 'options')
    expect('--always-on-top' in b and b[b.index('--video-bit-rate') + 1] == '4M', 'options2')
    c = core.build_args({**base, 'control': core.CONTROL[1], 'screen': core.SCREEN[1]})
    expect('--no-control' in c and '--turn-screen-off' not in c and '--stay-awake' not in c, 'view only')
    for bad in [{'serial': ''}, {'serial': 'a b'}, {'serial': 'x;rm'}, {'serial': '--help'}, {'quality': 'x'}, {'audio': 'x'}]:
        try:
            core.build_args({**base, **bad})
        except ValueError:
            continue
        raise AssertionError('accepted bad value ' + repr(bad))
    expect(core.SERIAL.fullmatch('--help') is None, 'serial must not start with a dash')

    with tempfile.TemporaryDirectory() as td:
        now = datetime.datetime(2026, 11, 24, 22, 15, 30)
        p1 = core.record_path(td, now)
        expect(p1.name == 'スマホ録画_20261124-221530.mp4', 'record name')
        p1.write_bytes(b'x')
        expect(core.record_path(td, now).name == 'スマホ録画_20261124-221530_1.mp4', 'no overwrite')
        r = core.build_args(base, p1)
        expect(r[-1] == '--record=' + str(p1), 'record arg')

    expect('見つかりません' in core.explain('ERROR: Could not find any ADB device', 1, None), 'explain missing')
    expect('許可' in core.explain('ERROR: Device is unauthorized', 1, None), 'explain unauthorized')
    expect('Android 11' in core.explain('WARN: Audio disabled: it is not supported before Android 11', 0, None), 'explain audio')
    expect('録画を保存しました' in core.explain('', 0, Path('a.mp4')), 'explain recorded')
    expect(core.explain('', 0, None) == '映すのを終了しました。', 'explain normal')
    print('kiwi-phone-screen verify: OK')


if __name__ == '__main__':
    main()
