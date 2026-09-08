'use strict';

const acc=id=>document.getElementById(id);
const money=value=>new Intl.NumberFormat('ar',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0));
const methodLabel=value=>value==='card'?'بطاقة':'نقدي';
let accountingBusy=false;

function accountingTotals(){
    const data=getAccountingData();
    const sales=Array.isArray(data.sales)?data.sales:[];
    const expenses=Array.isArray(data.expenses)?data.expenses:[];
    const totalSales=sales.reduce((sum,row)=>sum+Number(row.total||0),0);
    const cashSales=sales.filter(row=>(row.paymentMethod||row.method)==='cash').reduce((sum,row)=>sum+Number(row.total||0),0);
    const cardSales=sales.filter(row=>(row.paymentMethod||row.method)==='card').reduce((sum,row)=>sum+Number(row.total||0),0);
    const totalExpenses=expenses.reduce((sum,row)=>sum+Number(row.amount||0),0);
    return {sales,expenses,totalSales,cashSales,cardSales,totalExpenses,net:totalSales-totalExpenses};
}

function setText(id,value){const node=acc(id);if(node)node.textContent=value;}
function setBusy(value){
    accountingBusy=value;
    document.querySelectorAll('[data-accounting-action]').forEach(button=>button.disabled=value);
    const shell=acc('accounting-shell');if(shell)shell.setAttribute('aria-busy',String(value));
}
function showNotice(message,error=false){
    const node=acc('accounting-notice');if(!node)return;
    node.textContent=message;node.dataset.error=String(error);node.hidden=false;
    clearTimeout(showNotice.timer);showNotice.timer=setTimeout(()=>{node.hidden=true;},4200);
}

function renderSummary(){
    const data=getAccountingData(),totals=accountingTotals();
    setText('metric-sales',money(totals.totalSales)+' ليرة');
    setText('metric-cash',money(totals.cashSales)+' ليرة');
    setText('metric-card',money(totals.cardSales)+' ليرة');
    setText('metric-expenses',money(totals.totalExpenses)+' ليرة');
    setText('metric-net',money(totals.net)+' ليرة');
    setText('metric-orders',String(totals.sales.length));
    const state=acc('day-state');
    if(state){state.textContent=data.dayClosed?'مغلق':'مفتوح';state.dataset.state=data.dayClosed?'closed':'open';}
    const close=acc('close-day');
    if(close){close.disabled=accountingBusy||data.dayClosed;close.textContent=data.dayClosed?'تم إغلاق اليوم':'إغلاق اليوم';}
}

function renderSales(){
    const body=acc('sales-body');if(!body)return;
    const query=(acc('sales-search')?.value||'').trim().toLowerCase();
    const method=acc('sales-method')?.value||'';
    let rows=[...accountingTotals().sales];
    if(method)rows=rows.filter(row=>(row.paymentMethod||row.method)===method);
    if(query)rows=rows.filter(row=>`${row.id||''} ${row.table||row.tableNumber||''} ${row.total||''}`.toLowerCase().includes(query));
    body.replaceChildren();
    if(!rows.length){const tr=body.insertRow();const td=tr.insertCell();td.colSpan=5;td.className='empty-cell';td.textContent='لا توجد مبيعات مطابقة اليوم.';return;}
    for(const row of rows){
        const tr=body.insertRow();
        const values=[`#${String(row.id||'').slice(-6)}`,`طاولة ${row.table||row.tableNumber||'-'}`,formatWardDateTime(row.paidAt||row.createdAt),methodLabel(row.paymentMethod||row.method),money(row.total)+' ليرة'];
        values.forEach(value=>{const td=tr.insertCell();td.textContent=value;});
    }
}

function renderExpenses(){
    const body=acc('expenses-body');if(!body)return;
    const rows=[...accountingTotals().expenses];body.replaceChildren();
    if(!rows.length){const tr=body.insertRow();const td=tr.insertCell();td.colSpan=4;td.className='empty-cell';td.textContent='لا توجد مصروفات مسجلة اليوم.';return;}
    for(const row of rows){
        const tr=body.insertRow();
        [row.title||'مصروف',row.notes||'—',formatWardDateTime(row.createdAt),money(row.amount)+' ليرة'].forEach(value=>{const td=tr.insertCell();td.textContent=value;});
    }
}

function renderActivity(){
    const list=acc('activity-list');if(!list)return;
    const data=getAccountingData();
    const rows=[
        ...(data.sales||[]).map(row=>({time:row.paidAt||row.createdAt,label:`بيع · طاولة ${row.table||row.tableNumber||'-'}`,amount:Number(row.total||0),kind:'sale'})),
        ...(data.expenses||[]).map(row=>({time:row.createdAt,label:`مصروف · ${row.title||'مصروف'}`,amount:Number(row.amount||0),kind:'expense'}))
    ].sort((a,b)=>Number(b.time||0)-Number(a.time||0)).slice(0,8);
    list.replaceChildren();
    if(!rows.length){const p=document.createElement('p');p.className='accounting-empty';p.textContent='لا توجد حركات مالية اليوم.';list.appendChild(p);return;}
    for(const row of rows){
        const item=document.createElement('div');item.className='accounting-activity';
        const copy=document.createElement('div');const strong=document.createElement('strong');strong.textContent=row.label;const small=document.createElement('small');small.textContent=formatWardDateTime(row.time);copy.append(strong,small);
        const amount=document.createElement('b');amount.textContent=(row.kind==='expense'?'− ':'+ ')+money(row.amount)+' ليرة';amount.dataset.kind=row.kind;
        item.append(copy,amount);list.appendChild(item);
    }
}

