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
    let enToEsEntries = null;
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
        enToEsEntries = null;
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
        let val;
        if (key && String(key).startsWith('auto.')) {
            const ak = String(key).slice(5);
            val = bundles[l] && bundles[l].auto && bundles[l].auto[ak];
            if (val === undefined && l !== DEFAULT_LANG && bundles[DEFAULT_LANG] && bundles[DEFAULT_LANG].auto) {
                val = bundles[DEFAULT_LANG].auto[ak];
            }
        } else {
            val = deepGet(bundles[l], key);
            if (val === undefined && l !== DEFAULT_LANG) val = deepGet(bundles[DEFAULT_LANG], key);
        }
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

    const DYNAMIC_HOME_IDS = new Set([
        'net-worth-container', 'accounts-container', 'dash-modules-grid',
        'dash-tasks-container', 'period-list', 'chart-7days', 'chart-period'
    ]);

    function isDynamicInjectZone(el) {
        if (!el || !el.closest) return false;
        let p = el;
        while (p) {
            if (p.id && DYNAMIC_HOME_IDS.has(p.id)) return true;
            p = p.parentElement;
        }
        return false;
    }

    function getAllAppTabSections() {
        const doc = global.document;
        if (!doc) return [];
        const main = doc.getElementById('nexus-app-main');
        if (!main) return [];
        return Array.from(main.querySelectorAll('.tab-content'));
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

    function applyDataI18nElements(scope) {
        applyStructuredDom(scope);
    }

    function textNodeToSpanish(node) {
        const entries = getEnToEsEntries();
        if (!entries.length) return false;
        const raw = node.textContent;
        const norm = normalizeText(raw);
        if (!isValidUiString(norm)) return false;
        for (let i = 0; i < entries.length; i++) {
            if (entries[i][0] === norm) {
                const lead = raw.match(/^\s*/)[0];
                const trail = raw.match(/\s*$/)[0];
                node.textContent = lead + entries[i][1] + trail;
                return true;
            }
        }
        if (origText.has(node)) {
            node.textContent = origText.get(node);
            return true;
        }
        return false;
    }

    function restoreDomToSpanish(root) {
        const scope = root || global.document.body;
        if (!scope) return;
        const es = getBundles().es;
        scope.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            let val = deepGet(es, key);
            if ((!val || val === key) && key && key.startsWith('auto.')) {
                val = es && es.auto && es.auto[key.slice(5)];
            }
            if (!val || val === key) return;
            const attr = el.getAttribute('data-i18n-attr');
            if (attr) el.setAttribute(attr, val);
            else el.textContent = val;
        });
        const tw = global.document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = tw.nextNode())) {
            textNodeToSpanish(n);
        }
        scope.querySelectorAll('option').forEach((el) => {
            if (isUserDataZone(el) || isUserDynamicOption(el)) return;
            const bag = origAttr.get(el);
            if (bag && bag._label !== undefined) {
                el.textContent = bag._label;
                return;
            }
            textNodeToSpanish(el);
        });
        const attrNames = ['placeholder', 'title', 'aria-label', 'label'];
        scope.querySelectorAll('input, textarea, select, button, label, optgroup, [title], [aria-label]').forEach((el) => {
            if (isUserDataZone(el)) return;
            const bag = origAttr.get(el);
            if (bag) {
                Object.keys(bag).forEach((attr) => {
                    if (attr === '_label') return;
                    el.setAttribute(attr, bag[attr]);
                });
            }
            attrNames.forEach((attr) => {
                if (!el.hasAttribute(attr)) return;
                const raw = el.getAttribute(attr);
                const norm = normalizeText(raw);
                if (!norm || !isValidUiString(norm)) return;
                const entries = getEnToEsEntries();
                for (let i = 0; i < entries.length; i++) {
                    if (entries[i][0] === norm) {
                        el.setAttribute(attr, entries[i][1]);
                        return;
                    }
                }
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
                if (isDynamicInjectZone(pe)) return NodeFilter.FILTER_REJECT;
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

    function applyStructuredDom(root) {
        const scope = (root && root.querySelectorAll) ? root : (global.document && global.document.body);
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
        applySystemModulesI18n();
        if (typeof global.renderDashboardModules === 'function') global.renderDashboardModules();
    }

    function stateActiveTab() {
        return global.state && global.state.activeTab;
    }

    /** En Nexus Identity solo traduce el panel de login; nunca el dashboard oculto. */
    function resolveI18nScope(root) {
        if (root && root.nodeType === 1) return root;
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

    function getEnToEsEntries() {
        if (!enToEsEntries) {
            if (!esToEnMap) getEsToEnEntries();
            const rev = new Map();
            if (esToEnMap) {
                esToEnMap.forEach((en, es) => {
                    if (en && es && en !== es) rev.set(normalizeText(en), es);
                });
            }
            enToEsEntries = [...rev.entries()].sort((a, b) => b[0].length - a[0].length);
        }
        return enToEsEntries;
    }

    function walkDomReverseSpanish(root) {
        const scope = root || global.document.body;
        if (!scope) return;
        const entries = getEnToEsEntries();
        if (!entries.length) return;
        const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG']);
        const attrNames = ['placeholder', 'title', 'aria-label'];

        scope.querySelectorAll('input, textarea').forEach((el) => {
            if (isUserDataZone(el)) return;
            attrNames.forEach((attr) => {
                if (!el.hasAttribute(attr)) return;
                const raw = el.getAttribute(attr);
                const norm = normalizeText(raw);
                if (!norm || !isValidUiString(norm)) return;
                const bag = origAttr.get(el);
                if (bag && bag[attr] !== undefined) {
                    el.setAttribute(attr, bag[attr]);
                    return;
                }
                for (let i = 0; i < entries.length; i++) {
                    if (entries[i][0] === norm) {
                        el.setAttribute(attr, entries[i][1]);
                        return;
                    }
                }
            });
        });

        scope.querySelectorAll('option').forEach((el) => {
            if (isUserDataZone(el) || isUserDynamicOption(el)) return;
            const bag = origAttr.get(el);
            if (bag && bag._label !== undefined) {
                el.textContent = bag._label;
                return;
            }
            const norm = normalizeText(el.textContent);
            if (!isValidUiString(norm)) return;
            for (let i = 0; i < entries.length; i++) {
                if (entries[i][0] === norm) {
                    el.textContent = entries[i][1];
                    return;
                }
            }
        });

        const walker = global.document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const pe = node.parentElement;
                if (!pe || skipTags.has(pe.tagName)) return NodeFilter.FILTER_REJECT;
                if (isUserDataZone(pe)) return NodeFilter.FILTER_REJECT;
                if (pe.tagName === 'OPTION' && isUserDynamicOption(pe)) return NodeFilter.FILTER_REJECT;
                if (pe.closest && pe.closest('[data-i18n]')) return NodeFilter.FILTER_REJECT;
                if (isDynamicInjectZone(pe)) return NodeFilter.FILTER_REJECT;
                const t = normalizeText(node.textContent);
                if (!isValidUiString(t)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        let node;
        while ((node = walker.nextNode())) {
            textNodeToSpanish(node);
        }
    }

    function applySpanishToScope(scope) {
        if (!scope) return;
        restoreDomToSpanish(scope);
        applyDataI18nElements(scope);
        walkDomReverseSpanish(scope);
        applyDataI18nElements(scope);
    }

    function applyEnglishToScope(scope) {
        if (!scope) return;
        getEsToEnEntries();
        applyDataI18nElements(scope);
        walkDomTranslations(scope);
        applyDataI18nElements(scope);
    }

    const SETTINGS_ACC_I18N = {
        security: 'settings.security',
        ios: 'settings.iosAlerts',
        engine: 'settings.engineGlobal',
        visual: 'settings.visual',
        categories: 'settings.categories',
        maintenance: 'settings.maintenance',
        admin: 'settings.adminRoot'
    };

    function nexusApplySettingsPanelLabels() {
        const doc = global.document;
        if (!doc) return;
        const setText = (id, key) => {
            const el = doc.getElementById(id);
            if (!el) return;
            const v = nexusT(key);
            if (v && v !== key) el.textContent = v;
        };
        const pairs = [
            ['settings-label-phone', 'settings.phone'],
            ['settings-label-lastaccess', 'settings.lastAccess'],
            ['settings-label-bio', 'settings.biometrics'],
            ['settings-label-transfer', 'settings.transferData'],
            ['settings-label-transfer-warn', 'settings.transferDataWarn'],
            ['settings-profile-transfer-empty', 'settings.transferEmpty'],
            ['settings-label-active-vault', 'settings.activeVault'],
            ['settings-ai-engine-title', 'settings.aiEngine'],
            ['settings-label-ai-provider', 'settings.aiProvider'],
            ['settings-label-ai-model', 'settings.aiModel'],
            ['settings-label-ai-key', 'settings.aiApiKey'],
            ['settings-btn-ai-save', 'settings.aiSaveFirebase'],
            ['settings-backups-title', 'settings.backups'],
            ['settings-backups-hint', 'settings.backupsHint'],
            ['settings-label-backup-time', 'settings.backupTime'],
            ['settings-label-backup-suffix', 'settings.backupSuffix'],
            ['settings-btn-export', 'settings.exportNow'],
            ['settings-btn-restore', 'settings.restoreJson'],
            ['settings-label-records-block', 'settings.recordsPerBlock'],
            ['settings-label-language-select', 'settings.languageLabel']
        ];
        pairs.forEach(([id, key]) => setText(id, key));
        Object.keys(SETTINGS_ACC_I18N).forEach((accId) => {
            const item = doc.querySelector('#tab-settings [data-settings-acc-id="' + accId + '"]');
            if (!item) return;
            const key = SETTINGS_ACC_I18N[accId];
            const title = nexusT(key);
            if (title && title !== key) item.setAttribute('data-settings-acc-title', title);
        });
        if (typeof global.refreshSettingsAccordionHeads === 'function') {
            try { global.refreshSettingsAccordionHeads(); } catch (e) { /* ignore */ }
        }
        if (global.userProfile && typeof global.updateSettingsProfileCard === 'function') {
            try { global.updateSettingsProfileCard(global.userProfile); } catch (e) { /* ignore */ }
        }
    }

    function getFullAppI18nRoot() {
        const doc = global.document;
        if (!doc) return null;
        return doc.getElementById('nexus-app-main') || doc.body;
    }

    function applyGlobalI18nSideEffects() {
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

    function nexusApplyI18nDom(root, opts) {
        if (!ready) return;
        const options = opts || {};
        if (applyingI18n && !options.force) return;
        applyingI18n = true;
        try {
            applyDocumentLang(currentLang);
            if (options.fullApp && global.__nexusAppShellReady) {
                const rootFull = getFullAppI18nRoot();
                if (rootFull) {
                    if (currentLang === DEFAULT_LANG) applySpanishToScope(rootFull);
                    else applyEnglishToScope(rootFull);
                    applyGlobalI18nSideEffects();
                    return;
                }
                const tabs = getAllAppTabSections();
                if (tabs.length) {
                    if (currentLang === DEFAULT_LANG) tabs.forEach(applySpanishToScope);
                    else tabs.forEach(applyEnglishToScope);
                    applyGlobalI18nSideEffects();
                    return;
                }
            }
            if (currentLang === DEFAULT_LANG) {
                const scopeEs = resolveI18nScope(root);
                if (scopeEs) applySpanishToScope(scopeEs);
                applyGlobalI18nSideEffects();
                return;
            }
            const scope = resolveI18nScope(root);
            if (scope) applyEnglishToScope(scope);
            applyGlobalI18nSideEffects();
        } finally {
            applyingI18n = false;
        }
    }

    function nexusApplyI18nToAllTabs() {
        return nexusApplyI18nDom(null, { fullApp: true, force: true });
    }

    function yieldToMain() {
        return new Promise((resolve) => {
            if (typeof global.requestAnimationFrame === 'function') global.requestAnimationFrame(() => resolve());
            else setTimeout(resolve, 0);
        });
    }

    function ensureLangProgressOverlay() {
        const doc = global.document;
        if (!doc || !doc.body) return null;
        let el = doc.getElementById('nexus-lang-progress-overlay');
        if (el) return el;
        el = doc.createElement('div');
        el.id = 'nexus-lang-progress-overlay';
        el.className = 'hidden';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'nexus-lang-progress-label');
        el.innerHTML = '<div id="nexus-lang-progress-card"><p id="nexus-lang-progress-label" class="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center mb-3">Cambiando idioma</p><div id="nexus-lang-progress-bar"><div id="nexus-lang-progress-fill"></div></div><p id="nexus-lang-progress-pct" class="text-center text-lg font-black tabular-nums text-indigo-600 mt-3">0%</p><p id="nexus-lang-progress-step" class="text-[8px] font-bold text-slate-400 text-center mt-2 uppercase tracking-wide">Iniciando…</p></div>';
        doc.body.appendChild(el);
        return el;
    }

    function setLangProgressOverlay(pct, stepLabel) {
        const overlay = ensureLangProgressOverlay();
        if (!overlay) return;
        const fill = global.document.getElementById('nexus-lang-progress-fill');
        const pctEl = global.document.getElementById('nexus-lang-progress-pct');
        const stepEl = global.document.getElementById('nexus-lang-progress-step');
        const label = global.document.getElementById('nexus-lang-progress-label');
        const p = Math.min(100, Math.max(0, Math.round(pct)));
        if (fill) fill.style.width = p + '%';
        if (pctEl) pctEl.textContent = p + '%';
        if (stepEl && stepLabel) stepEl.textContent = stepLabel;
        if (label) {
            label.textContent = currentLang === DEFAULT_LANG
                ? (nexusT('settings.languageApplyingEs') !== 'settings.languageApplyingEs' ? nexusT('settings.languageApplyingEs') : 'Aplicando español')
                : (nexusT('settings.languageApplyingEn') !== 'settings.languageApplyingEn' ? nexusT('settings.languageApplyingEn') : 'Applying English');
        }
    }

    function showLangProgressOverlay() {
        const overlay = ensureLangProgressOverlay();
        if (overlay) overlay.classList.remove('hidden');
        setLangProgressOverlay(0, 'Iniciando…');
    }

    function hideLangProgressOverlay() {
        const overlay = global.document && global.document.getElementById('nexus-lang-progress-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    async function nexusApplyFullAppI18nWithProgress() {
        if (!ready) {
            const ok = await nexusEnsureLocalesLoaded();
            if (!ok) return false;
            ready = true;
        }
        const root = getFullAppI18nRoot();
        const steps = ['Preparando…', 'Traduciendo UI…', 'Módulos', 'Dashboard', 'Listo'];
        const total = steps.length;
        let step = 0;
        const bump = async (msg) => {
            step += 1;
            setLangProgressOverlay((step / total) * 100, msg);
            await yieldToMain();
        };
        global.__nexusI18nBatchActive = true;
        applyingI18n = true;
        try {
            applyDocumentLang(currentLang);
            await bump(steps[0]);
            if (root) {
                if (currentLang === DEFAULT_LANG) applySpanishToScope(root);
                else applyEnglishToScope(root);
            } else {
                const tabs = getAllAppTabSections();
                tabs.forEach((tab) => {
                    if (currentLang === DEFAULT_LANG) applySpanishToScope(tab);
                    else applyEnglishToScope(tab);
                });
            }
            await bump(steps[1]);
            applyGlobalI18nSideEffects();
            await bump(steps[2]);
            if (typeof global.updateDashboard === 'function') {
                try { global.updateDashboard(); } catch (e) { /* ignore */ }
            }
            if (typeof global.refreshSettingsAccordionHeads === 'function') {
                try { global.refreshSettingsAccordionHeads(); } catch (e) { /* ignore */ }
            }
            nexusApplySettingsPanelLabels();
            if (root && currentLang === DEFAULT_LANG) applySpanishToScope(root);
            else if (root) applyEnglishToScope(root);
            if (global.state && global.state.activeTab) {
                const activeId = global.state.activeTab;
                if (activeId === 'database' && typeof global.renderDatabase === 'function') {
                    try { global.renderDatabase(); } catch (e) { /* ignore */ }
                }
                if (activeId === 'tasks' && typeof global.renderTasksTab === 'function') {
                    try { global.renderTasksTab(); } catch (e) { /* ignore */ }
                }
            }
            await bump(steps[3]);
            setLangProgressOverlay(100, steps[4]);
            await yieldToMain();
            return true;
        } finally {
            applyingI18n = false;
            global.__nexusI18nBatchActive = false;
        }
    }

    async function nexusSetLanguageWithProgress(lang, opts) {
        const options = Object.assign({ force: true }, opts || {});
        const next = normalizeLang(lang);
        showLangProgressOverlay();
        try {
            if (!ready || !getBundles().es) {
                const ok = await nexusEnsureLocalesLoaded();
                if (!ok) return;
                ready = true;
            }
            currentLang = next;
            invalidateEsToEnCache();
            persistLanguage(next);
            const sel = global.document && global.document.getElementById('set-language');
            if (sel) sel.value = next;
            await nexusApplyFullAppI18nWithProgress();
            global.__nexusI18nBatchActive = true;
            try {
                listeners.forEach((fn) => { try { fn(next); } catch (e) { console.warn(e); } });
            } finally {
                global.__nexusI18nBatchActive = false;
            }
            const root = getFullAppI18nRoot();
            if (root) {
                if (currentLang === DEFAULT_LANG) applySpanishToScope(root);
                else applyEnglishToScope(root);
            }
            nexusApplySettingsPanelLabels();
            applyGlobalI18nSideEffects();
        } finally {
            hideLangProgressOverlay();
        }
    }

    /** Traducción por pestaña (incluye inicio: estáticos sin zonas dinámicas). */
    function nexusI18nRefresh(root) {
        if (!ready || !root) return;
        const run = () => {
            if (applyingI18n) return;
            applyingI18n = true;
            try {
                if (currentLang === DEFAULT_LANG) {
                    applySpanishToScope(root);
                    applyGlobalI18nSideEffects();
                    return;
                }
                applyEnglishToScope(root);
                if (root.id === 'tab-home') applyGlobalI18nSideEffects();
            } catch (e) {
                console.warn('[NEXUS i18n]', e);
            } finally {
                applyingI18n = false;
            }
        };
        if (typeof global.requestIdleCallback === 'function') {
            global.requestIdleCallback(run, { timeout: 2500 });
        } else {
            setTimeout(run, 0);
        }
    }

    /** Restaura UI a español al cerrar sesión (evita Spanglish al reabrir). */
    function nexusResetI18nOnLogout() {
        if (!ready) return;
        const tabs = getAllAppTabSections();
        if (!tabs.length) return;
        const savedLang = currentLang;
        applyingI18n = true;
        try {
            currentLang = DEFAULT_LANG;
            tabs.forEach(applySpanishToScope);
            applyGlobalI18nSideEffects();
            if (typeof global.updateDashboard === 'function') {
                try { global.updateDashboard(); } catch (e) { /* ignore */ }
            }
        } finally {
            currentLang = savedLang;
            applyingI18n = false;
        }
    }

    function scheduleApply(opts) {
        const options = opts || {};
        if (applyScheduled && !options.force) return;
        applyScheduled = true;
        const run = () => {
            applyScheduled = false;
            try {
                const useFull = options.fullApp || !!global.__nexusAppShellReady;
                nexusApplyI18nDom(null, useFull ? { fullApp: true } : {});
            } catch (e) { console.warn('[NEXUS i18n]', e); }
        };
        if (options.immediate) {
            setTimeout(run, 0);
            return;
        }
        if (typeof global.requestIdleCallback === 'function') {
            global.requestIdleCallback(run, { timeout: 4000 });
        } else {
            setTimeout(run, 120);
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
        if (global.state && global.state.settings && global.state.settings.uiLanguage) {
            return normalizeLang(global.state.settings.uiLanguage);
        }
        try {
            const s = global.localStorage.getItem(STORAGE_KEY);
            if (s) return normalizeLang(s);
        } catch (e) { /* ignore */ }
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
                        invalidateEsToEnCache();
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
        if (options.withProgress !== false && global.__nexusAppShellReady) {
            return nexusSetLanguageWithProgress(next, options);
        }
        const run = () => {
            if (next === currentLang && ready && !options.force) return;
            currentLang = next;
            invalidateEsToEnCache();
            persistLanguage(next);
            const sel = global.document && global.document.getElementById('set-language');
            if (sel && sel.value !== next) sel.value = next;
            scheduleApply({ immediate: true, force: true, fullApp: !!global.__nexusAppShellReady });
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
        /* Traducción DOM en segundo plano; no en pantalla de login salvo que la app ya esté desbloqueada */
        if (global.__nexusAppShellReady) scheduleApply();
    }

    function nexusApplyI18nBackground() {
        if (!ready) {
            nexusEnsureLocalesLoaded().then((ok) => {
                if (!ok) return;
                ready = true;
                currentLang = readStoredLanguage();
                scheduleApply({ force: true, fullApp: !!global.__nexusAppShellReady });
            });
            return;
        }
        scheduleApply({ force: true, fullApp: !!global.__nexusAppShellReady });
    }

    function nexusOnLanguageChange(fn) {
        if (typeof fn === 'function') listeners.push(fn);
    }

    global.nexusT = nexusT;
    global.nexusTranslateUiText = nexusTranslateUiText;
    global.nexusUi = nexusTranslateUiText;
    global.nexusUiHtml = nexusUiHtml;
    function nexusSetHtml(el, html) {
        if (!el) return;
        const raw = html != null ? String(html) : '';
        el.innerHTML = (typeof nexusUiHtml === 'function') ? nexusUiHtml(raw) : raw;
    }
    global.nexusSetHtml = nexusSetHtml;
    global.nexusSetLanguage = nexusSetLanguage;
    global.nexusSetLanguageWithProgress = nexusSetLanguageWithProgress;
    global.nexusGetLanguage = nexusGetLanguage;
    global.nexusApplyI18nDom = nexusApplyI18nDom;
    global.nexusApplyI18nToAllTabs = nexusApplyI18nToAllTabs;
    global.nexusI18nRefresh = nexusI18nRefresh;
    global.nexusResetI18nOnLogout = nexusResetI18nOnLogout;
    global.nexusInitI18n = nexusInitI18n;
    global.nexusApplyI18nBackground = nexusApplyI18nBackground;
    global.nexusApplySettingsPanelLabels = nexusApplySettingsPanelLabels;
    global.nexusOnLanguageChange = nexusOnLanguageChange;
    global.nexusEnsureLocalesLoaded = nexusEnsureLocalesLoaded;
    global.NEXUS_I18N_SUPPORTED = SUPPORTED.slice();

    function boot() {
        const run = () => { try { nexusInitI18n(); } catch (e) { console.warn(e); } };
        if (typeof global.requestIdleCallback === 'function') {
            global.requestIdleCallback(run, { timeout: 12000 });
        } else {
            setTimeout(run, 2000);
        }
    }
    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 50);
    }
})(typeof window !== 'undefined' ? window : globalThis);
