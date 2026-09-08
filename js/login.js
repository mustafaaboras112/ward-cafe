'use strict';
const form=document.getElementById('login-form');
const pin=document.getElementById('pin');
const status=document.getElementById('auth-status');
const submit=document.getElementById('login-submit');
const sessionPanel=document.getElementById('session-panel');
const sessionName=document.getElementById('session-name');
const normalizeDigits=value=>String(value??'').replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?1632:1776)));

function showStatus(message,error=false){status.textContent=message;status.hidden=!message;status.className='simple-status'+(error?' error':'');}
function setPin(value){pin.value=normalizeDigits(value).replace(/\D/g,'').slice(0,8);}

document.querySelectorAll('[data-digit]').forEach(button=>button.addEventListener('click',()=>{setPin(pin.value+button.dataset.digit);pin.focus();}));
document.getElementById('pin-clear').onclick=()=>{setPin('');pin.focus();};
document.getElementById('pin-back').onclick=()=>{setPin(pin.value.slice(0,-1));pin.focus();};
pin.addEventListener('input',()=>setPin(pin.value));

form.onsubmit=async event=>{
  event.preventDefault();
  setPin(pin.value);
  if(!/^[0-9]{4,8}$/.test(pin.value)){showStatus('أدخل رمزًا من 4 إلى 8 أرقام.',true);return;}
  submit.disabled=true;showStatus('جاري الدخول…');
  try{
    const result=await WardAuth.request('/api/auth/login',{method:'POST',body:{pin:pin.value},csrf:false,redirectOnAuth:false});
    WardAuth.user={...result.user,uid:String(result.user.id),isAnonymous:false};
    WardAuth.profile={role:result.user.role,active:true,name:result.user.name,userNumber:result.user.userNumber};
    WardAuth.csrf=result.csrf;
    location.replace(result.home||WardAuth.home(result.user.role));
  }catch(error){setPin('');pin.focus();showStatus(error.message||'الرمز غير صحيح.',true);}
  finally{submit.disabled=false;}
};

WardAuth.ready.then(()=>{
  if(!WardAuth.user)return;
  form.hidden=true;sessionPanel.hidden=false;
  sessionName.textContent=`أنت مسجل كـ ${WardAuth.profile?.name||'موظف'}`;
  document.getElementById('continue-button').onclick=()=>location.assign(WardAuth.home(WardAuth.profile?.role));
  document.getElementById('logout-button').onclick=WardAuth.logout;
});
