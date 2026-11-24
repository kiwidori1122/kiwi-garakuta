# 名前漏れ防止チェック（kiwi-guard）

公開リポジトリに、本名や会社の情報が入らないようにするための仕組みです。

| どこで | 何をするか |
|---|---|
| コミットするとき（`.githooks/pre-commit`・`commit-msg`） | 名義が `kiwidori <360543408+kiwidori1122@users.noreply.github.com>` か、変更したファイルとメッセージに「出してはいけない言葉」がないかを確認します |
| push するとき（`.githooks/pre-push`） | 送るコミットを全部、もう一度確認します（チェックを飛ばして作ったコミットも止めます） |
| GitHub に届いたあと（`.github/workflows/name-guard.yml`） | 同じ確認をして、だめならメールで知らせます（Web画面での編集など、PCを通らなかった変更の見張り） |

- 「出してはいけない言葉」は公開できないので、リポジトリには入れません。各PCの `%USERPROFILE%\.kiwi-guard\deny.txt`（1行に1つ。短い言葉は先頭に `=` を付けると、単語としてそのまま出てきたときだけ止める。例：`=taro`）と、GitHub のシークレット `GUARD_DENY`（カンマ区切り）に置きます
- AI 向けのルールは `AI_RULES.md`（公開）。Claude Code は `CLAUDE.md` から読み込み、Codex は各PCの `AGENTS.md`（非公開）の先頭に入る案内から読みます
- 新しいPCでは `tools\setup-pc.bat` を1回実行します（gh のログイン、clone、git 設定、言葉の一覧づくりまで行います）
- AI のクラウド環境では、最初に `sh tools/guard/setup-local.sh` を実行し、環境変数 `KIWI_GUARD_DENY` に言葉の一覧（カンマ区切り）を設定します
- 手動で全履歴を確認する: `sh tools/guard/check-range.sh HEAD`
