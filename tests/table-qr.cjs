// Actual menu UI on an isolated localhost origin. Never loads Firebase config.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '..');
const fixture = `const firebaseConfigured=false;const firebaseDatabase=null;
sessionStorage.setItem('ward-client-id','qr-test-client');
window.addEventListener('error',event=>window.parent.failures.push(event.message));
window.addEventListener('unhandledrejection',event=>window.parent.failures.push(String(event.reason)));`;
async function checks() {
    const assert = (ok, message) => { if (!ok) throw Error(message); };
    const until = async check => { for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw Error('Checkout timed out'); };
    window.failures = [];
    function seed(otherTable) {
        localStorage.clear();
        localStorage.setItem('cafe_ward_table', otherTable);
        localStorage.setItem('cafe_ward_menu', JSON.stringify([{ id: 1, name: 'قهوة ورد', price: 40, category: 'hot', img: 'q.png' }]));
        localStorage.setItem('cafe_ward_orders', JSON.stringify([{ id: 'previous-table-order', clientId: 'qr-test-client', table: otherTable, status: 'جاهز', paymentStatus: 'غير مدفوع', items: [{ name: 'طلب سابق', price: 777, qty: 1 }], total: 777, createdAt: Date.now() + 86400000 }]));
    }
    async function open(search) {
        const frame = document.createElement('iframe');
        frame.style.cssText = 'width:360px;height:900px;border:0';
        const loaded = new Promise(resolve => { frame.onload = resolve; });
        frame.src = '/index.html' + search;
        document.body.appendChild(frame);
        await loaded;
        return { frame, w: frame.contentWindow, d: frame.contentDocument };
    }
    const storedOrders = () => JSON.parse(localStorage.getItem('cafe_ward_orders') || '[]');
    for (let table = 1; table <= 20; table++) {
        const other = table === 20 ? '1' : '20';
        seed(other);
        const { frame, w, d } = await open('?table=' + table);
        assert(d.getElementById('table-badge').textContent === 'طاولتك ' + table, 'Wrong QR label for ' + table);
        assert(!d.querySelector('#table-selector,#change-table,#table-picker'), 'Table selection is exposed');
        assert(d.getElementById('customer-orders').hidden, 'Orders from another table leaked into QR ' + table);
        assert(!d.querySelector('.customer-ready-overlay'), 'Notification from another table leaked');
        for (let i = 0; i < 3; i++) w.renderAllOrderScreens();
        assert(d.getElementById('table-badge').textContent === 'طاولتك ' + table, 'Realtime changed the QR table');
        w.addToCart('1'); w.setCartOpen(true);
        assert(!d.getElementById('checkout-submit').disabled, 'Valid QR cannot order: ' + table);
        d.getElementById('checkout-submit').click(); d.getElementById('checkout-submit').click();
        await until(() => storedOrders().length === 2);
        const order = storedOrders().find(item => item.id !== 'previous-table-order');
        assert(order.table === String(table), 'Saved QR order mixed tables: ' + table);
        assert(order.total === 40 && order.items[0].qty === 1, 'Order content changed');
        assert(storedOrders().find(item => item.id === 'previous-table-order').table === other, 'Another table was changed');
        assert(d.querySelectorAll('.customer-order-status').length === 1, 'Wrong tracking count for ' + table);
        assert(d.getElementById('table-badge').textContent === 'طاولتك ' + table, 'Checkout changed table label');
        if (table === 7) {
            const snapshot = JSON.stringify(storedOrders());
            w.addToCart('1');
            w.history.replaceState(null, '', '?table=99');
            await w.checkout();
            assert(JSON.stringify(storedOrders()) === snapshot, 'Changed URL submitted an order');
            assert(d.getElementById('checkout-error').textContent.includes('غير صالح'), 'Changed URL has no error');
        }
        frame.remove();
    }
    for (const search of ['', '?table=', '?table=abc', '?table=99', '?table=0', '?table=21', '?table=-1', '?table=1.5', '?table=01', '?table=1&table=2']) {
        seed('7');
        const { frame, w, d } = await open(search);
        assert(d.getElementById('table-error').textContent.includes('غير صالح'), 'Invalid QR has no explanation: ' + search);
        assert(d.getElementById('customer-orders').hidden, 'Invalid QR shows a prior table');
        w.addToCart('1'); w.setCartOpen(true);
        assert(d.getElementById('checkout-submit').disabled, 'Invalid QR enables checkout: ' + search);
        const snapshot = JSON.stringify(storedOrders());
        await w.checkout();
        assert(JSON.stringify(storedOrders()) === snapshot, 'Invalid QR wrote an order: ' + search);
        assert(!d.querySelector('#table-selector,#change-table,#table-picker'), 'Invalid QR exposes table selection');
        frame.remove();
    }
    assert(failures.length === 0, failures.join('\n'));
    return 'PASS QR 1–20: correct labels and stored table IDs, no picker, no cross-table history/notifications, no duplicate checkout, invalid/missing/ambiguous URLs blocked.';
}
let browser, reported = false;
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/result') {
        let output = ''; req.on('data', chunk => output += chunk);
        req.on('end', () => { reported = true; console.log(output); if (!output.startsWith('PASS')) process.exitCode = 1; res.end('OK'); browser?.kill(); }); return;
    }
    if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end('<!doctype html><body><script src="/checks.js"></script></body>'); return; }
    if (url.pathname === '/checks.js' || url.pathname === '/fixture-config.js') {
        res.setHeader('Content-Type', 'text/javascript;charset=utf-8');
        res.end(url.pathname === '/fixture-config.js' ? fixture : '(' + checks.toString() + ')().catch(error=>"FAIL "+error.stack).then(body=>fetch("/result",{method:"POST",body}));'); return;
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    if (file.endsWith('.html')) {
        const html = fs.readFileSync(file, 'utf8').replace(/<script src="https:[^"]+"><\/script>/g, '').replace(/<link[^>]+href="https:[^>]+>/g, '').replace('src="firebase-config.js"', 'src="fixture-config.js"');
        res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(html); return;
    }
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/plain'); res.end(fs.readFileSync(file));
});
server.listen(0, '127.0.0.1', () => {
    const executable = process.env.WARD_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => fs.existsSync(file));
    if (!executable) { console.error('Set WARD_TEST_BROWSER to a Chromium executable.'); process.exitCode = 1; server.close(); return; }
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ward-qr-test-'));
    browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--user-data-dir=' + profile, 'http://127.0.0.1:' + server.address().port], { windowsHide: true });
    let errors = ''; browser.stderr.on('data', chunk => errors += chunk);
    const timeout = setTimeout(() => browser.kill(), 55000);
    browser.on('error', error => { console.error(error); process.exitCode = 1; clearTimeout(timeout); server.close(); });
    browser.on('close', () => { clearTimeout(timeout); server.close(); if (!reported) { console.error('Browser did not complete: ' + errors.slice(-1000)); process.exitCode = 1; } });
});
