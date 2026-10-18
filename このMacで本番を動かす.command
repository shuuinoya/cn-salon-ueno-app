#!/bin/bash
# このMacを本番サーバーとして動かす（Render が使えない間）
# ・Macの裏側（launchd）で動かします：この画面を閉じても止まりません。止まっても自動で起動し直し、
#   Macを再起動してもログインすると自動で始まります（Macは電源につなぎ、ふたを閉じないでください）
# ・止めるときは「このMacの本番を止める.command」をダブルクリック（Render に戻す前は必ず止める）
cd "$(dirname "$0")" || exit 1
DIR="$(pwd)"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
NODE="$(command -v node)"
LABEL="jp.cnsalon.production"
UIDN="$(id -u)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGDIR="$HOME/Library/Logs/cn-salon"
LOG="$LOGDIR/production.log"
mkdir -p "$HOME/Library/LaunchAgents" "$LOGDIR"
if [ -z "$NODE" ]; then echo "node が見つかりません。"; read -r -p "Enterキーで閉じます"; exit 1; fi

# 記録が大きくなったら、古い分を1つだけ残して新しくする
if [ -f "$LOG" ] && [ "$(stat -f%z "$LOG")" -gt 5000000 ]; then mv -f "$LOG" "$LOG.1"; fi

# 裏側で動いている本番の番号（動いていなければ空）
agent_pid() { launchctl print "gui/$UIDN/$LABEL" 2>/dev/null | awk '$1=="pid"{print $3; exit}'; }
AGENT_PID="$(agent_pid)"

# 以前のやり方（ターミナルの画面）で動いている本番があれば、先に止める（二重に動かさない）
others() { pgrep -f "tools/mac-production.js" | grep -vx "${AGENT_PID:-none}"; }
if [ -n "$(others)" ]; then
  echo "ターミナルの画面で動いていた本番を止めています（最後の保存をしてから止まります）…"
  for p in $(others); do kill -TERM "$p"; done
  for i in $(seq 1 25); do [ -z "$(others)" ] && break; sleep 1; done
fi
if [ -z "$AGENT_PID" ]; then
  for i in $(seq 1 15); do lsof -nP -iTCP:5600 -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 1; done
fi

# 裏側の仕組みの設定（どんな止まり方でも自動で起動し直す・ログインしたら自動で始まる）
OLD_PLIST="$(cat "$PLIST" 2>/dev/null)"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DIR/tools/mac-production.js</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>LANG</key><string>ja_JP.UTF-8</string>
    <key>CN_LAUNCHD</key><string>1</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF

if [ -n "$AGENT_PID" ] && [ "$OLD_PLIST" = "$(cat "$PLIST")" ]; then
  echo "本番はすでにMacの裏側で動いています。"
else
  [ -n "$AGENT_PID" ] && echo "裏側の設定を新しくして、起動し直します（10秒ほど止まります）…"
  # 登録を外す処理が終わるのを待ってから登録し直す（すぐ登録すると失敗することがある）
  launchctl bootout "gui/$UIDN/$LABEL" 2>/dev/null
  for i in $(seq 1 30); do launchctl print "gui/$UIDN/$LABEL" >/dev/null 2>&1 || break; sleep 1; done
  for i in 1 2 3 4 5; do
    launchctl bootstrap "gui/$UIDN" "$PLIST" 2>/dev/null && break
    launchctl print "gui/$UIDN/$LABEL" >/dev/null 2>&1 && break
    sleep 2
  done
  launchctl kickstart "gui/$UIDN/$LABEL" 2>/dev/null
  echo "本番を起動しています…"
  for i in $(seq 1 60); do curl -s -o /dev/null --max-time 2 http://127.0.0.1:5600/ && break; sleep 1; done
fi

URL="$(sed -n 's/^PUBLIC_URL=//p' tools/mac-production.env 2>/dev/null | tr -d '"' | head -1)"
[ -z "$URL" ] && URL="$(cat data/mac-production-url.txt 2>/dev/null)"
echo
if curl -s -o /dev/null --max-time 3 http://127.0.0.1:5600/; then
  echo "=============================================="
  echo " 本番はMacの裏側で動いています"
  echo " 予約サイト（お客様）: $URL"
  echo " 管理画面　　　　　　: $URL/cnsalon-board"
  echo " ・この画面は閉じても大丈夫です（本番は止まりません）"
  echo " ・止まっても自動で起動し直します。Macを再起動しても、ログインすると自動で始まります"
  echo " ・Macは電源につなぎ、ふたを閉じないでください"
  echo " ・止めるときは「このMacの本番を止める.command」"
  echo "=============================================="
else
  echo "起動できませんでした。記録: $LOG"
  tail -n 20 "$LOG" 2>/dev/null
fi
echo
read -r -p "Enterキーで閉じます（閉じても本番は止まりません）"
