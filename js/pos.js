let selectedTable = null;
let paymentBusy = false;
let lastReceipt = null;
function posTotal() { return Math.round(payableOrders(selectedTable).reduce((sum,order)=>sum+Number(order.total),0)*100)/100; }
function selectPosTable(table) {
    if(paymentBusy) return;
    selectedTable=table;lastReceipt=null;
    document.getElementById('pos-success').hidden=true;
    document.getElementById('pos-feedback').textContent='';
    document.getElementById('pos-received').value='';renderPos();
}
function setPosMethod(method) {
    if(paymentBusy || !['cash','card'].includes(method)) return;
    document.getElementById('pos-method').value=method;updatePosChange();
}
function setPosAmount(amount) {
    if(paymentBusy || !selectedTable || document.getElementById('pos-method').value!=='cash') return;
    document.getElementById('pos-received').value=Number(amount).toFixed(2);updatePosChange();
}
function payableOrders(table) {
    return getOrders().filter(order=>String(order.table)===String(table) && order.paymentStatus!=='مدفوع');
}
async function collectTablePayment(table, tendered, method) {
    if(!validTable(table) || !['cash','card'].includes(method)) throw new Error('اختر الطاولة وطريقة الدفع.');
    const paidAt=Date.now();
    let receipt;
    await changeCafeState(state=>{
        if(state.accounting.dayClosed) throw new Error('الصندوق مغلق. افتح الوردية من المحاسبة أولاً.');
        const orders=openTableOrders(state,table);
        if(!orders.length) throw new Error('لا توجد طلبات غير مدفوعة لهذه الطاولة.');
        if(orders.some(order=>order.status!=='تم التوصيل')) throw new Error('يجب توصيل جميع طلبات الطاولة قبل تحصيل الحساب.');
        const total=Math.round(orders.reduce((sum,order)=>sum+Number(order.total),0)*100)/100;
        if(!Number.isFinite(total)||total<0) throw new Error('إجمالي غير صالح.');
        if(method==='cash' && (!Number.isFinite(tendered)||tendered<total)) throw new Error('المبلغ المستلم أقل من إجمالي الفاتورة.');
        state.accounting.sales ||= {};
        orders.forEach(order=>{
            order.paymentStatus='مدفوع';order.paidAt=paidAt;order.paymentMethod=method;
            state.accounting.sales[order.id]={id:String(order.id),orderId:String(order.id),table:order.table,total:order.total,paidAt,time:formatWardDateTime(paidAt),paymentMethod:method,items:order.items};
        });
        receipt={table,total,method,paidAt,items:orders.flatMap(order=>order.items),received:method==='cash'?tendered:total,change:method==='cash'?Math.round((tendered-total)*100)/100:0};
    });
    return receipt;
}
function renderPos() {
    const tables=[...new Set(getOrders().filter(order=>order.paymentStatus!=='مدفوع').map(order=>String(order.table)))].sort((a,b)=>Number(a)-Number(b));
    const list=document.getElementById('pos-tables');list.replaceChildren();
    for(const table of tables) {
        const orders=payableOrders(table), ready=orders.every(order=>order.status==='تم التوصيل');
        const button=document.createElement('button');button.className='pos-table'+(table===selectedTable?' selected':'');
        button.textContent=`طاولة ${table} · ${orders.reduce((sum,order)=>sum+Number(order.total),0)} ليرة · ${ready?'جاهزة للتحصيل':'بانتظار التوصيل'}`;
        button.disabled=paymentBusy;
        button.addEventListener('click',()=>selectPosTable(table));list.append(button);
    }
    if(!tables.length) list.textContent='لا توجد حسابات مفتوحة.';
    const orders=payableOrders(selectedTable);
    document.getElementById('pos-title').textContent=orders.length?`فاتورة الطاولة ${selectedTable}`:lastReceipt?`فاتورة مدفوعة · طاولة ${lastReceipt.table}`:'اختر طاولة لعرض الفاتورة';
    const lines=orders.length?orders.flatMap(order=>order.items):(lastReceipt?.items || []);
    document.getElementById('pos-items').innerHTML=lines.map(item=>`<div class="pos-line"><span>${escapeHtml(item.name)} × ${item.qty}</span><b>${(item.price*item.qty).toFixed(2)} ليرة</b></div>`).join('');
    document.getElementById('pos-total').textContent=(orders.length?orders.reduce((sum,order)=>sum+Number(order.total),0):(lastReceipt?.total || 0)).toFixed(2)+' ليرة';
    document.getElementById('pos-pay').disabled=paymentBusy || !orders.length || orders.some(order=>order.status!=='تم التوصيل');
    document.getElementById('pos-pay').textContent=paymentBusy?'جارٍ حفظ الدفع…':'تأكيد استلام الدفع (F9)';
    document.getElementById('pos-payment').setAttribute('aria-busy',String(paymentBusy));
    document.getElementById('pos-payment').hidden=!!lastReceipt && !orders.length;
    const amounts=document.getElementById('pos-amounts');amounts.replaceChildren();
    const total=posTotal();
    const shortcuts=[...new Set([50,100,200,500,1000,Math.ceil(total/100)*100].filter(value=>value>=total && value>0))].sort((a,b)=>a-b).slice(0,4);
    for(const amount of shortcuts) {
        const button=document.createElement('button');button.type='button';button.textContent=amount+' ليرة';button.disabled=paymentBusy || !orders.length;
        button.addEventListener('click',()=>setPosAmount(amount));amounts.appendChild(button);
    }
    updatePosChange();
}
function updatePosChange() {
    const total=posTotal();
    const received=Number(document.getElementById('pos-received').value);
    const card=document.getElementById('pos-method').value==='card';
    document.getElementById('pos-received').disabled=paymentBusy || card || !selectedTable;
    document.getElementById('pos-cash-fields').hidden=card;
    document.getElementById('pos-card-note').hidden=!card;
    for(const method of ['cash','card']) {
        document.getElementById('pos-'+method).disabled=paymentBusy;
        document.getElementById('pos-'+method).setAttribute('aria-pressed',String(card===(method==='card')));
    }
    document.getElementById('pos-exact').disabled=paymentBusy || !selectedTable;
    document.getElementById('pos-change').textContent=card?'0.00 ليرة':Math.max(0,received-total).toFixed(2)+' ليرة';
    document.getElementById('pos-shortfall').textContent=!card && received<total?`المبلغ الناقص: ${(total-received).toFixed(2)} ليرة`:'';
}
async function paySelectedTable(event) {
    event?.preventDefault();
    if(paymentBusy || !selectedTable) return;
    const table=selectedTable, received=Number(document.getElementById('pos-received').value), method=document.getElementById('pos-method').value;
    document.getElementById('pos-feedback').textContent='';
    paymentBusy=true;renderPos();
    try {
        const receipt=await collectTablePayment(table,received,method);
        lastReceipt=receipt;
        document.getElementById('pos-success-details').textContent=`الطاولة ${receipt.table} · المبلغ: ${receipt.total.toFixed(2)} ليرة · الباقي: ${receipt.change.toFixed(2)} ليرة · طريقة الدفع: ${receipt.method==='cash'?'نقداً':'بطاقة'}`;
        document.getElementById('pos-success').hidden=false;
        selectedTable=null;
    } catch(error) { document.getElementById('pos-feedback').textContent=error.message; }
    finally {paymentBusy=false;renderPos();}
}
window.addEventListener('ward:orders',renderPos);
function handlePosShortcut(event) {
    if(event.key==='F9') {event.preventDefault();if(!event.repeat && !document.getElementById('pos-pay').disabled) return paySelectedTable();}
}
window.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('pos-payment').addEventListener('submit',paySelectedTable);
    document.getElementById('pos-received').addEventListener('input',updatePosChange);
    document.getElementById('pos-cash').addEventListener('click',()=>setPosMethod('cash'));
    document.getElementById('pos-card').addEventListener('click',()=>setPosMethod('card'));
    document.getElementById('pos-exact').addEventListener('click',()=>setPosAmount(posTotal()));
    document.getElementById('pos-print').addEventListener('click',()=>window.print());
    document.addEventListener('keydown',handlePosShortcut);
    startOrdersRealtime();renderPos();
});
