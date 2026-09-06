const fs=require('fs');let source=fs.readFileSync('js/waiter.js','utf8');
const start=source.indexOf('function renderOrders()'),end=source.indexOf('async function updateOrderStatus');
source=source.slice(0,start)+`function renderOrders() {
    const container=document.getElementById('orders-container');if(!container) return;
    const orders=getOrders().filter(order=>order.paymentStatus!=='مدفوع');
    const groups=[['جاهز','جاهز للتوصيل','waiter-ready'],['قيد التحضير','قيد التحضير','waiter-preparing']];
    container.innerHTML=groups.map(([status,label,style])=>{
        const matching=orders.filter(order=>order.status===status).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
        return '<section class="waiter-order-group '+style+'"><h2>'+label+' <span>'+matching.length+'</span></h2>'+ (matching.length?matching.map(waiterOrderMarkup).join(''):'<p class="waiter-empty">لا توجد طلبات في هذه المرحلة.</p>')+'</section>';
    }).join('');
}
function waiterOrderMarkup(order) {
    const ready=order.status==='جاهز';
    return '<article class="waiter-order"><div class="waiter-order-head"><h3>طاولة '+escapeHtml(order.table)+'</h3><small>'+escapeHtml(order.time||'')+'</small></div><ul>'+(order.items||[]).map(item=>'<li>'+escapeHtml(item.name)+' × '+Number(item.qty)+'</li>').join('')+'</ul><div class="waiter-order-footer"><strong>'+Number(order.total).toFixed(2)+' ليرة</strong>'+(ready?'<button type="button" class="btn-action" data-deliver="'+escapeHtml(order.id).replaceAll('"','&quot;')+'">تم التوصيل</button>':'<span>قيد التحضير في المطبخ</span>')+'</div></article>';
}

`+source.slice(end);
source=source.replace("    document.getElementById('move-table-form').addEventListener", "    document.getElementById('orders-container').addEventListener('click',event=>{const button=event.target.closest('[data-deliver]');if(button&&!button.disabled)updateOrderStatus(button.dataset.deliver,button);});\n    document.getElementById('move-table-form').addEventListener");
source=source.replace("async function updateOrderStatus(id) {\n    try", "async function updateOrderStatus(id, button) {\n    if(button) button.disabled=true;\n    try");
// Existing files may use CRLF.
source=source.replace("async function updateOrderStatus(id) {\r\n    try", "async function updateOrderStatus(id, button) {\n    if(button) button.disabled=true;\n    try");
source=source.replace("catch (error) { alert(error.message); }\n}","catch (error) { alert(error.message); }\n    finally {if(button) button.disabled=false;}\n}");
source=source.replace("catch (error) { alert(error.message); }\r\n}","catch (error) { alert(error.message); }\n    finally {if(button) button.disabled=false;}\n}");
source=source.replace('${order.table}</strong>','${escapeHtml(order.table)}</strong>');
const a=source.indexOf('function renderWaiterTables()'),b=source.indexOf('async function releaseTableAndRefresh');
source=source.slice(0,a)+`function waiterTableSummary(table, now=Date.now()) {
    const reservation=getLocalTableStatus(table);
    const all=getOrders().filter(order=>String(order.table)===String(table));
    const open=all.filter(order=>order.paymentStatus!=='مدفوع');
    const relevant=open.length?open:all.filter(order=>reservation?.reservedAt && order.paidAt>=reservation.reservedAt);
    const changed=order=>Math.max(...['createdAt','readyAt','deliveredAt','paidAt'].map(key=>Number(order[key])||0));
    const latest=[...relevant].sort((a,b)=>changed(b)-changed(a))[0];
    const times=open.map(order=>Number(order.createdAt)).filter(time=>Number.isFinite(time)&&time>0);
    const since=Number(reservation?.reservedAt)||(times.length?Math.min(...times):0);
    const minutes=since>0?Math.max(0,Math.floor((now-since)/60000)):null;
    return {table, count:open.length, total:open.reduce((sum,order)=>sum+(Number(order.total)||0),0),status:latest?(latest.paymentStatus==='مدفوع'?'تم الدفع':latest.status):'لا توجد طلبات مفتوحة',duration:minutes===null?'غير متاحة':minutes<60?minutes+' دقيقة':Math.floor(minutes/60)+' ساعة و'+minutes%60+' دقيقة'};
}
function renderWaiterTables() {
    const container=document.getElementById('waiter-tables-container');if(!container) return;
    const tables=Array.from({length:20},(_,index)=>String(index+1)).filter(table=>getLocalTableStatus(table)?.status==='occupied'||getOrders().some(order=>String(order.table)===table&&order.paymentStatus!=='مدفوع'));
    container.innerHTML=tables.length?tables.map(table=>{
        const summary=waiterTableSummary(table);
        return '<article class="waiter-table-card occupied-table"><div class="waiter-table-header"><strong class="waiter-table-number">طاولة '+table+'</strong><span class="waiter-table-badge occupied">مشغولة</span></div><dl class="waiter-table-summary"><div><dt>الطلبات المفتوحة</dt><dd>'+summary.count+'</dd></div><div><dt>إجمالي الحساب الحالي</dt><dd>'+summary.total.toFixed(2)+' ليرة</dd></div><div><dt>آخر حالة</dt><dd>'+escapeHtml(summary.status)+'</dd></div><div><dt>مدة الإشغال</dt><dd>'+summary.duration+'</dd></div></dl><div class="waiter-table-actions"><button class="release-table-btn" onclick=\'releaseTableAndRefresh("'+table+'")\'>تفريغ الطاولة</button><button class="btn-action" onclick=\'openMoveTableModal("'+table+'")\'>نقل الطاولة</button></div>'+(summary.count?'<p class="waiter-empty">التفريغ متاح بعد دفع جميع الطلبات. <a href="pos.html">فتح الكاشير</a></p>':'')+'</article>';
    }).join(''):'<p class="waiter-empty">لا توجد طاولات مشغولة حالياً.</p>';
}

`+source.slice(b);
source=source.slice(0,source.indexOf('async function releaseTableAndRefresh'))+`async function releaseTableAndRefresh(table) {
    if(releasingTables.has(String(table))) return;
    if(getOrders().some(order=>String(order.table)===String(table)&&order.paymentStatus!=='مدفوع')) {
        alert('لا يمكن تفريغ الطاولة: توجد طلبات غير مدفوعة. أكمل التحصيل من الكاشير أولاً.');return;
    }
    if(!confirm('تأكيد تفريغ الطاولة '+table+'؟ تأكد من مغادرة العميل. ستصبح الطاولة متاحة لحجز جديد.')) return;
    releasingTables.add(String(table));
    try {await releaseTable(table);document.getElementById('waiter-feedback').textContent='تم تفريغ الطاولة '+table+' بنجاح.';}
    catch(error) {alert(error.message);}
    finally {releasingTables.delete(String(table));}
}
`;
fs.writeFileSync('js/waiter.js',source);
