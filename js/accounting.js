/* =========================================================
   كافيه ورد - النظام المحاسبي
   js/accounting.js
========================================================= */

const pageInfo = {
    dashboard: {
        title: 'لوحة الملخص',
        description: 'نظرة سريعة على حركة كافيه ورد'
    },
    sales: {
        title: 'المبيعات',
        description: 'فواتير الكاشير وعمليات البيع'
    },
    purchases: {
        title: 'المشتريات',
        description: 'فواتير الموردين والمشتريات'
    },
    cashbox: {
        title: 'الصندوق',
        description: 'النقد الداخل والخارج والإغلاق اليومي'
    },
    expenses: {
        title: 'المصروفات',
        description: 'متابعة المصاريف'
    },
    customers: {
        title: 'العملاء',
        description: 'الذمم وسجل عمليات السداد'
    },
    suppliers: {
        title: 'الموردون',
        description: 'المستحقات والفواتير والدفعات'
    },
    inventory: {
        title: 'المخزون',
        description: 'الكميات وحركة المواد'
    },
    reports: {
        title: 'التقارير',
        description: 'الأرباح والخسائر وطرق الدفع'
    }
};


/* =========================================================
   Helpers
========================================================= */

const accMoney = value =>
    Number(value || 0).toFixed(2);

function accData() {
    if (typeof getAccountingData !== 'function') {
        return {
            expenses: [],
            purchases: [],
            inventory: [],
            clients: [],
            suppliers: [],
            unpaid: [],
            sales: [],
            cashMovements: [],
            dayClosed: false
        };
    }

    return getAccountingData();
}

function accSection(id) {
    return document.getElementById(id);
}

function accBody(id) {
    return accSection(id)?.querySelector('tbody') || null;
}

function accToday(value) {
    if (typeof isTodayWard === 'function') {
        return isTodayWard(value);
    }

    const date = new Date(value || Date.now());
    const now = new Date();

    return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
    );
}

function accDate(value) {
    if (typeof formatWardDateTime === 'function') {
        return formatWardDateTime(value);
    }

    return new Date(value || Date.now()).toLocaleString('ar');
}

function accCreate(tag, text = '', className = '') {
    const element = document.createElement(tag);

    if (text !== undefined && text !== null) {
        element.textContent = text;
    }

    if (className) {
        element.className = className;
    }

    return element;
}

function accEmptyRow(body, colSpan, message) {
    body.replaceChildren();

    const row = document.createElement('tr');
    const cell = document.createElement('td');

    cell.colSpan = colSpan;
    cell.textContent = message;
    cell.style.textAlign = 'center';
    cell.style.padding = '25px';

    row.appendChild(cell);
    body.appendChild(row);
}

function accountingStorageKey(collection) {
    return collection === 'cashMovements'
        ? 'cafe_ward_cash_mov'
        : `cafe_ward_${collection}`;
}


/* =========================================================
   Update Record
========================================================= */

async function updateAccountingRecord(collection, id, updates) {

    const ref =
        typeof getFirebaseAccountingRef === 'function'
            ? getFirebaseAccountingRef()
            : null;

    if (ref) {
        await ref
            .child(collection)
            .child(String(id))
            .update(updates);

        return;
    }

    const records = [
        ...(accData()[collection] || [])
    ];

    const index = records.findIndex(
        item => String(item.id) === String(id)
    );

    if (index === -1) {
        throw new Error('تعذر العثور على السجل.');
    }

    records[index] = {
        ...records[index],
        ...updates
    };

    localStorage.setItem(
        accountingStorageKey(collection),
        JSON.stringify(records)
    );

    window.dispatchEvent(
        new Event('ward:accounting')
    );
}


/* =========================================================
   Day Closed
========================================================= */

async function setAccountingDayClosed(value) {

    const ref =
        typeof getFirebaseAccountingRef === 'function'
            ? getFirebaseAccountingRef()
            : null;

    if (ref) {

        await ref
            .child('dayClosed')
            .set(Boolean(value));

        return;
    }

    localStorage.setItem(
        'cafe_ward_day_closed',
        String(Boolean(value))
    );

    window.dispatchEvent(
        new Event('ward:accounting')
    );
}


/* =========================================================
   Modal
========================================================= */

function createAccountingModalStyles() {

    if (document.getElementById('accounting-modal-style')) {
        return;
    }

    const style = document.createElement('style');

    style.id = 'accounting-modal-style';

    style.textContent = `
        .ward-modal-overlay{
            position:fixed;
            inset:0;
            background:rgba(0,0,0,.45);
            display:flex;
            align-items:center;
            justify-content:center;
            z-index:99999;
            padding:20px;
        }

        .ward-modal{
            background:#fff;
            width:min(470px,100%);
            max-height:90vh;
            overflow:auto;
            border-radius:20px;
            padding:24px;
            box-shadow:0 25px 70px rgba(0,0,0,.25);
            direction:rtl;
        }

        .ward-modal h3{
            margin:0 0 18px;
        }

        .ward-modal-field{
            margin-bottom:14px;
        }

        .ward-modal-field label{
            display:block;
            margin-bottom:6px;
            font-weight:700;
        }

        .ward-modal-field input,
        .ward-modal-field select{
            width:100%;
            box-sizing:border-box;
            padding:11px 12px;
            border:1px solid #ddd;
            border-radius:10px;
            font:inherit;
            background:#fff;
        }

        .ward-modal-actions{
            display:flex;
            gap:10px;
            margin-top:20px;
        }

        .ward-modal-actions button{
            flex:1;
            padding:11px;
            border:0;
            border-radius:10px;
            cursor:pointer;
            font:inherit;
        }

        .ward-modal-save{
            background:#b94b6b;
            color:#fff;
        }

        .ward-modal-cancel{
            background:#eee;
        }
    `;

    document.head.appendChild(style);
}


