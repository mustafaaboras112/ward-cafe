'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('payment and close-day operations are server-side transactions',()=>{
  const cafe=read('server/src/cafe.js');
  assert.match(cafe,/router\.post\('\/payments'/);
  assert.match(cafe,/await transaction\(async connection/);
  assert.match(cafe,/await assertDayOpen\(connection\)/);
  assert.match(cafe,/payment_status='unpaid'/);
  assert.match(cafe,/router\.post\('\/accounting\/close-day'/);
  assert.match(cafe,/لا يمكن إغلاق اليوم وهناك طلبات غير مدفوعة/);
});

test('shared browser layer uses HTTP APIs and keeps sensitive state server-side',()=>{
  const common=read('js/common.js');
  assert.doesNotMatch(common,/firebase\.database\(|firebase\.auth\(|\.ref\('orders'\)/);
  assert.match(common,/\/api\/orders/);
  assert.match(common,/\/api\/tables/);
  assert.match(common,/\/api\/customer\/orders/);
  assert.match(common,/async function changeCafeState\(\).*خادم MySQL فقط/s);
  const overrides=read('js/mysql-overrides.js');
  assert.match(overrides,/\/api\/payments/);
});

test('customer QR ordering is mounted and isolated by a customer cookie',()=>{
  const server=read('server/src/server.js');
  const customer=read('server/src/customer-api.js');
  const schema=read('server/sql/schema.sql');
  assert.match(server,/app\.use\('\/api\/customer',customerRouter\)/);
  assert.match(customer,/ward_customer/);
  assert.match(customer,/customer_order_access/);
  assert.match(customer,/router\.post\('\/orders'/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS customer_order_access/);
});

test('admin menu uses MySQL API and has a working system monitor',()=>{
  const admin=read('js/admin.js');
  const html=read('admin.html');
  assert.match(admin,/function renderSystemMonitor\(/);
  assert.match(admin,/\/api\/admin\/menu/);
  assert.match(admin,/startAdminConnectionMonitor\(\)/);
  assert.doesNotMatch(admin,/صلاحيات Firebase|adminFirebaseConnected/);
  assert.doesNotMatch(html,/gstatic\.com\/firebase|firebase-config\.js/);
});

test('accounting screen only exposes MySQL-backed core modules',()=>{
  const html=read('accounting.html');
  const core=read('js/accounting-core.js');
  assert.match(html,/js\/accounting-core\.js/);
  assert.doesNotMatch(html,/js\/accounting\.js|gstatic\.com\/firebase/);
  assert.doesNotMatch(html,/data-accounting-nav="(?:purchases|customers|suppliers|inventory)"/);
  assert.match(core,/closeAccountingDay\(\)/);
  assert.match(core,/saveAccountingRecord\('expenses'/);
  assert.match(core,/startAccountingRealtime\(\)/);
});

test('protected pages use server sessions, role checks and short aliases',()=>{
  const server=read('server/src/server.js');
  const auth=read('server/src/auth.js');
  assert.match(server,/pageRoles/);
  assert.match(server,/getSession\(req\)/);
  assert.match(server,/['"]\/admin['"]\s*:\s*['"]\/admin\.html['"]/);
  assert.match(server,/['"]\/pos['"]\s*:\s*['"]\/pos\.html['"]/);
  assert.match(auth,/bcrypt\.compare/);
  assert.match(auth,/HttpOnly; SameSite=Strict/);
  assert.match(auth,/x-csrf-token/i);
});

test('password policy is consistently 8 to 128 characters',()=>{
  const login=read('login.html');
  const users=read('js/users.js');
  const auth=read('server/src/auth.js');
  const adminApi=read('server/src/admin-api.js');
  assert.match(login,/minlength="8"/);
  assert.doesNotMatch(login,/12 إلى 20|12–20/);
  assert.match(users,/minlength=\\?"8|password\.minLength=8/);
  assert.doesNotMatch(users,/12 إلى 20|12–20|\{12,20\}/);
  assert.match(auth,/password\.length<8/);
  assert.match(adminApi,/password\.length<8/);
});

test('local operational pages do not load Firebase runtime scripts',()=>{
  for(const file of ['admin.html','accounting.html','index.html','kitchen.html','pos.html','waiter.html']){
    const html=read(file);
    assert.doesNotMatch(html,/gstatic\.com\/firebase|firebase-config\.js/,file+' still loads Firebase');
  }
});

test('schema keeps financial history and one payment per order',()=>{
  const schema=read('server/sql/schema.sql');
  assert.match(schema,/UNIQUE KEY uq_payment_order \(order_id\)/);
  assert.match(schema,/FOREIGN KEY \(cashier_user_id\) REFERENCES users\(id\)/);
  assert.match(schema,/PRIMARY KEY \(business_date\)/);
  assert.match(schema,/ENGINE=InnoDB/);
});

test('Firebase bootstrap is disabled on the MySQL branch',()=>{
  const config=read('firebase-config.js');
  assert.match(config,/Firebase is intentionally disabled/);
  assert.doesNotMatch(config,/initializeApp|databaseURL|apiKey/);
});
