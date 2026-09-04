const defaultMenu = [
    { id: 1, name: 'قهوة تركية ورد', category: 'hot', price: 40, desc: 'قهوة أصيلة ساخنة برغوة غنية', img: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=500&q=80' },
    { id: 2, name: 'لاتيه كافيه ورد', category: 'hot', price: 60, desc: 'إسبريسو مع حليب ناعم', img: 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?auto=format&fit=crop&w=500&q=80' },
    { id: 3, name: 'موهيتو بيري', category: 'cold', price: 75, desc: 'نكهة التوت المنعشة مع الصودا والنعناع', img: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80' },
    { id: 4, name: 'تشيز كيك الفراولة', category: 'sweets', price: 90, desc: 'تشيز كيك فاخر مع صوص الفراولة الطازج', img: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=500&q=80' },
    { id: 5, name: 'ساندويش دجاج ورد', category: 'food', price: 120, desc: 'دجاج مشوي مع خضار وصوص خاص', img: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=500&q=80' },
    { id: 6, name: 'برغر كافيه ورد', category: 'food', price: 150, desc: 'برغر لحم طازج مع الجبن والبطاطا', img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80' },
    { id: 7, name: 'طبق فطور شرقي', category: 'food', price: 135, desc: 'بيض وجبن وزيتون وخضار طازجة', img: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=500&q=80' }
];

const STAFF_ACCESS_CODE = '1234';

function initializeProtectedPage() {
    const pageName = window.location.pathname.split('/').pop().toLowerCase();
    const isProtectedPage = pageName === 'admin.html' || pageName === 'accounting.html';
    const isLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true';
    const legacyLogin = sessionStorage.getItem('cafe_ward_staff_unlocked') === 'true';
    if (!isProtectedPage || isLoggedIn || legacyLogin) return;

    document.body.classList.add('page-locked');

    const lockScreen = document.createElement('div');
    lockScreen.id = 'access-lock';
    lockScreen.innerHTML = `
        <div class="access-card" role="dialog" aria-modal="true" aria-labelledby="access-title">
            <img class="access-logo" src="q.png" alt="كافيه ورد">
            <div class="access-icon"><i class="fa-solid fa-lock"></i></div>
            <h2 id="access-title">الصفحة محمية</h2>
            <p>أدخل رمز الموظفين للوصول إلى هذه الصفحة</p>
            <form id="access-form">
                <label for="access-code">رمز الدخول</label>
                <input id="access-code" type="password" inputmode="numeric" autocomplete="off" required autofocus>
                <button type="submit">فتح الصفحة</button>
                <small id="access-error" role="alert"></small>
            </form>
        </div>
    `;
    document.body.appendChild(lockScreen);

    const form = document.getElementById('access-form');
    const codeInput = document.getElementById('access-code');
    const error = document.getElementById('access-error');

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (codeInput.value === STAFF_ACCESS_CODE) {
            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.setItem('cafe_ward_staff_unlocked', 'true');
            document.body.classList.remove('page-locked');
            lockScreen.remove();
            return;
        }

        error.textContent = 'رمز الدخول غير صحيح';
        codeInput.value = '';
        codeInput.focus();
    });
}

function getMenu() {
    if (liveMenu) return liveMenu;
    const local = localStorage.getItem('cafe_ward_menu');
    return local ? JSON.parse(local) : defaultMenu;
}

function saveMenu(menu) {
    localStorage.setItem('cafe_ward_menu', JSON.stringify(menu));
}

let cart = [];
let tableNumber = "1";
let liveMenu = null;
let menuRealtimeStarted = false;
let liveAccounting = {
    expenses: [],
    clients: [],
    suppliers: [],
    unpaid: [],
    cashMovements: [],
    dayClosed: false
};
let accountingRealtimeStarted = false;
let liveOrders = [];
let ordersRealtimeStarted = false;

function startMenuRealtime() {
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
            menuRef.set(initialMenu);
            return;
        }
        const data = snapshot.val();
        liveMenu = Object.entries(data).map(([key, item]) => ({ ...item, id: key }));
        renderMenuViews();
    });
}

function renderMenuViews() {
    if (document.getElementById('menu-grid')) displayMenu(getMenu());
    if (document.getElementById('admin-menu-list')) renderAdminMenu();
}

function getAccountingData() {
    if (firebaseDatabase) return liveAccounting;
    return {
        expenses: JSON.parse(localStorage.getItem('cafe_ward_expenses') || '[]'),
        clients: JSON.parse(localStorage.getItem('cafe_ward_clients') || '[]'),
        suppliers: JSON.parse(localStorage.getItem('cafe_ward_suppliers') || '[]'),
        unpaid: JSON.parse(localStorage.getItem('cafe_ward_unpaid') || '[]'),
        cashMovements: JSON.parse(localStorage.getItem('cafe_ward_cash_mov') || '[]'),
        dayClosed: localStorage.getItem('cafe_ward_day_closed') === 'true'
    };
}

function startAccountingRealtime() {
    if (accountingRealtimeStarted) return;
    accountingRealtimeStarted = true;
    const accountingRef = getFirebaseAccountingRef();
    if (!accountingRef) {
        renderAccountingDashboard();
        return;
    }
    accountingRef.on('value', snapshot => {
        const data = snapshot.val() || {};
        liveAccounting = {
            expenses: Object.entries(data.expenses || {}).map(([id, item]) => ({ ...item, id })),
            clients: Object.entries(data.clients || {}).map(([id, item]) => ({ ...item, id })),
            suppliers: Object.entries(data.suppliers || {}).map(([id, item]) => ({ ...item, id })),
            unpaid: Object.entries(data.unpaid || {}).map(([id, item]) => ({ ...item, id })),
            cashMovements: Object.entries(data.cashMovements || {}).map(([id, item]) => ({ ...item, id })),
            dayClosed: data.dayClosed === true
        };
        renderAccountingDashboard();
    });
}

async function saveAccountingRecord(collection, record) {
    const ref = getFirebaseAccountingRef();
    if (ref) return ref.child(collection).push(record);
    const records = getAccountingData()[collection] || [];
    records.unshift(record);
    localStorage.setItem(`cafe_ward_${collection === 'cashMovements' ? 'cash_mov' : collection}`, JSON.stringify(records));
}

async function removeAccountingRecord(collection, id) {
    const ref = getFirebaseAccountingRef();
    if (ref) return ref.child(collection).child(String(id)).remove();
    const records = (getAccountingData()[collection] || []).filter(item => String(item.id) !== String(id));
    localStorage.setItem(`cafe_ward_${collection === 'cashMovements' ? 'cash_mov' : collection}`, JSON.stringify(records));
}

function readLocalOrders() {
    return JSON.parse(localStorage.getItem('cafe_ward_orders') || '[]');
}

function renderAllOrderScreens() {
    renderOrders();
    renderKitchenOrders();
    if (document.getElementById('tasks-container')) renderAccountingDashboard();
    if (document.getElementById('accounting-orders-list')) renderAccountingData();
    if (document.getElementById('dashboard-sales')) renderSmartAccounting();
}

function getOrders() {
    return firebaseDatabase ? liveOrders : readLocalOrders();
}

function startOrdersRealtime() {
    if (ordersRealtimeStarted) return;
    ordersRealtimeStarted = true;
    const ordersRef = getFirebaseOrdersRef();
    if (!ordersRef) {
        showFirebaseSetupMessage();
        liveOrders = readLocalOrders();
        renderAllOrderScreens();
        return;
    }

    ordersRef.on('value', snapshot => {
        liveOrders = Object.entries(snapshot.val() || {})
            .map(([key, order]) => ({ ...order, id: order.id || key }))
            .sort((first, second) => (second.createdAt || 0) - (first.createdAt || 0));
        renderAllOrderScreens();
        notifyReadyOrders(liveOrders);
    });
}

window.addEventListener('DOMContentLoaded', () => {
    initializeProtectedPage();

    // 1. إنشاء شاشة الترحيب الأنيقة
    const splash = document.createElement('div');
    splash.id = 'splash-screen';
    splash.setAttribute('aria-label', 'شاشة التحميل');
    splash.innerHTML = '<img src="q.png" alt="كافيه ورد">';
    document.body.appendChild(splash);
    createSplashPetals(splash);

    setTimeout(() => {
        splash.classList.add('splash-hidden');
        setTimeout(() => splash.remove(), 650);
    }, 2400);

    // 2. توليد الورد المتناثر المتحرك في الخلفية
    createPetals();

    // 3. قراءة رقم الطاولة وإعداد المنيو
    startMenuRealtime();
    if (document.getElementById('tasks-container')) startAccountingRealtime();
    const urlParams = new URLSearchParams(window.location.search);
    const table = urlParams.get('table') || localStorage.getItem('cafe_ward_table');
    if (table) { tableNumber = table; }
    localStorage.setItem('cafe_ward_table', tableNumber);
    const tableSelector = document.getElementById('table-selector');
    if (tableSelector) {
        if (![...tableSelector.options].some(option => option.value === tableNumber)) {
            tableNumber = '1';
            localStorage.setItem('cafe_ward_table', tableNumber);
        }
        tableSelector.value = tableNumber;
        tableSelector.addEventListener('change', (event) => changeTable(event.target.value));
    }
    updateTableLabel();
    const badge = document.getElementById('table-badge');
    if (badge) { badge.innerText = `رقم الطاولة: ${tableNumber}`; }
    
    updateCartBadge();
});

// دالة إضافة أوراق الورد المتحركة
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

function displayMenu(items) {
    const grid = document.getElementById('menu-grid');
    if (!grid) return;
    grid.innerHTML = '';
    items.forEach(item => {
        grid.innerHTML += `
            <div class="menu-card">
                <img src="${item.img}" alt="${item.name}">
                <div class="menu-card-body">
                    <h3>${item.name}</h3>
                    <p>${item.desc}</p>
                    <div class="card-footer">
                        <span class="price">${item.price} ليرة</span>
                        <button class="add-btn" onclick="addToCart(${item.id})">إضافة</button>
                    </div>
                </div>
            </div>
        `;
    });
}

function filterMenu(category) {
    document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
    if (event) event.target.classList.add('active');

    const menu = getMenu();
    if (category === 'all') {
        displayMenu(menu);
    } else {
        displayMenu(menu.filter(i => i.category === category));
    }
}

function changeTable(value) {
    tableNumber = String(value);
    localStorage.setItem('cafe_ward_table', tableNumber);
    const badge = document.getElementById('table-badge');
    if (badge) badge.innerText = `رقم الطاولة: ${tableNumber}`;
    updateTableLabel();
}

function updateTableLabel() {
    const label = document.getElementById('selected-table-label');
    if (label) label.innerText = `رقم ${tableNumber}`;
}

function addToCart(id) {
    const menu = getMenu();
    const item = menu.find(i => i.id === id);
    const existing = cart.find(i => i.id === id);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ ...item, qty: 1 });
    }
    updateCartBadge();
}

