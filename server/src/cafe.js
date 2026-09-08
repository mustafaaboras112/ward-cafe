'use strict';
const crypto=require('node:crypto');
const express=require('express');
const {pool,transaction}=require('./db');
const {authRequired,allow,csrfRequired}=require('./auth');

const router=express.Router();
const STAFF=['admin','cashier','accountant','waiter','kitchen'];
const statusToDb={'قيد التحضير':'preparing','جاهز':'ready','تم التوصيل':'delivered',preparing:'preparing',ready:'ready',delivered:'delivered'};
const statusToUi={preparing:'قيد التحضير',ready:'جاهز',delivered:'تم التوصيل'};
const paymentToUi={unpaid:'غير مدفوع',paid:'مدفوع'};

function httpError(status,message){const error=new Error(message);error.status=status;return error;}
function tableNumber(value){const n=Number(value);if(!Number.isInteger(n)||n<1||n>20)throw httpError(400,'رقم الطاولة غير صالح.');return n;}
function money(value){const n=Number(value);if(!Number.isFinite(n))throw httpError(400,'قيمة مالية غير صالحة.');return Math.round(n*100)/100;}
function ensureItems(items){if(!Array.isArray(items)||!items.length||items.length>80)throw httpError(400,'أضف أصنافاً صالحة للطلب.');return items.map(line=>{const id=Number(line.id);const qty=Number(line.qty);if(!Number.isInteger(id)||id<1||!Number.isInteger(qty)||qty<1||qty>99)throw httpError(400,'أحد أصناف الطلب غير صالح.');return {id,qty};});}

async function assertDayOpen(connection){
  const [rows]=await connection.execute('SELECT business_date FROM day_closures WHERE business_date=CURRENT_DATE() FOR UPDATE');
  if(rows.length)throw httpError(409,'تم إغلاق اليوم المحاسبي. افتح يوماً جديداً قبل تسجيل عمليات جديدة.');
}
async function loadOrderItems(connection,ids){
  const map=new Map();
  if(!ids.length)return map;
  const placeholders=ids.map(()=>'?').join(',');
  const [rows]=await connection.execute(`SELECT order_id,menu_item_id id,item_name name,unit_price price,quantity qty,line_total lineTotal FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id`,ids);
  for(const row of rows){if(!map.has(row.order_id))map.set(row.order_id,[]);map.get(row.order_id).push({...row,price:Number(row.price),lineTotal:Number(row.lineTotal)});}
  return map;
}
function orderToUi(row,items=[]){
  const created=row.createdAt??row.created_at;
  return {
    id:String(row.id),firebaseKey:String(row.id),table:String(row.tableNumber??row.table_number),
    status:statusToUi[row.status]||row.status,paymentStatus:paymentToUi[row.paymentStatus??row.payment_status]||row.paymentStatus,
    total:Number(row.total),createdAt:created?new Date(created).getTime():null,
    readyAt:(row.readyAt??row.ready_at)?new Date(row.readyAt??row.ready_at).getTime():null,
    deliveredAt:(row.deliveredAt??row.delivered_at)?new Date(row.deliveredAt??row.delivered_at).getTime():null,
    paidAt:(row.paidAt??row.paid_at)?new Date(row.paidAt??row.paid_at).getTime():null,
    movedAt:(row.movedAt??row.moved_at)?new Date(row.movedAt??row.moved_at).getTime():null,
    time:created?new Date(created).toLocaleString('ar'):null,items
  };
}

router.get('/menu',async(req,res,next)=>{try{
  const [rows]=await pool.execute('SELECT id,name,category,price,description,image_url imageUrl,available FROM menu_items ORDER BY id');
  res.json(rows.map(row=>({...row,price:Number(row.price),available:Boolean(row.available),desc:row.description||'',img:row.imageUrl||''})));
}catch(error){next(error);}});

router.get('/orders',authRequired,allow(...STAFF),async(req,res,next)=>{try{
  const [rows]=await pool.execute(`SELECT id,table_number tableNumber,status,payment_status paymentStatus,total,created_at createdAt,ready_at readyAt,delivered_at deliveredAt,paid_at paidAt,moved_at movedAt FROM orders WHERE payment_status='unpaid' ORDER BY created_at`);
  const items=await loadOrderItems(pool,rows.map(row=>row.id));
  res.json(rows.map(row=>orderToUi(row,items.get(row.id)||[])));
}catch(error){next(error);}});

router.get('/tables',authRequired,allow(...STAFF),async(req,res,next)=>{try{
  const [rows]=await pool.execute(`SELECT table_number tableNumber,status,reserved_at reservedAt FROM cafe_tables ORDER BY table_number`);
  res.json(rows.map(row=>({table:String(row.tableNumber),status:row.status,reservedAt:row.reservedAt?new Date(row.reservedAt).getTime():null})));
}catch(error){next(error);}});

