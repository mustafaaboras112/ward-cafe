'use strict';

const defaultMenu=[
    {id:1,name:'قهوة تركية ورد',category:'hot',price:40,desc:'قهوة أصيلة ساخنة برغوة غنية',img:'q.png'},
    {id:2,name:'لاتيه كافيه ورد',category:'hot',price:60,desc:'إسبريسو مع حليب ناعم',img:'q.png'}
];
const TABLE_COUNT=20;
const firebaseConfigured=false;
const firebaseDatabase=null;
const WardServerState={online:true,lastError:null,lastSuccessAt:null};
let liveMenu=null;
let liveOrders=[];
let liveTables={};
let liveAccounting={expenses:[],sales:[],dayClosed:false,closure:null};
const pollers=new Map();

function validTable(table){return /^(?:[1-9]|1[0-9]|20)$/.test(String(table??''));}
function currentQrTable(){const values=new URLSearchParams(location.search).getAll('table');return values.length===1&&validTable(values[0])?String(values[0]):null;}
function isCustomerQrPage(){const page=location.pathname.split('/').pop()||'index.html';return Boolean(currentQrTable()&&(page==='index.html'||page===''));}
function customerId(){let id=sessionStorage.getItem('ward-client-id');if(!id){id=crypto.randomUUID();sessionStorage.setItem('ward-client-id',id);}return id;}
function getOrderIdentity(order,storedKey){const id=String(order?.id??storedKey??'');return {firebaseKey:id,orderId:id};}
function escapeHtml(value){const node=document.createElement('span');node.textContent=value==null?'':String(value);return node.innerHTML;}
function formatWardDateTime(value){const date=value?new Date(value):new Date();return new Intl.DateTimeFormat('ar',{dateStyle:'short',timeStyle:'short'}).format(date);}
function isTodayWard(value){const date=new Date(value||Date.now()),today=new Date();return date.getFullYear()===today.getFullYear()&&date.getMonth()===today.getMonth()&&date.getDate()===today.getDate();}
function renderMenuViews(){window.dispatchEvent(new Event('ward:menu'));}
function renderAllOrderScreens(){window.dispatchEvent(new Event('ward:orders'));}
function updateTableSelectorUI(){window.dispatchEvent(new Event('ward:tables'));}
function emitAccounting(){window.dispatchEvent(new Event('ward:accounting'));}
function connectionChanged(){window.dispatchEvent(new CustomEvent('ward:connection',{detail:{...WardServerState}}));}
function markOnline(){const changed=!WardServerState.online||WardServerState.lastError;WardServerState.online=true;WardServerState.lastError=null;WardServerState.lastSuccessAt=Date.now();if(changed)connectionChanged();}
function markOffline(error){const message=error?.message||'تعذر الاتصال بالخادم';const changed=WardServerState.online||WardServerState.lastError!==message;WardServerState.online=false;WardServerState.lastError=message;if(changed)connectionChanged();}

async function api(path,options={}){
    try{
        let result;
        if(window.WardAuth){
            result=await WardAuth.request(path,{...options,redirectOnAuth:options.redirectOnAuth});
        }else{
            const response=await fetch(path,{method:options.method||'GET',headers:{Accept:'application/json','Content-Type':'application/json',...(options.headers||{})},body:options.body===undefined?undefined:JSON.stringify(options.body),credentials:'same-origin',cache:'no-store'});
            let data={};try{data=await response.json();}catch{}
            if(!response.ok)throw Object.assign(new Error(data.error||`فشل الطلب (${response.status}).`),{status:response.status});
            result=data;
        }
        markOnline();
        return result;
    }catch(error){
        if(!error?.status||error.status>=500)markOffline(error);
        throw error;
    }
}

function poll(key,task,interval){
    if(pollers.has(key))return;
    const run=()=>task().catch(()=>{});
    run();
    pollers.set(key,setInterval(run,interval));
}

function getMenu(){
    if(Array.isArray(liveMenu))return liveMenu;
    try{const cached=JSON.parse(localStorage.getItem('cafe_ward_menu_cache')||'null');if(Array.isArray(cached))return cached;}catch{}
    return defaultMenu;
}
function saveMenu(menu){
    liveMenu=Array.isArray(menu)?menu:[];
    try{localStorage.setItem('cafe_ward_menu_cache',JSON.stringify(liveMenu));}catch{}
    renderMenuViews();
}
async function refreshMenu(){
    const rows=await api('/api/menu',{redirectOnAuth:false});
    saveMenu(rows.filter(row=>row.available!==false).map(row=>({...row,id:String(row.id),price:Number(row.price),desc:row.desc??row.description??'',img:row.img??row.imageUrl??'q.png',available:row.available!==false})));
    return liveMenu;
}
function startMenuRealtime(){poll('menu',refreshMenu,5000);}

