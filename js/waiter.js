async function moveTablePrompt(from) {
    const to=prompt('رقم الطاولة الجديدة (1–20):');
    if(to===null) return;
    try { await moveTable(from,to.trim()); alert('تم نقل الطاولة وطلباتها بنجاح.'); }
    catch(error) { alert(error.message); }
}
window.addEventListener('ward:orders',()=>{renderOrders();notifyReadyOrders(getOrders());});
window.addEventListener('ward:tables',renderWaiterTables);
window.addEventListener('DOMContentLoaded',()=>{startOrdersRealtime();startTablesRealtime();renderWaiterTables();});

function renderOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;
    const orders = getOrders().filter(order => order.paymentStatus !== 'مدفوع');
    container.innerHTML = '';
    if (orders.length === 0) {
        container.innerHTML = '<p style="color:#888;">لا توجد طلبات جديدة حالياً...</p>';
        return;
    }

    orders.forEach(order => {
        const isDelivered = order.status === 'تم التوصيل';
        const isReady = order.status === 'جاهز';
        const borderColor = isDelivered || isReady ? '#28a745' : '#f48fb1';
        const statusColor = isDelivered || isReady ? '#28a745' : '#e91e63';
        let itemsHtml = order.items.map(i => `<li>${i.name} (${i.qty}) - ${i.price * i.qty} ليرة</li>`).join('');
        container.innerHTML += `
            <div style="background:${isDelivered ? '#f1fff4' : '#fff'}; border:2px solid ${borderColor}; padding:15px; border-radius:10px; margin-bottom:12px; box-shadow: 0 3px 10px rgba(0,0,0,0.03);">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <h3 style="color:var(--primary);">الطاولة رقم: ${order.table}</h3>
                    <span style="font-size:12px; color:#888;">${order.time}</span>
                </div>
                <ul style="margin-right:20px; margin-bottom:10px; color:#444;">${itemsHtml}</ul>
                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #eee; padding-top:10px;">
                    <strong style="color:#333;">الإجمالي: ${order.total} ليرة</strong>
                    <div>
                        <span style="background:${statusColor}; color:#fff; padding:4px 10px; border-radius:4px; font-size:12px; margin-left:10px;">${order.status}</span>
                        ${isReady ? `<button onclick='updateOrderStatus(${JSON.stringify(String(order.id))})' style="background:#28a745; color:#fff; border:0; padding:6px 10px; border-radius:4px; cursor:pointer;">تم التوصيل</button>` : ''}
                        ${isDelivered ? '<a href="pos.html">بانتظار التحصيل في الكاشير</a>' : '<span style="color:#888; font-size:12px;">' + (order.status === 'قيد التحضير' ? 'قيد التحضير في المطبخ' : '') + '</span>'}
                    </div>
                </div>
            </div>
        `;
    });
}

async function updateOrderStatus(id) {
    try { await transitionOrder(id, 'جاهز', 'تم التوصيل'); }
    catch (error) { alert(error.message); }
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
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    window.waiterAudioContext = window.waiterAudioContext || new AudioContextClass();
    window.waiterAudioContext.resume();
    sessionStorage.setItem('cafe_ward_bell_enabled', 'true');
    const button = document.getElementById('enable-bell-btn');
    if (button) button.innerText = 'رنة الجرس مفعلة';
}

function playBellSound() {
    try {
        if (sessionStorage.getItem('cafe_ward_bell_enabled') !== 'true') return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const context = window.waiterAudioContext = window.waiterAudioContext || new AudioContextClass();
        if (context.state === 'suspended') context.resume();
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
    } catch (error) {
        // صوت الجرس اختياري حسب دعم المتصفح.
    }
}



function renderWaiterTables() {
    const container = document.getElementById('waiter-tables-container');
    if (!container) return;

    const allTables = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20'];
    const tables = [];

    allTables.forEach(num => {
        const status = getLocalTableStatus(num);
        if (status && status.status === 'occupied') {
            tables.push({ number: num, ...status });
        }
    });

    if (tables.length === 0) {
        container.innerHTML = '<p style="color:#888;">لا توجد طاولات مشغولة حالياً.</p>';
        return;
    }

    container.innerHTML = tables.map(t => `
        <div class="waiter-table-card occupied-table">
            <div class="waiter-table-header">
                <span class="waiter-table-number">طاولة ${escapeHtml(t.table)}</span>
                <span class="waiter-table-badge occupied">محجوزة</span>
            </div>
            <div class="waiter-table-body">
                <p><strong>طلب رقم:</strong> ${escapeHtml(t.orderId)}</p>
                <p><strong>الحالة:</strong> <span class="status-text">${escapeHtml(t.status)}</span></p>
                <p><strong>منذ:</strong> ${formatWardDateTime(t.reservedAt)}</p>
            </div>
            <button class="release-table-btn" onclick='releaseTableAndRefresh(${JSON.stringify(String(t.table))})'>
                <i class="fa-solid fa-door-open"></i> تفريغ الطاولة
            </button>
            <button class="btn-action" onclick='moveTablePrompt(${JSON.stringify(String(t.table))})'>نقل الطاولة</button>
        </div>
    `).join('');
}

async function releaseTableAndRefresh(table) {
    try { await releaseTable(table); alert('تم تفريغ الطاولة بنجاح.'); }
    catch (error) { alert(error.message); }
}
