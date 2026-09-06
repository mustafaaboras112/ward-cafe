const defaultMenu = [
    { id: 1, name: 'قهوة تركية ورد', category: 'hot', price: 40, desc: 'قهوة أصيلة ساخنة برغوة غنية', img: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=500&q=80' },
    { id: 2, name: 'لاتيه كافيه ورد', category: 'hot', price: 60, desc: 'إسبريسو مع حليب ناعم', img: 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?auto=format&fit=crop&w=500&q=80' },
    { id: 3, name: 'موهيتو بيري', category: 'cold', price: 75, desc: 'نكهة التوت المنعشة مع الصودا والنعناع', img: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80' },
    { id: 4, name: 'تشيز كيك الفراولة', category: 'sweets', price: 90, desc: 'تشيز كيك فاخر مع صوص الفراولة الطازج', img: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=500&q=80' },
    { id: 5, name: 'ساندويش دجاج ورد', category: 'food', price: 120, desc: 'دجاج مشوي مع خضار وصوص خاص', img: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=500&q=80' },
    { id: 6, name: 'برغر كافيه ورد', category: 'food', price: 150, desc: 'برغر لحم طازج مع الجبن والبطاطا', img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80' },
    { id: 7, name: 'طبق فطور شرقي', category: 'food', price: 135, desc: 'بيض وجبن وزيتون وخضار طازجة', img: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=500&q=80' }
];

const STAFF_ACCESS_CODE = '1234';
const TABLE_COUNT = 20;

function validTable(table) {
    return /^(?:[1-9]|1[0-9]|20)$/.test(String(table));
}

function customerId() {
    let id = sessionStorage.getItem('ward-client-id');

    if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem('ward-client-id', id);
    }

    return id;
}

// A single transaction keeps reservations, orders and paid sales consistent.
// With Firebase configured, failures are surfaced; no local success is fabricated.
async function changeCafeState(change) {
    if (firebaseConfigured && !firebaseDatabase) {
        throw new Error('تعذر تحميل اتصال Firebase. تحقق من الإنترنت وأعد فتح الصفحة.');
    }

    if (firebaseDatabase) {
        const ref = firebaseDatabase.ref();

        await ref.once('value');

        let failure;

        const result = await ref.transaction(current => {
            failure = null;

            const state = current || {};

            state.orders ||= {};
            state.tables ||= {};
            state.accounting ||= {};

            try {
                change(state);
                return state;
            } catch (error) {
                failure = error;
                return undefined;
            }

        }, undefined, false);

        if (!result.committed) {
            throw failure || new Error('تعذر حفظ العملية، أعد المحاولة.');
        }

        return;
    }

    const perform = () => {

        const state = {
            orders: Object.fromEntries(
                readLocalOrders().map(order => [
                    String(order.id),
                    order
                ])
            ),

            tables: {},

            accounting: {
                dayClosed: getAccountingData().dayClosed,

                sales: Object.fromEntries(
                    getAccountingData().sales.map(sale => [
                        String(sale.orderId || sale.id),
                        sale
                    ])
                )
            }
        };

        for (let n = 1; n <= TABLE_COUNT; n++) {

            const table = getLocalTableStatus(n);

            if (table) {
                state.tables[n] = table;
            }
        }

        change(state);

        localStorage.setItem(
            'cafe_ward_orders',
            JSON.stringify(Object.values(state.orders))
        );

        localStorage.setItem(
            'cafe_ward_sales',
            JSON.stringify(
                Object.values(state.accounting.sales || {})
            )
        );

        for (let n = 1; n <= TABLE_COUNT; n++) {

            if (state.tables[n]) {
                setLocalTableStatus(n, state.tables[n]);
            } else {
                clearLocalTableStatus(n);
            }
        }

        renderAllOrderScreens();
        updateTableSelectorUI();

        window.dispatchEvent(
            new Event('ward:accounting')
        );
    };

    if (navigator.locks) {
        return navigator.locks.request(
            'ward-state',
            perform
        );
    }

    return perform();
}

function openTableOrders(state, table) {
    return Object.values(state.orders || {})
        .filter(order =>
            String(order.table) === String(table) &&
            order.paymentStatus !== 'مدفوع'
        );
}

async function submitOrder(table, items) {

    if (!validTable(table) || !items.length) {
        throw new Error(
            'اختر طاولة وأضف أصنافاً أولاً.'
        );
    }

    const id = crypto.randomUUID();
    const owner = customerId();
    const now = Date.now();

    let submitted;

    await changeCafeState(state => {

        const reserved = state.tables[table];

        if (
            reserved?.status === 'occupied' &&
            reserved.clientId !== owner
        ) {
            throw new Error(
                'الطاولة محجوزة، اختر طاولة أخرى.'
            );
        }

        const menu = state.menu
            ? Object.entries(state.menu)
                .map(([id, item]) => ({
                    ...item,
                    id
                }))
            : getMenu();

        const lines = items.map(item => {

            const product = menu.find(product =>
                String(product.id) === String(item.id)
            );

            if (
                !product ||
                product.available === false ||
                !Number.isInteger(item.qty) ||
                item.qty < 1 ||
                !Number.isFinite(Number(product.price)) ||
                Number(product.price) < 0
            ) {
                throw new Error(
                    'أحد الأصناف لم يعد متاحاً أو كميته غير صحيحة.'
                );
            }

            return {
                id: String(product.id),
                name: product.name,
                price: Number(product.price),
                qty: item.qty
            };
        });

        submitted = {
            id,
            clientId: owner,
            table: String(table),
            items: lines,

            total: Math.round(
                lines.reduce(
                    (sum, item) =>
                        sum + item.price * item.qty,
                    0
                ) * 100
            ) / 100,

            status: 'قيد التحضير',
            paymentStatus: 'غير مدفوع',
            createdAt: now,
            time: formatWardDateTime(now)
        };

        state.orders[id] = submitted;

        state.tables[table] = {
            status: 'occupied',
            table: String(table),
            orderId: id,
            clientId: owner,
            reservedAt:
                reserved?.reservedAt || now
        };
    });

    return submitted;
}


/* =====================================================
   تغيير حالة الطلب
   قيد التحضير -> جاهز
   جاهز -> تم التوصيل

   التعديل هنا يمنع رسالة:
   "تغيّرت حالة الطلب، حدّث الشاشة"
   إذا نفس العملية تمت مسبقاً من جهاز آخر.
===================================================== */

async function transitionOrder(id, expected, next) {
    const allowed = {
        'قيد التحضير': 'جاهز',
        'جاهز': 'تم التوصيل'
    };

    if (allowed[expected] !== next) {
        throw new Error('انتقال حالة غير مسموح.');
    }

    const requestedId = String(id);
    let alreadyCompleted = false;

    await changeCafeState(state => {
        const orders = state.orders || {};

        /*
         * أولاً نحاول إيجاد الطلب باستخدام
         * مفتاح Firebase نفسه.
         */
        let orderKey = requestedId;
        let order = orders[orderKey];

        /*
         * إذا لم نجده:
         * بعض الطلبات قد يكون order.id فيها
         * مختلفاً عن المفتاح الموجود في Firebase.
         *
         * لذلك نبحث أيضاً داخل جميع الطلبات
         * باستخدام order.id.
         */
        if (!order) {
            const found = Object.entries(orders).find(
                ([key, item]) => {
                    return String(item?.id || key) === requestedId;
                }
            );

            if (found) {
                orderKey = found[0];
                order = found[1];
            }
        }

        /*
         * الطلب فعلاً غير موجود.
         */
        if (!order) {
            throw new Error(
                'تعذر العثور على الطلب. ستتحدث الشاشة تلقائياً.'
            );
        }

        /*
         * الطلب مدفوع ومغلق.
         */
        if (order.paymentStatus === 'مدفوع') {
            throw new Error(
                'تم إغلاق هذا الطلب بعد الدفع.'
            );
        }

        /*
         * إذا جهاز آخر سبق ونفذ نفس العملية:
         *
         * مثلاً المطبخ ضغط "جاهز"
         * وفي نفس اللحظة وصل تحديث Firebase.
         *
         * لا نعتبر هذا خطأ.
         */
        if (order.status === next) {
            alreadyCompleted = true;
            return;
        }

        /*
         * إذا الحالة أصبحت شيئاً مختلفاً فعلاً
         * فلا نسمح بانتقال غير صحيح.
         */
        if (order.status !== expected) {
            throw new Error(
                'تم تحديث حالة الطلب من جهاز آخر.'
            );
        }

        /*
         * تنفيذ تغيير الحالة.
         */
        order.status = next;

        /*
         * تسجيل وقت تغيير الحالة.
         */
        order[
            next === 'جاهز'
                ? 'readyAt'
                : 'deliveredAt'
        ] = Date.now();

        /*
         * إذا الطلب القديم لا يحتوي id داخلي،
         * نضيفه بدون تغيير مفتاح Firebase.
         */
        if (!order.id) {
            order.id = requestedId;
        }

        /*
         * نحفظ الطلب تحت مفتاحه الحقيقي
         * الموجود في Firebase.
         */
        state.orders[orderKey] = order;
    });

    return {
        alreadyCompleted
    };
}


async function moveTable(from, to) {

    if (
        !validTable(from) ||
        !validTable(to) ||
        String(from) === String(to)
    ) {
        throw new Error(
            'اختر طاولة أخرى بين 1 و20.'
        );
    }

    await changeCafeState(state => {

        if (!state.tables[from]) {
            throw new Error(
                'الطاولة الأصلية غير محجوزة.'
            );
        }

        if (
            state.tables[to]?.status === 'occupied' ||
            openTableOrders(state, to).length
        ) {
            throw new Error(
                'الطاولة المطلوبة مشغولة.'
            );
        }

        state.tables[to] = {
            ...state.tables[from],
            table: String(to)
        };

        delete state.tables[from];

        openTableOrders(
            state,
            from
        ).forEach(order => {

            order.table = String(to);
            order.movedAt = Date.now();
        });
    });
}


window.addEventListener(
    'storage',
    event => {

        if (
            !firebaseDatabase &&
            event.key?.startsWith(
                'cafe_ward_'
            )
        ) {

            renderAllOrderScreens();
            renderMenuViews();
            updateTableSelectorUI();

            window.dispatchEvent(
                new Event(
                    'ward:accounting'
                )
            );
        }
    }
);


window.addEventListener(
    'DOMContentLoaded',
    () => {

        initializeProtectedPage();
        addCafeNavigation();

        const splash =
            document.getElementById(
                'splash-screen'
            );

        if (splash) {

            createSplashPetals(splash);

            setTimeout(() => {

                splash.remove();

                document.body.classList.remove(
                    'menu-page-loading'
                );

            }, 1200);
        }

        createPetals();
    }
);


let liveMenu = null;
let menuRealtimeStarted = false;

let liveAccounting = {

    expenses: [],
    clients: [],
    suppliers: [],
    unpaid: [],
    sales: [],
    cashMovements: [],
    dayClosed: false
};

let accountingRealtimeStarted = false;

let liveOrders = [];
let ordersRealtimeStarted = false;


function initializeProtectedPage() {

    try {

        const pageName =
            window.location.pathname
                .split('/')
                .pop()
                .toLowerCase()
                .split('?')[0]
                .split('#')[0];

        const isProtectedPage =
            pageName === 'admin.html' ||
            pageName === 'accounting.html' ||
            pageName === 'pos.html';

        const isLoggedIn =
            sessionStorage.getItem(
                'isLoggedIn'
            ) === 'true';

        const legacyLogin =
            sessionStorage.getItem(
                'cafe_ward_staff_unlocked'
            ) === 'true';

        console.log(
            'حماية الصفحة:',
            {
                pageName,
                isProtectedPage,
                isLoggedIn,
                legacyLogin
            }
        );

        if (
            !isProtectedPage ||
            isLoggedIn ||
            legacyLogin
        ) {
            return;
        }

        document.body.classList.add(
            'page-locked'
        );


        const lockScreen =
            document.createElement(
                'div'
            );

        lockScreen.id =
            'access-lock';


        lockScreen.innerHTML = `

            <div
                class="access-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="access-title">

                <img
                    class="access-logo"
                    src="q.png"
                    alt="كافيه ورد">

                <div
                    class="access-icon">

                    <i
                        class="fa-solid fa-lock">
                    </i>

                </div>

                <h2
                    id="access-title">
                    الصفحة محمية
                </h2>

                <p>
                    أدخل رمز الموظفين للوصول إلى هذه الصفحة
                </p>

                <form
                    id="access-form">

                    <label
                        for="access-code">
                        رمز الدخول
                    </label>

                    <input
                        id="access-code"
                        type="password"
                        inputmode="numeric"
                        autocomplete="off"
                        required
                        autofocus>

                    <button
                        type="submit">
                        فتح الصفحة
                    </button>

                    <small
                        id="access-error"
                        role="alert">
                    </small>

                </form>

            </div>
        `;


        document.body.appendChild(
            lockScreen
        );

        console.log(
            'تم إنشاء شاشة القفل'
        );


        const form =
            document.getElementById(
                'access-form'
            );

        const codeInput =
            document.getElementById(
                'access-code'
            );

        const error =
            document.getElementById(
                'access-error'
            );


        if (
            !form ||
            !codeInput ||
            !error
        ) {

            console.error(
                'عناصر شاشة القفل غير موجودة'
            );

            return;
        }


        form.addEventListener(
            'submit',
            event => {

                event.preventDefault();

                try {

                    if (
                        codeInput.value ===
                        STAFF_ACCESS_CODE
                    ) {

                        console.log(
                            'الرمز صحيح!'
                        );

                        sessionStorage.setItem(
                            'isLoggedIn',
                            'true'
                        );

                        sessionStorage.setItem(
                            'cafe_ward_staff_unlocked',
                            'true'
                        );

                        document.body.classList.remove(
                            'page-locked'
                        );


                        if (
                            lockScreen &&
                            lockScreen.parentNode
                        ) {

                            console.log(
                                'إزالة شاشة القفل...'
                            );

                            lockScreen.remove();

                        } else {

                            console.warn(
                                'شاشة القفل غير موجودة أو تمت إزالتها مسبقاً'
                            );
                        }


                        console.log(
                            'تم فتح الصفحة بنجاح'
                        );

                        return;
                    }


                    console.log(
                        'الرمز غير صحيح'
                    );

                    error.textContent =
                        'رمز الدخول غير صحيح';

                    codeInput.value =
                        '';

                    codeInput.focus();


                } catch (e) {

                    console.error(
                        'خطأ في معالجة نموذج الدخول:',
                        e
                    );

                    error.textContent =
                        'حدث خطأ، حاول مرة أخرى';
                }
            }
        );


    } catch (e) {

        console.error(
            'خطأ في تهيئة شاشة الحماية:',
            e
        );
    }
}


function getMenu() {

    if (liveMenu) {
        return liveMenu;
    }

    const local =
        localStorage.getItem(
            'cafe_ward_menu'
        );

    return local
        ? JSON.parse(local)
        : defaultMenu;
}


function saveMenu(menu) {

    localStorage.setItem(
        'cafe_ward_menu',
        JSON.stringify(menu)
    );
}


function startMenuRealtime() {

    if (menuRealtimeStarted) {
        return;
    }

    menuRealtimeStarted = true;

    const menuRef =
        getFirebaseMenuRef();


    if (!menuRef) {

        showFirebaseSetupMessage();
        renderMenuViews();

        return;
    }


    menuRef.on(
        'value',
        snapshot => {

            if (!snapshot.exists()) {

                const initialMenu = {};

                defaultMenu.forEach(
                    item => {

                        initialMenu[
                            String(item.id)
                        ] = {
                            ...item,
                            createdAt:
                                Date.now()
                        };
                    }
                );


                // Only administration can initialize an empty menu.
                if (
                    document.getElementById(
                        'admin-menu-list'
                    )
                ) {

                    menuRef.set(
                        initialMenu
                    );

                } else {

                    liveMenu = [];
                    renderMenuViews();
                }

                return;
            }


            const data =
                snapshot.val();


            liveMenu =
                Object.entries(data)
                    .map(
                        ([key, item]) => ({
                            ...item,
                            id: key
                        })
                    );


            renderMenuViews();
        }
    );
}


function renderMenuViews() {

    window.dispatchEvent(
        new Event(
            'ward:menu'
        )
    );
}


function getAccountingData() {

    if (firebaseDatabase) {
        return liveAccounting;
    }

    return {

        expenses:
            JSON.parse(
                localStorage.getItem(
                    'cafe_ward_expenses'
                ) || '[]'
            ),

        clients:
            JSON.parse(
                localStorage.getItem(
                    'cafe_ward_clients'
                ) || '[]'
            ),

        suppliers:
            JSON.parse(
                localStorage.getItem(
                    'cafe_ward_suppliers'
                ) || '[]'
            ),

        unpaid:
            JSON.parse(
                localStorage.getItem(
                    'cafe_ward_unpaid'
                ) || '[]'
            ),

        sales:
            JSON.parse(
                localStorage.getItem(
                    'cafe_ward_sales'
                ) || '[]'
            ),

        cashMovements:
            JSON.parse(
                localStorage.getItem(
                    'cafe_ward_cash_mov'
                ) || '[]'
            ),

        dayClosed:
            localStorage.getItem(
                'cafe_ward_day_closed'
            ) === 'true'
    };
}


function startAccountingRealtime() {

    if (
        accountingRealtimeStarted
    ) {
        return;
    }

    accountingRealtimeStarted =
        true;


    const accountingRef =
        getFirebaseAccountingRef();


    if (!accountingRef) {

        window.dispatchEvent(
            new Event(
                'ward:accounting'
            )
        );

        return;
    }


    accountingRef.on(
        'value',
        snapshot => {

            const data =
                snapshot.val() || {};


            liveAccounting = {

                expenses:
                    Object.entries(
                        data.expenses || {}
                    ).map(
                        ([id, item]) => ({
                            ...item,
                            id
                        })
                    ),

                clients:
                    Object.entries(
                        data.clients || {}
                    ).map(
                        ([id, item]) => ({
                            ...item,
                            id
                        })
                    ),

                suppliers:
                    Object.entries(
                        data.suppliers || {}
                    ).map(
                        ([id, item]) => ({
                            ...item,
                            id
                        })
                    ),

                unpaid:
                    Object.entries(
                        data.unpaid || {}
                    ).map(
                        ([id, item]) => ({
                            ...item,
                            id
                        })
                    ),

                sales:
                    Object.entries(
                        data.sales || {}
                    ).map(
                        ([id, item]) => ({
                            ...item,
                            id
                        })
                    ),

                cashMovements:
                    Object.entries(
                        data.cashMovements || {}
                    ).map(
                        ([id, item]) => ({
                            ...item,
                            id
                        })
                    ),

                dayClosed:
                    data.dayClosed === true
            };


            window.dispatchEvent(
                new Event(
                    'ward:accounting'
                )
            );
        }
    );
}


async function saveAccountingRecord(
    collection,
    record
) {

    const createdAt =
        record.createdAt ||
        Date.now();


    const completeRecord = {
        ...record,
        createdAt,
        time:
            record.time ||
            formatWardDateTime(
                createdAt
            )
    };


    const ref =
        getFirebaseAccountingRef();


    if (ref) {

        return ref
            .child(collection)
            .push(
                completeRecord
            );
    }


    const records =
        getAccountingData()[
            collection
        ] || [];


    records.unshift({
        ...completeRecord,
        id: String(createdAt)
    });


    localStorage.setItem(
        `cafe_ward_${
            collection ===
            'cashMovements'
                ? 'cash_mov'
                : collection
        }`,
        JSON.stringify(records)
    );
}


async function removeAccountingRecord(
    collection,
    id
) {

    const ref =
        getFirebaseAccountingRef();


    if (ref) {

        return ref
            .child(collection)
            .child(String(id))
            .remove();
    }


    const records =
        (
            getAccountingData()[
                collection
            ] || []
        ).filter(
            item =>
                String(item.id) !==
                String(id)
        );


    localStorage.setItem(
        `cafe_ward_${
            collection ===
            'cashMovements'
                ? 'cash_mov'
                : collection
        }`,
        JSON.stringify(records)
    );
}


function readLocalOrders() {

    return JSON.parse(
        localStorage.getItem(
            'cafe_ward_orders'
        ) || '[]'
    );
}


function renderAllOrderScreens() {

    window.dispatchEvent(
        new Event(
            'ward:orders'
        )
    );
}


function getOrders() {

    return firebaseDatabase
        ? liveOrders
        : readLocalOrders();
}


function startOrdersRealtime() {

    if (ordersRealtimeStarted) {
        return;
    }

    ordersRealtimeStarted =
        true;


    const ordersRef =
        getFirebaseOrdersRef();


    if (!ordersRef) {

        showFirebaseSetupMessage();

        liveOrders =
            readLocalOrders();

        renderAllOrderScreens();

        return;
    }


    ordersRef.on(
        'value',
        snapshot => {

            liveOrders =
                Object.entries(
                    snapshot.val() || {}
                )
                    .map(
                        ([key, order]) => ({
                            ...order,
                            id:
                                order.id ||
                                key
                        })
                    )
                    .sort(
                        (
                            first,
                            second
                        ) =>
                            (
                                second.createdAt ||
                                0
                            ) -
                            (
                                first.createdAt ||
                                0
                            )
                    );


            renderAllOrderScreens();
        }
    );
}


function createPetals() {

    const container =
        document.createElement(
            'div'
        );

    container.className =
        'petals-container';

    document.body.appendChild(
        container
    );


    const petalsCount = 15;


    for (
        let i = 0;
        i < petalsCount;
        i++
    ) {

        const petal =
            document.createElement(
                'div'
            );

        petal.className =
            'petal';


        const size =
            Math.random() * 10 +
            10;


        petal.style.width =
            `${size}px`;

        petal.style.height =
            `${size * 1.4}px`;

        petal.style.left =
            `${Math.random() * 100}vw`;


        const duration =
            Math.random() * 6 +
            4;

        const delay =
            Math.random() * 5;


        petal.style.animationDuration =
            `${duration}s`;

        petal.style.animationDelay =
            `${delay}s`;


        container.appendChild(
            petal
        );
    }
}


function createSplashPetals(
    container
) {

    const petals =
        document.createElement(
            'div'
        );

    petals.className =
        'splash-petals';

    container.appendChild(
        petals
    );


    for (
        let i = 0;
        i < 8;
        i++
    ) {

        const petal =
            document.createElement(
                'span'
            );

        petal.className =
            'splash-petal';


        petal.style.left =
            `${
                10 +
                Math.random() *
                80
            }%`;


        petal.style.animationDelay =
            `${
                Math.random() *
                1.2
            }s`;


        petal.style.animationDuration =
            `${
                2.6 +
                Math.random() *
                1.8
            }s`;


        petals.appendChild(
            petal
        );
    }
}


function isTodayWard(value) {

    const date =
        new Date(
            value ||
            Date.now()
        );

    const today =
        new Date();


    return (
        date.getFullYear() ===
            today.getFullYear() &&

        date.getMonth() ===
            today.getMonth() &&

        date.getDate() ===
            today.getDate()
    );
}


function formatWardDateTime(value) {

    const date =
        value
            ? new Date(value)
            : new Date();


    return new Intl.DateTimeFormat(
        'en-GB',
        {
            dateStyle: 'short',
            timeStyle: 'short',
            hour12: true
        }
    ).format(date);
}


function escapeHtml(value) {

    const node =
        document.createElement(
            'span'
        );

    node.textContent =
        value == null
            ? ''
            : String(value);


    return node.innerHTML;
}


function addCafeNavigation() {

    const header =
        document.querySelector(
            'header'
        );


    if (
        !header ||
        document.getElementById(
            'cafe-main-nav'
        )
    ) {
        return;
    }


    header
        .querySelectorAll(
            ':scope > div'
        )
        .forEach(
            section => {

                if (
                    section.querySelector(
                        'a[href$=".html"]'
                    )
                ) {

                    section.classList.add(
                        'legacy-page-links'
                    );
                }
            }
        );


    const navigation =
        document.createElement(
            'nav'
        );


    navigation.id =
        'cafe-main-nav';


    navigation.setAttribute(
        'aria-label',
        'شاشات كافيه ورد'
    );


    header
        .querySelectorAll(
            'a[href$=".html"]'
        )
        .forEach(
            link =>
                link.remove()
        );


    for (
        const [
            page,
            label
        ] of [

            ['index', 'المنيو'],
            ['waiter', 'الكارسون'],
            ['kitchen', 'المطبخ'],
            ['pos', 'الكاشير'],
            ['accounting', 'المحاسبة'],
            ['admin', 'الإدارة']

        ]
    ) {

        const link =
            document.createElement(
                'a'
            );


        link.href =
            page + '.html';

        link.textContent =
            label;


        if (
            window.location.pathname
                .endsWith(
                    link.getAttribute(
                        'href'
                    )
                )
        ) {

            link.className =
                'is-current';
        }


        navigation.appendChild(
            link
        );
    }


    header.appendChild(
        navigation
    );


    const currentPage =
        (
            window.location.pathname
                .split('/')
                .pop() ||
            'index.html'
        ).toLowerCase();


    const clock =
        document.createElement(
            'div'
        );


    clock.id =
        'ward-live-clock';


    clock.setAttribute(
        'aria-label',
        'الوقت الحالي'
    );


    header.append(
        clock
    );


    const updateClock = () => {

        clock.textContent =
            formatWardDateTime(
                Date.now()
            );
    };


    updateClock();


    window.setInterval(
        updateClock,
        30000
    );
}


function getLocalTableStatus(
    tableNumber
) {

    const stored =
        localStorage.getItem(
            `cafe_ward_table_${
                String(tableNumber)
            }`
        );


    return stored
        ? JSON.parse(stored)
        : null;
}


function setLocalTableStatus(
    tableNumber,
    status
) {

    localStorage.setItem(
        `cafe_ward_table_${
            String(tableNumber)
        }`,
        JSON.stringify(
            status
        )
    );
}


function clearLocalTableStatus(
    tableNumber
) {

    localStorage.removeItem(
        `cafe_ward_table_${
            String(tableNumber)
        }`
    );
}


function updateTableSelectorUI() {

    window.dispatchEvent(
        new Event(
            'ward:tables'
        )
    );
}


function startTablesRealtime() {

    if (!getFirebaseTablesRef()) {
        return;
    }


    getFirebaseTablesRef()
        .on(
            'value',
            snapshot => {

                const data =
                    snapshot.val() ||
                    {};


                const allTables = [

                    '1',
                    '2',
                    '3',
                    '4',
                    '5',
                    '6',
                    '7',
                    '8',
                    '9',
                    '10',
                    '11',
                    '12',
                    '13',
                    '14',
                    '15',
                    '16',
                    '17',
                    '18',
                    '19',
                    '20'
                ];


                allTables.forEach(
                    tableNum => {

                        const status =
                            data[
                                tableNum
                            ];


                        if (
                            status &&
                            status.status ===
                                'occupied'
                        ) {

                            setLocalTableStatus(
                                tableNum,
                                status
                            );

                        } else {

                            clearLocalTableStatus(
                                tableNum
                            );
                        }
                    }
                );


                updateTableSelectorUI();


                window.dispatchEvent(
                    new Event(
                        'ward:tables'
                    )
                );
            }
        );
}


function getFirebaseOrdersRef() {

    return firebaseDatabase
        ? firebaseDatabase.ref(
            'orders'
        )
        : null;
}


function getFirebaseMenuRef() {

    return firebaseDatabase
        ? firebaseDatabase.ref(
            'menu'
        )
        : null;
}


function getFirebaseAccountingRef() {

    return firebaseDatabase
        ? firebaseDatabase.ref(
            'accounting'
        )
        : null;
}


function getFirebaseTablesRef() {

    return firebaseDatabase
        ? firebaseDatabase.ref(
            'tables'
        )
        : null;
}


function showFirebaseSetupMessage() {

    if (!firebaseConfigured) {

        console.warn(
            'Firebase is not configured. Add the project configuration to firebase-config.js.'
        );
    }
}