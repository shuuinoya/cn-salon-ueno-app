// 管理画面（操作デモ）用のモックAPIです。
// 元サイトの /api/demo/schedule 相当を、保存版のためにメモリ上の架空データで再現します。
// サーバーを再起動するとデータは初期状態に戻ります。
"use strict";

const fs = require("fs");
const path = require("path");
const net = require("net");
const tls = require("tls");

// ---- 管理画面ログイン（アカウント・権限・セッション） ---------------------
// ・パスワードは平文で保持せずハッシュで照合する
// ・ログインごとに端末別のセッションを発行（複数端末から同時利用できる）
// ・権限は admin > manager > staff の3段階。すべての管理APIはサーバー側で
//   ログインと権限を検証する（URLを知っているだけでは何も見えない・できない）
const crypto = require("crypto");
// 本番ホスティング（常時HTTPS）ではCookieにSecureを付け、暗号化された通信でしか送らない
const IS_CLOUD = require("./persist").isCloud();
const COOKIE_FLAGS = "Path=/; HttpOnly; SameSite=Lax" + (IS_CLOUD ? "; Secure" : "");
const hashPass = (p) => crypto.createHash("sha256").update(String(p)).digest("hex");
const ADMIN_ID = "CN-HB@2555";
const LEGACY_ADMIN_ID = "kudaka1228"; // 旧ID（保存済みデータから起動時に新IDへ自動移行）
// 初期管理者のパスワードハッシュ。本番ホスティングでは環境変数 ADMIN_PASS_HASH で
// 必ず上書きする（コードを公開リポジトリに置いても、本番のパスワードは漏れない）
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH ||
  "c31e781fabb283207c02713244bde0eb5c3290f4d00fc6797630f9aa2a1d9b78";
const SESSION_MAX_AGE = 7 * 86400000; // セッション有効期間（7日）
const adminSessions = new Map(); // token -> { user, created }（メモリ上のみ）
const ROLE_LV = { staff: 1, manager: 2, admin: 3 };
const ROLE_LABEL = { admin: "管理者", manager: "マネージャー", staff: "スタッフ" };

function sessionTokenOf(req) {
  const m = /(?:^|;\s*)pm_session=([a-f0-9]+)/.exec(req.headers.cookie || "");
  return m ? m[1] : "";
}
// ログイン済みかつ有効なアカウントのときだけ、そのアカウントを返す
// （停止・削除・権限変更は既存セッションにも即時反映される）
function sessionAccount(req) {
  const token = sessionTokenOf(req);
  const s = adminSessions.get(token);
  if (!s) return null;
  if (Date.now() - s.created > SESSION_MAX_AGE) { adminSessions.delete(token); return null; }
  const acc = state.accounts.get(s.user);
  return acc && acc.active ? acc : null;
}
function isAdminSession(req) {
  return !!sessionAccount(req);
}
function roleAtLeast(req, role) {
  const a = sessionAccount(req);
  return !!a && ROLE_LV[a.role] >= (ROLE_LV[role] || 99);
}
function denyApi(req, res) {
  const code = isAdminSession(req) ? 403 : 401;
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: code === 401 ? "loginRequired" : "forbidden" }));
}
function clearSession(req, res) {
  adminSessions.delete(sessionTokenOf(req));
  res.setHeader("Set-Cookie", "pm_session=; " + COOKIE_FLAGS + "; Max-Age=0");
}
// 認証イベントの記録（パスワード等の機密は残さない）
// ---- 予約サイトの会員（お客様）セッション ----
// Cookie cn_member（HttpOnly）でログイン状態を保持。会員本人の予約・回数券だけを返す
const MEMBER_SESSION_MAX_AGE = 90 * 86400000; // 90日
const MEMBER_COOKIE_FLAGS = COOKIE_FLAGS + "; Max-Age=" + Math.floor(MEMBER_SESSION_MAX_AGE / 1000);
const normEmail = (v) => String(v || "").replace(/＠/g, "@").replace(/　/g, " ").trim().toLowerCase().slice(0, 254);
function memberTokenOf(req) {
  const m = /(?:^|;\s*)cn_member=([a-f0-9]+)/.exec(req.headers.cookie || "");
  return m ? m[1] : "";
}
function memberOf(req) {
  const token = memberTokenOf(req);
  if (!token) return null;
  const s = state.memberSessions.get(token);
  if (!s) return null;
  if (Date.now() - s.created > MEMBER_SESSION_MAX_AGE) { state.memberSessions.delete(token); return null; }
  return state.members.get(s.email) || null;
}
function memberPublic(m) {
  return { email: m.email, name: m.name || "", phone: m.phone || "", createdAt: m.createdAt };
}
// 会員に予約・回数券を紐付ける（本人のものだけ。重複なし）
function memberAttachBooking(m, bk) {
  if (!m || !bk) return;
  bk.member_email = m.email;
  if (!m.bookings.includes(bk.id)) m.bookings.push(bk.id);
  if (!m.name && bk.name) m.name = bk.name;
  if (!m.phone && bk.phone) m.phone = bk.phone;
}
function memberAttachTicket(m, t) {
  if (!m || !t) return;
  t.member_email = m.email;
  if (!m.tickets.includes(t.id)) m.tickets.push(t.id);
}
function findBooking(id) {
  const date = state.bookingIndex.get(String(id || ""));
  if (!date) return null;
  const bk = ensureEvents(date).bookings.find((x) => x.id === id);
  return bk ? { bk, date } : null;
}
// JSONボディを読む共通処理（サイズ上限つき）
function readJson(req, res, limit, fn) {
  let raw = "";
  req.on("data", (c) => { raw += c; if (raw.length > limit) req.destroy(); });
  req.on("end", () => {
    let b = {};
    try { b = JSON.parse(raw || "{}"); } catch {}
    try {
      fn(b);
    } catch (e) {
      res.writeHead(e.status || 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.status ? e.message : "unavailable" }));
    }
  });
}

function authLogPush(entry) {
  state.authLog.push({ at: Date.now(), ...entry });
  if (state.authLog.length > 200) state.authLog.splice(0, state.authLog.length - 200);
}

// ---- リアルタイム配信（SSE） -----------------------------------------------
// 予約・シフト・受付停止などの変更（＝日付versionの更新）が「DBに保存された後」に、
// ログイン中の管理画面へ push 通知する。通知は「変わった」という合図だけで、
// 中身は受信側が必ずサーバーの最新データを取り直す（DB＝Single Source of Truth。
// 同じ通知が複数回届いても再取得するだけなので冪等）。
// 接続が切れてもEventSourceが自動再接続し、再接続時に受信側が再同期する。
let sseSeq = 0;
const sseClients = new Set(); // 認証済み管理画面の接続（res オブジェクト）
function sseTouch() {
  sseSeq++;
  for (const res of sseClients) {
    try { res.write(`data: ${sseSeq}\n\n`); } catch { sseClients.delete(res); }
  }
}
const sseKeepAlive = setInterval(() => {
  for (const res of sseClients) {
    try { res.write(":ka\n\n"); } catch { sseClients.delete(res); }
  }
}, 20000);
sseKeepAlive.unref?.();

// ---- 実送信の設定（任意） -------------------------------------------------
// プロジェクト直下に mail-config.json（mail-config.example.json 参照）を置くと、
// allowTo に書いた宛先にだけ、SMTP（例：Gmailのアプリパスワード）で実際に送信する。
// それ以外の宛先は従来どおりデモ内シミュレーションのみ（外部に出ない）。
function loadMailConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(__dirname, "mail-config.json"), "utf8"));
    if (c && c.enabled && c.host && c.user && Array.isArray(c.allowTo)) return c;
  } catch {}
  return null;
}
const realSendAllowed = (to) => {
  const c = loadMailConfig();
  return c && c.allowTo.includes(to) ? c : null;
};

