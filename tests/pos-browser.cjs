// Real DOM test on a fresh local origin. Firebase SDK/config are never loaded.
const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
const fixture="const firebaseConfigured=false;const firebaseDatabase=null;sessionStorage.setItem('isLoggedIn','true');localStorage.clear();";
const checks=`
async function run(){
 const assert=(ok,message)=>{if(!ok)throw Error(message);};
 const until=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI update timed out');};
 for(const width of [360,768,1280]){
  const frame=document.createElement('iframe');frame.style.cssText='border:0;width:'+width+'px;height:900px';
  const loaded=new Promise(resolve=>frame.onload=resolve);frame.src='/fixture';document.body.appendChild(frame);await loaded;
  const w=frame.contentWindow,d=frame.contentDocument;let error;
  w.addEventListener('error',event=>{error=event.message;});
  const first=await w.submitOrder('12',[{id:1,qty:2}]);const second=await w.submitOrder('12',[{id:2,qty:1}]);
  assert(d.querySelectorAll('#pos-tables button').length===1,'Open table missing');
  d.querySelector('#pos-tables button').click();
  assert(d.querySelectorAll('.pos-order').length===2,'Multiple orders not displayed');
  assert(d.getElementById('pos-items').textContent.includes(first.id),'Order ID missing');
  assert(d.getElementById('pos-items').textContent.includes('سعر الوحدة: 40.00'),'Unit price missing');
  assert(d.getElementById('pos-pay').disabled,'Preparing orders must not be payable');
  for(const order of [first,second]){await w.transitionOrder(order.id,'قيد التحضير','جاهز');await w.transitionOrder(order.id,'جاهز','تم التوصيل');}
  assert(!d.getElementById('pos-pay').disabled,'Delivered account not payable');
  d.getElementById('pos-received').value='150';d.getElementById('pos-received').dispatchEvent(new w.Event('input'));
  assert(d.getElementById('pos-change').textContent.includes('10.00'),'Incorrect change');
  d.getElementById('pos-payment').requestSubmit();d.getElementById('pos-payment').requestSubmit();
  try {await until(()=>d.getElementById('pos-feedback').textContent.includes('تم الدفع'));}
  catch(failure){throw Error(failure.message+'; feedback='+d.getElementById('pos-feedback').textContent+'; formValid='+d.getElementById('pos-payment').checkValidity()+'; error='+error);}
  assert(w.getAccountingData().sales.length===2,'Missing or duplicate sales');
  assert(w.getOrders().every(order=>order.paymentStatus==='مدفوع'),'Payment state not stored');
  assert(w.getLocalTableStatus('12')===null,'Table not released');
  assert(d.querySelectorAll('#pos-tables button').length===0,'Paid account still open');
  assert(!d.getElementById('pos-print').disabled,'Receipt not printable');
  assert(!d.getElementById('pos-feedback').closest('[hidden]'),'Success message hidden');
  assert(d.documentElement.scrollWidth<=d.documentElement.clientWidth,'Horizontal overflow at '+width);
  assert(!error,error);frame.remove();
 }
 document.body.textContent='PASS POS real DOM: create two orders, kitchen, delivery, double submit, payment, sales, table release and receipt at 360/768/1280px';
}
run().catch(error=>document.body.textContent='FAIL '+error.stack).finally(()=>fetch('/result',{method:'POST',body:document.body.textContent}));`;
let browserProcess, reported=false;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/result') {let result='';req.on('data',chunk=>result+=chunk);req.on('end',()=>{reported=true;console.log(result);if(!result.startsWith('PASS'))process.exitCode=1;res.end('OK');browserProcess?.kill();});return;}
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><body><script src="/checks.js"></script></body>');return;}
 if(url.pathname==='/checks.js'||url.pathname==='/fixture-config.js'){res.setHeader('Content-Type','text/javascript;charset=utf-8');res.end(url.pathname==='/checks.js'?checks:fixture);return;}
 if(url.pathname==='/fixture'){
  let html=fs.readFileSync(path.join(root,'pos.html'),'utf8').replace(/<script src="https:[^"]+"><\/script>/g,'').replace('src="firebase-config.js"','src="fixture-config.js"');
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;
 }
 const file=path.resolve(root,'.'+url.pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'text/plain');res.end(fs.readFileSync(file));
});
server.listen(0,'127.0.0.1',()=>{
 const browser=process.env.WARD_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file=>fs.existsSync(file));
 if(!browser){console.error('Set WARD_TEST_BROWSER to a Chromium executable.');server.close();process.exitCode=1;return;}
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ward-pos-test-'));
 const child=browserProcess=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--disable-sync','--user-data-dir='+profile,'http://127.0.0.1:'+server.address().port],{windowsHide:true});
 let output='',errors='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);
 const timeout=setTimeout(()=>child.kill(),55000);
 child.on('error',error=>{clearTimeout(timeout);server.close();console.error(error);process.exitCode=1;});
 child.on('close',()=>{clearTimeout(timeout);server.close();if(!reported){console.error('Browser test did not finish',output.slice(-1000),errors.slice(-500));process.exitCode=1;}});
});