function renderReport(){
    const t=accountingTotals();
    setText('report-sales',money(t.totalSales)+' ليرة');
    setText('report-expenses',money(t.totalExpenses)+' ليرة');
    setText('report-net',money(t.net)+' ليرة');
    setText('report-cash',money(t.cashSales)+' ليرة');
    setText('report-card',money(t.cardSales)+' ليرة');
    setText('report-count',String(t.sales.length));
}

function renderAccounting(){
    renderSummary();renderSales();renderExpenses();renderActivity();renderReport();
    const badge=acc('accounting-connection');
    if(badge){badge.textContent=WardServerState.online===false?'غير متصل':'متصل بالخادم';badge.dataset.state=WardServerState.online===false?'offline':'online';}
}

function openAccountingTab(name){
    document.querySelectorAll('[data-accounting-page]').forEach(page=>page.hidden=page.dataset.accountingPage!==name);
    document.querySelectorAll('[data-accounting-nav]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.accountingNav===name)));
    const titles={dashboard:['لوحة اليوم','ملخص المبيعات والمصروفات وحالة الإغلاق'],sales:['مبيعات اليوم','كل عمليات التحصيل المسجلة من الكاشير'],expenses:['مصروفات اليوم','المصروفات المعتمدة والمسجلة في MySQL'],reports:['تقرير اليوم','ملخص مالي سريع لليوم الحالي']};
    const info=titles[name]||titles.dashboard;setText('accounting-title',info[0]);setText('accounting-subtitle',info[1]);
}

function openExpenseDialog(){
    const dialog=acc('expense-dialog');if(!dialog)return;
    acc('expense-form')?.reset();
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    setTimeout(()=>acc('expense-title')?.focus(),30);
}
function closeExpenseDialog(){const dialog=acc('expense-dialog');if(dialog?.open&&typeof dialog.close==='function')dialog.close();else dialog?.removeAttribute('open');}

async function submitExpense(event){
    event.preventDefault();if(accountingBusy)return;
    const title=acc('expense-title').value.trim(),notes=acc('expense-notes').value.trim(),amount=Number(acc('expense-amount').value);
    if(title.length<2||!Number.isFinite(amount)||amount<=0){showNotice('أدخل اسم المصروف ومبلغًا أكبر من صفر.',true);return;}
    setBusy(true);
    try{await saveAccountingRecord('expenses',{title,notes,amount});closeExpenseDialog();showNotice('تم حفظ المصروف في MySQL.');}
    catch(error){showNotice(error.message||'تعذر حفظ المصروف.',true);}
    finally{setBusy(false);renderAccounting();}
}

async function closeDay(){
    if(accountingBusy||getAccountingData().dayClosed)return;
    if(!confirm('إغلاق اليوم المحاسبي الآن؟ بعد الإغلاق لن يقبل النظام دفعات أو مصروفات جديدة لهذا اليوم.'))return;
    setBusy(true);
    try{await closeAccountingDay();showNotice('تم إغلاق اليوم المحاسبي بنجاح.');}
    catch(error){showNotice(error.message||'تعذر إغلاق اليوم.',true);}
    finally{setBusy(false);renderAccounting();}
}

async function manualRefresh(){
    if(accountingBusy)return;setBusy(true);
    try{await refreshAccounting();showNotice('تم تحديث البيانات.');}
    catch(error){showNotice(error.message||'تعذر تحديث البيانات.',true);}
    finally{setBusy(false);renderAccounting();}
}

window.addEventListener('ward:accounting',renderAccounting);
window.addEventListener('ward:connection',renderAccounting);
window.addEventListener('DOMContentLoaded',async()=>{
    if(window.WardAuth)await WardAuth.ready;
    document.querySelectorAll('[data-accounting-nav]').forEach(button=>button.addEventListener('click',()=>openAccountingTab(button.dataset.accountingNav)));
    acc('add-expense')?.addEventListener('click',openExpenseDialog);
    acc('expense-cancel')?.addEventListener('click',closeExpenseDialog);
    acc('expense-form')?.addEventListener('submit',submitExpense);
    acc('close-day')?.addEventListener('click',closeDay);
    acc('accounting-refresh')?.addEventListener('click',manualRefresh);
    acc('accounting-print')?.addEventListener('click',()=>window.print());
    acc('sales-search')?.addEventListener('input',renderSales);
    acc('sales-method')?.addEventListener('change',renderSales);
    openAccountingTab('dashboard');renderAccounting();startAccountingRealtime();
});
