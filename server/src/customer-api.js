'use strict';
const crypto=require('node:crypto');
const express=require('express');
const {pool,transaction}=require('./db');

const router=express.Router();
const COOKIE='ward_customer';
const MAX_AGE=60*60*24*30;
const statusToUi={preparing:'قيد التحضير',ready:'جاهز',delivered:'تم التوصيل'};
const paymentToUi={unpaid:'غير مدفوع',paid:'مدفوع'};

function fail(status,message){throw Object.assign(new Error(message),{status});}
function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
function makeToken(){return crypto.randomBytes(32).toString('hex');}
function cookies(header=''){
  const result={};
  for(const part of header.split(';')){
    const text=part.trim();if(!text)continue;
    const index=text.indexOf('=');if(index<1)continue;
    try{result[text.slice(0,index)]=decodeURIComponent(text.slice(index+1));}catch{}
  }
  return result;
}
function cookieHeader(raw){return `${COOKIE}=${encodeURIComponent(raw)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${process.env.COOKIE_SECURE==='1'?'; Secure':''}`;}
function tableNumber(value){const n=Number(value);if(!Number.isInteger(n)||n<1||n>20)fail(400,'رقم الطاولة غير صالح.');return n;}
function validOrderId(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''));}
function normalizeItems(items){
  if(!Array.isArray(items)||!items.length||items.length>80)fail(400,'أضف أصنافاً صالحة للطلب.');
  return items.map(line=>{const id=Number(line.id),qty=Number(line.qty);if(!Number.isInteger(id)||id<1||!Number.isInteger(qty)||qty<1||qty>99)fail(400,'أحد أصناف الطلب غير صالح.');return {id,qty};});
}
function money(value){const n=Number(value);if(!Number.isFinite(n))fail(400,'قيمة مالية غير صالحة.');return Math.round(n*100)/100;}
function tokenFor(req,res,create=false){
  let raw=cookies(req.headers.cookie)[COOKIE];
  if(raw&&!/^[0-9a-f]{64}$/i.test(raw))raw=null;
  if(!raw&&create){raw=makeToken();res.setHeader('Set-Cookie',cookieHeader(raw));}
  return raw||null;
}
async function assertDayOpen(connection){
  const [rows]=await connection.execute('SELECT business_date FROM day_closures WHERE business_date=CURRENT_DATE() FOR UPDATE');
  if(rows.length)fail(409,'تم إغلاق اليوم المحاسبي. لا يمكن إرسال طلب جديد الآن.');
}
async function loadItems(connection,ids){
  const map=new Map();if(!ids.length)return map;
  const placeholders=ids.map(()=>'?').join(',');
  const [rows]=await connection.execute(`SELECT order_id,menu_item_id id,item_name name,unit_price price,quantity qty,line_total lineTotal FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id`,ids);
  for(const row of rows){if(!map.has(row.order_id))map.set(row.order_id,[]);map.get(row.order_id).push({id:String(row.id),name:row.name,price:Number(row.price),qty:Number(row.qty),lineTotal:Number(row.lineTotal)});}
  return map;
}
function toUi(row,items=[]){
  return {id:String(row.id),firebaseKey:String(row.id),table:String(row.table_number),status:statusToUi[row.status]||row.status,paymentStatus:paymentToUi[row.payment_status]||row.payment_status,total:Number(row.total),createdAt:row.created_at?new Date(row.created_at).getTime():null,readyAt:row.ready_at?new Date(row.ready_at).getTime():null,deliveredAt:row.delivered_at?new Date(row.delivered_at).getTime():null,paidAt:row.paid_at?new Date(row.paid_at).getTime():null,movedAt:row.moved_at?new Date(row.moved_at).getTime():null,items};
}

