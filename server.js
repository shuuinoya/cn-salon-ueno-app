// 保存した元サイトのファイルを、元サイトと同じURLで返すローカルサーバーです。
// pages/ と public/ の中身は元サイトから受け取ったまま（無加工）です。
// 起動: VS Codeで F5 、またはターミナルで `node server.js`
const http = require("http");
const fs = require("fs");
const path = require("path");

const { handleDemoApi, isAdminSession, clearSession, ready: demoReady, nominationOf, liveSeq, courseNameOf } = require("./demo-api");
const { EventEmitter } = require("events");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const routes = JSON.parse(fs.readFileSync(path.join(ROOT, "routes.json"), "utf8"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

// サイト名の付け替え（配信時にのみ置き換える。保存ファイル自体は無加工のまま）
// 予約サイト＝CN Ueno health & beauty ／ 管理画面＝CNsalon@board
const OLD_BRAND = "UENO CN health＆beauty salon";
const BOOKING_BRAND = "CN Ueno health & beauty";
const ADMIN_BRAND = "CNsalon@board";
function brandFor(file, url) {
  // 管理画面のページタイトルだけ管理システム名（CNsalon@board）。
  // JSチャンク内の同名文字列は「店舗名」の定数（店舗セレクト等）なので、
  // 管理画面でも店舗名（CN Ueno health & beauty）のままにする。
  const isAdminPage = url &&
    (url.pathname === "/admin" || url.pathname.startsWith("/admin/") || url.pathname === "/demo/admin");
  return isAdminPage ? ADMIN_BRAND : BOOKING_BRAND;
}

// サイト名そのままの入口URL。転送ではなくその場で表示し、
// アドレスバーには名前のURLが残る（予約サイト＝店名／管理画面＝CNsalon@board）
// 上書きスクリプト類の更新時刻（キャッシュ破棄用の版番号）
function fileVer(name) {
  try { return String(Math.floor(fs.statSync(path.join(__dirname, "public", name)).mtimeMs)); } catch { return "1"; }
}
// 管理画面の上書きスクリプト・CSSの版番号（ファイルを書き換えたら、サーバーを再起動しなくてもすぐ変わる）
const pmVer = () => fileVer("pm-layout.js") + "-" + fileVer("pm-layout.css");

// 画面の部品（/_next/static の JS・CSS）の版番号。部品のどれか1つでも書き換えると変わる。
// ページには /_next/static/v-<版>/chunks/… の形で載せ、ブラウザは同じ版の部品をサーバーに確認せず1年使い回す
// （これまでは画面を開くたびに約20個の部品について「変わっていないか」の確認の往復があった）。
// 部品どうしの読み込み（./xxx.js）も同じ版のフォルダから読まれるので、新旧の部品が混ざらない
const STATIC_DIRS = ["chunks", "css"].map((d) => path.join(PUBLIC, "_next", "static", d));
let staticVerCache = { at: 0, v: "" };
let selfSig = "";
function staticVer() {
  const now = Date.now();
  if (staticVerCache.v && now - staticVerCache.at < 2000) return staticVerCache.v;
  // 配信時の書き換え（サイト名・写真の配信元・公開URL）も中身を変えるので、版に含める
  if (!selfSig) {
    try { selfSig = require("crypto").createHash("sha1").update(fs.readFileSync(__filename)).digest("hex"); } catch { selfSig = String(Date.now()); }
    selfSig += "|" + IMAGE_CDN + "|" + (PUBLIC_HOSTS[0] || "");
  }
  const h = require("crypto").createHash("sha1").update(selfSig);
  for (const d of STATIC_DIRS) {
    let names = [];
    try { names = fs.readdirSync(d).sort(); } catch {}
    for (const n of names) {
      try { const st = fs.statSync(path.join(d, n)); h.update(n + ":" + st.size + ":" + Math.floor(st.mtimeMs) + ";"); } catch {}
    }
  }
  staticVerCache = { at: now, v: h.digest("hex").slice(0, 10) };
  return staticVerCache.v;
}
// HTML・RSC・JSの中の部品の場所（/_next/static/chunks/… と _next/static/css/…）を、版つきの場所に置き換える
const STATIC_REF = /(^|[^A-Za-z0-9_.\-/])(\/?)_next\/static\/(chunks|css)\//g;
function pinStatic(text) {
  const v = staticVer();
  return text.replace(STATIC_REF, (m, pre, slash, dir) => pre + slash + "_next/static/v-" + v + "/" + dir + "/");
}
// <script> の中に入れるJSON（< > & と、JSでは改行扱いになる2文字を \u 表記にする）
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
function scriptJson(v) {
  return JSON.stringify(v).replace(/[<>&]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))
    .split(LS).join("\\u2028").split(PS).join("\\u2029");
}

// ---- ページと一緒に返すデータ（先読みデータ） ----
// ページが開いた直後に必ず取りに来るデータ（空き状況・会員情報・予約台帳など）を、サーバーの中で
// ブラウザから頼まれたときと同じ処理（同じログイン状態）で作ってページに入れておく。
// ブラウザ（cn-fast.js）は最初の1回だけそれを使い、取りに行く往復を省く。2回目からは普通に取りに来る
function apiPeek(req, p) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const r = new EventEmitter();
    const headers = { ...req.headers, accept: "application/json" };
    for (const k of ["if-none-match", "if-modified-since", "range", "content-length", "content-type"]) delete headers[k];
    Object.assign(r, { method: "GET", url: p, headers, clientIp: req.clientIp, fromInternet: req.fromInternet,
      socket: req.socket, connection: req.socket, httpVersion: req.httpVersion });
    const out = new EventEmitter();
    const hdr = {};
    const chunks = [];
    let code = 200;
    Object.defineProperty(out, "statusCode", { get: () => code, set: (v) => { code = v; } });
    Object.assign(out, {
      headersSent: false,
      setHeader(k, v) { hdr[String(k).toLowerCase()] = v; return out; },
      getHeader(k) { return hdr[String(k).toLowerCase()]; },
      hasHeader(k) { return String(k).toLowerCase() in hdr; },
      removeHeader(k) { delete hdr[String(k).toLowerCase()]; },
      writeHead(s, a, b) {
        code = s;
        const h = a && typeof a === "object" ? a : b && typeof b === "object" ? b : null;
        if (h) for (const [k, v] of Object.entries(h)) hdr[k.toLowerCase()] = v;
        out.headersSent = true;
        return out;
      },
      write(c) { if (c != null && typeof c !== "function") chunks.push(Buffer.from(c)); return true; },
      end(c) {
        if (c != null && typeof c !== "function") chunks.push(Buffer.from(c));
        const t = String(hdr["content-type"] || "");
        // ログイン状態の更新（Set-Cookie）を伴う返事・JSON以外・成功以外は入れない（ブラウザが普通に取りに来る）
        const body = Buffer.concat(chunks);
        finish(code === 200 && !hdr["set-cookie"] && /json/.test(t) && body.length < 200000 ? { s: 200, t, b: body.toString("utf8") } : null);
        out.emit("finish");
        return out;
      },
      flushHeaders() {}, writeContinue() {},
    });
    try {
      if (!handleDemoApi(r, out, new URL(p, "http://localhost"))) finish(null);
    } catch { finish(null); }
    setTimeout(() => finish(null), 400);
  });
}
const jstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400e3).toISOString().slice(0, 10);
const isDay = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
// ページごとの「開いた直後に必ず取りに来るデータ」の一覧（ブラウザ側と同じ規則でURLを作る。違っていても普通に取りに来るだけ）
function bootPaths(req, url) {
  const p = url.pathname, q = url.searchParams;
  const today = jstDay(Date.now() - 3 * 3600e3); // 日付は日本時間の朝3時に切り替わる（画面と同じ）
  if (p === "/admin") {
    if (!isAdminSession(req)) return [];
    const first = today.slice(0, 8) + "01";
    const from = addDays(first, -new Date(first + "T00:00:00Z").getUTCDay());
    return [`/api/demo/schedule?date=${today}`, `/api/demo/locks?date=${today}`, "/api/demo/settings",
      `/api/demo/calendar?from=${from}&days=42`, "/api/demo/build", "/api/demo/alerts", "/api/demo/whoami",
      "/api/demo/courses", "/api/demo/recent-bookings", "/api/demo/capability-warnings"];
  }
  if (p.startsWith("/admin") || p.startsWith("/api/") || p === "/demo/admin") return [];
  const list = ["/api/member/me"];
  if (p.startsWith("/book") || p.startsWith("/menus")) list.push("/api/demo/settings");
  if (p === "/book/select-datetime") {
    const course = q.get("courses") ?? q.get("course");
    if (course) {
      const dq = q.get("date");
      const date = isDay(dq) && dq >= today && dq <= addDays(today, 84) ? dq : today;
      const people = ["1", "2", "3"].includes(q.get("people") ?? "") ? q.get("people") : "1";
      const pref = ["male", "female"].includes(q.get("staff") ?? "") ? q.get("staff") : "none";
      const nm = courseNameOf(course);
      const g = nm.includes("女性") ? "female" : nm.includes("男性") ? "male" : "none";
      const sp = new URLSearchParams({ course, date, people, staff: g === "none" ? pref : g });
      const sid = q.get("staffId") ?? "";
      if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(sid)) sp.set("staffId", sid);
      list.push("/api/availability?" + sp);
    }
  }
  if (p === "/book/confirm") list.push("/api/member/me?lite=1");
  if (p === "/staff") list.push("/api/staff/list");
  return list;
}
async function pageBoot(req, url) {
  const paths = bootPaths(req, url);
  if (!paths.length) return null;
  const seq = liveSeq();
  const got = await Promise.all(paths.map((p) => apiPeek(req, p).catch(() => null)));
  const d = {};
  paths.forEach((p, i) => { if (got[i]) d[p] = got[i]; });
  return Object.keys(d).length ? { seq: String(seq), d } : null;
}