function accountingForm(title, fields) {

    createAccountingModalStyles();

    return new Promise(resolve => {

        const overlay =
            accCreate('div', '', 'ward-modal-overlay');

        const modal =
            accCreate('form', '', 'ward-modal');

        const heading =
            accCreate('h3', title);

        modal.appendChild(heading);

        const controls = {};

        fields.forEach(field => {

            const wrapper =
                accCreate('div', '', 'ward-modal-field');

            const label =
                accCreate(
                    'label',
                    field.label
                );

            let control;

            if (field.type === 'select') {

                control =
                    document.createElement('select');

                (field.options || []).forEach(option => {

                    const opt =
                        document.createElement('option');

                    if (typeof option === 'object') {
                        opt.value = option.value;
                        opt.textContent = option.label;
                    } else {
                        opt.value = option;
                        opt.textContent = option;
                    }

                    control.appendChild(opt);
                });

            } else {

                control =
                    document.createElement('input');

                control.type =
                    field.type || 'text';

                if (field.placeholder) {
                    control.placeholder =
                        field.placeholder;
                }

                if (field.min !== undefined) {
                    control.min = field.min;
                }

                if (field.step !== undefined) {
                    control.step = field.step;
                }
            }

            control.name = field.name;

            if (field.required !== false) {
                control.required = true;
            }

            if (field.value !== undefined) {
                control.value = field.value;
            }

            controls[field.name] =
                control;

            wrapper.append(
                label,
                control
            );

            modal.appendChild(wrapper);
        });


        const actions =
            accCreate(
                'div',
                '',
                'ward-modal-actions'
            );

        const save =
            accCreate(
                'button',
                'حفظ',
                'ward-modal-save'
            );

        save.type = 'submit';

        const cancel =
            accCreate(
                'button',
                'إلغاء',
                'ward-modal-cancel'
            );

        cancel.type = 'button';

        actions.append(
            cancel,
            save
        );

        modal.appendChild(actions);
        overlay.appendChild(modal);

        document.body.appendChild(overlay);


        function close(result) {
            overlay.remove();
            resolve(result);
        }


        cancel.addEventListener(
            'click',
            () => close(null)
        );


        overlay.addEventListener(
            'click',
            event => {

                if (event.target === overlay) {
                    close(null);
                }
            }
        );


        modal.addEventListener(
            'submit',
            event => {

                event.preventDefault();

                const result = {};

                Object.entries(controls)
                    .forEach(([name, control]) => {

                        result[name] =
                            control.value.trim();

                    });

                close(result);
            }
        );


        const first =
            Object.values(controls)[0];

        if (first) {
            setTimeout(
                () => first.focus(),
                50
            );
        }
    });
}


/* =========================================================
   Navigation
========================================================= */

function openAccountingPage(pageName) {

    const page =
        document.getElementById(pageName);

    if (!page) {
        return;
    }

    document
        .querySelectorAll('.page')
        .forEach(section =>
            section.classList.remove('active')
        );

    document
        .querySelectorAll('.nav button')
        .forEach(button =>
            button.classList.remove('active')
        );

    page.classList.add('active');

    const activeButton =
        document.querySelector(
            `.nav button[data-page="${pageName}"]`
        );

    if (activeButton) {
        activeButton.classList.add('active');
    }

    const info =
        pageInfo[pageName];

    if (info) {

        const title =
            document.getElementById('page-title');

        const description =
            document.getElementById(
                'page-description'
            );

        if (title) {
            title.textContent =
                info.title;
        }

        if (description) {
            description.textContent =
                info.description;
        }
    }
}


/* =========================================================
   Sales
========================================================= */

function renderAccountingSales() {

    const accounting =
        accData();

    const body =
        accBody('sales');

    if (!body) {
        return;
    }

    const section =
        accSection('sales');

    const search =
        section.querySelector(
            'input'
        )?.value
            .trim()
            .toLowerCase() || '';

    const select =
        section.querySelector(
            'select'
        );

    const filter =
        select?.value || '';

    let sales =
        [...(accounting.sales || [])];

    sales.sort(
        (a, b) =>
            Number(
                b.paidAt ||
                b.createdAt ||
                0
            ) -
            Number(
                a.paidAt ||
                a.createdAt ||
                0
            )
    );


    if (search) {

        sales =
            sales.filter(sale => {

                const text = [
                    sale.id,
                    sale.orderId,
                    sale.table,
                    sale.total
                ]
                    .join(' ')
                    .toLowerCase();

                return text.includes(search);
            });
    }


    if (
        filter === 'cash' ||
        filter === 'card'
    ) {

        sales =
            sales.filter(
                sale =>
                    sale.paymentMethod ===
                    filter
            );
    }


    if (!sales.length) {

        accEmptyRow(
            body,
            6,
            'لا توجد مبيعات مطابقة.'
        );

        return;
    }


    body.replaceChildren();


    sales.forEach(sale => {

        const row =
            document.createElement('tr');

        const invoice =
            accCreate(
                'td',
                '#' +
                String(
                    sale.orderId ||
                    sale.id ||
                    ''
                ).slice(0, 8)
            );

        const table =
            accCreate(
                'td',
                sale.table || '-'
            );

        const time =
            accCreate(
                'td',
                accDate(
                    sale.paidAt ||
                    sale.createdAt
                )
            );

        const total =
            accCreate(
                'td',
                accMoney(sale.total) +
                ' ليرة'
            );

        const method =
            accCreate(
                'td',
                sale.paymentMethod === 'card'
                    ? 'بطاقة'
                    : 'نقدي'
            );

        const status =
            document.createElement('td');

        status.appendChild(
            accCreate(
                'span',
                'مدفوع',
                'status green'
            )
        );

        row.append(
            invoice,
            table,
            time,
            total,
            method,
            status
        );

        body.appendChild(row);
    });
}


