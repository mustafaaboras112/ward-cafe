'use strict';

const { createHash } = require('node:crypto');

const ROLES = new Set(['admin', 'cashier', 'waiter', 'kitchen', 'accountant']);
const PREPARING = 'قيد التحضير';
const READY = 'جاهز';
const DELIVERED = 'تم التوصيل';
const PAID = 'مدفوع';
const MAX_AMOUNT = 10000000;
const STAFF_SESSION_SECONDS = 8 * 60 * 60;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const hash = value => createHash('sha256').update(value).digest('hex');
const roundMoney = value => Math.round(value * 100) / 100;

class ActionError extends Error {
    constructor(code, message) { super(message); this.name = 'ActionError'; this.code = code; }
}
function fail(code, message) { throw new ActionError(code, message); }
function validTable(value) {
    return (typeof value === 'string' || typeof value === 'number') && /^(?:[1-9]|1[0-9]|20)$/.test(String(value));
}
function tableNumber(value) {
    if (!validTable(value)) fail('invalid-argument', 'رقم الطاولة يجب أن يكون بين 1 و20.');
    return String(value);
}
function plainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) &&
        (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exactKeys(value, required, optional = []) {
    if (!plainObject(value) || required.some(key => !own(value, key)) ||
        Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) {
        fail('invalid-argument', 'صيغة الطلب غير صالحة.');
    }
}
function safeKey(value, minimum = 1) {
    if ((typeof value !== 'string' && typeof value !== 'number') ||
        !new RegExp(`^[A-Za-z0-9_-]{${minimum},128}$`).test(String(value)) ||
        ['__proto__', 'constructor', 'prototype'].includes(String(value))) {
        fail('invalid-argument', 'معرف غير صالح.');
    }
    return String(value);
}
function amount(value, { server = false } = {}) {
    if (server && typeof value === 'string' && value.trim() !== '') value = Number(value);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) {
        fail(server ? 'failed-precondition' : 'invalid-argument', 'المبلغ غير صالح.');
    }
    return value;
}
function formatTime(now) {
    return new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'short', timeStyle: 'short', hour12: true, timeZone: 'Europe/Istanbul'
    }).format(new Date(now));
}

// Only pass a token verified by Admin Auth here. Roles in request data or token custom
// claims never grant access: every transaction resolves the current server registry.
function resolveActor(state, token, now) {
    if (!token || typeof token.uid !== 'string') fail('unauthenticated', 'يرجى تسجيل الدخول.');
    const uid = safeKey(token.uid);
    const provider = token.firebase?.sign_in_provider;
    const access = own(state.staffAccess, uid) ? state.staffAccess[uid] : null;
    if (access !== null) {
        if (access?.active !== true || !ROLES.has(access.role) || provider === 'anonymous' ||
            token.email_verified !== true) fail('permission-denied', 'هذا الحساب غير مخول للعملية.');
        const age = Math.floor(now / 1000) - token.auth_time;
        if (!Number.isInteger(token.auth_time) || age < -60 || age > STAFF_SESSION_SECONDS) {
            fail('unauthenticated', 'انتهت جلسة الموظف، سجّل الدخول مجدداً.');
        }
        return { uid, role: access.role, provider, emailVerified: true };
    }
    if (provider !== 'anonymous') fail('permission-denied', 'هذا الحساب غير مخول للعملية.');
    return { uid, role: 'customer', provider, emailVerified: false };
}

function authorize(actor, action, data) {
    if (!actor || typeof actor.uid !== 'string') fail('unauthenticated', 'يرجى تسجيل الدخول.');
    safeKey(actor.uid);
    if (actor.role === 'customer') {
        if (actor.provider !== 'anonymous' || action !== 'order.create') {
            fail('permission-denied', 'ليس لديك صلاحية لهذه العملية.');
        }
        return;
    }
    if (!ROLES.has(actor.role) || actor.provider === 'anonymous' || actor.emailVerified !== true) {
        fail('permission-denied', 'ليس لديك صلاحية لهذه العملية.');
    }
    if (actor.role === 'admin') return;
    if (actor.role === 'cashier' && ['pos.create', 'payment.collect'].includes(action)) return;
    if (actor.role === 'kitchen' && action === 'order.transition' && data?.expected === PREPARING && data?.next === READY) return;
    if (actor.role === 'waiter' && (['table.move', 'table.release'].includes(action) ||
        (action === 'order.transition' && data?.expected === READY && data?.next === DELIVERED))) return;
    fail('permission-denied', 'ليس لديك صلاحية لهذه العملية.');
}

