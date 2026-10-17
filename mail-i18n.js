// お客様へのメールを、ご予約（ご購入・会員登録）時の言語で作る（日本語以外の7か国語）
// ・日本語のメール（従来の文面）には一切手を加えない。日本語以外のお客様にだけ、同じデータから
//   日本語版と同じ構成・同じ順番で各言語の文面を作る（足さない・省かない）
// ・使うかどうかは管理画面の設定（settings.mailI18n）。オフのあいだは全員に従来どおり日本語で送る
// ・メールの記録（管理画面のメール管理）は日本語のまま残し、実際に届く件名・本文だけをこの言語にする
// ・会員登録のパスワード・再設定URLは、日本語版と同じ伏せ字の位置に入る（送信直前に実際の値へ置き換わる）
"use strict";
const fs = require("fs");
const path = require("path");

const LANGS = ["ja", "en", "zh", "ko", "fr", "es", "it", "de"];
const LOCALE = { en: "en-US", zh: "zh-CN", ko: "ko-KR", fr: "fr-FR", es: "es-ES", it: "it-IT", de: "de-DE" };
const norm = (l) => { const s = String(l || "").toLowerCase(); const k = s.startsWith("zh") ? "zh" : s.slice(0, 2); return LANGS.includes(k) ? k : "ja"; };

// メニュー名の訳（予約サイトと同じ辞書 public/cn-i18n.js の MENU）。辞書に無い名前は日本語のまま
let MENU = null;
function menuName(ja, lang) {
  if (MENU === null) {
    MENU = {};
    try {
      const src = fs.readFileSync(path.join(__dirname, "public", "cn-i18n.js"), "utf8");
      const m = /const MENU = (\{[\s\S]*?\});\n/.exec(src);
      if (m) MENU = JSON.parse(m[1]);
    } catch {}
  }
  const row = MENU[ja] || MENU[String(ja || "").replace(/\s+/g, " ").trim()];
  return row ? row[LANGS.indexOf(lang) - 1] : ja;
}
const PLAN_N = {
  en: (n) => n + "-Session Ticket", zh: (n) => n + "次卡", ko: (n) => n + "회권", fr: (n) => "Carnet de " + n + " séances",
  es: (n) => "Bono de " + n + " sesiones", it: (n) => "Carnet da " + n + " sedute", de: (n) => "Mehrfachkarte für " + n + " Behandlungen",
};
const REVIVED = { en: " (reinstated sessions)", zh: "（恢复部分）", ko: "(복원분)", fr: " (séances réintégrées)", es: " (sesiones restablecidas)", it: " (sedute ripristinate)", de: " (wiederhergestellte Behandlungen)" };
function planName(ja, lang) {
  let base = String(ja || ""), suffix = "";
  if (base.endsWith("（復活分）")) { base = base.slice(0, -5); suffix = REVIVED[lang]; }
  const one = (x) => { const m = /^回数券\s*(\d+)回券$/.exec(x.trim()); return m ? PLAN_N[lang](Number(m[1])) : x; };
  return base.split("・").map(one).join(lang === "zh" || lang === "ko" ? "・" : " / ") + suffix;
}
const CATEGORY = {
  "364321": ["Campaign", "优惠活动", "캠페인", "Offre", "Campaña", "Promozione", "Aktion"],
  "364323": ["Seitai", "整体", "정체", "Seitai", "Seitai", "Seitai", "Seitai"],
  "364324": ["Small-face contouring", "小脸矫正", "소얼굴 교정", "Correction « petit visage »", "Corrección «rostro pequeño»", "Correzione «viso piccolo»", "Gesichtskonturierung"],
  "364325": ["Corrective Seitai", "矫正整体", "교정 정체", "Seitai correctif", "Seitai correctivo", "Seitai correttivo", "Korrigierendes Seitai"],
  "364326": ["Oil", "精油", "오일", "Huile", "Aceite", "Olio", "Öl"],
  "364327": ["Foot", "足部", "풋", "Pieds", "Pies", "Piedi", "Füße"],
  "364328": ["Facial", "面部护理", "페이셜", "Visage", "Facial", "Viso", "Gesicht"],
  "364329": ["HYPER KNIFE", "HYPER KNIFE", "HYPER KNIFE", "HYPER KNIFE", "HYPER KNIFE", "HYPER KNIFE", "HYPER KNIFE"],
  "364331": ["Room", "房间", "룸", "Salle", "Sala", "Sala", "Raum"],
};
const categoryOf = (courseId, lang) => {
  const row = CATEGORY[String(courseId).slice(0, 6)];
  return row ? row[LANGS.indexOf(lang) - 1] : { en: "Menu", zh: "项目", ko: "메뉴", fr: "Soin", es: "Tratamiento", it: "Trattamento", de: "Behandlung" }[lang];
};
// 店舗の住所（予約サイトの「店舗情報」と同じ訳）
const ADDRESS = {
  en: "Plaza U Building, 3rd Floor, 4-8-6 Ueno, Taito-ku, Tokyo",
  zh: "东京都台东区上野4丁目8-6 Plaza U大楼 3楼",
  ko: "도쿄도 다이토구 우에노 4초메 8-6 플라자 U 빌딩 3층",
  fr: "Plaza U Building 3F, 4-8-6 Ueno, Taito-ku, Tokyo",
  es: "Plaza U Building 3F, 4-8-6 Ueno, Taito-ku, Tokio",
  it: "Plaza U Building 3F, 4-8-6 Ueno, Taito-ku, Tokyo",
  de: "Plaza U Building 3F, 4-8-6 Ueno, Taito-ku, Tokio",
};

// 日付・時刻・金額（各言語の書き方。時刻はすべて日本時間）
const jstParts = (ms) => { const d = new Date(ms + 9 * 3600e3); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: String(d.getUTCHours()).padStart(2, "0"), mi: String(d.getUTCMinutes()).padStart(2, "0") }; };
const fmtDate = (lang, y, m, d, weekday) => new Intl.DateTimeFormat(LOCALE[lang], { year: "numeric", month: "long", day: "numeric", ...(weekday ? { weekday: "short" } : {}), timeZone: "UTC" }).format(Date.UTC(y, m - 1, d));
const dateOfDay = (lang, ymd, weekday) => { const [y, m, d] = ymd.split("-").map(Number); return fmtDate(lang, y, m, d, weekday); };
const dateOfMs = (lang, ms) => { const p = jstParts(ms); return fmtDate(lang, p.y, p.m, p.d, false); };
const JST = { en: " (Japan time)", zh: "（日本时间）", ko: "(일본 시간)", fr: " (heure du Japon)", es: " (hora de Japón)", it: " (ora del Giappone)", de: " (japanische Zeit)" };
const dateTimeOfMs = (lang, ms) => { const p = jstParts(ms); return fmtDate(lang, p.y, p.m, p.d, false) + " " + p.hh + ":" + p.mi + JST[lang]; };
const yen = (lang, n) => Number(n || 0).toLocaleString(LOCALE[lang]) + " JPY";
const validFor = (lang, months) => {
  const n = Number(months) || 12, y = Math.floor(n / 12), mo = n % 12;
  const U = {
    en: [(k) => k + (k === 1 ? " year" : " years"), (k) => k + (k === 1 ? " month" : " months"), " "],
    zh: [(k) => k + "年", (k) => k + "个月", ""], ko: [(k) => k + "년", (k) => k + "개월", " "],
    fr: [(k) => k + (k === 1 ? " an" : " ans"), (k) => k + " mois", " et "],
    es: [(k) => k + (k === 1 ? " año" : " años"), (k) => k + (k === 1 ? " mes" : " meses"), " y "],
    it: [(k) => k + (k === 1 ? " anno" : " anni"), (k) => k + (k === 1 ? " mese" : " mesi"), " e "],
    de: [(k) => k + (k === 1 ? " Jahr" : " Jahre"), (k) => k + (k === 1 ? " Monat" : " Monate"), " und "],
  }[lang];
  return [y ? U[0](y) : "", mo ? U[1](mo) : ""].filter(Boolean).join(U[2]);
};

