"""きういスマホ画面 - Androidの画面をPCに映して操作・録画する画面。"""
import os
import sys
import tkinter as tk
from tkinter import ttk, messagebox

if not getattr(sys, 'frozen', False):
    _common_dir = os.path.join(os.path.dirname(__file__), '..', 'common')
    if os.path.isdir(_common_dir) and _common_dir not in sys.path:
        sys.path.insert(0, _common_dir)

from consumer_ui import Window  # noqa: E402
from consumer_runtime import safe_path  # noqa: E402
import core  # noqa: E402


class App(Window):
    def __init__(self):
        super().__init__(
            title='きういスマホ画面',
            subtitle='Androidスマホの画面をPCに映して、マウスで操作したり録画したりできます。USBケーブルでつなぐだけで、スマホにアプリを入れる必要はありません。',
            engine=core.ENGINE)
        self.geometry('1000x790')
        self.minsize(900, 720)
        self.mirror = core.Mirror()
        self.devices = []
        self.field('device', 'スマホ', choices=['（「スマホを探す」を押してください）'])
        self.device_box = self.controls[-1][0]
        self.field('quality', '画質（長い辺の最大）', value=list(core.QUALITY)[0], choices=list(core.QUALITY))
        self.field('bitrate', '通信量', value=list(core.BITRATE)[0], choices=list(core.BITRATE))
        self.field('audio', 'スマホの音', value=core.AUDIO[0], choices=core.AUDIO)
        self.field('control', '操作', value=core.CONTROL[0], choices=core.CONTROL)
        self.field('screen', 'スマホ本体の画面', value=core.SCREEN[0], choices=core.SCREEN)
        self.field('awake', 'スリープ', value=core.AWAKE[0], choices=core.AWAKE)
        self.field('top', 'PCでの表示', value=core.TOP[0], choices=core.TOP)
        self.field('record', '録画', value=core.RECORD[0], choices=core.RECORD)
        self.field('folder', '録画の保存先', value=str(core.videos_folder()), picker='folder')

        self.btn_find = self.button(self.actions, 'スマホを探す', self.on_find)
        self.btn_start = self.button(self.actions, '映す', self.on_start)
        self.btn_stop = ttk.Button(self.actions, text='映すのをやめる', command=self.on_stop, state='disabled')
        self.btn_folder = self.button(self.actions, '録画フォルダーを開く', self.on_folder)
        self.btn_guide = self.button(self.actions, 'はじめての方へ', lambda: self.show(core.GUIDE))
        for b in (self.btn_find, self.btn_start, self.btn_stop, self.btn_folder, self.btn_guide):
            b.pack(side='left', padx=2)
        self.status.set('USBケーブルでスマホをつないで「スマホを探す」を押してください。')
        self.note.set('初回のみ「エンジンを準備」で、scrcpy公式のWindows版（約11 MB）を取得します。映像はスマホからUSBで受け取り、PC内で表示します。iPhoneには対応していません。')
        self.show(core.GUIDE)

    # --- スマホを探す
    def on_find(self):
        self.start(core.list_devices, self.on_devices)

    def on_devices(self, devices):
        self.devices = devices
        labels = [core.label(d) for d in devices]
        self.device_box.configure(values=labels)
        ready = [core.label(d) for d in devices if d['state'] == 'device']
        self.vars['device'].set(ready[0] if ready else (labels[0] if labels else ''))
        self.show(core.describe(devices))
        self.status.set('「接続OK」なら「映す」を押してください。' if ready else 'スマホの状態を確認してください。')

    def selected(self):
        name = self.vars['device'].get()
        for d in self.devices:
            if core.label(d) == name:
                if d['state'] != 'device':
                    raise ValueError(core.STATE_TEXT.get(d['state'], 'このスマホはまだ使えません。'))
                return d['serial']
        raise ValueError('「スマホを探す」を押して、映すスマホを選んでください。')

    # --- 映す
    def on_start(self):
        if self.busy or self.mirror.running():
            return
        try:
            values = self.values()
            values['serial'] = self.selected()
            folder = None
            if values['record'] == core.RECORD[1]:
                folder = str(safe_path(values['folder'], True))
            self.mirror.start(values, folder)
        except Exception as error:
            messagebox.showerror('映せませんでした', str(error), parent=self)
            return
        for widget, _ in self.controls:
            widget.configure(state='disabled')
        self.btn_stop.configure(state='normal')
        rec = '（録画中）' if values['record'] == core.RECORD[1] else ''
        self.status.set(f'映しています{rec}。終わるときは、スマホの画面のウィンドウを閉じるか「映すのをやめる」を押します。')
        self.after(500, self.watch)

    def watch(self):
        if self.mirror.running():
            self.after(500, self.watch)
            return
        message, recorded = self.mirror.finish()
        for widget, state in self.controls:
            widget.configure(state=state)
        self.btn_stop.configure(state='disabled')
        self.status.set('録画を保存しました。' if recorded else '映すのを終了しました。')
        self.show(message)

    def on_stop(self):
        self.status.set('終了しています…（録画中なら、保存が終わるまで数秒かかります）')
        self.update_idletasks()
        self.mirror.stop()

    def on_folder(self):
        try:
            os.startfile(str(safe_path(self.vars['folder'].get(), True)))
        except Exception as error:
            messagebox.showerror('開けませんでした', str(error), parent=self)

    def close(self):
        if self.mirror.running():
            self.mirror.stop()
            self.mirror.finish()
        super().close()


if __name__ == '__main__':
    App().mainloop()
