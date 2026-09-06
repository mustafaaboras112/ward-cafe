let selectedTable = null;
let paymentBusy = false;
let orderBusy = false;
let lastReceipt = null;
let posView = 'tables';
let posCategory = '';
let posDrafts = {};

const posCategories = {
    hot: 'مشروبات ساخنة',
    cold: 'مشروبات باردة',
    sweets: 'حلويات',
    food: 'مأكولات'
};

const posEl = id => document.getElementById(id);
const posMoney = value => Number(value || 0).toFixed(2);
const posBusy = () => paymentBusy || orderBusy;

function posDraft(table = selectedTable) {
    return posDrafts[String(table)]?.items || [];
}

function posDraftTotal() {
    return posDraft().reduce(
        (sum, item) => sum + item.price * item.qty,
        0
    );
}

function payableOrders(table) {
    return getOrders().filter(
        order =>
            String(order.table) === String(table) &&
            order.paymentStatus !== 'مدفوع'
    );
}

function posTotal() {
    return Math.round(
        payableOrders(selectedTable).reduce(
            (sum, order) => sum + Number(order.total),
            0
        ) * 100
    ) / 100;
}

function persistPosDrafts() {
    try {
        sessionStorage.setItem(
            'ward-pos-drafts',
            JSON.stringify(posDrafts)
        );

        return true;
    } catch {
        posEl('pos-feedback').textContent =
            'السلة موجودة في هذه الشاشة، لكن تعذر حفظها على الجهاز. لا تغلق الصفحة.';

        return false;
    }
}

function selectPosTable(table) {
    if (posBusy()) return;

    selectedTable = String(table);
    lastReceipt = null;
    posView = 'menu';

    posEl('pos-feedback').textContent = '';
    posEl('pos-received').value = '';

    renderPos();
}

function showPosView(view) {
    if (posBusy()) return;

    posView = view;
    renderPos();
}

function setPosMethod(method) {
    if (
        posBusy() ||
        !['cash', 'card'].includes(method)
    ) return;

    posEl('pos-method').value = method;

    updatePosChange();
}


/* =========================
   حالة الدفع
========================= */

async function changePosPaymentState(change) {

    if (!firebaseDatabase) {
        return changeCafeState(change);
    }

    const ref = firebaseDatabase.ref();
    let onValue;

    try {

        await new Promise((resolve, reject) => {

            onValue = () => resolve();

            ref.on(
                'value',
                onValue,
                reject
            );

        });

        return await changeCafeState(change);

    } finally {

        if (onValue) {
            ref.off(
                'value',
                onValue
            );
        }

    }
}


/* =========================
   تحصيل الطاولة
========================= */