// 最小限のSMTPクライアント（依存パッケージなし）。
// port 465=SSL／587=STARTTLS／secure:"none"はローカル検証用の平文。
function smtpSend(cfg, mail, done) {
  const CRLF = "\r\n";
  const b64 = (t) => Buffer.from(t, "utf8").toString("base64");
  const enc = (t) => "=?UTF-8?B?" + b64(t) + "?=";
  const wrap = (t) => t.replace(/(.{76})/g, "$1" + CRLF);
  const from = cfg.from || cfg.user;
  const boundary = "cnb-" + Math.random().toString(16).slice(2);
  const data = [
    `From: ${enc("Ueno spa&massage CN Health & Beauty SALON")} <${from}>`,
    `To: <${mail.to}>`,
    `Subject: ${enc(mail.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(16).slice(2)}@cn-salon-demo>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap(b64(mail.body)),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap(b64(mail.html || mail.body)),
    `--${boundary}--`,
    "",
  ].join(CRLF).replace(/\n\./g, "\n..");

  let finished = false;
  const finish = (err) => { if (!finished) { finished = true; try { sock.destroy(); } catch {} done(err || null); } };
  const timer = setTimeout(() => finish(new Error("送信がタイムアウトしました")), 20000);

  let sock;
  let buf = "";
  let steps;
  const send = (line) => sock.write(line + CRLF);
  const onReply = (code, text) => {
    const step = steps.shift();
    if (!step) return;
    if (!step.ok.includes(code)) { clearTimeout(timer); return finish(new Error(`SMTP ${code} ${text.trim().slice(0, 120)}`)); }
    if (step.run) step.run();
    if (!steps.length) { clearTimeout(timer); finish(null); }
  };
  const feed = (chunk) => {
    buf += chunk.toString("utf8");
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i + 1);
      buf = buf.slice(i + 1);
      // 250-xxx のような継続行は読み飛ばし、最終行（250 xxx）で応答とみなす
      if (/^\d{3}-/.test(line)) continue;
      const code = Number(line.slice(0, 3));
      if (code) onReply(code, line.slice(3));
    }
  };
  const baseSteps = () => [
    { ok: [250], run: () => send("AUTH LOGIN") },
    { ok: [334], run: () => send(b64(cfg.user)) },
    { ok: [334], run: () => send(b64(cfg.pass || "")) },
    { ok: [235], run: () => send(`MAIL FROM:<${from}>`) },
    { ok: [250], run: () => send(`RCPT TO:<${mail.to}>`) },
    { ok: [250, 251], run: () => send("DATA") },
    { ok: [354], run: () => sock.write(data + "." + CRLF) },
    { ok: [250], run: () => send("QUIT") },
    { ok: [221] },
  ];
  try {
    if (Number(cfg.port) === 587) {
      // STARTTLS：平文で接続してからTLSへ切り替える
      sock = net.connect(587, cfg.host);
      steps = [
        { ok: [220], run: () => send("EHLO cn-salon-demo") },
        { ok: [250], run: () => send("STARTTLS") },
        { ok: [220], run: () => {
          sock.removeAllListeners("data");
          sock = tls.connect({ socket: sock, servername: cfg.host }, () => send("EHLO cn-salon-demo"));
          sock.on("data", feed);
          sock.on("error", (e) => finish(e));
          steps = baseSteps();
        } },
      ];
    } else if (cfg.secure === "none") {
      sock = net.connect(Number(cfg.port) || 25, cfg.host);
      steps = [{ ok: [220], run: () => send("EHLO cn-salon-demo") }, ...baseSteps()];
    } else {
      sock = tls.connect({ host: cfg.host, port: Number(cfg.port) || 465, servername: cfg.host });
      steps = [{ ok: [220], run: () => send("EHLO cn-salon-demo") }, ...baseSteps()];
    }
    sock.on("data", feed);
    sock.on("error", (e) => { clearTimeout(timer); finish(e); });
  } catch (e) {
    clearTimeout(timer);
    finish(e);
  }
}

// ---- 架空データの素材 -------------------------------------------------

const COURSE_SEED = {
  "364321-4822671": { name: "【本日限定】全身整体60分＋足裏マッサージ 60分 通常料金13200円→12000円", price: 12000, minutes: 120 },
  "364321-4822710": { name: "今月限定キャンペーン：男性スタッフオイルマッサージ 120分20500円→18500円", price: 18500, minutes: 120 },
  "364321-4822711": { name: "今月限定キャンペーン：女性スタッフオイルマッサージ 120分20500円→18500円", price: 18500, minutes: 120 },
  "364326-4893798": { name: "【★女性スタッフ】足裏マッサージ30分＋オイルマッサージ90分　120分", price: 20500, minutes: 120 },
  "364326-4893799": { name: "【★男性スタッフ】足裏マッサージ30分＋オイルマッサージ90分　120分", price: 20500, minutes: 120 },
  "364326-4822708": { name: "【男性スタッフ】オイルリンパマッサージ 60分", price: 11500, minutes: 60 },
  "364326-4823112": { name: "【女性スタッフ】オイルリンパマッサージ 60分", price: 11500, minutes: 60 },
  "364326-4822709": { name: "【男性スタッフ】オイルリンパマッサージ 90分", price: 16500, minutes: 90 },
  "364326-4823113": { name: "【女性スタッフ】オイルリンパマッサージ 90分", price: 16500, minutes: 90 },
  "364326-4823102": { name: "【人気No.1★男性スタッフ】極上の癒し☆オイルリンパマッサージ120分", price: 20500, minutes: 120 },
  "364326-4823114": { name: "【人気No.1★女性スタッフ】極上の癒し☆オイルリンパマッサージ120分", price: 20500, minutes: 120 },
  "364326-4827938": { name: "オススメ【男性スタッフ】腸もみオイルリンパマッサージ 120分", price: 23500, minutes: 120 },
  "364326-4827940": { name: "オススメ【女性スタッフ】腸もみオイルリンパマッサージ 120分", price: 23500, minutes: 120 },
  "364326-4822715": { name: "ハイパーナイフ6【ボディ＆フェイス】オイルマッサージと組み合わせが最適", price: 4000, minutes: 20 },
  "364326-4921051": { name: "出張マッサージ（120分）25,500円 施術内容はご要望に応じて自由にカスタマイズできます。", price: 25500, minutes: 120 },
  "364328-4822716": { name: "フェイシャル 60分 自然で明るい“本来の笑顔”を引き出し", price: 9900, minutes: 60 },
  "364323-4822706": { name: "タイ古式マッサージ", price: 8800, minutes: 60 },
  "364323-4822664": { name: "【当店人気メニュー】首肩コリ、頭痛な方にオススメ ヘッドスパ 60分", price: 7700, minutes: 60 },
  "364323-4822701": { name: "全身整体 60分", price: 6600, minutes: 60 },
  "364325-4822707": { name: "矯正整体(骨盤、姿勢、O脚) 60分", price: 7700, minutes: 60 },
  "364324-4822705": { name: "小顔矯正 60分", price: 9900, minutes: 60 },
  "364327-4822712": { name: "フットマッサージ(足湯＋足裏～ふくらぎ) 60分", price: 6600, minutes: 60 },
  "364329-4822717": { name: "ハイパーナイフ6【ボディ】腹、背、腕、脚など 選べる1部位10分＋マッサージ10分", price: 4000, minutes: 20 },
  "364331-4822719": { name: "シャワールーム 30分", price: 1000, minutes: 30 },
  "364331-4822720": { name: "レンタルルーム 60分　2500円", price: 2500, minutes: 60 },
};
// メニューは管理画面（メニュー一覧）から追加・変更・削除できる可変データにする
const courseStore = new Map(Object.entries(COURSE_SEED).map(([id, c]) => [id, { id, ...c }]));
let courseSerial = 0;
const getCourse = (id) => courseStore.get(id);
// メニューごとの写真（courseId -> dataURL）。一覧のJSONを重くしないため本体とは別持ち
const coursePhotos = new Map();
// 予約サイトのメニュー紹介ページで使われている写真を、最初から各メニューに登録しておく
// （管理画面のメニュー一覧で差し替え・削除も可能。再起動でこの初期状態に戻る）
const COURSE_PHOTO_SEED = {
  "364321-4822671": "co_06e67b46d3ce954a4d8dc36207c61a7d1a1fb35d.JPG.webp",
  "364321-4822710": "co_a74d2bc36297e5cb9eb15180da28345378207251.JPG.webp",
  "364321-4822711": "co_06217b76974b6bdded5a8fe44b63f8c3ab646c96.jpg.webp",
  "364323-4822664": "co_3a14adae2ff37f6ab6a14bfddc89c9311ee6e605.JPG.webp",
  "364323-4822701": "co_51cc59c3c915986a78795844621d746e1f329666.jpg.webp",
  "364323-4822706": "co_ceebf960b190ec533515cec27fd2f7a8247f4b37.JPG.webp",
  "364324-4822705": "co_cf9cd7918cd6fb4ee30dc91e08013e9821d006d5.jpg.webp",
  "364325-4822707": "co_d6ab84884dadb8f162a6b5f572f1c17b796e0eef.jpg.webp",
  "364326-4822708": "co_e642a1c14377c793df787ea8830b68c4214d4531.jpeg.webp",
  "364326-4822709": "co_bbc653114e6da85d2313e833f3a7830202e77538.jpeg.webp",
  "364326-4822715": "co_eba185c1a22b41c51c9d21c9c223da5b20a095cf.jpg.webp",
  "364326-4823102": "co_0ffde62977e033fd0f9feebd8f30a37d443b2c51.jpeg.webp",
  "364326-4823112": "co_8206f0066a0a719e77fc63ae0d23e907e5b9c104.jpg.webp",
  "364326-4823113": "co_0c89587fa824181955a2da25f17050624e275129.jpg.webp",
  "364326-4823114": "co_e08179d3135ec19c1f080bb293595f4dbffdb6fe.jpg.webp",
  "364326-4827938": "co_9e2d7b09e6aa77b221c33003599660814646022c.jpg.webp",
  "364326-4827940": "co_0fa9b6dff6bf3535eb38fbde0d64474b0748dcaf.jpg.webp",
  "364326-4893798": "co_d42336c850d6fd24fe2813c85d2b7177e7a29dbf.jpg.webp",
  "364326-4893799": "co_7b32647f0e1e58b16538443f2d793f33cf9165be.jpeg.webp",
  "364326-4921051": "co_8291d710e6f05d625221368ca3bacceb40c82347.jpeg.webp",
  "364327-4822712": "co_0e3942217b433036def69b4f61decec77f6176e1.jpg.webp",
  "364328-4822716": "co_c1f2a8962aec3e0d579594af06c63c4c4d5042d1.jpg.webp",
  "364329-4822717": "co_1a373c99b2752a99c6a55d8f822aea23bc7656f1.jpg.webp",
  "364331-4822719": "co_02e92026b759f1d520ce2fc6470bc62d167594e0.JPG.webp",
  "364331-4822720": "co_590b185f4e5dae65c06a8e30841f58072f96fb5b.jpg.webp",
};
try {
  for (const [cid, name] of Object.entries(COURSE_PHOTO_SEED)) {
    const file = path.join(__dirname, "public", "images", name);
    if (fs.existsSync(file)) {
      coursePhotos.set(cid, "data:image/webp;base64," + fs.readFileSync(file).toString("base64"));
    }
  }
} catch { /* 写真が読めなくてもメニュー自体の動作には影響させない */ }
const courseListJson = () =>
  [...courseStore.values()].map((c) => ({ ...c, hasPhoto: coursePhotos.has(c.id) }));

const STAFF_SEED = [
  { id: "10000012-0000-4000-8000-000000000012", name: "杉田 祐哉", gender: "male", message: "" },
  { id: "10000001-0000-4000-8000-000000000001", name: "豊", gender: "male", message: "はじめまして。\n小顔矯正とオイルマッサージを得意としており、講師レベルの技術とお客様から評価をいただくこともあります。\n\n小顔矯正では、お顔のバランスや筋肉の状態を見ながら丁寧に調整し、施術前後の変化をすぐに実感していただける即効性を大切にしています。フェイスラインの引き締まりや左右バランスの改善を感じていただくお客様が多いです。\n\nオイルマッサージでは、筋肉の深い部分までしっかりアプローチしながら、リラックスと疲労回復の両方を感じていただける施術を心がけています。\n\n技術・接客ともに常に高いレベルを目指し、どのお客様にもご満足いただける施術を大切にしています。\nお身体やお顔のお悩みは、ぜひ安心してお任せください。心を込めて施術いたします。" },
  { id: "10000002-0000-4000-8000-000000000002", name: "中山 優吾", gender: "male", message: "はじめまして。\n体格を活かしたパワーのある施術と、足裏マッサージ・オイルマッサージが得意です。\n\n足裏には全身につながる反射区があり、丁寧に刺激していくことで、脚の疲れやむくみ、全身のだるさをスッキリさせていきます。長時間歩いた後や立ち仕事の方にもとてもおすすめです。\n\nまた、オイルマッサージでは深いコリまでしっかりアプローチしながら、筋肉をゆっくりほぐしていく施術を心がけています。しっかり効かせる施術からリラックス重視まで、お客様のお好みに合わせて細かく調整いたします。\n\n「体が軽くなった」「足がすごく楽になった」と感じていただけるよう、毎回心を込めて施術します。\nお疲れの際は、ぜひお気軽にお任せください。" },
  { id: "10000004-0000-4000-8000-000000000004", name: "平良 陽太", gender: "male", message: "※注意　指名料500円→2500円\nはじめまして。\nオイルマッサージを得意としており、「驚くほど上手い」とお客様からお声をいただくことも多いです。\n\n筋肉質な体格を活かし、しっかりとした圧で深いコリまで丁寧にほぐしていきます。力強さの中にもリズムと心地よさを大切にした施術で、全身が軽くなるような感覚を目指しています。\n\nまた、英語での対応も可能ですので、海外からのお客様にも安心してご利用いただいています。\nお客様一人ひとりに合わせた丁寧な接客と、気持ちの良いサービスを心がけています。\n\n「またお願いしたい」と思っていただけるよう、心を込めて施術いたします。\nオイルマッサージがお好きな方は、ぜひ一度お任せください。" },
  { id: "10000005-0000-4000-8000-000000000005", name: "山田 恵", gender: "female", message: "私は、お客様がふっと肩の力を抜いて、心からリラックスできる「穏やかで優しい時間」を提供することを大切にしています。お体のお悩みはもちろん、その日の気分や細かなご要望にも丁寧に耳を傾け、手のひらから伝わる温もりで、日々の疲れを一つひとつ丁寧に解きほぐしていきます。\n\nまた、海外からお越しのお客様にも安心してお過ごしいただけるよう、英語でのカウンセリングやコミュニケーションにも対応しております。「言葉の壁」を感じることなく、最高のリラクゼーションを体感していただけるよう努めています。\n\n◆ 得意な施術\n\n足裏マッサージ： 「第二の心臓」と呼ばれる足裏を丁寧に刺激し、全身の血行を促進します。長旅や立ち仕事でパンパンに張ってしまった脚も、驚くほど軽やかに整えます。\n\nタイ古式マッサージ： 優しいリズムのストレッチで、普段使わない筋肉をゆっくりと伸ばします。無理な負荷をかけず、呼吸に合わせた丁寧なアプローチで、体本来の柔軟性を取り戻します。\n\n◆ お客様へ（Message to Our Guests）\n忙しい日常の中で、自分のための時間を作ることはとても大切です。\n「痛いのは苦手だけど、しっかり解されたい」「リラックスしてぐっすり眠りたい」といったご希望も、遠慮なくお聞かせください。" },
  { id: "10000014-0000-4000-8000-000000000014", name: "小倉 有美子", gender: "female", message: "はじめまして。丁寧なカウンセリングとオイルリンパマッサージが得意です。お身体の状態に合わせて、リラックスしていただける施術を心がけています。" },
  { id: "10000015-0000-4000-8000-000000000015", name: "武良 翔平", gender: "male", message: "力強い指圧と全身整体が得意です。スポーツ経験を活かし、深いコリにもしっかりアプローチします。" },
  { id: "10000016-0000-4000-8000-000000000016", name: "未定", gender: "female", message: "" },
];

// ---- 時刻ユーティリティ（日本時間・分単位） ---------------------------

const dayStartMs = (date) => Date.parse(date + "T00:00:00+09:00");
const minToMs = (date, min) => dayStartMs(date) + min * 60000;
const msToMin = (date, ms) => Math.round((ms - dayStartMs(date)) / 60000);
const todayJst = () => new Date(Date.now() + 32400000 - 10800000).toISOString().slice(0, 10); // 3時切替
const addDays = (date, n) => new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

// 日付文字列から決まる簡易乱数（毎回同じ架空データを生成するため）
function seededRand(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) h = (h ^ c.charCodeAt(0)) * 16777619 >>> 0;
  return () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);
}

// ---- メモリ上の状態 ----------------------------------------------------

const state = {
  staff: STAFF_SEED.map((s, i) => ({
    id: s.id,
    name: s.name,
    gender: s.gender,
    active: 1,
    courses: "[]", // 空=全メニュー対応
    locked: 0, // 鍵（予約受付停止）は最初はかけない。台帳の鍵ボタンで自由にON/OFFできる
    profile: JSON.stringify({
      nickname: "",
      personalNomination: s.name !== "未定", // 「未定」は指名不可の割当用スタッフ
      genderNomination: false,
      nominationFee: { "杉田 祐哉": 500, "中山 優吾": 2700, "小倉 有美子": 1100, "未定": 1100, "武良 翔平": 500 }[s.name] || 0,
      message: s.message || "",
      imageKey: "",
    }),
    sort_order: i + 1,
    profile_revision: 0,
  })),
  photos: new Map(),   // staffId -> dataURL
  days: new Map(),     // date -> {version, enabled}
  shifts: new Map(),   // date -> [{staff_id, date, start_at, end_at, note}]
  events: new Map(),   // date -> {bookings: [], blocks: [], assignments: []}
  notifications: [{ status: "pending", count: 0 }, { status: "cancelled", count: 0 }],
  mails: [],       // 生成したメール（デモ。実際には送信しない）
  mailSerial: 0,
  // 予約フォームのフリーメッセージ欄の設定（管理画面から変更できる）
  settings: {
    freeMessage: {
      visible: true,      // 欄を表示するか
      required: false,    // 入力必須にするか
      label: "",          // 欄の見出し（空なら元のまま）
      placeholder: "",    // 入力欄のヒント文
      description: "",    // 欄の下に出す説明文
      maxLength: 2000,    // 入力文字数の上限
    },
    // 店舗マスタ（管理画面の「店舗情報」に表示。実物と同じ初期値）
    shopMaster: {
      companyId: "28202", areaId: "30031", shopId: "37642", shopCode: "",
      name: "Ueno spa&massage CN Health & Beauty SALON",
      shortName: "Ueno spa&massage CN Health & Beauty SALON",
      zip: "110-0005", pref: "東京都",
      address: "台東区上野４丁目８−６プラザＵビル　3階", address2: "",
      tel: "03-6806-0324", fax: "",
      email: "cnsalon2021@gmail.com",
      homepage: "https://online.peakmanager.com/ja/t5p4e4/home",
      department: "", manager: "大水　寛",
      bgColor: "brown",
      // 業務設定（分単位。600=10:00、1620=27:00。実物と同じ初期値）
      bizStart: 600, bizEnd: 1620,     // 業務開始・終了
      openStart: 600, openEnd: 1620,   // 営業開始・終了（台帳の営業時間帯）
      resStart: 600, resEnd: 1560,     // 予約開始・予約締切（オンライン予約の受付枠 10:00〜26:00）
      daySwitch: 30,                   // 営業日切り替え時間（30=翌6時表記。表示のみ）
      timeUnit: "all",                 // 時間表示単位（basic/all。表示のみ）
      // 会員番号の発行処理（実物と同じ表示。読み取り専用）
      memberAuto: "無効", memberDigits: "3", memberNext: "1",
    },
  },
  bookingSerial: 100,
  bookingIndex: new Map(), // 予約ID -> 日付
  requestKeys: new Map(),  // 予約サイトの多重送信防止キー -> 結果
  hpKeys: new Map(),       // ホットペッパー連携の予約番号 -> 予約ID（重複受信を防ぐ）
  // 回数券：プラン（管理画面で作成・編集・公開）と発行済み回数券（顧客に紐付く）
  // 有効期限は全券共通で「購入日から1年間」（プランごとの日数設定は持たない）
  ticketPlans: new Map([
    ["tp-5", { id: "tp-5", name: "回数券 5回券", description: "全メニューでご利用いただけます（1回のご予約で1回分を使用）", price: 30000, uses: 5, active: 1 }],
    ["tp-10", { id: "tp-10", name: "回数券 10回券", description: "全メニューでご利用いただけます（1回のご予約で1回分を使用）", price: 55000, uses: 10, active: 1 }],
    ["tp-20", { id: "tp-20", name: "回数券 20回券", description: "全メニューでご利用いただけます（1回のご予約で1回分を使用）", price: 100000, uses: 20, active: 1 }],
  ]),
  ticketPlanSerial: 0,
  tickets: new Map(),            // ticketId -> 回数券（残数・履歴つき）
  ticketSerial: 0,
  ticketUseByBooking: new Map(), // 予約ID -> ticketId（同じ予約での二重消費を防ぐ）
  hpSeenUids: new Set(),   // メール取込で走査済みのメール番号（毎分の再解析を避ける）
  hpLog: [],               // ホットペッパー連携の受信履歴（管理画面の連携ページに表示）
  reports: new Map(),      // 営業実績（日報）の入力内容 date -> {weather, ...}
  // 管理画面のアカウント（権限つき）。パスワードはハッシュのみ保持
  accounts: new Map([
    [ADMIN_ID, { user: ADMIN_ID, name: "久高（管理者）", role: "admin", active: true, pass: ADMIN_PASS_HASH, createdAt: Date.now() }],
  ]),
  authLog: [],             // 認証イベント（成功・失敗・権限外アクセス。機密は含めない）
  loginFails: new Map(),   // ユーザー名 -> {n, until}（連続失敗によるロック）
  // 予約サイトの会員（お客様）。メールアドレス＋パスワード（ハッシュのみ保持）で登録・ログインし、
  // 自分の予約の確認・変更・取消と回数券の購入・残数確認ができる
  members: new Map(),        // email -> {email, pass, name, phone, createdAt, bookings:[id], tickets:[id]}
  memberSessions: new Map(), // token -> {email, created}（ログイン状態。保存されるので再起動後も有効）
  memberFails: new Map(),    // email -> {n, until}（連続失敗によるロック）
};

// ---- 永続化（persist.js＝このシステムのデータベース層） ----
// 予約・顧客・シフト・回数券・メニュー・設定・アカウント・ログイン中セッションを
// ディスク（およびGH_TOKEN設定時はGitHubの非公開リポジトリ）へ保存し、起動時に復元する。
// 復元が終わるまでサーバーは受付を開始しない（server.js が ready を待つ）。
const persistReady = (() => {
  const persist = require("./persist");
  const defaultSettings = JSON.parse(JSON.stringify(state.settings));
  const fillDefaults = (dst, src) => {
    for (const k of Object.keys(src)) {
      if (!(k in dst)) dst[k] = src[k];
      else if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k]) &&
        dst[k] && typeof dst[k] === "object" && !(dst[k] instanceof Map) && !(dst[k] instanceof Set)) {
        fillDefaults(dst[k], src[k]);
      }
    }
  };
  return (async () => {
    const loaded = await persist.loadSnapshotWithRemote();
    if (loaded.data) {
      for (const [k, v] of Object.entries(loaded.data.state)) if (k in state) state[k] = v;
      fillDefaults(state.settings, defaultSettings);
      for (const [t, s2] of loaded.data.sessions || []) adminSessions.set(t, s2);
      // 旧ID（kudaka1228）で保存されたデータは、新IDの管理者へ自動移行する
      // ・新IDが無ければ旧IDを改名（パスワードは新初期値／環境変数に更新）
      // ・新IDが既にあれば旧IDを削除（旧IDでのログインは不可にする）
      if (state.accounts.has(LEGACY_ADMIN_ID)) {
        if (!state.accounts.has(ADMIN_ID)) {
          const old = state.accounts.get(LEGACY_ADMIN_ID);
          state.accounts.set(ADMIN_ID, { ...old, user: ADMIN_ID, pass: ADMIN_PASS_HASH });
          for (const s2 of adminSessions.values()) if (s2.user === LEGACY_ADMIN_ID) s2.user = ADMIN_ID;
        }
        state.accounts.delete(LEGACY_ADMIN_ID);
        console.log(`管理者IDを ${LEGACY_ADMIN_ID} → ${ADMIN_ID} へ移行しました`);
      }
      // 送信処理中のまま停止・再起動したメールは、届いたかどうか確認できない。
      // 二重送信を防ぐため自動では再送せず、「送信結果不明」として管理画面に残す
      for (const m of state.mails || []) {
        if (m.status === "sending") {
          m.status = "failed";
          m.error = "送信処理中にサーバーが再起動したため、送信結果を確認できませんでした（二重送信防止のため自動再送はしていません）";
        }
      }
      // 以前の版で本文を固定して積んだ送信待ちリマインドは、すべて送信直前に
      // 最新の予約データ（日時・担当・料金・取消状況・回数券）で作り直すよう指定を付け直す
      for (const m of state.mails || []) {
        if (m.status !== "pending" || m.type !== "remind" || !m.bookingId) continue;
        if (m.tpl && m.tpl.name === "booking") continue;
        m.tpl = { name: "booking", variant: m.kind === "store" ? "storeRemind" : "customerRemind", bookingId: m.bookingId };
      }
      // 期限リマインドの重複防止キーを「送った有効期限」に移行（従来の送信済みフラグを引き継ぐ）
      for (const t of state.tickets.values()) {
        if (t.remind_sent && t.remind_for_expiry === undefined) t.remind_for_expiry = t.expires_at;
      }
      // 環境変数でパスワードが指定されている場合は、保存済みアカウントにも常に適用する
      if (process.env.ADMIN_PASS_HASH && state.accounts.has(ADMIN_ID)) {
        state.accounts.get(ADMIN_ID).pass = process.env.ADMIN_PASS_HASH;
      }
      console.log("保存データを読み込みました（予約・設定・回数券・アカウントを復元）");
    } else if (persist.persistenceEnabled()) {
      console.log("データ保存が有効です: " + persist.dataFile() +
        (persist.remoteEnabled() ? "（GitHub同期あり）" : ""));
    }
    persist.startSaver(() => ({ savedAt: Date.now(), state, sessions: [...adminSessions.entries()] }));
  })();
})();

function ensureDay(date) {
  // version は 0 始まりにする。管理画面は未取得の日付の revision を 0 とみなして
  // 送ってくるため、1 始まりだと遠い将来の日付の一括シフト登録が必ず競合になってしまう。
  if (!state.days.has(date)) state.days.set(date, { version: 0, enabled: true });
  return state.days.get(date);
}

// 本物の予約台帳の画像と同じ固定シフト（毎日同じパターン。月間シフト入力で上書き可能）
const FIXED_SHIFTS = {
  "10000012-0000-4000-8000-000000000012": [1020, 1410], // 杉田 祐哉 17:00〜23:30
  "10000001-0000-4000-8000-000000000001": [600, 1320],  // 豊       10:00〜22:00
  "10000002-0000-4000-8000-000000000002": [600, 1230],  // 中山 優吾 10:00〜20:30
  "10000004-0000-4000-8000-000000000004": [600, 1080],  // 平良 陽太 10:00〜18:00
  "10000005-0000-4000-8000-000000000005": [1110, 1290], // 山田 恵   18:30〜21:30
  "10000014-0000-4000-8000-000000000014": [840, 1290],  // 小倉 有美子 14:00〜21:30
  "10000015-0000-4000-8000-000000000015": [900, 1290],  // 武良 翔平 15:00〜21:30
  "10000016-0000-4000-8000-000000000016": [720, 990],   // 未定     12:00〜16:30
};
function ensureShifts(date) {
  if (state.shifts.has(date)) return state.shifts.get(date);
  const list = [];
  state.staff.forEach((s) => {
    const t = FIXED_SHIFTS[s.id];
    if (!t) return;
    list.push({ staff_id: s.id, date, start_at: minToMs(date, t[0]), end_at: minToMs(date, t[1]), note: "" });
  });
  state.shifts.set(date, list);
  return list;
}

function ensureEvents(date) {
  if (state.events.has(date)) return state.events.get(date);
  const ev = { bookings: [], blocks: [], assignments: [] };
  state.events.set(date, ev);
  // ダミーの予約・業務は載せない。予約サイトからの本物の予約と、
  // 管理画面での手入力だけが台帳に表示される
  return ev;
}


// スタッフの1日分の予定（予約・休憩・業務）が重ならないかを確認
function overlaps(date, staffId, start, end, ignoreId) {
  const ev = ensureEvents(date);
  const items = [
    ...ev.bookings.filter((b) => b.status === "confirmed" && ev.assignments.some((a) => a.booking_id === b.id && a.staff_id === staffId)),
    ...ev.blocks.filter((b) => b.staff_id === staffId),
  ];
  return items.some((it) => it.id !== ignoreId && msToMin(date, it.start_at) < end && msToMin(date, it.end_at) > start);
}

function shiftOf(date, staffId) {
  return ensureShifts(date).find((s) => s.staff_id === staffId);
}

function withinShift(date, staffId, start, end) {
  const sh = shiftOf(date, staffId);
  return !!sh && msToMin(date, sh.start_at) <= start && end <= msToMin(date, sh.end_at);
}

// ---- リクエスト処理 ----------------------------------------------------

function getSchedule(date) {
  const today = todayJst();
  const days = [], shifts = [];
  for (let i = -1; i <= 62; i++) {
    const d = addDays(date, i);
    const day = ensureDay(d);
    days.push({ date: d, version: day.version, enabled: day.enabled });
    if (d >= today) shifts.push(...ensureShifts(d));
  }
  const ev = ensureEvents(date);
  return {
    staff: [...state.staff].sort((a, b) => a.sort_order - b.sort_order),
    shifts,
    bookings: ev.bookings,
    blocks: ev.blocks,
    assignments: ev.assignments,
    days,
    mailReady: true, // デモ：メールは生成のみ（/admin/mails で内容を確認できる）
    notifications: mailSummary(),
  };
}

function err(code, message) {
  const e = new Error(message);
  e.status = code;
  return e;
}

function postSchedule(body) {
  const { action, date } = body;
  if (!action || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw err(400, "invalid");
  const day = ensureDay(date);
  const checkRevision = () => { if (body.revision !== day.version) throw err(409, "scheduleConflict"); };
  const bump = (d = date) => { ensureDay(d).version++; sseTouch(); };

  switch (action) {
    case "shift": {
      checkRevision();
      const { staffId, start, end, remove } = body;
      if (!state.staff.some((s) => s.id === staffId)) throw err(400, "invalid");
      const list = ensureShifts(date);
      const idx = list.findIndex((s) => s.staff_id === staffId);
      if (remove) {
        if (overlaps(date, staffId, 0, 100000)) throw err(409, "scheduleConflict");
        if (idx >= 0) list.splice(idx, 1);
        bump();
        return { ok: true };
      }
      if (!(Number.isFinite(start) && Number.isFinite(end) && start < end)) throw err(400, "invalid");
      // 予約・休憩・業務が新しいシフトの外に残る短縮は保存しない
      const ev = ensureEvents(date);
      const mine = [
        ...ev.bookings.filter((b) => b.status === "confirmed" && ev.assignments.some((a) => a.booking_id === b.id && a.staff_id === staffId)),
        ...ev.blocks.filter((b) => b.staff_id === staffId),
      ];
      if (mine.some((it) => msToMin(date, it.start_at) < start || msToMin(date, it.end_at) > end)) throw err(409, "scheduleConflict");
      const rec = { staff_id: staffId, date, start_at: minToMs(date, start), end_at: minToMs(date, end), note: String(body.note ?? "") };
      if (idx >= 0) list[idx] = rec; else list.push(rec);
      bump();
      return { ok: true };
    }
    case "bulkShift": {
      const { start, end, cells, remove } = body;
      if (!Array.isArray(cells) || !cells.length) throw err(400, "invalid");
      if (!remove && !(Number.isFinite(start) && Number.isFinite(end) && start < end)) throw err(400, "invalid");
      for (const c of cells) {
        if (c.revision !== ensureDay(c.date).version) throw err(409, "scheduleConflict");
      }
      for (const c of cells) {
        const list = ensureShifts(c.date);
        const idx = list.findIndex((s) => s.staff_id === c.staffId);
        const ev = ensureEvents(c.date);
        const mine = [
          ...ev.bookings.filter((b) => b.status === "confirmed" && ev.assignments.some((a) => a.booking_id === b.id && a.staff_id === c.staffId)),
          ...ev.blocks.filter((b) => b.staff_id === c.staffId),
        ];
        if (remove) {
          // お客様の予約が残っている日は削除しない。休憩・業務はシフトと一緒に削除する
          const myBookings = ev.bookings.filter((b) => b.status === "confirmed" && ev.assignments.some((a) => a.booking_id === b.id && a.staff_id === c.staffId));
          if (myBookings.length) throw err(409, "scheduleConflict");
          ev.blocks = ev.blocks.filter((b) => b.staff_id !== c.staffId);
          if (idx >= 0) list.splice(idx, 1);
          bump(c.date);
          continue;
        }
        if (mine.some((it) => msToMin(c.date, it.start_at) < start || msToMin(c.date, it.end_at) > end)) throw err(409, "scheduleConflict");
        const rec = { staff_id: c.staffId, date: c.date, start_at: minToMs(c.date, start), end_at: minToMs(c.date, end), note: "" };
        if (idx >= 0) list[idx] = rec; else list.push(rec);
        bump(c.date);
      }
      return { ok: true };
    }
    case "block": {
      checkRevision();
      const { staffId, start, end, kind, remove, id } = body;
      const ev = ensureEvents(date);
      if (remove) {
        const idx = ev.blocks.findIndex((b) => b.id === id);
        if (idx < 0) throw err(404, "notFound");
        ev.blocks.splice(idx, 1);
        bump();
        return { ok: true };
      }
      if (!state.staff.some((s) => s.id === staffId) || !(start < end) || ![`break`, `work`].includes(kind)) throw err(400, "invalid");
      if (!withinShift(date, staffId, start, end)) throw err(409, "outsideShift");
      if (overlaps(date, staffId, start, end, id)) throw err(409, "scheduleConflict");
      const rec = { id: id || "blk-" + Date.now(), staff_id: staffId, date, start_at: minToMs(date, start), end_at: minToMs(date, end), kind, note: String(body.note ?? "") };
      const idx = ev.blocks.findIndex((b) => b.id === rec.id);
      if (idx >= 0) ev.blocks[idx] = rec; else ev.blocks.push(rec);
      bump();
      return { ok: true };
    }
    case "moveBooking": {
      checkRevision();
      const { id, staffId, start, end } = body;
      const ev = ensureEvents(date);
      const bk = ev.bookings.find((b) => b.id === id && b.status === "confirmed");
      if (!bk) throw err(404, "notFound");
      const mvTarget = state.staff.find((s) => s.id === staffId);
      if (!mvTarget) throw err(400, "invalid");
      if (mvTarget.active !== 1) throw err(409, "staffUnavailable"); // 退職・停止中には移せない
      if (mvTarget.locked) throw err(409, "soldOut");            // 鍵中のスタッフには入れられない
      if (!staffCanDo(mvTarget, bk.course)) throw err(409, "soldOut"); // 対応可能メニュー外は不可
      const mvGender = courseGender(bk.course);
      if (mvGender !== "none" && mvTarget.gender !== mvGender) throw err(409, "soldOut");
      if (!withinShift(date, staffId, start, end)) throw err(409, "outsideShift");
      if (overlaps(date, staffId, start, end, id)) throw err(409, "soldOut");
      // 複数名の予約は残りの担当も、新しい時間帯に対応可能なスタッフから割り当て直す
      const others = bk.people > 1
        ? freeStaffIds(date, start, end, bk.course, mvGender, id).filter((sid) => sid !== staffId).slice(0, bk.people - 1)
        : [];
      if (others.length < bk.people - 1) throw err(409, "soldOut");
      // 指名予約の担当変更は、変更先の指名料で再計算する（指名を受けない相手には移せない）
      if (bk.nominated_staff_id && bk.nominated_staff_id !== staffId) {
        const pr = profileOf(mvTarget);
        if (!pr.personalNomination) throw err(409, "staffUnavailable");
        bk.nominated_staff_id = mvTarget.id;
        bk.nominated_staff_name = pr.nickname || mvTarget.name;
        bk.nomination_fee = Number(pr.nominationFee) || 0;
      }
      bk.start_at = minToMs(date, start);
      bk.end_at = minToMs(date, end);
      const late = start >= 1320 ? 2000 * bk.people : 0;
      bk.total = bk.base_price * bk.people + late + (bk.nomination_fee || 0);
      ev.assignments = ev.assignments.filter((a) => a.booking_id !== id);
      for (const sid of [staffId, ...others]) ev.assignments.push({ booking_id: id, staff_id: sid });
      if (bk.sb_done) { bk.sb_done = false; bk.sb_changed = true; } // 転記済みの予約を動かしたら再転記が必要
      queueChangeMails(bk); // 変更通知＋リマインド再登録（双方）
      bump();
      return { ok: true };
    }
    case "createBooking": {
      checkRevision();
      const { staffId, start, course, people, consent } = body;
      const c = getCourse(course);
      const cbTarget = state.staff.find((s) => s.id === staffId);
      if (!consent || !c || !cbTarget) throw err(400, "invalid");
      if (cbTarget.locked) throw err(409, "soldOut");            // 鍵中のスタッフには入れられない
      if (!staffCanDo(cbTarget, course)) throw err(409, "soldOut"); // 対応可能メニュー外は不可
      const cbGender = courseGender(course);
      if (cbGender !== "none" && cbTarget.gender !== cbGender) throw err(409, "soldOut");
      const end = start + c.minutes;
      if (!withinShift(date, staffId, start, end)) throw err(409, "outsideShift");
      if (overlaps(date, staffId, start, end)) throw err(409, "soldOut");
      const ev = ensureEvents(date);
      state.bookingSerial++;
      const id = "bk-new-" + state.bookingSerial;
      const n = Number(people) || 1;
      // 複数名の予約は、対応可能で空いているスタッフを人数分確保する
      const cbOthers = n > 1
        ? freeStaffIds(date, start, end, course, cbGender).filter((sid) => sid !== staffId).slice(0, n - 1)
        : [];
      if (cbOthers.length < n - 1) throw err(409, "soldOut");
      ev.bookings.push({
        id, reference: "DM" + String(state.bookingSerial).padStart(6, "0"),
        service_date: date, status: "confirmed",
        start_at: minToMs(date, start), end_at: minToMs(date, end),
        people: n, course, course_name: c.name,
        name: String(body.name || "（店頭受付）"), email: String(body.email || ""), phone: String(body.phone || ""),
        comment: String(body.comment || ""),
        total: c.price * n + (start >= 1320 ? 2000 * n : 0), base_price: c.price,
        nomination_fee: 0, nominated_staff_id: null, nominated_staff_name: null,
        staff: "none", customer_token: null,
        sb_done: false, // サロンボードへの転記状態
      });
      state.bookingIndex.set(id, date);
      for (const sid of [staffId, ...cbOthers]) ev.assignments.push({ booking_id: id, staff_id: sid });
      queueBookingMails(ev.bookings.find((b) => b.id === id));
      bump();
      return { ok: true };
    }
    case "cancel": {
      checkRevision();
      const ev = ensureEvents(date);
      const bk = ev.bookings.find((b) => b.id === body.id && b.status === "confirmed");
      if (!bk) throw err(404, "notFound");
      bk.status = "cancelled";
      // 担当割当をすべて外して枠を空ける（複数名予約は全担当分）
      ev.assignments = ev.assignments.filter((a) => a.booking_id !== bk.id);
      maybeRefundTicket(bk); // 回数券利用の予約は、開始前キャンセルに限り1回分を返却（冪等）
      queueCancelMails(bk); // 取消通知（双方）＋未送信リマインドの破棄
      bump();
      return { ok: true };
    }
    case "toggle": {
      checkRevision();
      day.enabled = !!body.enabled;
      bump();
      return { ok: true };
    }
    case "staff": {
      const p = body;
      if (!p.id || !p.name || ![`male`, `female`].includes(p.gender)) throw err(400, "invalid");
      const profile = { ...(p.profile || {}) };
      delete profile.nominationFeePending;
      if (p.photo) {
        state.photos.set(p.id, p.photo);
        profile.imageKey = "uploaded";
      } else if (p.photo === null) {
        state.photos.delete(p.id);
        profile.imageKey = "";
      }
      const prevStaff = state.staff.find((x) => x.id === p.id);
      // 新規スタッフのIDは数字8桁の連番で採番する（ID欄がすべて数字8桁で揃うように）
      let staffRecId = p.id;
      if (!prevStaff) {
        // 採番は単調増加（削除で最大番号が消えても同じ番号を再利用しない）
        const next = Math.max(state.staffIdHigh || 10000000,
          ...state.staff.map((s) => Number(String(s.id).slice(0, 8)) || 0)) + 1;
        state.staffIdHigh = next;
        staffRecId = `${next}-0000-4000-8000-${String(next).padStart(12, "0")}`;
        if (state.photos.has(p.id)) {
          state.photos.set(staffRecId, state.photos.get(p.id));
          state.photos.delete(p.id);
        }
      }
      const rec = {
        id: staffRecId,
        name: String(p.name),
        gender: p.gender,
        active: p.active ? 1 : 0,
        locked: prevStaff?.locked ?? 0,
        courses: JSON.stringify(p.allCourses ? [] : p.courses || []),
        profile: JSON.stringify(profile),
        sort_order: Number(p.sortOrder) || 0,
        profile_revision: (Number(p.staffRevision) || 0) + 1,
      };
      const idx = state.staff.findIndex((s) => s.id === p.id);
      if (idx >= 0) state.staff[idx] = rec; else state.staff.push(rec);
      // 対応可能メニューから外れたメニューの予約が今後入っている場合は、
      // 予約はそのまま維持しつつ管理画面に警告を返す（勝手に削除・変更しない）
      const newCourses = JSON.parse(rec.courses);
      const affected = [];
      if (newCourses.length) {
        const today = todayJst();
        for (const [d, ev2] of state.events) {
          if (d < today) continue;
          for (const b of ev2.bookings) {
            if (b.status !== "confirmed") continue;
            if (!ev2.assignments.some((a) => a.booking_id === b.id && a.staff_id === rec.id)) continue;
            if (!newCourses.includes(b.course)) affected.push(`${fmtDateJa(d)} ${fmtTime(d, b.start_at)} ${b.reference}`);
          }
        }
      }
      if (affected.length) {
        return {
          ok: true,
          warning: `保存しました。ただし、対応可能メニューから外したメニューの予約が ${affected.length}件 入っています。\n` +
            affected.slice(0, 5).join("\n") + (affected.length > 5 ? "\nほか" : "") +
            "\n既存の予約はそのまま維持されます。必要に応じて担当変更または取消をしてください。",
        };
      }
      return { ok: true };
    }
    case "checkout": {
      // お会計（精算）の登録。金額は値引後の額を予約に記録する
      const ev = ensureEvents(date);
      const bk = ev.bookings.find((b) => b.reference === String(body.reference) && b.status === "confirmed");
      if (!bk) throw err(404, "notFound");
      const amount = Math.floor(Number(body.amount));
      if (!(Number.isFinite(amount) && amount >= 0)) throw err(400, "invalid");
      bk.paid_amount = amount;
      bk.paid_at = Date.now();
      bump();
      return { ok: true };
    }
    case "staffDelete": {
      // スタッフの削除。予約（昨日以降の確定分）が残っている場合は削除しない。
      // シフト・休憩・業務・写真・受付停止設定はスタッフと一緒に削除する。
      const st = state.staff.find((x) => x.id === body.staffId);
      if (!st) throw err(404, "notFound");
      const today = todayJst();
      for (const [d, ev2] of state.events) {
        if (d < addDays(today, -1)) continue;
        const has = ev2.bookings.some((b) => b.status === "confirmed" &&
          ev2.assignments.some((a) => a.booking_id === b.id && a.staff_id === st.id));
        if (has) throw err(409, "hasBookings");
      }
      state.staff = state.staff.filter((x) => x.id !== st.id);
      for (const [d, list] of state.shifts) state.shifts.set(d, list.filter((x) => x.staff_id !== st.id));
      for (const ev2 of state.events.values()) {
        ev2.blocks = ev2.blocks.filter((b) => b.staff_id !== st.id);
        ev2.assignments = ev2.assignments.filter((a) => a.staff_id !== st.id);
      }
      state.photos.delete(st.id);
      bump();
      return { ok: true };
    }
    case "lockStaff": {
      const st = state.staff.find((x) => x.id === body.staffId);
      if (!st) throw err(400, "invalid");
      st.locked = body.locked ? 1 : 0;
      bump();
      return { ok: true, locked: st.locked };
    }
    case "retryMail": {
      // 送信失敗したメールを再送信キューへ戻す
      for (const m of state.mails) {
        if (m.status === "failed") { m.status = "pending"; m.error = null; m.scheduledAt = Date.now(); }
      }
      deliverDueMails();
      return { ok: true };
    }
    default:
      throw err(400, "invalid");
  }
}


// ---- リマインド・通知メール（デモ：実送信はせず、内容を生成して保存する） ----

const STORE_NAME = "CN Ueno health & beauty";
const STORE_MAIL = "info@cn-salon-ueno.example.jp";

function fmtDateJa(date) {
  const w = ["日", "月", "火", "水", "木", "金", "土"][new Date(date + "T00:00:00Z").getUTCDay()];
  const [y, m, d] = date.split("-").map(Number);
  return `${y}年${m}月${d}日（${w}）`;
}
function fmtTime(date, ms) {
  const min = msToMin(date, ms);
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

// 参考画像と同じ見た目のHTMLメールを本文テキストから組み立てる。
// Gmail・iPhone・Android等で崩れないよう、テーブル＋インラインCSSのみで構成し、
// 画像に無い要素は足さない（本文・順序・改行はテキスト版と完全に同一）。
function mailHtml(body) {
  const escH = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const A = 'style="color:#1a73e8;text-decoration:underline;word-break:break-all;"';
  const lines = String(body).split("\n").map((line) => {
    if (line === MAIL_ADDR) {
      // 店舗住所は参考画像と同じく地図リンク（青文字）にする
      return '<a href="https://maps.google.com/?q=' + encodeURIComponent(MAIL_ADDR) + '" ' + A + ">" + escH(MAIL_ADDR) + "</a>";
    }
    let h = escH(line);
    h = h.replace(/(https?:\/\/[^\s,]+)/g, (u) => '<a href="' + u + '" ' + A + ">" + u + "</a>");
    h = h.replace(/([\w.+-]+@[\w-]+\.[\w.]+)/g, (m) => '<a href="mailto:' + m + '" ' + A + ">" + m + "</a>");
    return h;
  });
  return '<!DOCTYPE html><html><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"/></head>' +
    '<body style="margin:0;padding:0;background:#ffffff;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="left">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">' +
    '<tr><td style="padding:18px 16px;' +
    "font-family:'Hiragino Kaku Gothic ProN','Hiragino Sans',Meiryo,-apple-system,Roboto,Arial,sans-serif;" +
    'font-size:16px;line-height:1.75;color:#202124;text-align:left;word-break:break-word;">' +
    lines.join("<br/>") +
    "</td></tr></table></td></tr></table></body></html>";
}

// tpl（任意）：回数券の情報を含むメールの「本文の作り方」。本文は文字列で固定せず、
// 送信する直前に tpl から最新の回数券データ（state.tickets＝データベース）で作り直す。
// キュー時点の本文は管理画面のプレビュー用（送信時に最新の内容へ置き換わる）
function queueMail(kind, type, to, subject, body, scheduledAt, bookingId, tpl) {
  state.mailSerial++;
  const m = {
    id: "mail-" + state.mailSerial,
    kind,                 // "customer" | "store"
    type,                 // "confirm" | "notify" | "remind" | "change" | "cancel" | "ticket" | "ticketRemind" | "member"
    to, subject, body,
    html: mailHtml(body), // 実際に届くHTMLメール（参考画像と同一の見た目）
    scheduledAt,          // この時刻になったら送信処理を行う
    createdAt: Date.now(),
    bookingId: bookingId || null,
    status: "pending",    // pending（送信予定）→ sending（処理中）→ sent／failed／skipped（送信中止）
    sentAt: null,
    error: null,
  };
  if (tpl) {
    m.tpl = tpl;
    applyMailTemplate(m, false); // プレビュー用に今の内容で一度作る（送信時に作り直す）
  }
  state.mails.push(m);
  return m;
}

// 送信時刻を過ぎたメールを送信処理する（デモの配信サービスは即時に応答する）。
// 「送信済み」への遷移は配信サービスの成功応答を確認してから行い、
// 一度 sent／failed／skipped になったメールは二度と再送しない（二重送信防止）。
// 回数券を含むメールは、ここで（送信の直前に）最新の回数券データから本文を作り直し、
// 送信時点の残り回数・有効期限を ticketSnap としてメール記録に残す。
function deliverDueMails() {
  ticketRemindSweep(); // 期限1か月前の自動リマインド（冪等）
  const now = Date.now();
  for (const m of state.mails) {
    if (m.status !== "pending" || m.scheduledAt > now) continue;
    if (m.tpl) {
      try {
        const r = applyMailTemplate(m, true);
        if (r && r.defer) {
          // 予約日時が後ろへ変わった等で、まだ送る時刻ではない → 正しい時刻に付け替えて待つ
          m.scheduledAt = r.defer;
          continue;
        }
        if (r && r.skip) {
          // 例：期限リマインドの送信時点で使い切り・期限切れ → 誤った案内を送らず中止して記録する
          m.status = "skipped";
          m.skipReason = r.skip;
          continue;
        }
      } catch (e) {
        m.status = "failed";
        m.error = "本文の作成に失敗したため送信していません: " + e.message;
        continue;
      }
    }
    m.status = "sending";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.to)) {
      m.status = "failed";
      m.error = "宛先メールアドレスの形式が不正のため、配信サービスに拒否されました";
      continue;
    }
    const cfg = realSendAllowed(m.to);
    if (cfg && mailHasDevUrl(m)) {
      // 開発用URL（127.0.0.1・localhost 等）を含むメールは、お客様に届くと開けないため実送信しない
      m.status = "failed";
      m.error = "本文に開発用のURL（127.0.0.1・localhost等）が含まれるため、送信を止めました。" +
        "公開URL（環境変数 PUBLIC_ORIGIN、または mail-config.json の publicOrigin）を設定してから再送してください";
      continue;
    }
    if (cfg) {
      // 実送信（mail-config.jsonのallowToに載っている宛先だけ）。
      // 結果が返るまで「送信処理中」。成功応答を確認してから「送信済み」にする
      smtpSend(cfg, m, (err) => {
        if (m.status !== "sending") return; // 二重送信防止
        if (err) {
          m.status = "failed";
          m.error = "実送信エラー: " + err.message;
        } else {
          m.status = "sent";
          m.sentAt = Date.now();
          m.real = true; // 実際に配信された印
        }
      });
      continue;
    }
    m.status = "sent";
    m.sentAt = now;
  }
}

const MAIL_STORE = "Ueno spa&massage CN Health & Beauty SALON";
const MAIL_ADDR = "東京都台東区上野４丁目８－６プラザＵビル　3階";
const MAIL_TEL = "03-6806-0324";
const SEP = "------------------------------";
// メール内リンクの起点URL（公開ドメイン）。優先順：
//  1) 環境変数 PUBLIC_ORIGIN（例 https://cn-salon.com）
//  2) 本番ホスティングの公開ドメイン（server.js が PUBLIC_HOST／RENDER_EXTERNAL_HOSTNAME 等から設定する DEMO_ORIGIN）
//  3) mail-config.json の publicOrigin（ローカルから実送信テストをする場合）
// 127.0.0.1・localhost 等の開発用URLは「公開URL」とみなさない。公開URLが無い環境では
// プレビュー用に開発用URLで本文を作るが、実際の送信は deliverDueMails で止める（mailHasDevUrl）
const DEV_URL_RE = /https?:\/\/(?:127\.\d+\.\d+\.\d+|localhost|0\.0\.0\.0|\[?::1\]?|[a-z0-9-]+\.localhost|[a-z0-9-]+\.local)(?::\d+)?(?=[\/\s?#]|$)/i;
function publicOrigin() {
  let cfgOrigin = "";
  try { cfgOrigin = (loadMailConfig() || {}).publicOrigin || ""; } catch {}
  for (const c of [process.env.PUBLIC_ORIGIN, process.env.DEMO_ORIGIN, cfgOrigin]) {
    const u = String(c || "").trim().replace(/\/+$/, "");
    if (/^https:\/\/[^\s/]+$/i.test(u) && !DEV_URL_RE.test(u)) return u;
  }
  return null;
}
const origin = () => publicOrigin() || String(process.env.DEMO_ORIGIN || "http://127.0.0.1:5520").replace(/\/+$/, "");
const mailHasDevUrl = (m) => DEV_URL_RE.test(String(m.body || "")) || DEV_URL_RE.test(String(m.html || ""));

// コースのカテゴリ表示（メールの「　整体 全身整体 60分」の先頭部分）
function courseCategory(courseId) {
  const p = String(courseId).slice(0, 6);
  return {
    "364321": "キャンペーン", "364323": "整体", "364324": "小顔矯正", "364325": "矯正整体",
    "364326": "オイル", "364327": "フット", "364328": "フェイシャル",
    "364329": "ハイパーナイフ", "364331": "ルーム",
  }[p] || "メニュー";
}
function displayId(bk) {
  return bk.display_id || bk.reference;
}
// 予約内容ブロック（-----で挟む部分。改行も画像どおり）
// ---- 回数券（チケット） ---------------------------------------------------
// 残数の増減はすべてこのファイル内の同期処理で行う（Nodeは1リクエストずつ処理する
// ため、検証→減算の間に他のリクエストが割り込むことはなく、二重減算・負の残数は
// 起きない）。同じ予約での二重消費は ticketUseByBooking と履歴で冪等に防ぐ。

// 日本時間で「購入日からちょうど1年後」の23:59:59を有効期限にする。
// 翌年に同じ日が無い場合（2/29購入など）は、その月の末日に丸める
function ticketExpiryMs(purchaseMs) {
  const d = new Date(purchaseMs + 9 * 3600e3);
  const y = d.getUTCFullYear() + 1;
  const m = d.getUTCMonth() + 1;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 翌年その月の日数
  const dd = Math.min(d.getUTCDate(), dim);
  return Date.parse(`${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}T23:59:59+09:00`);
}
function jstDateStr(ms) {
  const d = new Date(ms + 9 * 3600e3);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

// 有効期限の1か月前になったら自動でリマインドメールを1通だけ送る。
// 重複防止：「どの有効期限に対して送ったか」（remind_for_expiry）を先に記録するため、
// この処理が何度・どの端末のアクセスから実行されても、同じ券・同じ期限には1通だけ。
// （期限が延長された場合は、新しい期限に対して改めて1通送れる）
// 本文は送信直前に最新の残り回数・有効期限で作る（ticketRemind テンプレート）
function ticketRemindSweep() {
  const now = Date.now();
  for (const t of state.tickets.values()) {
    if (t.remind_for_expiry === t.expires_at) continue;
    if (!ticketUsable(t)) continue;                  // 使い切り・期限切れは対象外
    if (now < t.expires_at - 30 * 86400e3) continue; // 1か月前になるまで待つ
    t.remind_for_expiry = t.expires_at;
    t.remind_sent = true; // 管理画面の「期限リマインド」表示用（従来の項目）
    queueMail("customer", "ticketRemind", t.buyer_email,
      `${MAIL_STORE} 回数券の有効期限が近づいています`, "", now, null,
      { name: "ticketRemind", ticketId: t.id, expiresAt: t.expires_at });
  }
}

function ticketStatus(t) {
  if (t.uses_left <= 0) return "使い切り";
  if (Date.now() > t.expires_at) return "期限切れ";
  return "有効";
}
// 「今使える回数券か」の判定はすべてここに集約する（残り1回以上・期限内）
function ticketUsable(t) {
  return !!t && t.uses_left > 0 && Date.now() <= t.expires_at;
}
function ticketUsageLabel(t) {
  if (t.uses_left <= 0) return "残り回数がないため、ご利用いただけません";
  if (Date.now() > t.expires_at) return "有効期限を過ぎたため、ご利用いただけません";
  return "ご利用いただけます";
}
// メール送信時点の回数券の状態（メール記録に保存して、後から管理画面で照合できるようにする）
function ticketSnapshot(t) {
  return {
    ticketId: t.id, planName: t.plan_name, purchasedAt: t.purchased_at,
    usesTotal: t.uses_total, usesLeft: t.uses_left,
    expiresAt: t.expires_at, expiresLabel: jstDateStr(t.expires_at),
    status: ticketStatus(t), usable: ticketUsable(t),
  };
}
// 同じお客様（購入時のメール、または会員アカウント）が持っている回数券
function customerTickets(email) {
  const e = String(email || "").toLowerCase();
  if (!e) return [];
  return [...state.tickets.values()].filter((t) => t.buyer_email === e || t.member_email === e);
}
// メール本文に差し込む回数券情報（必ずその時点の state.tickets から作る）
function ticketInfoBlock(t) {
  return [
    SEP,
    `　${t.plan_name}`,
    `購入日 ${jstDateStr(Date.parse(t.purchased_at))}`,
    `残り回数 あと${t.uses_left}回（${t.uses_total}回のうち ${t.uses_total - t.uses_left}回ご利用済み）`,
    `有効期限 ${jstDateStr(t.expires_at)}`,
    `ご利用状況 ${ticketUsageLabel(t)}`,
    SEP,
  ];
}
// 同じお客様が他にも「今使える」回数券を持っていれば、取り違えないよう券ごとに並べる
function otherUsableTickets(t) {
  return customerTickets(t.buyer_email).concat(t.member_email ? customerTickets(t.member_email) : [])
    .filter((x, i, a) => x.id !== t.id && ticketUsable(x) && a.findIndex((y) => y.id === x.id) === i)
    .sort((a, b) => a.expires_at - b.expires_at);
}
function otherTicketLines(others) {
  if (!others.length) return [];
  return ["", "ほかにご利用いただける回数券", ...others.map((x) =>
    `・${x.plan_name}　あと${x.uses_left}回（有効期限 ${jstDateStr(x.expires_at)}）`)];
}
const SNAP_NOTE = "※回数券の内容は、このメールを送信した時点の最新の状態です。";

// ---- 回数券を含むメールのテンプレート（送信直前に呼ばれ、最新データで本文を作る） ----
// 戻り値：{ subject, body, tickets:[本文に載せた券] } または { skip: "中止理由" }
const MAIL_TPL = {
  // 購入のご案内
  ticketPurchase(p) {
    const t = state.tickets.get(p.ticketId);
    if (!t) throw new Error("回数券が見つかりません: " + p.ticketId);
    const others = otherUsableTickets(t);
    return {
      subject: `${MAIL_STORE} 回数券ご購入のご案内`,
      tickets: [t, ...others],
      body: [
        `この度は「${MAIL_STORE}」の回数券をご購入いただきありがとうございます。`,
        "ご購入内容は以下のとおりです。",
        "",
        SEP,
        `　${t.plan_name}`,
        `購入日 ${jstDateStr(Date.parse(t.purchased_at))}`,
        `ご利用可能回数 ${t.uses_total}回`,
        `残り回数 あと${t.uses_left}回（${t.uses_total}回のうち ${t.uses_total - t.uses_left}回ご利用済み）`,
        `有効期限 ${jstDateStr(t.expires_at)}（購入日から1年間）`,
        `ご利用状況 ${ticketUsageLabel(t)}`,
        `料金 ${t.price.toLocaleString("ja-JP")} 円（店頭でのお支払い）`,
        SEP,
        ...otherTicketLines(others),
        "",
        "ご予約の際に「回数券を使用する」をお選びいただくと、1回のご予約につき1回分を使用します。",
        "残り回数はマイページからいつでもご確認いただけます。",
        SNAP_NOTE,
      ].join("\n") + MAIL_COMMON,
    };
  },
  // 1回使用・1回返却のたびの残数お知らせ
  ticketLeft(p) {
    const t = state.tickets.get(p.ticketId);
    if (!t) throw new Error("回数券が見つかりません: " + p.ticketId);
    const left = t.uses_left;
    const others = otherUsableTickets(t);
    const head = p.kind === "refund"
      ? `ご予約の取消にともない、回数券「${t.plan_name}」を1回分お戻ししました。`
      : `ご予約（予約番号 ${p.ref || "-"}）で回数券「${t.plan_name}」を1回分ご利用いただきました。`;
    return {
      subject: `${MAIL_STORE} 回数券の残り回数のお知らせ（あと${left}回）`,
      tickets: [t, ...others],
      body: [
        head,
        "",
        ...ticketInfoBlock(t),
        left === 0
          ? "残り回数が0回になりました。マイページからいつでも新しい回数券をご購入いただけます。"
          : left <= 2
            ? "残り回数が少なくなっています。マイページからいつでも新しい回数券をご購入いただけます。"
            : "残り回数はマイページ（予約サイト右上の「ログイン」→「回数券」）からいつでもご確認いただけます。",
        ...otherTicketLines(others),
        SNAP_NOTE,
        `${origin()}/mypage?tab=tickets`,
      ].join("\n") + MAIL_COMMON,
    };
  },
  // 有効期限1か月前のリマインド
  ticketRemind(p) {
    const t = state.tickets.get(p.ticketId);
    if (!t) return { skip: "回数券が見つかりません" };
    // 送信時点で案内の意味がない状態なら、誤った案内を送らずに中止する
    if (t.uses_left <= 0) return { skip: "送信時点で残り回数が0回のため中止しました" };
    if (Date.now() > t.expires_at) return { skip: "送信時点で有効期限を過ぎていたため中止しました" };
    if (Date.now() < t.expires_at - 30 * 86400e3) return { skip: "有効期限が延長され、期限まで1か月以上あるため中止しました" };
    const others = otherUsableTickets(t);
    return {
      subject: `${MAIL_STORE} 回数券の有効期限が近づいています`,
      tickets: [t, ...others],
      body: [
        `${t.buyer_name} 様`,
        "",
        `いつも「${MAIL_STORE}」をご利用いただきありがとうございます。`,
        `お持ちの「${t.plan_name}」の有効期限が近づいています。`,
        "",
        ...ticketInfoBlock(t),
        "有効期限を過ぎるとご利用いただけなくなります。お早めのご予約をお待ちしております。",
        ...otherTicketLines(others),
        SNAP_NOTE,
        `${origin()}/book`,
      ].join("\n") + MAIL_COMMON,
    };
  },
  // 回数券を使った予約のメール（完了・リマインド・変更・取消／お客様・店舗）。
  // 予約内容の部分は従来と同じ文面で、回数券の行だけを送信時点の最新値で作る
  booking(p, m, atSend) {
    const found = findBooking(p.bookingId);
    // リマインドは送信直前に「送ってよい予約か」を必ず確かめる（取消・来店後・重複・時刻変更）
    const isRemind = /Remind$/.test(p.variant);
    if (!found) {
      if (isRemind) return { skip: "予約が見つからないため送信を中止しました" };
      throw new Error("予約が見つかりません: " + p.bookingId);
    }
    const bk = found.bk;
    if (isRemind && atSend) {
      if (bk.status !== "confirmed") return { skip: "取消済みの予約のため、リマインドを送信しませんでした" };
      if (bk.start_at <= Date.now()) return { skip: "来店時刻を過ぎていたため、リマインドを送信しませんでした" };
      // 送るべき時刻（お客様：来店24時間前／店舗：当日9:00）。予約日時が後ろへ変わっていれば待つ
      const due = remindDueAt(bk, m.kind);
      if (Date.now() < due) return { defer: due };
      // 二重送信防止：同じ予約・同じ来店日時・同じ宛先種別のリマインドは1通だけ
      const dup = state.mails.some((x) => x !== m && x.bookingId === bk.id && x.type === "remind" && x.kind === m.kind &&
        (x.status === "sent" || x.status === "sending") && x.remindFor === bk.start_at);
      if (dup) return { skip: "同じ予約・同じ日時のリマインドは送信済みのため、重複して送信しませんでした" };
      m.remindFor = bk.start_at;
    }
    const t = bk.ticket_id ? state.tickets.get(bk.ticket_id) : null;
    const built = BOOKING_MAIL[p.variant](bk, p);
    return { ...built, tickets: t ? [t, ...otherUsableTickets(t)] : [] };
  },
};

// 台帳（回数券の履歴）から「ある時刻の時点の残り回数・有効期限」を求める（メールとの照合用）
function ticketLedgerAt(t, ms) {
  let usesLeft = null;
  for (const h of t.history || []) if (Date.parse(h.at) <= ms) usesLeft = h.left_after;
  let expiresAt = t.expires_at;
  const laterExt = (t.history || []).filter((h) => h.type === "extend" && Date.parse(h.at) > ms);
  if (laterExt.length) expiresAt = laterExt[0].expires_before ?? null; // 後から期限変更があれば変更前の値
  return { usesLeft, expiresAt };
}
// この回数券について送った（送る予定の）メールと、送信時点の残り回数・有効期限、台帳との一致
function ticketMailLog(t) {
  return state.mails.filter((m) => (m.ticketIds || []).includes(t.id)).map((m) => {
    const snap = (m.ticketSnap || []).find((s) => s.ticketId === t.id) || null;
    let ledger = null, match = null;
    if (snap && m.renderedAt) {
      ledger = ticketLedgerAt(t, m.renderedAt);
      match = ledger.usesLeft === snap.usesLeft && (ledger.expiresAt === null || ledger.expiresAt === snap.expiresAt);
    }
    return {
      id: m.id, type: m.type, kind: m.kind, to: m.to, subject: m.subject, status: m.status,
      scheduledAt: m.scheduledAt, sentAt: m.sentAt, renderedAt: m.renderedAt || null,
      error: m.error || null, skipReason: m.skipReason || null, snap, ledger, match,
    };
  }).sort((a, b) => (b.renderedAt || b.scheduledAt) - (a.renderedAt || a.scheduledAt));
}

// テンプレートからメールの件名・本文を作る。atSend=true のときは送信時点の回数券の状態を記録する
function applyMailTemplate(m, atSend) {
  const fn = MAIL_TPL[m.tpl && m.tpl.name];
  if (!fn) return null;
  const r = fn(m.tpl, m, atSend);
  if (r && r.defer) return atSend ? r : null;
  if (!r || r.skip) {
    if (!atSend && r && r.skip && !m.body) m.body = "（送信予定時刻に最新の回数券情報で本文を作成します）";
    if (!atSend && m.body) m.html = mailHtml(m.body);
    return r;
  }
  m.subject = r.subject;
  m.body = r.body;
  m.html = mailHtml(r.body);
  m.ticketIds = r.tickets.map((t) => t.id);
  if (atSend) {
    m.renderedAt = Date.now();
    m.ticketSnap = r.tickets.map(ticketSnapshot);
  }
  return r;
}

function ticketPublicJson(t) {
  return {
    id: t.id,
    plan_name: t.plan_name,
    purchased_at: t.purchased_at,
    uses_total: t.uses_total,
    uses_left: t.uses_left,
    used: t.uses_total - t.uses_left,
    expires_at: t.expires_at,
    expires_label: jstDateStr(t.expires_at),
    status: ticketStatus(t),
  };
}

// 予約で使う回数券の事前検証（所有者・残数・期限）。減算はしない
function ticketForUse(ticketId, token, email, member) {
  const t = state.tickets.get(String(ticketId || ""));
  if (!t) throw err(409, "ticketInvalid");
  // ログイン中の会員は、自分の券ならトークン・メール一致の確認なしで使える
  const own = member && t.member_email === member.email;
  if (!own && t.token !== String(token || "")) throw err(409, "ticketInvalid");
  if (!own && String(email || "").toLowerCase() !== t.buyer_email) throw err(409, "ticketInvalid");
  if (Date.now() > t.expires_at) throw err(409, "ticketExpired");
  if (t.uses_left <= 0) throw err(409, "ticketEmpty");
  if (!ticketUsable(t)) throw err(409, "ticketInvalid");
  return t;
}

// 予約確定の直前に1回分を消費する（同期・冪等）。失敗したら予約は作られない
function consumeTicket(t, bookingId, ref) {
  if (state.ticketUseByBooking.has(bookingId)) return t.uses_left; // 同じ予約では1回だけ
  if (Date.now() > t.expires_at) throw err(409, "ticketExpired");
  if (t.uses_left <= 0) throw err(409, "ticketEmpty");
  t.uses_left -= 1;
  t.history.push({ at: new Date().toISOString(), type: "use", booking_id: bookingId, ref, delta: -1, left_after: t.uses_left });
  state.ticketUseByBooking.set(bookingId, t.id);
  queueTicketLeftMail(t, "use", ref);
  return t.uses_left;
}

// 回数券の残数お知らせメール（1回使うたび・返却のたびに「あと何回」を本人へ送る。
// マイページの回数券タブでも同じ残数をいつでも確認できる）。
// 本文は送信直前に最新の残り回数・有効期限で作る（ticketLeft テンプレート）。
// メールの成否は回数券の処理と切り離す（メールが失敗しても残数の処理は確定済み・記録は管理画面に残る）
function queueTicketLeftMail(t, type, ref) {
  try {
    queueMail("customer", "ticket", t.buyer_email,
      `${MAIL_STORE} 回数券の残り回数のお知らせ`, "", Date.now(), null,
      { name: "ticketLeft", ticketId: t.id, kind: type === "refund" ? "refund" : "use", ref: ref || null });
    deliverDueMails();
  } catch {}
}

// キャンセル時の返却。規定：予約開始前の正規キャンセルに限り1回分を戻す。
// 1つの予約につき返却は1回まで（履歴で冪等）。開始後の取消では戻さない
function maybeRefundTicket(bk) {
  if (!bk || !bk.ticket_id) return false;
  const t = state.tickets.get(bk.ticket_id);
  if (!t) return false;
  if (bk.start_at <= Date.now()) return false; // 開始後は返却しない（既存キャンセル規定に合わせる）
  if (!t.history.some((h) => h.type === "use" && h.booking_id === bk.id)) return false;
  if (t.history.some((h) => h.type === "refund" && h.booking_id === bk.id)) return false;
  t.uses_left = Math.min(t.uses_total, t.uses_left + 1);
  t.history.push({ at: new Date().toISOString(), type: "refund", booking_id: bk.id, ref: bk.reference, delta: 1, left_after: t.uses_left });
  state.ticketUseByBooking.delete(bk.id);
  bk.ticket_refunded = true;
  bk.ticket_left_after = t.uses_left;
  queueTicketLeftMail(t, "refund", bk.reference);
  return true;
}

// 回数券利用予約のメール追記行（未使用の予約では空＝既存メールを一切変えない）。
// 残り回数・有効期限は予約時に控えた数字ではなく、呼ばれた時点（＝送信直前）の
// state.tickets から取る。例：予約後に別の予約で1回使えば、リマインドには減った後の回数が載る
function ticketMailLinesCustomer(bk) {
  if (!bk.ticket_id) return [];
  const t = state.tickets.get(bk.ticket_id);
  if (!t) {
    // 券のデータが無い場合（通常は起きない）は予約に控えた値で従来どおり
    return bk.ticket_refunded
      ? [`回数券「${bk.ticket_name}」を1回分お戻ししました。`, `現在の残り回数：${bk.ticket_left_after}回`, ""]
      : ["今回のご予約で回数券を1回使用します。", `ご予約後の残り回数：${bk.ticket_left_after}回`, `（ご利用の回数券：${bk.ticket_name}）`, ""];
  }
  const lead = bk.ticket_refunded
    ? [`回数券「${t.plan_name}」を1回分お戻ししました。現在の回数券の状況は以下のとおりです。`]
    : bk.status === "cancelled"
      ? ["開始時刻を過ぎてからの取消のため、回数券の返却はございません。現在の回数券の状況は以下のとおりです。"]
      : ["今回のご予約で回数券を1回使用します（今回のご予約の分は差し引き済みです）。", "現在の回数券の状況は以下のとおりです。"];
  return [...lead, ...ticketInfoBlock(t), ...otherTicketLines(otherUsableTickets(t)), SNAP_NOTE, ""];
}
function ticketMailLinesStore(bk) {
  if (!bk.ticket_id) return [];
  const t = state.tickets.get(bk.ticket_id);
  if (!t) {
    return bk.ticket_refunded
      ? [`回数券を1回分返却：${bk.ticket_name}（返却後の残り ${bk.ticket_left_after}回）`, ""]
      : [`回数券利用：${bk.ticket_name}（ご予約後の残り ${bk.ticket_left_after}回）`, ""];
  }
  const now = `送信時点の残り ${t.uses_left}回／${t.uses_total}回・有効期限 ${jstDateStr(t.expires_at)}・${ticketStatus(t)}`;
  if (bk.ticket_refunded) return [`回数券を1回分返却：${t.plan_name}（${now}）`, ""];
  if (bk.status === "cancelled") return [`回数券利用の予約を開始後に取消（返却なし）：${t.plan_name}（${now}）`, ""];
  return [`回数券利用：${t.plan_name}（${now}）`, ""];
}

function mailBlock(bk) {
  const d = bk.service_date;
  return [
    SEP,
    `${d}（${["日","月","火","水","木","金","土"][new Date(d + "T00:00:00Z").getUTCDay()]}）　${fmtTime(d, bk.start_at)}〜`,
    `予約ID ${displayId(bk)}`,
    `　${courseCategory(bk.course)} ${bk.course_name}`,
    "",
    `合計 ${bk.total.toLocaleString("ja-JP")} 円`,
    SEP,
  ].join("\n");
}
// 店舗向けはお客様情報付きのブロック
function mailBlockStore(bk) {
  const d = bk.service_date;
  return [
    SEP,
    `${d}（${["日","月","火","水","木","金","土"][new Date(d + "T00:00:00Z").getUTCDay()]}）　${fmtTime(d, bk.start_at)}〜`,
    `予約ID ${displayId(bk)}`,
    `　${courseCategory(bk.course)} ${bk.course_name}`,
    "",
    `お名前 ${bk.name || "（未入力）"}`,
    `TEL ${bk.phone || "（未入力）"}`,
    `メール ${bk.email || "（未入力）"}`,
    `ご要望 ${bk.comment || "なし"}`,
    "",
    `合計 ${bk.total.toLocaleString("ja-JP")} 円`,
    SEP,
  ].join("\n");
}
const MAIL_COMMON = [
  "",
  "",
  "■ご予約内容に関するご質問やご不明な点がございましたら、ご利用の店舗までお問い合わせください。",
  "",
  "■このサービスは株式会社EPARKが運営・提供しております。",
  "EPARKはサービスのみを提供するものであり、店舗運営者との間のトラブル・紛争については一切責任を負いかねます。",
  "",
  "■このメールは送信専用のメールアドレスから配信されています。",
  "ご返信いただいても返信内容の確認およびご返答ができませんのでご了承ください。",
  "",
  "■このメールにお心当たりがない場合には、お手数ですが、システムサポートまでお知らせください。",
  "システムサポート：pm-support@epark-r.jp",
  SEP,
  MAIL_STORE,
  MAIL_ADDR,
  MAIL_TEL,
].join("\n");

// ---- 予約のメール文面（完了・リマインド・変更・取消／お客様・店舗） ----
// 文面は従来とまったく同じ。回数券を使った予約だけは、予約時に本文を固定せず、
// 送信直前にこの関数で作り直す（回数券の行が送信時点の最新の残り回数・有効期限になる）
const BOOKING_MAIL = {
  customerConfirm: (bk) => ({ subject: `${MAIL_STORE} ご予約内容確認`,
    body: bookingCustomerBody(bk, `この度は「${MAIL_STORE}」にご予約いただきありがとうございます。`) }),
  // リマインド（来店前のご案内）は予約完了メールの使い回しではなく専用の文面。
  // 送信直前にその予約の最新データ（日時・メニュー・担当・料金・回数券）から作る
  customerRemind: (bk) => ({ subject: `${MAIL_STORE} ご予約リマインド`, body: bookingRemindBody(bk) }),
  storeNotify: (bk) => ({ subject: `${MAIL_STORE} 新規予約のお知らせ（予約ID ${displayId(bk)}）`,
    body: bookingStoreBody(bk, `「${MAIL_STORE}」に新しいご予約が入りました。`) }),
  storeRemind: (bk) => ({ subject: `${MAIL_STORE} 本日のご予約リマインド（予約ID ${displayId(bk)}）`,
    body: bookingStoreBody(bk, `本日のご予約のリマインドです。`) }),
  customerChange: (bk) => ({ subject: `${MAIL_STORE} ご予約内容変更のお知らせ`,
    body: [
      `いつも「${MAIL_STORE}」をご利用いただきありがとうございます。`,
      "この度、以下の内容にご予約を変更いたしましたのでご案内いたします。",
      "",
      mailBlock(bk),
      ...ticketMailLinesCustomer(bk),
      "ご来店を心よりお待ちしております。",
    ].join("\n") + MAIL_COMMON }),
  // 変更後に積み直すリマインドも、通常のリマインドと同じ専用テンプレート（以前は簡略版だった）
  customerChangeRemind: (bk) => ({ subject: `${MAIL_STORE} ご予約リマインド`, body: bookingRemindBody(bk) }),
  storeChange: (bk) => ({ subject: `${MAIL_STORE} ご予約変更のお知らせ（予約ID ${displayId(bk)}）`,
    body: [`「${MAIL_STORE}」のご予約が変更されました。`, "変更後のご予約内容は以下のとおりです。", "", mailBlockStore(bk), ...ticketMailLinesStore(bk)].join("\n") + MAIL_COMMON }),
  storeChangeRemind: (bk) => ({ subject: `${MAIL_STORE} 本日のご予約リマインド（予約ID ${displayId(bk)}）`,
    body: bookingStoreBody(bk, `本日のご予約のリマインドです。`) }),
  customerCancel: (bk) => ({ subject: `${MAIL_STORE} ご予約キャンセルのご案内`,
    body: [
      `いつも「${MAIL_STORE}」をご利用いただきありがとうございます。`,
      "この度、以下のご予約を取り消しましたのでご案内いたします。",
      "",
      mailBlock(bk),
      ...ticketMailLinesCustomer(bk),
      "取り消したご予約は、マイページでご確認いただけます ⇒",
      bookingMypageUrl(bk), // マイページのこの予約へ直接移動（ログイン不要）
      "",
      "またのご利用を心よりお待ちしております。",
      `${origin()}/cn-ueno-health-and-beauty`,
    ].join("\n") + MAIL_COMMON }),
  storeCancel: (bk) => ({ subject: `${MAIL_STORE} ご予約キャンセルのお知らせ（予約ID ${displayId(bk)}）`,
    body: [`「${MAIL_STORE}」のご予約がキャンセルされました。`, "取り消したご予約内容は以下のとおりです。", "", mailBlockStore(bk), ...ticketMailLinesStore(bk)].join("\n") + MAIL_COMMON }),
};
// お客様が予約を確認・取消できるマイページのURL（予約ID＋予約ごとの合言葉。ログイン不要で開ける）
function bookingMypageUrl(bk) {
  return bk.customer_token
    ? `${origin()}/mypage?id=${encodeURIComponent(bk.id)}&token=${encodeURIComponent(bk.customer_token)}`
    : `${origin()}/mypage`;
}
// その予約の今の担当スタッフ（台帳の割当から取得。管理画面で担当を変えれば変更後の名前になる）
function bookingStaffLine(bk) {
  const found = findBooking(bk.id);
  const ev = found ? ensureEvents(found.date) : null;
  const ids = ev ? ev.assignments.filter((a) => a.booking_id === bk.id).map((a) => a.staff_id) : [];
  const nameOf = (id) => { const st = state.staff.find((s) => s.id === id); return st ? (profileOf(st).nickname || st.name) : null; };
  if (bk.nominated_staff_id) {
    const others = ids.filter((id) => id !== bk.nominated_staff_id).map(nameOf).filter(Boolean);
    const nom = nameOf(bk.nominated_staff_id) || bk.nominated_staff_name || "";
    return `担当スタッフ ${nom}（ご指名）` + (others.length ? `、${others.join("、")}` : "");
  }
  const names = ids.map(nameOf).filter(Boolean);
  return names.length ? `担当スタッフ ${names.join("、")}` : null;
}
// 料金の内訳（すべて予約データに保存された確定値から作る。合計は予約の合計金額そのもの）
function bookingPriceLines(bk) {
  const people = bk.people || 1;
  const base = (bk.base_price || 0) * people;
  const fee = bk.nomination_fee || 0;
  const late = bk.total - base - fee; // 深夜料金（予約作成・担当変更時にシステムが計算した分）
  if (late < 0) return [`合計 ${bk.total.toLocaleString("ja-JP")} 円`]; // 内訳が合わない古いデータは合計のみ
  const lines = [];
  if (bk.ticket_id) lines.push("コース料金 回数券でお支払い（1回分）");
  else lines.push(`コース料金 ${(bk.base_price || 0).toLocaleString("ja-JP")} 円` + (people > 1 ? ` × ${people}名` : ""));
  if (fee > 0) lines.push(`指名料 ${fee.toLocaleString("ja-JP")} 円`);
  if (late > 0) lines.push(`深夜料金 ${late.toLocaleString("ja-JP")} 円`);
  lines.push(`合計 ${bk.total.toLocaleString("ja-JP")} 円`);
  return lines;
}
// リマインド（来店前のご案内）の本文。構成は従来のリマインドを土台に、
// お客様名・終了時刻と施術時間・人数・担当スタッフ・料金内訳・お支払い・ご来店場所・
// 予約サイトの「ご来店に際しての注意事項」を、すべて予約・店舗・利用規約の内容どおりに載せる
function bookingRemindBody(bk) {
  const d = bk.service_date;
  const minutes = Math.round((bk.end_at - bk.start_at) / 60000);
  const staffLine = bookingStaffLine(bk);
  const payLines = bk.total > 0
    ? [
      "合計金額は、ご来店時に店頭にてお支払いください。",
      "現金以外（クレジットカード、電子マネー、QRコード決済等）でのお支払いの場合は、利用規約によりお支払い金額の5％を決済手数料として申し受けます（現金でのお支払いには決済手数料はかかりません）。",
    ]
    : ["今回のご予約は回数券でのお支払いです。"];
  return [
    `${bk.name} 様`,
    "",
    "ご予約日が近づいてまいりましたのでご案内いたします。",
    "今回のご予約内容は以下のとおりです。",
    "",
    SEP,
    `${d}（${["日","月","火","水","木","金","土"][new Date(d + "T00:00:00Z").getUTCDay()]}）　${fmtTime(d, bk.start_at)}〜${fmtTime(d, bk.end_at)}（${minutes}分）`,
    `予約ID ${displayId(bk)}`,
    `　${courseCategory(bk.course)} ${bk.course_name}`,
    `人数 ${bk.people || 1}名`,
    ...(staffLine ? [staffLine] : []),
    "",
    ...bookingPriceLines(bk),
    SEP,
    ...ticketMailLinesCustomer(bk),
    "■お支払いについて",
    ...payLines,
    "",
    "■ご来店場所",
    MAIL_STORE,
    MAIL_ADDR,
    `地図・アクセス ⇒ ${origin()}/map`,
    "",
    "ご来店を心よりお待ちしております。",
    "",
    "■開始時間に遅れる場合は、お電話にてご連絡ください。",
    MAIL_TEL,
    "",
    "■ご来店に際しての注意事項",
    "ご予約の変更や遅刻される場合は、事前にご連絡いただけますと幸いです。",
    `ご連絡先：${VISIT_CONTACT_MAIL}`,
    "",
    "■ご予約内容の変更は、一度予約のキャンセルを行っていただき、再度予約を取り直してください。",
    "※混雑状況によっては、再予約ができないことがございます。あらかじめご了承ください。",
    "※会員登録（ログイン）されている方は、マイページから日時の変更も行えます。",
    "ご予約の確認・キャンセルはこちら ⇒",
    bookingMypageUrl(bk),
  ].join("\n") + MAIL_COMMON;
}
// 予約サイトの「ご来店に際しての注意事項」に載せている連絡先（予約画面と同じ）
const VISIT_CONTACT_MAIL = "cnsalon2021@gmail.com";
// リマインドを送る時刻（お客様：来店24時間前／店舗：来店日の9:00）。予約時点で過ぎていれば即時
function remindDueAt(bk, kind) {
  return kind === "store" ? dayStartMs(bk.service_date) + 9 * 3600e3 : bk.start_at - 24 * 3600e3;
}
function bookingCustomerBody(bk, lead) {
  const cancelUrl = bookingMypageUrl(bk);
  return [
    lead,
    "今回のご予約内容は以下のとおりです。",
    "",
    mailBlock(bk),
    ...ticketMailLinesCustomer(bk),
    "ご来店を心よりお待ちしております。",
    "",
    "■開始時間に遅れる場合は、お電話にてご連絡ください。",
    MAIL_TEL,
    "",
    "■ご予約内容の変更は、一度予約のキャンセルを行っていただき、再度予約を取り直してください。",
    "※混雑状況によっては、再予約ができないことがございます。あらかじめご了承ください。",
    "予約のキャンセルはこちら ⇒",
    cancelUrl, // 末尾に余計な記号を付けない（テキストメールでもURLが壊れないように）
  ].join("\n") + MAIL_COMMON;
}
function bookingStoreBody(bk, lead) {
  return [
    lead,
    "ご予約内容は以下のとおりです。",
    "",
    mailBlockStore(bk),
    ...ticketMailLinesStore(bk),
  ].join("\n") + MAIL_COMMON;
}
// 予約のメールを1通キューに積む。「送信直前に最新データで作り直す」指定を付けるのは：
//  ・リマインド（すべての予約）…送る時点の日時・担当・料金・取消状況で作る／取消済み・来店後・重複は送らない
//  ・回数券を使った予約のその他のメール…回数券の行を最新の残り回数・有効期限で作る
// 回数券を使わない予約の完了・変更・取消メールは、従来どおり即時に送る文面のまま
function queueBookingMail(kind, type, to, variant, bk, at) {
  const b = BOOKING_MAIL[variant](bk);
  const tpl = (type === "remind" || bk.ticket_id) ? { name: "booking", variant, bookingId: bk.id } : undefined;
  return queueMail(kind, type, to, b.subject, b.body, at, bk.id, tpl);
}

// 予約確定時：完了メール（お客様）＋新規予約通知（店舗）＋双方のリマインドを予約する
function queueBookingMails(bk) {
  const now = Date.now();
  if (bk.email) {
    queueBookingMail("customer", "confirm", bk.email, "customerConfirm", bk, now);
    queueBookingMail("customer", "remind", bk.email, "customerRemind", bk, Math.max(now, bk.start_at - 24 * 3600e3));
  }
  queueBookingMail("store", "notify", STORE_MAIL, "storeNotify", bk, now);
  queueBookingMail("store", "remind", STORE_MAIL, "storeRemind", bk, Math.max(now, dayStartMs(bk.service_date) + 9 * 3600e3));
  deliverDueMails();
}

// 変更・取消時：まだ送信していないリマインドを破棄する（送信済みのものは記録として残す）
function dropPendingReminders(bookingId) {
  deliverDueMails();
  state.mails = state.mails.filter((m) =>
    !(m.bookingId === bookingId && m.type === "remind" && (m.status === "pending" || m.status === "sending")));
}

function queueChangeMails(bk) {
  dropPendingReminders(bk.id);
  const now = Date.now();
  if (bk.email) {
    queueBookingMail("customer", "change", bk.email, "customerChange", bk, now);
    queueBookingMail("customer", "remind", bk.email, "customerChangeRemind", bk, Math.max(now, bk.start_at - 24 * 3600e3));
  }
  queueBookingMail("store", "change", STORE_MAIL, "storeChange", bk, now);
  queueBookingMail("store", "remind", STORE_MAIL, "storeChangeRemind", bk, Math.max(now, dayStartMs(bk.service_date) + 9 * 3600e3));
  deliverDueMails();
}

function queueCancelMails(bk) {
  dropPendingReminders(bk.id);
  const now = Date.now();
  if (bk.email) queueBookingMail("customer", "cancel", bk.email, "customerCancel", bk, now);
  queueBookingMail("store", "cancel", STORE_MAIL, "storeCancel", bk, now);
  deliverDueMails();
}

// 送信予定時刻を過ぎたメール（リマインド等）を、アクセスが無くても毎分自動送信する
const mailTimer = setInterval(deliverDueMails, 60000);
if (mailTimer.unref) mailTimer.unref();

function mailSummary() {
  deliverDueMails();
  const counts = { pending: 0, sending: 0, accepted: 0, failed: 0, skipped: 0 };
  for (const m of state.mails) {
    if (m.status === "sent") counts.accepted++;
    else counts[m.status] = (counts[m.status] || 0) + 1;
  }
  return Object.entries(counts).map(([status, count]) => ({ status, count }));
}

// ---- 予約サイト用の公開API（管理画面と同じデータを参照） -----------------

// コース名からの性別指定（予約サイト側と同じ判定）
function courseGender(courseId) {
  const name = getCourse(courseId)?.name || "";
  return name.includes("女性") ? "female" : name.includes("男性") ? "male" : "none";
}

function staffCanDo(st, courseId) {
  const list = JSON.parse(st.courses || "[]");
  return list.length === 0 || list.includes(courseId);
}

// コース名に性別指定がある場合は、リクエストの希望より優先する
// （画面を経由しないPOSTでも、女性コースが男性スタッフに割り当たらないようにする）
function effectivePref(courseId, pref) {
  const g = courseGender(courseId);
  return g !== "none" ? g : pref;
}

function profileOf(st) {
  try { return JSON.parse(st.profile || "{}"); } catch { return {}; }
}

// 指名候補スタッフ一覧（受付中・個人指名あり・コース対応・性別条件）
function nominatableStaff(courseId, genderPref) {
  return state.staff
    .filter((st) => st.active === 1 && !st.locked && staffCanDo(st, courseId))
    .filter((st) => genderPref === "none" || st.gender === genderPref)
    .filter((st) => profileOf(st).personalNomination)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((st) => {
      const pr = profileOf(st);
      return {
        id: st.id,
        name: pr.nickname || st.name,
        nominationFee: Number(pr.nominationFee) || 0,
        revision: st.profile_revision || 0,
        hasPhoto: state.photos.has(st.id),
        message: pr.message || "",
      };
    });
}

// 指定時間帯に施術できるスタッフID一覧
// 対応メニュー→シフト内→休憩・業務→既存予約→受付停止（鍵）をすべて満たす人だけを返す
function freeStaffIds(date, startMin, endMin, courseId, genderPref, ignoreBookingId) {
  const shifts = ensureShifts(date);
  const ev = ensureEvents(date);
  const busy = (staffId) => {
    const items = [
      ...ev.bookings.filter((b) => b.status === "confirmed" && b.id !== ignoreBookingId && ev.assignments.some((a) => a.booking_id === b.id && a.staff_id === staffId)),
      ...ev.blocks.filter((b) => b.staff_id === staffId),
    ];
    return items.some((it) => msToMin(date, it.start_at) < endMin && msToMin(date, it.end_at) > startMin);
  };
  return state.staff
    .filter((st) => st.active === 1 && !st.locked && staffCanDo(st, courseId))
    .filter((st) => genderPref === "none" || st.gender === genderPref)
    .filter((st) => {
      const sh = shifts.find((x) => x.staff_id === st.id);
      return sh && msToMin(date, sh.start_at) <= startMin && endMin <= msToMin(date, sh.end_at);
    })
    .filter((st) => !busy(st.id))
    .map((st) => st.id);
}

// ---- ホットペッパー連携の中核（API受信とメール取込の両方から使う） --------------
function hpLogIt(entry) {
  state.hpLog.unshift({ at: new Date().toISOString(), ...entry });
  state.hpLog.length = Math.min(state.hpLog.length, 50);
}

// 予約通知1件を台帳へ反映する（成功: {status:200,json:{ok:true,...}}、失敗: 4xx/409）
function hpNotify(b, via) {
  const failed = (code, error, extra = {}) => {
    hpLogIt({ via, result: "拒否", error, ...extra });
    return { status: code, json: { error } };
  };
  const rid = String(b.reservationId || "").trim();
  if (!rid) return failed(400, "invalid", { note: "reservationIdなし" });

  if (b.action === "cancel") {
    const bid = state.hpKeys.get(rid);
    const d0 = bid && state.bookingIndex.get(bid);
    const bk0 = d0 && ensureEvents(d0).bookings.find((x) => x.id === bid);
    if (!bk0) return failed(404, "notFound", { rid });
    if (bk0.status === "confirmed") {
      bk0.status = "cancelled";
      bk0.cancelled = true;
      ensureDay(d0).version++; sseTouch();
    }
    hpLogIt({ via, result: "取消", rid, date: d0 });
    return { status: 200, json: { ok: true, cancelled: true } };
  }

  if (state.hpKeys.has(rid)) return { status: 200, json: { ok: true, id: state.hpKeys.get(rid), duplicated: true } };

  const date = String(b.date || "");
  const minutes = Math.round(Number(b.minutes));
  const price = Math.round(Number(b.price));
  const name = String(b.name || "").trim();
  const menu = String(b.menu || "").trim();
  let start = b.start;
  if (typeof start === "string" && /^\d{1,2}:\d{2}$/.test(start)) {
    const [h, mi] = start.split(":").map(Number);
    start = h * 60 + mi;
  }
  start = Math.round(Number(start));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name || !menu ||
      !(minutes >= 10 && minutes <= 600) || !(price >= 0) ||
      !(Number.isInteger(start) && start % 5 === 0)) return failed(400, "invalid", { rid });
  const end = start + minutes;
  if (start < 600 || end > 1620) return failed(400, "outsideHours", { rid });
  const today = todayJst();
  if (date < today || date > addDays(today, 84)) return failed(400, "invalid", { rid, note: "受付範囲外の日付" });
  if (!ensureDay(date).enabled) return failed(409, "closed", { rid });

  const course = [...courseStore.values()].find((c) => c.name === menu) || null;
  const gender = course ? courseGender(course.id) : (menu.includes("女性") ? "female" : menu.includes("男性") ? "male" : "none");
  let candidates = state.staff
    .filter((st) => st.active === 1 && !st.locked)
    .filter((st) => (course ? staffCanDo(st, course.id) : true))
    .filter((st) => gender === "none" || st.gender === gender)
    .filter((st) => withinShift(date, st.id, start, end) && !overlaps(date, st.id, start, end))
    .sort((a, c) => a.sort_order - c.sort_order);
  const wantName = String(b.staffName || "").trim();
  if (wantName) candidates = candidates.filter((st) => st.name === wantName);
  if (!candidates.length) return failed(409, "slotTaken", { rid, date, time: fmtTime2(start) + "〜" + fmtTime2(end), menu });

  const assignee = candidates[0];
  state.bookingSerial++;
  const id = "hp-" + state.bookingSerial;
  const ev = ensureEvents(date);
  ev.bookings.push({
    id, reference: rid, service_date: date, status: "confirmed",
    start_at: minToMs(date, start), end_at: minToMs(date, end),
    people: 1, course: course ? course.id : "", course_name: menu, course_label: menu,
    name, email: String(b.email || ""), phone: String(b.phone || ""),
    comment: String(b.comment || ""),
    total: price, base_price: price, paid_amount: 0,
    nomination_fee: 0, nominated_staff_id: null, nominated_staff_name: null,
    staff: "none", customer_token: null,
    source: "hotpepper", booth: "HP",
    created_label: (() => {
      const n = new Date(Date.now() + 9 * 3600e3);
      return n.toISOString().slice(0, 10) + " " + n.toISOString().slice(11, 16) + " HP";
    })(),
    customer_gender: gender === "female" ? "f" : gender === "male" ? "m" : "",
    is_new: isRepeatEmail(String(b.email || "")) ? 0 : 1,
  });
  ev.assignments.push({ booking_id: id, staff_id: assignee.id });
  state.bookingIndex.set(id, date);
  state.hpKeys.set(rid, id);
  ensureDay(date).version++; sseTouch();
  hpLogIt({ via, result: "受信", rid, date, time: fmtTime2(start) + "〜" + fmtTime2(end), menu, price, name, staff: assignee.name });
  return { status: 200, json: { ok: true, id, staff: assignee.name } };
}

// 予約通知メールの本文から予約内容を取り出す（表記ゆれにある程度耐える）
function parseHpMail(subject, text) {
  const t = String(text || "").replace(/\r/g, "");
  const pick = (re) => { const m = t.match(re); return m ? m[1].trim() : ""; };
  const rid = pick(/(?:予約番号|予約No\.?|受付番号)[：:\s]*([A-Za-z0-9-]+)/);
  // 来店日時：2026/09/29 15:00 ／ 2026年9月29日 15:00 の両方に対応
  let date = "", start = "";
  let m = t.match(/(?:来店日時|ご来店日時|日時|予約日時)[：:\s]*(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})日?[（(]?[^\d]*?(\d{1,2}):(\d{2})/);
  if (m) {
    date = `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
    start = `${m[4]}:${m[5]}`;
  }
  const menu = pick(/(?:メニュー|クーポン・メニュー|ご利用メニュー)[：:\s]*([^\n]+)/);
  const priceS = pick(/(?:合計金額|合計|料金|金額)[：:\s]*[¥￥]?([\d,]+)/);
  const name = pick(/(?:氏名|お名前|ご予約者)[：:\s]*([^\n]+)/).replace(/\s*様$/, "");
  const phone = pick(/(?:電話番号|TEL)[：:\s]*([\d\-+ ]+)/);
  const minS = pick(/(\d{2,3})分/) || (menu.match(/(\d{2,3})分/) || [])[1] || "";
  if (!rid || !date || !start || !menu || !name) return null;
  return {
    reservationId: rid, date, start,
    minutes: Number(minS) || 60,
    menu, price: Number(priceS.replace(/,/g, "")) || 0,
    name, phone,
  };
}

