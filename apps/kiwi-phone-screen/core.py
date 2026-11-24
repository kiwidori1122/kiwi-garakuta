"""Android画面のミラー・録画。スマホとの通信は、scrcpy公式配布に含まれるadbだけを使う。"""
import ctypes
import datetime
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

from consumer_runtime import Engine, NativeJob, safe_path

ROOT = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent
ENGINE = Engine(ROOT)
TITLE = 'きういスマホ画面'

QUALITY = {
    'おまかせ（スマホの解像度のまま）': None,
    '1920px（きれい）': 1920,
    '1280px（軽い）': 1280,
    '1024px（とても軽い）': 1024,
}
BITRATE = {
    '標準（8 Mbps）': '8M',
    '高画質（16 Mbps）': '16M',
    '軽量（4 Mbps）': '4M',
}
AUDIO = ['PCで鳴らす（Android 11以上）', '鳴らさない']
CONTROL = ['PCのマウス・キーボードで操作する', '見るだけ（操作しない）']
SCREEN = ['つけたまま', '映している間は消す（電池の節約）']
AWAKE = ['映している間はスリープしない', 'スマホの設定どおり']
TOP = ['ふつうに表示', 'いつも手前に表示']
RECORD = ['録画しない', '録画する（MP4）']

SERIAL = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._:\-]{0,63}$')
STATE = re.compile(r'^[a-z]{3,20}$')
STATE_TEXT = {
    'device': '接続OK',
    'unauthorized': 'スマホに出ている「USBデバッグを許可しますか？」で「許可」を押してください',
    'offline': '応答がありません。USBケーブルを挿し直してください',
    'no permissions': 'このPCから操作する権限がありません',
    'authorizing': 'スマホで許可を待っています',
    'recovery': 'リカバリーモードです。ふつうに起動してください',
    'sideload': 'サイドロードモードです。ふつうに起動してください',
    'bootloader': 'ブートローダーです。ふつうに起動してください',
}

GUIDE = '''はじめての方へ（最初の1回だけ）

1. スマホの「設定」→「デバイス情報」（機種によって「端末情報」「スマートフォン情報」）を開き、
   「ビルド番号」を7回続けてタップします。「開発者になりました」と出ればOKです。
2. 「設定」→「システム」→「開発者向けオプション」で「USBデバッグ」をオンにします。
3. データ通信ができるUSBケーブルでPCとつなぎ、「スマホを探す」を押します。
4. スマホに「USBデバッグを許可しますか？」と出たら「許可」を押します。
   「このパソコンからのUSBデバッグを常に許可する」にチェックすると、次からは聞かれません。
5. もう一度「スマホを探す」を押し、「接続OK」になったら「映す」を押します。

映している間の操作
・PCのマウスでタップ・スワイプ、キーボードで文字の入力ができます。右クリックは「戻る」です。
・終わるときは、スマホの画面のウィンドウを閉じるか、「映すのをやめる」を押します。
・録画は、終わったときに保存先へMP4で保存されます。

iPhoneには対応していません。スマホにアプリを入れる必要はありません。
'''


def tool(name):
    exe = ENGINE.executable()
    p = safe_path(exe.parent / name)
    if not p.is_file():
        raise ValueError('エンジンの準備をやり直してください。')
    return p


def known_folder(csidl, fallback):
    if os.name == 'nt':
        buf = ctypes.create_unicode_buffer(32768)
        if ctypes.windll.shell32.SHGetFolderPathW(None, csidl, None, 0, buf) == 0 and buf.value:
            return Path(buf.value)
    return Path(fallback)


def videos_folder():
    return known_folder(0x000e, Path.home() / 'Videos')


