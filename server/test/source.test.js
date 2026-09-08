'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('payment and close-day operations stay server-side',()=>{
  const cafe=read('server/src/cafe.js');
  assert.match(cafe,/router\.post\('\/payments'/);
  assert.match(cafe,/await transaction\(async connection/);
  assert.match(cafe,/await assertDayOpen\(connection\)/);
  assert.match(cafe,/router\.post\('\/accounting\/close-day'/);
});

test('shared browser layer uses HTTP APIs instead of Firebase',()=>{
  const common=read('js/common.js');
  assert.doesNotMatch(common,/firebase\.database\(|firebase\.auth\(/);
  assert.match(common,/\/api\/orders/);
  assert.match(common,/\/api\/tables/);
});

test('customer QR ordering is mounted',()=>{
  const server=read('server/src/server.js');
  const customer=read('server/src/customer-api.js');
  assert.match(server,/app\.use\('\/api\/customer',customerRouter\)/);
  assert.match(customer,/router\.post\('\/orders'/);
});

test('simple login uses PIN only',()=>{
  const login=read('login.html');
  const loginJs=read('js/login.js');
  const auth=read('server/src/auth.js');
  assert.match(login,/id="pin"/);
  assert.doesNotMatch(login,/user-number|رقم المستخدم|كلمة المرور الحالية/);
  assert.match(loginJs,/body:\{pin:pin\.value\}/);
  assert.match(auth,/\^\[0-9\]\{4,8\}\$/);
  assert.match(auth,/findUserByPin/);
  assert.match(auth,/bcrypt\.compare/);
});

test('staff management is name role and PIN',()=>{
  const users=read('js/users.js');
  const adminApi=read('server/src/admin-api.js');
  assert.match(users,/name="pin"/);
  assert.doesNotMatch(users,/name="number"/);
  assert.match(adminApi,/pinInUse/);
  assert.match(adminApi,/nextUserNumber/);
  assert.match(adminApi,/4 إلى 8 أرقام/);
});

test('admin screen is intentionally simple',()=>{
  const html=read('admin.html');
  const js=read('js/admin.js');
  assert.match(html,/المنيو والموظفون فقط/);
  assert.doesNotMatch(html,/system-monitor-grid|تنبيهات التشغيل/);
  assert.match(js,/\/api\/admin\/menu/);
});

test('protected pages still use sessions and role checks',()=>{
  const server=read('server/src/server.js');
  const auth=read('server/src/auth.js');
  assert.match(server,/pageRoles/);
  assert.match(server,/getSession\(req\)/);
  assert.match(auth,/HttpOnly; SameSite=Strict/);
  assert.match(auth,/x-csrf-token/i);
});

test('local operational pages do not load Firebase runtime scripts',()=>{
  for(const file of ['admin.html','accounting.html','index.html','kitchen.html','pos.html','waiter.html']){
    assert.doesNotMatch(read(file),/gstatic\.com\/firebase|firebase-config\.js/,file+' still loads Firebase');
  }
});

test('schema keeps financial history',()=>{
  const schema=read('server/sql/schema.sql');
  assert.match(schema,/UNIQUE KEY uq_payment_order \(order_id\)/);
  assert.match(schema,/FOREIGN KEY \(cashier_user_id\) REFERENCES users\(id\)/);
  assert.match(schema,/ENGINE=InnoDB/);
});