// RFC2047のSubject（=?UTF-8?B?...?= など）を復号する（UTF-8のB/Q対応）
function decodeMimeWord(s) {
  return String(s || "").replace(/=\?utf-8\?([bq])\?([^?]+)\?=/gi, (all, enc, data) => {
    try {
      if (enc.toLowerCase() === "b") return Buffer.from(data, "base64").toString("utf8");
      return Buffer.from(data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (x, h) => String.fromCharCode(parseInt(h, 16))), "binary").toString("utf8");
    } catch { return all; }
  });
}

// MIMEメール本文から text/plain パートを取り出して復号する
// （multipart/alternative＋base64/quoted-printable のよくある構成に対応）
function extractMailText(raw) {
  const t = String(raw || "");
  const decodePart = (headers, body) => {
    const cte = (headers.match(/Content-Transfer-Encoding:\s*([\w-]+)/i) || [])[1] || "";
    let out = body;
    if (/base64/i.test(cte)) {
      try { out = Buffer.from(body.replace(/[^A-Za-z0-9+\/=]/g, ""), "base64").toString("utf8"); } catch {}
    } else if (/quoted-printable/i.test(cte)) {
      const bytes = [];
      const src = body.replace(/=\r?\n/g, "");
      for (let i = 0; i < src.length; i++) {
        if (src[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
          bytes.push(parseInt(src.slice(i + 1, i + 3), 16));
          i += 2;
        } else bytes.push(src.charCodeAt(i) & 0xff);
      }
      out = Buffer.from(bytes).toString("utf8");
    }
    return out;
  };
  // text/plain パートを探す（ヘッダ→空行→本文→次の境界）
  const m = t.match(/Content-Type:\s*text\/plain[^]*?\r?\n\r?\n([^]*?)(?:\r?\n--|$)/i);
  if (m) {
    const headStart = t.lastIndexOf("Content-Type: text/plain", t.indexOf(m[1]));
    const headers = t.slice(Math.max(0, headStart), t.indexOf(m[1]));
    return decodePart(headers, m[1]);
  }
  // マルチパートでない場合：全体をそのまま（base64一括にも耐える）
  if (/^[A-Za-z0-9+\/=\r\n]+$/.test(t.trim()) && t.trim().length > 80) {
    try { return Buffer.from(t.replace(/\s+/g, ""), "base64").toString("utf8"); } catch {}
  }
  return decodePart(t.slice(0, 400), t);
}

// 最小限のIMAPクライアント：未読メールから予約通知を探して取り込む
// done(err, {checked, imported, results})
function imapPollHotpepper(done) {
  const cfg = loadMailConfig();
  const hp = cfg && cfg.hotpepper;
  if (!cfg || !hp || !hp.enabled) return done(new Error("mailConfigMissing"));
  const subjFilter = String(hp.subjectFilter || "予約");
  const host = hp.imapHost || "imap.gmail.com";
  const port = Number(hp.imapPort) || 993;
  // 通知の受信箱は送信用Gmailと別アカウントでもよい（サロンボードの通知先に合わせられる）
  const imapUser = hp.imapUser || cfg.user;
  const imapPass = hp.imapPass || cfg.pass;
  // 直近2日分を走査する（自分宛テスト送信のように既読で届くメールも拾える。
  // 予約の重複は reservationId で防ぐため、同じメールを再解析しても安全）
  const d2 = new Date(Date.now() - 2 * 86400000);
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const sinceStr = `${d2.getUTCDate()}-${MON[d2.getUTCMonth()]}-${d2.getUTCFullYear()}`;
  const sock = tls.connect({ host, port, servername: host }, () => {});
  sock.setTimeout(25000, () => { sock.destroy(); done(new Error("imapTimeout")); });
  let buf = Buffer.alloc(0);
  let step = 0;
  let tagN = 0;
  let pendingTag = "";
  let collected = "";
  let ids = [];
  let idx = -1;
  let current = null;
  const results = [];
  let finished = false;
  const finish = (err, res) => { if (finished) return; finished = true; try { sock.end(); } catch {} done(err, res); };
  const send = (cmd) => {
    pendingTag = "a" + (++tagN);
    collected = "";
    sock.write(pendingTag + " " + cmd + "\r\n");
  };
  const markSeenUid = (id2) => {
    state.hpSeenUids.add(id2);
    if (state.hpSeenUids.size > 500) state.hpSeenUids = new Set([...state.hpSeenUids].slice(-300));
  };
  const nextMail = () => {
    idx++;
    while (idx < ids.length && state.hpSeenUids.has(ids[idx])) idx++;
    if (idx >= ids.length) { step = 90; send("LOGOUT"); return; }
    current = { id: ids[idx], subject: "", body: "" };
    step = 40;
    send(`FETCH ${current.id} (BODY.PEEK[HEADER.FIELDS (SUBJECT)])`);
  };
  sock.on("error", (e) => finish(e));
  sock.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    const text = buf.toString("utf8");
    const lines = text.split("\r\n");
    const doneLine = lines.find((l) => l.startsWith(pendingTag + " "));
    if (step === 0) {
      if (!text.includes("\r\n")) return;
      buf = Buffer.alloc(0);
      step = 10;
      send(`LOGIN "${imapUser}" "${imapPass}"`);
      return;
    }
    if (!doneLine) return;
    collected = text;
    buf = Buffer.alloc(0);
    if (/^a\d+ (NO|BAD)/.test(doneLine)) {
      if (step === 40 || step === 50) { markSeenUid(current.id); nextMail(); return; }
      finish(new Error("imap:" + doneLine.slice(0, 80)));
      return;
    }
    if (step === 10) { step = 20; send("SELECT INBOX"); return; }
    if (step === 20) { step = 30; send(`SEARCH SINCE ${sinceStr}`); return; }
    if (step === 30) {
      const m = collected.match(/\* SEARCH([\d ]*)/);
      ids = m ? m[1].trim().split(/ +/).filter(Boolean).slice(-25) : [];
      idx = -1;
      nextMail();
      return;
    }
    if (step === 40) {
      const sm = collected.match(/Subject:\s*([^\r\n]*(?:\r?\n[ \t][^\r\n]*)*)/i);
      current.subject = decodeMimeWord((sm ? sm[1] : "").replace(/\r?\n[ \t]/g, ""));
      if (!current.subject.includes(subjFilter)) { markSeenUid(current.id); nextMail(); return; }
      step = 50;
      send(`FETCH ${current.id} (BODY.PEEK[TEXT])`);
      return;
    }
    if (step === 50) {
      const rawBody = collected.replace(/^\* \d+ FETCH[^\n]*\n/, "").replace(/\)\r\n?a\d+ OK[^]*$/, "");
      const body = extractMailText(rawBody);
      const parsed = parseHpMail(current.subject, body);
      markSeenUid(current.id);
      if (parsed) {
        const out = hpNotify(parsed, "メール");
        results.push({ id: current.id, subject: current.subject.slice(0, 60), status: out.status,
          imported: out.status === 200 && !out.json.duplicated });
      }
      nextMail();
      return;
    }
    if (step === 90) { finish(null, { checked: ids.length, imported: results.filter((r) => r.imported).length, results }); }
  });
}

