/* =========================================================
   كافيه ورد - نظام الطباعة
   js/print.js
========================================================= */

function wardPrintMoney(value) {
    return Number(value || 0).toFixed(2);
}

function wardPrintDate(value) {
    const date = new Date(value || Date.now());

    return new Intl.DateTimeFormat('ar', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function wardPrintTime(value) {
    const date = new Date(value || Date.now());

    return new Intl.DateTimeFormat('ar', {
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function wardEscape(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}


/* =========================================================
   فتح مستند للطباعة داخل iframe
========================================================= */

function wardPrintDocument(html) {

    const oldFrame =
        document.getElementById('ward-print-frame');

    if (oldFrame) {
        oldFrame.remove();
    }

    const frame =
        document.createElement('iframe');

    frame.id = 'ward-print-frame';

    frame.style.position = 'fixed';
    frame.style.right = '-9999px';
    frame.style.bottom = '0';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.border = '0';

    document.body.appendChild(frame);

    const doc =
        frame.contentWindow.document;

    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {

        try {

            frame.contentWindow.focus();
            frame.contentWindow.print();

        } catch (error) {

            console.error(
                'تعذر فتح نافذة الطباعة:',
                error
            );

        }

        setTimeout(
            () => frame.remove(),
            3000
        );

    }, 400);
}



/* =========================================================
   دمج أصناف فاتورة الكاشير
========================================================= */

function wardReceiptItems(receipt) {

    const map = new Map();

    (receipt?.orders || [])
        .forEach(order => {

            (order.items || [])
                .forEach(item => {

                    const name =
                        item.name ||
                        item.title ||
                        'صنف';

                    const price =
                        Number(
                            item.price || 0
                        );

                    const qty =
                        Number(
                            item.qty ||
                            item.quantity ||
                            1
                        );

                    const key =
                        `${name}__${price}`;

                    if (!map.has(key)) {

                        map.set(key, {
                            name,
                            price,
                            qty: 0
                        });
                    }

                    map.get(key).qty += qty;
                });
        });

    return [...map.values()];
}


/* =========================================================
   فاتورة الزبون - 80mm
========================================================= */

function printWardReceipt(receipt) {

    if (!receipt) {
        alert('لا توجد فاتورة جاهزة للطباعة.');
        return;
    }

    const items =
        wardReceiptItems(receipt);

    const invoiceNumbers =
        (receipt.orders || [])
            .map(order =>
                String(
                    order.id ||
                    order.orderId ||
                    ''
                ).slice(0, 8)
            )
            .filter(Boolean)
            .join(' / ');

    const itemsHtml =
        items.length
            ? items.map(item => {

                const lineTotal =
                    item.price * item.qty;

                return `
                    <tr>
                        <td class="item-name">
                            ${wardEscape(item.name)}
                        </td>

                        <td>
                            ${item.qty}
                        </td>

                        <td>
                            ${wardPrintMoney(item.price)}
                        </td>

                        <td>
                            ${wardPrintMoney(lineTotal)}
                        </td>
                    </tr>
                `;

            }).join('')
            : `
                <tr>
                    <td colspan="4">
                        لا توجد أصناف
                    </td>
                </tr>
            `;


    const payment =
        receipt.method === 'card'
            ? 'بطاقة'
            : 'نقدي';


    const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>

<meta charset="UTF-8">

<title>فاتورة كافيه ورد</title>

<style>

@page {
    size: 80mm auto;
    margin: 3mm;
}

* {
    box-sizing: border-box;
}

html,
body {
    margin: 0;
    padding: 0;
}

body {
    width: 74mm;
    margin: 0 auto;
    font-family:
        Arial,
        "Tahoma",
        sans-serif;
    color: #111;
    background: #fff;
    direction: rtl;
    font-size: 12px;
}

.receipt {
    width: 100%;
}

.logo {
    text-align: center;
    font-size: 30px;
    margin-top: 3px;
}

.cafe-name {
    text-align: center;
    font-size: 24px;
    font-weight: 800;
    margin: 2px 0;
}

.slogan {
    text-align: center;
    font-size: 12px;
    margin-bottom: 10px;
}

.line {
    border-top: 1px dashed #222;
    margin: 9px 0;
}

.info {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 5px 10px;
    line-height: 1.5;
}

.info strong {
    font-weight: 800;
}

table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
}

th {
    border-bottom: 1px solid #111;
    padding: 5px 2px;
    font-weight: 800;
}

td {
    padding: 5px 2px;
    text-align: center;
    vertical-align: top;
}

.item-name {
    text-align: right;
    max-width: 28mm;
}

.total-box {
    font-size: 13px;
}

.total-row {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
}

.grand-total {
    font-size: 19px;
    font-weight: 900;
    padding-top: 5px;
}

.payment-row {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
}

.thanks {
    text-align: center;
    margin: 14px 0 5px;
    font-size: 14px;
    font-weight: 700;
}

.footer {
    text-align: center;
    font-size: 11px;
    line-height: 1.6;
}

@media print {

    body {
        width: 74mm;
    }
}

</style>

</head>

<body>

<div class="receipt">

    <div class="logo">🌸</div>

    <div class="cafe-name">
        كافيه ورد
    </div>

    <div class="slogan">
        القهوة تصنع اللحظات الجميلة
    </div>

    <div class="line"></div>

    <div class="info">

        <strong>رقم الفاتورة:</strong>
        <span>
            ${wardEscape(
                invoiceNumbers || '-'
            )}
        </span>

        <strong>التاريخ:</strong>
        <span>
            ${wardPrintDate(
                receipt.paidAt
            )}
        </span>

        <strong>الوقت:</strong>
        <span>
            ${wardPrintTime(
                receipt.paidAt
            )}
        </span>

        <strong>الطاولة:</strong>
        <span>
            ${wardEscape(
                receipt.table
            )}
        </span>

    </div>

    <div class="line"></div>

    <table>

        <thead>

            <tr>
                <th>الصنف</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th>المجموع</th>
            </tr>

        </thead>

        <tbody>
            ${itemsHtml}
        </tbody>

    </table>

    <div class="line"></div>

    <div class="total-box">

        <div class="total-row grand-total">

            <span>
                الإجمالي
            </span>

            <span>
                ${wardPrintMoney(
                    receipt.total
                )} ليرة
            </span>

        </div>

    </div>

    <div class="line"></div>

    <div class="payment-row">

        <strong>
            طريقة الدفع
        </strong>

        <span>
            ${payment}
        </span>

    </div>

    <div class="payment-row">

        <strong>
            المدفوع
        </strong>

        <span>
            ${wardPrintMoney(
                receipt.received
            )} ليرة
        </span>

    </div>

    ${
        receipt.method === 'cash'
            ? `
                <div class="payment-row">

                    <strong>
                        الباقي
                    </strong>

                    <span>
                        ${wardPrintMoney(
                            receipt.change
                        )} ليرة
                    </span>

                </div>
            `
            : ''
    }

    <div class="line"></div>

    <div class="thanks">
        🌸 شكراً لزيارتكم 🌸
    </div>

    <div class="footer">
        <strong>كافيه ورد</strong><br>
        نراكم دائماً
    </div>

</div>

</body>
</html>
    `;

    wardPrintDocument(html);
}


/* =========================================================
   التقرير المحاسبي
========================================================= */

function wardIsToday(value) {

    const date =
        new Date(value || 0);

    const today =
        new Date();

    return (
        date.getFullYear() ===
            today.getFullYear() &&

        date.getMonth() ===
            today.getMonth() &&

        date.getDate() ===
            today.getDate()
    );
}


function printWardAccountingReport(accounting, range = null) {

    if (!accounting) {
        alert('لا توجد بيانات محاسبية.');
        return;
    }

    if (!range) {
        const now = new Date();
        range = {
            startTimestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(),
            endTimestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()
        };
    }
    if (!Number.isFinite(range.startTimestamp) || !Number.isFinite(range.endTimestamp)) {
        alert('يرجى إدخال تاريخ صحيح.');
        return;
    }
    if (range.startTimestamp > range.endTimestamp) {
        alert('تاريخ البداية يجب أن يكون قبل تاريخ النهاية.');
        return;
    }
    const inRange = value => {
        if (value === null || value === undefined || value === '') return false;
        const timestamp = typeof value === 'string' && /^\d+$/.test(value)
            ? Number(value) : new Date(value).getTime();
        return Number.isFinite(timestamp) && timestamp >= range.startTimestamp && timestamp <= range.endTimestamp;
    };
    const formatDay = value => {
        const date = new Date(value);
        return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')].join('/');
    };
    const from = formatDay(range.startTimestamp);
    const to = formatDay(range.endTimestamp);
    const periodLabel = from === to ? 'تقرير يوم: ' + from : 'الفترة: من ' + from + ' إلى ' + to;
    const recordDate = value => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    const sales = (accounting.sales || []).filter(item => inRange(item.paidAt || item.createdAt));
    const purchases = (accounting.purchases || []).filter(item => inRange(item.createdAt));
    const expenses = (accounting.expenses || []).filter(item => inRange(item.createdAt));

    const totalSales =
        sales.reduce(
            (sum, item) =>
                sum +
                Number(
                    item.total || 0
                ),
            0
        );

    const cashSales =
        sales
            .filter(item =>
                item.paymentMethod ===
                'cash'
            )
            .reduce(
                (sum, item) =>
                    sum +
                    Number(
                        item.total || 0
                    ),
                0
            );

    const cardSales =
        sales
            .filter(item =>
                item.paymentMethod ===
                'card'
            )
            .reduce(
                (sum, item) =>
                    sum +
                    Number(
                        item.total || 0
                    ),
                0
            );

    const totalPurchases =
        purchases.reduce(
            (sum, item) =>
                sum +
                Number(
                    item.total || 0
                ),
            0
        );

    const totalExpenses =
        expenses.reduce(
            (sum, item) =>
                sum +
                Number(
                    item.amount || 0
                ),
            0
        );

    const profit =
        totalSales -
        totalPurchases -
        totalExpenses;


    const purchaseRows =
        purchases
            .map(item => `
                <tr>

                    <td>
                        ${wardPrintDate(recordDate(item.createdAt))} ${wardPrintTime(
                            recordDate(item.createdAt)
                        )}
                    </td>

                    <td>
                        ${wardEscape(
                            item.supplier ||
                            '-'
                        )}
                    </td>

                    <td>
                        ${wardPrintMoney(
                            item.total
                        )}
                    </td>

                </tr>
            `)
            .join('');


    const expenseRows =
        expenses
            .map(item => `
                <tr>

                    <td>
                        ${wardPrintDate(recordDate(item.createdAt))} ${wardPrintTime(
                            recordDate(item.createdAt)
                        )}
                    </td>

                    <td>
                        ${wardEscape(
                            item.description ||
                            item.category ||
                            '-'
                        )}
                    </td>

                    <td>
                        ${wardPrintMoney(
                            item.amount
                        )}
                    </td>

                </tr>
            `)
            .join('');


    const generatedAt =
        Date.now();


    const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>

<meta charset="UTF-8">

<title>التقرير المحاسبي - كافيه ورد</title>

<style>

@page {
    size: A4;
    margin: 12mm;
}

* {
    box-sizing: border-box;
}

body {
    margin: 0;
    font-family:
        Arial,
        Tahoma,
        sans-serif;
    direction: rtl;
    color: #222;
    background: white;
}

.report {
    width: 100%;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom:
        3px solid #b75b73;
    padding-bottom: 15px;
    margin-bottom: 20px;
}

.brand {
    display: flex;
    align-items: center;
    gap: 10px;
}

.brand-logo {
    font-size: 42px;
}

.brand strong {
    display: block;
    font-size: 24px;
}

.brand small {
    color: #777;
}

.report-title {
    text-align: left;
}

.report-title h1 {
    margin: 0 0 8px;
    font-size: 25px;
}

.report-title p {
    margin: 4px 0;
    font-size: 12px;
    color: #555;
}

.metrics {
    display: grid;
    grid-template-columns:
        repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 20px;
}

.metric {
    border: 1px solid #ddd;
    border-radius: 10px;
    padding: 12px;
    text-align: center;
    min-height: 90px;
}

.metric span {
    display: block;
    font-size: 12px;
    margin-bottom: 8px;
}

.metric strong {
    display: block;
    font-size: 21px;
}

.metric small {
    color: #777;
}

.metric-profit {
    border-color: #b75b73;
}

.tables {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
}

.box {
    border: 1px solid #ddd;
    border-radius: 10px;
    overflow: hidden;
}

.box h2 {
    font-size: 16px;
    margin: 0;
    padding: 10px 12px;
    background: #f5f5f5;
}

table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}

th,
td {
    padding: 8px;
    border-bottom: 1px solid #eee;
    text-align: right;
}

th {
    background: #fafafa;
}

.payment-box {
    margin-top: 15px;
    border: 1px solid #ddd;
    border-radius: 10px;
    padding: 15px;
}

.payment-bar {
    height: 20px;
    display: flex;
    border-radius: 10px;
    overflow: hidden;
    background: #eee;
    margin: 12px 0;
}

.cash {
    background: #b75b73;
}

.card {
    background: #555866;
}

.payment-info {
    display: flex;
    gap: 25px;
    font-size: 13px;
}

.footer {
    border-top: 1px solid #bbb;
    margin-top: 30px;
    padding-top: 12px;
    text-align: center;
    font-size: 11px;
    color: #666;
}

</style>

</head>

<body>

<div class="report">

    <div class="header">

        <div class="brand">

            <div class="brand-logo">
                🌸
            </div>

            <div>

                <strong>
                    كافيه ورد
                </strong>

                <small>
                    النظام المحاسبي
                </small>

            </div>

        </div>


        <div class="report-title">

            <h1>
                التقرير المحاسبي
            </h1>

            <p>
                ${wardEscape(periodLabel)}
            </p>

            <p>
                وقت إصدار التقرير: ${wardPrintDate(generatedAt)}
                ${wardPrintTime(
                    generatedAt
                )}
            </p>

        </div>

    </div>


    <div class="metrics">

        <div class="metric">

            <span>
                إجمالي المبيعات
            </span>

            <strong>
                ${wardPrintMoney(
                    totalSales
                )}
            </strong>

            <small>ليرة</small>

        </div>


        <div class="metric">

            <span>
                المبيعات النقدية
            </span>

            <strong>
                ${wardPrintMoney(
                    cashSales
                )}
            </strong>

            <small>ليرة</small>

        </div>


        <div class="metric">

            <span>
                مبيعات البطاقة
            </span>

            <strong>
                ${wardPrintMoney(
                    cardSales
                )}
            </strong>

            <small>ليرة</small>

        </div>


        <div class="metric">

            <span>
                عدد الفواتير
            </span>

            <strong>
                ${sales.length}
            </strong>

            <small>فاتورة</small>

        </div>


        <div class="metric">

            <span>
                المشتريات
            </span>

            <strong>
                ${wardPrintMoney(
                    totalPurchases
                )}
            </strong>

            <small>ليرة</small>

        </div>


        <div class="metric">

            <span>
                المصروفات
            </span>

            <strong>
                ${wardPrintMoney(
                    totalExpenses
                )}
            </strong>

            <small>ليرة</small>

        </div>


        <div class="metric metric-profit">

            <span>
                صافي الربح
            </span>

            <strong>
                ${wardPrintMoney(
                    profit
                )}
            </strong>

            <small>ليرة</small>

        </div>


        <div class="metric">

            <span>
                حالة الصندوق الحالية
            </span>

            <strong style="font-size:17px">
                ${
                    accounting.dayClosed
                        ? 'مغلق'
                        : 'مفتوح'
                }
            </strong>

        </div>

    </div>


    <div class="tables">

        <div class="box">

            <h2>
                المشتريات
            </h2>

            <table>

                <thead>

                    <tr>
                        <th>التاريخ والوقت</th>
                        <th>المورد</th>
                        <th>المبلغ</th>
                    </tr>

                </thead>

                <tbody>

                    ${
                        purchaseRows ||
                        `
                            <tr>
                                <td colspan="3">
                                    لا توجد مشتريات في الفترة المحددة
                                </td>
                            </tr>
                        `
                    }

                </tbody>

            </table>

        </div>


        <div class="box">

            <h2>
                المصروفات
            </h2>

            <table>

                <thead>

                    <tr>
                        <th>التاريخ والوقت</th>
                        <th>البيان</th>
                        <th>المبلغ</th>
                    </tr>

                </thead>

                <tbody>

                    ${
                        expenseRows ||
                        `
                            <tr>
                                <td colspan="3">
                                    لا توجد مصروفات في الفترة المحددة
                                </td>
                            </tr>
                        `
                    }

                </tbody>

            </table>

        </div>

    </div>


    <div class="payment-box">

        <strong>
            توزيع طرق الدفع
        </strong>

        <div class="payment-bar">

            <div
                class="cash"
                style="
                    width:${
                        totalSales > 0
                            ? (
                                cashSales /
                                totalSales *
                                100
                            )
                            : 0
                    }%
                "
            ></div>

            <div
                class="card"
                style="
                    width:${
                        totalSales > 0
                            ? (
                                cardSales /
                                totalSales *
                                100
                            )
                            : 0
                    }%
                "
            ></div>

        </div>


        <div class="payment-info">

            <span>
                ● نقدي:
                ${wardPrintMoney(
                    cashSales
                )} ليرة
            </span>

            <span>
                ● بطاقة:
                ${wardPrintMoney(
                    cardSales
                )} ليرة
            </span>

        </div>

    </div>


    <div class="footer">

        🌸 كافيه ورد —
        تقرير صادر من النظام المحاسبي

    </div>

</div>

</body>
</html>
    `;

    wardPrintDocument(html);
}
