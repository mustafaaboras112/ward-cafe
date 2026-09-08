'use strict';
const categories={hot:'ساخن',cold:'بارد',sweets:'حلويات',food:'مأكولات'};
let editingId=null,busy=false;
const el=id=>document.getElementById(id);

function feedback(message,error=false){const box=el('admin-feedback');if(!box)return;box.textContent=message;box.hidden=!message;box.className='simple-status '+(error?'error':'ok');}
function safeImage(value){const source=String(value||'').trim();if(!source)return 'q.png';try{const url=new URL(source,location.href);return ['http:','https:'].includes(url.protocol)?url.href:'q.png';}catch{return 'q.png';}}
function preview(){const img=el('item-preview');if(img)img.src=safeImage(el('item-img')?.value);}
function resetEditor(focus=false){editingId=null;el('add-item-form')?.reset();el('editor-title').textContent='إضافة صنف';el('editor-mode').textContent='صنف جديد';el('save-item-button').textContent='حفظ';el('cancel-edit-button').hidden=true;preview();if(focus)el('item-name')?.focus();}

function render(){
  const menu=typeof getMenu==='function'?getMenu():[];
  const query=(el('menu-search')?.value||'').trim().toLowerCase();
  const filter=el('category-filter')?.value||'';
  const visible=menu.filter(item=>(!filter||item.category===filter)&&`${item.name||''} ${item.desc||''}`.toLowerCase().includes(query));
  if(el('result-count'))el('result-count').textContent=`${visible.length} صنف`;
  if(el('total-items'))el('total-items').textContent=String(menu.length);
  const list=el('admin-menu-list');if(!list)return;list.replaceChildren();
  if(!visible.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='لا توجد أصناف.';list.append(empty);return;}
  for(const item of visible){
    const row=document.createElement('article');row.className='product-row';
    row.innerHTML='<div class="product-details"><img class="product-image" alt=""><div class="product-copy"><strong></strong><p></p><span class="category-badge"></span></div></div><div class="product-price"></div><div class="product-actions"><button type="button" class="simple-btn secondary">تعديل</button><button type="button" class="simple-btn danger">حذف</button></div>';
    const image=row.querySelector('img');image.src=safeImage(item.img);image.onerror=()=>image.src='q.png';
    row.querySelector('strong').textContent=item.name||'';row.querySelector('p').textContent=item.desc||'';row.querySelector('.category-badge').textContent=categories[item.category]||item.category||'';row.querySelector('.product-price').textContent=`${Number(item.price||0).toLocaleString('ar')} ل.س`;
    const [edit,remove]=row.querySelectorAll('button');edit.onclick=()=>editItem(item);remove.onclick=()=>removeItem(item);list.append(row);
  }
}
function editItem(item){editingId=String(item.id);el('item-name').value=item.name||'';el('item-cat').value=item.category||'hot';el('item-price').value=item.price??'';el('item-desc').value=item.desc||'';el('item-img').value=item.img||'';el('editor-title').textContent='تعديل الصنف';el('editor-mode').textContent=item.name||'';el('save-item-button').textContent='حفظ التعديل';el('cancel-edit-button').hidden=false;preview();el('item-name').focus();}
async function removeItem(item){if(busy||!confirm(`حذف ${item.name}؟`))return;busy=true;try{await WardAuth.request(`/api/admin/menu/${encodeURIComponent(item.id)}`,{method:'DELETE',body:{}});await refreshMenu();render();feedback('تم حذف الصنف.');if(editingId===String(item.id))resetEditor();}catch(e){feedback(e.message||'تعذر الحذف.',true);}finally{busy=false;}}

el('add-item-form')?.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!event.currentTarget.reportValidity())return;
  const payload={name:el('item-name').value.trim(),category:el('item-cat').value,price:Number(el('item-price').value),desc:el('item-desc').value.trim(),img:el('item-img').value.trim()};
  busy=true;el('save-item-button').disabled=true;
  try{if(editingId)await WardAuth.request(`/api/admin/menu/${encodeURIComponent(editingId)}`,{method:'PUT',body:payload});else await WardAuth.request('/api/admin/menu',{method:'POST',body:payload});await refreshMenu();render();feedback(editingId?'تم حفظ التعديل.':'تمت إضافة الصنف.');resetEditor();}catch(e){feedback(e.message||'تعذر الحفظ.',true);}finally{busy=false;el('save-item-button').disabled=false;}
});

async function checkConnection(){const pill=el('system-connection');if(!pill)return;try{const r=await fetch('/api/health',{cache:'no-store'});if(!r.ok)throw new Error();pill.textContent='متصل';pill.style.color='#1f8a5b';}catch{pill.textContent='غير متصل';pill.style.color='#b83d4b';}}

window.addEventListener('ward:menu',render);
window.addEventListener('DOMContentLoaded',async()=>{if(window.WardAuth)await WardAuth.ready;el('menu-search')?.addEventListener('input',render);el('category-filter')?.addEventListener('change',render);el('new-item-button')?.addEventListener('click',()=>resetEditor(true));el('cancel-edit-button')?.addEventListener('click',()=>resetEditor());el('item-img')?.addEventListener('input',preview);await refreshMenu();render();checkConnection();if(typeof startMenuRealtime==='function')startMenuRealtime();setInterval(checkConnection,15000);});
