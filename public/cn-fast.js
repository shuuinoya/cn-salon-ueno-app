// 画面を速くする小さな仕組み（サーバーが全ページの先頭に直接入れる。ここを書き換えるとすぐ反映）
// ① ページ移動の裏側の通信（?_rsc=…）をやめて、すぐ次のページを開く。
//    このサイトのサーバーはその通信にも普通のページを返すため、画面はそれを受け取ってから改めて同じページを開き直していた（1往復のむだ）。
//    画面に見えているリンク全部の先読み（1ページ約7KB×メニューの数）も、使われないのでやめる
// ② ページと一緒に届いたデータ（window.__cnBoot）があれば、開いた直後はそれを使う（取りに行く往復を省く）
// ③ 同じデータを同時に何回も取りに行くときは、1回の通信を分け合う（予約台帳を開いた直後など）
// ④ 管理画面の台帳データ（日ごと）を覚えておき、前後の日を先読みする。日付を切り替えたら待たずに出す。
//    サーバーの「変わった」合図の番号が、データを取ったときと同じ間だけ使う（予約・シフトなどが変わればすぐ取り直す）
(function () {
  "use strict";
  if (window.__cnFast) return;
  window.__cnFast = 1;
  var F = window.fetch;
  if (typeof F !== "function") return;
  var boot = window.__cnBoot || null;
  var bootAt = Date.now();
  if (boot && boot.seq != null) window.__cnBootSeq = window.__cnBootSeqInit = String(boot.seq);
  // サーバーの「変わった」合図（予約・シフトなどの変更）の番号を覚えておく。
  // ・ページと一緒に届いたデータは、作ったときの番号と違ったらもう使わない
  // ・覚えた台帳データも、取ったときの番号と違ったら使わない。合図の接続が切れたら（番号が分からない間は）使わない
  var curSeq = null;
  var ES = window.EventSource;
  if (typeof ES === "function") {
    var ES2 = function (u, c) {
      var es = c === undefined ? new ES(u) : new ES(u, c);
      try {
        es.addEventListener("message", function (ev) {
          var was = curSeq;
          curSeq = String(ev.data);
          // 合図の番号が分かった（つながった・変わった）ことを画面に知らせる（前後の日の先読みを始める合図）
          if (was !== curSeq) { try { window.dispatchEvent(new CustomEvent("cn:seq", { detail: curSeq })); } catch (e) {} }
          if (boot && curSeq !== String(boot.seq)) boot = null;
        });
        es.addEventListener("error", function () { curSeq = null; });
      } catch (e) {}
      return es;
    };
    ES2.prototype = ES.prototype;
    ES2.CONNECTING = 0; ES2.OPEN = 1; ES2.CLOSED = 2;
    window.EventSource = ES2;
  }
  var inflight = {};
  // ④ 台帳データ（予約台帳・受付停止）を覚えておく場所。key＝パス＋日付
  var KEEP = /^\/api\/demo\/(schedule|locks)$/;
  var kept = {}, keptFlight = {};
  var KEEP_MS = 90000;
  function keptResponse(e) { return new Response(e.text, { status: e.status, headers: { "Content-Type": e.type } }); }
  // 台帳データが届いたことを画面（管理画面の上書き pm-layout.js）に知らせる。画面の部品が受け取る前に知らせるので、
  // 枠が出た瞬間に見た目（バッジ・色）を整えられる
  // 画面の上書きがまだ読み込まれていなくても受け取れるよう、最後に届いたものを残しておく
  window.__cnLastApi = {};
  function tell(path, search, text) {
    window.__cnLastApi[path] = { path: path, search: search, text: text };
    try { window.dispatchEvent(new CustomEvent("cn:api", { detail: { path: path, search: search, text: text } })); } catch (e) {}
  }
  function withSignal(p, signal) {
    if (!signal) return p;
    if (signal.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));
    return new Promise(function (res, rej) {
      signal.addEventListener("abort", function () { rej(new DOMException("aborted", "AbortError")); });
      p.then(res, rej);
    });
  }
  function keptFetch(u, init) {
    var key = u.pathname + u.search;
    var c = kept[key];
    if (c && curSeq !== null && c.seq === curSeq && Date.now() - c.at < KEEP_MS) {
      tell(u.pathname, u.search, c.text);
      return Promise.resolve(keptResponse(c));
    }
    var p = keptFlight[key];
    if (!p) {
      var seqAtStart = curSeq;
      p = keptFlight[key] = F(key, { credentials: "same-origin", cache: "no-store" }).then(function (r) {
        return r.text().then(function (text) {
          var e = { text: text, status: r.status, type: r.headers.get("Content-Type") || "application/json", seq: seqAtStart, at: Date.now() };
          // 取っている間に「変わった」合図が来たら、そのデータは覚えない（変更の前か後か分からないため）
          if (r.ok && seqAtStart !== null && seqAtStart === curSeq) kept[key] = e;
          if (keptFlight[key] === p) delete keptFlight[key];
          return e;
        });
      }, function (err) { if (keptFlight[key] === p) delete keptFlight[key]; throw err; });
    }
    return withSignal(p.then(function (e) { if (e.status === 200) tell(u.pathname, u.search, e.text); return keptResponse(e); }), init && init.signal);
  }
  // 前後の日などを先読みする（覚えた台帳データがまだ使えるものは取りに行かない）
  window.__cnPrefetch = function (paths) {
    (paths || []).forEach(function (pth, i) {
      setTimeout(function () {
        try {
          var u2 = new URL(pth, location.href), c2 = kept[u2.pathname + u2.search];
          if (c2 && curSeq !== null && c2.seq === curSeq && Date.now() - c2.at < KEEP_MS / 2) return;
          if (curSeq === null) return; // 番号が分からない間は先読みしない（覚えられないため）
          keptFetch(u2, null).catch(function () {});
        } catch (e) {}
      }, 120 + i * 60);
    });
  };
  function hget(h, n) {
    if (!h) return null;
    try {
      if (typeof h.get === "function") return h.get(n);
      if (Array.isArray(h)) { for (var i = 0; i < h.length; i++) if (String(h[i][0]).toLowerCase() === n) return h[i][1]; return null; }
      for (var k in h) if (k.toLowerCase() === n) return h[k];
    } catch (e) {}
    return null;
  }
  function wrapped(input, init) {
    var u, method, isReq = typeof Request !== "undefined" && input instanceof Request;
    try {
      u = new URL(isReq ? input.url : String(input), location.href);
      method = String((init && init.method) || (isReq ? input.method : "") || "GET").toUpperCase();
    } catch (e) { return F.apply(window, arguments); }
    if (u.origin !== location.origin) return F.apply(window, arguments);
    var headers = (init && init.headers) || (isReq ? input.headers : null);
    // ① ページ移動の裏側の通信
    if ((method === "GET" || method === "HEAD") && u.searchParams.has("_rsc")) {
      if (method === "HEAD" || (init && init.purpose === "prefetch") || hget(headers, "next-router-prefetch") || hget(headers, "next-router-segment-prefetch")) {
        return Promise.reject(new DOMException("prefetch skipped", "AbortError"));
      }
      u.searchParams.delete("_rsc");
      var to = u.href;
      if (to === location.href) location.replace(to); else location.assign(to);
      return new Promise(function () {}); // このあとページが切り替わる
    }
    if (method !== "GET") {
      // 書き込みの操作のあとは、先に届いたデータ・取りに行っている途中のデータを使わない（必ず新しく取りに行く）
      if (u.pathname !== "/api/tickets/mine") boot = null;
      inflight = {};
      kept = {}; keptFlight = {};
      return F.apply(window, arguments);
    }
    // ② ページと一緒に届いたデータ：開いてから5秒間は何度でも（画面のいくつもの部品が同じデータを取りに来るため）、
    //    そのあとは20秒までにまだ使われていなければ1回だけ使う
    var key = u.pathname + u.search;
    var age = Date.now() - bootAt;
    if (boot && boot.d && boot.d[key] && age < 20000 && (age < 5000 || !boot.d[key].used)) {
      var e = boot.d[key];
      e.used = 1;
      if (KEEP.test(u.pathname) && e.s === 200) tell(u.pathname, u.search, e.b);
      return Promise.resolve(new Response(e.b, { status: e.s, headers: { "Content-Type": e.t || "application/json" } }));
    }
    // ④ 台帳データ（覚えたものがあれば待たずに・取りに行っている途中なら分け合う）
    if (KEEP.test(u.pathname) && !isReq) return keptFetch(u, init);
    // ③ 同時に同じものを取りに行くときは分け合う（途中で取り消す指定つき・リクエスト形式のものは対象外）
    if (u.pathname.indexOf("/api/") === 0 && !isReq && !(init && (init.signal || init.body))) {
      var k = u.href, p = inflight[k];
      if (!p) {
        p = inflight[k] = F.apply(window, arguments);
        var clear = function () { if (inflight[k] === p) delete inflight[k]; };
        p.then(clear, clear);
      }
      return p.then(function (r) { return r.clone(); });
    }
    return F.apply(window, arguments);
  }
  window.fetch = wrapped;
  // 管理画面のログイン画面：ID・パスワードを入れている間に、予約台帳の部品をそっと読み込んでおく
  // （部品は版つきで1年使い回すので、2回目からは通信しない）
  if (window.__cnWarm && window.__cnWarm.length) {
    var warm = function () {
      window.__cnWarm.forEach(function (src, i) {
        setTimeout(function () { try { F(src, { credentials: "same-origin", priority: "low" }).catch(function () {}); } catch (e) {} }, i * 15);
      });
    };
    if (document.readyState === "complete") setTimeout(warm, 300);
    else window.addEventListener("load", function () { setTimeout(warm, 300); });
  }
})();
