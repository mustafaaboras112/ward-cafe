let cart = [];
let tableNumber = '1';
let checkoutBusy = false;
let activeCategory = null;
let qrTable = false;
let cartOpen = false;
let feedbackTimer;
const categoryNames = {hot:'مشروبات ساخنة',cold:'مشروبات باردة',sweets:'حلويات',food:'مأكولات'};
function customerOrderIds() { return JSON.parse(sessionStorage.getItem('ward-order-ids') || '[]'); }
function normalizeMenuId(id) { return String(id); }
function menuAttr(value) { return escapeHtml(value).replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function menuImage(value) {
    const source=String(value || '');
    return /^(https?:\/\/|(?:images|icons)\/)/i.test(source) || source==='q.png' ? source : 'q.png';
}
function menuFeedback(message) {
    const node=document.getElementById('menu-feedback');node.textContent=message;
    clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>{node.textContent='';},2200);
}
function customerMessage(order) {
    if(order.paymentStatus==='مدفوع') return 'تم الدفع، شكراً لزيارتك';
    return {'قيد التحضير':'طلبك قيد التحضير','جاهز':'طلبك في طريقه إلى الطاولة','تم التوصيل':'تم توصيل طلبك إلى الطاولة'}[order.status] || order.status;
}
function orderProgress(order) {
    const step=order.paymentStatus==='مدفوع'?4:({'قيد التحضير':1,'جاهز':2,'تم التوصيل':3}[order.status] ?? 0);
    return ['تم استلام الطلب','قيد التحضير','جاهز / في طريقه للطاولة','تم التوصيل','تم الدفع'].map((label,index)=>`<li class="${index<=step?'is-complete':''}" ${index===step?'aria-current="step"':''}>${label}</li>`).join('');
}
function renderCustomerOrders() {
    const container=document.getElementById('customer-orders');if(!container) return;
    const owned=getOrders().filter(order=>order.clientId===customerId() || customerOrderIds().includes(String(order.id)));
    container.innerHTML=owned.map(order=>`<article class="customer-order-status"><strong>طاولة ${escapeHtml(order.table)}</strong><p>${escapeHtml(customerMessage(order))}</p><ol class="order-progress" aria-label="مراحل الطلب">${orderProgress(order)}</ol><small>رقم الطلب: ${escapeHtml(order.id)}</small></article>`).join('');
    const seen=JSON.parse(sessionStorage.getItem('ward-ready-seen') || '[]');
    for(const order of owned) {
        if((order.readyAt || order.status==='جاهز') && order.paymentStatus!=='مدفوع' && !seen.includes(String(order.id))) {
            showCustomerReadyNotification(order,'customer-ready-'+order.id);seen.push(String(order.id));
        }
    }
    sessionStorage.setItem('ward-ready-seen',JSON.stringify(seen));
    const active=owned.filter(order=>order.paymentStatus!=='مدفوع').sort((a,b)=>b.createdAt-a.createdAt)[0];
    if(active && validTable(active.table)) {
        tableNumber=String(active.table);localStorage.setItem('cafe_ward_table',tableNumber);
        document.getElementById('table-selector').value=tableNumber;updateTableLabel();
    }
}
function renderCustomerTables() {
    const selector=document.getElementById('table-selector');if(!selector) return;
    for(const option of selector.options) {
        const status=getLocalTableStatus(option.value);
        option.disabled=status?.status==='occupied' && status.clientId!==customerId();
        option.textContent=`طاولة ${option.value}${option.disabled?' (محجوزة)':''}`;
    }
}
function changeTable(value) {
    const error=document.getElementById('table-error');
    if(checkoutBusy) {document.getElementById('table-selector').value=tableNumber;return;}
    if(!validTable(value)) {error.textContent='اختر رقم طاولة من 1 إلى 20.';document.getElementById('table-selector').value=tableNumber;return;}
    const status=getLocalTableStatus(value);
    if(status?.status==='occupied' && status.clientId!==customerId()) {
        error.textContent='الطاولة محجوزة حالياً. اختر طاولة متاحة.';
        document.getElementById('table-selector').value=tableNumber;return;
    }
    error.textContent='';tableNumber=String(value);localStorage.setItem('cafe_ward_table',tableNumber);updateTableLabel();
    if(qrTable) setTablePicker(false);
}
function setTablePicker(open) {
    document.getElementById('table-picker').hidden=!open;
    document.getElementById('change-table').setAttribute('aria-expanded',String(open));
    if(open) document.getElementById('table-selector').focus();
}
function updateTableLabel() {
    document.getElementById('selected-table-label').textContent=`طاولتك رقم ${tableNumber}`;
    document.getElementById('table-badge').textContent=`طاولتك رقم ${tableNumber}`;
}
function quantityControls(item, quantity, allowRemove=false) {
    const id=menuAttr(item.id), name=menuAttr(item.name);
    return `<div class="quantity-controls"><button type="button" data-cart-action="decrease" data-id="${id}" aria-label="إنقاص ${name}" ${checkoutBusy?'disabled':''}>−</button><span aria-label="الكمية">${quantity}</span><button type="button" data-cart-action="increase" data-id="${id}" aria-label="زيادة ${name}" ${checkoutBusy || item.available===false?'disabled':''}>+</button>${allowRemove?`<button type="button" class="remove-item" data-cart-action="remove" data-id="${id}" aria-label="حذف ${name}" ${checkoutBusy?'disabled':''}>حذف</button>`:''}</div>`;
}
function productMarkup(item) {
    const quantity=cart.find(row=>String(row.id)===String(item.id))?.qty || 0;
    return `<article class="menu-card"><img src="${menuAttr(menuImage(item.img))}" alt="${menuAttr(item.name)}" loading="lazy" decoding="async" width="480" height="360"><div class="menu-card-body"><h3>${escapeHtml(item.name)}</h3><p class="product-description">${escapeHtml(item.desc || '')}</p>${item.available===false?'<span class="unavailable-badge">غير متوفر</span>':''}<div class="card-footer"><span class="price">${Number(item.price).toFixed(2)} ليرة</span>${quantity?quantityControls(item,quantity):`<button class="add-btn" type="button" data-cart-action="increase" data-id="${menuAttr(item.id)}" ${checkoutBusy || item.available===false?'disabled':''}>${item.available===false?'غير متوفر':'إضافة'}</button>`}</div></div></article>`;
}
function displayMenu(items) { const grid=document.getElementById('menu-grid');if(grid) grid.innerHTML=items.map(productMarkup).join(''); }
function renderCategoryItems(items) {
    document.getElementById('category-items-grid').innerHTML=items.length?items.map(productMarkup).join(''):'<p class="empty-menu">لا توجد منتجات في هذا التصنيف</p>';
}
function openCategory(category) {
    if(!categoryNames[category]) return;activeCategory=category;
    document.getElementById('category-boxes').hidden=true;document.getElementById('category-products').hidden=false;
    document.getElementById('category-title').textContent=categoryNames[category];
    renderCategoryItems(getMenu().filter(item=>item.category===category));
}
function backToCategories() {
    activeCategory=null;document.getElementById('category-boxes').hidden=false;document.getElementById('category-products').hidden=true;
}
function refreshCartViews() {
    updateCartBadge();renderCartItems();
    if(activeCategory) renderCategoryItems(getMenu().filter(item=>item.category===activeCategory));
}
function addToCart(id) {
    if(checkoutBusy) return;
    const item=getMenu().find(item=>String(item.id)===String(id));
    if(!item || item.available===false) {menuFeedback('هذا الصنف غير متوفر حالياً.');return;}
    const existing=cart.find(row=>String(row.id)===String(id));
    if(existing) existing.qty++;else cart.push({...item,qty:1});
    refreshCartViews();menuFeedback(`تمت إضافة ${item.name} إلى السلة`);
}
function changeQty(id,delta) {
    if(checkoutBusy) return;
    if(delta===1) {addToCart(id);return;}
    if(delta!==-1) return;
    const item=cart.find(row=>String(row.id)===String(id));if(item) item.qty--;
    cart=cart.filter(row=>row.qty>0);refreshCartViews();
}
function removeCartItem(id) {if(!checkoutBusy) {cart=cart.filter(row=>String(row.id)!==String(id));refreshCartViews();}}
function clearCart() {if(!checkoutBusy) {cart=[];refreshCartViews();menuFeedback('تم إفراغ السلة');}}
function handleCartAction(event) {
    const button=event.target.closest('[data-cart-action]');if(!button || button.disabled) return;
    const id=button.dataset.id;
    if(button.dataset.cartAction==='remove') removeCartItem(id);
    else changeQty(id,button.dataset.cartAction==='increase'?1:-1);
}
function updateCartBadge() {
    const count=cart.reduce((sum,item)=>sum+item.qty,0);
    document.getElementById('cart-count').innerText=count;
    document.getElementById('open-cart').setAttribute('aria-label',`سلة المشتريات، ${count} أصناف`);
}
function setCartOpen(open) {
    if(checkoutBusy && !open) return;
    cartOpen=open;document.getElementById('cart-modal').hidden=!open;
    document.getElementById('open-cart').setAttribute('aria-expanded',String(open));
    if(open) {document.body.classList.add('cart-is-open');renderCartItems();document.getElementById('close-cart').focus();}
    else {document.body.classList.remove('cart-is-open');document.getElementById('open-cart').focus();}
}
function toggleCart() {setCartOpen(!cartOpen);}
function renderCartItems() {
    document.getElementById('cart-items').innerHTML=cart.length?cart.map(item=>{
        const current=getMenu().find(row=>String(row.id)===String(item.id));
        return `<article class="cart-item"><div class="cart-item-copy"><h3>${escapeHtml(item.name)}</h3><p>${Number(item.price).toFixed(2)} ليرة × ${item.qty} = <strong>${(item.price*item.qty).toFixed(2)} ليرة</strong></p>${!current || current.available===false?'<span class="unavailable-badge">غير متوفر — احذفه لإرسال الطلب</span>':''}</div>${quantityControls({...item,available:!!current && current.available!==false},item.qty,true)}</article>`;
    }).join(''):'<p class="empty-menu">السلة فارغة حالياً</p>';
    document.getElementById('total-price').innerText=cart.reduce((sum,item)=>sum+item.price*item.qty,0).toFixed(2);
    const submit=document.getElementById('checkout-submit');submit.disabled=checkoutBusy || !cart.length;
    submit.textContent=checkoutBusy?'جاري إرسال الطلب...':'تأكيد وإرسال الطلب';
    document.getElementById('cart-modal').setAttribute('aria-busy',String(checkoutBusy));
    for(const id of ['clear-cart','close-cart','table-selector','change-table']) document.getElementById(id).disabled=checkoutBusy;
}
async function checkout() {
    if(checkoutBusy || !cart.length) return;
    checkoutBusy=true;document.getElementById('checkout-error').textContent='';refreshCartViews();
    try {
        const order=await submitOrder(tableNumber,cart);
        sessionStorage.setItem('ward-order-ids',JSON.stringify([...customerOrderIds(),String(order.id)]));
        cart=[];checkoutBusy=false;setCartOpen(false);renderCustomerOrders();menuFeedback('تم استلام طلبك بنجاح');
    } catch(error) {document.getElementById('checkout-error').textContent=error.message || 'تعذر إرسال الطلب. حاول مجدداً.';}
    finally {checkoutBusy=false;refreshCartViews();}
}
function handleCartKeyboard(event) {
    if(!cartOpen) return;
    if(event.key==='Escape') {event.preventDefault();setCartOpen(false);}
    if(event.key==='Tab') {
        const controls=[...document.getElementById('cart-modal').querySelectorAll('button:not(:disabled), [tabindex="0"]')];
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
    }
}
window.addEventListener('ward:orders',renderCustomerOrders);
window.addEventListener('ward:tables',renderCustomerTables);
window.addEventListener('ward:menu',refreshCartViews);
window.addEventListener('DOMContentLoaded',()=>{
    const requested=new URLSearchParams(location.search).get('table');
    qrTable=validTable(requested);
    const saved=localStorage.getItem('cafe_ward_table');
    tableNumber=qrTable?String(requested):validTable(saved)?String(saved):'1';
    document.getElementById('table-picker').hidden=qrTable;
    document.getElementById('change-table').hidden=!qrTable;
    if(requested!==null && !qrTable) document.getElementById('table-error').textContent='رقم الطاولة في الرابط غير صالح. اختر طاولة من 1 إلى 20.';
    const selector=document.getElementById('table-selector');selector.value=tableNumber;
    selector.addEventListener('change',event=>changeTable(event.target.value));
    document.getElementById('change-table').addEventListener('click',()=>setTablePicker(document.getElementById('table-picker').hidden));
    for(const category of Object.keys(categoryNames)) document.getElementById('category-'+category).addEventListener('click',()=>openCategory(category));
    document.getElementById('back-categories').addEventListener('click',backToCategories);
    document.getElementById('open-cart').addEventListener('click',toggleCart);
    document.getElementById('close-cart').addEventListener('click',()=>setCartOpen(false));
    document.getElementById('clear-cart').addEventListener('click',clearCart);
    document.getElementById('checkout-submit').addEventListener('click',checkout);
    for(const id of ['category-items-grid','cart-items']) document.getElementById(id).addEventListener('click',handleCartAction);
    document.getElementById('cart-modal').addEventListener('click',event=>{if(event.target===event.currentTarget) setCartOpen(false);});
    document.addEventListener('keydown',handleCartKeyboard);
    updateTableLabel();refreshCartViews();renderCustomerTables();
    startMenuRealtime();startOrdersRealtime();startTablesRealtime();
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if(!reduced) {
        const count=window.matchMedia?.('(max-width: 768px)').matches?4:12;
        for(let i=0;i<count;i++) {const petal=document.createElement('div');petal.className='hero-petal';document.getElementById('hero-petals').appendChild(petal);}
    }
});

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
