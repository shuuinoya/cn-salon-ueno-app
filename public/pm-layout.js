// 本物の管理システム（Peak Manager）のレイアウトに合わせるための補完スクリプト。
// React（保存済みチャンク）が描き直しても消えないよう、定期的に不足分を足し直す。
(function () {
  "use strict";
  const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

  // 保存APIの応答に warning が含まれていたら管理者に知らせる
  // （例：対応可能メニューから外したメニューの予約が残っている場合）
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    // 休憩・業務の登録：時間（分）の自由入力欄に値があれば、その分数を優先する
    try {
      const u0 = typeof input === "string" ? input : input?.url || "";
      if (u0.includes("/api/demo/schedule") && init && init.method === "POST" && typeof init.body === "string") {
        const b = JSON.parse(init.body);
        if (b && b.action === "block" && !b.remove && typeof b.start === "number") {
          const inp = document.querySelector(".ledger-side-form .pm-durfree input");
          const v = inp && inp.value !== "" ? Math.floor(Number(inp.value)) : NaN;
          if (Number.isFinite(v) && v >= 5 && v <= 1020) {
            b.end = b.start + v;
            init = { ...init, body: JSON.stringify(b) };
          }
        }
      }
    } catch {}
    const res = await origFetch(input, init);
    try {
      const u = typeof input === "string" ? input : input?.url || "";
      if (u.includes("/api/demo/schedule") && init && init.method === "POST" && res.ok) {
        const j = await res.clone().json().catch(() => null);
        if (j && j.warning) setTimeout(() => window.alert(j.warning), 100);
        // 登録直後に「休憩 18:30〜…」のような素の表示が残らないよう、即取り直して装飾する
        window.__pmSchedAt = 0;
        setTimeout(async () => { await refreshSched(true); decorateEvents(); }, 250);
      }
    } catch {}
    return res;
  };

  function ensure() {
    const app = document.querySelector(".ledger-app");
    if (!app) return;

    // 1) 日付表示を「2026-09-25 金」形式に
    const time = document.querySelector(".ledger-date-trigger time");
    if (time) {
      const d = time.getAttribute("datetime");
      if (d) {
        const w = WEEK[new Date(d + "T00:00:00Z").getUTCDay()];
        const want = d + " " + w;
        if (time.textContent !== want) time.textContent = want;
      }
    }

    // 2) 再読込ボタンの隣に天気ボタン＋雲アイコン
    const refresh = document.querySelector(".ledger-refresh");
    if (refresh && !document.getElementById("pm-weather")) {
      const b = document.createElement("button");
      b.id = "pm-weather";
      b.className = "pm-weather";
      b.type = "button";
      b.title = "デモ版では天気情報はありません";
      b.textContent = "天気";
      refresh.insertAdjacentElement("afterend", b);
      const c = document.createElement("span");
      c.id = "pm-cloud";
      c.className = "pm-cloud";
      b.insertAdjacentElement("afterend", c);
    }

    // 3) ヘッダー右に警告バッジ、ユーザー表示は本物と同じ省略表記に
    const brand = document.querySelector(".ledger-brand");
    if (brand) {
      if (!document.getElementById("pm-alert")) {
        const w = document.createElement("span");
        w.id = "pm-warn";
        w.className = "pm-warn";
        w.textContent = "⚠";
        const s = document.createElement("span");
        s.id = "pm-alert";
        s.className = "pm-alert";
        s.textContent = "3862";
        brand.insertAdjacentElement("beforebegin", s);
        s.insertAdjacentElement("beforebegin", w);
      }
      if (brand.textContent !== "CN He...") brand.textContent = "CN He...";
      // クリックで「ログアウト」メニューを開閉（本物と同じ挙動）
      if (!brand.dataset.pmMenuBound) {
        brand.dataset.pmMenuBound = "1";
        brand.addEventListener("click", (e) => {
          e.stopPropagation();
          let menu = document.getElementById("pm-usermenu");
          if (menu) { menu.remove(); return; }
          menu = document.createElement("div");
          menu.id = "pm-usermenu";
          const item = document.createElement("button");
          item.type = "button";
          item.textContent = "ログアウト";
          item.addEventListener("click", () => {
            fetch("/api/demo/logout", { method: "POST" }).finally(() => { location.href = "/admin/login?out=1"; });
          });
          menu.appendChild(item);
          document.body.appendChild(menu);
          const r = brand.getBoundingClientRect();
          menu.style.top = r.bottom + 6 + "px";
          menu.style.right = Math.max(8, window.innerWidth - r.right) + "px";
          const close = (ev) => {
            if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("click", close); }
          };
          setTimeout(() => document.addEventListener("click", close), 0);
        });
      }
    }

    // 3c) 青い「オンライン予約が入りました」トースト（本物と同じ表示）
    if (!window.__pmToastTimer) {
      window.__pmToastTimer = setTimeout(() => {
        if (document.getElementById("pm-toast")) return;
        const now = new Date(Date.now() + 9 * 3600e3); // 日本時間
        const later = new Date(now.getTime() + 90 * 60e3);
        const hh = String(later.getUTCHours()).padStart(2, "0");
        const mm = String(Math.floor(later.getUTCMinutes() / 10) * 10).padStart(2, "0");
        const t = document.createElement("div");
        t.id = "pm-toast";
        t.innerHTML = "オンライン予約が入りました。<br/>" +
          now.toISOString().slice(0, 10) + " " + hh + ":" + mm + " 新予約";
        t.title = "クリックで閉じる";
        t.addEventListener("click", () => t.remove());
        document.body.appendChild(t);
      }, 4000);
    }

    // 3a1) 左上のロゴを本物と同じ「白い花びらマーク」にする
    decorateLogo();
    const logo = document.querySelector(".ledger-logo");

    // 3a2) 左上のロゴは押しても何も起きないようにする（予約サイトへ飛ばない）
    if (logo && !logo.dataset.pmNoNav) {
      logo.dataset.pmNoNav = "1";
      logo.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, true);
      logo.style.cursor = "default";
    }

    // 3b) スタッフ行ごとの装飾（★数・ピンク強調・左端の色バー）と、
    //      鍵（予約受付停止）トグル。鍵の状態はサーバーの実データと連動する。
    const DECOR = {
      "杉田 祐哉": { star: "60" },
      "中山 優吾": { star: "270" },
      "山田 恵": { female: true },
      "小倉 有美子": { star: "110", female: true },
      "未定": { star: "110" },
    };
    refreshLocks();
    document.querySelectorAll(".ledger-row").forEach((row) => {
      const cell = row.querySelector(".ledger-staff-cell");
      const name = cell?.querySelector("b")?.textContent || "";
      if (!cell) return;
      const d = DECOR[name] || {};
      const star = "★" + (d.star || "0");
      if (cell.dataset.pmstar !== star) cell.dataset.pmstar = star;
      row.classList.toggle("pm-pink", !!d.pink);
      row.classList.toggle("pm-acc-f", !!d.female);
      row.classList.toggle("pm-acc-m", !d.female);
      const lockInfo = window.__pmLocks?.[name];
      row.classList.toggle("pm-blue", !!lockInfo?.locked);
      row.classList.toggle("pm-locked", !!lockInfo?.locked);
      if (lockInfo && !cell.querySelector(".pm-lockbtn")) {
        const b = document.createElement("span");
        b.className = "pm-lockbtn";
        b.setAttribute("role", "button");
        b.tabIndex = 0;
        b.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const cur = window.__pmLocks?.[name];
          if (!cur || b.dataset.busy) return;
          b.dataset.busy = "1";
          // 押した瞬間に行を青く（解除なら元に）してから、サーバーに保存する（楽観更新）
          const next = cur.locked ? 0 : 1;
          cur.locked = next;
          row.classList.toggle("pm-blue", !!next);
          row.classList.toggle("pm-locked", !!next);
          try {
            const r = await fetch("/api/demo/schedule", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "lockStaff",
                date: new Date(Date.now() + 9 * 3600e3 - 108e5).toISOString().slice(0, 10),
                staffId: cur.id,
                locked: next,
              }),
            });
            if (!r.ok) throw new Error("lockStaff failed");
            await refreshLocks(true);
          } catch {
            // 保存に失敗したら見た目を元に戻す
            cur.locked = next ? 0 : 1;
            row.classList.toggle("pm-blue", !!cur.locked);
            row.classList.toggle("pm-locked", !!cur.locked);
          } finally { delete b.dataset.busy; }
        }, true);
        cell.appendChild(b);
      }
      const btn = cell.querySelector(".pm-lockbtn");
      if (btn && lockInfo) {
        btn.title = lockInfo.locked
          ? name + " は予約受付停止中（クリックで再開）"
          : name + " の予約受付を停止する";
      }
    });

    // 3c2) 「予約台帳」メニューを本物と同じ項目構成にする
    //      （予約受付＝日別スケジュール表示。装飾項目はデモでは飾り）
    const navMenu = document.querySelector(".ledger-nav-menu > div");
    if (navMenu && !navMenu.dataset.pmMenu) {
      navMenu.dataset.pmMenu = "1";
      [...navMenu.querySelectorAll("button")].forEach((b) => { b.style.display = "none"; });
      // 画面切替（スタッフ情報など）で元ボタンが作り直されるため、クリック時に毎回探す
      const findOrig = (label) => [...document.querySelectorAll(".ledger-nav-menu > div button")]
        .find((b) => b.textContent === label && b.style.display === "none");
      const dayBtn = () => findOrig("日別予約台帳");
      const monthBtn = () => findOrig("月間シフト作成");
      const items = [
        ["トップ", () => dayBtn()?.click()],
        ["予約受付", () => dayBtn()?.click()],
        ["予約一覧", () => {
          dayBtn()?.click();
          setTimeout(() => {
            [...document.querySelectorAll(".ledger-underbar button")]
              .find((b) => b.textContent === "予約一覧")?.click();
          }, 150);
        }],
        ["支払・レジ", null],
        ["物販販売", null],
        ["返客一覧", null],
        ["月間シフト入力", () => monthBtn()?.click()],
        ["本日のオンライン設定状況", null],
        ["シフトひな型設定", null],
        ["シフトパターン設定", null],
        ["データ不備のお知らせ", null],
      ];
      for (const [label, fn] of items) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        if (fn) b.addEventListener("click", fn);
        else { b.title = "デモ版では使用できません"; b.style.opacity = "0.55"; }
        navMenu.appendChild(b);
      }
    }

    // 3c3) 「店舗情報」メニューも本物と同じ項目構成にする
    //      （店舗情報＝フリーメッセージなど予約ページ設定、スタッフ情報＝本来の画面）
    const shopMenuRoot = [...document.querySelectorAll(".ledger-nav-menu")]
      .find((d) => d.querySelector("summary")?.textContent.includes("店舗情報"));
    const shopMenu = shopMenuRoot?.querySelector(":scope > div");
    if (shopMenu && !shopMenu.dataset.pmMenu) {
      shopMenu.dataset.pmMenu = "1";
      const staffBtn = [...shopMenu.querySelectorAll("button")].find((b) => b.textContent === "スタッフ情報");
      [...shopMenu.children].forEach((el) => { el.style.display = "none"; });
      const shopItems = [
        ["店舗情報", openShopSettings],
        ["スタッフ情報", () => staffBtn?.click()],
        ["メニュー一覧", openMenuList],
        ["回数券管理", openTicketAdmin],
        ["ホットペッパー連携", () => { location.href = "/admin/hotpepper"; }],
        ["ブース情報", null],
        ["経費マスタ", null],
        ["クレジットカード会社情報", null],
        ["電子マネー情報", null],
        ["TORICOM設定", null],
        ["ユーザ情報（アカウント管理）", openAccountAdmin],
      ];
      for (const [label, fn] of shopItems) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        if (fn) b.addEventListener("click", fn);
        else { b.title = "デモ版では使用できません"; b.style.opacity = "0.55"; }
        if (fn === openAccountAdmin) {
          // アカウント管理は管理者のみ（表示は目安。実際の制限はサーバー側で強制）
          getWhoami().then((w) => {
            if (w.role !== "admin") { b.style.opacity = "0.55"; b.title = "管理者のみ使用できます"; }
          });
        }
        shopMenu.appendChild(b);
      }
    }

    // 3c5b) 本物と同じ細部：店舗セレクトの店名／点線エリアの案内文／レール下の＋を隠す
    const sn = document.querySelector(".ledger-store-name");
    const SN = "Ueno spa&massage CN Health & Beauty SALON";
    if (sn && sn.textContent !== SN) sn.textContent = SN;
    const modeMsg = document.querySelector(".ledger-modes span");
    const MSG = "日付をまたいで予定を変更したい場合は、一旦このエリアに置いてください。";
    if (modeMsg && modeMsg.textContent !== MSG) modeMsg.textContent = MSG;
    document.querySelectorAll(".ledger-rail button").forEach((b) => {
      const hasLabel = !!(b.querySelector("small")?.textContent || "").trim();
      if (!hasLabel && /^[+＋]$/.test(b.textContent.trim())) b.style.display = "none";
      else if (b.style.display === "none" && hasLabel) b.style.display = "";
    });
    refreshSched();
    refreshShop().then(applyBizShade);
    decorateUnderbar();
    decorateSummary();
    decorateEvents();

    // 3c6) 空き枠はシングルタップでも選択できるようにする（本物と同じ操作感）
    //      タップした枠は本物と同じく赤いランプで点灯させる（左パネルを閉じると消える）
    if (!window.__pmTrackTap) {
      window.__pmTrackTap = 1;
      document.addEventListener("click", (e) => {
        const track = e.target.closest(".ledger-track");
        if (!track || e.target !== track || e.detail > 1) return;
        // タップ位置を最小の10分枠（グリッドの細線1マス）に切り下げ、
        // フォームの開始時間も枠の先頭になるよう、枠先頭の座標でダブルクリックを合成する
        const r = track.getBoundingClientRect();
        const frac = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 0.999);
        const minute = 600 + Math.floor((frac * 1020) / 10) * 10;
        const snapX = r.left + (((minute - 600) / 1020) * r.width) + 1;
        track.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: snapX, clientY: e.clientY }));
        const name = track.closest(".ledger-row")?.querySelector(".ledger-staff-cell b")?.textContent || "";
        window.__pmTapMark = { name, minute, t: Date.now() };
        applyTapMark();
      });
    }
    applyTapMark();

    // 3c6b) 「時間（分）」の下に、任意の分数を自由入力できる欄を追加
    //       （入力があればボタン選択より優先。ボタンを押すと入力はクリア）
    document.querySelectorAll(".ledger-side-form .ledger-duration").forEach((grid) => {
      if (grid.nextElementSibling?.classList?.contains("pm-durfree")) return;
      const box = document.createElement("div");
      box.className = "pm-durfree";
      box.innerHTML =
        '<label>その他の時間（分）を自由入力</label>' +
        '<input type="number" min="5" max="1020" step="5" placeholder="例: 75" inputmode="numeric">' +
        "<small>5〜1020分まで1分単位で入力できます。入力中はボタンより優先されます。</small>";
      grid.insertAdjacentElement("afterend", box);
      const inp = box.querySelector("input");
      inp.addEventListener("input", () => {
        grid.classList.toggle("pm-durfree-on", inp.value !== "");
      });
      grid.addEventListener("click", (e) => {
        if (e.target.closest("button")) {
          inp.value = "";
          grid.classList.remove("pm-durfree-on");
        }
      });
    });

    // 3c6b2) 予約枠にカーソルを乗せると詳細ツールチップを表示（本物と同じ項目構成）
    if (!window.__pmEvTip) {
      window.__pmEvTip = 1;
      document.addEventListener("mouseover", (e) => {
        const el = e.target.closest(".ledger-event");
        if (!el || el.classList.contains("activity")) { document.getElementById("pm-evtip")?.remove(); return; }
        showEventTip(el);
      });
      document.addEventListener("mouseout", (e) => {
        if (e.target.closest && e.target.closest(".ledger-event")) document.getElementById("pm-evtip")?.remove();
      });
      document.addEventListener("scroll", () => document.getElementById("pm-evtip")?.remove(), true);
    }

    // 3c6c) 「シフト追加」は本物と同じ「シフト新規登録」モーダルを開く
    if (!window.__pmShiftAdd) {
      window.__pmShiftAdd = 1;
      document.addEventListener("click", (e) => {
        const b = e.target.closest(".ledger-add");
        if (!b || b.textContent.trim() !== "シフト追加") return;
        e.preventDefault();
        e.stopPropagation();
        openShiftAdd();
      }, true);
    }

    // 3c7-0) リロードが押せる状態のときも、押したら左パネルを閉じる
    if (!window.__pmRefreshClose2) {
      window.__pmRefreshClose2 = 1;
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".ledger-refresh")) return;
        const closeBtn = [...document.querySelectorAll(".ledger-side button")]
          .find((b) => (b.textContent === "×" || b.textContent === "X") && !b.closest("#pm-np"));
        closeBtn?.click();
      }, true);
    }

    // 3c7) 再読込ボタンを押したら左の編集パネルを閉じて再読込する
    //（パネルが開いている間は本来のボタンがdisabledでクリックが発生しないため、
    //  透明のオーバーレイを重ねて「閉じる→再読込」を行う）
    {
      const rb = document.querySelector(".ledger-refresh");
      let ov = document.getElementById("pm-refresh-ov");
      if (rb && rb.disabled && document.querySelector(".ledger-side")) {
        if (!ov) {
          ov = document.createElement("span");
          ov.id = "pm-refresh-ov";
          ov.title = "編集を閉じて再読込";
          ov.style.cssText = "position:fixed;z-index:900;cursor:pointer;";
          ov.addEventListener("click", () => {
            [...document.querySelectorAll(".ledger-side button")]
              .find((b) => b.textContent === "×" && !b.closest("#pm-np"))?.click();
            setTimeout(() => {
              const r2 = document.querySelector(".ledger-refresh");
              if (r2 && !r2.disabled) r2.click();
            }, 350);
          });
          document.body.appendChild(ov);
        }
        const r = rb.getBoundingClientRect();
        ov.style.left = r.left + "px";
        ov.style.top = r.top + "px";
        ov.style.width = r.width + "px";
        ov.style.height = r.height + "px";
      } else {
        ov?.remove();
      }
    }

    // 3c8) 空き枠パネルを本物の「予約の登録／性別選択／予約以外の登録」構成にする
    decorateNewPanel();

    // 3c5) 「日次管理」メニュー：営業実績（日報）ページを開けるようにする
    const dailyBtn = [...document.querySelectorAll(".ledger-nav > nav > button")]
      .find((b) => b.textContent.trim().startsWith("日次管理"));
    if (dailyBtn && !dailyBtn.dataset.pmDaily) {
      dailyBtn.dataset.pmDaily = "1";
      dailyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        let menu = document.getElementById("pm-dailymenu");
        if (menu) { menu.remove(); return; }
        menu = document.createElement("div");
        menu.id = "pm-dailymenu";
        const items = [
          ["営業実績", () => { location.href = "/admin/report"; }],
          ["日報一覧", null],
          ["営業実績一覧", null],
        ];
        for (const [label, fn] of items) {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = label;
          if (fn) b.addEventListener("click", fn);
          else { b.title = "デモ版では使用できません"; b.style.opacity = "0.55"; }
          menu.appendChild(b);
        }
        document.body.appendChild(menu);
        const r = dailyBtn.getBoundingClientRect();
        menu.style.top = r.bottom + "px";
        menu.style.left = r.left + "px";
        const close = (ev) => {
          if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("click", close); }
        };
        setTimeout(() => document.addEventListener("click", close), 0);
      }, true);
    }

    // 3c4) スタッフ編集フォームに「削除」ボタンを追加（登録済みスタッフのみ表示）
    const staffActions = document.querySelector(".staff-form-actions");
    if (staffActions) {
      if (!staffActions.querySelector(".pm-staff-del")) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "pm-staff-del";
        del.textContent = "削除";
        del.addEventListener("click", async () => {
          const form = del.closest("form") || document;
          const idVal = [...form.querySelectorAll("input")].map((i) => i.value)
            .find((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v));
          if (!idVal || del.dataset.busy) return;
          const known = Object.values(window.__pmLocks || {}).find((l) => l.id === idVal);
          const name = known?.name || "このスタッフ";
          if (!window.confirm("スタッフ「" + name + "」を削除しますか？\nシフト・休憩・業務も一緒に削除されます。\n（予約が残っている場合は削除できません）")) return;
          del.dataset.busy = "1";
          try {
            const r = await fetch("/api/demo/schedule", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "staffDelete",
                date: new Date(Date.now() + 9 * 3600e3 - 108e5).toISOString().slice(0, 10),
                staffId: idVal,
              }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) {
              window.alert(j.error === "hasBookings"
                ? "このスタッフには予約が入っているため削除できません。\n先に予約の担当変更または取消をしてください。"
                : "削除できませんでした。");
              return;
            }
            await refreshLocks(true);
            window.alert("スタッフ「" + name + "」を削除しました。");
            [...form.querySelectorAll("button")].find((b) => b.textContent === "戻る")?.click();
          } finally { delete del.dataset.busy; }
        });
        staffActions.appendChild(del);
      }
      // 新規作成（未保存）のフォームでは削除ボタンを隠す
      const btn = staffActions.querySelector(".pm-staff-del");
      const form2 = btn.closest("form") || document;
      const curId = [...form2.querySelectorAll("input")].map((i) => i.value)
        .find((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v));
      const saved = !!curId && Object.values(window.__pmLocks || {}).some((l) => l.id === curId);
      btn.style.display = saved ? "" : "none";
    }

    // 3d) 現在時刻の列を時間別概況でハイライト
    const nowJst = new Date(Date.now() + 9 * 3600e3);
    const hourIdx = (nowJst.getUTCHours() - 10 + 24) % 24;
    document.querySelectorAll(".ledger-overview button").forEach((b, i) => {
      b.classList.toggle("pm-now", i === hourIdx);
    });

    // 3e) 左レール：編集欄が開いているときは「開く」→「閉じる」
    const sideOpen = !!document.querySelector(".ledger-side");
    document.querySelectorAll(".ledger-rail button").forEach((b) => {
      const sm = b.querySelector("small"), ic = b.querySelector("b");
      if (!sm || !ic) return;
      if (sm.textContent === "開く" && sideOpen) { sm.textContent = "閉じる"; ic.textContent = "←"; }
      else if (sm.textContent === "閉じる" && !sideOpen) { sm.textContent = "開く"; ic.textContent = "➜"; }
    });

    // 7b) メール管理タブに、生成メールを確認するリンクを追加
    const mailSec = document.querySelector(".ledger-mail");
    if (mailSec && !document.getElementById("pm-maillink")) {
      const a = document.createElement("a");
      a.id = "pm-maillink";
      a.className = "pm-red";
      a.href = "/admin/mails";
      a.textContent = "送信メールを確認（デモ）";
      a.style.cssText = "display:inline-block;text-decoration:none;margin-left:8px;";
      mailSec.querySelector("button")?.insertAdjacentElement("afterend", a);
    }

    // 7b2) メニュー一覧の内容をコース選択肢に反映
    refreshCourses();
    syncCourseSelects();

    // 7b3) 日付ピッカーを本物の予約状況カレンダー（色分け＋凡例）にする
    decorateCalendar();

    // 7c) 月間シフト作成画面を本物の「月間シフト作成/目標設定」構成にする
    decorateMonth();

    // 8) 予約詳細パネルを本物と同じレイアウトに組み替える
    decoratePanel();

    // 9) 下部の集計を本物と同じ3段（赤・黒・青）にする

    // 4) 左レールのラベルを本物に合わせる
    document.querySelectorAll(".ledger-rail button small").forEach((sm) => {
      const map = { "戻る": "返客", "集計": "会計", "登録": "カード" };
      if (map[sm.textContent]) sm.textContent = map[sm.textContent];
    });

    // 5) 絞り込みボタンの名称
    document.querySelectorAll(".ledger-category-row button").forEach((b) => {
      if (b.textContent === "スタッフ別 絞り込み・設定") b.textContent = "カテゴリ別 絞り込み";
    });

    // 6) 旧実装のボタン群・目標行は decorateUnderbar / decorateSummary に一本化した
    document.getElementById("pm-extra")?.remove();
    document.getElementById("pm-target")?.remove();

    // 7) 以前ここで飾りの「未定」行を足していたが、今は実在スタッフになったため不要
    document.getElementById("pm-undecided")?.remove();
  }

  // 予約詳細パネルを本物（PeakManager）と同じ構成に見せる。
  // Reactが管理するフォームは隠しておき、「編集」を押したときだけ表示する。
  // 左パネルは出現した瞬間に装飾する（600ms周期のensure待ちで素のフォームが
  // 一瞬見えて「バタつく」のを防ぐ。描画フレームごとに1回だけ実行）
  function decorateSidePanelNow() {
    try {
      decorateNewPanel();
      decoratePanel();
      applyTapMark();
    } catch {}
  }
  if (!window.__pmPanelObs) {
    let queued = 0;
    window.__pmPanelObs = new MutationObserver(() => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        if (document.querySelector(".ledger-side")) decorateSidePanelNow();
        decorateEvents();
        if (document.querySelector(".ledger-date-popover")) decorateCalendar();
        decorateLogo();
      });
    });
    window.__pmPanelObs.observe(document.body, { childList: true, subtree: true });
  }

  // ヘッダーメニューの開閉を本物と同じ挙動に：
  // 1つ開いたら他は閉じる／外側をクリックしたら閉じる／項目を選んだら閉じる
  if (!window.__pmMenuOne) {
    window.__pmMenuOne = true;
    document.addEventListener("toggle", (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.open) return;
      if (!d.classList.contains("ledger-nav-menu")) return;
      document.querySelectorAll("details.ledger-nav-menu[open]").forEach((o) => {
        if (o !== d) o.open = false;
      });
    }, true); // toggleイベントはバブルしないためcaptureで受ける
    document.addEventListener("click", (e) => {
      const inMenu = e.target.closest && e.target.closest("details.ledger-nav-menu");
      if (!inMenu) {
        document.querySelectorAll("details.ledger-nav-menu[open]").forEach((o) => { o.open = false; });
        return;
      }
      // メニューの中の項目を選んだら、そのメニューを閉じる（見出しのsummary自体は除く）
      const item = e.target.closest("details.ledger-nav-menu button, details.ledger-nav-menu a");
      if (item && !item.closest("summary")) {
        setTimeout(() => { inMenu.open = false; }, 60);
      }
    });
  }

  // レールの「閉じる」は、どの状態のパネル（空き枠・予約詳細・休憩/業務フォーム）でも閉じられるようにする
  // （元の実装は顧客検索パネルしか閉じないため、先にフォームの「戻る」を押してから閉じる）
  if (!window.__pmRailClose) {
    window.__pmRailClose = true;
    document.addEventListener("click", (e) => {
      const btn = e.target.closest && e.target.closest(".ledger-rail button");
      if (!btn || btn.querySelector("small")?.textContent !== "閉じる") return;
      const form = document.querySelector(".ledger-side .ledger-side-form");
      if (!form) return; // 検索パネルはReact標準の切り替えで閉じる
      // フォーム系パネル（空き枠・予約詳細・休憩/業務）は正規の×/戻るで閉じ、
      // Reactの検索パネル切り替えは走らせない（走ると検索パネルが開いてしまう）
      e.preventDefault();
      e.stopPropagation();
      const sidePanel = document.querySelector(".ledger-side");
      const back = [...sidePanel.querySelectorAll("button")]
        .find((b) => ["戻る", "×", "X"].includes(b.textContent.trim()) && !b.closest("#pm-np"));
      back?.click();
      // それでもパネルが残っていた場合（検索状態が重なっていた等）はもう一度閉じる
      setTimeout(() => {
        if (!document.querySelector(".ledger-side")) return;
        const b2 = [...document.querySelectorAll(".ledger-rail button")]
          .find((x) => x.querySelector("small")?.textContent === "閉じる");
        if (b2 && !document.querySelector(".ledger-side .ledger-side-form")) b2.click();
      }, 400);
    }, true);
  }

  // 店舗マスタ（業務設定）を定期取得し、営業時間外を台帳グリッドにグレー表示する
  async function refreshShop(force) {
    if (!force && window.__pmShopAt && Date.now() - window.__pmShopAt < 3000) return window.__pmShop;
    try {
      const r = await fetch("/api/demo/settings", { cache: "no-store" });
      window.__pmShop = (await r.json()).shopMaster || null;
      window.__pmShopAt = Date.now();
    } catch {}
    return window.__pmShop;
  }
  function applyBizShade() {
    const sm = window.__pmShop;
    if (!sm) return;
    const key = sm.openStart + "-" + sm.openEnd;
    document.querySelectorAll("main.ledger-app .ledger-track").forEach((tr) => {
      let L = tr.querySelector(":scope > .pm-biz-off.pm-biz-l");
      let R = tr.querySelector(":scope > .pm-biz-off.pm-biz-r");
      if (!L) { L = document.createElement("i"); L.className = "pm-biz-off pm-biz-l"; tr.appendChild(L); }
      if (!R) { R = document.createElement("i"); R.className = "pm-biz-off pm-biz-r"; tr.appendChild(R); }
      if (tr.dataset.pmBiz === key) return;
      tr.dataset.pmBiz = key;
      const pct = (v) => (((v - 600) / 1020) * 100).toFixed(4);
      L.style.left = "0";
      L.style.width = pct(sm.openStart) + "%";
      L.style.display = sm.openStart > 600 ? "" : "none";
      R.style.left = pct(sm.openEnd) + "%";
      R.style.width = (100 - Number(pct(sm.openEnd))).toFixed(4) + "%";
      R.style.display = sm.openEnd < 1620 ? "" : "none";
    });
  }

  // 左上のロゴ：元サイトの5枚花びらは見せず、最初からログイン画面と同じ4枚花びら（白）にする
  // （文字の✿は環境によって色付き絵文字で表示されてしまうため、SVGで描く）
  function decorateLogo() {
    // どの画面・どの操作の後でも必ずクローバーにする。
    // Reactが中身を描き直して元の桜マークに戻っても、次の描画サイクルで即置き換える
    document.querySelectorAll(".ledger-logo").forEach((logo) => {
      if (logo.querySelector("svg.pm-clover")) return;
      logo.dataset.pmFlower = "1";
      logo.textContent = "";
      logo.innerHTML =
        '<svg class="pm-clover" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">' +
        '<path fill="#fff" d="M12 12C-3 13 0-3 9 1c3 1 3 7 3 11ZM12 12C11-3 27 0 23 9c-1 3-7 3-11 3ZM12 12c15-1 12 15 3 11-3-1-3-7-3-11ZM12 12c1 15-15 12-11 3 1-3 7-3 11-3Z"/>' +
        "</svg>";
    });
  }

  // 表示中の日付のスケジュール全体（予約・業務・担当）を取得して共有する
  async function refreshSched(force) {
    const t = document.querySelector(".ledger-date-trigger time")?.getAttribute("datetime")
      || new Date(Date.now() + 32400000 - 10800000).toISOString().slice(0, 10);
    const now = Date.now();
    if (!force && window.__pmSchedAt && now - window.__pmSchedAt < 3000 && window.__pmSchedFor === t) return;
    window.__pmSchedAt = now;
    window.__pmSchedFor = t;
    try {
      const r = await fetch("/api/demo/schedule?date=" + t, { cache: "no-store" });
      const d = await r.json();
      d.__date = t;
      window.__pmSchedData = d;
    } catch {}
  }

  const pmMin = (dateStr, ms) => Math.round((ms - Date.parse(dateStr + "T00:00:00+09:00")) / 60000);
  const pmHM = (min) => String(Math.floor((min % 1440) / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  const pmHM24 = (min) => String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");

  // 台帳下のボタン列を本物と同じ構成にする
  // （カテゴリ別絞り込みはReactの行をそのまま使い、その下の列だけ置き換える）
  function decorateUnderbar() {
    const ub = document.querySelector(".ledger-underbar");
    if (!ub || ub.dataset.pmDeco) return;
    ub.dataset.pmDeco = "1";
    [...ub.children].forEach((el) => { el.style.display = "none"; });
    for (const t of ["予約集計▼", "インターバル:ON", "ひな型登録", "ひな型読込"]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pm-ub-btn";
      b.textContent = t;
      if (t !== "予約集計▼") b.title = "デモ版では使用できません";
      else b.addEventListener("click", () => {
        const sm = document.querySelector(".ledger-summary:not([hidden])");
        if (sm) sm.style.display = sm.style.display === "none" ? "" : "none";
      });
      ub.appendChild(b);
    }
  }

  // 下部の集計を本物と同じ4行構成で、実データから計算して表示する
  function decorateSummary() {
    const el = document.querySelector(".ledger-summary:not([hidden])");
    const d = window.__pmSchedData;
    if (!el || !d) return;
    const bs = d.bookings || [];
    const conf = bs.filter((b) => b.status === "confirmed");
    const nNew = conf.filter((b) => b.is_new !== 0).length;
    const nRep = conf.length - nNew;
    const people = conf.reduce((a, b) => a + (b.people || 1), 0);
    const cancel = bs.filter((b) => b.status === "cancelled" && !b.no_show).length;
    const noshow = bs.filter((b) => b.no_show).length;
    const total = conf.reduce((a, b) => a + (b.total || 0), 0);
    const paid = conf.reduce((a, b) => a + (b.paid_amount || 0), 0);
    const tanka = people ? Math.floor(paid / people) : 0;
    const yen = (n) => n.toLocaleString("ja-JP") + "円";
    const key = [nNew, nRep, people, conf.length, cancel, noshow, total, paid].join(",");
    if (el.dataset.pmSum === key) return;
    el.dataset.pmSum = key;
    el.innerHTML =
      '<div class="pm-sum pm-sum-red"><span>目標：0円</span><span>総販売額：' + yen(paid) + "</span></div>" +
      '<div class="pm-sum"><span>新規：' + nNew + "名</span><span>リピート：" + nRep + "名</span><span>総来店人数：" + people +
        "名</span><span>施術件数：" + conf.length + "件</span><span>客単価：" + yen(tanka) + "</span><span>取消：" + cancel +
        "件</span><span>無断キャンセル：" + noshow + "件</span><span>返客：0件</span></div>" +
      '<div class="pm-sum pm-sum-blue"><span>施術：' + yen(paid) + "/" + yen(total) +
        "</span><span>物販：0円/0円</span><span>回数券販売：0円/0円</span><span>プリベイド販売：0円/0円</span></div>" +
      '<div class="pm-sum"><span>現金：' + yen(paid) + "</span><span>クレジット：0円</span><span>回数券利用：0円</span>" +
        "<span>プリベイド利用：0円</span><span>ポイント利用：0円</span><span>商品券利用：0円</span><span>電子マネー：0円</span><span>EPARKサービス：0円</span></div>";
  }

  // 予約ブロック・業務ブロックを本物と同じ表示（バッジ・時刻・色分け）にする
  function decorateEvents() {
    const d = window.__pmSchedData;
    if (!d || !d.bookings) return;
    const date = d.__date;
    const staffByName = {};
    for (const st of d.staff || []) staffByName[st.name] = st.id;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const badge = (cls, t) => '<i class="pm-bg pm-bg-' + cls + '">' + t + "</i>";
    document.querySelectorAll(".ledger-row").forEach((row) => {
      const sid = staffByName[row.querySelector(".ledger-staff-cell b")?.textContent || ""];
      if (!sid) return;
      row.querySelectorAll(".ledger-event").forEach((el) => {
        const pct = parseFloat(el.style.left || "0");
        const startMin = 600 + Math.round((pct * 1020) / 100 / 5) * 5;
        if (el.classList.contains("activity")) {
          const blk = (d.blocks || []).find((b) => b.staff_id === sid && Math.abs(pmMin(date, b.start_at) - startMin) <= 3);
          if (!blk) return;
          const s0 = pmMin(date, blk.start_at), e0 = pmMin(date, blk.end_at);
          const key = "b" + blk.id + s0 + e0 + blk.kind;
          if (el.dataset.pmEv === key) return;
          el.dataset.pmEv = key;
          el.innerHTML = "<strong>" + (blk.kind === "break" ? "休憩" : "業務") + "</strong><span>" +
            pmHM(s0) + "~" + pmHM(e0) + "</span><small>" + (e0 - s0) + "分</small>";
          return;
        }
        const bk = (d.bookings || []).find((b) => b.status === "confirmed" &&
          (d.assignments || []).some((a) => a.booking_id === b.id && a.staff_id === sid) &&
          Math.abs(pmMin(date, b.start_at) - startMin) <= 3);
        if (!bk) return;
        const s0 = pmMin(date, bk.start_at), e0 = pmMin(date, bk.end_at);
        const key = "k" + bk.id + s0 + e0 + (bk.paid_amount || 0) + (bk.name || "");
        if (el.dataset.pmEv === key) return;
        el.dataset.pmEv = key;
        const nominated = !!(bk.nominated_staff_id || bk.nomination_fee);
        const cname = bk.course_name || "";
        const col = cname.includes("男性") ? "purple" : cname.includes("女性") ? "red"
          : /整体|本日限定/.test(cname) ? "green" : "lime";
        el.classList.remove("lime", "purple");
        el.classList.add("pm-ev", "pm-ev-" + col);
        let l1 = "";
        if (bk.source === "hotpepper") l1 += badge("hp", "HP");
        if (bk.ticket_id) l1 += badge("tk", "券");
        if (!nominated && bk.staff === "male") l1 += badge("m", "男");
        if (!nominated && bk.staff === "female") l1 += badge("f", "女");
        if (bk.multi || (bk.people || 1) > 1) l1 += badge("multi", "複");
        if (!bk.hide_name && bk.name) l1 += esc(bk.name) + "　";
        l1 += "【" + esc(bk.booth || "新規1(1)") + "】";
        if (!bk.paid_amount) l1 += '<i class="pm-bg pm-bg-mi">未</i>';
        let l2 = "";
        if (bk.is_new !== 0) l2 += badge("new", "新");
        if (nominated) l2 += badge("nom", "指名");
        l2 += pmHM(s0) + "~" + pmHM(e0);
        const l3 = esc(bk.course_label || cname);
        el.innerHTML = '<span class="pm-ev-l1">' + l1 + '</span><span class="pm-ev-l2">' + l2 +
          '</span><span class="pm-ev-l3">' + l3 + "</span>";
      });
    });
  }

  // 予約枠のホバー詳細（会員番号〜会計情報まで本物と同じ並び）
  function showEventTip(el) {
    const d = window.__pmSchedData;
    if (!d) return;
    const date = d.__date;
    const row = el.closest(".ledger-row");
    const staffName = row?.querySelector(".ledger-staff-cell b")?.textContent || "";
    const sid = (d.staff || []).find((st) => st.name === staffName)?.id;
    const pct = parseFloat(el.style.left || "0");
    const startMin = 600 + Math.round((pct * 1020) / 100 / 5) * 5;
    const bk = (d.bookings || []).find((b) => b.status === "confirmed" &&
      (d.assignments || []).some((a) => a.booking_id === b.id && a.staff_id === sid) &&
      Math.abs(pmMin(date, b.start_at) - startMin) <= 3);
    if (!bk) return;
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const s0 = pmMin(date, bk.start_at), e0 = pmMin(date, bk.end_at);
    const tag = bk.source === "hotpepper" ? "ホットペッパー"
      : /WEB$/.test(bk.created_label || "") ? "オンライン予約" : "";
    const lines = [
      ["会員番号", ""],
      ["顧客名", bk.hide_name ? "" : bk.name || ""],
      ["ブース", bk.booth || "新規1(1)"],
      ["スタッフ", staffName + (bk.nominated_staff_name ? "（指名）" : "")],
      ["予約時間", pmHM(s0) + "〜" + pmHM(e0)],
      ["コース", bk.course_name || ""],
      ["オプション", ""],
      ["予約タグ", tag],
      ["施術タグ", ""],
      ["こだわり", ""],
      ["施術コメント", bk.comment || ""],
      ["備考1", ""],
      ["備考2", ""],
      ...(bk.ticket_id ? [["回数券", (bk.ticket_name || "") + "（残り" + (bk.ticket_left_after ?? "-") + "回）"]] : []),
      ["会計情報", bk.paid_amount ? "会計済み（" + bk.paid_amount.toLocaleString("ja-JP") + "円）" : "未会計"],
    ];
    let tip = document.getElementById("pm-evtip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "pm-evtip";
      document.body.appendChild(tip);
    }
    tip.innerHTML = lines.map(([k, v]) => esc(k) + "：" + esc(v)).join("<br/>");
    const r = el.getBoundingClientRect();
    tip.style.visibility = "hidden";
    tip.style.left = "0px";
    tip.style.top = "0px";
    const tw = tip.offsetWidth || 360;
    const th = tip.offsetHeight || 320;
    let x = r.left + r.width * 0.6;
    let y = r.bottom + 8;
    if (x + tw > window.innerWidth - 12) x = window.innerWidth - tw - 12;
    if (y + th > window.innerHeight - 12) y = Math.max(10, r.top - th - 8);
    tip.style.left = x + "px";
    tip.style.top = y + "px";
    tip.style.visibility = "visible";
  }

  // 「シフト新規登録」モーダル（本物と同じ：スタッフ選択＋開始/終了時間＋OK）
  async function openShiftAdd() {
    document.getElementById("pm-shiftadd")?.remove();
    await refreshSched(true);
    const staff = (window.__pmSchedData?.staff || []);
    const date = document.querySelector(".ledger-date-trigger time")?.getAttribute("datetime")
      || new Date(Date.now() + 32400000 - 10800000).toISOString().slice(0, 10);
    const hourOpts = Array.from({ length: 18 }, (_, i) => 10 + i)  // 10〜27時（27=翌3時）
      .map((h) => `<option value="${h}">${h}</option>`).join("");
    const minOpts = Array.from({ length: 12 }, (_, i) => i * 5)
      .map((m) => `<option value="${m}">${String(m).padStart(2, "0")}</option>`).join("");
    const wrap = document.createElement("div");
    wrap.id = "pm-shiftadd";
    wrap.innerHTML =
      '<div class="pm-sa-modal" role="dialog" aria-modal="true">' +
      '<div class="pm-sa-head"><b>シフト新規登録</b><button type="button" class="pm-sa-x" data-sa="close">✕</button></div>' +
      '<div class="pm-sa-body">' +
      '<div class="pm-sa-staffrow"><select id="pm-sa-staff">' +
      '<option value="">スタッフを選択してください</option>' +
      staff.map((st) => `<option value="${st.id}">${st.name}</option>`).join("") +
      "</select></div>" +
      '<div class="pm-sa-timerow"><span class="pm-sa-cap">開始時間</span>' +
      '<select id="pm-sa-sh">' + hourOpts + '</select><b>:</b><select id="pm-sa-sm">' + minOpts + "</select></div>" +
      '<div class="pm-sa-timerow"><span class="pm-sa-cap">終了時間</span>' +
      '<select id="pm-sa-eh">' + hourOpts + '</select><b>:</b><select id="pm-sa-em">' + minOpts + "</select></div>" +
      '<div class="pm-sa-actions"><button type="button" class="pm-sa-ok" data-sa="ok">OK</button></div>' +
      "</div></div>";
    document.body.appendChild(wrap);
    wrap.querySelector("#pm-sa-eh").value = "27"; // 既定 10:00〜27:00（本物と同じ）
    const close = () => wrap.remove();
    wrap.addEventListener("click", async (e) => {
      if (e.target === wrap || e.target.closest('[data-sa="close"]')) { close(); return; }
      if (!e.target.closest('[data-sa="ok"]')) return;
      const staffId = wrap.querySelector("#pm-sa-staff").value;
      if (!staffId) { window.alert("スタッフを選択してください。"); return; }
      const start = Number(wrap.querySelector("#pm-sa-sh").value) * 60 + Number(wrap.querySelector("#pm-sa-sm").value);
      const end = Number(wrap.querySelector("#pm-sa-eh").value) * 60 + Number(wrap.querySelector("#pm-sa-em").value);
      if (!(start < end)) { window.alert("終了時間は開始時間より後にしてください。"); return; }
      try {
        const version = (window.__pmSchedData?.days || []).find((d) => d.date === date)?.version || 0;
        const r = await fetch("/api/demo/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "bulkShift", date, cells: [{ date, staffId, revision: version }], start, end }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          window.alert(j.error === "scheduleConflict"
            ? "その時間帯の外に予約・予定が残っているため登録できません。\n（画面を再読込して最新の状態をご確認ください）"
            : "登録できませんでした。時間をご確認ください。");
          return;
        }
        close();
        window.__pmSchedAt = 0;
        await refreshSched(true);
        decorateEvents();
      } catch {
        window.alert("通信エラーが発生しました。");
      }
    });
  }

  // タップした空き枠の赤いランプ。Reactの再描画で消えても ensure() が点け直し、
  // 左パネルが閉じられたら消灯する。
  function applyTapMark() {
    const mk = window.__pmTapMark;
    const sideOpen = !!document.querySelector(".ledger-side .ledger-side-form");
    // パネルが閉じられたら消す（開き終わるまでの猶予1.5秒は残す）
    if (!mk || (!sideOpen && Date.now() - mk.t > 1500)) {
      window.__pmTapMark = null;
      document.querySelectorAll(".pm-tap-mark").forEach((el) => el.remove());
      return;
    }
    const row = [...document.querySelectorAll(".ledger-row")]
      .find((rw) => rw.querySelector(".ledger-staff-cell b")?.textContent === mk.name);
    const track = row?.querySelector(".ledger-track");
    if (!track) return;
    let el = track.querySelector(":scope > .pm-tap-mark");
    document.querySelectorAll(".pm-tap-mark").forEach((x) => { if (x !== el) x.remove(); });
    if (!el) {
      el = document.createElement("div");
      el.className = "pm-tap-mark";
      track.appendChild(el);
    }
    el.style.left = (((mk.minute - 600) / 1020) * 100) + "%";
    el.style.width = ((10 / 1020) * 100) + "%";
  }

  function decoratePanel() {
    const side = document.querySelector(".ledger-side");
    const form = document.querySelector(".ledger-side-form");
    const dl = form?.querySelector(".ledger-booking-detail");
    if (side) {
      side.classList.add("pm-side");
      const inp = side.querySelector(".ledger-side-search input");
      if (inp && inp.placeholder !== "顧客を検索") inp.placeholder = "顧客を検索";
    }
    if (form) form.classList.toggle("pm-booking", !!dl);
    const old = document.getElementById("pm-pd");
    if (!side || !form || !dl) { old?.remove(); return; }

    // dlと入力欄から現在の予約情報を読み取る
    const val = (label) => {
      const dts = [...dl.querySelectorAll("dt")];
      const i = dts.findIndex((d) => d.textContent === label);
      return i >= 0 ? dts[i].nextElementSibling : null;
    };
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const ref = (val("予約ID")?.textContent || "").trim();
    const prevDay = dateISOMinus1(form.querySelector("p time")?.getAttribute("datetime") || "");
    // 台帳データから該当予約を引き当てる（予約ID・作成日時・ブースなどの実値を使う）
    const bkRow = (window.__pmSchedData?.bookings || []).find((b) => String(b.reference) === ref);
    const bookingId = /^\d{6,}$/.test(ref) ? ref : "24725" + (ref.replace(/\D/g, "").slice(-4) || "8666");
    const createdLabel = bkRow?.created_label || prevDay + " 23:42　PC";
    const name = (val("お名前")?.textContent || "").trim();
    const menu = (val("メニュー")?.textContent || "").trim();
    // 連絡先はメール<br>電話の構造。非表示中はinnerTextの改行が失われるためノード単位で読む
    const contactParts = val("連絡先")
      ? [...val("連絡先").childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean)
      : [];
    const cEmail = contactParts.find((s2) => s2.includes("@")) || "";
    const tel = contactParts.find((s2) => /^[-\d+ ]{6,}$/.test(s2)) || "08091951969";
    const dateISO = form.querySelector("p time")?.getAttribute("datetime") || "";
    const tsel = form.querySelectorAll(".ledger-time-input select");
    const hh = String(tsel[0]?.value ?? "").padStart(2, "0");
    const mm = String(tsel[1]?.value ?? "").padStart(2, "0");
    const staffSel = form.querySelector("label select");
    const staffName = staffSel?.selectedOptions?.[0]?.textContent || "";
    

    const html =
      '<div class="pm-shoprow"><label><input type="checkbox" checked/> 自店のみ</label><button type="button" class="pm-red" data-act="none">検索</button></div>' +
      '<div class="pm-cust">' +
        '<div class="pm-cust-rank">ランク:★★★　会員番号：<br/>TEL:' + esc(tel) + "</div>" +
        '<div class="pm-cust-name"><span class="pm-gender' + (bkRow?.customer_gender === "m" ? " pm-gender-m" : "") + '">' +
        (bkRow?.customer_gender === "m" ? "♂" : "♀") + "</span> " + (esc(name) || "&nbsp;") + '<span class="pm-count">回数:1/1</span></div>' +
      "</div>" +
      '<div class="pm-icons">' +
        [["顧客", "♙", "customer"], ["カード", "▦", "none"], ["履歴", "↺", "none"], ["会計", "▤", "pay"], ["返客", "↶", "none"]]
          .map(([t, g, a]) => '<button type="button" data-act="' + a + '"><small>' + t + "</small><b>" + g + "</b></button>").join("") +
      "</div>" +
      '<div class="pm-idbox">' +
        '<div class="pm-idrow"><span>ID:' + esc(bookingId) + "<br/>" + esc(createdLabel) + "</span>" +
        '<span class="pm-idbtns"><button type="button" class="pm-red" data-act="none">完了</button><button type="button" class="pm-x" data-act="close">X</button></span></div>' +
        '<div class="pm-tabrow"><span class="pm-tab">' + (esc(name) || "予約") + '</span><button type="button" class="pm-plus" data-act="none">＋</button></div>' +
        '<div class="pm-btnrow"><button type="button" class="pm-outline" data-act="pay">精算</button><span></span><button type="button" class="pm-red" data-act="cancel">削除</button></div>' +
        '<div class="pm-btnrow"><label class="pm-mini"><input type="checkbox"/> 他店</label><button type="button" class="pm-red" data-act="none">検索</button><button type="button" class="pm-red" data-act="none">＋ 新規</button></div>' +
        '<div class="pm-dtrow"><span class="pm-cap">日時</span><b>' + esc(dateISO) + " " + hh + ":" + mm + "〜</b></div>" +
        '<div class="pm-chips"><span class="pm-chip">' + esc((bkRow?.course_label || menu).slice(0, 22)) + '</span><button type="button" class="pm-plus" data-act="none">＋</button></div>' +
        '<div class="pm-btnrow pm-right"><button type="button" class="pm-red" data-act="edit">編集</button><button type="button" class="pm-red" data-act="cancel">削除</button></div>' +
        '<table class="pm-table"><tbody>' +
          [["時間", hh + ":" + mm], ["ブース", esc(bkRow?.booth || "新規1(1)")], ["スタッフ", esc(staffName) + ' <span class="pm-star">★</span>'],
           ["コース", esc((bkRow?.course_label || menu).slice(0, 24))], ["オプション", ""],
           ...(bkRow?.ticket_id ? [["回数券", esc(bkRow.ticket_name || "") + "（残り" + (bkRow.ticket_left_after ?? "-") + "回）"]] : []),
           ["こだわり", ""],
           ["予約タグ", "TORICOM"], ["施術タグ", ""], ["施術コメント", ""]]
            .map(([k, v]) => "<tr><th>" + k + "</th><td>" + v + "</td></tr>").join("") +
        "</tbody></table>" +
        '<div class="pm-move" id="pm-move" hidden>' +
          '<div class="pm-move-title">予約の移動（成立する候補のみ）</div>' +
          '<div class="pm-move-row"><select id="pm-mv-staff"></select><select id="pm-mv-time"></select></div>' +
          '<div class="pm-btnrow pm-right"><button type="button" class="pm-red" data-act="move">移動する</button></div>' +
          '<p class="pm-move-note" id="pm-mv-note">対応メニュー・シフト・休憩・既存予約・受付停止を確認した候補だけを表示します。</p>' +
        "</div>" +
      "</div>";

    let pd = old;
    if (!pd) {
      pd = document.createElement("div");
      pd.id = "pm-pd";
      side.appendChild(pd);
      pd.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset.act;
        const buttons = [...form.querySelectorAll(".ledger-form-actions button")];
        if (act === "close") buttons.find((b) => b.textContent === "戻る")?.click();
        else if (act === "cancel") buttons.find((b) => b.textContent === "予約取消")?.click();
        else if (act === "edit") form.classList.toggle("pm-editing");
        else if (act === "move") submitMove(pd);
        else if (act === "pay") openCheckout();
        else if (act === "customer") {
          const q = new URLSearchParams({
            ref: pd.dataset.cref || "",
            name: pd.dataset.cname || "",
            tel: pd.dataset.ctel || "",
            email: pd.dataset.cemail || "",
            gender: pd.dataset.cgender || "",
            comment: pd.dataset.ccomment || "",
          });
          location.href = "/admin/customer?" + q.toString();
        }
      });
    }
    if (pd.dataset.html !== html) { pd.dataset.html = html; pd.innerHTML = html; }
    fillMoveTargets(pd, bkRow, dateISO);
    // 顧客マスタ画面へ引き継ぐ情報
    pd.dataset.cname = name;
    pd.dataset.ctel = tel;
    pd.dataset.cemail = cEmail;
    pd.dataset.cref = bookingId;
    pd.dataset.ccomment = ((val("コメント")?.textContent || "").trim() === "なし" ? "" : (val("コメント")?.textContent || "").trim());
    pd.dataset.cgender = menu.includes("女性") ? "f" : menu.includes("男性") ? "m" : "f";
  }

  // ---- 予約の移動（スタッフ振り分け） ----
  // 候補はサーバーの統一判定（対応メニュー・シフト・休憩/業務・既存予約・鍵・性別条件・人数分の空き）
  // /api/demo/move-targets が返す「実際に成立するスタッフと時間」だけを表示する
  async function fillMoveTargets(pd, bkRow, dateISO) {
    const box = pd.querySelector("#pm-move");
    if (!box) return;
    if (!bkRow || !bkRow.id || !dateISO) { box.hidden = true; return; }
    box.hidden = false;
    const version = (window.__pmSchedData?.days || []).find((d) => d.date === dateISO)?.version ?? 0;
    const key = bkRow.id + ":" + dateISO + ":" + version;
    if (pd.dataset.mvKey === key) return;
    pd.dataset.mvKey = key;
    let data = null;
    try {
      const r = await fetch(`/api/demo/move-targets?date=${dateISO}&id=${encodeURIComponent(bkRow.id)}`, { cache: "no-store" });
      if (r.ok) data = await r.json();
    } catch {}
    if (pd.dataset.mvKey !== key) return; // 別の予約に切り替わっていたら破棄
    const staffSel2 = pd.querySelector("#pm-mv-staff");
    const timeSel = pd.querySelector("#pm-mv-time");
    const note = pd.querySelector("#pm-mv-note");
    if (!data || !data.ok || !staffSel2 || !timeSel) { box.hidden = true; return; }
    pd.dataset.mvId = data.id;
    pd.dataset.mvDate = data.date;
    pd.dataset.mvDur = String(data.duration);
    if (!data.staff.length) {
      staffSel2.innerHTML = '<option value="">候補なし</option>';
      timeSel.innerHTML = "";
      staffSel2.disabled = timeSel.disabled = true;
      note.textContent = "この予約を移動できる空き候補がありません（対応メニュー・シフト・空き状況を満たすスタッフ不在）。";
      applyMoveOptionGuards(data);
      return;
    }
    staffSel2.disabled = timeSel.disabled = false;
    staffSel2.innerHTML = data.staff.map((s) =>
      '<option value="' + s.id + '"' + (s.current ? " selected" : "") + ">" +
      s.name.replace(/</g, "&lt;") + (s.current ? "（現在の担当）" : s.sameTime ? "（同時刻OK）" : "（要時間変更）") +
      "</option>").join("");
    const fillTimes = () => {
      const s = data.staff.find((x) => x.id === staffSel2.value) || data.staff[0];
      timeSel.innerHTML = s.slots.map((t) =>
        '<option value="' + t + '"' + (t === data.start ? " selected" : "") + ">" +
        pmHM(t) + "〜" + pmHM(t + data.duration) + (t === data.start ? "（現在と同時刻）" : "") +
        "</option>").join("");
      if (!s.slots.includes(data.start)) timeSel.selectedIndex = 0;
    };
    if (!staffSel2.dataset.pmMv) { staffSel2.dataset.pmMv = "1"; staffSel2.addEventListener("change", fillTimes); }
    fillTimes();
    note.textContent = "対応メニュー・シフト・休憩・既存予約・受付停止を確認した候補だけを表示します。";
    applyMoveOptionGuards(data);
  }

  // 編集フォーム側の「担当スタッフ」も、候補外（対応不可・空きなし）は選べないようにする
  function applyMoveOptionGuards(data) {
    const form = document.querySelector(".ledger-side-form.pm-booking");
    const sel = form?.querySelector("label select");
    if (!sel) return;
    const okIds = new Set(data.staff.map((s) => s.id));
    for (const op of sel.options) {
      if (!op.value) continue;
      const okOp = okIds.has(op.value);
      if (op.disabled === okOp) op.disabled = !okOp;
    }
  }

  async function submitMove(pd) {
    const staffId = pd.querySelector("#pm-mv-staff")?.value;
    const start = Number(pd.querySelector("#pm-mv-time")?.value);
    const dur = Number(pd.dataset.mvDur);
    const date = pd.dataset.mvDate;
    const id = pd.dataset.mvId;
    if (!staffId || !id || !Number.isFinite(start) || !dur) { alert("移動できる候補がありません。"); return; }
    const version = (window.__pmSchedData?.days || []).find((d) => d.date === date)?.version ?? 0;
    try {
      const r = await fetch("/api/demo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "moveBooking", date, id, staffId, start, end: start + dur, revision: version }),
      });
      const out = await r.json().catch(() => ({}));
      if (r.ok && out.ok) {
        delete pd.dataset.mvKey;
        alert("予約を移動しました。");
        document.querySelector(".ledger-side-form .ledger-form-actions button")?.parentElement
          ?.querySelectorAll("button").forEach((b) => { if (b.textContent === "戻る") b.click(); });
        await refreshSched(true);
        decorateEvents();
        return;
      }
      const msg = {
        soldOut: "その時間はご案内できません（重複・受付停止・対応外のいずれか）。",
        outsideShift: "移動先スタッフのシフト時間外です。",
        scheduleConflict: "画面の情報が古くなっています。最新の状態で再度お試しください。",
        staffUnavailable: "そのスタッフには移動できません。",
        notFound: "この予約は既に取消されています。",
      }[out.error] || "移動できませんでした。";
      alert(msg);
      delete pd.dataset.mvKey;
      await refreshSched(true);
    } catch {
      alert("通信に失敗しました。もう一度お試しください。");
    }
  }

  // 日付ピッカー：本物と同じ「予約状況カレンダー」を既存ピッカーに被せる
  // （日曜はじまり・シフト/予約の色分け・予約数・凡例。クリックは元のボタンへ転送）
  const CAL_LABEL = (d) => {
    const [y, m2, dd] = d.split("-").map(Number);
    const w = "日月火水木金土"[new Date(d + "T00:00:00Z").getUTCDay()];
    return `${y}年${m2}月${dd}日（${w}）`;
  };
  async function fetchCalData(from) {
    if (window.__pmCalFrom === from && Date.now() - (window.__pmCalAt || 0) < 8000) return window.__pmCalData;
    try {
      const r = await fetch(`/api/demo/calendar?from=${from}&days=42`, { cache: "no-store" });
      window.__pmCalData = {};
      for (const d of (await r.json()).days) window.__pmCalData[d.date] = d;
      window.__pmCalFrom = from;
      window.__pmCalAt = Date.now();
    } catch {}
    return window.__pmCalData;
  }
  function decorateCalendar() {
    const pop = document.querySelector(".ledger-date-popover");
    if (!pop) return;
    pop.classList.add("pm-cal");
    const monthLabel = pop.querySelector(".ledger-date-month b")?.textContent || "";
    const m = monthLabel.match(/(\d{4})年\s*(\d{1,2})月/);
    if (!m) return;
    const ym = `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
    let cal = pop.querySelector("#pm-caldiv");
    if (cal && cal.dataset.ym === ym && cal.dataset.data === String(window.__pmCalAt || "")) return;

    // 表示範囲：その月の1日を含む週の日曜〜6週分
    const first = new Date(ym + "-01T00:00:00Z");
    const start = new Date(first.getTime() - first.getUTCDay() * 86400000);
    const from = start.toISOString().slice(0, 10);
    fetchCalData(from).then(() => {
      const data = window.__pmCalData || {};
      const today = new Date(Date.now() + 9 * 3600e3 - 108e5).toISOString().slice(0, 10);
      const selected = [...pop.querySelectorAll(".ledger-date-days button")]
        .find((b) => b.getAttribute("aria-pressed") === "true")?.getAttribute("aria-label") || "";
      if (!cal) {
        cal = document.createElement("div");
        cal.id = "pm-caldiv";
        pop.appendChild(cal);
        cal.addEventListener("click", async (e) => {
          const nav = e.target.closest("[data-nav]")?.dataset.nav;
          if (nav) { [...pop.querySelectorAll(".ledger-date-month button")][nav === "prev" ? 0 : 1]?.click(); return; }
          const day = e.target.closest("[data-date]")?.dataset.date;
          if (!day) return;
          const find = () => [...pop.querySelectorAll(".ledger-date-days button")]
            .find((b) => b.getAttribute("aria-label") === CAL_LABEL(day));
          let btn = find();
          if (!btn) { // 範囲端の前後月の日付：月を送ってから選ぶ
            [...pop.querySelectorAll(".ledger-date-month button")][day < ym ? 0 : 1]?.click();
            await new Promise((r) => setTimeout(r, 300));
            btn = find();
          }
          if (btn && !btn.disabled) btn.click();
        });
      }
      cal.dataset.ym = ym;
      cal.dataset.data = String(window.__pmCalAt || "");
      const cells = [];
      for (let i = 0; i < 42; i++) {
        const dt = new Date(start.getTime() + i * 86400000);
        const d = dt.toISOString().slice(0, 10);
        const info = data[d] || {};
        const inMonth = d.slice(0, 7) === ym;
        const cls = ["pm-cal-day"];
        if (dt.getUTCDay() === 0) cls.push("sun");
        if (dt.getUTCDay() === 6) cls.push("sat");
        if (!inMonth) cls.push("outside");
        else if (d < today) cls.push("past");
        else if (info.shifts > 0) cls.push("green");
        if (CAL_LABEL(d) === selected) cls.push("sel");
        const stripes =
          (info.enabled ? '<i class="st-y"></i>' : "") +
          (info.bookings > 0 ? '<i class="st-r"></i>' : "");
        const count = info.bookings > 0 ? `<small>(${info.bookings})</small>` : "";
        cells.push(`<div class="${cls.join(" ")}" data-date="${d}"><b>${dt.getUTCDate()}</b>${count}${stripes}</div>`);
      }
      cal.innerHTML =
        '<div class="pm-cal-head"><button type="button" data-nav="prev">◀</button><b>' +
        `${Number(m[1])}年${Number(m[2])}月` +
        '</b><button type="button" data-nav="next">▶</button></div>' +
        '<div class="pm-cal-week">' +
        ["日", "月", "火", "水", "木", "金", "土"].map((w, i) =>
          `<span class="${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${w}</span>`).join("") +
        "</div>" +
        '<div class="pm-cal-grid">' + cells.join("") + "</div>" +
        '<div class="pm-cal-legend">' +
        '<span><i class="sq" style="background:#e8514d"></i> 予約が入っています</span>' +
        '<span><i class="sq" style="background:#c9f2a5"></i> スタッフ割り当て済みです</span>' +
        '<span><i class="sq" style="background:#f9e94e"></i> 公開されています</span>' +
        '<span><i class="sq" style="background:#aee6f8"></i> スタッフ割り当てられていません</span>' +
        '<span><i class="sq" style="background:#fff;border:1px solid #999"></i> シフト情報がありません</span>' +
        '<span><b class="pm-cal-cnt">( )</b> 予約数</span>' +
        "</div>";
      pop.classList.add("pm-cal-ready"); // 完成してから表示する（描画保留の解除）
    });
  }

  // カレンダーのデータを先読みしておき、開いた瞬間から完成状態で出せるようにする
  function prefetchCalendar() {
    const today = new Date(Date.now() + 9 * 3600e3 - 108e5).toISOString().slice(0, 10);
    const first = new Date(today.slice(0, 7) + "-01T00:00:00Z");
    const start = new Date(first.getTime() - first.getUTCDay() * 86400000);
    fetchCalData(start.toISOString().slice(0, 10));
  }
  prefetchCalendar();
  setInterval(prefetchCalendar, 7000);

  // 空き枠タップ時の左パネル：本物と同じ「開始時間／予約の登録（性別）／予約以外の登録（休憩・業務）」
  function decorateNewPanel() {
    const side = document.querySelector(".ledger-side");
    const form = side?.querySelector(".ledger-side-form");
    const old = document.getElementById("pm-np");
    if (!side || !form) { old?.remove(); return; }
    const isNew = [...form.querySelectorAll("button")].some((b) => b.textContent === "新規予約を入力");
    form.classList.toggle("pm-new", isNew);
    // 休憩・業務・新規予約などの入力フォームも、同じ茶色パネル＋白カードの見た目に統一する
    const hasPd = !!document.getElementById("pm-pd");
    form.classList.toggle("pm-form", !isNew && !hasPd);
    if (!isNew && !hasPd) side.classList.add("pm-side");
    if (!isNew) { old?.remove(); return; }
    side.classList.add("pm-side");

    const dateISO = form.querySelector("p time")?.getAttribute("datetime") || "";
    const tsel = form.querySelectorAll(".ledger-time-input select");
    const hh = String(tsel[0]?.value ?? "").padStart(2, "0");
    const mm = String(tsel[1]?.value ?? "").padStart(2, "0");
    const timeText = dateISO + " " + hh + ":" + mm;

    let np = old;
    if (!np) {
      np = document.createElement("div");
      np.id = "pm-np";
      const person = (color) =>
        '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="' + color + '" d="M12 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm-6 20v-6a6 6 0 0 1 12 0v6h-3v-6a3 3 0 0 0-6 0v6H6Z"/></svg>';
      np.innerHTML =
        '<div class="pm-np-search"><input type="text" placeholder="顧客を検索" aria-label="顧客を検索">' +
        '<div class="pm-np-searchrow"><label><input type="checkbox" checked> 自店のみ</label>' +
        '<button type="button" class="pm-red" data-np="none">検索</button></div></div>' +
        '<div class="pm-np-card">' +
        '<button type="button" class="pm-x pm-np-x" data-np="close">X</button>' +
        '<p class="pm-np-time">開始時間 <b id="pm-np-time"></b></p>' +
        '<h4 class="pm-np-bar">予約の登録</h4>' +
        '<p class="pm-np-sub">性別を選択してください</p>' +
        '<div class="pm-np-gender">' +
        '<button type="button" data-np="book">' + person("#333") + "男性</button>" +
        '<button type="button" data-np="book">' + person("#c0392b") + "女性</button>" +
        "</div>" +
        '<h4 class="pm-np-bar">予約以外の登録</h4>' +
        '<div class="pm-np-kind">' +
        '<button type="button" class="pm-red" data-np="break">休憩</button>' +
        '<button type="button" class="pm-red" data-np="work">業務</button>' +
        "</div></div>";
      form.appendChild(np);
      np.addEventListener("click", (e) => {
        const act = e.target.closest("[data-np]")?.dataset.np;
        if (!act || act === "none") return;
        const btn = (label) => [...form.querySelectorAll("button")]
          .find((b) => b.textContent === label && !b.closest("#pm-np"));
        if (act === "close") {
          [...(side || document).querySelectorAll("button")]
            .find((b) => b.textContent === "×" && !b.closest("#pm-np"))?.click();
        } else if (act === "book") btn("新規予約を入力")?.click();
        else if (act === "break") btn("休憩")?.click();
        else if (act === "work") btn("業務")?.click();
      });
    }
    const t = np.querySelector("#pm-np-time");
    if (t && t.textContent !== timeText) t.textContent = timeText;
  }

  // お会計（精算）モーダル：本物のPeakManagerと同じ構成
  function openCheckout() {
    const dl = document.querySelector(".ledger-booking-detail");
    const form = document.querySelector(".ledger-side .ledger-form") || document.querySelector(".ledger-side");
    if (!dl || !form) return;
    const val = (label) => {
      const dts = [...dl.querySelectorAll("dt")];
      const i = dts.findIndex((d) => d.textContent === label);
      return i >= 0 ? (dts[i].nextElementSibling?.textContent || "") : "";
    };
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const name = val("お名前").trim() || "ゲスト";
    const menu = val("メニュー").trim();
    const reference = val("予約ID").trim();
    const total0 = Number(val("現在の合計").replace(/[^\d]/g, "")) || 0;
    const staffSel = form.querySelector("label select");
    const staffName = staffSel?.selectedOptions?.[0]?.textContent || "";
    const dateISO = form.querySelector("p time")?.getAttribute("datetime") || "";
    const fmt = (n) => Number(n).toLocaleString("ja-JP");

    document.getElementById("pm-checkout")?.remove();
    const wrap = document.createElement("div");
    wrap.id = "pm-checkout";
    const payRows = ["回数券利用", "ポイント利用", "プリペイド利用", "電子マネー利用", "クレジット利用", "商品券利用"];
    wrap.innerHTML =
      '<section role="dialog" aria-modal="true">' +
      '<header class="pm-co-head"><b>' + esc(name) + '</b><button type="button" class="pm-co-x" data-co="close">×</button></header>' +
      '<div class="pm-co-body">' +
        '<div class="pm-co-left">' +
          '<div class="pm-co-cart">' +
            '<h3><span class="pm-co-carticon">🛒</span> お会計</h3>' +
            '<table class="pm-co-table"><thead><tr><th>施術内容</th><th>スタッフ</th><th>金額</th><th>値引</th></tr></thead>' +
            "<tbody><tr><td>" + esc(menu) + "</td><td>" + esc(staffName) + '</td><td class="pm-co-price">' + fmt(total0) + ' 円</td>' +
            '<td><span class="pm-co-in"><input type="number" id="pm-co-disc" value="0" min="0"> 円</span></td></tr></tbody></table>' +
            '<div class="pm-co-sumrow"><span class="pm-co-in pm-co-bulk"><label>施術一括値引</label><input type="number" id="pm-co-bulkdisc" value="0" min="0"> 円</span>' +
            '<span class="pm-co-subtotal">施術合計金額 <b id="pm-co-sub">' + fmt(total0) + ' 円</b></span></div>' +
          "</div>" +
          '<div class="pm-co-add"><h3><span class="pm-co-carticon">🛒</span> お会計追加</h3>' +
          '<div class="pm-co-tab">物販販売</div><div class="pm-co-addspace"></div></div>' +
        "</div>" +
        '<div class="pm-co-right">' +
          '<div class="pm-co-row pm-co-total"><span>合計金額</span><b id="pm-co-total">' + fmt(total0) + ' 円</b></div>' +
          payRows.map((r) =>
            '<div class="pm-co-row"><span>' + r + '</span><span><span class="pm-co-in dark"><span>-</span><input type="number" value="0" min="0" class="pm-co-pay"></span><span class="pm-co-yen">円</span></span></div>').join("") +
          '<div class="pm-co-row"><span>EPARKサービス</span><span><span class="pm-co-in dark ro"><span>-</span><input type="number" value="0" disabled></span><span class="pm-co-yen">円</span></span></div>' +
          '<div class="pm-co-bottom">' +
            '<div class="pm-co-row pm-co-cash"><span>現金支払額</span><b id="pm-co-cash">' + fmt(total0) + ' 円</b></div>' +
            '<div class="pm-co-row"><span>お預かり</span><span><span class="pm-co-in dark"><input type="number" id="pm-co-deposit" value="0" min="0"></span><span class="pm-co-yen">円</span></span></div>' +
          "</div>" +
        "</div>" +
      "</div>" +
      '<footer class="pm-co-foot"><button type="button" class="pm-co-cancel" data-co="close">キャンセル</button>' +
      '<button type="button" class="pm-co-ok" data-co="pay">会計</button></footer>' +
      "</section>";
    document.body.appendChild(wrap);

    const recalc = () => {
      const disc = Number(wrap.querySelector("#pm-co-disc").value) || 0;
      const bulk = Number(wrap.querySelector("#pm-co-bulkdisc").value) || 0;
      const sub = Math.max(0, total0 - disc - bulk);
      const used = [...wrap.querySelectorAll(".pm-co-pay")].reduce((s, i) => s + (Number(i.value) || 0), 0);
      wrap.querySelector("#pm-co-sub").textContent = fmt(sub) + " 円";
      wrap.querySelector("#pm-co-total").textContent = fmt(sub) + " 円";
      wrap.querySelector("#pm-co-cash").textContent = fmt(Math.max(0, sub - used)) + " 円";
      return { sub, cash: Math.max(0, sub - used) };
    };
    wrap.addEventListener("input", recalc);
    wrap.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-co]")?.dataset.co;
      if (!act) { if (e.target === wrap) wrap.remove(); return; }
      if (act === "close") { wrap.remove(); return; }
      if (act === "pay") {
        const { sub } = recalc();
        try {
          const r = await fetch("/api/demo/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "checkout", date: dateISO, reference, amount: sub }),
          });
          if (!r.ok) throw new Error();
          wrap.remove();
          window.alert("会計を登録しました（デモ）：" + fmt(sub) + "円");
        } catch {
          window.alert("会計を登録できませんでした。");
        }
      }
    });
  }

  // 月間シフト作成画面：本物と同じツールバー（一括作成・シフト作成・変更/削除・出力）を組み込む
  function decorateMonth() {
    const month = document.querySelector(".ledger-month");
    document.body.classList.toggle("pm-month-on", !!month);
    if (!month) { document.getElementById("pm-month-title")?.remove(); return; }
    month.classList.add("pm-month");

    // 黄色いタイトルバー
    if (!document.getElementById("pm-month-title")) {
      const t = document.createElement("div");
      t.id = "pm-month-title";
      t.textContent = "月間シフト作成/目標設定";
      month.insertAdjacentElement("afterbegin", t);
    }

    // 見出し行の◀▶を「前月」「翌月」ピルに
    const heading = month.querySelector(".ledger-month-heading");
    if (heading) {
      const btns = [...heading.querySelectorAll("button")];
      const prev = btns.find((b) => b.textContent === "◀" || b.textContent === "前月");
      const next = btns.find((b) => b.textContent === "▶" || b.textContent === "翌月");
      if (prev && prev.textContent !== "前月") prev.textContent = "前月";
      if (next && next.textContent !== "翌月") next.textContent = "翌月";
      prev?.classList.add("pm-pill", "pm-prev");
      next?.classList.add("pm-pill");
      const create = heading.querySelector(".ledger-create");
      if (create) create.style.display = "none"; // 実体は残し、緑/青ボタンから呼ぶ

      if (!document.getElementById("pm-month-tools")) {
        // 左：目標保存＋「n人分・スタッフ・一括作成」の枠
        const left = document.createElement("div");
        left.id = "pm-month-left";
        const goal = document.createElement("button");
        goal.type = "button"; goal.className = "pm-red"; goal.textContent = "目標保存";
        goal.title = "デモ版では使用できません";
        const grp = document.createElement("span");
        grp.id = "pm-bulk-group";
        const cnt = document.createElement("select");
        cnt.id = "pm-bulk-count";
        cnt.innerHTML = [1, 2, 3, 4, 5].map((n) => `<option>${n}</option>`).join("");
        const sel = document.createElement("select");
        sel.id = "pm-bulk-staff";
        const bulk = document.createElement("button");
        bulk.type = "button"; bulk.className = "pm-red"; bulk.textContent = "一括作成";
        bulk.title = "選んだスタッフの1か月分のマスをまとめて選択します";
        bulk.addEventListener("click", () => {
          const name = sel.value;
          const table = month.querySelector("table");
          if (!table) return;
          const heads = [...table.querySelectorAll("thead th")].map((th) => th.childNodes[0]?.textContent || th.textContent);
          table.querySelectorAll("tbody tr").forEach((tr) => {
            [...tr.children].forEach((td, i) => {
              if (i === 0) return;
              if (name !== "全員" && heads[i] !== name) return;
              const cb = td.querySelector('input[type="checkbox"]');
              if (cb && !cb.checked) cb.click();
            });
          });
        });
        grp.append(cnt, " 人分 ", sel, " ", bulk);
        left.append(goal, grp);
        heading.appendChild(left);
        // 右：シフト作成（緑）／ヘルプ作成（赤）／シフト変更・削除（青）
        const bar = document.createElement("div");
        bar.id = "pm-month-tools";
        const mkBtn = (label, cls, fn, deco) => {
          const b = document.createElement("button");
          b.type = "button"; b.className = cls; b.textContent = label;
          if (fn) b.addEventListener("click", fn);
          if (deco) b.title = "デモ版では使用できません";
          return b;
        };
        const openModal = () => month.querySelector(".ledger-create")?.click();
        bar.append(mkBtn("シフト作成", "pm-green", openModal),
          mkBtn("ヘルプ作成", "pm-red", null, true),
          mkBtn("シフト変更・削除", "pm-blue", openModal));
        heading.appendChild(bar);
      }
      // スタッフ選択肢を最新化
      const sel = document.getElementById("pm-bulk-staff");
      if (sel && window.__pmLocks) {
        const names = ["全員", ...Object.keys(window.__pmLocks)];
        if (sel.options.length !== names.length) {
          sel.innerHTML = names.map((n) => `<option>${n}</option>`).join("");
        }
      }
    }

    // 表：本物と同じ「日次予算(目標)・目標コメント」列を追加し、日付表記を合わせる
    const headRow = month.querySelector("thead tr");
    if (headRow && !headRow.querySelector(".pm-goal-th")) {
      const budget = document.createElement("th");
      budget.className = "pm-goal-th"; budget.textContent = "日次予算(目標)";
      const comment = document.createElement("th");
      comment.className = "pm-goal-th"; comment.textContent = "目標コメント";
      headRow.children[0].after(budget, comment);
    }
    month.querySelectorAll("tbody tr").forEach((tr) => {
      if (!tr.querySelector(".pm-goal")) {
        const budget = document.createElement("td");
        budget.className = "pm-goal";
        budget.innerHTML = '<input type="text" inputmode="numeric" value="0" title="日次予算（デモ）">';
        const comment = document.createElement("td");
        comment.className = "pm-goal";
        comment.innerHTML = '<input type="text" title="目標コメント（デモ）">';
        tr.children[0].after(budget, comment);
      }
      // 「9月26日（土）」→「09月26日 (土)」
      const th = tr.querySelector("th");
      if (th) {
        for (const n of th.childNodes) {
          if (n.nodeType !== 3) continue;
          if (/^\d{1,2}$/.test(n.textContent)) n.textContent = n.textContent.padStart(2, "0");
          else if (n.textContent === "日（") n.textContent = "日 (";
          else if (n.textContent === "）") n.textContent = ")";
        }
      }
    });

    // セルの時間表記を本物と同じ「10:00-22:00」に
    month.querySelectorAll("tbody label").forEach((l) => {
      for (const n of l.childNodes) {
        if (n.nodeType === 3 && n.textContent.includes("〜")) n.textContent = n.textContent.replace("〜", "-");
      }
    });

    // 下部の操作列（目標保存・シフト作成・シフト出力）
    if (!document.getElementById("pm-month-bottom")) {
      const bar = document.createElement("div");
      bar.id = "pm-month-bottom";
      const mk = (label, cls, fn, deco) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = cls; b.textContent = label;
        if (fn) b.addEventListener("click", fn);
        if (deco) b.title = "デモ版では使用できません";
        return b;
      };
      bar.append(
        mk("目標保存", "pm-red", null, true),
        mk("シフト作成", "pm-green", () => month.querySelector(".ledger-create")?.click()),
        mk("シフト出力", "pm-orange", exportShiftsCsv),
      );
      month.appendChild(bar);
    }

    // 一括登録モーダル：タイトルを本物に合わせ、「削除」ボタンを追加
    const modal = [...document.querySelectorAll(".ledger-modal")].find((m) => m.textContent.includes("シフト登録（"));
    if (modal) {
      const h2 = modal.querySelector("h2");
      if (h2 && !h2.dataset.pmKeep) h2.insertAdjacentHTML("beforebegin",
        '<div class="pm-modal-note"><b>シフト一括登録</b><span>選択したスタッフのシフトを一括登録します。</span></div>');
      if (h2) h2.dataset.pmKeep = "1";
      const actions = modal.querySelector(".ledger-form-actions");
      if (actions && !actions.querySelector(".pm-bulk-del")) {
        const del = document.createElement("button");
        del.type = "button"; del.className = "pm-red pm-bulk-del"; del.textContent = "削除";
        del.title = "選択した枠のシフトを削除します（休憩・業務も一緒に削除。予約が残る日は削除できません）";
        del.addEventListener("click", async () => {
          if (!window.confirm("選択した枠のシフトを削除しますか？")) return;
          const cells = [...document.querySelectorAll('.ledger-month tbody input[type="checkbox"]:checked')]
            .map((cb) => (cb.getAttribute("aria-label") || "").split(" "))
            .filter((a) => a.length >= 2);
          if (!cells.length) return;
          try {
            const today = new Date(Date.now() + 9 * 3600e3 - 108e5).toISOString().slice(0, 10);
            const sched = await (await fetch("/api/demo/schedule?date=" + cells[0][0], { cache: "no-store" })).json();
            const rev = {};
            for (const d of sched.days) rev[d.date] = d.version;
            const ids = {};
            for (const st of sched.staff) ids[st.name] = st.id;
            const payload = {
              action: "bulkShift", remove: true, date: today, revision: 0,
              cells: cells.map(([d, ...n]) => ({ date: d, staffId: ids[n.join(" ")], revision: rev[d] ?? 0 })),
            };
            const r = await fetch("/api/demo/schedule", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error);
            [...modal.querySelectorAll("button")].find((b) => b.textContent === "閉じる")?.click();
            // 選択を解除する（画面は数秒以内の自動再取得で最新になる）
            document.querySelectorAll('.ledger-month tbody input:checked').forEach((cb) => cb.click());
          } catch (e) {
            alert(e.message === "scheduleConflict"
              ? "お客様の予約が残っている日が含まれているため削除できませんでした。"
              : "削除できませんでした。");
          }
        });
        actions.insertBefore(del, actions.lastElementChild);
      }
    }
  }

  // 店舗情報：予約フォームのフリーメッセージ欄の設定（保存すると予約サイトへ即時反映）
  async function openShopSettings() {
    document.getElementById("pm-shop-modal")?.remove();
    let st = {};
    try { st = await (await fetch("/api/demo/settings", { cache: "no-store" })).json(); } catch {}
    const s = st.freeMessage || { visible: true, required: false, label: "", placeholder: "", description: "", maxLength: 2000 };
    const m = st.shopMaster || {};
    const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    const ro = (v) => '<input type="text" value="' + esc(v) + '" readonly class="pm-sm-ro">';
    // 10:00〜27:00 を30分刻みで選ぶ時刻セレクト（値は分）
    const timeSel = (id2, cur) => '<select id="' + id2 + '">' +
      Array.from({ length: 35 }, (_, i) => 600 + i * 30).map((v) =>
        '<option value="' + v + '"' + (v === cur ? " selected" : "") + '>' +
        Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0') + '</option>').join("") + '</select>';
    const inp = (id, v) => '<input type="text" id="' + id + '" value="' + esc(v) + '">';
    const PREFS = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
    const wrap = document.createElement("div");
    wrap.id = "pm-shop-modal";
    wrap.innerHTML =
      '<section role="dialog" aria-modal="true" class="pm-sm-dialog">' +
      '<div class="pm-sm-head"><b>店舗マスタ</b></div>' +
      '<div class="pm-sm-body">' +
      '<div class="pm-sm-grid">' +
        '<div class="pm-sm-l">企業ID</div><div class="pm-sm-v">' + ro(m.companyId) + '</div>' +
        '<div class="pm-sm-l">エリアID</div><div class="pm-sm-v">' + ro(m.areaId) + '</div>' +
        '<div class="pm-sm-l">店舗ID</div><div class="pm-sm-v">' + ro(m.shopId) + '</div>' +
        '<div class="pm-sm-l">店舗コード</div><div class="pm-sm-v">' + inp("pm-sm-shopCode", m.shopCode) + '</div>' +
        '<div class="pm-sm-l">店舗名<i>*</i></div><div class="pm-sm-v">' + inp("pm-sm-name", m.name) + '</div>' +
        '<div class="pm-sm-l">店舗名略称<i>*</i></div><div class="pm-sm-v">' + inp("pm-sm-shortName", m.shortName) + '</div>' +
        '<div class="pm-sm-l">郵便番号</div><div class="pm-sm-v">' + inp("pm-sm-zip", m.zip) + '</div>' +
        '<div class="pm-sm-l">都道府県<i>*</i></div><div class="pm-sm-v"><select id="pm-sm-pref">' +
          PREFS.map((p2) => '<option' + (p2 === (m.pref || "東京都") ? " selected" : "") + '>' + p2 + '</option>').join("") + '</select></div>' +
        '<div class="pm-sm-l">市区町村番地<i>*</i></div><div class="pm-sm-v pm-sm-wide">' + inp("pm-sm-address", m.address) + '</div>' +
        '<div class="pm-sm-l">住所2</div><div class="pm-sm-v pm-sm-wide">' + inp("pm-sm-address2", m.address2) + '</div>' +
        '<div class="pm-sm-l">電話番号</div><div class="pm-sm-v">' + inp("pm-sm-tel", m.tel) + '</div>' +
        '<div class="pm-sm-l">FAX番号</div><div class="pm-sm-v">' + inp("pm-sm-fax", m.fax) + '</div>' +
        '<div class="pm-sm-l">メールアドレス</div><div class="pm-sm-v pm-sm-wide">' + inp("pm-sm-email", m.email) + '</div>' +
        '<div class="pm-sm-l">ホームページURL</div><div class="pm-sm-v pm-sm-wide">' + inp("pm-sm-homepage", m.homepage) + '</div>' +
        '<div class="pm-sm-l">担当部署</div><div class="pm-sm-v">' + inp("pm-sm-department", m.department) + '</div>' +
        '<div class="pm-sm-l">担当者名</div><div class="pm-sm-v">' + inp("pm-sm-manager", m.manager) + '</div>' +
        '<div class="pm-sm-l">背景色設定</div><div class="pm-sm-v pm-sm-wide pm-sm-radios">' +
          '<label><input type="radio" name="pm-sm-bg" value="black"' + (m.bgColor === "black" ? " checked" : "") + '> ブラック</label>' +
          '<label><input type="radio" name="pm-sm-bg" value="brown"' + (m.bgColor !== "black" ? " checked" : "") + '> ブラウン（デフォルト）</label>' +
        '</div>' +
      '</div>' +
      // 折りたたみ（実物と同じ見出し。「予約用ホームページ」にフリーメッセージ設定が入っている）
      '<details class="pm-sm-acc" open><summary>業務設定</summary><div class="pm-biz">' +
        '<div class="pm-biz-grid">' +
        '<div class="pm-sm-l">業務開始時間<i>*</i></div><div class="pm-sm-v">' + timeSel("pm-bz-bizStart", m.bizStart ?? 600) + '</div>' +
        '<div class="pm-sm-l">業務終了時間<i>*</i></div><div class="pm-sm-v">' + timeSel("pm-bz-bizEnd", m.bizEnd ?? 1620) + '</div>' +
        '<div class="pm-sm-l">営業開始時間<i>*</i></div><div class="pm-sm-v">' + timeSel("pm-bz-openStart", m.openStart ?? 600) + '</div>' +
        '<div class="pm-sm-l">営業終了時間<i>*</i></div><div class="pm-sm-v">' + timeSel("pm-bz-openEnd", m.openEnd ?? 1620) + '</div>' +
        '<div class="pm-sm-l">予約開始時間<i>*</i></div><div class="pm-sm-v">' + timeSel("pm-bz-resStart", m.resStart ?? 600) + '</div>' +
        '<div class="pm-sm-l">予約締切時間<i>*</i></div><div class="pm-sm-v">' + timeSel("pm-bz-resEnd", m.resEnd ?? 1560) + '</div>' +
        '<div class="pm-sm-l">営業日切り替え時間</div><div class="pm-sm-v pm-sm-wide"><select id="pm-bz-daySwitch">' +
          [24,25,26,27,28,29,30].map((h) => '<option value="' + h + '"' + (h === (m.daySwitch ?? 30) ? " selected" : "") + '>' + h + '</option>').join("") + '</select></div>' +
        '<div class="pm-sm-l">時間表示単位</div><div class="pm-sm-v pm-sm-wide pm-sm-radios">' +
          '<label><input type="radio" name="pm-bz-unit" value="basic"' + (m.timeUnit === "basic" ? " checked" : "") + '> 基本</label>' +
          '<label><input type="radio" name="pm-bz-unit" value="all"' + (m.timeUnit !== "basic" ? " checked" : "") + '> 全体</label>' +
        '</div>' +
        '</div>' +
        '<p class="pm-sm-note">予約開始〜予約締切は予約サイトの受付枠に、営業開始〜終了は予約台帳の営業時間帯（外側はグレー表示）に即時反映されます。</p>' +
      '</div></details>' +
      '<details class="pm-sm-acc" open><summary>会員番号の発行処理</summary><div class="pm-biz"><div class="pm-biz-grid">' +
        '<div class="pm-sm-l">会員番号の自動発行</div><div class="pm-sm-v pm-sm-wide">' + ro(m.memberAuto ?? "無効") + '</div>' +
        '<div class="pm-sm-l">会員番号の桁数</div><div class="pm-sm-v">' + ro(m.memberDigits ?? "3") + '</div>' +
        '<div class="pm-sm-l">会員番号次の番号</div><div class="pm-sm-v">' + ro(m.memberNext ?? "1") + '</div>' +
      '</div></div></details>' +
      '<details class="pm-sm-acc" id="pm-sm-hp"><summary>予約用ホームページ</summary>' +
        '<div class="pm-sm-fm">' +
        '<p class="pm-shop-sub">予約フォームの「フリーメッセージ（ご要望・ご相談）」欄の設定です。保存すると予約サイトに即時反映されます。</p>' +
        '<label class="pm-shop-check"><input type="checkbox" id="pm-fm-visible"> 入力欄を表示する</label>' +
        '<label class="pm-shop-check"><input type="checkbox" id="pm-fm-required"> 入力を必須にする</label>' +
        '<label>見出し（空欄なら標準の文言）<input type="text" id="pm-fm-label" maxlength="60"></label>' +
        '<label>入力欄のヒント（placeholder）<input type="text" id="pm-fm-placeholder" maxlength="200"></label>' +
        '<label>説明文（欄の下に表示）<input type="text" id="pm-fm-description" maxlength="300"></label>' +
        '<label>文字数制限（1〜2000）<input type="number" id="pm-fm-maxlength" min="1" max="2000"></label>' +
        '<div class="pm-shop-actions"><button type="button" class="pm-red" id="pm-fm-save">保存</button></div>' +
        '</div></details>' +
      '<details class="pm-sm-acc"><summary>オンライン予約・店舗通知</summary><p class="pm-sm-note">デモ版ではこの項目の設定はありません。</p></details>' +
      '<details class="pm-sm-acc"><summary>店舗サマリ</summary><p class="pm-sm-note">デモ版ではこの項目の設定はありません。</p></details>' +
      '<div class="pm-shop-actions"><button type="button" id="pm-fm-close">閉じる</button></div>' +
      '</div></section>';
    document.body.appendChild(wrap);
    const g = (id) => wrap.querySelector("#" + id);
    g("pm-fm-visible").checked = s.visible !== false;
    g("pm-fm-required").checked = s.required === true;
    g("pm-fm-label").value = s.label || "";
    g("pm-fm-placeholder").value = s.placeholder || "";
    g("pm-fm-description").value = s.description || "";
    g("pm-fm-maxlength").value = s.maxLength || 2000;
    const close = () => wrap.remove();
    g("pm-fm-close").addEventListener("click", close);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    // 店舗マスタの編集は自動保存（入力から少し待って送信）
    let smTimer = 0;
    const saveShop = () => {
      clearTimeout(smTimer);
      smTimer = setTimeout(() => {
        const body = { shopMaster: {
          shopCode: g("pm-sm-shopCode").value, name: g("pm-sm-name").value, shortName: g("pm-sm-shortName").value,
          zip: g("pm-sm-zip").value, pref: g("pm-sm-pref").value,
          address: g("pm-sm-address").value, address2: g("pm-sm-address2").value,
          tel: g("pm-sm-tel").value, fax: g("pm-sm-fax").value,
          email: g("pm-sm-email").value, homepage: g("pm-sm-homepage").value,
          department: g("pm-sm-department").value, manager: g("pm-sm-manager").value,
          bgColor: wrap.querySelector('input[name="pm-sm-bg"]:checked')?.value || "brown",
          bizStart: Number(g("pm-bz-bizStart").value), bizEnd: Number(g("pm-bz-bizEnd").value),
          openStart: Number(g("pm-bz-openStart").value), openEnd: Number(g("pm-bz-openEnd").value),
          resStart: Number(g("pm-bz-resStart").value), resEnd: Number(g("pm-bz-resEnd").value),
          daySwitch: Number(g("pm-bz-daySwitch").value),
          timeUnit: wrap.querySelector('input[name="pm-bz-unit"]:checked')?.value || "all",
        } };
        fetch("/api/demo/settings", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body) })
          .then(() => refreshShop(true))
          .then(() => applyBizShade())
          .catch(() => {});
      }, 500);
    };
    wrap.querySelectorAll(".pm-sm-grid input:not(.pm-sm-ro), .pm-sm-grid select, .pm-biz select, .pm-biz input[type=radio]").forEach((el) => {
      el.addEventListener("input", saveShop);
      el.addEventListener("change", saveShop);
    });
    g("pm-fm-save").addEventListener("click", async () => {
      try {
        const r = await fetch("/api/demo/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            freeMessage: {
              visible: g("pm-fm-visible").checked,
              required: g("pm-fm-required").checked,
              label: g("pm-fm-label").value,
              placeholder: g("pm-fm-placeholder").value,
              description: g("pm-fm-description").value,
              maxLength: Number(g("pm-fm-maxlength").value) || 2000,
            },
          }),
        });
        if (!r.ok) throw new Error();
        window.alert("保存しました。予約サイトのフリーメッセージ欄に反映されます。");
      } catch {
        window.alert("保存できませんでした。接続を確認して再度お試しください。");
      }
    });
  }

  // ログイン中アカウントの情報（1回だけ取得して使い回す）
  let pmWhoamiP = null;
  function getWhoami() {
    if (!pmWhoamiP) {
      pmWhoamiP = fetch("/api/demo/whoami", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ user: null }));
    }
    return pmWhoamiP;
  }

  // 店舗情報：ユーザ情報（アカウント管理）。管理者のみ（サーバー側でも権限を強制）
  async function openAccountAdmin() {
    const me = await getWhoami();
    if (me.role !== "admin") { window.alert("アカウント管理は管理者のみ使用できます。"); return; }
    document.getElementById("pm-account-modal")?.remove();
    const wrap = document.createElement("div");
    wrap.id = "pm-account-modal";
    wrap.innerHTML =
      '<section role="dialog" aria-modal="true">' +
      "<h2>店舗マスタ｜ユーザ情報（アカウント管理）</h2>" +
      '<p class="pm-shop-sub">スタッフが自分の端末（MacBook・iPhone・iPad・Windows等）からログインするためのアカウントを管理します。権限は「管理者＞マネージャー＞スタッフ」の3段階で、操作できる範囲はサーバー側で必ず検証されます。</p>' +
      '<div class="pm-menu-new">' +
      '<input type="text" id="pm-ac-user" placeholder="ログインID（半角英数4〜20）" maxlength="20">' +
      '<input type="text" id="pm-ac-name" placeholder="表示名" maxlength="40">' +
      '<input type="password" id="pm-ac-pass" placeholder="パスワード（8文字以上）" maxlength="60">' +
      '<select id="pm-ac-role"><option value="staff">スタッフ</option><option value="manager">マネージャー</option><option value="admin">管理者</option></select>' +
      '<button type="button" class="pm-red" id="pm-ac-add">追加</button>' +
      "</div>" +
      '<div class="pm-ac-list">読み込み中…</div>' +
      '<h3 class="pm-tk-h">認証ログ（直近）</h3>' +
      '<div class="pm-ac-log">読み込み中…</div>' +
      '<div class="pm-shop-actions"><button type="button" id="pm-ac-close">閉じる</button></div>' +
      "</section>";
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector("#pm-ac-close").addEventListener("click", close);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    const ERRS = {
      badUser: "ログインIDは半角英数・-・_ の4〜20文字にしてください。",
      userExists: "そのログインIDは既に使われています。",
      shortPass: "パスワードは8文字以上にしてください。",
      badRole: "権限の指定が不正です。",
      lastAdmin: "有効な管理者が最後の1人になるため、この変更はできません。",
      notFound: "対象のアカウントが見つかりません。",
    };
    const api = async (body) => {
      const r = await fetch("/api/demo/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j2 = await r.json().catch(() => ({}));
      if (!r.ok) { window.alert(ERRS[j2.error] || "操作に失敗しました。"); return null; }
      return j2;
    };
    async function loadAccounts() {
      try {
        const d = await (await fetch("/api/demo/accounts", { cache: "no-store" })).json();
        const rows = (d.accounts || []).map((a) =>
          '<tr data-user="' + esc(a.user) + '"><td><b>' + esc(a.user) + "</b>" + (a.user === me.user ? "（自分）" : "") + "</td>" +
          "<td>" + esc(a.name) + "</td>" +
          '<td><select class="ac-role">' +
          ["staff", "manager", "admin"].map((r2) =>
            '<option value="' + r2 + '"' + (a.role === r2 ? " selected" : "") + ">" +
            ({ staff: "スタッフ", manager: "マネージャー", admin: "管理者" }[r2]) + "</option>").join("") +
          "</select></td>" +
          "<td>" + (a.active ? "有効" : "<b>停止中</b>") + "</td>" +
          '<td><button type="button" class="ac-toggle">' + (a.active ? "停止" : "再開") + "</button> " +
          '<button type="button" class="ac-pass">パスワード再設定</button> ' +
          '<button type="button" class="ac-del">削除</button></td></tr>');
        wrap.querySelector(".pm-ac-list").innerHTML =
          '<table class="pm-tk-table"><thead><tr><th>ログインID</th><th>表示名</th><th>権限</th><th>状態</th><th></th></tr></thead><tbody>' +
          rows.join("") + "</tbody></table>";
        wrap.querySelector(".pm-ac-log").innerHTML = (d.authLog || []).length
          ? '<div class="pm-ac-lograw">' + d.authLog.map((l) => {
              const t = new Date(l.at + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ");
              if (l.kind === "login") return esc(t) + "　ログイン" + (l.ok ? "成功" : (l.reason === "locked" ? "ロック中" : "失敗")) + "　" + esc(l.user || "(未入力)");
              if (l.kind === "api") return esc(t) + "　権限外アクセス拒否　" + esc(l.user || "(未ログイン)") + "　" + esc(l.path || "");
              if (l.kind === "account") return esc(t) + "　アカウント" + ({ add: "追加", update: "変更", delete: "削除" }[l.op] || l.op) + "　" + esc(l.target) + "（操作者:" + esc(l.by) + "）";
              return esc(t);
            }).join("<br>") + "</div>"
          : '<p class="pm-tk-empty">記録はまだありません。</p>';
      } catch { wrap.querySelector(".pm-ac-list").textContent = "読み込みに失敗しました"; }
    }
    loadAccounts();
    wrap.querySelector("#pm-ac-add").addEventListener("click", async () => {
      const body = {
        action: "add",
        user: wrap.querySelector("#pm-ac-user").value.trim(),
        name: wrap.querySelector("#pm-ac-name").value.trim(),
        pass: wrap.querySelector("#pm-ac-pass").value,
        role: wrap.querySelector("#pm-ac-role").value,
      };
      if (await api(body)) {
        ["#pm-ac-user", "#pm-ac-name", "#pm-ac-pass"].forEach((s) => { wrap.querySelector(s).value = ""; });
        loadAccounts();
      }
    });
    wrap.addEventListener("change", async (e) => {
      const row = e.target.closest("tr[data-user]");
      if (row && e.target.classList.contains("ac-role")) {
        if (!(await api({ action: "update", user: row.dataset.user, role: e.target.value }))) loadAccounts();
      }
    });
    wrap.addEventListener("click", async (e) => {
      const row = e.target.closest("tr[data-user]");
      if (!row) return;
      const user = row.dataset.user;
      if (e.target.classList.contains("ac-toggle")) {
        const on = e.target.textContent === "再開";
        if (!on && !window.confirm(user + " を停止しますか？（この端末を含む全端末で即時ログインできなくなります）")) return;
        if (await api({ action: "update", user, active: on })) loadAccounts();
      } else if (e.target.classList.contains("ac-pass")) {
        const p2 = window.prompt(user + " の新しいパスワード（8文字以上）を入力してください。");
        if (p2 === null) return;
        if (await api({ action: "update", user, pass: p2 })) window.alert("パスワードを変更しました。");
      } else if (e.target.classList.contains("ac-del")) {
        if (!window.confirm(user + " を削除しますか？（元に戻せません）")) return;
        if (await api({ action: "delete", user })) loadAccounts();
      }
    });
  }

  // 店舗情報：回数券管理（プランの作成・編集・公開と、顧客保有券の残数・履歴・調整）
  async function openTicketAdmin() {
    document.getElementById("pm-ticket-modal")?.remove();
    const wrap = document.createElement("div");
    wrap.id = "pm-ticket-modal";
    wrap.innerHTML =
      '<section role="dialog" aria-modal="true">' +
      "<h2>店舗マスタ｜回数券管理</h2>" +
      '<p class="pm-shop-sub">回数券の作成・編集・公開/非公開と、お客様が保有する回数券の残り回数・利用履歴の確認ができます。残数の手動変更は必ず履歴に残ります。</p>' +
      "<h3 class=\"pm-tk-h\">回数券プラン</h3>" +
      '<div class="pm-menu-new">' +
      '<input type="text" id="pm-tk-name" placeholder="回数券の名称（例：回数券 5回券）" maxlength="120">' +
      '<input type="number" id="pm-tk-price" placeholder="価格(円)" min="0" step="100">' +
      '<input type="number" id="pm-tk-uses" placeholder="回数" min="1" max="200">' +
      '<span class="pm-tk-fixed">有効期限：購入日から1年間（自動）</span>' +
      '<button type="button" class="pm-red" id="pm-tk-add">追加</button>' +
      "</div>" +
      '<div class="pm-tk-plans">読み込み中…</div>' +
      "<h3 class=\"pm-tk-h\">お客様の保有回数券</h3>" +
      '<div class="pm-tk-list">読み込み中…</div>' +
      '<div class="pm-shop-actions"><button type="button" id="pm-tk-close">閉じる</button></div>' +
      "</section>";
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector("#pm-tk-close").addEventListener("click", close);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    const jd = (v) => {
      if (!v) return "";
      const ms = typeof v === "number" ? v : Date.parse(v);
      return new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
    };

    async function loadPlans() {
      const box = wrap.querySelector(".pm-tk-plans");
      try {
        const plans = (await (await fetch("/api/demo/ticket-plans", { cache: "no-store" })).json()).plans || [];
        box.innerHTML = plans.length ? plans.map((p2) =>
          '<div class="pm-menu-item" data-plan="' + esc(p2.id) + '">' +
          '<input type="text" class="tk-name" value="' + esc(p2.name) + '" maxlength="120">' +
          '<input type="number" class="tk-price" value="' + p2.price + '" min="0" step="100">' +
          '<input type="number" class="tk-uses" value="' + p2.uses + '" min="1" max="200" title="回数">' +
          '<span class="pm-tk-cap">' + p2.uses + "回／有効期限：購入日から1年間</span>" +
          '<label class="pm-tk-pub"><input type="checkbox" class="tk-active"' + (p2.active ? " checked" : "") + "> 公開</label>" +
          '<button type="button" class="pm-red tk-save">変更</button>' +
          '<button type="button" class="tk-del">削除</button>' +
          "</div>").join("") : '<p class="pm-tk-empty">プランがありません。上の欄から追加してください。</p>';
      } catch { box.textContent = "読み込みに失敗しました"; }
    }
    async function loadTickets() {
      const box = wrap.querySelector(".pm-tk-list");
      try {
        const tks = (await (await fetch("/api/demo/tickets", { cache: "no-store" })).json()).tickets || [];
        if (!tks.length) { box.innerHTML = '<p class="pm-tk-empty">購入された回数券はまだありません。</p>'; return; }
        box.innerHTML =
          '<table class="pm-tk-table"><thead><tr><th>顧客名</th><th>回数券</th><th>購入日</th><th>初期</th><th>利用済</th><th>残り</th><th>有効期限</th><th>期限リマインド</th><th>状態</th><th></th></tr></thead><tbody>' +
          tks.map((t) =>
            '<tr data-tk="' + esc(t.id) + '"><td>' + esc(t.buyer_name) + "<br><small>" + esc(t.buyer_email) + "</small></td>" +
            "<td>" + esc(t.plan_name) + "</td><td>" + jd(t.purchased_at) + "</td>" +
            "<td>" + t.uses_total + "回</td><td>" + t.used + "回</td><td><b>" + t.uses_left + "回</b></td>" +
            "<td>" + jd(t.expires_at) + "</td><td>" + (t.remind_sent ? "送信済み" : "未送信") + "</td><td>" + esc(t.status) + "</td>" +
            '<td><button type="button" class="tk-hist">履歴</button> <button type="button" class="tk-adj">調整</button></td></tr>' +
            '<tr class="pm-tk-histrow" hidden><td colspan="10">' +
            t.history.map((h) =>
              esc(String(h.at).replace("T", " ").slice(0, 16)) + "　" +
              ({ purchase: "購入", use: "利用", refund: "返却", adjust: "残数調整", extend: "期限変更" }[h.type] || h.type) +
              (h.ref ? "（予約ID " + esc(h.ref) + "）" : "") +
              "　" + (h.delta > 0 ? "+" : "") + h.delta + "回 → 残り" + h.left_after + "回" +
              (h.note ? "　※" + esc(h.note) : "")).join("<br>") +
            "</td></tr>").join("") +
          "</tbody></table>";
      } catch { box.textContent = "読み込みに失敗しました"; }
    }
    loadPlans();
    loadTickets();

    wrap.addEventListener("click", async (e) => {
      const planRow = e.target.closest("[data-plan]");
      if (e.target.id === "pm-tk-add") {
        const body = {
          action: "add",
          name: wrap.querySelector("#pm-tk-name").value.trim(),
          price: Number(wrap.querySelector("#pm-tk-price").value),
          uses: Number(wrap.querySelector("#pm-tk-uses").value),
        };
        const r = await fetch("/api/demo/ticket-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!r.ok) { window.alert("名称・価格・回数（1〜200）を確認してください。"); return; }
        wrap.querySelector("#pm-tk-name").value = "";
        loadPlans();
        return;
      }
      if (planRow && e.target.classList.contains("tk-save")) {
        const body = {
          action: "update", id: planRow.dataset.plan,
          name: planRow.querySelector(".tk-name").value.trim(),
          price: Number(planRow.querySelector(".tk-price").value),
          uses: Number(planRow.querySelector(".tk-uses").value),
        };
        const r = await fetch("/api/demo/ticket-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!r.ok) { window.alert("入力値を確認してください。"); return; }
        loadPlans();
        return;
      }
      if (planRow && e.target.classList.contains("tk-active")) {
        await fetch("/api/demo/ticket-plans", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "toggle", id: planRow.dataset.plan, active: e.target.checked }) });
        return;
      }
      if (planRow && e.target.classList.contains("tk-del")) {
        if (!window.confirm("この回数券プランを削除しますか？（販売済みの回数券はそのまま利用できます）")) return;
        await fetch("/api/demo/ticket-plans", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", id: planRow.dataset.plan }) });
        loadPlans();
        return;
      }
      const tkRow = e.target.closest("[data-tk]");
      if (tkRow && e.target.classList.contains("tk-hist")) {
        const hist = tkRow.nextElementSibling;
        if (hist) hist.hidden = !hist.hidden;
        return;
      }
      if (tkRow && e.target.classList.contains("tk-adj")) {
        const d = window.prompt("残り回数の増減を入力してください（例：-1、+2）\n※有効期限は「購入日から1年間」で固定のため変更できません", "0");
        if (d === null) return;
        const note = window.prompt("調整理由（必須・履歴に残ります）", "");
        if (!note) { window.alert("調整理由は必須です。"); return; }
        const r = await fetch("/api/demo/tickets", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "adjust", id: tkRow.dataset.tk, usesDelta: Number(d) || 0, note }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          window.alert(j.error === "outOfRange" ? "残り回数は0〜初期回数の範囲でしか変更できません。" : "調整できませんでした。");
          return;
        }
        loadTickets();
        return;
      }
    });
  }

  // 店舗情報：メニュー一覧（追加・変更・削除。予約の空き状況・料金に即時反映）
  async function openMenuList() {
    document.getElementById("pm-menu-modal")?.remove();
    const wrap = document.createElement("div");
    wrap.id = "pm-menu-modal";
    wrap.innerHTML =
      '<section role="dialog" aria-modal="true">' +
      "<h2>店舗マスタ｜メニュー一覧</h2>" +
      '<p class="pm-shop-sub">メニューの追加・変更・削除・写真の登録ができます。空き状況・予約金額に即時反映されます。' +
      "（保存版のため、お客様画面のメニュー紹介ページには追加メニューは表示されません。追加メニューの予約受付・変更後の料金はサーバー側で正しく扱われます）</p>" +
      '<div class="pm-menu-new">' +
      '<input type="text" id="pm-mn-name" placeholder="新しいメニュー名" maxlength="120">' +
      '<input type="number" id="pm-mn-price" placeholder="料金(円)" min="0" step="100">' +
      '<input type="number" id="pm-mn-min" placeholder="時間(分)" min="10" max="600" step="5">' +
      '<label class="pm-photo-pick" title="メニュー写真（任意）">写真<input type="file" id="pm-mn-photo" accept="image/*"></label>' +
      '<span id="pm-mn-photoname" class="pm-photo-name"></span>' +
      '<button type="button" class="pm-red" id="pm-mn-add">追加</button>' +
      "</div>" +
      '<div class="pm-menu-list">読み込み中…</div>' +
      '<div class="pm-shop-actions"><button type="button" id="pm-mn-close">閉じる</button></div>' +
      "</section>";
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector("#pm-mn-close").addEventListener("click", close);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });

    const listEl = wrap.querySelector(".pm-menu-list");
    const post = async (body) => {
      const r = await fetch("/api/demo/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j.error === "hasBookings"
          ? "このメニューには予約が入っているため削除できません。\n先に予約の取消または変更をしてください。"
          : "保存できませんでした。名前・料金（0円以上）・時間（10〜600分）を確認してください。");
        return null;
      }
      window.__pmCoursesAt = 0; // キャッシュを無効化して選択肢へ即反映
      return j;
    };
    // 写真ファイルを読み込み、長辺640pxに縮小したJPEGのdataURLへ変換する
    const readPhoto = (file) => new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) { reject(new Error("notImage")); return; }
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("read"));
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const sc = Math.min(1, 640 / Math.max(img.width, img.height, 1));
          const cv = document.createElement("canvas");
          cv.width = Math.max(1, Math.round(img.width * sc));
          cv.height = Math.max(1, Math.round(img.height * sc));
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => reject(new Error("decode"));
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
    const render = (courses) => {
      listEl.innerHTML = "";
      const table = document.createElement("table");
      table.innerHTML = "<thead><tr><th>写真</th><th>メニュー名</th><th>料金(円)</th><th>時間(分)</th><th></th></tr></thead>";
      const tb = document.createElement("tbody");
      for (const c of courses) {
        const tr = document.createElement("tr");
        const tdPhoto = document.createElement("td");
        tdPhoto.className = "pm-menu-photo";
        if (c.hasPhoto) {
          const im = document.createElement("img");
          im.src = "/api/demo/course-photo?id=" + encodeURIComponent(c.id) + "&t=" + Date.now();
          im.alt = c.name;
          tdPhoto.appendChild(im);
        } else {
          const ph = document.createElement("span");
          ph.className = "pm-photo-none";
          ph.textContent = "写真なし";
          tdPhoto.appendChild(ph);
        }
        const tdName = document.createElement("td");
        const inName = document.createElement("input");
        inName.type = "text"; inName.value = c.name; inName.maxLength = 120;
        tdName.appendChild(inName);
        const tdPrice = document.createElement("td");
        const inPrice = document.createElement("input");
        inPrice.type = "number"; inPrice.value = c.price; inPrice.min = "0";
        tdPrice.appendChild(inPrice);
        const tdMin = document.createElement("td");
        const inMin = document.createElement("input");
        inMin.type = "number"; inMin.value = c.minutes; inMin.min = "10"; inMin.max = "600";
        tdMin.appendChild(inMin);
        const tdOps = document.createElement("td");
        tdOps.className = "ops";
        const bSave = document.createElement("button");
        bSave.type = "button"; bSave.textContent = "保存";
        bSave.addEventListener("click", async () => {
          const j = await post({ action: "update", id: c.id, name: inName.value, price: inPrice.value, minutes: inMin.value });
          if (j) render(j.courses);
        });
        const bDel = document.createElement("button");
        bDel.type = "button"; bDel.className = "pm-red"; bDel.textContent = "削除";
        bDel.addEventListener("click", async () => {
          if (!window.confirm("メニュー「" + c.name.slice(0, 30) + "…」を削除しますか？\n（予約が入っている場合は削除できません）")) return;
          const j = await post({ action: "delete", id: c.id });
          if (j) render(j.courses);
        });
        // 写真の登録／差し替え（選ぶとその場で保存される）
        const pick = document.createElement("label");
        pick.className = "pm-photo-pick";
        pick.textContent = c.hasPhoto ? "写真変更" : "写真登録";
        const file = document.createElement("input");
        file.type = "file"; file.accept = "image/*";
        file.addEventListener("change", async () => {
          const f = file.files && file.files[0];
          file.value = "";
          if (!f) return;
          let dataUrl;
          try { dataUrl = await readPhoto(f); }
          catch { window.alert("画像ファイルを読み込めませんでした。JPEG・PNGなどの画像を選んでください。"); return; }
          const j = await post({ action: "update", id: c.id, name: inName.value, price: inPrice.value, minutes: inMin.value, photo: dataUrl });
          if (j) render(j.courses);
        });
        pick.appendChild(file);
        tdOps.append(bSave, bDel, pick);
        if (c.hasPhoto) {
          const bPhotoDel = document.createElement("button");
          bPhotoDel.type = "button"; bPhotoDel.className = "pm-photo-del"; bPhotoDel.textContent = "写真削除";
          bPhotoDel.addEventListener("click", async () => {
            if (!window.confirm("メニュー「" + c.name.slice(0, 30) + "」の写真を削除しますか？")) return;
            const j = await post({ action: "update", id: c.id, name: inName.value, price: inPrice.value, minutes: inMin.value, photo: "" });
            if (j) render(j.courses);
          });
          tdOps.append(bPhotoDel);
        }
        tr.append(tdPhoto, tdName, tdPrice, tdMin, tdOps);
        tb.appendChild(tr);
      }
      table.appendChild(tb);
      listEl.appendChild(table);
    };
    // 新規メニュー用の写真（追加を押すまで保留しておく）
    let newPhoto = "";
    const newPhotoName = wrap.querySelector("#pm-mn-photoname");
    wrap.querySelector("#pm-mn-photo").addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        newPhoto = await readPhoto(f);
        newPhotoName.textContent = f.name.slice(0, 24);
      } catch {
        newPhoto = "";
        newPhotoName.textContent = "";
        window.alert("画像ファイルを読み込めませんでした。JPEG・PNGなどの画像を選んでください。");
      }
    });
    wrap.querySelector("#pm-mn-add").addEventListener("click", async () => {
      const body = {
        action: "create",
        name: wrap.querySelector("#pm-mn-name").value,
        price: wrap.querySelector("#pm-mn-price").value,
        minutes: wrap.querySelector("#pm-mn-min").value,
      };
      if (newPhoto) body.photo = newPhoto;
      const j = await post(body);
      if (j) {
        wrap.querySelector("#pm-mn-name").value = "";
        wrap.querySelector("#pm-mn-price").value = "";
        wrap.querySelector("#pm-mn-min").value = "";
        newPhoto = "";
        newPhotoName.textContent = "";
        render(j.courses);
      }
    });
    try {
      const r = await fetch("/api/demo/courses", { cache: "no-store" });
      render((await r.json()).courses);
    } catch { listEl.textContent = "読み込めませんでした。"; }
  }

  // メニュー一覧の変更を、管理画面の予約フォームのコース選択にも反映する
  // （追加メニューを選択肢に足し、削除済みメニューを選べなくする）
  async function refreshCourses() {
    const now = Date.now();
    if (window.__pmCoursesAt && now - window.__pmCoursesAt < 5000) return;
    window.__pmCoursesAt = now;
    try {
      const r = await fetch("/api/demo/courses", { cache: "no-store" });
      const map = {};
      for (const c of (await r.json()).courses) map[c.id] = c;
      window.__pmCourses = map;
    } catch {}
  }

  function syncCourseSelects() {
    const map = window.__pmCourses;
    if (!map) return;
    for (const sel of document.querySelectorAll("main.ledger-app select")) {
      const opts = [...sel.options];
      if (!opts.some((o) => /^\d{6}-\d{7}$/.test(o.value))) continue;
      for (const o of opts) {
        if (!/^\d{6}-\d{7}$/.test(o.value)) continue;
        const known = map[o.value];
        o.hidden = !known;
        o.disabled = !known;
        if (known && !o.dataset.pmCustom && o.textContent !== known.name && o.value.startsWith("900000-")) {
          o.textContent = known.name;
        }
      }
      for (const id of Object.keys(map)) {
        if (!id.startsWith("900000-")) continue;
        if (!opts.some((o) => o.value === id)) {
          const o = document.createElement("option");
          o.value = id;
          o.textContent = map[id].name;
          o.dataset.pmCustom = "1";
          sel.appendChild(o);
        }
      }
    }
  }

  // 表示中の月のシフトをCSVでダウンロードする
  async function exportShiftsCsv() {
    const monthLabel = document.querySelector(".ledger-month-heading b")?.textContent || "";
    const m = monthLabel.match(/(\d{4})年\s*(\d{1,2})月/);
    if (!m) return;
    const ym = `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
    const today = new Date(Date.now() + 9 * 3600e3 - 108e5).toISOString().slice(0, 10);
    const from = ym === today.slice(0, 7) ? today : ym + "-01";
    const sched = await (await fetch("/api/demo/schedule?date=" + from, { cache: "no-store" })).json();
    const names = {};
    for (const st of sched.staff) names[st.id] = st.name;
    const hhmm = (ms, d) => {
      const base = Date.parse(d + "T00:00:00+09:00");
      const min = Math.round((ms - base) / 60000);
      return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    };
    const rows = [["日付", "スタッフ", "開始", "終了"]];
    for (const sh of sched.shifts.filter((x) => x.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push([sh.date, names[sh.staff_id] || sh.staff_id, hhmm(sh.start_at, sh.date), hhmm(sh.end_at, sh.date)]);
    }
    const csv = "﻿" + rows.map((r) => r.join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `shift_${ym}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // 鍵（予約受付停止）状態の取得。3秒キャッシュで管理画面と予約サイトに追従する。
  async function refreshLocks(force) {
    const now = Date.now();
    if (!force && window.__pmLocksAt && now - window.__pmLocksAt < 3000) return;
    window.__pmLocksAt = now;
    try {
      const r = await fetch("/api/demo/locks", { cache: "no-store" });
      const d = await r.json();
      const map = {};
      for (const l of d.locks) map[l.name] = l;
      window.__pmLocks = map;
    } catch {}
  }

  function dateISOMinus1(d) {
    if (!d) return "";
    return new Date(Date.parse(d + "T00:00:00Z") - 86400e3).toISOString().slice(0, 10);
  }

  // 下部の集計バー（赤・黒・青の3段）
  setInterval(ensure, 600);

  // リアルタイム同期（SSE）：予約・シフト等の変更がサーバーに保存された瞬間、
  // 開いている台帳へ push 通知が届き、リロードなしで最新表示に更新する。
  // ・通知は合図だけで、データは必ずサーバーから取り直す（同じ通知が重複しても冪等）
  // ・編集パネルを開いている間は台帳の再取得を保留し、閉じた時点で追いつく
  // ・切断時はEventSourceが自動再接続し、再接続時・タブ復帰時に必ず再同期する
  if (!window.__pmSse && location.pathname === "/admin") {
    window.__pmSse = 1;
    let pendingSync = false, syncTimer = 0;
    const doSync = () => {
      const rb = document.querySelector(".ledger-refresh");
      // 編集・詳細パネルを開いている間は自動更新を保留（勝手に閉じない）
      const editing = !!document.querySelector(".ledger-side");
      if (rb && !rb.disabled && !editing) {
        pendingSync = false;
        rb.click(); // 本物の再読込（React側がサーバーの最新データを取得して描画）
      } else {
        pendingSync = true; // 編集中は保留（閉じたら下のintervalが追いつく）
      }
      refreshSched(true).then(decorateEvents);
      prefetchCalendar();
    };
    const kick = () => { clearTimeout(syncTimer); syncTimer = setTimeout(doSync, 250); };
    setInterval(() => { if (pendingSync) doSync(); }, 2000);
    try {
      const es = new EventSource("/api/demo/events");
      es.onmessage = kick;
      es.onopen = kick; // 再接続時は必ず最新へ再同期（切断中の変更を取りこぼさない）
    } catch {}
    document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });
  }

  // セッション切れの番人：サーバー再起動・アカウント停止・期限切れでセッションが
  // 無効になったら、画面を無反応のまま放置せずログイン画面へ案内する
  if (!window.__pmSessWatch) {
    window.__pmSessWatch = 1;
    setInterval(async () => {
      if (!location.pathname.startsWith("/admin") || location.pathname === "/admin/login") return;
      try {
        const r = await fetch("/api/demo/whoami", { cache: "no-store" });
        if (r.status === 401) location.href = "/admin/login?exp=1";
      } catch {}
    }, 8000);
  }
  document.addEventListener("DOMContentLoaded", ensure);
})();