async function collectTablePayment(
    table,
    tendered,
    method,
    expectedOrders
) {

    if (
        !validTable(table) ||
        !['cash', 'card'].includes(method)
    ) {
        throw new Error(
            'اختر الطاولة وطريقة الدفع.'
        );
    }

    const paidAt = Date.now();

    let receipt;


    await changePosPaymentState(state => {

        state.orders ||= {};
        state.tables ||= {};
        state.accounting ||= {};
        state.accounting.sales ||= {};


        /* =========================
           جلب طلبات الطاولة
        ========================= */

        const entries =
            Object.entries(
                state.orders
            ).filter(
                ([, order]) =>
                    String(order.table) === String(table) &&
                    order.paymentStatus !== 'مدفوع'
            );


        const orders =
            entries.map(
                ([, order]) => order
            );


        if (!orders.length) {
            throw new Error(
                'لا توجد طلبات غير مدفوعة لهذه الطاولة.'
            );
        }


        /* =========================
           التحقق من تحديث الحساب
        ========================= */

        if (
            expectedOrders &&
            (
                entries.length !== expectedOrders.length ||

                entries.some(
                    ([key, order]) =>
                        !expectedOrders.some(
                            expected =>
                                String(expected.firebaseKey) === String(key) &&
                                Number(expected.total) === Number(order.total)
                        )
                )
            )
        ) {
            throw new Error(
                'تغيّرت طلبات الطاولة أو إجماليها. راجع الفاتورة المحدثة ثم أكد الدفع مجدداً.'
            );
        }


        /* =========================
           يجب توصيل الطلب
        ========================= */

        if (
            orders.some(
                order =>
                    order.status !== 'تم التوصيل'
            )
        ) {

            throw new Error(
                'يجب توصيل جميع طلبات الطاولة قبل تحصيل الحساب.'
            );

        }


        /* =========================
           التحقق من البيانات
        ========================= */

        if (
            orders.some(
                order =>
                    !Number.isFinite(
                        Number(order.total)
                    ) ||
                    Number(order.total) < 0 ||
                    !Array.isArray(order.items)
            )
        ) {

            throw new Error(
                'بيانات أحد الطلبات غير صالحة. راجع الفاتورة قبل الدفع.'
            );

        }


        /* =========================
           الإجمالي
        ========================= */

        const total =
            Math.round(
                orders.reduce(
                    (sum, order) =>
                        sum +
                        Number(order.total),
                    0
                ) * 100
            ) / 100;


        if (
            !Number.isFinite(total) ||
            total < 0
        ) {

            throw new Error(
                'إجمالي غير صالح.'
            );

        }


        /* =========================
           التحقق من النقد
        ========================= */

        if (
            method === 'cash' &&
            (
                !Number.isFinite(tendered) ||
                tendered < total
            )
        ) {

            throw new Error(
                'المبلغ المستلم أقل من إجمالي الفاتورة.'
            );

        }


        const saleIds = new Set();


        /* =========================
           تجهيز الطلبات
        ========================= */

        const normalized =
            entries.map(
                ([key, order]) => {

                    const identity =
                        getOrderIdentity(
                            order,
                            key
                        );


                    if (
                        !identity.orderId ||
                        /[.#$\[\]\/]/.test(
                            identity.orderId
                        )
                    ) {

                        throw new Error(
                            'معرف طلب غير صالح لتسجيل البيع.'
                        );

                    }


                    if (
                        saleIds.has(
                            identity.orderId
                        )
                    ) {

                        throw new Error(
                            'يوجد طلب مكرر في الحساب.'
                        );

                    }


                    if (
                        state.accounting.sales[
                            identity.orderId
                        ]
                    ) {

                        throw new Error(
                            'يوجد سجل بيع سابق لهذا الطلب. راجع الحساب لمنع تكرار الدفع.'
                        );

                    }


                    saleIds.add(
                        identity.orderId
                    );


                    return {
                        order,
                        ...identity
                    };

                }
            );


        /* =========================
           تسجيل الدفع والمبيعات
        ========================= */

        normalized.forEach(
            ({
                order,
                orderId
            }) => {

                order.paymentStatus =
                    'مدفوع';

                order.paidAt =
                    paidAt;

                order.paymentMethod =
                    method;


                state.accounting.sales[
                    orderId
                ] = {

                    id: orderId,

                    orderId,

                    table:
                        order.table,

                    total:
                        Number(
                            order.total
                        ),

                    paidAt,

                    time:
                        formatWardDateTime(
                            paidAt
                        ),

                    paymentMethod:
                        method,

                    items:
                        order.items

                };

            }
        );


        /* =========================
           تحرير الطاولة
        ========================= */

        delete state.tables[
            String(table)
        ];


        /* =========================
           إنشاء الإيصال
        ========================= */

        receipt = {

            table,

            total,

            method,

            paidAt,

            orders:
                normalized.map(
                    ({
                        order,
                        orderId,
                        firebaseKey
                    }) => ({
                        ...order,
                        id: orderId,
                        firebaseKey
                    })
                ),

            received:
                method === 'cash'
                    ? tendered
                    : total,

            change:
                method === 'cash'
                    ? Math.round(
                        (
                            tendered -
                            total
                        ) * 100
                    ) / 100
                    : 0

        };

    });


    return receipt;
}


/* =========================
   الأصناف
========================= */