router.get('/orders',async(req,res,next)=>{try{
  const table=tableNumber(req.query.table),raw=tokenFor(req,res,false);
  if(!raw)return res.json([]);
  const [rows]=await pool.execute(`SELECT o.* FROM orders o JOIN customer_order_access a ON a.order_id=o.id WHERE a.token_hash=? AND o.table_number=? AND o.payment_status='unpaid' ORDER BY o.created_at`,[hash(raw),table]);
  const items=await loadItems(pool,rows.map(row=>row.id));
  res.json(rows.map(row=>toUi(row,items.get(row.id)||[])));
}catch(error){next(error);}});

router.post('/orders',async(req,res,next)=>{try{
  const table=tableNumber(req.body?.table),lines=normalizeItems(req.body?.items),id=validOrderId(req.body?.id)?String(req.body.id):crypto.randomUUID();
  const raw=tokenFor(req,res,true),tokenHash=hash(raw);
  const order=await transaction(async connection=>{
    await assertDayOpen(connection);
    const [same]=await connection.execute(`SELECT o.* FROM orders o JOIN customer_order_access a ON a.order_id=o.id WHERE o.id=? AND a.token_hash=? FOR UPDATE`,[id,tokenHash]);
    if(same.length){const items=await loadItems(connection,[id]);return toUi(same[0],items.get(id)||[]);}
    const [collision]=await connection.execute('SELECT id FROM orders WHERE id=? FOR UPDATE',[id]);
    if(collision.length)fail(409,'تعذر إنشاء الطلب. أعد المحاولة.');
    const [recent]=await connection.execute(`SELECT o.id,o.created_at FROM orders o JOIN customer_order_access a ON a.order_id=o.id WHERE a.token_hash=? AND o.payment_status='unpaid' ORDER BY o.created_at DESC FOR UPDATE`,[tokenHash]);
    if(recent.length>=10)fail(429,'لديك عدد كبير من الطلبات المفتوحة. انتظر حتى تُخدم الطلبات الحالية.');
    if(recent[0]&&Date.now()-new Date(recent[0].created_at).getTime()<8000)fail(429,'انتظر عدة ثوانٍ قبل إرسال طلب جديد.');
    const [tables]=await connection.execute('SELECT table_number,status,reserved_at FROM cafe_tables WHERE table_number=? FOR UPDATE',[table]);
    if(!tables.length)fail(404,'الطاولة غير موجودة.');
    const ids=[...new Set(lines.map(line=>line.id))],placeholders=ids.map(()=>'?').join(',');
    const [menu]=await connection.execute(`SELECT id,name,price,available FROM menu_items WHERE id IN (${placeholders})`,ids);
    const products=new Map(menu.map(item=>[Number(item.id),item]));
    const normalized=lines.map(line=>{const item=products.get(line.id);if(!item||!item.available)fail(409,'أحد الأصناف لم يعد متاحاً. حدّث المنيو.');const price=money(item.price);return {id:line.id,name:item.name,price,qty:line.qty,lineTotal:money(price*line.qty)};});
    const total=money(normalized.reduce((sum,line)=>sum+line.lineTotal,0));
    await connection.execute(`INSERT INTO orders(id,table_number,created_by,status,payment_status,total) VALUES(?,?,NULL,'preparing','unpaid',?)`,[id,table,total]);
    for(const line of normalized)await connection.execute('INSERT INTO order_items(order_id,menu_item_id,item_name,unit_price,quantity,line_total) VALUES(?,?,?,?,?,?)',[id,line.id,line.name,line.price,line.qty,line.lineTotal]);
    await connection.execute('INSERT INTO customer_order_access(order_id,token_hash) VALUES(?,?)',[id,tokenHash]);
    await connection.execute("UPDATE cafe_tables SET status='occupied',reserved_at=COALESCE(reserved_at,NOW()) WHERE table_number=?",[table]);
    const [created]=await connection.execute('SELECT * FROM orders WHERE id=?',[id]);
    return toUi(created[0],normalized);
  });
  res.status(201).json(order);
}catch(error){next(error);}});

module.exports={router};
