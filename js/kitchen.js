const kitchenFeedback = new Map();
const kitchenSaving = new Set();

function getKitchenTiming(order, now = Date.now()) {
  const createdAt = Number(order?.createdAt);
  const valid = Number.isFinite(createdAt) && createdAt > 0;
  const minutes = valid ? Math.max(0, Math.floor((now - createdAt) / 60000)) : null;

  let urgency = 'normal';
  if (minutes !== null) {
    if (minutes >= 30) urgency = 'urgent';
    else if (minutes >= 20) urgency = 'late';
    else if (minutes >= 10) urgency = 'warm';
  }

  return {
    minutes,
    urgency,
    createdText: valid ? formatWardDateTime(createdAt) : (order?.time || 'غير متاح'),
    waitText: minutes === null ? '—' : `${minutes} دقيقة`
  };
}

function safeAttr(value) {
  return escapeHtml(String(value ?? ''))
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function shortOrderId(id) {
  const text = String(id ?? '');
  if (!text) return '—';
  return text.length <= 6 ? text : text.slice(-6).toUpperCase();
}

window.addEventListener('ward:orders', renderKitchenOrders);

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('kitchen-orders-container');

  if (container) {
    container.addEventListener('click', event => {
      const button = event.target.closest('[data-ready-order]');
      if (button && !button.disabled) {
        markOrderReady(button.dataset.readyOrder);
      }
    });
  }

  startOrdersRealtime();
  setInterval(renderKitchenOrders, 30000);
});

function renderKitchenOrders() {
  const container = document.getElementById('kitchen-orders-container');
  const summary = document.getElementById('kitchen-summary');
  if (!container) return;

  const activeOrders = getOrders()
    .filter(order => order.status === 'قيد التحضير' || order.status === 'جاهز')
    .sort((a, b) => {
      const aa = Number(a.createdAt);
      const bb = Number(b.createdAt);
      return (Number.isFinite(aa) ? aa : Infinity) - (Number.isFinite(bb) ? bb : Infinity);
    });

  if (summary) {
    const preparing = activeOrders.filter(o => o.status === 'قيد التحضير').length;
    const ready = activeOrders.filter(o => o.status === 'جاهز').length;
    summary.textContent = `قيد التحضير: ${preparing} • جاهز: ${ready}`;
  }

  for (const id of kitchenFeedback.keys()) {
    if (!activeOrders.some(order => String(order.id) === id) && !kitchenSaving.has(id)) {
      kitchenFeedback.delete(id);
    }
  }

  if (!activeOrders.length) {
    container.innerHTML = '<p class="kitchen-empty">لا توجد طلبات حالياً 🎉</p>';
    return;
  }

  const now = Date.now();

  container.innerHTML = activeOrders.map(order => {
    const id = String(order.id ?? '');
    const ready = order.status === 'جاهز';
    const saving = kitchenSaving.has(id);
    const feedback = kitchenFeedback.get(id);
    const timing = getKitchenTiming(order, now);

    const safeTable = escapeHtml(String(order.table ?? '—'));
    const safeTime = escapeHtml(String(timing.createdText));
    const safeWait = escapeHtml(String(timing.waitText));
    const safeShortId = escapeHtml(shortOrderId(id));

    const items = Array.isArray(order.items) ? order.items : [];
    const itemsHtml = items.map(item => {
      const qty = escapeHtml(String(item?.qty ?? 0));
      const name = escapeHtml(String(item?.name ?? 'صنف'));
      return `<li><span class="kitchen-qty">${qty} ×</span><span>${name}</span></li>`;
    }).join('');

    const feedbackHtml = feedback
      ? `<p class="kitchen-feedback ${feedback.error ? 'err' : 'ok'}" role="${feedback.error ? 'alert' : 'status'}">
           ${escapeHtml(String(feedback.message))}
         </p>`
      : '';

    return `
      <article class="kitchen-card ${ready ? 'is-ready' : `wait-${timing.urgency}`}" aria-busy="${saving ? 'true' : 'false'}">
        <div class="kitchen-card-head">
          <h2 class="kitchen-table">طاولة ${safeTable}</h2>
          <div class="kitchen-head-side">
            <span class="kitchen-age">${ready ? 'جاهز' : safeWait}</span>
            <span class="kitchen-order-short">#${safeShortId}</span>
          </div>
        </div>

        <p class="kitchen-time">وقت الطلب: ${safeTime}</p>

        <ul class="kitchen-items">${itemsHtml}</ul>

        ${ready
          ? '<div class="kitchen-ready">✓ تم التجهيز — بانتظار الكارسون</div>'
          : `<button type="button" class="kitchen-btn" data-ready-order="${safeAttr(id)}" ${saving ? 'disabled' : ''}>
               ${saving ? 'جارٍ الحفظ…' : '✓ تم تجهيز الطلب'}
             </button>`}

        ${feedbackHtml}
      </article>
    `;
  }).join('');
}

async function markOrderReady(id) {
  id = String(id ?? '');
  if (!id || kitchenSaving.has(id)) return;

  const order = getOrders().find(order => String(order.id) === id);
  if (!order || order.status !== 'قيد التحضير') return;

  kitchenSaving.add(id);
  kitchenFeedback.set(id, { message: 'جارٍ حفظ حالة التجهيز…' });
  renderKitchenOrders();

  try {
    await transitionOrder(id, 'قيد التحضير', 'جاهز');
    kitchenFeedback.set(id, { message: 'تم تجهيز الطلب.' });
  } catch (error) {
    kitchenFeedback.set(id, {
      error: true,
      message: error?.message || 'تعذر حفظ التجهيز. حاول مرة ثانية.'
    });
  } finally {
    kitchenSaving.delete(id);
    renderKitchenOrders();
  }
}
