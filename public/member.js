// 予約サイトの会員ログイン／新規会員登録
// ・右上の「ログイン」→ モーダル（メールアドレス・パスワード・パスワードを忘れた方）。ソーシャルログインは使わない。
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
    forgot: "Forgot your password?", cancel: "Cancel",
    toRegister: "New here? Create a free account", toRegisterShort: "Sign up (free)",
    toLogin: "Already a member? Log in",
    register: "Create account", registerTitle: "Sign up (free)",
    name: "Your name", pass2: "Password (confirm)", passHint: "6 or more characters",
    registerNote: "After signing up you will receive a confirmation email with your login ID and password. Members can buy and use multi-visit tickets from the top of the Booking and Menu pages.",
    registered: (e) => "Your account has been created. A confirmation email has been sent to " + e + ".",
    invalid: "The email address or password is incorrect. If you are new, please create an account.",
    exists: "This email address is already registered. Please log in.",
    nameReq: "Please enter your name.",
    passMismatch: "The passwords do not match.",
    shortPass: "Please use a password of at least 6 characters.",
    tooMany: "Too many attempts. Please wait a minute and try again.",
    badEmail: "Please enter a valid email address.",
    fail: "Could not complete. Please try again later.",
    forgotTitle: "Reset your password", resetTitle: "Set a new password", backToLogin: "Back to log in",
    forgotLead: "Enter your registered email address. We will email you a link to set a new password (valid for 60 minutes, single use).",
    forgotSend: "Send reset link",
    forgotDone: (e) => "If " + e + " is registered, we have sent a password reset link. Please check your inbox (and spam folder). The link is valid for 60 minutes.",
    resetChecking: "Checking the link…",
    resetLead: (e) => "Set a new password for " + e + ".",
    newPass: "New password", resetSubmit: "Change password", resetAgain: "Request a new link",
    resetDoneMsg: "Your password has been changed. You are now logged in.",
    resetInvalid: "This link is invalid or has already been used. Please request a new link.",
    resetExpired: "This link has expired (valid for 60 minutes). Please request a new link.",
    heading: "Log in", member: "Member menu", hello: (n) => (n ? n + " " : "") + "(member)",
    tickets: "Your tickets", noTickets: "No tickets yet", left: (n) => n + " left", logout: "Log out", seeTickets: "Tickets",
  } : {
    login: "ログイン", mypage: "マイページ", email: "メールアドレス", pass: "パスワード",
    forgot: "パスワードを忘れた方はこちら", cancel: "キャンセル",
    toRegister: "はじめての方は新規会員登録（無料）", toRegisterShort: "新規会員登録（無料）",
    toLogin: "会員の方はこちら（ログイン）",
    register: "登録する", registerTitle: "新規会員登録（無料）",
    name: "お名前", pass2: "パスワード（確認）", passHint: "6文字以上",
    registerNote: "登録が完了すると、ログインID（メールアドレス）とパスワードを記載した「会員登録完了のお知らせ」メールをお送りします。会員様は【予約】【メニュー】ページの一番上から回数券をご購入・ご利用いただけます。",
    registered: (e) => "会員登録が完了しました。\n「会員登録完了のお知らせ」を " + e + " にお送りしました。",
    invalid: "メールアドレスまたはパスワードが違います。はじめての方は「新規会員登録」からご登録ください。",
    exists: "このメールアドレスはすでに登録されています。ログインしてください。",
    nameReq: "お名前を入力してください。",
    passMismatch: "パスワード（確認）が一致しません。",
    shortPass: "パスワードは6文字以上で入力してください。",
    tooMany: "試行回数が多すぎます。1分ほど待ってからお試しください。",
    badEmail: "メールアドレスの形式を確認してください。",
    fail: "処理できませんでした。時間をおいてお試しください。",
    forgotTitle: "パスワードの再設定", resetTitle: "新しいパスワードの設定", backToLogin: "ログイン画面に戻る",
    forgotLead: "ご登録のメールアドレスを入力してください。新しいパスワードを設定するためのURLをメールでお送りします（有効期限60分・1回のみ有効）。",
    forgotSend: "再設定用のメールを送る",
    forgotDone: (e) => e + " がご登録のアドレスであれば、パスワード再設定用のURLをお送りしました。メールをご確認ください（届かない場合は迷惑メールフォルダもご確認ください）。URLの有効期限は60分です。",
    resetChecking: "URLを確認しています…",
    resetLead: (e) => e + " の新しいパスワードを設定してください。",
    newPass: "新しいパスワード", resetSubmit: "パスワードを変更する", resetAgain: "再設定用のメールをもう一度送る",
    resetDoneMsg: "パスワードを変更しました。新しいパスワードでログインしています。\n変更完了のお知らせをメールでお送りしました。",
    resetInvalid: "このURLは無効か、すでに使用済みです。お手数ですが、もう一度再設定用のメールをお送りください。",
    resetExpired: "このURLは有効期限（60分）が過ぎています。お手数ですが、もう一度再設定用のメールをお送りください。",
    heading: "ログイン", member: "会員メニュー", hello: (n) => (n ? n + " 様" : "会員様"),
    tickets: "保有中の回数券", noTickets: "保有中の回数券はありません", left: (n) => "残り " + n + "回", logout: "ログアウト", seeTickets: "回数券を見る・購入する",
  };

  const INIT_Q = (() => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(); } })();
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
    ".cn-ok{color:#2e6b34;background:#eef7ee;border:1px solid #cfe5cf;border-radius:6px;font-size:14px;line-height:1.7;padding:10px 12px;margin:0 0 10px}" +
    ".cn-lfoot{padding:18px 22px;border-top:1px solid #e6e6e6;text-align:center}" +
    ".cn-cancel{border:1px solid #9a9a9a;background:#fff;border-radius:8px;padding:14px 34px;font-size:17px;color:#333;cursor:pointer}" +
    ".cn-inline .cn-lf{padding:6px 22px 16px}" +
    // 右の列（幅240px）のログイン欄・会員メニュー：既存の side-login-card の見た目のまま中身だけ
    ".cn-side .cn-lf{padding:14px 16px 16px}.cn-side .cn-lf label{font-size:14px;margin-bottom:10px}" +
    ".cn-side .cn-in{height:42px;margin-top:6px;padding:0 10px}.cn-side .cn-in input{font-size:15px}.cn-side .cn-in svg{width:17px;height:17px;margin-right:8px}" +
    ".cn-side .cn-gold{height:42px;font-size:15px;border-radius:4px}.cn-side .cn-forgot{font-size:12.5px;margin:10px 0 4px}" +
    ".cn-side .cn-switch{min-height:40px;font-size:13px;border-radius:4px;margin:8px 0 4px}" +
    ".cn-side .cn-note{font-size:11.5px}.cn-side .cn-err{font-size:12.5px}" +
    ".cn-side-member{padding:14px 16px 16px;font-size:14px;line-height:1.7}" +
    ".cn-side-member .cn-hello{font-weight:700;margin:0 0 8px}" +
    ".cn-side-member ul{list-style:none;margin:0 0 10px;padding:0}.cn-side-member li{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed #e6e0d6;padding:4px 0;font-size:13px}" +
    ".cn-side-member li b{color:#8a6a33;white-space:nowrap}.cn-side-member .cn-none{color:#888;font-size:13px;margin:0 0 10px}" +
    ".cn-side-member a,.cn-side-member button{display:flex;align-items:center;justify-content:center;width:100%;min-height:40px;border-radius:4px;font-size:14px;margin-top:8px;text-decoration:none;cursor:pointer}" +
    ".cn-side-member .cn-mp{background:#c5a15e;color:#fff;border:0;font-weight:700}" +
    ".cn-side-member .cn-tk{border:1px solid #c5a15e;color:#8a6a33;background:#fff}" +
    ".cn-side-member .cn-out{border:1px solid #d1d5db;color:#555;background:#fff}" +
    "@media (max-width:480px){#cn-login-ov{padding:12px 10px}.cn-login-card .cn-lf,.cn-lh,.cn-lfoot{padding-left:18px;padding-right:18px}}";
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

  // フォームの種類：login（ログイン）／register（新規会員登録）／forgot（パスワードを忘れた方）／
  // reset（メールの再設定用URLから開いた、新しいパスワードの設定。opts.token が必要）
  const TITLE = (m) => ({ register: T.registerTitle, forgot: T.forgotTitle, reset: T.resetTitle }[m] || T.login);
  function authHtml(mode, opts) {
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
    if (mode === "forgot") {
      return (
        '<form class="cn-lf" novalidate data-mode="forgot">' +
        '<p class="cn-note" style="font-size:14px;color:#444;margin:0 0 14px">' + T.forgotLead + "</p>" +
        field(T.email, ICON_MAIL, '<input type="email" name="email" autocomplete="email" inputmode="email" required>') +
        '<p class="cn-err" hidden></p>' +
        '<p class="cn-ok" hidden></p>' +
        '<button type="submit" class="cn-gold">' + T.forgotSend + "</button>" +
        '<button type="button" class="cn-switch" data-to="login">' + T.backToLogin + "</button>" +
        "</form>"
      );
    }
    if (mode === "reset") {
      return (
        '<form class="cn-lf" novalidate data-mode="reset">' +
        '<p class="cn-note cn-reset-lead" style="font-size:14px;color:#444;margin:0 0 14px">' + T.resetChecking + "</p>" +
        '<div class="cn-reset-fields" hidden>' +
        field(T.newPass, ICON_LOCK, '<input type="password" name="pass" autocomplete="new-password" required>', T.passHint) +
        field(T.pass2, ICON_LOCK, '<input type="password" name="pass2" autocomplete="new-password" required>') +
        "</div>" +
        '<p class="cn-err" hidden></p>' +
        '<button type="submit" class="cn-gold" disabled>' + T.resetSubmit + "</button>" +
        '<button type="button" class="cn-switch" data-to="forgot" hidden>' + T.resetAgain + "</button>" +
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
      "</form>"
    );
  }

  const post = async (url, body) => {
    const r = await fetch(url, { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, j: await r.json().catch(() => ({})) };
  };
  const ERR = () => ({ invalidLogin: T.invalid, shortPass: T.shortPass, tooManyAttempts: T.tooMany, badEmail: T.badEmail,
    alreadyRegistered: T.exists, resetInvalid: T.resetInvalid, resetExpired: T.resetExpired });

  // container の中にフォームを作り、動作を付ける。onMode(mode) は見出しの切り替え用
  function mount(container, mode, onMode, opts) {
    opts = opts || {};
    container.innerHTML = authHtml(mode, opts);
    if (onMode) onMode(mode);
    const form = container.querySelector("form.cn-lf");
    const errBox = container.querySelector(".cn-err");
    const showErr = (msg) => { errBox.textContent = msg; errBox.hidden = !msg; };
    const go = (to) => {
      const keepEmail = form.email ? form.email.value : "";
      mount(container, to, onMode, {});
      const em = container.querySelector('input[name="email"]');
      if (em && keepEmail) em.value = keepEmail;
      container.querySelector("input")?.focus();
    };
    container.querySelector(".cn-switch")?.addEventListener("click", (e) => go(e.currentTarget.dataset.to));
    container.querySelector(".cn-forgot")?.addEventListener("click", (e) => { e.preventDefault(); go("forgot"); });

    // メールの再設定用URLから開いた場合：URLが有効か先に確かめて、案内を出す
    if (mode === "reset") {
      const lead = container.querySelector(".cn-reset-lead");
      const btn = form.querySelector(".cn-gold");
      (async () => {
        try {
          const r = await fetch("/api/member/reset/check?token=" + encodeURIComponent(opts.token || ""), { cache: "no-store" });
          const j = await r.json();
          if (j.ok) {
            lead.textContent = T.resetLead(j.email);
            container.querySelector(".cn-reset-fields").hidden = false;
            btn.disabled = false;
            form.pass.focus();
          } else {
            lead.textContent = j.error === "resetExpired" ? T.resetExpired : T.resetInvalid;
            btn.hidden = true;
            container.querySelector(".cn-switch").hidden = false;
          }
        } catch { lead.textContent = T.fail; }
      })();
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showErr("");
      const btn = form.querySelector(".cn-gold");
      if (mode === "forgot") {
        const email = form.email.value.trim();
        if (!email || !email.includes("@")) return showErr(T.badEmail);
        btn.disabled = true;
        try {
          const { ok } = await post("/api/member/reset", { email });
          if (!ok) throw new Error("reset");
          const okBox = container.querySelector(".cn-ok");
          okBox.textContent = T.forgotDone(email);
          okBox.hidden = false;
          btn.hidden = true;
        } catch { showErr(T.fail); btn.disabled = false; }
        return;
      }
      if (mode === "reset") {
        const pass = form.pass.value;
        if (pass.trim().length < 6) return showErr(T.shortPass);
        if (pass !== form.pass2.value) return showErr(T.passMismatch);
        btn.disabled = true;
        try {
          const { ok, j } = await post("/api/member/reset/confirm", { token: opts.token, pass });
          if (!ok || !j.ok) { showErr(ERR()[j.error] || T.fail); btn.disabled = false; return; }
          window.alert(T.resetDoneMsg);
          location.href = "/mypage";
        } catch { showErr(T.fail); btn.disabled = false; }
        return;
      }
      const email = form.email.value.trim();
      const pass = form.pass.value;
      const name = mode === "register" ? form.name.value.trim() : "";
      if (mode === "register" && !name) return showErr(T.nameReq);
      if (!email || !email.includes("@")) return showErr(T.badEmail);
      if (mode === "register") {
        if (pass.trim().length < 6) return showErr(T.shortPass);
        if (pass !== form.pass2.value) return showErr(T.passMismatch);
      } else if (!pass) return showErr(T.shortPass);
      btn.disabled = true;
      try {
        const link = {
          bookings: ls("cn-mypage").map((x) => ({ id: x.id, token: x.token })),
          tickets: ls("cn-tickets").map((x) => ({ id: x.id, token: x.token })),
        };
        const { ok, j } = await post("/api/member/login", { email, pass, name, mode, link });
        if (!ok || !j.ok) { showErr(ERR()[j.error] || T.fail); btn.disabled = false; return; }
        if (j.registered) window.alert(T.registered(j.member.email));
        if (location.pathname === "/login") location.href = "/mypage";
        else location.reload();
      } catch {
        showErr(T.fail);
        btn.disabled = false;
      }
    });
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
    mount(ov.querySelector(".cn-auth"), ["register", "forgot"].includes(mode) ? mode : "login",
      (m) => { h2.textContent = TITLE(m); });
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
    // ログイン中でも、メールの再設定用URLから来た場合はパスワード設定画面を出す
    const hasReset = !!INIT_Q.get("reset");
    if (CNMember.me && !hasReset) { location.replace("/mypage"); return; }
    ensureStyle();
    card.dataset.cnReady = "1";
    card.classList.add("cn-inline");
    card.innerHTML = "<h2></h2><div class=\"cn-auth\"></div>";
    const h2 = card.querySelector("h2");
    // 画面の種類は「ページを開いた瞬間のURL」で決める（予約サイトの画面部品が描き直しても同じ画面に戻す）
    let mode = "login", opts = {};
    if (INIT_Q.get("register") === "1") mode = "register";
    else if (INIT_Q.get("forgot") === "1") mode = "forgot";
    else if (INIT_Q.get("reset")) {
      mode = "reset"; opts = { token: INIT_Q.get("reset") };
      // 再設定用の合言葉はアドレス欄・履歴に残さない（開いた時点で控え済み）
      try { if (location.search) history.replaceState(history.state, "", "/login"); } catch {}
    }
    mount(card.querySelector(".cn-auth"), mode, (m) => { h2.textContent = m === "login" ? T.heading : TITLE(m); }, opts);
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
        h2.textContent = TITLE(m);
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
      const q = INIT_Q;
      if (!CNMember.me && location.pathname !== "/login") {
        if (q.get("register") === "1") open("register");
        else if (q.get("login") === "1") open("login");
      }
    } catch {}
  });
  setInterval(() => { applyHeader(); applyLoginPage(); applySide(); }, 700);
})();
