const defaultMenu = [
    { id: 1, name: 'قهوة تركية ورد', category: 'hot', price: 40, desc: 'قهوة أصيلة ساخنة برغوة غنية', img: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=500&q=80' },
    { id: 2, name: 'لاتيه كافيه ورد', category: 'hot', price: 60, desc: 'إسبريسو مع حليب ناعم', img: 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?auto=format&fit=crop&w=500&q=80' },
    { id: 3, name: 'موهيتو بيري', category: 'cold', price: 75, desc: 'نكهة التوت المنعشة مع الصودا والنعناع', img: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80' },
    { id: 4, name: 'تشيز كيك الفراولة', category: 'sweets', price: 90, desc: 'تشيز كيك فاخر مع صوص الفراولة الطازج', img: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=500&q=80' },
    { id: 5, name: 'ساندويش دجاج ورد', category: 'food', price: 120, desc: 'دجاج مشوي مع خضار وصوص خاص', img: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=500&q=80' },
    { id: 6, name: 'برغر كافيه ورد', category: 'food', price: 150, desc: 'برغر لحم طازج مع الجبن والبطاطا', img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80' },
    { id: 7, name: 'طبق فطور شرقي', category: 'food', price: 135, desc: 'بيض وجبن وزيتون وخضار طازجة', img: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=500&q=80' }
];

const TABLE_COUNT = 20;
function validTable(table) { return /^(?:[1-9]|1[0-9]|20)$/.test(String(table)); }
function customerId() {
    if(window.WardAuth?.user)return WardAuth.user.uid;
    let id = sessionStorage.getItem('ward-client-id');
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('ward-client-id', id); }
    return id;
}

// The storage key is not necessarily the displayed legacy order ID.
function getOrderIdentity(order, storedKey) {
    const firebaseKey = String(storedKey ?? order.firebaseKey ?? order.id ?? '');
    return {firebaseKey, orderId: String(order.id || firebaseKey)};
}

// Local multi-key writes stay logically uncommitted until the journal is removed.
function readWardStorage(key) {
    const journal = JSON.parse(localStorage.getItem('cafe_ward_pending_write') || 'null');
    return journal && Object.prototype.hasOwnProperty.call(journal, key) ? journal[key] : localStorage.getItem(key);
}
function recoverWardWrite() {
    const journal = JSON.parse(localStorage.getItem('cafe_ward_pending_write') || 'null');
    if (!journal) return;
    for (const [key, value] of Object.entries(journal)) {
        if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    }
    localStorage.removeItem('cafe_ward_pending_write');
}

// A single transaction keeps reservations, orders and paid sales consistent.
// With Firebase configured, failures are surfaced; no local success is fabricated.
async function changeCafeState(change) {
    if (firebaseConfigured && !firebaseDatabase) throw new Error('تعذر تحميل اتصال Firebase. تحقق من الإنترنت وأعد فتح الصفحة.');
    if (firebaseDatabase) {
        await WardAuth.ready;
        const {state,version}=await WardAuth.call('cafeState',{action:'read'});
        change(state);
        const {state:saved}=await WardAuth.call('cafeState',{action:'commit',state,version});
        liveOrders = Object.entries(saved.orders || {}).map(([key, order]) => ({...order, id:getOrderIdentity(order,key).orderId, firebaseKey:key}));
        liveAccounting.sales = Object.entries(saved.accounting?.sales || {}).map(([id,sale])=>({...sale,id}));
        try {
            for (let n=1;n<=TABLE_COUNT;n++) {
                if(saved.tables?.[n]) setLocalTableStatus(n,saved.tables[n]); else clearLocalTableStatus(n);
            }
        } catch(error) { console.warn('تم الحفظ في Firebase، لكن تعذر تحديث نسخة الطاولات المحلية.',error); }
        renderAllOrderScreens(); updateTableSelectorUI();
        window.dispatchEvent(new Event('ward:accounting'));
        return;
    }
    const perform = () => {
        recoverWardWrite();
        const state = {
            orders: Object.fromEntries(readLocalOrders().map(order => [getOrderIdentity(order).firebaseKey, order])),
            tables: {}, accounting: { dayClosed:getAccountingData().dayClosed, sales: Object.fromEntries(getAccountingData().sales.map(sale => [String(sale.orderId || sale.id), sale])) }
        };
        for (let n=1; n<=TABLE_COUNT; n++) { const table=getLocalTableStatus(n); if(table) state.tables[n]=table; }
        change(state);
        const writes = {
            cafe_ward_orders: JSON.stringify(Object.values(state.orders)),
            cafe_ward_sales: JSON.stringify(Object.values(state.accounting.sales || {}))
        };
        for(let n=1;n<=TABLE_COUNT;n++) {
            writes['cafe_ward_table_'+n] = state.tables[n] ? JSON.stringify(state.tables[n]) : null;
        }
        const previous = Object.fromEntries(Object.keys(writes).map(key=>[key,localStorage.getItem(key)]));
        localStorage.setItem('cafe_ward_pending_write',JSON.stringify(previous));
        try {
            for(const [key,value] of Object.entries(writes)) {
                if(value===null) localStorage.removeItem(key);else localStorage.setItem(key,value);
            }
            localStorage.removeItem('cafe_ward_pending_write');
        } catch(error) {
            try {recoverWardWrite();} catch { /* Readers keep using the journal's pre-payment values. */ }
            throw error;
        }
        renderAllOrderScreens(); updateTableSelectorUI();
        window.dispatchEvent(new Event('ward:accounting'));
    };
    if (navigator.locks) return navigator.locks.request('ward-state',perform);
    return perform();
}

function openTableOrders(state, table) {
    return Object.values(state.orders || {}).filter(order => String(order.table) === String(table) && order.paymentStatus !== 'مدفوع');
}

async function submitOrder(table, items) {
    if(firebaseDatabase){await WardAuth.ready;return WardAuth.call('customerOrder',{table:String(table),items:items.map(i=>({id:String(i.id),qty:i.qty})),id:crypto.randomUUID()});}
    if (!validTable(table) || !items.length) throw new Error('اختر طاولة وأضف أصنافاً أولاً.');
    const id = crypto.randomUUID(), owner = customerId(), now = Date.now();
    let submitted;
    await changeCafeState(state => {
        const reserved = state.tables[table];
        if (reserved?.status === 'occupied' && reserved.clientId !== owner) throw new Error('الطاولة محجوزة، اختر طاولة أخرى.');
        const menu = state.menu ? Object.entries(state.menu).map(([id,item])=>({...item,id})) : getMenu();
        const lines = items.map(item => {
            const product = menu.find(product=>String(product.id)===String(item.id));
            if (!product || product.available === false || !Number.isInteger(item.qty) || item.qty < 1 || !Number.isFinite(Number(product.price)) || Number(product.price)<0) throw new Error('أحد الأصناف لم يعد متاحاً أو كميته غير صحيحة.');
            return {id:String(product.id),name:product.name,price:Number(product.price),qty:item.qty};
        });
        submitted = {id,clientId:owner,table:String(table),items:lines,total:Math.round(lines.reduce((sum,item)=>sum+item.price*item.qty,0)*100)/100,status:'قيد التحضير',paymentStatus:'غير مدفوع',createdAt:now,time:formatWardDateTime(now)};
        state.orders[id]=submitted;
        state.tables[table]={status:'occupied',table:String(table),orderId:id,clientId:owner,reservedAt:reserved?.reservedAt || now};
    });
    return submitted;
}

async function transitionOrder(id, expected, next) {
    const allowed = {'قيد التحضير': 'جاهز', 'جاهز': 'تم التوصيل'};
    if (allowed[expected] !== next) throw new Error('انتقال حالة غير مسموح.');

    const requestedId = String(id ?? '');
    if (!requestedId) throw new Error('معرف الطلب غير صالح.');

    // Firebase: حدّث الطلب نفسه مباشرة بدل transaction على جذر القاعدة.
    // هذا يمنع فشل transaction بسبب cache غير مكتمل على root مع أن /orders ظاهر realtime.
    if(firebaseDatabase){await WardAuth.ready;await WardAuth.call('transitionOrder',{id:requestedId,expected,next});return;}

    await changeCafeState(state => {
        const orders = state.orders || {};
        let orderKey = requestedId;
        let order = orders[orderKey];

        if (!order) {
            const found = Object.entries(orders).find(([key, item]) =>
                String(item?.id || key) === requestedId
            );
            if (found) {
                orderKey = found[0];
                order = found[1];
            }
        }

        if (!order) throw new Error('تعذر العثور على الطلب.');
        if (order.paymentStatus === 'مدفوع') throw new Error('تم إغلاق هذا الطلب بعد الدفع.');
        if (order.status === next) return;
        if (order.status !== expected) throw new Error('تم تحديث حالة الطلب من جهاز آخر.');

        order.status = next;
        order[next === 'جاهز' ? 'readyAt' : 'deliveredAt'] = Date.now();
        if (!order.id) order.id = requestedId;
        state.orders[orderKey] = order;
    });
}

async function releaseTable(table) {
    if(!validTable(table)) throw new Error('رقم الطاولة غير صالح.');
    await changeCafeState(state => {
        if(openTableOrders(state,table).length) throw new Error('لا يمكن تفريغ الطاولة قبل توصيل جميع الطلبات وتحصيل حسابها من الكاشير.');
        delete state.tables[table];
    });
}

async function moveTable(from, to) {
    if(!validTable(from)||!validTable(to)||String(from)===String(to)) throw new Error('اختر طاولة أخرى بين 1 و20.');
    await changeCafeState(state => {
        if(!state.tables[from]) throw new Error('الطاولة الأصلية غير محجوزة.');
        if(state.tables[to]?.status==='occupied'||openTableOrders(state,to).length) throw new Error('الطاولة المطلوبة مشغولة.');
        state.tables[to]={...state.tables[from],table:String(to)};
        delete state.tables[from];
        openTableOrders(state,from).forEach(order=>{order.table=String(to);order.movedAt=Date.now();});
    });
}

window.addEventListener('storage', event => {
    if (!firebaseDatabase && event.key?.startsWith('cafe_ward_')) {
        renderAllOrderScreens(); renderMenuViews(); updateTableSelectorUI();
        window.dispatchEvent(new Event('ward:accounting'));
    }
});
window.addEventListener('DOMContentLoaded', async () => {
    if(window.WardAuth) await WardAuth.ready;
    initializeProtectedPage(); initializeCafeHeaderClock();
    const splash=document.getElementById('splash-screen');
    if(splash) { createSplashPetals(splash); setTimeout(()=>{splash.remove();document.body.classList.remove('menu-page-loading');},1200); }
    createPetals();
});
let liveMenu = null;
let menuRealtimeStarted = false;
let liveAccounting = {
    expenses: [],
    purchases: [],
    inventory: [],
    clients: [],
    suppliers: [],
    unpaid: [],
    sales: [],
    cashMovements: [],
    dayClosed: false
};

let accountingRealtimeStarted = false;
let liveOrders = [];
let ordersRealtimeStarted = false;

function initializeProtectedPage() { /* WardAuth and server-side rules enforce access. */ }

function getMenu() {
    if (liveMenu) return liveMenu;
    const local = localStorage.getItem('cafe_ward_menu');
    return local ? JSON.parse(local) : defaultMenu;
}

function saveMenu(menu) {
    localStorage.setItem('cafe_ward_menu', JSON.stringify(menu));
}

async function startMenuRealtime() {
    if(window.WardAuth) await WardAuth.ready;
    if (menuRealtimeStarted) return;
    menuRealtimeStarted = true;
    const menuRef = getFirebaseMenuRef();
    if (!menuRef) {
        showFirebaseSetupMessage();
        renderMenuViews();
        return;
    }

    menuRef.on('value', snapshot => {
        if (!snapshot.exists()) {
            const initialMenu = {};
            defaultMenu.forEach(item => {
                initialMenu[String(item.id)] = { ...item, createdAt: Date.now() };
            });
            // Only administration can initialize an empty menu.
            if (document.getElementById('admin-menu-list')) menuRef.set(initialMenu);
            else { liveMenu = []; renderMenuViews(); }
            return;
        }
        const data = snapshot.val();
        liveMenu = Object.entries(data).map(([key, item]) => ({ ...item, id: key }));
        renderMenuViews();
    });
}

function renderMenuViews() { window.dispatchEvent(new Event('ward:menu')); }

function getAccountingData() {
    if (firebaseDatabase) return liveAccounting;

    return {
        expenses: JSON.parse(
            localStorage.getItem('cafe_ward_expenses') || '[]'
        ),

        purchases: JSON.parse(
            localStorage.getItem('cafe_ward_purchases') || '[]'
        ),

        inventory: JSON.parse(
            localStorage.getItem('cafe_ward_inventory') || '[]'
        ),

        clients: JSON.parse(
            localStorage.getItem('cafe_ward_clients') || '[]'
        ),

        suppliers: JSON.parse(
            localStorage.getItem('cafe_ward_suppliers') || '[]'
        ),

        unpaid: JSON.parse(
            localStorage.getItem('cafe_ward_unpaid') || '[]'
        ),

        sales: JSON.parse(
            readWardStorage('cafe_ward_sales') || '[]'
        ),

        cashMovements: JSON.parse(
            localStorage.getItem('cafe_ward_cash_mov') || '[]'
        ),

        dayClosed:
            localStorage.getItem('cafe_ward_day_closed') === 'true'
    };
}

async function startAccountingRealtime() {
    if(window.WardAuth) await WardAuth.ready;
    if (accountingRealtimeStarted) return;

    accountingRealtimeStarted = true;

    const accountingRef = getFirebaseAccountingRef();

    if (!accountingRef) {
        window.dispatchEvent(new Event('ward:accounting'));
        return;
    }

    accountingRef.on('value', snapshot => {
        const data = snapshot.val() || {};

        liveAccounting = {
            expenses: Object.entries(data.expenses || {})
                .map(([id, item]) => ({ ...item, id })),

            purchases: Object.entries(data.purchases || {})
                .map(([id, item]) => ({ ...item, id })),

            inventory: Object.entries(data.inventory || {})
                .map(([id, item]) => ({ ...item, id })),

            clients: Object.entries(data.clients || {})
                .map(([id, item]) => ({ ...item, id })),

            suppliers: Object.entries(data.suppliers || {})
                .map(([id, item]) => ({ ...item, id })),

            unpaid: Object.entries(data.unpaid || {})
                .map(([id, item]) => ({ ...item, id })),

            sales: Object.entries(data.sales || {})
                .map(([id, item]) => ({ ...item, id })),

            cashMovements: Object.entries(data.cashMovements || {})
                .map(([id, item]) => ({ ...item, id })),

            dayClosed: data.dayClosed === true
        };

        window.dispatchEvent(
            new Event('ward:accounting')
        );
    });
}
   

async function saveAccountingRecord(collection, record) {
    const createdAt = record.createdAt || Date.now();

    const completeRecord = {
        ...record,
        createdAt,
        time: record.time || formatWardDateTime(createdAt)
    };

    const ref = getFirebaseAccountingRef();

    // Firebase
    if (ref) {
        return ref.child(collection).push(completeRecord);
    }

    // LocalStorage
    const records = getAccountingData()[collection] || [];

    records.unshift({
        ...completeRecord,
        id: crypto.randomUUID
            ? crypto.randomUUID()
            : String(createdAt)
    });

    const storageKey =
        collection === 'cashMovements'
            ? 'cafe_ward_cash_mov'
            : `cafe_ward_${collection}`;

    localStorage.setItem(
        storageKey,
        JSON.stringify(records)
    );

    window.dispatchEvent(
        new Event('ward:accounting')
    );
}


async function removeAccountingRecord(collection, id) {
    const ref = getFirebaseAccountingRef();

    // Firebase
    if (ref) {
        return ref
            .child(collection)
            .child(String(id))
            .remove();
    }

    // LocalStorage
    const records =
        (getAccountingData()[collection] || [])
            .filter(item =>
                String(item.id) !== String(id)
            );

    const storageKey =
        collection === 'cashMovements'
            ? 'cafe_ward_cash_mov'
            : `cafe_ward_${collection}`;

    localStorage.setItem(
        storageKey,
        JSON.stringify(records)
    );

    window.dispatchEvent(
        new Event('ward:accounting')
    );
}
function readLocalOrders() {
    return JSON.parse(readWardStorage('cafe_ward_orders') || '[]');
}

function renderAllOrderScreens() { window.dispatchEvent(new Event('ward:orders')); }

function getOrders() {
    return firebaseDatabase ? liveOrders : readLocalOrders();
}

async function startOrdersRealtime() {
    if(window.WardAuth) await WardAuth.ready;
    if (ordersRealtimeStarted) return;
    ordersRealtimeStarted = true;
    let ordersRef = getFirebaseOrdersRef();
    if(ordersRef && window.WardAuth?.user?.isAnonymous)ordersRef=ordersRef.orderByChild('clientId').equalTo(WardAuth.user.uid);
    if (!ordersRef) {
        showFirebaseSetupMessage();
        liveOrders = readLocalOrders();
        renderAllOrderScreens();
        return;
    }

    ordersRef.on('value', snapshot => {
        liveOrders = Object.entries(snapshot.val() || {})
            .map(([key, order]) => ({ ...order, id: getOrderIdentity(order,key).orderId, firebaseKey: key }))
            .sort((first, second) => (second.createdAt || 0) - (first.createdAt || 0));
        renderAllOrderScreens();

    });
}

function createPetals() {
    const container = document.createElement('div');
    container.className = 'petals-container';
    document.body.appendChild(container);

    const petalsCount = 15; // عدد بتلات الورد المتساقطة
    for (let i = 0; i < petalsCount; i++) {
        const petal = document.createElement('div');
        petal.className = 'petal';

        // خصائص عشوائية للحركة والسرعة والحجم
        const size = Math.random() * 10 + 10; // حجم البتلة
        petal.style.width = `${size}px`;
        petal.style.height = `${size * 1.4}px`;
        petal.style.left = `${Math.random() * 100}vw`;

        const duration = Math.random() * 6 + 4; // سرعة السقوط (بين 4 و 10 ثواني)
        const delay = Math.random() * 5; // تأخير البدء
        petal.style.animationDuration = `${duration}s`;
        petal.style.animationDelay = `${delay}s`;

        container.appendChild(petal);
    }
}

function createSplashPetals(container) {
    const petals = document.createElement('div');
    petals.className = 'splash-petals';
    container.appendChild(petals);

    for (let i = 0; i < 8; i++) {
        const petal = document.createElement('span');
        petal.className = 'splash-petal';
        petal.style.left = `${10 + Math.random() * 80}%`;
        petal.style.animationDelay = `${Math.random() * 1.2}s`;
        petal.style.animationDuration = `${2.6 + Math.random() * 1.8}s`;
        petals.appendChild(petal);
    }
}

function isTodayWard(value) {
    const date = new Date(value || Date.now());
    const today = new Date();
    return date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate();
}

function formatWardDateTime(value) {
    const date = value ? new Date(value) : new Date();
    return new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'short',
        timeStyle: 'short',
        hour12: true
    }).format(date);
}

function escapeHtml(value) {
    const node = document.createElement('span');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
}

function initializeCafeHeaderClock() {
    const header = document.querySelector('header');
    if (!header || document.getElementById('ward-live-clock') || document.getElementById('pos-clock')) return;
    const clock = document.createElement('div');
    clock.id = 'ward-live-clock';
    clock.setAttribute('aria-label', 'الوقت الحالي');
    header.append(clock);
    const updateClock = () => { clock.textContent = formatWardDateTime(Date.now()); };
    updateClock();
    window.setInterval(updateClock, 30000);
}

function getLocalTableStatus(tableNumber) {
    const stored = readWardStorage(`cafe_ward_table_${String(tableNumber)}`);
    return stored ? JSON.parse(stored) : null;
}

function setLocalTableStatus(tableNumber, status) {
    localStorage.setItem(`cafe_ward_table_${String(tableNumber)}`, JSON.stringify(status));
}

function clearLocalTableStatus(tableNumber) {
    localStorage.removeItem(`cafe_ward_table_${String(tableNumber)}`);
}







function updateTableSelectorUI() { window.dispatchEvent(new Event('ward:tables')); }



async function startTablesRealtime() {
    if(window.WardAuth){await WardAuth.ready;if(WardAuth.user?.isAnonymous)return;}
    if(window.WardAuth) await WardAuth.ready;
    if (!getFirebaseTablesRef()) return;

    getFirebaseTablesRef().on('value', snapshot => {
        const data = snapshot.val() || {};
        const allTables = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20'];

        allTables.forEach(tableNum => {
            const status = data[tableNum];
            if (status && status.status === 'occupied') {
                setLocalTableStatus(tableNum, status);
            } else {
                clearLocalTableStatus(tableNum);
            }
        });

        updateTableSelectorUI();
        window.dispatchEvent(new Event('ward:tables'));
    });
}

function getFirebaseOrdersRef() {
    return firebaseDatabase ? firebaseDatabase.ref('orders') : null;
}

function getFirebaseMenuRef() {
    return firebaseDatabase ? firebaseDatabase.ref('menu') : null;
}

function getFirebaseAccountingRef() {
    return firebaseDatabase ? firebaseDatabase.ref('accounting') : null;
}

function getFirebaseTablesRef() {
    return firebaseDatabase ? firebaseDatabase.ref('tables') : null;
}

function showFirebaseSetupMessage() {
    if (!firebaseConfigured) {
        console.warn('Firebase is not configured. Add the project configuration to firebase-config.js.');
    }
}
