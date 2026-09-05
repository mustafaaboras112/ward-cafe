// التحقق من رقم الطاولة الخاص بالزبون من الرابط أو التخزين المحلي
function getTableNumber() {
    const urlParams = new URLSearchParams(window.location.search);
    let table = urlParams.get('table');
    if (table) {
        localStorage.setItem('cafe_table', table);
    } else {
        table = localStorage.getItem('cafe_table') || 'غير محددة';
    }
    return table;
}

// دالة إظهار الإشعار اللطيف على هاتف الزبون
function showCustomerReadyNotification(order) {
    const currentTable = getTableNumber();
    
    // التحقق أن الطلب يخص طاولة الزبون الحالية
    if (String(order.table) === String(currentTable)) {
        // تشغيل صوت خفيف للتنبيه (اختياري)
        playCustomerBell();

        // إزالة أي إشعار قديم إن وجد
        const existingNotice = document.getElementById('customer-ready-notice');
        if (existingNotice) existingNotice.remove();

        // إنشاء عنصر الإشعار
        const notice = document.createElement('div');
        notice.id = 'customer-ready-notice';
        notice.className = 'customer-ready-popup';
        notice.innerHTML = `
            <div class="notice-icon"><i class="fa-solid fa-mug-hot"></i></div>
            <div class="notice-text">
                <strong>هناءً وعافية 🌸</strong>
                <p>طلبك الخاص بالطاولة رقم <strong>${order.table}</strong> أصبح جاهزاً وفي طريقه إليك!</p>
            </div>
            <button onclick="this.parentElement.remove()" class="notice-close">&times;</button>
        `;
        document.body.appendChild(notice);

        // اختفاء الإشعار تلقائياً بعد 10 ثوانٍ
        setTimeout(() => {
            if (notice.parentElement) notice.remove();
        }, 10000);
    }
}

// دالة صوت خفيفة لتنبيه الزبون (اختياري)
function playCustomerBell() {
    try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.volume = 0.5;
        audio.play().catch(e => console.log("Audio play blocked by browser policies"));
    } catch (err) {
        console.log(err);
    }
}
// استدعاء دالة الإشعار عند تغير حالة الطلب
if (order.table == 18 && order.status == 'ready') {
    showCustomerReadyNotification(order);
}