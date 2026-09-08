'use strict';
require('dotenv').config();
const path=require('node:path');
const express=require('express');
const helmet=require('helmet');
const {pool}=require('./db');
const {authRequired,csrfRequired,login,logout,getSession,homeFor}=require('./auth');
const {router:cafeRouter}=require('./cafe');

const app=express();
const root=path.resolve(__dirname,'../..');
const port=Number(process.env.PORT||3000);

if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));
app.use(express.json({limit:'256kb'}));
app.use(express.urlencoded({extended:false,limit:'64kb'}));

app.get('/api/health',async(req,res,next)=>{try{await pool.query('SELECT 1');res.json({ok:true,database:'connected'});}catch(error){next(error);}});
app.post('/api/auth/login',login);
app.get('/api/auth/me',async(req,res,next)=>{try{const user=await getSession(req);if(!user)return res.status(401).json({error:'يجب تسجيل الدخول.'});res.json({user:{id:user.id,userNumber:user.user_number,name:user.name,role:user.role},csrf:user.csrf_token,home:homeFor(user.role)});}catch(error){next(error);}});
app.post('/api/auth/logout',authRequired,csrfRequired,logout);
app.use('/api',cafeRouter);

const pageRoles={
  '/admin.html':['admin'],
  '/pos.html':['admin','cashier'],
  '/accounting.html':['admin','accountant'],
  '/waiter.html':['admin','cashier','waiter'],
  '/kitchen.html':['admin','kitchen']
};
for(const [route,roles] of Object.entries(pageRoles)){
  app.get(route,async(req,res,next)=>{
    try{
      const user=await getSession(req);
      if(!user)return res.redirect(`/login.html?next=${encodeURIComponent(route.slice(1))}`);
      if(!roles.includes(user.role))return res.redirect('/login.html?denied=1');
      res.sendFile(path.join(root,route));
    }catch(error){next(error);}
  });
}

app.use(express.static(root,{index:false,extensions:false}));
app.get('/',(req,res)=>res.sendFile(path.join(root,'index.html')));

app.use((error,req,res,next)=>{
  if(res.headersSent)return next(error);
  const status=Number(error.status)||500;
  if(status>=500)console.error(error);
  res.status(status).json({error:status>=500?'حدث خطأ في الخادم. راجع سجل التشغيل.':error.message});
});

app.listen(port,process.env.HOST||'0.0.0.0',()=>{
  console.log(`Ward Cafe: http://localhost:${port}`);
});
