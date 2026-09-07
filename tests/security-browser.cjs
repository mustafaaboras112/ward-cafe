const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const fixture=`window.WardAuth={ready:Promise.resolve(),user:null,reset:async()=>{},home:()=> 'admin.html'};window.firebase={auth:()=>({signInWithEmailAndPassword:async()=>{throw {code:'auth/invalid-credential'};}})};`;
const checks=`(async()=>{const assert=(x,m)=>{if(!x)throw Error(m);};for(const width of [360,768,1440]){const frame=document.createElement('iframe');frame.style='width:'+width+'px;height:1000px;border:0';const loaded=new Promise(r=>frame.onload=r);frame.src='/fixture';document.body.append(frame);await loaded;const d=frame.contentDocument;assert(d.documentElement.scrollWidth<=d.documentElement.clientWidth,'Horizontal overflow '+width);d.getElementById('show-password').click();assert(d.getElementById('password').type==='text','Password visibility');d.getElementById('show-password').click();assert(d.getElementById('password').type==='password','Password hiding');d.getElementById('user-number').value='1001';d.getElementById('password').value='123456789012';d.getElementById('login-form').requestSubmit();await new Promise(r=>setTimeout(r,50));assert(d.getElementById('auth-status').textContent.includes('تعذر تسجيل الدخول'),'Generic sign-in error');assert(d.getElementById('password').value==='','Password cleared');assert(!d.getElementById('login-submit').disabled,'Button restored');d.getElementById('reset-password').click();await new Promise(r=>setTimeout(r,20));assert(d.getElementById('auth-status').textContent.includes('مسؤول النظام'),'Numeric reset help');frame.remove();}return 'PASS login responsive layout at 360/768/1440, password toggle, login failure and reset feedback';})().then(result=>fetch('/result',{method:'POST',body:result})).catch(error=>fetch('/result',{method:'POST',body:'FAIL '+error.stack}));`;
let reported=false,child;
const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/result'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{console.log(body);reported=true;if(!body.startsWith('PASS'))process.exitCode=1;res.end('ok');child.kill();});return;}
    if(url.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><body><script>'+checks+'</script>');return;}
    if(url.pathname==='/fixture'){let html=fs.readFileSync(path.join(root,'login.html'),'utf8').replace(/<script src="https:[^"]+"><\/script>/g,'').replace('<script src="firebase-config.js"></script>','<script>'+fixture+'</script>').replace('<script src="js/auth.js"></script>','');res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
    const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.css')?'text/css;charset=utf-8':'text/javascript;charset=utf-8');let source=fs.readFileSync(file,'utf8');if(file.endsWith('.css'))source=source.replace(/@import[^;]+;/g,'');res.end(source);
});
server.listen(0,'127.0.0.1',()=>{
    const browser='C:/Program Files/Google/Chrome/Application/chrome.exe',profile=fs.mkdtempSync(path.join(os.tmpdir(),'ward-auth-test-'));
    const screenshot=process.argv.includes('--screenshot');
    const args=['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--user-data-dir='+profile];
    if(screenshot)args.push('--screenshot='+path.join(root,'security-login-desktop.png'),'--window-size=1440,1000');
    args.push('http://127.0.0.1:'+server.address().port+(screenshot?'/fixture':'/'));
    child=spawn(browser,args,{windowsHide:true});let errors='';child.stderr.on('data',c=>errors+=c);const timeout=setTimeout(()=>child.kill(),45000);
    child.on('error',e=>{console.error(e.message);process.exitCode=1;server.close();});
    child.on('exit',code=>{clearTimeout(timeout);server.close();if(!reported&&!screenshot){console.error('Browser did not finish',errors.slice(-500));process.exitCode=1;}if(screenshot && code!==0)process.exitCode=1;});
});
