/* Identity is verified by Firebase; browser flags never grant access. */
window.WardAuth = (() => {
    const pages = {'admin.html':['admin'],'pos.html':['admin','cashier'],'accounting.html':['admin','accountant'],'waiter.html':['admin','cashier','waiter'],'kitchen.html':['admin','kitchen']};
    const page = location.pathname.split('/').pop();
    const api = {user:null, profile:null, call:async(name,data)=> (await firebase.functions().httpsCallable(name)(data)).data};
    let resolveReady;
    api.ready = new Promise(resolve=>resolveReady=resolve);
    const goLogin = () => location.replace('login.html?next='+encodeURIComponent(page));
    api.logout = async () => {await firebase.auth().signOut(); location.replace('login.html');};
    api.home = role => ({admin:'admin.html',cashier:'pos.html',accountant:'accounting.html',waiter:'waiter.html',kitchen:'kitchen.html'}[role] || 'login.html');
    api.start = async () => {
        try {
            if (!window.firebase || !firebase.apps.length || !firebase.auth) throw Error('تعذر الاتصال بخدمة تسجيل الدخول.');
            firebase.auth().languageCode = 'ar';
            await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
            firebase.auth().onAuthStateChanged(async user => {
                try {
                    api.user=user;
                    if (!user && pages[page]) return goLogin();
                    if (!user && page!=='login.html') {await firebase.auth().signInAnonymously(); return;}
                    if(user && !user.isAnonymous) {
                        const ref=firebase.database().ref('access/'+user.uid);
                        api.profile=(await ref.once('value')).val();
                        const token=await user.getIdTokenResult();
                        if(pages[page] && (!api.profile?.active || !pages[page].includes(api.profile.role) || Number(token.claims.auth_time)<=(api.profile.revokedAt || 0))) {
                            location.replace('login.html?denied=1'); return;
                        }
                        if(pages[page]) {
                            ref.on('value',snap=>{const p=snap.val();if(!p?.active || !pages[page].includes(p.role) || Number(token.claims.auth_time)<=(p.revokedAt || 0)) goLogin();});
                        }
                    } else if(pages[page]) return goLogin();
                    document.documentElement.classList.remove('auth-pending');
                    resolveReady(api);
                } catch {if(pages[page]) goLogin(); else resolveReady(api);}
            });
        } catch(error) {
            const status=document.getElementById('auth-status');
            if(status) status.textContent=error.message;
            if(pages[page]) goLogin();
        }
    };
    window.addEventListener('DOMContentLoaded',()=>{
        api.start();
        if(pages[page]) {
            const bar=document.createElement('div');bar.className='security-session';
            const account=document.createElement('a');account.href='login.html?account=1';account.textContent='حسابي ورمز الدخول';
            const logout=document.createElement('button');logout.textContent='تسجيل الخروج';logout.onclick=api.logout;
            bar.append(account,logout);document.body.prepend(bar);
        }
    });
    return api;
})();