function updateCartBadge() {
    const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
    const badge = document.getElementById('cart-count');
    if (badge) badge.innerText = totalCount;
}

function toggleCart() {
    const modal = document.getElementById('cart-modal');
    if (!modal) return;
    if (modal.style.display === 'flex') {
        modal.style.display = 'none';
    } else {
        renderCartItems();
        modal.style.display = 'flex';
    }
}

function renderCartItems() {
    const container = document.getElementById('cart-items');
    if (!container) return;
    container.innerHTML = '';
    if (cart.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888;">السلة فارغة حالياً</p>';
        document.getElementById('total-price').innerText = '0';
        return;
    }

    let total = 0;
    cart.forEach(item => {
        total += item.price * item.qty;
        container.innerHTML += `
            <div class="cart-item">
                <div>
                    <h4 style="color:#333;">${item.name}</h4>
                    <p style="color:var(--gold); font-size:12px;">${item.price} ليرة × ${item.qty}</p>
                </div>
                <div>
                    <button onclick='changeQty(${JSON.stringify(String(item.id))}, 1)' style="padding:2px 8px; background:var(--primary); color:#fff; border:none; cursor:pointer; border-radius:4px;">+</button>
                    <span style="margin: 0 8px; font-weight:bold;">${item.qty}</span>
                    <button onclick='changeQty(${JSON.stringify(String(item.id))}, -1)' style="padding:2px 8px; background:#ddd; color:#333; border:none; cursor:pointer; border-radius:4px;">-</button>
                </div>
            </div>
        `;
    });
    document.getElementById('total-price').innerText = total;
}

function changeQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (item) {
        item.qty += delta;
        if (item.qty <= 0) {
            cart = cart.filter(i => i.id !== id);
        }
    }
    updateCartBadge();
    renderCartItems();
}

async function checkout() {
    if (cart.length === 0) {
        alert('السلة فارغة!');
        return;
    }

    const newOrder = {
        id: Date.now(),
        table: tableNumber,
        items: [...cart],
        total: cart.reduce((sum, i) => sum + (i.price * i.qty), 0),
        status: 'قيد التحضير',
        time: new Date().toLocaleTimeString('ar-SY'),
        createdAt: Date.now()
    };

    if (firebaseDatabase) {
        await getFirebaseOrdersRef().child(String(newOrder.id)).set(newOrder);
    } else {
        const orders = readLocalOrders();
        orders.unshift(newOrder);
        localStorage.setItem('cafe_ward_orders', JSON.stringify(orders));
    }

    alert(`تم إرسال طلبك بنجاح من الطاولة رقم (${tableNumber})! سيصلك الطلب قريباً.`);
    cart = [];
    updateCartBadge();
    toggleCart();
}