router.post('/orders',authRequired,allow('admin','cashier','waiter'),csrfRequired,async(req,res,next)=>{try{
  const table=tableNumber(req.body?.table), lines=ensureItems(req.body?.items), id=/^[0-9a-f-]{36}$/i.test(String(req.body?.id||''))?String(req.body.id):crypto.randomUUID();
  const result=await transaction(async connection=>{
    await assertDayOpen(connection);
    const [existing]=await connection.execute('SELECT id FROM orders WHERE id=? FOR UPDATE',[id]);
    if(existing.length){const [row]=await connection.execute('SELECT * FROM orders WHERE id=?',[id]);const itemMap=await loadOrderItems(connection,[id]);return orderToUi(row[0],itemMap.get(id)||[]);}
    const [tables]=await connection.execute('SELECT table_number,status,reserved_at FROM cafe_tables WHERE table_number=? FOR UPDATE',[table]);
    if(!tables.length)throw httpError(404,'الطاولة غير موجودة.');
    const ids=[...new Set(lines.map(line=>line.id))], placeholders=ids.map(()=>'?').join(',');
    const [menu]=await connection.execute(`SELECT id,name,price,available FROM menu_items WHERE id IN (${placeholders})`,ids);
    const products=new Map(menu.map(item=>[Number(item.id),item]));
    const normalized=lines.map(line=>{const item=products.get(line.id);if(!item||!item.available)throw httpError(409,'أحد الأصناف لم يعد متاحاً.');const price=money(item.price);return {id:line.id,name:item.name,price,qty:line.qty,lineTotal:money(price*line.qty)};});
    const total=money(normalized.reduce((sum,line)=>sum+line.lineTotal,0));
    await connection.execute(`INSERT INTO orders(id,table_number,created_by,status,payment_status,total) VALUES(?,?,?,'preparing','unpaid',?)`,[id,table,req.user.id,total]);
    for(const line of normalized)await connection.execute('INSERT INTO order_items(order_id,menu_item_id,item_name,unit_price,quantity,line_total) VALUES(?,?,?,?,?,?)',[id,line.id,line.name,line.price,line.qty,line.lineTotal]);
    await connection.execute(`UPDATE cafe_tables SET status='occupied',reserved_at=COALESCE(reserved_at,NOW()) WHERE table_number=?`,[table]);
    const [row]=await connection.execute('SELECT * FROM orders WHERE id=?',[id]);
    return orderToUi(row[0],normalized);
  });
  res.status(201).json(result);
}catch(error){next(error);}});

router.post('/orders/:id/transition',authRequired,allow('admin','cashier','waiter','kitchen'),csrfRequired,async(req,res,next)=>{try{
  const id=String(req.params.id), expected=statusToDb[req.body?.expected], nextStatus=statusToDb[req.body?.next];
  const transitions={preparing:'ready',ready:'delivered'};
  if(!expected||transitions[expected]!==nextStatus)throw httpError(400,'انتقال حالة غير مسموح.');
  if(req.user.role==='kitchen'&&nextStatus!=='ready')throw httpError(403,'المطبخ يستطيع فقط تحديد الطلب كجاهز.');
  if(req.user.role==='waiter'&&nextStatus!=='delivered')throw httpError(403,'الجرسون يستطيع فقط تأكيد التوصيل.');
  const result=await transaction(async connection=>{
    const [rows]=await connection.execute('SELECT * FROM orders WHERE id=? FOR UPDATE',[id]);const order=rows[0];
    if(!order)throw httpError(404,'الطلب غير موجود.');
    if(order.payment_status==='paid')throw httpError(409,'تم إغلاق هذا الطلب بعد الدفع.');
    if(order.status===nextStatus)return orderToUi(order,(await loadOrderItems(connection,[id])).get(id)||[]);
    if(order.status!==expected)throw httpError(409,'تم تحديث حالة الطلب من جهاز آخر. حدّث الشاشة.');
    const stamp=nextStatus==='ready'?'ready_at':'delivered_at';
    await connection.execute(`UPDATE orders SET status=?,${stamp}=NOW() WHERE id=?`,[nextStatus,id]);
    const [updated]=await connection.execute('SELECT * FROM orders WHERE id=?',[id]);
    return orderToUi(updated[0],(await loadOrderItems(connection,[id])).get(id)||[]);
  });
  res.json(result);
}catch(error){next(error);}});

