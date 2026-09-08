'use strict';
const crypto=require('node:crypto');
const bcrypt=require('bcryptjs');
const {pool}=require('./db');

const SESSION_COOKIE='ward_session';
const roles={
  admin:['admin','cashier','accountant','waiter','kitchen'],
  cashier:['cashier'],
  accountant:['accountant'],
  waiter:['waiter'],
  kitchen:['kitchen']
};
const normalizeDigits=value=>String(value ?? '').replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?1632:1776)));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const token=()=>crypto.randomBytes(32).toString('hex');

function cookieMap(header=''){
  return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(part=>{const i=part.indexOf('=');return [part.slice(0,i),decodeURIComponent(part.slice(i+1))];}));
}
function cookieOptions(maxAge){
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}
function clientIp(req){return String(req.ip || req.socket?.remoteAddress || '').slice(0,64);}

async function getSession(req){
  const raw=cookieMap(req.headers.cookie)[SESSION_COOKIE];
  if(!raw)return null;
  const [rows]=await pool.execute(`SELECT s.id session_id,s.csrf_token,s.expires_at,u.id,u.user_number,u.name,u.role,u.active
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>NOW() LIMIT 1`,[hash(raw)]);
  const session=rows[0];
  if(!session?.active)return null;
  return session;
}

async function authRequired(req,res,next){
  try{
    const session=await getSession(req);
    if(!session)return res.status(401).json({error:'يجب تسجيل الدخول.'});
    req.user=session;next();
  }catch(nextError){next(nextError);}
}
function allow(...allowed){return (req,res,next)=>allowed.includes(req.user?.role)?next():res.status(403).json({error:'لا تملك صلاحية تنفيذ هذه العملية.'});}
function csrfRequired(req,res,next){
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  if(req.headers['x-csrf-token']!==req.user?.csrf_token)return res.status(403).json({error:'انتهت صلاحية الطلب. حدّث الصفحة وحاول مجددًا.'});
  next();
}

async function recordAttempt(userNumber,ip,success){
  await pool.execute('INSERT INTO login_attempts(user_number,ip_address,success) VALUES(?,?,?)',[userNumber || null,ip || null,success?1:0]);
}
async function tooManyAttempts(userNumber,ip){
  const [rows]=await pool.execute(`SELECT COUNT(*) attempts FROM login_attempts
    WHERE success=0 AND attempted_at>DATE_SUB(NOW(),INTERVAL 15 MINUTE) AND (user_number=? OR ip_address=?)`,[userNumber,ip]);
  return Number(rows[0]?.attempts || 0)>=8;
}

async function login(req,res){
  const userNumber=normalizeDigits(req.body?.userNumber).trim();
  const password=normalizeDigits(req.body?.password);
  const ip=clientIp(req);
  if(!/^[0-9]{4,12}$/.test(userNumber) || password.length<8 || password.length>128)return res.status(400).json({error:'بيانات الدخول غير صحيحة.'});
  if(await tooManyAttempts(userNumber,ip))return res.status(429).json({error:'محاولات كثيرة. انتظر 15 دقيقة ثم حاول مجددًا.'});
  const [rows]=await pool.execute('SELECT id,user_number,name,password_hash,role,active FROM users WHERE user_number=? LIMIT 1',[userNumber]);
  const user=rows[0];
  const valid=!!user?.active && await bcrypt.compare(password,user.password_hash);
  await recordAttempt(userNumber,ip,valid);
  if(!valid)return res.status(401).json({error:'رقم المستخدم أو كلمة المرور غير صحيحة.'});
  const raw=token(),csrf=token(),hours=Math.max(1,Math.min(24,Number(process.env.SESSION_HOURS || 12)));
  await pool.execute('DELETE FROM sessions WHERE expires_at<=NOW()');
  await pool.execute(`INSERT INTO sessions(user_id,token_hash,csrf_token,ip_address,user_agent,expires_at)
    VALUES(?,?,?,?,?,DATE_ADD(NOW(),INTERVAL ? HOUR))`,[user.id,hash(raw),csrf,ip,String(req.headers['user-agent'] || '').slice(0,255),hours]);
  res.setHeader('Set-Cookie',`${SESSION_COOKIE}=${encodeURIComponent(raw)}; ${cookieOptions(hours*3600)}`);
  res.json({user:{id:user.id,userNumber:user.user_number,name:user.name,role:user.role},csrf,home:homeFor(user.role)});
}
async function logout(req,res){
  const raw=cookieMap(req.headers.cookie)[SESSION_COOKIE];
  if(raw)await pool.execute('DELETE FROM sessions WHERE token_hash=?',[hash(raw)]);
  res.setHeader('Set-Cookie',`${SESSION_COOKIE}=; ${cookieOptions(0)}`);
  res.json({ok:true});
}
function homeFor(role){return ({admin:'admin.html',cashier:'pos.html',accountant:'accounting.html',waiter:'waiter.html',kitchen:'kitchen.html'})[role] || 'login.html';}

module.exports={authRequired,allow,csrfRequired,login,logout,getSession,homeFor,normalizeDigits,roles};