async function addNewItem(e) {
    e.preventDefault();
    const name = document.getElementById('item-name').value;
    const category = document.getElementById('item-cat').value;
    const price = parseFloat(document.getElementById('item-price').value);
    const desc = document.getElementById('item-desc').value;
    const img = document.getElementById('item-img').value;

    const newItem = { name, category, price, desc, img, createdAt: Date.now() };
    const menuRef = getFirebaseMenuRef();

    try {
        if (menuRef) {
            await menuRef.push(newItem);
        } else {
            const menu = getMenu();
            menu.push({ ...newItem, id: Date.now() });
            saveMenu(menu);
        }
        alert('تمت إضافة الصنف بنجاح إلى المنيو!');
        document.getElementById('add-item-form').reset();
    } catch (error) {
        console.error('خطأ في إضافة الصنف إلى Firebase:', error);
        alert('حدث خطأ أثناء إرسال الصنف، تحقق من الاتصال وقواعد Firebase.');
    }
}

function renderAdminMenu() {
    const list = document.getElementById('admin-menu-list');
    if (!list) return;
    const menu = getMenu();
    list.innerHTML = '';
    if (menu.length === 0) {
        list.innerHTML = '<p style="color:#888;">لا توجد أصناف حالياً.</p>';
        return;
    }
    menu.forEach(item => {
        list.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#fafafa; padding:12px 15px; border-radius:8px; border:1px solid #eee;">
                <div>
                    <strong style="color:#333;">${item.name}</strong> - <span style="color:var(--gold);">${item.price} ليرة</span> (${item.category})
                </div>
                <button onclick='deleteMenuItem(${JSON.stringify(String(item.id))})' style="background:#e53935; color:#fff; border:none; padding:5px 12px; border-radius:5px; cursor:pointer;">حذف</button>
            </div>
        `;
    });
}

function deleteMenuItem(id) {
    if (confirm('هل أنت متأكد من حذف هذا الصنف؟')) {
        const menuRef = getFirebaseMenuRef();
        if (menuRef) {
            menuRef.child(String(id)).remove().catch(error => {
                console.error('خطأ في حذف الصنف من Firebase:', error);
                alert('تعذر حذف الصنف من قاعدة البيانات.');
            });
            return;
        }
        let menu = getMenu();
        menu = menu.filter(i => i.id !== id);
        saveMenu(menu);
        renderAdminMenu();
    }
}

function renderOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;
    const orders = getOrders();
    container.innerHTML = '';
    if (orders.length === 0) {
        container.innerHTML = '<p style="color:#888;">لا توجد طلبات جديدة حالياً...</p>';
        return;
    }

    orders.forEach(order => {
        let itemsHtml = order.items.map(i => `<li>${i.name} (${i.qty}) - ${i.price * i.qty} ليرة</li>`).join('');
        container.innerHTML += `
            <div style="background:#fff; border:1px solid ${order.status === 'جاهز' ? '#28a745' : '#f48fb1'}; padding:15px; border-radius:10px; margin-bottom:12px; box-shadow: 0 3px 10px rgba(0,0,0,0.03);">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <h3 style="color:var(--primary);">الطاولة رقم: ${order.table}</h3>
                    <span style="font-size:12px; color:#888;">${order.time}</span>
                </div>
                <ul style="margin-right:20px; margin-bottom:10px; color:#444;">${itemsHtml}</ul>
                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #eee; padding-top:10px;">
                    <strong style="color:#333;">الإجمالي: ${order.total} ليرة</strong>
                    <div>
                        <span style="background:${order.status === 'جاهز' ? '#28a745' : '#e91e63'}; color:#fff; padding:4px 10px; border-radius:4px; font-size:12px; margin-left:10px;">${order.status}</span>
                        ${order.status === 'جاهز' ? `<button onclick="updateOrderStatus(${order.id})" style="background:#28a745; color:#fff; border:0; padding:6px 10px; border-radius:4px; cursor:pointer;">تسليم الطلب</button>` : '<span style="color:#888; font-size:12px;">بانتظار المطبخ</span>'}
                        <button onclick="deleteOrder(${order.id})" style="background:transparent; color:#e53935; border:none; padding:4px 10px; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>
        `;
    });
}

async function updateOrderStatus(id) {
    const orders = getOrders();
    const order = orders.find(o => String(o.id) === String(id));
    if (order) {
        if (order.status !== 'جاهز') return;
        order.status = 'تم التوصيل';
        if (firebaseDatabase) {
            await getFirebaseOrdersRef().child(String(order.id)).update({ status: order.status });
        } else {
            localStorage.setItem('cafe_ward_orders', JSON.stringify(orders));
            renderOrders();
        }
    }
}

function renderKitchenOrders() {
    const container = document.getElementById('kitchen-orders-container');
    if (!container) return;
    const orders = getOrders();
    const activeOrders = orders.filter(order => order.status === 'قيد التحضير' || order.status === 'جاهز');
    container.innerHTML = activeOrders.length === 0 ? '<p style="color:#888;">لا توجد طلبات بانتظار التحضير.</p>' : activeOrders.map(order => `
        <article class="kitchen-order ${order.status === 'جاهز' ? 'is-ready' : ''}">
            <div class="kitchen-order-head"><h3>الطاولة رقم ${order.table}</h3><span>${order.time}</span></div>
            <ul>${order.items.map(item => `<li>${item.name} × ${item.qty}</li>`).join('')}</ul>
            <strong class="kitchen-status">${order.status}</strong>
            ${order.status === 'قيد التحضير' ? `<button class="btn-action" onclick="markOrderReady(${order.id})">تم تجهيز الطلب</button>` : '<span class="ready-note">بانتظار الكارسون</span>'}
        </article>
    `).join('');
}

async function markOrderReady(id) {
    const orders = getOrders();
    const order = orders.find(item => String(item.id) === String(id));
    if (!order) return;
    order.status = 'جاهز';
    order.readyAt = Date.now();
    if (firebaseDatabase) {
        await getFirebaseOrdersRef().child(String(order.id)).update({ status: order.status, readyAt: order.readyAt });
    } else {
        localStorage.setItem('cafe_ward_orders', JSON.stringify(orders));
        renderKitchenOrders();
    }
}

function startWaiterMonitor() {
    if (document.getElementById('orders-container')) notifyReadyOrders(getOrders());
}

function notifyReadyOrders(orders) {
    if (!document.getElementById('orders-container')) return;
    const seen = JSON.parse(sessionStorage.getItem('cafe_ward_seen_ready') || '[]');
    orders.filter(order => order.status === 'جاهز' && !seen.includes(order.id)).forEach(order => {
        showWaiterReadyNotification(order);
        seen.push(order.id);
    });
    sessionStorage.setItem('cafe_ward_seen_ready', JSON.stringify(seen));
}

function showWaiterReadyNotification(order) {
    playBellSound();
    const notice = document.createElement('div');
    notice.className = 'ready-notification';
    notice.innerHTML = `<i class="fa-solid fa-bell"></i><span>الطلب جاهز للطاولة رقم <strong>${order.table}</strong></span>`;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 10000);
}

function enableWaiterBell() {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    context.resume();
    context.close();
    const button = document.getElementById('enable-bell-btn');
    if (button) button.innerText = 'رنة الجرس مفعلة';
}

function playBellSound() {
    try {
        const context = new (window.AudioContext || window.webkitAudioContext)();
        [0, 0.18].forEach((delay, index) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = index ? 880 : 660;
            oscillator.type = 'sine';
            gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + delay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.35);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start(context.currentTime + delay);
            oscillator.stop(context.currentTime + delay + 0.4);
        });
        setTimeout(() => context.close(), 1000);
    } catch (error) {
        // صوت الجرس اختياري حسب دعم المتصفح.
    }
}

async function deleteOrder(id) {
    if (firebaseDatabase) {
        await getFirebaseOrdersRef().child(String(id)).remove();
        return;
    }
    const orders = readLocalOrders().filter(o => String(o.id) !== String(id));
    localStorage.setItem('cafe_ward_orders', JSON.stringify(orders));
    renderOrders();
}

// دوال المحاسبة والكاشير الشاملة
function renderAccountingData() {
    const orders = getOrders();
    
    let totalRevenue = 0;
    let completedCount = 0;

    orders.forEach(order => {
        totalRevenue += order.total;
        completedCount += 1;
    });

    const avgOrder = completedCount > 0 ? Math.round(totalRevenue / completedCount) : 0;

    // تحديث البطاقات الإحصائية
    const revEl = document.getElementById('total-revenue');
    const countEl = document.getElementById('total-orders-count');
    const avgEl = document.getElementById('avg-order-value');

    if (revEl) revEl.innerText = `${totalRevenue} ليرة`;
    if (countEl) countEl.innerText = completedCount;
    if (avgEl) avgEl.innerText = `${avgOrder} ليرة`;

    // عرض تفاصيل الفواتير في الجدول أو القائمة
    const listContainer = document.getElementById('accounting-orders-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    if (orders.length === 0) {
        listContainer.innerHTML = '<p style="color:#888; text-align:center;">لا توجد فواتير مسجلة في الصندوق حالياً...</p>';
        return;
    }

    orders.forEach(order => {
        let itemsSummary = order.items.map(i => `${i.name} (${i.qty})`).join('، ');
        listContainer.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#fafafa; padding:15px; border-radius:8px; border:1px solid #eee;">
                <div>
                    <strong style="color:var(--primary);">الطاولة رقم: ${order.table}</strong> 
                    <span style="color:#666; font-size:13px; margin-right:10px;">(${order.time})</span>
                    <p style="color:#444; font-size:13px; margin-top:5px;">الأصناف: ${itemsSummary}</p>
                </div>
                <div style="text-align: left;">
                    <span style="color:var(--gold); font-size:16px; font-weight:bold; display:block; margin-bottom:5px;">${order.total} ليرة</span>
                    <span style="background:${order.status === 'تم التوصيل' ? '#28a745' : '#e91e63'}; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px;">${order.status}</span>
                </div>
            </div>
        `;
    });
}