def parse_devices(text):
    devices = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith(('List of devices', '*', 'adb ')):
            continue
        parts = line.split()
        if len(parts) < 2 or not SERIAL.fullmatch(parts[0]):
            continue
        rest = line[len(parts[0]):].strip()
        state = 'no permissions' if rest.startswith('no permissions') else parts[1]
        if state != 'no permissions' and not STATE.fullmatch(state):
            continue
        info = dict(p.split(':', 1) for p in parts[2:] if ':' in p)
        model = info.get('model', '').replace('_', ' ')[:40]
        devices.append({'serial': parts[0], 'state': state, 'model': model})
    return devices


def label(device):
    name = device['model'] or 'Android端末'
    return f"{name}（{device['serial']}）"


def describe(devices):
    if not devices:
        return ('スマホが見つかりませんでした。\n'
                '・データ通信ができるUSBケーブルか確認してください（充電専用のケーブルでは見つかりません）\n'
                '・スマホの「USBデバッグ」がオンになっているか確認してください（「はじめての方へ」を参照）\n'
                '・スマホのロックを解除して、もう一度「スマホを探す」を押してください')
    lines = ['見つかったスマホ']
    for d in devices:
        lines.append(f"・{label(d)}：{STATE_TEXT.get(d['state'], d['state'])}")
    if not any(d['state'] == 'device' for d in devices):
        lines.append('')
        lines.append('「接続OK」の端末がありません。スマホの画面を確認してから、もう一度「スマホを探す」を押してください。')
    return '\n'.join(lines)


