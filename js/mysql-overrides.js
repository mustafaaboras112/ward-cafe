'use strict';
(function(){
    if(typeof collectTablePayment==='function'){
        collectTablePayment=async function(table,tendered,method,expectedOrders){
            const receipt=await WardAuth.request('/api/payments',{method:'POST',body:{
                table:String(table),method,tendered:method==='cash'?Number(tendered):undefined,
                orders:(expectedOrders||[]).map(order=>({id:String(order.firebaseKey||order.orderId||order.id||''),total:Number(order.total)}))
            }});
            await Promise.all([refreshOrders(),refreshTables(),refreshAccounting().catch(()=>{})]);
            return receipt;
        };
    }

    if(typeof sendPosOrder==='function'){
        sendPosOrder=async function(){
            if(posBusy()||!validTable(selectedTable)||!posDraft().length)return;
            const table=String(selectedTable),draft=JSON.parse(JSON.stringify(posDrafts[table]));
            orderBusy=true;renderPos();posEl('pos-feedback').textContent='جاري إرسال الطلب…';
            try{
                await WardAuth.request('/api/orders',{method:'POST',body:{id:draft.id,table,items:draft.items.map(item=>({id:String(item.id),qty:Number(item.qty)}))}});
                delete posDrafts[table];persistPosDrafts();
                await Promise.all([refreshOrders(),refreshTables()]);
                posEl('pos-feedback').textContent='تم إرسال الطلب للمطبخ. التحصيل يصبح متاحًا بعد تأكيد التوصيل.';
            }catch(error){posEl('pos-feedback').textContent='لم يُرسل الطلب: '+(error.message||'تحقق من الاتصال ثم أعد المحاولة.');}
            finally{orderBusy=false;renderPos();}
        };
    }

    if(typeof setAccountingDayClosed==='function'){
        setAccountingDayClosed=async function(value){
            if(!value)throw new Error('إعادة فتح يوم مغلق تحتاج إجراء إداري موثق، ولا تتم من الواجهة.');
            return closeAccountingDay();
        };
    }

    if(typeof updateAccountingRecord==='function'){
        updateAccountingRecord=async function(){throw new Error('تعديل سجل مالي محفوظ غير مسموح مباشرة. أضف حركة تصحيح منفصلة للحفاظ على سجل العمليات.');};
    }

    function syncPosConnection(){
        const node=document.getElementById('pos-account-status');if(!node)return;
        node.textContent=WardServerState.online===false?'الخادم غير متصل':'متصل بخادم Ward';
        node.dataset.state=WardServerState.online===false?'offline':'online';
    }

    window.addEventListener('ward:connection',syncPosConnection);
    window.addEventListener('DOMContentLoaded',()=>{
        syncPosConnection();
        const original=document.getElementById('pos-print');
        if(original){
            const clean=original.cloneNode(true);original.replaceWith(clean);
            clean.addEventListener('click',()=>{
                if(clean.disabled)return;
                if(typeof lastReceipt!=='undefined'&&lastReceipt&&typeof printWardReceipt==='function')printWardReceipt(lastReceipt);
                else window.print();
            });
        }
    });
})();
