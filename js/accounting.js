window.addEventListener('ward:orders',renderAccountingDashboard);
window.addEventListener('ward:accounting',renderAccountingDashboard);
window.addEventListener('DOMContentLoaded',()=>{startOrdersRealtime();startAccountingRealtime();});
function renderAccountingDashboard() {
    const orders = getOrders().filter(order => order.paymentStatus === 'مدفوع');
    const accounting = getAccountingData();
    const expenses = accounting.expenses;
    const clients = accounting.clients;
    const suppliers = accounting.suppliers;
    const unpaidInvoices = accounting.unpaid;
    const cashMovements = accounting.cashMovements;
    const salesLedger = accounting.sales || [];
    const isClosed = accounting.dayClosed;

    // المجاميع الحسابية
    // لا تدخل المبيعات إلا بعد أن يؤكد المحاسب دفع الفاتورة.
    let totalSales = salesLedger
        .filter(sale => isTodayWard(sale.paidAt || sale.createdAt))
        .reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
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

        const deliveredUnpaid = orders.filter(order => order.status === 'تم التوصيل' && order.paymentStatus !== 'مدفوع');
        if (deliveredUnpaid.length) {
            taskCount++;
            tasksContainer.innerHTML += `<article class="accounting-task task-orange"><div class="task-icon"><i class="fa-solid fa-receipt"></i></div><div class="task-copy"><strong>فواتير بانتظار الدفع</strong><span>${deliveredUnpaid.length} طلبات تم توصيلها وتحتاج تأكيد الحساب</span></div><a href="#restaurant-orders">عرض الفواتير</a></article>`;
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

    // فواتير الطاولات: كل طلب ظاهر للمحاسب، ولا يتحول إلى سجل مبيعات قبل الدفع.
    const restaurantOrders = document.getElementById('restaurant-orders-list');
    if (restaurantOrders) {
        restaurantOrders.innerHTML = orders.length === 0 ? '<p style="color:#888;">لا توجد طلبات مسجلة اليوم.</p>' : orders.map(order => {
            const paid = order.paymentStatus === 'مدفوع';
            const canPay = order.status === 'تم التوصيل' && !paid;
            const statusColor = paid ? '#1565c0' : (order.status === 'تم التوصيل' ? '#ef6c00' : '#e91e63');
            const paymentText = paid ? 'مدفوع ومسجل بالمبيعات' : (order.status === 'تم التوصيل' ? 'بانتظار الدفع' : 'بانتظار تسليم الطلب');
            return `<article style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; background:#fafafa; border:1px solid #eee; padding:12px 15px; border-radius:8px; margin-bottom:8px;">
                <div><strong style="color:var(--primary);">طاولة ${escapeHtml(order.table)}</strong><span style="color:#777; margin-right:10px;">${escapeHtml(order.time)}</span><br><small>${order.items.map(item => `${escapeHtml(item.name)} × ${item.qty}`).join('، ')}</small></div>
                <div style="text-align:left;"><strong style="color:var(--gold); display:block;">${Number(order.total).toLocaleString('ar-SY')} ليرة</strong><span style="background:${statusColor}; color:#fff; padding:3px 7px; border-radius:4px; font-size:11px;">${paymentText}</span>${canPay ? `<a href="pos.html">فتح الكاشير</a>` : ''}</div>
            </article>`;
        }).join('');
    }

    // كاشير الطاولات: تجميع الطلبات المفتوحة لكل طاولة في فاتورة واحدة.
    const cashierTables = document.getElementById('cashier-tables-list');
    if (cashierTables) {
        const tableGroups = new Map();
        orders.filter(order => order.paymentStatus !== 'مدفوع').forEach(order => {
            const table = String(order.table);
            if (!tableGroups.has(table)) tableGroups.set(table, []);
            tableGroups.get(table).push(order);
        });
        if (tableGroups.size === 0) {
            cashierTables.innerHTML = '<p style="color:#2e7d32; grid-column:1/-1;">لا توجد حسابات طاولات مفتوحة حالياً.</p>';
        } else {
            cashierTables.innerHTML = [...tableGroups.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([table, tableOrders]) => {
                const readyToPay = tableOrders.filter(order => order.status === 'تم التوصيل');
                const waiting = tableOrders.filter(order => order.status !== 'تم التوصيل');
                const total = readyToPay.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
                const items = tableOrders.flatMap(order => order.items).map(item => `${escapeHtml(item.name)} × ${item.qty}`).join('، ');
                return `<article style="background:#fffafc; border:1px solid #f1c8d7; border-radius:10px; padding:15px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;"><strong style="color:var(--primary); font-size:18px;">الطاولة ${escapeHtml(table)}</strong><span style="font-size:12px; color:#777;">${tableOrders.length} طلب</span></div>
                    <p style="color:#555; font-size:13px; line-height:1.7; margin:10px 0;">${items}</p>
                    <strong style="display:block; color:var(--gold); font-size:17px;">المطلوب: ${total.toLocaleString('en-US')} ليرة</strong>
                    ${waiting.length ? `<small style="display:block; color:#e91e63; margin-top:7px;">${waiting.length} طلب بانتظار التوصيل</small>` : ''}
                    ${readyToPay.length ? `<a href="pos.html">فتح الكاشير</a>` : ''}
                </article>`;
            }).join('');
        }
    }

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

async function addExpense(e) {
    e.preventDefault();
    const title = document.getElementById('exp-title').value;
    const category = document.getElementById('exp-category').value;
    const amount = parseFloat(document.getElementById('exp-amount').value);

    await saveAccountingRecord('expenses', { title, category, amount, time: formatWardDateTime(Date.now()), createdAt: Date.now() });
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

async function toggleCloseDay() {
    return executeDailyClosing();
}
