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

test('browser data layer no longer writes Firebase state',()=>{
  const common=read('js/common.js');
  assert.doesNotMatch(common,/firebase\.database\(|firebase\.auth\(|\.ref\('orders'\)/);
  assert.match(common,/\/api\/payments|\/api\/orders|\/api\/tables/);
  assert.match(common,/changeCafeState\(\).*يجب أن تتم عبر API الخادم/s);
});

test('protected pages use server sessions and role checks',()=>{
  const server=read('server/src/server.js');
  const auth=read('server/src/auth.js');
  assert.match(server,/pageRoles/);
  assert.match(server,/getSession\(req\)/);
  assert.match(auth,/bcrypt\.compare/);
  assert.match(auth,/HttpOnly; SameSite=Strict/);
  assert.match(auth,/X-CSRF|x-csrf-token/i);
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