// 予約通知メールの自動取り込み（毎分）。テスト用サーバーでは HP_MAIL=1 のときだけ動かす
const HP_MAIL_ON = (() => {
  const c = loadMailConfig();
  if (!c || !c.hotpepper || !c.hotpepper.enabled) return false;
  if (process.env.HP_MAIL === "0") return false;
  if (process.env.PORT && process.env.HP_MAIL !== "1") return false;
  return true;
})();
if (HP_MAIL_ON) {
  const hpTimer = setInterval(() => imapPollHotpepper(() => {}), 60000);
  if (hpTimer.unref) hpTimer.unref();
}

// 分（600=10:00、1620=27:00）を「HH:MM」表記にする（24時以降もそのまま 25:30 等で表す）
function fmtTime2(min) {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

function nowMinJst() {
  const t = todayJst();
  return Math.round((Date.now() - dayStartMs(t)) / 60000);
}

function getAvailability(q) {
  const courseId = q.get("course");
  const date = q.get("date");
  const people = Number(q.get("people"));
  const pref = q.get("staff") || "none";
  const staffId = q.get("staffId") || "";
  const course = getCourse(courseId);
  const today = todayJst();
  if (!course || !/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !(people >= 1 && people <= 3) ||
      !["none", "male", "female"].includes(pref)) throw err(400, "invalid");
  const dur = course.minutes;
  const gpref = effectivePref(courseId, pref); // コース名の性別指定を優先
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(date, i);
    const day = ensureDay(d);
    const open = day.enabled && d >= today && d <= addDays(today, 84);
    const slots = [];
    // 店舗マスタの「予約開始時間〜予約締切時間」の範囲だけ受け付ける（終了が27:00を超える枠は不可）
    const sm = state.settings.shopMaster;
    const mFrom = Math.max(600, sm.resStart);
    const mTo = Math.min(sm.resEnd, 1620 - dur);
    for (let m = mFrom; m <= mTo; m += 10) {
      // 受付対象外（受付停止日・過ぎた時間）は枠自体を返さず、画面では「－」表示にする
      if (!open) continue;
      if (d === today && m <= nowMinJst()) continue;
      const free = freeStaffIds(d, m, m + dur, courseId, gpref);
      const ok = free.length >= people && (!staffId || free.includes(staffId));
      slots.push({ minute: m, available: ok, start: minToMs(d, m) });
    }
    days.push({ date: d, enabled: day.enabled, slots });
  }
  return { staff: nominatableStaff(courseId, gpref), days };
}

