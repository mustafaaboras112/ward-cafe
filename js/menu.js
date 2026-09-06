let cart = [];
let tableNumber = '1';
let checkoutBusy = false;
let activeCategory = null;
function customerOrderIds() { return JSON.parse(sessionStorage.getItem('ward-order-ids') || '[]'); }
function customerMessage(order) {
    if (order.paymentStatus === 'مدفوع') return 'تم الدفع، شكراً لزيارتك';
    return {'قيد التحضير':'طلبك قيد التحضير','جاهز':'طلبك في طريقه إلى الطاولة','تم التوصيل':'تم توصيل طلبك إلى الطاولة'}[order.status] || order.status;
}
function renderCustomerOrders() {
    const container = document.getElementById('customer-orders');
    if (!container) return;
    const owned = getOrders().filter(order=>order.clientId===customerId() || customerOrderIds().includes(String(order.id)));
    container.innerHTML = owned.map(order=>`<article class="customer-order-status"><strong>طاولة ${escapeHtml(order.table)}</strong><p>${escapeHtml(customerMessage(order))}</p><small>رقم الطلب: ${escapeHtml(order.id)}</small></article>`).join('');
    const seen=JSON.parse(sessionStorage.getItem('ward-ready-seen') || '[]');
    for (const order of owned) {
        if ((order.readyAt || order.status==='جاهز') && order.paymentStatus !== 'مدفوع' && !seen.includes(String(order.id))) {
            showCustomerReadyNotification(order,'customer-ready-'+order.id);
            seen.push(String(order.id));
        }
    }
    sessionStorage.setItem('ward-ready-seen',JSON.stringify(seen));
    const active=owned.filter(order=>order.paymentStatus!=='مدفوع').sort((a,b)=>b.createdAt-a.createdAt)[0];
    if(active && validTable(active.table)) {
        tableNumber=String(active.table); localStorage.setItem('cafe_ward_table',tableNumber);
        document.getElementById('table-selector').value=tableNumber; updateTableLabel();
    }
}
function renderCustomerTables() {
    const selector=document.getElementById('table-selector');
    if(!selector) return;
    for(const option of selector.options) {
        const status=getLocalTableStatus(option.value);
        option.disabled=status?.status==='occupied' && status.clientId!==customerId();
        option.textContent=`طاولة ${option.value}${option.disabled?' (محجوزة)':''}`;
    }
}
window.addEventListener('ward:orders',renderCustomerOrders);
window.addEventListener('ward:tables',renderCustomerTables);
window.addEventListener('ward:menu',()=>{displayMenu(getMenu());if(activeCategory)renderCategoryItems(getMenu().filter(item=>item.category===activeCategory));});
window.addEventListener('DOMContentLoaded',()=>{
    const requested=new URLSearchParams(location.search).get('table') || localStorage.getItem('cafe_ward_table');
    if(validTable(requested)) tableNumber=String(requested);
    const selector=document.getElementById('table-selector');
    selector.value=tableNumber; selector.addEventListener('change',event=>changeTable(event.target.value));
    updateTableLabel(); updateCartBadge(); renderCustomerTables();
    startMenuRealtime(); startOrdersRealtime(); startTablesRealtime();
});

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
    if (!validTable(value)) return;
    const status = getLocalTableStatus(value);
    if (status && status.status === 'occupied' && status.clientId !== customerId()) {
        alert('الطاولة محجوزة حالياً. اختر طاولة متاحة.');
        document.getElementById('table-selector').value = tableNumber; return;
    }
    tableNumber = String(value);
    localStorage.setItem('cafe_ward_table', tableNumber);
    updateTableLabel();
}

function updateTableLabel() {
    const label = document.getElementById('selected-table-label');
    if (label) label.innerText = `رقم ${tableNumber}`;
    const badge=document.getElementById('table-badge');
    if(badge) badge.textContent=`رقم الطاولة: ${tableNumber}`;
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
                    <button onclick='changeQty("${item.id}", 1)' style="padding:2px 8px; background:var(--primary); color:#fff; border:none; cursor:pointer; border-radius:4px;">+</button>
                    <span style="margin: 0 8px; font-weight:bold;">${item.qty}</span>
                    <button onclick='changeQty("${item.id}", -1)' style="padding:2px 8px; background:#ddd; color:#333; border:none; cursor:pointer; border-radius:4px;">-</button>
                </div>
            </div>
        `;
    });
    document.getElementById('total-price').innerText = total;
}

function changeQty(id, delta) {
    const item = cart.find(i => String(i.id) === String(id));
    if (item) {
        item.qty += delta;
        if (item.qty <= 0) {
            cart = cart.filter(i => String(i.id) !== String(id));
        }
    }
    updateCartBadge();
    renderCartItems();
}

async function checkout() {
    if (checkoutBusy || !cart.length) return;
    checkoutBusy = true;
    try {
        const order = await submitOrder(tableNumber, cart);
        cart = []; updateCartBadge(); toggleCart();
        sessionStorage.setItem('ward-order-ids', JSON.stringify([...customerOrderIds(), String(order.id)]));
        renderCustomerOrders();
    } catch (error) { alert(error.message); }
    finally { checkoutBusy = false; }
}

function normalizeMenuId(id) {
    return String(id);
}

function showOrderSuccess(order) {
    const existing = document.getElementById('order-success-toast');
    if (existing) existing.remove();
    const toast = document.createElement('section');
    toast.id = 'order-success-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
        <div class="success-flower"><i class="fa-solid fa-mug-hot"></i></div>
        <div>
            <strong>تم استلام طلبك بنجاح</strong>
            <p>طلب الطاولة ${escapeHtml(order.table)} وصل للمطبخ الآن، وسيتم تحضيره بأسرع وقت.</p>
            <small><i class="fa-regular fa-clock"></i> ${escapeHtml(order.time)}</small>
        </div>
        <button type="button" aria-label="إغلاق الرسالة">&times;</button>`;
    toast.querySelector('button').addEventListener('click', () => toast.remove());
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 8000);
}

