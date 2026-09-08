'use strict';
window.WardAuth=(()=>{
    const pages={'admin.html':['admin'],'pos.html':['admin','cashier'],'accounting.html':['admin','accountant'],'waiter.html':['admin','cashier','waiter'],'kitchen.html':['admin','kitchen']};
    const page=location.pathname.split('/').pop()||'index.html';
    const api={user:null,profile:null,csrf:null};
    let resolveReady;
    api.ready=new Promise(resolve=>resolveReady=resolve);
    api.home=role=>({admin:'admin.html',cashier:'pos.html',accountant:'accounting.html',waiter:'waiter.html',kitchen:'kitchen.html'}[role]||'login.html');

    async function parseResponse(response){
        let data={};
        try{data=await response.json();}catch{}
        if(!response.ok){
            const error=new Error(data.error||`فشل الطلب (${response.status}).`);
            error.status=response.status;
            throw error;
        }
        return data;
    }

    api.request=async(path,options={})=>{
        const method=String(options.method||'GET').toUpperCase();
        const headers={Accept:'application/json',...(options.headers||{})};
        let body=options.body;
        if(body!==undefined && body!==null && !(body instanceof FormData)){
            headers['Content-Type']='application/json';
            body=JSON.stringify(body);
        }
        if(!['GET','HEAD','OPTIONS'].includes(method) && api.csrf && options.csrf!==false)headers['X-CSRF-Token']=api.csrf;
        const response=await fetch(path,{method,headers,body,credentials:'same-origin',cache:'no-store'});
        if(response.status===401 && pages[page] && options.redirectOnAuth!==false){
            location.replace('login.html?next='+encodeURIComponent(page));
            throw new Error('انتهت جلسة تسجيل الدخول.');
        }
        return parseResponse(response);
    };

    api.refresh=async()=>{
        try{
            const data=await api.request('/api/auth/me',{redirectOnAuth:false});
            api.user={...data.user,uid:String(data.user.id),isAnonymous:false};
            api.profile={role:data.user.role,active:true,name:data.user.name,userNumber:data.user.userNumber};
            api.csrf=data.csrf;
            if(pages[page]&&!pages[page].includes(data.user.role))location.replace('login.html?denied=1');
            return api;
        }catch(error){
            api.user=null;api.profile=null;api.csrf=null;
            if(pages[page]&&error.status===401)location.replace('login.html?next='+encodeURIComponent(page));
            return api;
        }
    };

    api.logout=async()=>{
        try{if(api.user)await api.request('/api/auth/logout',{method:'POST',body:{}});}catch{}
        api.user=null;api.profile=null;api.csrf=null;location.replace('login.html');
    };

    api.call=async(name,data={})=>{
        const legacy={
            transitionOrder:()=>api.request(`/api/orders/${encodeURIComponent(data.id)}/transition`,{method:'POST',body:data}),
            customerOrder:()=>api.request('/api/orders',{method:'POST',body:data})
        };
        if(!legacy[name])throw new Error('هذه العملية القديمة لم تعد مدعومة.');
        return legacy[name]();
    };

    function addSessionBar(){
        if(!pages[page]||document.querySelector('.security-session'))return;
        const bar=document.createElement('div');bar.className='security-session';
        const label=document.createElement('span');label.textContent=api.profile?.name?`${api.profile.name} · ${api.profile.role}`:'جلسة الموظف';
        const account=document.createElement('a');account.href='login.html?account=1';account.textContent='حسابي';
        const logout=document.createElement('button');logout.type='button';logout.textContent='تسجيل الخروج';logout.onclick=api.logout;
        bar.append(label,account,logout);document.body.prepend(bar);
    }

    async function start(){
        await api.refresh();
        if(api.user)document.documentElement.classList.remove('auth-pending');
        resolveReady(api);
        addSessionBar();
    }
    if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
    return api;
})();
