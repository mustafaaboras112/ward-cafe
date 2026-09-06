const fs = require('fs');
const path = 'js/print.js';
let source = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const functionStart = source.indexOf('function printWardAccountingReport(');
const htmlStart = source.indexOf('    const html = `', functionStart);
let html = source.slice(htmlStart);
const cssStart = html.indexOf('<style>');
const cssEnd = html.indexOf('</style>', cssStart) + '</style>'.length;
html = html.slice(0, cssStart) + `<style>
@page {
    size: A4;
    margin: 12mm;
}

* { box-sizing: border-box; }

body {
    margin: 0;
    font-family: Arial, Tahoma, sans-serif;
    direction: rtl;
    color: #222;
    background: #fff;
    line-height: 1.4;
}

.report {
    position: relative;
    width: 100%;
    max-width: 186mm;
    margin: 0 auto;
    border: 2px solid #b75b73;
    border-radius: 16px;
    padding: 18px;
}

.report::before {
    content: '';
    position: absolute;
    inset: 5px;
    border: 1px solid #ead6dc;
    border-radius: 12px;
    pointer-events: none;
}

.report > * { position: relative; min-width: 0; }

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 18px;
    border-bottom: 2px solid #b75b73;
    padding: 2px 0 12px;
    margin-bottom: 14px;
}

.brand { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.brand-logo { font-size: 46px; line-height: 1; }
.brand strong { display: block; font-size: 26px; font-weight: 800; }
.brand small { font-size: 11px; color: #666; }
.report-title { min-width: 0; text-align: right; }
.report-title h1 { margin: 0 0 6px; font-size: 25px; font-weight: 800; }
.report-title p { margin: 3px 0; font-size: 11px; color: #666; }
.report-title .period { color: #222; font-weight: 700; }

.metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 12px;
}

.metric {
    min-width: 0;
    border: 1px solid #e4e4e4;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(34, 34, 34, .035);
    padding: 14px 8px;
    text-align: center;
}

.metric span { display: block; font-size: 11px; color: #666; margin-bottom: 5px; }
.metric strong { display: block; font-size: 24px; line-height: 1.2; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.metric small { font-size: 10px; color: #666; }
.metric-profit { border: 2px solid #b75b73; background: #fff8fa; padding: 13px 7px; }
.metric-profit .profit-positive { color: #245b43; }
.metric-profit .profit-negative { color: #b42332; }

.period-summary {
    border: 1px solid #ead6dc;
    border-radius: 12px;
    padding: 10px 12px;
    margin-bottom: 12px;
    background: #fff8fa;
}

.period-summary h2, .payment-box h2 { margin: 0 0 8px; font-size: 14px; }
.summary-items { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.summary-items > div { min-width: 0; }
.summary-items > div + div { border-inline-start: 1px solid #ead6dc; padding-inline-start: 10px; }
.summary-items span { display: block; font-size: 10px; color: #666; }
.summary-items strong { font-size: 15px; overflow-wrap: anywhere; }
.summary-items small { font-size: 10px; color: #666; }

.tables { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
.box { min-width: 0; border: 1px solid #ead6dc; border-radius: 12px; overflow: hidden; }
.box h2 { font-size: 15px; margin: 0; padding: 8px 10px; background: #fff8fa; border-bottom: 1px solid #ead6dc; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
th, td { padding: 7px 6px; border-bottom: 1px solid #e4e4e4; text-align: right; vertical-align: top; overflow-wrap: anywhere; }
th { background: #f5f5f5; color: #666; font-size: 10px; }
th:first-child { width: 38%; }
th:last-child { width: 26%; }
tbody tr:nth-child(even) { background: #fafafa; }
tbody tr:last-child td { border-bottom: 0; }
.record-date, .record-time { display: block; font-size: 10px; }
.record-time { color: #666; }

.payment-box { margin-top: 12px; border: 1px solid #ead6dc; border-radius: 12px; padding: 12px; }
.payment-bar { height: 24px; display: flex; border-radius: 8px; overflow: hidden; background: #f5f5f5; margin: 8px 0 10px; }
.cash { background: #b75b73; }
.card { background: #666; }
.payment-info { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; font-size: 11px; }
.payment-info > span { min-width: 0; overflow-wrap: anywhere; }
.payment-label { display: inline-flex; align-items: center; gap: 5px; }
.payment-label::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #b75b73; }
.payment-label-card::before { background: #666; }
.payment-percent { font-weight: 700; color: #222; }

.footer {
    border-top: 1px solid #ead6dc;
    border-radius: 0 0 8px 8px;
    background: #fff8fa;
    margin-top: 14px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 10px;
    color: #666;
}

.footer strong { color: #222; }
.footer p { margin: 2px 0 0; }
.page-number { white-space: nowrap; color: #b75b73; font-weight: 700; }

@media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report { page-break-inside: avoid; break-inside: avoid; }
    .header, .metric, .period-summary, .payment-box, .footer, tr { break-inside: avoid; }
    .box h2 { break-after: avoid; }
    thead { display: table-header-group; }
}
</style>` + html.slice(cssEnd);
html = html.replace('<p>\n                \${wardEscape(periodLabel)}', '<p class="period">\n                \${wardEscape(periodLabel)}');
html = html.replace('<strong>\n                \${wardPrintMoney(\n                    profit', '<strong class="\${profit < 0 ? \'profit-negative\' : \'profit-positive\'}">\n                \${wardPrintMoney(\n                    profit');
html = html.replace('    <div class="tables">', `    <section class="period-summary" aria-labelledby="period-summary-title">
        <h2 id="period-summary-title">ملخص الفترة</h2>
        <div class="summary-items">
            <div><span>عدد الفواتير</span><strong>\${sales.length}</strong> <small>فاتورة</small></div>
            <div><span>متوسط قيمة الفاتورة</span><strong>\${wardPrintMoney(sales.length > 0 ? totalSales / sales.length : 0)}</strong> <small>ليرة</small></div>
            <div><span>أعلى طريقة دفع استخدامًا</span><strong>\${cashSales > cardSales ? 'نقدي' : cardSales > cashSales ? 'بطاقة' : 'متساوي'}</strong></div>
        </div>
    </section>

    <div class="tables">`);
