// Render が使えない間、このMacを本番サーバーとして動かす（無料・カード登録なし）。
// ・予約サイトと管理画面（ログイン必須）を、Cloudflare の無料トンネルでインターネットに公開する
// ・予約データは本番と同じ GitHub の保存先から読み込み、変更もそこへ保存し続ける
//   （Render に戻すときは、このMacを止めてから Render を動かせば、そのまま引き継がれる）
// ・動かしている間はMacをスリープさせない（ふたを閉じる・電源を切ると止まります）
// ・サーバーが止まったら同じURLのまま自動で起動し直す。トンネルが切れたらつなぎ直す（URLは変わる）
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
const URL_FILE = path.join(ROOT, "data", "mac-production-url.txt");

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

let stopping = false;
let tunnel = null, srv = null, caf = null, publicUrl = "";
const restarts = []; // サーバーの自動再起動の記録（短時間に繰り返すときは止める）
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  console.log("\n止めています…（最後の保存をGitHubへ送ってから終了します）");
  for (const k of [caf, srv, tunnel]) { try { k && k.kill("SIGTERM"); } catch {} }
  setTimeout(() => process.exit(code || 0), 6000);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

function announce() {
  try { fs.mkdirSync(path.dirname(URL_FILE), { recursive: true }); fs.writeFileSync(URL_FILE, publicUrl + "\n"); } catch {}
  console.log("\n==============================================");
  console.log(" このMacで本番を動かしています（無料）");
  console.log(` 予約サイト（お客様）: ${publicUrl}`);
  console.log(` 管理画面　　　　　　: ${publicUrl}/cnsalon-board`);
  console.log(" ・この画面とMacは開いたまま（ふたを閉じない・電源につなぐ）にしてください");
  console.log(" ・止めるときは、この画面で Ctrl+C");
  console.log(" ・URLは起動するたびに変わります（data/mac-production-url.txt にも保存）");
  console.log("==============================================\n");
}

// 1) 無料トンネルを起動して、公開URL（https://〜.trycloudflare.com）を受け取る
function startTunnel() {
  console.log("インターネット公開の準備をしています（30秒ほど）…");
  let got = false;
  tunnel = spawn(CF, ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"], { stdio: ["ignore", "pipe", "pipe"] });
  const onData = (b) => {
    const m = String(b).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (!m || got) return;
    got = true;
    const changed = publicUrl && publicUrl !== m[0];
    publicUrl = m[0];
    if (changed) console.log("\n【お知らせ】インターネット公開がつなぎ直され、URLが変わりました。お客様に新しいURLを伝えてください。");
    // URLが変わったときは、メール内のリンクも新しいURLになるようサーバーを起動し直す
    if (srv) { srv.removeAllListeners("exit"); srv.once("exit", () => startServer(true)); srv.kill("SIGTERM"); }
    else startServer(true);
  };
  tunnel.stdout.on("data", onData);
  tunnel.stderr.on("data", onData);
  tunnel.on("exit", () => {
    if (stopping) return;
    console.log("（注意）インターネット公開が切れました。10秒後につなぎ直します（URLは変わります）");
    setTimeout(() => { if (!stopping) startTunnel(); }, 10000);
  });
  setTimeout(() => { if (!got && !stopping) { console.log("インターネット公開を開始できません。ネット接続を確認しています…"); try { tunnel.kill(); } catch {} } }, 90000);
}

// 2) 本番モードでサーバーを起動（データはGitHubの保存先から読み込み・保存）
function startServer(show) {
  const env = {
    ...process.env, ...fileEnv,
    CLOUD: "1", BIND: "127.0.0.1", PORT,
    PUBLIC_HOST: publicUrl.replace(/^https:\/\//, ""),
    DEMO_DATA: path.join(ROOT, "data", "mac-production-state.json"),
    DEMO_TUNNEL: "0",
  };
  srv = spawn(process.execPath, ["server.js"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  srv.stdout.on("data", (b) => process.stdout.write(String(b).replace(/^/gm, "  [サーバー] ")));
  srv.stderr.on("data", (b) => process.stderr.write(String(b).replace(/^/gm, "  [サーバー] ")));
  srv.on("exit", () => {
    if (stopping) return;
    const now = Date.now();
    restarts.push(now);
    while (restarts.length && now - restarts[0] > 5 * 60000) restarts.shift();
    if (restarts.length > 5) { console.log("（停止）サーバーが繰り返し止まるため、自動での起動をやめました。画面の表示を確認してください"); stopAll(1); return; }
    console.log("（注意）サーバーが止まりました。3秒後に同じURLのまま起動し直します");
    setTimeout(() => { if (!stopping) startServer(false); }, 3000);
  });
  // 3) 動かしている間はスリープさせない
  try { caf && caf.kill(); } catch {}
  caf = spawn("/usr/bin/caffeinate", ["-dims", "-w", String(srv.pid)], { stdio: "ignore" });
  if (show) setTimeout(announce, 4000);
}

startTunnel();
