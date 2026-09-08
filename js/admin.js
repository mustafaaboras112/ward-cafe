'use strict';

const adminCategories={hot:'مشروبات ساخنة',cold:'مشروبات باردة',sweets:'حلويات',food:'مأكولات'};
let editingItemId=null;
let adminSaving=false;
const pendingDeletes=new Set();
const adminElement=id=>document.getElementById(id);

function adminFeedback(message,error=false){
    const feedback=adminElement('admin-feedback');
    if(!feedback)return;
    feedback.textContent=message;
    feedback.dataset.error=String(error);
    feedback.hidden=false;
}

function safeAdminImage(value){
    const source=String(value||'').trim();
    if(!source)return 'q.png';
    if(source==='q.png'||/^(?:images|icons)\//i.test(source))return source;
    try{const url=new URL(source,window.location.href);return ['http:','https:'].includes(url.protocol)?url.href:'q.png';}
    catch{return 'q.png';}
}

function updateItemPreview(){
    const input=adminElement('item-img'),preview=adminElement('item-preview'),caption=adminElement('preview-caption');
    if(!input||!preview||!caption)return;
    const value=input.value.trim();
    preview.src=value?safeAdminImage(value):'q.png';
    caption.textContent=value?'الصورة التي ستظهر مع الصنف':'تظهر الصورة هنا عند إدخال الرابط';
}

function focusItemEditor(){
    adminElement('item-editor')?.scrollIntoView({block:'nearest'});
    adminElement('item-name')?.focus({preventScroll:true});
}

function resetItemEditor(focus=false){
    if(adminSaving)return;
    editingItemId=null;
    adminElement('add-item-form')?.reset();
    adminElement('item-cat')?.querySelectorAll('[data-legacy]').forEach(option=>option.remove());
    if(adminElement('editor-title'))adminElement('editor-title').textContent='إضافة صنف للمنيو';
    if(adminElement('editor-mode'))adminElement('editor-mode').textContent='صنف جديد';
    if(adminElement('save-item-button'))adminElement('save-item-button').textContent='إضافة الصنف';
    if(adminElement('cancel-edit-button'))adminElement('cancel-edit-button').hidden=true;
    updateItemPreview();
    if(focus)focusItemEditor();
}

function editMenuItem(id){
    if(adminSaving||pendingDeletes.has(String(id)))return;
    const item=getMenu().find(row=>String(row.id)===String(id));
    if(!item)return;
    resetItemEditor();
    editingItemId=String(id);
    const category=adminElement('item-cat');
    if(category&&!Object.hasOwn(adminCategories,item.category)){
        const option=document.createElement('option');
        option.value=item.category||'';
        option.textContent=item.category||'بدون تصنيف';
        option.dataset.legacy='true';
        category.appendChild(option);
    }
    const values={name:item.name,cat:item.category,price:item.price,desc:item.desc,img:item.img};
    for(const [field,value] of Object.entries(values)){const node=adminElement('item-'+field);if(node)node.value=value??'';}
    adminElement('editor-title').textContent='تعديل بيانات الصنف';
    adminElement('editor-mode').textContent=item.name;
    adminElement('save-item-button').textContent='حفظ التعديلات';
    adminElement('cancel-edit-button').hidden=false;
    updateItemPreview();
    focusItemEditor();
}

async function addNewItem(event){
    event.preventDefault();
    const form=adminElement('add-item-form');
    if(adminSaving||!form?.reportValidity())return;
    const name=adminElement('item-name').value.trim();
    const category=adminElement('item-cat').value;
    const price=Number(adminElement('item-price').value);
    const desc=adminElement('item-desc').value.trim();
    const img=adminElement('item-img').value.trim();
    if(!name||!desc||!img||!Number.isFinite(price)||price<0){adminFeedback('أدخل اسمًا ووصفًا وصورة وسعرًا صالحًا للصنف.',true);return;}

    const id=editingItemId;
    const changes={name,category,price,desc,img};
    adminSaving=true;
    adminElement('item-fields').disabled=true;
    adminElement('new-item-button').disabled=true;
    adminElement('save-item-button').textContent='جاري الحفظ…';
    try{
        if(id!==null){
            if(!getMenu().some(row=>String(row.id)===String(id)))throw new Error('missing-item');
            await api(`/api/admin/menu/${encodeURIComponent(id)}`,{method:'PUT',body:changes});
        }else{
            await api('/api/admin/menu',{method:'POST',body:changes});
        }
        await refreshMenu();
        adminSaving=false;
        resetItemEditor();
        renderAdminMenu();
        adminFeedback(id===null?'تمت إضافة الصنف بنجاح.':'تم حفظ تعديلات الصنف بنجاح.');
    }catch(error){
        adminFeedback(error.message==='missing-item'?'هذا الصنف لم يعد موجودًا. حدّث القائمة وحاول مجددًا.':(error.message||'تعذر حفظ الصنف. تحقق من اتصال الخادم ثم أعد المحاولة.'),true);
    }finally{
        adminSaving=false;
        adminElement('item-fields').disabled=false;
        adminElement('new-item-button').disabled=false;
        adminElement('save-item-button').textContent=editingItemId===null?'إضافة الصنف':'حفظ التعديلات';
    }
}

function renderAdminMenu(){
    const list=adminElement('admin-menu-list');
    if(!list)return;
    const menu=getMenu();
    const query=adminElement('menu-search')?.value.trim().toLocaleLowerCase('ar')||'';
    const filterElement=adminElement('category-filter');
    const previousFilter=filterElement?.value||'';
    const categories=[...new Set(menu.map(item=>item.category).filter(Boolean))];
    filterElement?.querySelectorAll('[data-legacy]').forEach(option=>option.remove());
    categories.filter(category=>!Object.hasOwn(adminCategories,category)).forEach(category=>{
        const option=document.createElement('option');option.value=category;option.textContent=category;option.dataset.legacy='true';filterElement?.appendChild(option);
    });
    if(filterElement)filterElement.value=[...filterElement.options].some(option=>option.value===previousFilter)?previousFilter:'';
    const activeFilter=filterElement?.value||'';
    const visible=menu.filter(item=>(!activeFilter||item.category===activeFilter)&&`${item.name||''} ${item.desc||''}`.toLocaleLowerCase('ar').includes(query));
    if(adminElement('total-items'))adminElement('total-items').textContent=String(menu.length);
    if(adminElement('total-categories'))adminElement('total-categories').textContent=String(categories.length);
    if(adminElement('result-count'))adminElement('result-count').textContent=`عرض ${visible.length} من ${menu.length} صنف`;
    list.replaceChildren();
    if(!visible.length){
        const empty=document.createElement('p');empty.className='empty-state';empty.textContent=menu.length?'لا توجد أصناف مطابقة. جرّب بحثًا أو تصنيفًا آخر.':'المنيو فارغ. أضف أول صنف من النموذج.';list.appendChild(empty);return;
    }
    for(const item of visible){
        const row=document.createElement('article');row.className='product-row';
        row.innerHTML='<div class="product-details"><img class="product-image" loading="lazy" alt=""><div class="product-copy"><strong></strong><p></p><span class="category-badge"></span></div></div><div class="product-price"><span></span><small>ليرة</small></div><div class="product-actions"><button type="button" class="secondary-button">تعديل</button><button type="button" class="remove-button">حذف</button></div>';
        const image=row.querySelector('img');image.addEventListener('error',()=>{image.src='q.png';},{once:true});image.src=safeAdminImage(item.img||'q.png');
        row.querySelector('strong').textContent=item.name;
        row.querySelector('p').textContent=item.desc||'بدون وصف';
        row.querySelector('.category-badge').textContent=adminCategories[item.category]||item.category||'بدون تصنيف';
        row.querySelector('.product-price span').textContent=new Intl.NumberFormat('ar',{maximumFractionDigits:2}).format(Number(item.price));
        const [edit,remove]=row.querySelectorAll('button');
        edit.disabled=remove.disabled=pendingDeletes.has(String(item.id));
        edit.addEventListener('click',()=>editMenuItem(item.id));
        remove.addEventListener('click',()=>deleteMenuItem(item.id));
        list.appendChild(row);
    }
}

async function deleteMenuItem(id){
    id=String(id);
    if(adminSaving||pendingDeletes.has(id))return;
    const item=getMenu().find(row=>String(row.id)===id);
    if(!item||!confirm(`حذف «${item.name}» من المنيو؟`))return;
    pendingDeletes.add(id);renderAdminMenu();
    try{
        await api(`/api/admin/menu/${encodeURIComponent(id)}`,{method:'DELETE',body:{}});
        await refreshMenu();
        if(editingItemId===id)resetItemEditor();
        adminFeedback(`تم حذف «${item.name}» من المنيو.`);
    }catch(error){adminFeedback(error.message||'تعذر حذف الصنف. تحقق من اتصال الخادم ثم أعد المحاولة.',true);}
    finally{pendingDeletes.delete(id);renderAdminMenu();}
}

function setMonitorValue(id,value){const node=adminElement(id);if(node)node.textContent=String(value);}

function renderSystemMonitor(){
    const orders=typeof getOrders==='function'?getOrders():[];
    let occupied=0;
    for(let table=1;table<=20;table++)if(getLocalTableStatus(String(table))?.status==='occupied')occupied++;
    const preparing=orders.filter(order=>order.status==='قيد التحضير').length;
    const ready=orders.filter(order=>order.status==='جاهز').length;
    const delivered=orders.filter(order=>order.status==='تم التوصيل'&&order.paymentStatus!=='مدفوع').length;
    const accounting=typeof getAccountingData==='function'?getAccountingData():{};
    const sales=Array.isArray(accounting.sales)?accounting.sales.reduce((sum,row)=>sum+Number(row.total||0),0):0;

    setMonitorValue('monitor-empty-tables',Math.max(0,20-occupied));
    setMonitorValue('monitor-occupied-tables',occupied);
    setMonitorValue('monitor-preparing',preparing);
    setMonitorValue('monitor-ready',ready);
    setMonitorValue('monitor-delivered',delivered);
    setMonitorValue('monitor-sales',new Intl.NumberFormat('ar',{maximumFractionDigits:2}).format(sales));
    setMonitorValue('monitor-cashbox',accounting.dayClosed?'مغلق':'مفتوح');

    const alerts=[];
    if(WardServerState?.online===false)alerts.push(WardServerState.lastError||'تعذر الاتصال بخادم Ward.');
    if(ready)alerts.push(`${ready} طلب جاهز بانتظار التوصيل.`);
    if(delivered)alerts.push(`${delivered} طلب تم توصيله وما زال بانتظار الدفع.`);
    if(accounting.dayClosed)alerts.push('اليوم المحاسبي مغلق.');
    const list=adminElement('system-alert-list');
    if(list){
        list.replaceChildren();
        if(!alerts.length){const item=document.createElement('div');item.className='system-alert system-alert-ok';item.textContent='لا توجد تنبيهات تشغيلية حالياً.';list.appendChild(item);}
        else for(const message of alerts){const item=document.createElement('div');item.className='system-alert';item.textContent=message;list.appendChild(item);}
    }
    setMonitorValue('monitor-alert-count',alerts.length);
}

window.addEventListener('ward:menu',renderAdminMenu);
window.addEventListener('ward:orders',renderSystemMonitor);
window.addEventListener('ward:tables',renderSystemMonitor);
window.addEventListener('ward:accounting',renderSystemMonitor);
window.addEventListener('ward:connection',renderSystemMonitor);

window.addEventListener('DOMContentLoaded',async()=>{
    if(window.WardAuth)await WardAuth.ready;
    adminElement('add-item-form')?.addEventListener('submit',addNewItem);
    adminElement('menu-search')?.addEventListener('input',renderAdminMenu);
    adminElement('category-filter')?.addEventListener('change',renderAdminMenu);
    adminElement('new-item-button')?.addEventListener('click',()=>resetItemEditor(true));
    adminElement('cancel-edit-button')?.addEventListener('click',()=>resetItemEditor(true));
    adminElement('item-img')?.addEventListener('input',updateItemPreview);
    adminElement('item-preview')?.addEventListener('error',()=>{
        const preview=adminElement('item-preview');if(preview&&preview.getAttribute('src')!=='q.png')preview.src='q.png';
        if(adminElement('preview-caption'))adminElement('preview-caption').textContent='تعذر عرض الصورة، تحقق من الرابط';
    });

    renderAdminMenu();
    renderSystemMonitor();
    startAdminConnectionMonitor();
    startMenuRealtime();
    startOrdersRealtime();
    startTablesRealtime();
    startAccountingRealtime();
    window.setInterval(renderSystemMonitor,30000);
});