function normalizeOrder(row,extra={}){
    return {...row,...extra,id:String(row.id),firebaseKey:String(row.id),table:String(row.table),total:Number(row.total||0),items:Array.isArray(row.items)?row.items.map(item=>({...item,id:String(item.id??item.menuItemId??''),price:Number(item.price||0),qty:Number(item.qty||0)})):[]};
}
function getOrders(){return liveOrders;}
async function refreshOrders(){
    const customerContext=isCustomerQrPage();
    const staff=Boolean(window.WardAuth?.user)&&!customerContext;
    if(staff){
        const rows=await api('/api/orders');
        liveOrders=rows.map(row=>normalizeOrder(row)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    }else{
        const table=currentQrTable();
        if(!table){liveOrders=[];renderAllOrderScreens();return liveOrders;}
        const rows=await api('/api/customer/orders?table='+encodeURIComponent(table),{redirectOnAuth:false});
        const owner=customerId();
        liveOrders=rows.map(row=>normalizeOrder(row,{clientId:owner})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    }
    try{localStorage.setItem('cafe_ward_orders_cache',JSON.stringify(liveOrders));}catch{}
    renderAllOrderScreens();
    return liveOrders;
}
function startOrdersRealtime(){
    if((window.WardAuth?.user&&!isCustomerQrPage())||currentQrTable())poll('orders',refreshOrders,2200);
    else{liveOrders=[];renderAllOrderScreens();}
}

function getLocalTableStatus(tableNumber){return liveTables[String(tableNumber)]||null;}
function setLocalTableStatus(tableNumber,status){if(status)liveTables[String(tableNumber)]={...status,table:String(tableNumber)};updateTableCache();}
function clearLocalTableStatus(tableNumber){delete liveTables[String(tableNumber)];updateTableCache();}
function updateTableCache(){try{localStorage.setItem('cafe_ward_tables_cache',JSON.stringify(liveTables));}catch{}}
async function refreshTables(){
    if(!window.WardAuth?.user||isCustomerQrPage())return liveTables;
    const rows=await api('/api/tables');liveTables={};
    for(const row of rows)if(row.status==='occupied')liveTables[String(row.table)]={...row,table:String(row.table),status:'occupied'};
    updateTableCache();updateTableSelectorUI();return liveTables;
}
function startTablesRealtime(){
    if(window.WardAuth?.user&&!isCustomerQrPage())poll('tables',refreshTables,2500);
    else{try{liveTables=JSON.parse(localStorage.getItem('cafe_ward_tables_cache')||'{}');}catch{liveTables={};}updateTableSelectorUI();}
}

async function submitOrder(table,items){
    if(!validTable(table)||!Array.isArray(items)||!items.length)throw new Error('اختر طاولة وأضف أصنافاً أولاً.');
    const body={id:crypto.randomUUID(),table:String(table),items:items.map(item=>({id:String(item.id),qty:Number(item.qty)}))};
    const staff=Boolean(window.WardAuth?.user)&&!isCustomerQrPage();
    const order=await api(staff?'/api/orders':'/api/customer/orders',{method:'POST',body,redirectOnAuth:false});
    await refreshOrders();
    if(staff)await refreshTables();
    return normalizeOrder(order,staff?{}:{clientId:customerId()});
}
async function transitionOrder(id,expected,next){await api(`/api/orders/${encodeURIComponent(id)}/transition`,{method:'POST',body:{expected,next}});await refreshOrders();}
async function releaseTable(table){if(!validTable(table))throw new Error('رقم الطاولة غير صالح.');await api(`/api/tables/${table}/release`,{method:'POST',body:{}});await Promise.all([refreshOrders(),refreshTables()]);}
async function moveTable(from,to){if(!validTable(from)||!validTable(to)||String(from)===String(to))throw new Error('اختر طاولة أخرى بين 1 و20.');await api('/api/tables/move',{method:'POST',body:{from:String(from),to:String(to)}});await Promise.all([refreshOrders(),refreshTables()]);}
async function changeCafeState(){throw new Error('هذه العملية محمية وتتم من خلال خادم MySQL فقط.');}

function getAccountingData(){return liveAccounting;}
async function refreshAccounting(){
    if(!window.WardAuth?.user||!['admin','cashier','accountant'].includes(WardAuth.profile?.role))return liveAccounting;
    const data=await api('/api/accounting/today');
    liveAccounting={expenses:Array.isArray(data.expenses)?data.expenses:[],sales:Array.isArray(data.sales)?data.sales:[],dayClosed:Boolean(data.dayClosed),closure:data.closure||null};
    emitAccounting();return liveAccounting;
}
function startAccountingRealtime(){if(window.WardAuth?.user&&['admin','cashier','accountant'].includes(WardAuth.profile?.role))poll('accounting',refreshAccounting,4000);else emitAccounting();}
async function saveAccountingRecord(collection,record){
    if(collection!=='expenses')throw new Error('هذه الوحدة غير مفعلة في إصدار MySQL الحالي. استخدم المبيعات والمصروفات والتقارير وإغلاق اليوم.');
    const title=String(record.title||record.description||record.name||record.category||'مصروف').trim();
    const notes=String(record.notes||record.description||'').trim();
    const saved=await api('/api/accounting/expenses',{method:'POST',body:{title,amount:Number(record.amount),notes}});await refreshAccounting();return saved;
}
async function removeAccountingRecord(){throw new Error('حذف السجلات المالية غير متاح حفاظاً على سجل العمليات.');}
async function closeAccountingDay(){const result=await api('/api/accounting/close-day',{method:'POST',body:{}});await refreshAccounting();return result;}

function getFirebaseMenuRef(){return null;}
function getFirebaseOrdersRef(){return null;}
function getFirebaseAccountingRef(){return null;}
function getFirebaseTablesRef(){return null;}
function showFirebaseSetupMessage(){}

function startAdminConnectionMonitor(){
    const badge=document.getElementById('system-connection');if(!badge)return;
    const refresh=async()=>{try{await api('/api/health',{redirectOnAuth:false});badge.textContent='متصل بالخادم';badge.dataset.state='online';}catch{badge.textContent='تعذر الاتصال بالخادم';badge.dataset.state='offline';}};
    refresh();setInterval(refresh,5000);
}
function applyAccountingServerGuards(){
    if(typeof setAccountingDayClosed==='function')setAccountingDayClosed=async value=>{if(!value)throw new Error('إعادة فتح يوم مغلق تحتاج إجراء إداري موثق.');return closeAccountingDay();};
    if(typeof updateAccountingRecord==='function')updateAccountingRecord=async()=>{throw new Error('تعديل سجل مالي محفوظ مباشرة غير مسموح. أضف حركة تصحيح منفصلة.');};
}

function injectRuntimePolish(){
    if(document.getElementById('ward-runtime-polish'))return;
    const style=document.createElement('style');style.id='ward-runtime-polish';style.textContent=`
        :where(button,a,input,select,textarea):focus-visible{outline:3px solid rgba(190,55,105,.25);outline-offset:2px}
        button:not(:disabled){cursor:pointer} button:disabled{opacity:.52;cursor:not-allowed;filter:saturate(.65)}
        #ward-server-banner{position:fixed;z-index:100000;left:50%;bottom:18px;transform:translateX(-50%);max-width:min(680px,calc(100% - 28px));padding:11px 16px;border-radius:14px;background:#2d2529;color:#fff;box-shadow:0 12px 35px rgba(0,0,0,.2);font:600 14px/1.5 Tahoma,Arial,sans-serif;display:none;text-align:center}
        #ward-server-banner[data-show="true"]{display:block}
        [aria-busy="true"]{cursor:progress}
        .ready-notification::before,.ready-bell-icon::before{content:'🔔';margin-inline-end:6px}
    `;document.head.appendChild(style);
    const banner=document.createElement('div');banner.id='ward-server-banner';banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');document.body.appendChild(banner);
    const sync=()=>{banner.dataset.show=String(WardServerState.online===false);banner.textContent=WardServerState.online===false?'الاتصال بالخادم متوقف — البيانات المعروضة قد تكون آخر نسخة محفوظة.':'';};
    window.addEventListener('ward:connection',sync);sync();
}
function createPetals(){if(document.querySelector('.petals-container'))return;const container=document.createElement('div');container.className='petals-container';document.body.appendChild(container);for(let i=0;i<12;i++){const petal=document.createElement('div');petal.className='petal';const size=Math.random()*10+10;petal.style.width=`${size}px`;petal.style.height=`${size*1.4}px`;petal.style.left=`${Math.random()*100}vw`;petal.style.animationDuration=`${Math.random()*6+4}s`;petal.style.animationDelay=`${Math.random()*5}s`;container.appendChild(petal);}}
function createSplashPetals(container){const petals=document.createElement('div');petals.className='splash-petals';container.appendChild(petals);for(let i=0;i<8;i++){const petal=document.createElement('span');petal.className='splash-petal';petal.style.left=`${10+Math.random()*80}%`;petal.style.animationDelay=`${Math.random()*1.2}s`;petal.style.animationDuration=`${2.6+Math.random()*1.8}s`;petals.appendChild(petal);}}
function initializeProtectedPage(){}
function initializeCafeHeaderClock(){const header=document.querySelector('header');if(!header||document.getElementById('ward-live-clock')||document.getElementById('pos-clock'))return;const clock=document.createElement('div');clock.id='ward-live-clock';clock.setAttribute('aria-label','الوقت الحالي');header.append(clock);const update=()=>clock.textContent=formatWardDateTime(Date.now());update();setInterval(update,30000);}

window.addEventListener('DOMContentLoaded',async()=>{
    if(window.WardAuth)await WardAuth.ready;
    applyAccountingServerGuards();injectRuntimePolish();initializeProtectedPage();initializeCafeHeaderClock();
    const splash=document.getElementById('splash-screen');if(splash){createSplashPetals(splash);setTimeout(()=>{splash.remove();document.body.classList.remove('menu-page-loading');},900);}
    if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)createPetals();
});