function openEntries(state, table) {
    return Object.entries(state.orders).filter(([, order]) => order && String(order.table) === table && order.paymentStatus !== PAID);
}
function rateLimit(state, actor, now) {
    const key = hash(actor.uid);
    const old = state._security.rateLimits[key];
    const current = old && Number.isFinite(old.startedAt) && now - old.startedAt < 60000 && now >= old.startedAt
        ? old : { startedAt: now, count: 0 };
    const limit = actor.role === 'customer' ? 12 : 120;
    if (current.count >= limit) fail('resource-exhausted', 'طلبات كثيرة، انتظر دقيقة ثم حاول مجدداً.');
    state._security.rateLimits[key] = { startedAt: current.startedAt, count: current.count + 1 };
}
function audit(state, actor, action, result, now, data) {
    const sequence = (Number(state._security.auditSequence) || 0) + 1;
    if (!Number.isSafeInteger(sequence)) fail('internal', 'تعذر تسجيل العملية.');
    state._security.auditSequence = sequence;
    const event = { uid: actor.uid, role: actor.role, action, at: now };
    if (result.id) event.orderId = result.id;
    if (data.table !== undefined) event.table = String(data.table);
    if (data.from !== undefined) { event.from = String(data.from); event.to = String(data.to); }
    if (action === 'order.transition') { event.orderId = String(data.id); event.next = data.next; }
    if (action === 'payment.collect') { event.total = result.total; event.method = result.method; event.orderIds = result.orders.map(order => order.id); }
    state._security.audit[String(sequence).padStart(12, '0')] = event;
}

function createOrder(state, actor, action, data, now) {
    exactKeys(data, ['table', 'items', 'requestId']);
    const table = tableNumber(data.table);
    const requestId = safeKey(data.requestId, 8);
    if (!Array.isArray(data.items) || !data.items.length || data.items.length > 100) {
        fail('invalid-argument', 'أضف بين 1 و100 صنف.');
    }
    const ids = new Set();
    const requested = data.items.map(line => {
        exactKeys(line, ['id', 'qty']);
        const id = safeKey(line.id);
        if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 1000 || ids.has(id)) {
            fail('invalid-argument', 'كمية الصنف غير صالحة أو الصنف مكرر.');
        }
        ids.add(id);
        return { id, qty: line.qty };
    });
    const requestKey = hash(JSON.stringify([actor.uid, requestId]));
    const fingerprint = hash(JSON.stringify([action, table, requested]));
    const previous = state._security.requests[requestKey];
    if (previous) {
        if (previous.uid !== actor.uid || previous.fingerprint !== fingerprint) {
            fail('already-exists', 'تم استخدام معرف الإرسال لطلب مختلف.');
        }
        const order = state.orders[previous.orderId];
        if (!order) fail('failed-precondition', 'الطلب السابق يحتاج مراجعة الموظف.');
        return structuredClone(order);
    }
    const reserved = state.tables[table];
    if (action === 'order.create' && ((reserved?.status === 'occupied' && reserved.clientId !== actor.uid) ||
        openEntries(state, table).some(([, order]) => order.clientId !== actor.uid))) {
        fail('failed-precondition', 'الطاولة مشغولة بحساب آخر، اطلب المساعدة من الموظف.');
    }
    const items = requested.map(line => {
        const product = own(state.menu, line.id) ? state.menu[line.id] : null;
        if (!product || product.available === false || typeof product.name !== 'string' || !product.name.trim() || product.name.length > 200) {
            fail('failed-precondition', 'أحد الأصناف لم يعد متاحاً. راجع السلة.');
        }
        return { id: line.id, name: product.name, price: amount(product.price, { server: true }), qty: line.qty };
    });
    const total = amount(roundMoney(items.reduce((sum, item) => sum + item.price * item.qty, 0)), { server: true });
    const id = 'ord_' + requestKey;
    if (own(state.orders, id)) fail('already-exists', 'معرف الطلب مستخدم، راجع الموظف.');
    const owner = action === 'pos.create' ? (reserved?.clientId || actor.uid) : actor.uid;
    const order = { id, clientId: owner, table, items, total, status: PREPARING,
        paymentStatus: 'غير مدفوع', createdAt: now, time: formatTime(now) };
    state.orders[id] = order;
    state.tables[table] = { status: 'occupied', table, orderId: action === 'pos.create' ? (reserved?.orderId || id) : id,
        clientId: owner, reservedAt: reserved?.reservedAt || now };
    state._security.requests[requestKey] = { uid: actor.uid, fingerprint, orderId: id, createdAt: now };
    return structuredClone(order);
}