function renderPosCatalog() {

    const menu = getMenu();

    const categories = [
        ...new Set(
            menu
                .map(item => item.category)
                .filter(Boolean)
        )
    ];


    if (
        posCategory &&
        !categories.includes(posCategory)
    ) {
        posCategory = '';
    }


    const tabs =
        posEl('pos-categories');

    tabs.replaceChildren();


    for (
        const category
        of ['', ...categories]
    ) {

        const button =
            document.createElement(
                'button'
            );

        button.type =
            'button';


        button.textContent =
            category
                ? posCategories[
                    category
                ] || category
                : 'الكل';


        button.setAttribute(
            'aria-pressed',
            String(
                posCategory ===
                category
            )
        );


        button.addEventListener(
            'click',
            () => {

                posCategory =
                    category;

                renderPosCatalog();

            }
        );


        tabs.append(
            button
        );

    }


    const query =
        posEl('pos-search')
            .value
            .trim()
            .toLocaleLowerCase('ar');


    const visible =
        menu.filter(
            item =>
                (
                    !posCategory ||
                    item.category ===
                    posCategory
                ) &&
                String(item.name)
                    .toLocaleLowerCase(
                        'ar'
                    )
                    .includes(query)
        );


    visible.sort(
        (a, b) =>
            categories.indexOf(
                a.category
            ) -
            categories.indexOf(
                b.category
            )
    );


    const grid =
        posEl('pos-products');

    grid.replaceChildren();


    for (
        const item
        of visible
    ) {

        const button =
            document.createElement(
                'button'
            );

        button.type =
            'button';

        button.className =
            'pos-product';


        const unavailable =
            item.available === false ||
            !Number.isFinite(
                Number(item.price)
            ) ||
            Number(item.price) < 0;


        button.disabled =
            posBusy() ||
            unavailable;


        const image =
            document.createElement(
                'img'
            );

        image.alt = '';
        image.loading = 'lazy';


        image.addEventListener(
            'error',
            () => {
                image.src = 'q.png';
            },
            { once: true }
        );


        try {

            const url =
                new URL(
                    item.img ||
                    'q.png',
                    window.location.href
                );


            image.src =
                ['https:', 'http:']
                    .includes(
                        url.protocol
                    )
                    ? url.href
                    : 'q.png';

        } catch {

            image.src =
                'q.png';

        }


        const name =
            document.createElement(
                'strong'
            );

        name.textContent =
            item.name;


        const price =
            document.createElement(
                'span'
            );

        price.textContent =
            unavailable
                ? 'غير متاح'
                : posMoney(
                    item.price
                ) +
                ' ليرة';


        const plus =
            document.createElement(
                'b'
            );

        plus.textContent =
            '+';

        price.append(
            plus
        );


        button.append(
            image,
            name,
            price
        );


        button.addEventListener(
            'click',
            () =>
                addPosItem(
                    item.id
                )
        );


        grid.append(
            button
        );

    }


    if (!visible.length) {

        const empty =
            document.createElement(
                'p'
            );

        empty.className =
            'pos-empty';

        empty.textContent =
            'لا توجد أصناف مطابقة.';

        grid.append(
            empty
        );

    }


    posEl(
        'pos-product-count'
    ).textContent =
        visible.length +
        ' صنف';

}


/* =========================
   إضافة صنف
========================= */

function addPosItem(id) {

    if (posBusy()) return;


    if (!selectedTable) {

        posEl(
            'pos-feedback'
        ).textContent =
            'اختر طاولة أولًا لإضافة الأصناف.';

        showPosView(
            'tables'
        );

        return;

    }


    const item =
        getMenu().find(
            row =>
                String(row.id) ===
                String(id)
        );


    if (
        !item ||
        item.available === false ||
        !Number.isFinite(
            Number(item.price)
        ) ||
        Number(item.price) < 0
    ) return;


    const draft =
        posDrafts[
            selectedTable
        ] ||= {

            id:
                crypto.randomUUID(),

            items: []

        };


    const line =
        draft.items.find(
            row =>
                String(row.id) ===
                String(id)
        );


    if (line) {

        line.qty++;

    } else {

        draft.items.push({

            id:
                String(item.id),

            name:
                item.name,

            price:
                Number(
                    item.price
                ),

            qty:
                1

        });

    }


    persistPosDrafts();

    renderPos();

}


/* =========================
   تغيير الكمية
========================= */

function changePosQuantity(
    id,
    change
) {

    if (posBusy()) return;


    const draft =
        posDrafts[
            selectedTable
        ];


    if (!draft) return;


    const line =
        draft.items.find(
            row =>
                row.id ===
                String(id)
        );


    if (!line) return;


    if (change === 0) {

        draft.items =
            draft.items.filter(
                row =>
                    row !== line
            );

    } else {

        line.qty +=
            change;


        if (
            line.qty <= 0
        ) {

            draft.items =
                draft.items.filter(
                    row =>
                        row !== line
                );

        }

    }


    if (
        !draft.items.length
    ) {

        delete posDrafts[
            selectedTable
        ];

    }


    persistPosDrafts();

    renderPos();

}


