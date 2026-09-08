'use strict';
const crypto=require('node:crypto');
const bcrypt=require('bcryptjs');
const {pool}=require('./db');

const SESSION_COOKIE='ward_session';
const normalizeDigits=value=>String(value??'').replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?1632:1776)));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const token=()=>crypto.randomBytes(32).toString('hex');

function cookieMap(header=''){
  return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(part=>{const i=part.indexOf('=');return [part.slice(0,i),decodeURIComponent(part.slice(i+1))];}));
}
function cookieOptions(maxAge){return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.COOKIE_SECURE==='1'?'; Secure':''}`;}
function clientIp(req){return String(req.ip||req.socket?.remoteAddress||'').slice(0,64);}

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
  try{const session=await getSession(req);if(!session)return res.status(401).json({error:'يجب تسجيل الدخول.'});req.user=session;next();}
  catch(error){next(error);}
}
function allow(...allowed){return(req,res,next)=>allowed.includes(req.user?.role)?next():res.status(403).json({error:'لا تملك صلاحية تنفيذ هذه العملية.'});}
function csrfRequired(req,res,next){
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  if(req.headers['x-csrf-token']!==req.user?.csrf_token)return res.status(403).json({error:'انتهت صلاحية الطلب. حدّث الصفحة وحاول مجددًا.'});
  next();
}

async function recordAttempt(userNumber,ip,success){await pool.execute('INSERT INTO login_attempts(user_number,ip_address,success) VALUES(?,?,?)',[userNumber||null,ip||null,success?1:0]);}
async function tooManyAttempts(ip){
  const [rows]=await pool.execute(`SELECT COUNT(*) attempts FROM login_attempts WHERE success=0 AND attempted_at>DATE_SUB(NOW(),INTERVAL 15 MINUTE) AND ip_address=?`,[ip]);
  return Number(rows[0]?.attempts||0)>=10;
}

async function findUserByPin(pin){
  const [rows]=await pool.execute('SELECT id,user_number,name,password_hash,role,active FROM users WHERE active=1 ORDER BY id');
  for(const user of rows){if(await bcrypt.compare(pin,user.password_hash))return user;}
  return null;
}

async function login(req,res,next){
  try{
    const pin=normalizeDigits(req.body?.pin??req.body?.password).trim();
    const ip=clientIp(req);
    if(!/^[0-9]{4,8}$/.test(pin))return res.status(400).json({error:'الرمز يجب أن يكون من 4 إلى 8 أرقام.'});
    if(await tooManyAttempts(ip))return res.status(429).json({error:'محاولات كثيرة. انتظر 15 دقيقة ثم حاول مجددًا.'});
    const user=await findUserByPin(pin);
    await recordAttempt(user?.user_number||null,ip,Boolean(user));
    if(!user)return res.status(401).json({error:'الرمز غير صحيح.'});
    const raw=token(),csrf=token(),hours=Math.max(1,Math.min(24,Number(process.env.SESSION_HOURS||12)));
    await pool.execute('DELETE FROM sessions WHERE expires_at<=NOW()');
    await pool.execute('DELETE FROM sessions WHERE user_id=?',[user.id]);
    await pool.execute(`INSERT INTO sessions(user_id,token_hash,csrf_token,ip_address,user_agent,expires_at) VALUES(?,?,?,?,?,DATE_ADD(NOW(),INTERVAL ? HOUR))`,[user.id,hash(raw),csrf,ip,String(req.headers['user-agent']||'').slice(0,255),hours]);
    res.setHeader('Set-Cookie',`${SESSION_COOKIE}=${encodeURIComponent(raw)}; ${cookieOptions(hours*3600)}`);
    res.json({user:{id:user.id,userNumber:user.user_number,name:user.name,role:user.role},csrf,home:homeFor(user.role)});
  }catch(error){next(error);}
}
async function logout(req,res,next){
  try{const raw=cookieMap(req.headers.cookie)[SESSION_COOKIE];if(raw)await pool.execute('DELETE FROM sessions WHERE token_hash=?',[hash(raw)]);res.setHeader('Set-Cookie',`${SESSION_COOKIE}=; ${cookieOptions(0)}`);res.json({ok:true});}
  catch(error){next(error);}
}
async function changePassword(req,res,next){
  try{
    const current=normalizeDigits(req.body?.currentPassword??req.body?.currentPin).trim();
    const nextPin=normalizeDigits(req.body?.newPassword??req.body?.newPin).trim();
    if(!/^[0-9]{4,8}$/.test(current)||!/^[0-9]{4,8}$/.test(nextPin))return res.status(400).json({error:'الرمز يجب أن يكون من 4 إلى 8 أرقام.'});
    if(current===nextPin)return res.status(400).json({error:'اختر رمزًا جديدًا مختلفًا.'});
    const [rows]=await pool.execute('SELECT password_hash FROM users WHERE id=? AND active=1 LIMIT 1',[req.user.id]);
    if(!rows[0]||!await bcrypt.compare(current,rows[0].password_hash))return res.status(401).json({error:'الرمز الحالي غير صحيح.'});
    const passwordHash=await bcrypt.hash(nextPin,10);
    await pool.execute('UPDATE users SET password_hash=? WHERE id=?',[passwordHash,req.user.id]);
    await pool.execute('DELETE FROM sessions WHERE user_id=?',[req.user.id]);
    res.setHeader('Set-Cookie',`${SESSION_COOKIE}=; ${cookieOptions(0)}`);
    res.json({ok:true});
  }catch(error){next(error);}
}
function homeFor(role){return({admin:'admin.html',cashier:'pos.html',accountant:'accounting.html',waiter:'waiter.html',kitchen:'kitchen.html'})[role]||'login.html';}

module.exports={authRequired,allow,csrfRequired,login,logout,changePassword,getSession,homeFor,normalizeDigits};
