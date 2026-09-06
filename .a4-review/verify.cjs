const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('node:assert/strict');
const { spawn } = require('child_process');
const before = fs.readFileSync(path.join(__dirname, 'print-before.js'), 'utf8');
const after = fs.readFileSync(path.join(__dirname, '../js/print.js'), 'utf8');
const split = 'function printWardAccountingReport(';
assert.equal(before.split(split)[0], after.split(split)[0], 'Receipt and shared helpers unchanged');
const range = { startTimestamp: new Date(2026, 8, 1).getTime(), endTimestamp: new Date(2026, 8, 7, 23, 59, 59, 999).getTime() };
const stamp = range.startTimestamp;
const normal = {
 sales: [{ total: 1800, paymentMethod: 'cash', paidAt: stamp }, { total: 1200, paymentMethod: 'card', paidAt: stamp }, { total: 9000, paymentMethod: 'cash', paidAt: stamp - 1 }],
 purchases: Array.from({ length: 10 }, (_, i) => ({ supplier: 'مورد القهوة ' + (i + 1), total: 60, createdAt: stamp + i * 8640000 })),
 expenses: Array.from({ length: 10 }, (_, i) => ({ description: 'مستلزمات الضيافة ' + (i + 1), amount: 15, createdAt: stamp + i * 8640000 })), dayClosed: false
};
const cases = {
 normal,
 empty: { sales: [], purchases: [], expenses: [] },
 negative: { sales: [{ total: 10, paymentMethod: 'card', paidAt: stamp }], purchases: [{ supplier: 'مورد', total: 30, createdAt: stamp }], expenses: [] },
 equal: { sales: [{ total: 25, paymentMethod: 'cash', paidAt: stamp }, { total: 25, paymentMethod: 'card', paidAt: stamp }], purchases: [], expenses: [] }
};
function generate(source, data) {
 const ctx = vm.createContext({ Date, Intl, alert: message => { throw Error(message); } });
 vm.runInContext(source, ctx);
 let output;
 ctx.wardPrintDocument = html => { output = html; };
 const snapshot = JSON.stringify(data);
 ctx.printWardAccountingReport(data, range);
 assert.equal(JSON.stringify(data), snapshot);
 return output;
}
function metrics(html) {
 return [...html.matchAll(/<div class="metric(?: metric-profit)?">([\s\S]*?)<\/div>/g)].map(match => match[1].match(/<strong[^>]*>([\s\S]*?)<\/strong>/)[1].trim());
}
const reports = {};
for (const [name, data] of Object.entries(cases)) {
 reports[name] = generate(after, data);
 assert.deepEqual(metrics(reports[name]), metrics(generate(before, data)), name + ' accounting values');
 assert.doesNotMatch(reports[name], /NaN|Infinity|undefined/);
 fs.writeFileSync(path.join(__dirname, name + '.html'), reports[name]);
}
assert.match(reports.normal, /60\.0%/);
assert.match(reports.normal, /40\.0%/);
assert.match(reports.normal, /1500\.00/);
assert.match(reports.negative, /class="profit-negative"/);
assert.match(reports.empty, /0\.0%/);
assert.match(reports.equal, /متساوي/);
console.log('PASS: exact original metrics, read-only data, cash/card percentages, average invoice, negative profit, zero-sales and tied methods.');

async function main() {
 const profile = fs.mkdtempSync(path.join(__dirname, 'chrome-profile-'));
 fs.mkdirSync(profile, { recursive: true });
 const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
 browser.stderr.on('data', chunk => fs.appendFileSync(path.join(__dirname, 'browser.log'), chunk));
 browser.on('exit', (code, signal) => console.log('Browser exit', code, signal));
 const deadline = setTimeout(() => { console.error('Browser verification timed out'); process.exitCode = 1; socket?.close(); browser.kill(); }, 45000);
 let socket;
 try {
  const endpoint = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; !fs.existsSync(endpoint) && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 100));
  const port = fs.readFileSync(endpoint, 'utf8').split('\n')[0];
  const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  socket = new WebSocket(pages.find(item => item.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  socket.onmessage = event => { const message = JSON.parse(event.data); if (message.id) { const job = pending.get(message.id); pending.delete(message.id); message.error ? job.reject(message.error) : job.resolve(message.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  console.log('CDP connected');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 703, height: 1400, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  const frameId = (await send('Page.getFrameTree')).frameTree.frame.id;
  for (const [name, html] of Object.entries(reports)) {
   console.log('Checking', name);
   await send('Page.setDocumentContent', { frameId, html });
   await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
   const result = (await send('Runtime.evaluate', { expression: "JSON.stringify({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,reportHeight:document.querySelector('.report').getBoundingClientRect().height,rtl:getComputedStyle(document.body).direction,border:getComputedStyle(document.querySelector('.report')).borderTopWidth,inner:getComputedStyle(document.querySelector('.report'),'::before').borderTopWidth,overflow:[...document.querySelectorAll('.report *')].filter(e=>e.getBoundingClientRect().right>704||e.getBoundingClientRect().left<0).length})", returnByValue: true })).result.value;
   const dimensions = JSON.parse(result);
   console.log((await send('Runtime.evaluate', { expression: "JSON.stringify([...document.querySelector('.report').children].map(e=>({class:e.className,height:e.getBoundingClientRect().height})))", returnByValue: true })).result.value);
   assert.ok(dimensions.width <= 703, name + ' horizontal overflow');
   assert.equal(dimensions.overflow, 0, name + ' content overflow');
   assert.equal(dimensions.rtl, 'rtl');
   assert.equal(dimensions.border, '2px'); assert.equal(dimensions.inner, '1px');
   if (name === 'normal') {
    console.log('Screenshot layout', await send('Page.getLayoutMetrics'));
    const png = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(__dirname, 'preview.png'), Buffer.from(png.data, 'base64'));
   }
   const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
   const bytes = Buffer.from(pdf.data, 'base64');
   const pages = [...bytes.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
   console.log('Print measurements', name, pages, dimensions);
   fs.writeFileSync(path.join(__dirname, name + '.pdf'), bytes);
   assert.equal(pages, 1, name + ' should fit one A4 page');
   console.log('PASS A4 ' + name + ': ' + pages + ' page; ' + result);
  }
 } finally { clearTimeout(deadline); socket?.close(); browser.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
