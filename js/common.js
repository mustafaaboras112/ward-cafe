'use strict';
const defaultMenu=[
    {id:1,name:'قهوة تركية ورد',category:'hot',price:40,desc:'قهوة أصيلة ساخنة برغوة غنية',img:'q.png'},
    {id:2,name:'لاتيه كافيه ورد',category:'hot',price:60,desc:'إسبريسو مع حليب ناعم',img:'q.png'}
];
const TABLE_COUNT=20;
const firebaseConfigured=false;
const firebaseDatabase=null;
const WardServerState={online:true,lastError:null};
let liveMenu=null,liveOrders=[],liveTables={},liveAccounting={expenses:[],purchases:[],inventory:[],clients:[],suppliers:[],unpaid:[],sales:[],cashMovements:[],dayClosed:false};
const pollers=new Map();

function validTable(table){return /^(?:[1-9]|1[0-9]|20)$/.test(String(table));}
function customerId(){let id=sessionStorage.getItem('ward-client-id');if(!id){id=crypto.randomUUID();sessionStorage.setItem('ward-client-id',id);}return id;}
function getOrderIdentity(order,storedKey){const id=String(order?.id??storedKey??'');return {firebaseKey:id,orderId:id};}
function escapeHtml(value){const node=document.createElement('span');node.textContent=value==null?'':String(value);return node.innerHTML;}
function formatWardDateTime(value){const date=value?new Date(value):new Date();return new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short',hour12:true}).format(date);}
function isTodayWard(value){const date=new Date(value||Date.now()),today=new Date();return date.getFullYear()===today.getFullYear()&&date.getMonth()===today.getMonth()&&date.getDate()===today.getDate();}
function renderMenuViews(){window.dispatchEvent(new Event('ward:menu'));}
function renderAllOrderScreens(){window.dispatchEvent(new Event('ward:orders'));}
function updateTableSelectorUI(){window.dispatchEvent(new Event('ward:tables'));}
function emitAccounting(){window.dispatchEvent(new Event('ward:accounting'));}
function connectionChanged(){window.dispatchEvent(new CustomEvent('ward:connection',{detail:{...WardServerState}}));}
function markOnline(){if(!WardServerState.online||WardServerState.lastError){WardServerState.online=true;WardServerState.lastError=null;connectionChanged();}}
function markOffline(error){WardServerState.online=false;WardServerState.lastError=error?.message||'تعذر الاتصال بالخادم';connectionChanged();}

async function api(path,options={}){
    try{
        let result;
        if(window.WardAuth)result=await WardAuth.request(path,options);
        else{
            const response=await fetch(path,{method:options.method||'GET',headers:{'Content-Type':'application/json'},body:options.body?JSON.stringify(options.body):undefined,credentials:'same-origin',cache:'no-store'});
            result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'فشل الطلب.'),{status:response.status});
        }
        markOnline();return result;
    }catch(error){if(!error.status||error.status>=500)markOffline(error);throw error;}
}
function poll(key,task,interval){if(pollers.has(key))return;const run=()=>task().catch(()=>{});run();pollers.set(key,setInterval(run,interval));}

function getMenu(){
    if(Array.isArray(liveMenu))return liveMenu;
    try{const cached=JSON.parse(localStorage.getItem('cafe_ward_menu_cache')||'null');if(Array.isArray(cached))return cached;}catch{}
    return defaultMenu;
}
function saveMenu(menu){liveMenu=menu;try{localStorage.setItem('cafe_ward_menu_cache',JSON.stringify(menu));}catch{}renderMenuViews();}
async function refreshMenu(){const rows=await api('/api/menu',{redirectOnAuth:false});saveMenu(rows.filter(row=>row.available!==false).map(row=>({...row,price:Number(row.price),desc:row.desc??row.description??'',img:row.img??row.imageUrl??'q.png'})));}
async function startMenuRealtime(){poll('menu',refreshMenu,5000);}

