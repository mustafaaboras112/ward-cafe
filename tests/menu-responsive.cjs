// Isolated layout test: serves real menu assets but replaces Firebase with local fixtures.
const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
const widths=[320,360,375,390,430,768,1280];
const fixture=`const firebaseDatabase=null;const firebaseConfigured=false;
sessionStorage.setItem('ward-client-id','layout-test');
localStorage.setItem('cafe_ward_menu',JSON.stringify(Array.from({length:14},(_,i)=>({id:String(i+1),name:i===0?'اسم صنف طويل جداً لاختبار التفاف النص على الهاتف بدون تجاوز حدود البطاقة':'قهوة ورد '+i,desc:'وصف طويل لتفاصيل المنتج ومكوناته مع الحفاظ على تناسق البطاقة',category:'hot',price:40+i,img:'q.png',available:i!==13}))));
localStorage.setItem('cafe_ward_orders','[]');`;
const checks=`
async function runLayoutTests(){
 const failures=[];const results=[];
 const assert=(condition,message)=>{if(!condition)failures.push(message);};
 for(const width of ${JSON.stringify(widths)}) {
  const frame=document.createElement('iframe');frame.style.width=width+'px';frame.style.height='900px';frame.style.border='0';
  const loaded=new Promise(resolve=>frame.onload=resolve);frame.src='/fixture?table=12';document.body.appendChild(frame);await loaded;
  const w=frame.contentWindow,d=frame.contentDocument;
  await new Promise(resolve=>setTimeout(resolve,1400));
  const fit=label=>assert(d.documentElement.scrollWidth<=d.documentElement.clientWidth,width+' '+label+' horizontal overflow '+d.documentElement.scrollWidth);
  const touch=selector=>d.querySelectorAll(selector).forEach(el=>{const r=el.getBoundingClientRect();if(r.width&&r.height)assert(r.width>=43&&r.height>=43,width+' small touch target '+selector);});
  assert(w.getComputedStyle(d.documentElement).direction==='rtl',width+' RTL');fit('categories');touch('.category-box,#open-cart,#change-table');
  assert(d.getElementById('table-picker').hidden,width+' QR picker');
  if(width<=768)assert(d.querySelector('.hero-no-header').getBoundingClientRect().height<320,width+' hero too tall');
  d.getElementById('change-table').click();fit('table picker');touch('#table-selector');
  d.getElementById('table-selector').value='8';d.getElementById('table-selector').dispatchEvent(new w.Event('change'));
  assert(d.getElementById('table-badge').textContent==='طاولتك رقم 8',width+' table selector event');
  d.getElementById('category-hot').click();await new Promise(resolve=>setTimeout(resolve,50));fit('products');touch('.add-btn');
  d.querySelector('.add-btn:not(:disabled)').click();assert(d.getElementById('cart-count').textContent==='1',width+' add action');
  touch('.quantity-controls button');
  for(let id=2;id<=12;id++)w.addToCart(String(id));
  d.getElementById('open-cart').click();await new Promise(resolve=>setTimeout(resolve,50));fit('cart');
  touch('#close-cart,#clear-cart,#checkout-submit,.quantity-controls button');
  const submit=d.getElementById('checkout-submit').getBoundingClientRect();assert(submit.bottom<=900 && submit.top>=0,width+' checkout outside viewport');
  const items=d.getElementById('cart-items');assert(items.scrollHeight>items.clientHeight,width+' long cart not scrollable');
  items.scrollTop=items.scrollHeight;assert(d.getElementById('checkout-submit').getBoundingClientRect().bottom<=900,width+' footer not visible after scroll');
  w.setCartOpen(false);
  w.localStorage.setItem('cafe_ward_orders',JSON.stringify([{id:'a-very-long-order-id-'.repeat(8),clientId:'layout-test',table:'12',status:'جاهز',items:[],total:40,createdAt:Date.now()}]));
  w.renderCustomerOrders();fit('tracking');
  d.querySelector('.customer-ready-overlay')?.remove();
  results.push(width);frame.remove();
 }
 document.body.textContent=failures.length?'FAIL '+failures.join(' | '):'PASS menu layout '+results.join(', ')+'px; RTL, touch targets, product/cart/tracking overflow and pinned checkout';
 document.title=failures.length?'FAIL':'PASS';
}
runLayoutTests().catch(error=>{document.body.textContent='FAIL '+error.stack;});`;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><title>RUNNING</title></head><body><script src="/layout-checks.js"></script></body></html>');return;}
 if(url.pathname==='/layout-checks.js'){res.setHeader('Content-Type','text/javascript');res.end(checks);return;}
 if(url.pathname==='/fixture-config.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
 if(url.pathname==='/fixture') {
   let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
   html=html.replace(/<script src="https:[^"]+"><\/script>/g,'').replace(/<link[^>]+href="https:[^>]+>/g,'').replace('src="firebase-config.js"','src="fixture-config.js"');
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'text/plain');res.end(fs.readFileSync(file));
});
server.listen(0,'127.0.0.1',()=>{
 const browser=process.env.WARD_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file=>fs.existsSync(file));
 if(!browser){console.error('No local Chromium executable; set WARD_TEST_BROWSER.');server.close();process.exitCode=1;return;}
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ward-layout-'));
 const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--disable-sync','--disable-features=OptimizationHints','--user-data-dir='+profile,'--dump-dom','--virtual-time-budget=22000','http://127.0.0.1:'+server.address().port],{windowsHide:true});
 let output='',errors='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>errors+=data);
 const timeout=setTimeout(()=>{child.kill();},55000);
 child.on('error',error=>{console.error(error.message);process.exitCode=1;server.close();clearTimeout(timeout);});
 child.on('close',()=>{clearTimeout(timeout);server.close();const result=output.match(/<body>(PASS[^<]*|FAIL[^<]*)<\/body>/);if(result){console.log(result[1]);if(result[1].startsWith('FAIL'))process.exitCode=1;}else{console.error('Layout check did not finish.',output.slice(-1500),errors.slice(-700));process.exitCode=1;}});
});
