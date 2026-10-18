// 画面を速くする小さな仕組み（サーバーが全ページの先頭に直接入れる。ここを書き換えるとすぐ反映）
// ① ページ移動の裏側の通信（?_rsc=…）をやめて、すぐ次のページを開く。
//    このサイトのサーバーはその通信にも普通のページを返すため、画面はそれを受け取ってから改めて同じページを開き直していた（1往復のむだ）。
//    画面に見えているリンク全部の先読み（1ページ約7KB×メニューの数）も、使われないのでやめる
// ② ページと一緒に届いたデータ（window.__cnBoot）があれば、開いた直後はそれを使う（取りに行く往復を省く）
// ③ 同じデータを同時に何回も取りに行くときは、1回の通信を分け合う（予約台帳を開いた直後など）
(function () {
  "use strict";
  if (window.__cnFast) return;
  window.__cnFast = 1;
  var F = window.fetch;
  if (typeof F !== "function") return;
  var boot = window.__cnBoot || null;
  var bootAt = Date.now();
  if (boot && boot.seq != null) window.__cnBootSeq = window.__cnBootSeqInit = String(boot.seq);
  // サーバーの「変わった」合図（予約・シフトなどの変更）が、データを作ったときの番号と違ったら、届いたデータはもう使わない
  var ES = window.EventSource;
  if (boot && typeof ES === "function") {
    var ES2 = function (u, c) {
      var es = c === undefined ? new ES(u) : new ES(u, c);
      try { es.addEventListener("message", function (ev) { if (boot && String(ev.data) !== String(boot.seq)) boot = null; }); } catch (e) {}
      return es;
    };
    ES2.prototype = ES.prototype;
    ES2.CONNECTING = 0; ES2.OPEN = 1; ES2.CLOSED = 2;
    window.EventSource = ES2;
  }
  var inflight = {};
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
      return F.apply(window, arguments);
    }
    // ② ページと一緒に届いたデータ：開いてから5秒間は何度でも（画面のいくつもの部品が同じデータを取りに来るため）、
    //    そのあとは20秒までにまだ使われていなければ1回だけ使う
    var key = u.pathname + u.search;
    var age = Date.now() - bootAt;
    if (boot && boot.d && boot.d[key] && age < 20000 && (age < 5000 || !boot.d[key].used)) {
      var e = boot.d[key];
      e.used = 1;
      return Promise.resolve(new Response(e.b, { status: e.s, headers: { "Content-Type": e.t || "application/json" } }));
    }
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