// 同じメールアドレスの予約が既にあれば「リピート」扱いにする
function isRepeatEmail(email) {
  if (!email) return false;
  const e = email.toLowerCase();
  for (const ev of state.events.values()) {
    if (ev.bookings.some((b) => (b.email || "").toLowerCase() === e)) return true;
  }
  return false;
}

function createPublicBooking(body, member) {
  const course = getCourse(body.course);
  // 日時変更（ログイン会員のみ）：元の予約が本人のもの・予約中・開始前であることを先に確認し、
  // 新しい予約が成立した直後に元の予約を取り消す（成立しなければ元の予約はそのまま残る）
  let reschedule = null;
  if (body.rescheduleId) {
    if (!member) throw err(401, "loginRequired");
    const found = findBooking(String(body.rescheduleId));
    if (!found || found.bk.member_email !== member.email) throw err(404, "notFound");
    if (found.bk.status !== "confirmed") throw err(409, "alreadyCancelled");
    if (found.bk.start_at <= Date.now()) throw err(409, "tooLate");
    reschedule = found;
  }
  const date = body.date;
  const people = Number(body.people);
  const pref = ["none", "male", "female"].includes(body.staff) ? body.staff : "none";
  const staffId = String(body.staffId || "");
  if (String(body.website || "")) throw err(400, "invalid"); // ボット対策の隠し欄
  if (!course || !/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !(people >= 1 && people <= 3) ||
      body.consent !== true || !String(body.name || "").trim() || !String(body.email || "").trim() ||
      !String(body.phone || "").trim()) throw err(400, "invalid");
  // フリーメッセージ欄の設定（表示・必須・文字数）はサーバー側でも強制する
  const fm = state.settings.freeMessage;
  let comment = fm.visible ? String(body.comment || "").slice(0, fm.maxLength || 2000) : "";
  if (fm.visible && fm.required && !comment.trim()) throw err(400, "invalid");
  const today = todayJst();
  if (date < today || date > addDays(today, 84)) throw err(400, "invalid");
  if (!ensureDay(date).enabled) throw err(409, "soldOut");
  const m = Math.round((Number(body.start) - dayStartMs(date)) / 60000);
  // 予約開始時間〜予約締切時間（店舗マスタの業務設定）の範囲外は受け付けない
  const smB = state.settings.shopMaster;
  const mMax = Math.min(smB.resEnd, 1620 - course.minutes);
  if (!(Number.isInteger(m) && m >= Math.max(600, smB.resStart) && m <= mMax && m % 5 === 0)) throw err(400, "invalid");
  if (date === today && m <= nowMinJst()) throw err(409, "soldOut");

  // 多重送信は同じ結果を返す
  const rk = String(body.requestKey || "");
  if (rk && state.requestKeys.has(rk)) return state.requestKeys.get(rk);

  const gpref = effectivePref(body.course, pref); // コース名の性別指定を優先
  let nominated = null;
  if (staffId) {
    nominated = nominatableStaff(body.course, gpref).find((st) => st.id === staffId);
    if (!nominated) throw err(409, "staffUnavailable");
    if (Number(body.expectedNominationFee) !== nominated.nominationFee) throw err(409, "priceChanged");
  }
  const dur = course.minutes;
  const free = freeStaffIds(date, m, m + dur, body.course, gpref);
  if (free.length < people || (staffId && !free.includes(staffId))) throw err(409, "soldOut");

  const assignee = staffId || free[0];

  // 回数券の利用（任意）。検証→予約成立の直前に消費、の順で行い、
  // 消費に失敗した場合は予約自体を作らない（フロントの残数表示は一切信用しない）
  let useTicket = null;
  if (body.ticketId) {
    if (people !== 1) throw err(400, "invalid"); // 回数券は1名予約のみ
    useTicket = ticketForUse(body.ticketId, body.ticketToken, body.email, member);
  }

  state.bookingSerial++;
  const id = "web-" + state.bookingSerial + "-" + Math.random().toString(16).slice(2, 8);
  const token = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  const late = m >= 1320 ? 2000 * people : 0;
  const fee = nominated ? nominated.nominationFee : 0;
  const reference = "2472" + String(state.bookingSerial).padStart(5, "0");
  // ここで1回分を消費（同期処理なので同時リクエストでも残数は正確。残1で同時2件なら後の1件はここで拒否）
  const ticketLeft = useTicket ? consumeTicket(useTicket, id, reference) : null;
  const ev = ensureEvents(date);
  ev.bookings.push({
    id, reference,
    service_date: date, status: "confirmed",
    start_at: minToMs(date, m), end_at: minToMs(date, m + dur),
    people, course: body.course, course_name: course.name,
    name: String(body.name).slice(0, 120), email: String(body.email).slice(0, 254),
    phone: String(body.phone).slice(0, 40), comment,
    // 回数券利用時はコース料金を回数券でまかなう（深夜料金・指名料は通常どおり）
    total: (useTicket ? 0 : course.price * people) + late + fee,
    base_price: useTicket ? 0 : course.price,
    ticket_id: useTicket ? useTicket.id : null,
    ticket_name: useTicket ? useTicket.plan_name : null,
    ticket_left_after: ticketLeft,
    nomination_fee: fee, nominated_staff_id: nominated ? nominated.id : null,
    nominated_staff_name: nominated ? nominated.name : null,
    staff: pref, customer_token: token, language: String(body.language || "ja"),
    // 管理画面の表示用（作成日時・ブース・お客様性別・新規/リピート判定）
    created_label: (() => {
      const n = new Date(Date.now() + 9 * 3600e3);
      return n.toISOString().slice(0, 10) + " " + n.toISOString().slice(11, 16) + " WEB";
    })(),
    booth: "新規1(" + ((state.bookingSerial % 9) + 1) + ")",
    customer_gender: gpref === "female" ? "f" : gpref === "male" ? "m" : "",
    is_new: isRepeatEmail(String(body.email)) ? 0 : 1,
    sb_done: false, // サロンボードへの転記状態（自社予約はHP側の枠も塞ぐ必要がある）
  });
  // 複数名の予約は、対応可能で空いているスタッフを人数分確保する（空き判定と同じ条件）
  const coAssignees = free.filter((sid) => sid !== assignee).slice(0, people - 1);
  for (const sid of [assignee, ...coAssignees]) ev.assignments.push({ booking_id: id, staff_id: sid });
  state.bookingIndex.set(id, date);
  const newBk = ev.bookings.find((b) => b.id === id);
  if (member) memberAttachBooking(member, newBk); // ログイン中なら会員の予約として記録（マイページに出る）
  queueBookingMails(newBk); // 完了メール＋通知＋双方のリマインド
  ensureDay(date).version++; sseTouch();
  // 日時変更：新しい予約が成立したので元の予約を取り消す（回数券は返却→新予約で再使用済み）
  if (reschedule) {
    newBk.rescheduled_from = reschedule.bk.id;
    cancelBooking(reschedule.bk, reschedule.date);
  }
  const result = useTicket ? { id, token, ticketLeft } : { id, token };
  if (reschedule) result.rescheduledFrom = reschedule.bk.id;
  if (rk) state.requestKeys.set(rk, result);
  return result;
}

