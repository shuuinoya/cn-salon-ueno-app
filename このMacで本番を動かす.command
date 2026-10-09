#!/bin/bash
# Render が使えない間、このMacを本番サーバーとして動かす（ダブルクリックで起動・止めるときは Ctrl+C）
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
node tools/mac-production.js
echo
read -p "Enterキーで閉じます"
