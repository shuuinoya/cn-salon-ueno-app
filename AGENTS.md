# 作業のルール（2台のMac・2つのAIで共通）

このプロジェクトは、ノートMac（VS Code＋Claude Code）とデスクトップMac（VS Code＋Codex）の2か所で作業します。
どちらのAIも、作業を始める前にこのファイルと README.md を読み、ここに書いた決まりを守ってください。
お店の人（依頼する人）は日本語で依頼します。返事・報告は日本語で、専門用語を使わずに書きます。

## サイト
- 予約サイト（お客様用）と管理画面（CNsalon@board）を、1つのサーバー（`server.js`＋`demo-api.js`）で動かしています
- 本番の住所：https://cn-salon.taila11357.ts.net （管理画面は `/cnsalon-board`）
- **本番はデスクトップのiMacで動いています**（2026-10-19から）。本番用フォルダは iMac の `~/CNsalon本番（移動禁止）`。**このフォルダでは作業しない・移動や削除をしない**（Codex の作業フォルダは `~/Desktop/cn-salon-ueno`）。「このMacで本番を動かす.command」で起動・「このMacの本番を止める.command」で停止。止まらないように launchd の LaunchAgent `jp.cnsalon.production` が見張る
- 本番は1台だけ：Tailscale の名前が `cn-salon`（公開URLの持ち主）のMacでしか起動しない作りになっている。MacBook は作業用
- **本番への反映**：作業フォルダで commit・push → iMac の本番用フォルダで `git pull --ff-only origin main` → `server.js`・`demo-api.js`・`persist.js` を変えたときだけ `kill -TERM $(pgrep -f '^/usr/local/bin/node server.js$')`（約5秒で戻る）。反映したら公開URLで確かめる（README の「このMacで本番を動かす」も参照）
- 仕組みの説明は README.md にあります（変えたら README.md も書き足す）

## 2台で作業するときの決まり
- **作業を始める前に `git pull`、終わったら commit して `git push`**（GitHub の shuuinoya/cn-salon-ueno が共通の保管場所）
- 同じファイルを2か所で同時に直さない。依頼された作業の範囲だけを直す
- **本番への反映は、本番が動いているMacの1か所だけから**行う（2台で同時に本番を動かさない。保存データを2つのサーバーが上書きし合う）
- 本番のサーバーを試しに止めたり再起動したりしない（お客様が使っている）。反映のときだけ、server.js の子プロセスに `kill -TERM`（約5秒で自動的に戻る）

## 直すときの決まり
- **必ず本番データのコピーで試してから本番に反映する**。コピーで試すときは、保存データの `state.mailRelay` を空にし、送信待ちのメールを取り消してから起動する（そのままだと本物のお客様にメールが届く）。試し終わったらテスト用のサーバーを止める
- **テストの予約には必ずお名前に「テスト」を入れる**（本物の予約と見分けるため）
- 予約サイトに出す文字はすべて8か国語（日本語・英語・中国語・韓国語・フランス語・スペイン語・イタリア語・ドイツ語）。意味をそのまま訳す。あとから足した部分の訳は `public/cn-i18n.js`
- 多言語のメールは、お店の人の了解なしに有効にしない
- 画面の見た目・使い勝手を大きく変えるときは、先に依頼した人に確認する

## 秘密の情報（絶対に GitHub に送らない・人に見せない）
- `tools/mac-production.env`（GitHub の鍵・公開URLなど）、`data/`（お客様・予約のデータ）、`mail-config.json`、`tls/`
- これらは .gitignore 済み。`git add -A` ではなく、変えたファイルを名前で指定して add する

## 本番の公開用の保管場所（Render 用）
- Render は止まっていて、今はMacが本番。Render 用の保管場所（remote `render`＝shuuinoya/cn-salon-ueno-app）は公開されているので、ここにも秘密を入れない
- Render を再開する前に、Macの本番を必ず止める（2つのサーバーが同じデータを書かないように）
