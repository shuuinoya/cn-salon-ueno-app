// Render が使えない間、このMacを本番サーバーとして動かす（無料・カード登録なし）。
// ・予約サイトと管理画面（ログイン必須）を、Cloudflare の無料トンネルでインターネットに公開する
// ・予約データは本番と同じ GitHub の保存先から読み込み、変更もそこへ保存し続ける
//   （Render に戻すときは、このMacを止めてから Render を動かせば、そのまま引き継がれる）
// ・動かしている間はMacをスリープさせない（ふたを閉じる・電源を切ると止まります）
// 使い方：「このMacで本番を動かす.command」をダブルクリック（止めるときはその画面で Ctrl+C）
// 必要：tools/mac-production.env に GH_TOKEN と GH_REPO（Render の Environment と同じ値）
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENV_FILE = path.join(__dirname, "mac-production.env");
const CF = path.join(__dirname, "bin", "cloudflared");
const PORT = process.env.MAC_PROD_PORT || "5600";

function readEnvFile() {
  const env = {};
  try {
    for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return env;
}

const fileEnv = readEnvFile();
if (!fileEnv.GH_TOKEN || !fileEnv.GH_REPO) {
  console.log("\n【まだ起動できません】tools/mac-production.env に、次の2行を書いてください（Render の Environment と同じ値）:");
  console.log("  GH_TOKEN=github_pat_…");
  console.log("  GH_REPO=ユーザー名/リポジトリ名\n");
  process.exit(1);
}
if (!fs.existsSync(CF)) {
  console.log("tools/bin/cloudflared が見つかりません（インターネット公開に必要です）");
  process.exit(1);
}

const kids = [];
let stopping = false;
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  console.log("\n止めています…（最後の保存をGitHubへ送ってから終了します）");
  for (const k of kids.slice().reverse()) { try { k.kill("SIGTERM"); } catch {} }
  setTimeout(() => process.exit(code || 0), 6000);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

// 1) 無料トンネルを起動して、公開URL（https://〜.trycloudflare.com）を受け取る
console.log("インターネット公開の準備をしています（30秒ほど）…");
const tunnel = spawn(CF, ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"], { stdio: ["ignore", "pipe", "pipe"] });
kids.push(tunnel);
let started = false;
const onTunnel = (b) => {
  const m = String(b).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!m || started) return;
  started = true;
  startServer(m[0]);
};
tunnel.stdout.on("data", onTunnel);
tunnel.stderr.on("data", onTunnel);
tunnel.on("exit", () => { if (!stopping) { console.log("（停止）インターネット公開が切れました。もう一度ダブルクリックで起動してください（URLは変わります）"); stopAll(1); } });
setTimeout(() => { if (!started) { console.log("インターネット公開を開始できませんでした。ネット接続を確認して、もう一度起動してください"); stopAll(1); } }, 90000);

// 2) 本番モードでサーバーを起動（データはGitHubの保存先から読み込み・保存）
function startServer(publicUrl) {
  const host = publicUrl.replace(/^https:\/\//, "");
  const env = {
    ...process.env, ...fileEnv,
    CLOUD: "1", BIND: "127.0.0.1", PORT,
    PUBLIC_HOST: host,
    DEMO_DATA: path.join(ROOT, "data", "mac-production-state.json"),
    DEMO_TUNNEL: "0",
  };
  const srv = spawn(process.execPath, ["server.js"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  kids.push(srv);
  srv.stdout.on("data", (b) => process.stdout.write(String(b).replace(/^/gm, "  [サーバー] ")));
  srv.stderr.on("data", (b) => process.stderr.write(String(b).replace(/^/gm, "  [サーバー] ")));
  srv.on("exit", () => { if (!stopping) { console.log("（停止）サーバーが止まりました"); stopAll(1); } });
  // 3) 動かしている間はスリープさせない
  const caf = spawn("/usr/bin/caffeinate", ["-dims", "-w", String(srv.pid)], { stdio: "ignore" });
  kids.unshift(caf);
  try { fs.mkdirSync(path.join(ROOT, "data"), { recursive: true }); fs.writeFileSync(path.join(ROOT, "data", "mac-production-url.txt"), publicUrl + "\n"); } catch {}
  setTimeout(() => {
    console.log("\n==============================================");
    console.log(" このMacで本番を動かしています（無料）");
    console.log(` 予約サイト（お客様）: ${publicUrl}`);
    console.log(` 管理画面　　　　　　: ${publicUrl}/cnsalon-board`);
    console.log(" ・この画面とMacは開いたまま（ふたを閉じない・電源につなぐ）にしてください");
    console.log(" ・止めるときは、この画面で Ctrl+C");
    console.log(" ・URLは起動するたびに変わります（data/mac-production-url.txt にも保存）");
    console.log("==============================================\n");
  }, 4000);
}
