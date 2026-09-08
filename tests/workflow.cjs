const fs=require('fs'), vm=require('vm'), assert=require('node:assert/strict'), {webcrypto}=require('crypto');
function storage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
class Element {
 constructor(){this.style={};this.children=[];this.options=[];this.value='';this.classList={add(){},remove(){}};this._html='';}
 set innerHTML(value){this._html=value;} get innerHTML(){return this._html || String(this.textContent||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
 appendChild(el){this.children.push(el);el.parentNode=this;return el;} append(el){return this.appendChild(el);} remove(){} setAttribute(k,v){this[k]=v;} getAttribute(k){return this[k]??null;} addEventListener(){} querySelector(){return new Element();} querySelectorAll(){return [];} replaceChildren(){this.children=[];} reset(){} focus(){}
}
function create(page='pos', remote=false, options={}){
 const events={},nodes=new Map(), html=fs.readFileSync((page==='menu'?'index':page)+'.html','utf8');
 for(const match of html.matchAll(/id="([^"]+)"/g))nodes.set(match[1],new Element());
 if(nodes.has('table-selector'))nodes.get('table-selector').options=Array.from({length:20},(_,i)=>({value:String(i+1)}));
 if(nodes.has('pos-method'))nodes.get('pos-method').value='cash';
 const localStorage=options.localStorage || storage(), sessionStorage=options.sessionStorage || storage();sessionStorage.setItem('isLoggedIn','true');
 const header=html.includes('<header>')?new Element():null;
 const remoteStore=options.remoteStore || {state:{orders:{},tables:{},accounting:{sales:{}}},listeners:[]};
 let reject=false;
 const read=path=>path.split('/').filter(Boolean).reduce((value,key)=>value?.[key],remoteStore.state) ?? null;
 const snapshot=path=>{const value=structuredClone(read(path));return {val:()=>value,exists:()=>value!==null};};
 const ref=(path='')=>({
   child:key=>ref([path,String(key)].filter(Boolean).join('/')),
   once:async()=>snapshot(path),
   on:(event,callback)=>{remoteStore.listeners.push({path,callback});callback(snapshot(path));},
   transaction:async change=>{
     const next=change(structuredClone(read(path)));
     if(next===undefined)return {committed:false,snapshot:snapshot(path)};
     if(reject)throw Error('PERMISSION_DENIED'); // Reject the entire proposed write, not individual fields.
     if(!path)remoteStore.state=next;
     else {const keys=path.split('/'),leaf=keys.pop();let parent=remoteStore.state;for(const key of keys)parent=parent[key] ||= {};parent[leaf]=next;}
     const committed=snapshot(path);
     for(const listener of remoteStore.listeners)listener.callback(snapshot(listener.path));
     return {committed:true,snapshot:committed};
   }
 });
 const db={ref};
 const context=vm.createContext({console:{log(){},warn(){},error(){}},crypto:webcrypto,localStorage,sessionStorage,URLSearchParams,Intl,Date,Math,Map,Set,JSON,Event,Number,Promise,navigator:{locks:{request:async(_,fn)=>fn()}},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,alert(){},confirm:()=>true,prompt:()=>null,
  document:{body:new Element(),getElementById:id=>nodes.get(id)||null,createElement:()=>new Element(),querySelector:selector=>selector==='header'?header:null,querySelectorAll:()=>[],addEventListener(){}},location:{pathname:'/'+(page==='menu'?'index':page)+'.html',search:options.search ?? '?table=12'},firebaseDatabase:remote?db:null,firebaseConfigured:remote});
 context.window=context;context.addEventListener=(name,fn)=>(events[name] ||= []).push(fn);context.dispatchEvent=event=>{for(const fn of events[event.type]||[])fn(event);};
 for(const file of ['common',page])vm.runInContext(fs.readFileSync('js/'+file+'.js','utf8'),context,{filename:file+'.js'});
 return {context,nodes,remoteStore,run:code=>vm.runInContext(code,context),state:()=>remote?remoteStore.state:{orders:JSON.parse(localStorage.getItem('cafe_ward_orders')||'[]'),tables:Object.fromEntries(Array.from({length:20},(_,i)=>[i+1,JSON.parse(localStorage.getItem('cafe_ward_table_'+(i+1))||'null')])),accounting:{sales:JSON.parse(localStorage.getItem('cafe_ward_sales')||'[]')}},setReject:()=>reject=true};
}
async function workflow(remote){
 const t=create('pos',remote),run=t.run;
 const order=await run("submitOrder('12',[{id:1,qty:2}])");
 assert.equal(order.total,80);assert.equal(Object.values(t.state().accounting.sales).length,0);
 await assert.rejects(()=>run("releaseTable('12')"));
 await assert.rejects(()=>run("collectTablePayment('12',100,'cash')"));
 await run("moveTable('12','18')");assert.equal(Object.values(t.state().orders)[0].table,'18');assert.ok(!t.state().tables['12']);
 const second=await run("submitOrder('18',[{id:2,qty:1}])");
 run("sessionStorage.setItem('ward-client-id','another-client')");
 await assert.rejects(()=>run("submitOrder('18',[{id:1,qty:1}])"));
 await run("submitOrder('5',[{id:1,qty:1}])");
 await assert.rejects(()=>run("moveTable('18','5')"));
 for(const item of [order,second]){
   t.context.orderId=item.id;
   await assert.rejects(()=>run("transitionOrder(orderId,'جاهز','تم التوصيل')"));
   await run("transitionOrder(orderId,'قيد التحضير','جاهز')");
   await run("transitionOrder(orderId,'جاهز','تم التوصيل')");
 }
 await assert.rejects(()=>run("collectTablePayment('18',139,'cash')"));
 assert.equal(Object.values(t.state().accounting.sales).length,0);
 const receipt=await run("collectTablePayment('18',150,'cash')");assert.equal(receipt.total,140);assert.equal(receipt.change,10);
 assert.ok(!t.state().tables['18'],'Payment must free the table in the same commit');
 assert.equal(Object.values(t.state().accounting.sales).length,2);
 await assert.rejects(()=>run("collectTablePayment('18',150,'cash')"));assert.equal(Object.values(t.state().accounting.sales).length,2);
 await run("releaseTable('18')");assert.ok(!t.state().tables['18']);
 if(remote){const before=JSON.stringify(t.state());t.setReject();await assert.rejects(()=>run("moveTable('5','6')"));assert.equal(JSON.stringify(t.state()),before);}
 else {run("localStorage.setItem('cafe_ward_day_closed','true')");const id=Object.values(t.state().orders).find(o=>o.table==='5').id;t.context.orderId=id;await run("transitionOrder(orderId,'قيد التحضير','جاهز')");await run("transitionOrder(orderId,'جاهز','تم التوصيل')");await assert.rejects(()=>run("collectTablePayment('5',40,'cash')"));}
 console.log('PASS',remote?'Firebase transaction mock':'local storage','order → move → prepare → deliver → payment → release; invalid states and duplicate payment');
}
async function posInterface() {
 const t=create('pos');t.context.dispatchEvent(new Event('DOMContentLoaded'));
 const order=await t.run("submitOrder('12',[{id:1,qty:2}])");t.context.orderId=order.id;
 await t.run("transitionOrder(orderId,'قيد التحضير','جاهز')");
 await t.run("transitionOrder(orderId,'جاهز','تم التوصيل')");
 const amount=value=>{t.nodes.get('pos-received').value=String(value);t.run('updatePosChange()');};
 t.run("selectPosTable('12')");amount(80);
 assert.match(t.nodes.get('pos-items').innerHTML,/سعر الوحدة: 40.00/);
 assert.match(t.nodes.get('pos-items').innerHTML,new RegExp(order.id));
 assert.match(t.nodes.get('pos-items').innerHTML,/الكمية: 2/);
 assert.match(t.nodes.get('pos-items').innerHTML,/حالة الطلب: تم التوصيل/);
 assert.equal(t.nodes.get('pos-change').textContent,'0.00 ليرة');
 amount(100);assert.equal(t.nodes.get('pos-change').textContent,'20.00 ليرة');
 amount(50);
 await t.run('paySelectedTable()');assert.equal(t.state().accounting.sales.length,0);
 assert.match(t.nodes.get('pos-feedback').textContent,/أقل من إجمالي/);
 t.run("setPosMethod('card')");assert.equal(t.nodes.get('pos-received').disabled,true);
 t.run("setPosMethod('cash')");amount(100);
 let releaseSave, attempts=0;
 t.context.navigator.locks.request=async(name,change)=>{attempts++;await new Promise(resolve=>{releaseSave=resolve;});return change();};
 const pending=t.run("handlePosShortcut({key:'F9',preventDefault(){}})");
 assert.equal(t.run('paymentBusy'),true);
 for(const id of ['pos-pay','pos-method','pos-received'])assert.equal(t.nodes.get(id).disabled,true,id);
 assert.equal(t.nodes.get('pos-payment').getAttribute('aria-busy'),'true');
 assert.ok(t.nodes.get('pos-tables').children.every(button=>button.disabled));
 await t.run('paySelectedTable()');
 t.run("selectPosTable('5');setPosMethod('card')");
 assert.equal(t.run('selectedTable'),'12');assert.equal(t.nodes.get('pos-method').value,'cash');
 assert.equal(attempts,1);assert.equal(t.state().accounting.sales.length,0);
 assert.doesNotMatch(t.nodes.get('pos-feedback').textContent,/تم الدفع/);
 releaseSave();await pending;
 assert.equal(t.state().accounting.sales.length,1);
 assert.match(t.nodes.get('pos-feedback').textContent,/تم الدفع.*80.00.*20.00.*نقداً/);
 assert.equal(t.state().tables['12'],null);
 assert.equal(t.nodes.get('pos-tables').children.length,0);
 assert.match(t.nodes.get('pos-title').textContent,/فاتورة مدفوعة/);
 assert.equal(t.nodes.get('pos-payment').hidden,true);
 assert.equal(t.run('paymentBusy'),false);
 await t.run('paySelectedTable()');assert.equal(attempts,1);
 t.context.navigator.locks.request=async(name,change)=>change();
 const second=await t.run("submitOrder('5',[{id:1,qty:1}])");t.context.orderId=second.id;
 await t.run("transitionOrder(orderId,'قيد التحضير','جاهز')");await t.run("transitionOrder(orderId,'جاهز','تم التوصيل')");
 t.run("selectPosTable('5');setPosMethod('card')");
 assert.equal(t.nodes.get('pos-payment').hidden,false);
 assert.doesNotMatch(t.nodes.get('pos-feedback').textContent,/تم الدفع/);
 t.run("handlePosShortcut({key:'F12',preventDefault(){throw Error('F12 must remain native')}})");
 assert.equal(t.state().accounting.sales.length,1);
 t.context.navigator.locks.request=async()=>{throw Error('حفظ غير متاح');};
 await t.run('paySelectedTable()');
 assert.doesNotMatch(t.nodes.get('pos-feedback').textContent,/تم الدفع/);assert.equal(t.state().accounting.sales.length,1);
 assert.ok(t.state().tables['5']);
 assert.equal(t.nodes.get('pos-pay').disabled,false);assert.equal(t.run('paymentBusy'),false);
 assert.match(t.nodes.get('pos-feedback').textContent,/حفظ غير متاح/);
 t.context.navigator.locks.request=async(name,change)=>change();
 await t.run('paySelectedTable()');
 assert.equal(t.state().accounting.sales.length,2);
 assert.match(t.nodes.get('pos-feedback').textContent,/40.00.*0.00.*بطاقة/);
 assert.equal(t.state().tables['5'],null);
 console.log('PASS POS current select/input UI, order details, F9, cash/card, save locking, receipt and retry after failure');
}
async function posAtomicAndLegacy() {
 const t=create('pos',true);t.context.dispatchEvent(new Event('DOMContentLoaded'));
 // Legacy storage keys differ from logical IDs; another order has no id at all.
 t.state().orders={legacyKey:{table:'12',status:'تم التوصيل',total:40,items:[{name:'لاتيه',qty:1,price:40}]},otherKey:{id:'logical-2',table:'12',status:'تم التوصيل',total:60,items:[{name:'كيك',qty:2,price:30}]}};
 t.state().tables={'12':{status:'occupied',table:'12'}};
 // Read the current snapshot using the same public subscription as the page.
 t.run('ordersRealtimeStarted=false;startOrdersRealtime();selectPosTable("12")');
 assert.match(t.nodes.get('pos-items').innerHTML,/legacyKey/);assert.match(t.nodes.get('pos-items').innerHTML,/logical-2/);
 assert.match(t.nodes.get('pos-items').innerHTML,/سعر الوحدة: 30.00/);
 const before=JSON.stringify(t.state());
 const failing=create('pos',true,{remoteStore:t.remoteStore});failing.context.dispatchEvent(new Event('DOMContentLoaded'));
 failing.run('selectPosTable("12")');failing.nodes.get('pos-received').value='100';failing.setReject();
 await failing.run('paySelectedTable()');
 assert.equal(JSON.stringify(t.state()),before);assert.match(failing.nodes.get('pos-feedback').textContent,/لم يتم تأكيد الدفع/);
 assert.doesNotMatch(failing.nodes.get('pos-feedback').textContent,/تم الدفع وتسجيل/);
 assert.equal(failing.run('selectedTable'),'12');assert.ok(t.state().tables['12']);
 const second=create('pos',true,{remoteStore:t.remoteStore});second.context.dispatchEvent(new Event('DOMContentLoaded'));
 const results=await Promise.allSettled([t.run("collectTablePayment('12',100,'cash')"),second.run("collectTablePayment('12',100,'cash')")]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(Object.keys(t.state().accounting.sales).length,2);assert.ok(!t.state().tables['12']);
 assert.equal(t.state().orders.legacyKey.id,undefined,'No legacy ID migration');
 assert.equal(t.state().orders.otherKey.id,'logical-2');
 for(const key of ['legacyKey','otherKey']) {assert.equal(t.state().orders[key].paymentStatus,'مدفوع');assert.equal(t.state().orders[key].paymentMethod,'cash');assert.ok(t.state().orders[key].paidAt);}
 assert.equal(t.state().accounting.sales.legacyKey.orderId,'legacyKey');assert.equal(t.state().accounting.sales['logical-2'].total,60);
 assert.equal(t.run("payableOrders('12').length"),0);
 // Verify legacy explicit firebaseKey in local storage as well.
 const local=create('pos');local.context.localStorage.setItem('cafe_ward_orders',JSON.stringify([{firebaseKey:'old-key',table:'3',status:'تم التوصيل',total:50,items:[]}]));
 local.run("setLocalTableStatus('3',{table:'3',status:'occupied'})");
 const saved=local.context.localStorage.setItem;let failed=false;
 local.context.localStorage.setItem=(key,value)=>{if(key==='cafe_ward_sales'&&!failed){failed=true;throw Error('Storage full');}saved(key,value);};
 await assert.rejects(()=>local.run("collectTablePayment('3',50,'cash')"));
 assert.notEqual(local.state().orders[0].paymentStatus,'مدفوع');assert.ok(local.state().tables['3']);assert.equal(local.state().accounting.sales.length,0);
 local.context.localStorage.setItem=saved;
 await local.run("collectTablePayment('3',0,'card')");
 assert.equal(local.state().accounting.sales[0].orderId,'old-key');assert.equal(local.state().accounting.sales[0].paymentMethod,'card');assert.equal(local.state().tables['3'],null);
 // A new order arriving after the cashier reviewed the bill must not be charged silently.
 const stale=create('pos');const order=await stale.run("submitOrder('4',[{id:1,qty:1}])");stale.context.orderId=order.id;
 await stale.run("transitionOrder(orderId,'قيد التحضير','جاهز')");await stale.run("transitionOrder(orderId,'جاهز','تم التوصيل')");
 stale.run("selectPosTable('4')");stale.nodes.get('pos-received').value='100';
 let commit;stale.context.navigator.locks.request=async(name,change)=>{await new Promise(resolve=>{commit=resolve;});return change();};
 const pending=stale.run('paySelectedTable()');
 stale.run("localStorage.setItem('cafe_ward_orders',JSON.stringify([...readLocalOrders(),{id:'new-order',table:'4',status:'تم التوصيل',total:40,items:[]}]))");
 commit();await pending;
 assert.equal(stale.state().accounting.sales.length,0);assert.ok(stale.state().tables['4']);assert.match(stale.nodes.get('pos-feedback').textContent,/تغيّرت طلبات/);
 // Every literal element dependency must exist in the current POS, not a retired design.
 const html=fs.readFileSync('pos.html','utf8'),source=fs.readFileSync('js/pos.js','utf8');
 for(const match of source.matchAll(/getElementById\('([^']+)'\)/g))assert.ok(html.includes('id="'+match[1]+'"'),match[1]);
 console.log('PASS POS legacy keys, missing IDs, concurrent cashiers, atomic Firebase rejection/local rollback, changed invoice and DOM contract');
}
async function menuInterface() {
 for(const value of ['1','12','20']) {
   const t=create('menu',false,{search:'?table='+value});t.context.dispatchEvent(new Event('DOMContentLoaded'));
   assert.equal(t.run('tableNumber'),value);assert.equal(t.nodes.get('table-picker').hidden,true);
   assert.equal(t.nodes.get('table-badge').textContent,'طاولتك رقم '+value);
   t.run('setTablePicker(true)');assert.equal(t.nodes.get('table-picker').hidden,false);
 }
 for(const value of ['0','21','-1','1.5','abc','12x','']) {
   const t=create('menu',false,{search:'?table='+value});t.context.dispatchEvent(new Event('DOMContentLoaded'));
   assert.equal(t.run('tableNumber'),'1');assert.equal(t.nodes.get('table-picker').hidden,false);
   assert.match(t.nodes.get('table-error').textContent,/غير صالح/);
 }
 const t=create('menu',false,{search:''});t.context.dispatchEvent(new Event('DOMContentLoaded'));
 assert.equal(t.nodes.get('table-picker').hidden,false);
 t.run("changeTable('7')");assert.equal(t.run('tableNumber'),'7');
 t.run("changeTable('21')");assert.equal(t.run('tableNumber'),'7');
 t.run("openCategory('hot');addToCart(1);addToCart(1)");assert.equal(t.nodes.get('cart-count').innerText,2);
 t.run('changeQty(1,-1)');assert.equal(t.run('cart[0].qty'),1);
 t.run('removeCartItem(1)');assert.equal(t.run('cart.length'),0);
 t.run('addToCart(1);addToCart(2);clearCart()');assert.equal(t.nodes.get('cart-count').innerText,0);
 t.run("saveMenu([{id:'sold',name:'غير متوفر',category:'hot',price:40,available:false}]);addToCart('sold')");
 assert.equal(t.run('cart.length'),0);
 assert.match(t.run("productMarkup(getMenu()[0])"),/disabled>غير متوفر/);
 await assert.rejects(()=>t.run("submitOrder('7',[{id:'sold',qty:1}])"));
 const remote=create('menu',true);remote.state().menu={sold:{name:'غير متوفر',price:40,available:false}};
 await assert.rejects(()=>remote.run("submitOrder('7',[{id:'sold',qty:1}])"));assert.equal(Object.keys(remote.state().orders).length,0);
 t.run("localStorage.removeItem('cafe_ward_menu');addToCart(1);setCartOpen(true)");
 let releaseSave, attempts=0;
 t.context.navigator.locks.request=async(name,change)=>{attempts++;await new Promise(resolve=>{releaseSave=resolve;});return change();};
 const pending=t.run('checkout()');
 assert.equal(t.nodes.get('checkout-submit').disabled,true);assert.match(t.nodes.get('checkout-submit').textContent,/جاري إرسال/);
 await t.run('checkout()');t.run("clearCart();addToCart(2);changeTable('8')");
 assert.equal(t.run('tableNumber'),'7');assert.equal(t.run('cart.length'),1);assert.equal(attempts,1);
 assert.equal(t.state().orders.length,0);assert.doesNotMatch(t.nodes.get('menu-feedback').textContent,/تم استلام طلبك/);
 releaseSave();await pending;
 assert.equal(t.state().orders.length,1);assert.equal(t.run('cart.length'),0);assert.equal(t.nodes.get('cart-modal').hidden,true);
 assert.match(t.nodes.get('menu-feedback').textContent,/تم استلام طلبك بنجاح/);
 const order=t.state().orders[0];assert.ok(t.run('customerOrderIds()').includes(order.id));
 const refreshed=create('menu',false,{search:'?table=7',localStorage:t.context.localStorage,sessionStorage:t.context.sessionStorage});
 refreshed.context.dispatchEvent(new Event('DOMContentLoaded'));
 assert.match(refreshed.nodes.get('customer-orders').innerHTML,new RegExp(order.id));
 await refreshed.run("moveTable('7','18')");assert.equal(refreshed.run('tableNumber'),'18');
 const moved=create('menu',false,{search:'?table=7',localStorage:t.context.localStorage,sessionStorage:t.context.sessionStorage});
 moved.context.dispatchEvent(new Event('DOMContentLoaded'));
 assert.equal(moved.run('tableNumber'),'18');assert.match(moved.nodes.get('customer-orders').innerHTML,new RegExp(order.id));
 moved.run('addToCart(2);setCartOpen(true)');moved.context.navigator.locks.request=async()=>{throw Error('فشل الحفظ');};
 await moved.run('checkout()');assert.equal(moved.run('cart.length'),1);assert.equal(moved.nodes.get('checkout-submit').disabled,false);
 assert.equal(moved.nodes.get('cart-modal').hidden,false);assert.match(moved.nodes.get('checkout-error').textContent,/فشل الحفظ/);
 assert.equal(moved.state().orders.length,1);
 const evil=t.run(`productMarkup({id:'x" onclick="bad()',name:'<img src=x onerror=bad()>',desc:'<script>bad()</script>',img:'javascript:bad()',price:40})`);
 assert.doesNotMatch(evil,/<script>|<img src=x|src="javascript:|data-id="x" onclick=/);
 assert.match(evil,/src="q.png"/);
 const html=fs.readFileSync('index.html','utf8');assert.match(html,/<html lang="ar" dir="rtl">/);assert.doesNotMatch(html,/\son\w+=|<script>/);
 console.log('PASS menu QR validation, cart actions, unavailable products, safe rendering, single submission, save failure, refresh and moved-session tracking');
}
async function waiterInterface() {
 const t=create('waiter');t.context.dispatchEvent(new Event('DOMContentLoaded'));
 const one=await t.run("submitOrder('12',[{id:1,qty:1}])");
 const two=await t.run("submitOrder('12',[{id:2,qty:1}])");
 t.context.orderId=two.id;await t.run("transitionOrder(orderId,'قيد التحضير','جاهز')");
 const markup=t.nodes.get('orders-container').innerHTML;
 assert.ok(markup.indexOf('waiter-ready')<markup.indexOf('waiter-preparing'));
 assert.match(markup,/جاهز للتوصيل/);assert.ok(markup.includes(two.id));
 assert.equal(t.run("waiterTableSummary('12').count"),2);
 assert.equal(t.run("waiterTableSummary('12').total"),100);
 t.context.now=Date.now();t.run("setLocalTableStatus('12',{status:'occupied',table:'12',reservedAt:now-75*60000})");
 assert.equal(t.run("waiterTableSummary('12',now).duration"),'1 ساعة و15 دقيقة');
 assert.equal(t.run("waiterTableSummary('20').duration"),'غير متاحة');
 t.run("setLocalTableStatus('5',{status:'occupied',table:'5'})");
 // Even an order lacking a table reservation must exclude that target.
 t.run("localStorage.setItem('cafe_ward_orders',JSON.stringify([...readLocalOrders(),{id:'orphan',table:'6',total:5,status:'تم التوصيل',items:[]}]))");
 t.run("openMoveTableModal('12')");assert.equal(t.nodes.get('move-table-modal').hidden,false);
 for(const table of ['12','5','6'])assert.ok(!t.run("availableMoveTables('12')").includes(table));
 t.nodes.get('move-table-target').value='18';
 t.run("setLocalTableStatus('18',{status:'occupied',table:'18'})");
 await t.run('submitTableMove()');assert.match(t.nodes.get('move-table-error').textContent,/لم تعد متاحة/);
 assert.equal(t.state().orders.find(order=>order.id===one.id).table,'12');
 t.run("clearLocalTableStatus('18');refreshMoveOptions()");t.nodes.get('move-table-target').value='18';
 const before=t.state().orders.filter(order=>order.table==='12');
 let releaseSave,attempts=0;
 t.context.navigator.locks.request=async(name,change)=>{attempts++;await new Promise(resolve=>{releaseSave=resolve;});return change();};
 const pending=t.run('submitTableMove()');
 assert.equal(t.nodes.get('move-table-submit').disabled,true);
 await t.run('submitTableMove()');t.run('closeMoveTableModal()');
 assert.equal(t.nodes.get('move-table-modal').hidden,false);assert.equal(attempts,1);
 releaseSave();await pending;
 assert.equal(t.nodes.get('move-table-modal').hidden,true);
 const after=t.state().orders.filter(order=>order.table==='18');
 assert.deepEqual(after.map(order=>order.id).sort(),before.map(order=>order.id).sort());
 assert.deepEqual(after.map(order=>order.items),before.map(order=>order.items));
 assert.equal(after.reduce((sum,order)=>sum+order.total,0),100);
 let confirmations=0;t.context.confirm=()=>{confirmations++;return true;};
 await t.run("releaseTableAndRefresh('18')");assert.equal(confirmations,0);assert.ok(t.state().tables['18']);
 t.context.navigator.locks.request=async(name,change)=>change();
 // A paid reservation may be released, but cancellation must retain it.
 t.run("setLocalTableStatus('10',{status:'occupied',table:'10'})");
 t.context.confirm=message=>{assert.match(message,/تأكيد تفريغ الطاولة 10/);return false;};
 await t.run("releaseTableAndRefresh('10')");assert.ok(t.state().tables['10']);
 t.context.confirm=()=>true;await t.run("releaseTableAndRefresh('10')");assert.equal(t.state().tables['10'],null);
 // No vacancy: disable submit and show a useful message.
 for(let table=1;table<=20;table++)t.run(`setLocalTableStatus('${table}',{status:'occupied',table:'${table}'})`);
 t.run("openMoveTableModal('18')");assert.equal(t.nodes.get('move-table-empty').hidden,false);assert.equal(t.nodes.get('move-table-submit').disabled,true);
 assert.doesNotMatch(fs.readFileSync('js/waiter.js','utf8'),/\bprompt\s*\(/);
 console.log('PASS waiter ready-first groups, table summaries/duration, available-only modal, transfer preservation, race rejection and confirmed unpaid-safe release');
}
(async()=>{
 for(const remote of [false,true])await workflow(remote);
 await posInterface();
 await posAtomicAndLegacy();
 await menuInterface();
 await waiterInterface();
 const accounting=create('accounting');
 const now=Date.now();
 const accountingOrders=[
   {id:'paid',table:'1',status:'تم التوصيل',paymentStatus:'مدفوع',total:80,paidAt:now,items:[]},
   {id:'delivered',table:'2',status:'تم التوصيل',paymentStatus:'غير مدفوع',total:120,items:[]},
   {id:'preparing',table:'3',status:'قيد التحضير',paymentStatus:'غير مدفوع',total:200,items:[]},
   {id:'ready',table:'4',status:'جاهز',paymentStatus:'غير مدفوع',total:300,items:[]}
 ];
 accounting.context.localStorage.setItem('cafe_ward_orders',JSON.stringify(accountingOrders));
 accounting.context.localStorage.setItem('cafe_ward_sales',JSON.stringify([{id:'paid',orderId:'paid',total:80,paidAt:now}]));
 accounting.context.localStorage.setItem('cafe_ward_day_closed','true');
 accounting.run('renderAccountingDashboard()');
 assert.match(accounting.nodes.get('tasks-container').innerHTML,/فواتير بانتظار الدفع/);
 assert.match(accounting.nodes.get('tasks-container').innerHTML,/1 طلبات تم توصيلها/);
 assert.equal(accounting.nodes.get('tasks-count').innerText,'1 مهمة');
 for(const id of ['dashboard-sales','rep-sales','rep-netprofit','expected-balance-val'])assert.equal(accounting.nodes.get(id).innerText,'80 ليرة');
 assert.match(accounting.nodes.get('restaurant-orders-list').innerHTML,/بانتظار الدفع/);
 assert.match(accounting.nodes.get('restaurant-orders-list').innerHTML,/href="pos.html"/);
 for(const id of ['restaurant-orders-list','cashier-tables-list']) {
   assert.doesNotMatch(accounting.nodes.get(id).innerHTML,/<button\b|onclick\s*=/);
 }
 // Only unpaid preparation/ready orders remain: no payment task and no extra sales.
 accounting.context.localStorage.setItem('cafe_ward_orders',JSON.stringify(accountingOrders.filter(order=>order.id!=='delivered')));
 accounting.run('renderAccountingDashboard()');
 assert.doesNotMatch(accounting.nodes.get('tasks-container').innerHTML,/فواتير بانتظار الدفع/);
 assert.equal(accounting.nodes.get('tasks-count').innerText,'0 مهام');
 assert.equal(accounting.nodes.get('rep-sales').innerText,'80 ليرة');
 console.log('PASS accounting delivered-unpaid task, paid-only reports and POS-only collection');
 for(const page of ['menu','waiter','kitchen','admin','accounting','pos']) {
   const t=create(page);t.context.dispatchEvent(new Event('DOMContentLoaded'));
   console.log('PASS page startup',page);
 }
 const customer=create('menu');customer.context.dispatchEvent(new Event('DOMContentLoaded'));
 const order=await customer.run("submitOrder('12',[{id:1,qty:1}])");customer.context.orderId=order.id;
 assert.match(customer.nodes.get('customer-orders').innerHTML,/طلبك قيد التحضير/);
 await customer.run("transitionOrder(orderId,'قيد التحضير','جاهز')");assert.match(customer.nodes.get('customer-orders').innerHTML,/طلبك في طريقه إلى الطاولة/);
 await customer.run("moveTable('12','19')");assert.equal(customer.run('tableNumber'),'19');
 assert.equal(customer.run("JSON.parse(sessionStorage.getItem('ward-ready-seen')).length"),1);
 customer.run("sessionStorage.setItem('ward-client-id','different-guest');renderCustomerOrders()");assert.equal(customer.nodes.get('customer-orders').innerHTML,'');
 console.log('PASS customer messages, moved table, notification deduplication and guest isolation');
 const waiter=create('waiter');
 const waiterOrder=await waiter.run("submitOrder('12',[{id:1,qty:1}])");
 const markup=waiter.nodes.get('waiter-tables-container').innerHTML;
 assert.match(markup,/onclick='releaseTableAndRefresh\("12"\)'/);
 for(const match of markup.matchAll(/onclick='([^']+)'/g))new vm.Script(match[1]);
 const kitchen=create('kitchen');
 const kitchenOrder=await kitchen.run("submitOrder('12',[{id:1,qty:1}])");
 const kitchenMarkup=kitchen.nodes.get('kitchen-orders-container').innerHTML;
 assert.ok(kitchenMarkup.includes(kitchenOrder.id));
 for(const match of kitchenMarkup.matchAll(/onclick='([^']+)'/g))new vm.Script(match[1]);
 console.log('PASS rendered waiter release/move and kitchen UUID handlers');
 for(const page of ['index','waiter','kitchen','admin','accounting','pos']) {
   const html=fs.readFileSync(page+'.html','utf8');
   for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g))if(!/^https?:/.test(match[1]))assert.ok(fs.existsSync(match[1]),page+': '+match[1]);
 }
 console.log('PASS local page asset links');
})().catch(error=>{console.error(error);process.exitCode=1;});
