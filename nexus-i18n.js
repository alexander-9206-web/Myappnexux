/**
 * NEXUS i18n — English (US). UI nativa vía claves + catálogo exacto.
 * No traduce datos del usuario (movimientos, notas, categorías propias).
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'nexus_ui_lang';
    const SUPPORTED = ['es', 'en'];
    const DEFAULT_LANG = 'es';

    let currentLang = DEFAULT_LANG;
    let ready = false;
    let loadPromise = null;
    let esToEnMap = null;
    let applyScheduled = false;
    const listeners = [];

    function getBundles() {
        return global.NEXUS_LOCALES || {};
    }

    function deepGet(obj, path) {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
    }

    function normalizeText(t) {
        return String(t || '').replace(/\s+/g, ' ').trim();
    }

    function isTemplateString(s) {
        return /\$\{|fmt\(|onclick|type=\"|class=\"|function\s*\(|^\{/.test(String(s || ''));
    }

    function isValidUiString(s) {
        const t = normalizeText(s);
        if (t.length < 2 || t.length > 420) return false;
        if (isTemplateString(t)) return false;
        if (/^[\d\s$€£.,:;|/\\\-+=%#@*()[\]{}]+$/.test(t)) return false;
        return /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(t);
    }

    /** Rechaza traducciones corruptas del script anterior. */
    function isLikelyEnglish(s) {
        const t = normalizeText(s);
        if (!t || /[áéíóúüñÁÉÍÓÚÜÑ]/.test(t)) return false;
        if (/theindtor|Accortot|ptogtor|Ctoteg|Stheect|toudit|Inwithtr|Fintonc|Antor the|Setorch|Dtheete|Ctoncthe|Btock|Mor\b/i.test(t)) {
            return false;
        }
        return true;
    }

    function collectLocaleStrings(obj, prefix, out) {
        if (!obj || typeof obj !== 'object') return;
        Object.keys(obj).forEach((k) => {
            if (k === 'meta') return;
            const p = prefix ? `${prefix}.${k}` : k;
            const v = obj[k];
            if (k === 'auto' && v && typeof v === 'object') {
                Object.keys(v).forEach((ak) => {
                    const t = v[ak];
                    if (isValidUiString(t)) out.push({ path: `auto.${ak}`, text: normalizeText(t) });
                });
                return;
            }
            if (typeof v === 'string') {
                if (isValidUiString(v)) out.push({ path: p, text: normalizeText(v) });
            } else if (v && typeof v === 'object') collectLocaleStrings(v, p, out);
        });
    }

    function buildEsToEnMap() {
        const map = new Map();
        const es = getBundles().es;
        const en = getBundles().en;
        if (!es || !en) return map;
        const rows = [];
        collectLocaleStrings(es, '', rows);
        rows.forEach(({ path, text }) => {
            let enText = deepGet(en, path);
            if (path.startsWith('auto.')) {
                const ak = path.slice(5);
                enText = en.auto && en.auto[ak];
            }
            if (!enText || !isValidUiString(enText) || !isLikelyEnglish(enText)) return;
            if (enText !== text) map.set(text, normalizeText(enText));
        });
        return map;
    }

    function interpolate(str, params) {
        if (!params || typeof str !== 'string') return str;
        return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (params[k] != null ? String(params[k]) : ''));
    }

    function normalizeLang(lang) {
        const l = String(lang || '').toLowerCase().slice(0, 2);
        return SUPPORTED.includes(l) ? l : DEFAULT_LANG;
    }

    function nexusTranslateUiText(text, lang) {
        if (text == null) return text;
        const raw = String(text);
        if (isTemplateString(raw)) return raw;
        const norm = normalizeText(raw);
        if (!norm || !isValidUiString(norm)) return raw;
        const l = normalizeLang(lang || currentLang);
        if (l === DEFAULT_LANG) return raw;
        if (!esToEnMap) esToEnMap = buildEsToEnMap();
        return esToEnMap.get(norm) || raw;
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
        const html = global.document && global.document.documentElement;
        if (html) html.setAttribute('lang', normalizeLang(lang));
    }

    function applySystemModulesI18n() {
        if (!global.SYSTEM_MODULES || !Array.isArray(global.SYSTEM_MODULES)) return;
        const es = getBundles().es || {};
        global.SYSTEM_MODULES.forEach((m) => {
            if (!m || !m.id) return;
            const esName = deepGet(es, 'nav.modules.' + m.id);
            const esTitle = deepGet(es, 'nav.moduleTitles.' + m.id);
            if (currentLang === DEFAULT_LANG) {
                if (esName) m.name = esName;
                if (esTitle) m.title = esTitle;
            } else {
                const name = nexusT('nav.modules.' + m.id);
                const title = nexusT('nav.moduleTitles.' + m.id);
                if (name && name !== 'nav.modules.' + m.id) m.name = name;
                if (title && title !== 'nav.moduleTitles.' + m.id) m.title = title;
            }
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
    }

    function applyStaticControlLabels() {
        const doc = global.document;
        if (!doc) return;
        const qf = [
            ['db-qf-hoy', 'common.today'],
            ['db-qf-semana', 'common.week'],
            ['db-qf-mes', 'common.month'],
            ['db-qf-all', 'common.allTime']
        ];
        qf.forEach(([id, key]) => {
            const btn = doc.getElementById(id);
            if (btn) btn.textContent = nexusT(key);
        });
        if (typeof global.refreshInformeCategoryOptions === 'function') {
            try { global.refreshInformeCategoryOptions(); } catch (e) { /* ignore */ }
        }
    }

    function applyStructuredDom() {
        const scope = global.document && global.document.body;
        if (!scope) return;
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
    }

    function applyKnownIds() {
        const map = {
            'login-search-user': ['placeholder', 'auth.searchVault'],
            'db-filter-search': ['placeholder', 'audit.searchPlaceholder'],
            'ap-filter-search': ['placeholder', 'afterpay.searchPlaceholder'],
            'acc-form-title': ['text', 'accounts.formTitle']
        };
        Object.keys(map).forEach((id) => {
            const el = global.document && global.document.getElementById(id);
            if (!el) return;
            const spec = map[id];
            if (spec[0] === 'placeholder' && spec[1]) el.placeholder = nexusT(spec[1]);
            if (spec[0] === 'text' && spec[1]) el.textContent = nexusT(spec[1]);
        });
        if (typeof global.nexusUpdateAccountBalanceLabel === 'function') {
            global.nexusUpdateAccountBalanceLabel();
        }
    }

    function refreshDashboardLabelsOnly() {
        if (!global.state || !global.state.activeTab) return;
        applySystemModulesI18n();
        if (stateActiveTab() === 'home' && typeof global.updateDashboard === 'function') {
            try { global.updateDashboard(); } catch (e) { console.warn(e); }
        }
    }

    function stateActiveTab() {
        return global.state && global.state.activeTab;
    }

    function nexusApplyI18nDom() {
        if (!ready) return;
        esToEnMap = buildEsToEnMap();
        applyDocumentLang(currentLang);
        applyStructuredDom();
        applySystemModulesI18n();
        applyTabHeadings();
        applyStaticControlLabels();
        applyKnownIds();
        refreshDashboardLabelsOnly();
        const tab = stateActiveTab();
        if (tab && global.getSystemModule) {
            const m = global.getSystemModule(tab);
            if (m && m.name) {
                try { global.document.title = 'NEXUS AR · ' + m.name; } catch (e) { /* ignore */ }
            }
        }
    }

    function scheduleApply() {
        if (applyScheduled) return;
        applyScheduled = true;
        requestAnimationFrame(() => {
            applyScheduled = false;
            try { nexusApplyI18nDom(); } catch (e) { console.warn('[NEXUS i18n]', e); }
        });
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

    function nexusEnsureLocalesLoaded() {
        if (getBundles().es && getBundles().en) return Promise.resolve(true);
        if (loadPromise) return loadPromise;
        loadPromise = (async () => {
            const bases = ['', 'locales/'];
            for (const base of bases) {
                try {
                    const [esR, enR] = await Promise.all([
                        fetch(base + 'es.json', { cache: 'no-store' }),
                        fetch(base + 'en.json', { cache: 'no-store' })
                    ]);
                    if (esR.ok && enR.ok) {
                        global.NEXUS_LOCALES = global.NEXUS_LOCALES || {};
                        global.NEXUS_LOCALES.es = await esR.json();
                        global.NEXUS_LOCALES.en = await enR.json();
                        return true;
                    }
                } catch (e) { /* next */ }
            }
            return !!(getBundles().es && getBundles().en);
        })();
        return loadPromise;
    }

    function nexusSetLanguage(lang, opts) {
        const options = opts || {};
        const next = normalizeLang(lang);
        const run = () => {
            if (next === currentLang && ready && !options.force) return;
            currentLang = next;
            persistLanguage(next);
            const sel = global.document && global.document.getElementById('set-language');
            if (sel && sel.value !== next) sel.value = next;
            scheduleApply();
            listeners.forEach((fn) => { try { fn(next); } catch (e) { console.warn(e); } });
        };
        if (!ready || !getBundles().es) {
            nexusEnsureLocalesLoaded().then((ok) => {
                if (!ok) return;
                ready = true;
                run();
            });
            return;
        }
        run();
    }

    async function nexusInitI18n() {
        const ok = await nexusEnsureLocalesLoaded();
        if (!ok) {
            console.warn('[NEXUS i18n] Missing locales. Upload nexus-locale-*.js or es.json + en.json.');
            return;
        }
        currentLang = readStoredLanguage();
        ready = true;
        const sel = global.document && global.document.getElementById('set-language');
        if (sel) sel.value = currentLang;
        scheduleApply();
    }

    function nexusOnLanguageChange(fn) {
        if (typeof fn === 'function') listeners.push(fn);
    }

    global.nexusT = nexusT;
    global.nexusTranslateUiText = nexusTranslateUiText;
    global.nexusSetLanguage = nexusSetLanguage;
    global.nexusGetLanguage = nexusGetLanguage;
    global.nexusApplyI18nDom = nexusApplyI18nDom;
    global.nexusInitI18n = nexusInitI18n;
    global.nexusOnLanguageChange = nexusOnLanguageChange;
    global.nexusEnsureLocalesLoaded = nexusEnsureLocalesLoaded;
    global.NEXUS_I18N_SUPPORTED = SUPPORTED.slice();

    function boot() {
        try { nexusInitI18n(); } catch (e) { console.warn(e); }
    }
    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 50);
    }
})(typeof window !== 'undefined' ? window : globalThis);