/* =========================================================
   Expenses
========================================================= */

async function addExpense() {

    const data =
        await accountingForm(
            'إضافة مصروف',
            [
                {
                    name: 'category',
                    label: 'التصنيف',
                    placeholder: 'تشغيل، تنظيف، صيانة...'
                },
                {
                    name: 'description',
                    label: 'البيان',
                    placeholder: 'وصف المصروف'
                },
                {
                    name: 'paymentMethod',
                    label: 'طريقة الدفع',
                    type: 'select',
                    options: [
                        {
                            value: 'cash',
                            label: 'نقدي'
                        },
                        {
                            value: 'card',
                            label: 'بطاقة'
                        }
                    ]
                },
                {
                    name: 'amount',
                    label: 'المبلغ',
                    type: 'number',
                    min: 0,
                    step: 0.01
                }
            ]
        );

    if (!data) return;

    const amount =
        Number(data.amount);

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        alert('المبلغ غير صحيح.');
        return;
    }

    await saveAccountingRecord(
        'expenses',
        {
            category: data.category,
            description: data.description,
            paymentMethod:
                data.paymentMethod,
            amount
        }
    );
}


function renderExpenses() {

    const body =
        accBody('expenses');

    if (!body) return;

    const records =
        [...(accData().expenses || [])]
            .sort(
                (a, b) =>
                    Number(
                        b.createdAt || 0
                    ) -
                    Number(
                        a.createdAt || 0
                    )
            );

    if (!records.length) {

        accEmptyRow(
            body,
            5,
            'لا توجد مصروفات مسجلة.'
        );

        return;
    }

    body.replaceChildren();

    records.forEach(expense => {

        const row =
            document.createElement('tr');

        row.append(
            accCreate(
                'td',
                accDate(expense.createdAt)
            ),

            accCreate(
                'td',
                expense.category || '-'
            ),

            accCreate(
                'td',
                expense.description || '-'
            ),

            accCreate(
                'td',
                expense.paymentMethod ===
                'card'
                    ? 'بطاقة'
                    : 'نقدي'
            ),

            accCreate(
                'td',
                accMoney(expense.amount)
            )
        );

        body.appendChild(row);
    });
}


/* =========================================================
   Purchases
========================================================= */

async function addPurchase() {

    const data =
        await accountingForm(
            'فاتورة شراء جديدة',
            [
                {
                    name: 'supplier',
                    label: 'المورد'
                },
                {
                    name: 'total',
                    label: 'إجمالي الفاتورة',
                    type: 'number',
                    min: 0,
                    step: 0.01
                },
                {
                    name: 'paid',
                    label: 'المدفوع',
                    type: 'number',
                    min: 0,
                    step: 0.01,
                    value: '0'
                },
                {
                    name: 'paymentMethod',
                    label: 'طريقة دفع المبلغ المدفوع',
                    type: 'select',
                    options: [
                        {
                            value: 'cash',
                            label: 'نقدي'
                        },
                        {
                            value: 'card',
                            label: 'بطاقة'
                        }
                    ]
                }
            ]
        );

    if (!data) return;

    const total =
        Number(data.total);

    const paid =
        Number(data.paid || 0);

    if (
        !Number.isFinite(total) ||
        total <= 0 ||
        !Number.isFinite(paid) ||
        paid < 0 ||
        paid > total
    ) {
        alert('راجع المبلغ والمدفوع.');
        return;
    }

    await saveAccountingRecord(
        'purchases',
        {
            supplier: data.supplier,
            total,
            paid,
            paymentMethod:
                data.paymentMethod
        }
    );
}


function renderPurchases() {

    const body =
        accBody('purchases');

    if (!body) return;

    const purchases =
        [...(accData().purchases || [])]
            .sort(
                (a, b) =>
                    Number(
                        b.createdAt || 0
                    ) -
                    Number(
                        a.createdAt || 0
                    )
            );

    if (!purchases.length) {

        accEmptyRow(
            body,
            6,
            'لا توجد مشتريات مسجلة.'
        );

        return;
    }

    body.replaceChildren();

    purchases.forEach(purchase => {

        const total =
            Number(purchase.total || 0);

        const paid =
            Number(purchase.paid || 0);

        const remaining =
            Math.max(
                0,
                total - paid
            );

        const row =
            document.createElement('tr');

        row.appendChild(
            accCreate(
                'td',
                '#P' +
                String(
                    purchase.id || ''
                ).slice(-6)
            )
        );

        row.appendChild(
            accCreate(
                'td',
                purchase.supplier || '-'
            )
        );

        row.appendChild(
            accCreate(
                'td',
                accMoney(total)
            )
        );

        row.appendChild(
            accCreate(
                'td',
                accMoney(paid)
            )
        );

        row.appendChild(
            accCreate(
                'td',
                accMoney(remaining)
            )
        );

        const status =
            document.createElement('td');

        status.appendChild(
            accCreate(
                'span',
                remaining > 0
                    ? 'مستحق'
                    : 'مدفوع',
                remaining > 0
                    ? 'status orange'
                    : 'status green'
            )
        );

        row.appendChild(status);

        body.appendChild(row);
    });
}


/* =========================================================
   Customers
========================================================= */

async function addCustomer() {

    const data =
        await accountingForm(
            'إضافة عميل',
            [
                {
                    name: 'name',
                    label: 'اسم العميل'
                },
                {
                    name: 'phone',
                    label: 'رقم الهاتف',
                    required: false
                },
                {
                    name: 'balance',
                    label: 'الرصيد المستحق',
                    type: 'number',
                    min: 0,
                    step: 0.01,
                    value: '0'
                }
            ]
        );

    if (!data) return;

    const balance =
        Number(data.balance || 0);

    if (
        !Number.isFinite(balance) ||
        balance < 0
    ) {
        alert('الرصيد غير صحيح.');
        return;
    }

    await saveAccountingRecord(
        'clients',
        {
            name: data.name,
            phone: data.phone,
            balance,
            lastMovement: Date.now()
        }
    );
}


