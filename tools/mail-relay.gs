// CN Ueno 予約システムのメール送信中継（Google Apps Script）
// Render の無料プランはメール送信用の通信（SMTP）を外に出せないため、このスクリプトを
// 送信元のGoogleアカウント（kudaka.1228@gmail.com）で「ウェブアプリ」として公開し、
// 予約システムから https で頼んで、そのGmailから送ってもらう。
//
// 使い方：https://script.google.com →「新しいプロジェクト」→ このコードを貼り付け →
//   SECRET を Render の MAIL_RELAY_SECRET と同じ値にする →「デプロイ」→「新しいデプロイ」→
//   種類「ウェブアプリ」・次のユーザーとして実行「自分」・アクセスできるユーザー「全員」→ 承認 →
//   表示された「ウェブアプリのURL」を Render の MAIL_RELAY_URL に入れる
// ※Gmail（無料アカウント）から送れるのは1日100通まで
const SECRET = "ここに MAIL_RELAY_SECRET と同じ値";

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (!p || p.secret !== SECRET) return out_({ ok: false, error: "forbidden" });
    MailApp.sendEmail({ to: p.to, subject: p.subject, body: p.text || "", htmlBody: p.html || undefined, name: p.fromName || "" });
    return out_({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}
// ブラウザで開いたとき（動作確認用）
function doGet() { return out_({ ok: true, service: "cn-salon mail relay", remaining: MailApp.getRemainingDailyQuota() }); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