router.post('/tables/move',authRequired,allow('admin','cashier','waiter'),csrfRequired,async(req,res,next)=>{try{
  const from=tableNumber(req.body?.from),to=tableNumber(req.body?.to);if(from===to)throw httpError(400,'اختر طاولة أخرى.');
  await transaction(async connection=>{
    const pair=[from,to].sort((a,b)=>a-b);await connection.execute(`SELECT table_number,status,reserved_at FROM cafe_tables WHERE table_number IN (?,?) ORDER BY table_number FOR UPDATE`,pair);
    const [sourceRows]=await connection.execute('SELECT table_number,status,reserved_at FROM cafe_tables WHERE table_number=?',[from]);const source=sourceRows[0];
    const [targetRows]=await connection.execute('SELECT table_number,status FROM cafe_tables WHERE table_number=?',[to]);const target=targetRows[0];
    if(!source||source.status!=='occupied')throw httpError(409,'الطاولة الأصلية غير مشغولة.');
    if(!target||target.status==='occupied')throw httpError(409,'الطاولة المطلوبة مشغولة.');
    const [targetOpen]=await connection.execute("SELECT id FROM orders WHERE table_number=? AND payment_status='unpaid' LIMIT 1 FOR UPDATE",[to]);
    if(targetOpen.length)throw httpError(409,'الطاولة المطلوبة لديها حساب مفتوح.');
    await connection.execute("UPDATE orders SET table_number=?,moved_at=NOW() WHERE table_number=? AND payment_status='unpaid'",[to,from]);
    await connection.execute("UPDATE cafe_tables SET status='occupied',reserved_at=? WHERE table_number=?",[source.reserved_at||new Date(),to]);
    await connection.execute("UPDATE cafe_tables SET status='available',reserved_at=NULL WHERE table_number=?",[from]);
  });
  res.json({ok:true,from:String(from),to:String(to)});
}catch(error){next(error);}});

router.post('/tables/:table/release',authRequired,allow('admin','cashier','waiter'),csrfRequired,async(req,res,next)=>{try{
  const table=tableNumber(req.params.table);
  await transaction(async connection=>{
    await connection.execute('SELECT table_number FROM cafe_tables WHERE table_number=? FOR UPDATE',[table]);
    const [open]=await connection.execute("SELECT id FROM orders WHERE table_number=? AND payment_status='unpaid' LIMIT 1 FOR UPDATE",[table]);
    if(open.length)throw httpError(409,'لا يمكن تفريغ الطاولة قبل تحصيل جميع طلباتها.');
    await connection.execute("UPDATE cafe_tables SET status='available',reserved_at=NULL WHERE table_number=?",[table]);
  });
  res.json({ok:true});
}catch(error){next(error);}});

router.post('/payments',authRequired,allow('admin','cashier'),csrfRequired,async(req,res,next)=>{try{
  const table=tableNumber(req.body?.table),method=String(req.body?.method||'');if(!['cash','card'].includes(method))throw httpError(400,'طريقة الدفع غير صالحة.');
  const tendered=method==='cash'?money(req.body?.tendered):null;
  const expected=Array.isArray(req.body?.orders)?req.body.orders.map(item=>({id:String(item.id||item.firebaseKey||''),total:money(item.total)})):null;
  const receipt=await transaction(async connection=>{
    await assertDayOpen(connection);
    await connection.execute('SELECT table_number FROM cafe_tables WHERE table_number=? FOR UPDATE',[table]);
    const [orders]=await connection.execute("SELECT * FROM orders WHERE table_number=? AND payment_status='unpaid' ORDER BY created_at FOR UPDATE",[table]);
    if(!orders.length)throw httpError(409,'لا توجد طلبات غير مدفوعة لهذه الطاولة.');
    if(orders.some(order=>order.status!=='delivered'))throw httpError(409,'يجب توصيل جميع طلبات الطاولة قبل تحصيل الحساب.');
    if(expected){const actual=new Map(orders.map(order=>[String(order.id),money(order.total)]));if(actual.size!==expected.length||expected.some(item=>actual.get(item.id)!==item.total))throw httpError(409,'تغيّرت طلبات الطاولة أو إجماليها. راجع الفاتورة المحدثة ثم أكد الدفع مجدداً.');}
    const total=money(orders.reduce((sum,order)=>sum+Number(order.total),0));
    if(method==='cash'&&tendered<total)throw httpError(400,'المبلغ المستلم أقل من إجمالي الفاتورة.');
    const change=method==='cash'?money(tendered-total):0;
    const [payment]=await connection.execute(`INSERT INTO payments(table_number,method,total,cash_received,change_amount,cashier_user_id,business_date) VALUES(?,?,?,?,?,?,CURRENT_DATE())`,[table,method,total,method==='cash'?tendered:null,method==='cash'?change:null,req.user.id]);
    for(const order of orders)await connection.execute('INSERT INTO payment_orders(payment_id,order_id) VALUES(?,?)',[payment.insertId,order.id]);
    await connection.execute("UPDATE orders SET payment_status='paid',paid_at=NOW() WHERE table_number=? AND payment_status='unpaid'",[table]);
    await connection.execute("UPDATE cafe_tables SET status='available',reserved_at=NULL WHERE table_number=?",[table]);
    const itemMap=await loadOrderItems(connection,orders.map(order=>order.id));
    return {paymentId:payment.insertId,table:String(table),method,total,received:method==='cash'?tendered:total,change,paidAt:Date.now(),orders:orders.map(order=>orderToUi({...order,payment_status:'paid',paid_at:new Date()},itemMap.get(order.id)||[]))};
  });
  res.json(receipt);
}catch(error){next(error);}});