async function payCustomer(customer) {

    const data =
        await accountingForm(
            `تسجيل سداد - ${customer.name}`,
            [
                {
                    name: 'amount',
                    label: 'المبلغ المستلم',
                    type: 'number',
                    min: 0,
                    step: 0.01
                }
            ]
        );

    if (!data) return;

    const amount =
        Number(data.amount);

    const current =
        Number(customer.balance || 0);

    if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > current
    ) {
        alert('مبلغ السداد غير صحيح.');
        return;
    }

    await updateAccountingRecord(
        'clients',
        customer.id,
        {
            balance:
                Math.max(
                    0,
                    current - amount
                ),
            lastMovement:
                Date.now()
        }
    );

    await saveAccountingRecord(
        'cashMovements',
        {
            type: 'customer-payment',
            description:
                `سداد العميل ${customer.name}`,
            inAmount: amount,
            outAmount: 0
        }
    );
}


function renderCustomers() {

    const body =
        accBody('customers');

    if (!body) return;

    const clients =
        accData().clients || [];

    if (!clients.length) {

        accEmptyRow(
            body,
            5,
            'لا يوجد عملاء مسجلون.'
        );

        return;
    }

    body.replaceChildren();

    clients.forEach(client => {

        const row =
            document.createElement('tr');

        row.append(
            accCreate(
                'td',
                client.name || '-'
            ),
            accCreate(
                'td',
                client.phone || '-'
            ),
            accCreate(
                'td',
                accMoney(client.balance)
            ),
            accCreate(
                'td',
                client.lastMovement
                    ? accDate(
                        client.lastMovement
                    )
                    : '-'
            )
        );

        const action =
            document.createElement('td');

        const button =
            accCreate(
                'button',
                'تسجيل سداد',
                'btn'
            );

        button.type = 'button';

        button.disabled =
            Number(client.balance || 0) <=
            0;

        button.addEventListener(
            'click',
            () => payCustomer(client)
        );

        action.appendChild(button);
        row.appendChild(action);

        body.appendChild(row);
    });
}


/* =========================================================
   Suppliers
========================================================= */

async function addSupplier() {

    const data =
        await accountingForm(
            'إضافة مورد',
            [
                {
                    name: 'name',
                    label: 'اسم المورد'
                },
                {
                    name: 'phone',
                    label: 'رقم الهاتف',
                    required: false
                },
                {
                    name: 'openingBalance',
                    label: 'رصيد سابق مستحق',
                    type: 'number',
                    min: 0,
                    step: 0.01,
                    value: '0'
                }
            ]
        );

    if (!data) return;

    await saveAccountingRecord(
        'suppliers',
        {
            name: data.name,
            phone: data.phone,
            openingBalance:
                Number(
                    data.openingBalance ||
                    0
                ),
            payments: 0
        }
    );
}


function supplierTotals(supplier) {

    const purchases =
        (accData().purchases || [])
            .filter(
                purchase =>
                    String(
                        purchase.supplier ||
                        ''
                    ).trim() ===
                    String(
                        supplier.name ||
                        ''
                    ).trim()
            );

    const invoices =
        purchases.reduce(
            (sum, purchase) =>
                sum +
                Number(
                    purchase.total || 0
                ),
            Number(
                supplier.openingBalance ||
                0
            )
        );

    const purchasePaid =
        purchases.reduce(
            (sum, purchase) =>
                sum +
                Number(
                    purchase.paid || 0
                ),
            0
        );

    const manualPayments =
        Number(
            supplier.payments || 0
        );

    const paid =
        purchasePaid +
        manualPayments;

    return {
        invoices,
        paid,
        remaining:
            Math.max(
                0,
                invoices - paid
            )
    };
}


async function paySupplier(supplier) {

    const totals =
        supplierTotals(supplier);

    if (totals.remaining <= 0) {
        alert('لا يوجد مبلغ مستحق لهذا المورد.');
        return;
    }

    const data =
        await accountingForm(
            `دفعة مورد - ${supplier.name}`,
            [
                {
                    name: 'amount',
                    label: 'المبلغ المدفوع',
                    type: 'number',
                    min: 0,
                    step: 0.01
                }
            ]
        );

    if (!data) return;

    const amount =
        Number(data.amount);

    if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount >
        totals.remaining
    ) {
        alert('مبلغ الدفعة غير صحيح.');
        return;
    }

    await updateAccountingRecord(
        'suppliers',
        supplier.id,
        {
            payments:
                Number(
                    supplier.payments ||
                    0
                ) + amount
        }
    );

    await saveAccountingRecord(
        'cashMovements',
        {
            type: 'supplier-payment',
            description:
                `دفعة للمورد ${supplier.name}`,
            inAmount: 0,
            outAmount: amount
        }
    );
}


function renderSuppliers() {

    const body =
        accBody('suppliers');

    if (!body) return;

    const suppliers =
        accData().suppliers || [];

    if (!suppliers.length) {

        accEmptyRow(
            body,
            5,
            'لا يوجد موردون مسجلون.'
        );

        return;
    }

    body.replaceChildren();

    suppliers.forEach(supplier => {

        const totals =
            supplierTotals(supplier);

        const row =
            document.createElement('tr');

        row.append(
            accCreate(
                'td',
                supplier.name || '-'
            ),
            accCreate(
                'td',
                accMoney(
                    totals.invoices
                )
            ),
            accCreate(
                'td',
                accMoney(
                    totals.paid
                )
            ),
            accCreate(
                'td',
                accMoney(
                    totals.remaining
                )
            )
        );

        const action =
            document.createElement('td');

        const button =
            accCreate(
                'button',
                'تسجيل دفعة',
                'btn'
            );

        button.type = 'button';

        button.disabled =
            totals.remaining <= 0;

        button.addEventListener(
            'click',
            () =>
                paySupplier(supplier)
        );

        action.appendChild(button);
        row.appendChild(action);

        body.appendChild(row);
    });
}


