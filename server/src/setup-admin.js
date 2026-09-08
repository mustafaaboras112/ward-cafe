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
    const userNumber=normalizeDigits((await rl.question('رقم المدير (4-12 رقم): ')).trim());
    const name=(await rl.question('اسم المدير: ')).trim();
    const password=normalizeDigits(await rl.question('كلمة المرور (8 أحرف/أرقام على الأقل): '));
    if(!/^[0-9]{4,12}$/.test(userNumber) || name.length<2 || password.length<8)throw new Error('بيانات المدير غير صالحة.');
    const passwordHash=await bcrypt.hash(password,12);
    await pool.execute("INSERT INTO users(user_number,name,password_hash,role,active) VALUES(?,?,?,'admin',1)",[userNumber,name,passwordHash]);
    console.log('تم إنشاء أول مدير بنجاح.');
  }finally{rl.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end());