function transition(state, data, now) {
    exactKeys(data, ['id', 'expected', 'next']);
    const id = safeKey(data.id);
    if (!((data.expected === PREPARING && data.next === READY) || (data.expected === READY && data.next === DELIVERED))) {
        fail('invalid-argument', 'انتقال حالة غير مسموح.');
    }
    const matches = Object.entries(state.orders).filter(([key, order]) => key === id || String(order?.id || key) === id);
    if (matches.length !== 1) fail('failed-precondition', 'تعذر تحديد الطلب، حدّث الشاشة.');
    const [key, order] = matches[0];
    if (order.paymentStatus === PAID) fail('failed-precondition', 'تم إغلاق الطلب بعد الدفع.');
    if (order.status === data.next) return { ok: true };
    if (order.status !== data.expected) fail('failed-precondition', 'تم تحديث حالة الطلب من جهاز آخر.');
    order.status = data.next;
    order[data.next === READY ? 'readyAt' : 'deliveredAt'] = now;
    if (!order.id) order.id = key;
    return { ok: true };
}
function moveTable(state, data, now) {
    exactKeys(data, ['from', 'to']);
    const from = tableNumber(data.from), to = tableNumber(data.to);
    if (from === to) fail('invalid-argument', 'اختر طاولة مختلفة.');
    if (!state.tables[from]) fail('failed-precondition', 'الطاولة الأصلية غير محجوزة.');
    if (state.tables[to]?.status === 'occupied' || openEntries(state, to).length) fail('failed-precondition', 'الطاولة المطلوبة مشغولة.');
    state.tables[to] = { ...state.tables[from], table: to };
    delete state.tables[from];
    for (const [, order] of openEntries(state, from)) { order.table = to; order.movedAt = now; }
    return { ok: true };
}
function releaseTable(state, data) {
    exactKeys(data, ['table']);
    const table = tableNumber(data.table);
    if (openEntries(state, table).length) fail('failed-precondition', 'يجب توصيل جميع الطلبات وتحصيل الحساب قبل تفريغ الطاولة.');
    delete state.tables[table];
    return { ok: true };
}