/* =========================
   إلغاء السلة
========================= */

function cancelPosDraft() {

    if (
        posBusy() ||
        !posDraft().length
    ) return;


    if (
        !confirm(
            'إلغاء الأصناف الجديدة غير المرسلة لهذه الطاولة؟'
        )
    ) return;


    delete posDrafts[
        selectedTable
    ];


    persistPosDrafts();

    renderPos();


    posEl(
        'pos-feedback'
    ).textContent =
        'تم إلغاء السلة غير المرسلة.';

}


/* =========================
   تعليق الحساب
========================= */

function holdPosAccount() {

    if (
        posBusy() ||
        !selectedTable
    ) return;


    if (
        !persistPosDrafts()
    ) return;


    selectedTable =
        null;

    lastReceipt =
        null;

    posView =
        'tables';


    renderPos();


    posEl(
        'pos-feedback'
    ).textContent =
        'تم تعليق الحساب. اختر الطاولة لاستكماله على هذا الجهاز.';

}


/* =========================
   إرسال الطلب للمطبخ
========================= */

async function sendPosOrder() {

    if (
        posBusy() ||
        !validTable(
            selectedTable
        ) ||
        !posDraft().length
    ) return;


    const table =
        selectedTable;


    const draft =
        JSON.parse(
            JSON.stringify(
                posDrafts[
                    table
                ]
            )
        );


    const createdAt =
        Date.now();


    const clientId =
        customerId();


    orderBusy =
        true;


    renderPos();


    posEl(
        'pos-feedback'
    ).textContent =
        'جاري إرسال الطلب…';


    try {

        await changeCafeState(
            state => {

                state.orders ||= {};
                state.tables ||= {};


                if (
                    state.orders[
                        draft.id
                    ]
                ) return;


                const menu =
                    state.menu
                        ? Object.entries(
                            state.menu
                        ).map(
                            ([id, item]) => ({
                                ...item,
                                id
                            })
                        )
                        : getMenu();


                const items =
                    draft.items.map(
                        line => {

                            const item =
                                menu.find(
                                    item =>
                                        String(
                                            item.id
                                        ) ===
                                        line.id
                                );


                            if (
                                !item ||
                                item.available === false ||
                                !Number.isInteger(
                                    line.qty
                                ) ||
                                line.qty < 1 ||
                                !Number.isFinite(
                                    Number(
                                        item.price
                                    )
                                )
                            ) {

                                throw new Error(
                                    'أحد الأصناف لم يعد متاحًا. راجع السلة.'
                                );

                            }


                            return {

                                id:
                                    line.id,

                                name:
                                    item.name,

                                price:
                                    Number(
                                        item.price
                                    ),

                                qty:
                                    line.qty

                            };

                        }
                    );


                const reserved =
                    state.tables[
                        table
                    ];


                const owner =
                    reserved?.clientId ||
                    clientId;


                state.orders[
                    draft.id
                ] = {

                    id:
                        draft.id,

                    clientId:
                        owner,

                    table,

                    items,

                    total:
                        Math.round(
                            items.reduce(
                                (
                                    sum,
                                    item
                                ) =>
                                    sum +
                                    item.price *
                                    item.qty,
                                0
                            ) *
                            100
                        ) / 100,

                    status:
                        'قيد التحضير',

                    paymentStatus:
                        'غير مدفوع',

                    createdAt,

                    time:
                        formatWardDateTime(
                            createdAt
                        )

                };


                state.tables[
                    table
                ] = {

                    ...reserved,

                    status:
                        'occupied',

                    table,

                    orderId:
                        reserved?.orderId ||
                        draft.id,

                    clientId:
                        owner,

                    reservedAt:
                        reserved?.reservedAt ||
                        createdAt

                };

            }
        );


        delete posDrafts[
            table
        ];


        persistPosDrafts();


        posEl(
            'pos-feedback'
        ).textContent =
            'تم إرسال الطلب للمطبخ. التحصيل بعد تأكيد التوصيل.';


    } catch (error) {

        posEl(
            'pos-feedback'
        ).textContent =
            'لم يُرسل الطلب: ' +
            (
                error.message ||
                'تحقق من الاتصال ثم أعد المحاولة.'
            );

    } finally {

        orderBusy =
            false;

        renderPos();

    }

}


