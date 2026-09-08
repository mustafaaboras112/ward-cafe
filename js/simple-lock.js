(function(){
  'use strict';

  const STAFF_ACCESS_CODE='1234';
  const SESSION_KEY='cafe_ward_staff_unlocked';
  const STYLE_ID='simple-lock-styles';

  function ensureStyles(){
    if(document.getElementById(STYLE_ID)) return;

    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      body.page-locked{
        overflow:hidden !important;
      }

      body.page-locked > *:not(#access-lock):not(script):not(style){
        visibility:hidden !important;
        pointer-events:none !important;
      }

      #access-lock{
        position:fixed !important;
        inset:0 !important;
        z-index:2147483647 !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        min-height:100dvh !important;
        padding:20px !important;
        overflow:auto !important;
        direction:rtl !important;
        background:#fff8fb !important;
        visibility:visible !important;
        pointer-events:auto !important;
      }

      #access-lock .access-card{
        width:min(100%,390px) !important;
        margin:auto !important;
        padding:24px 22px 22px !important;
        text-align:center !important;
        background:#fff !important;
        border:1px solid #f8bbd0 !important;
        border-radius:18px !important;
        box-shadow:0 18px 50px rgba(148,30,74,.16) !important;
        color:#30242a !important;
      }

      #access-lock .access-logo{
        display:block !important;
        width:min(250px,70vw) !important;
        height:145px !important;
        margin:-6px auto 8px !important;
        object-fit:contain !important;
      }

      #access-lock .access-icon{
        width:54px !important;
        height:54px !important;
        display:grid !important;
        place-items:center !important;
        margin:0 auto 14px !important;
        border-radius:50% !important;
        color:#fff !important;
        background:#e91e63 !important;
        font-size:22px !important;
      }

      #access-lock h2{
        margin:0 0 8px !important;
        font-size:22px !important;
        color:#30242a !important;
      }

      #access-lock p{
        margin:0 0 20px !important;
        color:#806f77 !important;
        font-size:14px !important;
        line-height:1.7 !important;
      }

      #access-lock form{
        display:block !important;
        text-align:right !important;
      }

      #access-lock label{
        display:block !important;
        margin-bottom:7px !important;
        color:#30242a !important;
        font-size:13px !important;
        font-weight:700 !important;
      }

      #access-lock input{
        display:block !important;
        width:100% !important;
        min-height:48px !important;
        padding:10px 12px !important;
        border:1px solid #f1d0dc !important;
        border-radius:10px !important;
        outline:none !important;
        background:#fff !important;
        color:#30242a !important;
        text-align:center !important;
        letter-spacing:5px !important;
        font:inherit !important;
        font-size:20px !important;
        box-sizing:border-box !important;
      }

      #access-lock input:focus{
        border-color:#e91e63 !important;
        box-shadow:0 0 0 3px rgba(233,30,99,.10) !important;
      }

      #access-lock button{
        display:block !important;
        width:100% !important;
        min-height:46px !important;
        margin-top:14px !important;
        padding:10px 14px !important;
        border:0 !important;
        border-radius:10px !important;
        color:#fff !important;
        background:#e91e63 !important;
        cursor:pointer !important;
        font:inherit !important;
        font-weight:700 !important;
      }

      #access-lock #access-error{
        display:block !important;
        min-height:18px !important;
        margin-top:10px !important;
        color:#c62828 !important;
        font-size:12px !important;
        text-align:center !important;
      }

      @media(max-width:480px){
        #access-lock{
          padding:14px !important;
          align-items:center !important;
        }

        #access-lock .access-card{
          padding:20px 18px !important;
          border-radius:16px !important;
        }

        #access-lock .access-logo{
          width:min(220px,72vw) !important;
          height:125px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function openPage(){
    sessionStorage.setItem(SESSION_KEY,'true');
    document.body.classList.remove('page-locked');
    document.getElementById('access-lock')?.remove();
  }

  function init(){
    if(!document.body) return;

    if(sessionStorage.getItem(SESSION_KEY)==='true'){
      document.body.classList.remove('page-locked');
      document.getElementById('access-lock')?.remove();
      return;
    }

    if(document.getElementById('access-lock')) return;

    ensureStyles();
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

    requestAnimationFrame(()=>input?.focus());

    form.addEventListener('submit',event=>{
      event.preventDefault();
      if(input.value===STAFF_ACCESS_CODE){
        openPage();
        return;
      }

      error.textContent='رمز الدخول غير صحيح';
      input.value='';
      input.focus();
    });
  }

  if(document.body) init();
  else window.addEventListener('DOMContentLoaded',init,{once:true});
})();
