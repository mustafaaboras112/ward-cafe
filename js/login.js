const loginForm=document.getElementById('login-form'), loginStatus=document.getElementById('auth-status');
const numberField=document.getElementById('user-number'), passwordField=document.getElementById('password');
const normalizeDigits=value=>String(value).replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?1632:1776)));
document.querySelectorAll('[inputmode="numeric"]').forEach(input=>input.addEventListener('input',()=>{input.value=normalizeDigits(input.value);}));
document.getElementById('show-password').onclick=event=>{const show=passwordField.type==='password';passwordField.type=show?'text':'password';event.target.textContent=show?'إخفاء':'إظهار';event.target.setAttribute('aria-pressed',String(show));};
document.getElementById('reset-password').onclick=()=>{loginStatus.textContent='تواصل مع مسؤول النظام لتعيين رمز دخول رقمي جديد لحسابك.';};
loginForm.onsubmit=async event=>{
    event.preventDefault();numberField.value=normalizeDigits(numberField.value);passwordField.value=normalizeDigits(passwordField.value);
    if(!loginForm.reportValidity())return;
    const button=document.getElementById('login-submit');button.disabled=true;loginStatus.textContent='جارٍ التحقق من حسابك…';
    try{
        const {user}=await firebase.auth().signInWithEmailAndPassword(numberField.value+'@staff.ward.invalid',passwordField.value);
        const profile=(await firebase.database().ref('access/'+user.uid).once('value')).val();
        if(!profile?.active){await firebase.auth().signOut();throw Error('inactive');}
        const next=new URLSearchParams(location.search).get('next');
        const allowed={admin:['admin.html','pos.html','accounting.html','waiter.html','kitchen.html'],cashier:['pos.html','waiter.html'],accountant:['accounting.html'],waiter:['waiter.html'],kitchen:['kitchen.html']};
        location.replace(allowed[profile.role]?.includes(next)?next:WardAuth.home(profile.role));
    }catch(error){loginStatus.textContent=error.code==='auth/too-many-requests'?'محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.':'تعذر تسجيل الدخول. تحقق من الرقم والرمز أو تواصل مع مسؤول النظام.';passwordField.value='';}
    finally{button.disabled=false;}
};
WardAuth.ready.then(()=>{
    if(new URLSearchParams(location.search).has('denied')) loginStatus.textContent='هذا الحساب لا يملك صلاحية دخول الصفحة المطلوبة.';
    if(WardAuth.user && !WardAuth.user.isAnonymous){
        document.getElementById('account-panel').hidden=false;
        document.getElementById('account-number').textContent='رقم المستخدم: '+(WardAuth.user.email?.endsWith('@staff.ward.invalid')?WardAuth.user.email.split('@')[0]:'يحتاج تحويل الحساب إلى رقم');
        document.getElementById('change-pin-form').onsubmit=async event=>{
            event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
            try{
                const current=normalizeDigits(document.getElementById('current-pin').value),pin=normalizeDigits(document.getElementById('new-pin').value);
                await WardAuth.user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(WardAuth.user.email,current));
                await WardAuth.user.getIdToken(true);
                await WardAuth.call('changeNumericPin',{pin});event.target.reset();await WardAuth.logout();
            }catch{loginStatus.textContent='تعذر تغيير الرمز. تحقق من الرمز الحالي والاتصال ثم حاول مجددًا.';}finally{button.disabled=false;}
        };
        document.getElementById('account-home').onclick=()=>location.assign(WardAuth.home(WardAuth.profile?.role));
        document.getElementById('account-logout').onclick=WardAuth.logout;
    }
});
