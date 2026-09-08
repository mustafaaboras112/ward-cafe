'use strict';
const express=require('express');
const bcrypt=require('bcryptjs');
const {pool,transaction}=require('./db');
const {authRequired,allow,csrfRequired,normalizeDigits}=require('./auth');

const router=express.Router();
const roles=['admin','cashier','accountant','waiter','kitchen'];
const error=(status,message)=>Object.assign(new Error(message),{status});
const validId=value=>Number.isInteger(Number(value))&&Number(value)>0;

router.use(authRequired,allow('admin'));

router.post('/menu',csrfRequired,async(req,res,next)=>{try{
  const name=String(req.body?.name||'').trim(),category=String(req.body?.category||'').trim(),description=String(req.body?.desc??req.body?.description??'').trim(),imageUrl=String(req.body?.img??req.body?.imageUrl??'').trim(),price=Number(req.body?.price);
  if(name.length<2||name.length>150||!category||category.length>50||!Number.isFinite(price)||price<0||description.length>500||imageUrl.length>1000)throw error(400,'بيانات الصنف غير صالحة.');
  const [result]=await pool.execute('INSERT INTO menu_items(name,category,price,description,image_url,available) VALUES(?,?,?,?,?,1)',[name,category,Math.round(price*100)/100,description||null,imageUrl||null]);
  res.status(201).json({id:result.insertId,name,category,price:Math.round(price*100)/100,desc:description,img:imageUrl,available:true});
}catch(e){next(e);}});

router.put('/menu/:id',csrfRequired,async(req,res,next)=>{try{
  if(!validId(req.params.id))throw error(400,'معرف الصنف غير صالح.');
  const name=String(req.body?.name||'').trim(),category=String(req.body?.category||'').trim(),description=String(req.body?.desc??req.body?.description??'').trim(),imageUrl=String(req.body?.img??req.body?.imageUrl??'').trim(),price=Number(req.body?.price);
  if(name.length<2||name.length>150||!category||category.length>50||!Number.isFinite(price)||price<0||description.length>500||imageUrl.length>1000)throw error(400,'بيانات الصنف غير صالحة.');
  const [result]=await pool.execute('UPDATE menu_items SET name=?,category=?,price=?,description=?,image_url=?,available=1 WHERE id=?',[name,category,Math.round(price*100)/100,description||null,imageUrl||null,Number(req.params.id)]);
  if(!result.affectedRows)throw error(404,'الصنف غير موجود.');
  res.json({ok:true});
}catch(e){next(e);}});

router.delete('/menu/:id',csrfRequired,async(req,res,next)=>{try{
  if(!validId(req.params.id))throw error(400,'معرف الصنف غير صالح.');
  const [result]=await pool.execute('UPDATE menu_items SET available=0 WHERE id=?',[Number(req.params.id)]);
  if(!result.affectedRows)throw error(404,'الصنف غير موجود.');
  res.json({ok:true});
}catch(e){next(e);}});

async function pinInUse(pin,exceptId=null){
  const [rows]=await pool.execute(`SELECT id,password_hash FROM users WHERE active=1${exceptId?' AND id<>?':''}`,exceptId?[exceptId]:[]);
  for(const row of rows){if(await bcrypt.compare(pin,row.password_hash))return true;}
  return false;
}
async function nextUserNumber(){
  const [rows]=await pool.execute("SELECT MAX(CAST(user_number AS UNSIGNED)) max_number FROM users WHERE user_number REGEXP '^[0-9]+$'");
  return String(Math.max(1000,Number(rows[0]?.max_number||999)+1));
}

router.post('/users',csrfRequired,async(req,res,next)=>{try{
  let number=normalizeDigits(req.body?.number).trim();
  const name=String(req.body?.name||'').trim(),role=String(req.body?.role||''),pin=normalizeDigits(req.body?.pin??req.body?.password).trim();
  if(!number)number=await nextUserNumber();
  if(!/^[0-9]{4,12}$/.test(number)||name.length<2||name.length>100||!roles.includes(role)||!/^[0-9]{4,8}$/.test(pin))throw error(400,'أدخل الاسم والدور ورمزًا من 4 إلى 8 أرقام.');
  if(await pinInUse(pin))throw error(409,'هذا الرمز مستخدم لموظف آخر. اختر رمزًا مختلفًا.');
  const passwordHash=await bcrypt.hash(pin,10);
  try{const [result]=await pool.execute('INSERT INTO users(user_number,name,password_hash,role,active) VALUES(?,?,?,?,1)',[number,name,passwordHash,role]);res.status(201).json({uid:String(result.insertId),number,name,role,active:true});}
  catch(e){if(e.code==='ER_DUP_ENTRY')throw error(409,'رقم المستخدم مستخدم بالفعل.');throw e;}
}catch(e){next(e);}});

