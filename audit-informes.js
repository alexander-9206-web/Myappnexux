/**
 * NEXUS feature-auditoria — Informes comparativos (Fase 2)
 * Extraído del monolito. Requiere globals de nexus-app.js + audit-engine (currentFilteredTx).
 */
(function (global) {
  "use strict";

        function nexusInformeFlowCategoryLabel(flowType) {
            const t = (k, fb) => (typeof nexusT === 'function' ? nexusT(k) : fb);
            if (flowType === 'income') return t('audit.incomeCategory', 'Categoría de ingreso');
            if (flowType === 'expense') return t('audit.expenseCategory', 'Categoría de gasto');
            return t('common.category', 'Categoría');
        }

        function getInformeTxPool() {
            if (window.currentFilteredTx && window.currentFilteredTx.length) return [...window.currentFilteredTx];
            if (typeof renderDatabase === 'function') renderDatabase();
            return window.currentFilteredTx && window.currentFilteredTx.length ? [...window.currentFilteredTx] : [];
        }

        /** Flujo contable real para informes (solo ingreso/gasto operativo). */
        function nexusInformeTxFlowType(tx) {
            if (!tx || tx.isProjected) return null;
            const r = tx.renderType || tx.type;
            if (r === 'income') return 'income';
            if (r === 'expense') return 'expense';
            return null;
        }

        /** Padre [Ingresos]/[Gastos] en etiqueta de categoría. */
        function nexusInformeCategoryParent(cat) {
            if (!cat) return '';
            const m = String(cat).match(/\[(.*?)\]\s*(.*)/);
            return m ? m[1].trim() : String(cat).trim();
        }

        function nexusCategoryLabelMatchesInformeFlow(cat, flow) {
            if (!cat || flow === 'all') return true;
            sanitizeUserCategoriesInState();
            if (flow === 'income') return (state.categories.income || []).includes(cat);
            if (flow === 'expense') return (state.categories.expense || []).includes(cat);
            return true;
        }

        function nexusCatMatchesInformeSelector(txCat, catSel) {
            if (!catSel || catSel === '__all__') return true;
            const cat = (txCat || '').trim();
            const sel = String(catSel).trim();
            if (!cat) return false;
            if (cat === sel) return true;
            const m = cat.match(/\[(.*?)\]\s*(.*)/);
            if (m) {
                const p = m[1].trim();
                const s = (m[2] || '').trim();
                if (`[${p}] ${s}` === sel || s === sel || p === sel) return true;
            }
            return cat.toLowerCase().includes(sel.toLowerCase());
        }

        function collectInformeCategoryOptions(typeFilter) {
            const set = new Set();
            if (typeof sanitizeUserCategoriesInState === 'function') sanitizeUserCategoriesInState();
            const pool = getInformeTxPool();
            pool.forEach(t => {
                const flow = nexusInformeTxFlowType(t);
                if (typeFilter === 'expense' && flow !== 'expense') return;
                if (typeFilter === 'income' && flow !== 'income') return;
                if (typeFilter === 'all' && !flow) return;
                if (t.cat) set.add(String(t.cat).trim());
            });
            const catalog = typeFilter === 'income'
                ? (state.categories?.income || [])
                : typeFilter === 'expense'
                    ? (state.categories?.expense || [])
                    : getUserCategoryLabels();
            catalog.forEach(c => { if (c) set.add(c); });
            return [...set].sort((a, b) => String(a).localeCompare(String(b), 'es'));
        }

        function populateInformeAccountSelect() {
            const sel = $id('informe-filter-account');
            const dbAcc = $id('db-filter-account');
            if (!sel) return;
            const prev = sel.value || 'all';
            sel.innerHTML = '<option value="all">Todas (filtro auditoría)</option>';
            (state.accounts || []).forEach(a => {
                if (!a || !a.id) return;
                sel.innerHTML += `<option value="${a.id}">${a.name || a.id}</option>`;
            });
            if (dbAcc && dbAcc.value && dbAcc.value !== 'all') sel.value = dbAcc.value;
            else if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
        }

        function refreshInformeCategoryOptions() {
            const selA = $id('informe-cat-a');
            const selB = $id('informe-cat-b');
            let typeA = $id('informe-type-a') ? $id('informe-type-a').value : 'expense';
            let typeB = $id('informe-type-b') ? $id('informe-type-b').value : 'income';
            const labelA = $id('informe-cat-a') && $id('informe-cat-a').previousElementSibling;
            const labelB = $id('informe-cat-b') && $id('informe-cat-b').previousElementSibling;
            if (labelA) labelA.textContent = nexusInformeFlowCategoryLabel(typeA);
            if (labelB) labelB.textContent = nexusInformeFlowCategoryLabel(typeB);
            const optsA = collectInformeCategoryOptions(typeA);
            const optsB = collectInformeCategoryOptions(typeB);
            const buildOpts = (list, typeFilter) => {
                const t = (k, fb) => (typeof nexusT === 'function' ? nexusT(k) : fb);
                const allLabel = typeFilter === 'income'
                    ? t('audit.allIncomeCategories', '— Todas las categorías de ingreso —')
                    : typeFilter === 'expense'
                        ? t('audit.allExpenseCategories', '— Todas las categorías de gasto —')
                        : t('audit.allCategories', '— Todas las categorías —');
                let html = `<option value="__all__">${allLabel}</option>`;
                const byParent = {};
                list.forEach(c => {
                    const parent = nexusInformeCategoryParent(c) || 'Otras';
                    if (!byParent[parent]) byParent[parent] = [];
                    byParent[parent].push(c);
                });
                const parents = Object.keys(byParent).sort((a, b) => a.localeCompare(b, 'es'));
                parents.forEach(parent => {
                    const items = byParent[parent].sort((a, b) => a.localeCompare(b, 'es'));
                    if (parents.length > 1 && parent !== 'Otras') {
                        html += `<optgroup label="${String(parent).replace(/"/g, '&quot;')}">`;
                    }
                    items.forEach(c => {
                        const m = String(c).match(/\[(.*?)\]\s*(.*)/);
                        const label = m && m[2] ? m[2].trim() : c;
                        html += `<option value="${String(c).replace(/"/g, '&quot;')}">${label}</option>`;
                    });
                    if (parents.length > 1 && parent !== 'Otras') html += '</optgroup>';
                });
                return html;
            };
            if (selA) {
                const p = selA.value;
                selA.innerHTML = buildOpts(optsA, typeA);
                if (p && [...selA.options].some(o => o.value === p)) selA.value = p;
                else selA.value = '__all__';
            }
            if (selB) {
                const p = selB.value;
                selB.innerHTML = buildOpts(optsB, typeB);
                if (p && [...selB.options].some(o => o.value === p)) selB.value = p;
                else selB.value = '__all__';
            }
        }

        function txMatchesInformeBlock(tx, typeFilter, catSel, needle) {
            if (tx.isProjected) return false;
            const flow = nexusInformeTxFlowType(tx);
            if (typeFilter === 'expense' && flow !== 'expense') return false;
            if (typeFilter === 'income' && flow !== 'income') return false;
            if (typeFilter === 'all' && !flow) return false;
            if (!nexusCatMatchesInformeSelector(tx.cat, catSel)) return false;
            const hay = ((tx.cat || '') + ' ' + (tx.note || '')).toLowerCase();
            const n = (needle || '').trim().toLowerCase();
            if (n && !hay.includes(n)) return false;
            return true;
        }

        function sumInformeBlock(txs, targetCurr) {
            let total = 0;
            txs.forEach(t => {
                if (t.isProjected) return;
                const amt = convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, targetCurr);
                total += Math.abs(amt);
            });
            return { total, count: txs.length };
        }

        function openAuditInformes() {
            const mod = $id('audit-informe-modal');
            if (!mod) return;
            if (typeof renderDatabase === 'function') renderDatabase();
            populateInformeAccountSelect();
            refreshInformeCategoryOptions();
            const res = $id('informe-results');
            if (res) { res.classList.add('hidden'); res.innerHTML = ''; }
            const cur = $id('informe-currency');
            const dbCur = $id('db-currency');
            if (cur && dbCur) cur.value = dbCur.value || 'BASE';
            nexusShowModalInstant(mod);
        }

        function closeAuditInformes() {
            const mod = $id('audit-informe-modal');
            if (mod) mod.classList.add('hidden');
        }

        function runAuditInforme() {
            if (global.__NexusInformeDomain && typeof global.__NexusInformeDomain.run === "function") {
                return global.__NexusInformeDomain.run();
            }
            const pool = getInformeTxPool();
            if (!pool.length) return alert('No hay movimientos con los filtros actuales. Ajusta fechas en Auditoría.');

            const acc = $id('informe-filter-account') ? $id('informe-filter-account').value : 'all';
            const curSel = $id('informe-currency');
            const targetCurr = (curSel && curSel.value !== 'BASE') ? curSel.value : (state.settings.baseCurrency || 'COP');

            const typeA = $id('informe-type-a').value;
            const typeB = $id('informe-type-b').value;
            const catA = $id('informe-cat-a').value;
            const catB = $id('informe-cat-b').value;
            const needleA = ($id('informe-needle-a').value || '').trim();
            const needleB = ($id('informe-needle-b').value || '').trim();

            let scoped = pool;
            if (acc !== 'all') {
                scoped = pool.filter(t => t.accId === acc || t.toAccId === acc);
            }

            const txsA = scoped.filter(t => txMatchesInformeBlock(t, typeA, catA, needleA));
            const txsB = scoped.filter(t => txMatchesInformeBlock(t, typeB, catB, needleB));
            const sumA = sumInformeBlock(txsA, targetCurr);
            const sumB = sumInformeBlock(txsB, targetCurr);

            const labelA = (typeA === 'income' ? 'Ingreso' : typeA === 'expense' ? 'Gasto' : 'Mov.') + ': ' + (needleA || (catA !== '__all__' ? catA : 'bloque A'));
            const labelB = (typeB === 'income' ? 'Ingreso' : typeB === 'expense' ? 'Gasto' : 'Mov.') + ': ' + (needleB || (catB !== '__all__' ? catB : 'bloque B'));

            let insight = '';
            if (typeA === 'expense' && typeB === 'income' && sumB.total > 0) {
                const pct = (sumA.total / sumB.total) * 100;
                insight = `<p class="text-[9px] font-bold text-purple-800 mt-2">El gasto A representa <b>${pct.toFixed(1)}%</b> del ingreso B en este periodo.</p>`;
            } else if (typeA === 'income' && typeB === 'expense' && sumB.total > 0) {
                const pct = (sumA.total / sumB.total) * 100;
                insight = `<p class="text-[9px] font-bold text-purple-800 mt-2">El ingreso A cubre <b>${pct.toFixed(1)}%</b> del gasto B.</p>`;
            } else {
                const diff = sumB.total - sumA.total;
                insight = `<p class="text-[9px] font-bold text-slate-600 mt-2">Diferencia B − A: <b>${fmt(diff, targetCurr)}</b></p>`;
            }

            const maxBar = Math.max(sumA.total, sumB.total, 1);
            const wA = Math.round((sumA.total / maxBar) * 100);
            const wB = Math.round((sumB.total / maxBar) * 100);

            const box = $id('informe-results');
            if (!box) return;
            box.classList.remove('hidden');
            box.innerHTML = `
                <div class="theme-card p-4 rounded-2xl border space-y-3">
                    <p class="text-[8px] font-black uppercase text-slate-400">${pool.length} mov. en periodo · ${scoped.length} en cuenta · ${targetCurr}</p>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="p-3 rounded-xl bg-rose-50 border border-rose-100">
                            <p class="text-[8px] font-black uppercase text-rose-600">${labelA}</p>
                            <p class="text-lg font-black text-rose-700 tabular-nums">${fmt(sumA.total, targetCurr)}</p>
                            <p class="text-[8px] text-rose-600 font-bold">${sumA.count} registro(s)</p>
                            <div class="h-2 bg-rose-100 rounded-full mt-2 overflow-hidden"><div class="h-full bg-rose-500" style="width:${wA}%"></div></div>
                        </div>
                        <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                            <p class="text-[8px] font-black uppercase text-emerald-600">${labelB}</p>
                            <p class="text-lg font-black text-emerald-700 tabular-nums">${fmt(sumB.total, targetCurr)}</p>
                            <p class="text-[8px] text-emerald-600 font-bold">${sumB.count} registro(s)</p>
                            <div class="h-2 bg-emerald-100 rounded-full mt-2 overflow-hidden"><div class="h-full bg-emerald-500" style="width:${wB}%"></div></div>
                        </div>
                    </div>
                    ${insight}
                    <button type="button" data-nexus-action="askInformeAiSummary" class="w-full mt-2 bg-indigo-50 text-indigo-700 py-2.5 rounded-xl text-[9px] font-black uppercase border border-indigo-100 active:scale-95"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i> Resumen IA de esta comparativa</button>
                </div>`;
            window.__lastInformeSummary = { labelA, labelB, sumA, sumB, targetCurr, typeA, typeB };
        }

        async function askInformeAiSummary() {
            const s = window.__lastInformeSummary;
            if (!s) return alert('Genera la comparativa primero.');
            hydrateAiKeysFromAllSources();
            if (!getAiApiKey()) {
                alert('Configura API Key en Ajustes → Motor IA y pulsa Guardar.');
                closeAuditInformes();
                switchTab('settings');
                return;
            }
            const prompt = `Comparativa financiera Nexus AR:
Bloque A (${s.labelA}): ${s.sumA.count} movimientos, total ${s.sumA.total} ${s.targetCurr}, tipo ${s.typeA}.
Bloque B (${s.labelB}): ${s.sumB.count} movimientos, total ${s.sumB.total} ${s.targetCurr}, tipo ${s.typeB}.
Explica en 4-6 líneas si la relación es sostenible y una recomendación práctica.`;
            try {
                closeAuditInformes();
                openAIAuditor();
                const q = $id('ai-user-query');
                if (q) q.value = prompt;
                await executeAIAudit();
            } catch (e) {
                alert('IA: ' + (e.message || 'error'));
            }
        }



  const api = {
    nexusInformeFlowCategoryLabel,
    getInformeTxPool,
    nexusInformeTxFlowType,
    nexusInformeCategoryParent,
    nexusCategoryLabelMatchesInformeFlow,
    nexusCatMatchesInformeSelector,
    collectInformeCategoryOptions,
    populateInformeAccountSelect,
    refreshInformeCategoryOptions,
    txMatchesInformeBlock,
    sumInformeBlock,
    openAuditInformes,
    closeAuditInformes,
    runAuditInforme,
    askInformeAiSummary,
  };

  global.NexusAuditInformes = api;

  global.nexusInformeFlowCategoryLabel = nexusInformeFlowCategoryLabel;
  global.getInformeTxPool = getInformeTxPool;
  global.refreshInformeCategoryOptions = refreshInformeCategoryOptions;
  global.openAuditInformes = openAuditInformes;
  global.closeAuditInformes = closeAuditInformes;
  global.runAuditInforme = runAuditInforme;
  global.askInformeAiSummary = askInformeAiSummary;

  console.info("[NEXUS] feature-auditoria audit-informes.js cargado");
})(typeof window !== "undefined" ? window : globalThis);