/* =========================
   سطر الفاتورة
========================= */

function appendPosLine(
    item,
    editable
) {

    const line =
        document.createElement(
            'div'
        );

    line.className =
        'pos-line' +
        (
            editable
                ? ' is-draft'
                : ''
        );


    const info =
        document.createElement(
            'div'
        );


    const name =
        document.createElement(
            'strong'
        );

    name.textContent =
        item.name;


    const unit =
        document.createElement(
            'small'
        );

    unit.textContent =
        posMoney(
            item.price
        ) +
        ' ليرة / الوحدة';


    info.append(
        name,
        unit
    );


    const quantity =
        document.createElement(
            'div'
        );

    quantity.className =
        'pos-quantity';


    if (editable) {

        const minus =
            document.createElement(
                'button'
            );

        minus.type =
            'button';

        minus.textContent =
            '−';

        minus.addEventListener(
            'click',
            () =>
                changePosQuantity(
                    item.id,
                    -1
                )
        );


        quantity.append(
            minus
        );

    }


    const count =
        document.createElement(
            'span'
        );

    count.textContent =
        item.qty;


    quantity.append(
        count
    );


    if (editable) {

        const plus =
            document.createElement(
                'button'
            );

        plus.type =
            'button';

        plus.textContent =
            '+';

        plus.addEventListener(
            'click',
            () =>
                changePosQuantity(
                    item.id,
                    1
                )
        );


        quantity.append(
            plus
        );

    }


    const total =
        document.createElement(
            'b'
        );

    total.textContent =
        posMoney(
            item.price *
            item.qty
        );


    line.append(
        info,
        quantity,
        total
    );


    posEl(
        'pos-items'
    ).append(
        line
    );

}


/* =========================
   عرض الكاشير
========================= */

function renderPos() {

    const list =
        posEl(
            'pos-tables'
        );

    list.replaceChildren();


    for (
        let number = 1;
        number <= TABLE_COUNT;
        number++
    ) {

        const table =
            String(number);

        const orders =
            payableOrders(
                table
            );

        const reserved =
            getLocalTableStatus(
                table
            );


        const ready =
            orders.length > 0 &&
            orders.every(
                order =>
                    order.status ===
                    'تم التوصيل'
            ) &&
            !posDraft(
                table
            ).length;


        const occupied =
            orders.length > 0 ||
            reserved?.status ===
            'occupied' ||
            posDraft(
                table
            ).length > 0;


        const status =
            ready
                ? 'ready'
                : occupied
                    ? 'occupied'
                    : 'empty';


        const button =
            document.createElement(
                'button'
            );

        button.type =
            'button';

        button.className =
            'pos-table ' +
            status;


        const name =
            document.createElement(
                'strong'
            );

        name.textContent =
            'طاولة ' +
            table;


        const label =
            document.createElement(
                'span'
            );

        label.textContent =
            ready
                ? 'جاهزة للدفع'
                : occupied
                    ? 'مشغولة'
                    : 'فارغة';


        const amount =
            document.createElement(
                'small'
            );


        amount.textContent =
            orders.length
                ? posMoney(
                    orders.reduce(
                        (
                            sum,
                            order
                        ) =>
                            sum +
                            Number(
                                order.total
                            ),
                        0
                    )
                ) +
                ' ليرة'
                : 'فتح حساب';


        button.append(
            name,
            label,
            amount
        );


        button.addEventListener(
            'click',
            () =>
                selectPosTable(
                    table
                )
        );


        list.append(
            button
        );

    }


    const orders =
        payableOrders(
            selectedTable
        );


    const draft =
        posDraft();


    const shownOrders =
        orders.length
            ? orders
            : (
                lastReceipt?.orders ||
                []
            );


    posEl(
        'pos-title'
    ).textContent =
        selectedTable
            ? `حساب الطاولة ${selectedTable}`
            : lastReceipt
                ? `فاتورة مدفوعة · طاولة ${lastReceipt.table}`
                : 'لم تُحدَّد طاولة';


    posEl(
        'pos-header-table'
    ).textContent =
        selectedTable
            ? 'طاولة ' +
            selectedTable
            : lastReceipt
                ? 'طاولة ' +
                lastReceipt.table
                : 'اختر طاولة';


    posEl(
        'pos-items'
    ).replaceChildren();


    for (
        const order
        of shownOrders
    ) {

        for (
            const item
            of order.items ||
            []
        ) {

            appendPosLine(
                item,
                false
            );

        }

    }


    if (
        draft.length
    ) {

        draft.forEach(
            item =>
                appendPosLine(
                    item,
                    true
                )
        );

    }


    posEl(
        'pos-total'
    ).textContent =
        posMoney(
            (
                lastReceipt?.total ||
                posTotal()
            ) +
            posDraftTotal()
        );


    posEl(
        'pos-payment'
    ).hidden =
        !!lastReceipt ||
        !!draft.length;


    posEl(
        'pos-send'
    ).hidden =
        !draft.length;


    posEl(
        'pos-send'
    ).disabled =
        posBusy();


    posEl(
        'pos-print'
    ).disabled =
        posBusy() ||
        !shownOrders.length ||
        !!draft.length;


    posEl(
        'pos-hold'
    ).disabled =
        posBusy() ||
        !selectedTable;


    posEl(
        'pos-cancel'
    ).disabled =
        posBusy() ||
        !draft.length;


    updatePosChange();

    renderPosCatalog();

}


