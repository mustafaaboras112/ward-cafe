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


/* =========================
   التنقل بين أقسام المحاسبة
========================= */

function openAccountingPage(pageName) {

    const page = document.getElementById(pageName);

    if (!page) {
        return;
    }


    document
        .querySelectorAll('.page')
        .forEach(section => {

            section.classList.remove('active');

        });


    document
        .querySelectorAll('.nav button')
        .forEach(button => {

            button.classList.remove('active');

        });


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
            document.getElementById(
                'page-title'
            );

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


/* =========================
   أزرار القائمة
========================= */

document
    .querySelectorAll('.nav button')
    .forEach(button => {

        button.addEventListener(
            'click',
            () => {

                const pageName =
                    button.dataset.page;

                openAccountingPage(
                    pageName
                );

            }
        );

    });


/* =========================
   المبيعات القادمة من النظام
========================= */

function renderAccountingSales() {

    if (
        typeof getAccountingData !==
        'function'
    ) {
        return;
    }


    const accounting =
        getAccountingData();


    const sales =
        accounting.sales || [];


    const body =
        document.getElementById(
            'sales-body'
        );


    if (!body) {
        return;
    }


    body.replaceChildren();


    const sortedSales =
        [...sales].sort(
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


    if (!sortedSales.length) {

        const row =
            document.createElement(
                'tr'
            );


        const cell =
            document.createElement(
                'td'
            );


        cell.colSpan =
            6;


        cell.textContent =
            'لا توجد مبيعات مسجلة حتى الآن.';


        row.append(
            cell
        );


        body.append(
            row
        );


        return;

    }


    sortedSales.forEach(
        sale => {

            const row =
                document.createElement(
                    'tr'
                );


            const invoice =
                document.createElement(
                    'td'
                );

            invoice.textContent =
                '#' +
                String(
                    sale.orderId ||
                    sale.id ||
                    ''
                ).slice(
                    0,
                    8
                );


            const table =
                document.createElement(
                    'td'
                );

            table.textContent =
                sale.table ||
                '-';


            const time =
                document.createElement(
                    'td'
                );

            time.textContent =
                typeof formatWardDateTime ===
                'function'
                    ? formatWardDateTime(
                        sale.paidAt ||
                        sale.createdAt
                    )
                    : '';


            const total =
                document.createElement(
                    'td'
                );

            total.textContent =
                Number(
                    sale.total ||
                    0
                ).toFixed(
                    2
                ) +
                ' ليرة';


            const method =
                document.createElement(
                    'td'
                );

            method.textContent =
                sale.paymentMethod ===
                'card'
                    ? 'بطاقة'
                    : 'نقدي';


            const status =
                document.createElement(
                    'td'
                );


            const badge =
                document.createElement(
                    'span'
                );

            badge.className =
                'status green';

            badge.textContent =
                'مدفوع';


            status.append(
                badge
            );


            row.append(
                invoice,
                table,
                time,
                total,
                method,
                status
            );


            body.append(
                row
            );

        }
    );

}


/* =========================
   تحديث المحاسبة Realtime
========================= */

window.addEventListener(
    'ward:accounting',
    () => {

        renderAccountingSales();

    }
);


/* =========================
   تشغيل الصفحة
========================= */

window.addEventListener(
    'DOMContentLoaded',
    () => {

        openAccountingPage(
            'dashboard'
        );


        if (
            typeof startAccountingRealtime ===
            'function'
        ) {

            startAccountingRealtime();

        }


        renderAccountingSales();

    }
);