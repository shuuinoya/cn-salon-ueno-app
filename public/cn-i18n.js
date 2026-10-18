// 予約サイトの多言語表示（共通の辞書）
// ・予約サイト本体（画面部品）は8か国語の辞書を持っている。こちらは、あとから追加した部分
//   （回数券・同意の案内・利用規約・会員ログイン・マイページ等）を同じ8か国語で表示するための辞書
// ・言語は予約サイトの「Language」で選んだもの（localStorage: cn-salon-language）。切り替えたら onChange で通知する
// ・辞書は「日本語の原文 → [英, 中, 韓, 仏, 西, 伊, 独]」。日本語の意味をそのまま訳す（足さない・省かない）
// ・{n} などは差し込み。辞書に無い文言は日本語のまま出し、CNI18N.missing に記録する（点検用）
(function () {
  "use strict";
  if (window.CNI18N) return;
  const LANGS = ["ja", "en", "zh", "ko", "fr", "es", "it", "de"];
  const IDX = { en: 0, zh: 1, ko: 2, fr: 3, es: 4, it: 5, de: 6 };
  const LOCALE = { ja: "ja-JP", en: "en-US", zh: "zh-CN", ko: "ko-KR", fr: "fr-FR", es: "es-ES", it: "it-IT", de: "de-DE" };
  const norm = (l) => { const s = String(l || "").toLowerCase(); const k = s.startsWith("zh") ? "zh" : s.slice(0, 2); return LANGS.includes(k) ? k : ""; };
  const stored = () => { try { return norm(localStorage.getItem("cn-salon-language")); } catch { return ""; } };
  let forced = "";
  let cur = stored() || "ja";

  /* 辞書 */
  const D = {
    // ---- 予約フォーム・回数券（booking-tweaks.js）----
    "（必須）": ["(required)", "（必填）", "(필수)", "(obligatoire)", "(obligatorio)", "(obbligatorio)", "(Pflichtfeld)"],
    "回数券の残り回数が0のため、ご予約いただけません。": [
      "You cannot book with this session ticket because it has no sessions left.",
      "该次卡剩余次数为0，无法预约。",
      "회수권의 남은 횟수가 0회이므로 예약하실 수 없습니다.",
      "Réservation impossible : il ne reste aucune séance sur ce carnet.",
      "No puede reservar porque a este bono no le quedan sesiones.",
      "Impossibile prenotare: su questo carnet non restano sedute.",
      "Reservierung nicht möglich: Auf dieser Mehrfachkarte sind keine Behandlungen mehr übrig."],
    "回数券の有効期限が切れているため、ご予約いただけません。": [
      "You cannot book with this session ticket because it has expired.",
      "该次卡已过有效期，无法预约。",
      "회수권의 유효기간이 지나 예약하실 수 없습니다.",
      "Réservation impossible : ce carnet a expiré.",
      "No puede reservar porque este bono ha caducado.",
      "Impossibile prenotare: questo carnet è scaduto.",
      "Reservierung nicht möglich: Diese Mehrfachkarte ist abgelaufen."],
    "回数券の情報を確認できませんでした（ご予約時のメールアドレスが購入時と一致している必要があります）。": [
      "We could not verify your session ticket (the email address used for the booking must match the one used for the purchase).",
      "无法确认次卡信息（预约时的电子邮件地址需与购买时一致）。",
      "회수권 정보를 확인할 수 없습니다(예약 시 이메일 주소가 구매 시 이메일 주소와 같아야 합니다).",
      "Impossible de vérifier votre carnet (l’adresse e-mail de la réservation doit être celle utilisée lors de l’achat).",
      "No hemos podido verificar su bono (el correo electrónico de la reserva debe coincidir con el de la compra).",
      "Impossibile verificare il carnet (l’indirizzo e-mail della prenotazione deve coincidere con quello usato per l’acquisto).",
      "Ihre Mehrfachkarte konnte nicht bestätigt werden (die E-Mail-Adresse der Reservierung muss mit der beim Kauf übereinstimmen)."],
    "この回数券は、選択したメニューではご利用いただけません。": [
      "This session ticket cannot be used for the selected menu.",
      "该次卡不能用于所选项目。",
      "이 회수권은 선택하신 메뉴에는 사용하실 수 없습니다.",
      "Ce carnet ne peut pas être utilisé pour le soin sélectionné.",
      "Este bono no se puede usar para el tratamiento seleccionado.",
      "Questo carnet non può essere usato per il trattamento selezionato.",
      "Diese Mehrfachkarte kann für die gewählte Behandlung nicht verwendet werden."],
    "ご予約の日時変更にはログインが必要です。右上の「ログイン」からログインしてください。": [
      "You need to log in to change the date and time of a booking. Please log in with “Log in” at the top right.",
      "更改预约日期和时间需要登录。请点击右上角的“登录”进行登录。",
      "예약 일시를 변경하려면 로그인이 필요합니다. 오른쪽 위의 ‘로그인’에서 로그인해 주세요.",
      "Vous devez être connecté pour modifier la date et l’heure d’une réservation. Connectez-vous avec « Connexion » en haut à droite.",
      "Debe iniciar sesión para cambiar la fecha y la hora de una reserva. Inicie sesión con «Iniciar sesión», arriba a la derecha.",
      "Per cambiare data e ora di una prenotazione devi accedere. Accedi con «Accedi» in alto a destra.",
      "Zum Ändern von Datum und Uhrzeit einer Reservierung müssen Sie angemeldet sein. Bitte melden Sie sich oben rechts über „Anmelden“ an."],
    "変更元のご予約はすでに取り消されています。新しくご予約ください。": [
      "The original booking has already been cancelled. Please make a new booking.",
      "原预约已被取消，请重新预约。",
      "변경 전 예약은 이미 취소되었습니다. 새로 예약해 주세요.",
      "La réservation d’origine a déjà été annulée. Veuillez faire une nouvelle réservation.",
      "La reserva original ya ha sido cancelada. Haga una nueva reserva.",
      "La prenotazione originale è già stata annullata. Effettua una nuova prenotazione.",
      "Die ursprüngliche Reservierung wurde bereits storniert. Bitte reservieren Sie neu."],
    "開始時刻を過ぎたご予約は変更できません。店舗までお電話ください。": [
      "A booking cannot be changed after its start time. Please call the salon.",
      "已过开始时间的预约无法更改。请致电本店。",
      "시작 시간이 지난 예약은 변경할 수 없습니다. 매장으로 전화해 주세요.",
      "Une réservation ne peut plus être modifiée après l’heure de début. Veuillez appeler le salon.",
      "Una reserva no se puede cambiar después de su hora de inicio. Llame al salón, por favor.",
      "Una prenotazione non può essere modificata dopo l’orario di inizio. Chiama il salone.",
      "Nach Beginn des Termins kann die Reservierung nicht mehr geändert werden. Bitte rufen Sie den Salon an."],
    "変更元のご予約が見つかりませんでした。新しくご予約ください。": [
      "The original booking could not be found. Please make a new booking.",
      "找不到原预约，请重新预约。",
      "변경 전 예약을 찾을 수 없습니다. 새로 예약해 주세요.",
      "La réservation d’origine est introuvable. Veuillez faire une nouvelle réservation.",
      "No se ha encontrado la reserva original. Haga una nueva reserva.",
      "Prenotazione originale non trovata. Effettua una nuova prenotazione.",
      "Die ursprüngliche Reservierung wurde nicht gefunden. Bitte reservieren Sie neu."],
    "会員様向け 回数券": ["Session Tickets for Members", "会员专享次卡", "회원 전용 회수권", "Carnets de séances réservés aux membres", "Bonos de sesiones para miembros", "Carnet di sedute per i membri", "Mehrfachkarten für Mitglieder"],
    "{name}（{uses}回分・有効期限は購入日から{valid}）": [
      "{name} ({uses} sessions, valid for {valid} from the date of purchase)",
      "{name}（{uses}次・有效期为自购买日起{valid}）",
      "{name}({uses}회분・유효기간은 구매일로부터 {valid})",
      "{name} ({uses} séances, valable {valid} à compter de la date d’achat)",
      "{name} ({uses} sesiones, válido durante {valid} desde la fecha de compra)",
      "{name} ({uses} sedute, valido {valid} dalla data di acquisto)",
      "{name} ({uses} Behandlungen, gültig {valid} ab Kaufdatum)"],
    "　対象：{names}": ["  Eligible menus: {names}", "　适用项目：{names}", "　대상 메뉴: {names}", "  Soins concernés : {names}", "  Tratamientos válidos: {names}", "  Trattamenti validi: {names}", "  Gültige Behandlungen: {names}"],
    "　現在の残り回数 {n}回": ["  Sessions remaining: {n}", "　当前剩余次数 {n}次", "　현재 남은 횟수 {n}회", "  Séances restantes : {n}", "  Sesiones restantes: {n}", "  Sedute rimanenti: {n}", "  Verbleibende Behandlungen: {n}"],
    "回数券": ["Session ticket", "次卡", "회수권", "Carnet de séances", "Bono de sesiones", "Carnet di sedute", "Mehrfachkarte"],
    "使用しない": ["Do not use", "不使用", "사용하지 않음", "Ne pas utiliser", "No usar", "Non usare", "Nicht verwenden"],
    "（残り {n}回・有効期限 {date}）": [" ({n} left, valid until {date})", "（剩余{n}次・有效期至{date}）", "(남은 횟수 {n}회・유효기간 {date})", " ({n} restante(s), valable jusqu’au {date})", " (quedan {n}, válido hasta el {date})", " (rimangono {n}, valido fino al {date})", " (noch {n}, gültig bis {date})"],
    "この予約で1回分を使用します（ご予約後の残り {n}回）。コース料金は回数券でのお支払いになります。": [
      "1 session will be used for this booking ({n} left after booking). The course fee will be paid with the session ticket.",
      "本次预约将使用1次（预约后剩余{n}次）。项目费用将以次卡支付。",
      "이번 예약에 1회분을 사용합니다(예약 후 남은 횟수 {n}회). 코스 요금은 회수권으로 결제됩니다.",
      "1 séance sera utilisée pour cette réservation (il en restera {n}). Le prix du soin sera réglé avec le carnet.",
      "Se usará 1 sesión para esta reserva (quedarán {n}). El precio del tratamiento se pagará con el bono.",
      "Per questa prenotazione verrà usata 1 seduta (ne resteranno {n}). Il prezzo del trattamento sarà pagato con il carnet.",
      "Für diese Reservierung wird 1 Behandlung verwendet (danach noch {n}). Der Behandlungspreis wird mit der Mehrfachkarte bezahlt."],
    "同意して予約する": ["Agree and book", "同意并预约", "동의하고 예약하기", "Accepter et réserver", "Aceptar y reservar", "Accetta e prenota", "Zustimmen und reservieren"],
    "ご来店に際しての注意事項": ["Notes for your visit", "到店注意事项", "방문 시 유의사항", "Informations pour votre visite", "Información para su visita", "Informazioni per la tua visita", "Hinweise zu Ihrem Besuch"],
    "ご予約の変更や遅刻される場合は、事前にご連絡いただけますと幸いです。<br/>ご連絡先：cnsalon2021@gmail.com<br/><br/>どうぞよろしくお願いいたします。": [
      "If you need to change your booking or will be late, we would appreciate it if you could contact us in advance.<br/>Contact: cnsalon2021@gmail.com<br/><br/>Thank you very much.",
      "如需更改预约或可能迟到，敬请事先与我们联系。<br/>联系方式：cnsalon2021@gmail.com<br/><br/>敬请多多关照。",
      "예약을 변경하시거나 늦으실 경우에는 미리 연락해 주시면 감사하겠습니다.<br/>연락처: cnsalon2021@gmail.com<br/><br/>잘 부탁드립니다.",
      "Si vous devez modifier votre réservation ou si vous êtes en retard, merci de nous prévenir à l’avance.<br/>Contact : cnsalon2021@gmail.com<br/><br/>Merci beaucoup.",
      "Si necesita cambiar su reserva o va a llegar tarde, le agradeceríamos que nos avisara con antelación.<br/>Contacto: cnsalon2021@gmail.com<br/><br/>Muchas gracias.",
      "Se devi modificare la prenotazione o sei in ritardo, ti saremmo grati se ce lo comunicassi in anticipo.<br/>Contatto: cnsalon2021@gmail.com<br/><br/>Grazie mille.",
      "Wenn Sie Ihre Reservierung ändern müssen oder sich verspäten, geben Sie uns bitte vorher Bescheid.<br/>Kontakt: cnsalon2021@gmail.com<br/><br/>Vielen Dank."],
    "確認しました": ["I have read this", "已阅读并确认", "확인했습니다", "J’ai pris connaissance", "Lo he leído", "Ho letto", "Gelesen und verstanden"],
    "予約には {terms} および {privacy} への同意が必要です。": [
      "Booking requires your agreement to the {terms} and the {privacy}.",
      "预约需要同意{terms}和{privacy}。",
      "예약하려면 {terms} 및 {privacy}에 동의해야 합니다.",
      "La réservation nécessite votre accord avec les {terms} et la {privacy}.",
      "Para reservar debe aceptar los {terms} y la {privacy}.",
      "Per prenotare devi accettare i {terms} e l’{privacy}.",
      "Für die Reservierung ist Ihre Zustimmung zu den {terms} und der {privacy} erforderlich."],
    "利用規約": ["Terms of Service", "使用条款", "이용약관", "Conditions d’utilisation", "Términos de uso", "Termini di utilizzo", "Nutzungsbedingungen"],
    "プライバシーポリシー": ["Privacy Policy", "隐私政策", "개인정보 처리방침", "Politique de confidentialité", "Política de privacidad", "Informativa sulla privacy", "Datenschutzerklärung"],
    "閉じる": ["Close", "关闭", "닫기", "Fermer", "Cerrar", "Chiudi", "Schließen"],
    "読み込んでいます…": ["Loading…", "正在加载…", "불러오는 중…", "Chargement…", "Cargando…", "Caricamento…", "Wird geladen…"],
    "読み込めませんでした。時間をおいてお試しください。": ["Could not load. Please try again later.", "无法加载，请稍后再试。", "불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "Chargement impossible. Veuillez réessayer plus tard.", "No se ha podido cargar. Inténtelo más tarde.", "Impossibile caricare. Riprova più tardi.", "Laden fehlgeschlagen. Bitte versuchen Sie es später erneut."],
    "予約ID": ["Booking ID", "预约ID", "예약 ID", "N° de réservation", "ID de reserva", "ID prenotazione", "Reservierungs-ID"],
    "メニュー": ["Menu", "项目", "메뉴", "Soin", "Tratamiento", "Trattamento", "Behandlung"],
    "オプション": ["Options", "选项", "옵션", "Options", "Opciones", "Opzioni", "Optionen"],
    "なし": ["None", "无", "없음", "Aucune", "Ninguna", "Nessuna", "Keine"],
    "ご予約ありがとうございました。": ["Thank you for your booking.", "感谢您的预约。", "예약해 주셔서 감사합니다.", "Merci pour votre réservation.", "Gracias por su reserva.", "Grazie per la tua prenotazione.", "Vielen Dank für Ihre Reservierung."],
    "マイページへ": ["Go to My Page", "前往我的页面", "마이페이지로 이동", "Aller à mon espace", "Ir a Mi página", "Vai alla mia pagina", "Zu Meine Seite"],
    "{name}を1回使用（残り {n}回）": ["Used 1 session of {name} ({n} left)", "使用了{name} 1次（剩余{n}次）", "{name} 1회 사용(남은 횟수 {n}회)", "1 séance utilisée sur {name} (reste {n})", "1 sesión usada de {name} (quedan {n})", "1 seduta usata da {name} (rimangono {n})", "1 Behandlung von {name} verwendet (noch {n})"],
    "1回使用（残り {n}回）": ["1 session used ({n} left)", "使用了1次（剩余{n}次）", "1회 사용(남은 횟수 {n}회)", "1 séance utilisée (reste {n})", "1 sesión usada (quedan {n})", "1 seduta usata (rimangono {n})", "1 Behandlung verwendet (noch {n})"],
    "ご予約の日時変更中です。": ["You are changing the date and time of your booking.", "正在更改预约的日期和时间。", "예약 일시를 변경하는 중입니다.", "Vous modifiez la date et l’heure de votre réservation.", "Está cambiando la fecha y la hora de su reserva.", "Stai cambiando data e ora della prenotazione.", "Sie ändern gerade Datum und Uhrzeit Ihrer Reservierung."],
    "新しい日時・メニューで予約を確定すると、元のご予約は自動的に取り消されます。": [
      "When you confirm a booking with the new date, time and menu, your original booking will be cancelled automatically.",
      "以新的日期、时间和项目确认预约后，原预约将自动取消。",
      "새 일시・메뉴로 예약을 확정하면 기존 예약은 자동으로 취소됩니다.",
      "Lorsque vous confirmez la réservation avec la nouvelle date, l’heure et le soin, la réservation d’origine est annulée automatiquement.",
      "Al confirmar la reserva con la nueva fecha, hora y tratamiento, la reserva original se cancelará automáticamente.",
      "Quando confermi la prenotazione con la nuova data, ora e trattamento, la prenotazione originale viene annullata automaticamente.",
      "Wenn Sie die Reservierung mit neuem Datum, neuer Uhrzeit und Behandlung bestätigen, wird die ursprüngliche Reservierung automatisch storniert."],
    "変更をやめる": ["Cancel the change", "取消更改", "변경 취소", "Abandonner la modification", "Cancelar el cambio", "Annulla la modifica", "Änderung abbrechen"],
    "ご予約の日時を変更しました。元のご予約は取り消されています（マイページでご確認いただけます）。": [
      "The date and time of your booking have been changed. The original booking has been cancelled (you can check this on My Page).",
      "已更改预约的日期和时间。原预约已取消（可在我的页面中确认）。",
      "예약 일시를 변경했습니다. 기존 예약은 취소되었습니다(마이페이지에서 확인하실 수 있습니다).",
      "La date et l’heure de votre réservation ont été modifiées. La réservation d’origine a été annulée (vous pouvez le vérifier dans votre espace).",
      "Se han cambiado la fecha y la hora de su reserva. La reserva original se ha cancelado (puede comprobarlo en Mi página).",
      "Data e ora della prenotazione sono state modificate. La prenotazione originale è stata annullata (puoi verificarlo nella tua pagina).",
      "Datum und Uhrzeit Ihrer Reservierung wurden geändert. Die ursprüngliche Reservierung wurde storniert (Sie können dies auf Meine Seite prüfen)."],
    // 回数券の設定（管理画面の初期値）
    "全メニューでご利用いただけます（1回のご予約で1回分を使用）": [
      "Can be used for all menus (1 session is used per booking)",
      "所有项目均可使用（每次预约使用1次）",
      "모든 메뉴에 사용 가능(1회 예약에 1회분 사용)",
      "Valable pour tous les soins (1 séance utilisée par réservation)",
      "Válido para todos los tratamientos (se usa 1 sesión por reserva)",
      "Valido per tutti i trattamenti (1 seduta per prenotazione)",
      "Für alle Behandlungen gültig (1 Behandlung pro Reservierung)"],
    "お支払いは店頭にて承ります。ご予約時に「回数券を使用する」を選ぶと、1回のご予約で1回分を使用します。": [
      "Payment is made at the salon. If you choose to use a session ticket when booking, 1 session is used per booking.",
      "请在店内付款。预约时选择使用次卡，每次预约使用1次。",
      "결제는 매장에서 받습니다. 예약 시 회수권 사용을 선택하시면 1회 예약에 1회분을 사용합니다.",
      "Le paiement s’effectue au salon. Si vous choisissez d’utiliser un carnet lors de la réservation, 1 séance est utilisée par réservation.",
      "El pago se realiza en el salón. Si al reservar elige usar un bono, se usa 1 sesión por reserva.",
      "Il pagamento si effettua in salone. Se in fase di prenotazione scegli di usare un carnet, viene usata 1 seduta per prenotazione.",
      "Die Bezahlung erfolgt im Salon. Wenn Sie bei der Reservierung die Mehrfachkarte verwenden, wird pro Reservierung 1 Behandlung abgezogen."],
    "（復活分）": [" (reinstated sessions)", "（恢复部分）", "(복원분)", " (séances réintégrées)", " (sesiones restablecidas)", " (sedute ripristinate)", " (wiederhergestellte Behandlungen)"],
    "有効": ["Valid", "有效", "유효", "Valide", "Válido", "Valido", "Gültig"],
    "使い切り": ["Used up", "已用完", "모두 사용", "Épuisé", "Agotado", "Esaurito", "Aufgebraucht"],
    "期限切れ": ["Expired", "已过期", "기한 만료", "Expiré", "Caducado", "Scaduto", "Abgelaufen"],
    "復活済み": ["Transferred (reinstated)", "已转入恢复部分", "이월됨(복원)", "Transféré (réintégré)", "Transferido (restablecido)", "Trasferito (ripristinato)", "Übertragen (wiederhergestellt)"],

    // ---- 会員ログイン・登録（member.js）----
    "ログイン": ["Log in", "登录", "로그인", "Connexion", "Iniciar sesión", "Accedi", "Anmelden"],
    "マイページ": ["My Page", "我的页面", "마이페이지", "Mon espace", "Mi página", "La mia pagina", "Meine Seite"],
    "メールアドレス": ["Email address", "电子邮件地址", "이메일 주소", "Adresse e-mail", "Correo electrónico", "Indirizzo e-mail", "E-Mail-Adresse"],
    "パスワード": ["Password", "密码", "비밀번호", "Mot de passe", "Contraseña", "Password", "Passwort"],
    "パスワードを忘れた方はこちら": ["Forgot your password?", "忘记密码？", "비밀번호를 잊으셨나요?", "Mot de passe oublié ?", "¿Ha olvidado su contraseña?", "Hai dimenticato la password?", "Passwort vergessen?"],
    "キャンセル": ["Cancel", "取消", "취소", "Annuler", "Cancelar", "Annulla", "Abbrechen"],
    "はじめての方は新規会員登録（無料）": ["New here? Sign up (free)", "首次使用？免费注册会员", "처음이신가요? 무료 회원가입", "Première visite ? Inscription gratuite", "¿Es nuevo? Regístrese gratis", "Prima volta? Registrati gratis", "Neu hier? Kostenlos registrieren"],
    "新規会員登録（無料）": ["Sign up (free)", "免费注册会员", "무료 회원가입", "Inscription (gratuite)", "Registrarse (gratis)", "Registrati (gratis)", "Registrieren (kostenlos)"],
    "会員の方はこちら（ログイン）": ["Already a member? Log in", "已是会员？请登录", "이미 회원이신가요? 로그인", "Déjà membre ? Connexion", "¿Ya es miembro? Inicie sesión", "Sei già membro? Accedi", "Bereits Mitglied? Anmelden"],
    "登録する": ["Sign up", "注册", "가입하기", "S’inscrire", "Registrarse", "Registrati", "Registrieren"],
    "お名前": ["Name", "姓名", "성함", "Nom", "Nombre", "Nome", "Name"],
    "パスワード（確認）": ["Password (confirm)", "确认密码", "비밀번호 확인", "Mot de passe (confirmation)", "Contraseña (confirmación)", "Password (conferma)", "Passwort (Bestätigung)"],
    "6文字以上": ["6 characters or more", "6个字符以上", "6자 이상", "6 caractères minimum", "Mínimo 6 caracteres", "Almeno 6 caratteri", "Mind. 6 Zeichen"],
    "登録が完了すると、ログインID（メールアドレス）とパスワードを記載した「会員登録完了のお知らせ」メールをお送りします。会員様は【予約】【メニュー】ページの一番上から回数券をご購入・ご利用いただけます。": [
      "When your registration is complete, we will send you a “Registration complete” email containing your login ID (email address) and password. Members can buy and use session tickets from the top of the [Book] and [Menu] pages.",
      "注册完成后，我们将向您发送一封载有登录ID（电子邮件地址）和密码的“会员注册完成通知”邮件。会员可在【预约】【菜单】页面顶部购买和使用次卡。",
      "가입이 완료되면 로그인 ID(이메일 주소)와 비밀번호가 기재된 ‘회원가입 완료 안내’ 메일을 보내 드립니다. 회원님은 【예약】【메뉴】 페이지 맨 위에서 회수권을 구매・이용하실 수 있습니다.",
      "Une fois l’inscription terminée, nous vous enverrons un e-mail « Confirmation d’inscription » indiquant votre identifiant (adresse e-mail) et votre mot de passe. Les membres peuvent acheter et utiliser des carnets de séances en haut des pages [Réserver] et [Menu].",
      "Al completar el registro le enviaremos el correo «Registro completado» con su ID de acceso (correo electrónico) y su contraseña. Los miembros pueden comprar y usar bonos de sesiones desde la parte superior de las páginas [Reservar] y [Menú].",
      "Al termine della registrazione ti invieremo l’e-mail «Registrazione completata» con il tuo ID di accesso (indirizzo e-mail) e la password. I membri possono acquistare e usare i carnet di sedute dalla parte alta delle pagine [Prenota] e [Menu].",
      "Nach Abschluss der Registrierung senden wir Ihnen die E-Mail „Registrierung abgeschlossen“ mit Ihrer Login-ID (E-Mail-Adresse) und Ihrem Passwort. Mitglieder können Mehrfachkarten oben auf den Seiten [Reservieren] und [Menü] kaufen und verwenden."],
    "会員登録が完了しました。\n「会員登録完了のお知らせ」を {e} にお送りしました。": [
      "Your registration is complete.\nWe have sent the “Registration complete” email to {e}.",
      "会员注册已完成。\n已向 {e} 发送“会员注册完成通知”。",
      "회원가입이 완료되었습니다.\n‘회원가입 완료 안내’를 {e}(으)로 보내 드렸습니다.",
      "Votre inscription est terminée.\nNous avons envoyé l’e-mail « Confirmation d’inscription » à {e}.",
      "Su registro se ha completado.\nHemos enviado el correo «Registro completado» a {e}.",
      "La registrazione è completata.\nAbbiamo inviato l’e-mail «Registrazione completata» a {e}.",
      "Ihre Registrierung ist abgeschlossen.\nWir haben die E-Mail „Registrierung abgeschlossen“ an {e} gesendet."],
    "メールアドレスまたはパスワードが違います。はじめての方は「新規会員登録」からご登録ください。": [
      "The email address or password is incorrect. If you are new, please register via “Sign up”.",
      "电子邮件地址或密码不正确。首次使用请通过“注册会员”进行注册。",
      "이메일 주소 또는 비밀번호가 올바르지 않습니다. 처음이신 분은 ‘회원가입’에서 가입해 주세요.",
      "Adresse e-mail ou mot de passe incorrect. Si c’est votre première visite, inscrivez-vous via « Inscription ».",
      "El correo electrónico o la contraseña no son correctos. Si es nuevo, regístrese desde «Registrarse».",
      "Indirizzo e-mail o password errati. Se è la prima volta, registrati da «Registrati».",
      "E-Mail-Adresse oder Passwort ist falsch. Wenn Sie neu sind, registrieren Sie sich bitte über „Registrieren“."],
    "このメールアドレスはすでに登録されています。ログインしてください。": [
      "This email address is already registered. Please log in.", "该电子邮件地址已注册，请登录。", "이미 등록된 이메일 주소입니다. 로그인해 주세요.",
      "Cette adresse e-mail est déjà enregistrée. Veuillez vous connecter.", "Este correo electrónico ya está registrado. Inicie sesión.",
      "Questo indirizzo e-mail è già registrato. Accedi.", "Diese E-Mail-Adresse ist bereits registriert. Bitte melden Sie sich an."],
    "お名前を入力してください。": ["Please enter your name.", "请输入姓名。", "성함을 입력해 주세요.", "Veuillez saisir votre nom.", "Introduzca su nombre.", "Inserisci il tuo nome.", "Bitte geben Sie Ihren Namen ein."],
    "パスワード（確認）が一致しません。": ["The passwords do not match.", "两次输入的密码不一致。", "비밀번호 확인이 일치하지 않습니다.", "Les mots de passe ne correspondent pas.", "Las contraseñas no coinciden.", "Le password non corrispondono.", "Die Passwörter stimmen nicht überein."],
    "パスワードは6文字以上で入力してください。": ["Please enter a password of at least 6 characters.", "请输入至少6个字符的密码。", "비밀번호는 6자 이상으로 입력해 주세요.", "Le mot de passe doit comporter au moins 6 caractères.", "La contraseña debe tener al menos 6 caracteres.", "La password deve contenere almeno 6 caratteri.", "Das Passwort muss mindestens 6 Zeichen lang sein."],
    "試行回数が多すぎます。1分ほど待ってからお試しください。": ["Too many attempts. Please wait about a minute and try again.", "尝试次数过多，请等待约1分钟后再试。", "시도 횟수가 너무 많습니다. 1분 정도 기다린 후 다시 시도해 주세요.", "Trop de tentatives. Patientez environ une minute puis réessayez.", "Demasiados intentos. Espere aproximadamente un minuto e inténtelo de nuevo.", "Troppi tentativi. Attendi circa un minuto e riprova.", "Zu viele Versuche. Bitte warten Sie etwa eine Minute und versuchen Sie es erneut."],
    "メールアドレスの形式を確認してください。": ["Please check the format of your email address.", "请检查电子邮件地址的格式。", "이메일 주소 형식을 확인해 주세요.", "Veuillez vérifier le format de l’adresse e-mail.", "Compruebe el formato del correo electrónico.", "Controlla il formato dell’indirizzo e-mail.", "Bitte prüfen Sie das Format der E-Mail-Adresse."],
    "処理できませんでした。時間をおいてお試しください。": ["The request could not be processed. Please try again later.", "处理失败，请稍后再试。", "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", "Le traitement a échoué. Veuillez réessayer plus tard.", "No se ha podido procesar. Inténtelo más tarde.", "Impossibile completare l’operazione. Riprova più tardi.", "Die Anfrage konnte nicht verarbeitet werden. Bitte versuchen Sie es später erneut."],
    "パスワードの再設定": ["Reset your password", "重设密码", "비밀번호 재설정", "Réinitialiser le mot de passe", "Restablecer la contraseña", "Reimposta la password", "Passwort zurücksetzen"],
    "新しいパスワードの設定": ["Set a new password", "设置新密码", "새 비밀번호 설정", "Définir un nouveau mot de passe", "Establecer una nueva contraseña", "Imposta una nuova password", "Neues Passwort festlegen"],
    "ログイン画面に戻る": ["Back to log in", "返回登录页面", "로그인 화면으로 돌아가기", "Retour à la connexion", "Volver al inicio de sesión", "Torna all’accesso", "Zurück zur Anmeldung"],
    "ご登録のメールアドレスを入力してください。新しいパスワードを設定するためのURLをメールでお送りします（有効期限60分・1回のみ有効）。": [
      "Please enter your registered email address. We will email you a link to set a new password (valid for 60 minutes, single use).",
      "请输入您注册的电子邮件地址。我们将通过邮件发送用于设置新密码的网址（有效期60分钟，仅限使用1次）。",
      "가입하신 이메일 주소를 입력해 주세요. 새 비밀번호를 설정할 수 있는 URL을 메일로 보내 드립니다(유효기간 60분, 1회만 사용 가능).",
      "Saisissez l’adresse e-mail de votre compte. Nous vous enverrons par e-mail un lien pour définir un nouveau mot de passe (valable 60 minutes, utilisable une seule fois).",
      "Introduzca el correo electrónico registrado. Le enviaremos por correo un enlace para establecer una nueva contraseña (válido 60 minutos y de un solo uso).",
      "Inserisci l’indirizzo e-mail registrato. Ti invieremo via e-mail un link per impostare una nuova password (valido 60 minuti, utilizzabile una sola volta).",
      "Bitte geben Sie Ihre registrierte E-Mail-Adresse ein. Wir senden Ihnen per E-Mail einen Link zum Festlegen eines neuen Passworts (60 Minuten gültig, nur einmal verwendbar)."],
    "再設定用のメールを送る": ["Send reset email", "发送重设邮件", "재설정 메일 보내기", "Envoyer l’e-mail de réinitialisation", "Enviar correo de restablecimiento", "Invia e-mail di reimpostazione", "E-Mail zum Zurücksetzen senden"],
    "{e} がご登録のアドレスであれば、パスワード再設定用のURLをお送りしました。メールをご確認ください（届かない場合は迷惑メールフォルダもご確認ください）。URLの有効期限は60分です。": [
      "If {e} is a registered address, we have sent a link to reset your password. Please check your email (if it does not arrive, please also check your spam folder). The link is valid for 60 minutes.",
      "如果 {e} 是已注册的地址，我们已发送重设密码的网址。请查收邮件（如未收到，请同时检查垃圾邮件文件夹）。网址有效期为60分钟。",
      "{e}이(가) 가입된 주소라면 비밀번호 재설정용 URL을 보내 드렸습니다. 메일을 확인해 주세요(받지 못하신 경우 스팸 메일함도 확인해 주세요). URL의 유효기간은 60분입니다.",
      "Si {e} est une adresse enregistrée, nous vous avons envoyé un lien de réinitialisation du mot de passe. Vérifiez vos e-mails (et votre dossier de courrier indésirable si vous ne le recevez pas). Le lien est valable 60 minutes.",
      "Si {e} es una dirección registrada, le hemos enviado un enlace para restablecer la contraseña. Revise su correo (si no lo recibe, mire también la carpeta de spam). El enlace es válido durante 60 minutos.",
      "Se {e} è un indirizzo registrato, ti abbiamo inviato un link per reimpostare la password. Controlla la posta (se non arriva, controlla anche la cartella spam). Il link è valido 60 minuti.",
      "Falls {e} eine registrierte Adresse ist, haben wir Ihnen einen Link zum Zurücksetzen des Passworts gesendet. Bitte prüfen Sie Ihre E-Mails (falls nichts ankommt, auch den Spam-Ordner). Der Link ist 60 Minuten gültig."],
    "URLを確認しています…": ["Checking the link…", "正在确认网址…", "URL을 확인하고 있습니다…", "Vérification du lien…", "Comprobando el enlace…", "Verifica del link…", "Link wird geprüft…"],
    "{e} の新しいパスワードを設定してください。": ["Please set a new password for {e}.", "请为 {e} 设置新密码。", "{e}의 새 비밀번호를 설정해 주세요.", "Définissez un nouveau mot de passe pour {e}.", "Establezca una nueva contraseña para {e}.", "Imposta una nuova password per {e}.", "Bitte legen Sie ein neues Passwort für {e} fest."],
    "新しいパスワード": ["New password", "新密码", "새 비밀번호", "Nouveau mot de passe", "Nueva contraseña", "Nuova password", "Neues Passwort"],
    "パスワードを変更する": ["Change password", "更改密码", "비밀번호 변경", "Modifier le mot de passe", "Cambiar la contraseña", "Cambia password", "Passwort ändern"],
    "再設定用のメールをもう一度送る": ["Send the reset email again", "再次发送重设邮件", "재설정 메일 다시 보내기", "Renvoyer l’e-mail de réinitialisation", "Volver a enviar el correo de restablecimiento", "Invia di nuovo l’e-mail di reimpostazione", "E-Mail zum Zurücksetzen erneut senden"],
    "パスワードを変更しました。新しいパスワードでログインしています。\n変更完了のお知らせをメールでお送りしました。": [
      "Your password has been changed. You are now logged in with your new password.\nWe have sent you an email confirming the change.",
      "密码已更改，您已使用新密码登录。\n已通过邮件发送更改完成通知。",
      "비밀번호를 변경했습니다. 새 비밀번호로 로그인되어 있습니다.\n변경 완료 안내를 메일로 보내 드렸습니다.",
      "Votre mot de passe a été modifié. Vous êtes connecté avec le nouveau mot de passe.\nNous vous avons envoyé un e-mail de confirmation.",
      "Se ha cambiado la contraseña. Ha iniciado sesión con la nueva contraseña.\nLe hemos enviado un correo de confirmación del cambio.",
      "La password è stata cambiata. Hai effettuato l’accesso con la nuova password.\nTi abbiamo inviato un’e-mail di conferma della modifica.",
      "Ihr Passwort wurde geändert. Sie sind mit dem neuen Passwort angemeldet.\nWir haben Ihnen eine Bestätigung per E-Mail gesendet."],
    "このURLは無効か、すでに使用済みです。お手数ですが、もう一度再設定用のメールをお送りください。": [
      "This link is invalid or has already been used. Please request the reset email again.",
      "该网址无效或已被使用。烦请重新发送重设邮件。",
      "이 URL은 유효하지 않거나 이미 사용되었습니다. 번거로우시겠지만 재설정 메일을 다시 요청해 주세요.",
      "Ce lien n’est pas valide ou a déjà été utilisé. Veuillez redemander l’e-mail de réinitialisation.",
      "Este enlace no es válido o ya se ha utilizado. Solicite de nuevo el correo de restablecimiento.",
      "Questo link non è valido o è già stato usato. Richiedi di nuovo l’e-mail di reimpostazione.",
      "Dieser Link ist ungültig oder wurde bereits verwendet. Bitte fordern Sie die E-Mail zum Zurücksetzen erneut an."],
    "このURLは有効期限（60分）が過ぎています。お手数ですが、もう一度再設定用のメールをお送りください。": [
      "This link has expired (valid for 60 minutes). Please request the reset email again.",
      "该网址已超过有效期（60分钟）。烦请重新发送重设邮件。",
      "이 URL은 유효기간(60분)이 지났습니다. 번거로우시겠지만 재설정 메일을 다시 요청해 주세요.",
      "Ce lien a expiré (valable 60 minutes). Veuillez redemander l’e-mail de réinitialisation.",
      "Este enlace ha caducado (válido 60 minutos). Solicite de nuevo el correo de restablecimiento.",
      "Questo link è scaduto (valido 60 minuti). Richiedi di nuovo l’e-mail di reimpostazione.",
      "Dieser Link ist abgelaufen (60 Minuten gültig). Bitte fordern Sie die E-Mail zum Zurücksetzen erneut an."],
    "会員メニュー": ["Member menu", "会员菜单", "회원 메뉴", "Espace membre", "Menú de miembro", "Menu membri", "Mitgliedermenü"],
    "{n} 様": ["Hello, {n}", "{n}，您好", "{n} 님", "Bonjour {n}", "Hola, {n}", "Ciao {n}", "Hallo {n}"],
    "会員様": ["Hello, member", "会员您好", "회원님", "Bonjour", "Hola", "Ciao", "Hallo"],
    "保有中の回数券": ["Your session tickets", "持有的次卡", "보유 중인 회수권", "Vos carnets de séances", "Sus bonos de sesiones", "I tuoi carnet di sedute", "Ihre Mehrfachkarten"],
    "保有中の回数券はありません": ["You have no session tickets", "没有持有的次卡", "보유 중인 회수권이 없습니다", "Vous n’avez aucun carnet", "No tiene bonos", "Non hai carnet", "Sie haben keine Mehrfachkarten"],
    "保有中の回数券はありません。": ["You have no session tickets.", "没有持有的次卡。", "보유 중인 회수권이 없습니다.", "Vous n’avez aucun carnet.", "No tiene bonos.", "Non hai carnet.", "Sie haben keine Mehrfachkarten."],
    "残り {n}回": ["{n} left", "剩余{n}次", "남은 횟수 {n}회", "{n} restante(s)", "Quedan {n}", "Rimangono {n}", "Noch {n}"],
    "ログアウト": ["Log out", "退出登录", "로그아웃", "Déconnexion", "Cerrar sesión", "Esci", "Abmelden"],
    "回数券を見る・購入する": ["View / buy session tickets", "查看・购买次卡", "회수권 보기・구매하기", "Voir / acheter des carnets", "Ver / comprar bonos", "Vedi / acquista carnet", "Mehrfachkarten ansehen / kaufen"],

    // ---- マイページ（pm-mypage.html）----
    "日時を変更": ["Change date/time", "更改日期时间", "일시 변경", "Modifier la date/l’heure", "Cambiar fecha/hora", "Cambia data/ora", "Datum/Uhrzeit ändern"],
    "マイページのご利用にはログインが必要です。<br>ご予約の確認・日時変更・取消、回数券のご購入・残り回数の確認ができます。<br>はじめての方は「新規会員登録（無料）」からご登録ください。": [
      "Please log in to use My Page.<br>You can check, reschedule or cancel your bookings, buy session tickets and check how many sessions are left.<br>If you are new, please register via “Sign up (free)”.",
      "使用我的页面需要登录。<br>可确认预约、更改日期时间或取消预约，购买次卡及查看剩余次数。<br>首次使用请通过“免费注册会员”进行注册。",
      "마이페이지를 이용하려면 로그인이 필요합니다.<br>예약 확인・일시 변경・취소, 회수권 구매・남은 횟수 확인을 하실 수 있습니다.<br>처음이신 분은 ‘무료 회원가입’에서 가입해 주세요.",
      "Connectez-vous pour utiliser votre espace.<br>Vous pourrez consulter, modifier ou annuler vos réservations, acheter des carnets et voir les séances restantes.<br>Si c’est votre première visite, inscrivez-vous via « Inscription (gratuite) ».",
      "Inicie sesión para usar Mi página.<br>Podrá consultar, cambiar de fecha y hora o cancelar sus reservas, y comprar bonos y ver las sesiones que le quedan.<br>Si es nuevo, regístrese desde «Registrarse (gratis)».",
      "Accedi per usare la tua pagina.<br>Potrai controllare, spostare o annullare le prenotazioni, acquistare carnet e vedere le sedute rimanenti.<br>Se è la prima volta, registrati da «Registrati (gratis)».",
      "Bitte melden Sie sich an, um Meine Seite zu nutzen.<br>Dort können Sie Reservierungen prüfen, verschieben oder stornieren sowie Mehrfachkarten kaufen und die verbleibenden Behandlungen einsehen.<br>Wenn Sie neu sind, registrieren Sie sich bitte über „Registrieren (kostenlos)“."],
    "回数券のご購入・残り回数の確認は {login}／{register}": [
      "To buy session tickets or check remaining sessions: {login} / {register}",
      "购买次卡・查看剩余次数：{login}／{register}",
      "회수권 구매・남은 횟수 확인: {login}／{register}",
      "Pour acheter des carnets ou voir les séances restantes : {login} / {register}",
      "Para comprar bonos o ver las sesiones restantes: {login} / {register}",
      "Per acquistare carnet o vedere le sedute rimanenti: {login} / {register}",
      "Mehrfachkarten kaufen oder verbleibende Behandlungen prüfen: {login} / {register}"],
    "会員ログイン": ["Member log in", "会员登录", "회원 로그인", "Connexion membre", "Acceso de miembros", "Accesso membri", "Mitglieder-Anmeldung"],
    "新規会員登録": ["Sign up", "注册会员", "회원가입", "Inscription", "Registrarse", "Registrati", "Registrieren"],
    "{name}（残り {n}回）": ["{name} ({n} left)", "{name}（剩余{n}次）", "{name}(남은 횟수 {n}회)", "{name} ({n} restante(s))", "{name} (quedan {n})", "{name} (rimangono {n})", "{name} (noch {n})"],
    "お得な回数券をご用意しています。": ["We offer great-value session tickets.", "我们提供优惠的次卡。", "실속 있는 회수권을 준비해 두었습니다.", "Nous proposons des carnets de séances avantageux.", "Ofrecemos bonos de sesiones a precio ventajoso.", "Proponiamo carnet di sedute convenienti.", "Wir bieten günstige Mehrfachkarten an."],
    "回数券を見る": ["View session tickets", "查看次卡", "회수권 보기", "Voir les carnets", "Ver bonos", "Vedi carnet", "Mehrfachkarten ansehen"],
    "メールアドレス（ログインID）": ["Email address (login ID)", "电子邮件地址（登录ID）", "이메일 주소(로그인 ID)", "Adresse e-mail (identifiant)", "Correo electrónico (ID de acceso)", "Indirizzo e-mail (ID di accesso)", "E-Mail-Adresse (Login-ID)"],
    "電話番号": ["Phone number", "电话号码", "전화번호", "Téléphone", "Teléfono", "Telefono", "Telefonnummer"],
    "会員情報の変更": ["Change member information", "修改会员信息", "회원 정보 변경", "Modifier mes informations", "Cambiar datos de miembro", "Modifica i dati del membro", "Mitgliedsdaten ändern"],
    "保存する": ["Save", "保存", "저장하기", "Enregistrer", "Guardar", "Salva", "Speichern"],
    "パスワードの変更": ["Change password", "更改密码", "비밀번호 변경", "Modifier le mot de passe", "Cambiar la contraseña", "Cambia password", "Passwort ändern"],
    "現在のパスワード": ["Current password", "当前密码", "현재 비밀번호", "Mot de passe actuel", "Contraseña actual", "Password attuale", "Aktuelles Passwort"],
    "新しいパスワード（6文字以上）": ["New password (at least 6 characters)", "新密码（至少6个字符）", "새 비밀번호(6자 이상)", "Nouveau mot de passe (6 caractères minimum)", "Nueva contraseña (mínimo 6 caracteres)", "Nuova password (almeno 6 caratteri)", "Neues Passwort (mind. 6 Zeichen)"],
    "変更する": ["Change", "更改", "변경하기", "Modifier", "Cambiar", "Modifica", "Ändern"],
    "購入日": ["Purchase date", "购买日期", "구매일", "Date d’achat", "Fecha de compra", "Data di acquisto", "Kaufdatum"],
    "復活した日": ["Date reinstated", "恢复日期", "복원일", "Date de réintégration", "Fecha de restablecimiento", "Data di ripristino", "Datum der Wiederherstellung"],
    "利用可能回数": ["Sessions available", "可用次数", "이용 가능 횟수", "Séances disponibles", "Sesiones disponibles", "Sedute disponibili", "Verfügbare Behandlungen"],
    "復活した回数": ["Sessions reinstated", "恢复次数", "복원된 횟수", "Séances réintégrées", "Sesiones restablecidas", "Sedute ripristinate", "Wiederhergestellte Behandlungen"],
    "{n}回": ["{n} sessions", "{n}次", "{n}회", "{n} séances", "{n} sesiones", "{n} sedute", "{n} Behandlungen"],
    "内訳": ["Breakdown", "明细", "내역", "Détail", "Desglose", "Dettaglio", "Aufschlüsselung"],
    "前回までの購入分から復活": ["Reinstated from previous purchases", "从以往购买的部分恢复", "이전 구매분에서 복원", "Réintégrées depuis les achats précédents", "Restablecidas de compras anteriores", "Ripristinate dagli acquisti precedenti", "Aus früheren Käufen wiederhergestellt"],
    "{date}購入の「{plan}」から{n}回": ["{n} from “{plan}” purchased on {date}", "从{date}购买的“{plan}”恢复{n}次", "{date} 구매한 ‘{plan}’에서 {n}회", "{n} de « {plan} » acheté le {date}", "{n} de «{plan}» comprado el {date}", "{n} da «{plan}» acquistato il {date}", "{n} aus „{plan}“ (gekauft am {date})"],
    "残り回数": ["Sessions remaining", "剩余次数", "남은 횟수", "Séances restantes", "Sesiones restantes", "Sedute rimanenti", "Verbleibende Behandlungen"],
    "（利用済み {n}回）": [" ({n} used)", "（已使用{n}次）", "(사용 {n}회)", " ({n} utilisée(s))", " ({n} usadas)", " ({n} usate)", " ({n} verwendet)"],
    "（利用済み {n}回・期限切れ後に{m}回を新しい回数券へ復活）": [
      " ({n} used; after expiry, {m} reinstated on a new session ticket)",
      "（已使用{n}次・过期后{m}次已恢复至新的次卡）",
      "(사용 {n}회・기한 만료 후 {m}회를 새 회수권으로 복원)",
      " ({n} utilisée(s) ; après expiration, {m} réintégrée(s) sur un nouveau carnet)",
      " ({n} usadas; tras caducar, {m} restablecidas en un nuevo bono)",
      " ({n} usate; dopo la scadenza, {m} ripristinate su un nuovo carnet)",
      " ({n} verwendet; nach Ablauf {m} auf eine neue Mehrfachkarte übertragen)"],
    "復活": ["Reinstatement", "恢复", "복원", "Réintégration", "Restablecimiento", "Ripristino", "Wiederherstellung"],
    "このご購入で、期限切れの未使用{n}回を復活しました（「復活分」の回数券）": [
      "With this purchase, {n} unused session(s) from an expired ticket were reinstated (as a “reinstated sessions” ticket).",
      "本次购买恢复了已过期的未使用{n}次（“恢复部分”次卡）。",
      "이번 구매로 기한이 지난 미사용 {n}회를 복원했습니다(‘복원분’ 회수권).",
      "Cet achat a réintégré {n} séance(s) non utilisée(s) d’un carnet expiré (carnet « séances réintégrées »).",
      "Con esta compra se han restablecido {n} sesiones no usadas de un bono caducado (bono de «sesiones restablecidas»).",
      "Con questo acquisto sono state ripristinate {n} sedute non usate di un carnet scaduto (carnet «sedute ripristinate»).",
      "Mit diesem Kauf wurden {n} nicht genutzte Behandlung(en) einer abgelaufenen Karte wiederhergestellt (Karte „wiederhergestellte Behandlungen“)."],
    "有効期限": ["Valid until", "有效期至", "유효기간", "Valable jusqu’au", "Válido hasta", "Valido fino al", "Gültig bis"],
    "{uses}回分／有効期限は購入日から{valid}": [
      "{uses} sessions / valid for {valid} from the date of purchase", "{uses}次／有效期为自购买日起{valid}", "{uses}회분／유효기간은 구매일로부터 {valid}",
      "{uses} séances / valable {valid} à compter de la date d’achat", "{uses} sesiones / válido durante {valid} desde la fecha de compra",
      "{uses} sedute / valido {valid} dalla data di acquisto", "{uses} Behandlungen / gültig {valid} ab Kaufdatum"],
    "対象メニュー：{names}": ["Eligible menus: {names}", "适用项目：{names}", "대상 메뉴: {names}", "Soins concernés : {names}", "Tratamientos válidos: {names}", "Trattamenti validi: {names}", "Gültige Behandlungen: {names}"],
    "この回数券を購入": ["Buy this session ticket", "购买此次卡", "이 회수권 구매", "Acheter ce carnet", "Comprar este bono", "Acquista questo carnet", "Diese Mehrfachkarte kaufen"],
    "回数券のご購入": ["Buy session tickets", "购买次卡", "회수권 구매", "Acheter des carnets", "Comprar bonos", "Acquista carnet", "Mehrfachkarten kaufen"],
    "現在販売中の回数券はありません。": ["No session tickets are currently on sale.", "目前没有在售的次卡。", "현재 판매 중인 회수권이 없습니다.", "Aucun carnet n’est en vente actuellement.", "Actualmente no hay bonos a la venta.", "Al momento non ci sono carnet in vendita.", "Derzeit werden keine Mehrfachkarten angeboten."],
    "新しいパスワードは6文字以上で入力してください。": ["Please enter a new password of at least 6 characters.", "新密码请输入至少6个字符。", "새 비밀번호는 6자 이상으로 입력해 주세요.", "Le nouveau mot de passe doit comporter au moins 6 caractères.", "La nueva contraseña debe tener al menos 6 caracteres.", "La nuova password deve contenere almeno 6 caratteri.", "Das neue Passwort muss mindestens 6 Zeichen lang sein."],
    "現在のパスワードが違います。": ["The current password is incorrect.", "当前密码不正确。", "현재 비밀번호가 올바르지 않습니다.", "Le mot de passe actuel est incorrect.", "La contraseña actual no es correcta.", "La password attuale non è corretta.", "Das aktuelle Passwort ist falsch."],
    "保存できませんでした。": ["Could not save.", "保存失败。", "저장하지 못했습니다.", "Impossible d’enregistrer.", "No se ha podido guardar.", "Impossibile salvare.", "Speichern fehlgeschlagen."],
    "保存しました。": ["Saved.", "已保存。", "저장했습니다.", "Enregistré.", "Guardado.", "Salvato.", "Gespeichert."],
    "{plan}（{uses}回分・{price}）を購入します。よろしいですか？\nお支払いは店頭にて承ります。": [
      "You are about to buy {plan} ({uses} sessions, {price}). Do you want to continue?\nPayment is made at the salon.",
      "将购买{plan}（{uses}次・{price}）。确定吗？\n请在店内付款。",
      "{plan}({uses}회분・{price})을(를) 구매합니다. 계속하시겠습니까?\n결제는 매장에서 받습니다.",
      "Vous allez acheter {plan} ({uses} séances, {price}). Continuer ?\nLe paiement s’effectue au salon.",
      "Va a comprar {plan} ({uses} sesiones, {price}). ¿Desea continuar?\nEl pago se realiza en el salón.",
      "Stai per acquistare {plan} ({uses} sedute, {price}). Vuoi continuare?\nIl pagamento si effettua in salone.",
      "Sie kaufen {plan} ({uses} Behandlungen, {price}). Möchten Sie fortfahren?\nDie Bezahlung erfolgt im Salon."],
    "この回数券を購入します。よろしいですか？\nお支払いは店頭にて承ります。": [
      "You are about to buy this session ticket. Do you want to continue?\nPayment is made at the salon.",
      "将购买此次卡。确定吗？\n请在店内付款。",
      "이 회수권을 구매합니다. 계속하시겠습니까?\n결제는 매장에서 받습니다.",
      "Vous allez acheter ce carnet. Continuer ?\nLe paiement s’effectue au salon.",
      "Va a comprar este bono. ¿Desea continuar?\nEl pago se realiza en el salón.",
      "Stai per acquistare questo carnet. Vuoi continuare?\nIl pagamento si effettua in salone.",
      "Sie kaufen diese Mehrfachkarte. Möchten Sie fortfahren?\nDie Bezahlung erfolgt im Salon."],
    "回数券のご購入にはログインが必要です。": ["You need to log in to buy session tickets.", "购买次卡需要登录。", "회수권을 구매하려면 로그인이 필요합니다.", "Vous devez être connecté pour acheter des carnets.", "Debe iniciar sesión para comprar bonos.", "Per acquistare carnet devi accedere.", "Zum Kauf von Mehrfachkarten müssen Sie angemeldet sein."],
    "回数券を購入しました。お支払いは店頭にて承ります。\n残り回数：{n}回": [
      "You have bought the session ticket. Payment is made at the salon.\nSessions remaining: {n}",
      "已购买次卡。请在店内付款。\n剩余次数：{n}次",
      "회수권을 구매했습니다. 결제는 매장에서 받습니다.\n남은 횟수: {n}회",
      "Carnet acheté. Le paiement s’effectue au salon.\nSéances restantes : {n}",
      "Ha comprado el bono. El pago se realiza en el salón.\nSesiones restantes: {n}",
      "Carnet acquistato. Il pagamento si effettua in salone.\nSedute rimanenti: {n}",
      "Mehrfachkarte gekauft. Die Bezahlung erfolgt im Salon.\nVerbleibende Behandlungen: {n}"],
    "\n\n以前ご購入の回数券で有効期限が切れていた未使用分 {n}回を復活しました。\n（「{plan}」・有効期限 {date}）": [
      "\n\n{n} unused session(s) from a previously purchased ticket that had expired have been reinstated.\n(“{plan}”, valid until {date})",
      "\n\n已恢复以往购买的次卡中已过期的未使用部分{n}次。\n（“{plan}”・有效期至{date}）",
      "\n\n이전에 구매하신 회수권 중 기한이 지난 미사용분 {n}회를 복원했습니다.\n(‘{plan}’・유효기간 {date})",
      "\n\n{n} séance(s) non utilisée(s) d’un carnet acheté précédemment et expiré ont été réintégrée(s).\n(« {plan} », valable jusqu’au {date})",
      "\n\nSe han restablecido {n} sesiones no usadas de un bono comprado anteriormente que había caducado.\n(«{plan}», válido hasta el {date})",
      "\n\nSono state ripristinate {n} sedute non usate di un carnet acquistato in precedenza e scaduto.\n(«{plan}», valido fino al {date})",
      "\n\n{n} nicht genutzte Behandlung(en) einer früher gekauften, abgelaufenen Mehrfachkarte wurden wiederhergestellt.\n(„{plan}“, gültig bis {date})"],
    "購入できませんでした。入力内容をご確認ください。": ["The purchase could not be completed. Please check your details.", "购买失败。请检查输入内容。", "구매하지 못했습니다. 입력 내용을 확인해 주세요.", "L’achat n’a pas pu être effectué. Vérifiez les informations saisies.", "No se ha podido completar la compra. Revise los datos introducidos.", "Impossibile completare l’acquisto. Controlla i dati inseriti.", "Der Kauf konnte nicht abgeschlossen werden. Bitte prüfen Sie Ihre Angaben."],
    "メインメニュー": ["Main menu", "主菜单", "메인 메뉴", "Menu principal", "Menú principal", "Menu principale", "Hauptmenü"],
    "モバイルメニュー": ["Mobile menu", "移动端菜单", "모바일 메뉴", "Menu mobile", "Menú móvil", "Menu mobile", "Mobiles Menü"],
    "言語": ["Language", "语言", "언어", "Langue", "Idioma", "Lingua", "Sprache"],
    "言語を選択": ["Choose language", "选择语言", "언어 선택", "Choisir la langue", "Elegir idioma", "Scegli la lingua", "Sprache wählen"],
    "AI翻訳": ["Translated by AI", "AI翻译", "AI 번역", "Traduit par IA", "Traducido por IA", "Tradotto dall'IA", "KI-Übersetzung"],
    // ---- 予約フォームの自動入力（ログイン中の会員）とマイページの会員情報（booking-tweaks.js・pm-mypage.html）----
    "会員情報から入力しました。内容をご確認のうえ、必要なら修正してください。": [
      "Filled in from your member information. Please check it and correct it if needed.",
      "已根据会员信息填写。请确认内容，如有需要请修改。",
      "회원 정보로 입력했습니다. 내용을 확인하시고 필요하면 수정해 주세요.",
      "Rempli à partir de vos informations de membre. Veuillez vérifier et corriger si nécessaire.",
      "Rellenado con sus datos de socio. Compruébelo y corríjalo si es necesario.",
      "Compilato con i tuoi dati di socio. Controlla e correggi se necessario.",
      "Aus Ihren Mitgliedsdaten ausgefüllt. Bitte prüfen und bei Bedarf korrigieren."],
    "会員情報に未登録のお名前・電話番号は、ご予約が完了すると会員情報にも保存され、次回から自動で入力されます。": [
      "If your name or phone number is not yet in your member information, it will be saved there when your booking is complete and filled in automatically next time.",
      "会员信息中尚未登记的姓名或电话号码，将在预约完成后一并保存到会员信息中，下次将自动填写。",
      "회원 정보에 등록되지 않은 성함·전화번호는 예약이 완료되면 회원 정보에도 저장되어 다음부터 자동으로 입력됩니다.",
      "Si votre nom ou votre numéro de téléphone ne figure pas encore dans vos informations de membre, il y sera enregistré à la fin de la réservation et rempli automatiquement la prochaine fois.",
      "Si su nombre o teléfono aún no figura en sus datos de socio, se guardará al completar la reserva y se rellenará automáticamente la próxima vez.",
      "Se nome o numero di telefono non sono ancora nei tuoi dati di socio, verranno salvati al termine della prenotazione e compilati automaticamente la prossima volta.",
      "Ist Ihr Name oder Ihre Telefonnummer noch nicht in Ihren Mitgliedsdaten hinterlegt, wird sie nach Abschluss der Reservierung dort gespeichert und beim nächsten Mal automatisch ausgefüllt."],
    "入力したお名前・電話番号で会員情報も更新する（次回から自動で入力されます）": [
      "Also update my member information with this name and phone number (it will be filled in automatically next time)",
      "同时用填写的姓名和电话号码更新会员信息（下次将自动填写）",
      "입력한 성함·전화번호로 회원 정보도 업데이트하기(다음부터 자동으로 입력됩니다)",
      "Mettre aussi à jour mes informations de membre avec ce nom et ce numéro (remplis automatiquement la prochaine fois)",
      "Actualizar también mis datos de socio con este nombre y teléfono (se rellenarán automáticamente la próxima vez)",
      "Aggiorna anche i miei dati di socio con questo nome e numero (verranno compilati automaticamente la prossima volta)",
      "Auch meine Mitgliedsdaten mit diesem Namen und dieser Telefonnummer aktualisieren (beim nächsten Mal automatisch ausgefüllt)"],
    "ここで変更したお名前・電話番号は、次回からのご予約で自動で入力されます（これまでのご予約の記録は変わりません）。": [
      "The name and phone number you change here will be filled in automatically for your next bookings (records of past bookings do not change).",
      "在此修改的姓名和电话号码，将在今后的预约中自动填写（以往预约的记录不会改变）。",
      "여기서 변경한 성함·전화번호는 다음 예약부터 자동으로 입력됩니다(지금까지의 예약 기록은 바뀌지 않습니다).",
      "Le nom et le numéro modifiés ici seront remplis automatiquement lors de vos prochaines réservations (les réservations passées restent inchangées).",
      "El nombre y el teléfono que cambie aquí se rellenarán automáticamente en sus próximas reservas (los registros de reservas anteriores no cambian).",
      "Nome e numero modificati qui verranno compilati automaticamente nelle prossime prenotazioni (i dati delle prenotazioni passate non cambiano).",
      "Hier geänderter Name und Telefonnummer werden bei Ihren nächsten Reservierungen automatisch ausgefüllt (bisherige Reservierungen bleiben unverändert)."],
    // ---- スタッフ紹介ページ（pm-staff.html）と、指名して予約する流れ（booking-tweaks.js）----
    "スタッフ紹介": ["Our Staff", "技师介绍", "스태프 소개", "Nos praticiens", "Nuestros terapeutas", "I nostri operatori", "Unsere Fachkräfte"],
    "男性スタッフ": ["Male staff", "男性工作人员", "남성 스태프", "Praticien (homme)", "Terapeuta (hombre)", "Operatore (uomo)", "Männliche Fachkraft"],
    "女性スタッフ": ["Female staff", "女性工作人员", "여성 스태프", "Praticienne (femme)", "Terapeuta (mujer)", "Operatrice (donna)", "Weibliche Fachkraft"],
    "指名料": ["Nomination fee", "指定费", "지명료", "Frais de désignation", "Cargo por designación", "Costo di designazione", "Nominierungsgebühr"],
    "指名して予約する": ["Book with this therapist", "指定并预约", "지명하여 예약하기", "Désigner et réserver", "Designar y reservar", "Designa e prenota", "Auswählen und reservieren"],
    "続きを読む": ["Read more", "展开全文", "더 보기", "Lire la suite", "Leer más", "Leggi tutto", "Weiterlesen"],
    "スタッフ情報を読み込めませんでした。": [
      "Could not load the staff information.", "无法加载工作人员信息。", "스태프 정보를 불러오지 못했습니다.",
      "Impossible de charger les informations sur les praticiens.", "No se pudo cargar la información de los terapeutas.",
      "Impossibile caricare le informazioni sugli operatori.", "Die Informationen zu den Fachkräften konnten nicht geladen werden."],
    "再読み込み": ["Reload", "重新加载", "다시 불러오기", "Recharger", "Volver a cargar", "Ricarica", "Neu laden"],
    "現在、ご指名いただけるスタッフはいません。": [
      "No therapists are currently available for nomination.", "目前没有可指定的工作人员。", "현재 지명할 수 있는 스태프가 없습니다.",
      "Aucun praticien n’est actuellement désignable.", "Actualmente no hay terapeutas designables.",
      "Al momento nessun operatore è designabile.", "Derzeit ist keine Fachkraft wählbar."],
    "指名スタッフ": ["Your therapist", "指定工作人员", "지명 스태프", "Praticien désigné", "Terapeuta designado", "Operatore designato", "Wunsch-Fachkraft"],
    "このスタッフが担当できるメニューを表示しています。": [
      "Showing the treatments this therapist can provide.", "显示该工作人员可负责的项目。", "이 스태프가 담당할 수 있는 메뉴를 표시하고 있습니다.",
      "Voici les soins que ce praticien peut réaliser.", "Se muestran los tratamientos que puede realizar este terapeuta.",
      "Sono mostrati i trattamenti che questo operatore può eseguire.", "Angezeigt werden die Behandlungen, die diese Fachkraft anbietet."],
    "このスタッフが担当できるメニューは現在ありません。": [
      "There are currently no treatments this therapist can provide.", "目前没有该工作人员可负责的项目。", "현재 이 스태프가 담당할 수 있는 메뉴가 없습니다.",
      "Aucun soin n’est actuellement proposé par ce praticien.", "Actualmente no hay tratamientos que este terapeuta pueda realizar.",
      "Al momento non ci sono trattamenti che questo operatore può eseguire.", "Derzeit gibt es keine Behandlungen, die diese Fachkraft anbietet."],
    "選択されたスタッフは現在ご指名いただけません。": [
      "The selected therapist is currently not available for nomination.", "目前无法指定所选的工作人员。", "선택하신 스태프는 현재 지명할 수 없습니다.",
      "Le praticien sélectionné n’est actuellement pas désignable.", "El terapeuta seleccionado no está disponible para designación en este momento.",
      "L’operatore selezionato al momento non è designabile.", "Die gewählte Fachkraft ist derzeit nicht wählbar."],
    "スタッフを選び直す": ["Choose another therapist", "重新选择工作人员", "스태프 다시 선택", "Choisir un autre praticien", "Elegir otro terapeuta", "Scegli un altro operatore", "Andere Fachkraft wählen"],
    "指名せずに予約する": ["Book without nominating", "不指定直接预约", "지명 없이 예약하기", "Réserver sans désigner de praticien", "Reservar sin designar terapeuta", "Prenota senza designare un operatore", "Ohne Wunsch-Fachkraft reservieren"],
  };

  // スタッフの紹介文（管理画面の「スタッフ情報」の文章 → [英, 中, 韓, 仏, 西, 伊, 独]）。
  // 原文の意味をそのまま訳す。管理画面で文章を書き換えると、訳が用意されるまでは日本語のまま表示される
  const STAFF_MSG = {
    "はじめまして。\n小顔矯正とオイルマッサージを得意としており、講師レベルの技術とお客様から評価をいただくこともあります。\n\n小顔矯正では、お顔のバランスや筋肉の状態を見ながら丁寧に調整し、施術前後の変化をすぐに実感していただける即効性を大切にしています。フェイスラインの引き締まりや左右バランスの改善を感じていただくお客様が多いです。\n\nオイルマッサージでは、筋肉の深い部分までしっかりアプローチしながら、リラックスと疲労回復の両方を感じていただける施術を心がけています。\n\n技術・接客ともに常に高いレベルを目指し、どのお客様にもご満足いただける施術を大切にしています。\nお身体やお顔のお悩みは、ぜひ安心してお任せください。心を込めて施術いたします。": [
      "Nice to meet you.\nI specialize in small-face contouring and oil massage, and customers sometimes describe my skills as instructor level.\n\nIn small-face contouring, I make careful adjustments while checking the balance of your face and the condition of the muscles, and I value immediate results you can feel right away when comparing before and after the treatment. Many customers notice a firmer facial contour and better left-right balance.\n\nIn oil massage, I work thoroughly into the deep layers of the muscles, aiming for a treatment that brings you both relaxation and recovery from fatigue.\n\nI always aim for a high level in both technique and service, and I value giving every customer a treatment they are satisfied with.\nPlease feel free to leave any concerns about your body or face to me. I will treat you with all my heart.",
      "初次见面。\n我擅长小脸矫正和精油按摩，也曾获得顾客“讲师级技术”的评价。\n\n小脸矫正时，我会一边观察面部的平衡和肌肉状态一边细致调整，注重让您在施术前后立刻感受到变化的即效性。很多顾客都感受到脸部线条变得紧致、左右平衡得到改善。\n\n精油按摩时，我会深入作用到肌肉深层，力求让您同时感受到放松与疲劳的恢复。\n\n在技术和接待两方面，我都始终追求高水准，用心为每一位顾客提供满意的施术。\n身体和面部的烦恼，请放心交给我。我会用心为您施术。",
      "처음 뵙겠습니다.\n소얼굴 교정과 오일 마사지가 특기이며, 고객님들께 강사 수준의 기술이라는 평가를 받기도 합니다.\n\n소얼굴 교정에서는 얼굴의 균형과 근육 상태를 살피며 정성껏 조정하고, 시술 전후의 변화를 바로 실감하실 수 있는 즉효성을 중요하게 생각합니다. 페이스라인이 탄탄해지고 좌우 균형이 좋아졌다고 느끼시는 고객님이 많습니다.\n\n오일 마사지에서는 근육 깊은 곳까지 확실하게 접근하면서, 릴랙스와 피로 회복을 모두 느끼실 수 있는 시술을 하려고 노력하고 있습니다.\n\n기술과 접객 모두 항상 높은 수준을 목표로 하며, 어떤 고객님께서도 만족하실 수 있는 시술을 소중히 여기고 있습니다.\n몸이나 얼굴의 고민은 안심하고 맡겨 주세요. 정성을 다해 시술하겠습니다.",
      "Enchanté.\nJe suis spécialisé dans la correction « petit visage » et le massage à l’huile, et des clients qualifient parfois ma technique de niveau formateur.\n\nPour la correction « petit visage », j’ajuste avec soin en observant l’équilibre du visage et l’état des muscles, et je tiens à un effet immédiat que vous ressentez tout de suite en comparant l’avant et l’après. Beaucoup de clients constatent un ovale du visage plus ferme et un meilleur équilibre entre la gauche et la droite.\n\nPour le massage à l’huile, je travaille en profondeur dans les muscles tout en veillant à ce que vous ressentiez à la fois détente et récupération de la fatigue.\n\nJe vise toujours un haut niveau, tant pour la technique que pour l’accueil, et j’attache de l’importance à ce que chaque client soit satisfait de son soin.\nN’hésitez pas à me confier vos soucis concernant le corps ou le visage. Je vous soignerai de tout cœur.",
      "Encantado de conocerle.\nMe especializo en la corrección «rostro pequeño» y en el masaje con aceite, y algunos clientes valoran mi técnica como de nivel de instructor.\n\nEn la corrección «rostro pequeño», ajusto con cuidado observando el equilibrio del rostro y el estado de los músculos, y doy importancia a un efecto inmediato que pueda notar enseguida al comparar el antes y el después del tratamiento. Muchos clientes notan un contorno facial más firme y un mejor equilibrio entre el lado izquierdo y el derecho.\n\nEn el masaje con aceite, trabajo a fondo hasta las capas profundas de los músculos, procurando que sienta tanto relajación como recuperación del cansancio.\n\nSiempre aspiro a un alto nivel tanto en la técnica como en la atención, y me importa que todos los clientes queden satisfechos con el tratamiento.\nConfíeme con tranquilidad sus preocupaciones sobre el cuerpo o el rostro. Le atenderé con todo mi corazón.",
      "Piacere di conoscerti.\nSono specializzato nella correzione «viso piccolo» e nel massaggio con olio, e alcuni clienti definiscono la mia tecnica da livello istruttore.\n\nNella correzione «viso piccolo» regolo con cura osservando l’equilibrio del viso e lo stato dei muscoli, e tengo molto a un effetto immediato che si percepisce subito confrontando il prima e il dopo. Molti clienti notano un contorno del viso più tonico e un migliore equilibrio tra lato destro e sinistro.\n\nNel massaggio con olio lavoro a fondo fino agli strati profondi dei muscoli, cercando di offrire un trattamento che dia sia relax sia recupero dalla stanchezza.\n\nPunto sempre a un livello elevato sia nella tecnica sia nell’accoglienza, e ci tengo che ogni cliente sia soddisfatto del trattamento.\nAffidami pure con fiducia i tuoi problemi del corpo o del viso. Ti tratterò con tutto il cuore.",
      "Freut mich, Sie kennenzulernen.\nMeine Spezialgebiete sind Gesichtskonturierung („Small Face“) und Ölmassage, und Kunden bewerten meine Technik manchmal als Ausbilderniveau.\n\nBei der Gesichtskonturierung justiere ich sorgfältig, während ich die Balance Ihres Gesichts und den Zustand der Muskeln prüfe, und lege Wert auf eine Sofortwirkung, die Sie im Vorher-Nachher-Vergleich direkt spüren. Viele Kunden bemerken eine straffere Gesichtskontur und eine bessere Balance zwischen links und rechts.\n\nBei der Ölmassage arbeite ich gezielt bis in die tiefen Muskelschichten und achte darauf, dass Sie sowohl Entspannung als auch Erholung von der Müdigkeit spüren.\n\nIch strebe sowohl bei der Technik als auch im Service stets ein hohes Niveau an und lege Wert darauf, dass jeder Kunde mit der Behandlung zufrieden ist.\nVertrauen Sie mir Ihre Beschwerden an Körper oder Gesicht gerne an. Ich behandle Sie mit ganzem Herzen."],
    "はじめまして。\n体格を活かしたパワーのある施術と、足裏マッサージ・オイルマッサージが得意です。\n\n足裏には全身につながる反射区があり、丁寧に刺激していくことで、脚の疲れやむくみ、全身のだるさをスッキリさせていきます。長時間歩いた後や立ち仕事の方にもとてもおすすめです。\n\nまた、オイルマッサージでは深いコリまでしっかりアプローチしながら、筋肉をゆっくりほぐしていく施術を心がけています。しっかり効かせる施術からリラックス重視まで、お客様のお好みに合わせて細かく調整いたします。\n\n「体が軽くなった」「足がすごく楽になった」と感じていただけるよう、毎回心を込めて施術します。\nお疲れの際は、ぜひお気軽にお任せください。": [
      "Nice to meet you.\nI specialize in powerful treatments that make the most of my build, as well as foot sole massage and oil massage.\n\nThe soles of the feet have reflex zones connected to the whole body, and by stimulating them carefully I relieve tired, swollen legs and heaviness throughout the body. I highly recommend it after long walks and for people who work on their feet.\n\nIn oil massage, I work thoroughly on deep knots while slowly loosening the muscles. From firm, effective pressure to a focus on relaxation, I fine-tune the treatment to your preferences.\n\nI put my heart into every treatment so that you feel “my body feels lighter” and “my feet feel so much better.”\nWhenever you are tired, please feel free to leave it to me.",
      "初次见面。\n我擅长发挥体格优势的有力施术，以及足底按摩和精油按摩。\n\n足底有连接全身的反射区，通过细致的刺激，可以舒缓腿部疲劳、浮肿以及全身的倦怠感。非常推荐长时间步行后或需要站立工作的顾客。\n\n此外，精油按摩时，我会深入作用到深层的僵硬部位，同时慢慢放松肌肉。从力度到位的施术到注重放松的施术，我都会根据您的喜好细致调整。\n\n为了让您感受到“身体变轻了”“脚舒服多了”，我每次都用心施术。\n疲惫的时候，欢迎随时交给我。",
      "처음 뵙겠습니다.\n체격을 살린 힘 있는 시술과 발바닥 마사지·오일 마사지가 특기입니다.\n\n발바닥에는 온몸과 연결된 반사구가 있어, 정성껏 자극하면 다리의 피로와 부기, 온몸의 나른함이 개운해집니다. 오래 걸으신 후나 서서 일하시는 분께 특히 추천합니다.\n\n또한 오일 마사지에서는 깊은 뭉침까지 확실하게 접근하면서 근육을 천천히 풀어 주는 시술을 하려고 노력하고 있습니다. 확실하게 효과를 주는 시술부터 릴랙스 중심의 시술까지, 고객님의 취향에 맞춰 세심하게 조정해 드립니다.\n\n“몸이 가벼워졌다”, “다리가 정말 편해졌다”고 느끼실 수 있도록 매번 정성을 다해 시술합니다.\n피곤하실 때는 언제든 편하게 맡겨 주세요.",
      "Enchanté.\nJe suis spécialisé dans les soins puissants qui tirent parti de ma carrure, ainsi que dans le massage de la plante des pieds et le massage à l’huile.\n\nLa plante des pieds comporte des zones réflexes reliées à tout le corps ; en les stimulant avec soin, je soulage la fatigue et le gonflement des jambes ainsi que la lourdeur de tout le corps. Je le recommande vivement après une longue marche ou aux personnes qui travaillent debout.\n\nPour le massage à l’huile, je travaille en profondeur sur les tensions tout en dénouant lentement les muscles. D’un soin bien appuyé à un soin axé sur la détente, j’ajuste chaque détail selon vos préférences.\n\nJe mets tout mon cœur dans chaque séance pour que vous ressentiez « mon corps est plus léger » et « mes pieds vont tellement mieux ».\nQuand vous êtes fatigué, n’hésitez pas à faire appel à moi.",
      "Encantado de conocerle.\nMe especializo en tratamientos potentes que aprovechan mi complexión, así como en el masaje de la planta de los pies y el masaje con aceite.\n\nEn la planta de los pies hay zonas reflejas conectadas con todo el cuerpo; al estimularlas con cuidado, alivio el cansancio y la hinchazón de las piernas y la pesadez de todo el cuerpo. Lo recomiendo especialmente después de caminar mucho y a quienes trabajan de pie.\n\nEn el masaje con aceite, trabajo a fondo las contracturas profundas mientras voy relajando los músculos poco a poco. Desde una presión firme y eficaz hasta un enfoque en la relajación, ajusto el tratamiento con detalle según sus preferencias.\n\nPongo todo mi corazón en cada sesión para que sienta que «tengo el cuerpo más ligero» y «tengo los pies mucho mejor».\nCuando esté cansado, no dude en confiar en mí.",
      "Piacere di conoscerti.\nSono specializzato in trattamenti energici che sfruttano la mia corporatura, oltre che nel massaggio plantare e nel massaggio con olio.\n\nSulla pianta dei piedi ci sono zone riflesse collegate a tutto il corpo: stimolandole con cura, allevio la stanchezza e il gonfiore delle gambe e la pesantezza di tutto il corpo. Lo consiglio molto dopo lunghe camminate e a chi lavora in piedi.\n\nNel massaggio con olio lavoro a fondo sulle contratture profonde, sciogliendo lentamente i muscoli. Da un trattamento deciso ed efficace a uno incentrato sul relax, regolo ogni dettaglio in base alle tue preferenze.\n\nMetto il cuore in ogni trattamento perché tu possa sentire «il corpo è più leggero» e «i piedi stanno molto meglio».\nQuando sei stanco, affidati pure a me.",
      "Freut mich, Sie kennenzulernen.\nIch bin spezialisiert auf kraftvolle Behandlungen, bei denen ich meinen Körperbau nutze, sowie auf Fußsohlenmassage und Ölmassage.\n\nAn den Fußsohlen liegen Reflexzonen, die mit dem ganzen Körper verbunden sind. Durch sorgfältige Stimulation lindere ich müde, geschwollene Beine und Abgeschlagenheit im ganzen Körper. Besonders empfehlenswert nach langem Gehen und für Menschen, die im Stehen arbeiten.\n\nBei der Ölmassage arbeite ich gründlich an tiefen Verspannungen und löse die Muskeln langsam. Von einer kräftigen, wirksamen Behandlung bis zum Fokus auf Entspannung passe ich alles genau an Ihre Wünsche an.\n\nIch behandle jedes Mal mit ganzem Herzen, damit Sie spüren: „Mein Körper ist leichter geworden“ und „Meine Füße fühlen sich viel besser an“.\nWenn Sie erschöpft sind, vertrauen Sie sich mir gerne an."],
    "※注意　指名料500円→2500円\nはじめまして。\nオイルマッサージを得意としており、「驚くほど上手い」とお客様からお声をいただくことも多いです。\n\n筋肉質な体格を活かし、しっかりとした圧で深いコリまで丁寧にほぐしていきます。力強さの中にもリズムと心地よさを大切にした施術で、全身が軽くなるような感覚を目指しています。\n\nまた、英語での対応も可能ですので、海外からのお客様にも安心してご利用いただいています。\nお客様一人ひとりに合わせた丁寧な接客と、気持ちの良いサービスを心がけています。\n\n「またお願いしたい」と思っていただけるよう、心を込めて施術いたします。\nオイルマッサージがお好きな方は、ぜひ一度お任せください。": [
      "*Note: Nomination fee 500 JPY → 2,500 JPY\nNice to meet you.\nI specialize in oil massage, and customers often tell me I am “surprisingly good.”\n\nMaking use of my muscular build, I carefully loosen even deep knots with firm pressure. Within that strength, I value rhythm and comfort, aiming to leave your whole body feeling lighter.\n\nI can also assist you in English, so guests from overseas use our services with peace of mind.\nI strive to provide attentive service tailored to each customer and a pleasant experience.\n\nI put my heart into every treatment so that you will want to come back again.\nIf you love oil massage, please give me a try.",
      "※注意：指定费 500 JPY→2,500 JPY\n初次见面。\n我擅长精油按摩，经常有顾客评价“好得令人惊讶”。\n\n我会发挥肌肉型体格的优势，用扎实的力度细致地揉开深层的僵硬。在有力的同时也注重节奏与舒适感，力求让您感到全身轻盈。\n\n此外，我也可以用英语接待，海外的顾客也能放心光临。\n我致力于根据每位顾客提供细致的接待和舒心的服务。\n\n为了让您觉得“还想再来”，我会用心为您施术。\n喜欢精油按摩的顾客，欢迎来体验一次。",
      "※주의 지명료 500 JPY→2,500 JPY\n처음 뵙겠습니다.\n오일 마사지가 특기이며, 고객님들께 “놀라울 정도로 잘한다”는 말씀을 자주 듣습니다.\n\n근육질 체격을 살려 탄탄한 압으로 깊은 뭉침까지 정성껏 풀어 드립니다. 힘 있는 시술 속에서도 리듬과 편안함을 중요하게 여기며, 온몸이 가벼워지는 느낌을 목표로 합니다.\n\n또한 영어로도 응대할 수 있어 해외에서 오신 고객님들도 안심하고 이용하고 계십니다.\n고객님 한 분 한 분에게 맞춘 세심한 응대와 기분 좋은 서비스를 위해 노력하고 있습니다.\n\n“또 받고 싶다”고 생각하실 수 있도록 정성을 다해 시술하겠습니다.\n오일 마사지를 좋아하시는 분은 꼭 한번 맡겨 주세요.",
      "*Attention : frais de désignation 500 JPY → 2 500 JPY\nEnchanté.\nJe suis spécialisé dans le massage à l’huile, et des clients me disent souvent que je suis « étonnamment doué ».\n\nGrâce à ma carrure musclée, je dénoue avec soin même les tensions profondes par une pression bien appuyée. Dans cette puissance, je privilégie aussi le rythme et le confort, avec pour objectif que tout votre corps se sente plus léger.\n\nJe peux également vous accueillir en anglais, si bien que les clients venus de l’étranger profitent de nos services en toute sérénité.\nJe m’efforce d’offrir à chaque client un accueil attentionné et adapté ainsi qu’un service agréable.\n\nJe mets tout mon cœur dans chaque soin pour que vous ayez envie de revenir.\nSi vous aimez le massage à l’huile, n’hésitez pas à me faire confiance au moins une fois.",
      "*Atención: cargo por designación 500 JPY → 2.500 JPY\nEncantado de conocerle.\nMe especializo en el masaje con aceite, y los clientes a menudo me dicen que lo hago «sorprendentemente bien».\n\nAprovechando mi complexión musculosa, deshago con cuidado incluso las contracturas profundas con una presión firme. Dentro de esa fuerza, cuido el ritmo y la comodidad, con el objetivo de que sienta todo el cuerpo más ligero.\n\nAdemás, puedo atenderle en inglés, por lo que los clientes del extranjero también nos visitan con total tranquilidad.\nProcuro ofrecer a cada cliente una atención esmerada y adaptada, y un servicio agradable.\n\nPongo todo mi corazón en cada tratamiento para que quiera volver.\nSi le gusta el masaje con aceite, no dude en probar conmigo.",
      "*Attenzione: costo di designazione 500 JPY → 2.500 JPY\nPiacere di conoscerti.\nSono specializzato nel massaggio con olio, e i clienti mi dicono spesso che sono «sorprendentemente bravo».\n\nSfruttando la mia corporatura muscolosa, sciolgo con cura anche le contratture profonde con una pressione decisa. Anche nella forza do importanza al ritmo e al comfort, con l’obiettivo di farti sentire tutto il corpo più leggero.\n\nPosso inoltre seguirti in inglese, quindi anche i clienti dall’estero si affidano a noi in tutta tranquillità.\nMi impegno a offrire a ogni cliente un’accoglienza attenta e su misura e un servizio piacevole.\n\nMetto il cuore in ogni trattamento perché tu abbia voglia di tornare.\nSe ami il massaggio con olio, affidati a me almeno una volta.",
      "*Hinweis: Nominierungsgebühr 500 JPY → 2.500 JPY\nFreut mich, Sie kennenzulernen.\nIch bin auf Ölmassage spezialisiert, und Kunden sagen mir oft, ich sei „erstaunlich gut“.\n\nMit meinem muskulösen Körperbau löse ich auch tiefe Verspannungen sorgfältig mit festem Druck. Bei aller Kraft lege ich Wert auf Rhythmus und Wohlgefühl und möchte erreichen, dass sich Ihr ganzer Körper leichter anfühlt.\n\nAußerdem kann ich Sie auf Englisch betreuen, sodass auch Gäste aus dem Ausland unser Angebot unbesorgt nutzen.\nIch bemühe mich um eine aufmerksame, auf jeden Kunden abgestimmte Betreuung und einen angenehmen Service.\n\nIch behandle mit ganzem Herzen, damit Sie gerne wiederkommen möchten.\nWenn Sie Ölmassagen mögen, vertrauen Sie sich mir gerne einmal an."],
    "私は、お客様がふっと肩の力を抜いて、心からリラックスできる「穏やかで優しい時間」を提供することを大切にしています。お体のお悩みはもちろん、その日の気分や細かなご要望にも丁寧に耳を傾け、手のひらから伝わる温もりで、日々の疲れを一つひとつ丁寧に解きほぐしていきます。\n\nまた、海外からお越しのお客様にも安心してお過ごしいただけるよう、英語でのカウンセリングやコミュニケーションにも対応しております。「言葉の壁」を感じることなく、最高のリラクゼーションを体感していただけるよう努めています。\n\n◆ 得意な施術\n\n足裏マッサージ： 「第二の心臓」と呼ばれる足裏を丁寧に刺激し、全身の血行を促進します。長旅や立ち仕事でパンパンに張ってしまった脚も、驚くほど軽やかに整えます。\n\nタイ古式マッサージ： 優しいリズムのストレッチで、普段使わない筋肉をゆっくりと伸ばします。無理な負荷をかけず、呼吸に合わせた丁寧なアプローチで、体本来の柔軟性を取り戻します。\n\n◆ お客様へ（Message to Our Guests）\n忙しい日常の中で、自分のための時間を作ることはとても大切です。\n「痛いのは苦手だけど、しっかり解されたい」「リラックスしてぐっすり眠りたい」といったご希望も、遠慮なくお聞かせください。": [
      "I value offering a “calm and gentle time” in which you can let your shoulders drop and truly relax. I listen carefully not only to your physical concerns but also to how you feel that day and to your detailed requests, and with the warmth of my palms I carefully ease away the fatigue of daily life, one by one.\n\nSo that guests from overseas can also feel at ease, I can provide counseling and communicate in English. I strive to help you experience the best relaxation without feeling any “language barrier.”\n\n◆ My specialties\n\nFoot sole massage: I carefully stimulate the soles of the feet, known as the “second heart,” to promote circulation throughout the body. Even legs that have become tight and swollen from long journeys or work on your feet are left feeling surprisingly light.\n\nTraditional Thai massage: With gently rhythmic stretches, I slowly stretch muscles you do not normally use. Without putting any undue strain on your body, I restore its natural flexibility through a careful approach matched to your breathing.\n\n◆ Message to Our Guests\nMaking time for yourself in a busy daily life is very important.\nPlease do not hesitate to tell me your wishes, such as “I don’t like pain, but I want my tension properly worked out” or “I want to relax and sleep soundly.”",
      "我非常重视为顾客提供一段能够放松肩膀、发自内心放松的“平静而温柔的时光”。除了身体上的烦恼，我也会认真倾听您当天的心情和细微的要求，用掌心传递的温暖，一点一点细致地化解日常的疲劳。\n\n此外，为了让海外的顾客也能安心享受，我也可以用英语进行咨询和沟通。我努力让您在没有“语言障碍”的情况下，体验最好的放松。\n\n◆ 擅长的施术\n\n足底按摩：细致地刺激被称为“第二心脏”的足底，促进全身血液循环。即使是因长途旅行或站立工作而紧绷肿胀的双腿，也能调理得惊人地轻盈。\n\n泰式古法按摩：通过节奏温和的拉伸，慢慢伸展平时不常用到的肌肉。不施加勉强的负荷，配合呼吸细致地进行，恢复身体原本的柔软度。\n\n◆ 致顾客（Message to Our Guests）\n在忙碌的日常中，为自己留出时间是非常重要的。\n“怕痛，但想被好好按开”“想放松后好好睡一觉”等希望，也请不要客气，尽管告诉我。",
      "저는 고객님께서 어깨의 힘을 툭 빼고 진심으로 릴랙스하실 수 있는 ‘온화하고 다정한 시간’을 제공하는 것을 소중히 여기고 있습니다. 몸의 고민은 물론, 그날의 기분이나 세세한 요청에도 정성껏 귀를 기울이며, 손바닥으로 전해지는 온기로 일상의 피로를 하나하나 정성껏 풀어 드립니다.\n\n또한 해외에서 오신 고객님도 안심하고 보내실 수 있도록 영어로 상담과 소통도 가능합니다. ‘언어의 장벽’을 느끼지 않고 최고의 릴랙세이션을 체감하실 수 있도록 노력하고 있습니다.\n\n◆ 특기 시술\n\n발바닥 마사지: ‘제2의 심장’이라 불리는 발바닥을 정성껏 자극하여 온몸의 혈액 순환을 촉진합니다. 긴 여행이나 서서 하는 일로 퉁퉁 부은 다리도 놀라울 만큼 가볍게 정돈해 드립니다.\n\n타이 전통 마사지: 부드러운 리듬의 스트레칭으로 평소 쓰지 않는 근육을 천천히 늘려 줍니다. 무리한 부담 없이 호흡에 맞춘 세심한 접근으로 몸 본래의 유연성을 되찾아 드립니다.\n\n◆ 고객님께 (Message to Our Guests)\n바쁜 일상 속에서 자신을 위한 시간을 만드는 것은 매우 중요합니다.\n“아픈 건 싫지만 확실하게 풀고 싶다”, “릴랙스해서 푹 자고 싶다” 같은 바람도 사양하지 말고 말씀해 주세요.",
      "J’attache une grande importance à vous offrir un « moment calme et doux » où vous pouvez relâcher vos épaules et vous détendre profondément. J’écoute attentivement non seulement vos soucis physiques, mais aussi votre humeur du jour et vos demandes les plus précises, et, avec la chaleur transmise par mes paumes, je dénoue soigneusement, une à une, les fatigues du quotidien.\n\nPour que les clients venus de l’étranger se sentent également à l’aise, je peux assurer l’entretien préalable et la communication en anglais. Je m’efforce de vous faire vivre la meilleure relaxation sans ressentir la moindre « barrière de la langue ».\n\n◆ Mes soins de prédilection\n\nMassage de la plante des pieds : je stimule avec soin la plante des pieds, surnommée le « deuxième cœur », pour favoriser la circulation sanguine dans tout le corps. Même les jambes tendues et gonflées par un long voyage ou un travail debout retrouvent une légèreté étonnante.\n\nMassage thaïlandais traditionnel : par des étirements au rythme doux, j’étire lentement les muscles que vous n’utilisez pas d’habitude. Sans imposer de contrainte excessive, par une approche attentive accordée à votre respiration, je rends au corps sa souplesse naturelle.\n\n◆ À nos clients (Message to Our Guests)\nDans un quotidien chargé, prendre du temps pour soi est très important.\nN’hésitez pas à me faire part de vos souhaits, par exemple « je n’aime pas avoir mal, mais je veux être bien dénoué(e) » ou « je veux me détendre et bien dormir ».",
      "Para mí es muy importante ofrecer un «tiempo sereno y amable» en el que pueda soltar la tensión de los hombros y relajarse de verdad. Escucho con atención no solo sus molestias físicas, sino también su estado de ánimo del día y sus peticiones más concretas, y con la calidez que transmiten mis manos voy deshaciendo con cuidado, una a una, las fatigas del día a día.\n\nAdemás, para que los clientes que vienen del extranjero se sientan tranquilos, puedo atenderle en inglés tanto en la consulta previa como en la comunicación. Me esfuerzo para que disfrute de la mejor relajación sin sentir ninguna «barrera del idioma».\n\n◆ Mis especialidades\n\nMasaje de la planta de los pies: estimulo con cuidado la planta de los pies, conocida como el «segundo corazón», para favorecer la circulación en todo el cuerpo. Incluso las piernas muy cargadas e hinchadas por un viaje largo o por trabajar de pie quedan sorprendentemente ligeras.\n\nMasaje tailandés tradicional: con estiramientos de ritmo suave, estiro lentamente los músculos que normalmente no usa. Sin forzar el cuerpo, con un trabajo cuidadoso acompasado a su respiración, le devuelvo su flexibilidad natural.\n\n◆ A nuestros clientes (Message to Our Guests)\nEn el ajetreo diario, reservar tiempo para uno mismo es muy importante.\nNo dude en contarme sus deseos, como «no me gusta el dolor, pero quiero que me descontracturen bien» o «quiero relajarme y dormir profundamente».",
      "Tengo molto a offrirti un «momento sereno e delicato» in cui puoi sciogliere la tensione delle spalle e rilassarti davvero. Ascolto con attenzione non solo i tuoi disturbi fisici, ma anche il tuo umore del giorno e le tue richieste più dettagliate, e con il calore trasmesso dai miei palmi sciolgo con cura, uno per uno, gli affaticamenti della vita quotidiana.\n\nInoltre, perché anche i clienti dall’estero possano sentirsi a proprio agio, posso occuparmi del colloquio iniziale e della comunicazione in inglese. Mi impegno perché tu possa vivere il miglior relax senza percepire alcuna «barriera linguistica».\n\n◆ I miei trattamenti preferiti\n\nMassaggio plantare: stimolo con cura la pianta dei piedi, chiamata il «secondo cuore», per favorire la circolazione in tutto il corpo. Anche le gambe tese e gonfie per un lungo viaggio o per il lavoro in piedi tornano sorprendentemente leggere.\n\nMassaggio thailandese tradizionale: con allungamenti dal ritmo delicato distendo lentamente i muscoli che di solito non usi. Senza forzare, con un approccio attento e in sintonia con il respiro, restituisco al corpo la sua naturale flessibilità.\n\n◆ Ai nostri ospiti (Message to Our Guests)\nNella frenesia quotidiana è molto importante ritagliarsi del tempo per sé.\nNon esitare a dirmi i tuoi desideri, come «non sopporto il dolore, ma voglio essere sciolto/a bene» o «voglio rilassarmi e dormire profondamente».",
      "Mir ist es wichtig, Ihnen eine „ruhige und sanfte Zeit“ zu schenken, in der Sie die Schultern sinken lassen und sich von Herzen entspannen können. Ich höre aufmerksam zu – nicht nur bei körperlichen Beschwerden, sondern auch bei Ihrer Tagesverfassung und Ihren genauen Wünschen – und löse mit der Wärme meiner Handflächen die Erschöpfung des Alltags sorgfältig Schritt für Schritt.\n\nDamit sich auch Gäste aus dem Ausland wohlfühlen, biete ich das Vorgespräch und die Verständigung auch auf Englisch an. Ich bemühe mich, dass Sie ohne jede „Sprachbarriere“ die bestmögliche Entspannung erleben.\n\n◆ Meine Spezialgebiete\n\nFußsohlenmassage: Ich stimuliere sorgfältig die Fußsohlen, die als „zweites Herz“ gelten, und fördere so die Durchblutung des ganzen Körpers. Selbst Beine, die von langen Reisen oder der Arbeit im Stehen prall und verspannt sind, fühlen sich danach erstaunlich leicht an.\n\nTraditionelle Thai-Massage: Mit Dehnungen in sanftem Rhythmus strecke ich langsam Muskeln, die Sie im Alltag kaum benutzen. Ohne übermäßige Belastung und mit einer sorgfältigen, auf Ihre Atmung abgestimmten Vorgehensweise gewinnt Ihr Körper seine natürliche Beweglichkeit zurück.\n\n◆ An unsere Gäste (Message to Our Guests)\nIm hektischen Alltag ist es sehr wichtig, sich Zeit für sich selbst zu nehmen.\nSagen Sie mir Ihre Wünsche ganz offen, etwa „Ich mag keine Schmerzen, möchte aber gründlich gelockert werden“ oder „Ich möchte mich entspannen und tief schlafen“."],
    "はじめまして。丁寧なカウンセリングとオイルリンパマッサージが得意です。お身体の状態に合わせて、リラックスしていただける施術を心がけています。": [
      "Nice to meet you. I specialize in careful counseling and oil lymphatic massage. I aim to provide relaxing treatments tailored to the condition of your body.",
      "初次见面。我擅长细致的咨询和精油淋巴按摩。我会根据您的身体状况，用心提供让您放松的施术。",
      "처음 뵙겠습니다. 세심한 상담과 오일 림프 마사지가 특기입니다. 몸 상태에 맞춰 릴랙스하실 수 있는 시술을 하려고 노력하고 있습니다.",
      "Enchantée. Je suis spécialisée dans l’entretien préalable attentif et le massage lymphatique à l’huile. Je veille à vous offrir un soin relaxant adapté à l’état de votre corps.",
      "Encantada de conocerle. Me especializo en una consulta previa detallada y en el masaje linfático con aceite. Procuro ofrecer tratamientos relajantes adaptados al estado de su cuerpo.",
      "Piacere di conoscerti. Sono specializzata in un colloquio iniziale accurato e nel massaggio linfatico con olio. Cerco di offrire trattamenti rilassanti adatti alle condizioni del tuo corpo.",
      "Freut mich, Sie kennenzulernen. Meine Stärken sind die sorgfältige Beratung und die Öl-Lymphmassage. Ich achte darauf, Ihnen eine entspannende, auf Ihren körperlichen Zustand abgestimmte Behandlung zu bieten."],
    "力強い指圧と全身整体が得意です。スポーツ経験を活かし、深いコリにもしっかりアプローチします。": [
      "I specialize in strong shiatsu pressure and full-body seitai. Drawing on my sports experience, I work thoroughly on even deep knots.",
      "我擅长有力的指压和全身整体。我会发挥运动经验，深入作用到深层的僵硬部位。",
      "힘 있는 지압과 전신 정체가 특기입니다. 스포츠 경험을 살려 깊은 뭉침에도 확실하게 접근합니다.",
      "Je suis spécialisé dans le shiatsu appuyé et le seitai du corps entier. Fort de mon expérience sportive, je traite en profondeur même les tensions les plus ancrées.",
      "Me especializo en la digitopresión enérgica y el seitai de cuerpo completo. Aprovechando mi experiencia deportiva, trabajo a fondo incluso las contracturas profundas.",
      "Sono specializzato nella digitopressione energica e nel seitai total body. Grazie alla mia esperienza sportiva, lavoro a fondo anche sulle contratture profonde.",
      "Meine Stärken sind kräftige Shiatsu-Druckmassage und Ganzkörper-Seitai. Mit meiner Sporterfahrung gehe ich auch tiefe Verspannungen gezielt an."],
  };

  // ---- ここから下は予約サイト本体の辞書などから自動で作ったデータ ----
  const BT = {"reference":["予約番号","Booking number","预约编号","예약 번호","N° de réservation","N.º de reserva","N. prenotazione","Reservierungsnummer"],"selection":["選択中のメニュー","Selected menu","已选项目","선택한 메뉴","Soin sélectionné","Tratamiento seleccionado","Trattamento selezionato","Gewählte Behandlung"],"name":["お名前","Full name","姓名","성함","Nom","Nombre","Nome","Name"],"date":["来店日時","Date and time","到店日期和时间","방문 날짜 및 시간","Date et heure","Fecha y hora","Data e ora","Datum und Uhrzeit"],"count":["人数","Guests","人数","인원","Personnes","Personas","Persone","Personen"],"staffLabel":["スタッフ","Staff","工作人员","스태프","Praticien","Terapeuta","Operatore","Fachkraft"],"total":["合計","Total","合计","합계","Total","Total","Totale","Gesamt"],"done":["予約が完了しました","Your booking is confirmed","预约已完成","예약이 완료되었습니다","Réservation confirmée","Reserva completada","Prenotazione completata","Reservierung abgeschlossen"],"privacy":["お名前・連絡先は予約管理とご連絡に使用します。変更・取消はお電話で承ります。","Your name and contact details are used to manage your booking and contact you. Please call to change or cancel.","您的姓名和联系方式仅用于预约管理及联系。变更或取消请致电。","성함과 연락처는 예약 관리 및 연락에 사용합니다. 변경 및 취소는 전화로 문의해 주세요.","Vos nom et coordonnées servent à gérer la réservation et à vous contacter. Modification et annulation par téléphone.","Su nombre y contacto se usan para gestionar la reserva y comunicarnos con usted. Cambios y cancelaciones por teléfono.","Nome e contatti servono per gestire la prenotazione e per contattarti. Modifiche e cancellazioni per telefono.","Name und Kontaktdaten dienen der Verwaltung der Reservierung und der Kontaktaufnahme. Änderung und Stornierung telefonisch."],"print":["予約内容を印刷・保存","Print or save booking","打印或保存预约","예약 인쇄 또는 저장","Imprimer / enregistrer la réservation","Imprimir / guardar la reserva","Stampa / salva la prenotazione","Reservierung drucken / speichern"],"submit":["この内容で予約を確定する","Confirm booking","确认预约","이 내용으로 예약 확정","Confirmer la réservation","Confirmar la reserva","Conferma la prenotazione","Reservierung bestätigen"],"saving":["予約を確定しています…","Confirming your booking…","正在确认预约…","예약을 확정하고 있습니다…","Confirmation en cours…","Confirmando la reserva…","Conferma in corso…","Reservierung wird bestätigt…"],"consent":["予約内容と個人情報の取り扱いを確認しました。","I have checked my booking and the use of my personal information.","我已确认预约内容和个人信息的使用方式。","예약 내용과 개인정보 이용을 확인했습니다.","J'ai vérifié la réservation et le traitement de mes données personnelles.","He revisado la reserva y el tratamiento de mis datos personales.","Ho verificato la prenotazione e il trattamento dei miei dati personali.","Ich habe die Reservierung und die Verarbeitung meiner Daten geprüft."]};
  const NAV = {"home":["ホーム","Home","首页","홈","Accueil","Inicio","Home","Start"],"book":["予約","Book","预约","예약","Réserver","Reservar","Prenota","Reservieren"],"menu":["メニュー","Menu","菜单","메뉴","Menu","Menú","Menù","Menü"],"staff":["スタッフ","Staff","技师","스태프","Praticiens","Terapeutas","Operatori","Fachkräfte"],"map":["マップ","Map","地图","지도","Plan","Mapa","Mappa","Karte"],"login":["ログイン","Login","登录","로그인","Connexion","Iniciar sesión","Accedi","Anmelden"],"language":["Language","English","简体中文","한국어","Français","Español","Italiano","Deutsch"]};
  const MENU = {"【本日限定】全身整体60分＋足裏マッサージ 60分 通常料金13200円→12000円":["[Today Only] Full-Body Seitai 60 min + Foot Sole Massage 60 min  Regular price 13,200 JPY → 12,000 JPY","【今日限定】全身整体60分钟＋足底按摩60分钟 原价13,200 JPY→12,000 JPY","【오늘 한정】전신 정체 60분＋발바닥 마사지 60분 정상가 13,200 JPY→12,000 JPY","[Aujourd’hui seulement] Seitai du corps entier 60 min + massage de la plante des pieds 60 min  Prix normal 13 200 JPY → 12 000 JPY","[Solo hoy] Seitai de cuerpo completo 60 min + masaje de la planta de los pies 60 min  Precio normal 13.200 JPY → 12.000 JPY","[Solo oggi] Seitai total body 60 min + massaggio plantare 60 min  Prezzo normale 13.200 JPY → 12.000 JPY","[Nur heute] Ganzkörper-Seitai 60 Min. + Fußsohlenmassage 60 Min.  Normalpreis 13.200 JPY → 12.000 JPY"],"今月限定キャンペーン：男性スタッフオイルマッサージ 120分20500円→18500円":["This Month Only: Oil Massage by a Male Therapist 120 min  20,500 JPY → 18,500 JPY","本月限定活动：男性技师精油按摩 120分钟 20,500 JPY→18,500 JPY","이번 달 한정 캠페인: 남성 스태프 오일 마사지 120분 20,500 JPY→18,500 JPY","Offre du mois uniquement : massage à l’huile par un praticien homme 120 min  20 500 JPY → 18 500 JPY","Campaña solo este mes: masaje con aceite por un terapeuta hombre 120 min  20.500 JPY → 18.500 JPY","Promozione solo questo mese: massaggio con olio da un operatore uomo 120 min  20.500 JPY → 18.500 JPY","Nur diesen Monat: Ölmassage durch einen männlichen Therapeuten 120 Min.  20.500 JPY → 18.500 JPY"],"今月限定キャンペーン：女性スタッフオイルマッサージ 120分20500円→18500円":["This Month Only: Oil Massage by a Female Therapist 120 min  20,500 JPY → 18,500 JPY","本月限定活动：女性技师精油按摩 120分钟 20,500 JPY→18,500 JPY","이번 달 한정 캠페인: 여성 스태프 오일 마사지 120분 20,500 JPY→18,500 JPY","Offre du mois uniquement : massage à l’huile par une praticienne femme 120 min  20 500 JPY → 18 500 JPY","Campaña solo este mes: masaje con aceite por una terapeuta mujer 120 min  20.500 JPY → 18.500 JPY","Promozione solo questo mese: massaggio con olio da un’operatrice donna 120 min  20.500 JPY → 18.500 JPY","Nur diesen Monat: Ölmassage durch eine weibliche Therapeutin 120 Min.  20.500 JPY → 18.500 JPY"],"【★女性スタッフ】足裏マッサージ30分＋オイルマッサージ90分　120分":["[★Female Therapist] Foot Sole Massage 30 min + Oil Massage 90 min  120 min","【★女性技师】足底按摩30分钟＋精油按摩90分钟 共120分钟","【★여성 스태프】발바닥 마사지 30분＋오일 마사지 90분 총 120분","[★Praticienne femme] Massage de la plante des pieds 30 min + massage à l’huile 90 min  120 min","[★Terapeuta mujer] Masaje de la planta de los pies 30 min + masaje con aceite 90 min  120 min","[★Operatrice donna] Massaggio plantare 30 min + massaggio con olio 90 min  120 min","[★Weibliche Therapeutin] Fußsohlenmassage 30 Min. + Ölmassage 90 Min.  120 Min."],"【★男性スタッフ】足裏マッサージ30分＋オイルマッサージ90分　120分":["[★Male Therapist] Foot Sole Massage 30 min + Oil Massage 90 min  120 min","【★男性技师】足底按摩30分钟＋精油按摩90分钟 共120分钟","【★남성 스태프】발바닥 마사지 30분＋오일 마사지 90분 총 120분","[★Praticien homme] Massage de la plante des pieds 30 min + massage à l’huile 90 min  120 min","[★Terapeuta hombre] Masaje de la planta de los pies 30 min + masaje con aceite 90 min  120 min","[★Operatore uomo] Massaggio plantare 30 min + massaggio con olio 90 min  120 min","[★Männlicher Therapeut] Fußsohlenmassage 30 Min. + Ölmassage 90 Min.  120 Min."],"【男性スタッフ】オイルリンパマッサージ 60分":["[Male Therapist] Oil Lymphatic Massage 60 min","【男性技师】精油淋巴按摩 60分钟","【남성 스태프】오일 림프 마사지 60분","[Praticien homme] Massage lymphatique à l’huile 60 min","[Terapeuta hombre] Masaje linfático con aceite 60 min","[Operatore uomo] Massaggio linfatico con olio 60 min","[Männlicher Therapeut] Öl-Lymphmassage 60 Min."],"【女性スタッフ】オイルリンパマッサージ 60分":["[Female Therapist] Oil Lymphatic Massage 60 min","【女性技师】精油淋巴按摩 60分钟","【여성 스태프】오일 림프 마사지 60분","[Praticienne femme] Massage lymphatique à l’huile 60 min","[Terapeuta mujer] Masaje linfático con aceite 60 min","[Operatrice donna] Massaggio linfatico con olio 60 min","[Weibliche Therapeutin] Öl-Lymphmassage 60 Min."],"【男性スタッフ】オイルリンパマッサージ 90分":["[Male Therapist] Oil Lymphatic Massage 90 min","【男性技师】精油淋巴按摩 90分钟","【남성 스태프】오일 림프 마사지 90분","[Praticien homme] Massage lymphatique à l’huile 90 min","[Terapeuta hombre] Masaje linfático con aceite 90 min","[Operatore uomo] Massaggio linfatico con olio 90 min","[Männlicher Therapeut] Öl-Lymphmassage 90 Min."],"【女性スタッフ】オイルリンパマッサージ 90分":["[Female Therapist] Oil Lymphatic Massage 90 min","【女性技师】精油淋巴按摩 90分钟","【여성 스태프】오일 림프 마사지 90분","[Praticienne femme] Massage lymphatique à l’huile 90 min","[Terapeuta mujer] Masaje linfático con aceite 90 min","[Operatrice donna] Massaggio linfatico con olio 90 min","[Weibliche Therapeutin] Öl-Lymphmassage 90 Min."],"【人気No.1★男性スタッフ】極上の癒し☆オイルリンパマッサージ120分":["[No.1 Most Popular ★ Male Therapist] Ultimate Relaxation ☆ Oil Lymphatic Massage 120 min","【人气No.1★男性技师】极致放松☆精油淋巴按摩120分钟","【인기 No.1★남성 스태프】최고의 힐링☆오일 림프 마사지 120분","[N°1 en popularité ★ Praticien homme] Détente absolue ☆ Massage lymphatique à l’huile 120 min","[N.º 1 en popularidad ★ Terapeuta hombre] Relajación suprema ☆ Masaje linfático con aceite 120 min","[N. 1 per popolarità ★ Operatore uomo] Relax assoluto ☆ Massaggio linfatico con olio 120 min","[Beliebtestes Angebot Nr. 1 ★ Männlicher Therapeut] Höchste Entspannung ☆ Öl-Lymphmassage 120 Min."],"【人気No.1★女性スタッフ】極上の癒し☆オイルリンパマッサージ120分":["[No.1 Most Popular ★ Female Therapist] Ultimate Relaxation ☆ Oil Lymphatic Massage 120 min","【人气No.1★女性技师】极致放松☆精油淋巴按摩120分钟","【인기 No.1★여성 스태프】최고의 힐링☆오일 림프 마사지 120분","[N°1 en popularité ★ Praticienne femme] Détente absolue ☆ Massage lymphatique à l’huile 120 min","[N.º 1 en popularidad ★ Terapeuta mujer] Relajación suprema ☆ Masaje linfático con aceite 120 min","[N. 1 per popolarità ★ Operatrice donna] Relax assoluto ☆ Massaggio linfatico con olio 120 min","[Beliebtestes Angebot Nr. 1 ★ Weibliche Therapeutin] Höchste Entspannung ☆ Öl-Lymphmassage 120 Min."],"オススメ【男性スタッフ】腸もみオイルリンパマッサージ 120分":["Recommended [Male Therapist] Oil Lymphatic Massage with Abdominal (Gut) Massage 120 min","推荐【男性技师】含腹部（肠道）按摩的精油淋巴按摩 120分钟","추천【남성 스태프】장 마사지(복부)를 포함한 오일 림프 마사지 120분","Recommandé [Praticien homme] Massage lymphatique à l’huile avec massage du ventre (intestins) 120 min","Recomendado [Terapeuta hombre] Masaje linfático con aceite con masaje abdominal (intestinal) 120 min","Consigliato [Operatore uomo] Massaggio linfatico con olio con massaggio addominale (intestinale) 120 min","Empfohlen [Männlicher Therapeut] Öl-Lymphmassage mit Bauchmassage (Darm) 120 Min."],"オススメ【女性スタッフ】腸もみオイルリンパマッサージ 120分":["Recommended [Female Therapist] Oil Lymphatic Massage with Abdominal (Gut) Massage 120 min","推荐【女性技师】含腹部（肠道）按摩的精油淋巴按摩 120分钟","추천【여성 스태프】장 마사지(복부)를 포함한 오일 림프 마사지 120분","Recommandé [Praticienne femme] Massage lymphatique à l’huile avec massage du ventre (intestins) 120 min","Recomendado [Terapeuta mujer] Masaje linfático con aceite con masaje abdominal (intestinal) 120 min","Consigliato [Operatrice donna] Massaggio linfatico con olio con massaggio addominale (intestinale) 120 min","Empfohlen [Weibliche Therapeutin] Öl-Lymphmassage mit Bauchmassage (Darm) 120 Min."],"ハイパーナイフ6【ボディ＆フェイス】オイルマッサージと組み合わせが最適":["HYPER KNIFE 6 [Body & Face] Best when combined with an oil massage","HYPER KNIFE 6【身体＆面部】与精油按摩搭配效果最佳","HYPER KNIFE 6【바디＆페이스】오일 마사지와 함께 받으시는 것이 가장 좋습니다","HYPER KNIFE 6 [Corps & visage] Idéal en association avec un massage à l’huile","HYPER KNIFE 6 [Cuerpo y rostro] Ideal combinado con un masaje con aceite","HYPER KNIFE 6 [Corpo e viso] Ideale in abbinamento a un massaggio con olio","HYPER KNIFE 6 [Körper & Gesicht] Ideal in Kombination mit einer Ölmassage"],"出張マッサージ（120分）25,500円 施術内容はご要望に応じて自由にカスタマイズできます。":["Visiting Massage — our therapist comes to you (120 min) 25,500 JPY. The treatment can be freely customized to your requests.","上门按摩（120分钟）25,500 JPY 施术内容可根据您的要求自由定制。","출장 마사지(120분) 25,500 JPY 시술 내용은 요청에 따라 자유롭게 맞춤 조정할 수 있습니다.","Massage à domicile — le praticien se déplace chez vous (120 min) 25 500 JPY. Le contenu du soin peut être librement adapté à vos demandes.","Masaje a domicilio — el terapeuta se desplaza hasta usted (120 min) 25.500 JPY. El contenido del tratamiento se puede personalizar libremente según sus peticiones.","Massaggio a domicilio — l’operatore viene da te (120 min) 25.500 JPY. Il trattamento può essere personalizzato liberamente in base alle tue richieste.","Massage mit Hausbesuch — der Therapeut kommt zu Ihnen (120 Min.) 25.500 JPY. Der Inhalt der Behandlung kann frei nach Ihren Wünschen gestaltet werden."],"フェイシャル 60分 自然で明るい“本来の笑顔”を引き出し":["Facial 60 min  Brings out your natural, bright “true smile”","面部护理 60分钟 唤出自然明亮的“本来的笑容”","페이셜 60분 자연스럽고 밝은 ‘본래의 미소’를 이끌어 냅니다","Soin du visage 60 min  Fait ressortir votre « vrai sourire », naturel et lumineux","Tratamiento facial 60 min  Hace aflorar su «sonrisa auténtica», natural y luminosa","Trattamento viso 60 min  Fa emergere il tuo «vero sorriso», naturale e luminoso","Gesichtsbehandlung 60 Min.  Bringt Ihr natürliches, strahlendes „wahres Lächeln“ zum Vorschein"],"タイ古式マッサージ":["Traditional Thai Massage","泰式古法按摩","타이 전통 마사지","Massage thaïlandais traditionnel","Masaje tailandés tradicional","Massaggio thailandese tradizionale","Traditionelle Thai-Massage"],"【当店人気メニュー】首肩コリ、頭痛な方にオススメ ヘッドスパ 60分":["[Popular at Our Salon] Recommended for stiff neck and shoulders or headaches  Head Spa 60 min","【本店人气项目】推荐给颈肩僵硬、头痛的您 头部SPA 60分钟","【당 살롱 인기 메뉴】목·어깨 결림이나 두통이 있는 분께 추천 헤드 스파 60분","[Soin populaire du salon] Recommandé en cas de raideurs de la nuque et des épaules ou de maux de tête  Spa crânien 60 min","[Popular en nuestro salón] Recomendado si tiene rigidez de cuello y hombros o dolor de cabeza  Head spa 60 min","[Trattamento popolare del salone] Consigliato per rigidità di collo e spalle o mal di testa  Head spa 60 min","[Beliebt in unserem Salon] Empfohlen bei Nacken- und Schulterverspannungen oder Kopfschmerzen  Head-Spa 60 Min."],"全身整体 60分":["Full-Body Seitai (Japanese bodywork) 60 min","全身整体（日式身体调理）60分钟","전신 정체(일본식 바디워크) 60분","Seitai du corps entier (soin corporel japonais) 60 min","Seitai de cuerpo completo (terapia corporal japonesa) 60 min","Seitai total body (trattamento corporeo giapponese) 60 min","Ganzkörper-Seitai (japanische Körperbehandlung) 60 Min."],"矯正整体(骨盤、姿勢、O脚) 60分":["Corrective Seitai (Pelvis, Posture, Bow Legs) 60 min","矫正整体（骨盆、姿势、O型腿）60分钟","교정 정체(골반·자세·O자 다리) 60분","Seitai correctif (bassin, posture, jambes arquées) 60 min","Seitai correctivo (pelvis, postura, piernas arqueadas) 60 min","Seitai correttivo (bacino, postura, gambe arcuate) 60 min","Korrigierendes Seitai (Becken, Haltung, O-Beine) 60 Min."],"小顔矯正 60分":["Small-Face Contouring 60 min","小脸矫正 60分钟","소얼굴 교정 60분","Correction « petit visage » 60 min","Corrección «rostro pequeño» 60 min","Correzione «viso piccolo» 60 min","Gesichtskonturierung („Small Face“) 60 Min."],"フットマッサージ(足湯＋足裏～ふくらぎ) 60分":["Foot Massage (Footbath + Soles to Calves) 60 min","足部按摩（足浴＋足底至小腿）60分钟","풋 마사지(족욕＋발바닥~종아리) 60분","Massage des pieds (bain de pieds + de la plante des pieds aux mollets) 60 min","Masaje de pies (baño de pies + de la planta a las pantorrillas) 60 min","Massaggio ai piedi (pediluvio + dalla pianta ai polpacci) 60 min","Fußmassage (Fußbad + Fußsohlen bis Waden) 60 Min."],"ハイパーナイフ6【ボディ】腹、背、腕、脚など 選べる1部位10分＋マッサージ10分":["HYPER KNIFE 6 [Body] 1 area of your choice (abdomen, back, arms, legs, etc.) 10 min + massage 10 min","HYPER KNIFE 6【身体】腹部、背部、手臂、腿部等任选1个部位10分钟＋按摩10分钟","HYPER KNIFE 6【바디】복부·등·팔·다리 등 원하는 1부위 10분＋마사지 10분","HYPER KNIFE 6 [Corps] 1 zone au choix (ventre, dos, bras, jambes, etc.) 10 min + massage 10 min","HYPER KNIFE 6 [Cuerpo] 1 zona a elegir (abdomen, espalda, brazos, piernas, etc.) 10 min + masaje 10 min","HYPER KNIFE 6 [Corpo] 1 zona a scelta (addome, schiena, braccia, gambe, ecc.) 10 min + massaggio 10 min","HYPER KNIFE 6 [Körper] 1 Zone nach Wahl (Bauch, Rücken, Arme, Beine usw.) 10 Min. + Massage 10 Min."],"シャワールーム 30分":["Shower Room 30 min","淋浴间 30分钟","샤워룸 30분","Salle de douche 30 min","Sala de ducha 30 min","Sala doccia 30 min","Duschraum 30 Min."],"レンタルルーム 60分　2500円":["Rental Room 60 min  2,500 JPY","租赁房间 60分钟 2,500 JPY","대여 룸 60분 2,500 JPY","Location de salle 60 min  2 500 JPY","Alquiler de sala 60 min  2.500 JPY","Noleggio sala 60 min  2.500 JPY","Raummiete 60 Min.  2.500 JPY"]};
  const LABEL = {"ja":"日本語","en":"English","zh":"简体中文","ko":"한국어","fr":"Français","es":"Español","it":"Italiano","de":"Deutsch"};

  const missing = new Set();
  const fill = (s, vars) => (vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s);
  function t(ja, vars) {
    if (cur === "ja") return fill(ja, vars);
    const row = D[ja];
    if (!row) { missing.add(ja); return fill(ja, vars); }
    return fill(row[IDX[cur]] || row[0], vars);
  }
  // 予約サイト本体の辞書と同じ文言（ボタン・見出し等）。画面部品が出す文言を、どの言語でも見分けるのに使う
  const bt = (key, l) => { const v = BT[key]; return v ? v[LANGS.indexOf(l || cur)] : ""; };
  const btAll = (key) => (BT[key] || []).filter(Boolean);
  const nav = (key, l) => { const v = NAV[key]; return v ? v[LANGS.indexOf(l || cur)] : ""; };
  // スタッフの紹介文（l を省くと今の言語）。改行コードや前後の空白の違いは同じ文章として扱う。訳が無い文章は日本語のまま
  function staffMsg(ja, l) {
    const s = String(ja || "");
    const lang = norm(l) || cur;
    if (lang === "ja" || !s) return s;
    const row = STAFF_MSG[s] || STAFF_MSG[s.replace(/\r\n?/g, "\n").trim()];
    return row ? row[IDX[lang]] : s;
  }
  // メニュー名（日本語の名前 → 各言語）。管理画面で名前を変えたメニューなど、辞書に無い名前は日本語のまま
  function menu(jaName) {
    const s = String(jaName || "");
    if (cur === "ja" || !s) return s;
    const row = MENU[s] || MENU[s.replace(/\s+/g, " ").trim()];
    return row ? row[IDX[cur]] : s;
  }
  // 回数券のプラン名（「回数券 5回券」「…（復活分）」「Aの券・Bの券（復活分）」）
  const PLAN_N = {
    en: (n) => n + "-Session Ticket", zh: (n) => n + "次卡", ko: (n) => n + "회권", fr: (n) => "Carnet de " + n + " séances",
    es: (n) => "Bono de " + n + " sesiones", it: (n) => "Carnet da " + n + " sedute", de: (n) => "Mehrfachkarte für " + n + " Behandlungen",
  };
  function plan(name) {
    const s = String(name || "");
    if (cur === "ja" || !s) return s;
    let base = s, suffix = "";
    if (base.endsWith("（復活分）")) { base = base.slice(0, -5); suffix = t("（復活分）"); }
    const one = (x) => { const m = /^回数券\s*(\d+)回券$/.exec(x.trim()); return m ? PLAN_N[cur](Number(m[1])) : (D[x] ? t(x) : x); };
    return base.split("・").map(one).join(cur === "zh" || cur === "ko" ? "・" : " / ") + suffix;
  }
  // 有効期間（「1年間」「6か月間」「1年6か月間」）
  function validFor(label) {
    const s = String(label || "1年間");
    if (cur === "ja") return s;
    const m = /^(?:(\d+)年)?(?:(\d+)か月)?間$/.exec(s);
    if (!m) return s;
    const y = Number(m[1] || 0), mo = Number(m[2] || 0);
    const U = {
      en: [(n) => n + (n === 1 ? " year" : " years"), (n) => n + (n === 1 ? " month" : " months"), " "],
      zh: [(n) => n + "年", (n) => n + "个月", ""],
      ko: [(n) => n + "년", (n) => n + "개월", " "],
      fr: [(n) => n + (n === 1 ? " an" : " ans"), (n) => n + " mois", " et "],
      es: [(n) => n + (n === 1 ? " año" : " años"), (n) => n + (n === 1 ? " mes" : " meses"), " y "],
      it: [(n) => n + (n === 1 ? " anno" : " anni"), (n) => n + (n === 1 ? " mese" : " mesi"), " e "],
      de: [(n) => n + (n === 1 ? " Jahr" : " Jahre"), (n) => n + (n === 1 ? " Monat" : " Monate"), " und "],
    }[cur];
    return [y ? U[0](y) : "", mo ? U[1](mo) : ""].filter(Boolean).join(U[2]);
  }
  // 日付（「2027年10月7日」・"2027-10-07"・ミリ秒）→ 各言語の書き方
  function date(v) {
    let y, m, d;
    if (typeof v === "number") { const x = new Date(v + 9 * 3600e3); y = x.getUTCFullYear(); m = x.getUTCMonth() + 1; d = x.getUTCDate(); }
    else {
      const s = String(v || "");
      const a = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(s) || /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
      if (!a) return s;
      y = +a[1]; m = +a[2]; d = +a[3];
    }
    if (cur === "ja") return y + "年" + m + "月" + d + "日";
    try { return new Intl.DateTimeFormat(LOCALE[cur], { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(Date.UTC(y, m - 1, d)); }
    catch { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
  }
  // 金額：日本語「30,000円」／ほかの言語「30,000 JPY」（数字の区切りは各言語）
  const price = (n) => (cur === "ja" ? Number(n).toLocaleString("ja-JP") + "円" : Number(n).toLocaleString(LOCALE[cur]) + " JPY");

  const subs = new Set();
  const check = () => {
    const n = forced || stored() || "ja";
    if (n === cur) return;
    cur = n;
    try { document.documentElement.lang = cur === "zh" ? "zh-CN" : cur; } catch {}
    subs.forEach((f) => { try { f(cur); } catch {} });
  };
  window.addEventListener("cn-salon-language-change", check);
  window.addEventListener("storage", check);
  setInterval(check, 800);

  window.CNI18N = {
    LANGS, LOCALE,
    lang: () => cur,
    // 言語を選んだことがあるか（無ければ、予約時の言語などを使ってよい）
    chosen: () => !!stored(),
    // このページだけ別の言語で表示する（保存しない）。空文字で解除
    use(l) { forced = norm(l); check(); },
    // 言語を選ぶ（予約サイトの「Language」と同じ保存先。ほかのページにも反映される）
    set(l) { const n = norm(l); if (!n) return; try { localStorage.setItem("cn-salon-language", n); } catch {} forced = ""; window.dispatchEvent(new Event("cn-salon-language-change")); check(); },
    onChange: (fn) => subs.add(fn),
    t, has: (ja) => cur === "ja" || !!D[ja], missing,
    bt, btAll, nav, menu, plan, validFor, date, price, staffMsg,
    label: (l) => LABEL[l] || l,
  };
})();