function getOrders(){return liveOrders;}
async function refreshOrders(){
    if(!window.WardAuth?.user)return;
    const rows=await api('/api/orders');
    liveOrders=rows.map(order=>({...order,id:String(order.id),firebaseKey:String(order.id),table:String(order.table),total:Number(order.total),items:Array.isArray(order.items)?order.items:[]})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    try{localStorage.setItem('cafe_ward_orders_cache',JSON.stringify(liveOrders));}catch{}
    renderAllOrderScreens();
}
async function startOrdersRealtime(){
    if(!window.WardAuth?.user){try{liveOrders=JSON.parse(localStorage.getItem('cafe_ward_orders_cache')||'[]');}catch{liveOrders=[];}renderAllOrderScreens();return;}
    poll('orders',refreshOrders,2000);
}

function getLocalTableStatus(tableNumber){return liveTables[String(tableNumber)]||null;}
function setLocalTableStatus(tableNumber,status){if(status)liveTables[String(tableNumber)]={...status,table:String(tableNumber)};updateTableCache();}
function clearLocalTableStatus(tableNumber){delete liveTables[String(tableNumber)];updateTableCache();}
function updateTableCache(){try{localStorage.setItem('cafe_ward_tables_cache',JSON.stringify(liveTables));}catch{}}
async function refreshTables(){
    if(!window.WardAuth?.user)return;
    const rows=await api('/api/tables');liveTables={};
    for(const row of rows)if(row.status==='occupied')liveTables[String(row.table)]={...row,table:String(row.table),status:'occupied'};
    updateTableCache();updateTableSelectorUI();
}
async function startTablesRealtime(){
    if(!window.WardAuth?.user){try{liveTables=JSON.parse(localStorage.getItem('cafe_ward_tables_cache')||'{}');}catch{liveTables={};}updateTableSelectorUI();return;}
    poll('tables',refreshTables,2500);
}

async function submitOrder(table,items){
    if(!validTable(table)||!Array.isArray(items)||!items.length)throw new Error('اختر طاولة وأضف أصنافاً أولاً.');
    if(!window.WardAuth?.user)throw new Error('طلب الزبون عبر QR سيُنقل إلى MySQL في الخطوة التالية. استخدم شاشة الجرسون أو الكاشير حالياً.');
    const order=await api('/api/orders',{method:'POST',body:{id:crypto.randomUUID(),table:String(table),items:items.map(item=>({id:String(item.id),qty:Number(item.qty)}))}});
    await Promise.all([refreshOrders(),refreshTables()]);return order;
}
async function transitionOrder(id,expected,next){await api(`/api/orders/${encodeURIComponent(id)}/transition`,{method:'POST',body:{expected,next}});await refreshOrders();}
async function releaseTable(table){if(!validTable(table))throw new Error('رقم الطاولة غير صالح.');await api(`/api/tables/${table}/release`,{method:'POST',body:{}});await Promise.all([refreshOrders(),refreshTables()]);}
async function moveTable(from,to){if(!validTable(from)||!validTable(to)||String(from)===String(to))throw new Error('اختر طاولة أخرى بين 1 و20.');await api('/api/tables/move',{method:'POST',body:{from:String(from),to:String(to)}});await Promise.all([refreshOrders(),refreshTables()]);}
async function changeCafeState(){throw new Error('هذه العملية يجب أن تتم عبر API الخادم، وليس بتعديل الحالة من المتصفح.');}

function getAccountingData(){return liveAccounting;}
async function refreshAccounting(){
    if(!window.WardAuth?.user||!['admin','cashier','accountant'].includes(WardAuth.profile?.role))return;
    const data=await api('/api/accounting/today');liveAccounting={...liveAccounting,...data,sales:data.sales||[],expenses:data.expenses||[],dayClosed:Boolean(data.dayClosed)};emitAccounting();
}
async function startAccountingRealtime(){if(window.WardAuth?.user&&['admin','cashier','accountant'].includes(WardAuth.profile?.role))poll('accounting',refreshAccounting,4000);else emitAccounting();}
async function saveAccountingRecord(collection,record){
    if(collection!=='expenses')throw new Error('هذه الوحدة المحاسبية لم تُنقل إلى MySQL بعد.');
    const title=String(record.title||record.description||record.name||record.category||'مصروف').trim();
    const notes=String(record.notes||record.description||'').trim();
    const saved=await api('/api/accounting/expenses',{method:'POST',body:{title,amount:Number(record.amount),notes}});await refreshAccounting();return saved;
}
async function removeAccountingRecord(){throw new Error('حذف السجلات المحاسبية من الواجهة غير مفعل حالياً حفاظاً على السجل المالي.');}

function getFirebaseMenuRef(){
    if(!window.WardAuth?.user||WardAuth.profile?.role!=='admin')return null;
    const after=async action=>{const result=await action();await refreshMenu();return result;};
    return {
        push:item=>after(()=>api('/api/admin/menu',{method:'POST',body:item})),
        child:id=>({
            update:changes=>after(()=>api(`/api/admin/menu/${encodeURIComponent(id)}`,{method:'PUT',body:changes})),
            remove:()=>after(()=>api(`/api/admin/menu/${encodeURIComponent(id)}`,{method:'DELETE',body:{}}))
        })
    };
}
function getFirebaseOrdersRef(){return null;}
function getFirebaseAccountingRef(){return null;}
function getFirebaseTablesRef(){return null;}
function showFirebaseSetupMessage(){}

function startAdminConnectionMonitor(){
    const badge=document.getElementById('system-connection');if(!badge)return;
    const refresh=async()=>{try{await api('/api/health',{redirectOnAuth:false});badge.textContent='متصل بالخادم';badge.dataset.state='online';}catch{badge.textContent='تعذر الاتصال بالخادم';badge.dataset.state='offline';}};
    refresh();setInterval(refresh,5000);
}

function createPetals(){const container=document.createElement('div');container.className='petals-container';document.body.appendChild(container);for(let i=0;i<15;i++){const petal=document.createElement('div');petal.className='petal';const size=Math.random()*10+10;petal.style.width=`${size}px`;petal.style.height=`${size*1.4}px`;petal.style.left=`${Math.random()*100}vw`;petal.style.animationDuration=`${Math.random()*6+4}s`;petal.style.animationDelay=`${Math.random()*5}s`;container.appendChild(petal);}}
function createSplashPetals(container){const petals=document.createElement('div');petals.className='splash-petals';container.appendChild(petals);for(let i=0;i<8;i++){const petal=document.createElement('span');petal.className='splash-petal';petal.style.left=`${10+Math.random()*80}%`;petal.style.animationDelay=`${Math.random()*1.2}s`;petal.style.animationDuration=`${2.6+Math.random()*1.8}s`;petals.appendChild(petal);}}
function initializeProtectedPage(){}
function initializeCafeHeaderClock(){const header=document.querySelector('header');if(!header||document.getElementById('ward-live-clock')||document.getElementById('pos-clock'))return;const clock=document.createElement('div');clock.id='ward-live-clock';clock.setAttribute('aria-label','الوقت الحالي');header.append(clock);const update=()=>clock.textContent=formatWardDateTime(Date.now());update();setInterval(update,30000);}

window.addEventListener('DOMContentLoaded',async()=>{if(window.WardAuth)await WardAuth.ready;initializeProtectedPage();initializeCafeHeaderClock();const splash=document.getElementById('splash-screen');if(splash){createSplashPetals(splash);setTimeout(()=>{splash.remove();document.body.classList.remove('menu-page-loading');},1200);}createPetals();});