html = html.replace('<strong>\n            توزيع طرق الدفع\n        </strong>', '<h2>توزيع طرق الدفع</h2>');
html = html.replace('                ● نقدي:', `                <b class="payment-label">نقدي</b>
                <bdi class="payment-percent">(\${(totalSales > 0 ? cashSales / totalSales * 100 : 0).toFixed(1)}%)</bdi><br>`);
html = html.replace('                ● بطاقة:', `                <b class="payment-label payment-label-card">بطاقة</b>
                <bdi class="payment-percent">(\${(totalSales > 0 ? cardSales / totalSales * 100 : 0).toFixed(1)}%)</bdi><br>`);
html = html.replace(`        🌸 كافيه ورد —
        تقرير صادر من النظام المحاسبي`, `        <div>
            <strong>كافيه ورد</strong> — تقرير صادر من النظام المحاسبي
            <p>تاريخ ووقت الإصدار: \${wardPrintDate(generatedAt)} — \${wardPrintTime(generatedAt)}</p>
        </div>
        <span class="page-number">صفحة 1</span>`);
source = source.slice(0, htmlStart) + html;
// Only wrap the report's existing date/time output; preserve the values and filtering.
const reportPrefix = source.slice(functionStart, htmlStart).replaceAll(`\${wardPrintDate(recordDate(item.createdAt))} \${wardPrintTime(
                            recordDate(item.createdAt)
                        )}`, `<span class="record-date">\${wardPrintDate(recordDate(item.createdAt))}</span>
                        <span class="record-time">\${wardPrintTime(
                            recordDate(item.createdAt)
                        )}</span>`);
source = source.slice(0, functionStart) + reportPrefix + html;
fs.writeFileSync(path, source.replace(/\n/g, '\r\n'));