function clearAccountingData() {
    if (confirm('هل أنت متأكد من تصفير الصندوق وحذف كافة سجلات الفواتير والمبيعات؟')) {
        localStorage.removeItem('cafe_ward_orders');
        renderAccountingData();
        alert('تم تصفير الصندوق بنجاح.');
    }
}

// دوال النظام المحاسبي الذكي
function renderSmartAccounting() {
    const orders = getOrders();
    const expenses = JSON.parse(localStorage.getItem('cafe_ward_expenses') || '[]');

    let totalRevenue = 0;
    let completedCount = 0;

    orders.forEach(order => {
        totalRevenue += order.total;
        completedCount += 1;
    });

    let totalExpenses = 0;
    expenses.forEach(exp => {
        totalExpenses += exp.amount;
    });

    let netCash = totalRevenue - totalExpenses;

    // تحديث الواجهة
    document.getElementById('total-revenue').innerText = `${totalRevenue} ليرة`;
    document.getElementById('total-expenses').innerText = `${totalExpenses} ليرة`;
    document.getElementById('net-cash').innerText = `${netCash} ليرة`;
    document.getElementById('total-orders-count').innerText = completedCount;

    // عرض الفواتير
    const listContainer = document.getElementById('accounting-orders-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    
    // دمج عرض المصروفات مع الفواتير أو عرضها بمرونة
    if (orders.length === 0 && expenses.length === 0) {
        listContainer.innerHTML = '<p style="color:#888; text-align:center;">الصندوق فارغ حالياً ولا توجد حركات مسجلة.</p>';
        return;
    }

    // عرض المصروفات أولاً إن وجدت
    expenses.forEach(exp => {
        listContainer.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#fff5f5; padding:12px 15px; border-radius:8px; border:1px solid #ffccd5;">
                <div>
                    <strong style="color:#e53935;"><i class="fa-solid fa-arrow-down"></i> مصروف نثري: ${exp.title}</strong>
                    <span style="color:#666; font-size:12px; margin-right:10px;">(${exp.time})</span>
                </div>
                <span style="color:#e53935; font-size:15px; font-weight:bold;">- ${exp.amount} ليرة</span>
            </div>
        `;
    });

    // عرض الطلبات والمبيعات
    orders.forEach(order => {
        let itemsSummary = order.items.map(i => `${i.name} (${i.qty})`).join('، ');
        listContainer.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#fafafa; padding:12px 15px; border-radius:8px; border:1px solid #eee;">
                <div>
                    <strong style="color:var(--primary);">الطاولة رقم: ${order.table}</strong> 
                    <span style="color:#666; font-size:12px; margin-right:10px;">(${order.time})</span>
                    <p style="color:#444; font-size:13px; margin-top:3px;">الأصناف: ${itemsSummary}</p>
                </div>
                <div style="text-align: left;">
                    <span style="color:var(--gold); font-size:15px; font-weight:bold; display:block;">+ ${order.total} ليرة</span>
                    <span style="background:#28a745; color:#fff; padding:2px 6px; border-radius:4px; font-size:11px;">مكتمل</span>
                </div>
            </div>
        `;
    });
}

async function addExpense(e) {
    e.preventDefault();
    const title = document.getElementById('exp-title').value;
    const amount = parseFloat(document.getElementById('exp-amount').value);

    const expenses = JSON.parse(localStorage.getItem('cafe_ward_expenses') || '[]');
    expenses.unshift({
        id: Date.now(),
        title,
        amount,
        time: new Date().toLocaleTimeString('ar-SY')
    });

    localStorage.setItem('cafe_ward_expenses', JSON.stringify(expenses));
    document.getElementById('expense-form').reset();
    renderSmartAccounting();
    alert('تم تسجيل المصروف بنجاح وخصمه من الصندوق.');
}

function calculateChange() {
    const total = parseFloat(document.getElementById('calc-total').value) || 0;
    const paid = parseFloat(document.getElementById('calc-paid').value) || 0;
    const change = paid - total;
    const resEl = document.getElementById('calc-change-result');
    if (resEl) {
        resEl.innerText = change >= 0 ? change : 0;
    }
}

function clearAccountingData() {
    if (confirm('هل أنت متأكد من تصفير الصندوق وحذف جميع المبيعات والمصروفات؟')) {
        localStorage.removeItem('cafe_ward_orders');
        localStorage.removeItem('cafe_ward_expenses');
        renderSmartAccounting();
        alert('تم تصفير الصندوق بنجاح.');
    }
}



// --- دوال النظام المحاسبي الذكي وتوجيه المهام ---

function renderAccountingDashboard() {
    const orders = getOrders();
    const expenses = JSON.parse(localStorage.getItem('cafe_ward_expenses') || '[]');
    const clients = JSON.parse(localStorage.getItem('cafe_ward_clients') || '[]');
    const suppliers = JSON.parse(localStorage.getItem('cafe_ward_suppliers') || '[]');
    const isClosed = localStorage.getItem('cafe_ward_day_closed') === 'true';

    // حساب الإيرادات والمصروفات
    let totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    let totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    let totalSuppliersDue = suppliers.reduce((sum, s) => sum + s.amount, 0);
    let totalClientsDue = clients.reduce((sum, c) => sum + c.amount, 0);

    // 1. مركز المهام التنبيهية (Action Center)
    const tasksContainer = document.getElementById('tasks-container');
    if (tasksContainer) {
        tasksContainer.innerHTML = '';
        let taskCount = 0;

        // فحص إغلاق الصندوق
        if (!isClosed) {
            taskCount++;
            tasksContainer.innerHTML += `<article class="accounting-task task-blue"><div class="task-icon"><i class="fa-solid fa-cash-register"></i></div><div class="task-copy"><strong>إغلاق الصندوق</strong><span>المطابقة اليومية لم تُغلق بعد</span></div><button onclick="toggleCloseDay()">إغلاق الآن</button></article>`;
        } else {
            tasksContainer.innerHTML += `<article class="accounting-task task-green"><div class="task-icon"><i class="fa-solid fa-circle-check"></i></div><div class="task-copy"><strong>الصندوق مغلق</strong><span>تم تثبيت حسابات الوردية بنجاح</span></div><b class="task-done">مكتمل</b></article>`;
        }

        // فحص ديون العملاء
        if (clients.length > 0) {
            taskCount++;
            tasksContainer.innerHTML += `<article class="accounting-task task-orange"><div class="task-icon"><i class="fa-solid fa-users"></i></div><div class="task-copy"><strong>ذمم العملاء</strong><span>${clients.length} حسابات مستحقة بقيمة ${totalClientsDue} ليرة</span></div><a href="#clients-list">عرض التفاصيل</a></article>`;
        }

        // فحص مستحقات الموردين
        if (suppliers.length > 0) {
            taskCount++;
            tasksContainer.innerHTML += `<article class="accounting-task task-red"><div class="task-icon"><i class="fa-solid fa-truck-field"></i></div><div class="task-copy"><strong>مستحقات الموردين</strong><span>${suppliers.length} فواتير بقيمة ${totalSuppliersDue} ليرة</span></div><a href="#suppliers-list">عرض التفاصيل</a></article>`;
        }

        if (taskCount === 0) {
            tasksContainer.innerHTML = '<div class="tasks-empty"><i class="fa-solid fa-circle-check"></i><strong>كل شيء مرتب</strong><span>لا توجد مهام معلقة حاليًا</span></div>';
        }

        const tasksCount = document.getElementById('tasks-count');
        if (tasksCount) tasksCount.innerText = `${taskCount} ${taskCount === 1 ? 'مهمة' : 'مهام'}`;
    }

    // 2. تحديث قسم المصروفات
    const expList = document.getElementById('expenses-list');
    if (expList) {
        expList.innerHTML = expenses.length === 0 ? 'لا توجد مصروفات مسجلة اليوم.' : 
            expenses.map(e => `<div style="display:flex; justify-content:space-between; background:#fafafa; padding:6px 10px; border-bottom:1px solid #eee;"><span>${e.title} (${e.category})</span><strong style="color:#e53935;">${e.amount} ليرة</strong></div>`).join('');
    }

    // 3. تحديث قسم العملاء
    const clientList = document.getElementById('clients-list');
    if (clientList) {
        clientList.innerHTML = clients.length === 0 ? 'لا توجد ذمم عملاء مسجلة.' :
            clients.map(c => `<div style="display:flex; justify-content:space-between; background:#fafafa; padding:6px 10px; border-bottom:1px solid #eee;"><span>العميل: ${c.name} (استحقاق: ${c.date})</span><div><strong style="color:var(--gold);">${c.amount} ليرة</strong> <button onclick='deleteClient(${JSON.stringify(String(c.id))})' style="background:none; border:none; color:red; cursor:pointer; margin-right:8px;">[سداد/حذف]</button></div></div>`).join('');
    }

    // 4. تحديث قسم الموردين
    const supList = document.getElementById('suppliers-list');
    if (supList) {
        supList.innerHTML = suppliers.length === 0 ? 'لا توجد مستحقات للموردين.' :
            suppliers.map(s => `<div style="display:flex; justify-content:space-between; background:#fafafa; padding:6px 10px; border-bottom:1px solid #eee;"><span>المورد: ${s.name} (استحقاق: ${s.date})</span><div><strong style="color:#e65100;">${s.amount} ليرة</strong> <button onclick='deleteSupplier(${JSON.stringify(String(s.id))})' style="background:none; border:none; color:red; cursor:pointer; margin-right:8px;">[دفع/حذف]</button></div></div>`).join('');
    }

    // 5. تحديث مطابقة الصندوق ومؤشرات الأرباح والخسائر
    document.getElementById('pos-total-sales').innerText = `${totalRevenue} ليرة`;
    document.getElementById('pos-total-exp').innerText = `${totalExpenses} ليرة`;

    document.getElementById('report-revenue').innerText = `${totalRevenue} ليرة`;
    document.getElementById('report-expenses').innerText = `${totalExpenses + totalSuppliersDue} ليرة`;
    document.getElementById('report-net').innerText = `${totalRevenue - (totalExpenses + totalSuppliersDue)} ليرة`;
}

// دوال الإضافة والحذف
async function addExpense(e) {
    e.preventDefault();
    const title = document.getElementById('exp-title').value;
    const category = document.getElementById('exp-category').value;
    const amount = parseFloat(document.getElementById('exp-amount').value);

    await saveAccountingRecord('expenses', { title, category, amount, time: new Date().toLocaleTimeString('ar-SY'), createdAt: Date.now() });
    document.getElementById('expense-form').reset();
    renderAccountingDashboard();
}

async function addClientDebt(e) {
    e.preventDefault();
    const name = document.getElementById('client-name').value;
    const amount = parseFloat(document.getElementById('client-debt').value);
    const date = document.getElementById('client-date').value;

    await saveAccountingRecord('clients', { name, amount, date, createdAt: Date.now() });
    document.getElementById('client-form').reset();
    renderAccountingDashboard();
}

async function deleteClient(id) {
    await removeAccountingRecord('clients', id);
    renderAccountingDashboard();
}

async function addSupplierBill(e) {
    e.preventDefault();
    const name = document.getElementById('supplier-name').value;
    const amount = parseFloat(document.getElementById('supplier-amount').value);
    const date = document.getElementById('supplier-date').value;

    await saveAccountingRecord('suppliers', { name, amount, date, createdAt: Date.now() });
    document.getElementById('supplier-form').reset();
    renderAccountingDashboard();
}

async function deleteSupplier(id) {
    await removeAccountingRecord('suppliers', id);
    renderAccountingDashboard();
}

function toggleCloseDay() {
    const isClosed = localStorage.getItem('cafe_ward_day_closed') === 'true';
    localStorage.setItem('cafe_ward_day_closed', !isClosed);
    renderAccountingDashboard();
    alert(!isClosed ? 'تم إغلاق الصندوق بنجاح وإثبات الوردية.' : 'تم إعادة فتح الوردية.');
}


// --- دوال النظام المحاسبي المتكامل بـ 8 مهام ---

function renderAccountingDashboard() {
    const orders = getOrders();
    const accounting = getAccountingData();
    const expenses = accounting.expenses;
    const clients = accounting.clients;
    const suppliers = accounting.suppliers;
    const unpaidInvoices = accounting.unpaid;
    const cashMovements = accounting.cashMovements;
    const isClosed = accounting.dayClosed;

    // المجاميع الحسابية
    let totalSales = orders.reduce((sum, o) => sum + o.total, 0);
    let totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    let totalSuppliers = suppliers.reduce((sum, s) => sum + s.amount, 0);
    let totalClientsDue = clients.reduce((sum, c) => sum + c.amount, 0);

    // 1. لوحة مهام اليوم
    const tasksContainer = document.getElementById('tasks-container');
    if (tasksContainer) {
        tasksContainer.innerHTML = '';
        let taskCount = 0;

        if (!isClosed) {
            taskCount++;
            tasksContainer.innerHTML += `<article class="accounting-task task-blue"><div class="task-icon"><i class="fa-solid fa-cash-register"></i></div><div class="task-copy"><strong>إغلاق الصندوق</strong><span>المطابقة اليومية لم تُغلق بعد</span></div><button onclick="toggleCloseDay()">إغلاق الآن</button></article>`;
        } else {
            tasksContainer.innerHTML += `<article class="accounting-task task-green"><div class="task-icon"><i class="fa-solid fa-circle-check"></i></div><div class="task-copy"><strong>الصندوق مغلق</strong><span>تم تثبيت حسابات الوردية بنجاح</span></div><b class="task-done">مكتمل</b></article>`;
        }

        if (unpaidInvoices.some(i => i.status === 'متأخرة')) {
            taskCount++;
            tasksContainer.innerHTML += `<article class="accounting-task task-red"><div class="task-icon"><i class="fa-solid fa-file-invoice"></i></div><div class="task-copy"><strong>فواتير متأخرة</strong><span>توجد فواتير غير مسددة تحتاج متابعة</span></div><a href="#unpaid-invoices-tbody">عرض التفاصيل</a></article>`;
        }

        if (totalSuppliers > 0) {
            taskCount++;
            tasksContainer.innerHTML += `<article class="accounting-task task-orange"><div class="task-icon"><i class="fa-solid fa-truck-field"></i></div><div class="task-copy"><strong>مستحقات الموردين</strong><span>إجمالي المستحقات ${totalSuppliers} ليرة</span></div><a href="#suppliers-list">عرض التفاصيل</a></article>`;
        }

        if (taskCount === 0) {
            tasksContainer.innerHTML = '<div class="tasks-empty"><i class="fa-solid fa-circle-check"></i><strong>كل شيء مرتب</strong><span>لا توجد مهام معلقة حاليًا</span></div>';
        }

        const tasksCount = document.getElementById('tasks-count');
        if (tasksCount) tasksCount.innerText = `${taskCount} ${taskCount === 1 ? 'مهمة' : 'مهام'}`;
    }

    // 2. تحديث قسم المصروفات
    const expList = document.getElementById('expenses-list');
    if (expList) {
        expList.innerHTML = expenses.length === 0 ? 'لا توجد مصروفات مسجلة.' :
            expenses.map(e => `<div style="display:flex; justify-content:space-between; background:#fafafa; padding:6px 10px; border-bottom:1px solid #eee;"><span>${e.title} (${e.category}) - ${e.time}</span><strong style="color:#e53935;">${e.amount} ليرة</strong></div>`).join('');
    }

    // 3. تحديث العملاء
    const clientList = document.getElementById('clients-list');
    if (clientList) {
        clientList.innerHTML = clients.length === 0 ? 'لا توجد ذمم عملاء.' :
            clients.map(c => `<div style="display:flex; justify-content:space-between; background:#fafafa; padding:6px 10px; border-bottom:1px solid #eee;"><span>العميل: ${c.name} (استحقاق: ${c.date})</span><div><strong style="color:var(--gold);">${c.amount} ليرة</strong> <button onclick='deleteClient(${JSON.stringify(String(c.id))})' style="background:none; border:none; color:red; cursor:pointer; margin-right:8px;">[سداد]</button></div></div>`).join('');
    }

    // 4. تحديث الموردين
    const supList = document.getElementById('suppliers-list');
    if (supList) {
        supList.innerHTML = suppliers.length === 0 ? 'لا توجد مستحقات للموردين.' :
            suppliers.map(s => `<div style="display:flex; justify-content:space-between; background:#fafafa; padding:6px 10px; border-bottom:1px solid #eee;"><span>المورد: ${s.name} (استحقاق: ${s.date})</span><div><strong style="color:#e65100;">${s.amount} ليرة</strong> <button onclick='deleteSupplier(${JSON.stringify(String(s.id))})' style="background:none; border:none; color:red; cursor:pointer; margin-right:8px;">[دفع]</button></div></div>`).join('');
    }

    // 5. حسابات تسوية الصندوق
    window.currentSalesForBox = totalSales;
    window.currentExpensesForBox = totalExpenses;
    calculateCashSettlement();

    // 6. عرض الفواتير غير المسددة
    const unpaidTbody = document.getElementById('unpaid-invoices-tbody');
    if (unpaidTbody) {
        if (unpaidInvoices.length === 0) {
            unpaidTbody.innerHTML = `<tr><td colspan="8" style="color:#888;">لا توجد فواتير غير مسددة مسجلة.</td></tr>`;
        } else {
            unpaidTbody.innerHTML = unpaidInvoices.map(i => {
                let remaining = i.total - i.paid;
                let badgeColor = i.status === 'متأخرة' ? '#c62828' : (i.status === 'جزئية' ? '#ef6c00' : '#1565c0');
                return `
                    <tr>
                        <td>${i.num}</td>
                        <td>${i.client}</td>
                        <td>${i.total} ليرة</td>
                        <td>${i.paid} ليرة</td>
                        <td style="font-weight:bold; color:red;">${remaining} ليرة</td>
                        <td>${i.dueDate}</td>
                        <td><span style="background:${badgeColor}; color:#fff; padding:2px 6px; border-radius:4px; font-size:11px;">${i.status}</span></td>
                        <td><button onclick='deleteUnpaid(${JSON.stringify(String(i.id))})' style="background:none; border:none; color:red; cursor:pointer;">[حذف]</button></td>
                    </tr>
                `;
            }).join('');
        }
    }

    // 7. تقرير الأرباح والخسائر
    document.getElementById('rep-sales').innerText = `${totalSales} ليرة`;
    document.getElementById('rep-suppliers').innerText = `${totalSuppliers} ليرة`;
    document.getElementById('rep-expenses').innerText = `${totalExpenses} ليرة`;
    document.getElementById('rep-netprofit').innerText = `${totalSales - (totalExpenses + totalSuppliers)} ليرة`;

    const dashboardKpis = {
        'dashboard-sales': `${totalSales} ليرة`,
        'dashboard-expenses': `${totalExpenses} ليرة`,
        'dashboard-suppliers': `${totalSuppliers} ليرة`,
        'dashboard-profit': `${totalSales - (totalExpenses + totalSuppliers)} ليرة`
    };
    Object.entries(dashboardKpis).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.innerText = value;
    });

    // 8. حركة الحسابات
    const cashList = document.getElementById('cash-movements-list');
    if (cashList) {
        cashList.innerHTML = cashMovements.length === 0 ? 'لا توجد حركات نقدية مسجلة اليوم.' :
            cashMovements.map(m => `<div style="display:flex; justify-content:space-between; background:#fafafa; padding:5px 8px; border-bottom:1px solid #eee;"><span>[${m.type}] ${m.desc}</span><strong>${m.val} ليرة</strong></div>`).join('');
    }

    // 9. ملخص الإقفال اليومي
    const closingSummary = document.getElementById('daily-closing-summary');
    if (closingSummary) {
        let netCollected = totalSales - totalExpenses;
        closingSummary.innerHTML = `
            مبيعات اليوم: <strong>${totalSales} ليرة</strong> | 
            مصروفات: <strong style="color:red;">${totalExpenses} ليرة</strong><br>
            المقبوض الصافي: <strong style="color:green;">${netCollected} ليرة</strong> | 
            رصيد الصندوق المتوقع: <strong>${parseFloat(document.getElementById('opening-balance').value || 0) + netCollected} ليرة</strong><br>
            الحالة العامة: <span style="color:${isClosed ? 'green' : 'orange'}; font-weight:bold;">${isClosed ? 'مغلق ومؤكد ✅' : 'جاهز للإغلاق ⏳'}</span>
        `;
    }
}