/* =========================================================
   Inventory
========================================================= */

async function addInventoryItem() {

    const data =
        await accountingForm(
            'إضافة مادة للمخزون',
            [
                {
                    name: 'name',
                    label: 'اسم المادة'
                },
                {
                    name: 'unit',
                    label: 'الوحدة',
                    placeholder: 'كغ، علبة، لتر...'
                },
                {
                    name: 'quantity',
                    label: 'الكمية المتوفرة',
                    type: 'number',
                    min: 0,
                    step: 0.01
                },
                {
                    name: 'reorderLevel',
                    label: 'حد الطلب',
                    type: 'number',
                    min: 0,
                    step: 0.01
                }
            ]
        );

    if (!data) return;

    await saveAccountingRecord(
        'inventory',
        {
            name: data.name,
            unit: data.unit,
            quantity:
                Number(
                    data.quantity || 0
                ),
            reorderLevel:
                Number(
                    data.reorderLevel ||
                    0
                )
        }
    );
}


function renderInventory() {

    const body =
        accBody('inventory');

    if (!body) return;

    const inventory =
        accData().inventory || [];

    if (!inventory.length) {

        accEmptyRow(
            body,
            5,
            'لا توجد مواد في المخزون.'
        );

        return;
    }

    body.replaceChildren();

    inventory.forEach(item => {

        const quantity =
            Number(
                item.quantity || 0
            );

        const reorder =
            Number(
                item.reorderLevel || 0
            );

        const low =
            quantity <= reorder;

        const row =
            document.createElement('tr');

        row.append(
            accCreate(
                'td',
                item.name || '-'
            ),
            accCreate(
                'td',
                item.unit || '-'
            ),
            accCreate(
                'td',
                String(quantity)
            ),
            accCreate(
                'td',
                String(reorder)
            )
        );

        const status =
            document.createElement('td');

        status.appendChild(
            accCreate(
                'span',
                low
                    ? 'منخفض'
                    : 'جيد',
                low
                    ? 'status red'
                    : 'status green'
            )
        );

        row.appendChild(status);

        body.appendChild(row);
    });
}


/* =========================================================
   Dashboard
========================================================= */

function accountingTotals() {

    const accounting =
        accData();

    const todaySales =
        (accounting.sales || [])
            .filter(
                sale =>
                    accToday(
                        sale.paidAt ||
                        sale.createdAt
                    )
            );

    const todayExpenses =
        (accounting.expenses || [])
            .filter(
                item =>
                    accToday(
                        item.createdAt
                    )
            );

    const todayPurchases =
        (accounting.purchases || [])
            .filter(
                item =>
                    accToday(
                        item.createdAt
                    )
            );

    const cashSales =
        todaySales
            .filter(
                sale =>
                    sale.paymentMethod ===
                    'cash'
            )
            .reduce(
                (sum, sale) =>
                    sum +
                    Number(
                        sale.total || 0
                    ),
                0
            );

    const cardSales =
        todaySales
            .filter(
                sale =>
                    sale.paymentMethod ===
                    'card'
            )
            .reduce(
                (sum, sale) =>
                    sum +
                    Number(
                        sale.total || 0
                    ),
                0
            );

    const salesTotal =
        todaySales.reduce(
            (sum, sale) =>
                sum +
                Number(
                    sale.total || 0
                ),
            0
        );

    const cashExpenses =
        todayExpenses
            .filter(
                item =>
                    item.paymentMethod !==
                    'card'
            )
            .reduce(
                (sum, item) =>
                    sum +
                    Number(
                        item.amount || 0
                    ),
                0
            );

    const cashPurchases =
        todayPurchases
            .filter(
                item =>
                    item.paymentMethod !==
                    'card'
            )
            .reduce(
                (sum, item) =>
                    sum +
                    Number(
                        item.paid || 0
                    ),
                0
            );

    const movements =
        (accounting.cashMovements || [])
            .filter(
                item =>
                    accToday(
                        item.createdAt
                    )
            );

    const manualIn =
        movements.reduce(
            (sum, item) =>
                sum +
                Number(
                    item.inAmount || 0
                ),
            0
        );

    const manualOut =
        movements.reduce(
            (sum, item) =>
                sum +
                Number(
                    item.outAmount || 0
                ),
            0
        );

    const expectedCash =
        cashSales +
        manualIn -
        cashExpenses -
        cashPurchases -
        manualOut;

    return {
        todaySales,
        salesTotal,
        cashSales,
        cardSales,
        cashExpenses,
        cashPurchases,
        manualIn,
        manualOut,
        expectedCash
    };
}


function renderDashboard() {

    const dashboard =
        accSection('dashboard');

    if (!dashboard) return;

    const totals =
        accountingTotals();

    const metrics =
        dashboard.querySelectorAll(
            '.metric strong'
        );

    if (metrics[0]) {
        metrics[0].textContent =
            accMoney(
                totals.salesTotal
            ) +
            ' ليرة';
    }

    if (metrics[1]) {
        metrics[1].textContent =
            accMoney(
                totals.expectedCash
            ) +
            ' ليرة';
    }

    if (metrics[2]) {
        metrics[2].textContent =
            accMoney(
                totals.cardSales
            ) +
            ' ليرة';
    }

    if (metrics[3]) {
        metrics[3].textContent =
            String(
                totals.todaySales.length
            );
    }


    renderRecentOperations();
    renderDashboardAlerts();
}


