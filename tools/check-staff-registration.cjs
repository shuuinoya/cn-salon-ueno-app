'use strict';
// 公開スタッフ情報のコピーで、実際の保存処理を実行する。顧客データ・送信設定は不要。
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
process.env.DEMO_EPHEMERAL = '1';
process.env.HP_MAIL = '0';
for (const k of Object.keys(process.env)) if (/^(MAIL_|GH_)/.test(k)) delete process.env[k];
const root = path.resolve(__dirname, '..');
assert.equal(fs.existsSync(path.join(root, 'mail-config.json')), false, 'メール設定のない検証用チェックアウトで実行してください');
const m = new Module(path.join(root, 'demo-api.js'));
m.filename = path.join(root, 'demo-api.js'); m.paths = Module._nodeModulePaths(root);
m._compile(fs.readFileSync(m.filename, 'utf8') + '\nmodule.exports.checks={state,postSchedule,publicStaffList,nominatableStaff,ownsBooking};', m.filename);
(async () => {
  await m.exports.ready;
  const { state, postSchedule, publicStaffList, nominatableStaff, ownsBooking } = m.exports.checks;
  state.mailRelay = {url:'',secret:''}; state.mails = [];
  const input = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).staff : [];
  state.staff = input.map((s,i) => ({ id:s.id,name:s.name,gender:s.gender,active:1,locked:0,sort_order:i+1,
    courses:JSON.stringify(s.courses),profile:JSON.stringify({personalNomination:true,nominationFee:s.nominationFee,message:s.message}) }));
  const before = JSON.stringify(state.staff);
  const body = { action:'staff',date:'2026-10-21',id:'test-new-staff',name:'テスト 表示名のみ',active:1,
    gender:'none',courses:['364321-4822671'],profile:{personalNomination:true,nominationFee:500,message:'テスト紹介文'},sortOrder:30 };
  assert.equal(postSchedule(body).ok,true);
  const added = state.staff.find(s=>s.name===body.name);
  assert.ok(added); assert.equal(added.gender,'none');
  assert.equal(JSON.stringify(state.staff.filter(s=>s!==added)),before,'既存スタッフを維持');
  const pub = publicStaffList().find(s=>s.id===added.id);
  assert.equal(pub.name,body.name); assert.equal(pub.nominationFee,500); assert.equal(pub.message,'テスト紹介文');
  assert.ok(nominatableStaff('364321-4822671','none').some(s=>s.id===added.id));
  assert.ok(!nominatableStaff('364321-4822671','male').some(s=>s.id===added.id));
  assert.ok(!nominatableStaff('364321-4822671','female').some(s=>s.id===added.id));
  postSchedule({...body,id:added.id,gender:'male'});
  postSchedule({...body,id:added.id,gender:undefined,profile:{...body.profile,nominationFee:2000}});
  assert.equal(state.staff.find(s=>s.id===added.id).gender,'male','省略された既存性別は維持');
  assert.equal(publicStaffList().find(s=>s.id===added.id).nominationFee,2000);
  assert.throws(()=>postSchedule({...body,name:'   '}));
  assert.throws(()=>postSchedule({...body,gender:'invalid'}));
  assert.equal(ownsBooking({customer_token:'test-token'},'test-token',null),true);
  assert.equal(ownsBooking({customer_token:'test-token'},'',null),false);
  assert.equal(ownsBooking({customer_token:'test-token'},'wrong',null),false);
  console.log('PASS: display-name-only creation, public listing, nomination fees, gender constraints, existing records, receipt authentication; public production copy:',input.length);
})().then(()=>process.exit(0),e=>{console.error(e);process.exit(1)});