def run_adb(args, timeout=25):
    """同梱のadbを、ほかのプロセスと切り離して実行する（終わったら関連プロセスも閉じる）。"""
    exe = tool('adb.exe')
    # adb は初回に常駐プロセス（adbサーバー）を起動する。作業フォルダーをつかまれないよう、
    # 作業フォルダーはエンジンのフォルダーにし、一時フォルダーが消せなくてもエラーにしない
    with tempfile.TemporaryDirectory(prefix='kiwi-phone-adb-', ignore_cleanup_errors=True) as td:
        out_path = Path(td) / 'out.txt'
        with out_path.open('wb') as out:
            group = NativeJob()
            try:
                proc = subprocess.Popen([str(exe), *args], cwd=str(exe.parent), stdin=subprocess.DEVNULL, stdout=out,
                                        stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
                group.attach(proc)
                deadline = time.monotonic() + timeout
                while proc.poll() is None:
                    if time.monotonic() > deadline:
                        raise ValueError('スマホからの応答がありません。USBケーブルを挿し直してください。')
                    time.sleep(.1)
            finally:
                group.close()
        return out_path.read_bytes()[:256 * 1024].decode('utf8', 'replace')


def list_devices():
    return parse_devices(run_adb(['devices', '-l']))


def record_path(folder, now=None):
    folder = safe_path(folder, True)
    stamp = (now or datetime.datetime.now()).strftime('%Y%m%d-%H%M%S')
    for n in range(100):
        p = folder / (f'スマホ録画_{stamp}' + (f'_{n}' if n else '') + '.mp4')
        if not p.exists():
            return p
    raise ValueError('同じ名前の録画が多すぎます。')


def build_args(values, record=None):
    serial = values.get('serial', '')
    if not SERIAL.fullmatch(serial or ''):
        raise ValueError('「スマホを探す」を押して、映すスマホを選んでください。')
    for key, choices in [('quality', QUALITY), ('bitrate', BITRATE), ('audio', AUDIO), ('control', CONTROL),
                         ('screen', SCREEN), ('awake', AWAKE), ('top', TOP)]:
        if values.get(key) not in choices:
            raise ValueError('設定を選び直してください。')
    args = ['--serial', serial, '--window-title', TITLE, '--video-bit-rate', BITRATE[values['bitrate']]]
    size = QUALITY[values['quality']]
    if size:
        args += ['--max-size', str(size)]
    if values['audio'] == AUDIO[1]:
        args.append('--no-audio')
    if values['control'] == CONTROL[1]:
        args.append('--no-control')
    else:
        if values['screen'] == SCREEN[1]:
            args.append('--turn-screen-off')
        if values['awake'] == AWAKE[0]:
            args.append('--stay-awake')
    if values['top'] == TOP[1]:
        args.append('--always-on-top')
    if record:
        args.append('--record=' + str(record))
    return args


def explain(log, code, recorded):
    text = log[-6000:]
    lower = text.lower()
    msgs = []
    if 'could not find any adb device' in lower or 'device not found' in lower:
        msgs.append('スマホが見つかりませんでした。USBケーブルとUSBデバッグを確認して、「スマホを探す」からやり直してください。')
    if 'unauthorized' in lower:
        msgs.append('スマホに出ている「USBデバッグを許可しますか？」で「許可」を押してから、もう一度「映す」を押してください。')
    if 'audio' in lower and ('not supported' in lower or 'disabled' in lower or 'android 11' in lower):
        msgs.append('このスマホでは音をPCに送れませんでした（Android 11以上が必要です）。音は「鳴らさない」にすると、このメッセージは出ません。')
    if recorded:
        msgs.append(f'録画を保存しました：{recorded}')
    if code not in (0, None) and not msgs:
        tail = '\n'.join(text.strip().splitlines()[-12:])
        msgs.append('映せませんでした。スマホのロックを解除して、もう一度お試しください。\n\n詳しい情報：\n' + tail)
    return '\n\n'.join(msgs) or '映すのを終了しました。'


class Mirror:
    """scrcpyを1つだけ動かす。終了時は録画が壊れないよう、まずウィンドウを閉じる。"""

    def __init__(self):
        self.proc = None
        self.group = None
        self.work = None
        self.record = None

    def running(self):
        return self.proc is not None and self.proc.poll() is None

    def start(self, values, record_folder=None):
        if self.running():
            raise ValueError('すでに映しています。')
        exe = ENGINE.executable()
        adb = tool('adb.exe')
        self.record = record_path(record_folder) if record_folder else None
        args = build_args(values, self.record)
        self.work = Path(tempfile.mkdtemp(prefix='kiwi-phone-'))
        env = os.environ.copy()
        env.pop('ANDROID_SERIAL', None)
        env['ADB'] = str(adb)
        with (self.work / 'scrcpy.log').open('wb') as out:
            self.group = NativeJob()
            try:
                self.proc = subprocess.Popen([str(exe), *args], cwd=str(exe.parent), stdin=subprocess.DEVNULL,
                                             stdout=out, stderr=subprocess.STDOUT, env=env,
                                             creationflags=subprocess.CREATE_NO_WINDOW)
                self.group.attach(self.proc)
            except BaseException:
                self.group.close()
                self.group = None
                self.proc = None
                raise

    def _close_windows(self):
        if os.name != 'nt' or not self.running():
            return
        user32 = ctypes.windll.user32
        pid = self.proc.pid
        found = []
        proto = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

        def each(hwnd, _):
            owner = ctypes.c_ulong()
            user32.GetWindowThreadProcessId(ctypes.c_void_p(hwnd), ctypes.byref(owner))
            if owner.value == pid:
                found.append(hwnd)
            return True
        user32.EnumWindows(proto(each), None)
        for hwnd in found:
            user32.PostMessageW(ctypes.c_void_p(hwnd), 0x0010, 0, 0)  # WM_CLOSE

    def stop(self, wait=10):
        if not self.running():
            return
        self._close_windows()
        deadline = time.monotonic() + wait
        while self.running() and time.monotonic() < deadline:
            time.sleep(.1)
        if self.running():
            self.proc.kill()

    def finish(self):
        code = self.proc.wait(timeout=15) if self.proc else None
        if self.group:
            self.group.close()
            self.group = None
        log = ''
        if self.work and (self.work / 'scrcpy.log').is_file():
            log = (self.work / 'scrcpy.log').read_bytes()[-64 * 1024:].decode('utf8', 'replace')
        recorded = self.record if self.record and self.record.is_file() and self.record.stat().st_size > 0 else None
        self.proc = None
        return explain(log, code, recorded), recorded
