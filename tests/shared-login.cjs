const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const checks=`(async()=>{const assert=(x,m)=>{if(!x)throw Error(m);};for(const name of ['admin','pos','accounting'])for(const width of [360,768,1440]){const frame=document.createElement('iframe');frame.style='width:'+width+'px;height:900px;border:0';const loaded=new Promise(r=>frame.onload=r);frame.src='/'+name+'.html';document.body.append(frame);await loaded;const w=frame.contentWindow,d=w.document;assert(d.getElementById('access-lock'),'lock '+name);assert(d.documentElement.scrollWidth<=width,'overflow '+name+width);const card=d.querySelector('.access-card').getBoundingClientRect();assert(card.width<=width && card.height<=900,'card fits');assert(d.getElementById('access-title').textContent.includes(name==='accounting'?'المحاسبة':name==='admin'?'الإدارة':'البيع'),'workspace title');assert(d.querySelector('body > :not(#access-lock)').inert,'background inert');const input=d.getElementById('access-code');input.value='9999';d.getElementById('access-form').requestSubmit();assert(d.getElementById('access-error').textContent,'incorrect code');input.value='١٢٣٤';input.dispatchEvent(new w.Event('input'));assert(input.value==='1234','Arabic digits');d.getElementById('access-form').requestSubmit();assert(!d.getElementById('access-lock'),'unlock');assert(!d.querySelector('body > :not(#access-lock)').inert,'background restored');w.sessionStorage.clear();frame.remove();}return 'PASS shared staff login: 3 pages x 3 widths, titles, invalid code, Arabic digits, unlock and keyboard isolation';})().then(result=>fetch('/result',{method:'POST',body:result})).catch(error=>fetch('/result',{method:'POST',body:'FAIL '+error.stack}));`;
let reported=false,child;
const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/result'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{console.log(body);reported=true;if(!body.startsWith('PASS'))process.exitCode=1;res.end('ok');child.kill();});return;}
    if(url.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><body><script>'+checks+'</script>');return;}
    if(url.pathname.endsWith('.html')){const name=url.pathname.slice(1);if(!['admin.html','pos.html','accounting.html'].includes(name)){res.writeHead(404);res.end();return;}let html=fs.readFileSync(path.join(root,name),'utf8').replace(/<script[\s\S]*?<\/script>/g,'');html=html.replace('</body>','<script>const firebaseDatabase=null,firebaseConfigured=false;</script><script src="js/common.js"></script></body>');res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
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
