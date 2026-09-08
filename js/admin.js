/* Administration UI; uses the existing shared menu storage and Firebase reference. */
const adminCategories = { hot: 'مشروبات ساخنة', cold: 'مشروبات باردة', sweets: 'حلويات', food: 'مأكولات' };
let editingItemId = null;
let adminSaving = false;
const pendingDeletes = new Set();
const adminElement = id => document.getElementById(id);

window.addEventListener('ward:menu', renderAdminMenu);
window.addEventListener('DOMContentLoaded', () => {
    adminElement('add-item-form').addEventListener('submit', addNewItem);
    adminElement('menu-search').addEventListener('input', renderAdminMenu);
    adminElement('category-filter').addEventListener('change', renderAdminMenu);
    adminElement('new-item-button').addEventListener('click', () => resetItemEditor(true));
    adminElement('cancel-edit-button').addEventListener('click', () => resetItemEditor(true));
    adminElement('item-img').addEventListener('input', updateItemPreview);
    adminElement('item-preview').addEventListener('error', () => {
        const preview = adminElement('item-preview');
        if (preview.getAttribute('src') !== 'q.png') preview.src = 'q.png';
        adminElement('preview-caption').textContent = 'تعذر عرض الصورة، تحقق من الرابط';
    });
    startMenuRealtime();
});

function adminFeedback(message, error = false) {
    const feedback = adminElement('admin-feedback');
    feedback.textContent = message;
    feedback.dataset.error = String(error);
    feedback.hidden = false;
}

function safeAdminImage(value) {
    try {
        const url = new URL(value, window.location.href);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : 'q.png';
    } catch { return 'q.png'; }
}

function updateItemPreview() {
    const value = adminElement('item-img').value.trim();
    adminElement('item-preview').src = value ? safeAdminImage(value) : 'q.png';
    adminElement('preview-caption').textContent = value ? 'الصورة التي ستظهر مع الصنف' : 'تظهر الصورة هنا عند إدخال الرابط';
}

function focusItemEditor() {
    adminElement('item-editor').scrollIntoView({ block: 'nearest' });
    adminElement('item-name').focus({ preventScroll: true });
}

function resetItemEditor(focus = false) {
    if (adminSaving) return;
    editingItemId = null;
    adminElement('add-item-form').reset();
    adminElement('item-cat').querySelectorAll('[data-legacy]').forEach(option => option.remove());
    adminElement('editor-title').textContent = 'إضافة صنف للمنيو';
    adminElement('editor-mode').textContent = 'صنف جديد';
    adminElement('save-item-button').textContent = 'إضافة الصنف';
    adminElement('cancel-edit-button').hidden = true;
    updateItemPreview();
    if (focus) focusItemEditor();
}

function editMenuItem(id) {
    if (adminSaving || pendingDeletes.has(String(id))) return;
    const item = getMenu().find(row => String(row.id) === String(id));
    if (!item) return;
    resetItemEditor();
    editingItemId = String(id);
    if (!Object.hasOwn(adminCategories, item.category)) {
        const option = document.createElement('option');
        option.value = item.category || '';
        option.textContent = item.category || 'بدون تصنيف';
        option.dataset.legacy = 'true';
        adminElement('item-cat').appendChild(option);
    }
    for (const [field, key] of Object.entries({ name:'name', cat:'category', price:'price', desc:'desc', img:'img' })) {
        adminElement('item-' + field).value = item[key] ?? '';
    }
    adminElement('editor-title').textContent = 'تعديل بيانات الصنف';
    adminElement('editor-mode').textContent = item.name;
    adminElement('save-item-button').textContent = 'حفظ التعديلات';
    adminElement('cancel-edit-button').hidden = false;
    updateItemPreview();
    focusItemEditor();
}

async function addNewItem(event) {
    event.preventDefault();
    if (adminSaving || !adminElement('add-item-form').reportValidity()) return;
    const name = adminElement('item-name').value.trim();
    const category = adminElement('item-cat').value;
    const price = Number(adminElement('item-price').value);
    const desc = adminElement('item-desc').value.trim();
    const img = adminElement('item-img').value.trim();
    if (!name || !desc || !img || !Number.isFinite(price) || price < 0) {
        adminFeedback('أدخل اسمًا ووصفًا وصورة وسعرًا صالحًا للصنف.', true);
        return;
    }
    const id = editingItemId;
    const changes = { name, category, price, desc, img };
    adminSaving = true;
    adminElement('item-fields').disabled = true;
    adminElement('new-item-button').disabled = true;
    adminElement('save-item-button').textContent = 'جاري الحفظ…';
    try {
        // Preserve the existing Firebase /menu path and local fallback.
        const ref = getFirebaseMenuRef();
        if (id !== null) {
            if (!getMenu().some(row => String(row.id) === id)) throw new Error('missing-item');
            if (ref) await ref.child(id).update(changes);
            else saveMenu(getMenu().map(row => String(row.id) === id ? { ...row, ...changes } : row));
        } else {
            const newItem = { ...changes, createdAt: Date.now() };
            if (ref) await ref.push(newItem);
            else saveMenu([...getMenu(), { ...newItem, id: Date.now() }]);
        }
        adminSaving = false;
        resetItemEditor();
        renderAdminMenu();
        adminFeedback(id === null ? 'تمت إضافة الصنف بنجاح.' : 'تم حفظ تعديلات الصنف بنجاح.');
    } catch (error) {
        adminFeedback(error.message === 'missing-item' ? 'هذا الصنف لم يعد موجودًا. ألغِ التعديل وحدّث القائمة.' : 'تعذر حفظ الصنف. تحقق من الاتصال وصلاحيات Firebase ثم أعد المحاولة.', true);
    } finally {
        adminSaving = false;
        adminElement('item-fields').disabled = false;
        adminElement('new-item-button').disabled = false;
        adminElement('save-item-button').textContent = editingItemId === null ? 'إضافة الصنف' : 'حفظ التعديلات';
    }
}

