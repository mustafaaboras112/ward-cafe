'use strict';
const admin=require('firebase-admin');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {createHash}=require('node:crypto');
const {digits,validNumber,validPin,loginEmail}=require('./numeric');
if(!admin.apps?.length)admin.initializeApp({databaseURL:process.env.WARD_DATABASE_URL || 'https://ward-cafe-default-rtdb.firebaseio.com'});
const db=admin.database(), auth=admin.auth();
const roles=['admin','cashier','accountant','waiter','kitchen'];
const fail=(code,message)=>{throw new HttpsError(code,message);};
async function access(request,allowed){
    if(!request.auth) fail('unauthenticated','يجب تسجيل الدخول.');
    const p=(await db.ref('access/'+request.auth.uid).get()).val();
    if(!p?.active || !allowed.includes(p.role) || request.auth.token.auth_time <= (p.revokedAt || 0)) fail('permission-denied','لا تملك صلاحية تنفيذ العملية.');
    return p;
}
const audit=(r,action,target)=>db.ref('audit').push({actor:r.auth.uid,action,target,time:Date.now()});
exports.transitionOrder=onCall(async r=>{
    const p=await access(r,['admin','cashier','kitchen','waiter']);
    const d=r.data || {}, transitions={'قيد التحضير':'جاهز','جاهز':'تم التوصيل'};
    if(typeof d.id!=='string' || /[.#$\[\]\/]/.test(d.id) || !d.id || transitions[d.expected]!==d.next) fail('invalid-argument','انتقال غير صالح.');
    if(p.role==='kitchen' && d.next!=='جاهز' || p.role==='waiter' && d.next!=='تم التوصيل') fail('permission-denied','لا تملك صلاحية هذه الخطوة.');
    const result=await db.ref('orders/'+d.id).transaction(order=>{
        if(!order || order.paymentStatus==='مدفوع') return;
        if(order.status===d.next)return order;
        if(order.status!==d.expected)return;
        order.status=d.next;order[d.next==='جاهز'?'readyAt':'deliveredAt']=Date.now();return order;
    });
    if(!result.committed)fail('failed-precondition','تم تغيير الطلب. حدّث الشاشة.');
    await audit(r,'transition-order',d.id);return {ok:true};
});
exports.manageUsers=onCall(async r=>{
    await access(r,['admin']);
    if(Date.now()/1000-r.auth.token.auth_time>900) fail('unauthenticated','سجّل الدخول مجدداً لإدارة الحسابات.');
    const d=r.data || {};
    if(d.action==='list'){
        const list=await auth.listUsers(100,d.pageToken || undefined);
        const permissions=(await db.ref('access').get()).val() || {};
        return {users:list.users.filter(u=>u.email).map(u=>({uid:u.uid,number:u.email.endsWith('@staff.ward.invalid')?u.email.split('@')[0]:'',name:u.displayName || '',active:permissions[u.uid]?.active===true,role:permissions[u.uid]?.role || '',lastSignIn:u.metadata.lastSignInTime || ''})),pageToken:list.pageToken || null};
    }
    if(d.action==='create'){
        const number=digits(d.number), pin=digits(d.pin);
        if(!roles.includes(d.role) || !validNumber(number) || !validPin(pin) || typeof d.name!=='string' || d.name.trim().length<2 || d.name.length>100) fail('invalid-argument','رقم المستخدم من 4 إلى 12 رقمًا، ورمز الدخول من 12 إلى 20 رقمًا.');
        const user=await auth.createUser({email:loginEmail(number),displayName:d.name.trim(),password:pin});
        try{await db.ref('access/'+user.uid).set({role:d.role,active:true});}catch(error){await auth.deleteUser(user.uid);throw error;}
        await audit(r,'create',user.uid);return {uid:user.uid,number};
    }
    if(typeof d.uid!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(d.uid)) fail('invalid-argument','معرف غير صالح.');
    if(d.uid===r.auth.uid) fail('failed-precondition','لا يمكنك تعديل أو حذف حسابك الإداري الحالي.');
    const current=(await db.ref('access/'+d.uid).get()).val();
    // Administrators are immutable here, preventing concurrent removal of the last admin.
    if(current?.role==='admin') fail('failed-precondition','تعديل حساب مدير آخر يتطلب أداة الإدارة الموثوقة على الخادم.');
    if(d.action==='update'){
        if(!roles.includes(d.role) || typeof d.active!=='boolean' || typeof d.name!=='string' || d.name.trim().length<2 || d.name.length>100) fail('invalid-argument','بيانات غير صالحة.');
        await db.ref('access/'+d.uid).set({role:d.role,active:false,revokedAt:Math.floor(Date.now()/1000)});
        await auth.updateUser(d.uid,{disabled:!d.active,displayName:d.name.trim()});
        await auth.revokeRefreshTokens(d.uid);
        await db.ref('access/'+d.uid+'/active').set(d.active);
    }else if(d.action==='resetPin'){
        const pin=digits(d.pin);
        if(!validPin(pin)) fail('invalid-argument','رمز الدخول يجب أن يتكون من 12 إلى 20 رقمًا.');
        await db.ref('access/'+d.uid+'/revokedAt').set(Math.floor(Date.now()/1000));
        await auth.updateUser(d.uid,{password:pin});await auth.revokeRefreshTokens(d.uid);
    }else if(d.action==='revoke'){
        await db.ref('access/'+d.uid+'/revokedAt').set(Math.floor(Date.now()/1000));await auth.revokeRefreshTokens(d.uid);
    }else if(d.action==='delete'){
        await db.ref('access/'+d.uid).update({active:false,revokedAt:Math.floor(Date.now()/1000)});await auth.deleteUser(d.uid);await db.ref('access/'+d.uid).remove();
    }else fail('invalid-argument','عملية غير معروفة.');
    await audit(r,d.action,d.uid);return {ok:true};
});
exports.changeNumericPin=onCall(async r=>{
    await access(r,roles);
    if(Date.now()/1000-r.auth.token.auth_time>60) fail('unauthenticated','أعد التحقق من رمزك الحالي.');
    const pin=digits(r.data?.pin);
    if(!validPin(pin)) fail('invalid-argument','رمز الدخول يجب أن يتكون من 12 إلى 20 رقمًا.');
    await db.ref('access/'+r.auth.uid+'/revokedAt').set(Math.floor(Date.now()/1000));
    await auth.updateUser(r.auth.uid,{password:pin});await auth.revokeRefreshTokens(r.auth.uid);
    await audit(r,'change-pin',r.auth.uid);return {ok:true};
});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stateOf=root=>({orders:root.orders || {},tables:root.tables || {},accounting:root.accounting || {},menu:root.menu || {}});
exports.cafeState=onCall(async r=>{
    await access(r,['admin','cashier']);
    const d=r.data || {};
    if(d.action==='read'){const state=stateOf((await db.ref().get()).val() || {});return {state,version:hash(state)};}
    if(d.action!=='commit' || !d.state || JSON.stringify(d.state).length>5000000) fail('invalid-argument','عملية غير صالحة.');
    let denied=false;
    const result=await db.ref().transaction(root=>{
        if(!root || !root.access?.[r.auth.uid]?.active || !['admin','cashier'].includes(root.access[r.auth.uid].role) || r.auth.token.auth_time <= (root.access[r.auth.uid].revokedAt || 0)){denied=true;return;}
        const current=stateOf(root);
        if(hash(current)!==d.version) return;
        for(const key of ['orders','tables','accounting']) {if(!d.state[key] || typeof d.state[key]!=='object' || Array.isArray(d.state[key])) return;root[key]=d.state[key];}
        return root;
    });
    if(!result.committed) fail(denied?'permission-denied':'aborted','تغيرت البيانات أو الصلاحيات. حدّث الشاشة وأعد المحاولة.');
    await audit(r,'cafe-state','operations');return {state:stateOf(result.snapshot.val())};
});
exports.customerOrder=onCall(async r=>{
    if(!r.auth) fail('unauthenticated','أعد تحميل الصفحة.');
    const d=r.data || {}, table=String(d.table), uid=r.auth.uid;
    if(!/^[1-9][0-9]*$/.test(table) || Number(table)>20 || !Array.isArray(d.items) || !d.items.length || d.items.length>80 || typeof d.id!=='string' || !/^[a-f0-9-]{36}$/.test(d.id)) fail('invalid-argument','طلب غير صالح.');
    let order, reason='الطاولة مشغولة أو الطلب غير صالح.';
    const result=await db.ref().transaction(root=>{
        if(!root) return;
        root.orders ||= {};root.tables ||= {};
        if(root.orders[d.id]) {if(root.orders[d.id].clientId===uid){order=root.orders[d.id];return root;}return;}
        const previous=root.tables[table];
        if(previous?.status==='occupied' && previous.clientId!==uid) return;
        const own=Object.values(root.orders).filter(o=>o.clientId===uid);
        if(own.some(o=>Date.now()-o.createdAt<10000) || own.filter(o=>o.paymentStatus!=='مدفوع').length>=10){reason='انتظر قليلاً قبل إضافة طلب آخر.';return;}
        const items=[];
        for(const line of d.items){const p=root.menu?.[line.id];if(!p || p.available===false || !Number.isInteger(line.qty) || line.qty<1 || line.qty>99 || !Number.isFinite(Number(p.price)) || Number(p.price)<0)return;items.push({id:String(line.id),name:p.name,price:Number(p.price),qty:line.qty});}
        const now=Date.now();order={id:d.id,clientId:uid,table,items,total:Math.round(items.reduce((s,i)=>s+i.price*i.qty,0)*100)/100,status:'قيد التحضير',paymentStatus:'غير مدفوع',createdAt:now,time:new Date(now).toISOString()};
        root.orders[d.id]=order;root.tables[table]={status:'occupied',table,orderId:d.id,clientId:uid,reservedAt:previous?.reservedAt || now};return root;
    });
    if(!result.committed) fail('failed-precondition',reason);return order;
});
