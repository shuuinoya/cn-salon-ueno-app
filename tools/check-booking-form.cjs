const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/booking-tweaks.js'), 'utf8');
const slice = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, '検証対象の関数が見つかる');
  return source.slice(a, b);
};

test('必須メッセージ欄を非表示にしたら入力義務を解除し、再表示したら戻す', () => {
  const label = { style: {}, firstChild: { nodeType: 3, textContent: '' }, querySelector: () => null, appendChild() {} };
  const field = { closest: () => label, placeholder: '', maxLength: 2000, required: false };
  const settings = { visible: true, required: true };
  const ctx = vm.createContext({ settings, curLang: () => 'ja', I18N: null, T: s => s,
    document: { querySelector: () => field, createElement: () => ({ style: {} }) } });
  vm.runInContext(slice('  function apply()', '  // ---- マイページ連携') + '\napply();', ctx);
  assert.equal(field.required, true);
  settings.visible = false;
  vm.runInContext('apply()', ctx);
  assert.equal(label.style.display, 'none');
  assert.equal(field.required, false);
  settings.visible = true;
  vm.runInContext('apply()', ctx);
  assert.equal(label.style.display, '');
  assert.equal(field.required, true);
});

function bookingContext() {
  const storage = new Map();
  const ctx = vm.createContext({
    window: { __fmTicketSel: null, alert() {} },
    sessionStorage: { setItem: (k, v) => storage.set(k, String(v)), getItem: k => storage.get(k) || null, removeItem: k => storage.delete(k) },
    localStorage: { setItem() {} }, document: { getElementById: () => null },
    rescheduleId: () => '', clearReschedule() {}, store: () => [], saveStore() {}, T: s => s,
    URLSearchParams, I18N: null, location: { pathname: '/book/complete', search: '?id=test-current' },
  });
  ctx.response = { id: 'test-current', token: 'test-token' };
  ctx.resOk = true;
  ctx.origFetch = async () => ({ ok: ctx.resOk, clone: () => ({ json: async () => ctx.response }) });
  vm.runInContext(slice('  window.fetch = async', '  // ---- 回数券（会員向け）'), ctx);
  vm.runInContext(slice('  function decorateTicketComplete()', '  // ---- 予約の日時変更'), ctx);
  vm.runInContext(slice('  function decorateRescheduleComplete()', '  // ---- 予約フォーム（お客様情報）'), ctx);
  return { ctx, storage, book: () => ctx.window.fetch('/api/bookings', { method: 'POST', body: '{"name":"テスト"}' }) };
}

function receipt(ctx) {
  const dl = { dataset: {}, children: [], notices: [], appendChild(node) { this.children.push(node); }, before(node) { this.notices.push(node); } };
  ctx.document = { querySelector: () => dl, createElement: tag => ({ tag, style: {} }) };
  return dl;
}

test('次の通常予約が成功したら前回の回数券・日時変更案内を消す', async () => {
  const { ctx, storage, book } = bookingContext();
  ctx.window.__fmTicketSel = { id: 'test-ticket', token: 'test-token', name: 'テスト回数券' };
  ctx.response = { id: 'test-first', token: 'test-token', rescheduledFrom: 'test-original', ticketLeft: 2 };
  await book();
  assert.ok(storage.has('fm-ticket-used'));
  assert.ok(storage.has('fm-rescheduled'));
  ctx.window.__fmTicketSel = null;
  ctx.response = { id: 'test-next', token: 'test-token' };
  await book();
  assert.equal(storage.has('fm-ticket-used'), false);
  assert.equal(storage.has('fm-rescheduled'), false);
});

test('回数券使用・日時変更の案内は成功した予約IDと結び付けて保存する', async () => {
  const { ctx, storage, book } = bookingContext();
  ctx.window.__fmTicketSel = { id: 'test-ticket', token: 'test-token', name: 'テスト回数券' };
  ctx.response = { id: 'test-current', token: 'test-token', rescheduledFrom: 'test-original', ticketLeft: 0 };
  await book();
  assert.equal(JSON.parse(storage.get('fm-ticket-used')).id, 'test-current');
  assert.equal(JSON.parse(storage.get('fm-ticket-used')).left, 0);
  assert.equal(storage.get('fm-rescheduled'), 'test-current');
});