/* =========================
   حساب الباقي
========================= */

function updatePosChange() {

    const total =
        posTotal();


    const orders =
        payableOrders(
            selectedTable
        );


    const received =
        Number(
            posEl(
                'pos-received'
            ).value
        );


    const card =
        posEl(
            'pos-method'
        ).value ===
        'card';


    const ready =
        !!orders.length &&
        orders.every(
            order =>
                order.status ===
                'تم التوصيل'
        ) &&
        !posDraft().length;


    posEl(
        'pos-received'
    ).disabled =
        posBusy() ||
        card ||
        !ready;


    posEl(
        'pos-method'
    ).disabled =
        posBusy();


    posEl(
        'pos-exact'
    ).disabled =
        posBusy() ||
        card ||
        !ready;


    for (
        const method
        of ['cash', 'card']
    ) {

        posEl(
            'pos-' +
            method
        ).disabled =
            posBusy();

    }


    posEl(
        'pos-change'
    ).textContent =
        lastReceipt
            ? posMoney(
                lastReceipt.change
            ) +
            ' ليرة'
            : card
                ? '0.00 ليرة'
                : posMoney(
                    Math.max(
                        0,
                        received -
                        total
                    )
                ) +
                ' ليرة';


    const sufficient =
        card ||
        (
            posEl(
                'pos-received'
            ).value.trim() !== '' &&
            Number.isFinite(
                received
            ) &&
            received >= total
        );


    posEl(
        'pos-pay'
    ).disabled =
        posBusy() ||
        !ready ||
        !sufficient;


    posEl(
        'pos-pay'
    ).textContent =
        paymentBusy
            ? 'جاري حفظ الدفع…'
            : 'تأكيد الدفع · F9';

}


/* =========================
   زر تأكيد الدفع
========================= */

async function paySelectedTable(
    event
) {

    event?.preventDefault();


    if (
        posBusy() ||
        !selectedTable ||
        posDraft().length ||
        posEl(
            'pos-pay'
        ).disabled
    ) return;


    const table =
        selectedTable;


    const received =
        Number(
            posEl(
                'pos-received'
            ).value
        );


    const method =
        posEl(
            'pos-method'
        ).value;


    const expectedOrders =
        payableOrders(
            table
        ).map(
            order => ({
                ...getOrderIdentity(
                    order
                ),
                total:
                    order.total
            })
        );


    posEl(
        'pos-feedback'
    ).textContent = '';


    paymentBusy =
        true;


    try {

        renderPos();


        const receipt =
            await collectTablePayment(
                table,
                received,
                method,
                expectedOrders
            );


        lastReceipt =
            receipt;


        posEl(
            'pos-feedback'
        ).textContent =
            `✅ تم الدفع بنجاح وتسجيل البيع وتحرير الطاولة ${receipt.table}`;


        selectedTable =
            null;


    } catch (error) {

        console.error(
            'PAYMENT ERROR:',
            error
        );


        posEl(
            'pos-feedback'
        ).textContent =
            'لم يتم تأكيد الدفع: ' +
            (
                error.message ||
                'تعذر حفظ عملية الدفع.'
            );


    } finally {

        paymentBusy =
            false;

        renderPos();

    }

}


