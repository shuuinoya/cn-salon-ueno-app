#!/bin/bash
# このMacで動かしている本番を止める（Render に戻す前は必ず止める）
# 止めたあとは、Macにログインしても自動では始まりません。もう一度動かすときは「このMacで本番を動かす.command」
LABEL="jp.cnsalon.production"
UIDN="$(id -u)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
echo "本番を止めています（最後の保存をしてから止まります。30秒ほど）…"
launchctl bootout "gui/$UIDN/$LABEL" 2>/dev/null
for i in $(seq 1 30); do launchctl print "gui/$UIDN/$LABEL" >/dev/null 2>&1 || break; sleep 1; done
rm -f "$PLIST"
# ターミナルの画面で動かしていた場合も止める
for p in $(pgrep -f "tools/mac-production.js"); do kill -TERM "$p"; done
for i in $(seq 1 30); do
  pgrep -f "tools/mac-production.js" >/dev/null || lsof -nP -iTCP:5600 -sTCP:LISTEN >/dev/null 2>&1 || break
  sleep 1
done
echo
if lsof -nP -iTCP:5600 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "まだ止まっていません。少し待ってから、もう一度ダブルクリックしてください。"
else
  echo "本番を止めました。予約サイトと管理画面は、もう一度動かすまで開けません。"
  echo "もう一度動かすときは「このMacで本番を動かす.command」をダブルクリック。"
fi
echo
read -r -p "Enterキーで閉じます"
