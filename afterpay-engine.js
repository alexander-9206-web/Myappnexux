/**
 * NEXUS feature-afterpay — Motor SSoT (Fase 1+2)
 */
(function (global) {
  "use strict";

  if (!global.NexusAfterpayEngine) global.NexusAfterpayEngine = { __state: {} };

        // AFTERPAY
        let apSortOrder = 'desc';
        let apShowDuplicates = false;
        
        function toggleApSort() {
            apSortOrder = apSortOrder === 'desc' ? 'asc' : 'desc';
            const btn = $id('ap-sort-btn');
            if (btn) {
                btn.innerHTML = apSortOrder === 'asc' ? '<i class="fa-solid fa-arrow-up-wide-short text-xs"></i> ASC' : '<i class="fa-solid fa-arrow-down-short-wide text-xs"></i> DESC';
            }
            renderAfterpay();
        }

        function toggleApDuplicates() {
            apShowDuplicates = !apShowDuplicates;
            const btn = $id('ap-dup-btn');
            if (btn) {
                if (apShowDuplicates) {
                    btn.className = "bg-rose-100 text-rose-600 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-sm active:scale-95 flex items-center gap-1.5 transition-colors";
                } else {
                    btn.className = "bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-sm active:scale-95 flex items-center gap-1.5 transition-colors";
                }
            }
            renderAfterpay();
        }


        // =============================================================================
        // 3.04 — MÓDULO AFTERPAY
        // BNPL y compras en cuotas
        // =============================================================================

        function renderAfterpay() {
            if (global.__NexusAfterpayDomain && typeof global.__NexusAfterpayDomain.render === "function") {
                return global.__NexusAfterpayDomain.render();
            }
            prepareAfterpay();
            return paintAfterpay(true);
        }

        function prepareAfterpay() {}

        function paintAfterpay(computeKpis) {
            const totalPendingEl = $id('ap-total-pending'); const availableEl = $id('ap-available'); const scheduleList = $id('ap-schedule-list'); const activeList = $id('ap-active-list');
            if (!totalPendingEl || !availableEl || !scheduleList || !activeList) return;
            
            const apCurr = state.settings.apCurrency || 'AUD';
            
            let totalPending = 0; const apTx = state.tx.filter(t => t.type === 'afterpay');
            let activeAp = apTx.filter(t => (t.apPaid || 0) < (t.apQuotas || 4));
            
            // Calculamos el total antes del filtro visual para no romper los KPIs
            activeAp.forEach(t => {
                const quotas = t.apQuotas || 4;
                const amt = t.original_amount || t.amount;
                totalPending += (amt / quotas) * (quotas - (t.apPaid || 0));
            });

            // Buscador Inteligente estricto por Cliente / Descripción
            const apSearchQ = $id('ap-filter-search') ? $id('ap-filter-search').value.toLowerCase().trim() : '';
            if (apSearchQ) {
                activeAp = activeAp.filter(t => (t.note||'').toLowerCase().includes(apSearchQ));
            }

            // Motor de Escaneo de Duplicados Exactos y Agrupación
            if (apShowDuplicates) {
                let duplicateGroups = {};
                activeAp.forEach(t => {
                    const sig = `${t.note}|${t.cat}|${t.amount}|${t.date.split('T')[0]}`;
                    if(!duplicateGroups[sig]) duplicateGroups[sig] = [];
                    duplicateGroups[sig].push(t);
                });
                
                activeAp = [];
                for(let sig in duplicateGroups) {
                    if(duplicateGroups[sig].length > 1) {
                        activeAp = activeAp.concat(duplicateGroups[sig]);
                    }
                }
                
                // Agrupamos visualmente
                activeAp.sort((a,b) => {
                   const sigA = `${a.note}|${a.cat}|${a.amount}|${a.date.split('T')[0]}`;
                   const sigB = `${b.note}|${b.cat}|${b.amount}|${b.date.split('T')[0]}`;
                   if(sigA < sigB) return -1;
                   if(sigA > sigB) return 1;
                   return new Date(b.date) - new Date(a.date);
                });
            } else {
                activeAp.sort((a,b) => { const dA = new Date(a.date).getTime(); const dB = new Date(b.date).getTime(); return apSortOrder === 'asc' ? dA - dB : dB - dA; });
            }

            let activeHtml = '';
            
            const dupTracker = {}; // Tracker para transacciones pares
            
            activeAp.forEach(t => {
                const quotas = t.apQuotas || 4;
                const paid = t.apPaid || 0;
                const rem = quotas - paid;
                const amt = t.original_amount || t.amount;
                const qAmt = amt / quotas;
                const pendingForThis = qAmt * rem;

                const dDate = new Date(t.date);
                const timeStr = String(dDate.getHours()).padStart(2,'0') + ':' + String(dDate.getMinutes()).padStart(2,'0');
                const pct = Math.min(100, (paid / quotas) * 100);

                let isPar = false;
                if (apShowDuplicates) {
                    const sig = `${t.note}|${t.cat}|${t.amount}|${t.date.split('T')[0]}`;
                    dupTracker[sig] = (dupTracker[sig] || 0) + 1;
                    if (dupTracker[sig] % 2 === 0) isPar = true;
                }

                const cardBgClass = isPar ? 'bg-red-50 border-red-300' : 'theme-card border-slate-100/50 hover:border-teal-300';
                const textTitleClass = isPar ? 'text-red-700' : 'theme-text';
                const textSubClass = isPar ? 'text-red-500' : 'text-slate-400';
                const textAmtClass = isPar ? 'text-red-600' : 'text-teal-600';

                activeHtml += `<div class="${cardBgClass} p-5 rounded-[1.5rem] border shadow-sm flex flex-col gap-3 transition-colors cursor-pointer" data-nexus-action="toggleApTx" data-nexus-arg="${t.id}"><div class="flex justify-between items-start"><div><h4 class="text-xs font-black uppercase ${textTitleClass}">${t.note || t.cat.substring(2)}</h4><p class="text-[9px] font-bold ${textSubClass} uppercase mt-1">${dDate.toLocaleDateString('es-CO')} ${timeStr} • ${t.apFreq === 'fortnightly' ? 'Quincenal' : (t.apFreq === 'monthly' ? 'Mensual' : 'Semanal')}</p></div><div class="flex items-center gap-2" data-nexus-stop-propagation="1"><button type="button" data-nexus-action="editTransaction" data-nexus-arg="${t.id}" class="w-7 h-7 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center shadow-sm active:scale-90 transition-transform"><i class="fa-solid fa-pen text-[9px]"></i></button><button type="button" data-nexus-action="deleteDatabaseRecord" data-nexus-arg="${t.id}" title="Borrar Transacción" class="w-7 h-7 bg-red-100 text-red-600 rounded-full flex items-center justify-center shadow-sm active:scale-90 transition-transform"><i class="fa-solid fa-trash text-[9px]"></i></button><button data-nexus-action="payAfterpayQuota" data-nexus-arg="${t.id}" type="button" class="text-[9px] font-black bg-teal-100 text-teal-600 px-3 py-1.5 rounded-xl uppercase shadow-sm active:scale-95 transition-transform">Abonar</button></div></div><div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div class="h-full bg-teal-400 rounded-full transition-all" style="width: ${pct}%"></div></div><div class="flex justify-between items-end"><p class="text-[9px] font-black ${textSubClass} uppercase">Pagado: ${t.apPaid || 0}/${quotas}</p><p class="text-sm font-black ${textAmtClass}">${fmt(pendingForThis, apCurr)}</p></div><div id="ap-tx-${t.id}" class="hidden flex-col gap-2 pt-3 border-t border-slate-200/50 mt-1 animate-slideUp text-xs cursor-default" data-nexus-stop-propagation="1"></div></div>`;
            });

            if (activeAp.length === 0) {
                if (apShowDuplicates) {
                    activeHtml = `<div class="text-center p-6 border border-dashed border-rose-200 rounded-[1.5rem] bg-rose-50/30"><p class="text-[10px] font-bold text-rose-600/70 uppercase">No hay duplicados exactos</p></div>`;
                } else {
                    activeHtml = `<div class="text-center p-6 border border-dashed border-teal-200 rounded-[1.5rem] bg-teal-50/30"><p class="text-[10px] font-bold text-teal-600/70 uppercase">Sin compras vigentes</p></div>`;
                }
            }
            activeList.innerHTML = activeHtml;
            
            if (computeKpis && !(global.NexusAfterpayEngine && global.NexusAfterpayEngine.__state && global.NexusAfterpayEngine.__state.skipKpiRecompute)) {
                        const limit = state.settings.apLimit || 5000000;
                        totalPendingEl.innerText = fmt(totalPending, apCurr);
                        availableEl.innerText = fmt(limit - totalPending, apCurr);
            
            }
            
            // APEX FIX (Afterpay Calendar v2): generar TODAS las cuotas (pagadas + pendientes)
            // directamente desde state.tx evitando el filtro de divisa global de getEnrichedTx().
            // Las cuotas amortizadas aparecen junto a las proyectadas en orden cronológico.
            const apPayDayTarget = state.settings.apPayDay !== undefined ? parseInt(state.settings.apPayDay) : 5;
            const allQuotas = nexusBuildApCalendarEntries(apTx, apPayDayTarget);

            const now = new Date(); now.setHours(0,0,0,0);

            // Sumatoria dinámica orientada al "Día de Pago" configurado en el sistema
            let daysToCutoff = apPayDayTarget - now.getDay();
            if (daysToCutoff < 0) daysToCutoff += 7;

            const cutoff1 = new Date(now);
            cutoff1.setDate(cutoff1.getDate() + daysToCutoff);
            cutoff1.setHours(23, 59, 59, 999);

            const cutoff2 = new Date(cutoff1);
            cutoff2.setDate(cutoff2.getDate() + 7);

            let thisWeekTotal = 0; let nextWeekTotal = 0;
            let thisWeekCount = 0; let nextWeekCount = 0;

            allQuotas.forEach(q => {
                if (q.paid) return; // KPIs sólo cuentan cuotas pendientes próximas
                const d = q.date;
                if (d <= cutoff1) {
                    thisWeekTotal += q.amount;
                    thisWeekCount++;
                } else if (d > cutoff1 && d <= cutoff2) {
                    nextWeekTotal += q.amount;
                    nextWeekCount++;
                }
            });

            const thisWeekEl = $id('ap-this-week'); if(thisWeekEl) thisWeekEl.innerText = fmt(thisWeekTotal, apCurr);
            const nextWeekEl = $id('ap-next-week'); if(nextWeekEl) nextWeekEl.innerText = fmt(nextWeekTotal, apCurr);

            const thisWeekCountEl = $id('ap-this-week-count'); if(thisWeekCountEl) thisWeekCountEl.innerText = `${thisWeekCount} Pago${thisWeekCount !== 1 ? 's' : ''}`;
            const nextWeekCountEl = $id('ap-next-week-count'); if(nextWeekCountEl) nextWeekCountEl.innerText = `${nextWeekCount} Pago${nextWeekCount !== 1 ? 's' : ''}`;

            const cDays = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']; const cMons = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
            const twTitle = $id('ap-this-week-title'); if(twTitle) twTitle.innerText = `Corte Actual (${cDays[cutoff1.getDay()]} ${cutoff1.getDate()} ${cMons[cutoff1.getMonth()]})`;
            const nwTitle = $id('ap-next-week-title'); if(nwTitle) nwTitle.innerText = `Próximo Corte (${cDays[cutoff2.getDay()]} ${cutoff2.getDate()} ${cMons[cutoff2.getMonth()]})`;

            if (allQuotas.length === 0) {
                scheduleList.innerHTML = `<p class="text-center text-[10px] text-slate-400 font-bold p-4 uppercase tracking-widest">Libre de Deuda</p>`;
            } else {
                // Mostrar las próximas pendientes primero (ordenadas cronológicamente)
                // pero conservando las amortizadas como histórico contextual debajo.
                const pending = allQuotas.filter(q => !q.paid);
                const paidQuotas = allQuotas.filter(q => q.paid).reverse(); // pagadas: más recientes arriba

                const renderQuotaRow = (q) => {
                    const dDate = q.date;
                    const compDate = new Date(dDate); compDate.setHours(0,0,0,0);
                    const diffDays = Math.ceil((compDate.getTime() - now.getTime()) / 86400000);

                    let timeIndicator, badgeClass, cardClass, titleClass, subClass, amtClass;

                    if (q.paid) {
                        timeIndicator = 'Pagada';
                        badgeClass = 'bg-emerald-100 text-emerald-700 border-emerald-200';
                        cardClass = 'bg-emerald-50/40 border-emerald-100';
                        titleClass = 'text-emerald-700';
                        subClass = 'text-emerald-500/80';
                        amtClass = 'text-emerald-600 line-through opacity-70';
                    } else if (diffDays < 0) {
                        timeIndicator = 'Vencido';
                        badgeClass = 'bg-red-100 text-red-600 border-red-200';
                        cardClass = 'bg-red-50 border-red-100';
                        titleClass = 'text-red-600'; subClass = 'text-red-400'; amtClass = 'text-red-600';
                    } else if (diffDays === 0) {
                        timeIndicator = 'Hoy';
                        badgeClass = 'bg-rose-100 text-rose-600 border-rose-200 shadow-sm';
                        cardClass = 'bg-rose-50 border-rose-100';
                        titleClass = 'text-rose-700'; subClass = 'text-rose-400'; amtClass = 'theme-text';
                    } else if (compDate <= cutoff1) {
                        timeIndicator = 'Corte Actual';
                        badgeClass = 'bg-amber-100 text-amber-600 border-amber-200 shadow-sm';
                        cardClass = 'bg-slate-50 border-slate-100/50';
                        titleClass = 'text-slate-600'; subClass = 'text-slate-400'; amtClass = 'theme-text';
                    } else if (compDate <= cutoff2) {
                        timeIndicator = 'Próximo Corte';
                        badgeClass = 'bg-blue-100 text-blue-600 border-blue-200 shadow-sm';
                        cardClass = 'bg-slate-50 border-slate-100/50';
                        titleClass = 'text-slate-600'; subClass = 'text-slate-400'; amtClass = 'theme-text';
                    } else {
                        const weeks = Math.floor(diffDays / 7);
                        timeIndicator = `En ${weeks} Sem`;
                        badgeClass = 'bg-slate-100 text-slate-500 border-slate-200';
                        cardClass = 'bg-slate-50 border-slate-100/50';
                        titleClass = 'text-slate-600'; subClass = 'text-slate-400'; amtClass = 'theme-text';
                    }

                    const indicatorHtml = `<span class="text-[7px] font-black uppercase px-2 py-0.5 rounded-full border ${badgeClass} ml-2 whitespace-nowrap shrink-0">${timeIndicator}</span>`;

                    const actionsHtml = q.paid
                        ? `<div class="w-7 h-7 bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-full flex items-center justify-center shadow-sm"><i class="fa-solid fa-check text-[9px]"></i></div>`
                        : `<button type="button" data-nexus-action="editTransaction" data-nexus-arg="${q.parentId}" title="Editar Contrato" class="w-7 h-7 bg-white border border-slate-200 text-slate-400 rounded-full flex items-center justify-center hover:text-blue-500 active:scale-90 transition-all shadow-sm"><i class="fa-solid fa-pen text-[9px]"></i></button>
                           <button type="button" data-nexus-action="payAfterpayQuota" data-nexus-arg="${q.parentId}" title="Conciliar Cuota" class="w-7 h-7 ${diffDays < 0 ? 'bg-red-100 text-red-600 border-red-200 hover:bg-red-200' : 'bg-teal-100 text-teal-600 border-teal-200 hover:bg-teal-200'} border rounded-full flex items-center justify-center active:scale-90 transition-all shadow-sm"><i class="fa-solid fa-check text-[9px]"></i></button>`;

                    return `<div class="flex justify-between items-center p-3 rounded-xl border ${cardClass}">
                        <div class="flex-1 min-w-0 pr-2">
                            <div class="flex items-center"><p class="text-[10px] font-black uppercase ${titleClass} truncate">${q.label}</p> ${indicatorHtml}</div>
                            <p class="text-[8px] font-bold ${subClass} uppercase mt-0.5">${dDate.toLocaleDateString('es-CO')} · Cuota ${q.idx + 1}/${q.quotas}</p>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <p class="text-xs font-black mr-1 ${amtClass}">${fmt(q.amount, apCurr)}</p>
                            ${actionsHtml}
                        </div>
                    </div>`;
                };

                let html = '';
                if (pending.length > 0) {
                    html += pending.slice(0, 12).map(renderQuotaRow).join('');
                }
                if (paidQuotas.length > 0) {
                    html += `<div class="pt-3 mt-3 border-t border-dashed border-emerald-200/60">
                        <p class="text-[8px] font-black uppercase text-emerald-600/80 tracking-widest mb-2 px-1"><i class="fa-solid fa-clock-rotate-left mr-1"></i>Periodos Amortizados (${paidQuotas.length})</p>
                    </div>`;
                    html += paidQuotas.slice(0, 8).map(renderQuotaRow).join('');
                }
                if (pending.length === 0 && paidQuotas.length === 0) {
                    html = `<p class="text-center text-[10px] text-slate-400 font-bold p-4 uppercase tracking-widest">Libre de Deuda</p>`;
                }
                scheduleList.innerHTML = html;
            }
            requestAnimationFrame(() => fitNexusAmounts($id('tab-afterpay')));
        }

        /**
         * APEX FIX: Construye TODAS las cuotas (amortizadas + pendientes) para el calendario
         * de Afterpay. Las cuotas pagadas se hidratan con la fecha real del [Abono] correspondiente
         * cuando existe; en caso contrario se utiliza la fecha proyectada.
         */
        function nexusBuildApCalendarEntries(apTxList, apPayDay) {
            const out = [];
            const targetDay = Number.isFinite(apPayDay) ? apPayDay : 5;

            (apTxList || []).forEach(tx => {
                if (!tx || tx.type !== 'afterpay') return;
                const quotas = tx.apQuotas || 4;
                const paidCount = Math.min(tx.apPaid || 0, quotas);
                const stD = tx.apFreq === 'fortnightly' ? 14 : 7;
                const baseDate = getSafeDate(tx.date);
                const amt = (tx.original_amount || tx.amount) / quotas;
                const baseNote = tx.note || (tx.cat || '').substring(2).trim();

                // Recuperar abonos reales para hidratar la fecha histórica de las cuotas amortizadas.
                const paidTxs = (state.tx || []).filter(t =>
                    t.type === 'expense'
                    && (t.cat || '').includes('Afterpay')
                    && /\[(Abono Realizado|Abono|Pago Inicial)\]/.test(t.note || '')
                    && (t.note || '').includes(baseNote)
                ).sort((a, b) => new Date(a.date) - new Date(b.date));

                for (let i = 0; i < quotas; i++) {
                    let d = new Date(baseDate.getTime());
                    if (tx.apFreq === 'monthly') d.setMonth(d.getMonth() + i);
                    else d.setDate(d.getDate() + (i * stD));

                    if (i > 0) {
                        let dist = targetDay - d.getDay();
                        if (dist < 0) dist += 7;
                        d.setDate(d.getDate() + dist);
                    }
                    d.setHours(12, 0, 0, 0);

                    const isPaid = i < paidCount;
                    let actualDate = d;
                    if (isPaid && paidTxs[i]) {
                        const pd = new Date(paidTxs[i].date);
                        if (!isNaN(pd.getTime())) actualDate = pd;
                    }

                    out.push({
                        parentId: tx.id,
                        idx: i,
                        quotas,
                        label: baseNote,
                        date: actualDate,
                        amount: amt,
                        paid: isPaid
                    });
                }
            });

            return out.sort((a, b) => a.date.getTime() - b.date.getTime());
        }

        // Tabla de Amortización Dinámica y Rastreo de Cuenta para Afterpay
        function toggleApTx(id) {
            const el = $id('ap-tx-' + id);
            if(!el) return;
            
            if(el.classList.contains('hidden')) {
                el.classList.remove('hidden'); el.classList.add('flex');
                const tx = state.tx.find(t => t.id === id);
                if(!tx) return;

                const quotas = tx.apQuotas || 4;
                const paid = tx.apPaid || 0;
                const apCurr = tx.original_currency || tx.currency;
                const qAmt = (tx.original_amount || tx.amount) / quotas;
                const baseDate = getSafeDate(tx.date);
                const stD = tx.apFreq === 'fortnightly' ? 14 : 7;
                const targetDay = state.settings.apPayDay !== undefined ? parseInt(state.settings.apPayDay) : 5;

                const baseNote = tx.note || tx.cat.substring(2);
                let paidTxs = state.tx.filter(t => t.type === 'expense' && (t.cat||'').includes('Afterpay') && (t.note||'').match(/\[(Abono Realizado|Abono|Pago Inicial)\]/) && (t.note||'').includes(baseNote)).sort((a,b) => new Date(a.date) - new Date(b.date));

                let html = '<h4 class="text-[9px] font-black uppercase text-slate-400 mt-2 mb-1 tracking-widest">Tabla de Amortización</h4><div class="space-y-2">';
                
                for(let i=1; i<=quotas; i++) {
                    let statusIcon, statusColor, dateStr, accNameStr = '';
                    if (i <= paid) {
                        statusIcon = 'fa-check text-emerald-500';
                        statusColor = 'bg-emerald-50 border-emerald-100 text-emerald-700';
                        const pTx = paidTxs[i-1];
                        if (pTx) {
                            dateStr = new Date(pTx.date).toLocaleDateString('es-CO', {day:'numeric', month:'short', year:'numeric'});
                            const acc = state.accounts.find(a => a.id === pTx.accId);
                            accNameStr = acc ? acc.name.replace('👥 ', '') : 'Desconocida';
                        } else {
                            dateStr = 'Pagado (Histórico)';
                            accNameStr = '--';
                        }
                    } else {
                        statusIcon = 'fa-clock text-slate-400';
                        statusColor = 'bg-slate-50 border-slate-100 text-slate-500';
                        let d = new Date(baseDate.getTime());
                        if (tx.apFreq === 'monthly') { d.setMonth(d.getMonth() + (i - 1)); } else { d.setDate(d.getDate() + ((i - 1) * stD)); }
                        
                        if ((i - 1) > 0) {
                            let currentDay = d.getDay();
                            let dist = targetDay - currentDay;
                            if (dist < 0) dist += 7;
                            d.setDate(d.getDate() + dist);
                        }
                        
                        dateStr = d.toLocaleDateString('es-CO', {day:'numeric', month:'short', year:'numeric'}) + ' (Proy)';
                        accNameStr = 'Pendiente';
                    }

                    html += `<div class="flex justify-between items-center p-2.5 rounded-xl border ${statusColor}">
                        <div class="flex items-center gap-3">
                            <div class="w-6 h-6 rounded-full flex items-center justify-center bg-white shadow-sm shrink-0"><i class="fa-solid ${statusIcon} text-[10px]"></i></div>
                            <div class="flex flex-col">
                                <span class="text-[10px] font-black uppercase">Cuota ${i}/${quotas}</span>
                                <span class="text-[8px] font-bold opacity-70 uppercase flex items-center gap-1 mt-0.5">${dateStr} ${accNameStr !== 'Pendiente' && accNameStr !== '--' ? `• <i class="fa-solid fa-wallet"></i> ${accNameStr}` : ''}</span>
                            </div>
                        </div>
                        <span class="text-[10px] font-black">${fmt(qAmt, apCurr)}</span>
                    </div>`;
                }
                html += '</div>';
                el.innerHTML = html;

            } else {
                el.classList.add('hidden'); el.classList.remove('flex');
            }
        }

        function payAfterpayQuota(id) {
            const tx = state.tx.find(t => t.id === id); if(!tx) return; const quotas = tx.apQuotas || 4; if((tx.apPaid || 0) >= quotas) return alert("Compra saldada.");
            let acc = state.accounts.find(a => a.type === 'liquid' && a.currency === tx.currency);
            if(!acc) acc = state.accounts.find(a => a.type === 'liquid');
            if(!acc) return alert("Necesitas una cuenta líquida con saldo para el pago.");
            
            let rawDeductAmt = (tx.original_amount || tx.amount) / quotas;
            let deductAmt = rawDeductAmt;
            if(acc.currency !== tx.currency) deductAmt = convertCurrency(rawDeductAmt, tx.currency, acc.currency);
            
            tx.apPaid = (tx.apPaid || 0) + 1;
            nexusTouchEntityUpdatedAt(tx, 'tx');
            if (nexusIsLiabAccount(acc)) acc.balance += deductAmt; else acc.balance -= deductAmt;
            
            const newTx = buildTransactionSchema({ type: 'expense', amount: rawDeductAmt, cat: tx.cat, accId: acc.id, date: new Date().toISOString(), note: `[Abono] ${tx.note ? tx.note : tx.cat.substring(2).trim()} (${tx.apPaid}/${quotas})`, currency: tx.currency, costType: 'fixed' });
            newTx.apParentId = tx.id;

            if (userProfile && userProfile.name) newTx.createdBy = userProfile.name;
            nexusTouchEntityUpdatedAt(newTx, 'tx');

            state.tx.push(newTx); saveCloudTx(newTx); saveCloudTx(tx);
            saveState({ cloudHint: { reason: 'tx', tx: newTx } }); updateDashboard(); if(state.activeTab === 'afterpay') renderAfterpay(); if(state.activeTab === 'database') renderDatabase(); alert(`✅ Cuota ${tx.apPaid}/${quotas} pagada.`);
        }
        function copyAndPayPSE(reference, url) {
            const u = nexusNormalizePaymentUrl(url);
            if (!u) return alert('Este enlace no tiene URL de pago configurada.');
            const ref = String(reference || '').trim();
            if (ref) {
                secureCopy(ref, "✅ NIC copiado.\nAbriendo portal de pagos...");
                setTimeout(() => redirigirPagoDirecto(u), 700);
            } else {
                redirigirPagoDirecto(u);
            }
        }



  const api = {
    __state: global.NexusAfterpayEngine.__state,
    prepare: prepareAfterpay,
    paint: function () { return paintAfterpay(false); },
    render: renderAfterpay,
    toggleApSort,
    toggleApDuplicates,
    nexusBuildApCalendarEntries,
    toggleApTx,
    payAfterpayQuota,
    copyAndPayPSE
  };

  global.NexusAfterpayEngine = api;
  global.renderAfterpay = renderAfterpay;
  global.toggleApSort = toggleApSort;
  global.toggleApDuplicates = toggleApDuplicates;
  global.payAfterpayQuota = payAfterpayQuota;
  global.toggleApTx = toggleApTx;
  global.nexusBuildApCalendarEntries = nexusBuildApCalendarEntries;
  global.copyAndPayPSE = copyAndPayPSE;

  console.info("[NEXUS] feature-afterpay afterpay-engine.js cargado");
})(typeof window !== "undefined" ? window : globalThis);
