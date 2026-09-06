const kitchenFeedback = new Map();
const kitchenSaving = new Set();
function kitchenTiming(order, now = Date.now()) {
    const createdAt = Number(order.createdAt);
    const valid = Number.isFinite(createdAt) && createdAt > 0 && !Number.isNaN(new Date(createdAt).getTime());
    const minutes = valid ? Math.max(0, Math.floor((now - createdAt) / 60000)) : null;
    const urgency = minutes === null || minutes < 10 ? 'normal' : minutes < 20 ? 'warm' : minutes < 30 ? 'late' : 'urgent';
    return {
        created: valid ? formatWardDateTime(createdAt) : (order.time || 'غير متاح'),
        wait: minutes === null ? 'غير متاحة' : `${minutes} دقيقة`,
        urgency,
        label: {normal: 'وقت انتظار عادي', warm: 'انتظار 10 دقائق أو أكثر', late: 'انتظار 20 دقيقة أو أكثر', urgent: 'انتظار 30 دقيقة أو أكثر'}[urgency]
    };
}
function kitchenAttribute(value) {
    return escapeHtml(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
window.addEventListener('ward:orders', renderKitchenOrders);
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('kitchen-orders-container').addEventListener('click', event => {
        const button = event.target.closest('[data-ready-order]');
        if (button && !button.disabled) markOrderReady(button.dataset.readyOrder);
    });
    startOrdersRealtime();
    setInterval(renderKitchenOrders, 30000);
});
function renderKitchenOrders() {
    const container = document.getElementById('kitchen-orders-container');
    if (!container) return;
    const orders = getOrders();
    const activeOrders = orders.filter(order => order.status === 'قيد التحضير' || order.status === 'جاهز')
        .sort((a, b) => (Number(a.createdAt) || Infinity) - (Number(b.createdAt) || Infinity));
    for (const id of kitchenFeedback.keys()) {
        if (!activeOrders.some(order => String(order.id) === id) && !kitchenSaving.has(id)) kitchenFeedback.delete(id);
    }
    const now = Date.now();
    container.innerHTML = activeOrders.length === 0 ? '<p class="kitchen-empty">لا توجد طلبات بانتظار التحضير.</p>' : activeOrders.map(order => {
        const id = String(order.id);
        const firebaseKey = String(order.firebaseKey || order.id);
        const timing = kitchenTiming(order, now);
        const ready = order.status === 'جاهز', saving = kitchenSaving.has(firebaseKey);
        const feedback = kitchenFeedback.get(firebaseKey);
        return `<article class="kitchen-order ${ready ? 'is-ready' : 'wait-' + timing.urgency}" aria-busy="${saving ? 'true' : 'false'}">
            <div class="kitchen-order-head"><h3>الطاولة رقم ${escapeHtml(order.table)}</h3><strong class="kitchen-status">${escapeHtml(order.status)}</strong></div>
            <dl class="kitchen-order-meta">
                <div><dt>رقم الطلب</dt><dd class="kitchen-order-number">${escapeHtml(id)}</dd></div>
                <div><dt>وقت إنشاء الطلب</dt><dd>${escapeHtml(timing.created)}</dd></div>
                <div><dt>مدة الانتظار منذ الإنشاء</dt><dd class="kitchen-wait">${escapeHtml(timing.wait)}</dd></div>
            </dl>
            ${!ready && timing.urgency !== 'normal' ? `<p class="kitchen-age-label">${escapeHtml(timing.label)}</p>` : ''}
            <ul class="kitchen-items">${(order.items || []).map(item => `<li><b>${escapeHtml(item.qty)}</b> × ${escapeHtml(item.name)}</li>`).join('')}</ul>
            ${!ready ? `<button type="button" class="btn-action" data-ready-order="${kitchenAttribute(firebaseKey)}" ${saving ? 'disabled' : ''}>${saving ? 'جارٍ حفظ التجهيز…' : 'تم تجهيز الطلب'}</button>` : '<span class="ready-note">بانتظار الكارسون</span>'}
            ${feedback ? `<p class="kitchen-feedback ${feedback.error ? 'is-error' : 'is-success'}" role="${feedback.error ? 'alert' : 'status'}">${escapeHtml(feedback.message)}</p>` : ''}
        </article>`;
    }).join('');
}

async function markOrderReady(firebaseKey) {
    firebaseKey = String(firebaseKey ?? '');
    if (!firebaseKey || kitchenSaving.has(firebaseKey)) return;

    const order = getOrders().find(order =>
        String(order.firebaseKey || order.id) === firebaseKey
    );

    if (!order) {
        kitchenFeedback.set(firebaseKey, {error: true, message: 'الطلب لم يعد موجوداً.'});
        renderKitchenOrders();
        return;
    }

    if (order.status === 'جاهز') {
        kitchenFeedback.set(firebaseKey, {message: 'تم تجهيز الطلب بنجاح — بانتظار الكارسون.'});
        renderKitchenOrders();
        return;
    }

    if (order.status !== 'قيد التحضير') return;

    kitchenSaving.add(firebaseKey);
    kitchenFeedback.set(firebaseKey, {message: 'جارٍ حفظ التجهيز…'});
    renderKitchenOrders();

    try {
        await transitionOrder(firebaseKey, 'قيد التحضير', 'جاهز');
        kitchenFeedback.set(firebaseKey, {message: 'تم تجهيز الطلب بنجاح — بانتظار الكارسون.'});
    } catch (error) {
        kitchenFeedback.set(firebaseKey, {
            error: true,
            message: error?.message || 'تعذر حفظ التجهيز. حاول مجدداً.'
        });
    } finally {
        kitchenSaving.delete(firebaseKey);
        renderKitchenOrders();
    }
}
