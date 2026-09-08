(function(){
  'use strict';
  const STAFF_ACCESS_CODE='1234';
  const SESSION_KEY='cafe_ward_staff_unlocked';

  function openPage(){
    sessionStorage.setItem(SESSION_KEY,'true');
    document.body.classList.remove('page-locked');
    document.getElementById('access-lock')?.remove();
  }

  window.addEventListener('DOMContentLoaded',()=>{
    if(sessionStorage.getItem(SESSION_KEY)==='true') return;
    document.body.classList.add('page-locked');

    const lock=document.createElement('div');
    lock.id='access-lock';
    lock.innerHTML=`
      <div class="access-card" role="dialog" aria-modal="true" aria-labelledby="access-title">
        <img class="access-logo" src="q.png" alt="كافيه ورد">
        <div class="access-icon" aria-hidden="true">🔒</div>
        <h2 id="access-title">الصفحة محمية</h2>
        <p>أدخل رمز الموظفين للوصول إلى هذه الصفحة</p>
        <form id="access-form">
          <label for="access-code">رمز الدخول</label>
          <input id="access-code" type="password" inputmode="numeric" maxlength="8" autocomplete="off" required autofocus>
          <button type="submit">فتح الصفحة</button>
          <small id="access-error" role="alert"></small>
        </form>
      </div>`;
    document.body.appendChild(lock);

    const form=document.getElementById('access-form');
    const input=document.getElementById('access-code');
    const error=document.getElementById('access-error');
    form.addEventListener('submit',event=>{
      event.preventDefault();
      if(input.value===STAFF_ACCESS_CODE){openPage();return;}
      error.textContent='رمز الدخول غير صحيح';
      input.value='';
      input.focus();
    });
  });
})();