// 予約の取消（お客様用の共通処理。回数券の返却・メール・台帳の更新まで）
function cancelBooking(bk, date) {
  const ev2 = ensureEvents(date);
  if (bk.status !== "confirmed") throw err(409, "alreadyCancelled");
  if (bk.start_at <= Date.now()) throw err(409, "tooLate"); // 開始後は店舗にお電話で
  bk.status = "cancelled";
  ev2.assignments = ev2.assignments.filter((a) => a.booking_id !== bk.id);
  maybeRefundTicket(bk); // 回数券利用の予約は、開始前キャンセルに限り1回分を返却（冪等）
  queueCancelMails(bk);
  ensureDay(date).version++; sseTouch();
}

// お客様本人の予約かどうか（予約ごとのトークン、またはログイン中の会員本人）
function ownsBooking(bk, token, member) {
  if (!bk) return false;
  if (member && bk.member_email === member.email) return true;
  return !!(token && bk.customer_token && bk.customer_token === token);
}

function getPublicBooking(id, token, member) {
  const date = state.bookingIndex.get(id || "");
  if (!date) throw err(404, "notFound");
  const bk = ensureEvents(date).bookings.find((b) => b.id === id);
  if (!ownsBooking(bk, token, member)) throw err(404, "notFound");
  return {
    booking: {
      id: bk.id, reference: bk.reference, displayId: String(displayId(bk)), status: bk.status,
      ticket_name: bk.ticket_name || null, ticket_left_after: bk.ticket_left_after ?? null,
      language: bk.language || "ja", serviceDate: bk.service_date,
      start: bk.start_at, courseId: bk.course, courseName: bk.course_name,
      name: bk.name, people: bk.people, staff: bk.staff || "none",
      nominatedStaffName: bk.nominated_staff_name, nominationFee: bk.nomination_fee,
      total: bk.total,
    },
    notifications: (deliverDueMails(), state.mails)
      .filter((m) => m.bookingId === bk.id && (m.type === "confirm" || m.type === "notify"))
      .map((m) => ({ kind: m.kind, status: m.status === "sent" ? "accepted" : m.status === "failed" ? "failed" : "pending" })),
  };
}

// ---- 営業実績（日次管理）：予約・シフトの実データから集計する ----------

function confirmedBookings(date) {
  return ensureEvents(date).bookings.filter((b) => b.status === "confirmed");
}

// それ以前の日付に同じメールアドレスの予約があれば「リピータ」とみなす
function isRepeat(date, email) {
  if (!email) return false;
  for (const [d, ev] of state.events) {
    if (d >= date) continue;
    if (ev.bookings.some((b) => b.email === email)) return true;
  }
  return false;
}

function dayCounts(date) {
  const list = confirmedBookings(date);
  let visitors = 0, newCount = 0, repeatCount = 0, nominated = 0, online = 0;
  for (const b of list) {
    visitors += b.people;
    if (isRepeat(date, b.email)) repeatCount += b.people; else newCount += b.people;
    if (b.nominated_staff_id) nominated += b.people;
    if (String(b.id).startsWith("web-")) online++;
  }
  return { visitors, newCount, repeatCount, nominated, online, bookings: list.length };
}

function reportStats(date) {
  const list = confirmedBookings(date);
  const gross = list.reduce((s, b) => s + b.total, 0);
  const net = Math.round(gross / 1.1);
  const counts = dayCounts(date);
  // 当月累計（データがある日だけ集計。架空データは生成しない）
  const monthStart = date.slice(0, 8) + "01";
  let cumGross = 0, cumNet = 0;
  for (const [d, ev] of state.events) {
    if (d >= monthStart && d <= date) {
      const g = ev.bookings.filter((b) => b.status === "confirmed").reduce((s, b) => s + b.total, 0);
      cumGross += g;
    }
  }
  cumNet = Math.round(cumGross / 1.1);
  const dayN = Number(date.slice(8));
  const daysInMonth = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate();
  const forecast = dayN ? Math.round(cumNet / dayN * daysInMonth) : 0;
  // シフト状況
  const shifts = ensureShifts(date);
  const shiftMin = shifts.reduce((s, x) => s + (x.end_at - x.start_at) / 60000, 0);
  const ev = ensureEvents(date);
  let treatMin = 0;
  for (const b of list) {
    const n = ev.assignments.filter((a) => a.booking_id === b.id).length || 1;
    treatMin += (b.end_at - b.start_at) / 60000 * n;
  }
  const tomorrow = addDays(date, 1);
  const names = {};
  for (const st of state.staff) names[st.id] = st.name;
  const tomorrowShifts = ensureShifts(tomorrow)
    .map((x) => ({
      name: names[x.staff_id] || "",
      label: `${Number(tomorrow.slice(8))}日${fmtTime(tomorrow, x.start_at)}〜` +
        (msToMin(tomorrow, x.end_at) >= 1440
          ? `${Number(addDays(tomorrow, 1).slice(8))}日${fmtTime(addDays(tomorrow, 1), x.end_at)}`
          : `${Number(tomorrow.slice(8))}日${fmtTime(tomorrow, x.end_at)}`),
    }))
    .filter((x) => x.name);
  return {
    date,
    today: {
      salesNet: net, salesGross: gross, profit: net,
      ...counts,
      avgSpend: counts.visitors ? Math.round(gross / counts.visitors) : 0,
      cumNet, cumGross, forecast,
      shiftStaff: shifts.length, shiftMin, treatMin,
      utilization: shiftMin ? Math.round(treatMin / shiftMin * 1000) / 10 : 0,
    },
    tomorrow: { ...dayCounts(tomorrow), shifts: tomorrowShifts },
    staffNames: state.staff.map((s) => s.name),
    saved: state.reports.get(date) || null,
  };
}

