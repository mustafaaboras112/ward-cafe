// No browser, network, Firebase SDK or production storage: exercise the real
// state transitions/payment functions against a shared Realtime Database mock.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const { webcrypto } = require('crypto');
const path = require('path');
const root = path.resolve(__dirname, '..');
function storage() {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
class Element {
    constructor() {
        this.children = []; this.style = {}; this.dataset = {}; this.value = ''; this.options = [];
        this.classList = { add() {}, remove() {}, toggle() {} }; this.textContent = ''; this._html = '';
    }
    set innerHTML(value) { this._html = value; }
    get innerHTML() { return this._html || String(this.textContent).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    remove() { this.parentNode = null; }
    setAttribute(key, value) { this[key] = value; }
    getAttribute(key) { return this[key] ?? null; }
    addEventListener() {}
    querySelector() { return new Element(); }
    querySelectorAll() { return []; }
    focus() {}
    reset() {}
}
let state = { orders: {}, tables: {}, accounting: { sales: {}, dayClosed: false } };
const listeners = [];
const read = location => location.split('/').filter(Boolean).reduce((value, key) => value?.[key], state) ?? null;
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
            const keys = location.split('/'), leaf = keys.pop(); let parent = state;
            for (const key of keys) parent = parent[key] ||= {};
            parent[leaf] = next;
        }
        emit(); return { committed: true, snapshot: snapshot(location) };
    }
});
function screen(name) {
    const html = fs.readFileSync(path.join(root, name === 'menu' ? 'index.html' : name + '.html'), 'utf8');
    const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
    const events = {}, sessionStorage = storage(), localStorage = storage();
    sessionStorage.setItem('ward-client-id', 'client-one');
    if (nodes.has('pos-method')) nodes.get('pos-method').value = 'cash';
    const ctx = vm.createContext({ console, Date, Intl, crypto: webcrypto, Event, sessionStorage, localStorage, navigator: {},
        firebaseConfigured: true, firebaseDatabase: { ref }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
        alert: message => { throw Error(message); }, location: { pathname: '/' + name + '.html' },
        document: { getElementById: id => nodes.get(id) || null, createElement: () => new Element(), body: new Element(), querySelector: () => null, querySelectorAll: () => [] }
    });
    ctx.window = ctx;
    ctx.addEventListener = (type, callback) => (events[type] ||= []).push(callback);
    ctx.dispatchEvent = event => { for (const callback of events[event.type] || []) callback(event); };
    for (const file of ['common', name]) vm.runInContext(fs.readFileSync(path.join(root, 'js', file + '.js'), 'utf8'), ctx, { filename: file + '.js' });
    // POS rendering is covered in the real-browser test. This test isolates the
    // payment function so it does not depend on mock geometry/form validation.
    if (name === 'pos') events['ward:orders'] = events['ward:accounting'] = [];
    ctx.startOrdersRealtime(); ctx.startAccountingRealtime();
    return { ctx, nodes };
}
async function run() {
    const customer = screen('menu'), kitchen = screen('kitchen'), waiter = screen('waiter'), pos = screen('pos');
    const cardIds = () => [...customer.nodes.get('customer-orders').innerHTML.matchAll(/data-order-id="([^"]+)"/g)].map(match => match[1]);
    const first = await customer.ctx.submitOrder('12', [{ id: 1, qty: 1 }]);
    assert.deepEqual(cardIds(), [first.id]);
    assert.match(customer.nodes.get('customer-orders').innerHTML, /جاري التحضير/);
    const count = listeners.length;
    for (let i = 0; i < 4; i++) { customer.ctx.startOrdersRealtime(); emit(); }
    assert.equal(listeners.length, count); assert.deepEqual(cardIds(), [first.id]);
    await kitchen.ctx.markOrderReady(first.id);
    assert.doesNotMatch(kitchen.nodes.get('kitchen-orders-container').innerHTML, /class="kitchen-order /);
    assert.match(customer.nodes.get('customer-orders').innerHTML, /طلبك جاهز وسيتم توصيله/);
    assert.match(waiter.nodes.get('orders-container').innerHTML, /data-deliver=/);
    const second = await customer.ctx.submitOrder('12', [{ id: 2, qty: 1 }]);
    await waiter.ctx.updateOrderStatus(first.id);
    assert.deepEqual(cardIds(), [second.id]);
    assert.equal(state.orders[first.id].status, 'تم التوصيل');
    assert.equal(state.orders[first.id].paymentStatus, 'غير مدفوع');
    assert.equal(pos.ctx.payableOrders('12').length, 2);
    await kitchen.ctx.markOrderReady(second.id);
    await waiter.ctx.updateOrderStatus(second.id);
    assert.deepEqual(cardIds(), []); assert.equal(customer.nodes.get('customer-orders').hidden, true);
    assert.doesNotMatch(waiter.nodes.get('orders-container').innerHTML, /class="waiter-order"/);
    assert.equal(Object.keys(state.orders).length, 2); assert.equal(Object.keys(state.accounting.sales).length, 0);
    const receipt = await pos.ctx.collectTablePayment('12', 100, 'cash');
    assert.equal(receipt.total, 100); assert.equal(receipt.change, 0);
    assert.equal(Object.keys(state.orders).length, 2);
    assert.ok(Object.values(state.orders).every(order => order.paymentStatus === 'مدفوع'));
    assert.equal(state.tables['12'], undefined);
    assert.equal(Object.keys(state.accounting.sales).length, 2);
    assert.equal(Object.values(state.accounting.sales).reduce((total, sale) => total + sale.total, 0), 100);
    await assert.rejects(() => pos.ctx.collectTablePayment('12', 100, 'cash'));
    assert.equal(Object.keys(state.accounting.sales).length, 2);
    state.orders = {
        one: { ...first, id: 'same' }, duplicate: { ...first, id: 'same' },
        foreign: { ...first, id: 'foreign', clientId: 'other' },
        paid: { ...first, id: 'paid', paymentStatus: 'مدفوع' }
    };
    customer.ctx.sessionStorage.setItem('ward-order-ids', '["foreign"]');
    const before = JSON.stringify(state);
    emit(); emit();
    assert.deepEqual(cardIds(), ['same']); assert.equal(JSON.stringify(state), before);
    assert.doesNotMatch(kitchen.nodes.get('kitchen-orders-container').innerHTML, />paid</);
    customer.ctx.sessionStorage.setItem('ward-client-id', '42');
    state.orders = { numeric: { ...first, id: 'numeric', clientId: 42 } }; emit();
    assert.deepEqual(cardIds(), ['numeric']);
    console.log('PASS model: realtime preparation/delivery visibility, ownership and deduplication, unchanged retained orders, payment totals, exactly-once sales and table release.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