function renderRecentOperations() {

    const dashboard =
        accSection('dashboard');

    const body =
        dashboard?.querySelector(
            '.two-columns .card:first-child tbody'
        );

    if (!body) return;

    const accounting =
        accData();

    const operations = [];


    (accounting.sales || [])
        .forEach(sale => {

            operations.push({
                createdAt:
                    sale.paidAt ||
                    sale.createdAt ||
                    0,
                type: 'بيع',
                reference:
                    '#' +
                    String(
                        sale.orderId ||
                        sale.id ||
                        ''
                    ).slice(
                        0,
                        8
                    ),
                description:
                    'طاولة ' +
                    (
                        sale.table ||
                        '-'
                    ),
                payment:
                    sale.paymentMethod ===
                    'card'
                        ? 'بطاقة'
                        : 'نقدي',
                amount:
                    Number(
                        sale.total || 0
                    )
            });
        });


    (accounting.expenses || [])
        .forEach(expense => {

            operations.push({
                createdAt:
                    expense.createdAt ||
                    0,
                type: 'مصروف',
                reference:
                    '#E' +
                    String(
                        expense.id ||
                        ''
                    ).slice(
                        -6
                    ),
                description:
                    expense.description ||
                    expense.category ||
                    '-',
                payment:
                    expense.paymentMethod ===
                    'card'
                        ? 'بطاقة'
                        : 'نقدي',
                amount:
                    Number(
                        expense.amount ||
                        0
                    )
            });
        });


    operations.sort(
        (a, b) =>
            Number(
                b.createdAt
            ) -
            Number(
                a.createdAt
            )
    );


    const recent =
        operations.slice(0, 6);


    if (!recent.length) {

        accEmptyRow(
            body,
            5,
            'لا توجد عمليات بعد.'
        );

        return;
    }


    body.replaceChildren();


    recent.forEach(operation => {

        const row =
            document.createElement('tr');

        row.append(
            accCreate(
                'td',
                operation.type
            ),
            accCreate(
                'td',
                operation.reference
            ),
            accCreate(
                'td',
                operation.description
            ),
            accCreate(
                'td',
                operation.payment
            ),
            accCreate(
                'td',
                accMoney(
                    operation.amount
                )
            )
        );

        body.appendChild(row);
    });
}


function renderDashboardAlerts() {

    const dashboard =
        accSection('dashboard');

    const list =
        dashboard
            ?.querySelectorAll('.list')[0];

    if (!list) return;

    const accounting =
        accData();

    const alerts = [];


    (accounting.suppliers || [])
        .forEach(supplier => {

            const totals =
                supplierTotals(supplier);

            if (totals.remaining > 0) {

                alerts.push({
                    title:
                        supplier.name ||
                        'مورد',
                    text:
                        'مبلغ مستحق للمورد',
                    value:
                        accMoney(
                            totals.remaining
                        ),
                    className:
                        'status orange'
                });
            }
        });


    (accounting.inventory || [])
        .forEach(item => {

            if (
                Number(
                    item.quantity || 0
                ) <=
                Number(
                    item.reorderLevel || 0
                )
            ) {

                alerts.push({
                    title:
                        item.name ||
                        'مادة',
                    text:
                        'الكمية منخفضة',
                    value:
                        String(
                            item.quantity ||
                            0
                        ),
                    className:
                        'status red'
                });
            }
        });


    list.replaceChildren();


    if (!alerts.length) {

        const item =
            accCreate(
                'div',
                '',
                'list-item'
            );

        item.appendChild(
            accCreate(
                'b',
                'لا توجد تنبيهات'
            )
        );

        list.appendChild(item);

        return;
    }


    alerts
        .slice(0, 6)
        .forEach(alertInfo => {

            const item =
                accCreate(
                    'div',
                    '',
                    'list-item'
                );

            const text =
                document.createElement('div');

            text.append(
                accCreate(
                    'b',
                    alertInfo.title
                ),
                accCreate(
                    'small',
                    alertInfo.text
                )
            );

            const badge =
                accCreate(
                    'span',
                    alertInfo.value,
                    alertInfo.className
                );

            item.append(
                text,
                badge
            );

            list.appendChild(item);
        });
}


/* =========================================================
   Cashbox
========================================================= */

