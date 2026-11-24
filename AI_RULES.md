# AIで作業するときのルール（kiwi-garakuta・公開版）

このリポジトリは公開されています。ChatGPT（Codex）、Claude（Claude Code）など、どのAIでも、どのPCでも同じルールで作業してください。

`AGENTS.md` は各PCだけに置く非公開のメモです（`.gitignore` 済み）。公開できない内容が入っていることがあるので、その中身をリポジトリのファイルやコミットメッセージに書き写さないでください。

## 最初に必ずやること

```sh
sh tools/guard/setup-local.sh
```

このリポジトリだけの git 設定（コミットの名義、チェック用フック）をそろえ、各PCの `AGENTS.md` にこのファイルへの案内を足します。何回実行しても大丈夫です。Claude Code では、セッション開始時に自動で実行されます。

## 守ること

1. **コミットの名義は `kiwidori <360543408+kiwidori1122@users.noreply.github.com>` だけ。** `git config --global` は変えないでください。`-c user.name=…` や環境変数で名義を変えるのも禁止です。
2. **個人が分かる情報を書かない。** 本名、会社名・職場、メールアドレス、PCのユーザー名や機械名、`C:\Users\…` のようなローカルのフルパスを、ファイル・コミットメッセージ・Release の説明・Issue に書かないでください。コマンドの出力やログをそのまま貼るのも避けます。分からないことは書かずに、聞いてください。
3. **チェックを止めたり、すり抜けたりしない。** `--no-verify` は使わないでください。`.githooks/`、`tools/guard/`、`.github/workflows/name-guard.yml`、`.claude/settings.json`、このファイル（`AI_RULES.md`）を消したり弱めたりしないでください。フックに止められたら、内容のほうを直します。
4. **履歴を書き換えない。** force push、rebase して push、タグの付け直しはしないでください。
5. **配布ファイル（ZIP・exe）は手元でビルドしてアップロードしない。** 手元でビルドすると、PCのユーザー名入りのパスが埋め込まれることがあります。リリースはタグを push して、`.github/workflows/release-*.yml` に GitHub Actions で作らせます。
6. **GitHub CLI は `sh tools/guard/gh.sh …` 経由で使う。** 専用ログインを使い、`kiwidori1122` であることを操作前に検査します。別PCの通常の gh ログインを使わず、エラーなら止めてください。作業クローンを新しく作ったときも、最初に `setup-local.sh` を実行してください。
7. **検査エラーに秘密を書き足さない。** 検査は問題の文字列・パスを表示しません。原因を調べる記録は gitignored の `data/` に置き、公開コミットやチャットへそのまま貼らないでください。短い禁止語が上流ライセンスの別人名などに反応した場合も、必要な著作権表示を削らないでください。

「出してはいけない言葉」の一覧は、公開できないのでこのリポジトリには入っていません。各PCの `~/.kiwi-guard/deny.txt`、または環境変数 `KIWI_GUARD_DENY` から読みます。一覧がなくてコミットが止まったら、回避せずにユーザーに伝えてください。

## サイトの構成

- 公開サイト: https://kiwi-garakuta.pages.dev （Cloudflare Pages。`main` に push すると自動でビルド・公開されます）
- リポジトリ: https://github.com/kiwidori1122/kiwi-garakuta
- ビルド: Python 3.12 以上で `python factory/prepublish.py && python site/build.py`（出力は `dist/`）
- `prepublish.py` は、カタログにあるダウンロードURL・ソースURLが実在するか確認します。存在しないURLがあると、公開のビルドが止まります
- ソフトのデータは `catalog.json`、サイトの設定は `site-settings.json`、ページの生成は `site/`