// ---- 各言語の文面（日本語版の文面と1行ずつ対応） ----
const P = {
  en: {
    dear: (n) => `Dear ${n},`, customer: "Customer",
    s: { confirm: "Booking confirmation", remind: "Booking reminder", change: "Notice of booking change", cancel: "Booking cancellation",
      purchase: "Session ticket purchase", left: (n) => `Sessions remaining on your session ticket (${n} left)`, expiry: "Your session ticket will expire soon",
      welcome: "Registration complete", reset: "Password reset instructions", passChanged: "Password change complete" },
    bookingId: (id) => `Booking ID ${id}`, total: (p) => `Total ${p}`, guests: (n) => `Guests ${n}`,
    timeFrom: (d, t) => `${d}  ${t}–`, timeRange: (d, a, b, min) => `${d}  ${a}–${b} (${min} min)`,
    thanksBook: (st) => `Thank you for booking with “${st}”.`, thanksUse: (st) => `Thank you for always using “${st}”.`,
    detailsBelow: "Your booking details are as follows.", changedBelow: "We have changed your booking to the following details.",
    cancelledBelow: "We have cancelled the following booking.", lookForward: "We look forward to your visit.",
    late: "■If you will be late for the start time, please contact us by phone.",
    howChange: "■To change your booking, please cancel it once and then make a new booking.",
    busy: "※Depending on how busy we are, it may not be possible to rebook. Thank you for your understanding.",
    memberChange: "※If you are registered as a member (logged in), you can also change the date and time on My Page.",
    cancelHere: "To cancel your booking ⇒", checkCancel: "To check or cancel your booking ⇒",
    cancelledOnMypage: "You can check the cancelled booking on My Page ⇒", again: "We look forward to serving you again.",
    remindLead: "Your booking date is approaching, so we are sending you this reminder.",
    staffNom: (n, others) => `Staff ${n} (requested)` + (others.length ? `, ${others.join(", ")}` : ""), staff: (names) => `Staff ${names.join(", ")}`,
    feeTicket: "Course fee Paid with a session ticket (1 session)", fee: (p, n) => `Course fee ${p}` + (n > 1 ? ` × ${n} guests` : ""),
    nomFee: (p) => `Nomination fee ${p}`, lateFee: (p) => `Late-night fee ${p}`,
    payHead: "■Payment", payAtSalon: "Please pay the total amount at the salon when you visit.",
    payFee: "For payment by methods other than cash (credit card, electronic money, QR code payment, etc.), a payment fee of 5% of the payment amount will be charged in accordance with the Terms of Service (no payment fee is charged for cash payments).",
    payTicket: "This booking is paid with a session ticket.",
    placeHead: "■Location", map: (u) => `Map & access ⇒ ${u}`,
    noticeHead: "■Notes for your visit", notice: "If you need to change your booking or will be late, we would appreciate it if you could contact us in advance.", contact: (e) => `Contact: ${e}`,
    tkReturnedNoData: (pl) => `1 session of your session ticket “${pl}” has been returned.`, tkLeftNow: (n) => `Sessions remaining now: ${n}`,
    tkUseNoData: "1 session of your session ticket will be used for this booking.", tkLeftAfter: (n) => `Sessions remaining after this booking: ${n}`, tkUsedName: (pl) => `(Session ticket used: ${pl})`,
    tkReturned: (pl) => `1 session of your session ticket “${pl}” has been returned. The current status of your session ticket is as follows.`,
    tkNoReturn: "Because the booking was cancelled after its start time, the session is not returned. The current status of your session ticket is as follows.",
    tkUsed1: "1 session of your session ticket is used for this booking (the session for this booking has already been deducted).", tkUsed2: "The current status of your session ticket is as follows.",
    purchased: (d) => `Purchase date ${d}`, remain: (l, t, u) => `Sessions remaining ${l} (${u} of ${t} used)`,
    breakdown: (d, pl, n) => `Breakdown: ${n} reinstated from “${pl}” purchased on ${d}`, validUntil: (d) => `Valid until ${d}`, status: (s) => `Status ${s}`,
    usage: { none: "Cannot be used because no sessions are left", expired: "Cannot be used because the expiry date has passed", ok: "Can be used" },
    othersHead: "Other session tickets you can use", other: (pl, n, d) => `・${pl}  ${n} left (valid until ${d})`,
    snap: "※The session ticket details are as of when this email was sent.",
    pThanks: (st) => `Thank you for purchasing a session ticket from “${st}”.`, pBelow: "Your purchase details are as follows.",
    pAvail: (n) => `Sessions available ${n}`, pValid: (d, v) => `Valid until ${d} (${v} from the date of purchase)`, pPrice: (p) => `Price ${p} (paid at the salon)`,
    pRev1: (n) => `Together with this purchase, ${n} unused session(s) from a previously purchased session ticket that had expired have been reinstated.`,
    pRevSrc: (d, pl, t, u, ex, c) => `・From “${pl}” purchased on ${d} (${u} of ${t} used, expired on ${ex}): ${c}`,
    pRev2: (pl, l, d, v) => `The reinstated sessions can be used as “${pl}”: ${l} left, valid until ${d} (${v} from the date of this purchase).`,
    pUse: "If you choose to use a session ticket when booking, 1 session is used per booking.", pMypage: "You can check your remaining sessions on My Page at any time.",
    lRefund: (pl) => `Following the cancellation of your booking, 1 session of your session ticket “${pl}” has been returned.`,
    lRevive: (pl) => `Unused sessions from a previously purchased session ticket that had expired have been reinstated as “${pl}”.`,
    lUse: (ref, pl) => `1 session of your session ticket “${pl}” has been used for your booking (booking number ${ref}).`,
    l0: "You have no sessions left. You can buy a new session ticket on My Page at any time.",
    lFew: "You have only a few sessions left. You can buy a new session ticket on My Page at any time.",
    lMany: "You can check your remaining sessions on My Page (“Log in” at the top right of the booking site → “Session tickets”) at any time.",
    xToday: "Your session ticket expires today.", xSoon: (d) => `Your session ticket is about to expire (${d} day(s) until the expiry date).`,
    xName: (pl) => `Session ticket: ${pl}`, xLeft: (n) => `Sessions remaining: ${n}`, xValid: (d) => `Valid until: ${d}`, xBreak: (d, pl, n) => `(Breakdown: ${n} reinstated from “${pl}” purchased on ${d})`,
    xUse: "Please use your remaining sessions before the expiry date.", xAfter: "After the expiry date the session ticket can no longer be used, so we look forward to your early booking.",
    xBook: "You can book on the booking site below.", xRegards: (st) => `We look forward to serving you again at “${st}”.`,
    wThanks: (st) => `Thank you for registering as a member of “${st}”.`, wKeep: "Your registration details are as follows. You will need them to log in, so please keep this email safe.",
    loginId: (e) => `Login ID (email address): ${e}`, password: (m) => `Password: ${m}`, registered: (d) => `Registered on: ${d}`,
    loginHere: "Log in here ⇒", wTopRight: "You can also log in with “Log in” at the top right of the booking site. On My Page you can check, reschedule and cancel bookings,",
    wTopRight2: "and buy session tickets and check your remaining sessions at any time.",
    wBanner: "Members will also see session tickets at the top of the [Book] and [Menu] pages and can use them when booking.",
    wForgotHead: "■If you forget your password", wForgot: "Enter your registered email address at the URL below and we will send you a link to reset your password.",
    wSecret: "※This email contains your password. Please make sure no one else sees it.", wNotMe: "※If you did not expect this email, please contact the salon.",
    rReceived: "We have received your request to reset your password.", rOpen: "Please open the URL below and set a new password.",
    rUrl: "Password reset URL", rValid: (d) => `Valid until: ${d} (can be used only once)`,
    rExpired: "Expired or already used URLs cannot be opened. Please start the procedure again from the link below.",
    rNotMe: "※If you did not expect this email, please delete it. Your password will not be changed.",
    cDone: "Your member password has been changed.", cAt: (d) => `Changed on: ${d}`, cVia: (r) => `Method: ${r ? "Password reset URL" : "Member information on My Page"}`,
    cLogin: "Please log in with your new password using “Log in” at the top right of the booking site.",
    cNotMe: "※If you did not make this change, please reset your password immediately from the link below and contact the salon.",
    foot: ["■If you have any questions about your booking, please contact the salon you booked with.", "",
      "■This service is operated and provided by CN Wing Kikaku Co., Ltd. (CNウィング企画株式会社).", "",
      "■This email was sent from a send-only email address.", "Please note that we cannot read or respond to replies to this email.", "",
      "■If you did not expect this email, please let our system support know.", "System support: cnsalon2021@gmail.com"],
  },
  zh: {
    dear: (n) => `${n} 您好：`, customer: "顾客",
    s: { confirm: "预约内容确认", remind: "预约提醒", change: "预约内容变更通知", cancel: "预约取消通知", purchase: "次卡购买通知",
      left: (n) => `次卡剩余次数通知（剩余${n}次）`, expiry: "您的次卡即将到期", welcome: "会员注册完成通知", reset: "重设密码通知", passChanged: "密码更改完成通知" },
    bookingId: (id) => `预约ID ${id}`, total: (p) => `合计 ${p}`, guests: (n) => `人数 ${n}位`,
    timeFrom: (d, t) => `${d}　${t}～`, timeRange: (d, a, b, min) => `${d}　${a}～${b}（${min}分钟）`,
    thanksBook: (st) => `感谢您预约“${st}”。`, thanksUse: (st) => `感谢您一直以来对“${st}”的惠顾。`,
    detailsBelow: "本次预约内容如下。", changedBelow: "您的预约已变更为以下内容，特此通知。", cancelledBelow: "以下预约已取消，特此通知。", lookForward: "衷心期待您的光临。",
    late: "■如果会晚于开始时间到达，请致电与我们联系。", howChange: "■如需变更预约内容，请先取消预约，再重新预约。",
    busy: "※根据预约情况，可能无法重新预约，敬请谅解。", memberChange: "※已注册会员（已登录）的顾客，也可以在我的页面中更改日期和时间。",
    cancelHere: "取消预约请点击此处 ⇒", checkCancel: "确认・取消预约请点击此处 ⇒", cancelledOnMypage: "已取消的预约可在我的页面中确认 ⇒", again: "衷心期待您再次光临。",
    remindLead: "您的预约日期即将到来，特此提醒。",
    staffNom: (n, others) => `负责技师 ${n}（指定）` + (others.length ? `、${others.join("、")}` : ""), staff: (names) => `负责技师 ${names.join("、")}`,
    feeTicket: "项目费用 以次卡支付（1次）", fee: (p, n) => `项目费用 ${p}` + (n > 1 ? ` × ${n}位` : ""), nomFee: (p) => `指定费 ${p}`, lateFee: (p) => `深夜费 ${p}`,
    payHead: "■关于付款", payAtSalon: "请在到店时于店内支付合计金额。",
    payFee: "以现金以外的方式（信用卡、电子钱包、二维码支付等）付款时，根据使用条款，将收取付款金额5%的结算手续费（现金付款不收取结算手续费）。",
    payTicket: "本次预约以次卡支付。", placeHead: "■到店地点", map: (u) => `地图・交通 ⇒ ${u}`,
    noticeHead: "■到店注意事项", notice: "如需更改预约或可能迟到，敬请事先与我们联系。", contact: (e) => `联系方式：${e}`,
    tkReturnedNoData: (pl) => `已退还次卡“${pl}”1次。`, tkLeftNow: (n) => `当前剩余次数：${n}次`,
    tkUseNoData: "本次预约将使用次卡1次。", tkLeftAfter: (n) => `预约后剩余次数：${n}次`, tkUsedName: (pl) => `（使用的次卡：${pl}）`,
    tkReturned: (pl) => `已退还次卡“${pl}”1次。目前次卡的状况如下。`, tkNoReturn: "由于是在开始时间之后取消，次卡不予退还。目前次卡的状况如下。",
    tkUsed1: "本次预约使用次卡1次（已扣除本次预约的次数）。", tkUsed2: "目前次卡的状况如下。",
    purchased: (d) => `购买日期 ${d}`, remain: (l, t, u) => `剩余次数 ${l}次（共${t}次，已使用${u}次）`,
    breakdown: (d, pl, n) => `明细 从${d}购买的“${pl}”恢复${n}次`, validUntil: (d) => `有效期至 ${d}`, status: (s) => `使用状况 ${s}`,
    usage: { none: "剩余次数为0，无法使用", expired: "已过有效期，无法使用", ok: "可以使用" },
    othersHead: "其他可使用的次卡", other: (pl, n, d) => `・${pl}　剩余${n}次（有效期至${d}）`, snap: "※次卡内容为发送本邮件时的最新状态。",
    pThanks: (st) => `感谢您购买“${st}”的次卡。`, pBelow: "购买内容如下。", pAvail: (n) => `可使用次数 ${n}次`,
    pValid: (d, v) => `有效期至 ${d}（自购买日起${v}）`, pPrice: (p) => `费用 ${p}（在店内支付）`,
    pRev1: (n) => `配合本次购买，已恢复以往购买的次卡中已过期的未使用部分${n}次。`,
    pRevSrc: (d, pl, t, u, ex, c) => `・从${d}购买的“${pl}”（共${t}次，已使用${u}次，于${ex}到期）恢复${c}次`,
    pRev2: (pl, l, d, v) => `恢复的次数将作为“${pl}”，剩余${l}次，有效期至${d}（自本次购买日起${v}）可以使用。`,
    pUse: "预约时选择使用次卡，每次预约使用1次。", pMypage: "剩余次数可随时在我的页面中确认。",
    lRefund: (pl) => `由于预约取消，已退还次卡“${pl}”1次。`, lRevive: (pl) => `已将以往购买的次卡中已过期的未使用部分恢复为“${pl}”。`,
    lUse: (ref, pl) => `您的预约（预约编号 ${ref}）已使用次卡“${pl}”1次。`,
    l0: "剩余次数已为0次。可随时在我的页面中购买新的次卡。", lFew: "剩余次数已不多。可随时在我的页面中购买新的次卡。",
    lMany: "剩余次数可随时在我的页面（预约网站右上角的“登录”→“次卡”）中确认。",
    xToday: "您购买的次卡有效期截至今天。", xSoon: (d) => `您购买的次卡即将到期（距离有效期还有${d}天）。`,
    xName: (pl) => `次卡名称：${pl}`, xLeft: (n) => `剩余次数：${n}次`, xValid: (d) => `有效期至：${d}`, xBreak: (d, pl, n) => `（明细：从${d}购买的“${pl}”恢复${n}次）`,
    xUse: "请在有效期内使用剩余次数。", xAfter: "过期后将无法使用，期待您尽早预约。", xBook: "可通过以下预约网站办理预约。", xRegards: (st) => `今后也请多多关照“${st}”。`,
    wThanks: (st) => `感谢您注册成为“${st}”的会员。`, wKeep: "您的注册内容如下。登录时需要使用，请妥善保管本邮件。",
    loginId: (e) => `登录ID（电子邮件地址）：${e}`, password: (m) => `密码：${m}`, registered: (d) => `注册日期时间：${d}`,
    loginHere: "请点击此处登录 ⇒", wTopRight: "也可以从预约网站右上角的“登录”进行登录。在我的页面中，可随时确认、更改日期时间或取消预约，",
    wTopRight2: "以及购买次卡和确认剩余次数。", wBanner: "此外，会员在【预约】【菜单】页面顶部可看到次卡，并可在预约时使用。",
    wForgotHead: "■忘记密码时", wForgot: "在以下网址输入您注册的电子邮件地址后，我们将发送重设密码的网址。",
    wSecret: "※本邮件载有您的密码，请注意不要让第三方看到。", wNotMe: "※如您对本邮件没有印象，烦请与本店联系。",
    rReceived: "我们已收到您重设密码的申请。", rOpen: "请打开以下网址并设置新密码。", rUrl: "重设密码网址", rValid: (d) => `有效期：截至${d}（仅限使用1次）`,
    rExpired: "超过有效期或已使用的网址将无法打开。烦请通过以下网址重新办理。", rNotMe: "※如您对本邮件没有印象，请删除本邮件。密码不会被更改。",
    cDone: "会员密码已更改完成。", cAt: (d) => `更改日期时间：${d}`, cVia: (r) => `更改方式：${r ? "重设密码网址" : "我的页面的会员信息"}`,
    cLogin: "请使用新密码，从预约网站右上角的“登录”进行登录。", cNotMe: "※如果您没有进行此操作，请立即通过以下网址重设密码，并与本店联系。",
    foot: ["■如对预约内容有任何疑问，请与您预约的店铺联系。", "", "■本服务由CN Wing Kikaku Co., Ltd.（CNウィング企画株式会社）运营和提供。", "",
      "■本邮件由仅用于发送的电子邮件地址发出。", "即使回复本邮件，我们也无法确认回复内容并予以答复，敬请谅解。", "",
      "■如您对本邮件没有印象，烦请告知系统支持。", "系统支持：cnsalon2021@gmail.com"],
  },
  ko: {
    dear: (n) => `${n} 님`, customer: "고객",
    s: { confirm: "예약 내용 확인", remind: "예약 리마인드", change: "예약 내용 변경 안내", cancel: "예약 취소 안내", purchase: "회수권 구매 안내",
      left: (n) => `회수권 남은 횟수 안내(남은 ${n}회)`, expiry: "회수권 유효기간이 다가오고 있습니다", welcome: "회원가입 완료 안내", reset: "비밀번호 재설정 안내", passChanged: "비밀번호 변경 완료 안내" },
    bookingId: (id) => `예약 ID ${id}`, total: (p) => `합계 ${p}`, guests: (n) => `인원 ${n}명`,
    timeFrom: (d, t) => `${d}　${t}~`, timeRange: (d, a, b, min) => `${d}　${a}~${b}(${min}분)`,
    thanksBook: (st) => `‘${st}’을(를) 예약해 주셔서 감사합니다.`, thanksUse: (st) => `항상 ‘${st}’을(를) 이용해 주셔서 감사합니다.`,
    detailsBelow: "이번 예약 내용은 다음과 같습니다.", changedBelow: "예약을 아래 내용으로 변경하였기에 안내해 드립니다.", cancelledBelow: "아래 예약을 취소하였기에 안내해 드립니다.", lookForward: "방문을 진심으로 기다리겠습니다.",
    late: "■시작 시간에 늦으실 경우에는 전화로 연락해 주세요.", howChange: "■예약 내용을 변경하시려면 예약을 한 번 취소하신 후 다시 예약해 주세요.",
    busy: "※혼잡 상황에 따라 다시 예약하지 못할 수도 있습니다. 미리 양해 부탁드립니다.", memberChange: "※회원가입(로그인)하신 분은 마이페이지에서 일시 변경도 하실 수 있습니다.",
    cancelHere: "예약 취소는 여기에서 ⇒", checkCancel: "예약 확인・취소는 여기에서 ⇒", cancelledOnMypage: "취소한 예약은 마이페이지에서 확인하실 수 있습니다 ⇒", again: "다시 이용해 주시기를 진심으로 기다리겠습니다.",
    remindLead: "예약일이 다가와 안내해 드립니다.",
    staffNom: (n, others) => `담당 스태프 ${n}(지명)` + (others.length ? `, ${others.join(", ")}` : ""), staff: (names) => `담당 스태프 ${names.join(", ")}`,
    feeTicket: "코스 요금 회수권으로 결제(1회분)", fee: (p, n) => `코스 요금 ${p}` + (n > 1 ? ` × ${n}명` : ""), nomFee: (p) => `지명료 ${p}`, lateFee: (p) => `심야 요금 ${p}`,
    payHead: "■결제 안내", payAtSalon: "합계 금액은 방문 시 매장에서 결제해 주세요.",
    payFee: "현금 이외(신용카드, 전자화폐, QR코드 결제 등)로 결제하시는 경우, 이용약관에 따라 결제 금액의 5%를 결제 수수료로 받습니다(현금 결제에는 결제 수수료가 없습니다).",
    payTicket: "이번 예약은 회수권으로 결제됩니다.", placeHead: "■방문 장소", map: (u) => `지도・오시는 길 ⇒ ${u}`,
    noticeHead: "■방문 시 유의사항", notice: "예약을 변경하시거나 늦으실 경우에는 미리 연락해 주시면 감사하겠습니다.", contact: (e) => `연락처: ${e}`,
    tkReturnedNoData: (pl) => `회수권 ‘${pl}’ 1회분을 돌려드렸습니다.`, tkLeftNow: (n) => `현재 남은 횟수: ${n}회`,
    tkUseNoData: "이번 예약에 회수권 1회분을 사용합니다.", tkLeftAfter: (n) => `예약 후 남은 횟수: ${n}회`, tkUsedName: (pl) => `(사용하신 회수권: ${pl})`,
    tkReturned: (pl) => `회수권 ‘${pl}’ 1회분을 돌려드렸습니다. 현재 회수권 상황은 다음과 같습니다.`, tkNoReturn: "시작 시간이 지난 후의 취소이므로 회수권은 돌려드리지 않습니다. 현재 회수권 상황은 다음과 같습니다.",
    tkUsed1: "이번 예약에 회수권 1회분을 사용합니다(이번 예약분은 이미 차감되었습니다).", tkUsed2: "현재 회수권 상황은 다음과 같습니다.",
    purchased: (d) => `구매일 ${d}`, remain: (l, t, u) => `남은 횟수 ${l}회(${t}회 중 ${u}회 사용)`,
    breakdown: (d, pl, n) => `내역 ${d} 구매한 ‘${pl}’에서 ${n}회 복원`, validUntil: (d) => `유효기간 ${d}`, status: (s) => `이용 상황 ${s}`,
    usage: { none: "남은 횟수가 없어 이용하실 수 없습니다", expired: "유효기간이 지나 이용하실 수 없습니다", ok: "이용하실 수 있습니다" },
    othersHead: "그 밖에 이용하실 수 있는 회수권", other: (pl, n, d) => `・${pl}　남은 ${n}회(유효기간 ${d})`, snap: "※회수권 내용은 이 메일을 보낸 시점의 최신 상태입니다.",
    pThanks: (st) => `‘${st}’의 회수권을 구매해 주셔서 감사합니다.`, pBelow: "구매 내용은 다음과 같습니다.", pAvail: (n) => `이용 가능 횟수 ${n}회`,
    pValid: (d, v) => `유효기간 ${d}(구매일로부터 ${v})`, pPrice: (p) => `요금 ${p}(매장에서 결제)`,
    pRev1: (n) => `이번 구매에 맞추어, 이전에 구매하신 회수권 중 유효기간이 지난 미사용분 ${n}회를 복원했습니다.`,
    pRevSrc: (d, pl, t, u, ex, c) => `・${d} 구매 ‘${pl}’(${t}회 중 ${u}회 사용・${ex} 기한 만료)에서 ${c}회`,
    pRev2: (pl, l, d, v) => `복원된 횟수는 ‘${pl}’(으)로, 남은 ${l}회・유효기간 ${d}(이번 구매일로부터 ${v})로 이용하실 수 있습니다.`,
    pUse: "예약 시 회수권 사용을 선택하시면 1회 예약에 1회분을 사용합니다.", pMypage: "남은 횟수는 마이페이지에서 언제든지 확인하실 수 있습니다.",
    lRefund: (pl) => `예약 취소에 따라 회수권 ‘${pl}’ 1회분을 돌려드렸습니다.`, lRevive: (pl) => `이전에 구매하신 회수권 중 유효기간이 지난 미사용분을 ‘${pl}’(으)로 복원했습니다.`,
    lUse: (ref, pl) => `예약(예약 번호 ${ref})에서 회수권 ‘${pl}’ 1회분을 이용하셨습니다.`,
    l0: "남은 횟수가 0회가 되었습니다. 마이페이지에서 언제든지 새 회수권을 구매하실 수 있습니다.", lFew: "남은 횟수가 얼마 남지 않았습니다. 마이페이지에서 언제든지 새 회수권을 구매하실 수 있습니다.",
    lMany: "남은 횟수는 마이페이지(예약 사이트 오른쪽 위의 ‘로그인’→‘회수권’)에서 언제든지 확인하실 수 있습니다.",
    xToday: "구매하신 회수권의 유효기간은 오늘까지입니다.", xSoon: (d) => `구매하신 회수권의 유효기간이 다가오고 있습니다(유효기간까지 ${d}일).`,
    xName: (pl) => `회수권명: ${pl}`, xLeft: (n) => `남은 횟수: ${n}회`, xValid: (d) => `유효기간: ${d}`, xBreak: (d, pl, n) => `(내역: ${d} 구매한 ‘${pl}’에서 ${n}회 복원)`,
    xUse: "유효기간 내에 남은 회수권을 꼭 이용해 주세요.", xAfter: "유효기간이 지나면 이용하실 수 없으니 빠른 예약을 기다리겠습니다.", xBook: "예약은 아래 예약 사이트에서 하실 수 있습니다.",
    xRegards: (st) => `앞으로도 ‘${st}’을(를) 잘 부탁드립니다.`,
    wThanks: (st) => `‘${st}’의 회원으로 가입해 주셔서 감사합니다.`, wKeep: "가입 내용은 다음과 같습니다. 로그인할 때 필요하오니 이 메일을 소중히 보관해 주세요.",
    loginId: (e) => `로그인 ID(이메일 주소): ${e}`, password: (m) => `비밀번호: ${m}`, registered: (d) => `가입 일시: ${d}`,
    loginHere: "로그인은 여기에서 ⇒", wTopRight: "예약 사이트 오른쪽 위의 ‘로그인’에서도 로그인하실 수 있습니다. 마이페이지에서는 예약 확인・일시 변경・취소,",
    wTopRight2: "회수권 구매와 남은 횟수 확인을 언제든지 하실 수 있습니다.", wBanner: "또한 회원님께는 【예약】【메뉴】 페이지 맨 위에 회수권이 표시되며, 예약 시 이용하실 수 있습니다.",
    wForgotHead: "■비밀번호를 잊으신 경우", wForgot: "아래 URL에서 가입하신 이메일 주소를 입력하시면 비밀번호 재설정용 URL을 보내 드립니다.",
    wSecret: "※이 메일에는 비밀번호가 기재되어 있습니다. 다른 사람이 보지 않도록 주의해 주세요.", wNotMe: "※이 메일에 짐작 가는 바가 없으시면 번거로우시겠지만 매장으로 연락해 주세요.",
    rReceived: "비밀번호 재설정 요청을 접수했습니다.", rOpen: "아래 URL을 열어 새 비밀번호를 설정해 주세요.", rUrl: "비밀번호 재설정용 URL", rValid: (d) => `유효기간: ${d}까지(1회만 사용 가능)`,
    rExpired: "유효기간이 지났거나 이미 사용한 URL은 열 수 없습니다. 번거로우시겠지만 아래에서 다시 신청해 주세요.", rNotMe: "※이 메일에 짐작 가는 바가 없으시면 이 메일을 삭제해 주세요. 비밀번호는 변경되지 않습니다.",
    cDone: "회원 비밀번호 변경이 완료되었습니다.", cAt: (d) => `변경 일시: ${d}`, cVia: (r) => `변경 방법: ${r ? "비밀번호 재설정용 URL" : "마이페이지의 회원 정보"}`,
    cLogin: "새 비밀번호로 예약 사이트 오른쪽 위의 ‘로그인’에서 로그인해 주세요.", cNotMe: "※이 변경에 짐작 가는 바가 없으시면 즉시 아래에서 비밀번호를 재설정하시고 매장으로 연락해 주세요.",
    foot: ["■예약 내용에 관한 질문이나 궁금한 점이 있으시면 이용하신 매장으로 문의해 주세요.", "", "■이 서비스는 CN Wing Kikaku Co., Ltd.(CNウィング企画株式会社)가 운영・제공하고 있습니다.", "",
      "■이 메일은 발신 전용 메일 주소에서 보내 드렸습니다.", "회신하셔도 내용을 확인하거나 답변해 드릴 수 없으니 양해 부탁드립니다.", "",
      "■이 메일에 짐작 가는 바가 없으시면 번거로우시겠지만 시스템 지원으로 알려 주세요.", "시스템 지원: cnsalon2021@gmail.com"],
  },
  fr: {
    dear: (n) => `Bonjour ${n},`, customer: "Client",
    s: { confirm: "Confirmation de réservation", remind: "Rappel de réservation", change: "Modification de votre réservation", cancel: "Annulation de votre réservation",
      purchase: "Achat de votre carnet de séances", left: (n) => `Séances restantes sur votre carnet (${n} restante(s))`, expiry: "Votre carnet de séances expire bientôt",
      welcome: "Confirmation d’inscription", reset: "Réinitialisation du mot de passe", passChanged: "Modification du mot de passe effectuée" },
    bookingId: (id) => `N° de réservation ${id}`, total: (p) => `Total ${p}`, guests: (n) => `Personnes ${n}`,
    timeFrom: (d, t) => `${d}  ${t}–`, timeRange: (d, a, b, min) => `${d}  ${a}–${b} (${min} min)`,
    thanksBook: (st) => `Merci d’avoir réservé chez « ${st} ».`, thanksUse: (st) => `Merci de votre fidélité à « ${st} ».`,
    detailsBelow: "Voici le détail de votre réservation.", changedBelow: "Nous vous informons que votre réservation a été modifiée comme suit.",
    cancelledBelow: "Nous vous informons que la réservation suivante a été annulée.", lookForward: "Nous nous réjouissons de vous accueillir.",
    late: "■Si vous êtes en retard par rapport à l’heure de début, merci de nous prévenir par téléphone.",
    howChange: "■Pour modifier votre réservation, veuillez d’abord l’annuler puis effectuer une nouvelle réservation.",
    busy: "※Selon l’affluence, il peut être impossible de réserver à nouveau. Merci de votre compréhension.",
    memberChange: "※Si vous êtes membre inscrit (connecté), vous pouvez aussi modifier la date et l’heure dans votre espace.",
    cancelHere: "Pour annuler votre réservation ⇒", checkCancel: "Pour consulter ou annuler votre réservation ⇒",
    cancelledOnMypage: "Vous pouvez consulter la réservation annulée dans votre espace ⇒", again: "Nous espérons vous revoir bientôt.",
    remindLead: "La date de votre réservation approche ; voici un rappel.",
    staffNom: (n, others) => `Praticien ${n} (demandé)` + (others.length ? `, ${others.join(", ")}` : ""), staff: (names) => `Praticien ${names.join(", ")}`,
    feeTicket: "Prix du soin Réglé avec un carnet de séances (1 séance)", fee: (p, n) => `Prix du soin ${p}` + (n > 1 ? ` × ${n} personnes` : ""),
    nomFee: (p) => `Frais de désignation ${p}`, lateFee: (p) => `Supplément de nuit ${p}`,
    payHead: "■Paiement", payAtSalon: "Veuillez régler le montant total au salon lors de votre visite.",
    payFee: "Pour un paiement autrement qu’en espèces (carte de crédit, monnaie électronique, paiement par QR code, etc.), des frais de 5 % du montant payé sont appliqués conformément aux Conditions d’utilisation (aucuns frais pour un paiement en espèces).",
    payTicket: "Cette réservation est réglée avec un carnet de séances.", placeHead: "■Lieu", map: (u) => `Plan et accès ⇒ ${u}`,
    noticeHead: "■Informations pour votre visite", notice: "Si vous devez modifier votre réservation ou si vous êtes en retard, merci de nous prévenir à l’avance.", contact: (e) => `Contact : ${e}`,
    tkReturnedNoData: (pl) => `1 séance de votre carnet « ${pl} » vous a été restituée.`, tkLeftNow: (n) => `Séances restantes actuellement : ${n}`,
    tkUseNoData: "1 séance de votre carnet sera utilisée pour cette réservation.", tkLeftAfter: (n) => `Séances restantes après cette réservation : ${n}`, tkUsedName: (pl) => `(Carnet utilisé : ${pl})`,
    tkReturned: (pl) => `1 séance de votre carnet « ${pl} » vous a été restituée. Voici l’état actuel de votre carnet.`,
    tkNoReturn: "L’annulation ayant eu lieu après l’heure de début, la séance n’est pas restituée. Voici l’état actuel de votre carnet.",
    tkUsed1: "1 séance de votre carnet est utilisée pour cette réservation (la séance de cette réservation est déjà déduite).", tkUsed2: "Voici l’état actuel de votre carnet.",
    purchased: (d) => `Date d’achat ${d}`, remain: (l, t, u) => `Séances restantes ${l} (${u} utilisée(s) sur ${t})`,
    breakdown: (d, pl, n) => `Détail ${n} réintégrée(s) depuis « ${pl} » acheté le ${d}`, validUntil: (d) => `Valable jusqu’au ${d}`, status: (s) => `État ${s}`,
    usage: { none: "Utilisation impossible : il ne reste aucune séance", expired: "Utilisation impossible : la date de validité est dépassée", ok: "Utilisable" },
    othersHead: "Autres carnets utilisables", other: (pl, n, d) => `・${pl}  ${n} restante(s) (valable jusqu’au ${d})`,
    snap: "※Les informations du carnet sont celles au moment de l’envoi de cet e-mail.",
    pThanks: (st) => `Merci d’avoir acheté un carnet de séances chez « ${st} ».`, pBelow: "Voici le détail de votre achat.",
    pAvail: (n) => `Séances disponibles ${n}`, pValid: (d, v) => `Valable jusqu’au ${d} (${v} à compter de la date d’achat)`, pPrice: (p) => `Prix ${p} (payé au salon)`,
    pRev1: (n) => `À l’occasion de cet achat, ${n} séance(s) non utilisée(s) d’un carnet acheté précédemment et expiré ont été réintégrée(s).`,
    pRevSrc: (d, pl, t, u, ex, c) => `・Depuis « ${pl} » acheté le ${d} (${u} utilisée(s) sur ${t}, expiré le ${ex}) : ${c}`,
    pRev2: (pl, l, d, v) => `Les séances réintégrées sont utilisables sous le nom « ${pl} » : ${l} restante(s), valable jusqu’au ${d} (${v} à compter de la date de cet achat).`,
    pUse: "Si vous choisissez d’utiliser un carnet lors de la réservation, 1 séance est utilisée par réservation.", pMypage: "Vous pouvez consulter vos séances restantes à tout moment dans votre espace.",
    lRefund: (pl) => `Suite à l’annulation de votre réservation, 1 séance de votre carnet « ${pl} » vous a été restituée.`,
    lRevive: (pl) => `Les séances non utilisées d’un carnet acheté précédemment et expiré ont été réintégrées sous le nom « ${pl} ».`,
    lUse: (ref, pl) => `1 séance de votre carnet « ${pl} » a été utilisée pour votre réservation (n° ${ref}).`,
    l0: "Il ne vous reste plus aucune séance. Vous pouvez acheter un nouveau carnet à tout moment dans votre espace.",
    lFew: "Il ne vous reste que peu de séances. Vous pouvez acheter un nouveau carnet à tout moment dans votre espace.",
    lMany: "Vous pouvez consulter vos séances restantes à tout moment dans votre espace (« Connexion » en haut à droite du site de réservation → « Carnets »).",
    xToday: "Votre carnet de séances expire aujourd’hui.", xSoon: (d) => `Votre carnet de séances arrive bientôt à expiration (encore ${d} jour(s) avant la date de validité).`,
    xName: (pl) => `Carnet : ${pl}`, xLeft: (n) => `Séances restantes : ${n}`, xValid: (d) => `Valable jusqu’au : ${d}`, xBreak: (d, pl, n) => `(Détail : ${n} réintégrée(s) depuis « ${pl} » acheté le ${d})`,
    xUse: "Pensez à utiliser vos séances restantes avant la date de validité.", xAfter: "Après cette date, le carnet ne pourra plus être utilisé ; nous attendons votre réservation au plus tôt.",
    xBook: "Vous pouvez réserver sur le site de réservation ci-dessous.", xRegards: (st) => `Au plaisir de vous accueillir à nouveau chez « ${st} ».`,
    wThanks: (st) => `Merci de vous être inscrit comme membre de « ${st} ».`, wKeep: "Voici vos informations d’inscription. Elles vous seront nécessaires pour vous connecter ; conservez précieusement cet e-mail.",
    loginId: (e) => `Identifiant (adresse e-mail) : ${e}`, password: (m) => `Mot de passe : ${m}`, registered: (d) => `Date d’inscription : ${d}`,
    loginHere: "Se connecter ici ⇒", wTopRight: "Vous pouvez aussi vous connecter via « Connexion » en haut à droite du site de réservation. Dans votre espace, vous pouvez à tout moment consulter, modifier ou annuler vos réservations,",
    wTopRight2: "ainsi qu’acheter des carnets de séances et consulter les séances restantes.", wBanner: "Les membres voient aussi les carnets en haut des pages [Réserver] et [Menu] et peuvent les utiliser lors de la réservation.",
    wForgotHead: "■En cas d’oubli du mot de passe", wForgot: "Saisissez votre adresse e-mail à l’adresse ci-dessous : nous vous enverrons un lien de réinitialisation du mot de passe.",
    wSecret: "※Cet e-mail contient votre mot de passe. Veillez à ce que personne d’autre ne le voie.", wNotMe: "※Si vous n’êtes pas à l’origine de cet e-mail, merci de contacter le salon.",
    rReceived: "Nous avons bien reçu votre demande de réinitialisation du mot de passe.", rOpen: "Ouvrez l’adresse ci-dessous et définissez un nouveau mot de passe.",
    rUrl: "Adresse de réinitialisation du mot de passe", rValid: (d) => `Valable jusqu’au : ${d} (utilisable une seule fois)`,
    rExpired: "Une adresse expirée ou déjà utilisée ne peut pas être ouverte. Veuillez recommencer la procédure depuis le lien ci-dessous.",
    rNotMe: "※Si vous n’êtes pas à l’origine de cette demande, supprimez cet e-mail. Votre mot de passe ne sera pas modifié.",
    cDone: "Le mot de passe de votre compte membre a été modifié.", cAt: (d) => `Date de modification : ${d}`, cVia: (r) => `Méthode : ${r ? "adresse de réinitialisation du mot de passe" : "informations du membre dans votre espace"}`,
    cLogin: "Connectez-vous avec votre nouveau mot de passe via « Connexion » en haut à droite du site de réservation.",
    cNotMe: "※Si vous n’êtes pas à l’origine de cette opération, réinitialisez immédiatement votre mot de passe depuis le lien ci-dessous et contactez le salon.",
    foot: ["■Pour toute question concernant votre réservation, veuillez contacter le salon concerné.", "",
      "■Ce service est exploité et fourni par CN Wing Kikaku Co., Ltd. (CNウィング企画株式会社).", "",
      "■Cet e-mail a été envoyé depuis une adresse d’envoi uniquement.", "Nous ne pouvons ni lire ni répondre aux réponses envoyées à cette adresse.", "",
      "■Si vous n’êtes pas à l’origine de cet e-mail, merci d’en informer notre support technique.", "Support technique : cnsalon2021@gmail.com"],
  },
  es: {
    dear: (n) => `Estimado/a ${n}:`, customer: "Cliente",
    s: { confirm: "Confirmación de su reserva", remind: "Recordatorio de su reserva", change: "Aviso de cambio de su reserva", cancel: "Cancelación de su reserva",
      purchase: "Compra de su bono de sesiones", left: (n) => `Sesiones restantes de su bono (quedan ${n})`, expiry: "Su bono de sesiones caducará pronto",
      welcome: "Registro completado", reset: "Instrucciones para restablecer la contraseña", passChanged: "Cambio de contraseña completado" },
    bookingId: (id) => `ID de reserva ${id}`, total: (p) => `Total ${p}`, guests: (n) => `Personas ${n}`,
    timeFrom: (d, t) => `${d}  ${t}–`, timeRange: (d, a, b, min) => `${d}  ${a}–${b} (${min} min)`,
    thanksBook: (st) => `Gracias por reservar en «${st}».`, thanksUse: (st) => `Gracias por confiar siempre en «${st}».`,
    detailsBelow: "Los detalles de su reserva son los siguientes.", changedBelow: "Le informamos de que su reserva se ha cambiado a lo siguiente.",
    cancelledBelow: "Le informamos de que se ha cancelado la siguiente reserva.", lookForward: "Esperamos con ilusión su visita.",
    late: "■Si va a llegar después de la hora de inicio, avísenos por teléfono.",
    howChange: "■Para cambiar su reserva, cancélela primero y vuelva a reservar.",
    busy: "※Según la ocupación, puede que no sea posible volver a reservar. Gracias por su comprensión.",
    memberChange: "※Si está registrado como miembro (con sesión iniciada), también puede cambiar la fecha y la hora en Mi página.",
    cancelHere: "Para cancelar su reserva ⇒", checkCancel: "Para consultar o cancelar su reserva ⇒",
    cancelledOnMypage: "Puede consultar la reserva cancelada en Mi página ⇒", again: "Esperamos volver a atenderle pronto.",
    remindLead: "Se acerca la fecha de su reserva, por lo que le enviamos este recordatorio.",
    staffNom: (n, others) => `Terapeuta ${n} (solicitado)` + (others.length ? `, ${others.join(", ")}` : ""), staff: (names) => `Terapeuta ${names.join(", ")}`,
    feeTicket: "Precio del tratamiento Pagado con bono de sesiones (1 sesión)", fee: (p, n) => `Precio del tratamiento ${p}` + (n > 1 ? ` × ${n} personas` : ""),
    nomFee: (p) => `Cargo por designación ${p}`, lateFee: (p) => `Recargo nocturno ${p}`,
    payHead: "■Pago", payAtSalon: "Abone el importe total en el salón el día de su visita.",
    payFee: "Si paga con un medio distinto del efectivo (tarjeta de crédito, dinero electrónico, pago con código QR, etc.), se cobrará una comisión del 5 % del importe pagado según los Términos de uso (el pago en efectivo no tiene comisión).",
    payTicket: "Esta reserva se paga con un bono de sesiones.", placeHead: "■Lugar", map: (u) => `Mapa y acceso ⇒ ${u}`,
    noticeHead: "■Información para su visita", notice: "Si necesita cambiar su reserva o va a llegar tarde, le agradeceríamos que nos avisara con antelación.", contact: (e) => `Contacto: ${e}`,
    tkReturnedNoData: (pl) => `Se le ha devuelto 1 sesión de su bono «${pl}».`, tkLeftNow: (n) => `Sesiones restantes ahora: ${n}`,
    tkUseNoData: "Se usará 1 sesión de su bono para esta reserva.", tkLeftAfter: (n) => `Sesiones restantes después de esta reserva: ${n}`, tkUsedName: (pl) => `(Bono utilizado: ${pl})`,
    tkReturned: (pl) => `Se le ha devuelto 1 sesión de su bono «${pl}». El estado actual de su bono es el siguiente.`,
    tkNoReturn: "Como la cancelación se hizo después de la hora de inicio, la sesión no se devuelve. El estado actual de su bono es el siguiente.",
    tkUsed1: "Se usa 1 sesión de su bono para esta reserva (la sesión de esta reserva ya está descontada).", tkUsed2: "El estado actual de su bono es el siguiente.",
    purchased: (d) => `Fecha de compra ${d}`, remain: (l, t, u) => `Sesiones restantes ${l} (${u} usadas de ${t})`,
    breakdown: (d, pl, n) => `Desglose ${n} restablecidas de «${pl}» comprado el ${d}`, validUntil: (d) => `Válido hasta ${d}`, status: (s) => `Estado ${s}`,
    usage: { none: "No se puede usar porque no quedan sesiones", expired: "No se puede usar porque ha caducado", ok: "Se puede usar" },
    othersHead: "Otros bonos que puede usar", other: (pl, n, d) => `・${pl}  quedan ${n} (válido hasta el ${d})`,
    snap: "※La información del bono corresponde al momento de enviar este correo.",
    pThanks: (st) => `Gracias por comprar un bono de sesiones de «${st}».`, pBelow: "Los detalles de su compra son los siguientes.",
    pAvail: (n) => `Sesiones disponibles ${n}`, pValid: (d, v) => `Válido hasta ${d} (${v} desde la fecha de compra)`, pPrice: (p) => `Precio ${p} (pago en el salón)`,
    pRev1: (n) => `Junto con esta compra, se han restablecido ${n} sesiones no usadas de un bono comprado anteriormente que había caducado.`,
    pRevSrc: (d, pl, t, u, ex, c) => `・De «${pl}» comprado el ${d} (${u} usadas de ${t}, caducó el ${ex}): ${c}`,
    pRev2: (pl, l, d, v) => `Las sesiones restablecidas se pueden usar como «${pl}»: quedan ${l}, válido hasta el ${d} (${v} desde la fecha de esta compra).`,
    pUse: "Si al reservar elige usar un bono, se usa 1 sesión por reserva.", pMypage: "Puede consultar sus sesiones restantes en Mi página en cualquier momento.",
    lRefund: (pl) => `Debido a la cancelación de su reserva, se le ha devuelto 1 sesión de su bono «${pl}».`,
    lRevive: (pl) => `Las sesiones no usadas de un bono comprado anteriormente que había caducado se han restablecido como «${pl}».`,
    lUse: (ref, pl) => `Se ha usado 1 sesión de su bono «${pl}» para su reserva (n.º de reserva ${ref}).`,
    l0: "Ya no le quedan sesiones. Puede comprar un nuevo bono en Mi página en cualquier momento.", lFew: "Le quedan pocas sesiones. Puede comprar un nuevo bono en Mi página en cualquier momento.",
    lMany: "Puede consultar sus sesiones restantes en cualquier momento en Mi página («Iniciar sesión» arriba a la derecha del sitio de reservas → «Bonos»).",
    xToday: "Su bono de sesiones caduca hoy.", xSoon: (d) => `Su bono de sesiones está a punto de caducar (quedan ${d} día(s) hasta la fecha de caducidad).`,
    xName: (pl) => `Bono: ${pl}`, xLeft: (n) => `Sesiones restantes: ${n}`, xValid: (d) => `Válido hasta: ${d}`, xBreak: (d, pl, n) => `(Desglose: ${n} restablecidas de «${pl}» comprado el ${d})`,
    xUse: "Le recomendamos usar las sesiones restantes antes de la fecha de caducidad.", xAfter: "Pasada esa fecha ya no podrá usar el bono, así que esperamos su reserva cuanto antes.",
    xBook: "Puede reservar en el siguiente sitio de reservas.", xRegards: (st) => `Esperamos seguir atendiéndole en «${st}».`,
    wThanks: (st) => `Gracias por registrarse como miembro de «${st}».`, wKeep: "Sus datos de registro son los siguientes. Los necesitará para iniciar sesión, así que guarde bien este correo.",
    loginId: (e) => `ID de acceso (correo electrónico): ${e}`, password: (m) => `Contraseña: ${m}`, registered: (d) => `Fecha de registro: ${d}`,
    loginHere: "Inicie sesión aquí ⇒", wTopRight: "También puede iniciar sesión con «Iniciar sesión», arriba a la derecha del sitio de reservas. En Mi página puede consultar, cambiar de fecha y hora o cancelar sus reservas,",
    wTopRight2: "y comprar bonos y consultar las sesiones restantes en cualquier momento.", wBanner: "Además, los miembros ven los bonos en la parte superior de las páginas [Reservar] y [Menú] y pueden usarlos al reservar.",
    wForgotHead: "■Si olvida su contraseña", wForgot: "Introduzca su correo electrónico registrado en la dirección siguiente y le enviaremos un enlace para restablecer la contraseña.",
    wSecret: "※Este correo contiene su contraseña. Procure que nadie más lo vea.", wNotMe: "※Si no reconoce este correo, póngase en contacto con el salón.",
    rReceived: "Hemos recibido su solicitud para restablecer la contraseña.", rOpen: "Abra la dirección siguiente y establezca una nueva contraseña.",
    rUrl: "Dirección para restablecer la contraseña", rValid: (d) => `Válido hasta: ${d} (de un solo uso)`,
    rExpired: "Las direcciones caducadas o ya usadas no se pueden abrir. Vuelva a iniciar el trámite desde el enlace siguiente.",
    rNotMe: "※Si no reconoce este correo, elimínelo. Su contraseña no se cambiará.",
    cDone: "Se ha cambiado la contraseña de su cuenta de miembro.", cAt: (d) => `Fecha del cambio: ${d}`, cVia: (r) => `Método: ${r ? "dirección para restablecer la contraseña" : "datos de miembro en Mi página"}`,
    cLogin: "Inicie sesión con la nueva contraseña desde «Iniciar sesión», arriba a la derecha del sitio de reservas.",
    cNotMe: "※Si no ha realizado este cambio, restablezca su contraseña de inmediato desde el enlace siguiente y póngase en contacto con el salón.",
    foot: ["■Si tiene alguna pregunta sobre su reserva, póngase en contacto con el salón en el que reservó.", "",
      "■Este servicio lo gestiona y presta CN Wing Kikaku Co., Ltd. (CNウィング企画株式会社).", "",
      "■Este correo se ha enviado desde una dirección solo de envío.", "Tenga en cuenta que no podemos leer ni contestar las respuestas a este correo.", "",
      "■Si no reconoce este correo, comuníquelo a nuestro soporte del sistema.", "Soporte del sistema: cnsalon2021@gmail.com"],
  },
  it: {
    dear: (n) => `Gentile ${n},`, customer: "Cliente",
    s: { confirm: "Conferma della prenotazione", remind: "Promemoria della prenotazione", change: "Avviso di modifica della prenotazione", cancel: "Annullamento della prenotazione",
      purchase: "Acquisto del carnet di sedute", left: (n) => `Sedute rimanenti del carnet (rimangono ${n})`, expiry: "Il tuo carnet di sedute sta per scadere",
      welcome: "Registrazione completata", reset: "Istruzioni per reimpostare la password", passChanged: "Modifica della password completata" },
    bookingId: (id) => `ID prenotazione ${id}`, total: (p) => `Totale ${p}`, guests: (n) => `Persone ${n}`,
    timeFrom: (d, t) => `${d}  ${t}–`, timeRange: (d, a, b, min) => `${d}  ${a}–${b} (${min} min)`,
    thanksBook: (st) => `Grazie per aver prenotato presso «${st}».`, thanksUse: (st) => `Grazie per aver scelto sempre «${st}».`,
    detailsBelow: "Ecco i dettagli della tua prenotazione.", changedBelow: "Ti informiamo che la prenotazione è stata modificata come segue.",
    cancelledBelow: "Ti informiamo che la seguente prenotazione è stata annullata.", lookForward: "Ti aspettiamo con piacere.",
    late: "■Se arrivi dopo l’orario di inizio, avvisaci per telefono.",
    howChange: "■Per modificare la prenotazione, annullala e poi effettua una nuova prenotazione.",
    busy: "※In base all’affluenza, potrebbe non essere possibile prenotare di nuovo. Grazie per la comprensione.",
    memberChange: "※Se sei registrato come membro (con accesso effettuato), puoi cambiare data e ora anche dalla tua pagina.",
    cancelHere: "Per annullare la prenotazione ⇒", checkCancel: "Per controllare o annullare la prenotazione ⇒",
    cancelledOnMypage: "Puoi controllare la prenotazione annullata nella tua pagina ⇒", again: "Speriamo di rivederti presto.",
    remindLead: "La data della tua prenotazione si avvicina: ecco un promemoria.",
    staffNom: (n, others) => `Operatore ${n} (richiesto)` + (others.length ? `, ${others.join(", ")}` : ""), staff: (names) => `Operatore ${names.join(", ")}`,
    feeTicket: "Prezzo del trattamento Pagato con carnet di sedute (1 seduta)", fee: (p, n) => `Prezzo del trattamento ${p}` + (n > 1 ? ` × ${n} persone` : ""),
    nomFee: (p) => `Costo di designazione ${p}`, lateFee: (p) => `Supplemento notturno ${p}`,
    payHead: "■Pagamento", payAtSalon: "Paga l’importo totale in salone al momento della visita.",
    payFee: "Per pagamenti diversi dal contante (carta di credito, moneta elettronica, pagamento con codice QR, ecc.), in base ai Termini di utilizzo viene applicata una commissione del 5% dell’importo pagato (nessuna commissione per il pagamento in contanti).",
    payTicket: "Questa prenotazione è pagata con un carnet di sedute.", placeHead: "■Luogo", map: (u) => `Mappa e come arrivare ⇒ ${u}`,
    noticeHead: "■Informazioni per la tua visita", notice: "Se devi modificare la prenotazione o sei in ritardo, ti saremmo grati se ce lo comunicassi in anticipo.", contact: (e) => `Contatto: ${e}`,
    tkReturnedNoData: (pl) => `Ti è stata restituita 1 seduta del carnet «${pl}».`, tkLeftNow: (n) => `Sedute rimanenti ora: ${n}`,
    tkUseNoData: "Per questa prenotazione verrà usata 1 seduta del carnet.", tkLeftAfter: (n) => `Sedute rimanenti dopo la prenotazione: ${n}`, tkUsedName: (pl) => `(Carnet usato: ${pl})`,
    tkReturned: (pl) => `Ti è stata restituita 1 seduta del carnet «${pl}». Lo stato attuale del carnet è il seguente.`,
    tkNoReturn: "Poiché l’annullamento è avvenuto dopo l’orario di inizio, la seduta non viene restituita. Lo stato attuale del carnet è il seguente.",
    tkUsed1: "Per questa prenotazione viene usata 1 seduta del carnet (la seduta di questa prenotazione è già stata detratta).", tkUsed2: "Lo stato attuale del carnet è il seguente.",
    purchased: (d) => `Data di acquisto ${d}`, remain: (l, t, u) => `Sedute rimanenti ${l} (${u} usate su ${t})`,
    breakdown: (d, pl, n) => `Dettaglio ${n} ripristinate da «${pl}» acquistato il ${d}`, validUntil: (d) => `Valido fino al ${d}`, status: (s) => `Stato ${s}`,
    usage: { none: "Non utilizzabile: non restano sedute", expired: "Non utilizzabile: la scadenza è passata", ok: "Utilizzabile" },
    othersHead: "Altri carnet che puoi usare", other: (pl, n, d) => `・${pl}  rimangono ${n} (valido fino al ${d})`,
    snap: "※Le informazioni del carnet sono aggiornate al momento dell’invio di questa e-mail.",
    pThanks: (st) => `Grazie per aver acquistato un carnet di sedute di «${st}».`, pBelow: "Ecco i dettagli del tuo acquisto.",
    pAvail: (n) => `Sedute disponibili ${n}`, pValid: (d, v) => `Valido fino al ${d} (${v} dalla data di acquisto)`, pPrice: (p) => `Prezzo ${p} (pagamento in salone)`,
    pRev1: (n) => `Insieme a questo acquisto sono state ripristinate ${n} sedute non usate di un carnet acquistato in precedenza e scaduto.`,
    pRevSrc: (d, pl, t, u, ex, c) => `・Da «${pl}» acquistato il ${d} (${u} usate su ${t}, scaduto il ${ex}): ${c}`,
    pRev2: (pl, l, d, v) => `Le sedute ripristinate si possono usare come «${pl}»: rimangono ${l}, valido fino al ${d} (${v} dalla data di questo acquisto).`,
    pUse: "Se in fase di prenotazione scegli di usare un carnet, viene usata 1 seduta per prenotazione.", pMypage: "Puoi controllare le sedute rimanenti nella tua pagina in qualsiasi momento.",
    lRefund: (pl) => `A seguito dell’annullamento della prenotazione, ti è stata restituita 1 seduta del carnet «${pl}».`,
    lRevive: (pl) => `Le sedute non usate di un carnet acquistato in precedenza e scaduto sono state ripristinate come «${pl}».`,
    lUse: (ref, pl) => `È stata usata 1 seduta del carnet «${pl}» per la tua prenotazione (n. ${ref}).`,
    l0: "Non hai più sedute. Puoi acquistare un nuovo carnet nella tua pagina in qualsiasi momento.", lFew: "Ti restano poche sedute. Puoi acquistare un nuovo carnet nella tua pagina in qualsiasi momento.",
    lMany: "Puoi controllare le sedute rimanenti in qualsiasi momento nella tua pagina («Accedi» in alto a destra del sito di prenotazione → «Carnet»).",
    xToday: "Il tuo carnet di sedute scade oggi.", xSoon: (d) => `Il tuo carnet di sedute sta per scadere (mancano ${d} giorno/i alla scadenza).`,
    xName: (pl) => `Carnet: ${pl}`, xLeft: (n) => `Sedute rimanenti: ${n}`, xValid: (d) => `Valido fino al: ${d}`, xBreak: (d, pl, n) => `(Dettaglio: ${n} ripristinate da «${pl}» acquistato il ${d})`,
    xUse: "Usa le sedute rimanenti prima della scadenza.", xAfter: "Dopo la scadenza il carnet non potrà più essere usato: ti aspettiamo presto per una prenotazione.",
    xBook: "Puoi prenotare dal sito di prenotazione qui sotto.", xRegards: (st) => `Speriamo di accoglierti ancora presso «${st}».`,
    wThanks: (st) => `Grazie per esserti registrato come membro di «${st}».`, wKeep: "Ecco i dati della tua registrazione. Ti serviranno per accedere: conserva con cura questa e-mail.",
    loginId: (e) => `ID di accesso (indirizzo e-mail): ${e}`, password: (m) => `Password: ${m}`, registered: (d) => `Data di registrazione: ${d}`,
    loginHere: "Accedi da qui ⇒", wTopRight: "Puoi accedere anche da «Accedi» in alto a destra del sito di prenotazione. Nella tua pagina puoi controllare, spostare o annullare le prenotazioni,",
    wTopRight2: "e acquistare carnet di sedute e controllare le sedute rimanenti in qualsiasi momento.", wBanner: "Inoltre i membri vedono i carnet nella parte alta delle pagine [Prenota] e [Menu] e possono usarli quando prenotano.",
    wForgotHead: "■Se dimentichi la password", wForgot: "Inserisci l’indirizzo e-mail registrato all’indirizzo qui sotto: ti invieremo un link per reimpostare la password.",
    wSecret: "※Questa e-mail contiene la tua password. Fai attenzione che nessun altro la veda.", wNotMe: "※Se non riconosci questa e-mail, contatta il salone.",
    rReceived: "Abbiamo ricevuto la tua richiesta di reimpostare la password.", rOpen: "Apri l’indirizzo qui sotto e imposta una nuova password.",
    rUrl: "Indirizzo per reimpostare la password", rValid: (d) => `Valido fino al: ${d} (utilizzabile una sola volta)`,
    rExpired: "Gli indirizzi scaduti o già usati non si possono aprire. Ripeti la procedura dal link qui sotto.",
    rNotMe: "※Se non riconosci questa e-mail, eliminala. La password non verrà modificata.",
    cDone: "La password del tuo account membro è stata modificata.", cAt: (d) => `Data della modifica: ${d}`, cVia: (r) => `Metodo: ${r ? "indirizzo per reimpostare la password" : "dati del membro nella tua pagina"}`,
    cLogin: "Accedi con la nuova password da «Accedi» in alto a destra del sito di prenotazione.",
    cNotMe: "※Se non hai effettuato tu questa modifica, reimposta subito la password dal link qui sotto e contatta il salone.",
    foot: ["■Per qualsiasi domanda sulla prenotazione, contatta il salone presso cui hai prenotato.", "",
      "■Questo servizio è gestito e fornito da CN Wing Kikaku Co., Ltd. (CNウィング企画株式会社).", "",
      "■Questa e-mail è stata inviata da un indirizzo di solo invio.", "Non possiamo leggere né rispondere alle risposte inviate a questa e-mail.", "",
      "■Se non riconosci questa e-mail, segnalalo al nostro supporto di sistema.", "Supporto di sistema: cnsalon2021@gmail.com"],
  },
  de: {
    dear: (n) => `Guten Tag ${n},`, customer: "Kunde",
    s: { confirm: "Reservierungsbestätigung", remind: "Erinnerung an Ihre Reservierung", change: "Änderung Ihrer Reservierung", cancel: "Stornierung Ihrer Reservierung",
      purchase: "Kauf Ihrer Mehrfachkarte", left: (n) => `Verbleibende Behandlungen auf Ihrer Mehrfachkarte (noch ${n})`, expiry: "Ihre Mehrfachkarte läuft bald ab",
      welcome: "Registrierung abgeschlossen", reset: "Anleitung zum Zurücksetzen des Passworts", passChanged: "Passwortänderung abgeschlossen" },
    bookingId: (id) => `Reservierungs-ID ${id}`, total: (p) => `Gesamt ${p}`, guests: (n) => `Personen ${n}`,
    timeFrom: (d, t) => `${d}  ${t}–`, timeRange: (d, a, b, min) => `${d}  ${a}–${b} (${min} Min.)`,
    thanksBook: (st) => `Vielen Dank für Ihre Reservierung bei „${st}“.`, thanksUse: (st) => `Vielen Dank, dass Sie „${st}“ immer wieder besuchen.`,
    detailsBelow: "Ihre Reservierungsdaten lauten wie folgt.", changedBelow: "Wir teilen Ihnen mit, dass Ihre Reservierung wie folgt geändert wurde.",
    cancelledBelow: "Wir teilen Ihnen mit, dass die folgende Reservierung storniert wurde.", lookForward: "Wir freuen uns auf Ihren Besuch.",
    late: "■Wenn Sie sich zum Beginn verspäten, rufen Sie uns bitte an.",
    howChange: "■Um Ihre Reservierung zu ändern, stornieren Sie sie bitte zunächst und reservieren Sie dann neu.",
    busy: "※Je nach Auslastung ist eine erneute Reservierung eventuell nicht möglich. Wir bitten um Ihr Verständnis.",
    memberChange: "※Als registriertes Mitglied (angemeldet) können Sie Datum und Uhrzeit auch auf Meine Seite ändern.",
    cancelHere: "Reservierung stornieren ⇒", checkCancel: "Reservierung prüfen oder stornieren ⇒",
    cancelledOnMypage: "Die stornierte Reservierung können Sie auf Meine Seite einsehen ⇒", again: "Wir freuen uns auf Ihren nächsten Besuch.",
    remindLead: "Ihr Reservierungstermin rückt näher; hier ist Ihre Erinnerung.",
    staffNom: (n, others) => `Behandelnde Fachkraft ${n} (gewünscht)` + (others.length ? `, ${others.join(", ")}` : ""), staff: (names) => `Behandelnde Fachkraft ${names.join(", ")}`,
    feeTicket: "Behandlungspreis Mit Mehrfachkarte bezahlt (1 Behandlung)", fee: (p, n) => `Behandlungspreis ${p}` + (n > 1 ? ` × ${n} Personen` : ""),
    nomFee: (p) => `Nominierungsgebühr ${p}`, lateFee: (p) => `Nachtzuschlag ${p}`,
    payHead: "■Bezahlung", payAtSalon: "Bitte bezahlen Sie den Gesamtbetrag bei Ihrem Besuch im Salon.",
    payFee: "Bei Zahlung mit anderen Mitteln als Bargeld (Kreditkarte, E-Geld, QR-Code-Zahlung usw.) wird gemäß den Nutzungsbedingungen eine Zahlungsgebühr von 5 % des Zahlungsbetrags erhoben (bei Barzahlung fällt keine Gebühr an).",
    payTicket: "Diese Reservierung wird mit einer Mehrfachkarte bezahlt.", placeHead: "■Ort", map: (u) => `Karte & Anfahrt ⇒ ${u}`,
    noticeHead: "■Hinweise zu Ihrem Besuch", notice: "Wenn Sie Ihre Reservierung ändern müssen oder sich verspäten, geben Sie uns bitte vorher Bescheid.", contact: (e) => `Kontakt: ${e}`,
    tkReturnedNoData: (pl) => `1 Behandlung Ihrer Mehrfachkarte „${pl}“ wurde zurückgebucht.`, tkLeftNow: (n) => `Aktuell verbleibende Behandlungen: ${n}`,
    tkUseNoData: "Für diese Reservierung wird 1 Behandlung Ihrer Mehrfachkarte verwendet.", tkLeftAfter: (n) => `Verbleibende Behandlungen nach dieser Reservierung: ${n}`, tkUsedName: (pl) => `(Verwendete Mehrfachkarte: ${pl})`,
    tkReturned: (pl) => `1 Behandlung Ihrer Mehrfachkarte „${pl}“ wurde zurückgebucht. Der aktuelle Stand Ihrer Mehrfachkarte ist wie folgt.`,
    tkNoReturn: "Da die Stornierung nach Beginn des Termins erfolgte, wird die Behandlung nicht zurückgebucht. Der aktuelle Stand Ihrer Mehrfachkarte ist wie folgt.",
    tkUsed1: "Für diese Reservierung wird 1 Behandlung Ihrer Mehrfachkarte verwendet (die Behandlung dieser Reservierung ist bereits abgezogen).", tkUsed2: "Der aktuelle Stand Ihrer Mehrfachkarte ist wie folgt.",
    purchased: (d) => `Kaufdatum ${d}`, remain: (l, t, u) => `Verbleibende Behandlungen ${l} (${u} von ${t} verwendet)`,
    breakdown: (d, pl, n) => `Aufschlüsselung ${n} wiederhergestellt aus „${pl}“ (gekauft am ${d})`, validUntil: (d) => `Gültig bis ${d}`, status: (s) => `Status ${s}`,
    usage: { none: "Nicht verwendbar, da keine Behandlungen mehr übrig sind", expired: "Nicht verwendbar, da das Ablaufdatum überschritten ist", ok: "Verwendbar" },
    othersHead: "Weitere Mehrfachkarten, die Sie verwenden können", other: (pl, n, d) => `・${pl}  noch ${n} (gültig bis ${d})`,
    snap: "※Die Angaben zur Mehrfachkarte entsprechen dem Stand beim Versand dieser E-Mail.",
    pThanks: (st) => `Vielen Dank für den Kauf einer Mehrfachkarte bei „${st}“.`, pBelow: "Ihre Kaufdaten lauten wie folgt.",
    pAvail: (n) => `Verfügbare Behandlungen ${n}`, pValid: (d, v) => `Gültig bis ${d} (${v} ab Kaufdatum)`, pPrice: (p) => `Preis ${p} (Bezahlung im Salon)`,
    pRev1: (n) => `Zusammen mit diesem Kauf wurden ${n} nicht genutzte Behandlung(en) einer früher gekauften, abgelaufenen Mehrfachkarte wiederhergestellt.`,
    pRevSrc: (d, pl, t, u, ex, c) => `・Aus „${pl}“ (gekauft am ${d}, ${u} von ${t} verwendet, abgelaufen am ${ex}): ${c}`,
    pRev2: (pl, l, d, v) => `Die wiederhergestellten Behandlungen können als „${pl}“ verwendet werden: noch ${l}, gültig bis ${d} (${v} ab dem Datum dieses Kaufs).`,
    pUse: "Wenn Sie bei der Reservierung die Mehrfachkarte verwenden, wird pro Reservierung 1 Behandlung abgezogen.", pMypage: "Ihre verbleibenden Behandlungen können Sie jederzeit auf Meine Seite einsehen.",
    lRefund: (pl) => `Aufgrund der Stornierung Ihrer Reservierung wurde 1 Behandlung Ihrer Mehrfachkarte „${pl}“ zurückgebucht.`,
    lRevive: (pl) => `Nicht genutzte Behandlungen einer früher gekauften, abgelaufenen Mehrfachkarte wurden als „${pl}“ wiederhergestellt.`,
    lUse: (ref, pl) => `Für Ihre Reservierung (Reservierungsnummer ${ref}) wurde 1 Behandlung Ihrer Mehrfachkarte „${pl}“ verwendet.`,
    l0: "Sie haben keine Behandlungen mehr übrig. Eine neue Mehrfachkarte können Sie jederzeit auf Meine Seite kaufen.",
    lFew: "Sie haben nur noch wenige Behandlungen übrig. Eine neue Mehrfachkarte können Sie jederzeit auf Meine Seite kaufen.",
    lMany: "Ihre verbleibenden Behandlungen können Sie jederzeit auf Meine Seite einsehen („Anmelden“ oben rechts auf der Reservierungsseite → „Mehrfachkarten“).",
    xToday: "Ihre Mehrfachkarte ist nur noch heute gültig.", xSoon: (d) => `Ihre Mehrfachkarte läuft bald ab (noch ${d} Tag(e) bis zum Ablaufdatum).`,
    xName: (pl) => `Mehrfachkarte: ${pl}`, xLeft: (n) => `Verbleibende Behandlungen: ${n}`, xValid: (d) => `Gültig bis: ${d}`, xBreak: (d, pl, n) => `(Aufschlüsselung: ${n} wiederhergestellt aus „${pl}“, gekauft am ${d})`,
    xUse: "Bitte nutzen Sie Ihre verbleibenden Behandlungen vor dem Ablaufdatum.", xAfter: "Nach dem Ablaufdatum kann die Mehrfachkarte nicht mehr verwendet werden; wir freuen uns auf Ihre baldige Reservierung.",
    xBook: "Reservieren können Sie auf der folgenden Reservierungsseite.", xRegards: (st) => `Wir freuen uns, Sie weiterhin bei „${st}“ begrüßen zu dürfen.`,
    wThanks: (st) => `Vielen Dank für Ihre Registrierung als Mitglied von „${st}“.`, wKeep: "Ihre Registrierungsdaten lauten wie folgt. Sie benötigen sie zur Anmeldung; bitte bewahren Sie diese E-Mail sorgfältig auf.",
    loginId: (e) => `Login-ID (E-Mail-Adresse): ${e}`, password: (m) => `Passwort: ${m}`, registered: (d) => `Registriert am: ${d}`,
    loginHere: "Hier anmelden ⇒", wTopRight: "Sie können sich auch über „Anmelden“ oben rechts auf der Reservierungsseite anmelden. Auf Meine Seite können Sie Reservierungen jederzeit prüfen, verschieben und stornieren",
    wTopRight2: "sowie Mehrfachkarten kaufen und die verbleibenden Behandlungen einsehen.", wBanner: "Außerdem sehen Mitglieder Mehrfachkarten oben auf den Seiten [Reservieren] und [Menü] und können sie bei der Reservierung verwenden.",
    wForgotHead: "■Wenn Sie Ihr Passwort vergessen haben", wForgot: "Geben Sie unter der folgenden Adresse Ihre registrierte E-Mail-Adresse ein; wir senden Ihnen dann einen Link zum Zurücksetzen des Passworts.",
    wSecret: "※Diese E-Mail enthält Ihr Passwort. Bitte achten Sie darauf, dass niemand anderes sie sieht.", wNotMe: "※Wenn Sie diese E-Mail nicht erwartet haben, wenden Sie sich bitte an den Salon.",
    rReceived: "Wir haben Ihre Anfrage zum Zurücksetzen des Passworts erhalten.", rOpen: "Bitte öffnen Sie die folgende Adresse und legen Sie ein neues Passwort fest.",
    rUrl: "Adresse zum Zurücksetzen des Passworts", rValid: (d) => `Gültig bis: ${d} (nur einmal verwendbar)`,
    rExpired: "Abgelaufene oder bereits verwendete Adressen können nicht geöffnet werden. Bitte starten Sie den Vorgang über den folgenden Link erneut.",
    rNotMe: "※Wenn Sie diese E-Mail nicht erwartet haben, löschen Sie sie bitte. Ihr Passwort wird nicht geändert.",
    cDone: "Das Passwort Ihres Mitgliedskontos wurde geändert.", cAt: (d) => `Geändert am: ${d}`, cVia: (r) => `Art der Änderung: ${r ? "Adresse zum Zurücksetzen des Passworts" : "Mitgliedsdaten auf Meine Seite"}`,
    cLogin: "Bitte melden Sie sich mit Ihrem neuen Passwort über „Anmelden“ oben rechts auf der Reservierungsseite an.",
    cNotMe: "※Wenn Sie diese Änderung nicht vorgenommen haben, setzen Sie Ihr Passwort bitte sofort über den folgenden Link zurück und wenden Sie sich an den Salon.",
    foot: ["■Bei Fragen zu Ihrer Reservierung wenden Sie sich bitte an den Salon, bei dem Sie reserviert haben.", "",
      "■Dieser Dienst wird von CN Wing Kikaku Co., Ltd. (CNウィング企画株式会社) betrieben und bereitgestellt.", "",
      "■Diese E-Mail wurde von einer reinen Versandadresse gesendet.", "Bitte beachten Sie, dass wir Antworten auf diese E-Mail weder lesen noch beantworten können.", "",
      "■Wenn Sie diese E-Mail nicht erwartet haben, informieren Sie bitte unseren Systemsupport.", "Systemsupport: cnsalon2021@gmail.com"],
  },
};