test('別の予約IDの完了画面には保存済みの案内を表示しない', () => {
  const { ctx, storage } = bookingContext();
  storage.set('fm-ticket-used', JSON.stringify({ id: 'test-other', name: 'テスト回数券', left: 2 }));
  storage.set('fm-rescheduled', 'test-other');
  const dl = receipt(ctx);
  ctx.decorateTicketComplete();
  ctx.decorateRescheduleComplete();
  assert.equal(dl.children.length, 0);
  assert.equal(dl.notices.length, 0);
});

test('一致する予約の案内は表示し、定期処理でも重複させない', () => {
  const { ctx, storage } = bookingContext();
  storage.set('fm-ticket-used', JSON.stringify({ id: 'test-current', name: 'テスト回数券', left: 2 }));
  storage.set('fm-rescheduled', 'test-current');
  const dl = receipt(ctx);
  for (let i = 0; i < 2; i++) { ctx.decorateTicketComplete(); ctx.decorateRescheduleComplete(); }
  assert.equal(dl.children.length, 2);
  assert.equal(dl.notices.length, 1);
});

test('旧形式で保存された案内や予約IDがない完了画面は誤表示しない', () => {
  const { ctx, storage } = bookingContext();
  storage.set('fm-ticket-used', JSON.stringify({ name: 'テスト回数券', left: 2 }));
  storage.set('fm-rescheduled', '1');
  let dl = receipt(ctx);
  ctx.decorateTicketComplete(); ctx.decorateRescheduleComplete();
  assert.equal(dl.children.length + dl.notices.length, 0);
  ctx.location.search = '';
  dl = receipt(ctx);
  ctx.decorateTicketComplete(); ctx.decorateRescheduleComplete();
  assert.equal(dl.children.length + dl.notices.length, 0);
});

test('予約失敗時には成功済みの案内を変更しない', async () => {
  const { ctx, storage, book } = bookingContext();
  storage.set('fm-ticket-used', 'test-existing');
  storage.set('fm-rescheduled', 'test-existing');
  ctx.resOk = false;
  ctx.response = { error: 'unavailable' };
  await book();
  assert.equal(storage.get('fm-ticket-used'), 'test-existing');
  assert.equal(storage.get('fm-rescheduled'), 'test-existing');
});

// 保存済みの本人確認トークンを、同一サイト・一致する予約の照会だけに使う。
test('予約照会の本人確認を回復し、他サイト・別ID・明示トークンには流用しない', async () => {
  const { ctx } = bookingContext();
  ctx.URL = URL; ctx.Headers = Headers;
  ctx.location.origin = 'https://salon.example.test';
  ctx.store = () => [{ id: 'test-current', token: 'owned-token' }];
  let sent;
  ctx.origFetch = async (url, init) => { sent = { url, init }; return { ok: true }; };
  await ctx.window.fetch('/api/bookings?id=test-current', { headers: { Authorization: 'Bearer ' } });
  assert.equal(sent.init.headers.get('Authorization'), 'Bearer owned-token');
  for (const url of ['https://elsewhere.example.test/api/bookings?id=test-current', '/api/bookings?id=test-other', '/api/bookings/cancel?id=test-current']) {
    await ctx.window.fetch(url, {});
    assert.equal(sent.init.headers, undefined);
  }
  await ctx.window.fetch('/api/bookings?id=test-current', { headers: { Authorization: 'Bearer explicit-token' } });
  assert.equal(sent.init.headers.Authorization, 'Bearer explicit-token');
  await ctx.window.fetch('/api/bookings?id=test-current', { method: 'POST', body: '{}' });
  assert.equal(sent.init.headers, undefined);
});