router.get('/users',async(req,res,next)=>{try{
  const [rows]=await pool.execute('SELECT id,user_number number,name,role,active,created_at createdAt FROM users ORDER BY active DESC,name,id');
  res.json({users:rows.map(row=>({uid:String(row.id),number:row.number,name:row.name,role:row.role,active:Boolean(row.active),createdAt:row.createdAt})),pageToken:null});
}catch(e){next(e);}});

router.patch('/users/:id',csrfRequired,async(req,res,next)=>{try{
  const id=Number(req.params.id),name=String(req.body?.name||'').trim(),role=String(req.body?.role||''),active=Boolean(req.body?.active);
  if(!validId(id)||name.length<2||name.length>100||!roles.includes(role))throw error(400,'بيانات المستخدم غير صالحة.');
  if(id===Number(req.user.id)&&(role!=='admin'||!active))throw error(409,'لا يمكنك سحب صلاحية المدير أو تعطيل حسابك الحالي.');
  await transaction(async connection=>{
    const [targets]=await connection.execute('SELECT id,role,active FROM users WHERE id=? FOR UPDATE',[id]);const target=targets[0];if(!target)throw error(404,'المستخدم غير موجود.');
    if(target.role==='admin'&&(role!=='admin'||!active)){const [counts]=await connection.execute("SELECT COUNT(*) count FROM users WHERE role='admin' AND active=1 FOR UPDATE");if(Number(counts[0].count)<=1)throw error(409,'لا يمكن تعطيل أو تغيير دور آخر مدير نشط.');}
    await connection.execute('UPDATE users SET name=?,role=?,active=? WHERE id=?',[name,role,active?1:0,id]);if(!active)await connection.execute('DELETE FROM sessions WHERE user_id=?',[id]);
  });
  res.json({ok:true});
}catch(e){next(e);}});

router.post('/users/:id/password',csrfRequired,async(req,res,next)=>{try{
  const id=Number(req.params.id),pin=normalizeDigits(req.body?.pin??req.body?.password).trim();
  if(!validId(id)||!/^[0-9]{4,8}$/.test(pin))throw error(400,'الرمز يجب أن يكون من 4 إلى 8 أرقام.');
  if(await pinInUse(pin,id))throw error(409,'هذا الرمز مستخدم لموظف آخر. اختر رمزًا مختلفًا.');
  const passwordHash=await bcrypt.hash(pin,10);const [result]=await pool.execute('UPDATE users SET password_hash=? WHERE id=?',[passwordHash,id]);if(!result.affectedRows)throw error(404,'المستخدم غير موجود.');await pool.execute('DELETE FROM sessions WHERE user_id=?',[id]);res.json({ok:true});
}catch(e){next(e);}});

router.post('/users/:id/revoke',csrfRequired,async(req,res,next)=>{try{const id=Number(req.params.id);if(!validId(id))throw error(400,'معرف المستخدم غير صالح.');await pool.execute('DELETE FROM sessions WHERE user_id=?',[id]);res.json({ok:true});}catch(e){next(e);}});

router.delete('/users/:id',csrfRequired,async(req,res,next)=>{try{
  const id=Number(req.params.id);if(!validId(id))throw error(400,'معرف المستخدم غير صالح.');if(id===Number(req.user.id))throw error(409,'لا يمكنك حذف حسابك الحالي.');
  await transaction(async connection=>{const [targets]=await connection.execute('SELECT role,active FROM users WHERE id=? FOR UPDATE',[id]);const target=targets[0];if(!target)throw error(404,'المستخدم غير موجود.');if(target.role==='admin'&&target.active){const [counts]=await connection.execute("SELECT COUNT(*) count FROM users WHERE role='admin' AND active=1 FOR UPDATE");if(Number(counts[0].count)<=1)throw error(409,'لا يمكن حذف آخر مدير نشط.');}await connection.execute('UPDATE users SET active=0 WHERE id=?',[id]);await connection.execute('DELETE FROM sessions WHERE user_id=?',[id]);});
  res.json({ok:true,archived:true});
}catch(e){next(e);}});

module.exports={router};
