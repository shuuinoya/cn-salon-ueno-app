// 永続化層（このシステムの「データベース」）。
// demo-api.js のメモリ上の状態（予約・顧客・シフト・回数券・設定・アカウント等）を
// ディスクへ安全に保存し、起動時に復元する。業務ロジックには一切関知しない。
//
// 設計方針：
// ・書き込みは「一時ファイルへ全書き→fsyncなしrename」の原子的置換（途中で電源が落ちても
//   直前の完全なファイルが必ず残る）。置換前の版は .bak として1世代保持（誤操作からの復旧用）
// ・読み込みで壊れたファイルを検出したら、.broken-<日時> に退避して初期データで起動
//   （システム全体を停止させない）。.bak が読めればそちらを使う
// ・保存は3秒ごとに内容が変わったときだけ（差分なしならディスクに触れない）
// ・Map / Set はタグ付きJSONで可逆に保存する
// ・ファイルは所有者のみ読み書き可（0600。顧客情報を含むため）
"use strict";

const fs = require("fs");
const path = require("path");

const TAG_MAP = "__pm_map__";
const TAG_SET = "__pm_set__";

function replacer(key, value) {
  if (value instanceof Map) return { [TAG_MAP]: [...value.entries()] };
  if (value instanceof Set) return { [TAG_SET]: [...value.values()] };
  return value;
}
function reviver(key, value) {
  if (value && typeof value === "object") {
    if (Array.isArray(value[TAG_MAP])) return new Map(value[TAG_MAP]);
    if (Array.isArray(value[TAG_SET])) return new Set(value[TAG_SET]);
  }
  return value;
}

// 保存の有効判定：
// ・本番（PORT未指定＝5520で起動）は常に保存する
// ・テスト・開発用に PORT を明示した起動は初期データで動く（本番データと混ざらない）
// ・DEMO_PERSIST=1 で強制ON、DEMO_EPHEMERAL=1 で強制OFF（環境の明示的な切り替え）
// クラウドホスティング上での実行か（Render / Fly.io / Railway、または CLOUD=1）
function isCloud() {
  return process.env.CLOUD === "1" || !!process.env.RENDER ||
    !!process.env.FLY_APP_NAME || !!process.env.RAILWAY_ENVIRONMENT;
}

function persistenceEnabled() {
  if (process.env.DEMO_EPHEMERAL === "1") return false;
  if (process.env.DEMO_PERSIST === "1") return true;
  if (isCloud()) return true; // 本番ホスティングでは常に保存（保存先はDEMO_DATAでボリュームへ）
  return !process.env.PORT || process.env.PORT === "5520";
}

function dataFile() {
  return process.env.DEMO_DATA || path.join(__dirname, "data", "state.json");
}

// 起動時の復元。成功時は {data, file}、保存無効・ファイルなしは {data: null}
function loadSnapshot() {
  if (!persistenceEnabled()) return { enabled: false, data: null };
  const file = dataFile();
  for (const candidate of [file, file + ".bak"]) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const data = JSON.parse(fs.readFileSync(candidate, "utf8"), reviver);
      if (!data || typeof data !== "object" || !data.state) throw new Error("形式が不正");
      if (candidate !== file) console.log("（データ復旧）バックアップ " + path.basename(candidate) + " から復元しました");
      return { enabled: true, data, file };
    } catch (e) {
      // 壊れたファイルは退避してシステムは止めない（あとで中身を調査できる）
      try {
        const broken = candidate + ".broken-" + new Date().toISOString().replace(/[:.]/g, "-");
        fs.renameSync(candidate, broken);
        console.log("（警告）保存データを読めませんでした。" + path.basename(broken) + " に退避し、次の候補で起動します: " + e.message);
      } catch {}
    }
  }
  return { enabled: true, data: null, file };
}

// ---- GitHubリモート保存（完全無料の永続化） ---------------------------------
// 無料ホスティング（Render無料枠など）はディスクが再起動で消えるため、
// GH_TOKEN と GH_REPO（例 "owner/repo"）を設定すると、保存データを
// GitHubの非公開リポジトリへも自動同期する。起動時はローカルとGitHubの
// 新しい方（savedAt比較）を採用する。トークンはログに出さない。
const GH = {
  api: () => process.env.GH_API || "https://api.github.com",
  repo: () => process.env.GH_REPO || "",
  path: () => process.env.GH_PATH || "salon-data/state.json",
  branch: () => process.env.GH_BRANCH || "main",
  token: () => process.env.GH_TOKEN || "",
  enabled: () => !!(process.env.GH_TOKEN && process.env.GH_REPO),
};
const ghHeaders = () => ({
  "Authorization": "Bearer " + GH.token(),
  "User-Agent": "cn-salon-persist",
  "X-GitHub-Api-Version": "2022-11-28",
});
const ghUrl = () => `${GH.api()}/repos/${GH.repo()}/contents/${GH.path()}`;

