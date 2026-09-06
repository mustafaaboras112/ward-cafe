let selectedTable = null;
let paymentBusy = false;
let lastReceipt = null;
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
        button.addEventListener('click',()=>{selectedTable=table;lastReceipt=null;document.getElementById('pos-feedback').textContent='';document.getElementById('pos-received').value='';renderPos();});list.append(button);
    }
    if(!tables.length) list.textContent='لا توجد حسابات مفتوحة.';
    const orders=payableOrders(selectedTable);
    document.getElementById('pos-title').textContent=orders.length?`فاتورة الطاولة ${selectedTable}`:lastReceipt?`فاتورة مدفوعة · طاولة ${lastReceipt.table}`:'اختر طاولة لعرض الفاتورة';
    const lines=orders.length?orders.flatMap(order=>order.items):(lastReceipt?.items || []);
    document.getElementById('pos-items').innerHTML=lines.map(item=>`<div class="pos-line"><span>${escapeHtml(item.name)} × ${item.qty}</span><b>${(item.price*item.qty).toFixed(2)} ليرة</b></div>`).join('');
    document.getElementById('pos-total').textContent=(orders.length?orders.reduce((sum,order)=>sum+Number(order.total),0):(lastReceipt?.total || 0)).toFixed(2)+' ليرة';
    document.getElementById('pos-pay').disabled=paymentBusy || !orders.length || orders.some(order=>order.status!=='تم التوصيل');
    updatePosChange();
}
function updatePosChange() {
    const total=payableOrders(selectedTable).reduce((sum,order)=>sum+Number(order.total),0);
    const received=Number(document.getElementById('pos-received').value);
    const card=document.getElementById('pos-method').value==='card';
    document.getElementById('pos-received').disabled=card;
    document.getElementById('pos-change').textContent=card?'0.00 ليرة':Math.max(0,received-total).toFixed(2)+' ليرة';
}
async function paySelectedTable(event) {
    event?.preventDefault();
    if(paymentBusy || !selectedTable) return;
    paymentBusy=true;renderPos();
    try {
        const receipt=await collectTablePayment(selectedTable,Number(document.getElementById('pos-received').value),document.getElementById('pos-method').value);
        lastReceipt=receipt;
        document.getElementById('pos-feedback').textContent=`تم تسجيل الدفع للطاولة ${receipt.table}: ${receipt.total.toFixed(2)} ليرة. الباقي: ${receipt.change.toFixed(2)} ليرة.`;
        selectedTable=null;
    } catch(error) { document.getElementById('pos-feedback').textContent=error.message; }
    finally {paymentBusy=false;renderPos();}
}
window.addEventListener('ward:orders',renderPos);
window.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('pos-payment').addEventListener('submit',paySelectedTable);
    document.getElementById('pos-received').addEventListener('input',updatePosChange);
    document.getElementById('pos-method').addEventListener('change',updatePosChange);
    document.getElementById('pos-print').addEventListener('click',()=>window.print());
    document.addEventListener('keydown',event=>{if(event.key==='F12'){event.preventDefault();if(!document.getElementById('pos-pay').disabled)paySelectedTable();}});
    startOrdersRealtime();renderPos();
});
