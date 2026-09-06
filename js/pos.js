let selectedTable = null;
let paymentBusy = false;
let lastReceipt = null;
function posTotal() { return Math.round(payableOrders(selectedTable).reduce((sum,order)=>sum+Number(order.total),0)*100)/100; }
function selectPosTable(table) {
    if(paymentBusy) return;
    selectedTable=table;lastReceipt=null;
    document.getElementById('pos-feedback').textContent='';
    document.getElementById('pos-received').value='';renderPos();
}
function setPosMethod(method) {
    if(paymentBusy || !['cash','card'].includes(method)) return;
    document.getElementById('pos-method').value=method;updatePosChange();
}
function payableOrders(table) {
    return getOrders().filter(order=>String(order.table)===String(table) && order.paymentStatus!=='مدفوع');
}
async function collectTablePayment(table, tendered, method, expectedOrders) {
    if(!validTable(table) || !['cash','card'].includes(method)) throw new Error('اختر الطاولة وطريقة الدفع.');
    const paidAt=Date.now();
    let receipt;
    await changeCafeState(state=>{
        if(state.accounting.dayClosed) throw new Error('الصندوق مغلق. افتح الوردية من المحاسبة أولاً.');
        const entries=Object.entries(state.orders || {}).filter(([,order])=>String(order.table)===String(table) && order.paymentStatus!=='مدفوع');
        const orders=entries.map(([,order])=>order);
        if(!orders.length) throw new Error('لا توجد طلبات غير مدفوعة لهذه الطاولة.');
        if(expectedOrders && (entries.length!==expectedOrders.length || entries.some(([key,order])=>!expectedOrders.some(expected=>expected.firebaseKey===key && Number(expected.total)===Number(order.total))))) throw new Error('تغيّرت طلبات الطاولة أو إجماليها. راجع الفاتورة المحدثة ثم أكد الدفع مجدداً.');
        if(orders.some(order=>order.status!=='تم التوصيل')) throw new Error('يجب توصيل جميع طلبات الطاولة قبل تحصيل الحساب.');
        if(orders.some(order=>!Number.isFinite(Number(order.total)) || Number(order.total)<0 || !Array.isArray(order.items))) throw new Error('بيانات أحد الطلبات غير صالحة. راجع الفاتورة قبل الدفع.');
        const total=Math.round(orders.reduce((sum,order)=>sum+Number(order.total),0)*100)/100;
        if(!Number.isFinite(total)||total<0) throw new Error('إجمالي غير صالح.');
        if(method==='cash' && (!Number.isFinite(tendered)||tendered<total)) throw new Error('المبلغ المستلم أقل من إجمالي الفاتورة.');
        state.accounting.sales ||= {};
        const saleIds=new Set();
        const normalized=entries.map(([key,order])=>{
            const identity=getOrderIdentity(order,key);
            if(!identity.orderId || /[.#$\[\]\/]/.test(identity.orderId)) throw new Error('معرف طلب غير صالح لتسجيل البيع.');
            if(saleIds.has(identity.orderId) || state.accounting.sales[identity.orderId]) throw new Error('يوجد سجل بيع سابق لهذا الطلب. راجع الحساب لمنع تكرار الدفع.');
            saleIds.add(identity.orderId);return {order,...identity};
        });
        normalized.forEach(({order,orderId})=>{
            order.paymentStatus='مدفوع';order.paidAt=paidAt;order.paymentMethod=method;
            state.accounting.sales[orderId]={id:orderId,orderId,table:order.table,total:Number(order.total),paidAt,time:formatWardDateTime(paidAt),paymentMethod:method,items:order.items};
        });
        delete state.tables[String(table)];
        receipt={table,total,method,paidAt,orders:normalized.map(({order,orderId,firebaseKey})=>({...order,id:orderId,firebaseKey})),received:method==='cash'?tendered:total,change:method==='cash'?Math.round((tendered-total)*100)/100:0};
    });
    return receipt;
}
function renderPos() {
    const tables=[...new Set(getOrders().filter(order=>order.paymentStatus!=='مدفوع').map(order=>String(order.table)))].sort((a,b)=>Number(a)-Number(b));
    const list=document.getElementById('pos-tables');list.replaceChildren();
    for(const table of tables) {
        const orders=payableOrders(table), ready=orders.every(order=>order.status==='تم التوصيل');
        const button=document.createElement('button');button.className='pos-table'+(table===selectedTable?' selected':'');
        button.textContent=`طاولة ${table} · ${orders.length} طلب · ${orders.reduce((sum,order)=>sum+Number(order.total),0)} ليرة · ${ready?'جاهزة للتحصيل':'بانتظار التوصيل'}`;
        button.disabled=paymentBusy;
        button.addEventListener('click',()=>selectPosTable(table));list.append(button);
    }
    if(!tables.length) list.textContent='لا توجد حسابات مفتوحة.';
    const orders=payableOrders(selectedTable);
    document.getElementById('pos-title').textContent=orders.length?`فاتورة الطاولة ${selectedTable}`:lastReceipt?`فاتورة مدفوعة · طاولة ${lastReceipt.table}`:'اختر طاولة لعرض الفاتورة';
    const shownOrders=orders.length?orders:(lastReceipt?.orders || []);
    document.getElementById('pos-items').innerHTML=shownOrders.map(order=>`<article class="pos-order">
        <h3>طاولة ${escapeHtml(order.table)} · طلب <bdi>${escapeHtml(getOrderIdentity(order).orderId)}</bdi></h3>
        <p class="pos-order-status">حالة الطلب: ${escapeHtml(order.status)} · الدفع: ${escapeHtml(order.paymentStatus || 'غير مدفوع')}</p>
        ${(order.items || []).map(item=>`<div class="pos-line"><div><strong>${escapeHtml(item.name)}</strong><small>الكمية: ${escapeHtml(item.qty)} · سعر الوحدة: ${Number(item.price).toFixed(2)} ليرة</small></div><b>${(Number(item.price)*Number(item.qty)).toFixed(2)} ليرة</b></div>`).join('')}
        <p class="pos-order-total">إجمالي الطلب: ${Number(order.total).toFixed(2)} ليرة</p>
    </article>`).join('') || '<p class="pos-empty">اختر حساباً مفتوحاً لعرض طلباته.</p>';
    document.getElementById('pos-total').textContent=(orders.length?orders.reduce((sum,order)=>sum+Number(order.total),0):(lastReceipt?.total || 0)).toFixed(2)+' ليرة';
    document.getElementById('pos-pay').disabled=paymentBusy || !orders.length || orders.some(order=>order.status!=='تم التوصيل');
    document.getElementById('pos-pay').textContent=paymentBusy?'جارٍ حفظ الدفع…':'تأكيد استلام الدفع (F9)';
    document.getElementById('pos-payment').setAttribute('aria-busy',String(paymentBusy));
    document.getElementById('pos-payment').hidden=!!lastReceipt && !orders.length;
    document.getElementById('pos-print').disabled=paymentBusy || !shownOrders.length;
    updatePosChange();
}
function updatePosChange() {
    const total=posTotal();
    const received=Number(document.getElementById('pos-received').value);
    const card=document.getElementById('pos-method').value==='card';
    document.getElementById('pos-received').disabled=paymentBusy || card || !selectedTable;
    document.getElementById('pos-method').disabled=paymentBusy;
    document.getElementById('pos-change').textContent=card?'0.00 ليرة':Math.max(0,received-total).toFixed(2)+' ليرة';
}
async function paySelectedTable(event) {
    event?.preventDefault();
    if(paymentBusy || !selectedTable) return;
    const table=selectedTable, received=Number(document.getElementById('pos-received').value), method=document.getElementById('pos-method').value;
    const expectedOrders=payableOrders(table).map(order=>({...getOrderIdentity(order),total:order.total}));
    document.getElementById('pos-feedback').textContent='';
    paymentBusy=true;
    try {
        renderPos();
        const receipt=await collectTablePayment(table,received,method,expectedOrders);
        lastReceipt=receipt;
        document.getElementById('pos-feedback').textContent=`تم الدفع وتسجيل البيع وتحرير الطاولة ${receipt.table} · المبلغ: ${receipt.total.toFixed(2)} ليرة · الباقي: ${receipt.change.toFixed(2)} ليرة · طريقة الدفع: ${receipt.method==='cash'?'نقداً':'بطاقة'}`;
        selectedTable=null;
    } catch(error) { document.getElementById('pos-feedback').textContent='لم يتم تأكيد الدفع: '+(error.message || 'تعذر الحفظ. تحقق من الاتصال وصلاحيات قاعدة البيانات.'); }
    finally {paymentBusy=false;renderPos();}
}
window.addEventListener('ward:orders',renderPos);
function handlePosShortcut(event) {
    if(event.key==='F9') {event.preventDefault();if(!event.repeat && !document.getElementById('pos-pay').disabled) return paySelectedTable();}
}
window.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('pos-payment').addEventListener('submit',paySelectedTable);
    document.getElementById('pos-received').addEventListener('input',updatePosChange);
    document.getElementById('pos-method').addEventListener('change',updatePosChange);
    document.getElementById('pos-print').addEventListener('click',()=>window.print());
    document.addEventListener('keydown',handlePosShortcut);
    startOrdersRealtime();renderPos();
});