// دوال الحسابات والتسوية
function calculateCashSettlement() {
    const opening = parseFloat(document.getElementById('opening-balance').value) || 0;
    const actual = parseFloat(document.getElementById('actual-balance').value) || 0;
    const sales = window.currentSalesForBox || 0;
    const expenses = window.currentExpensesForBox || 0;

    const expected = opening + sales - expenses;
    const diff = actual - expected;

    const expEl = document.getElementById('expected-balance-val');
    const diffEl = document.getElementById('diff-balance-val');

    if (expEl) expEl.innerText = `${expected} ليرة`;
    if (diffEl) {
        diffEl.innerText = `${diff} ليرة`;
        diffEl.style.color = diff === 0 ? 'green' : (diff > 0 ? 'blue' : 'red');
    }
}

// دوال الإضافة والحذف المتنوعة
async function addExpense(e) {
    e.preventDefault();
    const title = document.getElementById('exp-title').value;
    const category = document.getElementById('exp-category').value;
    const amount = parseFloat(document.getElementById('exp-amount').value);

    await saveAccountingRecord('expenses', { title, category, amount, time: new Date().toLocaleTimeString('ar-SY'), createdAt: Date.now() });
    document.getElementById('expense-form').reset();
    renderAccountingDashboard();
}

async function addClientDebt(e) {
    e.preventDefault();
    const name = document.getElementById('client-name').value;
    const amount = parseFloat(document.getElementById('client-debt').value);
    const date = document.getElementById('client-date').value;

    await saveAccountingRecord('clients', { name, amount, date, createdAt: Date.now() });
    document.getElementById('client-form').reset();
    renderAccountingDashboard();
}

