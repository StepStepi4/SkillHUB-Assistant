    const EDU_CACHE_KEY = 'skillhub_v7_edu';   // кеш даних навчання (лише дані цього користувача, без паролів)
    window.fullData = null; // повна відповідь API (educationData + achievementData)

    async function eduSaveCache(dataStr) {
        let ok = false;
        try { await idbSet(EDU_CACHE_KEY, dataStr); ok = true; } catch (e) {}
        try { localStorage.setItem(EDU_CACHE_KEY, dataStr); ok = true; } catch (e) {}
        if (ok) { try { localStorage.setItem('skillhub_has_cache7', '1'); } catch (e) {} }
        return ok;
    }
    async function eduLoadCache() {
        let candidates = [];
        try { const v = await idbGet(EDU_CACHE_KEY); if (v) candidates.push(v); } catch (e) {}
        try { const v = localStorage.getItem(EDU_CACHE_KEY); if (v) candidates.push(v); } catch (e) {}
        for (const str of candidates) {
            try {
                const parsed = JSON.parse(str);
                if (parsed && parsed.educationData && parsed.educationData.users) return parsed;
            } catch (e) {}
        }
        return null;
    }
    // Відкладений запис (не блокує інтерфейс), об'єднує часті виклики
    let _saveTimer = null;
    function eduSaveCacheLater() {
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => {
            _saveTimer = null;
            const run = () => { try { if (window.fullData) eduSaveCache(JSON.stringify(window.fullData)); } catch (e) {} };
            if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 2000 }); else run();
        }, 400);
    }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

    // Прибираємо все, що лишилось від старої (небезпечної) версії: паролі у відкритому вигляді та старий кеш
    async function purgeLegacyStorage() {
        try {
            const oc = localStorage.getItem('skillhub_edu_creds');
            if (oc && !localStorage.getItem('skillhub_auth')) localStorage.setItem('skillhub_edu_creds_old', oc); // одноразова міграція
            localStorage.removeItem('skillhub_edu_creds');
            if (localStorage.getItem('skillhub_auth')) localStorage.removeItem('skillhub_edu_creds_old');
        } catch (e) {}
        try { localStorage.removeItem('skillhub_session_token'); } catch (e) {}
    }

    /* ====================== Ізоляція «Академії» всередині єдиного застосунку ====================== */
    const ACADEMY_ROOT_ID = 'academyApp';
    function academyRoot() { return document.getElementById(ACADEMY_ROOT_ID); }
    // Додає префікс #academyApp до кожного селектора (щоб масштаб шрифту не чіпав «Асистента»)
    function scopeAcademyCss(css) {
        return css.replace(/(^|\})\s*([^{}]+)\{/g, function (m, br, sel) {
            const scoped = sel.split(',').map(x => '#' + ACADEMY_ROOT_ID + ' ' + x.trim()).join(', ');
            return br + '\n' + scoped + ' {';
        });
    }
    function academyScroll(lock) { const r = academyRoot(); if (r) r.style.overflowY = lock ? 'hidden' : ''; }
    function academyScrollTop() { const r = academyRoot(); if (r) r.scrollTop = 0; }

    // ====================== Ліниве завантаження Chart.js ======================
    let _chartPromise = null;
    function loadChartJs() {
        if (typeof Chart !== 'undefined') return Promise.resolve();
        if (_chartPromise) return _chartPromise;
        _chartPromise = new Promise((resolve, reject) => {
            const sc = document.createElement('script');
            sc.src = 'js/vendor/chart.umd.js'; // локальна копія (працює офлайн)
            sc.onload = () => resolve();
            sc.onerror = () => {
                // запасний варіант - CDN
                const cdn = document.createElement('script');
                cdn.src = 'https://cdn.jsdelivr.net/npm/chart.js';
                cdn.onload = () => resolve();
                cdn.onerror = () => { _chartPromise = null; reject(new Error('chart load failed')); };
                document.head.appendChild(cdn);
            };
            document.head.appendChild(sc);
        });
        return _chartPromise;
    }
    const TIME_PER_QUESTION = 35; 

    const CONFIG = {
        roles: {
            owner: ['власник', 'владелец', 'owner', 'admin', 'адмін'],
            manager: ['керівник', 'директор', 'manager'],
            seller: ['продавець', 'продавец', 'співробітник', 'сотрудник', 'seller'],
            guest: ['гість', 'гость', 'guest']
        }
    };

    function detectRoleGroup(roleStr) {
        if (!roleStr) return 'seller';
        let rLow = String(roleStr).toLowerCase().trim();
        if (CONFIG.roles.owner.some(r => rLow.includes(r))) return 'owner';
        if (CONFIG.roles.manager.some(r => rLow.includes(r))) return 'manager';
        if (CONFIG.roles.guest.some(r => rLow.includes(r))) return 'guest';
        return 'seller';
    }

    window.updateAcademyFontScale = function(scale) {
        let style = document.getElementById('dynamicFontScaleAcademy');
        if(!style) { 
            style = document.createElement('style'); 
            style.id = 'dynamicFontScaleAcademy'; 
            document.head.appendChild(style); 
        }
        style.innerHTML = scopeAcademyCss(`
            input, select, textarea, button, .btn { font-size: calc(16px * ${scale}) !important; }
            h1 { font-size: calc(26px * ${scale}) !important; }
            h2 { font-size: calc(22px * ${scale}) !important; }
            .section-title { font-size: calc(12px * ${scale}) !important; }
            .input-label { font-size: calc(12px * ${scale}) !important; }
            .stat-val-modern { font-size: calc(20px * ${scale}) !important; }
            .stat-label-modern { font-size: calc(12px * ${scale}) !important; }
            .list-card-title { font-size: calc(15px * ${scale}) !important; }
            .theory-line { font-size: calc(15px * ${scale}) !important; }
            .question-title { font-size: calc(17px * ${scale}) !important; }
            .answer-label { font-size: calc(14px * ${scale}) !important; }
            .ach-title { font-size: calc(22px * ${scale}) !important; }
            .ach-card-title { font-size: calc(16px * ${scale}) !important; }
            .ach-card-desc { font-size: calc(13px * ${scale}) !important; }
            #deadlineText { font-size: calc(13.5px * ${scale}) !important; }
            #userWelcome { font-size: calc(14px * ${scale}) !important; }
            .timer-box { font-size: calc(16px * ${scale}) !important; }
            .role-action-btn span { font-size: calc(11px * ${scale}) !important; }
            .banner-action-btn span { font-size: calc(11.5px * ${scale}) !important; }
        `);
    };

    let academySavedFontScale = localStorage.getItem('skillhub_font_scale') || "1";
    window.updateAcademyFontScale(academySavedFontScale);

    let eduDb = null;
    let globalAchievements = []; 
    let currentUser = null;
    let windowUserRole = 'seller'; 
    let windowViewingEmployee = null; 

    let coursesMap = {}; 
    let currentCourseName = "";
    let currentProductData = null;
    let parsedQuestions = [];

    let testTimerInterval = null;
    let timeRemaining = 0;
    let deadlineInterval = null;
    let meetPulseInterval = null;
    
    window.isDeadlinePassed = false;
    let isTestActive = false; 
    let isCheatingTriggered = false;
    
    let currentQuestionIndex = 0;
    let totalTimeSpent = 0;
    window.sessionTotalTime = 0;
    window.theoryEntryTime = 0;

    let sessionCheckInterval = null;

    function toggleFilterMenu() {
        let panel = document.getElementById('filterPanel');
        if (panel.style.display === 'none' || panel.style.display === '') {
            panel.style.display = 'flex';
        } else {
            panel.style.display = 'none';
        }
    }

    document.addEventListener('scroll', function (e) {
        if (e.target && e.target.id === 'statsModalUsersList' && e.target.scrollTop > 30) {
            var fp = document.getElementById('filterPanel');
            if (fp && fp.style.display === 'flex') fp.style.display = 'none';
        }
    }, true);

    function applyFilters() {
        let q = document.getElementById('empSearchInput').value.toLowerCase();
        renderStatsModalEmployees(q);
    }

    function populateManagerFilter() {
        let employees = getAccessibleEmployeesList();
        let managers = new Set();
        employees.forEach(u => {
            let m = formatManagerName(u.manager);
            if (m && m !== "-") managers.add(m);
        });
        
        let select = document.getElementById('f_manager');
        if (!select) return;
        
        let currentVal = select.value;
        select.innerHTML = `<option value="">Всі керівники</option>` + 
            Array.from(managers).sort().map(m => `<option value="${escapeHTMLAttr(m)}">${escapeHTMLAttr(m)}</option>`).join('');
        
        if (managers.has(currentVal)) {
            select.value = currentVal;
        } else {
            select.value = "";
        }
    }

    function checkNewAchievements(user) {
        if (!user || !user.achievements) return;
        let achCodes = String(user.achievements).split(',').map(s => s.trim()).filter(Boolean);
        let storedKey = 'skillhub_achievements_' + user.login;
        let viewedCodes = [];
        try { viewedCodes = JSON.parse(localStorage.getItem(storedKey) || '[]'); } catch (e) {}
        let hasNew = achCodes.some(code => !viewedCodes.includes(code));
        let dot = document.getElementById('achNotificationDot');
        let btn = document.getElementById('achBtn');
        if (hasNew) {
            if (dot) dot.style.display = 'block';
            if (btn) btn.classList.add('has-new');
        } else {
            if (dot) dot.style.display = 'none';
            if (btn) btn.classList.remove('has-new');
        }
    }

    function toggleAchievements() {
        let drawer = document.getElementById('achDrawer');
        let overlay = document.getElementById('achOverlay');
        if (drawer.classList.contains('open')) {
            drawer.classList.remove('open');
            overlay.classList.remove('active');
            academyScroll(false);
        } else {
            renderAchievementsList();
            drawer.classList.add('open');
            overlay.classList.add('active');
            academyScroll(true);
            if (currentUser) {
                let user = eduDb.users.find(u => String(u.login).toLowerCase() === String(currentUser).toLowerCase());
                if (user && user.achievements) {
                    let achCodes = String(user.achievements).split(',').map(s => s.trim()).filter(Boolean);
                    localStorage.setItem('skillhub_achievements_' + user.login, JSON.stringify(achCodes));
                    checkNewAchievements(user); 
                }
            }
        }
    }

    function toggleAchZoom(el) {
        if (el.classList.contains('locked')) return;
        if (el.classList.contains('zoomed')) {
            el.classList.remove('zoomed');
        } else {
            document.querySelectorAll('.ach-card.zoomed').forEach(c => c.classList.remove('zoomed'));
            el.classList.add('zoomed');
        }
    }

    function renderAchievementsList() {
        let container = document.getElementById('achList');
        if (!container) return;
        let user = eduDb.users.find(u => String(u.login).toLowerCase() === String(currentUser).toLowerCase());
        let earnedCodes = user && user.achievements ? String(user.achievements).split(',').map(s => s.trim()).filter(Boolean) : [];
        if (!globalAchievements || globalAchievements.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted); font-weight:600;">Відзнаки відсутні в базі</div>';
            return;
        }
        let html = globalAchievements.map(ach => {
            let isEarned = earnedCodes.includes(String(ach.code).trim());
            let safeCode = escapeHTMLAttr(ach.code);
            let safeTitle = escapeHTMLAttr(ach.name);
            let safeDesc = escapeHTMLAttr(ach.description);
            let cardClass = isEarned ? "ach-card earned" : "ach-card locked";
            return `
                <div class="${cardClass}" onclick="toggleAchZoom(this)">
                    <div class="ach-icon-wrapper"><img src="assets/achievements/${safeCode}.webp" onerror="this.src='assets/icons/ui/medal.svg'" class="ach-img"></div>
                    <div style="display: flex; flex-direction: column; justify-content: center; flex: 1;">
                        <div class="ach-card-title">${safeTitle}</div>
                        <div class="ach-card-desc">${safeDesc}</div>
                        ${isEarned ? `<div style="margin-top:6px;"><span style="color:var(--success); font-size:11px; font-weight:800;">НАТИСНІТЬ ДЛЯ ОПИСУ</span></div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        container.innerHTML = html;
    }

    /* ====================== ВХІД, ТОКЕН, ЄДИНИЙ ПРИСТРІЙ ======================
       Пароль перевіряє тільки сервер. На пристрої зберігається токен + "відбиток" пароля (PBKDF2)
       для офлайн-входу. Самого пароля та чужих паролів на пристрої немає. */
    const AUTH_KEY = 'skillhub_auth';
    const VERIF_PREFIX = 'skillhub_verif_';
    const OUTBOX_KEY = 'skillhub_outbox';
    let auth = null;              // { login, token }
    let pendingLogin = null;      // { login, pass, persist } - офлайн-вхід, дозавершимо коли з'явиться мережа
    const sess = { inFlight: false };

    function readAuth() {
        for (const st of [localStorage, sessionStorage]) {
            try { const v = st.getItem(AUTH_KEY); if (v) { const o = JSON.parse(v); if (o && o.login && o.token) return { login: o.login, token: o.token }; } } catch (e) {}
        }
        return null;
    }
    function clearAuthStore() {
        try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
        try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
        auth = null;
    }
    function writeAuth(a, persist) {
        clearAuthStore();
        try { (persist ? localStorage : sessionStorage).setItem(AUTH_KEY, JSON.stringify({ login: a.login, token: a.token })); } catch (e) {}
        auth = { login: a.login, token: a.token };
    }
    function lowLogin(x) { return String(x || '').trim().toLowerCase(); }

    // POST text/plain: проста CORS-відповідь без preflight, відповідь можна прочитати
    async function apiPost(body, timeoutMs) {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeoutMs || 20000);
        try {
            const r = await fetch(API_URL, { method: 'POST', cache: 'no-store', signal: ctl.signal,
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
            return JSON.parse(await r.text());
        } finally { clearTimeout(t); }
    }
    function authBody(extra) { return Object.assign({ login: auth.login, token: auth.token }, extra); }

    // --- відбиток пароля для офлайн-входу ---
    function bytesToB64(u8) { let s = ''; u8.forEach(b => s += String.fromCharCode(b)); return btoa(s); }
    function b64ToBytes(b) { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
    async function pbkdf2Hex(pass, salt, iter) {
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, key, 256);
        return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    async function storeVerifier(login, pass) {
        try {
            if (!(window.crypto && crypto.subtle)) return;
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const h = await pbkdf2Hex(String(pass).trim().toLowerCase(), salt, 150000);
            localStorage.setItem(VERIF_PREFIX + lowLogin(login), JSON.stringify({ s: bytesToB64(salt), h: h, i: 150000 }));
        } catch (e) {}
    }
    async function checkVerifier(login, pass) {
        try {
            const raw = localStorage.getItem(VERIF_PREFIX + lowLogin(login));
            if (!raw || !(window.crypto && crypto.subtle)) return false;
            const v = JSON.parse(raw);
            return (await pbkdf2Hex(String(pass).trim().toLowerCase(), b64ToBytes(v.s), v.i)) === v.h;
        } catch (e) { return false; }
    }

    function isAuthCode(c) { return c === 'session_replaced' || c === 'auth_required'; }

    // Сервер не визнав токен: або вхід з іншого пристрою, або сесія закінчилась
    function handleAuthLost(code) {
        if (!currentUser && !auth) return;
        if (code === 'session_replaced') logout(true, false);
        else logout(false, false, 'expired');
    }

    // Швидка перевірка (кілька байт) для старту тесту, повернення у вкладку, відновлення мережі
    async function checkSessionNow(maxWaitMs = 8000) {
        if (!currentUser || !auth) return true;
        if (!navigator.onLine) return true; // офлайн - перевіримо одразу, як з'явиться мережа
        if (sess.inFlight) return true;
        sess.inFlight = true;
        try {
            const r = await apiPost(authBody({ action: 'check_session' }), maxWaitMs);
            sess.inFlight = false;
            if (r && r.valid === false) { handleAuthLost(r.code); return false; }
        } catch (e) { sess.inFlight = false; }
        return true;
    }

    function startSessionHeartbeat() {
        stopSessionHeartbeat();
        setTimeout(() => { if (currentUser) checkSessionNow(); }, 2500);
        sessionCheckInterval = setInterval(() => {
            if (!currentUser || document.hidden) return;
            checkSessionNow(10000);
        }, 45000);
    }

    function stopSessionHeartbeat() {
        if (sessionCheckInterval) { clearInterval(sessionCheckInterval); sessionCheckInterval = null; }
    }

    // Інша вкладка вийшла / увійшла - синхронізуємось
    window.addEventListener('storage', (e) => {
        if (e.key === AUTH_KEY && currentUser) {
            if (!e.newValue) logout(false, false);
            else { const a = readAuth(); if (a && lowLogin(a.login) === lowLogin(currentUser)) auth = a; }
        }
    });

    // Дозавершення входу, зробленого офлайн
    async function completePendingLogin() {
        if (!pendingLogin || !navigator.onLine) return;
        const pl = pendingLogin;
        try {
            const r = await apiPost({ action: 'login', login: pl.login, pass: pl.pass }, 20000);
            if (r && r.success) {
                pendingLogin = null;
                writeAuth({ login: r.me.login, token: r.token }, pl.persist);
                applyEduData(r);
                storeVerifier(r.me.login, pl.pass);
                flushOutbox();
                startSessionHeartbeat();
            } else if (r && (r.code === 'bad_credentials' || r.code === 'no_password')) {
                pendingLogin = null;
                logout(false, false, 'expired');
            }
        } catch (e) {}
    }

    // Повернулися у вкладку / з'явився інтернет / сторінку відновлено з bfcache - перевіряємо одразу
    document.addEventListener('visibilitychange', () => { if (!document.hidden && currentUser) checkSessionNow(); });
    window.addEventListener('focus', () => { if (currentUser) checkSessionNow(); });
    window.addEventListener('online', () => { if (pendingLogin) completePendingLogin(); else if (currentUser) { checkSessionNow(); flushOutbox(); } });

    function parseUaDate(dateStr) {
        if (!dateStr) return null;
        let dStr = String(dateStr).trim();
        
        let m = dStr.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
        if (m) {
            return new Date(m[3], parseInt(m[2])-1, m[1], m[4]||0, m[5]||0, m[6]||0);
        }
        
        let d = new Date(dStr);
        if (!isNaN(d.getTime())) return d;
        
        return null;
    }

    function normalizeUaDate(dateStr) {
        let d = parseUaDate(dateStr);
        if (!d) return String(dateStr || "").trim();
        let yy = d.getFullYear();
        let mm = String(d.getMonth() + 1).padStart(2, '0');
        let dd = String(d.getDate()).padStart(2, '0');
        let hh = String(d.getHours()).padStart(2, '0');
        let mmin = String(d.getMinutes()).padStart(2, '0');
        return `${dd}.${mm}.${yy} ${hh}:${mmin}`;
    }

    function formatForDatetimeLocal(dateStr) {
        let d = parseUaDate(dateStr);
        if (!d) return '';
        let y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
        let hh = String(d.getHours()).padStart(2,'0'), mm = String(d.getMinutes()).padStart(2,'0');
        return `${y}-${m}-${dd}T${hh}:${mm}`;
    }

    function formatFromDatetimeLocal(localStr) {
        if (!localStr) return '';
        let d = new Date(localStr);
        if (isNaN(d.getTime())) return '';
        let y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
        let hh = String(d.getHours()).padStart(2,'0'), mm = String(d.getMinutes()).padStart(2,'0');
        return `${dd}.${m}.${y} ${hh}:${mm}`;
    }

    function cleanCourseTitle(str) { return !str ? "" : String(str).replace(/^✦\s*/, '').trim(); }
    function getCleanName(str) { return !str ? "" : cleanCourseTitle(str).toLowerCase().replace(/[^a-zа-яёієїґ0-9]/g, ''); }
    function escapeHTMLAttr(str) { return !str ? "" : String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

    function formatManagerName(fullName) {
        if (!fullName || fullName === "-") return "";
        let parts = String(fullName).trim().split(/\s+/);
        if (parts.length >= 2) return parts[0] + ' ' + parts[1];
        return parts[0] || "";
    }

    function extractFirstNameCapitalized(userObj) {
        if (!userObj) return "Колега";
        let raw = String(userObj.name || userObj.firstName || userObj.login || "").replace(/[\/\\,]/g, ' ').trim();
        let parts = raw.split(/\s+/).filter(Boolean);
        let first = parts.length >= 2 ? parts[1] : (parts[0] || "Колега");
        return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    }

    function parseTestResultString(resStr) {
        let out = { attempts: 0, time: 0, violations: 0, score: 0, raw: String(resStr || "").trim() };
        if (!out.raw) return out;
        let m4 = out.raw.match(/^(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)%?$/);
        if (m4) {
            out.attempts = parseInt(m4[1], 10) || 0;
            out.time = parseInt(m4[2], 10) || 0;
            out.violations = parseInt(m4[3], 10) || 0;
            out.score = parseInt(m4[4], 10) || 0;
            return out;
        }
        let m3 = out.raw.match(/^(\d+)\s*\/\s*(\d+)%(?:\/(\d+))?$/);
        if (m3) {
            out.attempts = parseInt(m3[1], 10) || 0;
            out.score = parseInt(m3[2], 10) || 0;
            out.time = parseInt(m3[3], 10) || 0;
            return out;
        }
        let m1 = out.raw.match(/^(\d+)%$/);
        if (m1) {
            out.attempts = 1;
            out.score = parseInt(m1[1], 10) || 0;
        }
        return out;
    }

    function formatTimeSeconds(totalSecs) {
        let secs = Math.max(0, parseInt(totalSecs, 10) || 0);
        let h = Math.floor(secs / 3600);
        let m = Math.floor((secs % 3600) / 60);
        let s = secs % 60;
        if (h > 0) return `${h} год ${m} хв ${s} с`;
        return `${m} хв ${s} с`;
    }

    function formatWithCustomEmoji(name, defaultIcon) {
        if (!name) return { icon: defaultIcon, title: "Без назви" };
        let cleaned = cleanCourseTitle(name);
        let match = cleaned.match(/^(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/);
        if (match) return { icon: match[0], title: cleaned.replace(match[0], '').trim() };
        return { icon: defaultIcon, title: cleaned };
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function goBackToIndex() { Academy.close(); }

    function handleFloatingBack() {
        let activeEl = document.querySelector('.view.active');
        let activeView = activeEl ? activeEl.id : 'loginView';
        
        if (activeView === 'loginView') {
            goBackToIndex();
        } else if (activeView === 'cabinetView') {
            if (windowViewingEmployee) switchToMyCabinet();
            else goBackToIndex();
        } else if (activeView === 'productView') {
            switchView('cabinetView');
            switchCabinetTab('courses');
        } else if (activeView === 'theoryView') {
            if (window.theoryEntryTime > 0) {
                window.sessionTotalTime += Math.floor((Date.now() - window.theoryEntryTime) / 1000);
                window.theoryEntryTime = 0;
            }
            switchView('productView');
        } else if (activeView === 'warningView') {
            switchView('theoryView');
        } else if (activeView === 'resultView') {
            openCourse(currentCourseName);
        }
    }

    function switchView(viewId) {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        let target = document.getElementById(viewId);
        if (target) target.classList.add('active');
        academyScrollTop();

        const exitBtn = document.getElementById('floatingExitBtn');
        exitBtn.style.display = (viewId === 'testView') ? 'none' : 'flex';

        requestAnimationFrame(() => {
            document.documentElement.classList.remove('edu-fast-boot');
        });
    }

    function switchCabinetTab(tabName, el = null) {
        requestAnimationFrame(() => {
            document.querySelectorAll('#cabinetTabs .tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            if (tabName === 'stats') {
                document.getElementById('tabBtnStats').classList.add('active');
                document.getElementById('tabStats').classList.add('active');
            } else {
                document.getElementById('tabBtnCourses').classList.add('active');
                document.getElementById('tabCourses').classList.add('active');
            }
        });
    }

    /* ====================== ЧЕРГА ВІДПРАВКИ (outbox) ======================
       Результати тестів і призначення курсів спершу пишуться на пристрій і
       відправляються, коли є мережа та токен. Кожен запис має id - сервер не додасть дубль. */
    function outboxRead() { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') || []; } catch (e) { return []; } }
    function outboxWrite(a) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(a)); } catch (e) {} }
    function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
    function outboxPending() { const me = lowLogin(currentUser); return outboxRead().some(x => x.actor === me); }

    function enqueue(item) {
        const q = outboxRead();
        item.id = newId(); item.actor = lowLogin(currentUser); item.ts = Date.now(); item.tries = 0;
        q.push(item); outboxWrite(q);
        flushOutbox();
        return item.id;
    }

    let _flushing = false;
    async function flushOutbox() {
        if (_flushing || !auth || !navigator.onLine) return;
        _flushing = true;
        try {
            // міграція черги старої версії
            try {
                const legacy = localStorage.getItem('skillhub_offline_queue');
                if (legacy) {
                    const q0 = outboxRead();
                    JSON.parse(legacy).forEach(it => q0.push({ action: 'save_score', login: it.login, product: it.product, score: it.score, time: it.time, violations: it.violations, id: newId(), actor: lowLogin(it.login), ts: it.timestamp || Date.now(), tries: 0 }));
                    outboxWrite(q0); localStorage.removeItem('skillhub_offline_queue');
                }
            } catch (e) { try { localStorage.removeItem('skillhub_offline_queue'); } catch (e2) {} }

            const me = lowLogin(auth.login);
            const snapshot = outboxRead().filter(x => x.actor === me);
            const finished = new Set(), tries = {};
            for (const it of snapshot) {
                try {
                    const body = Object.assign({}, it, { login: auth.login, token: auth.token });
                    delete body.actor; delete body.tries; delete body.ts;
                    const r = await apiPost(body, 20000);
                    if (r && r.success) { finished.add(it.id); continue; }
                    if (r && isAuthCode(r.code)) { handleAuthLost(r.code); break; }
                    const n = (it.tries || 0) + 1; tries[it.id] = n;
                    if (/forbidden/.test(String(r && r.error))) { finished.add(it.id); alert('Немає прав для цієї зміни.'); }
                    else if (n >= 5) finished.add(it.id);
                } catch (e) { break; } // мережа - спробуємо пізніше
            }
            outboxWrite(outboxRead().filter(x => !finished.has(x.id)).map(x => { if (tries[x.id]) x.tries = tries[x.id]; return x; }));
        } finally { _flushing = false; }
    }

    let _eduFetching = false;
    async function fetchFreshDataSilent(isManual = false) {
        if (!navigator.onLine || _eduFetching) return;
        _eduFetching = true;
        try { await _fetchFreshDataSilentInner(isManual); } finally { _eduFetching = false; }
    }
    // Застосувати відповідь сервера (login / edu) до стану застосунку й кешу
    function applyEduData(data) {
        window.fullData = { educationData: data.educationData, achievementData: data.achievementData || [], me: data.me || null };
        eduSaveCache(JSON.stringify(window.fullData));
        eduDb = data.educationData;
        globalAchievements = data.achievementData || [];
    }

    async function _fetchFreshDataSilentInner(isManual = false) {
        if (!auth) return;
        await flushOutbox();
        if (!auth) return;
        try {
            const data = await apiPost(authBody({ action: 'edu' }), 15000);
            if (data && isAuthCode(data.code)) { handleAuthLost(data.code); return; }
            if (!(data && data.success && data.educationData && data.educationData.users)) return;

            // Є ще не відправлені зміни - не затираємо їх застарілими даними з сервера
            if (outboxPending()) return;
            applyEduData(data);

            if (currentUser) {
                let user = eduDb.users.find(u => String(u.login).toLowerCase() === String(currentUser).toLowerCase());
                if (user) {
                    if (document.getElementById('cabinetView').classList.contains('active')) {
                        if (windowViewingEmployee) {
                            let updatedEmp = eduDb.users.find(u => String(u.login).toLowerCase() === String(windowViewingEmployee.login).toLowerCase());
                            if (updatedEmp) {
                                windowViewingEmployee = updatedEmp;
                                buildCoursesMap(updatedEmp);
                                renderCabinetStatsAndCourses(updatedEmp);
                                startDeadlineTimer();
                            }
                        } else {
                            buildCoursesMap(user);
                            renderCabinetStatsAndCourses(user);
                            startDeadlineTimer();
                            checkNewAchievements(user);
                        }
                    } else if (document.getElementById('productView').classList.contains('active')) {
                        openCourse(currentCourseName);
                    }
                }
            }
        } catch(e) {}
    }

    async function forceRefresh() {
        if (!navigator.onLine) { alert("Немає підключення до інтернету!"); return; }
        document.getElementById('loaderText').innerText = "Оновлення даних...";
        document.getElementById('loader').style.display = 'flex';
        await fetchFreshDataSilent(true);
        document.getElementById('loader').style.display = 'none';
        document.getElementById('loaderText').innerText = "Синхронізація з базою...";
    }

    function computeRemainingDeadlineMs(userObj) {
        if (!userObj) return null;
        let days = parseFloat(String(userObj.deadlineDays || "").replace(',', '.'));
        let assignStr = String(userObj.assignDate || "").trim();
        
        if (!isNaN(days) && days > 0 && assignStr) {
            let m = assignStr.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
            if (m) {
                let dObj = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10), parseInt(m[4] || "0", 10), parseInt(m[5] || "0", 10), parseInt(m[6] || "0", 10));
                if (!isNaN(dObj.getTime())) {
                    let targetMs = dObj.getTime() + days * 24 * 60 * 60 * 1000;
                    return targetMs - Date.now();
                }
            }
        }
        
        let rawK = String(userObj.deadline || "").trim();
        if (!rawK) return null;
        let lowK = rawK.toLowerCase();
        if (lowK.includes("вийшов") || lowK.includes("закрито") || lowK.includes("завершено") || lowK.includes("прострочено")) return -1;

        let dMatch = rawK.match(/(\d+)\s*дн/i), hMatch = rawK.match(/(\d+)\s*год/i), mMatch = rawK.match(/(\d+)\s*хв/i);
        if (dMatch || hMatch || mMatch) {
            let d = dMatch ? parseInt(dMatch[1], 10) : 0, h = hMatch ? parseInt(hMatch[1], 10) : 0, mins = mMatch ? parseInt(mMatch[1], 10) : 0;
            let totalMs = ((d * 24 + h) * 60 + mins) * 60 * 1000;
            let cacheKey = `dl_sync_${userObj.login}_${rawK}`;
            let syncEpoch = parseInt(sessionStorage.getItem(cacheKey), 10);
            if (!syncEpoch) { syncEpoch = Date.now(); sessionStorage.setItem(cacheKey, String(syncEpoch)); }
            return totalMs - (Date.now() - syncEpoch);
        }
        return null;
    }

    function startDeadlineTimer() {
        if (deadlineInterval) clearInterval(deadlineInterval);
        const container = document.getElementById('deadlineContainer');
        const textEl = document.getElementById('deadlineText');
        const iconEl = document.getElementById('deadlineIcon');

        let user = windowViewingEmployee || (eduDb && eduDb.users ? eduDb.users.find(u => String(u.login).toLowerCase() === String(currentUser).toLowerCase()) : null);
        
        if (!user || detectRoleGroup(user.role) === 'guest') {
            container.style.display = 'none'; window.isDeadlinePassed = false; updateTestButtonState(); return;
        }

        const tick = () => {
            let diffMs = computeRemainingDeadlineMs(user);
            if (diffMs === null) {
                container.style.display = 'none'; container.classList.remove('deadline-urgent', 'deadline-expired');
                window.isDeadlinePassed = false; updateTestButtonState(); return;
            }
            container.style.display = 'flex';
            if (diffMs <= 0) {
                iconEl.style.display = 'none'; textEl.innerText = "🔒Час вийшов";
                container.classList.remove('deadline-urgent'); container.classList.add('deadline-expired');
                window.isDeadlinePassed = true; clearInterval(deadlineInterval); updateTestButtonState();
            } else {
                iconEl.style.display = 'inline-block';
                let totalMinutes = Math.floor(diffMs / (1000 * 60)), d = Math.floor(totalMinutes / (60 * 24)), h = Math.floor((totalMinutes % (60 * 24)) / 60), m = totalMinutes % 60;
                textEl.innerText = `Залишок до дедлайну: ${d} дн. ${h} год. ${String(m).padStart(2, '0')} хв.`;
                window.isDeadlinePassed = false;
                if (diffMs < 60 * 60 * 1000) { container.classList.add('deadline-urgent'); container.classList.remove('deadline-expired'); } 
                else { container.classList.remove('deadline-urgent', 'deadline-expired'); }
                updateTestButtonState();
            }
        };
        tick();
        deadlineInterval = setInterval(tick, 1000);
    }

    function updateTestButtonState() {
        const btn = document.getElementById('startTestButton');
        const warnBox = document.getElementById('testWarningBox');
        if (!btn) return;
        if (windowViewingEmployee || windowUserRole === 'guest') {
            btn.style.display = 'none'; if (warnBox) warnBox.style.display = 'none'; return;
        }
        btn.style.display = 'flex';
        if (warnBox) warnBox.style.display = 'block';
        if (window.isDeadlinePassed) { btn.disabled = true; btn.innerText = "🔒Час вийшов"; } 
        else { btn.disabled = false; btn.innerText = "ПРОЙТИ ТЕСТ"; }
    }

    // Автовхід із кешу: пароль не потрібен, є токен
    function bootFromCache() {
        let user = eduDb && eduDb.users && auth ? eduDb.users.find(u => lowLogin(u.login) === lowLogin(auth.login)) : null;
        if (user) {
            currentUser = user.login;
            windowUserRole = detectRoleGroup(user.role);
            windowViewingEmployee = null;
            switchToMyCabinet();
            return true;
        }
        document.documentElement.classList.remove('edu-fast-boot');
        document.getElementById('loader').style.display = 'none';
        switchView('loginView');
        return false;
    }

    function showLoginError(text) {
        const err = document.getElementById('errorMsg');
        err.innerText = text; err.style.display = 'block';
    }

    async function handleLogin(isAuto = false, legacy = null) {
        const loginBtn = document.getElementById('loginSubmitBtn');
        const err = document.getElementById('errorMsg');
        try {
            const l = legacy ? legacy.login : document.getElementById('loginInput').value.trim();
            const p = legacy ? legacy.pass : document.getElementById('passInput').value.trim();
            if (!l) { if (!isAuto) showLoginError("Введіть логін"); return; }
            const persist = document.getElementById('rememberMe').checked;
            if (!isAuto && loginBtn) { loginBtn.disabled = true; loginBtn.innerText = "ВХІД..."; }
            err.style.display = 'none';

            let r = null, netFail = false;
            if (navigator.onLine) {
                try { r = await apiPost({ action: 'login', login: l, pass: p }, 20000); } catch (e) { netFail = true; }
            } else netFail = true;

            if (r && r.success) {
                writeAuth({ login: r.me.login, token: r.token }, persist);
                applyEduData(r);
                storeVerifier(r.me.login, p);
                let user = eduDb.users.find(u => lowLogin(u.login) === lowLogin(r.me.login));
                currentUser = r.me.login;
                windowUserRole = detectRoleGroup(user ? user.role : r.me.role);
                windowViewingEmployee = null;
                pendingLogin = null;
                switchToMyCabinet();
                flushOutbox();
                return;
            }
            if (r && !netFail) {
                if (r.code === 'locked') showLoginError("Забагато спроб. Спробуйте через " + (r.minutes || 15) + " хв.");
                else if (r.code === 'no_password') showLoginError("Для цього акаунту не задано пароль. Зверніться до керівника.");
                else if (r.error === 'legacy_disabled') showLoginError("Оновіть застосунок.");
                else showLoginError("Невірний логін або пароль!");
                if (isAuto) switchView('loginView');
                return;
            }

            // Мережі немає (або сервер недоступний): офлайн-вхід за відбитком пароля й кешем
            const cachedUser = eduDb && eduDb.users ? eduDb.users.find(u => lowLogin(u.login) === lowLogin(l)) : null;
            if (cachedUser && await checkVerifier(l, p)) {
                currentUser = cachedUser.login;
                pendingLogin = { login: l, pass: p, persist: persist };
                windowUserRole = detectRoleGroup(cachedUser.role);
                windowViewingEmployee = null;
                switchToMyCabinet();
                return;
            }
            if (cachedUser) showLoginError("Немає зв'язку. Офлайн можна увійти тільки з тим паролем, з яким ви входили раніше.");
            else showLoginError("Немає зв'язку з сервером. Для першого входу потрібен інтернет.");
            if (isAuto) switchView('loginView');
        } catch (error) {
            showLoginError("Сталася помилка. Спробуйте ще раз.");
        } finally {
            if (loginBtn) { loginBtn.disabled = false; loginBtn.innerText = "УВІЙТИ"; }
        }
    }

    function logout(forced = false, explicit = false, reason = '') {
        stopSessionHeartbeat();
        isTestActive = false; if (testTimerInterval) { clearInterval(testTimerInterval); testTimerInterval = null; }
        if (explicit && auth && navigator.onLine) {
            try { apiPost({ action: 'logout', login: auth.login, token: auth.token }, 5000).catch(() => {}); } catch (e) {}
        }
        if (forced) { alert("Ваш акаунт було відкрито на іншому пристрої. Сесію на цьому пристрої завершено."); }
        if (deadlineInterval) clearInterval(deadlineInterval);
        if (meetPulseInterval) clearInterval(meetPulseInterval);

        closeStatsModal(); closeAssignModal(); closeMeetModal();

        currentUser = null; windowViewingEmployee = null; coursesMap = {}; pendingLogin = null;
        clearAuthStore();

        if (explicit) { document.getElementById('loginInput').value = ''; document.getElementById('passInput').value = ''; }
        switchView('loginView');
        if (reason === 'expired') showLoginError("Сесію завершено. Увійдіть знову.");
    }

    function buildCoursesMap(user) {
        coursesMap = {};
        if (!user || !eduDb) return;
        let roleGroup = detectRoleGroup(user.role);
        let currentUserAssigned = user.assigned || [];

        (eduDb.courses || []).forEach(c => {
            let cleanProdTitle = cleanCourseTitle(c.product);
            let pClean = getCleanName(cleanProdTitle);
            let isAssigned = (roleGroup === 'guest') || currentUserAssigned.some(assignedName => getCleanName(assignedName) === pClean);

            if (isAssigned) {
                let groupName = String(c.course || "Курси").trim();
                if (!coursesMap[groupName]) coursesMap[groupName] = [];
                if (!coursesMap[groupName].some(existing => getCleanName(existing.product) === pClean)) {
                    coursesMap[groupName].push({
                        course: groupName, product: cleanProdTitle, info: c.info, test: c.test, 
                        presentations: c.presentations || [], skillhubLink: c.skillhubLink || ""
                    });
                }
            }
        });
    }

    function renderMeetButton(user) {
        const container = document.getElementById('meetButtonContainer');
        
        let linkVal = String(user.meetLink || "").trim();
        let dateVal = String(user.meetDate || "").trim();
        if (linkVal === "-") linkVal = "";
        if (dateVal === "-") dateVal = "";
        
        let hasLink = linkVal !== "";
        let hasDate = dateVal !== "";

        if (hasLink || hasDate) {
            let dateTxt = hasDate ? `<div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-top:2px;">🗓 ${escapeHTMLAttr(dateVal)}</div>` : '';
            
            let linkHref = "javascript:void(0)";
            let onclick = "alert('Посилання на зустріч ще не додано. Зверніться до керівника.');";
            let btnStyle = "padding: 8px 14px; border-radius: 10px; font-size: 12px; text-decoration:none; white-space: nowrap;";
            
            if (hasLink) {
                linkHref = linkVal.includes("http") ? escapeHTMLAttr(linkVal) : "https://" + escapeHTMLAttr(linkVal).replace(/^https?:\/\//,'');
                onclick = "";
            } else {
                btnStyle += " opacity: 0.6;";
            }

            let linkBtn = `<a href="${linkHref}" target="${hasLink ? '_blank' : '_self'}" onclick="${onclick}" class="btn btn-glow" style="${btnStyle}">ПРИЄДНАТИСЯ</a>`;

            container.innerHTML = `
                <div class="list-card" style="border-color: var(--primary); background: var(--primary-light); margin-bottom: 0; cursor: default;">
                    <img src="assets/icons/academy/meet.svg" class="ui-icon" style="width:28px; height:28px;" onerror="this.style.display='none'">
                    <div style="flex:1; margin-left: 14px; padding-right: 10px;">
                        <div style="font-size: 15px; font-weight: 800; color: var(--primary);">Google Meet</div>
                        ${dateTxt}
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; flex-shrink: 0;">
                        ${linkBtn}
                    </div>
                </div>
            `;
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    }

    function checkUpcomingMeets() {
        if (windowUserRole !== 'owner') return;
        let btn = document.getElementById('btnMyMeets');
        if (!btn) return;
        
        let hasApproaching = false;
        if (eduDb && eduDb.users) {
            let now = Date.now();
            hasApproaching = eduDb.users.some(u => {
                let d = parseUaDate(u.meetDate);
                if (!d) return false;
                let diff = d.getTime() - now;
                return diff > 0 && diff <= 60 * 60 * 1000;
            });
        }

        if (hasApproaching) {
            btn.classList.add('has-new');
        } else {
            btn.classList.remove('has-new');
        }
    }

    /* ===== ІНВАЙТ: копіювання тексту для входу в буфер обміну ===== */
    function buildInviteText(emp) {
        if (emp && emp.welcomeText) return emp.welcomeText; // готовий текст з колонки CY таблиці
        return 'Вітаю, ' + extractFirstNameCapitalized(emp) + ' 👋\n' +
               'Твої дані для входу в SkillHUB Academy\n\n' +
               '👤 `' + (emp.login || '') + '`\n\n' +
               '🔑 `' + (emp.pass || '—') + '`\n\n' +
               'Як знайти?\n' +
               'SkillHUB ➔ SkillHUB Academy';
    }

    function copyTextToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed; top:0; left:0; width:1px; height:1px; opacity:0; user-select:text; -webkit-user-select:text;';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ta.setSelectionRange(0, text.length);
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            document.body.removeChild(ta);
            ok ? resolve() : reject(new Error('copy failed'));
        });
    }

    let inviteResetTimer = null;
    function copyInvite() {
        const emp = windowViewingEmployee;
        if (!emp) return;
        if (!(windowUserRole === 'manager' || windowUserRole === 'owner')) return;

        const btn = document.getElementById('inviteBtn');
        const label = document.getElementById('inviteBtnLabel');
        const setLabel = function (text, copied) {
            label.innerText = text;
            btn.classList.toggle('copied', !!copied);
        };

        copyTextToClipboard(buildInviteText(emp)).then(function () {
            setLabel('Скопійовано ✓', true);
        }).catch(function () {
            setLabel('Помилка копіювання', false);
        }).then(function () {
            clearTimeout(inviteResetTimer);
            inviteResetTimer = setTimeout(function () { setLabel('Інвайт', false); }, 1800);
        });
    }

    function switchToMyCabinet() {
        windowViewingEmployee = null;
        closeStatsModal(); closeAssignModal(); closeMeetModal();

        let user = eduDb.users.find(u => String(u.login).toLowerCase() === String(currentUser).toLowerCase());
        if (!user) return;

        windowUserRole = detectRoleGroup(user.role);
        let firstName = extractFirstNameCapitalized(user);
        
        document.getElementById('cabinetTitle').innerText = 'Особистий кабінет';
        document.getElementById('userWelcome').innerHTML = `Вітаю, ${escapeHTMLAttr(firstName)} <span style="font-size: 15px; margin-left: 4px;">👋</span>`;

        const managerBar = document.getElementById('managerActionBar');
        if (windowUserRole === 'owner' || windowUserRole === 'manager') {
            managerBar.style.display = 'grid';
            managerBar.style.gridTemplateColumns = (windowUserRole === 'owner') ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)';
            
            document.getElementById('btnMyEducation').classList.add('active');
            document.getElementById('btnTeamStats').classList.remove('active');
            
            let meetBtn = document.getElementById('btnMyMeets');
            if (windowUserRole === 'owner') {
                meetBtn.style.display = 'flex';
                meetBtn.classList.remove('active');
                if (!meetPulseInterval) {
                    checkUpcomingMeets();
                    meetPulseInterval = setInterval(checkUpcomingMeets, 60000);
                }
            } else {
                meetBtn.style.display = 'none';
                if (meetPulseInterval) clearInterval(meetPulseInterval);
            }
        } else {
            managerBar.style.display = 'none';
        }

        document.getElementById('viewingEmployeeBanner').style.display = 'none';
        document.getElementById('employeeEarnedAchievementsSection').style.display = 'none';
        document.getElementById('employeeTestsResultsSection').style.display = 'none';

        renderMeetButton(user);
        buildCoursesMap(user);
        renderCabinetStatsAndCourses(user);
        startDeadlineTimer();
        checkNewAchievements(user);
        
        startSessionHeartbeat();
        switchView('cabinetView');
        switchCabinetTab('stats');
    }

    function getAccessibleEmployeesList() {
        if (!eduDb || !eduDb.users) return [];
        let me = eduDb.users.find(u => String(u.login).toLowerCase() === String(currentUser).toLowerCase());
        if (!me) return [];
        
        let myNameLow = String(me.name || "").toLowerCase().trim();
        let myParts = myNameLow.split(/\s+/).filter(Boolean);
        let myShort = myParts.length >= 2 ? `${myParts[0]} ${myParts[1]}` : myNameLow;

        return eduDb.users.filter(u => {
            if (!u.name || String(u.name).trim() === "") return false;
            if (detectRoleGroup(u.role) === 'guest') return false;
            if (windowUserRole === 'owner') return true;
            if (windowUserRole === 'manager') {
                let uManager = String(u.manager || u.director || "").toLowerCase().trim();
                if (!uManager) return false;
                return uManager === myNameLow || uManager.includes(myShort) || myNameLow.includes(uManager);
            }
            return false;
        });
    }

    function openStatsModal() {
        if (windowUserRole !== 'owner' && windowUserRole !== 'manager') return;
        document.getElementById('btnMyEducation').classList.remove('active');
        document.getElementById('btnTeamStats').classList.add('active');
        if (windowUserRole === 'owner') document.getElementById('btnMyMeets').classList.remove('active');
        
        document.getElementById('modalRoleScopeHint').innerText = windowUserRole === 'owner' ? 'Усі співробітники (Власник)' : 'Підпорядковані співробітники (Керівник)';
        
        document.getElementById('empSearchInput').value = '';
        document.getElementById('empSearchClearBtn').style.display = 'none';
        document.getElementById('empSearchSuggestions').classList.remove('open');
        
        // Скидання фільтрів при відкритті
        document.getElementById('f_assigned').checked = false;
        document.getElementById('f_deadline').checked = false;
        document.getElementById('f_oral').checked = false;
        document.getElementById('f_meet').checked = false;
        document.getElementById('filterPanel').style.display = 'none';
        document.getElementById('filterActiveDot').style.display = 'none';
        
        populateManagerFilter();
        
        renderStatsModalEmployees('');
        document.getElementById('statsModalOverlay').classList.add('active');
        document.getElementById('statsModal').classList.add('active');
        academyScroll(true);
    }

    function closeStatsModal() {
        document.getElementById('statsModalOverlay').classList.remove('active');
        document.getElementById('statsModal').classList.remove('active');
        document.getElementById('empSearchSuggestions').classList.remove('open');
        academyScroll(false);
        
        if (!windowViewingEmployee && (windowUserRole === 'owner' || windowUserRole === 'manager')) {
            document.getElementById('btnMyEducation').classList.add('active');
            document.getElementById('btnTeamStats').classList.remove('active');
        }
    }

    function clearEmployeeSearch() {
        const inp = document.getElementById('empSearchInput');
        inp.value = '';
        document.getElementById('empSearchClearBtn').style.display = 'none';
        document.getElementById('empSearchSuggestions').classList.remove('open');
        renderStatsModalEmployees('');
        inp.focus();
    }

    function onEmployeeSearchInput(query) {
        let q = String(query || "").trim();
        let qLow = q.toLowerCase();
        
        const clearBtn = document.getElementById('empSearchClearBtn');
        const suggBox = document.getElementById('empSearchSuggestions');
        clearBtn.style.display = q.length > 0 ? 'block' : 'none';

        let list = getAccessibleEmployeesList();
        
        // Застосовуємо фільтри при підказках також
        list = filterEmployeesLogic(list);

        if (q.length > 0) {
            let matches = list.filter(u => String(u.name).toLowerCase().includes(qLow)).slice(0, 6);
            if (matches.length > 0) {
                suggBox.innerHTML = matches.map(u => {
                    let safeName = escapeHTMLAttr(u.name);
                    let regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                    let highlighted = safeName.replace(regex, '<span class="suggestion-highlight">$1</span>');
                    let st = computeUserMetrics(u);
                    return `<div class="suggestion-item" onclick="selectEmployeeFromModal('${escapeHTMLAttr(u.login)}')">
                                <span>${highlighted}</span><span style="font-size:12px; color:var(--text-muted);">${st.completed}/${st.totalAssigned}</span>
                            </div>`;
                }).join('');
                suggBox.classList.add('open');
            } else {
                suggBox.innerHTML = `<div style="padding: 12px 16px; font-size: 13px; color: var(--text-muted);">Збігів за ПІБ не знайдено</div>`;
                suggBox.classList.add('open');
            }
        } else { suggBox.classList.remove('open'); }
        
        renderStatsModalEmployees(qLow);
    }

    function filterEmployeesLogic(employees) {
        const f_assigned = document.getElementById('f_assigned') ? document.getElementById('f_assigned').checked : false;
        const f_deadline = document.getElementById('f_deadline') ? document.getElementById('f_deadline').checked : false;
        const f_meet = document.getElementById('f_meet') ? document.getElementById('f_meet').checked : false;
        const f_oral = document.getElementById('f_oral') ? document.getElementById('f_oral').checked : false;
        const f_manager = document.getElementById('f_manager') ? document.getElementById('f_manager').value : "";

        return employees.filter(u => {
            if (f_assigned && (!u.assigned || u.assigned.length === 0)) return false;
            
            if (f_deadline) {
                let hasD = u.deadlineDays && parseFloat(u.deadlineDays) > 0;
                let hasD2 = u.deadline && u.deadline.trim() !== "-" && u.deadline.trim() !== "";
                if (!hasD && !hasD2) return false;
            }

            if (f_meet) {
                let hasL = u.meetLink && String(u.meetLink).trim() !== "" && String(u.meetLink).trim() !== "-";
                let hasD = u.meetDate && String(u.meetDate).trim() !== "" && String(u.meetDate).trim() !== "-";
                if (!hasL && !hasD) return false;
            }

            if (f_oral) {
                let o = String(u.oralExam || "").trim().toLowerCase();
                if (o === "" || o === "-" || o === "немає" || o === "ні" || o === "false" || o === "0") return false;
            }

            if (f_manager && f_manager !== "") {
                if (formatManagerName(u.manager) !== f_manager) return false;
            }

            return true;
        });
    }

    function renderStatsModalEmployees(filterQueryLow) {
        let employees = getAccessibleEmployeesList();
        
        employees = filterEmployeesLogic(employees);

        if (filterQueryLow) {
            employees = employees.filter(u => String(u.name).toLowerCase().includes(filterQueryLow));
        }

        // Встановлення індикатора фільтру
        const f_assigned = document.getElementById('f_assigned').checked;
        const f_deadline = document.getElementById('f_deadline').checked;
        const f_meet = document.getElementById('f_meet').checked;
        const f_oral = document.getElementById('f_oral').checked;
        const f_manager = document.getElementById('f_manager').value;
        let hasActiveFilters = f_assigned || f_deadline || f_meet || f_oral || (f_manager !== "");
        document.getElementById('filterActiveDot').style.display = hasActiveFilters ? 'block' : 'none';

        document.getElementById('modalEmpCount').innerText = `Знайдено: ${employees.length}`;
        
        if (employees.length === 0) {
            document.getElementById('statsModalUsersList').innerHTML = `<div style="text-align:center; padding: 32px 16px; color: var(--text-muted); font-weight: 600;">Співробітників не знайдено</div>`;
            return;
        }

        let html = employees.map(u => {
            let m = computeUserMetrics(u);
            let borderCol = 'var(--border)';
            if (m.totalAssigned > 0) {
                if (m.completed === m.totalAssigned) borderCol = 'rgba(22, 79, 88, 0.7)';
                else if (m.started > 0) borderCol = 'rgba(245, 158, 11, 0.6)';
            }
            let storeTxt = (u.store && u.store !== "-") ? `📍 ${escapeHTMLAttr(u.store)}` : "";
            let mgrTxt = (u.manager && u.manager !== "-") ? `👤 Керівник: ${escapeHTMLAttr(formatManagerName(u.manager))}` : "";
            
            return `
                <div class="list-card" style="border-color: ${borderCol}; padding: 14px 16px;" onclick="selectEmployeeFromModal('${escapeHTMLAttr(u.login)}')">
                    <div style="flex: 1; padding-right: 10px;">
                        <div style="font-size: 15px; font-weight: 800; color: var(--primary); margin-bottom: 4px;">${escapeHTMLAttr(u.name)}</div>
                        <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); display: flex; flex-direction: column; gap: 2px;">
                            ${storeTxt ? `<span>${storeTxt}</span>` : ''}
                            ${mgrTxt ? `<span>${mgrTxt}</span>` : ''}
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
                            <span style="font-size: 11px; font-weight: 700; background: var(--input-bg); padding: 3px 8px; border-radius: 6px; color: var(--text-main);">Середній бал: ${m.avgScoreFormatted}</span>
                            <span style="font-size: 11px; font-weight: 700; background: var(--input-bg); padding: 3px 8px; border-radius: 6px; color: var(--text-muted);">Спроб: ${m.attempts}</span>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; flex-shrink: 0;">
                        <div style="font-size: 16px; font-weight: 900; color: ${(m.totalAssigned > 0 && m.completed === m.totalAssigned) ? 'var(--success)' : 'var(--text-main)'};">
                            ${m.completed}<span style="font-size: 12px; color: var(--text-muted);">/${m.totalAssigned}</span>
                        </div>
                        <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Пройдено</div>
                        <div class="list-card-arrow" style="margin-top: 4px;">❯</div>
                    </div>
                </div>
            `;
        }).join('');
        document.getElementById('statsModalUsersList').innerHTML = html;
    }

    function selectEmployeeFromModal(login) {
        let emp = eduDb.users.find(u => String(u.login).toLowerCase() === String(login).toLowerCase());
        if (!emp) return;
        
        windowViewingEmployee = emp;
        closeStatsModal(); closeMeetModal();
        
        document.getElementById('btnMyEducation').classList.remove('active');
        document.getElementById('btnTeamStats').classList.add('active');
        if (windowUserRole === 'owner') document.getElementById('btnMyMeets').classList.remove('active');
        
        document.getElementById('cabinetTitle').innerText = 'Статистика співробітника';
        document.getElementById('userWelcome').innerHTML = `<strong style="color:var(--text-main); font-size: 16px;">${escapeHTMLAttr(emp.name)}</strong>`;

        let metaParts = [];
        if (emp.role) metaParts.push(emp.role);
        if (emp.store && emp.store !== "-") metaParts.push(emp.store);
        if (emp.manager && emp.manager !== "-") metaParts.push(`Керівник: ${formatManagerName(emp.manager)}`);
        
        document.getElementById('viewingEmployeeMeta').innerText = metaParts.join(' • ');
        
        // «Призначити» та «Інвайт» - тільки для Власника і Керівника
        const canManageTeam = (windowUserRole === 'manager' || windowUserRole === 'owner');
        document.getElementById('assignCoursesBtn').style.display = canManageTeam ? 'flex' : 'none';
        document.getElementById('inviteBtn').style.display = canManageTeam ? 'flex' : 'none';
        
        document.getElementById('viewingEmployeeBanner').style.display = 'flex';

        renderMeetButton(emp);
        buildCoursesMap(emp);
        renderCabinetStatsAndCourses(emp);
        renderEmployeeAchievementsAndTests(emp);
        startDeadlineTimer();

        switchView('cabinetView');
        switchCabinetTab('stats');
    }

    function openMeetModal() {
        if (windowUserRole !== 'owner') return;
        document.getElementById('btnMyEducation').classList.remove('active');
        document.getElementById('btnTeamStats').classList.remove('active');
        document.getElementById('btnMyMeets').classList.add('active');

        renderMeetList();
        document.getElementById('meetModalOverlay').classList.add('active');
        document.getElementById('meetModal').classList.add('active');
        academyScroll(true);
        checkUpcomingMeets();
    }

    function closeMeetModal() {
        document.getElementById('meetModalOverlay').classList.remove('active');
        document.getElementById('meetModal').classList.remove('active');
        academyScroll(false);
        
        document.getElementById('btnMyMeets').classList.remove('active');
        if (!windowViewingEmployee) {
            document.getElementById('btnMyEducation').classList.add('active');
        } else {
            document.getElementById('btnTeamStats').classList.add('active');
        }
        checkUpcomingMeets();
    }

    function renderMeetList() {
        let listContainer = document.getElementById('meetModalList');
        if (!eduDb || !eduDb.users) return;

        let meets = eduDb.users.filter(u => {
            let l = String(u.meetLink || "").trim();
            let d = String(u.meetDate || "").trim();
            return (l !== "" && l !== "-") || (d !== "" && d !== "-");
        }).map(u => {
            let dObj = parseUaDate(u.meetDate);
            let sortDate = dObj ? dObj.getTime() : 9999999999999;
            return { user: u, dateObj: dObj, sortDate: sortDate };
        }).sort((a, b) => a.sortDate - b.sortDate);

        if (meets.length === 0) {
            listContainer.innerHTML = `<div style="text-align:center; padding: 32px 16px; color: var(--text-muted); font-weight: 600;">Немає запланованих зустрічей</div>`;
            return;
        }

        let html = meets.map(item => {
            let u = item.user;
            let storeTxt = (u.store && u.store !== "-") ? `📍 ${escapeHTMLAttr(u.store)}` : "";
            
            let isApproaching = false;
            if (item.dateObj) {
                let timeDiff = item.dateObj.getTime() - Date.now();
                isApproaching = timeDiff > 0 && timeDiff <= 60 * 60 * 1000;
            }
            
            let borderCol = isApproaching ? 'var(--primary)' : 'var(--border)';
            let bgClass = isApproaching ? 'background: var(--primary-light);' : '';
            
            let dateVal = String(u.meetDate || "").trim();
            let linkVal = String(u.meetLink || "").trim();
            if (linkVal === "-") linkVal = "";
            if (dateVal === "-") dateVal = "";
            
            let hasLink = linkVal !== "";
            let dateDisplay = dateVal !== "" ? escapeHTMLAttr(dateVal) : "Дата не вказана";
            
            let linkHref = "javascript:void(0)";
            let onclick = "alert('Посилання на зустріч ще не додано. Оновіть дані або перевірте пізніше.');";
            let btnStyle = "padding: 8px 14px; border-radius: 10px; font-size: 12px; text-decoration:none; white-space:nowrap;";
            
            if (hasLink) {
                linkHref = linkVal.includes("http") ? escapeHTMLAttr(linkVal) : "https://" + escapeHTMLAttr(linkVal).replace(/^https?:\/\//,'');
                onclick = "";
            } else {
                btnStyle += " opacity: 0.6;";
            }
            
            let linkBtn = `<a href="${linkHref}" target="${hasLink ? '_blank' : '_self'}" onclick="${onclick}" class="btn btn-glow" style="${btnStyle}">ПРИЄДНАТИСЯ</a>`;

            return `
                <div class="list-card" style="border-color: ${borderCol}; ${bgClass} padding: 14px 16px; cursor:default;">
                    <div style="flex: 1; padding-right: 10px;">
                        <div style="font-size: 15px; font-weight: 800; color: var(--primary); margin-bottom: 4px;">${escapeHTMLAttr(u.name)}</div>
                        <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); display: flex; flex-direction: column; gap: 2px;">
                            ${storeTxt ? `<span>${storeTxt}</span>` : ''}
                            <span>🗓 ${dateDisplay}</span>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; flex-shrink: 0;">
                        ${linkBtn}
                    </div>
                </div>
            `;
        }).join('');

        listContainer.innerHTML = html;
    }

    let originalAssignments = {};
    let pendingAssignments = {};
    let originalDeadline = "";
    let pendingDeadline = "";
    let originalMeetLink = "";
    let originalMeetDate = "";

    function openAssignModal() {
        if (!windowViewingEmployee) return;
        
        const modal = document.getElementById('assignModal');
        const overlay = document.getElementById('assignModalOverlay');
        const list = document.getElementById('assignCourseList');
        const saveBtn = document.getElementById('saveAssignBtn');
        const meetInputs = document.getElementById('ownerMeetInputs');

        let html = '';
        originalAssignments = {};
        pendingAssignments = {};
        
        originalDeadline = String(windowViewingEmployee.deadlineDays || "").trim();
        pendingDeadline = originalDeadline;
        
        originalMeetLink = String(windowViewingEmployee.meetLink || "").trim();
        originalMeetDate = normalizeUaDate(windowViewingEmployee.meetDate);

        let deadlineInput = document.getElementById('assignDeadlineInput');
        deadlineInput.value = originalDeadline;

        if (windowUserRole === 'owner') {
            meetInputs.style.display = 'flex';
            document.getElementById('assignMeetLink').value = originalMeetLink;
            document.getElementById('assignMeetDate').value = formatForDatetimeLocal(originalMeetDate);
        } else {
            meetInputs.style.display = 'none';
        }

        if (windowUserRole === 'manager' && originalDeadline && parseInt(originalDeadline) > 0) {
            deadlineInput.disabled = true;
        } else {
            deadlineInput.disabled = false;
        }

        if (eduDb.courseCatalog && eduDb.courseCatalog.length > 0) {
            eduDb.courseCatalog.forEach(c => {
                if (!c.name || c.name.trim() === '') return;
                
                let cleanKey = c.name.toLowerCase().replace(/[^a-zа-яёієїґ0-9]/g, '');
                let isAssigned = (windowViewingEmployee.assigned || []).some(a => getCleanName(a) === cleanKey);
                
                originalAssignments[cleanKey] = isAssigned;
                pendingAssignments[cleanKey] = isAssigned;

                let isDisabled = false;
                if (windowUserRole === 'manager' && isAssigned) {
                    isDisabled = true; 
                }

                html += `
                <label class="answer-label" style="display:flex; justify-content:space-between; align-items:center; opacity: ${isDisabled ? 0.6 : 1}; margin-bottom: 8px;">
                    <span style="font-weight:700;">${escapeHTMLAttr(c.name)}</span>
                    <input type="checkbox" onchange="toggleAssign('${cleanKey}', this.checked)" ${isAssigned ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
                </label>
                `;
            });
        } else {
            html = `<div style="text-align:center; padding: 20px; color: var(--text-muted);">Каталог курсів порожній</div>`;
        }

        list.innerHTML = html;
        saveBtn.style.display = 'none';
        
        modal.classList.add('active');
        overlay.classList.add('active');
        academyScroll(true);
    }

    function closeAssignModal() {
        document.getElementById('assignModal').classList.remove('active');
        document.getElementById('assignModalOverlay').classList.remove('active');
        academyScroll(false);
    }

    function toggleDeadline(val) { pendingDeadline = String(val).trim(); checkAssignChanges(); }
    function toggleAssign(key, isChecked) { pendingAssignments[key] = isChecked; checkAssignChanges(); }

    function checkAssignChanges() {
        let hasChanges = false;
        if (pendingDeadline !== originalDeadline) hasChanges = true;
        
        if (windowUserRole === 'owner') {
            let mLink = document.getElementById('assignMeetLink').value.trim();
            let mDate = formatFromDatetimeLocal(document.getElementById('assignMeetDate').value);
            if (mLink !== originalMeetLink) hasChanges = true;
            if (mDate !== originalMeetDate) hasChanges = true;
        }

        for (let k in pendingAssignments) {
            if (pendingAssignments[k] !== originalAssignments[k]) { hasChanges = true; break; }
        }
        document.getElementById('saveAssignBtn').style.display = hasChanges ? 'flex' : 'none';
    }

    function getOriginalCourseNameByKey(cleanKey) {
        if (!eduDb || !eduDb.courseCatalog) return cleanKey;
        let catCourse = eduDb.courseCatalog.find(c => getCleanName(c.name) === cleanKey);
        return catCourse ? catCourse.name : cleanKey; 
    }

    async function saveAssignments() {
        let changes = {};
        for (let key in pendingAssignments) {
            if (pendingAssignments[key] !== originalAssignments[key]) {
                changes[key] = pendingAssignments[key];
            }
        }
        
        const saveBtn = document.getElementById('saveAssignBtn');
        saveBtn.innerHTML = '<img src="assets/icons/academy/save.svg" class="ui-icon" style="width:20px; height:20px; filter: brightness(0) invert(1);"> ЗБЕРЕЖЕННЯ...'; 
        saveBtn.disabled = true;

        let payload = { action: 'assign_courses', targetLogin: windowViewingEmployee.login, assignments: changes };
        if (pendingDeadline !== originalDeadline) payload.deadlineDays = pendingDeadline;

        if (windowUserRole === 'owner') {
            let mLink = document.getElementById('assignMeetLink').value.trim();
            let mDate = formatFromDatetimeLocal(document.getElementById('assignMeetDate').value);
            payload.meetLink = mLink;
            payload.meetDate = mDate;
        }

        if (payload.deadlineDays !== undefined) windowViewingEmployee.deadlineDays = payload.deadlineDays;
        if (payload.meetLink !== undefined) windowViewingEmployee.meetLink = payload.meetLink;
        if (payload.meetDate !== undefined) windowViewingEmployee.meetDate = payload.meetDate;
        
        let newAssigned = [...(windowViewingEmployee.assigned || [])];
        for (let key in changes) {
            let originalName = getOriginalCourseNameByKey(key);
            if (changes[key] === true) {
                if (!newAssigned.some(c => getCleanName(c) === key)) newAssigned.push(originalName);
            } else {
                newAssigned = newAssigned.filter(c => getCleanName(c) !== key);
            }
        }
        windowViewingEmployee.assigned = newAssigned;

        let dbUser = eduDb.users.find(u => u.login === windowViewingEmployee.login);
        if (dbUser) {
            dbUser.deadlineDays = windowViewingEmployee.deadlineDays;
            dbUser.assigned = windowViewingEmployee.assigned;
            dbUser.meetLink = windowViewingEmployee.meetLink;
            dbUser.meetDate = windowViewingEmployee.meetDate;
        }

        enqueue(payload); // надійна черга: збережеться навіть без мережі й відправиться пізніше

        closeAssignModal();

        setTimeout(() => {
            saveBtn.innerHTML = '<img src="assets/icons/academy/save.svg" class="ui-icon" style="width:20px; height:20px; filter: brightness(0) invert(1);"> ЗБЕРЕГТИ';
            saveBtn.disabled = false;
            saveBtn.style.display = 'none';
        }, 300);

        buildCoursesMap(windowViewingEmployee);
        renderCabinetStatsAndCourses(windowViewingEmployee);
        renderEmployeeAchievementsAndTests(windowViewingEmployee);
        startDeadlineTimer();
        checkUpcomingMeets();
    }

    function openSkillhubFrame(url) {
        if (!url) return;
        window.open(url, '_blank');
    }

    function closeSkillhubFrame() {
        document.getElementById('skillhubIframe').src = '';
        document.getElementById('skillhubModalOverlay').classList.remove('active');
        document.getElementById('skillhubModal').classList.remove('active');
        academyScroll(false);
    }

    function computeUserMetrics(user) {
        let st = user.stats || {};
        let assignedList = user.assigned || [];
        let resMap = user.results || {};
        let calcStarted = 0, calcCompleted = 0, calcAttempts = 0, calcTime = 0, calcViolations = 0, scoreSum = 0, scoreCount = 0;

        assignedList.forEach(courseName => {
            let key = getCleanName(courseName);
            let rawStr = resMap[courseName] || resMap[key];
            if (rawStr) {
                let parsed = parseTestResultString(rawStr);
                if (parsed.attempts > 0 || parsed.score > 0) {
                    calcStarted++; calcAttempts += parsed.attempts; calcTime += parsed.time; calcViolations += parsed.violations;
                    scoreSum += parsed.score; scoreCount++;
                    if (parsed.score >= 80) calcCompleted++;
                }
            }
        });

        let totalAssigned = (st.totalAssigned !== undefined && st.totalAssigned > 0) ? st.totalAssigned : assignedList.length;
        let started = (st.started !== undefined && st.started >= calcStarted) ? st.started : calcStarted;
        let completed = (st.completed !== undefined && st.completed >= calcCompleted) ? st.completed : calcCompleted;
        let remaining = Math.max(0, totalAssigned - completed);
        let attempts = (st.attempts !== undefined && st.attempts >= calcAttempts) ? st.attempts : calcAttempts;
        let timeSpent = (st.timeSpent !== undefined && st.timeSpent >= calcTime) ? st.timeSpent : calcTime;
        let violations = (st.violations !== undefined && st.violations >= calcViolations) ? st.violations : calcViolations;

        let avgScoreFormatted = "0%";
        if (st.avgScore && String(st.avgScore).trim() !== "" && String(st.avgScore).trim() !== "0,0%") {
            avgScoreFormatted = String(st.avgScore).trim();
            if (!avgScoreFormatted.endsWith('%')) avgScoreFormatted += '%';
        } else if (scoreCount > 0) { avgScoreFormatted = Math.round(scoreSum / scoreCount) + "%"; }

        let inProgress = Math.max(0, started - completed);
        let notStarted = Math.max(0, totalAssigned - started);

        return {
            totalAssigned, started, completed, remaining, attempts, avgScoreFormatted, timeSpent,
            timeFormatted: formatTimeSeconds(timeSpent), violations, inProgress, notStarted
        };
    }

    function renderProgressChart(passed, inProgress, notStarted) {
        let ctx = document.getElementById('progressChart');
        if (!ctx) return;
        if (typeof Chart === 'undefined') { loadChartJs().then(() => renderProgressChart(passed, inProgress, notStarted)).catch(() => {}); return; }
        if (window.progressChartInstance) window.progressChartInstance.destroy();

        let total = passed + inProgress + notStarted;
        let dataArr = total > 0 ? [passed, inProgress, notStarted] : [0, 0, 1];

        const outsideLabelsPlugin = {
            id: 'outsideLabels',
            afterDraw: (chart) => {
                const ctx = chart.ctx, dataset = chart.data.datasets[0], meta = chart.getDatasetMeta(0);
                if (!meta.data || meta.data.length === 0) return;
                const cTotal = dataset.data.reduce((a, b) => a + b, 0);
                if (cTotal === 0) return;

                meta.data.forEach((element, index) => {
                    const dataVal = dataset.data[index];
                    if (dataVal > 0) { 
                        const percentage = Math.round((dataVal / cTotal) * 100) + '%';
                        const startAngle = element.startAngle, endAngle = element.endAngle, middleAngle = startAngle + (endAngle - startAngle) / 2;
                        const outerRadius = element.outerRadius, xCenter = element.x, yCenter = element.y;

                        const xArc = xCenter + outerRadius * Math.cos(middleAngle), yArc = yCenter + outerRadius * Math.sin(middleAngle);
                        const offset = 8; 
                        const xBreak = xCenter + (outerRadius + offset) * Math.cos(middleAngle), yBreak = yCenter + (outerRadius + offset) * Math.sin(middleAngle);
                        const isRight = Math.cos(middleAngle) >= 0;
                        const xEnd = xBreak + (isRight ? 10 : -10), yEnd = yBreak;

                        ctx.beginPath(); ctx.moveTo(xArc, yArc); ctx.lineTo(xBreak, yBreak); ctx.lineTo(xEnd, yEnd);
                        ctx.strokeStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#98989d' : '#8e8e93';
                        ctx.lineWidth = 1.5; ctx.stroke();

                        ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#111827';
                        ctx.font = 'bold 13px Inter, sans-serif'; ctx.textAlign = isRight ? 'left' : 'right'; ctx.textBaseline = 'middle';
                        ctx.fillText(percentage, isRight ? xEnd + 4 : xEnd - 4, yEnd);
                    }
                });
            }
        };

        const bgColor = document.documentElement.getAttribute('data-theme') === 'dark' ? '#1c1c1e' : '#ffffff';
        const colorPassed = '#164f58', colorProgress = '#3a9c9f', colorRemaining = document.documentElement.getAttribute('data-theme') === 'dark' ? '#38383a' : '#e5e7eb';

        window.progressChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['Пройдено', 'В процесі', 'Залишилось'], datasets: [{ data: dataArr, backgroundColor: [colorPassed, colorProgress, colorRemaining], borderWidth: 3, borderColor: bgColor, hoverOffset: 4 }] },
            options: {
                layout: { padding: { left: 60, right: 60, top: 25, bottom: 25 } }, responsive: true, maintainAspectRatio: false, cutout: '45%', 
                plugins: {
                    legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 12, weight: '600' }, color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#fff' : '#111827', padding: 14, usePointStyle: true, pointStyle: 'rect' } },
                    tooltip: { backgroundColor: 'rgba(0,0,0,0.82)', titleFont: { family: 'Inter', size: 13 }, bodyFont: { family: 'Inter', size: 13 }, padding: 12, cornerRadius: 8, displayColors: false }
                }
            },
            plugins: [outsideLabelsPlugin]
        });
    }

    function renderCabinetStatsAndCourses(user) {
        let m = computeUserMetrics(user);
        document.getElementById('chartContainerBox').style.display = 'block';
        renderProgressChart(m.completed, m.inProgress, m.notStarted);

        let statsHtml = `
            <div class="stats-grid-8">
                <div class="stat-item"><div class="stat-val-modern">${m.totalAssigned}</div><div class="stat-label-modern">Загалом назначено курсів</div></div>
                <div class="stat-item"><div class="stat-val-modern" style="color: #3b82f6;">${m.started}</div><div class="stat-label-modern">Розпочато курсів</div></div>
                <div class="stat-item" style="border-color: rgba(22, 79, 88, 0.4);"><div class="stat-val-modern" style="color: var(--success);">${m.completed}</div><div class="stat-label-modern">Пройдено курсів</div></div>
                <div class="stat-item" style="border-color: rgba(245, 158, 11, 0.4);"><div class="stat-val-modern" style="color: #f59e0b;">${m.remaining}</div><div class="stat-label-modern">Залишилось курсів</div></div>
                <div class="stat-item"><div class="stat-val-modern">${m.attempts}</div><div class="stat-label-modern">Кількість спроб</div></div>
                <div class="stat-item"><div class="stat-val-modern">${m.avgScoreFormatted}</div><div class="stat-label-modern">Середній бал</div></div>
                <div class="stat-item"><div class="stat-val-modern" style="font-size: 16px;">${m.timeFormatted}</div><div class="stat-label-modern">Витрачено часу</div></div>
                <div class="stat-item" style="border-color: ${m.violations > 0 ? 'rgba(239,68,68,0.45)' : 'var(--border)'}; background: ${m.violations > 0 ? 'var(--danger-bg)' : 'var(--card-bg)'};">
                    <div class="stat-val-modern" style="color: ${m.violations > 0 ? 'var(--danger)' : 'var(--text-main)'};">${m.violations}</div><div class="stat-label-modern">Кількість порушень</div>
                </div>
            </div>
        `;

        const courseNames = Object.keys(coursesMap);
        let coursesHtml = '';
        let res = user.results || {};

        if (courseNames.length === 0) {
            coursesHtml = '<div style="text-align:center; background: var(--card-bg); border-radius: 16px; border: 1px solid var(--border); color: var(--text-muted); padding: 30px 20px; font-weight: 600;">Наразі не призначено жодного курсу.</div>';
        } else {
            coursesHtml = courseNames.map(name => {
                let parsed = formatWithCustomEmoji(name, '📘'), safeName = escapeHTMLAttr(name), courseProducts = coursesMap[name] || [];
                let cTotal = courseProducts.length, cPassed = 0;

                courseProducts.forEach(p => {
                    let cleanP = getCleanName(p.product), resStr = res[p.product] || res[cleanP];
                    if (resStr) { let pr = parseTestResultString(resStr); if (pr.score >= 80) cPassed++; }
                });

                let cardClass = (cTotal > 0 && cPassed === cTotal) ? "list-card completed" : "list-card";
                return `
                <div class="${cardClass}" onclick="openCourse(this.getAttribute('data-name'))" data-name="${safeName}">
                    <div class="list-card-title" style="flex: 1;"><span style="font-size: 16px;">${parsed.title}</span></div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="font-size: 15px; font-weight: 800; color: var(--text-main);">${cPassed} <span style="font-size: 13px; font-weight: 600; color: var(--text-muted);">/ ${cTotal}</span></div>
                        <div class="list-card-arrow">❯</div>
                    </div>
                </div>
                `;
            }).join('');
        }

        requestAnimationFrame(() => {
            document.getElementById('learningAnalyticsBlock').innerHTML = statsHtml;
            document.getElementById('courseList').innerHTML = coursesHtml;
        });
    }

    function renderEmployeeAchievementsAndTests(emp) {
        const achSec = document.getElementById('employeeEarnedAchievementsSection'), achContainer = document.getElementById('employeeEarnedAchievementsList');
        const testsSec = document.getElementById('employeeTestsResultsSection'), testsContainer = document.getElementById('employeeTestsResultsList');

        achSec.style.display = 'block'; testsSec.style.display = 'block';

        let achCodes = emp.achievements ? String(emp.achievements).split(',').map(s => s.trim()).filter(Boolean) : [];
        if (achCodes.length === 0) {
            achContainer.innerHTML = `<div style="background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 16px; text-align: center; color: var(--text-muted); font-size: 13px; font-weight: 600;">У співробітника поки немає зароблених відзнак</div>`;
        } else {
            achContainer.innerHTML = achCodes.map(code => {
                let achInfo = (globalAchievements || []).find(a => String(a.code).trim() === code);
                let title = achInfo && achInfo.name ? achInfo.name : `Відзнака #${code}`, desc = achInfo && achInfo.description ? achInfo.description : "", safeCode = escapeHTMLAttr(code);
                return `
                    <div class="ach-card earned" onclick="toggleAchZoom(this)">
                        <div class="ach-icon-wrapper"><img src="assets/achievements/${safeCode}.webp" onerror="this.src='assets/icons/ui/medal.svg'" class="ach-img"></div>
                        <div style="display: flex; flex-direction: column; justify-content: center; flex: 1;">
                            <div class="ach-card-title">${escapeHTMLAttr(title)}</div><div class="ach-card-desc">${escapeHTMLAttr(desc)}</div>
                            <div style="margin-top:6px;"><span style="color:var(--success); font-size:11px; font-weight:800;">НАТИСНІТЬ ДЛЯ ОПИСУ</span></div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        let assigned = emp.assigned || [], res = emp.results || {};
        if (assigned.length === 0) {
            testsContainer.innerHTML = `<div style="background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 16px; text-align: center; color: var(--text-muted); font-size: 13px; font-weight: 600;">Немає призначених тестів</div>`;
        } else {
            testsContainer.innerHTML = assigned.map((courseTitle, idx) => {
                let cleanTitle = cleanCourseTitle(courseTitle), key = getCleanName(cleanTitle), rawRes = res[cleanTitle] || res[key] || "";
                let parsed = parseTestResultString(rawRes), badgeColor = 'var(--text-muted)', statusText = 'Не розпочато';
                if (rawRes) {
                    statusText = `${parsed.score}%`;
                    if (parsed.score === 100) badgeColor = 'var(--success)'; else if (parsed.score >= 80) badgeColor = '#059669'; else badgeColor = 'var(--danger)';
                }
                return `
                    <div class="list-card" style="cursor: default; margin-bottom: 10px; padding: 14px 16px;">
                        <div style="flex: 1; padding-right: 10px;">
                            <div style="font-size: 14px; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">${idx + 1}. ${escapeHTMLAttr(cleanTitle)}</div>
                            <div style="font-size: 12px; font-weight: 600; color: var(--text-muted);">Спроб: <b>${parsed.attempts}</b> • Час: <b>${parsed.time} с</b> • Порушень: <b style="color:${parsed.violations > 0 ? 'var(--danger)' : 'inherit'};">${parsed.violations}</b></div>
                        </div>
                        <div style="text-align: right; flex-shrink: 0;">
                            <div style="font-size: 16px; font-weight: 900; color: ${badgeColor};">${statusText}</div>
                            ${rawRes ? `<div style="font-size: 10px; color: var(--text-muted); font-weight: 700;">${escapeHTMLAttr(rawRes)}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    function openCourse(name) {
        currentCourseName = name;
        let parsedCourse = formatWithCustomEmoji(name, '');
        document.getElementById('productViewTitle').innerText = parsedCourse.title;

        const products = coursesMap[name] || [];
        let currentUserObj = windowViewingEmployee || eduDb.users.find(u => String(u.login).toLowerCase() === String(currentUser).toLowerCase());
        let userResults = (currentUserObj && currentUserObj.results) ? currentUserObj.results : {};

        let completedCount = 0;
        products.forEach(p => {
            let cleanP = getCleanName(p.product), resStr = userResults[p.product] || userResults[cleanP];
            if (resStr) { let pr = parseTestResultString(resStr); if (pr.score >= 80) completedCount++; }
        });

        let percent = products.length > 0 ? Math.round((completedCount / products.length) * 100) : 0;
        let safePercent = Math.max(0, Math.min(percent, 100));

        let progressHtml = `
            <div class="adaptive-progress-bar" style="height:36px; border-radius:12px; margin-bottom:24px; border:1px solid var(--border); background:var(--input-bg); justify-content:center;">
                <div class="apb-fill" style="width:${safePercent}%; background:var(--primary); border-radius:inherit;"></div>
                <div class="apb-text" style="font-weight:800; font-size:14px; color:var(--text-main); text-shadow:0 0 4px rgba(255,255,255,0.9), 0 0 2px #fff;">Прогрес: ${percent}%</div>
            </div>
        `;

        let productsHtml = products.map((p, index) => {
            let cleanP = getCleanName(p.product), resStr = userResults[p.product] || userResults[cleanP];
            let pr = parseTestResultString(resStr), score = pr.score;
            let scoreColor = 'var(--text-muted)', scoreText = (windowUserRole === 'guest') ? 'Огляд' : 'Почати';
            if (resStr && (pr.attempts > 0 || score > 0)) {
                if (score === 100) { scoreColor = 'var(--success)'; scoreText = '100%'; } else if (score >= 90) { scoreColor = '#f97316'; scoreText = score + '%'; } else if (score >= 80) { scoreColor = '#a16207'; scoreText = score + '%'; } else { scoreColor = '#ef4444'; scoreText = score + '%'; }
            }
            let parsed = formatWithCustomEmoji(p.product, '📄'), cardClass = (score >= 80) ? "list-card completed" : "list-card";
            return `
            <div class="${cardClass}" onclick="openProduct(${index})">
                <div style="display: flex; align-items: center; gap: 14px; flex: 1; padding-right:10px;">
                    <div style="display: flex; flex-direction: column; justify-content: center;"><span style="font-size: 15px; font-weight: 700; color: var(--text-main); line-height: 1.25;">${escapeHTMLAttr(parsed.title)}</span></div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px; flex-shrink:0;">
                    <div style="font-size: 14px; font-weight: 800; color: ${scoreColor};">${scoreText}</div><div class="list-card-arrow">❯</div>
                </div>
            </div>
            `;
        }).join('');

        requestAnimationFrame(() => {
            document.getElementById('courseProgressContainer').innerHTML = progressHtml;
            document.getElementById('productList').innerHTML = productsHtml;
            switchView('productView');
        });
    }

    function openProduct(index) {
        const products = coursesMap[currentCourseName] || [];
        currentProductData = products[index];
        if (!currentProductData) return;

        let parsed = formatWithCustomEmoji(currentProductData.product, '📘');
        document.getElementById('theoryTitle').innerText = parsed.title;

        // Розмітка тексту з таблиці (заголовки, жирний, колір, картки...) - js/core/richtext.js
        let contentHtml = `<div class="theory-box">` + RichText.render(String(currentProductData.info || "Теоретичний матеріал відсутній."), {
            plain: line => `<div class="theory-line">${RichText.inline(line)}</div>`
        }) + `</div>`;

        // Кнопка «Детальніше про цей курс» - внизу блоку теорії (замість «Додаткових матеріалів»)
        if (currentProductData.skillhubLink) {
            let sLink = escapeHTMLAttr(currentProductData.skillhubLink);
            if (sLink && !sLink.startsWith('http')) {
                sLink = "https://" + sLink.replace(/^https?:\/\//,'');
            }
            contentHtml += `
            <a href="${sLink}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="margin-bottom: 24px; border-color: var(--primary); color: var(--primary); padding: 14px; font-size: 14px; font-weight: 800; text-decoration: none; display: flex; justify-content: center; align-items: center; gap: 8px; border-radius: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.02);">
                <img src="assets/icons/academy/info.svg" class="ui-icon" onerror="this.style.display='none'">
                Детальніше про цей курс
            </a>`;
        }

        document.getElementById('theoryContentContainer').innerHTML = contentHtml;

        window.sessionTotalTime = 0; window.theoryEntryTime = Date.now();
        updateTestButtonState();
        switchView('theoryView');
    }

    function parseTestString(testStr) {
        let lines = String(testStr || "").split('\n').map(l => l.trim()).filter(Boolean), questions = [], currentQ = null;
        lines.forEach(line => {
            let qMatch = line.match(/^(\d+)\.\s*(.*)/);
            if (qMatch) {
                if (currentQ) questions.push(currentQ);
                currentQ = { text: qMatch[2], answers: [], type: 'radio' };
            } else {
                let aMatch = line.match(/^\d+\/[a-zа-яA-ZА-ЯіІїЇєЄґҐ0-9]\)\s*(.*)/);
                if (aMatch && currentQ) {
                    let ansText = aMatch[1], isCorrect = false;
                    if (ansText.includes('(+)')) { isCorrect = true; ansText = ansText.replace(/\(\+\)/g, '').trim(); }
                    currentQ.answers.push({ text: ansText, correct: isCorrect });
                }
            }
        });
        if (currentQ) questions.push(currentQ);
        questions.forEach(q => { let correctCount = q.answers.filter(a => a.correct).length; if (correctCount > 1) q.type = 'checkbox'; });
        return questions;
    }

    function updateSelection(qIndex, aIndex) {
        let q = parsedQuestions[qIndex];
        if (q.type === 'radio') {
            q.answers.forEach((ans, idx) => {
                ans.selected = (idx === aIndex);
                let label = document.getElementById(`lbl_q${qIndex}_a${idx}`);
                if (label) { if (ans.selected) label.classList.add('selected'); else label.classList.remove('selected'); }
            });
        } else {
            let input = document.getElementById(`q${qIndex}_a${aIndex}`);
            q.answers[aIndex].selected = input.checked;
            let label = document.getElementById(`lbl_q${qIndex}_a${aIndex}`);
            if (input.checked) label.classList.add('selected'); else label.classList.remove('selected');
        }
    }

    function updateTimerUI() {
        let m = Math.floor(timeRemaining / 60).toString().padStart(2, '0'), s = (timeRemaining % 60).toString().padStart(2, '0');
        let el = document.getElementById('testTimer');
        el.innerText = `${m}:${s}`;
        if (timeRemaining <= 10) { el.style.color = "white"; el.style.background = "var(--danger)"; } 
        else { el.style.color = "var(--danger)"; el.style.background = "var(--danger-bg)"; }
    }

    function showQuestion(index) {
        if (index >= parsedQuestions.length) { submitTest(false); return; }
        let q = parsedQuestions[index], titleText = `Питання ${index + 1} з ${parsedQuestions.length}`;
        let answersHtml = q.answers.map((ans, aIndex) => {
            let checkedAttr = ans.selected ? 'checked' : '', selectedClass = ans.selected ? 'selected' : '';
            return `<label class="answer-label ${selectedClass}" id="lbl_q${index}_a${aIndex}"><input type="${q.type}" name="q_${index}" id="q${index}_a${aIndex}" ${checkedAttr} onchange="updateSelection(${index}, ${aIndex})"><span style="flex:1;">${ans.text}</span></label>`;
        }).join('');
        let hint = q.type === 'checkbox' ? `<span style="font-size:13px; font-weight:500; color:var(--text-muted); display:block; margin-top:6px;">(Множинний вибір)</span>` : '';
        let containerHtml = `<div class="question-card"><div class="question-title">${q.text} ${hint}</div>${answersHtml}</div>`;

        requestAnimationFrame(() => {
            document.getElementById('testHeaderTitle').innerText = titleText;
            document.getElementById('testContainer').innerHTML = containerHtml;
            let btn = document.getElementById('submitTestBtn');
            if (index === parsedQuestions.length - 1) { btn.innerText = "ЗАВЕРШИТИ ТЕСТ"; btn.onclick = () => submitTest(false); } 
            else { btn.innerText = "НАСТУПНЕ ПИТАННЯ"; btn.onclick = () => nextQuestion(); }
        });

        timeRemaining = TIME_PER_QUESTION; updateTimerUI();
        if (testTimerInterval) clearInterval(testTimerInterval);
        testTimerInterval = setInterval(() => {
            timeRemaining--; totalTimeSpent++; updateTimerUI();
            if (timeRemaining <= 0) { clearInterval(testTimerInterval); nextQuestion(); }
        }, 1000);
    }

    function nextQuestion() { if (testTimerInterval) clearInterval(testTimerInterval); currentQuestionIndex++; showQuestion(currentQuestionIndex); }

    async function startTest() {
        if (window.isDeadlinePassed || windowViewingEmployee || windowUserRole === 'guest') return;
        if (!currentProductData || !currentProductData.test || currentProductData.test.trim() === "") { alert("Тест для цього курсу відсутній."); return; }
        if (!(await checkSessionNow(4000))) return; // сесію перехоплено на іншому пристрої
        let warningShown = sessionStorage.getItem('skillhub_test_warning_shown');
        if (!warningShown) switchView('warningView'); else proceedToTest();
    }

    async function acceptWarningAndStart() { sessionStorage.setItem('skillhub_test_warning_shown', 'true'); if (!(await checkSessionNow(4000))) return; proceedToTest(); }

    function proceedToTest() {
        parsedQuestions = parseTestString(currentProductData.test);
        if (parsedQuestions.length === 0) { alert("Помилка обробки тесту."); return; }
        if (window.theoryEntryTime > 0) { window.sessionTotalTime += Math.floor((Date.now() - window.theoryEntryTime) / 1000); window.theoryEntryTime = 0; }
        totalTimeSpent = window.sessionTotalTime || 0;
        shuffleArray(parsedQuestions);
        parsedQuestions.forEach(q => { shuffleArray(q.answers); q.answers.forEach(a => a.selected = false); });
        currentQuestionIndex = 0; isTestActive = true; isCheatingTriggered = false;
        switchView('testView'); showQuestion(currentQuestionIndex);
    }

    function retryTest() { window.sessionTotalTime = 0; window.theoryEntryTime = 0; startTest(); }
    function repeatTheory() { window.sessionTotalTime = 0; window.theoryEntryTime = Date.now(); switchView('theoryView'); }

    async function submitTest(forceZeroByCheat = false) {
        isTestActive = false; if (testTimerInterval) clearInterval(testTimerInterval);
        let correctCount = 0;
        if (!forceZeroByCheat) {
            parsedQuestions.forEach(q => {
                let isQuestionCorrect = true, answeredAnything = false;
                q.answers.forEach(ans => { if (ans.selected) answeredAnything = true; if (!!ans.selected !== ans.correct) isQuestionCorrect = false; });
                if (isQuestionCorrect && answeredAnything) correctCount++;
            });
        }
        let totalScore = forceZeroByCheat ? 0 : Math.round((correctCount / parsedQuestions.length) * 100);
        let passed = totalScore >= 80, timeSpentNow = Math.max(1, totalTimeSpent), violationAdded = forceZeroByCheat ? 1 : 0;
        let cleanTitle = cleanCourseTitle(currentProductData.product), cleanKey = getCleanName(cleanTitle);

        let currentUserObj = eduDb.users.find(u => String(u.login).toLowerCase() === String(currentUser).toLowerCase());
        if (currentUserObj) {
            if (!currentUserObj.results) currentUserObj.results = {};
            let prevRaw = currentUserObj.results[cleanTitle] || currentUserObj.results[cleanKey] || "", prev = parseTestResultString(prevRaw);
            let newAttempts = prev.attempts + 1, newTotalTime = prev.time + timeSpentNow, newViolations = prev.violations + violationAdded, newBestScore = Math.max(prev.score, totalScore);
            let formattedResult = `${newAttempts}/${newTotalTime}/${newViolations}/${newBestScore}%`;
            currentUserObj.results[cleanTitle] = formattedResult; currentUserObj.results[cleanKey] = formattedResult;
            if (currentUserObj.stats) {
                currentUserObj.stats.attempts = (currentUserObj.stats.attempts || 0) + 1;
                currentUserObj.stats.timeSpent = (currentUserObj.stats.timeSpent || 0) + timeSpentNow;
                currentUserObj.stats.violations = (currentUserObj.stats.violations || 0) + violationAdded;
            }
        }
        window.sessionTotalTime = 0; window.theoryEntryTime = 0;
        if (window.fullData) { window.fullData.educationData = eduDb; eduSaveCacheLater(); }

        let actionHtml = passed
            ? `<button class="btn btn-glow" onclick="openCourse(this.getAttribute('data-course'))" data-course="${escapeHTMLAttr(currentCourseName)}">ПЕРЕЙТИ ДАЛІ</button>`
            : `<button class="btn btn-glow" style="margin-bottom: 16px;" onclick="retryTest()">СПРОБУВАТИ ЩЕ РАЗ</button><button class="btn btn-secondary" style="border-radius: 14px;" onclick="repeatTheory()">ПОВТОРИТИ ТЕОРІЮ</button>`;

        requestAnimationFrame(() => {
            document.getElementById('resultEmoji').innerText = passed ? '🏆' : '📝';
            document.getElementById('resultTitle').innerText = passed ? 'Тест складено!' : 'Потрібно повторити';
            document.getElementById('resultTitle').style.color = passed ? 'var(--success)' : 'var(--danger)';
            document.getElementById('resultSubtitle').innerHTML = `Твій результат: <strong style="font-size:22px; color: var(--text-main); margin: 0 4px;">${totalScore}%</strong><br><span style="font-size:14px; margin-top: 6px; display:inline-block;">(${correctCount} з ${parsedQuestions.length} правильних)</span>`;
            document.getElementById('resultActionContainer').innerHTML = actionHtml;
            switchView('resultView');
        });

        let payload = { action: 'save_score', login: currentUser, product: cleanTitle, score: totalScore, time: timeSpentNow, violations: violationAdded };
        enqueue(payload);
    }

    document.addEventListener('contextmenu', event => { if (document.getElementById('testView').classList.contains('active')) event.preventDefault(); });
    document.addEventListener('copy', event => { if (document.getElementById('testView').classList.contains('active')) { event.preventDefault(); alert("Копіювання матеріалів тесту заборонено!"); } });
    document.addEventListener('keydown', (e) => {
        if (document.getElementById('testView').classList.contains('active')) {
            if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) || (e.ctrlKey && (e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S' || e.key === 'f' || e.key === 'F'))) {
                e.preventDefault(); alert("Ця дія тимчасово заблокована задля чесності тестування!");
            }
        }
    });

    function triggerAntiCheat() {
        if (!isTestActive || isCheatingTriggered) return;
        isCheatingTriggered = true; isTestActive = false;
        if (testTimerInterval) clearInterval(testTimerInterval);
        document.body.classList.add('cheating');
        if (currentUser) { let cheats = parseInt(localStorage.getItem('cheats_' + currentUser)) || 0; localStorage.setItem('cheats_' + currentUser, cheats + 1); }
        setTimeout(() => { alert("⛔ Порушення правил! Ви згорнули вікно або відвели фокус. Спробу зараховано з результатом 0%."); document.body.classList.remove('cheating'); submitTest(true); }, 150);
    }
    window.addEventListener('blur', triggerAntiCheat); window.addEventListener('pagehide', triggerAntiCheat); document.addEventListener('visibilitychange', () => { if (document.hidden) triggerAntiCheat(); }); document.addEventListener('touchcancel', triggerAntiCheat);

    document.addEventListener('click', (e) => {
        const wrap = document.querySelector('.search-box-wrap'), sugg = document.getElementById('empSearchSuggestions');
        if (wrap && sugg && !wrap.contains(e.target)) sugg.classList.remove('open');
    });

    let _academyInit = null;
    // Ініціалізація при першому відкритті розділу (кеш -> автовхід за токеном)
    function academyInit() {
        if (_academyInit) return _academyInit;
        _academyInit = (async () => {
        await purgeLegacyStorage();
        let hasCache = false;
        const cached = await eduLoadCache();
        if (cached) {
            window.fullData = cached;
            eduDb = cached.educationData;
            globalAchievements = cached.achievementData || [];
            hasCache = true;
        }

        // Старий формат: логін+пароль у відкритому вигляді -> один раз входимо через сервер
        let oldCreds = null;
        try { const raw = localStorage.getItem('skillhub_edu_creds_old'); if (raw) oldCreds = JSON.parse(raw); } catch (e) {}

        auth = readAuth();
        const cacheHasMe = !!(auth && hasCache && eduDb && eduDb.users && eduDb.users.some(u => lowLogin(u.login) === lowLogin(auth.login)));

        if (auth) {
            document.getElementById('loginInput').value = auth.login;
            document.getElementById('rememberMe').checked = !!localStorage.getItem(AUTH_KEY);
            if (cacheHasMe) {
                // Миттєвий старт із кешу (працює й без інтернету), свіжі дані - тихо у фоні
                document.getElementById('loader').style.display = 'none'; bootFromCache();
                setTimeout(() => { if (navigator.onLine) fetchFreshDataSilent(); }, 200);
            } else if (navigator.onLine) {
                document.documentElement.classList.remove('edu-fast-boot');
                document.documentElement.style.setProperty('--edu-loader-display', 'flex'); document.getElementById('loader').style.display = 'flex';
                await fetchFreshDataSilent(true);
                document.getElementById('loader').style.display = 'none';
                if (auth && eduDb && eduDb.users && eduDb.users.length > 0) bootFromCache(); else switchView('loginView');
            } else {
                document.documentElement.classList.remove('edu-fast-boot');
                document.getElementById('loader').style.display = 'none'; switchView('loginView');
            }
        } else {
            document.documentElement.classList.remove('edu-fast-boot');
            document.documentElement.style.setProperty('--edu-loader-display', 'flex');
            document.getElementById('loader').style.display = 'none'; switchView('loginView');
            if (oldCreds && oldCreds.login && oldCreds.pass && navigator.onLine) {
                try { localStorage.removeItem('skillhub_edu_creds_old'); } catch (e) {}
                document.getElementById('rememberMe').checked = true;
                await handleLogin(true, oldCreds);
            }
        }
        })();
        return _academyInit;
    }



    /* ====================== Публічний інтерфейс розділу «Академія» ====================== */
    window.Academy = {
        isOpen: false,
        async open(opts) {
            const root = academyRoot();
            if (!root) return;
            if (typeof window.closeModalBase === 'function') {
                ['favQuickMenuModal', 'favSelectModal'].forEach(id => { try { window.closeModalBase(id); } catch (e) {} });
            }
            await academyInit();
            root.hidden = false;
            document.body.classList.add('academy-open');
            this.isOpen = true;
            if (!(opts && opts.fromPopstate)) { try { history.pushState({ academy: 1 }, '', '#academy'); } catch (e) {} }
            if (currentUser) checkSessionNow();
            if (navigator.onLine && auth) fetchFreshDataSilent();
        },
        close(opts) {
            const root = academyRoot();
            if (!root || !this.isOpen) return;
            root.hidden = true;
            document.body.classList.remove('academy-open');
            this.isOpen = false;
            if (!(opts && opts.fromPopstate)) {
                try {
                    if (history.state && history.state.academy) history.back();
                    else if (location.hash === '#academy') history.replaceState(null, '', location.pathname + location.search);
                } catch (e) {}
            }
        }
    };
    window.addEventListener('popstate', () => {
        if (location.hash === '#academy' && !window.Academy.isOpen) window.Academy.open({ fromPopstate: true });
        else if (location.hash !== '#academy' && window.Academy.isOpen) window.Academy.close({ fromPopstate: true });
    });
    // Пряме посилання на розділ (#academy), у т.ч. зі старої адреси Education.html
    window.addEventListener('load', () => { if (location.hash === '#academy') window.Academy.open({ fromPopstate: true }); });

    window.addEventListener('pageshow', function(event) {
        if (event.persisted) {
            document.documentElement.style.setProperty('--edu-loader-display', 'none');
            const loader = document.getElementById('loader'); if (loader) loader.style.display = 'none';
            document.documentElement.classList.remove('edu-fast-boot');
            if (currentUser) checkSessionNow();
        }
    });