function renderCashbox() {

    const section =
        accSection('cashbox');

    if (!section) return;

    const totals =
        accountingTotals();

    const metrics =
        section.querySelectorAll(
            '.metric strong'
        );

    /*
       الرصيد الافتتاحي حالياً صفر.
       إذا بدنا نضيف ورديات ورصيد افتتاحي مستقل
       منعمله بالمرحلة التالية.
    */

    const openingBalance = 0;

    if (metrics[0]) {
        metrics[0].textContent =
            accMoney(openingBalance);
    }

    if (metrics[1]) {
        metrics[1].textContent =
            accMoney(
                totals.cashSales
            );
    }

    if (metrics[2]) {
        metrics[2].textContent =
            accMoney(
                totals.cashExpenses +
                totals.cashPurchases +
                totals.manualOut
            );
    }

    if (metrics[3]) {
        metrics[3].textContent =
            accMoney(
                openingBalance +
                totals.expectedCash
            );
    }


    const body =
        section.querySelector(
            'tbody'
        );

    if (!body) return;


    const accounting =
        accData();

    const movements = [];


    (accounting.sales || [])
        .filter(
            sale =>
                sale.paymentMethod ===
                'cash'
        )
        .forEach(sale => {

            movements.push({
                createdAt:
                    sale.paidAt ||
                    sale.createdAt ||
                    0,
                type: 'بيع',
                description:
                    'طاولة ' +
                    (
                        sale.table ||
                        '-'
                    ),
                inAmount:
                    Number(
                        sale.total || 0
                    ),
                outAmount: 0
            });
        });


    (accounting.expenses || [])
        .filter(
            item =>
                item.paymentMethod !==
                'card'
        )
        .forEach(item => {

            movements.push({
                createdAt:
                    item.createdAt || 0,
                type: 'مصروف',
                description:
                    item.description ||
                    item.category ||
                    '-',
                inAmount: 0,
                outAmount:
                    Number(
                        item.amount || 0
                    )
            });
        });


    (accounting.purchases || [])
        .filter(
            item =>
                item.paymentMethod !==
                'card' &&
                Number(
                    item.paid || 0
                ) > 0
        )
        .forEach(item => {

            movements.push({
                createdAt:
                    item.createdAt || 0,
                type: 'شراء',
                description:
                    item.supplier ||
                    'مشتريات',
                inAmount: 0,
                outAmount:
                    Number(
                        item.paid || 0
                    )
            });
        });


    (accounting.cashMovements || [])
        .forEach(item => {

            movements.push({
                createdAt:
                    item.createdAt || 0,
                type:
                    item.type ===
                    'customer-payment'
                        ? 'سداد عميل'
                        : item.type ===
                        'supplier-payment'
                            ? 'دفعة مورد'
                            : 'حركة',
                description:
                    item.description ||
                    '-',
                inAmount:
                    Number(
                        item.inAmount || 0
                    ),
                outAmount:
                    Number(
                        item.outAmount || 0
                    )
            });
        });


    movements.sort(
        (a, b) =>
            Number(
                b.createdAt
            ) -
            Number(
                a.createdAt
            )
    );


    if (!movements.length) {

        accEmptyRow(
            body,
            5,
            'لا توجد حركة في الصندوق.'
        );

        return;
    }


    body.replaceChildren();


    movements
        .slice(0, 100)
        .forEach(movement => {

            const row =
                document.createElement('tr');

            row.append(
                accCreate(
                    'td',
                    accDate(
                        movement.createdAt
                    )
                ),
                accCreate(
                    'td',
                    movement.type
                ),
                accCreate(
                    'td',
                    movement.description
                ),
                accCreate(
                    'td',
                    movement.inAmount > 0
                        ? accMoney(
                            movement.inAmount
                        )
                        : '-'
                ),
                accCreate(
                    'td',
                    movement.outAmount > 0
                        ? accMoney(
                            movement.outAmount
                        )
                        : '-'
                )
            );

            body.appendChild(row);
        });
}


/* =========================================================
   Reports
========================================================= */

function renderReports() {

    const section =
        accSection('reports');

    if (!section) return;

    const accounting =
        accData();

    const totalSales =
        (accounting.sales || [])
            .reduce(
                (sum, sale) =>
                    sum +
                    Number(
                        sale.total || 0
                    ),
                0
            );

    const totalPurchases =
        (accounting.purchases || [])
            .reduce(
                (sum, item) =>
                    sum +
                    Number(
                        item.total || 0
                    ),
                0
            );

    const totalExpenses =
        (accounting.expenses || [])
            .reduce(
                (sum, item) =>
                    sum +
                    Number(
                        item.amount || 0
                    ),
                0
            );

    const profit =
        totalSales -
        totalPurchases -
        totalExpenses;


    const cash =
        (accounting.sales || [])
            .filter(
                sale =>
                    sale.paymentMethod ===
                    'cash'
            )
            .reduce(
                (sum, sale) =>
                    sum +
                    Number(
                        sale.total || 0
                    ),
                0
            );

    const card =
        (accounting.sales || [])
            .filter(
                sale =>
                    sale.paymentMethod ===
                    'card'
            )
            .reduce(
                (sum, sale) =>
                    sum +
                    Number(
                        sale.total || 0
                    ),
                0
            );

    const credit =
        (accounting.clients || [])
            .reduce(
                (sum, client) =>
                    sum +
                    Number(
                        client.balance || 0
                    ),
                0
            );


    const lists =
        section.querySelectorAll('.list');

    if (lists[0]) {

        const values =
            lists[0].querySelectorAll(
                'strong'
            );

        if (values[0]) {
            values[0].textContent =
                accMoney(totalSales);
        }

        if (values[1]) {
            values[1].textContent =
                accMoney(
                    totalPurchases
                );
        }

        if (values[2]) {
            values[2].textContent =
                accMoney(
                    totalExpenses
                );
        }

        if (values[3]) {
            values[3].textContent =
                accMoney(profit);

            values[3].style.color =
                profit >= 0
                    ? 'var(--green)'
                    : 'var(--red)';
        }
    }


    if (lists[1]) {

        const values =
            lists[1].querySelectorAll(
                'strong'
            );

        if (values[0]) {
            values[0].textContent =
                accMoney(cash);
        }

        if (values[1]) {
            values[1].textContent =
                accMoney(card);
        }

        if (values[2]) {
            values[2].textContent =
                accMoney(credit);
        }
    }
}


/* =========================================================
   Day Close Button
========================================================= */

function updateCloseDayButton() {

    const section =
        accSection('cashbox');

    if (!section) return;

    const button =
        section.querySelector(
            '.section-title .btn-primary'
        );

    if (!button) return;

    const closed =
        accData().dayClosed === true;

    button.textContent =
        closed
            ? 'فتح اليوم'
            : 'إغلاق اليوم';

    button.dataset.closed =
        String(closed);
}