router.get('/accounting/today',authRequired,allow('admin','cashier','accountant'),async(req,res,next)=>{try{
  const [[sales],[expenses],[closure]]=await Promise.all([
    pool.execute(`SELECT p.id,p.table_number tableNumber,p.method,p.total,p.cash_received cashReceived,p.change_amount changeAmount,p.created_at createdAt FROM payments p WHERE p.business_date=CURRENT_DATE() ORDER BY p.created_at DESC`),
    pool.execute(`SELECT e.id,e.title,e.amount,e.notes,e.created_at createdAt,u.name createdBy FROM expenses e JOIN users u ON u.id=e.created_by WHERE e.business_date=CURRENT_DATE() ORDER BY e.created_at DESC`),
    pool.execute(`SELECT business_date businessDate,total_sales totalSales,cash_sales cashSales,card_sales cardSales,total_expenses totalExpenses,net_total netTotal,closed_at closedAt FROM day_closures WHERE business_date=CURRENT_DATE() LIMIT 1`)
  ]);
  res.json({sales:sales.map(row=>({...row,table:String(row.tableNumber),total:Number(row.total),paymentMethod:row.method,paidAt:new Date(row.createdAt).getTime(),time:new Date(row.createdAt).toLocaleString('ar')})),expenses:expenses.map(row=>({...row,amount:Number(row.amount),createdAt:new Date(row.createdAt).getTime(),time:new Date(row.createdAt).toLocaleString('ar')})),dayClosed:Boolean(closure[0]),closure:closure[0]||null});
}catch(error){next(error);}});

router.post('/accounting/expenses',authRequired,allow('admin','accountant'),csrfRequired,async(req,res,next)=>{try{
  const title=String(req.body?.title||'').trim(),notes=String(req.body?.notes||'').trim(),amount=money(req.body?.amount);if(title.length<2||title.length>150||amount<=0||notes.length>500)throw httpError(400,'بيانات المصروف غير صالحة.');
  const record=await transaction(async connection=>{await assertDayOpen(connection);const [result]=await connection.execute('INSERT INTO expenses(title,amount,notes,created_by,business_date) VALUES(?,?,?,?,CURRENT_DATE())',[title,amount,notes||null,req.user.id]);return {id:result.insertId,title,amount,notes,createdAt:Date.now(),time:new Date().toLocaleString('ar')};});
  res.status(201).json(record);
}catch(error){next(error);}});

router.post('/accounting/close-day',authRequired,allow('admin','accountant'),csrfRequired,async(req,res,next)=>{try{
  const result=await transaction(async connection=>{
    await assertDayOpen(connection);
    const [open]=await connection.execute("SELECT id FROM orders WHERE payment_status='unpaid' LIMIT 1 FOR UPDATE");if(open.length)throw httpError(409,'لا يمكن إغلاق اليوم وهناك طلبات غير مدفوعة.');
    const [sales]=await connection.execute(`SELECT COALESCE(SUM(total),0) total,COALESCE(SUM(CASE WHEN method='cash' THEN total ELSE 0 END),0) cash,COALESCE(SUM(CASE WHEN method='card' THEN total ELSE 0 END),0) card FROM payments WHERE business_date=CURRENT_DATE()`);
    const [expenses]=await connection.execute('SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE business_date=CURRENT_DATE()');
    const totals={totalSales:money(sales[0].total),cashSales:money(sales[0].cash),cardSales:money(sales[0].card),totalExpenses:money(expenses[0].total)};totals.netTotal=money(totals.totalSales-totals.totalExpenses);
    await connection.execute('INSERT INTO day_closures(business_date,total_sales,cash_sales,card_sales,total_expenses,net_total,closed_by) VALUES(CURRENT_DATE(),?,?,?,?,?,?)',[totals.totalSales,totals.cashSales,totals.cardSales,totals.totalExpenses,totals.netTotal,req.user.id]);
    return {...totals,closedAt:Date.now()};
  });
  res.json(result);
}catch(error){next(error);}});

module.exports={router,httpError,statusToDb,statusToUi,paymentToUi,orderToUi};
