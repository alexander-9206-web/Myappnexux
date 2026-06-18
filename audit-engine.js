/**
 * NEXUS feature-auditoria — Motor SSoT (Fase 2)
 * Extraído del monolito. Requiere globals de nexus-app.js ($id, state, fmt, …).
 */
(function (global) {
  "use strict";

  function syncStateToHost() {
    if (!global.NexusAuditEngine) global.NexusAuditEngine = { __state: {} };
    global.NexusAuditEngine.__state = {
      dbSortOrder,
      dbShowDuplicates,
      currentFilteredTx,
      currentAuditStats,
      dbAuditRenderedCount,
      dbAuditSelectMode,
      dbAuditPendingDeleteId,
      dbAuditScrollObserver,
    };
    global.currentFilteredTx = currentFilteredTx;
    global.currentAuditStats = currentAuditStats;
    global.dbAuditSelectMode = dbAuditSelectMode;
  }

        let dbSortOrder = 'desc';
        let dbShowDuplicates = false;
        let currentFilteredTx = []; // Dataset completo filtrado (PDF, informes, totales — NUNCA recortado por paginación)
        let currentAuditStats = {}; // Totales calculados sobre currentFilteredTx completo
        let dbAuditRenderedCount = 20;
        let dbAuditSelectMode = false;
        let dbAuditPendingDeleteId = null;
        let dbAuditScrollObserver = null;

        function nexusGetAuditPageSize() {
            const n = parseInt(state?.settings?.auditPageSize, 10);
            if (!Number.isNaN(n) && n >= 5 && n <= 100) return n;
            return 20;
        }
        function nexusEnsureAuditSelection() {
            if (!state.ui) state.ui = {};
            if (!Array.isArray(state.ui.dbAuditSelected)) state.ui.dbAuditSelected = [];
        }
        function nexusGetAuditSelectedSet() {
            nexusEnsureAuditSelection();
            return new Set(state.ui.dbAuditSelected || []);
        }
        function nexusIsAuditRowDeletable(t) {
            if (!t || !t.id) return false;
            if (t.isProjected || t.apAuditRole || t.loanAuditRole) return false;
            if (typeof nexusIsAfterpayAuditSynthetic === 'function' && nexusIsAfterpayAuditSynthetic(t)) return false;
            if (typeof nexusIsDebtAuditSynthetic === 'function' && nexusIsDebtAuditSynthetic(t)) return false;
            return true;
        }
        function nexusUpdateAuditBulkBar() {
            const bar = $id('db-audit-bulk-bar');
            const cnt = $id('db-audit-sel-count');
            const sel = nexusGetAuditSelectedSet();
            if (bar) bar.classList.toggle('hidden', !dbAuditSelectMode);
            if (cnt) cnt.innerText = String(sel.size);
        }
        function openAuditDeleteChoice(txId) {
            dbAuditPendingDeleteId = txId || null;
            const mod = $id('audit-delete-choice-modal');
            const sub = $id('audit-delete-choice-subtitle');
            const simpleBtn = $id('audit-delete-simple-btn');
            if (sub) {
                sub.textContent = txId
                    ? 'Puedes borrar solo este movimiento o activar selección múltiple.'
                    : 'Activa selección múltiple o toca la papelera en cada fila para borrado simple.';
            }
            if (simpleBtn) {
                if (txId) { simpleBtn.classList.remove('hidden'); simpleBtn.disabled = false; }
                else { simpleBtn.classList.add('hidden'); }
            }
            if (mod) nexusShowModalInstant(mod);
        }
        function closeAuditDeleteChoiceModal() {
            nexusHideModalInstant($id('audit-delete-choice-modal'));
            dbAuditPendingDeleteId = null;
        }
        function executeAuditDeleteSimple() {
            const id = dbAuditPendingDeleteId;
            closeAuditDeleteChoiceModal();
            if (!id) return;
            if (typeof nexusPromptDeleteTransaction === 'function') nexusPromptDeleteTransaction(id, null);
            else deleteDatabaseRecord(id);
        }
        function enterAuditBulkDeleteMode() {
            const seedId = dbAuditPendingDeleteId;
            closeAuditDeleteChoiceModal();
            dbAuditSelectMode = true;
            nexusEnsureAuditSelection();
            state.ui.dbAuditSelected = seedId ? [seedId] : [];
            nexusUpdateAuditBulkBar();
            renderDatabase();
        }
        function exitAuditBulkDeleteMode() {
            dbAuditSelectMode = false;
            nexusEnsureAuditSelection();
            state.ui.dbAuditSelected = [];
            nexusUpdateAuditBulkBar();
            renderDatabase();
        }
        function nexusGetAuditTxById(id) {
            return (currentFilteredTx || []).find(x => x.id === id) || (state.tx || []).find(x => x.id === id);
        }
        function nexusToggleAuditSelect(id, checked) {
            if (!nexusIsAuditRowDeletable(nexusGetAuditTxById(id))) return;
            nexusEnsureAuditSelection();
            const arr = state.ui.dbAuditSelected;
            const idx = arr.indexOf(id);
            if (checked && idx === -1) arr.push(id);
            else if (!checked && idx > -1) arr.splice(idx, 1);
            nexusUpdateAuditBulkBar();
        }
        function nexusAuditSelectAllDeletable() {
            nexusEnsureAuditSelection();
            const deletable = (currentFilteredTx || []).filter(nexusIsAuditRowDeletable).map(t => t.id);
            const sel = nexusGetAuditSelectedSet();
            const allOn = deletable.length > 0 && deletable.every(id => sel.has(id));
            state.ui.dbAuditSelected = allOn ? [] : deletable;
            nexusUpdateAuditBulkBar();
            renderDatabase();
        }
        function promptBulkDeleteAuditRecords() {
            const ids = [...nexusGetAuditSelectedSet()];
            if (!ids.length) return alert('Selecciona al menos un registro eliminable (no proyecciones ni cronogramas).');
            triggerUIConfirm(
                '¿Eliminar ' + ids.length + ' registro(s) de auditoría?\n\nVan a la papelera 15 días. Las proyecciones del cronograma no se borran desde aquí.',
                'audit_bulk_delete_tx',
                ids.join(',')
            );
        }
        function nexusBulkDeleteAuditRecords(ids) {
            if (!ids || !ids.length) return 0;
            let n = 0;
            ids.forEach(id => {
                if (typeof nexusRootDeleteTransaction === 'function' && nexusRootDeleteTransaction(id, { source: 'audit' })) n++;
            });
            return n;
        }
        function nexusBuildAuditDupTrackerPrefix(txs, endIdx) {
            const dupTracker = {};
            for (let i = 0; i < endIdx; i++) {
                const t = txs[i];
                const sig = `${t.note || ''}|${t.cat || ''}|${t.original_amount || t.amount}|${t.date ? t.date.split('T')[0] : ''}`;
                dupTracker[sig] = (dupTracker[sig] || 0) + 1;
            }
            return dupTracker;
        }
        function nexusBuildAuditCardHtml(t, ctx) {
            const fAcc = ctx.fAcc;
            const dupTracker = ctx.dupTracker;
            const origCur = t.original_currency || t.currency;
            const origAmt = t.original_amount || t.amount;
            const rType = t.renderType || t.type;
            const isOutflow = rType === 'expense' || rType === 'afterpay' || (rType === 'transfer' && t.accId === fAcc);
            const isInflow = rType === 'income' || (rType === 'transfer' && t.toAccId === fAcc);
            let isPar = false;
            if (dbShowDuplicates) {
                const sig = `${t.note || ''}|${t.cat || ''}|${origAmt}|${t.date ? t.date.split('T')[0] : ''}`;
                dupTracker[sig] = (dupTracker[sig] || 0) + 1;
                if (dupTracker[sig] % 2 === 0) isPar = true;
            }
            let cT = '', iB = '', iClass = '';
            if (isInflow) { cT = isPar ? 'text-red-700' : 'text-emerald-500'; iB = 'bg-emerald-100 text-emerald-500'; iClass = 'fa-arrow-up'; }
            else if (rType === 'afterpay') { cT = isPar ? 'text-purple-700' : 'text-purple-500'; iB = 'bg-purple-50 text-purple-500'; iClass = 'fa-layer-group'; }
            else if (isOutflow && (nexusIsAfterpayProjectedQuota(t) || nexusIsAfterpayAuditSynthetic(t) || (t.cat && t.cat.includes('Afterpay')) || (t.note && (t.note.includes('[Abono]') || t.note.includes('[Pago Inicial]') || t.note.includes('[Pago inicial proyectado]') || t.note.includes('[Pendiente]') || t.note.includes('[Amortizado]') || t.note.includes('[Compra BNPL]'))))) { cT = isPar ? 'text-teal-700' : 'text-teal-500'; iB = 'bg-teal-50 text-teal-500'; iClass = 'fa-layer-group'; }
            else if (isOutflow && (t.cat && (t.cat.includes('Deuda') || t.cat.includes('TC')) || (t.note && t.note.includes('[TC]')))) { cT = isPar ? 'text-red-700' : 'text-orange-500'; iB = 'bg-orange-50 text-orange-500'; iClass = 'fa-landmark'; }
            else if (isOutflow) { cT = isPar ? 'text-red-700' : 'text-red-500'; iB = 'bg-red-50 text-red-500'; iClass = 'fa-arrow-down'; }
            else { cT = isPar ? 'text-red-700' : 'text-indigo-500'; iB = 'bg-indigo-50 text-indigo-500'; iClass = 'fa-right-left'; }
            const sign = isOutflow ? '-' : (isInflow ? '+' : '');
            const aN = t.auditArchived ? (t.auditAccountName || 'Cuenta archivada') : (state.accounts.find(a => a.id === t.accId)?.name || '--');
            const auditVaultBadge = t.auditArchived ? '<span class="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[7px] font-black uppercase border border-amber-200">Auditoría</span>' : '';
            let aNDest = '';
            if (t.type === 'transfer') {
                const dN = t.auditArchived && t.toAccId === t.auditAccountId ? (t.auditAccountName || '--') : (state.accounts.find(a => a.id === t.toAccId)?.name || '--');
                aNDest = ` <i class="fa-solid fa-arrow-right text-[7px] mx-1 text-indigo-400"></i> ${dN}`;
            }
            let pBadge = '';
            if (t.isProjected) {
                const isPast = new Date(t.date) <= new Date();
                let bTxt = isPast ? 'PENDIENTE' : 'PROYECTADO';
                let bCls = isPast ? 'bg-red-100 text-red-600 border-red-200' : 'bg-amber-100 text-amber-600 border-amber-200';
                if (t.apAuditRole === 'purchase') { bTxt = 'COMPRA BNPL'; bCls = 'bg-purple-100 text-purple-600 border-purple-200'; }
                else if (t.loanAuditRole === 'purchase' || (t.note && t.note.includes('[Compra TC]'))) { bTxt = 'COMPRA TC'; bCls = 'bg-orange-100 text-orange-600 border-orange-200'; }
                else if (t.apAuditRole === 'amortized' || t.loanAuditRole === 'amortized' || (t.note && t.note.includes('[Amortizado]'))) { bTxt = 'AMORTIZADO'; bCls = 'bg-indigo-100 text-indigo-600 border-indigo-200'; }
                else if (t.loanAuditRole === 'projected' || (t.note && t.note.includes('[Pendiente]') && (t.cat || '').includes('Pago'))) { bTxt = isPast ? 'CUOTA DEUDA VENCIDA' : 'CUOTA DEUDA FUTURA'; bCls = isPast ? 'bg-red-100 text-red-600 border-red-200' : 'bg-orange-100 text-orange-600 border-orange-200'; }
                else if (t.apAuditRole === 'first_projected' || (t.note && t.note.includes('[Pago inicial proyectado]'))) { bTxt = 'PAGO INICIAL PROY.'; bCls = 'bg-indigo-100 text-indigo-600 border-indigo-200'; }
                else if (nexusIsAfterpayProjectedQuota(t) || (t.note && t.note.includes('[Pendiente]'))) { bTxt = isPast ? 'CUOTA VENCIDA' : 'CUOTA FUTURA'; bCls = isPast ? 'bg-red-100 text-red-600 border-red-200' : 'bg-teal-100 text-teal-600 border-teal-200'; }
                if (t.cat === '⚡ Pendiente Único' && t.priority) {
                    bTxt = `PRIORIDAD ${t.priority === 'high' ? 'ALTA' : (t.priority === 'medium' ? 'MEDIA' : 'BAJA')}`;
                    if (t.priority === 'high') bCls = 'bg-red-100 text-red-600 border-red-200';
                    else if (t.priority === 'medium') bCls = 'bg-amber-100 text-amber-600 border-amber-200';
                    else if (t.priority === 'low') bCls = 'bg-emerald-100 text-emerald-600 border-emerald-200';
                }
                pBadge = `<span class="text-[8px] ${bCls} px-2 py-0.5 rounded-full ml-2 border">${bTxt}</span>`;
            } else if (rType === 'afterpay') {
                pBadge = `<span class="text-[8px] bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full ml-2 border border-purple-200">COMPRA BNPL</span>`;
            } else if (t.apAuditRole === 'amortized' || t.loanAuditRole === 'amortized' || (t.note && t.note.includes('[Amortizado]'))) {
                pBadge = `<span class="text-[8px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full ml-2 border border-emerald-200 shadow-sm"><i class="fa-solid fa-check mr-1"></i>AMORTIZADO</span>`;
            } else if (t.loanAuditRole === 'purchase' || (t.note && t.note.includes('[Compra TC]'))) {
                pBadge = `<span class="text-[8px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full ml-2 border border-orange-200">COMPRA TC</span>`;
            } else if (t.loanAuditRole === 'projected' || (t.isProjected && String(t.id||'').startsWith('proj_loan_'))) {
                pBadge = `<span class="text-[8px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full ml-2 border border-amber-200">CUOTA PROYECTADA</span>`;
            } else if (t.note && (t.note.includes('[Abono Realizado]') || t.note.includes('[Abono]'))) {
                pBadge = `<span class="text-[8px] bg-teal-100 text-teal-600 px-2 py-0.5 rounded-full ml-2 border border-teal-200 shadow-sm"><i class="fa-solid fa-check mr-1"></i>CUOTA PAGADA</span>`;
            } else if (t.note && t.note.includes('[Pago Inicial]')) {
                pBadge = `<span class="text-[8px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full ml-2 border border-indigo-200 shadow-sm"><i class="fa-solid fa-bolt mr-1"></i>PAGO INICIAL</span>`;
            } else if (t.note && t.note.includes('[TC]')) {
                pBadge = `<span class="text-[8px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full ml-2 border border-red-200">CUOTA TC</span>`;
            }
            const pCreator = t.createdBy ? `<span class="text-[8px] bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full ml-2 border border-purple-200 shadow-sm"><i class="fa-solid fa-user mr-1"></i>${t.createdBy.split(' ')[0]}</span>` : '';
            const isAuditScheduleRow = t.isProjected || t.apAuditRole || t.loanAuditRole || nexusIsAfterpayAuditSynthetic(t) || nexusIsDebtAuditSynthetic(t);
            const deletable = nexusIsAuditRowDeletable(t);
            const isSelected = nexusGetAuditSelectedSet().has(t.id);
            const editAction = (dbAuditSelectMode || isAuditScheduleRow) ? '' : `editTransaction('${t.id}')`;
            const cardBgClass = isPar ? 'bg-red-50 border-red-300' : (isSelected ? 'bg-red-50/40 border-red-300' : 'theme-card border-slate-100/50 hover:border-blue-300');
            const cursorClass = (dbAuditSelectMode && deletable) ? 'cursor-pointer' : (isAuditScheduleRow ? 'cursor-default' : 'cursor-pointer');
            const textTitleClass = isPar ? 'text-red-700' : 'theme-text';
            const textSubClass = isPar ? 'text-red-500' : 'text-slate-400';
            const safeId = String(t.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            let deleteBtnAttrs;
            if (isAuditScheduleRow) {
                deleteBtnAttrs = (nexusIsAfterpayProjectedQuota(t) || nexusIsAfterpayAuditSynthetic(t) || t.apAuditRole)
                    ? 'data-nexus-action="nexusAuditScheduleAlertAfterpay" data-nexus-pass-event="1"'
                    : 'data-nexus-action="nexusAuditScheduleAlertDebt" data-nexus-pass-event="1"';
            } else if (dbAuditSelectMode && deletable) {
                deleteBtnAttrs = `data-nexus-action="nexusToggleAuditSelectFlip" data-nexus-payload='["${safeId}",${isSelected ? 'true' : 'false'}]' data-nexus-pass-event="1"`;
            } else {
                deleteBtnAttrs = `data-nexus-action="openAuditDeleteChoice" data-nexus-arg="${safeId}" data-nexus-pass-event="1"`;
            }
            const dDate = new Date(t.date);
            const amtFull = `${sign}${fmt(origAmt, origCur)}`;
            const titleTxt = (t.note || (t.cat ? t.cat.substring(2) : '')).replace(/</g, '&lt;');
            const metaLine = `${dDate.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })} ${String(dDate.getHours()).padStart(2,'0')}:${String(dDate.getMinutes()).padStart(2,'0')} • ${aN}${aNDest}`;
            const cardAttrs = dbAuditSelectMode && deletable
                ? `data-nexus-action="nexusToggleAuditSelectFlip" data-nexus-payload='["${safeId}",${isSelected ? 'true' : 'false'}]'`
                : ((dbAuditSelectMode || isAuditScheduleRow) ? '' : `data-nexus-action="editTransaction" data-nexus-arg="${t.id}"`);
            const checkHtml = (dbAuditSelectMode && deletable)
                ? `<input type="checkbox" class="w-4 h-4 accent-red-600 shrink-0 mt-1" ${isSelected ? 'checked' : ''} data-nexus-change-action="nexusToggleAuditSelectAndRender" data-nexus-payload='["${safeId}"]' data-nexus-source-id="1">`
                : '';
            return `<div ${cardAttrs} class="db-audit-card ${cursorClass} ${cardBgClass} p-3 sm:p-4 rounded-2xl shadow-sm border transition-all w-full max-w-full overflow-hidden">
                <div class="flex items-start gap-2.5 min-w-0">
                    ${checkHtml}
                    <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center ${iB} shrink-0"><i class="fa-solid ${iClass} text-[10px] sm:text-xs"></i></div>
                    <div class="min-w-0 flex-1">
                        <p class="text-[10px] sm:text-[11px] font-black uppercase ${textTitleClass} truncate leading-tight">${titleTxt}</p>
                        <p class="db-audit-meta text-[7px] sm:text-[8px] font-bold ${textSubClass} uppercase mt-0.5">${metaLine} ${auditVaultBadge} ${pBadge} ${pCreator}</p>
                    </div>
                    <button type="button" ${deleteBtnAttrs} class="text-slate-300 hover:text-red-500 w-7 h-7 sm:w-8 sm:h-8 bg-slate-50 hover:bg-white rounded-full flex items-center justify-center transition-colors shrink-0"><i class="fa-solid ${dbAuditSelectMode && deletable ? 'fa-check' : 'fa-trash'} text-[9px] sm:text-[10px]"></i></button>
                </div>
                <div class="db-audit-amt-row flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100/80">
                    <span class="text-[7px] font-black uppercase text-slate-400 shrink-0">Monto</span>
                    <span class="db-audit-amt nexus-amount-fit font-black ${cT}" title="${amtFull}">${amtFull}</span>
                </div>
            </div>`;
        }
        function nexusRenderAuditListSlice(fromIdx, toIdx, append) {
            const lC = $id('db-list');
            if (!lC || !currentFilteredTx.length) return;
            const fAccEl = $id('db-filter-account');
            const fAcc = fAccEl ? fAccEl.value : 'all';
            const dupTracker = nexusBuildAuditDupTrackerPrefix(currentFilteredTx, fromIdx);
            const slice = currentFilteredTx.slice(fromIdx, toIdx);
            const html = slice.map(t => nexusBuildAuditCardHtml(t, { fAcc, dupTracker })).join('');
            if (append) {
                const sentinel = $id('db-audit-load-sentinel');
                if (sentinel) sentinel.insertAdjacentHTML('beforebegin', html);
                else lC.insertAdjacentHTML('beforeend', html);
            } else {
                lC.innerHTML = html;
            }
            requestAnimationFrame(() => fitNexusAmounts($id('tab-database')));
        }
        function nexusUpdateAuditPageHint(visible, total) {
            const hint = $id('db-audit-page-hint');
            if (!hint) return;
            const st = currentAuditStats || {};
            const realN = st.realCount != null ? st.realCount : '—';
            const projN = st.projectedCount != null ? st.projectedCount : '—';
            if (visible < total) {
                hint.classList.remove('hidden');
                hint.textContent = `Vista: ${visible} de ${total} filas en pantalla (bloques de ${nexusGetAuditPageSize()}). Cálculos sobre las ${total} completas: ${realN} reales + ${projN} proyecciones/cronograma. Desplázate para ver el resto.`;
            } else {
                hint.classList.add('hidden');
                hint.textContent = '';
            }
        }
        /** Suma flujo de caja real sobre TODAS las filas (no usa paginación). */
        function nexusComputeAuditCashFlowTotal(rows, targetCurr, fAcc) {
            return (rows || []).reduce((s, t) => {
                if (t.isProjected || t.nexusSkipAuditTotal || t.apInternalOnly) return s;
                const rType = t.renderType || t.type;
                const amt = convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, targetCurr);
                if (fAcc !== 'all') {
                    if (rType === 'afterpay') return s;
                    const isOut = rType === 'expense' || (rType === 'transfer' && t.accId === fAcc);
                    const isIn = rType === 'income' || (rType === 'transfer' && t.toAccId === fAcc);
                    if (isIn) return s + amt;
                    if (isOut) return s - amt;
                    return s;
                }
                if (t.type === 'transfer' || t.type === 'isolated') return s;
                if (t.renderType === 'afterpay') return s;
                return t.type === 'income' ? s + amt : (t.type === 'expense' ? s - amt : s);
            }, 0);
        }
        /** Compromiso proyectado (cuotas futuras + cronograma) — informativo, todas las filas. */
        function nexusComputeAuditProjectedExposure(rows, targetCurr) {
            return (rows || []).reduce((s, t) => {
                if (!t.isProjected && !t.apAuditRole && !t.loanAuditRole) return s;
                if (t.nexusSkipAuditTotal) return s;
                if (t.apAuditRole === 'purchase' || t.loanAuditRole === 'purchase') return s;
                if (t.apAuditRole === 'amortized' || t.loanAuditRole === 'amortized') return s;
                const amt = convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, targetCurr);
                return s + Math.abs(amt);
            }, 0);
        }
        function nexusComputeAuditStats(rows, targetCurr, fAcc) {
            const all = rows || [];
            let realCount = 0;
            let projectedCount = 0;
            all.forEach(t => {
                if (t.isProjected || t.apAuditRole === 'projected' || t.apAuditRole === 'first_projected' || t.loanAuditRole === 'projected') projectedCount++;
                else if (t.apAuditRole === 'purchase' || t.loanAuditRole === 'purchase') projectedCount++;
                else realCount++;
            });
            return {
                totalCount: all.length,
                realCount,
                projectedCount,
                cashFlow: nexusComputeAuditCashFlowTotal(all, targetCurr, fAcc),
                projectedExposure: nexusComputeAuditProjectedExposure(all, targetCurr)
            };
        }
        function nexusUpdateAuditStatsUI(stats, targetCurr) {
            const dcEl = $id('db-count');
            const det = $id('db-count-detail');
            if (dcEl) dcEl.innerText = String(stats.totalCount || 0);
            if (det) {
                det.textContent = stats.totalCount
                    ? ` · ${stats.realCount} reales · ${stats.projectedCount} proy. · calc. 100%`
                    : '';
            }
            const tE = $id('db-total');
            if (tE) {
                const cf = stats.cashFlow || 0;
                const pe = stats.projectedExposure || 0;
                tE.innerText = fmt(cf, targetCurr);
                tE.className = cf >= 0 ? 'theme-val-inc' : 'theme-val-exp';
                tE.title = `Flujo caja real (${stats.realCount} mov.) sobre ${stats.totalCount} registros. Compromiso proyectado informativo: ${fmt(pe, targetCurr)} (${stats.projectedCount} cuotas/cronograma).`;
            }
        }
        /** Proyecciones/cronograma completos (Afterpay + deudas + recurrentes), sin recorte por UI. */
        function nexusGatherAuditProjectionRows(cDisplay) {
            const schedule = nexusCollectAuditProjections(cDisplay);
            const scheduleIds = new Set(schedule.map(r => r.id));
            const prevCurr = state.activeCurrency;
            state.activeCurrency = 'GLOBAL';
            const recurrent = getEnrichedTx().filter(t => {
                const id = String(t.id || '');
                return t.isProjected && id.startsWith('proj_recur_') && !scheduleIds.has(id);
            }).map(t => ({
                ...t,
                original_amount: t.original_amount != null ? t.original_amount : t.amount,
                original_currency: t.original_currency || t.currency,
                renderType: t.renderType || t.type
            }));
            state.activeCurrency = prevCurr;
            return [...schedule, ...recurrent];
        }
        function nexusAuditLoadMore() {
            const total = currentFilteredTx.length;
            if (dbAuditRenderedCount >= total) return;
            const from = dbAuditRenderedCount;
            dbAuditRenderedCount = Math.min(dbAuditRenderedCount + nexusGetAuditPageSize(), total);
            nexusRenderAuditListSlice(from, dbAuditRenderedCount, true);
            nexusUpdateAuditPageHint(dbAuditRenderedCount, total);
            const sentinel = $id('db-audit-load-sentinel');
            if (sentinel) {
                if (dbAuditRenderedCount >= total) sentinel.remove();
                else sentinel.innerHTML = `<p class="text-center text-[9px] font-black uppercase text-purple-500 py-3"><i class="fa-solid fa-spinner fa-spin mr-1"></i> ${total - dbAuditRenderedCount} más al desplazarte</p>`;
            }
            nexusBindAuditInfiniteScroll();
        }
        function nexusBindAuditInfiniteScroll() {
            if (dbAuditScrollObserver) { dbAuditScrollObserver.disconnect(); dbAuditScrollObserver = null; }
            const sentinel = $id('db-audit-load-sentinel');
            if (!sentinel || dbAuditRenderedCount >= currentFilteredTx.length) return;
            dbAuditScrollObserver = new IntersectionObserver((entries) => {
                if (entries.some(e => e.isIntersecting)) nexusAuditLoadMore();
            }, { root: null, rootMargin: '120px', threshold: 0.05 });
            dbAuditScrollObserver.observe(sentinel);
        }
        function nexusPaintAuditList() {
            const lC = $id('db-list');
            if (!lC) return;
            const total = currentFilteredTx.length;
            if (!total) {
                if (dbShowDuplicates) {
                    lC.innerHTML = `<div class="text-center p-8 theme-card rounded-2xl border border-rose-100 shadow-sm bg-rose-50/30"><p class="text-[10px] font-black uppercase tracking-widest text-rose-400">No hay duplicados exactos</p></div>`;
                } else {
                    lC.innerHTML = `<div class="text-center p-8 theme-card rounded-2xl border shadow-sm"><p class="text-[10px] font-black uppercase tracking-widest text-slate-400">No hay registros</p></div>`;
                }
                nexusUpdateAuditPageHint(0, 0);
                return;
            }
            dbAuditRenderedCount = Math.min(nexusGetAuditPageSize(), total);
            nexusRenderAuditListSlice(0, dbAuditRenderedCount, false);
            if (dbAuditRenderedCount < total) {
                lC.insertAdjacentHTML('beforeend', `<div id="db-audit-load-sentinel" class="py-2"><p class="text-center text-[9px] font-black uppercase text-purple-500 py-3"><i class="fa-solid fa-arrow-down mr-1"></i> Desplázate — ${total - dbAuditRenderedCount} pendientes en pantalla</p></div>`);
            }
            nexusUpdateAuditPageHint(dbAuditRenderedCount, total);
            nexusUpdateAuditBulkBar();
            nexusBindAuditInfiniteScroll();
        }

        function toggleDbSort() {
            dbSortOrder = dbSortOrder === 'desc' ? 'asc' : 'desc';
            const btn = $id('db-sort-btn');
            if (btn) {
                btn.className = 'db-audit-icon-btn bg-slate-100 text-slate-500 px-2 w-auto min-w-[4.25rem] gap-1';
                btn.innerHTML = dbSortOrder === 'desc'
                    ? '<i class="fa-solid fa-arrow-down-short-wide"></i><span class="text-[8px]">DESC</span>'
                    : '<i class="fa-solid fa-arrow-up-wide-short"></i><span class="text-[8px]">ASC</span>';
            }
            renderDatabase();
        }
        
        function toggleDbDuplicates() {
            dbShowDuplicates = !dbShowDuplicates;
            const btn = $id('db-dup-btn');
            if (btn) {
                btn.className = dbShowDuplicates
                    ? 'db-audit-icon-btn bg-rose-100 text-rose-600'
                    : 'db-audit-icon-btn bg-slate-100 text-slate-500';
            }
            renderDatabase();
        }
        
        function nexusResetDatabaseFilters() {
            dbSortOrder = 'desc';
            dbShowDuplicates = false;
            const dbDupBtn = $id('db-dup-btn');
            if (dbDupBtn) dbDupBtn.className = 'db-audit-icon-btn bg-slate-100 text-slate-500';
            const dbSortBtn = $id('db-sort-btn');
            if (dbSortBtn) {
                dbSortBtn.className = 'db-audit-icon-btn bg-slate-100 text-slate-500 px-2 w-auto min-w-[4.25rem] gap-1';
                dbSortBtn.innerHTML = '<i class="fa-solid fa-arrow-down-short-wide"></i><span class="text-[8px]">DESC</span>';
            }
            const dbSearch = $id('db-filter-search');
            if (dbSearch) dbSearch.value = '';
            const tp = $id('db-filter-type'); if (tp) tp.value = 'all';
            const fc = $id('db-filter-currency'); if (fc) fc.value = 'all';
            const fa = $id('db-filter-account'); if (fa) fa.value = 'all';
            const fcost = $id('db-filter-cost'); if (fcost) fcost.value = 'all';
            const dbCurr = $id('db-currency'); if (dbCurr) dbCurr.value = 'BASE';
            setDbQuickFilter(NEXUS_FILTER_DEFAULTS.databaseQuick);
            populateDbAccountFilter();
            renderDatabase();
        }

        function initDatabaseTab() { nexusResetDatabaseFilters(); }
        function populateDbAccountFilter() {
            const accSel = $id('db-filter-account');
            if (!accSel) return;
            accSel.innerHTML = '<option value="all">Todas</option>';
            (state.accounts || []).forEach(a => { accSel.innerHTML += `<option value="${a.id}">${a.name}</option>`; });
            (state.deletedAccounts || []).filter(t => t && t.mode === 'audit').forEach(t => {
                accSel.innerHTML += `<option value="audit:${t.accountId}">📋 ${t.accountName || 'Cuenta archivada'} (auditoría)</option>`;
            });
        }
        function setDbQuickFilter(range) {
            $qAll('#tab-database button[id^="db-qf-"]').forEach(b => { b.classList.remove('bg-white', 'shadow-sm', 'theme-text', 'border', 'border-slate-100'); b.classList.add('text-slate-400'); });
            const btn = $id('db-qf-' + range); if (btn) { btn.classList.remove('text-slate-400'); btn.classList.add('bg-white', 'shadow-sm', 'theme-text', 'border', 'border-slate-100'); }
            const now = new Date(); const start = new Date(); const end = new Date();
            if(range === 'hoy') { start.setHours(0,0,0,0); end.setHours(23,59,59,999); } else if(range === 'semana') { start.setDate(now.getDate() - 7); end.setDate(now.getDate() + 7); } else if(range === 'mes') { start.setDate(now.getDate() - 30); end.setDate(now.getDate() + 365); } else if(range === 'all') { start.setFullYear(2000); end.setFullYear(2100); }
            const fs = $id('db-filter-start'); if(fs) fs.value = start.toISOString().split('T')[0];
            const fe = $id('db-filter-end'); if(fe) fe.value = end.toISOString().split('T')[0]; updateDbCatFilter();
        }

        // Corrección del Filtro de Categorías en Auditoría SSoT para reflejar creaciones dinámicas
        function updateDbCatFilter() {
            const tp = $id('db-filter-type'); if(!tp) return;
            const type = tp.value;
            const select = $id('db-filter-cat');
            
            if(select) {
                select.innerHTML = '<option value="all">Todas</option>';
                let cats = [];
                
                cats = (type === 'income' || type === 'expense') ? getUserCategoryLabels(type) : getUserCategoryLabels();
                if (type === 'afterpay') {
                    const apFromTx = [...new Set((state.tx || []).filter(t => t.type === 'afterpay' && t.cat).map(t => t.cat))];
                    cats = [...new Set([...cats, ...apFromTx])];
                } else if (type === 'debt' || type === 'single_debt') {
                    cats = cats.filter(c => /deuda|tc|pendiente/i.test(c));
                }
                
                // Remover duplicados por seguridad
                cats = [...new Set(cats)];
                
                cats.forEach(c => select.innerHTML += `<option value="${c}">${c}</option>`);
            }
            renderDatabase();
        }

        // =============================================================================
        // 3.05 — MÓDULO AUDITORÍA
        // SSoT transacciones, historial
        // =============================================================================

        function renderDatabase() {
            if (global.__NexusAuditDomain && typeof global.__NexusAuditDomain.render === "function") {
                return global.__NexusAuditDomain.render();
            }

            const fsEl = $id('db-filter-start'); const feEl = $id('db-filter-end'); const ftEl = $id('db-filter-type'); const fcEl = $id('db-filter-cat'); const fCurrEl = $id('db-filter-currency'); if(!fsEl || !feEl || !ftEl || !fcEl) return;
            const st = new Date(fsEl.value); const en = new Date(feEl.value); en.setHours(23,59,59); const tp = ftEl.value; const ct = fcEl.value; const fCurr = fCurrEl ? fCurrEl.value : 'all';
            const fAccEl = $id('db-filter-account'); const fAcc = fAccEl ? fAccEl.value : 'all';
            const fCostEl = $id('db-filter-cost'); const fCost = fCostEl ? fCostEl.value : 'all';
            
            const dbSearchQ = $id('db-filter-search') ? $id('db-filter-search').value.toLowerCase().trim() : '';

            const tempCurr = state.activeCurrency;
            state.activeCurrency = 'GLOBAL';
            const cDisplay = state.settings.baseCurrency || 'COP';
            const auditProjectionRows = nexusGatherAuditProjectionRows(cDisplay);
            const auditMirroredPayIds = new Set(auditProjectionRows.map(r => r.nexusAuditMirrorsTxId).filter(Boolean));

            // Movimientos reales operativos (sin contratos madre Afterpay duplicados en cronograma)
            let rawTxList = nexusGetOperationalTxList()
                .filter(t => !t.isCCPurchase && t.type !== 'afterpay' && !auditMirroredPayIds.has(t.id))
                .map(t => {
                    const tx = {...t, original_amount: t.amount, original_currency: t.currency};
                    tx.renderType = nexusIsAfterpayPaymentTx(tx) ? 'afterpay' : tx.type;
                    const accOrig = state.accounts.find(a => a.id === tx.accId);
                    const accDest = state.accounts.find(a => a.id === tx.toAccId);
                    const isOrigIso = accOrig && (accOrig.isShared || accOrig.type === 'terceros');
                    const isDestIso = accDest && (accDest.isShared || accDest.type === 'terceros');

                    if (tx.type === 'transfer') {
                        if (!isOrigIso && isDestIso) tx.type = 'expense';
                        else if (isOrigIso && !isDestIso) tx.type = 'income';
                        else if (isOrigIso && isDestIso) tx.type = 'isolated';
                    } else if (tx.type === 'expense' || tx.type === 'income') {
                        if (isOrigIso) tx.type = 'isolated';
                    }
                    return tx;
                });

            state.activeCurrency = tempCurr;

            // Dataset completo: reales + TODAS las proyecciones/cronogramas (36 cuotas = 36 en memoria)
            let combinedTxs = [...rawTxList, ...auditProjectionRows].filter(nexusShouldShowTxInAudit);

            let fTx = combinedTxs.filter(t => {
                const d = new Date(t.date);
                if (!nexusAuditExemptFromDateFilter(t) && (d < st || d > en)) return false;
                if (dbSearchQ && !nexusAuditTxMatchesSearch(t, dbSearchQ)) return false;

                const rType = t.renderType || t.type; // Filtramos según comportamiento visual para no confundir al usuario

                if(tp !== 'all') {
                    if (tp === 'afterpay') {
                        const isAp = rType === 'afterpay'
                            || nexusIsAfterpayProjectedQuota(t)
                            || nexusIsAfterpayAuditSynthetic(t)
                            || (t.cat || '').includes('Afterpay')
                            || (t.note || '').includes('[Abono]')
                            || (t.note || '').includes('[Pago Inicial]')
                            || (t.note || '').includes('[Pago inicial proyectado]')
                            || (t.note || '').includes('[Pendiente]')
                            || (t.note || '').includes('[Amortizado]')
                            || (t.note || '').includes('[Compra BNPL]')
                            || (t.note || '').includes('[Compra TC]')
                            || (t.note || '').includes('[Abono Realizado]');
                        if (!isAp) return false;
                    }
                    else if (tp === 'debt') {
                        const isDebt = rType === 'debt' || !!t.loanAuditRole || nexusIsDebtAuditSynthetic(t) || nexusIsDebtProjectedQuota(t)
                            || (t.cat || '').includes('Deuda') || (t.cat || '').includes('TC') || (t.cat || '').includes('Pago TC')
                            || (t.cat || '').includes('Pago Deuda') || (t.note || '').includes('[Cuota')
                            || String(t.id || '').startsWith('proj_loan_');
                        if (!isDebt) return false;
                    }
                    else if (tp === 'single_debt' && !(t.cat || '').includes('Pendiente Único')) return false;
                    else if (['afterpay', 'debt', 'single_debt'].indexOf(tp) === -1 && rType !== tp) return false;
                }
                
                if(ct !== 'all' && t.cat !== ct) return false;
                
                const origCur = t.original_currency || t.currency;
                if(fCurr !== 'all' && origCur !== fCurr) return false;
                if (fAcc !== 'all') {
                    if (String(fAcc).startsWith('audit:')) {
                        const aid = String(fAcc).slice(6);
                        if (!(t.auditArchived && t.auditAccountId === aid)) return false;
                    } else if (t.accId !== fAcc && t.toAccId !== fAcc) return false;
                }
                if(fCost !== 'all' && t.costType !== fCost) return false;
                
                return true;
            });
            
            const curSel = $id('db-currency'); const targetCurr = (curSel && curSel.value !== 'BASE') ? curSel.value : (state.settings.baseCurrency || 'COP');

            // Motor de Escaneo Forense de Duplicados y Agrupación
            if (dbShowDuplicates) {
                let duplicateGroups = {};
                fTx.forEach(t => {
                    const sig = `${t.note || ''}|${t.cat || ''}|${t.original_amount || t.amount}|${t.date ? t.date.split('T')[0] : ''}`;
                    if(!duplicateGroups[sig]) duplicateGroups[sig] = [];
                    duplicateGroups[sig].push(t);
                });
                
                fTx = [];
                for(let sig in duplicateGroups) {
                    if(duplicateGroups[sig].length > 1) {
                        fTx = fTx.concat(duplicateGroups[sig]);
                    }
                }
                // Si estamos en modo duplicados, ordenamos por firma (para agruparlos visualmente) y luego por fecha
                fTx.sort((a,b) => {
                   const sigA = `${a.note || ''}|${a.cat || ''}|${a.original_amount || a.amount}|${a.date ? a.date.split('T')[0] : ''}`;
                   const sigB = `${b.note || ''}|${b.cat || ''}|${b.original_amount || b.amount}|${b.date ? b.date.split('T')[0] : ''}`;
                   if(sigA < sigB) return -1;
                   if(sigA > sigB) return 1;
                   return new Date(b.date) - new Date(a.date);
                });
            } else {
                fTx.sort((a,b) => dbSortOrder === 'desc' ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date));
            }
            
            currentFilteredTx = fTx;
            currentAuditStats = nexusComputeAuditStats(fTx, targetCurr, fAcc);
            nexusUpdateAuditStatsUI(currentAuditStats, targetCurr);
            nexusPaintAuditList();
            syncStateToHost();
        }
        function deleteDatabaseRecord(id) { openAuditDeleteChoice(id); }

        function exportDatabaseExcel() {
            if (!currentFilteredTx || !currentFilteredTx.length) return alert('No hay datos filtrados para exportar.');
            const curSel = $id('db-currency');
            const targetCurr = (curSel && curSel.value !== 'BASE') ? curSel.value : (state.settings.baseCurrency || 'COP');
            const fAccEl = $id('db-filter-account');
            const fAccValue = fAccEl ? fAccEl.value : 'all';
            const rows = buildTxExcelRows(currentFilteredTx, targetCurr, fAccValue);
            nexusDownloadCsv(rows, 'auditoria_nexus_' + new Date().toISOString().split('T')[0] + '.csv');
        }

        function getAccountHistoryTxs() {
            if (!currentHistAccId) return [];
            let txs = nexusGetOperationalTxList().filter(t => (t.accId === currentHistAccId || (t.type === 'transfer' && t.toAccId === currentHistAccId)) && t.type !== 'afterpay');
            const now = new Date();
            if (currentHistPeriod === '30d') {
                const past30 = new Date(now.getTime() - 30 * 86400000);
                txs = txs.filter(t => new Date(t.date) >= past30);
            } else if (currentHistPeriod === 'month') {
                txs = txs.filter(t => new Date(t.date).getMonth() === now.getMonth() && new Date(t.date).getFullYear() === now.getFullYear());
            } else if (currentHistPeriod === 'year') {
                txs = txs.filter(t => new Date(t.date).getFullYear() === now.getFullYear());
            }
            return txs.sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        function exportAccountExcel() {
            const acc = state.accounts.find(a => a.id === currentHistAccId);
            if (!acc) return alert('Abre el historial de una cuenta primero.');
            const txs = getAccountHistoryTxs();
            if (!txs.length) return alert('Sin movimientos en este periodo.');
            const rows = buildTxExcelRows(txs, acc.currency, acc.id);
            nexusDownloadCsv(rows, 'cuenta_' + (acc.name || 'nexus').replace(/\s+/g, '_') + '.csv');
        }

        function exportAccountPDF() {
            const acc = state.accounts.find(a => a.id === currentHistAccId);
            if (!acc) return alert('Abre el historial de una cuenta primero.');
            const txs = getAccountHistoryTxs();
            if (!txs.length) return alert('Sin movimientos en este periodo.');
            exportTxListToPDF({
                title: 'NEXUS AR · ' + acc.name,
                subtitle: 'Extracto de cuenta · ' + getNexusDisplayName(),
                txs, targetCurr: acc.currency, fAccValue: acc.id,
                filename: 'cuenta_' + (acc.name || 'nexus').replace(/\s+/g, '_') + '.pdf'
            });
        }

        function exportProjectExcel(projectId) {
            const p = state.projects.find(x => x.id === projectId);
            if (!p) return;
            const txs = (state.tx || []).filter(t => t.projectId === p.id);
            const header = ['Fecha', 'Concepto', 'Cuenta', 'Monto', 'Divisa', 'Tipo'];
            const rows = [header];
            txs.forEach(t => {
                rows.push([
                    new Date(t.date).toLocaleDateString('es-CO'),
                    t.note || t.cat || '',
                    state.accounts.find(a => a.id === t.accId)?.name || '',
                    t.amount,
                    t.currency,
                    t.type
                ]);
            });
            rows.push([]);
            rows.push(['Proyecto', p.name]);
            rows.push(['Presupuesto', p.budget, p.currency]);
            rows.push(['Ejecutado', txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)]);
            nexusDownloadCsv(rows, 'proyecto_' + p.name.replace(/\s+/g, '_') + '.csv');
        }

        function exportProjectPDF(projectId) {
            const p = state.projects.find(x => x.id === projectId);
            if (!p) return;
            const txs = (state.tx || []).filter(t => t.projectId === p.id);
            if (!txs.length) return alert('El proyecto no tiene transacciones vinculadas.');
            exportTxListToPDF({
                title: 'NEXUS AR · Proyecto ' + p.name,
                subtitle: 'Presupuesto ' + fmt(p.budget, p.currency) + ' · ' + getNexusDisplayName(),
                txs, targetCurr: p.currency, fAccValue: 'all',
                filename: 'proyecto_' + p.name.replace(/\s+/g, '_') + '.pdf'
            });
        }

        // Exportación de Auditoría a PDF con Resumen Inteligente (Diseño Extracto Bancario)
        function exportDatabasePDF() {
            if (!currentFilteredTx || currentFilteredTx.length === 0) {
                return alert("No hay datos filtrados para exportar.");
            }

            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                
                const curSel = $id('db-currency');
                const targetCurr = (curSel && curSel.value !== 'BASE') ? curSel.value : (state.settings.baseCurrency || 'COP');

                const fAccEl = $id('db-filter-account');
                const fAccValue = fAccEl ? fAccEl.value : 'all';

                // Filtro sanitizador para remover emojis y evitar errores de renderizado en el PDF
                const stripText = (str) => {
                    if (!str) return '';
                    return str.replace(/[^\x00-\x7FáéíóúÁÉÍÓÚñÑüÜ\s]/g, '').trim();
                };

                let totalInc = 0;
                let totalExp = 0;

                // Calcular Resumen Inicial basado estrictamente en el filtro visual y polaridad
                currentFilteredTx.forEach(t => {
                    const amt = convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, targetCurr);
                    const rType = t.renderType || t.type;
                    
                    const isOutflow = rType === 'expense' || rType === 'afterpay' || (rType === 'transfer' && t.accId === fAccValue);
                    const isInflow = rType === 'income' || (rType === 'transfer' && t.toAccId === fAccValue);
                    
                    let sign = '';
                    if (isOutflow) sign = '-';
                    else if (isInflow) sign = '+';
                    
                    if (sign === '+') totalInc += amt;
                    else if (sign === '-') totalExp += amt;
                });

                const net = totalInc - totalExp;

                // Extraer valores de los filtros para el resumen narrativo
                const fsEl = $id('db-filter-start'); const startDate = fsEl && fsEl.value ? new Date(fsEl.value + 'T12:00:00').toLocaleDateString('es-CO') : 'Inicio';
                const feEl = $id('db-filter-end'); const endDate = feEl && feEl.value ? new Date(feEl.value + 'T12:00:00').toLocaleDateString('es-CO') : 'Fin';
                const ftEl = $id('db-filter-type'); const fType = ftEl ? ftEl.options[ftEl.selectedIndex].text : 'Todas';
                const fcEl = $id('db-filter-cat');
                
                // Aplicar el sanitizador a las variables visuales del PDF
                const fCat = fcEl ? stripText(fcEl.options[fcEl.selectedIndex].text) : 'Todas';
                const fCurrEl = $id('db-filter-currency'); const fCurrFilter = fCurrEl ? fCurrEl.options[fCurrEl.selectedIndex].text : 'Todas';
                const fAcc = fAccEl ? stripText(fAccEl.options[fAccEl.selectedIndex].text) : 'Todas';
                const fCostEl = $id('db-filter-cost'); const fCost = fCostEl ? fCostEl.options[fCostEl.selectedIndex].text : 'Todas';

                const incStr = '+' + fmt(totalInc, targetCurr);
                const expStr = '-' + fmt(totalExp, targetCurr);
                const netStr = (net >= 0 ? '+' : '') + fmt(net, targetCurr);
                
                const narrative = `Este extracto documenta los movimientos de la cuenta "${fAcc}" (Divisa de Filtro: ${fCurrFilter}) en el periodo comprendido entre el ${startDate} y el ${endDate}. Se ha aplicado una visualización por tipo de transacción "${fType}", categoría "${fCat}" y clasificación "${fCost}". Durante este ciclo auditado, los abonos sumaron ${incStr} y los cargos alcanzaron los ${expStr}, generando un flujo neto de ${netStr}.`;

                // --- DISEÑO TIPO EXTRACTO BANCARIO (Clear Header sin Logo) ---
                
                // 1. Cabecera (Header en tono claro profesional)
                doc.setFillColor(248, 250, 252); // slate-50
                doc.rect(0, 0, 210, 40, 'F');
                doc.setDrawColor(226, 232, 240); // Borde divisorio inferior
                doc.line(0, 40, 210, 40);
                
                // Título de la Institución
                doc.setTextColor(15, 23, 42); // slate-900
                doc.setFontSize(16);
                doc.setFont(undefined, 'bold');
                doc.text("NEXUS AR FINANCE", 14, 20);
                
                doc.setFontSize(8);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(100, 116, 139); // slate-500
                doc.text("EXTRACTO OFICIAL / STATEMENT OF ACCOUNT", 14, 25);
                
                // Metadatos a la derecha
                doc.setTextColor(15, 23, 42); // slate-900
                doc.setFontSize(8);
                doc.setFont(undefined, 'bold');
                doc.text("RESUMEN DE CUENTA", 196, 15, { align: 'right' });
                doc.setFont(undefined, 'normal');
                doc.setTextColor(100, 116, 139); // slate-500
                doc.text(`Emisión: ${new Date().toLocaleDateString('es-CO')}`, 196, 21, { align: 'right' });
                doc.text(`Periodo: ${startDate} al ${endDate}`, 196, 26, { align: 'right' });
                doc.text(`Divisa: ${fCurrFilter}`, 196, 31, { align: 'right' });

                // 2. Bloque de Resumen Financiero (3 Cajas)
                const boxY = 48;
                doc.setDrawColor(226, 232, 240); // slate-200 border
                
                // Caja Ingresos
                doc.setFillColor(255, 255, 255); // Blanco puro
                doc.roundedRect(14, boxY, 57, 20, 2, 2, 'FD');
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139); // slate-500
                doc.text("Total Abonos (+)", 18, boxY + 7);
                doc.setFontSize(11);
                doc.setTextColor(16, 185, 129); // emerald-500
                doc.setFont(undefined, 'bold');
                doc.text(incStr, 18, boxY + 15);

                // Caja Gastos
                doc.setFillColor(255, 255, 255); // Blanco puro
                doc.roundedRect(76, boxY, 57, 20, 2, 2, 'FD');
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.setFont(undefined, 'normal');
                doc.text("Total Cargos (-)", 80, boxY + 7);
                doc.setFontSize(11);
                doc.setTextColor(239, 68, 68); // red-500
                doc.setFont(undefined, 'bold');
                doc.text(expStr, 80, boxY + 15);

                // Caja Neto
                doc.setFillColor(255, 255, 255); // Blanco puro
                doc.roundedRect(138, boxY, 57, 20, 2, 2, 'FD');
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.setFont(undefined, 'normal');
                doc.text("Flujo Neto / Saldo", 142, boxY + 7);
                doc.setFontSize(11);
                if (net >= 0) doc.setTextColor(16, 185, 129); // emerald-500
                else doc.setTextColor(239, 68, 68); // red-500
                doc.setFont(undefined, 'bold');
                doc.text(netStr, 142, boxY + 15);

                // 3. Párrafo Narrativo Ejecutivo
                doc.setFontSize(9);
                doc.setTextColor(71, 85, 105); // slate-600
                doc.setFont(undefined, 'normal');
                const splitNarrative = doc.splitTextToSize(narrative, 182);
                doc.text(splitNarrative, 14, boxY + 28);
                
                const tableStartY = boxY + 28 + (splitNarrative.length * 4) + 6;

                // Mapeo de la Matriz a formato AutoTable (Purgando Emojis)
                const tableData = currentFilteredTx.map(t => {
                    const dDate = new Date(t.date);
                    const dateStr = dDate.toLocaleDateString('es-CO') + ' ' + String(dDate.getHours()).padStart(2,'0') + ':' + String(dDate.getMinutes()).padStart(2,'0');
                    const accName = stripText(state.accounts.find(a=>a.id===t.accId)?.name||'--');
                    
                    const rType = t.renderType || t.type;
                    const isOutflow = rType === 'expense' || rType === 'afterpay' || (rType === 'transfer' && t.accId === fAccValue);
                    const isInflow = rType === 'income' || (rType === 'transfer' && t.toAccId === fAccValue);
                    const sign = isOutflow ? '-' : (isInflow ? '+' : '');
                    
                    const amtStr = sign + fmt(t.original_amount || t.amount, t.original_currency || t.currency);
                    
                    const concept = stripText(t.note || t.cat || '');
                    const typeStr = rType === 'income' ? 'Ingreso' : (rType === 'expense' ? 'Gasto' : (rType === 'afterpay' ? 'Afterpay' : 'Transf.'));

                    return [dateStr, concept, stripText(t.cat), accName, typeStr, amtStr];
                });

                // 4. Construcción de la tabla (Estilo Grid Bancario con Footer)
                doc.autoTable({
                    startY: tableStartY,
                    head: [['FECHA / HORA', 'CONCEPTO / REF', 'CATEGORÍA', 'CUENTA', 'TIPO', 'VALOR']],
                    body: tableData,
                    foot: [['', '', '', '', 'TOTAL NETO', netStr]], // Fila de consolidación final
                    theme: 'grid',
                    headStyles: {
                        fillColor: [241, 245, 249], // slate-100
                        textColor: [15, 23, 42],    // slate-900
                        fontStyle: 'bold',
                        fontSize: 7,
                        lineColor: [226, 232, 240], // slate-200
                        lineWidth: 0.1
                    },
                    bodyStyles: {
                        textColor: [51, 65, 85],    // slate-700
                        fontSize: 7,
                        lineColor: [226, 232, 240],
                        lineWidth: 0.1
                    },
                    footStyles: {
                        fillColor: [248, 250, 252], // slate-50
                        textColor: [15, 23, 42],    // slate-900
                        fontStyle: 'bold',
                        fontSize: 8,
                        lineColor: [226, 232, 240],
                        lineWidth: 0.1,
                        halign: 'right'
                    },
                    alternateRowStyles: {
                        fillColor: [252, 253, 255]
                    },
                    margin: { left: 14, right: 14 },
                    columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
                    didParseCell: function(data) {
                        // Aplica color rojo/verde incluso en el pie de página
                        if ((data.section === 'body' || data.section === 'foot') && data.column.index === 5) {
                            const valStr = data.cell.raw;
                            if (valStr.startsWith('-')) data.cell.styles.textColor = [239, 68, 68]; // red-500
                            else if (valStr.startsWith('+')) data.cell.styles.textColor = [16, 185, 129]; // emerald-500
                        }
                    }
                });

                // 5. Pie de Página (Paginación y aviso legal)
                const pageCount = doc.internal.getNumberOfPages();
                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    doc.setFontSize(6);
                    doc.setTextColor(148, 163, 184); // slate-400
                    doc.text("Este extracto es generado automáticamente por el Motor SSoT de NEXUS AR FINANCE.", 105, 290, { align: 'center' });
                    doc.text(`Página ${i} de ${pageCount}`, 196, 290, { align: 'right' });
                }

                const fileName = `Extracto_Nexus_${new Date().toISOString().split('T')[0]}.pdf`;
                nexusDeliverPdf(doc, fileName, 'Extracto auditoría SSoT');

            } catch (error) {
                console.error("Error al exportar PDF:", error);
                alert("⚠️ Error procesando el documento. Revisa la consola para más detalles.");
            }
        }



  function buildAuditDataset() {
    const tempCurr = state.activeCurrency;
    state.activeCurrency = "GLOBAL";
    const cDisplay = state.settings.baseCurrency || "COP";
    const auditProjectionRows = nexusGatherAuditProjectionRows(cDisplay);
    const auditMirroredPayIds = new Set(auditProjectionRows.map(r => r.nexusAuditMirrorsTxId).filter(Boolean));
    let rawTxList = nexusGetOperationalTxList()
      .filter(t => !t.isCCPurchase && t.type !== "afterpay" && !auditMirroredPayIds.has(t.id))
      .map(t => {
        const tx = Object.assign({}, t, { original_amount: t.amount, original_currency: t.currency });
        tx.renderType = nexusIsAfterpayPaymentTx(tx) ? "afterpay" : tx.type;
        const accOrig = state.accounts.find(a => a.id === tx.accId);
        const accDest = state.accounts.find(a => a.id === tx.toAccId);
        const isOrigIso = accOrig && (accOrig.isShared || accOrig.type === "terceros");
        const isDestIso = accDest && (accDest.isShared || accDest.type === "terceros");
        if (tx.type === "transfer") {
          if (!isOrigIso && isDestIso) tx.type = "expense";
          else if (isOrigIso && !isDestIso) tx.type = "income";
          else if (isOrigIso && isDestIso) tx.type = "isolated";
        } else if (tx.type === "expense" || tx.type === "income") {
          if (isOrigIso) tx.type = "isolated";
        }
        return tx;
      });
    state.activeCurrency = tempCurr;
    return [...rawTxList, ...auditProjectionRows].filter(nexusShouldShowTxInAudit);
  }

        const NEXUS_DELETED_TX_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;

        function nexusPurgeExpiredDeletedTxArchive() {
            nexusEnsureDeletedAccountsRegistry();
            const now = Date.now();
            const before = (state.deletedTxArchive || []).length;
            state.deletedTxArchive = (state.deletedTxArchive || []).filter(e => {
                if (!e || !e.deletedAt) return false;
                const exp = e.expiresAt || (e.deletedAt + NEXUS_DELETED_TX_RETENTION_MS);
                return now < exp;
            });
            return before - state.deletedTxArchive.length;
        }

        function nexusDeletedTxDaysLeft(entry) {
            if (!entry) return 0;
            const exp = entry.expiresAt || ((entry.deletedAt || 0) + NEXUS_DELETED_TX_RETENTION_MS);
            return Math.max(0, Math.ceil((exp - Date.now()) / 86400000));
        }

        function nexusReverseTxBalanceEffect(tx) {
            if (!tx) return;
            const touchRev = (acc) => {
                if (!acc) return;
                if (tx.type === 'transfer') {
                    if (tx.accId === acc.id) { if (nexusIsLiabAccount(acc)) acc.balance -= tx.amount; else acc.balance += tx.amount; }
                    if (tx.toAccId === acc.id) { if (nexusIsLiabAccount(acc)) acc.balance += tx.amount; else acc.balance -= tx.amount; }
                } else if (tx.accId === acc.id && tx.type !== 'afterpay') {
                    if (tx.type === 'income') { if (nexusIsLiabAccount(acc)) acc.balance += tx.amount; else acc.balance -= tx.amount; }
                    if (tx.type === 'expense') { if (nexusIsLiabAccount(acc)) acc.balance -= tx.amount; else acc.balance += tx.amount; }
                }
            };
            if (tx.type === 'transfer') {
                touchRev(state.accounts.find(a => a.id === tx.accId));
                touchRev(state.accounts.find(a => a.id === tx.toAccId));
            } else {
                touchRev(state.accounts.find(a => a.id === tx.accId));
            }
        }

        /** Reaplica el efecto en saldo al restaurar desde papelera (misma lógica que saveTransaction). */
        function nexusApplyTxBalanceEffect(tx) {
            if (!tx) return;
            const touch = (acc) => {
                if (!acc) return;
                if (tx.type === 'transfer') {
                    if (tx.accId === acc.id) { if (nexusIsLiabAccount(acc)) acc.balance += tx.amount; else acc.balance -= tx.amount; }
                    if (tx.toAccId === acc.id) { if (nexusIsLiabAccount(acc)) acc.balance -= tx.amount; else acc.balance += tx.amount; }
                } else if (tx.accId === acc.id && tx.type !== 'afterpay') {
                    if (tx.type === 'income') { if (nexusIsLiabAccount(acc)) acc.balance -= tx.amount; else acc.balance += tx.amount; }
                    if (tx.type === 'expense') { if (nexusIsLiabAccount(acc)) acc.balance += tx.amount; else acc.balance -= tx.amount; }
                }
            };
            if (tx.type === 'transfer') {
                touch(state.accounts.find(a => a.id === tx.accId));
                touch(state.accounts.find(a => a.id === tx.toAccId));
            } else {
                touch(state.accounts.find(a => a.id === tx.accId));
            }
        }

        function nexusCanRestoreArchivedTx(tx) {
            if (!tx) return { ok: false, reason: 'Registro inválido.' };
            if (tx.type === 'transfer') {
                const orig = (state.accounts || []).find(a => a.id === tx.accId);
                const dest = (state.accounts || []).find(a => a.id === tx.toAccId);
                if (!orig || !dest) return { ok: false, reason: 'La cuenta origen o destino ya no existe. Crea la bóveda antes de restaurar.' };
                return { ok: true };
            }
            if (!tx.accId) return { ok: false, reason: 'Sin bóveda asociada.' };
            const acc = (state.accounts || []).find(a => a.id === tx.accId);
            if (!acc) return { ok: false, reason: 'La bóveda «' + (tx.accId || '') + '» ya no existe. Crea la cuenta antes de restaurar.' };
            return { ok: true };
        }

        function nexusRestoreArchivedTransaction(txId) {
            if (!txId) return false;
            nexusEnsureDeletedAccountsRegistry();
            const entry = (state.deletedTxArchive || []).find(e => e && e.id === txId);
            if (!entry || !entry.tx) {
                alert('⚠️ No se encontró esta transacción en la papelera (puede haber expirado).');
                return false;
            }
            const tx = JSON.parse(JSON.stringify(entry.tx));
            const check = nexusCanRestoreArchivedTx(tx);
            if (!check.ok) {
                alert('⚠️ No se puede restaurar.\n\n' + check.reason);
                return false;
            }
            const alreadyLive = (state.tx || []).some(t => t.id === txId);
            if (!alreadyLive) {
                delete tx.auditArchived;
                delete tx.auditAccountId;
                delete tx.auditAccountName;
                tx.updatedAt = Date.now();
                if (typeof nexusTouchEntityUpdatedAt === 'function') nexusTouchEntityUpdatedAt(tx, 'tx');
                nexusApplyTxBalanceEffect(tx);
                state.tx.push(tx);
                if (typeof saveCloudTx === 'function') saveCloudTx(tx);
                const acc = (state.accounts || []).find(a => a.id === tx.accId);
                const dest = (state.accounts || []).find(a => a.id === tx.toAccId);
                if (acc && acc.isShared && acc.remoteId && typeof nexusPushSharedP2PInstant === 'function') {
                    nexusPushSharedP2PInstant('accounts', acc.remoteId);
                }
                if (dest && dest.isShared && dest.remoteId && typeof nexusPushSharedP2PInstant === 'function') {
                    nexusPushSharedP2PInstant('accounts', dest.remoteId);
                }
            }
            state.deletedTxIds = (state.deletedTxIds || []).filter(id => id !== txId);
            if (state.deletedSharedTxs) state.deletedSharedTxs = state.deletedSharedTxs.filter(id => id !== txId);
            state.deletedTxArchive = (state.deletedTxArchive || []).filter(e => e.id !== txId);
            if (typeof nexusTouchLocalState === 'function') nexusTouchLocalState('tx-restore');
            if (typeof nexusMarkForceLocalWin === 'function') nexusMarkForceLocalWin(120000);
            if (typeof nexusRunBackgroundPushNow === 'function') nexusRunBackgroundPushNow('tx-restore');
            saveState({ cloudHint: { reason: 'tx', tx: tx } });
            return true;
        }

        function promptRestoreDeletedTransaction(txId) {
            if (!txId) return;
            triggerUIConfirm(
                '¿Restaurar esta transacción?\n\nVolverá a Cuentas, Auditoría e informes. Se reajustará el saldo de la bóveda asociada.',
                'restore_deleted_tx',
                txId
            );
        }

        function nexusPermanentDeleteArchivedTx(txId, opts) {
            if (!txId) return false;
            const entry = (state.deletedTxArchive || []).find(e => e.id === txId);
            const archivedTx = entry && (entry.tx || entry);
            state.deletedTxArchive = (state.deletedTxArchive || []).filter(e => e.id !== txId);
            if (!state.deletedTxIds.includes(txId)) state.deletedTxIds.push(txId);
            if (typeof nexusTouchLocalState === 'function') nexusTouchLocalState('tx-purge');
            if (!opts || !opts.skipSave) {
                let deletedTxYear = null;
                if (archivedTx && archivedTx.date) {
                    const y = new Date(archivedTx.date).getFullYear();
                    if (y && !isNaN(y)) deletedTxYear = String(y);
                }
                saveState({ cloudHint: { reason: 'tx-delete', tx: archivedTx || null, deletedTxId: txId, deletedTxYear } });
            }
            return true;
        }

        function promptPermanentDeleteArchivedTx(txId) {
            if (!txId) return;
            triggerUIConfirm(
                '¿Eliminar permanentemente este registro?\n\nNo podrás restaurarlo. Se borra de la papelera y de la nube.',
                'purge_deleted_tx',
                txId
            );
        }

        function nexusArchiveDeletedTx(tx, meta) {
            nexusEnsureDeletedAccountsRegistry();
            nexusPurgeExpiredDeletedTxArchive();
            const acc = (state.accounts || []).find(a => a.id === tx.accId);
            const deletedAt = Date.now();
            const entry = {
                id: tx.id,
                tx: JSON.parse(JSON.stringify(tx)),
                deletedAt,
                expiresAt: deletedAt + NEXUS_DELETED_TX_RETENTION_MS,
                deletedBy: (typeof normalizeMemberEmail === 'function')
                    ? normalizeMemberEmail(currentUser || (userProfile && userProfile.email) || '')
                    : (currentUser || ''),
                source: (meta && meta.source) || 'root',
                accountId: tx.accId || null,
                accountName: acc ? acc.name : ((meta && meta.accountName) || null)
            };
            state.deletedTxArchive = (state.deletedTxArchive || []).filter(e => e.id !== tx.id);
            state.deletedTxArchive.unshift(entry);
            if (state.deletedTxArchive.length > 500) state.deletedTxArchive.length = 500;
        }

        function nexusDeleteTxFromForm(e) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            const txId = $id('f-id') ? $id('f-id').value : '';
            if (!txId) return;
            const accId = $id('f-account') ? $id('f-account').value : '';
            nexusPromptDeleteTransaction(txId, accId || null);
        }

        function nexusRootDeleteTransaction(txId, opts) {
            const tx = (state.tx || []).find(t => t.id === txId);
            if (!tx) return false;
            nexusEnsureDeletedAccountsRegistry();

            const isSharedTx = (state.accounts || []).some(a => a.isShared && (a.id === tx.accId || a.id === tx.toAccId));
            if (isSharedTx) {
                if (!state.deletedSharedTxs) state.deletedSharedTxs = [];
                if (!state.deletedSharedTxs.includes(txId)) state.deletedSharedTxs.push(txId);
            }
            if (!state.deletedTxIds.includes(txId)) state.deletedTxIds.push(txId);

            nexusReverseTxBalanceEffect(tx);
            state.tx = (state.tx || []).filter(t => t.id !== txId);
            nexusArchiveDeletedTx(tx, opts || {});
            deleteCloudTx(txId, tx);
            nexusPurgeExpiredDeletedTxArchive();
            nexusPurgeDeletedTxFromState();
            if (typeof nexusTouchLocalState === 'function') nexusTouchLocalState('tx-root-delete');
            return true;
        }

        function nexusPromptDeleteTransaction(txId, accIdHint) {
            const source = state.activeTab === 'database' ? 'audit' : (state.activeTab === 'accounts' ? 'accounts' : 'root');
            const payload = [txId, accIdHint || '', source].join('|');
            triggerUIConfirm(
                '¿Eliminar esta transacción por completo?\n\nDesaparece de cuentas, auditoría, informes y analítica. Solo queda en Auditoría → Transacciones eliminadas (15 días).',
                'root_delete_tx',
                payload
            );
        }

        function refreshAfterTxDelete() {
            if (state.activeTab === 'accounts' && typeof renderAccountsTab === 'function') {
                renderAccountsTab();
                (state.accounts || []).forEach(a => {
                    const el = $id('acc-tx-' + a.id);
                    if (el && !el.classList.contains('hidden')) {
                        el.classList.add('hidden');
                        el.classList.remove('flex');
                        el.innerHTML = '';
                        if (typeof toggleAccountTx === 'function') toggleAccountTx(a.id);
                    }
                });
            }
            nexusRefreshAllModules();
        }

        function promptRootDeleteTransaction(txId, accIdHint) {
            nexusPromptDeleteTransaction(txId, accIdHint);
        }

        function openDeletedTxArchiveModal() {
            nexusPurgeExpiredDeletedTxArchive();
            if (!state.ui) state.ui = {};
            state.ui.deletedTxArchiveSelected = [];
            const mod = $id('deleted-tx-archive-modal');
            if (!mod) return;
            nexusShowModalInstant(mod);
            renderDeletedTxArchiveList();
        }

        function closeDeletedTxArchiveModal() {
            nexusHideModalInstant($id('deleted-tx-archive-modal'));
        }

        function nexusEnsureDeletedTxArchiveSelection() {
            if (!state.ui) state.ui = {};
            if (!Array.isArray(state.ui.deletedTxArchiveSelected)) state.ui.deletedTxArchiveSelected = [];
        }
        function nexusGetDeletedTxArchiveSelectedSet() {
            nexusEnsureDeletedTxArchiveSelection();
            return new Set(state.ui.deletedTxArchiveSelected || []);
        }
        function nexusUpdateDeletedTxArchiveSelectedCount() {
            const el = $id('deleted-tx-archive-selected-count');
            if (el) el.innerText = String((state.ui && state.ui.deletedTxArchiveSelected) ? state.ui.deletedTxArchiveSelected.length : 0);
        }
        function nexusToggleDeletedTxArchiveSelect(id, checked) {
            nexusEnsureDeletedTxArchiveSelection();
            const arr = state.ui.deletedTxArchiveSelected;
            const idx = arr.indexOf(id);
            if (checked && idx === -1) arr.push(id);
            else if (!checked && idx > -1) arr.splice(idx, 1);
            nexusUpdateDeletedTxArchiveSelectedCount();
        }
        function nexusToggleDeletedTxArchiveSelectAll() {
            nexusPurgeExpiredDeletedTxArchive();
            nexusEnsureDeletedTxArchiveSelection();
            const entries = state.deletedTxArchive || [];
            const sel = nexusGetDeletedTxArchiveSelectedSet();
            const allSelected = entries.length > 0 && entries.every(e => sel.has(e.id));
            state.ui.deletedTxArchiveSelected = allSelected ? [] : entries.map(e => e.id);
            renderDeletedTxArchiveList();
        }
        function nexusGetDeletedTxArchiveSelectedIds() {
            return [...nexusGetDeletedTxArchiveSelectedSet()];
        }
        function promptBulkPurgeDeletedTxArchive() {
            const ids = nexusGetDeletedTxArchiveSelectedIds();
            if (!ids.length) return alert('Selecciona al menos una transacción de la papelera.');
            triggerUIConfirm('¿Eliminar permanentemente ' + ids.length + ' registro(s)?\n\nNo podrás restaurarlos.', 'purge_deleted_tx_bulk', ids.join(','));
        }
        function nexusBulkPermanentDeleteArchivedTx(ids) {
            if (!ids || !ids.length) return 0;
            let n = 0;
            ids.forEach(id => { if (nexusPermanentDeleteArchivedTx(id, { skipSave: true })) n++; });
            if (n > 0) saveState({ cloudHint: { reason: 'tx-delete' } });
            state.ui.deletedTxArchiveSelected = (state.ui.deletedTxArchiveSelected || []).filter(id => !ids.includes(id));
            return n;
        }
        function promptBulkRestoreDeletedTxArchive() {
            const ids = nexusGetDeletedTxArchiveSelectedIds();
            if (!ids.length) return alert('Selecciona al menos una transacción para restaurar.');
            triggerUIConfirm('¿Restaurar ' + ids.length + ' transacción(es)?\n\nVolverán a cuentas, auditoría e informes.', 'restore_deleted_tx_bulk', ids.join(','));
        }
        function nexusBulkRestoreArchivedTransactions(ids) {
            if (!ids || !ids.length) return { ok: 0, fail: 0 };
            let ok = 0, fail = 0;
            ids.forEach(id => {
                if (nexusRestoreArchivedTransaction(id)) ok++;
                else fail++;
            });
            state.ui.deletedTxArchiveSelected = (state.ui.deletedTxArchiveSelected || []).filter(id => !ids.includes(id));
            return { ok, fail };
        }

        function renderDeletedTxArchiveList() {
            nexusPurgeExpiredDeletedTxArchive();
            const list = $id('deleted-tx-archive-list');
            const countEl = $id('deleted-tx-archive-count');
            const entries = [...(state.deletedTxArchive || [])].sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
            nexusEnsureDeletedTxArchiveSelection();
            const selected = nexusGetDeletedTxArchiveSelectedSet();
            if (countEl) countEl.innerText = String(entries.length);
            nexusUpdateDeletedTxArchiveSelectedCount();
            if (!list) return;
            if (!entries.length) {
                list.innerHTML = '<p class="text-center text-[10px] font-bold uppercase text-slate-400 py-6">No hay transacciones en la papelera de los últimos 15 días.</p>';
                return;
            }
            const typeLabels = { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia', debt: 'Deuda', single_debt: 'Deuda única', afterpay: 'Afterpay' };
            const sourceLabels = { accounts: 'Cuentas', audit: 'Auditoría', root: 'Raíz' };
            list.innerHTML = entries.map(e => {
                const t = e.tx || {};
                const days = nexusDeletedTxDaysLeft(e);
                const dDel = new Date(e.deletedAt);
                const dTx = t.date ? new Date(t.date) : dDel;
                const sign = (t.type === 'expense' || (t.type === 'transfer' && t.accId === e.accountId)) ? '-' : '+';
                const amt = t.amount != null ? fmt(t.amount, t.currency || (state.settings && state.settings.baseCurrency) || 'COP') : '--';
                const src = sourceLabels[e.source] || e.source || '—';
                const accName = e.accountName || '—';
                const note = (t.note || (t.cat && t.cat.length > 2 ? t.cat.substring(2) : t.cat) || 'Sin descripción');
                const safeNote = String(note).replace(/</g, '&lt;');
                const safeId = String(e.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const isChecked = selected.has(e.id);
                const canRestore = nexusCanRestoreArchivedTx(t).ok;
                const restoreBtn = canRestore
                    ? `<button type="button" data-nexus-action="promptRestoreDeletedTransaction" data-nexus-arg="${safeId}" data-nexus-pass-event="1" class="shrink-0 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase active:scale-95 hover:bg-emerald-100 transition-colors"><i class="fa-solid fa-rotate-left mr-1"></i>Restaurar</button>`
                    : `<span class="shrink-0 text-[7px] font-bold text-slate-400 uppercase px-2 py-1" title="Bóveda no disponible">Sin bóveda</span>`;
                const purgeBtn = `<button type="button" data-nexus-action="promptPermanentDeleteArchivedTx" data-nexus-arg="${safeId}" data-nexus-pass-event="1" class="shrink-0 bg-red-600 text-white border border-red-700 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase active:scale-95 hover:bg-red-700 transition-colors ml-1"><i class="fa-solid fa-trash-can mr-1"></i>Borrar permanente</button>`;
                return `<div class="theme-card p-4 rounded-2xl border ${isChecked ? 'border-rose-400 bg-rose-50/30' : 'border-rose-100/80'} shadow-sm"><div class="flex justify-between items-start gap-2"><label class="flex items-start gap-3 min-w-0 flex-1 cursor-pointer"><input type="checkbox" class="w-4 h-4 accent-rose-600 mt-0.5 shrink-0" ${isChecked ? 'checked' : ''} onchange="nexusToggleDeletedTxArchiveSelect('${safeId}', this.checked)"><div class="min-w-0 flex-1"><p class="text-[10px] font-black uppercase theme-text truncate">${safeNote}</p><p class="text-[8px] font-bold text-slate-400 uppercase mt-1">${typeLabels[t.type] || t.type || '—'} • ${accName}</p><p class="text-[8px] text-slate-400 mt-0.5">Movimiento: ${dTx.toLocaleDateString('es-CO')} · Eliminado: ${dDel.toLocaleDateString('es-CO')} ${String(dDel.getHours()).padStart(2,'0')}:${String(dDel.getMinutes()).padStart(2,'0')}</p><p class="text-[8px] text-rose-500 font-bold uppercase mt-1">Origen: ${src} · ${days} día${days === 1 ? '' : 's'} restante${days === 1 ? '' : 's'}</p></div></label><p class="font-black text-xs theme-text shrink-0">${sign}${amt}</p></div><div class="flex justify-end flex-wrap gap-1 mt-2 pt-2 border-t border-rose-50">${restoreBtn}${purgeBtn}</div></div>`;
            }).join('');
        }





  const api = {
    __state: {},
    render: renderDatabase,
    toggleDbSort,
    toggleDbDuplicates,
    nexusResetDatabaseFilters,
    initDatabaseTab,
    populateDbAccountFilter,
    setDbQuickFilter,
    updateDbCatFilter,
    exportDatabaseExcel,
    exportDatabasePDF,
    deleteDatabaseRecord,
    openAuditDeleteChoice,
    closeAuditDeleteChoiceModal,
    executeAuditDeleteSimple,
    enterAuditBulkDeleteMode,
    exitAuditBulkDeleteMode,
    nexusToggleAuditSelect,
    nexusAuditSelectAllDeletable,
    promptBulkDeleteAuditRecords,
    nexusBulkDeleteAuditRecords,
    nexusPaintAuditList,
    nexusAuditLoadMore,
    nexusUpdateAuditBulkBar,
    nexusGetAuditPageSize,
    buildDataset: buildAuditDataset,
    getFiltered: function () { return currentFilteredTx; },
    setFiltered: function (rows) { currentFilteredTx = rows || []; syncStateToHost(); },
    paint: nexusPaintAuditList,
    nexusPurgeExpiredDeletedTxArchive,
    nexusDeletedTxDaysLeft,
    nexusReverseTxBalanceEffect,
    nexusApplyTxBalanceEffect,
    nexusCanRestoreArchivedTx,
    nexusRestoreArchivedTransaction,
    promptRestoreDeletedTransaction,
    nexusPermanentDeleteArchivedTx,
    promptPermanentDeleteArchivedTx,
    nexusArchiveDeletedTx,
    nexusDeleteTxFromForm,
    nexusRootDeleteTransaction,
    nexusPromptDeleteTransaction,
    refreshAfterTxDelete,
    promptRootDeleteTransaction,
    openDeletedTxArchiveModal,
    closeDeletedTxArchiveModal,
    nexusEnsureDeletedTxArchiveSelection,
    nexusGetDeletedTxArchiveSelectedSet,
    nexusUpdateDeletedTxArchiveSelectedCount,
    nexusToggleDeletedTxArchiveSelect,
    nexusToggleDeletedTxArchiveSelectAll,
    nexusGetDeletedTxArchiveSelectedIds,
    promptBulkPurgeDeletedTxArchive,
    nexusBulkPermanentDeleteArchivedTx,
    promptBulkRestoreDeletedTxArchive,
    nexusBulkRestoreArchivedTransactions,
    renderDeletedTxArchiveList,
  };

  global.NexusAuditEngine = api;
  syncStateToHost();

  global.renderDatabase = renderDatabase;
  global.toggleDbSort = toggleDbSort;
  global.toggleDbDuplicates = toggleDbDuplicates;
  global.nexusResetDatabaseFilters = nexusResetDatabaseFilters;
  global.initDatabaseTab = initDatabaseTab;
  global.populateDbAccountFilter = populateDbAccountFilter;
  global.setDbQuickFilter = setDbQuickFilter;
  global.updateDbCatFilter = updateDbCatFilter;
  global.exportDatabaseExcel = exportDatabaseExcel;
  global.exportDatabasePDF = exportDatabasePDF;
  global.deleteDatabaseRecord = deleteDatabaseRecord;
  global.openAuditDeleteChoice = openAuditDeleteChoice;
  global.closeAuditDeleteChoiceModal = closeAuditDeleteChoiceModal;
  global.executeAuditDeleteSimple = executeAuditDeleteSimple;
  global.enterAuditBulkDeleteMode = enterAuditBulkDeleteMode;
  global.exitAuditBulkDeleteMode = exitAuditBulkDeleteMode;
  global.nexusToggleAuditSelect = nexusToggleAuditSelect;
  global.nexusAuditSelectAllDeletable = nexusAuditSelectAllDeletable;
  global.promptBulkDeleteAuditRecords = promptBulkDeleteAuditRecords;
  global.nexusBulkDeleteAuditRecords = nexusBulkDeleteAuditRecords;
  global.nexusPaintAuditList = nexusPaintAuditList;
  global.nexusAuditLoadMore = nexusAuditLoadMore;
  global.nexusUpdateAuditBulkBar = nexusUpdateAuditBulkBar;
  global.nexusUpdateAuditStatsUI = nexusUpdateAuditStatsUI;
  global.nexusPurgeExpiredDeletedTxArchive = nexusPurgeExpiredDeletedTxArchive;
  global.nexusDeletedTxDaysLeft = nexusDeletedTxDaysLeft;
  global.nexusReverseTxBalanceEffect = nexusReverseTxBalanceEffect;
  global.nexusApplyTxBalanceEffect = nexusApplyTxBalanceEffect;
  global.nexusCanRestoreArchivedTx = nexusCanRestoreArchivedTx;
  global.nexusRestoreArchivedTransaction = nexusRestoreArchivedTransaction;
  global.promptRestoreDeletedTransaction = promptRestoreDeletedTransaction;
  global.nexusPermanentDeleteArchivedTx = nexusPermanentDeleteArchivedTx;
  global.promptPermanentDeleteArchivedTx = promptPermanentDeleteArchivedTx;
  global.nexusArchiveDeletedTx = nexusArchiveDeletedTx;
  global.nexusDeleteTxFromForm = nexusDeleteTxFromForm;
  global.nexusRootDeleteTransaction = nexusRootDeleteTransaction;
  global.nexusPromptDeleteTransaction = nexusPromptDeleteTransaction;
  global.refreshAfterTxDelete = refreshAfterTxDelete;
  global.promptRootDeleteTransaction = promptRootDeleteTransaction;
  global.openDeletedTxArchiveModal = openDeletedTxArchiveModal;
  global.closeDeletedTxArchiveModal = closeDeletedTxArchiveModal;
  global.nexusEnsureDeletedTxArchiveSelection = nexusEnsureDeletedTxArchiveSelection;
  global.nexusGetDeletedTxArchiveSelectedSet = nexusGetDeletedTxArchiveSelectedSet;
  global.nexusUpdateDeletedTxArchiveSelectedCount = nexusUpdateDeletedTxArchiveSelectedCount;
  global.nexusToggleDeletedTxArchiveSelect = nexusToggleDeletedTxArchiveSelect;
  global.nexusToggleDeletedTxArchiveSelectAll = nexusToggleDeletedTxArchiveSelectAll;
  global.nexusGetDeletedTxArchiveSelectedIds = nexusGetDeletedTxArchiveSelectedIds;
  global.promptBulkPurgeDeletedTxArchive = promptBulkPurgeDeletedTxArchive;
  global.nexusBulkPermanentDeleteArchivedTx = nexusBulkPermanentDeleteArchivedTx;
  global.promptBulkRestoreDeletedTxArchive = promptBulkRestoreDeletedTxArchive;
  global.nexusBulkRestoreArchivedTransactions = nexusBulkRestoreArchivedTransactions;
  global.renderDeletedTxArchiveList = renderDeletedTxArchiveList;

  console.info("[NEXUS] feature-auditoria audit-engine.js cargado");
})(typeof window !== "undefined" ? window : globalThis);
