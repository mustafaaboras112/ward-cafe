// Real pages with an in-memory Realtime Database mock on a fresh local origin.
// No Firebase SDK/config or production account is loaded.
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '..');
const config = `
const firebaseConfigured = true;
const firebaseDatabase = window.parent.testDatabase;
sessionStorage.setItem('isLoggedIn', 'true');
sessionStorage.setItem('ward-client-id', 'visibility-customer');
window.addEventListener('error', event => window.parent.pageErrors.push(location.pathname + ': ' + event.message));
window.addEventListener('unhandledrejection', event => window.parent.pageErrors.push(String(event.reason)));
window.alert = message => window.parent.pageErrors.push('Unexpected alert: ' + message);
`;

async function browserChecks() {
    const assert = (ok, message) => { if (!ok) throw Error(message); };
    const until = async check => {
        for (let i = 0; i < 100; i++) {
            if (check()) return;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        throw Error('Realtime UI update timed out');
    };
    window.pageErrors = [];
    let state = {
        menu: { '1': { name: 'قهوة ورد', price: 40, category: 'hot', img: 'q.png' }, '2': { name: 'لاتيه ورد', price: 60, category: 'hot', img: 'q.png' } },
        orders: {}, tables: {}, accounting: { sales: {}, dayClosed: false }
    };
    const listeners = [];
    const read = location => location.split('/').filter(Boolean).reduce((data, key) => data?.[key], state) ?? null;
    const snapshot = location => {
        const value = structuredClone(read(location));
        return { val: () => structuredClone(value), exists: () => value !== null };
    };
    const emit = () => { for (const listener of [...listeners]) listener.callback(snapshot(listener.location)); };
    const ref = (location = '') => ({
        child: key => ref([location, String(key)].filter(Boolean).join('/')),
        once: async () => snapshot(location),
        on: (_, callback) => { listeners.push({ location, callback }); callback(snapshot(location)); },
        off: (_, callback) => { const index = listeners.findIndex(item => item.location === location && item.callback === callback); if (index >= 0) listeners.splice(index, 1); },
        transaction: async change => {
            const next = change(structuredClone(read(location)));
            if (next === undefined) return { committed: false, snapshot: snapshot(location) };
            if (!location) state = next;
            else {
                const keys = location.split('/'), leaf = keys.pop();
                let parent = state;
                for (const key of keys) parent = parent[key] ||= {};
                parent[leaf] = next;
            }
            emit();
            return { committed: true, snapshot: snapshot(location) };
        }
    });
    window.testDatabase = { ref };
    const pages = {};
    for (const name of ['index', 'kitchen', 'waiter', 'pos', 'accounting', 'admin']) {
        const frame = document.createElement('iframe');
        frame.style.cssText = 'width:1280px;height:900px;border:0';
        const loaded = new Promise(resolve => { frame.onload = resolve; });
        frame.src = '/' + name + '.html?table=12';
        document.body.appendChild(frame);
        await loaded;
        pages[name] = { frame, w: frame.contentWindow, d: frame.contentDocument };
    }
    const customer = pages.index, kitchen = pages.kitchen, waiter = pages.waiter, pos = pages.pos;
    const cards = () => [...customer.d.querySelectorAll('.customer-order-status')];
    const visibleIds = () => cards().map(card => card.dataset.orderId);
    const checkNavigation = () => {
        for (const [name, page] of Object.entries(pages)) {
            if (typeof page.w.addCafeNavigation === 'function') page.w.addCafeNavigation();
            page.w.initializeCafeHeaderClock();
            assert(page.d.querySelectorAll('#ward-live-clock').length <= 1, name + ' duplicates its clock');
            const links = [...page.d.querySelectorAll('a[href]')].filter(link => /\/(index|waiter|kitchen|pos|accounting|admin)\.html$/.test(new URL(link.href).pathname));
            assert(links.length === 0, name + ' exposes another screen');
            assert(![...page.d.querySelectorAll('[onclick]')].some(node => /(?:location|window\.open)[\s\S]*\.html/.test(node.getAttribute('onclick'))), name + ' exposes a screen via onclick');
        }
        assert(pos.d.getElementById('pos-back-tables'), 'POS internal navigation missing');
        assert(pages.accounting.d.querySelectorAll('.nav button[data-page]').length === 9, 'Accounting sidebar missing');
    };
    checkNavigation();
    assert(customer.d.getElementById('customer-orders').hidden, 'Empty tracking must be hidden');

    customer.w.addToCart('1');
    customer.w.setCartOpen(true);
    customer.d.getElementById('checkout-submit').click();
    customer.d.getElementById('checkout-submit').click();
    await until(() => Object.keys(state.orders).length === 1 && cards().length === 1);
    const first = Object.values(state.orders)[0];
    assert(cards()[0].textContent.includes('جاري التحضير'), 'Preparing message missing');
    assert(cards()[0].textContent.includes('قهوة ورد') && cards()[0].textContent.includes('40.00'), 'Stored items/total missing');
    assert(visibleIds()[0] === first.id, 'Order identity missing');
    assert(kitchen.d.querySelectorAll('[data-ready-order]').length === 1, 'Preparing order missing from kitchen');
    const realtimeCount = listeners.length;
    for (let i = 0; i < 4; i++) { customer.w.startOrdersRealtime(); kitchen.w.startOrdersRealtime(); waiter.w.startOrdersRealtime(); emit(); }
    assert(listeners.length === realtimeCount, 'Duplicate realtime subscriptions');
    assert(cards().length === 1, 'Repeated snapshots duplicate the customer order');
    checkNavigation();

    const readyButton = kitchen.d.querySelector('[data-ready-order]');
    readyButton.click(); readyButton.click();
    await until(() => state.orders[first.id].status === 'جاهز');
    assert(!kitchen.d.querySelector('.kitchen-order'), 'Ready order remains in kitchen');
    assert(cards()[0].textContent.includes('طلبك جاهز وسيتم توصيله'), 'Ready message missing');
    assert(waiter.d.querySelectorAll('[data-deliver]').length === 1, 'Ready order missing from waiter');
    assert(customer.d.querySelectorAll('.customer-ready-overlay').length === 1, 'Ready notification missing/duplicated');
    for (let i = 0; i < 3; i++) emit();
    assert(cards().length === 1 && customer.d.querySelectorAll('.customer-ready-overlay').length === 1, 'Ready snapshot duplicates tracking/notification');

    // A second genuine order stays visible when only the first is delivered.
    customer.w.addToCart('2');
    await customer.w.checkout();
    await until(() => cards().length === 2);
    const second = Object.values(state.orders).find(order => order.id !== first.id);
    for (const width of [360, 1280]) {
        customer.frame.style.width = width + 'px';
        await new Promise(resolve => setTimeout(resolve, 30));
        assert(customer.d.documentElement.scrollWidth <= customer.d.documentElement.clientWidth, 'Customer tracking overflow at ' + width);
    }
    waiter.d.querySelector('[data-deliver]').click();
    await until(() => state.orders[first.id].status === 'تم التوصيل');
    assert(visibleIds().length === 1 && visibleIds()[0] === second.id, 'Delivery must hide only the delivered order');
    assert(!customer.d.querySelector('.customer-ready-overlay'), 'Delivered order retains customer notification');
    assert(!waiter.d.querySelector('[data-deliver]'), 'Delivered order remains active for waiter');
    assert(state.orders[first.id].paymentStatus === 'غير مدفوع', 'Delivery changed payment status');
    assert(pos.w.payableOrders('12').some(order => order.id === first.id), 'Delivered order missing from POS');

    kitchen.d.querySelector('[data-ready-order]').click();
    await until(() => state.orders[second.id].status === 'جاهز');
    waiter.d.querySelector('[data-deliver]').click();
    await until(() => state.orders[second.id].status === 'تم التوصيل');
    assert(cards().length === 0 && customer.d.getElementById('customer-orders').hidden, 'All-delivered tracking must disappear');
    assert(!kitchen.d.querySelector('.kitchen-order') && !waiter.d.querySelector('.waiter-order'), 'Delivered order remains in a staff queue');
    assert(Object.keys(state.orders).length === 2 && Object.keys(state.accounting.sales).length === 0, 'Delivery removed orders or registered sales');
    pos.w.selectPosTable('12');
    pos.w.showPosView('payment');
    assert(pos.w.payableOrders('12').length === 2 && pos.w.posTotal() === 100, 'POS account changed');
    assert(!pos.d.getElementById('pos-pay').disabled, 'Delivered account cannot be paid');
    pos.d.getElementById('pos-received').value = '100';
    pos.d.getElementById('pos-received').dispatchEvent(new pos.w.Event('input'));
    pos.d.getElementById('pos-payment').requestSubmit();
    pos.d.getElementById('pos-payment').requestSubmit();
    await until(() => Object.keys(state.accounting.sales).length === 2);
    assert(Object.values(state.orders).every(order => order.paymentStatus === 'مدفوع'), 'Payment not retained in orders');
    assert(!state.tables['12'], 'Payment did not free the table');
    assert(Object.values(state.accounting.sales).reduce((sum, sale) => sum + sale.total, 0) === 100, 'Sales totals changed');
    assert(cards().length === 0 && customer.d.getElementById('customer-orders').hidden, 'Paid orders reappeared');

    // Verify ownership, deduplication, paid filtering and string client IDs on snapshots only.
    state.orders = {
        owned: { ...first, id: 'owned', status: 'قيد التحضير', paymentStatus: 'غير مدفوع' },
        duplicate: { ...first, id: 'owned', status: 'قيد التحضير', paymentStatus: 'غير مدفوع' },
        foreign: { ...first, id: 'foreign', clientId: 'another-customer', status: 'قيد التحضير', paymentStatus: 'غير مدفوع' },
        paid: { ...first, id: 'already-paid', status: 'قيد التحضير', paymentStatus: 'مدفوع' }
    };
    customer.w.sessionStorage.setItem('ward-order-ids', JSON.stringify(['foreign']));
    const stored = JSON.stringify(state);
    emit(); emit();
    assert(JSON.stringify(state) === stored, 'Rendering mutated stored orders');
    assert(visibleIds().length === 1 && visibleIds()[0] === 'owned', 'Client ownership or deduplication failed');
    assert(!kitchen.d.body.textContent.includes('already-paid'), 'Paid order visible in kitchen');
    customer.w.sessionStorage.setItem('ward-client-id', '42');
    state.orders = { numeric: { ...first, id: 'numeric-client', clientId: 42 } };
    emit();
    assert(visibleIds()[0] === 'numeric-client', 'Client ID string normalization failed');
    assert(pageErrors.length === 0, pageErrors.join('\n'));
    return 'PASS: six isolated screens; realtime submit → prepare → deliver → pay; multiple orders and ownership; no duplicate cards/subscriptions/sales; delivered records retained; table released; tracking fits 360/1280px.';
}

let browser, reported = false;
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/result') {
        let result = '';
        req.on('data', chunk => result += chunk);
        req.on('end', () => { reported = true; console.log(result); if (!result.startsWith('PASS')) process.exitCode = 1; res.end('OK'); browser?.kill(); });
        return;
    }
    if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html;charset=utf-8');
        res.end('<!doctype html><html><body><script src="/checks.js"></script></body></html>');
        return;
    }
    if (url.pathname === '/checks.js' || url.pathname === '/fixture-config.js') {
        res.setHeader('Content-Type', 'text/javascript;charset=utf-8');
        res.end(url.pathname === '/fixture-config.js' ? config : '(' + browserChecks.toString() + ')().catch(error => "FAIL " + error.stack).then(result => fetch("/result", { method: "POST", body: result }));');
        return;
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    if (file.endsWith('.html')) {
        const html = fs.readFileSync(file, 'utf8').replace(/<script src="https:[^"]+"><\/script>/g, '').replace(/<link[^>]+href="https:[^>]+>/g, '').replace('src="firebase-config.js"', 'src="fixture-config.js"');
        res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(html); return;
    }
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/plain');
    res.end(fs.readFileSync(file));
});
server.listen(0, '127.0.0.1', () => {
    const executable = process.env.WARD_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => fs.existsSync(file));
    if (!executable) { console.error('Set WARD_TEST_BROWSER to a Chromium executable.'); server.close(); process.exitCode = 1; return; }
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ward-visibility-'));
    browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--user-data-dir=' + profile, 'http://127.0.0.1:' + server.address().port], { windowsHide: true });
    let errors = '';
    browser.stderr.on('data', chunk => errors += chunk);
    const timeout = setTimeout(() => browser.kill(), 55000);
    browser.on('error', error => { console.error(error); process.exitCode = 1; clearTimeout(timeout); server.close(); });
    browser.on('close', () => { clearTimeout(timeout); server.close(); if (!reported) { console.error('Browser did not complete verification: ' + errors.slice(-1000)); process.exitCode = 1; } });
});