/* =========================
   F9
========================= */

function handlePosShortcut(
    event
) {

    if (
        event.key ===
        'F9'
    ) {

        event.preventDefault();


        if (
            !event.repeat &&
            !posEl(
                'pos-pay'
            ).disabled
        ) {

            paySelectedTable();

        }

    }

}


/* =========================
   الأحداث
========================= */

window.addEventListener(
    'ward:orders',
    renderPos
);

window.addEventListener(
    'ward:tables',
    renderPos
);

window.addEventListener(
    'ward:menu',
    renderPosCatalog
);


window.addEventListener(
    'DOMContentLoaded',
    () => {

        try {

            const saved =
                JSON.parse(
                    sessionStorage.getItem(
                        'ward-pos-drafts'
                    ) ||
                    '{}'
                );


            for (
                const [
                    table,
                    draft
                ]
                of Object.entries(
                    saved ||
                    {}
                )
            ) {

                if (
                    validTable(
                        table
                    ) &&
                    typeof draft?.id ===
                    'string' &&
                    Array.isArray(
                        draft.items
                    )
                ) {

                    posDrafts[
                        table
                    ] =
                        draft;

                }

            }

        } catch {

            console.warn(
                'تعذر استعادة السلة.'
            );

        }


        posEl(
            'pos-payment'
        ).addEventListener(
            'submit',
            paySelectedTable
        );


        posEl(
            'pos-received'
        ).addEventListener(
            'input',
            updatePosChange
        );


        posEl(
            'pos-method'
        ).addEventListener(
            'change',
            updatePosChange
        );


        posEl(
            'pos-cash'
        ).addEventListener(
            'click',
            () =>
                setPosMethod(
                    'cash'
                )
        );


        posEl(
            'pos-card'
        ).addEventListener(
            'click',
            () =>
                setPosMethod(
                    'card'
                )
        );


        posEl(
            'pos-exact'
        ).addEventListener(
            'click',
            () => {

                if (
                    posBusy()
                ) return;


                posEl(
                    'pos-received'
                ).value =
                    posMoney(
                        posTotal()
                    );


                updatePosChange();

            }
        );


        posEl(
            'pos-print'
        ).addEventListener(
            'click',
            () => {

                if (
                    !posEl(
                        'pos-print'
                    ).disabled
                ) {

                    window.print();

                }

            }
        );


        posEl(
            'pos-show-tables'
        ).addEventListener(
            'click',
            () =>
                showPosView(
                    'tables'
                )
        );


        posEl(
            'pos-back-tables'
        ).addEventListener(
            'click',
            () =>
                showPosView(
                    'tables'
                )
        );


        posEl(
            'pos-show-menu'
        ).addEventListener(
            'click',
            () =>
                showPosView(
                    'menu'
                )
        );


        posEl(
            'pos-search'
        ).addEventListener(
            'input',
            renderPosCatalog
        );


        posEl(
            'pos-send'
        ).addEventListener(
            'click',
            sendPosOrder
        );


        posEl(
            'pos-hold'
        ).addEventListener(
            'click',
            holdPosAccount
        );


        posEl(
            'pos-cancel'
        ).addEventListener(
            'click',
            cancelPosDraft
        );


        document.addEventListener(
            'keydown',
            handlePosShortcut
        );


        const updateClock =
            () => {

                posEl(
                    'pos-clock'
                ).textContent =
                    new Intl.DateTimeFormat(
                        'ar',
                        {
                            hour:
                                '2-digit',

                            minute:
                                '2-digit'
                        }
                    ).format(
                        new Date()
                    );

            };


        updateClock();


        window.setInterval(
            updateClock,
            30000
        );


        startMenuRealtime();

        startTablesRealtime();

        startOrdersRealtime();

        renderPos();

    }
);