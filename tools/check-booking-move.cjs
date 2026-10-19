"use strict";

// Tests the real saved admin chunks. All records and network replies are synthetic.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, "..");
const chunks = ["AdminSchedule-pm2.js", "AdminSchedule-7iLokhEf.js"];
const baseMove = { action: "moveBooking", id: "bk-test", staffId: "test-staff-b", start: 900, end: 960 };

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function extract(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, "Source function start missing: " + start);
  const to = source.indexOf(end, from);
  assert.notEqual(to, -1, "Source function end missing: " + end);
  return source.slice(from, to);
}

function setupSave(source, confirmResult, response = { ok: true, body: { ok: true } }) {
  const log = { confirms: [], posts: [], busy: [], errors: [], notices: [], close: [], bulk: [], selected: [], refresh: 0, update: 0 };
  const sandbox = {
    j: false,
    p: "/api/demo/schedule",
    m: "2026-10-19",
    e: true,
    g: {
      staff: [
        { id: "test-staff-a", name: "テスト担当A" },
        { id: "test-staff-b", name: "テスト担当B" },
      ],
      bookings: [{ id: "bk-test", name: "テスト予約", status: "confirmed", people: 1 }],
      days: [{ date: "2026-10-19", version: 17 }],
    },
    Oe: () => 17,
    M: (value) => { sandbox.j = value; log.busy.push(value); },
    O: (value) => log.errors.push(value),
    A: (value) => log.notices.push(value),
    D: (value) => log.close.push(value),
    z: (value) => log.bulk.push(value),
    L: (value) => log.selected.push(value),
    c: () => { log.update += 1; },
    q: async () => { log.refresh += 1; },
    ae: { scheduleConflict: "test-conflict", nominatedLocked: "test-nominated" },
    AbortSignal: { timeout: () => ({ testSignal: true }) },
    fetch: async (url, init) => {
      log.posts.push({ url, method: init.method, body: JSON.parse(init.body) });
      if (response.throw) throw new Error(response.throw);
      return { ok: response.ok, json: async () => response.body };
    },
    window: {
      __pmConfirmBookingMove: (payload, schedule) => {
        log.confirms.push({ payload, schedule });
        return typeof confirmResult === "function" ? confirmResult(payload, schedule) : confirmResult;
      },
    },
  };
  const context = vm.createContext(sandbox);
  const fn = extract(source, "async function J(t,n=!0)", "let Y=g.staff.filter");
  vm.runInContext(fn + ";globalThis.saveMove=J;", context);
  return { context, log, run: (body = { ...baseMove }) => context.saveMove(body) };
}