async function toggleDayClosed() {

    const closed =
        accData().dayClosed === true;

    const message =
        closed
            ? 'هل تريد فتح الصندوق والسماح للكاشير بالتحصيل؟'
            : 'هل تريد إغلاق اليوم؟ بعد الإغلاق لن يستطيع الكاشير تسجيل دفعات جديدة.';

    if (!confirm(message)) {
        return;
    }

    try {

        await setAccountingDayClosed(
            !closed
        );

    } catch (error) {

        alert(
            error.message ||
            'تعذر تحديث حالة الصندوق.'
        );
    }
}


/* =========================================================
   Render All
========================================================= */

function renderAccounting() {

    renderAccountingSales();
    renderExpenses();
    renderPurchases();
    renderCustomers();
    renderSuppliers();
    renderInventory();
    renderDashboard();
    renderCashbox();
    renderReports();
    updateCloseDayButton();
}


/* =========================================================
   Buttons
========================================================= */

function bindAccountingButtons() {

    document
        .querySelectorAll('.nav button')
        .forEach(button => {

            button.addEventListener(
                'click',
                () =>
                    openAccountingPage(
                        button.dataset.page
                    )
            );
        });


    /*
       Topbar
    */

    const topActions =
        document.querySelectorAll(
            '.topbar .actions button'
        );

    if (topActions[0]) {

        topActions[0]
            .addEventListener(
                'click',
                () => window.print()
            );
    }


    if (topActions[1]) {

        topActions[1]
            .addEventListener(
                'click',
                async () => {

                    const result =
                        await accountingForm(
                            'عملية جديدة',
                            [
                                {
                                    name: 'type',
                                    label: 'نوع العملية',
                                    type: 'select',
                                    options: [
                                        {
                                            value: 'expense',
                                            label: 'مصروف'
                                        },
                                        {
                                            value: 'purchase',
                                            label: 'فاتورة شراء'
                                        },
                                        {
                                            value: 'customer',
                                            label: 'عميل'
                                        },
                                        {
                                            value: 'supplier',
                                            label: 'مورد'
                                        },
                                        {
                                            value: 'inventory',
                                            label: 'مادة مخزون'
                                        }
                                    ]
                                }
                            ]
                        );

                    if (!result) return;

                    if (
                        result.type ===
                        'expense'
                    ) {
                        openAccountingPage(
                            'expenses'
                        );
                        addExpense();
                    }

                    if (
                        result.type ===
                        'purchase'
                    ) {
                        openAccountingPage(
                            'purchases'
                        );
                        addPurchase();
                    }

                    if (
                        result.type ===
                        'customer'
                    ) {
                        openAccountingPage(
                            'customers'
                        );
                        addCustomer();
                    }

                    if (
                        result.type ===
                        'supplier'
                    ) {
                        openAccountingPage(
                            'suppliers'
                        );
                        addSupplier();
                    }

                    if (
                        result.type ===
                        'inventory'
                    ) {
                        openAccountingPage(
                            'inventory'
                        );
                        addInventoryItem();
                    }
                }
            );
    }


    /*
       Sales
    */

    const sales =
        accSection('sales');

    const salesButton =
        sales?.querySelector(
            '.section-title .btn-primary'
        );

    if (salesButton) {

        salesButton.addEventListener(
            'click',
            () => {
                location.href =
                    'pos.html';
            }
        );
    }


    const salesSearch =
        sales?.querySelector(
            'input'
        );

    if (salesSearch) {

        salesSearch.addEventListener(
            'input',
            renderAccountingSales
        );
    }


    const salesFilter =
        sales?.querySelector(
            'select'
        );

    if (salesFilter) {

        /*
           تحويل القيم المكتوبة بالعربي
           لقيم نظامية
        */

        const options =
            salesFilter.options;

        if (options[0]) {
            options[0].value = '';
        }

        if (options[1]) {
            options[1].value =
                'cash';
        }

        if (options[2]) {
            options[2].value =
                'card';
        }

        salesFilter.addEventListener(
            'change',
            renderAccountingSales
        );
    }


    /*
       Purchases
    */

    const purchaseButton =
        accSection('purchases')
            ?.querySelector(
                '.section-title .btn-primary'
            );

    purchaseButton
        ?.addEventListener(
            'click',
            addPurchase
        );


    /*
       Expenses
    */

    const expenseButton =
        accSection('expenses')
            ?.querySelector(
                '.section-title .btn-primary'
            );

    expenseButton
        ?.addEventListener(
            'click',
            addExpense
        );


    /*
       Customers
    */

    const customerButton =
        accSection('customers')
            ?.querySelector(
                '.section-title .btn-primary'
            );

    customerButton
        ?.addEventListener(
            'click',
            addCustomer
        );


    /*
       Suppliers
    */

    const supplierButton =
        accSection('suppliers')
            ?.querySelector(
                '.section-title .btn-primary'
            );

    supplierButton
        ?.addEventListener(
            'click',
            addSupplier
        );


    /*
       Inventory
    */

    const inventoryButton =
        accSection('inventory')
            ?.querySelector(
                '.section-title .btn-primary'
            );

    inventoryButton
        ?.addEventListener(
            'click',
            addInventoryItem
        );


    /*
       Cashbox Close/Open
    */

    const closeButton =
        accSection('cashbox')
            ?.querySelector(
                '.section-title .btn-primary'
            );

    closeButton
        ?.addEventListener(
            'click',
            toggleDayClosed
        );
}


/* =========================================================
   Realtime
========================================================= */

window.addEventListener(
    'ward:accounting',
    renderAccounting
);


/* =========================================================
   Start
========================================================= */

window.addEventListener(
    'DOMContentLoaded',
    () => {

        bindAccountingButtons();

        openAccountingPage(
            'dashboard'
        );

        if (
            typeof startAccountingRealtime ===
            'function'
        ) {
            startAccountingRealtime();
        }

        renderAccounting();
    }
);