async function deleteClient(id) {
    await removeAccountingRecord('clients', id);
    renderAccountingDashboard();
}

async function addSupplierBill(e) {
    e.preventDefault();
    const name = document.getElementById('supplier-name').value;
    const amount = parseFloat(document.getElementById('supplier-amount').value);
    const date = document.getElementById('supplier-date').value;

    await saveAccountingRecord('suppliers', { name, amount, date, createdAt: Date.now() });
    document.getElementById('supplier-form').reset();
    renderAccountingDashboard();
}

async function deleteSupplier(id) {
    await removeAccountingRecord('suppliers', id);
    renderAccountingDashboard();
}

async function addUnpaidInvoice(e) {
    e.preventDefault();
    const num = document.getElementById('inv-num').value;
    const client = document.getElementById('inv-client').value;
    const total = parseFloat(document.getElementById('inv-total').value);
    const paid = parseFloat(document.getElementById('inv-paid').value) || 0;
    const dueDate = document.getElementById('inv-duedate').value;

    let status = 'مستحقة';
    if (paid === 0) status = 'متأخرة';
    else if (paid < total) status = 'جزئية';

    await saveAccountingRecord('unpaid', { num, client, total, paid, dueDate, status, createdAt: Date.now() });
    document.getElementById('unpaid-form').reset();
    renderAccountingDashboard();
}

