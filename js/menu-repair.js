(function(){
  'use strict';
  function addRecoveryButton(){
    if(!document.getElementById('admin-menu-list')||document.getElementById('restore-default-menu')) return;
    const host=document.getElementById('new-item-button')?.parentElement;
    if(!host) return;
    const button=document.createElement('button');
    button.id='restore-default-menu';
    button.type='button';
    button.className='secondary-button';
    button.textContent='استعادة الأصناف الأساسية';
    button.addEventListener('click',restoreDefaults);
    host.appendChild(button);
  }

  async function restoreDefaults(){
    const ref=typeof getFirebaseMenuRef==='function'?getFirebaseMenuRef():null;
    if(!ref){alert('Firebase غير متصل حالياً.');return;}
    if(!confirm('استعادة الأصناف الأساسية المفقودة فقط؟ لن يتم حذف أو تعديل الأصناف الموجودة.')) return;
    const snapshot=await ref.once('value');
    const current=snapshot.val()||{};
    const existingNames=new Set(Object.values(current).map(item=>String(item?.name||'').trim()));
    const updates={};
    for(const item of defaultMenu){
      if(existingNames.has(item.name)) continue;
      let key=String(item.id);
      if(current[key]) key=ref.push().key;
      updates[key]={...item,createdAt:Date.now()};
    }
    if(!Object.keys(updates).length){alert('كل الأصناف الأساسية موجودة بالفعل.');return;}
    await ref.update(updates);
    alert('تمت استعادة الأصناف الأساسية المفقودة.');
  }

  if(document.readyState==='loading') window.addEventListener('DOMContentLoaded',addRecoveryButton,{once:true});
  else addRecoveryButton();
})();
