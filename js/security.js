/* Page gating is a usability layer. Database rules and wardAction enforce access. */
(function () {
    'use strict';

    const page = location.pathname.split('/').pop().toLowerCase();
    const roles = { 'index.html': 'customer', '': 'customer', 'admin.html': 'admin', 'pos.html': 'cashier', 'kitchen.html': 'kitchen', 'waiter.html': 'waiter', 'accounting.html': 'accountant' };
    const roleNames = { customer: 'الزبون', admin: 'الإدارة', cashier: 'الكاشير', kitchen: 'المطبخ', waiter: 'الكارسون', accountant: 'المحاسبة' };
    const requiredRole = roles[page];
    const IDLE_MS = 30 * 60 * 1000;
    const MAX_SESSION_MS = 8 * 60 * 60 * 1000;
    const SESSION_KEY = 'ward-security-session';
    let auth, appCheck, currentUser = null, currentRole = null;
    let root, panel, message, roleRef, roleListener, authUnsubscribe;
    let authorized = false, stopped = false, guestAttempted = false, generation = 0;
    let session = null, interval = null, tokenInterval = null, lastStored = 0;
    let resolveReady, rejectReady;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    // Consumers still receive the rejection; this prevents an uncaught rejection before common.js subscribes.
    ready.catch(() => {});

    function make(tag, text, className) {
        const element = document.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (className) element.className = className;
        return element;
    }

    function lock() {
        document.body.classList.add('ward-auth-pending');
        for (const child of document.body.children) {
            if (child !== root && child.tagName !== 'SCRIPT') child.inert = true;
        }
        if (root) root.hidden = false;
        authorized = false;
    }

    function show(title, text) {
        lock();
        panel.replaceChildren();
        const flower = make('div', '🌸', 'ward-auth-flower');
        flower.setAttribute('aria-hidden', 'true');
        panel.append(flower, make('p', 'كافيه ورد', 'ward-auth-brand'));
        const heading = make('h1', title);
        heading.id = 'ward-auth-title';
        panel.append(heading, make('p', text, 'ward-auth-description'));
        message = make('p', '', 'ward-auth-message');
        message.setAttribute('role', 'status');
        message.setAttribute('aria-live', 'polite');
        panel.append(message);
    }

    function status(text, isError = false) {
        message.textContent = text;
        message.classList.toggle('is-error', isError);
    }

    function arabicError(error) {
        const code = error?.code || '';
        const messages = {
            'auth/invalid-credential': 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.',
            'auth/invalid-login-credentials': 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.',
            'auth/wrong-password': 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.',
            'auth/user-not-found': 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.',
            'auth/invalid-email': 'أدخل بريدًا إلكترونيًا صحيحًا.',
            'auth/too-many-requests': 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.',
            'auth/user-disabled': 'هذا الحساب موقوف. راجع المسؤول.',
            'auth/network-request-failed': 'تعذر الاتصال. تحقق من الإنترنت ثم أعد المحاولة.',
            'auth/operation-not-allowed': 'خدمة تسجيل الدخول غير مفعلة. راجع مسؤول النظام.',
            'auth/multi-factor-auth-required': 'هذا الحساب يتطلب تحققًا إضافيًا. يجب على المسؤول تفعيل واجهة المصادقة متعددة العوامل قبل استخدامه هنا.',
            'auth/user-token-expired': 'انتهت جلسة الدخول. أعد تسجيل الدخول.',
            'auth/requires-recent-login': 'يلزم تسجيل الدخول من جديد لإتمام هذه العملية.',
            'functions/unauthenticated': 'انتهت جلسة الدخول أو تعذر التحقق منها. أعد تسجيل الدخول.',
            'functions/permission-denied': 'ليس لحسابك صلاحية تنفيذ هذه العملية.',
            'functions/resource-exhausted': 'طلبات كثيرة خلال فترة قصيرة. انتظر قليلًا ثم أعد المحاولة.',
            'functions/unavailable': 'الخدمة غير متاحة حاليًا. لم يتم تأكيد العملية؛ تحقق من البيانات قبل إعادة المحاولة.',
            'functions/deadline-exceeded': 'تأخر رد الخادم. تحقق من البيانات قبل إعادة المحاولة.',
            'functions/not-found': 'لم يتم العثور على البيانات المطلوبة، أو أن الخدمة الآمنة لم تُنشر بعد.',
            'PERMISSION_DENIED': 'تعذر التحقق من صلاحيات الحساب. راجع المسؤول.'
        };
        if (messages[code]) return messages[code];
        if (code.startsWith('appCheck/')) return 'تعذر التحقق من أمان الاتصال. تحقق من الإنترنت وإعداد App Check ثم أعد تحميل الصفحة.';
        // Business errors from the trusted callable remain readable without exposing raw SDK details.
        if (error?.message && /[\u0600-\u06ff]/.test(error.message)) return error.message;
        return 'تعذر إتمام التحقق أو العملية بأمان. أعد المحاولة أو راجع مسؤول النظام.';
    }

    function action(label, callback, secondary = false) {
        const button = make('button', label, secondary ? 'ward-auth-secondary' : 'ward-auth-primary');
        button.type = 'button';
        button.addEventListener('click', async () => {
            button.disabled = true;
            try { await callback(); } catch (error) { status(arabicError(error), true); }
            finally { button.disabled = false; }
        });
        panel.append(button);
        return button;
    }

    function detachRole() {
        if (roleRef && roleListener) roleRef.off('value', roleListener);
        roleRef = roleListener = null;
    }

    function clearSession() {
        session = null;
        try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Firebase persistence will also reject unavailable storage. */ }
    }

    function stopListeners() {
        detachRole();
        if (authUnsubscribe) authUnsubscribe();
        clearInterval(interval);
        clearInterval(tokenInterval);
    }

    function fail(error) {
        if (stopped) return;
        stopped = true;
        generation++;
        currentUser = currentRole = null;
        stopListeners();
        clearSession();
        const failure = new Error(arabicError(error));
        rejectReady(failure);
        show('تم إيقاف الوصول', failure.message);
        action('إعادة تحميل الصفحة', () => location.reload());
        window.dispatchEvent(new CustomEvent('ward:locked', { detail: { message: failure.message } }));
        // Also close the server connection; hiding HTML alone cannot protect data.
        try { firebase.database().goOffline(); } catch { /* Firebase may have failed to load. */ }
        if (auth) auth.signOut().catch(() => {});
    }

    async function signOut() {
        const wasAuthorized = authorized;
        lock();
        detachRole();
        clearSession();
        if (wasAuthorized) {
            fail(new Error('تم تسجيل الخروج. أعد تحميل الصفحة لتسجيل الدخول مرة أخرى.'));
            return;
        }
        currentUser = currentRole = null;
        await auth.signOut();
        if (!stopped && requiredRole !== 'customer') login();
    }

    function login(text = 'استخدم حساب الموظف المخصص لك. تحدد الإدارة صلاحية كل حساب.') {
        show('دخول ' + roleNames[requiredRole], text);
        const form = make('form', undefined, 'ward-auth-form');
        const emailLabel = make('label', 'البريد الإلكتروني');
        const email = make('input');
        email.id = 'ward-auth-email';
        email.type = 'email';
        email.autocomplete = 'username';
        email.dir = 'ltr';
        email.required = true;
        email.maxLength = 254;
        emailLabel.htmlFor = email.id;
        const passwordLabel = make('label', 'كلمة المرور');
        const password = make('input');
        password.id = 'ward-auth-password';
        password.type = 'password';
        password.autocomplete = 'current-password';
        password.dir = 'ltr';
        password.required = true;
        password.maxLength = 4096;
        passwordLabel.htmlFor = password.id;
        const submit = make('button', 'تسجيل الدخول', 'ward-auth-primary');
        submit.type = 'submit';
        form.append(emailLabel, email, passwordLabel, password, submit);
        panel.insertBefore(form, message);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (submit.disabled || stopped) return;
            submit.disabled = true;
            status('جارٍ التحقق من الحساب…');
            const enteredPassword = password.value;
            password.value = '';
            try { await auth.signInWithEmailAndPassword(email.value.trim(), enteredPassword); }
            catch (error) { status(arabicError(error), true); }
            finally { submit.disabled = false; }
        });
        action('نسيت كلمة المرور', async () => {
            if (!email.reportValidity()) return;
            try { await auth.sendPasswordResetEmail(email.value.trim()); }
            catch (error) {
                if (error?.code !== 'auth/user-not-found') throw error;
            }
            status('إذا كان البريد مسجلاً، ستصلك رسالة لإعادة تعيين كلمة المرور.');
        }, true);
        panel.append(make('p', 'لا توجد حسابات مشتركة. تُنشأ الحسابات والصلاحيات بواسطة المسؤول.', 'ward-auth-note'));
    }

    function expired() {
        if (!session || requiredRole === 'customer') return false;
        const now = Date.now();
        return now - session.authTime >= MAX_SESSION_MS || now - session.lastActive >= IDLE_MS;
    }

    async function prepareSession(user) {
        const token = await user.getIdTokenResult(true);
        const authTime = Number(token.claims.auth_time) * 1000;
        if (!Number.isFinite(authTime) || authTime <= 0 || authTime > Date.now() + 60000) throw new Error('تعذر التحقق من مدة جلسة الدخول. أعد تسجيل الدخول.');
        let saved;
        try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { saved = null; }
        const sameSession = saved?.uid === user.uid && saved.authTime === authTime;
        session = { uid: user.uid, authTime, lastActive: sameSession && Number.isFinite(saved.lastActive) ? Math.min(saved.lastActive, Date.now()) : Date.now() };
        if (expired()) throw new Error('انتهت الجلسة بسبب عدم النشاط أو مرور 8 ساعات. أعد تسجيل الدخول.');
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }

    function authorize(user, role) {
        if (stopped) return;
        if (authorized && (currentUser?.uid !== user.uid || currentRole !== role)) {
            fail(new Error('تغيرت صلاحيات الجلسة. أعد تسجيل الدخول.'));
            return;
        }
        currentUser = user;
        currentRole = role;
        authorized = true;
        root.hidden = true;
        for (const child of document.body.children) child.inert = false;
        document.body.classList.remove('ward-auth-pending');
        if (role !== 'customer' && !document.getElementById('ward-session-bar')) {
            const bar = make('aside', undefined, 'ward-session-bar');
            bar.id = 'ward-session-bar';
            bar.setAttribute('aria-label', 'جلسة الموظف');
            bar.append(make('span', 'حساب ' + roleNames[role]));
            const logout = make('button', 'تسجيل الخروج');
            logout.type = 'button';
            logout.addEventListener('click', () => signOut().catch(fail));
            bar.append(logout);
            document.body.append(bar);
        }
        resolveReady(Object.freeze({ uid: user.uid, role }));
        window.dispatchEvent(new CustomEvent('ward:authorized', { detail: { uid: user.uid, role } }));
    }

    async function checkUser(user) {
        if (stopped) return;
        const attempt = ++generation;
        detachRole();
        if (authorized && (!user || user.uid !== currentUser?.uid)) {
            fail(new Error('تغير حساب الجلسة أو انتهى تسجيل الدخول. أعد تحميل الصفحة.'));
            return;
        }
        currentUser = user;
        currentRole = null;
        if (!user) {
            if (requiredRole !== 'customer') { login(); return; }
            if (guestAttempted) { fail(new Error('تعذر فتح جلسة الزبون. أعد تحميل الصفحة للمحاولة مجددًا.')); return; }
            guestAttempted = true;
            show('مرحبًا بك في كافيه ورد', 'جارٍ فتح جلسة آمنة لقائمة طاولتك…');
            await auth.signInAnonymously();
            return;
        }
        if (requiredRole === 'customer') {
            if (user.isAnonymous) { authorize(user, 'customer'); return; }
            show('فتح قائمة الزبون', 'هذا التبويب مسجل بحساب موظف. افتح جلسة زبون لاستخدام قائمة الطاولة.');
            action('فتح جلسة زبون', async () => { guestAttempted = false; await auth.signOut(); });
            return;
        }
        if (user.isAnonymous) { login('سجّل الدخول بحساب الموظف للوصول إلى هذه الصفحة.'); return; }
        if (!user.emailVerified) {
            show('تأكيد البريد الإلكتروني', 'يلزم تأكيد بريد حسابك قبل فتح صفحات الموظفين. افتح رابط التأكيد الذي يصلك بالبريد ثم اضغط «تحققت من البريد».');
            action('إرسال رابط التأكيد', async () => {
                await user.sendEmailVerification();
                status('أُرسلت رسالة التأكيد. تحقق من البريد الوارد ومجلد الرسائل غير المرغوبة.');
            });
            action('تحققت من البريد', async () => {
                await user.reload();
                await user.getIdToken(true);
                await checkUser(auth.currentUser);
            }, true);
            action('استخدام حساب آخر', signOut, true);
            return;
        }
        await prepareSession(user);
        if (attempt !== generation || stopped) return;
        show('التحقق من الصلاحيات', 'جارٍ التحقق من صلاحية حسابك لهذه الصفحة…');
        const reference = firebase.database().ref('staffAccess/' + user.uid);
        roleRef = reference;
        roleListener = snapshot => {
            if (attempt !== generation || stopped) return;
            const access = snapshot.val();
            const allowed = access?.active === true && (access.role === 'admin' || access.role === requiredRole);
            if (!allowed) {
                if (authorized) { fail(new Error('أُوقفت صلاحية حسابك أو تغيرت. راجع المسؤول.')); return; }
                show('لا توجد صلاحية لهذه الصفحة', 'حسابك غير مفعّل لهذه الصفحة. اطلب من المسؤول منحك الصلاحية المناسبة.');
                action('استخدام حساب آخر', signOut, true);
                return;
            }
            authorize(user, access.role);
        };
        reference.on('value', roleListener, error => { if (attempt === generation) fail(error); });
    }

    async function call(actionName, data = {}) {
        await ready;
        if (stopped || !authorized || !currentUser || auth.currentUser?.uid !== currentUser.uid) throw new Error('لا توجد جلسة مصرح لها بتنفيذ العملية.');
        if (expired()) {
            const error = new Error('انتهت الجلسة. أعد تسجيل الدخول.');
            fail(error);
            throw error;
        }
        const uid = currentUser.uid;
        try {
            await appCheck.getToken(false);
            if (stopped || !authorized || auth.currentUser?.uid !== uid) throw new Error('تغيرت جلسة الدخول. أعد تحميل الصفحة.');
            const response = await firebase.app().functions('europe-west1').httpsCallable('wardAction')({ action: actionName, data });
            if (stopped || !authorized || auth.currentUser?.uid !== uid) throw new Error('انتهت جلسة الدخول. تحقق من البيانات بعد تسجيل الدخول.');
            return response.data;
        } catch (error) {
            if (['functions/unauthenticated', 'functions/permission-denied', 'auth/user-token-expired', 'auth/user-disabled'].includes(error?.code)) fail(error);
            throw new Error(arabicError(error));
        }
    }

    async function bootstrap() {
        root = make('div');
        root.id = 'ward-auth-root';
        root.dir = 'rtl';
        panel = make('section', undefined, 'ward-auth-panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'ward-auth-title');
        root.append(panel);
        document.body.append(root);
        show('اتصال آمن', 'جارٍ التحقق من الاتصال والصلاحيات…');
        try {
            for (const storage of [localStorage, sessionStorage]) {
                for (const key of ['isLoggedIn', 'cafe_ward_staff_unlocked', 'ward-client-id']) storage.removeItem(key);
            }
            if (!requiredRole) throw new Error('هذه الصفحة غير مسجلة ضمن الصفحات المصرح بها.');
            if (!window.firebase?.apps?.length || !firebase.auth || !firebase.appCheck || !firebase.functions) throw new Error('تعذر تحميل خدمات الحماية. تحقق من الاتصال وإعداد Firebase.');
            const siteKey = window.WARD_SECURITY_CONFIG?.appCheckSiteKey;
            if (typeof siteKey !== 'string' || !siteKey.trim() || /YOUR_|REPLACE_|PLACEHOLDER/i.test(siteKey)) throw new Error('إعداد الحماية غير مكتمل. يجب على مسؤول النظام إعداد App Check ومفتاح reCAPTCHA Enterprise قبل تشغيل الصفحات.');
            appCheck = firebase.appCheck();
            appCheck.activate(new firebase.appCheck.ReCaptchaEnterpriseProvider(siteKey.trim()), true);
            await appCheck.getToken(false);
            auth = firebase.auth();
            auth.languageCode = 'ar';
            await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
            authUnsubscribe = auth.onAuthStateChanged(user => { checkUser(user).catch(fail); }, fail);
            interval = setInterval(() => { if (authorized && expired()) fail(new Error('انتهت الجلسة بسبب عدم النشاط أو مرور 8 ساعات. أعد تسجيل الدخول.')); }, 15000);
            tokenInterval = setInterval(async () => {
                if (!authorized || !currentUser || requiredRole === 'customer') return;
                try {
                    const token = await currentUser.getIdTokenResult(true);
                    if (token.claims.email_verified !== true) fail(new Error('يلزم تأكيد البريد الإلكتروني مجددًا.'));
                } catch (error) { fail(error); }
            }, 5 * 60 * 1000);
            const activity = event => {
                if (!event.isTrusted || !authorized || !session || requiredRole === 'customer') return;
                if (expired()) { fail(new Error('انتهت الجلسة. أعد تسجيل الدخول.')); return; }
                session.lastActive = Date.now();
                if (Date.now() - lastStored < 5000) return;
                lastStored = Date.now();
                try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (error) { fail(error); }
            };
            for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel']) document.addEventListener(type, activity, { passive: true });
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && authorized && expired()) fail(new Error('انتهت الجلسة. أعد تسجيل الدخول.'));
            });
            window.addEventListener('pageshow', event => {
                if (event.persisted) { lock(); location.reload(); }
            });
        } catch (error) { fail(error); }
    }

    Object.defineProperty(window, 'wardSecurity', { value: Object.freeze({
        ready,
        get user() { return authorized && !stopped ? currentUser : null; },
        get role() { return authorized && !stopped ? currentRole : null; },
        call, fail, logout: signOut
    }), writable: false, configurable: false });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    else bootstrap();
})();
