window.addEventListener('ward:menu',renderAdminMenu);
window.addEventListener('DOMContentLoaded',startMenuRealtime);
async function editMenuItem(id) {
    const item=getMenu().find(item=>String(item.id)===String(id));
    if(!item) return;
    const name=prompt('اسم الصنف:',item.name);if(name===null) return;
    const input=prompt('السعر بالليرة:',item.price);if(input===null) return;
    const price=Number(input);
    if(!name.trim()||!input.trim()||!Number.isFinite(price)||price<0){alert('أدخل اسماً وسعراً صالحين.');return;}
    try {
        const ref=getFirebaseMenuRef();
        if(ref) await ref.child(String(id)).update({name:name.trim(),price});
        else {saveMenu(getMenu().map(row=>String(row.id)===String(id)?{...row,name:name.trim(),price}:row));renderAdminMenu();}
    } catch(error) {alert('تعذر حفظ تعديل الصنف. تحقق من الاتصال.');}
}
async function addNewItem(e) {
    e.preventDefault();
    const name = document.getElementById('item-name').value;
    const category = document.getElementById('item-cat').value;
    const price = parseFloat(document.getElementById('item-price').value);
    const desc = document.getElementById('item-desc').value;
    const img = document.getElementById('item-img').value;

    const newItem = { name, category, price, desc, img, createdAt: Date.now() };
    const menuRef = getFirebaseMenuRef();

    try {
        if (menuRef) {
            await menuRef.push(newItem);
        } else {
            const menu = getMenu();
            menu.push({ ...newItem, id: Date.now() });
            saveMenu(menu);
        }
        renderAdminMenu();
        alert('تمت إضافة الصنف بنجاح إلى المنيو!');
        document.getElementById('add-item-form').reset();
    } catch (error) {
        console.error('خطأ في إضافة الصنف إلى Firebase:', error);
        alert('حدث خطأ أثناء إرسال الصنف، تحقق من الاتصال وقواعد Firebase.');
    }
}

function renderAdminMenu() {
    const list = document.getElementById('admin-menu-list');
    if (!list) return;
    const menu = getMenu();
    list.innerHTML = '';
    if (menu.length === 0) {
        list.innerHTML = '<p style="color:#888;">لا توجد أصناف حالياً.</p>';
        return;
    }
    menu.forEach(item => {
        list.innerHTML += `
            <div class="product-row">
                <div class="product-info">
                    <strong>${item.name}</strong> - <span class="product-price-tag">${item.price} ليرة</span> (${item.category})
                </div>
                <button class="btn-action" onclick='editMenuItem("${item.id}")'>تعديل الاسم والسعر</button>
                <button class="delete-btn" onclick='deleteMenuItem("${item.id}")'>حذف</button>
            </div>
        `;
    });
}

function deleteMenuItem(id) {
    if (confirm('هل أنت متأكد من حذف هذا الصنف؟')) {
        const menuRef = getFirebaseMenuRef();
        if (menuRef) {
            menuRef.child(String(id)).remove().catch(error => {
                console.error('خطأ في حذف الصنف من Firebase:', error);
                alert('تعذر حذف الصنف من قاعدة البيانات.');
            });
            return;
        }
        let menu = getMenu();
        menu = menu.filter(i => String(i.id) !== String(id));
        saveMenu(menu);
        renderAdminMenu();
    }
}

function fixAdminHeader() {
    try {
        const header = document.querySelector('header');
        if (!header) return;

        const logo = header.querySelector('.logo');
        const links = header.querySelectorAll('a');

        if (!logo || links.length === 0) return;

        const existingLeft = header.querySelector('.header-left');
        const existingRight = header.querySelector('.header-right');

        if (existingLeft && existingRight) return;

        const left = document.createElement('div');
        left.className = 'header-left';

        const right = document.createElement('div');
        right.className = 'header-right';

        if (!existingLeft && logo) {
            left.appendChild(logo.cloneNode(true));
        }

        if (!existingRight) {
            links.forEach(a => right.appendChild(a.cloneNode(true)));
        }

        if (left.children.length > 0 || right.children.length > 0) {
            header.innerHTML = '';
            if (left.children.length > 0) header.appendChild(left);
            if (right.children.length > 0) header.appendChild(right);
        }
    } catch (e) {
        console.error('خطأ في تعديل الهيدر:', e);
    }
}