function renderAdminMenu() {
    const list = adminElement('admin-menu-list');
    if (!list) return;
    const menu = getMenu();
    const query = adminElement('menu-search').value.trim().toLocaleLowerCase('ar');
    const filter = adminElement('category-filter').value;
    // Keep existing custom categories accessible without changing stored values.
    const categories = [...new Set(menu.map(item => item.category).filter(Boolean))];
    const filterElement = adminElement('category-filter');
    filterElement.querySelectorAll('[data-legacy]').forEach(option => option.remove());
    categories.filter(category => !Object.hasOwn(adminCategories, category)).forEach(category => {
        const option = document.createElement('option');
        option.value = category; option.textContent = category; option.dataset.legacy = 'true';
        filterElement.appendChild(option);
    });
    filterElement.value = [...filterElement.options].some(option => option.value === filter) ? filter : '';
    const visible = menu.filter(item => (!filterElement.value || item.category === filterElement.value) && `${item.name || ''} ${item.desc || ''}`.toLocaleLowerCase('ar').includes(query));
    adminElement('total-items').textContent = menu.length;
    adminElement('total-categories').textContent = categories.length;
    adminElement('result-count').textContent = `عرض ${visible.length} من ${menu.length} صنف`;
    list.replaceChildren();
    if (!visible.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = menu.length ? 'لا توجد أصناف مطابقة. جرّب بحثًا أو تصنيفًا آخر.' : 'المنيو فارغ. أضف أول صنف من النموذج.';
        list.appendChild(empty);
        return;
    }
    visible.forEach(item => {
        const row = document.createElement('article');
        row.className = 'product-row';
        // Only static markup is inserted; item content is assigned as text.
        row.innerHTML = '<div class="product-details"><img class="product-image" loading="lazy" alt=""><div class="product-copy"><strong></strong><p></p><span class="category-badge"></span></div></div><div class="product-price"><span></span><small>ليرة</small></div><div class="product-actions"><button type="button" class="secondary-button">تعديل</button><button type="button" class="remove-button">حذف</button></div>';
        const image = row.querySelector('img');
        image.addEventListener('error', () => { image.src = 'q.png'; }, { once: true });
        image.src = safeAdminImage(item.img || 'q.png');
        row.querySelector('strong').textContent = item.name;
        row.querySelector('p').textContent = item.desc || 'بدون وصف';
        row.querySelector('.category-badge').textContent = adminCategories[item.category] || item.category || 'بدون تصنيف';
        row.querySelector('.product-price span').textContent = new Intl.NumberFormat('ar', { maximumFractionDigits:2 }).format(Number(item.price));
        const [edit, remove] = row.querySelectorAll('button');
        edit.setAttribute('aria-label', `تعديل ${item.name}`);
        remove.setAttribute('aria-label', `حذف ${item.name}`);
        edit.disabled = remove.disabled = pendingDeletes.has(String(item.id));
        edit.addEventListener('click', () => editMenuItem(item.id));
        remove.addEventListener('click', () => deleteMenuItem(item.id));
        list.appendChild(row);
    });
}

async function deleteMenuItem(id) {
    id = String(id);
    if (adminSaving || pendingDeletes.has(id)) return;
    const item = getMenu().find(row => String(row.id) === id);
    if (!item || !confirm(`حذف «${item.name}» من المنيو؟ لا يمكن التراجع عن الحذف.`)) return;
    pendingDeletes.add(id);
    renderAdminMenu();
    try {
        const ref = getFirebaseMenuRef();
        if (ref) await ref.child(id).remove();
        else saveMenu(getMenu().filter(row => String(row.id) !== id));
        if (editingItemId === id) resetItemEditor();
        adminFeedback(`تم حذف «${item.name}» من المنيو.`);
    } catch (error) {
        adminFeedback('تعذر حذف الصنف. تحقق من الاتصال وصلاحيات Firebase ثم أعد المحاولة.', true);
    } finally {
        pendingDeletes.delete(id);
        renderAdminMenu();
    }
}
