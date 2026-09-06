window.addEventListener('ward:orders',renderKitchenOrders);
window.addEventListener('DOMContentLoaded',startOrdersRealtime);
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
            ${order.status === 'قيد التحضير' ? `<button class="btn-action" onclick='markOrderReady(${JSON.stringify(String(order.id))})'>تم تجهيز الطلب</button>` : '<span class="ready-note">بانتظار الكارسون</span>'}
        </article>
    `).join('');
}

async function markOrderReady(id) {
    try { await transitionOrder(id, 'قيد التحضير', 'جاهز'); }
    catch (error) { alert(error.message); }
}
