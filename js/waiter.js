let movingFrom=null;
let moveBusy=false;
const releasingTables=new Set();
function availableMoveTables(from) {
    const orders=getOrders();
    return Array.from({length:20},(_,index)=>String(index+1)).filter(table=>table!==String(from) && getLocalTableStatus(table)?.status!=='occupied' && !orders.some(order=>String(order.table)===table && order.paymentStatus!=='مدفوع'));
}
function refreshMoveOptions() {
    if(!movingFrom || moveBusy) return;
    const select=document.getElementById('move-table-target'),previous=select.value;
    const available=availableMoveTables(movingFrom);
    select.innerHTML='<option value="">اختر الطاولة الجديدة</option>'+available.map(table=>`<option value="${table}">طاولة ${table}</option>`).join('');
    select.value=available.includes(previous)?previous:'';
    select.disabled=!available.length;
    document.getElementById('move-table-submit').disabled=!select.value;
    document.getElementById('move-table-empty').hidden=available.length>0;
}
function openMoveTableModal(from) {
    if(moveBusy || !validTable(from)) return;
    movingFrom=String(from);
    document.getElementById('move-table-title').textContent=`نقل الطاولة ${from}`;
    document.getElementById('move-table-error').textContent='';
    document.getElementById('move-table-target').value='';
    document.getElementById('move-table-modal').hidden=false;
    refreshMoveOptions();document.getElementById('move-table-target').focus();
}
function closeMoveTableModal() {
    if(moveBusy) return;
    movingFrom=null;document.getElementById('move-table-modal').hidden=true;
    document.getElementById('waiter-tables-container').focus();
}
async function submitTableMove(event) {
    event?.preventDefault();
    if(moveBusy || !movingFrom) return;
    const from=movingFrom,to=document.getElementById('move-table-target').value;
    if(!availableMoveTables(from).includes(to)) {refreshMoveOptions();document.getElementById('move-table-error').textContent='الطاولة المطلوبة لم تعد متاحة. اختر طاولة أخرى.';return;}
    moveBusy=true;setMoveBusy();
    try {await moveTable(from,to);moveBusy=false;closeMoveTableModal();document.getElementById('waiter-feedback').textContent=`تم نقل الطاولة ${from} إلى ${to} مع جميع طلباتها وحسابها.`;}
    catch(error) {document.getElementById('move-table-error').textContent=error.message;}
    finally {moveBusy=false;setMoveBusy();refreshMoveOptions();}
}
function setMoveBusy() {
    document.getElementById('move-table-form').setAttribute('aria-busy',String(moveBusy));
    for(const id of ['move-table-submit','move-table-target','move-table-cancel']) document.getElementById(id).disabled=moveBusy;
    document.getElementById('move-table-submit').textContent=moveBusy?'جارٍ النقل…':'تأكيد النقل';
}
function moveModalKeyboard(event) {
    if(!movingFrom) return;
    if(event.key==='Escape') {event.preventDefault();closeMoveTableModal();}
    if(event.key==='Tab') {
        const controls=[...document.getElementById('move-table-modal').querySelectorAll('button:not(:disabled),select:not(:disabled)')];
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
    }
}
window.addEventListener('ward:orders',()=>{renderOrders();renderWaiterTables();refreshMoveOptions();notifyReadyOrders(getOrders());});
window.addEventListener('ward:tables',()=>{renderWaiterTables();refreshMoveOptions();});
window.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('orders-container').addEventListener('click',event=>{const button=event.target.closest('[data-deliver]');if(button&&!button.disabled)updateOrderStatus(button.dataset.deliver,button);});
    document.getElementById('move-table-form').addEventListener('submit',submitTableMove);
    document.getElementById('move-table-cancel').addEventListener('click',closeMoveTableModal);
    document.getElementById('move-table-target').addEventListener('change',refreshMoveOptions);
    document.getElementById('move-table-modal').addEventListener('click',event=>{if(event.target===event.currentTarget)closeMoveTableModal();});
    document.addEventListener('keydown',moveModalKeyboard);
    startOrdersRealtime();startTablesRealtime();renderWaiterTables();
    setInterval(renderWaiterTables,60000);
});

function renderOrders() {
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

async function updateOrderStatus(id, button) {
    if(button) button.disabled=true;
    try { await transitionOrder(id, 'جاهز', 'تم التوصيل'); }
    catch (error) { alert(error.message); }
    finally {if(button) button.disabled=false;}
}

function startWaiterMonitor() {
    if (document.getElementById('orders-container')) notifyReadyOrders(getOrders());
}

function notifyReadyOrders(orders) {
    if (!document.getElementById('orders-container')) return;
    const seen = JSON.parse(sessionStorage.getItem('cafe_ward_seen_ready') || '[]');
    orders.filter(order => order.status === 'جاهز' && !seen.includes(order.id)).forEach(order => {
        showWaiterReadyNotification(order);
        seen.push(order.id);
    });
    sessionStorage.setItem('cafe_ward_seen_ready', JSON.stringify(seen));
}

function showWaiterReadyNotification(order) {
    playBellSound();
    const notice = document.createElement('div');
    notice.className = 'ready-notification';
    notice.innerHTML = `<i class="fa-solid fa-bell"></i><span>الطلب جاهز للطاولة رقم <strong>${escapeHtml(order.table)}</strong></span>`;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 10000);
}

function enableWaiterBell() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    window.waiterAudioContext = window.waiterAudioContext || new AudioContextClass();
    window.waiterAudioContext.resume();
    sessionStorage.setItem('cafe_ward_bell_enabled', 'true');
    const button = document.getElementById('enable-bell-btn');
    if (button) button.innerText = 'رنة الجرس مفعلة';
}

function playBellSound() {
    try {
        if (sessionStorage.getItem('cafe_ward_bell_enabled') !== 'true') return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const context = window.waiterAudioContext = window.waiterAudioContext || new AudioContextClass();
        if (context.state === 'suspended') context.resume();
        [0, 0.18].forEach((delay, index) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = index ? 880 : 660;
            oscillator.type = 'sine';
            gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + delay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.35);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start(context.currentTime + delay);
            oscillator.stop(context.currentTime + delay + 0.4);
        });
    } catch (error) {
        // صوت الجرس اختياري حسب دعم المتصفح.
    }
}



function waiterTableSummary(table, now=Date.now()) {
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
        return `<article class="waiter-table-card occupied-table">
            <div class="waiter-table-header"><strong class="waiter-table-number">طاولة ${table}</strong><span class="waiter-table-badge occupied">مشغولة</span></div>
            <dl class="waiter-table-summary">
                <div><dt>الطلبات المفتوحة</dt><dd>${summary.count}</dd></div>
                <div><dt>إجمالي الحساب الحالي</dt><dd>${summary.total.toFixed(2)} ليرة</dd></div>
                <div><dt>آخر حالة</dt><dd>${escapeHtml(summary.status)}</dd></div>
                <div><dt>مدة الإشغال</dt><dd>${summary.duration}</dd></div>
            </dl>
            <div class="waiter-table-actions">
                <button class="release-table-btn" onclick='releaseTableAndRefresh("${table}")'>تفريغ الطاولة</button>
                <button class="btn-action" onclick='openMoveTableModal("${table}")'>نقل الطاولة</button>
            </div>
            ${summary.count?'<p class="waiter-empty">التفريغ متاح بعد دفع جميع الطلبات. <a href="pos.html">فتح الكاشير</a></p>':''}
        </article>`;
    }).join(''):'<p class="waiter-empty">لا توجد طاولات مشغولة حالياً.</p>';
}

async function releaseTableAndRefresh(table) {
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