// GitHub上の現在のsha（ファイル未作成ならnull）
async function ghSha() {
  const r = await fetch(`${ghUrl()}?ref=${GH.branch()}`, {
    headers: { ...ghHeaders(), Accept: "application/vnd.github.object+json" },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("GitHub参照に失敗: HTTP " + r.status);
  return (await r.json()).sha || null;
}
// GitHub上の保存データ本文（未作成ならnull）
async function ghFetch() {
  const r = await fetch(`${ghUrl()}?ref=${GH.branch()}`, {
    headers: { ...ghHeaders(), Accept: "application/vnd.github.raw" },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("GitHub取得に失敗: HTTP " + r.status);
  return await r.text();
}
// GitHubへ保存（sha競合は一度だけ取り直して再試行）
async function ghPut(json, sha, retry = true) {
  const r = await fetch(ghUrl(), {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "予約データ自動保存 " + new Date().toISOString(),
      content: Buffer.from(json).toString("base64"),
      branch: GH.branch(),
      ...(sha ? { sha } : {}),
    }),
  });
  if ((r.status === 409 || r.status === 422) && retry) {
    return ghPut(json, await ghSha(), false);
  }
  if (!r.ok) throw new Error("GitHub保存に失敗: HTTP " + r.status);
  return (await r.json()).content?.sha || null;
}

// 起動時：GitHub側とローカルの新しい方を返す（リモート無効ならローカルのみ）
async function loadSnapshotWithRemote() {
  const local = loadSnapshot();
  if (!local.enabled || !GH.enabled()) return local;
  try {
    const text = await ghFetch();
    if (text) {
      const remote = JSON.parse(text, reviver);
      if (remote && remote.state &&
        (!local.data || (remote.savedAt || 0) >= (local.data.savedAt || 0))) {
        console.log("GitHubから保存データを復元しました（" + GH.repo() + "）");
        return { ...local, data: remote };
      }
    } else {
      console.log("GitHub保存は有効です（初回保存でファイルが作られます）: " + GH.repo());
    }
  } catch (e) {
    console.log("（警告）GitHubからの復元に失敗（ローカルの保存データで起動します）: " + e.message);
  }
  return local;
}

// 二重起動を検知して終了する場合など、「このプロセスは所有者ではない」と
// 分かったときに呼ぶ。以後この プロセスからは一切保存しない
// （終了時フックが古いスナップショットで本物のデータを上書きするのを防ぐ）
let savesAborted = false;
function abortSaves() { savesAborted = true; }

// 定期保存を開始する。getSnapshot() が返すオブジェクトを丸ごと保存する。
function startSaver(getSnapshot) {
  if (!persistenceEnabled()) return () => {};
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let lastWritten = "";
  let lastBody = null; // 保存時刻（savedAt）を除いた中身。中身が変わったときだけ書く
  try { lastWritten = fs.readFileSync(file, "utf8"); } catch {}

  const saveNow = () => {
    if (savesAborted) return;
    let json, body;
    try {
      const { savedAt, ...rest } = getSnapshot();
      body = JSON.stringify(rest, replacer);
      // 変化なし＝ディスクに触れない（保存時刻だけが違う場合も書かない。GitHubへの同期も起きない）
      if (body === lastBody) return;
      json = body === "{}" ? JSON.stringify({ savedAt }) : '{"savedAt":' + JSON.stringify(savedAt) + "," + body.slice(1);
    } catch (e) {
      console.log("（警告）保存データの作成に失敗: " + e.message);
      return;
    }
    if (json === lastWritten) { lastBody = body; return; }
    try {
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, json, { mode: 0o600 });
      try { if (fs.existsSync(file)) fs.copyFileSync(file, file + ".bak"); } catch {}
      fs.renameSync(tmp, file); // 原子的置換
      try { fs.chmodSync(file, 0o600); } catch {}
      lastWritten = json;
      lastBody = body;
    } catch (e) {
      console.log("（警告）データ保存に失敗（次回の保存で再試行します）: " + e.message);
    }
  };

  // GitHubへの同期（有効時のみ）。30秒間隔で変化があれば送る。多重送信は防ぐ
  let ghLastPushed = "";
  let ghKnownSha; // undefined=未取得, null=リモート未作成
  let ghBusy = false;
  const ghPush = async () => {
    if (!GH.enabled() || savesAborted || ghBusy) return;
    const json = lastWritten;
    if (!json || json === ghLastPushed) return;
    ghBusy = true;
    try {
      if (ghKnownSha === undefined) ghKnownSha = await ghSha();
      ghKnownSha = await ghPut(json, ghKnownSha);
      ghLastPushed = json;
    } catch (e) {
      console.log("（警告）GitHubへの保存に失敗（次回再試行します）: " + e.message);
      ghKnownSha = undefined; // 次回shaを取り直す
    } finally {
      ghBusy = false;
    }
  };
  if (GH.enabled()) {
    const ghTimer = setInterval(ghPush, 30000);
    ghTimer.unref?.();
  }

  const timer = setInterval(saveNow, 3000);
  timer.unref?.(); // 保存タイマーだけでプロセスを生かし続けない
  // 正常終了・停止シグナル時は即時保存してから終わる
  process.on("exit", saveNow);
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      saveNow();
      if (GH.enabled() && lastWritten !== ghLastPushed) {
        // 停止前にGitHubへ送りきる（無料ホスティングのスリープ・再デプロイ対策。
        // 猶予内に終わるよう最大4秒だけ待つ）
        let done = false;
        ghPush().then(() => { done = true; process.exit(0); });
        setTimeout(() => { if (!done) process.exit(0); }, 4000);
      } else {
        process.exit(0);
      }
    });
  }
  return saveNow;
}

module.exports = {
  persistenceEnabled, loadSnapshot, loadSnapshotWithRemote, startSaver,
  dataFile, abortSaves, isCloud, remoteEnabled: GH.enabled,
};
