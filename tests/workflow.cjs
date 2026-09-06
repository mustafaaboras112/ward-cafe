const fs=require('fs'), vm=require('vm'), assert=require('node:assert/strict'), {webcrypto}=require('crypto');
function storage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
class Element {
 constructor(){this.style={};this.children=[];this.options=[];this.value='';this.classList={add(){},remove(){}};this._html='';}
 set innerHTML(value){this._html=value;} get innerHTML(){return this._html || String(this.textContent||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
 appendChild(el){this.children.push(el);el.parentNode=this;return el;} append(el){return this.appendChild(el);} remove(){} setAttribute(k,v){this[k]=v;} getAttribute(k){return this[k]??null;} addEventListener(){} querySelector(){return new Element();} querySelectorAll(){return [];} replaceChildren(){this.children=[];} reset(){} focus(){}
}
function create(page='pos', remote=false){
 const events={},nodes=new Map(), html=fs.readFileSync((page==='menu'?'index':page)+'.html','utf8');
 for(const match of html.matchAll(/id="([^"]+)"/g))nodes.set(match[1],new Element());
 if(nodes.has('table-selector'))nodes.get('table-selector').options=Array.from({length:20},(_,i)=>({value:String(i+1)}));
 if(nodes.has('pos-method'))nodes.get('pos-method').value='cash';
 const localStorage=storage(), sessionStorage=storage();sessionStorage.setItem('isLoggedIn','true');
 const header=html.includes('<header>')?new Element():null;
 let state={orders:{},tables:{},accounting:{sales:{}}},reject=false;
 const snapshot=path=>{const value=path?state[path]:state;return {val:()=>structuredClone(value),exists:()=>!!value};};
 const db={ref:(path='')=>({once:async()=>snapshot(path),on:()=>{},transaction:async change=>{
   if(reject)throw Error('PERMISSION_DENIED');
   const next=change(structuredClone(state));if(next===undefined)return {committed:false};state=next;return {committed:true};
 }})};
 const context=vm.createContext({console:{log(){},warn(){},error(){}},crypto:webcrypto,localStorage,sessionStorage,URLSearchParams,Intl,Date,Math,Map,Set,JSON,Event,Number,Promise,navigator:{locks:{request:async(_,fn)=>fn()}},setTimeout:()=>0,setInterval:()=>0,alert(){},confirm:()=>true,prompt:()=>null,
  document:{body:new Element(),getElementById:id=>nodes.get(id)||null,createElement:()=>new Element(),querySelector:selector=>selector==='header'?header:null,querySelectorAll:()=>[],addEventListener(){}},location:{pathname:'/'+(page==='menu'?'index':page)+'.html',search:'?table=12'},firebaseDatabase:remote?db:null,firebaseConfigured:remote});
 context.window=context;context.addEventListener=(name,fn)=>(events[name] ||= []).push(fn);context.dispatchEvent=event=>{for(const fn of events[event.type]||[])fn(event);};
 for(const file of ['common',page])vm.runInContext(fs.readFileSync('js/'+file+'.js','utf8'),context,{filename:file+'.js'});
 return {context,nodes,run:code=>vm.runInContext(code,context),state:()=>remote?state:{orders:JSON.parse(localStorage.getItem('cafe_ward_orders')||'[]'),tables:Object.fromEntries(Array.from({length:20},(_,i)=>[i+1,JSON.parse(localStorage.getItem('cafe_ward_table_'+(i+1))||'null')])),accounting:{sales:JSON.parse(localStorage.getItem('cafe_ward_sales')||'[]')}},setReject:()=>reject=true};
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
 assert.equal(Object.values(t.state().accounting.sales).length,2);
 await assert.rejects(()=>run("collectTablePayment('18',150,'cash')"));assert.equal(Object.values(t.state().accounting.sales).length,2);
 await run("releaseTable('18')");assert.ok(!t.state().tables['18']);
 if(remote){const before=JSON.stringify(t.state());t.setReject();await assert.rejects(()=>run("moveTable('5','6')"));assert.equal(JSON.stringify(t.state()),before);}
 else {run("localStorage.setItem('cafe_ward_day_closed','true')");const id=Object.values(t.state().orders).find(o=>o.table==='5').id;t.context.orderId=id;await run("transitionOrder(orderId,'قيد التحضير','جاهز')");await run("transitionOrder(orderId,'جاهز','تم التوصيل')");await assert.rejects(()=>run("collectTablePayment('5',40,'cash')"));}
 console.log('PASS',remote?'Firebase transaction mock':'local storage','order → move → prepare → deliver → payment → release; invalid states and duplicate payment');
}
(async()=>{
 for(const remote of [false,true])await workflow(remote);
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