function collectPayment(state, data, now) {
    exactKeys(data, ['table', 'tendered', 'method', 'expectedOrders']);
    const table = tableNumber(data.table);
    if (!['cash', 'card'].includes(data.method)) fail('invalid-argument', 'طريقة الدفع غير صالحة.');
    if (state.accounting.dayClosed === true) fail('failed-precondition', 'الصندوق مغلق. افتح اليوم المحاسبي قبل التحصيل.');
    const tendered = amount(data.tendered);
    if (!Array.isArray(data.expectedOrders) || !data.expectedOrders.length || data.expectedOrders.length > 500) {
        fail('invalid-argument', 'حدّث حساب الطاولة قبل تأكيد الدفع.');
    }
    const expected = new Map();
    for (const item of data.expectedOrders) {
        exactKeys(item, ['firebaseKey', 'total'], ['orderId']);
        const key = safeKey(item.firebaseKey);
        if (expected.has(key)) fail('invalid-argument', 'يوجد طلب مكرر في الحساب.');
        if (item.orderId !== undefined) safeKey(item.orderId);
        expected.set(key, { total: amount(item.total), orderId: item.orderId });
    }
    const entries = openEntries(state, table);
    if (!entries.length) fail('failed-precondition', 'لا توجد طلبات غير مدفوعة لهذه الطاولة.');
    if (entries.length !== expected.size || entries.some(([key, order]) => !expected.has(key) ||
        expected.get(key).total !== Number(order.total) ||
        (expected.get(key).orderId !== undefined && String(expected.get(key).orderId) !== String(order.id || key)))) {
        fail('failed-precondition', 'تغيّرت طلبات الطاولة أو إجماليها. راجع الفاتورة ثم أكد الدفع مجدداً.');
    }
    const ids = new Set();
    const normalized = entries.map(([key, order]) => {
        if (order.status !== DELIVERED) fail('failed-precondition', 'يجب توصيل جميع الطلبات قبل تحصيل الحساب.');
        const orderId = safeKey(order.id || key);
        if (ids.has(orderId)) fail('failed-precondition', 'يوجد طلب مكرر في الحساب.');
        ids.add(orderId);
        const total = amount(order.total, { server: true });
        if (!Array.isArray(order.items) || !order.items.length || order.items.length > 100) fail('failed-precondition', 'بيانات الطلب غير صالحة.');
        const linesTotal = roundMoney(order.items.reduce((sum, item) => {
            if (!item || typeof item.name !== 'string' || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 1000) {
                fail('failed-precondition', 'بيانات أحد الأصناف غير صالحة.');
            }
            return sum + amount(item.price, { server: true }) * item.qty;
        }, 0));
        if (linesTotal !== total) fail('failed-precondition', 'إجمالي الطلب لا يطابق أصنافه. راجع الحساب قبل الدفع.');
        // Legacy sales may have a push key different from both the displayed ID and order key.
        if (own(state.accounting.sales, orderId) || own(state.accounting.sales, key) ||
            Object.values(state.accounting.sales).some(sale => sale &&
                [sale.orderId, sale.id, sale.firebaseKey].some(value => value != null && [orderId, key].includes(String(value))))) {
            fail('failed-precondition', 'يوجد سجل بيع سابق لهذا الطلب. لا يمكن تكرار الدفع.');
        }
        return { order, orderId, firebaseKey: key, total };
    });
    const total = amount(roundMoney(normalized.reduce((sum, row) => sum + row.total, 0)), { server: true });
    if (data.method === 'cash' && tendered < total) fail('invalid-argument', 'المبلغ المستلم أقل من إجمالي الفاتورة.');
    for (const { order, orderId, total: orderTotal } of normalized) {
        order.paymentStatus = PAID;
        order.paidAt = now;
        order.paymentMethod = data.method;
        state.accounting.sales[orderId] = { id: orderId, orderId, table: order.table, total: orderTotal,
            paidAt: now, time: formatTime(now), paymentMethod: data.method, items: structuredClone(order.items) };
    }
    delete state.tables[table];
    return { table, total, method: data.method, paidAt: now,
        orders: normalized.map(({ order, orderId, firebaseKey }) => ({ ...structuredClone(order), id: orderId, firebaseKey })),
        received: data.method === 'cash' ? tendered : total,
        change: data.method === 'cash' ? roundMoney(tendered - total) : 0 };
}

// Pure transaction: never mutate the supplied snapshot or leave partial changes after errors.
function applyAction(current, actor, action, data, now) {
    const known = ['order.create', 'pos.create', 'order.transition', 'table.move', 'table.release', 'payment.collect'];
    if (!known.includes(action)) fail('invalid-argument', 'العملية غير مدعومة.');
    authorize(actor, action, data);
    if (!Number.isSafeInteger(now) || now <= 0) fail('internal', 'تعذر تحديد وقت العملية.');
    const state = structuredClone(current || {});
    state.orders ||= {}; state.tables ||= {}; state.accounting ||= {}; state.accounting.sales ||= {};
    state._security ||= {}; state._security.rateLimits ||= {}; state._security.requests ||= {}; state._security.audit ||= {};
    rateLimit(state, actor, now);
    let result;
    if (action === 'order.create' || action === 'pos.create') result = createOrder(state, actor, action, data, now);
    else if (action === 'order.transition') result = transition(state, data, now);
    else if (action === 'table.move') result = moveTable(state, data, now);
    else if (action === 'table.release') result = releaseTable(state, data);
    else result = collectPayment(state, data, now);
    audit(state, actor, action, result, now, data);
    return { state, result };
}

module.exports = { ActionError, applyAction, exactKeys, resolveActor, validTable, STAFF_SESSION_SECONDS };
