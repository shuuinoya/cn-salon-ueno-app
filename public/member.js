// 予約サイトの会員ログイン／新規会員登録
// ・右上の「ログイン」→ モーダル（メールアドレス・パスワード・パスワードを忘れた方・ソーシャルログイン）。
//   「はじめての方は新規会員登録」から、お名前・メールアドレス・パスワードで会員登録できる
// ・トップ等の右の列（.side-column）にも同じログイン欄を出す（本物のサイトと同じ配置）。
//   ログイン中は会員メニュー（マイページ・回数券の残り回数・ログアウト）になる
// ・登録が完了すると「会員登録完了のお知らせ」メール（ログインID＝メールアドレス入り）が届き、
//   【予約】【メニュー】の一番上に回数券が表示される（booking-tweaks.js）
// ・ログイン中は右上のボタンが「マイページ」になる
// ・このブラウザに保存されていた予約・回数券（予約完了時に記録されたID＋トークン）は、
//   ログイン・登録時に会員へ自動的に紐付く
// ・本人確認・権限はすべてサーバー側（/api/member/*）。この画面は表示と入力だけ
(function () {
  "use strict";
  if (window.CNMember) return;

  const lang = (() => { try { return String(localStorage.getItem("cn-salon-language") || "ja").slice(0, 2); } catch { return "ja"; } })();
  const en = lang === "en";
  const T = en ? {
    login: "Log in", mypage: "My page", email: "Email address", pass: "Password",
    forgot: "Forgot your password?", social: "Social login", cancel: "Cancel",
    with: (s) => "Log in with " + s,
    toRegister: "New here? Create a free account", toRegisterShort: "Sign up (free)",
    toLogin: "Already a member? Log in",
    register: "Create account", registerTitle: "Sign up (free)",
    name: "Your name", pass2: "Password (confirm)", passHint: "6 or more characters",
    registerNote: "After signing up you will receive a confirmation email with your login ID. Members can buy and use multi-visit tickets from the top of the Booking and Menu pages.",
    registered: (e) => "Your account has been created. A confirmation email has been sent to " + e + ".",
    invalid: "The email address or password is incorrect. If you are new, please create an account.",
    exists: "This email address is already registered. Please log in.",
    nameReq: "Please enter your name.",
    passMismatch: "The passwords do not match.",
    shortPass: "Please use a password of at least 6 characters.",
    tooMany: "Too many attempts. Please wait a minute and try again.",
    badEmail: "Please enter a valid email address.",
    fail: "Could not complete. Please try again later.",
    resetAsk: "Enter your registered email address. We will send a temporary password.",
    resetDone: "If the address is registered, a temporary password has been sent.",
    socialSoon: "Social login is coming soon. Please log in with your email address.",
    heading: "Log in", member: "Member menu", hello: (n) => (n ? n + " " : "") + "(member)",
    tickets: "Your tickets", noTickets: "No tickets yet", left: (n) => n + " left", logout: "Log out", seeTickets: "Tickets",
  } : {
    login: "ログイン", mypage: "マイページ", email: "メールアドレス", pass: "パスワード",
    forgot: "パスワードを忘れた方はこちら", social: "ソーシャルログイン", cancel: "キャンセル",
    with: (s) => s + "でログイン",
    toRegister: "はじめての方は新規会員登録（無料）", toRegisterShort: "新規会員登録（無料）",
    toLogin: "会員の方はこちら（ログイン）",
    register: "登録する", registerTitle: "新規会員登録（無料）",
    name: "お名前", pass2: "パスワード（確認）", passHint: "6文字以上",
    registerNote: "登録が完了すると、ログインID（メールアドレス）を記載した「会員登録完了のお知らせ」メールをお送りします。会員様は【予約】【メニュー】ページの一番上から回数券をご購入・ご利用いただけます。",
    registered: (e) => "会員登録が完了しました。\n「会員登録完了のお知らせ」を " + e + " にお送りしました。",
    invalid: "メールアドレスまたはパスワードが違います。はじめての方は「新規会員登録」からご登録ください。",
    exists: "このメールアドレスはすでに登録されています。ログインしてください。",
    nameReq: "お名前を入力してください。",
    passMismatch: "パスワード（確認）が一致しません。",
    shortPass: "パスワードは6文字以上で入力してください。",
    tooMany: "試行回数が多すぎます。1分ほど待ってからお試しください。",
    badEmail: "メールアドレスの形式を確認してください。",
    fail: "処理できませんでした。時間をおいてお試しください。",
    resetAsk: "ご登録のメールアドレスを入力してください。仮パスワードをお送りします。",
    resetDone: "ご登録のアドレスであれば、仮パスワードをお送りしました。メールをご確認ください。",
    socialSoon: "ソーシャルログインは準備中です。メールアドレスでログインしてください。",
    heading: "ログイン", member: "会員メニュー", hello: (n) => (n ? n + " 様" : "会員様"),
    tickets: "保有中の回数券", noTickets: "保有中の回数券はありません", left: (n) => "残り " + n + "回", logout: "ログアウト", seeTickets: "回数券を見る・購入する",
  };

  const ls = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const CNMember = window.CNMember = { me: null, data: null, ready: null, open, close, logout, refresh };
  function refresh() {
    CNMember.ready = fetch("/api/member/me", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { CNMember.data = j; CNMember.me = j ? j.member : null; return CNMember.me; })
      .catch(() => null);
    return CNMember.ready;
  }
  refresh();

  // ---- 見た目（本物のログインモーダルと同じ構成） ----
  const CSS =
    "#cn-login-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:28px 16px;overflow:auto}" +
    ".cn-login-card{background:#fff;border-radius:12px;width:100%;max-width:480px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:inherit;color:#222}" +
    ".cn-lh{padding:20px 22px;border-bottom:1px solid #e6e6e6}.cn-lh h2{margin:0;font-size:20px;font-weight:700}" +
    ".cn-lf{padding:18px 22px 10px}.cn-lf label{display:block;font-size:17px;margin:0 0 14px}" +
    ".cn-lf label small{color:#888;font-size:13px;margin-left:6px}" +
    ".cn-in{display:flex;align-items:center;border:1px solid #cfcfcf;border-radius:8px;height:52px;margin-top:8px;padding:0 12px;background:#fff}" +
    ".cn-in svg{width:20px;height:20px;fill:none;stroke:#8a8a8a;stroke-width:1.8;flex:none;margin-right:10px}" +
    ".cn-in input{border:0;outline:0;flex:1;font-size:17px;background:transparent;min-width:0}" +
    ".cn-gold{display:block;width:100%;border:0;border-radius:8px;background:#c5a15e;color:#fff;font-size:20px;font-weight:700;height:56px;cursor:pointer;margin-top:6px}" +
    ".cn-gold[disabled]{opacity:.6;cursor:default}" +
    ".cn-forgot{display:block;text-align:center;color:#666;font-size:15px;margin:14px 0 6px;text-decoration:none}" +
    ".cn-switch{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;margin:12px 0 6px;border:1px solid #c5a15e;border-radius:8px;background:#fff;color:#8a6a33;font-size:16px;font-weight:700;cursor:pointer}" +
    ".cn-note{font-size:12.5px;color:#777;line-height:1.7;margin:4px 0 8px}" +
    ".cn-err{color:#c0392b;font-size:14px;margin:-4px 0 10px;white-space:pre-line}" +
    ".cn-social{padding:18px 22px;border-top:1px solid #e6e6e6}.cn-social h3{margin:0 0 16px;font-size:18px;font-weight:700}" +
    ".cn-sb{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;height:56px;border:1px solid #cfcfcf;border-radius:10px;background:#fff;font-size:18px;font-weight:600;color:#222;cursor:pointer;margin-bottom:12px}" +
    ".cn-sb svg{width:24px;height:24px;flex:none}.cn-sb b{font-size:22px;color:#7cb518;font-weight:800;line-height:1}" +
    ".cn-lfoot{padding:18px 22px;border-top:1px solid #e6e6e6;text-align:center}" +
    ".cn-cancel{border:1px solid #9a9a9a;background:#fff;border-radius:8px;padding:14px 34px;font-size:17px;color:#333;cursor:pointer}" +
    ".cn-inline .cn-lf{padding:6px 22px 0}.cn-inline .cn-social{padding:16px 22px 14px}" +
    // 右の列（幅240px）のログイン欄・会員メニュー：既存の side-login-card の見た目のまま中身だけ
    ".cn-side .cn-lf{padding:14px 16px 4px}.cn-side .cn-lf label{font-size:14px;margin-bottom:10px}" +
    ".cn-side .cn-in{height:42px;margin-top:6px;padding:0 10px}.cn-side .cn-in input{font-size:15px}.cn-side .cn-in svg{width:17px;height:17px;margin-right:8px}" +
    ".cn-side .cn-gold{height:42px;font-size:15px;border-radius:4px}.cn-side .cn-forgot{font-size:12.5px;margin:10px 0 4px}" +
    ".cn-side .cn-switch{min-height:40px;font-size:13px;border-radius:4px;margin:8px 0 4px}" +
    ".cn-side .cn-note{font-size:11.5px}.cn-side .cn-err{font-size:12.5px}" +
    ".cn-side .cn-social{padding:12px 16px 14px}.cn-side .cn-social h3{font-size:14px;margin-bottom:10px}" +
    ".cn-side .cn-sb{height:42px;font-size:13px;gap:8px;border-radius:5px;margin-bottom:8px}.cn-side .cn-sb svg{width:18px;height:18px}.cn-side .cn-sb b{font-size:16px}" +
    ".cn-side-member{padding:14px 16px 16px;font-size:14px;line-height:1.7}" +
    ".cn-side-member .cn-hello{font-weight:700;margin:0 0 8px}" +
    ".cn-side-member ul{list-style:none;margin:0 0 10px;padding:0}.cn-side-member li{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed #e6e0d6;padding:4px 0;font-size:13px}" +
    ".cn-side-member li b{color:#8a6a33;white-space:nowrap}.cn-side-member .cn-none{color:#888;font-size:13px;margin:0 0 10px}" +
    ".cn-side-member a,.cn-side-member button{display:flex;align-items:center;justify-content:center;width:100%;min-height:40px;border-radius:4px;font-size:14px;margin-top:8px;text-decoration:none;cursor:pointer}" +
    ".cn-side-member .cn-mp{background:#c5a15e;color:#fff;border:0;font-weight:700}" +
    ".cn-side-member .cn-tk{border:1px solid #c5a15e;color:#8a6a33;background:#fff}" +
    ".cn-side-member .cn-out{border:1px solid #d1d5db;color:#555;background:#fff}" +
    "@media (max-width:480px){#cn-login-ov{padding:12px 10px}.cn-login-card .cn-lf,.cn-login-card .cn-social,.cn-lh,.cn-lfoot{padding-left:18px;padding-right:18px}}";
  function ensureStyle() {
    if (document.getElementById("cn-login-style")) return;
    const st = document.createElement("style");
    st.id = "cn-login-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  const ICON_MAIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
  const ICON_LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0"/></svg>';
  const ICON_USER = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
  const ICON_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.4 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-3.9-13.5-9.3l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
  const ICON_APPLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#000" d="M16.4 12.7c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.8-1.7 0-3.2 1-4.1 2.5-1.8 3.1-.5 7.6 1.3 10.1.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.2 3.1-2.5.9-1.4 1.3-2.7 1.4-2.8-.1 0-2.9-1.1-2.9-4.1zM14 5.3c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z"/></svg>';

  // ログイン（mode="login"）／新規会員登録（mode="register"）のフォーム
  function authHtml(mode) {
    const field = (label, icon, input, hint) => "<label>" + label + (hint ? "<small>" + hint + "</small>" : "") +
      '<span class="cn-in">' + icon + input + "</span></label>";
    if (mode === "register") {
      return (
        '<form class="cn-lf" novalidate data-mode="register">' +
        field(T.name, ICON_USER, '<input type="text" name="name" autocomplete="name" required>') +
        field(T.email, ICON_MAIL, '<input type="email" name="email" autocomplete="email" inputmode="email" required>') +
        field(T.pass, ICON_LOCK, '<input type="password" name="pass" autocomplete="new-password" required>', T.passHint) +
        field(T.pass2, ICON_LOCK, '<input type="password" name="pass2" autocomplete="new-password" required>') +
        '<p class="cn-err" hidden></p>' +
        '<button type="submit" class="cn-gold">' + T.register + "</button>" +
        '<p class="cn-note">' + T.registerNote + "</p>" +
        '<button type="button" class="cn-switch" data-to="login">' + T.toLogin + "</button>" +
        "</form>"
      );
    }
    return (
      '<form class="cn-lf" novalidate data-mode="login">' +
      field(T.email, ICON_MAIL, '<input type="email" name="email" autocomplete="email" inputmode="email" required>') +
      field(T.pass, ICON_LOCK, '<input type="password" name="pass" autocomplete="current-password" required>') +
      '<p class="cn-err" hidden></p>' +
      '<button type="submit" class="cn-gold">' + T.login + "</button>" +
      '<a href="#" class="cn-forgot">' + T.forgot + "</a>" +
      '<button type="button" class="cn-switch" data-to="register">' + T.toRegister + "</button>" +
      "</form>" +
      '<div class="cn-social"><h3>' + T.social + "</h3>" +
      '<button type="button" class="cn-sb" data-social="Google">' + ICON_G + "<span>" + T.with("Google") + "</span></button>" +
      '<button type="button" class="cn-sb" data-social="Apple">' + ICON_APPLE + "<span>" + T.with("Apple") + "</span></button>" +
      '<button type="button" class="cn-sb" data-social="EPARK"><b>E</b><span>' + T.with("EPARK") + "</span></button>" +
      "</div>"
    );
  }

  // container の中にフォームを作り、動作を付ける。onMode(mode) は見出しの切り替え用
  function mount(container, mode, onMode) {
    container.innerHTML = authHtml(mode);
    if (onMode) onMode(mode);
    const form = container.querySelector("form.cn-lf");
    const errBox = container.querySelector(".cn-err");
    const showErr = (msg) => { errBox.textContent = msg; errBox.hidden = !msg; };
    container.querySelector(".cn-switch").addEventListener("click", () => {
      const keepEmail = form.email.value;
      mount(container, mode === "login" ? "register" : "login", onMode);
      const em = container.querySelector('input[name="email"]');
      if (em) em.value = keepEmail;
      container.querySelector("input")?.focus();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showErr("");
      const email = form.email.value.trim();
      const pass = form.pass.value;
      const name = mode === "register" ? form.name.value.trim() : "";
      if (mode === "register" && !name) return showErr(T.nameReq);
      if (!email || !email.includes("@")) return showErr(T.badEmail);
      if (mode === "register") {
        if (pass.trim().length < 6) return showErr(T.shortPass);
        if (pass !== form.pass2.value) return showErr(T.passMismatch);
      } else if (!pass) return showErr(T.shortPass);
      const btn = form.querySelector(".cn-gold");
      btn.disabled = true;
      try {
        const link = {
          bookings: ls("cn-mypage").map((x) => ({ id: x.id, token: x.token })),
          tickets: ls("cn-tickets").map((x) => ({ id: x.id, token: x.token })),
        };
        const r = await fetch("/api/member/login", { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, pass, name, mode, link }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) {
          showErr({ invalidLogin: T.invalid, shortPass: T.shortPass, tooManyAttempts: T.tooMany, badEmail: T.badEmail,
            alreadyRegistered: T.exists }[j.error] || T.fail);
          btn.disabled = false;
          return;
        }
        if (j.registered) window.alert(T.registered(j.member.email));
        if (location.pathname === "/login") location.href = "/mypage";
        else location.reload();
      } catch {
        showErr(T.fail);
        btn.disabled = false;
      }
    });
    container.querySelector(".cn-forgot")?.addEventListener("click", async (e) => {
      e.preventDefault();
      const email = window.prompt(T.resetAsk, form.email.value.trim());
      if (!email) return;
      try {
        await fetch("/api/member/reset", { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
      } catch {}
      window.alert(T.resetDone);
    });
    container.querySelectorAll(".cn-sb").forEach((b) => b.addEventListener("click", () => window.alert(T.socialSoon)));
  }

  function open(mode) {
    ensureStyle();
    if (document.getElementById("cn-login-ov")) return;
    const ov = document.createElement("div");
    ov.id = "cn-login-ov";
    ov.innerHTML = '<div class="cn-login-card" role="dialog" aria-modal="true" aria-label="' + T.login + '">' +
      '<div class="cn-lh"><h2></h2></div><div class="cn-auth"></div>' +
      '<div class="cn-lfoot"><button type="button" class="cn-cancel">' + T.cancel + "</button></div></div>";
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    const h2 = ov.querySelector(".cn-lh h2");
    mount(ov.querySelector(".cn-auth"), mode === "register" ? "register" : "login",
      (m) => { h2.textContent = m === "register" ? T.registerTitle : T.login; });
    ov.querySelector(".cn-cancel").addEventListener("click", close);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    setTimeout(() => ov.querySelector("form input")?.focus(), 50);
  }
  function close() {
    document.getElementById("cn-login-ov")?.remove();
    document.body.style.overflow = "";
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  async function logout() {
    try { await fetch("/api/member/logout", { method: "POST", credentials: "same-origin" }); } catch {}
    CNMember.me = null; CNMember.data = null;
    location.href = "/";
  }

  // ---- 右上の「ログイン」ボタン：未ログインならモーダル、ログイン中は「マイページ」へ ----
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a.login-button");
    if (!a || CNMember.me) return;
    e.preventDefault();
    open("login");
  }, true);
  function applyHeader() {
    const me = CNMember.me;
    document.querySelectorAll("a.login-button").forEach((a) => {
      const want = me ? "mypage" : "login";
      if (a.dataset.cnState === want) return;
      a.dataset.cnState = want;
      const b = a.querySelector("b");
      if (me) { a.setAttribute("href", "/mypage"); if (b) b.textContent = T.mypage; }
      else { a.setAttribute("href", "/login"); if (b) b.textContent = T.login; }
    });
  }
  // /login ページ：カードの中身をログイン／新規会員登録フォームにする（レイアウトは他ページと同じまま）
  function applyLoginPage() {
    if (location.pathname !== "/login") return;
    const card = document.querySelector(".login-card");
    if (!card || card.dataset.cnReady) return;
    if (CNMember.me) { location.replace("/mypage"); return; }
    ensureStyle();
    card.dataset.cnReady = "1";
    card.classList.add("cn-inline");
    card.innerHTML = "<h2></h2><div class=\"cn-auth\"></div>";
    const h2 = card.querySelector("h2");
    let mode = "login";
    try { if (new URLSearchParams(location.search).get("register") === "1") mode = "register"; } catch {}
    mount(card.querySelector(".cn-auth"), mode, (m) => { h2.textContent = m === "register" ? T.registerTitle : T.heading; });
  }
  // 右の列（トップ・日時選択）：未ログインならログイン欄、ログイン中は会員メニューを一番上に出す
  function applySide() {
    const side = document.querySelector(".side-column");
    if (!side) return;
    const want = CNMember.me ? "member" : "login";
    let card = side.querySelector(":scope > .cn-side");
    if (card && card.dataset.cnState === want) return;
    ensureStyle();
    if (!card) {
      card = document.createElement("section");
      card.className = "side-login-card cn-side";
      side.prepend(card);
    }
    card.dataset.cnState = want;
    if (want === "login") {
      card.innerHTML = "<h2></h2><div class=\"cn-auth\"></div>";
      const h2 = card.querySelector("h2");
      const auth = card.querySelector(".cn-auth");
      mount(auth, "login", (m) => {
        h2.textContent = m === "register" ? T.registerTitle : T.login;
        // 右の列は幅が狭いので、新規登録への切り替えボタンは短い文言にする
        const sw = auth.querySelector('.cn-switch[data-to="register"]');
        if (sw) sw.textContent = T.toRegisterShort;
      });
      return;
    }
    const me = CNMember.me;
    const tks = ((CNMember.data && CNMember.data.tickets) || []).filter((t) => t.status === "有効" && t.uses_left > 0);
    card.innerHTML = "<h2>" + esc(T.member) + "</h2>" +
      '<div class="cn-side-member">' +
      '<p class="cn-hello">' + esc(T.hello(me.name)) + "</p>" +
      (tks.length
        ? "<p style=\"margin:0 0 4px;font-size:13px;color:#555\">" + esc(T.tickets) + "</p><ul>" +
          tks.map((t) => "<li><span>" + esc(t.plan_name) + "</span><b>" + esc(T.left(t.uses_left)) + "</b></li>").join("") + "</ul>"
        : '<p class="cn-none">' + esc(T.noTickets) + "</p>") +
      '<a class="cn-mp" href="/mypage">' + esc(T.mypage) + "</a>" +
      '<a class="cn-tk" href="/mypage?tab=tickets">' + esc(T.seeTickets) + "</a>" +
      '<button type="button" class="cn-out">' + esc(T.logout) + "</button>" +
      "</div>";
    card.querySelector(".cn-out").addEventListener("click", logout);
  }
  CNMember.ready.then(() => {
    applyHeader(); applyLoginPage(); applySide();
    // ?login=1／?register=1 付きのURL（メール等からのリンク）では、未ログインならログイン・登録画面を自動で開く
    try {
      const q = new URLSearchParams(location.search);
      if (!CNMember.me && location.pathname !== "/login") {
        if (q.get("register") === "1") open("register");
        else if (q.get("login") === "1") open("login");
      }
    } catch {}
  });
  setInterval(() => { applyHeader(); applyLoginPage(); applySide(); }, 700);
})();
