'use strict';
require('dotenv').config();
const readline=require('node:readline/promises');
const {stdin:input,stdout:output}=require('node:process');
const bcrypt=require('bcryptjs');
const {pool}=require('./db');
const {normalizeDigits}=require('./auth');

async function main(){
  const [rows]=await pool.execute("SELECT COUNT(*) count FROM users WHERE role='admin'");
  if(Number(rows[0].count)>0){console.log('يوجد مدير بالفعل. لم يتم إنشاء حساب جديد.');return;}
  const rl=readline.createInterface({input,output});
  try{
    const name=(await rl.question('اسم المدير: ')).trim();
    const pin=normalizeDigits((await rl.question('رمز المدير (4-8 أرقام): ')).trim());
    if(name.length<2||!/^[0-9]{4,8}$/.test(pin))throw new Error('أدخل اسمًا صحيحًا ورمزًا من 4 إلى 8 أرقام.');
    const passwordHash=await bcrypt.hash(pin,10);
    await pool.execute("INSERT INTO users(user_number,name,password_hash,role,active) VALUES('1000',?,?,'admin',1)",[name,passwordHash]);
    console.log('تم إنشاء المدير. استخدم الرمز نفسه في شاشة الدخول.');
  }finally{rl.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end());