// h：demo-api.js の部品（予約・回数券・会員のデータと、日本語版と共通の計算）
module.exports = function makeMailI18n(h) {
  const tr = (lang) => P[lang];
  const common = (lang) => ["", "", ...tr(lang).foot, h.SEP, h.MAIL_STORE, ADDRESS[lang], h.MAIL_TEL].join("\n");
  // 予約内容ブロック（日本語版 mailBlock と同じ並び）
  const block = (lang, bk) => {
    const L = tr(lang), d = bk.service_date;
    return [h.SEP, L.timeFrom(dateOfDay(lang, d, true), h.fmtTime(d, bk.start_at)), L.bookingId(h.displayId(bk)),
      `　${categoryOf(bk.course, lang)} ${menuName(bk.course_name, lang)}`, "", L.total(yen(lang, bk.total)), h.SEP].join("\n");
  };
  const usage = (lang, t) => (t.uses_left <= 0 ? tr(lang).usage.none : Date.now() > t.expires_at ? tr(lang).usage.expired : tr(lang).usage.ok);
  const infoBlock = (lang, t) => {
    const L = tr(lang);
    return [h.SEP, `　${planName(t.plan_name, lang)}`, L.purchased(dateOfMs(lang, Date.parse(t.purchased_at))),
      L.remain(t.uses_left, t.uses_total, h.ticketUsedCount(t)),
      ...(t.kind === "revival" ? (t.revived_from || []).map((x) => L.breakdown(dateOfMs(lang, Date.parse(x.purchased_at)), planName(x.plan_name, lang), x.count)) : []),
      L.validUntil(dateOfMs(lang, t.expires_at)), L.status(usage(lang, t)), h.SEP];
  };
  const otherLines = (lang, others) => (others.length
    ? ["", tr(lang).othersHead, ...others.map((x) => tr(lang).other(planName(x.plan_name, lang), x.uses_left, dateOfMs(lang, x.expires_at)))] : []);
  const ticketLines = (lang, bk) => {
    const L = tr(lang);
    if (!bk.ticket_id) return [];
    const t = h.state.tickets.get(bk.ticket_id);
    if (!t) {
      return bk.ticket_refunded
        ? [L.tkReturnedNoData(planName(bk.ticket_name, lang)), L.tkLeftNow(bk.ticket_left_after), ""]
        : [L.tkUseNoData, L.tkLeftAfter(bk.ticket_left_after), L.tkUsedName(planName(bk.ticket_name, lang)), ""];
    }
    const lead = bk.ticket_refunded ? [L.tkReturned(planName(t.plan_name, lang))] : bk.status === "cancelled" ? [L.tkNoReturn] : [L.tkUsed1, L.tkUsed2];
    return [...lead, ...infoBlock(lang, t), ...otherLines(lang, h.otherUsableTickets(t)), L.snap, ""];
  };
  const staffLine = (lang, bk) => {
    const L = tr(lang);
    const found = h.findBooking(bk.id);
    const ev = found ? h.ensureEvents(found.date) : null;
    const ids = ev ? ev.assignments.filter((a) => a.booking_id === bk.id).map((a) => a.staff_id) : [];
    const nameOf = (id) => { const st = h.state.staff.find((s) => s.id === id); return st ? (h.profileOf(st).nickname || st.name) : null; };
    if (bk.nominated_staff_id) {
      const others = ids.filter((id) => id !== bk.nominated_staff_id).map(nameOf).filter(Boolean);
      return L.staffNom(nameOf(bk.nominated_staff_id) || bk.nominated_staff_name || "", others);
    }
    const names = ids.map(nameOf).filter(Boolean);
    return names.length ? L.staff(names) : null;
  };
  const priceLines = (lang, bk) => {
    const L = tr(lang), people = bk.people || 1, base = (bk.base_price || 0) * people, fee = bk.nomination_fee || 0, late = bk.total - base - fee;
    if (late < 0) return [L.total(yen(lang, bk.total))];
    const lines = [bk.ticket_id ? L.feeTicket : L.fee(yen(lang, bk.base_price || 0), people)];
    if (fee > 0) lines.push(L.nomFee(yen(lang, fee)));
    if (late > 0) lines.push(L.lateFee(yen(lang, late)));
    lines.push(L.total(yen(lang, bk.total)));
    return lines;
  };
  const sub = (lang, s) => `${h.MAIL_STORE} ${s}`;
  const o = () => h.origin();
  const booking = {
    customerConfirm: (lang, bk) => { const L = tr(lang); return { subject: sub(lang, L.s.confirm), body: [
      L.thanksBook(h.MAIL_STORE), L.detailsBelow, "", block(lang, bk), ...ticketLines(lang, bk), L.lookForward, "", L.late, h.MAIL_TEL, "",
      L.howChange, L.busy, L.cancelHere, h.bookingMypageUrl(bk)].join("\n") + common(lang) }; },
    customerRemind: (lang, bk) => {
      const L = tr(lang), d = bk.service_date, minutes = Math.round((bk.end_at - bk.start_at) / 60000), sl = staffLine(lang, bk);
      return { subject: sub(lang, L.s.remind), body: [
        L.dear(bk.name), "", L.remindLead, L.detailsBelow, "", h.SEP,
        L.timeRange(dateOfDay(lang, d, true), h.fmtTime(d, bk.start_at), h.fmtTime(d, bk.end_at), minutes),
        L.bookingId(h.displayId(bk)), `　${categoryOf(bk.course, lang)} ${menuName(bk.course_name, lang)}`, L.guests(bk.people || 1),
        ...(sl ? [sl] : []), "", ...priceLines(lang, bk), h.SEP, ...ticketLines(lang, bk),
        L.payHead, ...(bk.total > 0 ? [L.payAtSalon, L.payFee] : [L.payTicket]), "",
        L.placeHead, h.MAIL_STORE, ADDRESS[lang], L.map(`${o()}/map`), "", L.lookForward, "", L.late, h.MAIL_TEL, "",
        L.noticeHead, L.notice, L.contact(h.VISIT_CONTACT_MAIL), "", L.howChange, L.busy, L.memberChange, L.checkCancel, h.bookingMypageUrl(bk),
      ].join("\n") + common(lang) };
    },
    customerChange: (lang, bk) => { const L = tr(lang); return { subject: sub(lang, L.s.change), body: [
      L.thanksUse(h.MAIL_STORE), L.changedBelow, "", block(lang, bk), ...ticketLines(lang, bk), L.lookForward].join("\n") + common(lang) }; },
    customerCancel: (lang, bk) => { const L = tr(lang); return { subject: sub(lang, L.s.cancel), body: [
      L.thanksUse(h.MAIL_STORE), L.cancelledBelow, "", block(lang, bk), ...ticketLines(lang, bk), L.cancelledOnMypage, h.bookingMypageUrl(bk), "",
      L.again, `${o()}/cn-ueno-health-and-beauty`].join("\n") + common(lang) }; },
  };
  booking.customerChangeRemind = booking.customerRemind;
  const ticket = {
    ticketPurchase: (lang, p) => {
      const L = tr(lang), t = h.state.tickets.get(p.ticketId);
      if (!t) return null;
      const others = h.otherUsableTickets(t), v = validFor(lang, t.valid_months);
      const rv = t.revival && t.revival.total ? h.state.tickets.get(t.revival.ticket_id) : null;
      return { subject: sub(lang, L.s.purchase), body: [
        L.pThanks(h.MAIL_STORE), L.pBelow, "", h.SEP, `　${planName(t.plan_name, lang)}`, L.purchased(dateOfMs(lang, Date.parse(t.purchased_at))),
        L.pAvail(t.uses_total), L.remain(t.uses_left, t.uses_total, h.ticketUsedCount(t)), L.pValid(dateOfMs(lang, t.expires_at), v),
        L.status(usage(lang, t)), L.pPrice(yen(lang, t.price)), h.SEP,
        ...(rv ? ["", L.pRev1(t.revival.total),
          ...(rv.revived_from || []).map((x) => L.pRevSrc(dateOfMs(lang, Date.parse(x.purchased_at)), planName(x.plan_name, lang), x.uses_total, x.used, dateOfMs(lang, x.expired_at), x.count)),
          L.pRev2(planName(rv.plan_name, lang), rv.uses_left, dateOfMs(lang, rv.expires_at), v)] : []),
        ...otherLines(lang, others.filter((x) => !(t.revival && x.id === t.revival.ticket_id))),
        "", L.pUse, L.pMypage, L.snap].join("\n") + common(lang) };
    },
    ticketLeft: (lang, p) => {
      const L = tr(lang), t = h.state.tickets.get(p.ticketId);
      if (!t) return null;
      const left = t.uses_left, pl = planName(t.plan_name, lang);
      const head = p.kind === "refund" ? L.lRefund(pl) : p.kind === "revive" ? L.lRevive(pl) : L.lUse(p.ref || "-", pl);
      return { subject: sub(lang, L.s.left(left)), body: [
        head, "", ...infoBlock(lang, t), left === 0 ? L.l0 : left <= 2 ? L.lFew : L.lMany,
        ...otherLines(lang, h.otherUsableTickets(t)), L.snap, `${o()}/mypage?tab=tickets`].join("\n") + common(lang) };
    },
    ticketRemind: (lang, p) => {
      const L = tr(lang), t = h.state.tickets.get(p.ticketId);
      if (!t) return null;
      const mem = t.member_email ? h.state.members.get(t.member_email) : null;
      const name = (mem && mem.name) || t.buyer_name || L.customer;
      const jday = (ms) => { const d = new Date(ms + 9 * 3600e3); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
      const left = Math.max(0, Math.round((jday(t.expires_at) - jday(Date.now())) / 86400e3));
      return { subject: sub(lang, L.s.expiry), body: [
        L.dear(name), "", L.thanksUse(h.MAIL_STORE), left === 0 ? L.xToday : L.xSoon(left), "", h.SEP,
        L.xName(planName(t.plan_name, lang)), L.xLeft(t.uses_left), L.xValid(dateOfMs(lang, t.expires_at)),
        ...(t.kind === "revival" ? (t.revived_from || []).map((x) => L.xBreak(dateOfMs(lang, Date.parse(x.purchased_at)), planName(x.plan_name, lang), x.count)) : []),
        h.SEP, "", L.xUse, L.xAfter, ...otherLines(lang, h.otherUsableTickets(t)), "", L.xBook, `${o()}/book`, "",
        L.pMypage, `${o()}/mypage?tab=tickets`, "", L.xRegards(h.MAIL_STORE), L.snap].join("\n") + common(lang) };
    },
  };
  const member = {
    welcome: (lang, mm) => { const L = tr(lang); return { subject: sub(lang, L.s.welcome), body: [
      ...(mm.name ? [L.dear(mm.name), ""] : []), L.wThanks(h.MAIL_STORE), L.wKeep, "", h.SEP,
      L.loginId(mm.email), L.password(h.MASK_PASS), L.registered(dateTimeOfMs(lang, mm.createdAt)), h.SEP,
      L.loginHere, `${o()}/login`, "", L.wTopRight, L.wTopRight2, L.wBanner, "", L.wForgotHead, L.wForgot, `${o()}/login?forgot=1`, "",
      L.wSecret, L.wNotMe, L.contact(h.VISIT_CONTACT_MAIL)].join("\n") + common(lang) }; },
    reset: (lang, mm) => { const L = tr(lang); return { subject: sub(lang, L.s.reset), body: [
      ...(mm.name ? [L.dear(mm.name), ""] : []), L.rReceived, L.rOpen, "", h.SEP, L.rUrl, h.MASK_RESET, L.rValid(dateTimeOfMs(lang, mm.exp)), h.SEP,
      L.rExpired, `${o()}/login?forgot=1`, "", L.rNotMe].join("\n") + common(lang) }; },
    passChanged: (lang, mm) => { const L = tr(lang); return { subject: sub(lang, L.s.passChanged), body: [
      ...(mm.name ? [L.dear(mm.name), ""] : []), L.cDone, "", h.SEP, L.loginId(mm.email), L.cAt(dateTimeOfMs(lang, mm.at)), L.cVia(mm.via === "reset"), h.SEP,
      L.cLogin, `${o()}/login`, "", L.cNotMe, `${o()}/login?forgot=1`, L.contact(h.VISIT_CONTACT_MAIL)].join("\n") + common(lang) }; },
  };

  // このメールを送るお客様の言語（予約・回数券・会員に記録した言語）
  function langOf(m) {
    if (m.kind !== "customer") return "ja";
    if (m.memberMail) { const mm = h.state.members.get(m.memberMail.email); return norm(m.memberMail.lang || (mm && mm.language)); }
    const tp = m.tpl || {};
    if (tp.ticketId) {
      const t = h.state.tickets.get(tp.ticketId);
      const mem = t && t.member_email ? h.state.members.get(t.member_email) : null;
      return norm((t && t.language) || (mem && mem.language));
    }
    if (m.bookingId) { const f = h.findBooking(m.bookingId); return norm(f && f.bk.language); }
    return "ja";
  }
  // 件名・本文をお客様の言語で作る。対象外（日本語・お店宛て・設定オフ・作れない種類）は null＝従来の日本語のまま
  function localize(m, forceLang) {
    const lang = forceLang ? norm(forceLang) : langOf(m);
    if (lang === "ja" || m.kind !== "customer" || !P[lang]) return null;
    if (m.memberMail) { const f = member[m.memberMail.kind]; return f ? { lang, ...f(lang, m.memberMail) } : null; }
    const tp = m.tpl || {};
    if (tp.name === "ticketPurchase" || tp.name === "ticketLeft" || tp.name === "ticketRemind") {
      const r = ticket[tp.name](lang, tp);
      return r ? { lang, ...r } : null;
    }
    if (m.bookingId) {
      const f = h.findBooking(m.bookingId);
      if (!f) return null;
      const variant = tp.name === "booking" ? tp.variant : { confirm: "customerConfirm", change: "customerChange", cancel: "customerCancel", remind: "customerRemind" }[m.type];
      const fn = booking[variant];
      return fn ? { lang, ...fn(lang, f.bk) } : null;
    }
    return null;
  }
  return { localize, langOf, norm, LANGS };
};
