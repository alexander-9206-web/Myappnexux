/**
 * NEXUS i18n — English (US). Traduce toda la UI nativa; no datos del usuario.
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
    let esToEnEntries = null;
    let mapCacheLang = null;
    let applyScheduled = false;
    let applyingI18n = false;
    const listeners = [];
    const origText = new WeakMap();
    const origAttr = new WeakMap();

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
        return /\$\{|fmt\(|onclick|type=\"|class=\"|function\s*\(|^\{|^\s*[<>]/.test(String(s || ''));
    }

    function isValidUiString(s) {
        const t = normalizeText(s);
        if (t.length < 2 || t.length > 420) return false;
        if (isTemplateString(t)) return false;
        if (/^[\d\s$€£.,:;|/\\\-+=%#@*()[\]{}]+$/.test(t)) return false;
        return /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(t);
    }

    function isCorruptEnglish(s) {
        return /theindtor|Accortot|ptogtor|Ctoteg|Stheect|toudit|Inwithtr|Fintonc|Antor the|Setorch|Dtheete|Ctoncthe|Btock/i.test(String(s || ''));
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
            if (!enText || !isValidUiString(enText)) return;
            if (enText === text) return;
            if (/[áéíóúüñÁÉÍÓÚÜÑ]/.test(enText)) return;
            if (isCorruptEnglish(enText)) return;
            map.set(text, normalizeText(enText));
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

    function invalidateEsToEnCache() {
        esToEnMap = null;
        esToEnEntries = null;
        mapCacheLang = null;
    }

    function getEsToEnEntries() {
        const lang = currentLang;
        if (!esToEnEntries || mapCacheLang !== lang) {
            esToEnMap = buildEsToEnMap();
            esToEnEntries = [...esToEnMap.entries()].sort((a, b) => b[0].length - a[0].length);
            mapCacheLang = lang;
        }
        return esToEnEntries;
    }

    function nexusTranslateUiText(text, lang) {
        if (text == null) return text;
        const raw = String(text);
        if (isTemplateString(raw)) return raw;
        const norm = normalizeText(raw);
        if (!norm || !isValidUiString(norm)) return raw;
        const l = normalizeLang(lang || currentLang);
        if (l === DEFAULT_LANG) return raw;
        if (!esToEnMap) getEsToEnEntries();
        return esToEnMap.get(norm) || raw;
    }

    /** Traduce cadenas en plantillas HTML (solo frases ≥4 chars para no romper atributos). */
    function nexusUiHtml(html) {
        if (html == null || currentLang === DEFAULT_LANG) return html;
        let out = String(html);
        const entries = getEsToEnEntries();
        const minLen = 4;
        entries.forEach(([es, en]) => {
            if (!es || !en || es === en || es.length < minLen) return;
            if (out.indexOf(es) === -1) return;
            out = out.split(es).join(en);
        });
        return out;
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

    function isUserDataZone(el) {
        if (!el || !el.closest) return false;
        return !!el.closest('[data-i18n-skip]');
    }

    function isUserDynamicOption(el) {
        if (!el || el.tagName !== 'OPTION') return false;
        const sel = el.parentElement;
        if (!sel || sel.tagName !== 'SELECT') return false;
        const userSelectIds = [
            'f-cat-parent-select', 'f-cat-sub-select', 'period-cat-filter', 'db-filter-cat',
            'informe-cat-a', 'informe-cat-b', 'cb-cat',
            'f-account', 'f-account-dest', 'fl-terceros-acc', 'fa-pse-link', 'db-filter-acc'
        ];
        if (!userSelectIds.includes(sel.id)) return false;
        const v = el.value;
        const staticVals = new Set(['', 'all', '__all__', 'ADD_NEW_CAT', 'ADD_NEW_SUB', 'EDIT_PARENT']);
        if (staticVals.has(v)) return false;
        if (String(v).startsWith('ADD_') || String(v).startsWith('EDIT_')) return false;
        const label = normalizeText(el.textContent);
        if (label.startsWith('--') || label.startsWith('—') || label.startsWith('➕') || label.startsWith('✏️')) return false;
        return true;
    }

    function rememberTextNode(node) {
        if (!origText.has(node)) origText.set(node, node.textContent);
    }

    function rememberAttr(el, attr) {
        if (!origAttr.has(el)) origAttr.set(el, {});
        const bag = origAttr.get(el);
        if (bag[attr] === undefined) bag[attr] = el.getAttribute(attr) || '';
    }

    function restoreDomToSpanish(root) {
        const scope = root || global.document.body;
        if (!scope) return;
        scope.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            const es = getBundles().es;
            const val = deepGet(es, key);
            if (!val || val === key) return;
            const attr = el.getAttribute('data-i18n-attr');
            if (attr) el.setAttribute(attr, val);
            else el.textContent = val;
        });
        const tw = global.document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = tw.nextNode())) {
            if (origText.has(n)) n.textContent = origText.get(n);
        }
        scope.querySelectorAll('option').forEach((el) => {
            const bag = origAttr.get(el);
            if (bag && bag._label !== undefined) el.textContent = bag._label;
        });
        scope.querySelectorAll('input, textarea, select, button, label, [title], [aria-label]').forEach((el) => {
            const bag = origAttr.get(el);
            if (!bag) return;
            Object.keys(bag).forEach((attr) => {
                if (attr === '_label') return;
                el.setAttribute(attr, bag[attr]);
            });
        });
    }

    function walkDomTranslations(root) {
        const scope = root || global.document.body;
        if (!scope) return;
        if (currentLang === DEFAULT_LANG) {
            restoreDomToSpanish(scope);
            return;
        }
        const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG']);
        const attrNames = ['placeholder', 'title', 'aria-label'];

        scope.querySelectorAll('[data-i18n-skip] input[placeholder], [data-i18n-skip] textarea[placeholder]').forEach(() => {});

        scope.querySelectorAll('optgroup[label]').forEach((el) => {
            if (isUserDataZone(el)) return;
            const raw = el.getAttribute('label');
            if (!raw || !isValidUiString(raw)) return;
            rememberAttr(el, 'label');
            const tr = nexusTranslateUiText(raw);
            if (tr && tr !== raw) el.setAttribute('label', tr);
        });

        scope.querySelectorAll('input, textarea').forEach((el) => {
            if (isUserDataZone(el)) return;
            attrNames.forEach((attr) => {
                if (!el.hasAttribute(attr)) return;
                const raw = el.getAttribute(attr);
                if (!raw || !isValidUiString(raw)) return;
                rememberAttr(el, attr);
                const tr = nexusTranslateUiText(raw);
                if (tr && tr !== raw) el.setAttribute(attr, tr);
            });
        });

        scope.querySelectorAll('option').forEach((el) => {
            if (isUserDataZone(el) || isUserDynamicOption(el)) return;
            const raw = normalizeText(el.textContent);
            if (!isValidUiString(raw)) return;
            if (!origAttr.has(el)) origAttr.set(el, {});
            const bag = origAttr.get(el);
            if (bag._label === undefined) bag._label = el.textContent;
            const tr = nexusTranslateUiText(raw);
            if (tr && tr !== raw) el.textContent = tr;
        });

        scope.querySelectorAll('[title], [aria-label]').forEach((el) => {
            if (isUserDataZone(el) || skipTags.has(el.tagName)) return;
            attrNames.forEach((attr) => {
                if (!el.hasAttribute(attr)) return;
                const raw = el.getAttribute(attr);
                if (!isValidUiString(raw)) return;
                rememberAttr(el, attr);
                const tr = nexusTranslateUiText(raw);
                if (tr && tr !== raw) el.setAttribute(attr, tr);
            });
        });

        const walker = global.document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const pe = node.parentElement;
                if (!pe || skipTags.has(pe.tagName)) return NodeFilter.FILTER_REJECT;
                if (isUserDataZone(pe)) return NodeFilter.FILTER_REJECT;
                if (pe.tagName === 'OPTION' && isUserDynamicOption(pe)) return NodeFilter.FILTER_REJECT;
                if (pe.closest && pe.closest('[data-i18n]')) return NodeFilter.FILTER_REJECT;
                const t = normalizeText(node.textContent);
                if (!isValidUiString(t)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        let node;
        while ((node = walker.nextNode())) {
            const raw = node.textContent;
            const norm = normalizeText(raw);
            const tr = nexusTranslateUiText(norm);
            if (tr && tr !== norm) {
                rememberTextNode(node);
                const lead = raw.match(/^\s*/)[0];
                const trail = raw.match(/\s*$/)[0];
                node.textContent = lead + tr + trail;
            }
        }
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
            if (currentLang === DEFAULT_LANG) {
                const esName = deepGet(es, 'nav.modules.' + m.id);
                const esTitle = deepGet(es, 'nav.moduleTitles.' + m.id);
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
            ['tab-home', 'tabs.home'],
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
        const ctxBtns = [
            ['btn-day', 'Hoy'],
            ['btn-month', 'Este Mes'],
            ['btn-year', 'Este Año']
        ];
        ctxBtns.forEach(([id, esLabel]) => {
            const btn = doc.getElementById(id);
            if (btn) btn.textContent = nexusTranslateUiText(esLabel);
        });
        const wt = doc.getElementById('wealth-title');
        if (wt && global.state && global.state.context) {
            const ctx = global.state.context;
            if (ctx === 'day') wt.textContent = nexusTranslateUiText('Patrimonio Global Unificado');
            else if (ctx === 'month') wt.textContent = nexusTranslateUiText('Patrimonio Este Mes');
            else wt.textContent = nexusTranslateUiText('Patrimonio Este Año');
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
    }

    function stateActiveTab() {
        return global.state && global.state.activeTab;
    }

    /** En Nexus Identity solo traduce el panel de login; nunca el dashboard oculto. */
    function resolveI18nScope(root) {
        if (root) return root;
        const doc = global.document;
        if (!doc) return null;
        const html = doc.documentElement;
        const login = doc.getElementById('login-screen');
        const authPending = html && html.classList.contains('nexus-auth-pending');
        if (authPending && login) return login;
        if (login && !login.classList.contains('hidden')) return login;
        const lock = doc.getElementById('session-lock-screen');
        if (lock && !lock.classList.contains('hidden')) return lock;
        const tab = stateActiveTab();
        if (tab) {
            const section = doc.getElementById('tab-' + tab);
            if (section) return section;
        }
        return doc.getElementById('tab-home') || doc.body;
    }

    function nexusApplyI18nDom(root) {
        if (!ready || applyingI18n) return;
        applyingI18n = true;
        try {
            getEsToEnEntries();
            const scope = resolveI18nScope(root);
            applyDocumentLang(currentLang);
            applyStructuredDom();
            applySystemModulesI18n();
            applyTabHeadings();
            applyStaticControlLabels();
            applyKnownIds();
            walkDomTranslations(scope);
            refreshDashboardLabelsOnly();
            const tab = stateActiveTab();
            if (tab && global.getSystemModule) {
                const m = global.getSystemModule(tab);
                if (m && m.name) {
                    try { global.document.title = 'NEXUS AR · ' + m.name; } catch (e) { /* ignore */ }
                }
            }
        } finally {
            applyingI18n = false;
        }
    }

    function scheduleApply() {
        if (applyScheduled) return;
        applyScheduled = true;
        const run = () => {
            applyScheduled = false;
            try { nexusApplyI18nDom(); } catch (e) { console.warn('[NEXUS i18n]', e); }
        };
        const doc = global.document;
        const authPending = doc && doc.documentElement && doc.documentElement.classList.contains('nexus-auth-pending');
        if (authPending) {
            setTimeout(run, 0);
        } else {
            requestAnimationFrame(run);
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

    function nexusSetLanguage(lang, opts) {
        const options = opts || {};
        const next = normalizeLang(lang);
        const run = () => {
            if (next === currentLang && ready && !options.force) return;
            currentLang = next;
            invalidateEsToEnCache();
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
    global.nexusUi = nexusTranslateUiText;
    global.nexusUiHtml = nexusUiHtml;
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