function showCustomerReadyNotification(order, uniqueId) {
    // تشغيل رنة الجرس على الهاتف
    playCustomerBellSound();

    // إزالة أي إشعار سابق
    const existingOverlay = document.querySelector('.customer-ready-overlay');
    if (existingOverlay) existingOverlay.remove();

    // إنشاء طبقة الإشعار
    const overlay = document.createElement('div');
    overlay.className = 'customer-ready-overlay';
    overlay.id = uniqueId;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'customer-ready-title');

    const readyTime = order.readyAt ? formatWardDateTime(order.readyAt) : (order.time || formatWardDateTime(Date.now()));

    overlay.innerHTML = `
        <div class="customer-ready-card">
            <img class="customer-ready-logo" src="q.png" alt="كافيه ورد">
            <span class="ready-bell-icon"><i class="fa-solid fa-bell"></i></span>
            <div class="ready-coffee-wrap">
                <div class="ready-steam"><span></span><span></span><span></span></div>
                <div class="ready-coffee-cup"></div>
            </div>
            <h2 class="customer-ready-title" id="customer-ready-title">طلبك جاهز! ✨</h2>
            <p class="customer-ready-message">طلبك في طريقه إلى الطاولة</p>
            <span class="customer-ready-table"><i class="fa-solid fa-chair"></i> الطاولة رقم ${escapeHtml(order.table)}</span>
            <small class="customer-ready-time"><i class="fa-regular fa-clock"></i> ${escapeHtml(readyTime)}</small>
            <button type="button" class="customer-ready-close">حسناً، شكراً <i class="fa-solid fa-heart"></i></button>
        </div>
    `;

    // زر الإغلاق
    overlay.querySelector('.customer-ready-close').addEventListener('click', () => {
        overlay.remove();
    });

    // إغلاق تلقائي بعد 20 ثانية
    window.setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
    }, 20000);

    document.body.appendChild(overlay);
}

function playCustomerBellSound() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const context = window.customerBellContext = window.customerBellContext || new AudioContextClass();
        if (context.state === 'suspended') context.resume();

        // نغمة جرس جميلة - نغمتان متتاليتان
        [0, 0.25, 0.5].forEach((delay, index) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = index === 1 ? 1046.5 : 783.99; // C6 و G5
            oscillator.type = 'sine';
            gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + delay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.45);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start(context.currentTime + delay);
            oscillator.stop(context.currentTime + delay + 0.5);
        });

        // اهتزاز الهاتف إذا كان مدعوماً
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 300]);
        }
    } catch (error) {
        // رنة الجرس اختيارية حسب دعم المتصفح
    }
}


        function confirmTable() {
            const select = document.getElementById('table-selector');
            const badge = document.getElementById('table-badge');
            if (select && badge) {
                badge.textContent = 'رقم الطاولة: ' + select.value;
            }
            if (typeof changeTable === 'function') {
                changeTable(select.value);
            }
        }

        function createHeroPetals() {
            const container = document.getElementById('hero-petals');
            if (!container) return;
            for (let i = 0; i < 12; i++) {
                const petal = document.createElement('div');
                petal.className = 'hero-petal';
                petal.style.left = Math.random() * 100 + '%';
                petal.style.animationDuration = (4 + Math.random() * 2.5) + 's';
                petal.style.animationDelay = (Math.random() * 4) + 's';
                container.appendChild(petal);
            }
        }

        function openCategory(category) {
            activeCategory=category;
            const menu = getMenu();
            const items = menu.filter(item => item.category === category);
            const categoryNames = {
                hot: 'مشروبات ساخنة',
                cold: 'مشروبات باردة',
                sweets: 'حلويات',
                food: 'مأكولات'
            };

            document.getElementById('category-boxes').style.display = 'none';
            document.getElementById('category-products').style.display = 'block';
            document.getElementById('category-title').textContent = categoryNames[category] || category;
            renderCategoryItems(items);
        }

        function backToCategories() {
            activeCategory=null;
            document.getElementById('category-boxes').style.display = 'grid';
            document.getElementById('category-products').style.display = 'none';
        }

        function renderCategoryItems(items) {
            const grid = document.getElementById('category-items-grid');
            if (!grid) return;
            grid.innerHTML = '';

            if (items.length === 0) {
                grid.innerHTML = '<p style="text-align:center; color:#888; grid-column:1/-1;">لا توجد منتجات في هذا التصنيف</p>';
                return;
            }

            items.forEach(item => {
                grid.innerHTML += `
                    <div class="menu-card">
                        <img src="${item.img}" alt="${item.name}">
                        <div class="menu-card-body">
                            <h3>${item.name}</h3>
                            <p>${item.desc}</p>
                            <div class="card-footer">
                                <span class="price">${item.price} ليرة</span>
                                <button class="add-btn" onclick="addToCart('${item.id}')">إضافة</button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        window.addEventListener('DOMContentLoaded', () => {
            createHeroPetals();
        });