async function deleteUnpaid(id) {
    await removeAccountingRecord('unpaid', id);
    renderAccountingDashboard();
}

async function addCashMovement(e) {
    e.preventDefault();
    const type = document.getElementById('cash-type').value;
    const desc = document.getElementById('cash-desc').value;
    const val = parseFloat(document.getElementById('cash-val').value);

    await saveAccountingRecord('cashMovements', { type, desc, val, createdAt: Date.now() });
    document.getElementById('cash-movement-form').reset();
    renderAccountingDashboard();
}

async function executeDailyClosing() {
    const isClosed = getAccountingData().dayClosed;
    const accountingRef = getFirebaseAccountingRef();
    if (accountingRef) {
        await accountingRef.child('dayClosed').set(!isClosed);
    } else {
        localStorage.setItem('cafe_ward_day_closed', String(!isClosed));
    }
    renderAccountingDashboard();
    alert(!isClosed ? 'تم إغلاق الوردية واليوم المحاسبي بنجاح ✅' : 'تم إعادة فتح الوردية.');
}

/* واجهة موحّدة وربط بيانات أكثر اعتمادية بين جميع شاشات كافيه ورد */
function formatWardDateTime(value) {
    const date = value ? new Date(value) : new Date();
    return new Intl.DateTimeFormat('ar-SY', {
        dateStyle: 'medium',
        timeStyle: 'short',
        hour12: true
    }).format(date);
}

