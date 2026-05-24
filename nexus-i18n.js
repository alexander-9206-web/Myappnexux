/**
 * NEXUS i18n — traducción de TODA la UI nativa (ES/EN).
 * No traduce datos del usuario: movimientos, notas, categorías escritas, montos.
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'nexus_ui_lang';
    const SUPPORTED = ['es', 'en'];
    const DEFAULT_LANG = 'es';

    const SKIP_ZONE_SELECTORS = [
        '[data-i18n-skip]',
        '#db-list',
        '#ap-active-list',
        '#ap-schedule-list',
        '#accounts-container',
        '#informe-results',
        '#rep-narrative',
        '#ai-response-text',
        '#scanner-reading-output',
        '#deleted-tx-archive-list',
        '.db-audit-card',
        '#hist-tx-list',
        '#cat-manage-list'
    ];

    const WALK_SELECTORS = [
        'label', 'legend', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'small',
        'button', 'option', 'optgroup', 'th', 'td', 'li', 'a', 'strong', 'em', 'summary'
    ].join(',');

    let currentLang = DEFAULT_LANG;
    let ready = false;
    let loadPromise = null;
    let esToEnMap = null;
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

    function isValidUiString(s) {
        const t = normalizeText(s);
        if (t.length < 2 || t.length > 420) return false;
        if (/[<>`]|\$\{|onclick|type=\"|class=\"|function\s*\(/.test(t)) return false;
        if (/^[\d\s$€£.,:;|/\\\-+=%#@*()[\]{}]+$/.test(t)) return false;
        return /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(t);
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
        const esRows = [];
        collectLocaleStrings(es, '', esRows);
        esRows.forEach(({ path, text }) => {
            let enText = deepGet(en, path);
            if (path.startsWith('auto.')) {
                const ak = path.slice(5);
                enText = en.auto && en.auto[ak];
            }
            if (enText && isValidUiString(enText) && enText !== text) {
                map.set(text, normalizeText(enText));
            }
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
        const raw = normalizeText(text);
        if (!raw) return text;
        const l = normalizeLang(lang || currentLang);
        if (l === DEFAULT_LANG) return text;
        if (!esToEnMap) esToEnMap = buildEsToEnMap();
        return esToEnMap.get(raw) || raw;
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

    function inSkipZone(el) {
        if (!el || !el.closest) return true;
        if (el.closest('[contenteditable="true"]')) return true;
        if (el.matches('input, textarea, select')) return false;
        return SKIP_ZONE_SELECTORS.some((sel) => el.closest(sel));
    }

    function rememberEsText(el, text) {
        if (!el.dataset.i18nEs) el.dataset.i18nEs = text;
    }

    function getElementUiText(el) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            return { mode: 'attr', attr: 'placeholder', value: el.placeholder || '' };
        }
        if (el.tagName === 'OPTION' || el.tagName === 'OPTGROUP') {
            return { mode: 'text', value: el.textContent || '' };
        }
        if (el.title) return { mode: 'attr', attr: 'title', value: el.title };
        return { mode: 'text', value: (el.textContent || '').trim() };
    }

    function applyTranslationToElement(el, translated) {
        const info = getElementUiText(el);
        if (info.mode === 'attr' && info.attr) {
            el.setAttribute(info.attr, translated);
            return;
        }
        let replaced = false;
        el.childNodes.forEach((n) => {
            if (n.nodeType === 3 && normalizeText(n.textContent)) {
                const lead = (n.textContent.match(/^\s*/) || [''])[0];
                const trail = (n.textContent.match(/\s*$/) || [''])[0];
                n.textContent = lead + translated + trail;
                replaced = true;
            }
        });
        if (!replaced) el.textContent = translated;
    }

    function restoreElementFromEs(el) {
        const es = el.dataset.i18nEs;
        if (!es) return;
        applyTranslationToElement(el, es);
    }

    function translateElement(el) {
        if (!el || inSkipZone(el)) return;
        if (el.closest('[data-i18n]')) return;
        const info = getElementUiText(el);
        const raw = normalizeText(info.value);
        if (!isValidUiString(raw)) return;
        rememberEsText(el, raw);
        if (currentLang === DEFAULT_LANG) {
            restoreElementFromEs(el);
            return;
        }
        const tr = nexusTranslateUiText(raw);
        if (tr && tr !== raw) applyTranslationToElement(el, tr);
    }

    function walkDomTranslations(root) {
        const scope = root || global.document.body;
        if (!scope || !scope.querySelectorAll) return;
        scope.querySelectorAll(WALK_SELECTORS).forEach((el) => {
            try { translateElement(el); } catch (e) { /* skip */ }
        });
        scope.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((el) => {
            if (inSkipZone(el)) return;
            const ph = el.getAttribute('placeholder');
            if (!isValidUiString(ph)) return;
            rememberEsText(el, ph);
            if (currentLang === DEFAULT_LANG) {
                if (el.dataset.i18nEs) el.placeholder = el.dataset.i18nEs;
                return;
            }
            const tr = nexusTranslateUiText(ph);
            if (tr) el.placeholder = tr;
        });
    }

    function applyDocumentLang(lang) {
        const l = normalizeLang(lang);
        const html = global.document && global.document.documentElement;
        if (html) html.setAttribute('lang', l);
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

    function applyAccountFormHelpI18n() {
        if (typeof global.nexusUpdateAccountBalanceLabel === 'function') {
            global.nexusUpdateAccountBalanceLabel();
        }
    }

    function refreshActiveTabForLanguage() {
        const tab = global.state && global.state.activeTab;
        if (!tab) return;
        applySystemModulesI18n();
        if (tab === 'home' && typeof global.renderHome === 'function') global.renderHome();
        if (tab === 'accounts' && typeof global.renderAccountsTab === 'function') global.renderAccountsTab();
        if (tab === 'settings' && typeof global.renderSettingsTab === 'function') global.renderSettingsTab();
        if (tab === 'database' && typeof global.renderDatabase === 'function') global.renderDatabase();
        if (tab === 'analysis' && typeof global.updateDashboard === 'function') global.updateDashboard();
    }

    function nexusApplyI18nDom(root) {
        if (!ready) return;
        esToEnMap = buildEsToEnMap();
        applyDocumentLang(currentLang);
        applyStructuredDom();
        applySystemModulesI18n();
        applyTabHeadings();
        refreshActiveTabForLanguage();
        walkDomTranslations(root);
        applyAccountFormHelpI18n();
        if (global.state && global.state.activeTab && global.getSystemModule) {
            const m = global.getSystemModule(global.state.activeTab);
            if (m && m.name) try { global.document.title = 'NEXUS AR · ' + m.name; } catch (e) { /* ignore */ }
        }
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

    function installNativeShims() {
        if (global.__NEXUS_I18N_SHIMS) return;
        global.__NEXUS_I18N_SHIMS = true;
        const _alert = global.alert && global.alert.bind(global);
        if (_alert) {
            global.alert = function (msg) {
                return _alert(nexusTranslateUiText(String(msg == null ? '' : msg)));
            };
        }
        if (typeof global.triggerUIConfirm === 'function') {
            const _confirm = global.triggerUIConfirm;
            global.triggerUIConfirm = function (msg, action, payload) {
                return _confirm(nexusTranslateUiText(String(msg == null ? '' : msg)), action, payload);
            };
        }
    }

    function nexusSetLanguage(lang, opts) {
        const options = opts || {};
        const next = normalizeLang(lang);
        const apply = () => {
            if (next === currentLang && ready && !options.force) return;
            currentLang = next;
            persistLanguage(next);
            nexusApplyI18nDom();
            const sel = global.document && global.document.getElementById('set-language');
            if (sel && sel.value !== next) sel.value = next;
            listeners.forEach((fn) => { try { fn(next); } catch (e) { console.warn(e); } });
        };
        if (!ready || !getBundles().es) {
            nexusEnsureLocalesLoaded().then((ok) => {
                if (!ok) return;
                ready = true;
                installNativeShims();
                apply();
            });
            return;
        }
        apply();
    }

    async function nexusInitI18n() {
        const ok = await nexusEnsureLocalesLoaded();
        if (!ok) {
            console.warn('[NEXUS i18n] Falta es/en. Sube nexus-locale-*.js o es.json+en.json junto a index.html');
            return;
        }
        installNativeShims();
        currentLang = readStoredLanguage();
        ready = true;
        esToEnMap = buildEsToEnMap();
        nexusApplyI18nDom();
        const sel = global.document && global.document.getElementById('set-language');
        if (sel) sel.value = currentLang;
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
        setTimeout(boot, 0);
    }
})(typeof window !== 'undefined' ? window : globalThis);