function setupDrop(source, nominated) {
  const log = { posts: [], errors: [], notices: [], ghost: [], edits: [] };
  const sandbox = {
    K: { current: { edit: { type: "booking", id: "bk-test", staffId: "test-staff-a", start: 840, end: 900 }, moved: true } },
    H: { type: "booking", id: "bk-test", staffId: "test-staff-b", start: 900, end: 960 },
    X: [{ id: "bk-test", nominated_staff_id: nominated ? "test-staff-a" : null }],
    A: (v) => log.notices.push(v),
    O: (v) => log.errors.push(v),
    fe: (v) => { sandbox.H = v; log.ghost.push(v); },
    D: (v) => log.edits.push(v),
    J: (v) => { log.posts.push(v); },
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(extract(source, "function Le(e)", "function Re(e,t)") + ";globalThis.drop=Le;", context);
  const event = { pointerId: 1, currentTarget: { hasPointerCapture: () => true, releasePointerCapture: () => {} } };
  return { context, log, run: () => context.drop(event) };
}

async function checkChunk(name) {
  const source = fs.readFileSync(path.join(appDir, "public", "_next", "static", "chunks", name), "utf8");
  let checked = 0;

  // A pending approval must not issue the mutation or the change notification it causes.
  {
    const pending = deferred();
    const h = setupSave(source, () => pending.promise);
    const result = h.run();
    assert.equal(h.log.confirms.length, 1, "Booking move must ask once before saving");
    assert.equal(h.log.posts.length, 0, "Approval pending: no POST");
    assert.equal(h.log.refresh, 0, "Approval pending: no save refresh");
    assert.equal(h.log.confirms[0].payload.date, "2026-10-19");
    assert.equal(h.log.confirms[0].payload.start, 900);
    assert.equal(h.log.confirms[0].schedule, h.context.g);
    await Promise.resolve();
    assert.equal(h.log.posts.length, 0, "Approval must remain pending across turns");
    pending.resolve(false);
    assert.equal(await result, false, "Cancel returns false");
    assert.equal(h.log.posts.length, 0, "Cancel: no POST");
    assert.equal(h.log.update, 0, "Cancel: no update announcement");
    assert.equal(h.context.j, false, "Cancel: controls remain usable");
    checked += 1;
  }

  {
    const h = setupSave(source, false);
    assert.equal(await h.run(), false);
    assert.equal(h.log.confirms.length, 1);
    assert.equal(h.log.posts.length, 0, "Rejected approval: no POST");
    checked += 1;
  }

  {
    const h = setupSave(source, true);
    assert.equal(await h.run(), true);
    assert.equal(h.log.confirms.length, 1);
    assert.equal(h.log.posts.length, 1, "Approved move: exactly one POST");
    assert.equal(h.log.posts[0].url, "/api/demo/schedule");
    assert.equal(h.log.posts[0].method, "POST");
    assert.deepEqual(h.log.posts[0].body, { date: "2026-10-19", revision: 17, ...baseMove });
    assert.equal(h.log.refresh, 1, "Approved move refreshes once");
    assert.equal(h.log.update, 1);
    assert.equal(h.log.close.at(-1), null);
    assert.equal(h.context.j, false, "Success releases busy controls");
    checked += 1;
  }

  {
    const h = setupSave(source, () => { throw new Error("Block must not ask for booking approval"); });
    const result = h.run({ action: "block", id: "blk-test", staffId: "test-staff-a", start: 840, end: 900, kind: "break" });
    assert.equal(h.log.confirms.length, 0, "Break/work keeps the existing save behavior");
    assert.equal(h.log.posts.length, 1, "Block posts immediately");
    assert.equal(await result, true);
    checked += 1;
  }

  {
    const h = setupSave(source, true, { ok: false, body: { error: "scheduleConflict" } });
    assert.equal(await h.run(), false);
    assert.equal(h.log.posts.length, 1);
    assert.equal(h.log.errors.at(-1), "test-conflict", "Conflict message remains mapped");
    assert.equal(h.log.refresh, 1, "Conflict reloads the current schedule");
    assert.equal(h.log.close.at(-1), null);
    assert.equal(h.log.bulk.at(-1), false);
    assert.equal(h.log.selected.at(-1).length, 0);
    assert.equal(h.context.j, false);
    checked += 1;
  }

  {
    const h = setupSave(source, true, { throw: "test-network-unavailable" });
    assert.equal(await h.run(), false);
    assert.equal(h.log.posts.length, 1);
    assert.ok(h.log.errors.at(-1).includes("保存結果"), "Unknown network error retains the save-result message");
    assert.equal(h.log.refresh, 1);
    assert.equal(h.context.j, false, "Network failure releases controls");
    checked += 1;
  }

  {
    const h = setupSave(source, true, { ok: false, body: { error: "nominatedLocked" } });
    assert.equal(await h.run(), false);
    assert.equal(h.log.errors.at(-1), "test-nominated", "Server nomination rejection remains handled");
    assert.equal(h.context.j, false);
    checked += 1;
  }

  {
    const h = setupDrop(source, true);
    h.run();
    assert.equal(h.log.posts.length, 0, "Named-staff booking cannot be dragged");
    assert.ok(h.log.errors.at(-1).includes("指名"));
    assert.equal(h.context.K.current, null);
    assert.equal(h.context.H, null, "Refused drop removes the ghost");
    checked += 1;
  }

  {
    const h = setupDrop(source, false);
    h.run();
    assert.equal(h.log.posts.length, 1, "Valid drop enters the shared save gate once");
    assert.equal(h.log.posts[0].action, "moveBooking");
    assert.equal(h.log.posts[0].end - h.log.posts[0].start, 60, "Drag preserves duration");
    assert.equal(h.context.H, null);
    checked += 1;
  }

  {
    const h = setupDrop(source, false);
    h.context.H = { ...h.context.K.current.edit };
    h.run();
    assert.equal(h.log.posts.length, 0, "Dropping in the same place must not request save");
    assert.equal(h.context.H, null);
    checked += 1;
  }

  console.log("PASS " + name + ": " + checked + " checks");
  return checked;
}

(async () => {
  let count = 0;
  for (const name of chunks) count += await checkChunk(name);
  console.log("PASS booking move regression: " + count + " checks, synthetic records only");
})().catch((error) => {
  console.error("FAIL booking move regression: " + error.message);
  process.exitCode = 1;
});