// server.js から呼ばれる入口。処理した場合は true を返す。
function handleDemoApi(req, res, url) {
  if (url.pathname === "/api/demo/login" && req.method === "POST") {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e4) req.destroy(); });
    req.on("end", () => {
      let b = {};
      try { b = JSON.parse(raw || "{}"); } catch {}
      // 日本語入力の全角＠は半角@として扱う（IMEの打ち間違いでロックさせない）
      const jz = (v) => String(v || "").replace(/＠/g, "@").replace(/　/g, " ").trim();
      const user = jz(b.user).slice(0, 40);
      const ip = req.socket.remoteAddress || "";
      // 連続失敗によるロック（総当たり対策）
      const lock = state.loginFails.get(user);
      if (lock && lock.until > Date.now()) {
        authLogPush({ kind: "login", user, ok: false, reason: "locked", ip });
        res.writeHead(429, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "tooManyAttempts", retry: Math.ceil((lock.until - Date.now()) / 1000) }));
      }
      const acc = state.accounts.get(user);
      // 停止中アカウントも「存在しない」と同じ応答にする（存在の推測をさせない）
      if (acc && acc.active && (acc.pass === hashPass(String(b.pass || "")) || acc.pass === hashPass(jz(b.pass)))) {
        state.loginFails.delete(user);
        const token = crypto.randomBytes(24).toString("hex"); // 端末ごとに独立したセッション
        adminSessions.set(token, { user, created: Date.now() });
        if (adminSessions.size > 500) adminSessions.delete(adminSessions.keys().next().value);
        authLogPush({ kind: "login", user, ok: true, ip });
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Set-Cookie": `pm_session=${token}; ${COOKIE_FLAGS}`,
        });
        res.end(JSON.stringify({ ok: true, role: acc.role, name: acc.name }));
      } else {
        const n = (lock ? lock.n : 0) + 1;
        state.loginFails.set(user, { n, until: n >= 5 ? Date.now() + 60000 : 0 });
        authLogPush({ kind: "login", user, ok: false, ip });
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalidLogin" }));
      }
    });
    return true;
  }
  if (url.pathname === "/api/demo/logout") {
    clearSession(req, res);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  // ---- サーバー側の認証・権限チェック（中央ゲート） ----
  // /api/demo/* と /api/partner/* は、予約サイト（お客様）用に公開している一部を除き
  // すべてログイン必須。権限（admin > manager > staff）もここでサーバー側判定する。
  // フロント側の表示制御はUIの利便のためだけで、守りはすべてこのゲートと各処理内の検証。
  {
    const P = url.pathname, isGet = req.method === "GET" || req.method === "HEAD";
    let need = null; // null = 公開（ログイン不要）
    if (P.startsWith("/api/demo/") || P.startsWith("/api/partner/")) {
      if (P === "/api/demo/settings" && isGet) need = null;               // 未ログインには freeMessage のみ返す（下で制限）
      else if ((P === "/api/demo/course-photo" || P === "/api/demo/staff-photo") && isGet) need = null; // 公開画像
      else if (P === "/api/demo/accounts") need = "admin";                // アカウント管理は管理者のみ
      else if (P === "/api/demo/report" || P === "/api/demo/mailtest") need = "manager";
      else if (!isGet && (P === "/api/demo/settings" || P === "/api/demo/ticket-plans" ||
        P === "/api/demo/courses" || P === "/api/demo/tickets" ||
        P === "/api/demo/course-photo" || P === "/api/demo/staff-photo")) need = "manager";
      else if (P === "/api/partner/hotpepper" && !isGet) need = null;     // 連携通知（下でループバック限定）
      else need = "staff";                                                // それ以外の管理APIはログイン必須
    }
    if (need && !roleAtLeast(req, need)) {
      const a = sessionAccount(req);
      authLogPush({ kind: "api", user: a ? a.user : "", ok: false, path: P, ip: req.socket.remoteAddress || "" });
      denyApi(req, res);
      return true;
    }
  }

  // リアルタイム配信（SSE）。ログイン中の管理画面が購読し、予約・シフト等の
  // 変更がDBに保存された直後に「変わった」通知を受け取る（中身は必ず再取得する）
  if (url.pathname === "/api/demo/events" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`retry: 2000\ndata: ${sseSeq}\n\n`); // 接続直後に現在の版を知らせる
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return true;
  }

  // ログイン中のアカウント情報（自分のもののみ。UIの表示出し分けに使う）
  if (url.pathname === "/api/demo/whoami" && (req.method === "GET" || req.method === "HEAD")) {
    const a = sessionAccount(req);
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(a
      ? { user: a.user, name: a.name, role: a.role, roleLabel: ROLE_LABEL[a.role] }
      : { user: null }));
    return true;
  }

  // アカウント管理（管理者のみ。上のゲートで検証済み）
  if (url.pathname === "/api/demo/accounts") {
    const list = () => [...state.accounts.values()].map((a) => ({
      user: a.user, name: a.name, role: a.role, roleLabel: ROLE_LABEL[a.role],
      active: !!a.active, createdAt: a.createdAt,
    }));
    if (req.method === "GET" || req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify({
        accounts: list(),
        authLog: state.authLog.slice(-50).reverse(), // 直近の認証イベント（機密なし）
      }));
      return true;
    }
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; if (raw.length > 1e4) req.destroy(); });
      req.on("end", () => {
        const bad = (msg) => { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: msg })); };
        let b = {};
        try { b = JSON.parse(raw || "{}"); } catch { return bad("invalid"); }
        const me = sessionAccount(req);
        // 「有効な管理者が最後の1人」になる変更（停止・降格・削除）は拒否する
        const adminCountWithout = (user) =>
          [...state.accounts.values()].filter((a) => a.active && a.role === "admin" && a.user !== user).length;
        if (b.action === "add") {
          const user = String(b.user || "").trim();
          if (!/^[A-Za-z0-9@._-]{4,30}$/.test(user)) return bad("badUser");
          if (state.accounts.has(user)) return bad("userExists");
          if (String(b.pass || "").length < 8) return bad("shortPass");
          if (!ROLE_LV[b.role]) return bad("badRole");
          state.accounts.set(user, {
            user, name: String(b.name || user).slice(0, 40), role: b.role,
            active: true, pass: hashPass(String(b.pass)), createdAt: Date.now(),
          });
          authLogPush({ kind: "account", by: me.user, op: "add", target: user, role: b.role });
        } else if (b.action === "update") {
          const acc = state.accounts.get(String(b.user || ""));
          if (!acc) return bad("notFound");
          if ("role" in b) {
            if (!ROLE_LV[b.role]) return bad("badRole");
            if (acc.role === "admin" && b.role !== "admin" && adminCountWithout(acc.user) === 0) return bad("lastAdmin");
            acc.role = b.role;
          }
          if ("active" in b) {
            const on = b.active === true;
            if (!on && acc.role === "admin" && adminCountWithout(acc.user) === 0) return bad("lastAdmin");
            acc.active = on;
          }
          if ("name" in b) acc.name = String(b.name || acc.user).slice(0, 40);
          if ("pass" in b && b.pass) {
            if (String(b.pass).length < 8) return bad("shortPass");
            acc.pass = hashPass(String(b.pass));
          }
          authLogPush({ kind: "account", by: me.user, op: "update", target: acc.user });
        } else if (b.action === "delete") {
          const acc = state.accounts.get(String(b.user || ""));
          if (!acc) return bad("notFound");
          if (acc.role === "admin" && adminCountWithout(acc.user) === 0) return bad("lastAdmin");
          state.accounts.delete(acc.user);
          for (const [t, s] of adminSessions) if (s.user === acc.user) adminSessions.delete(t); // 既存セッションも失効
          authLogPush({ kind: "account", by: me.user, op: "delete", target: acc.user });
        } else return bad("badAction");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, accounts: list() }));
      });
      return true;
    }
    res.writeHead(405);
    res.end();
    return true;
  }

  if (url.pathname === "/api/demo/staff-photo") {
    const dataUrl = state.photos.get(url.searchParams.get("id") || "");
    if (!dataUrl) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "notFound" }));
      return true;
    }
    const m = /^data:(image\/[a-z+]+);base64,(.*)$/.exec(dataUrl);
    if (!m) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalidImage" }));
      return true;
    }
    res.writeHead(200, { "Content-Type": m[1], "Cache-Control": "no-store" });
    res.end(Buffer.from(m[2], "base64"));
    return true;
  }

  // ---- 予約サイト用の公開エンドポイント ----
  if (url.pathname === "/api/availability" && (req.method === "GET" || req.method === "HEAD")) {
    try {
      const data = getAvailability(url.searchParams);
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify(data));
    } catch (e) {
      res.writeHead(e.status || 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.status ? e.message : "unavailable" }));
    }
    return true;
  }
  if (url.pathname === "/api/staff" && (req.method === "GET" || req.method === "HEAD")) {
    const courseId = url.searchParams.get("course");
    const pref = url.searchParams.get("staff") || "none";
    if (!getCourse(courseId) || !["none", "male", "female"].includes(pref)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid" }));
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify({ staff: nominatableStaff(courseId, effectivePref(courseId, pref)) }));
    return true;
  }
  if (url.pathname === "/api/staff/photo") {
    const dataUrl = state.photos.get(url.searchParams.get("id") || "");
    const m2 = dataUrl && /^data:(image\/[a-z+]+);base64,(.*)$/.exec(dataUrl);
    if (!m2) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "notFound" }));
      return true;
    }
    res.writeHead(200, { "Content-Type": m2[1], "Cache-Control": "no-store" });
    res.end(Buffer.from(m2[2], "base64"));
    return true;
  }
  if (url.pathname === "/api/bookings/cancel" && req.method === "POST") {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on("end", () => {
      try {
        const b = JSON.parse(raw || "{}");
        const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        const found = findBooking(String(b.id || ""));
        if (!found || !ownsBooking(found.bk, token, memberOf(req))) throw err(404, "notFound");
        const bk = found.bk;
        cancelBooking(bk, found.date);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, status: "cancelled",
          ticketLeft: bk.ticket_id ? state.tickets.get(bk.ticket_id)?.uses_left : undefined }));
      } catch (e) {
        res.writeHead(e.status || 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.status ? e.message : "unavailable" }));
      }
    });
    return true;
  }
  if (url.pathname === "/api/bookings") {
    if (req.method === "GET" || req.method === "HEAD") {
      try {
        const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        const data = getPublicBooking(url.searchParams.get("id"), token, memberOf(req));
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(req.method === "HEAD" ? undefined : JSON.stringify(data));
      } catch (e) {
        res.writeHead(e.status || 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.status ? e.message : "unavailable" }));
      }
      return true;
    }
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
      req.on("end", () => {
        try {
          const result = createPublicBooking(JSON.parse(raw || "{}"), memberOf(req));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(e.status || 500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.status ? e.message : "unavailable" }));
        }
      });
      return true;
    }
    res.writeHead(405);
    res.end();
    return true;
  }

  // メニューの写真（メニュー一覧で登録した画像を配信する）
  if (url.pathname === "/api/demo/course-photo") {
    const dataUrl = coursePhotos.get(url.searchParams.get("id") || "");
    const mc = dataUrl && /^data:(image\/[a-z+]+);base64,(.*)$/.exec(dataUrl);
    if (!mc) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "notFound" }));
      return true;
    }
    res.writeHead(200, { "Content-Type": mc[1], "Cache-Control": "no-store" });
    res.end(Buffer.from(mc[2], "base64"));
    return true;
  }

  // メニュー一覧（管理画面から追加・変更・削除・写真登録ができる）
  if (url.pathname === "/api/demo/courses") {
    if (req.method === "GET" || req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify({ courses: courseListJson() }));
      return true;
    }
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; if (raw.length > 4e6) req.destroy(); });
      req.on("end", () => {
        try {
          const b = JSON.parse(raw || "{}");
          const name = String(b.name || "").trim().slice(0, 120);
          const price = Math.floor(Number(b.price));
          const minutes = Math.floor(Number(b.minutes));
          const validVals = () => {
            if (!name) throw err(400, "invalid");
            if (!(Number.isFinite(price) && price >= 0 && price <= 1000000)) throw err(400, "invalid");
            if (!(Number.isFinite(minutes) && minutes >= 10 && minutes <= 600)) throw err(400, "invalid");
          };
          // photo: dataURL文字列=登録／空文字=削除／未指定=変更なし
          const applyPhoto = (cid) => {
            if (typeof b.photo !== "string") return;
            if (b.photo === "") { coursePhotos.delete(cid); return; }
            if (!/^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/.test(b.photo) || b.photo.length > 3e6) {
              throw err(400, "invalidPhoto");
            }
            coursePhotos.set(cid, b.photo);
          };
          if (b.action === "create") {
            validVals();
            const id = "900000-" + String(++courseSerial).padStart(7, "0");
            courseStore.set(id, { id, name, price, minutes });
            applyPhoto(id);
          } else if (b.action === "update") {
            const c = courseStore.get(String(b.id || ""));
            if (!c) throw err(404, "notFound");
            validVals();
            applyPhoto(c.id);
            c.name = name; c.price = price; c.minutes = minutes;
          } else if (b.action === "delete") {
            const cid = String(b.id || "");
            if (!courseStore.has(cid)) throw err(404, "notFound");
            // 昨日以降の確定予約が残っているメニューは削除できない
            const today = todayJst();
            for (const [d, ev2] of state.events) {
              if (d < addDays(today, -1)) continue;
              if (ev2.bookings.some((x) => x.status === "confirmed" && x.course === cid)) throw err(409, "hasBookings");
            }
            courseStore.delete(cid);
            coursePhotos.delete(cid);
          } else {
            throw err(400, "invalid");
          }
          ensureDay(todayJst()).version++; sseTouch();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, courses: courseListJson() }));
        } catch (e) {
          res.writeHead(e.status || 400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.status ? e.message : "invalid" }));
        }
      });
      return true;
    }
    res.writeHead(405);
    res.end();
    return true;
  }

  // 日付ピッカーのカレンダー用：日ごとのシフト・予約状況
  if (url.pathname === "/api/demo/calendar" && (req.method === "GET" || req.method === "HEAD")) {
    const from = url.searchParams.get("from") || todayJst();
    const n = Math.min(62, Math.max(1, Number(url.searchParams.get("days")) || 42));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid" }));
      return true;
    }
    const days = [];
    for (let i = 0; i < n; i++) {
      const d = addDays(from, i);
      days.push({
        date: d,
        shifts: ensureShifts(d).length,
        bookings: ensureEvents(d).bookings.filter((b) => b.status === "confirmed").length,
        enabled: ensureDay(d).enabled,
      });
    }
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify({ days }));
    return true;
  }

  // 営業実績（日次管理）の集計と日報の保存
  if (url.pathname === "/api/demo/report") {
    if (req.method === "GET" || req.method === "HEAD") {
      const date = url.searchParams.get("date") || todayJst();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid" }));
        return true;
      }
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify(reportStats(date)));
      return true;
    }
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
      req.on("end", () => {
        try {
          const b = JSON.parse(raw || "{}");
          const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) ? b.date : todayJst();
          const rec = state.reports.get(date) || {};
          for (const k of ["weather", "todayPlan", "review", "tomorrowPlan", "manager"]) {
            if (k in b) rec[k] = String(b[k] || "").slice(0, 2000);
          }
          if (b.send) rec.sentAt = Date.now();
          state.reports.set(date, rec);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, saved: rec }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid" }));
        }
      });
      return true;
    }
    res.writeHead(405);
    res.end();
    return true;
  }

  // フリーメッセージ欄などの設定（管理画面から変更し、予約サイトに即時反映）
  if (url.pathname === "/api/demo/settings") {
    if (req.method === "GET" || req.method === "HEAD") {
      // 未ログイン（予約サイト）にはフォーム表示に必要な freeMessage のみ返す。
      // 店舗マスタ・業務設定の中身はログイン済みの管理画面だけが取得できる
      const body = isAdminSession(req) ? state.settings : { freeMessage: state.settings.freeMessage };
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify(body));
      return true;
    }
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(raw || "{}");
          if (parsed.freeMessage) {
            const b = parsed.freeMessage;
            const fm = state.settings.freeMessage;
            fm.visible = b.visible !== false;
            fm.required = b.required === true;
            fm.label = String(b.label || "").slice(0, 60);
            fm.placeholder = String(b.placeholder || "").slice(0, 200);
            fm.description = String(b.description || "").slice(0, 300);
            const len = Number(b.maxLength);
            fm.maxLength = Number.isFinite(len) && len >= 1 && len <= 2000 ? Math.floor(len) : 2000;
          }
          // 店舗マスタの編集内容を保存（IDなどの読み取り専用欄は変更不可）
          if (parsed.shopMaster) {
            const sm = state.settings.shopMaster;
            for (const k of ["shopCode", "name", "shortName", "zip", "pref", "address", "address2",
              "tel", "fax", "email", "homepage", "department", "manager", "bgColor", "timeUnit"]) {
              if (k in parsed.shopMaster) sm[k] = String(parsed.shopMaster[k] || "").slice(0, 200);
            }
            // 業務設定（時刻は分単位・10:00〜27:00の範囲、開始<終了のときだけ反映）
            const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n / 5) * 5 : null; };
            for (const [a, b] of [["bizStart", "bizEnd"], ["openStart", "openEnd"], ["resStart", "resEnd"]]) {
              if (a in parsed.shopMaster || b in parsed.shopMaster) {
                const s2 = num(parsed.shopMaster[a] ?? sm[a]);
                const e2 = num(parsed.shopMaster[b] ?? sm[b]);
                if (s2 !== null && e2 !== null && s2 >= 600 && e2 <= 1620 && s2 < e2) { sm[a] = s2; sm[b] = e2; }
              }
            }
            if ("daySwitch" in parsed.shopMaster) {
              const d2 = Number(parsed.shopMaster.daySwitch);
              if (Number.isFinite(d2) && d2 >= 24 && d2 <= 30) sm.daySwitch = Math.round(d2);
            }
          }
          sseTouch(); // 業務時間などの変更を開いている管理画面へ即時配信
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(state.settings));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid" }));
        }
      });
      return true;
    }
    res.writeHead(405);
    res.end();
    return true;
  }

  if (url.pathname === "/api/demo/locks" && (req.method === "GET" || req.method === "HEAD")) {
    const locks = state.staff.map((st) => ({ id: st.id, name: st.name, locked: st.locked ? 1 : 0 }));
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify({ locks }));
    return true;
  }
  if (url.pathname === "/api/demo/mails" && (req.method === "GET" || req.method === "HEAD")) {
    deliverDueMails();
    const mails = [...state.mails].sort((a, b) => b.createdAt - a.createdAt);
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify({ mails }));
    return true;
  }

  // ---- ホットペッパー連携（デモ） ------------------------------------------
  // 外部（ホットペッパー側のシステム）からの予約通知を受け取り、同じ枠を当台帳でも埋める。
  // 空き判定は自社予約とまったく同じ条件（シフト・休憩/業務・既存予約・鍵・対応メニュー・性別）
  // を通すため、自社の予約サイトと枠が被ることはない（埋まっていれば slotTaken で拒否）。
  if (url.pathname === "/api/partner/hotpepper") {
    if (req.method === "GET" || req.method === "HEAD") {
      const c = loadMailConfig();
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify({
        ok: true, log: state.hpLog,
        mailIntake: { configured: !!(c && c.hotpepper && c.hotpepper.enabled), auto: HP_MAIL_ON },
      }));
      return true;
    }
    if (req.method !== "POST") { res.writeHead(405); res.end(); return true; }
    if (url.searchParams.get("poll") === "1") {
      // メール取込の手動実行は管理画面の操作（ログイン必須）
      if (!roleAtLeast(req, "staff")) { denyApi(req, res); return true; }
      imapPollHotpepper((e2, r2) => {
        if (e2) { res.writeHead(409, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e2.message })); }
        else { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, ...r2 })); }
      });
      return true;
    }
    // 連携通知の受け口は、このパソコン上（メール取込・連携シミュレーション）からのみ。
    // LANの他端末・外部・トンネル経由（転送ヘッダつき）からは予約を書き込めない
    if (req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] ||
      !/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || "")) {
      denyApi(req, res);
      return true;
    }
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on("end", () => {
      try {
        const b = JSON.parse(raw || "{}");
        const out = hpNotify(b, "API");
        res.writeHead(out.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(out.json));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid" }));
      }
    });
    return true;
  }

  // ---- サロンボード転記（自社予約→ホットペッパー側の枠を塞ぐ運用サポート） ----
  // サロンボードには公開APIが無く自動書込は規約違反になるため、
  // 「転記待ちリスト＋ワンクリックコピー＋反映済みチェック」で確実に手動反映できるようにする
  if (url.pathname === "/api/demo/sbsync") {
    if (req.method === "GET" || req.method === "HEAD") {
      const today = todayJst();
      const items = [];
      for (let i = 0; i <= 62; i++) {
        const d = addDays(today, i);
        if (!state.events.has(d)) continue;
        const ev2 = state.events.get(d);
        for (const bk of ev2.bookings) {
          if (bk.source === "hotpepper") continue; // HP発の予約は元がサロンボードなので転記不要
          const staffNames = ev2.assignments.filter((a) => a.booking_id === bk.id)
            .map((a) => state.staff.find((st) => st.id === a.staff_id)?.name).filter(Boolean);
          const base = {
            id: bk.id, ref: String(displayId(bk)), date: d,
            time: fmtTime(d, bk.start_at) + "〜" + fmtTime(d, bk.end_at),
            name: bk.name || "", phone: bk.phone || "", menu: bk.course_name || "",
            people: bk.people || 1, staff: staffNames.join("・"),
          };
          if (bk.status === "confirmed" && !bk.sb_done) {
            items.push({ ...base, kind: bk.sb_changed ? "変更" : "新規" });
          } else if (bk.status !== "confirmed" && bk.sb_done) {
            items.push({ ...base, kind: "取消" });
          }
        }
      }
      items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify({ items }));
      return true;
    }
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; if (raw.length > 1e4) req.destroy(); });
      req.on("end", () => {
        try {
          const b = JSON.parse(raw || "{}");
          const d = state.bookingIndex.get(String(b.id || ""));
          const bk = d && ensureEvents(d).bookings.find((x) => x.id === b.id);
          if (!bk) throw err(404, "notFound");
          if (bk.status === "confirmed") { bk.sb_done = true; bk.sb_changed = false; }
          else bk.sb_done = false; // 取消の反映を確認 → リストから消す
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(e.status || 500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.status ? e.message : "unavailable" }));
        }
      });
      return true;
    }
    res.writeHead(405); res.end(); return true;
  }

  // ---- 回数券：お客様向け ----
  // 公開中のプラン一覧（予約サイト・マイページの購入導線）
  if (url.pathname === "/api/tickets/plans" && (req.method === "GET" || req.method === "HEAD")) {
    const plans = [...state.ticketPlans.values()].filter((p2) => p2.active === 1)
      .map((p2) => ({ id: p2.id, name: p2.name, description: p2.description, price: p2.price, uses: p2.uses }));
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify({ plans }));
    return true;
  }
  // 購入（デモ：支払いは店頭。購入と同時に顧客アカウント＝メール＋トークンに紐付く）
  if (url.pathname === "/api/tickets/purchase" && req.method === "POST") {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on("end", () => {
      try {
        const b = JSON.parse(raw || "{}");
        const plan = state.ticketPlans.get(String(b.planId || ""));
        // ログイン中の会員は、会員情報のメールアドレス・お名前で購入する（入力不要）
        const member = memberOf(req);
        const name = String(b.name || (member ? member.name : "") || "").trim().slice(0, 120);
        const email = member ? member.email : String(b.email || "").trim().toLowerCase().slice(0, 254);
        if (!plan || plan.active !== 1 || !name || !email.includes("@")) throw err(400, "invalid");
        // 会員のみ購入可（ログイン中の会員、または予約実績のあるメールアドレス）。
        // 画面の表示制御だけに頼らず、サーバー側で必ず確認する
        if (!member && !isRepeatEmail(email)) throw err(403, "memberOnly");
        state.ticketSerial++;
        const tid = "tk-" + String(state.ticketSerial).padStart(5, "0");
        const ttoken = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
        const now = Date.now();
        const t = {
          id: tid, token: ttoken, plan_id: plan.id, plan_name: plan.name,
          price: plan.price, uses_total: plan.uses, uses_left: plan.uses,
          buyer_name: name, buyer_email: email, buyer_phone: String(b.phone || "").slice(0, 40),
          purchased_at: new Date(now).toISOString(),
          expires_at: ticketExpiryMs(now), // 購入日から1年間（日本時間・自動確定して保存）
          remind_sent: false,
          history: [{ at: new Date(now).toISOString(), type: "purchase", delta: plan.uses, left_after: plan.uses }],
        };
        state.tickets.set(tid, t);
        if (member) memberAttachTicket(member, t); // 会員の券として記録（マイページ・予約時の選択に出る）
        // 購入メール（既存メールと同じ書式・実送信はallowToのみ）。
        // 本文は送信直前に最新の回数券データで作る（ticketPurchase テンプレート）
        queueMail("customer", "ticket", email,
          `${MAIL_STORE} 回数券ご購入のご案内`, "", now, null,
          { name: "ticketPurchase", ticketId: tid });
        deliverDueMails();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, ticket: { ...ticketPublicJson(t), token: ttoken } }));
      } catch (e) {
        res.writeHead(e.status || 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.status ? e.message : "unavailable" }));
      }
    });
    return true;
  }
  // 自分の回数券一覧（id+tokenの組だけを受け付け、他人の券は見えない）
  if (url.pathname === "/api/tickets/mine" && req.method === "POST") {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on("end", () => {
      try {
        const items = (JSON.parse(raw || "{}").items || []).slice(0, 50);
        const tickets = [];
        for (const it of items) {
          const t = state.tickets.get(String(it.id || ""));
          if (t && t.token === String(it.token || "")) tickets.push(ticketPublicJson(t));
        }
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ tickets }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid" }));
      }
    });
    return true;
  }

  // ---- 予約サイトの会員（お客様）：登録・ログイン・マイページ ----
  // ・メールアドレス＋パスワード。未登録のアドレスなら、その場で会員登録（無料）してログイン
  // ・ログイン中は Cookie（HttpOnly）で本人確認。予約の確認・変更・取消、回数券の購入・残数確認は
  //   すべてサーバー側で「本人の予約・券か」を確認する（画面の出し分けには頼らない）
  if (url.pathname === "/api/member/login" && req.method === "POST") {
    readJson(req, res, 1e5, (b) => {
      const email = normEmail(b.email);
      const pass = String(b.pass || "").replace(/＠/g, "@").replace(/　/g, " ").trim();
      const ip = req.socket.remoteAddress || "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err(400, "badEmail");
      const lock = state.memberFails.get(email);
      if (lock && lock.until > Date.now()) {
        res.writeHead(429, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "tooManyAttempts", retry: Math.ceil((lock.until - Date.now()) / 1000) }));
      }
      let m = state.members.get(email);
      let registered = false;
      // mode：register＝新規会員登録（既に登録済みならエラー）／login＝ログインのみ（未登録ならエラー）／
      // 指定なし＝従来どおり（未登録ならそのまま登録してログイン）
      const mode = b.mode === "register" ? "register" : b.mode === "login" ? "login" : "auto";
      if (m && mode === "register") {
        res.writeHead(409, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "alreadyRegistered" }));
      }
      if (!m && mode === "login") {
        const n = (lock ? lock.n : 0) + 1;
        state.memberFails.set(email, { n, until: n >= 5 ? Date.now() + 60000 : 0 });
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "invalidLogin" }));
      }
      if (m) {
        if (m.pass !== hashPass(pass)) {
          const n = (lock ? lock.n : 0) + 1;
          state.memberFails.set(email, { n, until: n >= 5 ? Date.now() + 60000 : 0 });
          authLogPush({ kind: "member", user: email, ok: false, ip });
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "invalidLogin" }));
        }
      } else {
        // 新規会員登録（メールアドレスとパスワードが揃えばそのまま会員になる）
        if (pass.length < 6) throw err(400, "shortPass");
        m = { email, pass: hashPass(pass), name: String(b.name || "").trim().slice(0, 120),
          phone: String(b.phone || "").trim().slice(0, 40), createdAt: Date.now(), bookings: [], tickets: [] };
        state.members.set(email, m);
        registered = true;
        queueMail("customer", "member", email,
          `${MAIL_STORE} 会員登録完了のお知らせ`,
          [
            ...(m.name ? [`${m.name} 様`, ""] : []),
            `この度は「${MAIL_STORE}」の会員にご登録いただきありがとうございます。`,
            "ご登録内容は以下のとおりです。ログインの際にご利用ください。",
            "",
            SEP,
            `ログインID（メールアドレス）：${email}`,
            "パスワード：ご登録時に設定されたもの（セキュリティのためメールには記載しておりません）",
            SEP,
            "予約サイト右上の「ログイン」からマイページを開くと、ご予約の確認・日時変更・取消、",
            "回数券のご購入と残り回数の確認がいつでも行えます。",
            "また、会員様には【予約】【メニュー】ページの一番上に回数券が表示され、ご予約の際にお使いいただけます。",
            "パスワードをお忘れの場合は、ログイン画面の「パスワードを忘れた方はこちら」から仮パスワードを発行できます。",
            `${origin()}/mypage`,
          ].join("\n") + MAIL_COMMON,
          Date.now(), null);
        deliverDueMails();
      }
      state.memberFails.delete(email);
      // このブラウザに保存されていた予約・回数券（予約ID＋トークン＝本人の証明）を会員に紐付ける
      const link = b.link || {};
      for (const it of (Array.isArray(link.bookings) ? link.bookings : []).slice(0, 50)) {
        const found = findBooking(String(it?.id || ""));
        if (found && found.bk.customer_token && found.bk.customer_token === String(it?.token || "") &&
            (!found.bk.member_email || found.bk.member_email === email)) memberAttachBooking(m, found.bk);
      }
      for (const it of (Array.isArray(link.tickets) ? link.tickets : []).slice(0, 50)) {
        const t = state.tickets.get(String(it?.id || ""));
        if (t && t.token === String(it?.token || "") && (!t.member_email || t.member_email === email)) memberAttachTicket(m, t);
      }
      const token = crypto.randomBytes(24).toString("hex");
      state.memberSessions.set(token, { email, created: Date.now() });
      if (state.memberSessions.size > 5000) state.memberSessions.delete(state.memberSessions.keys().next().value);
      authLogPush({ kind: "member", user: email, ok: true, ip, registered });
      res.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": `cn_member=${token}; ${MEMBER_COOKIE_FLAGS}` });
      res.end(JSON.stringify({ ok: true, registered, member: memberPublic(m) }));
    });
    return true;
  }
  if (url.pathname === "/api/member/logout" && req.method === "POST") {
    state.memberSessions.delete(memberTokenOf(req));
    res.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": "cn_member=; " + COOKIE_FLAGS + "; Max-Age=0" });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }
  // パスワードを忘れた場合：仮パスワードを発行してメールで送る（本人のメールにしか届かない）
  if (url.pathname === "/api/member/reset" && req.method === "POST") {
    readJson(req, res, 1e4, (b) => {
      const email = normEmail(b.email);
      const m = state.members.get(email);
      // 登録の有無を推測させない（どちらでも同じ応答）
      if (m) {
        const temp = crypto.randomBytes(4).toString("hex");
        m.pass = hashPass(temp);
        queueMail("customer", "member", email,
          `${MAIL_STORE} 仮パスワードのお知らせ`,
          [
            "パスワード再設定のご依頼を受け付けました。以下の仮パスワードでログインしてください。",
            "",
            SEP,
            `仮パスワード：${temp}`,
            SEP,
            "ログイン後、マイページの「会員情報」から新しいパスワードに変更してください。",
            `${origin()}/login`,
          ].join("\n") + MAIL_COMMON,
          Date.now(), null);
        deliverDueMails();
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return true;
  }
  // マイページ用：会員情報＋本人の予約一覧＋本人の回数券＋販売中プラン
  if (url.pathname === "/api/member/me" && (req.method === "GET" || req.method === "HEAD")) {
    const m = memberOf(req);
    if (!m) {
      res.writeHead(401, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(req.method === "HEAD" ? undefined : JSON.stringify({ error: "loginRequired" }));
    }
    const bookings = [];
    for (const id of m.bookings) {
      const found = findBooking(id);
      if (!found) continue;
      try {
        const j = getPublicBooking(id, found.bk.customer_token, m);
        bookings.push({ ...j.booking, token: found.bk.customer_token || "" });
      } catch {}
    }
    bookings.sort((a, b) => b.start - a.start);
    const tickets = m.tickets.map((id) => state.tickets.get(id)).filter(Boolean)
      .map((t) => ({ ...ticketPublicJson(t), token: t.token }));
    const plans = [...state.ticketPlans.values()].filter((p2) => p2.active === 1)
      .map((p2) => ({ id: p2.id, name: p2.name, description: p2.description, price: p2.price, uses: p2.uses }));
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify({ member: memberPublic(m), bookings, tickets, plans }));
    return true;
  }
  // 会員情報の変更（お名前・電話番号・パスワード）
  if (url.pathname === "/api/member/profile" && req.method === "POST") {
    readJson(req, res, 1e4, (b) => {
      const m = memberOf(req);
      if (!m) throw err(401, "loginRequired");
      if ("name" in b) m.name = String(b.name || "").trim().slice(0, 120);
      if ("phone" in b) m.phone = String(b.phone || "").trim().slice(0, 40);
      if (b.newPass) {
        const np = String(b.newPass).trim();
        if (np.length < 6) throw err(400, "shortPass");
        if (m.pass !== hashPass(String(b.pass || "").trim())) throw err(401, "invalidLogin");
        m.pass = hashPass(np);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, member: memberPublic(m) }));
    });
    return true;
  }

  // ---- 回数券：管理画面向け ----
  if (url.pathname === "/api/demo/ticket-plans") {
    if (req.method === "GET" || req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify({ plans: [...state.ticketPlans.values()] }));
      return true;
    }
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
      req.on("end", () => {
        try {
          const b = JSON.parse(raw || "{}");
          const norm = (p2) => {
            const name = String(b.name ?? p2?.name ?? "").trim().slice(0, 120);
            const price = Math.round(Number(b.price ?? p2?.price));
            const uses = Math.round(Number(b.uses ?? p2?.uses));
            if (!name || !(price >= 0) || !(uses >= 1 && uses <= 200)) throw err(400, "invalid");
            // 有効期限は全券「購入日から1年間」固定（プランごとの設定は持たない）
            return { name, price, uses, description: String(b.description ?? p2?.description ?? "").slice(0, 300) };
          };
          if (b.action === "add") {
            state.ticketPlanSerial++;
            const id2 = "tp-c" + state.ticketPlanSerial;
            state.ticketPlans.set(id2, { id: id2, active: 1, ...norm(null) });
          } else if (b.action === "update") {
            const p2 = state.ticketPlans.get(String(b.id || ""));
            if (!p2) throw err(404, "notFound");
            Object.assign(p2, norm(p2));
          } else if (b.action === "toggle") {
            const p2 = state.ticketPlans.get(String(b.id || ""));
            if (!p2) throw err(404, "notFound");
            p2.active = b.active ? 1 : 0;
          } else if (b.action === "delete") {
            if (!state.ticketPlans.delete(String(b.id || ""))) throw err(404, "notFound");
          } else throw err(400, "invalid");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, plans: [...state.ticketPlans.values()] }));
        } catch (e) {
          res.writeHead(e.status || 500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.status ? e.message : "unavailable" }));
        }
      });
      return true;
    }
    res.writeHead(405); res.end(); return true;
  }
  // 発行済み回数券の一覧・履歴・調整（調整は必ず履歴に残す）
  if (url.pathname === "/api/demo/tickets") {
    if (req.method === "GET" || req.method === "HEAD") {
      deliverDueMails();
      const list = [...state.tickets.values()].map((t) => ({
        ...ticketPublicJson(t),
        buyer_name: t.buyer_name, buyer_email: t.buyer_email, buyer_phone: t.buyer_phone,
        price: t.price, remind_sent: t.remind_for_expiry === t.expires_at, history: t.history,
        mails: ticketMailLog(t),
      }));
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify({ tickets: list }));
      return true;
    }
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
      req.on("end", () => {
        try {
          const b = JSON.parse(raw || "{}");
          if (b.action !== "adjust") throw err(400, "invalid");
          const t = state.tickets.get(String(b.id || ""));
          if (!t) throw err(404, "notFound");
          const note = String(b.note || "").slice(0, 200);
          if (!note) throw err(400, "noteRequired"); // 誤操作防止：理由の記録を必須にする
          const usesDelta = Math.round(Number(b.usesDelta || 0));
          const extendDays = Math.round(Number(b.extendDays || 0));
          if (usesDelta) {
            const next = t.uses_left + usesDelta;
            if (next < 0 || next > t.uses_total) throw err(400, "outOfRange");
            t.uses_left = next;
            t.history.push({ at: new Date().toISOString(), type: "adjust", delta: usesDelta, left_after: t.uses_left, note });
          }
          if (extendDays) {
            const before = t.expires_at;
            t.expires_at += extendDays * 86400e3;
            t.history.push({ at: new Date().toISOString(), type: "extend", delta: 0, left_after: t.uses_left,
              expires_before: before, expires_after: t.expires_at,
              note: `${note}（期限${extendDays > 0 ? "+" : ""}${extendDays}日）` });
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, ticket: { ...ticketPublicJson(t), history: t.history } }));
        } catch (e) {
          res.writeHead(e.status || 500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.status ? e.message : "unavailable" }));
        }
      });
      return true;
    }
    res.writeHead(405); res.end(); return true;
  }

  // 検証用：allowToに載っている宛先へ任意メールを送る（HP通知メールの疑似投函など）
  if (url.pathname === "/api/demo/mailtest" && req.method === "POST") {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on("end", () => {
      try {
        const b = JSON.parse(raw || "{}");
        const cfg = loadMailConfig();
        const to = cfg && cfg.allowTo && cfg.allowTo[0];
        const allowed = to && realSendAllowed(to);
        if (!allowed) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "mailConfigMissing" }));
          return;
        }
        smtpSend(allowed, { to, subject: String(b.subject || "テスト"), body: String(b.text || "") }, (err) => {
          res.writeHead(err ? 502 : 200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(err ? { error: String(err.message) } : { ok: true, to }));
        });
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid" }));
      }
    });
    return true;
  }

  // 予約の移動候補：対応メニュー・シフト・休憩/業務・既存予約・鍵・性別条件を
  // すべて満たす「実際に成立するスタッフと時間」だけを返す（判定は freeStaffIds に一本化）
  if (url.pathname === "/api/demo/move-targets" && (req.method === "GET" || req.method === "HEAD")) {
    const date = url.searchParams.get("date");
    const id = url.searchParams.get("id") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid" }));
      return true;
    }
    const ev = ensureEvents(date);
    const bk = ev.bookings.find((b) => b.id === id && b.status === "confirmed");
    if (!bk) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "notFound" }));
      return true;
    }
    const start = msToMin(date, bk.start_at);
    const dur = msToMin(date, bk.end_at) - start;
    const gender = courseGender(bk.course);
    const people = bk.people || 1;
    // 5分刻みで一日を走査し、その時刻に予約全体（人数分）が成立するスタッフだけを拾う
    const slotsByStaff = new Map();
    for (let t = 600; t + dur <= 1620; t += 5) {
      const ids = freeStaffIds(date, t, t + dur, bk.course, gender, bk.id);
      if (ids.length < people) continue; // 複数名予約は人数分の空きが必要
      for (const sid of ids) {
        if (!slotsByStaff.has(sid)) slotsByStaff.set(sid, []);
        slotsByStaff.get(sid).push(t);
      }
    }
    const current = ev.assignments.find((a) => a.booking_id === bk.id)?.staff_id || null;
    const list = state.staff
      .filter((st) => slotsByStaff.has(st.id))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((st) => ({
        id: st.id,
        name: st.name,
        current: st.id === current,
        sameTime: slotsByStaff.get(st.id).includes(start),
        slots: slotsByStaff.get(st.id),
      }));
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify({
      ok: true, id: bk.id, date, start, duration: dur, people,
      course: bk.course, course_name: bk.course_name,
      staff: list,
    }));
    return true;
  }

  if (url.pathname !== "/api/demo/schedule") return false;

  if (req.method === "GET" || req.method === "HEAD") {
    const date = url.searchParams.get("date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid" }));
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(getSchedule(date)));
    return true;
  }

  if (req.method === "POST") {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on("end", () => {
      try {
        const body = JSON.parse(raw || "{}");
        // スタッフマスタの編集（登録・削除）はマネージャー以上のみ。
        // 予約・シフト・受付停止などの日常操作はスタッフ権限でも可能
        if ((body.action === "staff" || body.action === "staffDelete") && !roleAtLeast(req, "manager")) {
          const a = sessionAccount(req);
          authLogPush({ kind: "api", user: a ? a.user : "", ok: false, path: "/api/demo/schedule#" + body.action, ip: req.socket.remoteAddress || "" });
          denyApi(req, res);
          return;
        }
        const result = postSchedule(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(e.status || 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.status ? e.message : "unavailable" }));
      }
    });
    return true;
  }

  res.writeHead(405);
  res.end();
  return true;
}

module.exports = { handleDemoApi, isAdminSession, clearSession, ready: persistReady };
