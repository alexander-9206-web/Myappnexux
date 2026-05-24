/**
 * NEXUS i18n — carga locales/es.json + en.json vía bundles JS (file:// y PWA).
 * API: nexusT('nav.modules.accounts'), nexusSetLanguage('en'), nexusApplyI18nDom()
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'nexus_ui_lang';
    const SUPPORTED = ['es', 'en'];
    const DEFAULT_LANG = 'es';

    let currentLang = DEFAULT_LANG;
    let ready = false;
    const listeners = [];

    function getBundles() {
        return global.NEXUS_LOCALES || {};
    }

    function deepGet(obj, path) {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
    }

    function interpolate(str, params) {
        if (!params || typeof str !== 'string') return str;
        return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (params[k] != null ? String(params[k]) : ''));
    }

    function normalizeLang(lang) {
        const l = String(lang || '').toLowerCase().slice(0, 2);
        return SUPPORTED.includes(l) ? l : DEFAULT_LANG;
    }

    function nexusT(key, params, lang) {
        const l = normalizeLang(lang || currentLang);
        const bundles = getBundles();
        let val = deepGet(bundles[l], key);
        if (val === undefined && l !== DEFAULT_LANG) val = deepGet(bundles[DEFAULT_LANG], key);
        if (val === undefined) return key;
        return interpolate(String(val), params);
    }

    function nexusGetLanguage() {
        return currentLang;
    }

    function applyDocumentLang(lang) {
        const l = normalizeLang(lang);
        const html = global.document && global.document.documentElement;
        if (html) html.setAttribute('lang', l);
        const meta = deepGet(getBundles()[l], 'meta');
        if (html && meta && meta.dir) html.setAttribute('dir', meta.dir);
    }

    function applySystemModulesI18n() {
        if (!global.SYSTEM_MODULES || !Array.isArray(global.SYSTEM_MODULES)) return;
        global.SYSTEM_MODULES.forEach((m) => {
            if (!m || !m.id) return;
            const name = nexusT('nav.modules.' + m.id);
            const title = nexusT('nav.moduleTitles.' + m.id);
            if (name && name !== 'nav.modules.' + m.id) m.name = name;
            if (title && title !== 'nav.moduleTitles.' + m.id) m.title = title;
        });
    }

    function applyTabHeadings() {
        const map = [
            ['tab-projects', 'tabs.projects'],
            ['tab-scanner', 'tabs.scanner'],
            ['tab-taxes', 'tabs.taxes'],
            ['tab-database', 'tabs.database'],
            ['tab-analysis', 'tabs.analysis'],
            ['tab-finances', 'tabs.finances'],
            ['tab-report', 'tabs.report'],
            ['tab-budget', 'tabs.budget'],
            ['tab-settings', 'tabs.settings'],
            ['tab-accounts', 'tabs.accounts'],
            ['tab-loans', 'tabs.loans'],
            ['tab-afterpay', 'tabs.afterpay'],
            ['tab-calendar', 'tabs.calendar'],
            ['tab-tasks', 'tabs.tasks']
        ];
        map.forEach(([tabId, key]) => {
            const section = global.document && global.document.getElementById(tabId);
            if (!section) return;
            const h2 = section.querySelector('h2');
            if (h2) h2.textContent = nexusT(key);
        });
        const settingsH2 = global.document && global.document.querySelector('#tab-settings h2');
        if (settingsH2) settingsH2.textContent = nexusT('tabs.settings');
    }

    function applyKnownIds() {
        const idMap = {
            'login-search-user': ['placeholder', 'auth.searchVault'],
            'db-filter-search': ['placeholder', 'audit.searchPlaceholder'],
            'ap-filter-search': ['placeholder', 'afterpay.searchPlaceholder'],
            'acc-form-title': ['text', 'accounts.formTitle'],
            'fa-balance-lbl': ['text', null],
            'set-language': ['options', null]
        };
        Object.keys(idMap).forEach((id) => {
            const el = global.document && global.document.getElementById(id);
            if (!el) return;
            const spec = idMap[id];
            if (id === 'fa-balance-lbl' && typeof global.nexusUpdateAccountBalanceLabel === 'function') {
                global.nexusUpdateAccountBalanceLabel();
                return;
            }
            if (spec[0] === 'placeholder' && spec[1]) el.placeholder = nexusT(spec[1]);
            if (spec[0] === 'text' && spec[1]) el.textContent = nexusT(spec[1]);
        });
        const creditHelp = global.document && global.document.querySelector('#credit-fields > p.col-span-2');
        if (creditHelp) creditHelp.innerHTML = '<i class="fa-solid fa-circle-info text-red-400 mr-1"></i>' + nexusT('accounts.creditHelpIntro').replace(/\./g, '. ').replace(/Cupo total/g, '<b>Cupo total</b>').replace(/Monto endeudado/g, '<b>Monto endeudado</b>').replace(/Cupo disponible/g, '<b>Cupo disponible</b>');
        if (currentLang === 'en' && creditHelp) {
            creditHelp.innerHTML = '<i class="fa-solid fa-circle-info text-red-400 mr-1"></i><b>Total limit</b> = bank maximum. <b>Amount owed</b> = posted purchase balance (statement). <b>Available credit</b> = Total limit − Amount owed (Nexus calculates on purchase).';
        }
    }

    function nexusApplyI18nDom(root) {
        const scope = root || (global.document && global.document.body);
        if (!scope || !scope.querySelectorAll) return;
        scope.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            if (!key) return;
            const val = nexusT(key);
            if (val === key) return;
            const attr = el.getAttribute('data-i18n-attr');
            if (attr) el.setAttribute(attr, val);
            else el.textContent = val;
        });
        scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) el.placeholder = nexusT(key);
        });
        scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
            const key = el.getAttribute('data-i18n-title');
            if (key) el.title = nexusT(key);
        });
        applySystemModulesI18n();
        applyTabHeadings();
        applyKnownIds();
        if (typeof global.renderDashboard === 'function' && global.state && global.state.activeTab === 'database') global.renderDatabase();
        if (typeof global.renderHome === 'function') global.renderHome();
        if (typeof global.updateDashboard === 'function') global.updateDashboard();
    }

    function persistLanguage(lang) {
        try { global.localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
        if (global.state && global.state.settings) {
            global.state.settings.uiLanguage = lang;
            if (typeof global.saveState === 'function') global.saveState();
        }
    }

    function readStoredLanguage() {
        try {
            const s = global.localStorage.getItem(STORAGE_KEY);
            if (s) return normalizeLang(s);
        } catch (e) { /* ignore */ }
        if (global.state && global.state.settings && global.state.settings.uiLanguage) {
            return normalizeLang(global.state.settings.uiLanguage);
        }
        return DEFAULT_LANG;
    }

    function nexusSetLanguage(lang, opts) {
        const options = opts || {};
        const next = normalizeLang(lang);
        if (next === currentLang && ready && !options.force) return;
        currentLang = next;
        applyDocumentLang(next);
        persistLanguage(next);
        const sel = global.document && global.document.getElementById('set-language');
        if (sel && sel.value !== next) sel.value = next;
        nexusApplyI18nDom();
        listeners.forEach((fn) => { try { fn(next); } catch (e) { console.warn(e); } });
    }

    function nexusInitI18n() {
        if (!getBundles().es && !getBundles().en) {
            console.warn('[NEXUS i18n] Carga locales/nexus-locale-es.js y nexus-locale-en.js antes de nexus-i18n.js');
            return;
        }
        currentLang = readStoredLanguage();
        applyDocumentLang(currentLang);
        ready = true;
        nexusApplyI18nDom();
        const sel = global.document && global.document.getElementById('set-language');
        if (sel) sel.value = currentLang;
    }

    function nexusOnLanguageChange(fn) {
        if (typeof fn === 'function') listeners.push(fn);
    }

    global.nexusT = nexusT;
    global.nexusSetLanguage = nexusSetLanguage;
    global.nexusGetLanguage = nexusGetLanguage;
    global.nexusApplyI18nDom = nexusApplyI18nDom;
    global.nexusInitI18n = nexusInitI18n;
    global.nexusOnLanguageChange = nexusOnLanguageChange;
    global.NEXUS_I18N_SUPPORTED = SUPPORTED.slice();

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', () => {
            try { nexusInitI18n(); } catch (e) { console.warn(e); }
        });
    } else {
        setTimeout(() => { try { nexusInitI18n(); } catch (e) { console.warn(e); } }, 0);
    }
})(typeof window !== 'undefined' ? window : globalThis);
