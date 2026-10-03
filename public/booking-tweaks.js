// 予約フォームのフリーメッセージ欄に、管理画面の設定
// （表示・必須・見出し・placeholder・説明文・文字数制限）を反映する。
// React が描き直しても消えないよう、定期的に適用し直す。
(function () {
  "use strict";
  let settings = null;

  // Reactがサーバーのページを引き継ぐ（ハイドレーション）前に書き換えるとエラー（#418）になり
  // 画面が描き直されるため、ページの書き換えは引き継ぎが終わってから行う（最長6秒待つ）
  const startedAt = Date.now();
  const canTouch = () => {
    if (Date.now() - startedAt > 6000) return true;
    const el = document.querySelector(".site-header") || document.querySelector(".page-shell");
    return !el || Object.keys(el).some((k) => k.startsWith("__reactFiber"));
  };
  const whenHydrated = new Promise((resolve) => { const t = () => (canTouch() ? resolve() : setTimeout(t, 50)); t(); });

  // 入力欄の書体を明示：環境によって数字が高さバラバラの書体（オールドスタイル数字）に
  // 落ちるのを防ぎ、電話番号・メール等が揃った字形で表示されるようにする
  (function fontFix() {
    if (document.getElementById("fm-font-fix")) return;
    const st = document.createElement("style");
    st.id = "fm-font-fix";
    st.textContent =
      "input, select, textarea, button {" +
      'font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, ' +
      '"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", Meiryo, sans-serif !important;' +
      "font-variant-numeric: lining-nums !important;" +
      'font-feature-settings: "lnum" 1 !important;' +
      "}";
    (document.head || document.documentElement).appendChild(st);
  })();

  async function load() {
    try {
      const r = await fetch("/api/demo/settings", { cache: "no-store" });
      settings = (await r.json()).freeMessage || null;
    } catch {}
  }

  function apply() {
    if (!settings) return;
    const ta = document.querySelector('form.booking-form textarea[name="comment"]');
    if (!ta) return;
    const label = ta.closest("label");
    const fm = settings;
    if (label) label.style.display = fm.visible ? "" : "none";
    if (!fm.visible) return;
    if (fm.label && label && label.firstChild && label.firstChild.nodeType === 3 &&
        label.firstChild.textContent !== fm.label) {
      label.firstChild.textContent = fm.label;
    }
    if (ta.placeholder !== (fm.placeholder || "")) ta.placeholder = fm.placeholder || "";
    if (ta.maxLength !== (fm.maxLength || 2000)) ta.maxLength = fm.maxLength || 2000;
    if (ta.required !== !!fm.required) ta.required = !!fm.required;
    // 必須マークと説明文
    let note = label && label.querySelector(".fm-note");
    const noteText = (fm.required ? "（必須）" : "") + (fm.description ? " " + fm.description : "");
    if (noteText.trim()) {
      if (!note && label) {
        note = document.createElement("small");
        note.className = "fm-note";
        note.style.cssText = "display:block;color:#6b7280;font-size:12px;margin-top:4px;";
        label.appendChild(note);
      }
      if (note && note.textContent !== noteText.trim()) note.textContent = noteText.trim();
    } else if (note) {
      note.remove();
    }
  }

  // ---- マイページ連携：予約成立時に予約ID・トークンをこのブラウザに記録する ----
  const MYKEY = "cn-mypage";
  const store = () => { try { return JSON.parse(localStorage.getItem(MYKEY) || "[]"); } catch { return []; } };
  const saveStore = (list) => { try { localStorage.setItem(MYKEY, JSON.stringify(list.slice(-20))); } catch {} };
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    // 予約送信時：回数券が選択されていれば、リクエストに券IDとトークンを付与する
    // （残数の判定・減算はすべてサーバー側。ここは選択内容を渡すだけ）
    try {
      const u0 = typeof input === "string" ? input : input?.url || "";
      if (u0.includes("/api/bookings") && !u0.includes("cancel") && init?.method === "POST") {
        const b0 = JSON.parse(init.body || "{}");
        let changed = false;
        if (window.__fmTicketSel) {
          b0.ticketId = window.__fmTicketSel.id;
          b0.ticketToken = window.__fmTicketSel.token;
          changed = true;
        }
        // 日時変更中（マイページの「日時を変更」から来た場合）：元の予約IDを添える
        const rs = rescheduleId();
        if (rs) { b0.rescheduleId = rs; changed = true; }
        if (changed) init = { ...init, body: JSON.stringify(b0) };
      }
    } catch {}
    const res = await origFetch(input, init);
    try {
      const u = typeof input === "string" ? input : input?.url || "";
      if (u.includes("/api/bookings") && !u.includes("cancel") && init?.method === "POST" && !res.ok) {
        const j2 = await res.clone().json().catch(() => ({}));
        const msg = { ticketEmpty: "回数券の残り回数が0のため、ご予約いただけません。",
          ticketExpired: "回数券の有効期限が切れているため、ご予約いただけません。",
          ticketInvalid: "回数券の情報を確認できませんでした（ご予約時のメールアドレスが購入時と一致している必要があります）。",
          loginRequired: "ご予約の日時変更にはログインが必要です。右上の「ログイン」からログインしてください。",
          alreadyCancelled: "変更元のご予約はすでに取り消されています。新しくご予約ください。",
          tooLate: "開始時刻を過ぎたご予約は変更できません。店舗までお電話ください。" }[j2.error];
        if (j2.error === "notFound" && rescheduleId()) { clearReschedule(); window.alert("変更元のご予約が見つかりませんでした。新しくご予約ください。"); }
        else if (msg) window.alert(msg);
      }
      if (u.includes("/api/bookings") && !u.includes("cancel") && init?.method === "POST" && res.ok) {
        const j = await res.clone().json();
        const body = JSON.parse(init.body || "{}");
        if (j.rescheduledFrom) {
          clearReschedule();
          try { sessionStorage.setItem("fm-rescheduled", "1"); } catch {}
        }
        if (j.id && j.token) {
          const list = store().filter((x) => x.id !== j.id);
          list.push({ id: j.id, token: j.token, name: body.name || "", lang: body.language || "ja" });
          saveStore(list);
          try { localStorage.setItem("fm-lang", body.language || "ja"); } catch {}
        }
        if (j.ticketLeft !== undefined && window.__fmTicketSel) {
          try { sessionStorage.setItem("fm-ticket-used",
            JSON.stringify({ name: window.__fmTicketSel.name, left: j.ticketLeft })); } catch {}
        }
      }
    } catch {}
    return res;
  };

  // ---- 回数券（会員向け）：保有券の取得・メニュー最上部の案内・予約時の選択 ----
  const tkItems = () => { try { return JSON.parse(localStorage.getItem("cn-tickets") || "[]"); } catch { return []; } };
  // 会員＝ログイン中（member.js）またはこのブラウザに予約・回数券が記録済み
  // （表示の出し分けのみ。判定処理はすべてサーバー側）
  const isMember = () => !!(window.CNMember && window.CNMember.me) || store().length > 0 || tkItems().length > 0;
  let myTickets = null;
  let myTicketsLoading = null;
  function loadMyTickets() {
    if (myTickets !== null) return Promise.resolve(myTickets);
    if (myTicketsLoading) return myTicketsLoading;
    myTicketsLoading = (async () => {
      const list = [];
      // ログイン中の会員：本人の回数券（トークン付き）はサーバーから直接もらう
      try {
        if (window.CNMember) await window.CNMember.ready;
        for (const t of (window.CNMember?.data?.tickets || [])) list.push(t);
      } catch {}
      // このブラウザに記録された券（未ログインでも使える）
      const items = tkItems().filter((it) => !list.some((t) => t.id === it.id));
      if (items.length) {
        try {
          const r = await origFetch("/api/tickets/mine", { method: "POST",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }), cache: "no-store" });
          for (const t of ((await r.json()).tickets || [])) list.push(t);
        } catch {}
      }
      myTickets = list;
      return myTickets;
    })();
    return myTicketsLoading;
  }
  const usableTickets = () => (myTickets || []).filter((t) => t.status === "有効" && t.uses_left > 0);

  // メニュー選択ページ：会員にはメニュー一覧の一番上に回数券の案内を出す（非会員には出さない）
  // 見た目は他のメニューセクションとまったく同じ（list-card＋menu-row構造をそのまま使う）
  async function decorateTicketBanner() {
    // 【予約】と【メニュー】のトップに、会員にはいつでも回数券（残り回数・購入）を出す
    if (location.pathname !== "/book" && location.pathname !== "/menus") return;
    if (!isMember()) return;
    const firstCard = document.querySelector(".list-card");
    if (!firstCard || document.getElementById("fm-tkbanner")) return;
    await loadMyTickets();
    const use = usableTickets();
    let plans = [];
    try {
      plans = (await (await origFetch("/api/tickets/plans", { cache: "no-store" })).json()).plans || [];
    } catch {}
    if (!plans.length && !use.length) return;
    const box = document.createElement("section");
    box.id = "fm-tkbanner";
    box.className = "list-card";
    const rows = plans.map((pl) =>
      '<a href="/mypage#tickets" class="menu-row">' +
      '<img class="course-thumb" src="/fm-favicon.svg" alt="' + esc2(pl.name) + '"/>' +
      '<span class="menu-row-copy"><b>' + esc2(pl.name) + "（" + pl.uses + "回分・有効期限は購入日から1年間）" +
      (use.some((t) => t.plan_name === pl.name)
        ? "　現在の残り回数 " + use.filter((t) => t.plan_name === pl.name).reduce((a, t) => a + t.uses_left, 0) + "回"
        : "") +
      "</b><small>" + pl.price.toLocaleString("ja-JP") + "円</small></span>" +
      '<i aria-hidden="true">›</i></a>').join("");
    box.innerHTML = "<h2>会員様向け 回数券</h2>" + '<div class="list-body">' + rows + "</div>";
    firstCard.parentElement.insertBefore(box, firstCard);
    if (!document.getElementById("fm-tk-style")) {
      const st = document.createElement("style");
      st.id = "fm-tk-style";
      st.textContent =
        "#fm-ticket-pick{margin:18px 0 6px}" +
        "#fm-ticket-pick .fm-h{font-size:15px;font-weight:700;margin:0 0 12px}" +
        "#fm-ticket-pick .fm-box{background:#f6ecd9;border-radius:8px;padding:14px 18px;font-size:14px;line-height:1.9}" +
        "#fm-ticket-pick label{display:block;font-weight:400;margin:2px 0}" +
        "#fm-ticket-pick .fm-tk-note{font-size:12px;color:#8a6a33;margin:6px 0 0}";
      document.head.appendChild(st);
    }
  }
  const esc2 = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  // 予約フォーム：使用する回数券を選べるようにする（選択内容と残数を明示）
  async function decorateTicketPick() {
    const form = document.querySelector("form.booking-form");
    if (!form || document.getElementById("fm-ticket-pick")) return;
    if (!isMember()) return;
    const anchor = document.getElementById("fm-notice") || form.querySelector('button[type="submit"]');
    if (!anchor) return;
    await loadMyTickets();
    const use = usableTickets();
    if (!use.length) return;
    const sec = document.createElement("section");
    sec.id = "fm-ticket-pick";
    const jd2 = (ms2) => new Date(ms2 + 9 * 3600e3).toISOString().slice(0, 10);
    sec.innerHTML =
      '<h2 class="fm-h">回数券</h2>' +
      '<div class="fm-box">' +
      '<label><input type="radio" name="fm-tk" value="" checked> 使用しない</label>' +
      use.map((t, i) => '<label><input type="radio" name="fm-tk" value="' + i + '"> ' +
        esc2(t.plan_name) + "（残り " + t.uses_left + "回・有効期限 " + jd2(t.expires_at) + "）</label>").join("") +
      '<p class="fm-tk-note" id="fm-tk-note"></p>' +
      "</div>";
    anchor.before(sec);
    sec.addEventListener("change", () => {
      const v = sec.querySelector('input[name="fm-tk"]:checked')?.value;
      const note = document.getElementById("fm-tk-note");
      if (v === "" || v === undefined) {
        window.__fmTicketSel = null;
        note.textContent = "";
        return;
      }
      const t = use[Number(v)];
      const item = tkItems().find((x) => x.id === t.id);
      window.__fmTicketSel = { id: t.id, token: item?.token || t.token || "", name: t.plan_name };
      note.textContent = "この予約で1回分を使用します（ご予約後の残り " + (t.uses_left - 1) + "回）。コース料金は回数券でのお支払いになります。";
    });
  }

  // ---- 同意部分：本物と同じ「ご来店に際しての注意事項＋確認しました＋同意して予約する」に ----
  function decorateConsent() {
    const form = document.querySelector("form.booking-form");
    if (!form) return;
    const cb = [...form.querySelectorAll('input[type="checkbox"]')].find((b) => {
      const t = b.closest("label")?.textContent || "";
      return t.includes("予約内容と個人情報") || t.includes("checked my booking");
    });
    if (!cb) return;
    const lab = cb.closest("label");
    const en = /checked my booking/.test(lab.textContent);
    lab.style.display = "none";
    // 個人情報の注記も隠す
    [...form.querySelectorAll("p, small")].forEach((p) => {
      const t = p.textContent || "";
      if (t.includes("お名前・連絡先は予約管理") || t.includes("Your name and contact details")) p.style.display = "none";
    });
    const submit = [...form.querySelectorAll("button")].find((b) =>
      b.type === "submit" || /この内容で予約を確定する|Confirm this booking|同意して予約する|Agree and book/.test(b.textContent));
    if (submit) {
      const want = en ? "Agree and book" : "同意して予約する";
      if (submit.textContent !== want && !/予約を確定しています|Saving/.test(submit.textContent)) submit.textContent = want;
    }
    if (!document.getElementById("fm-notice")) {
      const sec = document.createElement("section");
      sec.id = "fm-notice";
      sec.innerHTML =
        '<h2 class="fm-h">' + (en ? "Notes for your visit" : "ご来店に際しての注意事項") + "</h2>" +
        '<div class="fm-box"><p>' +
        (en
          ? "If you need to change your booking or will be late, we would appreciate it if you could contact us in advance.<br/>Contact: cnsalon2021@gmail.com<br/><br/>Thank you very much."
          : "ご予約の変更や遅刻される場合は、事前にご連絡いただけますと幸いです。<br/>ご連絡先：cnsalon2021@gmail.com<br/><br/>どうぞよろしくお願いいたします。") +
        "</p>" +
        '<div class="fm-agree-wrap"><button type="button" class="fm-agree"><span class="fm-ck"></span>' +
        (en ? "Confirmed" : "確認しました") + "</button></div></div>";
      lab.before(sec);
      sec.querySelector(".fm-agree").addEventListener("click", () => cb.click());
      const terms = document.createElement("p");
      terms.id = "fm-terms";
      const lk = (t, doc) => '<a href="#" data-fm-doc="' + doc + '">' + t + '<svg viewBox="0 0 12 12" width="11" height="11"><path fill="none" stroke="%23b08d4f" stroke-width="1.3" d="M4.5 2H2v8h8V7.5M7 1.5h3.5V5M10.2 1.8 5.5 6.5" transform="scale(1)"/></svg></a>';
      terms.innerHTML = en
        ? "Booking requires agreement to the " + lk("Terms of Service", "terms") + " and " + lk("Privacy Policy", "privacy") + "."
        : "予約には " + lk("利用規約", "terms") + " および " + lk("プライバシーポリシー", "privacy") + " への同意が必要です。";
      (submit || lab).before(terms);
      terms.addEventListener("click", (e) => {
        const doc = e.target.closest("[data-fm-doc]")?.dataset.fmDoc;
        if (!doc) return;
        e.preventDefault();
        openTermsModal(doc, en);
      });
      const st = document.createElement("style");
      st.textContent =
        "#fm-notice{margin:18px 0 6px}" +
        "#fm-notice .fm-h{font-size:15px;font-weight:700;margin:0 0 12px}" +
        "#fm-notice .fm-box{background:#f6ecd9;border-radius:8px;padding:18px 20px 20px;font-size:14px;line-height:1.9}" +
        "#fm-notice .fm-box p{margin:0 0 14px}" +
        "#fm-notice .fm-agree-wrap{text-align:center}" +
        "#fm-notice .fm-agree{font:inherit;display:inline-flex;align-items:center;gap:9px;background:#fff;border:1px solid #c5a15e;border-radius:6px;color:#b08d4f;font-weight:700;padding:12px 26px;cursor:pointer}" +
        "#fm-notice .fm-ck{width:16px;height:16px;border:1px solid #c5a15e;border-radius:3px;display:inline-block;position:relative;background:#fff}" +
        "#fm-notice.fm-on .fm-ck{background:#b08d4f}" +
        "#fm-notice.fm-on .fm-ck::after{content:'';position:absolute;left:4px;top:1px;width:5px;height:9px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}" +
        "#fm-terms{font-size:14px;margin:16px 0 14px}" +
        "#fm-terms a{color:#b08d4f;text-decoration:none;margin:0 2px}" +
        "#fm-terms a svg{vertical-align:-1px;margin-left:2px}";
      document.head.appendChild(st);
    }
    document.getElementById("fm-notice")?.classList.toggle("fm-on", cb.checked);
  }

  // ---- 利用規約・プライバシーポリシー：リンクを押すとポップアップで本文を表示 ----
  // ---- 利用規約：正式文書「CN health & beauty salon オンライン予約サービス利用規約」をそのまま掲載 ----
  const TERMS_DOC = [
    ["sub", "CN health & beauty salon オンライン予約サービス利用規約"],
    ["sub", "2026年9月27日　制定・施行"],
    ["sub", "CN health & beauty salon"],
    ["ch", "第１章　総則"],
    ["ar", "第１条（総則）"],
    ["p", "１．本規約は、CN health & beauty salon（以下「当サロン」という）が提供するCN health & beauty salonオンライン予約サービス（第２条で定義する）の利用に関して、利用者（以下「利用者」という）が遵守すべき事項を定めたものである。"],
    ["p", "２．利用者は、CN health & beauty salonオンライン予約サービスの利用に関し、本規約のほか、本規約の下位規約、ルール等（総称して以下「本規約等」という）を遵守するものとする。"],
    ["p", "３．当サロンは、利用者がCN health & beauty salonオンライン予約サービスを利用した場合、当該利用者が本規約に同意したものとみなす。"],
    ["p", "４．利用者がCN health & beauty salonオンライン予約サービスを利用するにあたり登録した情報に基づき、当サロンの顧客として登録されるものとし、当サロンから書面・FAX・電話・電子メール等により、当サロンが取り扱う各種サービスの案内等が送られることについて、予め同意する。"],
    ["ar", "第２条（CN health & beauty salonオンライン予約サービス）"],
    ["p", "「CN health & beauty salonオンライン予約サービス」とは、オンライン予約サービス（以下「予約サービス」という）を提供するとともに、リラクゼーション・ビューティ情報、ユーザアンケート、その他の関連情報の紹介（総称して以下「情報サービス」という）を行うサービスである。"],
    ["ch", "第２章　CN health & beauty salonオンライン予約サービスの利用"],
    ["ar", "第３条（利用方法）"],
    ["p", "１．利用者は、「CN health & beauty salonオンライン予約サービス」において予約サービスまたは情報サービスを利用するに際し、本規約等の内容を十分に確認のうえ利用するものとする。"],
    ["p", "２．利用者は、当サロンが運営するサロン店舗（リラクゼーションサロン、ネイルサロン、エステサロン等を指しますが、それらに限られません。）（以下、「店舗運営者」という）であって、お客様に対して、取引の対象となる役務または商品を提供または販売する者が提供するサービスを利用するときは、当該店舗運営者が定める規約、約款、ガイドライン、ルール等を十分に確認のうえ利用するものとする。"],
    ["ch", "第３章　サービス利用にあたっての注意事項"],
    ["ar", "第４条（利用者への連絡方法）"],
    ["p", "当サロンおよび店舗運営者は、利用者に対し、必要に応じて、予約時または情報登録時に取得した電子メールアドレス、住所、電話番号等を利用して連絡できるものとする。いずれかの方法により連絡するかについては、当該連絡を行う当サロンまたはサービス提供者の判断によるものとする。"],
    ["ch", "第４章　個人情報の取扱"],
    ["ar", "第５条（個人情報）"],
    ["p", "１．当サロンは、利用者の個人情報を別途定める「個人情報保護方針」に従い取り扱うものとし、利用者は、これに同意するものとする。"],
    ["p", "２．当サロンは、本規約に係らず、裁判所もしくは正規の法的執行機関からの問い合わせに応じて、利用者の個人情報の公開を求められた場合には、問い合わせに応じる可能性があるものとする。"],
    ["ar", "第６条（パスワードの管理）"],
    ["p", "１．パスワードは、他人に知られることがないよう利用者本人が責任をもって管理するものとする。"],
    ["p", "２．入力されたメールアドレスおよびパスワードが登録されたものと一致することを所定の方法により確認した場合、利用者本人による利用があったものとみなし、それらが盗用、不正使用その他の事情により会員以外の者が利用している場合であっても、それにより生じた損害について、当サロンは一切責任を負わないものとする。"],
    ["ar", "第７条（店舗運営者による個人情報の取扱）"],
    ["p", "１．店舗運営者は、利用者に提供するサービスの向上のために、再来店した際に「CN health & beauty salonオンライン予約サービス」を利用して、利用者の過去のサービス利用内容、ご要望や特徴など、関連情報を記録することができる。"],
    ["p", "２．これらの関連情報は、他の店舗運営者や第三者とは共有されない。ただし、グループ経営の同系列の店舗運営者間で関連情報が共有される場合があることを利用者は同意するものとする。"],
    ["p", "３．当サロンは、「CN health & beauty salonオンライン予約サービス」のシステムに保存されている情報のバックアップのためにコピーを作成する。"],
    ["ch", "第５章　電子メールに関する取扱"],
    ["ar", "第８条（電子メール）"],
    ["p", "１．利用者は、「CN health & beauty salonオンライン予約サービス」を利用した際に、当サロンもしくは店舗運営者から定期的な電子メールを受信することを選択した場合は、当サロンもしくは店舗運営者が電子メールを送信することに同意したものとする。"],
    ["p", "２．利用者が、当サロンもしくは店舗運営者から定期的な電子メールを受信することを選択しなかった場合であっても、予約の確認・変更・取消に関するメール、予約の無断キャンセルに関するメール、その他、予約に関連するその他の電子メールを受信することを同意するものとする。"],
    ["ch", "第６章　料金および決済"],
    ["ar", "第９条（深夜料金）"],
    ["p", "１．22時を過ぎる業務または施術（22時以降に開始する施術、および22時を過ぎて継続する施術を含む）については、通常の施術料金とは別に、深夜料金として2,000円を申し受けるものとする。"],
    ["p", "２．利用者は、前項の深夜料金が発生する時間帯に予約を行った場合、当該深夜料金の支払いに同意したものとみなす。"],
    ["ar", "第１０条（決済手数料）"],
    ["p", "１．利用者が現金以外の方法（クレジットカード、電子マネー、QRコード決済等を含むが、これらに限られない）により料金を支払う場合は、お支払い金額の5％を決済手数料として申し受けるものとする。"],
    ["p", "２．現金でお支払いの場合は、前項の決済手数料はかからないものとする。"],
    ["ch", "第７章　一般条項"],
    ["ar", "第１１条（禁止事項）"],
    ["p", "１．利用者は、「CN health & beauty salonオンライン予約サービス」の利用に際して、次の各号の行為を行わないものとする。"],
    ["p", "（１）本規約等に違反する行為"],
    ["p", "（２）サービス提供者、他の利用者、その他第三者に対し、その権利を侵害し、不利益を与え、または不快感を抱かせる行為"],
    ["p", "（３）当サロンが承認した以外の方法で「CN health & beauty salonオンライン予約サービス」を利用する行為"],
    ["p", "（４）有害なコンピュータプログラム等を送信または書き込む行為"],
    ["p", "（５）スパムメール、チェーンレター、ジャンクメール等を送信する行為"],
    ["p", "（６）法令または公序良俗に反する行為"],
    ["p", "（７）その他当サロンが禁止する行為"],
    ["p", "２．当サロンは、利用者が前項各号の一の行為に該当すると判断した場合には、事前に通知することなく、当該利用者に対し、「CN health & beauty salonオンライン予約サービス」の利用停止を行うことができるものとし、これにより当該利用者に何らかの損害が生じたとしても、当サロンは一切責任を負わないものとする。"],
    ["ar", "第１２条（免責事項）"],
    ["p", "１．予約サービスにおける当サロンの責任は、利用者と店舗運営者の間で予約が成立した場合に、予約情報を伝達することに限定され、これ以外については、本規約等で特に定める場合を除き、一切の責任を負わない。"],
    ["p", "２．利用者と店舗運営者との間でトラブル、紛争等が生じた場合は、利用者と当該店舗運営者との間で直接解決するものとし、当サロンは一切の責任を負わない。"],
    ["p", "３．当サロンは、別途明示された規定がある場合を除き、予約の成立前における通信回線やコンピュータ等の障害によるシステムの中断・遅滞・中止・データの焼失、データへの不正アクセスにより生じた損害、ならびに「CN health & beauty salonオンライン予約サービス」の情報サービス利用に関して利用者に生じた損害について、一切の責任を負わない。"],
    ["p", "４．当サロンは、利用者の電子メール環境または伝達経路の不備により、当サロンが配信した電子メールが当該利用者に到着しなかったことにより生じた損害について、一切の責任を負わない。"],
    ["p", "５．利用者は、「CN health & beauty salonオンライン予約サービス」の利用に際し、自ら行った行為について責任を負うものとし、第三者に損害を与えた場合、自己の責任と費用負担で解決するものとする。"],
    ["p", "６．当サロンは、利用者に対し、適宜情報提供やアドバイスを行うことがあるが、それにより責任を負うものではない。"],
    ["p", "７．当サロンは、利用者が本規約等に違反したことによって生じた損害について、一切の責任を負わない。"],
    ["p", "８．当サロンは、「CN health & beauty salonオンライン予約サービス」が提供しているＷＥＢページ、サーバ、ドメイン等から送られるメールならびに予約サービスおよび情報サービスのコンテンツ等に、コンピュータウィルス等の有害なものが含まれないことを保証しない。"],
    ["p", "９．当サロンは、システムの定期保守や緊急保守を行う場合、システムに負荷が集中した場合、利用者のセキュリティを確保する必要が生じた場合、その他必要があると判断した場合には、事前に通知することなく「CN health & beauty salonオンライン予約サービス」のサービスの全部または一部の提供を中断または停止することができるものとする。当サロンは、この場合に利用者に発生した損害について、一切の責任を負わない。"],
    ["p", "１０．当サロンは、利用者に対し、当サロンまたはサービス提供者が「CN health & beauty salonオンライン予約サービス」に掲示した情報の真偽、正確性、信頼性等につき一切保証しないものとし、当該情報に起因して利用者に発生した損害について、一切の責任を負わない。"],
    ["ar", "第１３条（本規約等の変更）"],
    ["p", "１．当サロンは、利用者に対する事前の通知なく本規約等を改定できるものとし、本規約等改定後は、改定後の本規約等を適用するものとする。なお、利用者が「CN health & beauty salonオンライン予約サービス」を利用した場合、改定後の本規約等に同意したものとする。"],
    ["p", "２．当サロンは、その判断により利用者に事前に通知・連絡することなく、「CN health & beauty salonオンライン予約サービス」のサービスの全部または一部を変更・廃止することができるものとする。"],
    ["ar", "第１４条（準拠法、合意管轄）"],
    ["p", "本規約は日本法に基づき解釈されるものとし、本規約に関し訴訟の必要が生じた場合には、東京地方裁判所を第一審の専属的合意管轄裁判所とする。"],
    ["cp", "Copyright 2026 CN health & beauty salon. All Rights Reserved."],
  ];
  // ---- プライバシーポリシー：正式文書「CN health & beauty salon 個人情報保護方針」をそのまま掲載 ----
  const PRIVACY_DOC = [
    ["sub", "CN health & beauty salon 個人情報保護方針"],
    ["sub", "2026年9月27日　制定・施行"],
    ["sub", "CN health & beauty salon"],
    ["p", "CNウィング企画株式会社が運営するCN health & beauty salon（以下「当サロン」という）は、お客様（以下「利用者」という）の個人情報の重要性を認識し、個人情報の保護に関する法律（以下「個人情報保護法」という）その他の関係法令およびガイドラインを遵守するとともに、以下のとおりプライバシーポリシー（以下「本ポリシー」という）を定め、個人情報の適切な取扱いおよび保護に努めるものとする。"],
    ["ch", "第１章　総則"],
    ["ar", "第１条（適用範囲）"],
    ["p", "本ポリシーは、当サロンが提供するCN health & beauty salonオンライン予約サービス、店頭での施術・商品販売、その他当サロンが提供するすべてのサービス（以下総称して「本サービス」という）において、当サロンが取得する利用者の個人情報の取扱いに適用されるものとする。"],
    ["ar", "第２条（個人情報の定義）"],
    ["p", "本ポリシーにおいて「個人情報」とは、個人情報保護法第２条第１項に定める個人情報、すなわち生存する個人に関する情報であって、当該情報に含まれる氏名、生年月日、その他の記述等により特定の個人を識別することができるもの（他の情報と容易に照合することができ、それにより特定の個人を識別することができることとなるものを含む）、または個人識別符号が含まれるものをいう。"],
    ["ch", "第２章　個人情報の取得および利用"],
    ["ar", "第３条（取得する個人情報）"],
    ["p", "当サロンは、本サービスの提供にあたり、適正な手段により、次の各号の個人情報を取得することがある。"],
    ["p", "（１）氏名、フリガナ、性別、生年月日"],
    ["p", "（２）住所、電話番号、電子メールアドレス"],
    ["p", "（３）予約日時、ご来店日時、施術内容、購入商品、お支払い金額およびお支払い方法"],
    ["p", "（４）カウンセリングシートに記載された内容（肌質、体質、ご要望等）"],
    ["p", "（５）施術前後の写真（利用者の同意を得た場合に限る）"],
    ["p", "（６）オンライン予約サービスの利用履歴、アクセスログ、Cookie等の端末情報"],
    ["p", "（７）お問い合わせ、アンケート等において利用者が任意に提供した情報"],
    ["ar", "第４条（健康状態等に関する情報の取扱い）"],
    ["p", "１．当サロンは、安全かつ適切な施術を行うため、利用者の健康状態、既往歴、アレルギーの有無、妊娠の有無、服薬状況等の情報（以下「健康情報等」という）をお伺いすることがある。"],
    ["p", "２．健康情報等のうち、個人情報保護法に定める要配慮個人情報に該当するものについては、あらかじめ利用者の同意を得たうえで取得するものとし、施術の可否判断および安全な施術の提供以外の目的には利用しないものとする。"],
    ["ar", "第５条（利用目的）"],
    ["p", "当サロンは、取得した個人情報を次の各号の目的の範囲内で利用するものとする。"],
    ["p", "（１）予約の受付、確認、変更、取消およびそれらに関するご連絡"],
    ["p", "（２）施術、カウンセリングその他本サービスの提供"],
    ["p", "（３）料金の請求、決済および決済手数料の精算"],
    ["p", "（４）施術履歴の管理および次回以降のより良いサービスのご提案"],
    ["p", "（５）新メニュー、キャンペーン、イベント等のご案内（電子メール、SMS、郵送等による）"],
    ["p", "（６）お問い合わせ、ご相談への対応"],
    ["p", "（７）サービス向上のためのアンケートの実施および統計資料の作成（個人を特定できない形式に加工したものに限る）"],
    ["p", "（８）利用規約に違反する行為、無断キャンセル等への対応"],
    ["p", "（９）その他、上記各号に付随する目的"],
    ["ch", "第３章　個人情報の管理および提供"],
    ["ar", "第６条（安全管理措置）"],
    ["p", "当サロンは、個人情報の漏えい、滅失または毀損の防止その他の安全管理のため、従業員に対する教育・監督、アクセス権限の管理、紙媒体の施錠保管、パスワードの設定等、必要かつ適切な措置を講じるものとする。"],
    ["ar", "第７条（第三者提供）"],
    ["p", "当サロンは、次の各号のいずれかに該当する場合を除き、あらかじめ利用者の同意を得ることなく、個人情報を第三者に提供しないものとする。"],
    ["p", "（１）法令に基づく場合"],
    ["p", "（２）人の生命、身体または財産の保護のために必要がある場合であって、利用者の同意を得ることが困難であるとき"],
    ["p", "（３）公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合であって、利用者の同意を得ることが困難であるとき"],
    ["p", "（４）国の機関もしくは地方公共団体またはその委託を受けた者が法令の定める事務を遂行することに対して協力する必要がある場合であって、利用者の同意を得ることにより当該事務の遂行に支障を及ぼすおそれがあるとき"],
    ["ar", "第８条（業務委託）"],
    ["p", "当サロンは、利用目的の達成に必要な範囲において、予約システムの運営、決済処理、電子メールの配信等の業務の全部または一部を外部事業者に委託することがある。この場合、当サロンは、委託先において個人情報が適切に管理されるよう、必要かつ適切な監督を行うものとする。"],
    ["ar", "第９条（決済情報の取扱い）"],
    ["p", "クレジットカード、電子マネー、QRコード決済等、現金以外の方法によるお支払いに係るカード番号等の決済情報は、各決済代行会社が直接取得・管理するものとし、当サロンはこれを保持しないものとする。"],
    ["ch", "第４章　Cookie等の取扱い"],
    ["ar", "第１０条（Cookieおよびアクセス解析）"],
    ["p", "１．CN health & beauty salonオンライン予約サービスでは、利便性の向上および利用状況の把握のため、Cookieおよび類似の技術を使用することがある。"],
    ["p", "２．利用者は、ブラウザの設定によりCookieの受け取りを拒否することができる。ただし、その場合、オンライン予約サービスの一部の機能が利用できなくなることがある。"],
    ["ch", "第５章　開示等の請求"],
    ["ar", "第１１条（開示、訂正、利用停止等）"],
    ["p", "１．利用者は、当サロンが保有する自己の個人情報について、個人情報保護法の定めに基づき、利用目的の通知、開示、訂正、追加、削除、利用の停止、消去および第三者提供の停止（以下「開示等」という）を請求することができる。"],
    ["p", "２．開示等の請求を行う場合は、第１４条に定めるお問い合わせ窓口までご連絡いただくものとする。当サロンは、ご本人であることを確認したうえで、法令に従い遅滞なく対応するものとする。"],
    ["p", "３．利用者は、当サロンからの広告・宣伝を目的とする電子メール等の配信について、いつでも配信停止を申し出ることができる。"],
    ["ar", "第１２条（保存期間）"],
    ["p", "当サロンは、利用目的の達成に必要な期間、または法令により保存が義務付けられた期間、個人情報を保存するものとし、不要となった個人情報は、速やかかつ適切な方法により消去または廃棄するものとする。"],
    ["ch", "第６章　一般条項"],
    ["ar", "第１３条（本ポリシーの変更）"],
    ["p", "当サロンは、法令の改正、本サービスの内容の変更その他必要に応じて、本ポリシーを改定することができるものとする。改定後の本ポリシーは、当サロンのウェブサイトまたはオンライン予約サービス上に掲載した時点から効力を生じるものとする。"],
    ["ar", "第１４条（お問い合わせ窓口）"],
    ["p", "本ポリシーおよび個人情報の取扱いに関するお問い合わせは、下記の窓口までお願いいたします。"],
    ["p", "事業者名：CNウィング企画株式会社（CN health & beauty salon）"],
    ["p", "代表者：代表取締役　大水　寛（中国名：藩　智華）"],
    ["p", "所在地：〒130-0013　東京都墨田区錦糸３丁目８番６号　錦糸レジデンス３Ｆ"],
    ["p", "電話番号：03-5809-7975（錦糸健康スタジオ）"],
    ["p", "　　　　　03-6806-0324（CN Health & Beauty SALON 上野）"],
    ["p", "電子メール：【メールアドレス】"],
    ["p", "受付時間：10:00〜22:00（年末年始を除く）"],
    ["p", "以上"],
    ["cp", "Copyright 2026 CN health & beauty salon. All Rights Reserved."],
  ];
  function openTermsModal(doc, en) {
    document.getElementById("fm-doc-modal")?.remove();
    const title = doc === "privacy" ? "プライバシーポリシー" : "利用規約";
    const items = doc === "privacy" ? PRIVACY_DOC : TERMS_DOC;
    const wrap = document.createElement("div");
    wrap.id = "fm-doc-modal";
    wrap.innerHTML =
      '<div class="fm-doc-card" role="dialog" aria-modal="true" aria-label="' + title + '">' +
        '<div class="fm-doc-head"><b>' + title + '</b><button type="button" class="fm-doc-x" aria-label="閉じる">×</button></div>' +
        '<div class="fm-doc-body">' +
          items.map(([t, x]) =>
            t === "ch" ? '<h2 class="fm-doc-ch">' + x + "</h2>" :
            t === "ar" ? "<h3>" + x + "</h3>" :
            t === "sub" ? '<p class="fm-doc-sub">' + x + "</p>" :
            t === "cp" ? '<p class="fm-doc-cp">' + x + "</p>" : "<p>" + x + "</p>").join("") +
        "</div>" +
        '<div class="fm-doc-foot"><button type="button" class="fm-doc-close">' + (en ? "Close" : "閉じる") + "</button></div>" +
      "</div>";
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap || e.target.closest(".fm-doc-x, .fm-doc-close")) wrap.remove();
    });
    document.body.appendChild(wrap);
    if (!document.getElementById("fm-doc-style")) {
      const st = document.createElement("style");
      st.id = "fm-doc-style";
      st.textContent =
        "#fm-doc-modal{position:fixed;inset:0;background:rgb(0 0 0/.45);display:flex;align-items:center;justify-content:center;z-index:2000;padding:20px}" +
        "#fm-doc-modal .fm-doc-card{background:#fff;border-radius:10px;max-width:640px;width:100%;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgb(0 0 0/.25)}" +
        "#fm-doc-modal .fm-doc-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #ead9bd}" +
        "#fm-doc-modal .fm-doc-head b{font-size:16px;color:#333}" +
        "#fm-doc-modal .fm-doc-x{font:inherit;font-size:22px;line-height:1;border:0;background:none;color:#999;cursor:pointer;padding:0 2px}" +
        "#fm-doc-modal .fm-doc-body{overflow-y:auto;padding:6px 22px 14px;font-size:13.5px;line-height:1.9;color:#444}" +
        "#fm-doc-modal .fm-doc-body h3{font-size:13.5px;margin:14px 0 2px;color:#8a6a33}" +
        "#fm-doc-modal .fm-doc-body .fm-doc-ch{font-size:14px;font-weight:700;margin:20px 0 4px;color:#6b4f2a}" +
        "#fm-doc-modal .fm-doc-body .fm-doc-sub{margin:0;color:#555}" +
        "#fm-doc-modal .fm-doc-body .fm-doc-cp{margin-top:18px;color:#888;font-size:12px}" +
        "#fm-doc-modal .fm-doc-body p{margin:0 0 4px}" +
        "#fm-doc-modal .fm-doc-foot{padding:12px 20px;border-top:1px solid #ead9bd;text-align:center}" +
        "#fm-doc-modal .fm-doc-close{font:inherit;background:#b08d4f;color:#fff;border:0;border-radius:6px;padding:10px 42px;font-weight:700;cursor:pointer}";
      document.head.appendChild(st);
    }
  }

  // ---- 予約完了ページ：予約ID表記・オプション行・「マイページへ」ボタン ----
  function decorateComplete() {
    if (!location.pathname.startsWith("/book/complete")) return;
    const dts = [...document.querySelectorAll("dt")];
    if (!dts.length) return;
    const en = dts.some((d) => /Booking (reference|number)|Name/.test(d.textContent));
    const renames = en
      ? { "Booking reference": "Booking ID", "Booking number": "Booking ID", "Selected menu": "Menu" }
      : { "予約番号": "予約ID", "選択中のメニュー": "メニュー" };
    for (const dt of dts) {
      const t = dt.textContent.trim();
      if (renames[t]) dt.textContent = renames[t];
    }
    const dl = dts[0].closest("dl");
    // 予約番号は <p>予約番号<strong> 構造なので、dl先頭の「予約ID」行に移す
    const refEl = document.querySelector(".receipt-reference");
    if (refEl && dl && !dl.dataset.fmId) {
      dl.dataset.fmId = "1";
      refEl.closest("p").style.display = "none";
      const dt = document.createElement("dt");
      dt.textContent = en ? "Booking ID" : "予約ID";
      const dd = document.createElement("dd");
      dd.textContent = refEl.textContent;
      dl.prepend(dd);
      dl.prepend(dt);
    }
    if (dl && dl.dataset.fmId && !dl.dataset.fmOrder) {
      dl.dataset.fmOrder = "1";
      // オプション行を追加し、画像と同じ並び順にする
      const label = (t) => [...dl.querySelectorAll("dt")].find((d) => d.textContent.trim() === t);
      if (!label(en ? "Options" : "オプション")) {
        const dt = document.createElement("dt");
        dt.textContent = en ? "Options" : "オプション";
        const dd = document.createElement("dd");
        dd.textContent = en ? "None" : "なし";
        dl.append(dt, dd);
      }
      const order = en
        ? ["Booking ID", "Name", "Date and time", "Guests", "Menu", "Options", "Staff", "Total"]
        : ["予約ID", "お名前", "来店日時", "人数", "メニュー", "オプション", "スタッフ", "合計"];
      for (const t of order) {
        const dt = label(t);
        if (dt) { const dd = dt.nextElementSibling; dl.append(dt); if (dd?.tagName === "DD") dl.append(dd); }
      }
    }
    // 見出しの文言
    document.querySelectorAll("h1, h2, p").forEach((h) => {
      if (h.childElementCount) return;
      if (h.textContent.trim() === "予約が完了しました") h.textContent = "ご予約ありがとうございました。";
      if (h.textContent.trim() === "Booking complete") h.textContent = "Thank you for your booking.";
    });
    // 印刷ボタン → マイページへ（全言語の印刷ボタン文言に対応）
    const pr = [...document.querySelectorAll("button, a")].find((b) =>
      /予約内容を印刷・保存|Print|打印|인쇄|Imprimer|Imprimir|Stampa|drucken/.test(b.textContent));
    if (pr && !document.getElementById("fm-mypage-btn")) {
      pr.style.display = "none";
      const a = document.createElement("a");
      a.id = "fm-mypage-btn";
      a.href = "/mypage";
      const mpLang = (() => { try { return localStorage.getItem("cn-salon-language") || "ja"; } catch { return "ja"; } })();
      a.textContent = { ja: "マイページへ", en: "My page", zh: "我的页面", ko: "마이페이지",
        fr: "Ma page", es: "Mi página", it: "La mia pagina", de: "Meine Seite" }[mpLang] || "マイページへ";
      a.style.cssText = "display:inline-block;background:#c5a15e;color:#fff;font-weight:700;border-radius:6px;padding:13px 34px;text-decoration:none;font-size:14px;";
      pr.before(a);
      const wrap = a.parentElement;
      if (wrap) wrap.style.textAlign = "center";
    }
  }

  Promise.all([load(), whenHydrated]).then(apply);
  function decorateTicketComplete() {
    if (!location.pathname.includes("/book/complete")) return;
    let used = null;
    try { used = JSON.parse(sessionStorage.getItem("fm-ticket-used") || "null"); } catch {}
    if (!used) return;
    const dl = document.querySelector(".booking-receipt dl");
    if (!dl || dl.dataset.fmTicket) return;
    dl.dataset.fmTicket = "1";
    const dt = document.createElement("dt");
    dt.textContent = "回数券";
    const dd = document.createElement("dd");
    dd.textContent = (used.name ? used.name + "を" : "") + "1回使用（残り " + used.left + "回）";
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  // ---- 予約の日時変更（ログイン会員のみ）：マイページ「日時を変更」→ ?reschedule=予約ID で予約フローへ ----
  // 新しい日時で予約を確定すると、サーバーが元の予約を自動的に取り消す（本人確認はサーバー側）
  const RSKEY = "fm-reschedule";
  function rescheduleId() { try { return sessionStorage.getItem(RSKEY) || ""; } catch { return ""; } }
  function clearReschedule() { try { sessionStorage.removeItem(RSKEY); } catch {} }
  try {
    const rs = new URLSearchParams(location.search).get("reschedule");
    if (rs) sessionStorage.setItem(RSKEY, rs);
  } catch {}
  function decorateReschedule() {
    const rs = rescheduleId();
    const old = document.getElementById("fm-reschedule-bar");
    if (!rs || !location.pathname.startsWith("/book") || location.pathname.includes("/book/complete")) {
      if (old) old.remove();
      return;
    }
    if (old) return;
    const main = document.querySelector("main");
    if (!main) return;
    const bar = document.createElement("div");
    bar.id = "fm-reschedule-bar";
    bar.style.cssText = "background:#fff6e5;border:1px solid #e3c98f;border-radius:8px;padding:12px 16px;margin:0 0 14px;font-size:14px;line-height:1.7;color:#5a4a2a;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:space-between";
    bar.innerHTML = "<span><b>ご予約の日時変更中です。</b>新しい日時・メニューで予約を確定すると、元のご予約は自動的に取り消されます。</span>" +
      '<button type="button" id="fm-reschedule-stop" style="border:1px solid #c5a15e;background:#fff;color:#8a6a33;border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer">変更をやめる</button>';
    main.prepend(bar);
    bar.querySelector("#fm-reschedule-stop").addEventListener("click", () => { clearReschedule(); location.href = "/mypage#resv"; });
  }
  function decorateRescheduleComplete() {
    if (!location.pathname.includes("/book/complete")) return;
    let done = "";
    try { done = sessionStorage.getItem("fm-rescheduled") || ""; } catch {}
    if (!done) return;
    const dl = document.querySelector(".booking-receipt dl");
    if (!dl || dl.dataset.fmRescheduled) return;
    dl.dataset.fmRescheduled = "1";
    const p = document.createElement("p");
    p.style.cssText = "background:#fff6e5;border-radius:8px;padding:10px 14px;font-size:14px;color:#5a4a2a;margin:0 0 12px";
    p.textContent = "ご予約の日時を変更しました。元のご予約は取り消されています（マイページでご確認いただけます）。";
    dl.before(p);
  }

  setInterval(() => { if (!canTouch()) return; apply(); decorateConsent(); decorateComplete(); decorateTicketBanner(); decorateTicketPick(); decorateTicketComplete(); decorateReschedule(); decorateRescheduleComplete(); }, 700);
  setInterval(() => { load(); }, 15000);
})();
