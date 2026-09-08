window.addEventListener('DOMContentLoaded',async()=>{
    await WardAuth.ready;
    const panel=document.createElement('section');
    panel.className='simple-card';
    panel.style.marginTop='18px';
    panel.innerHTML=`
      <div class="simple-title"><div><h2>الموظفون</h2><p>اسم + دور + رمز فقط.</p></div></div>
      <form id="user-create" class="simple-form">
        <div class="simple-grid">
          <label><span class="simple-label">الاسم</span><input class="simple-input" name="name" required minlength="2" maxlength="100"></label>
          <label><span class="simple-label">الدور</span><select class="simple-input" name="role"><option value="waiter">جرسون</option><option value="kitchen">مطبخ</option><option value="cashier">كاشير</option><option value="accountant">محاسب</option><option value="admin">مدير</option></select></label>
          <label><span class="simple-label">الرمز</span><input class="simple-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" required placeholder="4 إلى 8 أرقام"></label>
        </div>
        <button class="simple-btn primary" type="submit">إضافة الموظف</button>
      </form>
      <p id="users-status" class="simple-status" hidden></p>
      <div style="margin:14px 0"><input id="users-search" class="simple-input" type="search" placeholder="بحث بالاسم"></div>
      <div id="users-list" class="simple-list"></div>`;
    document.querySelector('main').append(panel);

    const status=panel.querySelector('#users-status'),list=panel.querySelector('#users-list');
    const labels={admin:'مدير',cashier:'كاشير',accountant:'محاسب',waiter:'جرسون',kitchen:'مطبخ'};
    let users=[],busy=false;
    const show=(message,error=false)=>{status.textContent=message;status.hidden=!message;status.className='simple-status '+(error?'error':'ok');};
    const run=async fn=>{if(busy)return;busy=true;panel.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){show(e.message||'تعذر تنفيذ العملية.',true);}finally{busy=false;panel.querySelectorAll('button').forEach(b=>b.disabled=false);}};
    const load=async()=>{const result=await WardAuth.call('manageUsers',{action:'list'});users=result.users||[];render();};

    function render(){
      const q=panel.querySelector('#users-search').value.trim().toLowerCase();
      list.replaceChildren();
      for(const user of users.filter(u=>String(u.name||'').toLowerCase().includes(q))){
        const row=document.createElement('div');row.className='simple-row';
        const info=document.createElement('div');
        info.innerHTML=`<strong></strong><div class="meta"></div>`;
        info.querySelector('strong').textContent=user.name;
        info.querySelector('.meta').textContent=`${labels[user.role]||user.role} · ${user.active?'مفعّل':'معطّل'}`;
        const actions=document.createElement('div');actions.className='simple-actions';
        const pin=document.createElement('input');pin.className='simple-input';pin.style.width='150px';pin.type='password';pin.inputMode='numeric';pin.maxLength=8;pin.placeholder='رمز جديد';
        const reset=document.createElement('button');reset.className='simple-btn secondary';reset.type='button';reset.textContent='تغيير الرمز';reset.onclick=()=>run(async()=>{const value=String(pin.value).replace(/\D/g,'');if(!/^[0-9]{4,8}$/.test(value))throw new Error('أدخل رمزًا من 4 إلى 8 أرقام.');await WardAuth.call('manageUsers',{action:'resetPin',uid:user.uid,pin:value});pin.value='';show('تم تغيير الرمز.');});
        const toggle=document.createElement('button');toggle.className='simple-btn '+(user.active?'danger':'secondary');toggle.type='button';toggle.textContent=user.active?'تعطيل':'تفعيل';toggle.onclick=()=>run(async()=>{await WardAuth.call('manageUsers',{action:'update',uid:user.uid,name:user.name,role:user.role,active:!user.active});await load();show('تم تحديث الحساب.');});
        actions.append(pin,reset,toggle);row.append(info,actions);list.append(row);
      }
      if(!list.children.length){const empty=document.createElement('div');empty.className='simple-status';empty.textContent='لا يوجد موظفون.';list.append(empty);}
    }

    panel.querySelector('#user-create').onsubmit=event=>{event.preventDefault();run(async()=>{const data=Object.fromEntries(new FormData(event.currentTarget));data.pin=String(data.pin).replace(/\D/g,'');await WardAuth.call('manageUsers',{action:'create',...data});event.currentTarget.reset();await load();show('تمت إضافة الموظف.');});};
    panel.querySelector('#users-search').oninput=render;
    run(load);
});