function escapeHtml(value) {
    const node = document.createElement('span');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
}

function addCafeNavigation() {
    const header = document.querySelector('header');
    if (!header || document.getElementById('cafe-main-nav')) return;
    header.querySelectorAll(':scope > div').forEach(section => {
        if (section.querySelector('a[href$=".html"]')) section.classList.add('legacy-page-links');
    });

    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const pages = [
        ['index.html', 'fa-mug-hot', 'المنيو'],
        ['waiter.html', 'fa-bell-concierge', 'الكارسون'],
        ['kitchen.html', 'fa-kitchen-set', 'المطبخ'],
        ['admin.html', 'fa-sliders', 'الإدارة'],
        ['accounting.html', 'fa-chart-pie', 'الحسابات']
    ];
    const nav = document.createElement('nav');
    nav.id = 'cafe-main-nav';
    nav.setAttribute('aria-label', 'التنقل الرئيسي');
    nav.innerHTML = pages.map(([href, icon, label]) =>
        `<a href="${href}" class="${currentPage === href ? 'is-current' : ''}"><i class="fa-solid ${icon}"></i><span>${label}</span></a>`
    ).join('');

    const clock = document.createElement('div');
    clock.id = 'ward-live-clock';
    clock.setAttribute('aria-label', 'الوقت الحالي');
    header.append(nav, clock);
    const updateClock = () => { clock.textContent = formatWardDateTime(Date.now()); };
    updateClock();
    window.setInterval(updateClock, 30000);
}

function normalizeMenuId(id) {
    return String(id);
}

function addToCart(id) {
    const normalizedId = normalizeMenuId(id);
    const item = getMenu().find(menuItem => normalizeMenuId(menuItem.id) === normalizedId);
    if (!item) return;
    const existing = cart.find(cartItem => normalizeMenuId(cartItem.id) === normalizedId);
    if (existing) existing.qty += 1;
    else cart.push({ ...item, qty: 1 });
    updateCartBadge();
}

function displayMenu(items) {
    const grid = document.getElementById('menu-grid');
    if (!grid) return;
    grid.innerHTML = items.map(item => `
        <article class="menu-card">
            <img src="${escapeHtml(item.img)}" alt="${escapeHtml(item.name)}">
            <div class="menu-card-body">
                <h3>${escapeHtml(item.name)}</h3>
                <p>${escapeHtml(item.desc)}</p>
                <div class="card-footer">
                    <span class="price">${Number(item.price).toLocaleString('ar-SY')} ليرة</span>
                    <button class="add-btn" type="button" data-item-id="${escapeHtml(item.id)}">إضافة</button>
                </div>
            </div>
        </article>`).join('');
    grid.querySelectorAll('[data-item-id]').forEach(button => {
        button.addEventListener('click', () => addToCart(button.dataset.itemId));
    });
}

async function checkout() {
    if (cart.length === 0) {
        alert('السلة فارغة. أضف صنفًا أولًا.');
        return;
    }
    const createdAt = Date.now();
    const newOrder = {
        id: String(createdAt),
        table: tableNumber,
        items: cart.map(item => ({ ...item, id: String(item.id) })),
        total: cart.reduce((sum, item) => sum + (Number(item.price) * item.qty), 0),
        status: 'قيد التحضير',
        createdAt,
        time: formatWardDateTime(createdAt)
    };
    try {
        const ref = getFirebaseOrdersRef();
        if (ref) await ref.child(newOrder.id).set(newOrder);
        else {
            const orders = readLocalOrders();
            orders.unshift(newOrder);
            localStorage.setItem('cafe_ward_orders', JSON.stringify(orders));
        }
        alert(`تم إرسال طلب الطاولة رقم ${tableNumber} في ${newOrder.time}.`);
        cart = [];
        updateCartBadge();
        toggleCart();
    } catch (error) {
        console.error('تعذر حفظ الطلب:', error);
        alert('تعذر إرسال الطلب. تحقق من اتصال قاعدة البيانات ثم حاول مجددًا.');
    }
}

async function saveAccountingRecord(collection, record) {
    const createdAt = record.createdAt || Date.now();
    const completeRecord = { ...record, createdAt, time: record.time || formatWardDateTime(createdAt) };
    const ref = getFirebaseAccountingRef();
    if (ref) return ref.child(collection).push(completeRecord);
    const records = getAccountingData()[collection] || [];
    records.unshift({ ...completeRecord, id: String(createdAt) });
    localStorage.setItem(`cafe_ward_${collection === 'cashMovements' ? 'cash_mov' : collection}`, JSON.stringify(records));
}

async function toggleCloseDay() {
    return executeDailyClosing();
}

window.addEventListener('DOMContentLoaded', addCafeNavigation);