// ページの先頭に入れる仕組み（public/cn-fast.js。書き換えたらすぐ反映）
let fastSrc = { m: -1, s: "" };
function fastScript() {
  const f = path.join(PUBLIC, "cn-fast.js");
  let m = 0;
  try { m = fs.statSync(f).mtimeMs; } catch {}
  if (m !== fastSrc.m) {
    let s = "";
    try { s = fs.readFileSync(f, "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\n\s*\n+/g, "\n"); } catch {}
    fastSrc = { m, s };
  }
  return fastSrc.s;
}
// 予約サイト：リンクを押し始めた瞬間（指が触れた・マウスを押した）に、次のページを先に取りに行く（Chrome系。離す前に届き始める）
const SPECULATION = '<script type="speculationrules">{"prefetch":[{"where":{"and":[{"href_matches":"/*"},' +
  '{"not":{"href_matches":"/admin*"}},{"not":{"href_matches":"/api/*"}},{"not":{"href_matches":"/cnsalon-board*"}}]},' +
  '"eagerness":"conservative"}]}</script>';
function fastHead(boot, url) {
  let h = "";
  if (boot) h += "<script>window.__cnBoot=" + scriptJson(boot) + ";</script>";
  // 管理画面のログイン画面：ID・パスワードを入れている間に、予約台帳の部品を先に読み込んでおく（ログイン後すぐ台帳が出る）。
  // 一覧は cn-fast.js より前に置く（cn-fast.js が読み込みを始めるときに使う）
  if (url.pathname === "/admin/login") {
    const list = adminWarmList();
    if (list.length) h += "<script>window.__cnWarm=" + scriptJson(list) + ";</script>";
  }
  const s = fastScript();
  if (s) h += "<script>" + s + "</script>";
  if (brandFor(null, url) === BOOKING_BRAND && !url.pathname.startsWith("/admin")) h += SPECULATION;
  return h;
}

// このページが使う部品（入口の部品の一覧に書かれている、画面ごとの部品とその部品が使う部品）を先読みの指定にする。
// これまでは入口の部品を読み終わってから画面ごとの部品に気づいて読み始めていた（初めて開くときに1往復ぶん待っていた）
const entryTables = new Map(); // 入口の部品ファイル → { m, table: {id: [部品…]} }
function entryTable(entryName) {
  const f = path.join(PUBLIC, "_next", "static", "chunks", entryName);
  let m = 0;
  try { m = fs.statSync(f).mtimeMs; } catch { return null; }
  const c = entryTables.get(entryName);
  if (c && c.m === m) return c.table;
  let table = {};
  try {
    const s = fs.readFileSync(f, "utf8");
    const mf = /m\.f=\[([^\]]*)\]/.exec(s);
    const deps = mf ? [...mf[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
    const re = /"?([0-9a-f]{12})"?:async\(\)=>[{(]?(?:let e=)?await M\(\(\)=>import\(`\.\/([^`]+)`\)(?:\.then\([^)]*\))?,__vite__mapDeps\(\[([\d,]*)\]\)/g;
    for (const x of s.matchAll(re)) {
      const list = x[3].split(",").filter(Boolean).map((i) => deps[Number(i)]).filter(Boolean);
      table[x[1]] = ["_next/static/chunks/" + x[2], ...list];
    }
  } catch { table = {}; }
  entryTables.set(entryName, { m, table });
  return table;
}
function preloadsFor(text) {
  const em = /src="\/_next\/static\/chunks\/(index-[^"]+\.js)"/.exec(text);
  if (!em) return [];
  const table = entryTable(em[1]) || {};
  const want = new Set();
  for (const x of text.matchAll(/I\[\\"([0-9a-f]{12})\\"/g)) for (const d of table[x[1]] || []) want.add(d);
  return [...want].filter((d) => !text.includes('"/' + d + '"'));
}
function addModulePreloads(text) {
  const add = preloadsFor(text);
  if (!add.length) return text;
  const tags = add.map((d) => d.endsWith(".css") ? `<link rel="preload" as="style" href="/${d}"/>` : `<link rel="modulepreload" href="/${d}" crossorigin=""/>`).join("");
  return text.replace("</head>", () => tags + "</head>");
}
// 予約台帳（/admin）で使う部品の一覧（版つきの場所）。ログイン画面で先に読み込んでおくため
let adminWarm = { m: -1, list: [] };
function adminWarmList() {
  const r = routes["/admin"];
  if (!r || !r.file) return [];
  const f = path.join(ROOT, r.file);
  let m = 0;
  try { m = fs.statSync(f).mtimeMs; } catch { return []; }
  const key = m + ":" + staticVer() + ":" + pmVer();
  if (adminWarm.m === key) return adminWarm.list;
  let list = [];
  try {
    const html = fs.readFileSync(f, "utf8");
    const refs = new Set([...html.matchAll(/"\/(_next\/static\/(?:chunks|css)\/[^"]+)"/g)].map((x) => x[1]));
    for (const d of preloadsFor(html)) refs.add(d);
    list = [...refs].map((d) => pinStatic("/" + d));
    list.push("/pm-layout.js?v=" + pmVer(), "/pm-layout.css?v=" + pmVer(), "/pm-motion.css?v=" + fileVer("pm-motion.css"));
  } catch { list = []; }
  adminWarm = { m: key, list };
  return list;
}

const ENTRY_URLS = {
  "/cn-ueno-health-and-beauty": "/",
  "/cnsalon-board": "/admin/login",
};

// URLの ?course= / ?courses= でページの中身が変わるので、保存したページを選び分ける
function routeKey(url) {
  if (url.pathname === "/menus/menu") {
    const c = url.searchParams.get("course");
    if (c) return `/menus/menu?course=${c}`;
  }
  if (url.pathname === "/book/select-datetime") {
    const c = url.searchParams.get("courses") ?? url.searchParams.get("course");
    if (c) return `/book/select-datetime?courses=${c}`;
  }
  return url.pathname;
}

// 日時選択ページの見出し（7日分）を、ブラウザ側と同じ規則で作る：
// 開始日＝URLの date（今日〜84日後の範囲なら）／それ以外は今日。今日は日本時間で朝3時に切り替わる。
// 日曜は sunday-column、土曜は saturday-column、今日の列に aria-current="date"
function fixDateHeaders(text, url) {
  const day = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
  const add = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400e3).toISOString().slice(0, 10);
  const today = day(Date.now() - 3 * 3600e3);
  const q = url.searchParams.get("date") || "";
  const start = /^\d{4}-\d{2}-\d{2}$/.test(q) && !Number.isNaN(Date.parse(q)) && q >= today && q <= add(today, 84) ? q : today;
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  let cols = "";
  for (let i = 0; i < 7; i++) {
    const t = add(start, i);
    const w = new Date(t + "T00:00:00Z").getUTCDay();
    const cls = w === 0 ? "sunday-column" : w === 6 ? "saturday-column" : "";
    cols += `<th scope="col" class="${cls}"${t === today ? ' aria-current="date"' : ""}>${Number(t.slice(5, 7))}/${Number(t.slice(8))}<small>${WD[w]}</small></th>`;
  }
  return text.replace(
    /(<th scope="col" class="time-column">[\s\S]*?<\/th>)(?:<th scope="col" class="[^"]*"(?: aria-current="date")?>\d{1,2}\/\d{1,2}<small>[^<]*<\/small><\/th>){7}/,
    (_, timeCol) => timeCol + cols);
}

function sendFile(res, file, status, type, head, url, req) {
  fs.readFile(file, async (err, data) => {
    if (err) return send404(res, head);
    let body = data;
    const isHtml = type.startsWith("text/html");
    // ページが開いた直後に必ず取りに来るデータを、ページと一緒に返すために先に用意する（失敗しても普通に表示する）
    let boot = null;
    if (isHtml && url && req && status === 200 && !head) {
      try { boot = await pageBoot(req, url); } catch { boot = null; }
    }
    // 静的ファイル（HTML以外）はキャッシュを効かせる：
    // ・Last-Modified＋304で、変わっていないファイルは再ダウンロードさせない
    // ・ハッシュつき（/assets/・/_next/）や ?v= つきは1日、その他は1時間の再利用を許可
    // （HTMLはリクエストごとにURL注入があるため従来どおり毎回検証）
    if (!isHtml && status === 200) {
      let mtime = 0;
      try { mtime = Math.floor(fs.statSync(file).mtimeMs / 1000) * 1000; } catch {}
      if (mtime) {
        const ims = Date.parse(req?.headers?.["if-modified-since"] || "");
        // 画面の部品（JS・CSS・翻訳データのJSON）は、書き換えたらすぐ全員に届くよう毎回確認させる（変わっていなければ304で中身は送らない）。
        // 写真などはハッシュつき（/assets/・/_next/）なら1日、?v= つきは1日、その他は1時間の再利用を許可
        const versioned = !!(url && url.searchParams?.has("v"));
        const code = /\.(m?js|css|json)$/i.test(file);
        const long = versioned || (/\/(assets|_next)\//.test(file) && !code);
        // メニューの小さい写真（public/thumbs）は、元の写真の中身の印がファイル名に入っているので、30日使い回してよい
        const thumb = /[\\/]public[\\/]thumbs[\\/]/.test(file);
        // 版つきの場所で頼まれた画面の部品：版が今のものなら、確認なしで1年使い回させる（書き換えると版＝場所が変わる）。
        // 古い版の場所で頼まれたとき（書き換えの直前に開いたページ）は、今の中身を返して保存はさせない
        const pin = req && req.pinStatic;
        // ?v= に今のファイルの更新時刻が入っているもの（会員ログイン・翻訳辞書・管理画面の上書きなど）も同じく1年
        const verOk = versioned && String(url.searchParams.get("v")).includes(String(Math.floor(fs.statSync(file).mtimeMs)));
        const cc = pin === "current" || verOk ? "public, max-age=31536000, immutable" : pin === "stale" ? "no-store"
          : thumb ? "public, max-age=2592000, immutable" : long ? "public, max-age=86400" : code ? "no-cache" : "public, max-age=3600";
        const cache = { "Cache-Control": cc, "Last-Modified": new Date(mtime).toUTCString() };
        if (ims && ims >= mtime) {
          res.writeHead(304, cache);
          return res.end();
        }
        res.setHeader("Cache-Control", cache["Cache-Control"]);
        res.setHeader("Last-Modified", cache["Last-Modified"]);
      }
    }
    if (isHtml || type.startsWith("text/javascript")) {
      let text = data.toString("utf8");
      // 保存HTMLにはルーターの初期URL（searchParams）が保存時の値のまま埋め込まれている。
      // 実際のリクエストのクエリパラメータを注入しないと、確認・完了ページなどが
      // 「メニューを選択してください」表示になってしまうため、配信時に置き換える。
      if (url && isHtml) {
        // <script> の中に入るため、< > & と改行扱いの文字は \u 表記にする（URLに </script> 等を仕込まれても実行されない）。
        // 置き換えは関数で渡す（URL中の $' $` などが置換記号として展開されないように）
        const nav = JSON.stringify({
          pathname: url.pathname,
          searchParams: [...url.searchParams.entries()],
        }).replace(/[<>&\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
        text = text.replace(
          /nav:\{"pathname":"[^"]*","searchParams":\[(?:\[[^\]]*\],?)*\]\}/,
          () => "nav:" + nav
        );
        // 使っていないフォント（Geist・Geist Mono）の先読みを外す。文字は端末のフォントで表示していて、
        // この2つはどこにも使われていないのに、初めて開くたびに約52KBを読み込んでいた（見た目は変わらない）
        text = text.replace(/<link rel="preload" href="\/_next\/static\/_vinext_fonts\/[^"]*" as="font"[^>]*>\n?/g, "");
        // 日時選択ページ：保存HTMLの空き状況表の見出し（日付・曜日）は保存した日（9/24〜）のまま。
        // ブラウザ側は「今日（3時切替）から7日分」を描くため食い違い、Reactがエラー（#418）を出して
        // 画面を描き直していた。ブラウザと同じ計算で、見出しを今日からの7日分に書き換えて返す
        if (url.pathname === "/book/select-datetime") text = fixDateHeaders(text, url);
        // 予約確認ページ：保存版はメニュー未選択の状態（「メニューを選択してください。」）で保存されているため、
        // メニューを選んで来たときは、画面が組み上がるまでの一瞬に誤った案内が見えないよう「読み込み中」にする
        if (url.pathname === "/book/confirm" && url.searchParams.get("course")) {
          text = text.replace('<section class="booking-form-card"><p>メニューを選択してください。</p><a href="/book">メニューを変更</a></section>',
            '<section class="booking-form-card"><p>予約内容を読み込んでいます…</p></section>');
        }
        // 予約サイトの全ページに、会員ログイン（右上ボタン→ログインモーダル）のスクリプトを差し込む
        // （管理画面には入れない。?v=更新時刻 を付けて、ブラウザに古いキャッシュを使わせない）
        if (brandFor(file, url) === BOOKING_BRAND && !file.includes("pm-login") && !file.includes("admin")) {
          // 多言語の共通辞書（あとから追加した部分を8か国語で表示する）。ほかのスクリプトより先に読み込む
          // 予約サイト本体のページでは、辞書（約45KB）の読み込みで画面の表示を待たせない（defer：あとから使う会員ログインなどより先には必ず読み込まれる）。
          // スタッフ紹介・マイページはページの中のスクリプトがすぐ辞書を使うので、そのまま
          const i18nDefer = /pm-(staff|mypage)\.html$/.test(file) ? "" : " defer";
          text = text.replace("</head>", '<script src="/cn-i18n.js?v=' + fileVer("cn-i18n.js") + '"' + i18nDefer + '></script></head>');
          text = text.replace("</body>", '<script src="/member.js?v=' + fileVer("member.js") + '" defer></script></body>');
          // 予約サイトのレイアウト補正（タブレット幅で本文の列を中央に置く）
          text = text.replace("</head>", '<link rel="stylesheet" href="/booking-layout.css?v=' + fileVer("booking-layout.css") + '"/></head>');
        }
        // スタッフ紹介の「指名して予約する」で来たメニュー選択（/book?staffId=…）：
        // そのスタッフが担当できるメニューだけを最初から表示する指定（CSS）と、スタッフの情報を最初から入れておく
        // （画面の部品の準備や通信を待たずに、すぐ絞り込んだ一覧と指名スタッフを出せる。CSSとheadの差し込みなので画面の組み立てとは食い違わない）
        if (url.pathname === "/book" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(url.searchParams.get("staffId") || "")) {
          let nom = null;
          try { nom = nominationOf(url.searchParams.get("staffId")); } catch {}
          let css = "";
          if (nom) {
            const row = 'a.menu-row[href^="/book/select-datetime"]';
            const ok = nom.courses.filter((id) => /^[0-9-]+$/.test(id));
            const notOk = ok.map((id) => `:not([href$="courses=${id}"]):not([href*="courses=${id}&"])`).join("");
            const has = ok.map((id) => `a.menu-row[href$="courses=${id}"],a.menu-row[href*="courses=${id}&"]`).join(",");
            css = `.list-stack ${row}${notOk}{display:none!important}` +
              `.list-stack .list-card:has(${row})${has ? `:not(:has(${has}))` : ""}{display:none!important}`;
          }
          const data = JSON.stringify(nom).replace(/[<>&\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
          text = text.replace("</head>", (css ? '<style id="fm-nom-filter">' + css + "</style>" : "") + "<script>window.__cnNom=" + data + ";</script></head>");
        }
        // 予約・メニューページには、フリーメッセージ設定の反映と会員向け回数券表示のスクリプトを差し込む
        if (url.pathname.startsWith("/book") || url.pathname.startsWith("/menus")) {
          text = text.replace("</body>", '<script src="/booking-tweaks.js?v=' + fileVer("booking-tweaks.js") + '" defer></script></body>');
        }
        // ファビコン：予約サイト＝店のマーク（丸いロゴ）／管理画面＝4枚花びらのクローバーで統一
        // （版番号を付けて、ブラウザの頑固なファビコンキャッシュにも確実に反映させる）
        if (brandFor(file, url) === BOOKING_BRAND) {
          text = text.split("/favicon.svg").join("/fm-favicon.svg?v=" + fileVer("fm-favicon.svg"));
        } else {
          text = text.split("/favicon.svg").join("/pm-clover.svg?v=" + fileVer("pm-clover.svg"));
        }
        // 管理画面の全ページに、操作アニメーション（pm-motion.css）を差し込む（書き換えたらすぐ届くよう版番号つき）
        if (brandFor(file, url) === ADMIN_BRAND) {
          text = text.replace("</head>", '<link rel="stylesheet" href="/pm-motion.css?v=' + fileVer("pm-motion.css") + '"/></head>');
        }
        // 管理画面の上書きスクリプト・CSSにも版番号を付け、古いキャッシュが残らないようにする
        const PM_VER = pmVer();
        text = text
          .split('href="/pm-layout.css"').join('href="/pm-layout.css?v=' + PM_VER + '"')
          .split('src="/pm-layout.js"').join('src="/pm-layout.js?v=' + PM_VER + '"');
        // このページが使う部品の先読みの指定（初めて開くとき、部品の読み込みが順番待ちにならない）
        text = addModulePreloads(text);
      }
      // 画面の部品の場所を版つきにする（HTML・RSC・部品どうしの読み込み一覧）
      if (isHtml || /[\\/]_next[\\/]static[\\/]chunks[\\/]/.test(file)) text = pinStatic(text);
      // サイト名の付け替え（HTML本文・RSCペイロード・JSチャンクをまとめて揃える）
      if (text.includes(OLD_BRAND)) text = text.split(OLD_BRAND).join(brandFor(file, url));
      // 写真は無料・容量無制限の配信サービス（jsDelivr：公開GitHubリポジトリのファイルを配る）から出し、
      // ホスティングの通信量（Render無料プランは月5GB）を節約する。HTML・RSCペイロード・JSの両方で同じく書き換えるので、
      // 画面の組み立て（ハイドレーション）とも食い違わない。環境変数 IMAGE_CDN を空にすると自サーバーから配信
      if (IMAGE_CDN) text = text.split('"/images/').join('"' + IMAGE_CDN + "/images/").split("`/images/").join("`" + IMAGE_CDN + "/images/");
      // 店舗情報の「ホームページ」は、今このサイトを公開している住所を表示する（Render以外で動かしているときも正しく）
      if (PUBLIC_HOSTS[0] && PUBLIC_HOSTS[0] !== "cn-salon-ueno.onrender.com") text = text.split("https://cn-salon-ueno.onrender.com").join("https://" + PUBLIC_HOSTS[0]);
      // 画面の速さ：ページの先頭に小さな仕組み（cn-fast.js）と、ページが開いた直後に必ず取りに来るデータを入れる
      // （データを取りに行く往復を省く・使わない先読みをやめる・ページ移動の裏側の余分な通信をなくす）。
      // データはブラウザが取りに来たときと同じ中身にするため、上の書き換え（サイト名など）のあとで入れる
      if (isHtml && url) text = text.replace(/<head>/, () => "<head>" + fastHead(boot, url));
      body = Buffer.from(text);
    }
    // ページ（HTML）には本人の会員情報・管理画面のデータが入ることがあるので、共有のキャッシュには置かせない
    if (!res.getHeader("Cache-Control")) res.setHeader("Cache-Control", isHtml ? "private, no-cache" : "no-cache");
    res.setHeader("Content-Type", type);
    res.writeHead(status);
    res.end(head ? undefined : body);
  });
}

function send404(res, head) {
  const r = routes.__404__;
  sendFile(res, path.join(ROOT, r.file), 404, r.contentType, head);
}

// ---- セキュリティ ----
// ・お客様の予約サイトは誰でも開けます（ログイン不要。ただし下の流量制限つき）。
//   管理系（/admin…・管理API）は「このパソコン」と「同じネットワークのプライベートIP」
//   からのみ到達でき、さらにサーバー側でログイン・権限を必ず検証します
//   （URLを知っているだけでは、ページも内部データも一切見えません）
// ・インターネットに公開する場合も、外から届くのは予約サイトだけで、管理系には
//   ネットワーク的に到達できません（多重防御）
// ・データはこのパソコンのメモリ上のみ（Single Source of Truth）。どの端末から
//   開いても、このサーバーが返す同じ最新データが表示されます
// ・下のHost/Origin検査で、悪意あるWebサイト経由のアクセス（DNSリバインディング・CSRF）も遮断します
// 数字なしのURL用ホスト名（「〜.localhost」はブラウザが自分のPCに解決、
// 「〜.local」はmDNS(Bonjour)配信により同じネットワークの他の端末から届く）
const NAME_HOSTS = {
  "cn-ueno-health-and-beauty.localhost": "/",
  "cnsalon-board.localhost": "/admin/login",
  // 他の端末（iPhone・iPad・別のPC）用のmDNS名
  "cn-ueno-health-and-beauty.local": "/",
  "cnsalon-board.local": "/admin/login",
  // 「.localhost」なしの短い名前（Macのhostsに登録すると使える）
  "cn-ueno-health-and-beauty": "/",
  "cnsalon-board": "/admin/login",
};
// 許可するホスト名は正式URL＋mDNS名＋localhost/プライベートIPのみ（その他の名前は拒否）
const HOST_NAMES = "cn-ueno-health-and-beauty(\\.localhost|\\.local)?|cnsalon-board(\\.localhost|\\.local)?";
const PRIVATE_IPS = "10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|192\\.168\\.\\d{1,3}\\.\\d{1,3}|172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}|169\\.254\\.\\d{1,3}\\.\\d{1,3}";
// 本番ホスティング（Render/Fly/Railway等）での実行か。管理画面もインターネットから
// 利用できるようになる（守りはIPではなく、ログイン＋権限＋ロック＋流量制限が担う）
const CLOUD = require("./persist").isCloud();
const TRUST_PROXY = process.env.TRUST_PROXY || ""; // "tailscale"：Tailscale Funnel で公開しているとき
// 本番の公開ドメイン（PUBLIC_HOST=example.com,www.example.com のように指定。
// ホスティング各社が自動設定するドメインも自動で許可する）
const PUBLIC_HOSTS = [
  ...(process.env.PUBLIC_HOST || "").split(",").map((h) => h.trim()).filter(Boolean),
  process.env.RENDER_EXTERNAL_HOSTNAME || "",
  process.env.FLY_APP_NAME ? process.env.FLY_APP_NAME + ".fly.dev" : "",
  process.env.RAILWAY_PUBLIC_DOMAIN || "",
].filter(Boolean);
const PUBLIC_HOST_RE = PUBLIC_HOSTS.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const TUNNEL_HOST = "[a-z0-9-]+\\.trycloudflare\\.com";
const LOCAL_HOST_RE = new RegExp(`^(127\\.0\\.0\\.1|\\[::1\\]|localhost|${HOST_NAMES}|${PRIVATE_IPS}|${TUNNEL_HOST}${PUBLIC_HOST_RE ? "|" + PUBLIC_HOST_RE : ""})(:\\d+)?$`, "i");
const LOCAL_ORIGIN_RE = new RegExp(`^https?:\\/\\/(127\\.0\\.0\\.1|\\[::1\\]|localhost|${HOST_NAMES}|${PRIVATE_IPS}|${TUNNEL_HOST}${PUBLIC_HOST_RE ? "|" + PUBLIC_HOST_RE : ""})(:\\d+)?$`, "i");

// ---- HTTPS用のローカル証明書（このMac専用の小さな認証局） ----
// ブラウザの「保護されていない通信」表示を消すため、443番でHTTPSでも配信する。
// 証明書はこのMac上で生成し（tls/ フォルダ。gitやzipには含めない）、
// 各端末に「CN salon local CA」を信頼させると鍵マークつきで開けるようになる。
// 秘密鍵はこのMacから出ないので、外部の認証局・インターネットは不要。
function ensureTls(lanIp) {
  const { execFileSync } = require("child_process");
  const dir = path.join(__dirname, "tls");
  const f = (n) => path.join(dir, n);
  const san = "DNS:localhost,DNS:cn-ueno-health-and-beauty.localhost,DNS:cnsalon-board.localhost," +
    "DNS:cn-ueno-health-and-beauty.local,DNS:cnsalon-board.local," +
    "DNS:cn-ueno-health-and-beauty,DNS:cnsalon-board,IP:127.0.0.1" + (lanIp ? `,IP:${lanIp}` : "");
  try {
    // IPが変わっていなければ既存の証明書をそのまま使う
    if (fs.readFileSync(f("san.txt"), "utf8") === san &&
      fs.existsSync(f("server.pem")) && fs.existsSync(f("server.key")) && fs.existsSync(f("ca.pem"))) {
      return { key: f("server.key"), cert: f("server.pem"), ca: f("ca.pem"), caDer: f("ca.der") };
    }
  } catch {}
  fs.mkdirSync(dir, { recursive: true });
  const sh = (args) => execFileSync("/usr/bin/openssl", args, { stdio: "ignore" });
  if (!fs.existsSync(f("ca.pem")) || !fs.existsSync(f("ca.key"))) {
    fs.writeFileSync(f("ca.cnf"),
      "[req]\ndistinguished_name=dn\nx509_extensions=v3_ca\nprompt=no\n[dn]\nCN=CN salon local CA\n" +
      "[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n");
    sh(["req", "-x509", "-newkey", "rsa:2048", "-keyout", f("ca.key"), "-out", f("ca.pem"),
      "-days", "3650", "-nodes", "-config", f("ca.cnf")]);
  }
  // iPhone等のプロファイル取り込み用にDER形式も用意する
  sh(["x509", "-in", f("ca.pem"), "-outform", "der", "-out", f("ca.der")]);
  fs.writeFileSync(f("ext.cnf"),
    "basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n" +
    `subjectAltName=${san}\n`);
  sh(["req", "-newkey", "rsa:2048", "-keyout", f("server.key"), "-nodes",
    "-out", f("server.csr"), "-subj", "/CN=cnsalon-board.local"]);
  sh(["x509", "-req", "-in", f("server.csr"), "-CA", f("ca.pem"), "-CAkey", f("ca.key"),
    "-CAcreateserial", "-out", f("server.pem"), "-days", "825", "-extfile", f("ext.cnf")]);
  fs.writeFileSync(f("san.txt"), san);
  return { key: f("server.key"), cert: f("server.pem"), ca: f("ca.pem"), caDer: f("ca.der") };
}

// 「鍵マークつきで開く」ための案内ページ（証明書の配布とインストール手順）
const HTTPS_SETUP_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>鍵マークつきで開く設定</title>
<style>body{font-family:"Hiragino Sans",sans-serif;max-width:680px;margin:0 auto;padding:24px 16px;color:#3d3229;line-height:1.9;background:#faf6f0}
h1{font-size:20px;border-bottom:2px solid #8b6b4f;padding-bottom:8px}h2{font-size:16px;color:#8a6a33;margin-top:28px}
a.dl{display:inline-block;background:#8b6b4f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold}
code{background:#eee3d5;padding:1px 6px;border-radius:4px}ol{padding-left:22px}small{color:#6b5b4b}</style></head><body>
<h1>「保護されていない通信」を消して鍵マークで開く</h1>
<p>このシステムはお店のパソコンの中だけで動いています。下の証明書（<b>CN salon local CA</b>）を端末に信頼させると、
<b>https://cn-ueno-health-and-beauty.local/</b>（予約サイト）・<b>https://cnsalon-board.local/</b>（管理画面）が鍵マークつきで開けます。</p>
<p><a class="dl" href="/ca.crt" download="cn-salon-ca.crt">証明書をダウンロード（cn-salon-ca.crt）</a></p>
<h2>iPhone・iPad</h2>
<ol><li>上のボタンを押す →「プロファイルがダウンロードされました」と出る</li>
<li>設定 → 一般 → VPNとデバイス管理 →「CN salon local CA」→ インストール</li>
<li>設定 → 一般 → 情報 → 証明書信頼設定 →「CN salon local CA」を<b>オン</b></li></ol>
<h2>Mac</h2>
<ol><li>ダウンロードした cn-salon-ca.crt をダブルクリック（キーチェーンアクセスに入る）</li>
<li>キーチェーンアクセスで「CN salon local CA」をダブルクリック → 信頼 →「常に信頼」</li></ol>
<h2>Windows</h2>
<ol><li>ダウンロードした cn-salon-ca.crt をダブルクリック →「証明書のインストール」</li>
<li>保存場所は「現在のユーザー」→「証明書をすべて次のストアに配置する」→<b>信頼されたルート証明機関</b> → 完了</li></ol>
<h2>Android</h2>
<ol><li>設定 → セキュリティ → その他 → 証明書のインストール → CA証明書 → ダウンロードしたファイルを選択</li></ol>
<p><small>※この証明書はこのお店のパソコンで作られたもので、このパソコンのサイトにしか効きません（他のサイトの通信には影響しません）。
インストールしない端末でも、今までどおり http:// のURLでそのまま使えます。</small></p>
</body></html>`;

// 流量制限（IPごとの簡易スライディングウィンドウ。メモリ上のみ）
const rateBuckets = new Map(); // key -> { n, t }
function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now - b.t > windowMs) { b = { n: 0, t: now }; rateBuckets.set(key, b); }
  b.n++;
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (now - v.t > 600000) rateBuckets.delete(k);
      if (rateBuckets.size <= 2500) break;
    }
  }
  return b.n > limit;
}

// 写真の配信元（本番のみ）。jsDelivr は公開リポジトリ shuuinoya/cn-salon-ueno-app の public/ をそのまま配る
const IMAGE_CDN = process.env.IMAGE_CDN !== undefined ? process.env.IMAGE_CDN.replace(/\/$/, "")
  : CLOUD ? "https://cdn.jsdelivr.net/gh/shuuinoya/cn-salon-ueno-app@main/public" : "";

// 通信量を減らす：文字のデータ（HTML・JS・CSS・JSON・SVG）は gzip で圧縮して返す
// （無料ホスティングの通信量の上限対策。リアルタイム通知（SSE）・画像・ファイルの流し込みはそのまま）
const zlib = require("zlib");
const crypto = require("crypto");
const COMPRESSIBLE = /^(text\/(?!event-stream)|application\/(json|javascript|xml|manifest\+json)|image\/svg)/;
// 圧縮の結果を覚えて使い回す（同じ中身を毎回圧縮し直さない＝速い）。brotli が使えるブラウザには brotli（gzip より約16%小さい）。
// ・画面の部品などのファイル（Last-Modified つき）は、まず素早く圧縮して返し、裏でいちばん小さくなる設定で圧縮し直して入れ替える
// ・覚える量は合計40MBまで（古いものから捨てる）
const ZCACHE_MAX = 40 * 1024 * 1024;
const zcache = new Map();
let zcacheBytes = 0;
function zcachePut(key, buf) {
  const old = zcache.get(key);
  if (old) { zcacheBytes -= old.length; zcache.delete(key); }
  zcache.set(key, buf);
  zcacheBytes += buf.length;
  while (zcacheBytes > ZCACHE_MAX && zcache.size) {
    const [k, v] = zcache.entries().next().value;
    zcache.delete(k);
    zcacheBytes -= v.length;
  }
}
const brOpts = (q, n) => ({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: q, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: n } });
const zbest = new Set(); // いちばん小さい設定での圧縮し直しが済んだ（または作業中の）もの
function compressCached(buf, enc, isStatic) {
  const key = enc + ":" + crypto.createHash("sha1").update(buf).digest("base64");
  const hit = zcache.get(key);
  if (hit) { zcache.delete(key); zcache.set(key, hit); return hit; } // よく使うものは捨てにくく
  const out = enc === "br" ? zlib.brotliCompressSync(buf, brOpts(5, buf.length)) : zlib.gzipSync(buf, { level: 6 });
  zcachePut(key, out);
  if (isStatic && !zbest.has(key)) {
    zbest.add(key);
    const done = (err, best) => { if (!err && best && best.length < out.length && zcache.has(key)) zcachePut(key, best); };
    if (enc === "br") zlib.brotliCompress(buf, brOpts(11, buf.length), done);
    else zlib.gzip(buf, { level: 9 }, done);
  }
  return out;
}
function withCompression(req, res) {
  const ae = String(req.headers["accept-encoding"] || "");
  const enc = /\bbr\b/.test(ae) ? "br" : /\bgzip\b/.test(ae) ? "gzip" : "";
  if (!enc) return;
  const writeHead = res.writeHead, write = res.write, end = res.end;
  let held = null, streaming = false;
  const flush = (self) => { if (held) { const h = held; held = null; writeHead.apply(self, h); } };
  // 本文の大きさが分かるまで送信ヘッダーを保留する（end で一度に送るときだけ圧縮できる）
  res.writeHead = function (...args) { held = args; return this; };
  res.write = function (...args) { flush(this); streaming = true; return write.apply(this, args); };
  res.end = function (chunk, encoding, cb) {
    if (typeof chunk === "function") { cb = chunk; chunk = undefined; encoding = undefined; }
    if (typeof encoding === "function") { cb = encoding; encoding = undefined; }
    if (!streaming && held) {
      const [status, a, b] = held;
      held = null;
      const hdrs = a && typeof a === "object" ? a : b && typeof b === "object" ? b : null;
      if (hdrs) for (const [k, v] of Object.entries(hdrs)) if (v !== undefined) this.setHeader(k, v);
      const head = typeof a === "string" ? [status, a] : [status];
      const buf = chunk == null ? null : Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === "string" ? encoding : "utf8");
      if (buf && buf.length > 1024 && status === 200 && req.method !== "HEAD" && !this.getHeader("Content-Encoding") &&
          COMPRESSIBLE.test(String(this.getHeader("Content-Type") || ""))) {
        const gz = compressCached(buf, enc, !!this.getHeader("Last-Modified"));
        this.setHeader("Content-Encoding", enc);
        this.setHeader("Vary", "Accept-Encoding");
        this.setHeader("Content-Length", gz.length);
        writeHead.apply(this, head);
        return end.call(this, gz, cb);
      }
      writeHead.apply(this, head);
    } else flush(this);
    return end.call(this, chunk, encoding, cb);
  };
}

const handler = (req, res) => {
  withCompression(req, res);
  const url = new URL(req.url, "http://localhost");
  const head = req.method === "HEAD";

  // ---- 接続元の検査（二層構え） ----
  // ・お客様の予約サイト（予約ページ・予約/回数券API・静的ファイル）は誰でも開ける
  // ・管理系（/admin…・/api/demo/…・/api/partner/…）は、このパソコンと
  //   同じネットワーク（店内Wi-Fi/LAN）のプライベートIPからのみ。さらにログインと
  //   権限のサーバー側検証が必ずかかる（IP制限は多重防御の1枚目にすぎない）
  const ra = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  // トンネル（Cloudflare）経由はソケット上ループバックでも「インターネットのお客様」。
  // 実IPは転送ヘッダから取り、管理系の遮断・流量制限はその実IPで判定する
  // ・Render／Cloudflareトンネル：Cloudflareが必ず上書きする CF-Connecting-IP
  // ・Tailscale で公開（TRUST_PROXY=tailscale）：Tailscaleが必ず上書きする X-Forwarded-For だけを使う。
  //   CF-Connecting-IP はお客様側で自由に付けられ、そのまま届くため使わない（流量制限のすり抜け防止）
  const fwd = TRUST_PROXY === "tailscale"
    ? String(req.headers["x-forwarded-for"] || "").split(",").pop().trim()
    : String(req.headers["cf-connecting-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0] || "").trim();
  const raLoopback = !fwd && (ra === "127.0.0.1" || ra === "::1");
  const raPrivate = raLoopback || (!fwd && (
    /^(10\.|192\.168\.|169\.254\.)/.test(ra) || /^172\.(1[6-9]|2\d|3[01])\./.test(ra) ||
    /^(fe80:|fd)/i.test(ra)));
  const srcIp = fwd || ra;
  {
    const p = url.pathname;
    // 予約サイト側でも使う公開GET（フォーム設定・メニュー/スタッフ写真）だけは例外
    const publicDemoGet = (req.method === "GET" || req.method === "HEAD") &&
      (p === "/api/demo/settings" || p === "/api/demo/course-photo" || p === "/api/demo/staff-photo");
    const adminSurface = p === "/admin" || p.startsWith("/admin/") || p === "/admin-original" ||
      p === "/demo/admin" || p.startsWith("/api/partner/") ||
      (p.startsWith("/api/demo/") && !publicDemoGet);
    // 本番ホスティングでは管理画面もインターネットから使う（IPではなく認証が守る）。
    // ローカル運用（店のMac）では従来どおり店内ネットワーク限定。
    // ADMIN_FROM_INTERNET=0（Tailscale公開時）：管理画面はお店の端末（Tailscaleでつないだ端末）からだけ
    if (CLOUD && TRUST_PROXY === "tailscale" && process.env.ADMIN_FROM_INTERNET === "0" && req.headers["tailscale-funnel-request"] &&
        (adminSurface || p.toLowerCase() === "/cnsalon-board")) { // 管理画面の入口（ログイン画面）も見せない
      res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
      return res.end("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>管理画面</title><p style='font-family:sans-serif;padding:24px'>管理画面は、お店の端末（Tailscaleでつないだ端末）からだけ開けます。</p>");
    }
    if (!CLOUD && !raPrivate && adminSurface) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Forbidden");
    }
  }

  // ---- 流量制限（公開に耐えるための防御。このパソコン自身は対象外） ----
  // ・画像・JS・CSS等の静的ファイル：1つのIPにつき30秒で2000まで
  //   （ページ1枚で数十ファイル読むため別枠。キャッシュ配信で通常はすぐ減る）
  // ・ページ・APIなどそれ以外：1つのIPにつき30秒で300まで
  // ・予約・回数券などの書き込みとログイン試行：1つのIPにつき5分で40回まで
  if (!raLoopback) {
    const p = url.pathname;
    const isStatic = (req.method === "GET" || head) &&
      /\.(js|css|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf|map|txt|webmanifest)$/i.test(p);
    const isWriteTarget = req.method === "POST" && (p === "/api/bookings" || p === "/api/bookings/cancel" ||
      p.startsWith("/api/tickets/") || p.startsWith("/api/member/") || p === "/api/demo/login");
    const over = isStatic
      ? rateLimited("s:" + srcIp, 2000, 30000)
      : rateLimited("g:" + srcIp, 300, 30000) || (isWriteTarget && rateLimited("w:" + srcIp, 40, 300000));
    if (over) {
      res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "30" });
      return res.end(JSON.stringify({ error: "tooManyRequests" }));
    }
  }

  // Hostヘッダ検証：外部ドメイン名経由でローカルサーバーへ到達させる攻撃を遮断
  if (!LOCAL_HOST_RE.test(req.headers.host || "")) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Forbidden");
  }
  // 別サイトのページからの書き込み（予約作成・設定変更など）を遮断（CSRF対策）
  const origin = req.headers.origin;
  if (req.method !== "GET" && req.method !== "HEAD" && origin && !LOCAL_ORIGIN_RE.test(origin)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "forbidden" }));
  }
  // 基本のセキュリティヘッダ（内容の型偽装・他サイトへの埋め込み・参照元の漏えいを防ぐ）
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  // 追加の守り：他サイトへの埋め込み禁止・<base>の差し替え禁止・プラグイン禁止・フォームの送り先は自サイトのみ
  // （スクリプトの読み込み元は制限しない＝保存版の画面がそのまま動く）
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  // 本番（https）では、以後は必ず暗号化した接続で開かせる（1年間）
  if (CLOUD) res.setHeader("Strict-Transport-Security", "max-age=31536000");
  // 実際の接続元（ログイン記録などで使う）と、インターネットからのアクセスか（Tailscale公開時は Funnel 経由かで判定）
  req.clientIp = srcIp;
  req.fromInternet = TRUST_PROXY === "tailscale" ? !!req.headers["tailscale-funnel-request"] : !raPrivate;
  // 名前ホスト（数字なしURL）のトップは、それぞれの入口ページを表示する
  const hostName = (req.headers.host || "").toLowerCase().replace(/:\d+$/, "");

  // ファビコンはホスト名で実体ごと出し分ける（リンク差し替えに加え、
  // 古いURL（/favicon.svg・/favicon.ico）を直接キャッシュしているブラウザにも効かせる）
  if (url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg") {
    const isAdminHost = hostName.startsWith("cnsalon-board");
    const isBookingHost = hostName.startsWith("cn-ueno");
    if (isAdminHost || isBookingHost || url.pathname === "/favicon.ico") {
      const fav = isAdminHost ? "pm-clover.svg" : "fm-favicon.svg";
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
      if (!head) return fs.createReadStream(path.join(__dirname, "public", fav)).pipe(res);
      return res.end();
    }
  }
  // HTTPS用の証明書配布と設定案内（鍵マークつきで開くための手順ページ）
  if (url.pathname === "/https-setup") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(head ? undefined : HTTPS_SETUP_HTML);
  }
  if (url.pathname === "/ca.crt") {
    const der = path.join(__dirname, "tls", "ca.der");
    if (!fs.existsSync(der)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {
      "Content-Type": "application/x-x509-ca-cert",
      "Content-Disposition": 'attachment; filename="cn-salon-ca.crt"',
      "Cache-Control": "no-store",
    });
    if (!head) return fs.createReadStream(der).pipe(res);
    return res.end();
  }

  if (NAME_HOSTS[hostName] && url.pathname === "/") {
    url.pathname = NAME_HOSTS[hostName];
  }

  // 管理画面はログイン必須（ID・パスワードはログイン画面から）
  const isAdminPage = url.pathname === "/admin" || url.pathname === "/demo/admin" ||
    url.pathname === "/admin-original" ||
    (url.pathname.startsWith("/admin/") && url.pathname !== "/admin/login");
  if (isAdminPage && !isAdminSession(req)) {
    res.writeHead(302, { Location: "/admin/login" });
    return res.end();
  }
  // ログアウト経由でログイン画面に来たらセッションを破棄する
  if (url.pathname === "/admin/login" && url.searchParams.get("out") === "1") {
    clearSession(req, res);
  } else if ((url.pathname === "/admin/login" || url.pathname.toLowerCase() === "/cnsalon-board") && isAdminSession(req)) {
    // すでにログイン中なら、ログイン画面を出さずに予約台帳へ（毎回ログインし直さなくてよい）
    res.writeHead(302, { Location: "/admin" });
    return res.end();
  }


  // 管理画面（操作デモ）用のAPIは、メモリ上の架空データで再現しています
  if (handleDemoApi(req, res, url)) return;

  // 予約・空き状況・ログインなどは元サイトのサーバーの機能なので、この保存版では使えません
  if (url.pathname.startsWith("/api/")) {
    res.writeHead(503, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "unavailable" }));
  }
  if (!head && req.method !== "GET") {
    res.writeHead(405);
    return res.end();
  }

  // 画像・JavaScript・CSS・フォント
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send404(res, head);
  }
  // 入口URL：/cn-ueno-health-and-beauty（予約サイト）・/cnsalon-board（管理画面）
  // アドレスバーに名前を残すため、転送せずその場で本来のページを表示する
  const entry = ENTRY_URLS[pathname.toLowerCase()];
  if (entry) {
    const er = routes[entry];
    if (er && er.file) {
      const eu = new URL(url);
      eu.pathname = entry; // ページ内部のルーターには本来のパスを渡す
      return sendFile(res, path.join(ROOT, er.file), er.status, er.contentType, head, eu, req);
    }
  }

  // 版つきの場所の画面の部品（/_next/static/v-<版>/chunks/…）は、本来の場所のファイルを返す
  const pinM = /^\/_next\/static\/v-([a-f0-9]{6,20})\/((?:chunks|css)\/[^/]+)$/.exec(pathname);
  if (pinM) {
    req.pinStatic = pinM[1] === staticVer() ? "current" : "stale";
    pathname = "/_next/static/" + pinM[2];
  }

  const file = path.normalize(path.join(PUBLIC, pathname));
  if (file.startsWith(PUBLIC + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return sendFile(res, file, 200, TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", head, url, req);
  }

  // 末尾が「/」のURLは元サイトと同じく「/」なしへ転送
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    res.writeHead(308, { Location: url.pathname.replace(/\/+$/, "") + url.search });
    return res.end();
  }

  // ページ（ページ移動時の裏側の通信 _rsc にも同じHTMLを返し、通常のページ読み込みにする）
  const r = routes[routeKey(url)] || routes[url.pathname];
  if (!r || !r.file) {
    // チャットやメモのリンクをクリックすると、URLの直後の全角文字まで
    // リンクに含まれてしまうことがある（例: /admin（管理画面））。
    // 末尾の非ASCII文字を取り除いた先が存在する場合はそちらへ転送する。
    const stripped = pathname.replace(/[^\x21-\x7e].*$/s, "") || "/";
    if (stripped !== pathname && (routes[stripped] || stripped === "/")) {
      res.writeHead(302, { Location: encodeURI(stripped) + url.search });
      return res.end();
    }
    return send404(res, head);
  }
  sendFile(res, path.join(ROOT, r.file), r.status, r.contentType, head, url, req);
};
const server = http.createServer(handler);

// ほかのサイト（localhost:3000 など）と混ざらないよう、専用の番号で起動する
const HOST = process.env.BIND || (CLOUD ? "0.0.0.0" : "127.0.0.1");
let port = Number(process.env.PORT) || 5520;
server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    // このプロセスからの保存を止める（終了時フックが本物のデータを上書きしないように）
    try { require("./persist").abortSaves(); } catch {}
    // 二重起動は中止する。以前は空いている番号へ自動でずらしていたが、
    // データ保存が有効になった今は、2つのサーバーが同じ保存ファイルを
    // 書き合って予約データを壊す危険があるため、はっきり止めて案内する
    console.log("すでにこのサイトのサーバーが起動しています（二重起動はデータ保護のため中止しました）。");
    console.log("起動済みのサーバーをそのままお使いください：");
    console.log(`  予約サイト : http://cn-ueno-health-and-beauty.localhost/`);
    console.log(`  管理画面   : http://cnsalon-board.localhost/`);
    console.log("（作り直したい場合は、先に既存のサーバーを停止してから F5 を押してください）");
    process.exit(0);
  } else {
    throw e;
  }
});
server.on("listening", () => {
  process.env.DEMO_ORIGIN = PUBLIC_HOSTS[0] ? `https://${PUBLIC_HOSTS[0]}` : `http://127.0.0.1:${port}`; // メール内のリンク生成用
  if (CLOUD) {
    console.log("本番ホスティングモードで起動しました。");
    if (PUBLIC_HOSTS.length) {
      console.log(`  予約サイト : https://${PUBLIC_HOSTS[0]}/`);
      console.log(`  管理画面   : https://${PUBLIC_HOSTS[0]}/cnsalon-board （要ログイン）`);
      // 無料プランは15分アクセスが無いと停止し、その間はリマインドメール（来店24時間前）を送れない。
      // 10分ごとに自分の公開URLへ軽いアクセスをして、停止させずに時刻どおり送れるようにする。
      // 止めたい場合は環境変数 KEEP_AWAKE=0
      if (process.env.KEEP_AWAKE !== "0") {
        const ping = () => fetch(`https://${PUBLIC_HOSTS[0]}/api/tickets/plans`).catch(() => {});
        setInterval(ping, 10 * 60000);
        console.log("  稼働維持   : 10分ごとに自動アクセス（リマインドメールを時刻どおり送るため／KEEP_AWAKE=0 で停止）");
      }
    }
    return; // ポート80/443・mDNS・トンネルはローカル専用機能のため起動しない
  }
  console.log("起動しました。");
  // 数字なしのURL（ポート80）。使用中などで開けない場合は番号つきURLを案内する
  const server80 = http.createServer(handler);
  server80.on("error", () => {
    console.log(`  予約サイト【${BOOKING_BRAND}】 : http://${HOST}:${port}/cn-ueno-health-and-beauty`);
    console.log(`  管理画面 【${ADMIN_BRAND}】 : http://${HOST}:${port}/cnsalon-board`);
  });
  server80.on("listening", () => {
    console.log(`  予約サイト【${BOOKING_BRAND}】 : http://cn-ueno-health-and-beauty.localhost/`);
    console.log(`  管理画面 【${ADMIN_BRAND}】 : http://cnsalon-board.localhost/`);
    // 同じWi-Fi/LANの他の端末（iPhone・iPad・別のPC・別のブラウザ）向けに、
    // mDNS(Bonjour)で「〜.local」の名前を配信する（macOS標準のdns-sdを使用。失敗しても本体は動く）
    try {
      const os = require("os");
      const { spawn, execFileSync } = require("child_process");
      if (process.platform === "darwin") {
        const ip = Object.values(os.networkInterfaces()).flat()
          .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
        // mDNS配信（IPが変わったら自動で配信し直す。Wi-Fiの切替に自動追従）
        const lanIp = () => Object.values(os.networkInterfaces()).flat()
          .find((i) => i && i.family === "IPv4" && !i.internal)?.address || "";
        let mdnsKids = [];
        const registerMdns = (ip2) => {
          for (const c of mdnsKids) { try { c.kill(); } catch {} }
          mdnsKids = [];
          // 前回起動の配信プロセスが残っていれば止める（古いIPの配信を防ぐ）
          try { execFileSync("/usr/bin/pkill", ["-f", "dns-sd -P (cn-ueno-health-and-beauty|cnsalon-board)"]); } catch {}
          for (const h of ["cn-ueno-health-and-beauty", "cnsalon-board"]) {
            const c = spawn("/usr/bin/dns-sd", ["-P", h, "_http._tcp", "local", "80", `${h}.local`, ip2], { stdio: "ignore" });
            c.on("error", () => {});
            mdnsKids.push(c);
          }
        };
        process.on("exit", () => { for (const c of mdnsKids) { try { c.kill(); } catch {} } });
        let curIp = ip;
        const ipWatch = setInterval(() => {
          const now2 = lanIp();
          if (now2 && now2 !== curIp) {
            curIp = now2;
            registerMdns(now2);
            console.log(`（ネットワーク変更を検知）他の端末用の名前を新しいIP ${now2} で配信し直しました。`);
            console.log("  ※鍵マーク（HTTPS）のIP直アクセスも使う場合は F5 で再起動すると証明書が追従します");
          }
        }, 60000);
        ipWatch.unref?.();
        // インターネット公開（Cloudflareトンネル）。tools/bin/cloudflared があれば自動起動し、
        // どのネットワークからでも開ける予約サイトの公開URLを発行する。
        // 管理画面・管理APIは転送ヘッダで「インターネット扱い」になり公開されない。
        // DEMO_TUNNEL=0 で無効化できる。公開URLは再起動ごとに変わる（data/tunnel-url.txt にも保存）
        try {
          const cfBin = path.join(__dirname, "tools", "bin", "cloudflared");
          if (fs.existsSync(cfBin) && process.env.DEMO_TUNNEL !== "0") {
            try { execFileSync("/usr/bin/pkill", ["-f", "cloudflared tunnel --url"]); } catch {}
            const t = spawn(cfBin, ["tunnel", "--url", "http://127.0.0.1:80", "--no-autoupdate"], { stdio: ["ignore", "pipe", "pipe"] });
            let announced = false;
            const onData = (b) => {
              const m = String(b).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
              if (m && !announced) {
                announced = true;
                console.log("  インターネット公開（どのネットワークのお客様でも・鍵マークつき）:");
                console.log(`    予約サイト : ${m[0]}`);
                console.log("    ※このURLは再起動のたびに変わります。管理画面はインターネットには公開されません");
                try {
                  fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
                  fs.writeFileSync(path.join(__dirname, "data", "tunnel-url.txt"), m[0] + "\n");
                } catch {}
              }
            };
            t.stdout.on("data", onData);
            t.stderr.on("data", onData);
            t.on("error", () => {});
            process.on("exit", () => { try { t.kill(); } catch {} });
          }
        } catch {}
        if (ip) {
          registerMdns(ip);
          console.log("  ほかの端末（同じWi-Fi）から:");
          console.log(`    予約サイト : http://cn-ueno-health-and-beauty.local/`);
          console.log(`    管理画面   : http://cnsalon-board.local/`);
          console.log(`    名前で開けない端末は : http://${ip}/ （管理画面は http://${ip}/cnsalon-board ）`);
        }
        // HTTPS（443番）。証明書を信頼させた端末は鍵マークつきの https:// で開ける
        // （Wi-Fi未接続でもこのMac内の https://〜.localhost/ 用に起動する）
        try {
          const t = ensureTls(ip || "");
          const server443 = require("https").createServer({
            key: fs.readFileSync(t.key),
            cert: fs.readFileSync(t.cert) + fs.readFileSync(t.ca), // 中間なしのCA直署名＋チェーン同梱
          }, handler);
          server443.on("error", () => { console.log("  （443番が使用中のためHTTPSは休止。http:// はそのまま使えます）"); });
          server443.on("listening", () => {
            console.log("  鍵マークつき（証明書を入れた端末）:");
            console.log(`    予約サイト : https://cn-ueno-health-and-beauty.local/ ・ https://cn-ueno-health-and-beauty.localhost/`);
            console.log(`    管理画面   : https://cnsalon-board.local/ ・ https://cnsalon-board.localhost/`);
            console.log(`    証明書の入れ方 : http://cnsalon-board.local/https-setup （どの端末からでも開けます）`);
          });
          server443.listen(443);
        } catch {
          console.log("  （証明書を作成できなかったためHTTPSは休止。http:// はそのまま使えます）");
        }
      }
    } catch {}
  });
  // macOSは 127.0.0.1 指定だと80番を開けないため全体で待ち、上のループバック検査で守る
  if (port === 5520 && !CLOUD) server80.listen(80);
  else {
    console.log(`  予約サイト【${BOOKING_BRAND}】 : http://${HOST}:${port}/cn-ueno-health-and-beauty`);
    console.log(`  管理画面 【${ADMIN_BRAND}】 : http://${HOST}:${port}/cnsalon-board`);
  }
});
// 保存データ（ローカル／GitHub）の復元が終わってから受付を開始する
demoReady.then(() => server.listen(port, HOST));
