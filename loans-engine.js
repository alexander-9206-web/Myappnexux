/**
 * NEXUS feature-deudas — Motor SSoT (Fase 1)
 * Extraído del monolito. Requiere globals de nexus-app.js ($id, state, fmt, …).
 */
(function (global) {
  "use strict";

  if (!global.NexusLoansEngine) global.NexusLoansEngine = { __state: {} };

  function getActiveLoans() {
    if (state.activeCurrency === "GLOBAL") {
      const base = state.settings.baseCurrency;
      return (state.loans || []).map((l) => ({
        ...l,
        original_total: l.total,
        original_balance: l.balance,
        original_currency: l.currency,
        total: convertCurrency(l.total, l.currency, base),
        balance: convertCurrency(l.balance, l.currency, base),
        currency: base,
        isVirtual: true,
      }));
    }
    return (state.loans || []).filter((l) => l.currency === state.activeCurrency);
  }

        let loanCalMonthOffset = 0;
        function changeLoanCalMonth(val) {
            if (val === 0) loanCalMonthOffset = 0;
            else loanCalMonthOffset += val;
            renderLoansList();
        }

        if (!window.__nexusLoansAccOpen) window.__nexusLoansAccOpen = { pending: true, general: true, cc: true };
        if (!window.__nexusLoansCardOpen) window.__nexusLoansCardOpen = {};
        if (!window.__nexusLoansPurchaseOpen) window.__nexusLoansPurchaseOpen = {};

        /** % del extracto: si parece EA anual (>4), dividir entre 12 para tasa mensual. */
        function nexusNormalizeMonthlyRatePct(pctRaw, card) {
            let pct = Number(pctRaw);
            if (!Number.isFinite(pct) || pct < 0) pct = Number(card && card.rate) || 0;
            if (pct > 4) pct = pct / 12;
            return pct;
        }

        function nexusCalcLoanFrenchSchedule(loan) {
            const P = Number(loan.original_total ?? loan.total) || 0;
            const term = Math.max(1, parseInt(loan.term, 10) || 1);
            const paid = Math.max(0, parseInt(loan.paidQuotas, 10) || 0);
            const ratePct = nexusNormalizeMonthlyRatePct(loan.rate, null);
            const r = ratePct / 100;
            let A = Number(loan.scannerQuota) || 0;
            if (A <= 0) {
                A = r === 0 ? P / term : (P * r * Math.pow(1 + r, term)) / (Math.pow(1 + r, term) - 1);
            }
            let balance = P;
            const rows = [];
            let cursor = new Date(loan.date || Date.now());
            for (let i = 1; i <= term; i++) {
                cursor = new Date(cursor);
                cursor.setMonth(cursor.getMonth() + 1);
                const interest = balance * r;
                const principal = Math.min(balance, Math.max(0, A - interest));
                const payment = principal + interest;
                balance -= principal;
                if (balance < 0.01) balance = 0;
                rows.push({ i, date: cursor.toISOString(), principal, interest, payment, balance, paid: i <= paid });
            }
            const currentBalance = paid >= term ? 0 : (paid > 0 && rows[paid - 1] ? rows[paid - 1].balance : P);
            const monthlyQuota = paid < term ? A : 0;
            return { P, term, paid, remaining: Math.max(0, term - paid), A, ratePct, rows, currentBalance, monthlyQuota };
        }

        function nexusGetLoanActiveBalance(loan) {
            const s = nexusCalcLoanFrenchSchedule(loan);
            if (typeof loan.balance === 'number' && loan.balance >= 0 && loan.isCC) {
                return loan.balance;
            }
            return s.currentBalance;
        }

        function nexusRecalcCreditCardBalanceFromLoans(cardId) {
            const card = (state.accounts || []).find(a => a.id === cardId);
            if (!card) return;
            let sum = 0;
            (state.loans || []).filter(l => l.isCC && l.cardId === cardId).forEach(l => {
                const s = nexusCalcLoanFrenchSchedule(l);
                if (s.remaining > 0) sum += s.currentBalance;
            });
            card.balance = sum;
        }

        function nexusFindLoanByPurchaseTx(tx) {
            if (!tx) return null;
            const byId = (state.loans || []).find(l => l.isCC && (l.purchaseTxId === tx.id || l.scannerTxId === tx.id));
            if (byId) return byId;
            const hint = String(tx.note || tx.cat || '').replace(/^\[TC\]\s*/i, '').split('·')[0].trim().toLowerCase();
            if (!hint) return null;
            return (state.loans || []).find(l => l.isCC && l.cardId === tx.accId && String(l.name || '').toLowerCase().includes(hint.slice(0, 24)));
        }

        function nexusBuildLoanAmortMiniHtml(loan) {
            const s = nexusCalcLoanFrenchSchedule(loan);
            const curr = loan.currency || state.settings.baseCurrency || 'COP';
            let tbody = '';
            s.rows.forEach(row => {
                const cls = row.paid ? 'opacity-50 line-through' : '';
                tbody += `<tr class="${cls}"><td>${row.i}</td><td class="text-right">${fmt(row.principal, curr)}</td><td class="text-right text-red-400">+${fmt(row.interest, curr)}</td><td class="text-right font-black">${fmt(row.payment, curr)}</td><td class="text-right text-amber-600">${fmt(row.balance, curr)}</td></tr>`;
            });
            return `<table class="nexus-loans-amort-mini w-full mt-2"><thead><tr class="text-slate-400 uppercase"><th>#</th><th class="text-right">Capital</th><th class="text-right">Int.</th><th class="text-right">Cuota</th><th class="text-right">Saldo</th></tr></thead><tbody>${tbody}</tbody></table><p class="text-[7px] text-slate-500 mt-1">Cuota fija ${fmt(s.A, curr)} · Tasa ${s.ratePct.toFixed(2)}% mes · Pagadas ${s.paid}/${s.term}</p>`;
        }

        function nexusToggleLoansAcc(key) {
            window.__nexusLoansAccOpen[key] = !window.__nexusLoansAccOpen[key];
            renderLoansList();
        }

        function nexusToggleLoansCard(cardId) {
            window.__nexusLoansCardOpen[cardId] = !window.__nexusLoansCardOpen[cardId];
            renderLoansList();
        }

        function nexusToggleLoansPurchase(loanId) {
            window.__nexusLoansPurchaseOpen[loanId] = !window.__nexusLoansPurchaseOpen[loanId];
            renderLoansList();
        }

        function nexusToggleCcTxAmort(ev, txId, accId) {
            if (ev) ev.stopPropagation();
            const panelId = 'cc-amort-' + txId;
            const existing = $id(panelId);
            if (existing) {
                existing.remove();
                return;
            }
            const tx = (state.tx || []).find(t => t.id === txId);
            const loan = nexusFindLoanByPurchaseTx(tx);
            if (!loan) return editTransaction(txId);
            $qAll('[id^="cc-amort-"]').forEach(el => el.remove());
            const host = ev && ev.currentTarget ? ev.currentTarget.closest('.rounded-xl') : null;
            if (!host) return showLoanDetail(loan.id);
            const div = document.createElement('div');
            div.id = panelId;
            div.className = 'nexus-cc-amort-panel';
            div.innerHTML = `<p class="font-black uppercase text-indigo-700 mb-1"><i class="fa-solid fa-table-list mr-1"></i> ${loan.name}</p>${nexusBuildLoanAmortMiniHtml(loan)}<button type="button" class="mt-2 text-[8px] font-black uppercase text-blue-600" data-nexus-action="showLoanDetail" data-nexus-arg="${loan.id}">Ver detalle completo</button>`;
            host.appendChild(div);
            requestAnimationFrame(() => fitNexusAmounts(div));
        }

        function nexusToggleCcTxAmortCard(txId, accId, ev) {
            nexusToggleCcTxAmort(ev, txId, accId);
        }
        window.nexusToggleCcTxAmortCard = nexusToggleCcTxAmortCard;

        function nexusRenderLoanCompactCard(l) {
            const s = nexusCalcLoanFrenchSchedule(l);
            const curr = l.currency || state.settings.baseCurrency || 'COP';
            const bal = nexusGetLoanActiveBalance(l);
            const payBtn = s.remaining > 0
                ? `<button type="button" data-nexus-action="payLoanQuota" data-nexus-arg="${l.id}" class="text-[8px] font-black bg-amber-500 text-white px-2 py-1 rounded-lg uppercase"><i class="fa-solid fa-check mr-0.5"></i>Abonar</button>`
                : `<span class="text-[8px] font-black text-emerald-600 uppercase">Saldada</span>`;
            return `<div class="theme-card p-3 rounded-xl border text-left">
                <div class="flex justify-between items-start gap-2">
                    <div class="min-w-0 flex-1"><p class="text-[10px] font-black uppercase theme-text truncate">${l.sharedVaultId ? '<span class="text-[7px] font-black bg-amber-700 text-white px-1.5 py-0.5 rounded uppercase mr-1">👥</span>' : ''}${l.name}</p>
                    <p class="text-[8px] text-slate-500 mt-0.5">Cuota ${fmt(s.A, curr)} · ${s.paid}/${s.term} · Saldo ${fmt(bal, curr)}</p></div>
                    <div class="flex gap-1 shrink-0">${payBtn}
                    <button type="button" data-nexus-action="editLoan" data-nexus-arg="${l.id}" class="text-slate-300 hover:text-blue-500 p-1"><i class="fa-solid fa-pen text-[10px]"></i></button>
                    <button type="button" data-nexus-action="deleteLoan" data-nexus-payload='["event", "${l.id}"]' class="text-slate-300 hover:text-red-500 p-1"><i class="fa-solid fa-trash text-[10px]"></i></button></div>
                </div>
                <button type="button" class="text-[8px] font-black uppercase text-indigo-600 mt-2" data-nexus-action="nexusToggleLoansPurchase" data-nexus-arg="${l.id}">${window.__nexusLoansPurchaseOpen[l.id] ? 'Ocultar' : 'Ver'} amortización</button>
                ${window.__nexusLoansPurchaseOpen[l.id] ? nexusBuildLoanAmortMiniHtml(l) : ''}
            </div>`;
        }


        function renderLoansList() {
            if (global.__NexusLoansDomain && typeof global.__NexusLoansDomain.renderList === "function") {
                return global.__NexusLoansDomain.renderList();
            }
            prepareLoansList();
            return paintLoansList(true);
        }

        function prepareLoansList() {
            if (typeof scheduleP2PListenersAttach === "function") scheduleP2PListenersAttach(true);
        }

        function paintLoansList(computeStats) {
            const bodyPending = $id('loans-acc-pending-body');
            const bodyGeneral = $id('loans-acc-general-body');
            const bodyCc = $id('loans-acc-cc-body');
            const listPaidContainer = $id('loans-list-paid-container');
            const listPaid = $id('loans-list-paid');
            const summary = $id('loans-summary-container');
            if (!bodyPending || !bodyGeneral || !bodyCc || !summary) return;
            const activeLoans = getActiveLoans();
            const emptyMsg = `<p class="text-[10px] text-slate-400 font-bold uppercase text-center py-4 border border-dashed rounded-xl">Sin registros</p>`;
            if (activeLoans.length === 0) {
                summary.classList.add('hidden');
                bodyPending.innerHTML = emptyMsg;
                bodyGeneral.innerHTML = emptyMsg;
                bodyCc.innerHTML = emptyMsg;
                if (listPaidContainer) listPaidContainer.classList.add('hidden');
                ['pending', 'general', 'cc'].forEach(k => {
                    const acc = $id('loans-acc-' + k);
                    if (acc) acc.classList.remove('is-open');
                    const b = $id('loans-acc-' + k + '-body');
                    if (b) b.classList.add('hidden');
                });
                return;
            }
            summary.classList.remove('hidden');
            let totalDebt = 0, totalMonthlyPayment = 0, weightedRateSum = 0, htmlPaid = '';
            const pendLoans = [], genLoans = [], ccLoans = [];
            activeLoans.forEach(l => {
                const s = nexusCalcLoanFrenchSchedule(l);
                const currentBalance = nexusGetLoanActiveBalance(l);
                const isSharedP2P = !!l.sharedVaultId;
                if (s.remaining > 0 && !isSharedP2P) {
                    totalDebt += currentBalance;
                    totalMonthlyPayment += s.monthlyQuota;
                    weightedRateSum += (s.ratePct * currentBalance);
                }
                if (l.isCC) ccLoans.push(l);
                else if (l.id.startsWith('pend_')) pendLoans.push(l);
                else genLoans.push(l);
                if (s.remaining <= 0) htmlPaid += nexusRenderLoanCompactCard(l);
            });
            const setAcc = (key, html) => {
                const acc = $id('loans-acc-' + key);
                const body = $id('loans-acc-' + key + '-body');
                const open = !!window.__nexusLoansAccOpen[key];
                if (acc) acc.classList.toggle('is-open', open);
                if (body) {
                    body.classList.toggle('hidden', !open);
                    body.innerHTML = html || emptyMsg;
                }
            };
            setAcc('pending', pendLoans.filter(l => nexusCalcLoanFrenchSchedule(l).remaining > 0).map(nexusRenderLoanCompactCard).join(''));
            setAcc('general', genLoans.filter(l => nexusCalcLoanFrenchSchedule(l).remaining > 0).map(nexusRenderLoanCompactCard).join(''));
            const ccByCard = {};
            ccLoans.forEach(l => {
                const cid = l.cardId || '_sin_tarjeta';
                if (!ccByCard[cid]) ccByCard[cid] = [];
                ccByCard[cid].push(l);
            });
            let htmlCc = '';
            Object.keys(ccByCard).forEach(cardId => {
                const card = cardId === '_sin_tarjeta' ? null : (state.accounts || []).find(a => a.id === cardId);
                const cardName = card ? card.name : 'Sin tarjeta';
                const loansOnCard = ccByCard[cardId].filter(l => nexusCalcLoanFrenchSchedule(l).remaining > 0);
                if (!loansOnCard.length) return;
                const cardBal = loansOnCard.reduce((s, l) => s + nexusGetLoanActiveBalance(l), 0);
                const curr = (card && card.currency) || state.settings.baseCurrency || 'COP';
                const openCard = !!window.__nexusLoansCardOpen[cardId];
                htmlCc += `<div class="nexus-loans-nested-acc mb-2">
                    <button type="button" class="nexus-loans-nested-head" data-nexus-action="nexusToggleLoansCard" data-nexus-arg="${cardId}">
                        <span class="text-[9px] font-black uppercase text-red-700"><i class="fa-solid fa-credit-card mr-1"></i>${cardName}</span>
                        <span class="text-[8px] font-black text-slate-500">${loansOnCard.length} compra(s) · ${fmt(cardBal, curr)} <i class="fa-solid fa-chevron-down ml-1 nexus-loans-acc-chev" style="${openCard ? 'transform:rotate(180deg)' : ''}"></i></span>
                    </button>
                    <div class="nexus-loans-nested-body ${openCard ? '' : 'hidden'}">${loansOnCard.map(nexusRenderLoanCompactCard).join('')}</div>
                </div>`;
            });
            setAcc('cc', htmlCc);
            if (listPaidContainer && listPaid) {
                if (htmlPaid) { listPaidContainer.classList.remove('hidden'); listPaid.innerHTML = htmlPaid; }
                else { listPaidContainer.classList.add('hidden'); }
            }
            if (computeStats && !(global.NexusLoansEngine && global.NexusLoansEngine.__state && global.NexusLoansEngine.__state.skipHubStatsRecompute)) {
            const now = new Date(); const monthlyIncomes = state.tx.filter(t => t.type === 'income' && t.currency === state.activeCurrency && new Date(t.date).getMonth() === now.getMonth() && new Date(t.date).getFullYear() === now.getFullYear()).reduce((sum, t) => sum + t.amount, 0);
            let baseIncome = monthlyIncomes > 0 ? convertCurrency(monthlyIncomes, state.activeCurrency, state.settings.baseCurrency) : 1000000;
            const ratio = (totalMonthlyPayment / baseIncome) * 100; const avgRate = totalDebt > 0 ? (weightedRateSum / totalDebt) : 0;
            const elTotal = $id('ls-total-debt'); if(elTotal) elTotal.innerText = fmt(totalDebt, state.settings.baseCurrency);
            const elLoad = $id('ls-monthly-load'); if(elLoad) elLoad.innerText = fmt(totalMonthlyPayment, state.settings.baseCurrency);
            const elRate = $id('ls-avg-rate'); if(elRate) elRate.innerText = avgRate.toFixed(1) + '%';
            const elRisk = $id('ls-risk-ratio'); if(elRisk) { elRisk.innerText = ratio.toFixed(1) + '%'; elRisk.className = ratio > 35 ? "nexus-amount-fit nexus-amt-summary font-black mt-1 text-red-600" : (ratio > 20 ? "nexus-amount-fit nexus-amt-summary font-black mt-1 text-amber-500" : "nexus-amount-fit nexus-amt-summary font-black mt-1 text-emerald-500"); }

            const activeLoansGlobal = state.loans || [];
            const debtByCurrency = {};
            activeLoansGlobal.forEach(l => {
                const s = nexusCalcLoanFrenchSchedule(l);
                const currentBalance = nexusGetLoanActiveBalance(l);
                if (s.remaining > 0) {
                    const c = l.original_currency || l.currency;
                    debtByCurrency[c] = (debtByCurrency[c] || 0) + currentBalance;
                }
            });
            const currIndContainer = $id('loans-currency-indicators');
            if (currIndContainer) {
                if (Object.keys(debtByCurrency).length > 0) {
                    currIndContainer.classList.remove('hidden');
                    currIndContainer.innerHTML = Object.keys(debtByCurrency).map(c => `<div class="bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-sm"><p class="text-[8px] font-bold text-slate-500 uppercase">Total en ${c}</p><div class="nexus-amount-box"><h5 class="nexus-amount-fit nexus-amt-summary font-black theme-val-exp mt-1">-${fmt(debtByCurrency[c], c)}</h5></div></div>`).join('');
                } else { currIndContainer.classList.add('hidden'); }
            }
            }
            const calContainer = $id('loans-calendar-container'); const miniCal = $id('loans-mini-calendar');
            if (calContainer && miniCal) {
                if (activeLoansGlobal.length > 0) {
                    calContainer.classList.remove('hidden');
                    const now = new Date(); const viewDate = new Date(now.getFullYear(), now.getMonth() + loanCalMonthOffset, 1); const ldom = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0); let startDay = viewDate.getDay() - 1; if(startDay < 0) startDay = 6;
                    const gmEl = $id('loan-cal-month-label'); if(gmEl) gmEl.innerText = viewDate.toLocaleDateString('es-CO', {month: 'short', year: 'numeric'});
                    const projectedTx = getEnrichedTx().filter(t => t.isProjected && (t.cat.includes('Deuda') || t.cat.includes('TC') || t.cat.includes('Afterpay') || t.cat.includes('Pendiente')) && new Date(t.date).getMonth() === viewDate.getMonth() && new Date(t.date).getFullYear() === viewDate.getFullYear());
                    let gridHtml = ''; for(let i=0; i<startDay; i++) gridHtml += `<div class="cal-cell is-empty"></div>`;
                    for(let i=1; i<=ldom.getDate(); i++) {
                        const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), i); const isToday = d.toDateString() === now.toDateString();
                        const dayTx = projectedTx.filter(t => new Date(t.date).toDateString() === d.toDateString()); const hasEv = dayTx.length > 0;
                        let dotColor = ''; let cellBg = ''; let cellText = ''; let cellBorder = '';
                        if (hasEv) {
                            if (dayTx.some(t => t.note && t.note.includes('⚡'))) { dotColor = 'bg-amber-500'; cellBg = 'bg-amber-50'; cellBorder = 'border-amber-200'; cellText = 'text-amber-600'; }
                            else if (dayTx.some(t => t.cat.includes('TC'))) { dotColor = 'bg-rose-500'; cellBg = 'bg-rose-50'; cellBorder = 'border-rose-200'; cellText = 'text-rose-600'; }
                            else if (dayTx.some(t => t.cat.includes('Deuda'))) { dotColor = 'bg-blue-500'; cellBg = 'bg-blue-50'; cellBorder = 'border-blue-200'; cellText = 'text-blue-600'; }
                            else { dotColor = 'bg-slate-500'; cellBg = 'bg-slate-50'; cellBorder = 'border-slate-200'; cellText = 'text-slate-600'; }
                        }
                        gridHtml += `<div class="cal-cell ${isToday ? 'is-today' : ''} ${hasEv && !isToday ? `border ${cellBorder} ${cellBg} ${cellText}` : ''}" style="min-height:28px;" ${hasEv ? `title="${dayTx.map(t=>t.note).join(', ')}"` : ''}>${i}${hasEv ? `<div class="absolute bottom-0.5 w-1 h-1 rounded-full ${dotColor}"></div>` : ''}</div>`;
                    } miniCal.innerHTML = gridHtml;
                } else { calContainer.classList.add('hidden'); }
            }
            nexusScheduleFit($id('tab-loans'));
        }

        function showLoanDetail(id) {
            const loan = state.loans.find(l => l.id === id); if (!loan) return;
            const listView = $id('loans-view-list'); const detailView = $id('loans-view-detail');
            if (listView) listView.classList.add('hidden');
            if (detailView) {
                detailView.classList.remove('hidden', 'animate-slideUp', 'opacity-0', 'transition-opacity', 'duration-200');
                const detTitle = $id('det-loan-title');
                if (detTitle) detTitle.innerText = loan.name;
            }
            const sched = nexusCalcLoanFrenchSchedule(loan);
            const totalInterest = sched.rows.reduce((s, row) => s + row.interest, 0);
            const detPara = $id('det-loan-paragraph');
            if (detPara) detPara.innerHTML = `Financiación de <span class="font-black">${fmt(sched.P, loan.currency)}</span> a ${sched.term} meses (francés, ${sched.ratePct.toFixed(2)}% mes). Intereses totales: <span class="font-black text-red-600">${fmt(totalInterest, loan.currency)}</span>. Cuota: <span class="font-black">${fmt(sched.A, loan.currency)}</span>.`;
            let tbody = '';
            sched.rows.forEach(row => {
                const isPaidRow = row.paid ? 'bg-emerald-50/30 opacity-60' : 'hover:bg-amber-50/50 transition-colors';
                tbody += `<tr class="${isPaidRow} border-b border-slate-50"><td class="px-4 py-3"><div class="font-bold text-xs text-slate-700">Cuota ${row.i} ${row.paid ? '<i class="fa-solid fa-check text-emerald-500 ml-1"></i>' : ''}</div><div class="font-mono text-[9px] text-slate-400">${row.date.split('T')[0]}</div></td><td class="px-4 py-3 text-right font-medium text-xs text-slate-600">${fmt(row.principal, loan.currency)}</td><td class="px-4 py-3 text-right font-medium text-xs text-red-400">+${fmt(row.interest, loan.currency)}</td><td class="px-4 py-3 text-right font-black text-xs text-slate-800 bg-slate-50/50">${fmt(row.payment, loan.currency)}</td><td class="px-4 py-3 text-right font-black text-xs text-amber-600">${fmt(row.balance, loan.currency)}</td></tr>`;
            });
            const detTab = $id('det-loan-table'); if (detTab) detTab.innerHTML = tbody;
            const pseBlock = $id('det-loan-pse-actions');
            if (pseBlock) {
                const isBancoDetail = loan.creditorType === 'banco' && !loan.id.startsWith('pend_') && !loan.isCC;
                if (isBancoDetail) {
                    pseBlock.classList.remove('hidden');
                    pseBlock.innerHTML = `<button type="button" data-nexus-action="openLoanPSEPayModal" data-nexus-arg="${loan.id}" class="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-lg active:scale-95 flex items-center justify-center gap-2"><i class="fa-solid fa-bolt"></i> Pagar vía PSE</button>`;
                } else {
                    pseBlock.classList.add('hidden');
                    pseBlock.innerHTML = '';
                }
            }
        }

        function hideLoanDetail() {
            const listView = $id('loans-view-list'); const detailView = $id('loans-view-detail');
            if (detailView) detailView.classList.add('hidden');
            if (listView) listView.classList.remove('hidden', 'animate-slideUp', 'opacity-0', 'transition-opacity', 'duration-200');
        }
        
        function deleteLoan(e, id) {
            if(e && typeof e.stopPropagation === 'function') e.stopPropagation();
            const removed = (state.loans || []).find(l => l.id === id);
            const vault = removed ? nexusFindSharedLoanVaultForLoan(removed) : null;
            state.loans = state.loans.filter(l => l.id !== id);
            // APEX SYNC v3: tombstone para que la eliminación se propague UP/DOWN
            if (!Array.isArray(state.deletedLoanIds)) state.deletedLoanIds = [];
            if (id && !state.deletedLoanIds.includes(id)) state.deletedLoanIds.push(id);
            if (typeof nexusMarkForceLocalWin === 'function') nexusMarkForceLocalWin(180000);
            if (removed && removed.isCC && removed.cardId) nexusRecalcCreditCardBalanceFromLoans(removed.cardId);
            saveState({ cloudHint: nexusCloudDeleteHint('loans', { id }) });
            if (vault) nexusPushSharedP2PInstant('loans', vault.remoteId || vault.id);
            renderLoansList();
            updateDashboard();
        }

        let currentLoanPsePayId = null;

        function toggleLoanCreditorFields() {
            const type = $id('fl-creditor-type') ? $id('fl-creditor-type').value : 'terceros';
            const tw = $id('fl-terceros-wrap');
            const bw = $id('fl-banco-wrap');
            if (tw) tw.classList.toggle('hidden', type !== 'terceros');
            if (bw) bw.classList.toggle('hidden', type !== 'banco');
        }

        function populateLoanCreditorSelects() {
            const tercerosSel = $id('fl-terceros-acc');
            if (tercerosSel) {
                const prev = tercerosSel.value;
                tercerosSel.innerHTML = '<option value="">— Sin vincular —</option>';
                (state.accounts || []).filter(a => a && a.type === 'terceros').forEach(a => {
                    tercerosSel.innerHTML += `<option value="${a.id}">${a.name}</option>`;
                });
                if (prev) tercerosSel.value = prev;
            }
            const pseSel = $id('fl-pse-link');
            if (pseSel) {
                const prevPse = pseSel.value;
                pseSel.innerHTML = '<option value="">Crear enlace nuevo…</option>';
                (state.pseLinks || []).forEach(p => {
                    if (!p || !p.id) return;
                    const ref = p.reference ? (' • ' + p.reference) : '';
                    pseSel.innerHTML += `<option value="${p.id}">${p.name}${ref}</option>`;
                });
                if (prevPse) pseSel.value = prevPse;
            }
        }

        function nexusBindPseLinkToLoan(loanId, pseLinkId, loanNameHint) {
            if (!pseLinkId) return;
            let loan = loanId ? (state.loans || []).find(l => l.id === loanId) : null;
            if (!loan && loanNameHint) {
                loan = (state.loans || []).find(l => l.creditorType === 'banco' && l.name === loanNameHint);
            }
            if (!loan) return;
            loan.creditorType = 'banco';
            loan.pseLinkId = pseLinkId;
            const link = (state.pseLinks || []).find(p => p.id === pseLinkId);
            if (link) {
                link.loanId = loan.id;
                link.type = link.type || 'debt';
            }
            saveState();
        }

        function openNewPSEFormFromLoanEditor() {
            const loanId = $id('fl-id') ? $id('fl-id').value : '';
            const loanName = ($id('fl-name') ? $id('fl-name').value : '').trim();
            if (!loanName) return alert('Escribe primero el nombre de la deuda.');
            const loanField = $id('f-pse-loan-id');
            if (loanField) loanField.value = loanId || '';
            window.__nexusPseLinkForLoanName = loanId ? null : loanName;
            if ($id('fl-creditor-type')) $id('fl-creditor-type').value = 'banco';
            toggleLoanCreditorFields();
            openNewPSEForm(null, loanName);
            const typeSel = $id('f-pse-type');
            if (typeSel) typeSel.value = 'debt';
            if (typeof togglePSENotifications === 'function') togglePSENotifications();
        }

        function openNewPSEFormFromLoanPayModal() {
            if (!currentLoanPsePayId) return;
            const loan = (state.loans || []).find(l => l.id === currentLoanPsePayId);
            if (!loan) return;
            const loanField = $id('f-pse-loan-id');
            if (loanField) loanField.value = loan.id;
            openNewPSEForm(null, loan.name);
            const typeSel = $id('f-pse-type');
            if (typeSel) typeSel.value = 'debt';
            if (typeof togglePSENotifications === 'function') togglePSENotifications();
        }

        function closeLoanPSEPayModal() {
            nexusHideModalInstant($id('loan-pse-pay-modal'));
            currentLoanPsePayId = null;
        }

        function nexusEscapeJsStr(s) {
            return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        }

        function openLoanPSEPayModal(loanId) {
            const loan = (state.loans || []).find(l => l.id === loanId);
            if (!loan) return;
            if (!state.pseLinks) state.pseLinks = [];
            currentLoanPsePayId = loanId;
            const mod = $id('loan-pse-pay-modal');
            const actions = $id('loan-pse-pay-actions');
            const sub = $id('loan-pse-pay-subtitle');
            if (sub) sub.innerText = loan.name;
            if (!actions || !mod) return;

            const linked = loan.pseLinkId ? state.pseLinks.find(p => p.id === loan.pseLinkId) : null;
            const nameKey = (loan.name || '').trim().toLowerCase();
            const related = state.pseLinks.filter(p => {
                if (!p) return false;
                if (linked && p.id === linked.id) return false;
                const pn = (p.name || '').trim().toLowerCase();
                return pn === nameKey || pn.includes(nameKey) || nameKey.includes(pn);
            });

            const payNic = String(loan.paymentNic || (linked && linked.reference) || '').trim();
            let html = '';
            if (linked) {
                const safeRef = nexusEscapeJsStr(payNic || linked.reference || '');
                const safeUrl = nexusEscapeJsStr(linked.url || '');
                if ((payNic || linked.reference) && linked.url) {
                    html += `<button type="button" data-nexus-action="copyAndPayPSE" data-nexus-payload='["${safeRef}", "${safeUrl}"]' class="w-full bg-emerald-500 text-white p-4 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 flex items-center justify-center gap-2"><i class="fa-solid fa-bolt"></i> Pago directo (NIC: ${safeRef})</button>`;
                } else if (linked.url) {
                    html += `<button type="button" data-nexus-action="redirigirPagoDirecto" data-nexus-arg="${safeUrl}" class="w-full bg-emerald-500 text-white p-4 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 flex items-center justify-center gap-2"><i class="fa-solid fa-arrow-up-right-from-square"></i> Ir al portal vinculado</button>`;
                }
                html += `<p class="text-[8px] font-bold text-emerald-700/80 uppercase text-center">${linked.name}${linked.refName ? ' · ' + linked.refName : ''}</p>`;
            } else {
                html += `<p class="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3 uppercase">Sin enlace vinculado. Crea uno nuevo o elige abajo.</p>`;
            }

            related.forEach(p => {
                const safeRef = nexusEscapeJsStr(p.reference || '');
                const safeUrl = nexusEscapeJsStr(p.url || '');
                const label = (p.name || 'Enlace') + (p.refName ? ' · ' + p.refName : '');
                if (p.reference && p.url) {
                    html += `<button type="button" data-nexus-action="nexusLoanPseCopyAndPay" data-nexus-payload='["${loanId}", "${p.id}", "${safeRef}", "${safeUrl}"]' class="w-full bg-white border border-emerald-200 text-emerald-800 p-3 rounded-xl font-black uppercase text-[9px] active:scale-95 text-left">${label}<span class="block text-[8px] font-mono text-slate-500 mt-1">${p.reference}</span></button>`;
                } else if (p.url) {
                    html += `<button type="button" data-nexus-action="nexusLoanPseRedirect" data-nexus-payload='["${loanId}", "${p.id}", "${safeUrl}"]' class="w-full bg-white border border-slate-200 text-slate-700 p-3 rounded-xl font-black uppercase text-[9px] active:scale-95 text-left"><i class="fa-solid fa-building-columns mr-1"></i>${label}</button>`;
                }
            });

            if (!html) {
                html = '<p class="text-center text-[10px] font-bold text-slate-400 py-4 uppercase">No hay enlaces PSE. Crea uno abajo.</p>';
            }
            actions.innerHTML = html;
            nexusShowModalInstant(mod);
        }

        function loanUsePseLinkForDebt(loanId, pseLinkId) {
            nexusBindPseLinkToLoan(loanId, pseLinkId);
            const loan = (state.loans || []).find(l => l.id === loanId);
            if (loan) loan.pseLinkId = pseLinkId;
            const pseSel = $id('fl-pse-link');
            if (pseSel) pseSel.value = pseLinkId;
        }

        function editLoan(id) {
            const l = state.loans.find(x => x.id === id); if(!l) return;
            const m = $id('fab-menu'); if(m && !m.classList.contains('hidden')) toggleFab();
            if(l.id.startsWith('pend_')) {
                const mod = $id('pending-modal'); if(mod) nexusShowModalInstant(mod);
                if($id('fp-id')) $id('fp-id').value = l.id;
                $id('fp-name').value = l.name.replace('⚡ ', '');
                const amtEl = $id('fp-amount'); amtEl.value = fmt(l.total); amtEl.dataset.raw = l.total;
                $id('fp-date').value = l.date.split('T')[0];
                if($id('fp-priority')) $id('fp-priority').value = l.priority || 'medium';
                if($id('fp-currency')) $id('fp-currency').value = l.currency || state.activeCurrency;
            } else {
                const mod = $id('loan-modal'); if(mod) nexusShowModalInstant(mod);
                if($id('fl-id')) $id('fl-id').value = l.id;
                $id('fl-name').value = l.name;
                const amtEl = $id('fl-amount'); amtEl.value = fmt(l.total); amtEl.dataset.raw = l.total;
                const rateEl = $id('fl-rate'); rateEl.value = l.rate; rateEl.dataset.raw = l.rate;
                const termEl = $id('fl-term'); termEl.value = l.term; termEl.dataset.raw = l.term;
                $id('fl-date').value = l.date.split('T')[0];
                if($id('fl-currency')) $id('fl-currency').value = l.currency || state.activeCurrency;
                populateLoanCreditorSelects();
                populateLoanVaultSelect();
                if ($id('fl-creditor-type')) $id('fl-creditor-type').value = l.creditorType || 'terceros';
                if ($id('fl-terceros-acc')) $id('fl-terceros-acc').value = l.tercerosAccId || '';
                if ($id('fl-pse-link')) $id('fl-pse-link').value = l.pseLinkId || '';
                const vSel = $id('fl-loan-vault'); if (vSel) vSel.value = l.sharedVaultId || '';
                const link = l.pseLinkId ? (state.pseLinks || []).find(p => p.id === l.pseLinkId) : null;
                if ($id('fl-credit-ref')) $id('fl-credit-ref').value = l.paymentNic || (link && link.reference) || '';
                toggleLoanCreditorFields();
            }
        }

        function openLoanForm() {
            const m = $id('fab-menu'); if(m && !m.classList.contains('hidden')) toggleFab();
            const mod = $id('loan-modal'); if(!mod) return;
            nexusShowModalInstant(mod);
            const loanScroll = mod.querySelector('.nexus-modal-scroll-body');
            if (loanScroll) loanScroll.scrollTop = 0;
            if($id('fl-id')) $id('fl-id').value = '';
            $id('fl-name').value = '';
            const amtEl = $id('fl-amount'); amtEl.value = ''; amtEl.dataset.raw = '';
            const rateEl = $id('fl-rate'); rateEl.value = ''; rateEl.dataset.raw = '';
            const termEl = $id('fl-term'); termEl.value = ''; termEl.dataset.raw = '';
            $id('fl-date').value = new Date().toISOString().split('T')[0];
            if($id('fl-currency')) $id('fl-currency').value = state.activeCurrency === 'GLOBAL' ? state.settings.baseCurrency : state.activeCurrency;
            populateLoanCreditorSelects();
            populateLoanVaultSelect();
            if ($id('fl-creditor-type')) $id('fl-creditor-type').value = 'terceros';
            if ($id('fl-terceros-acc')) $id('fl-terceros-acc').value = '';
            if ($id('fl-pse-link')) $id('fl-pse-link').value = '';
            if ($id('fl-credit-ref')) $id('fl-credit-ref').value = '';
            toggleLoanCreditorFields();
        }
        
        function closeLoanForm() { nexusHideModalInstant($id('loan-modal')); }
        
        function saveLoan(e) {
            e.preventDefault(); const idEl = $id('fl-id'); const id = idEl ? idEl.value : ''; const name = $id('fl-name').value; const amount = parseFloat($id('fl-amount').dataset.raw) || 0; const rate = parseFloat($id('fl-rate').dataset.raw) || 0; const term = parseInt($id('fl-term').dataset.raw) || 0; const date = $id('fl-date').value;
            if(!name || amount <= 0 || term <= 0) return alert("Monto y plazo mayores a cero.");
            const currency = $id('fl-currency') ? $id('fl-currency').value : (state.activeCurrency === 'GLOBAL' ? state.settings.baseCurrency : state.activeCurrency);
            const creditorType = $id('fl-creditor-type') ? $id('fl-creditor-type').value : 'terceros';
            const tercerosAccId = ($id('fl-terceros-acc') && $id('fl-terceros-acc').value) ? $id('fl-terceros-acc').value : null;
            let pseLinkId = (creditorType === 'banco' && $id('fl-pse-link') && $id('fl-pse-link').value) ? $id('fl-pse-link').value : null;
            const creditNic = ($id('fl-credit-ref') && creditorType === 'banco') ? String($id('fl-credit-ref').value || '').trim() : '';
            const vaultSel = $id('fl-loan-vault');
            let sharedVaultId = vaultSel && vaultSel.value ? vaultSel.value : '';
            if (sharedVaultId) {
                const rid = nexusResolveP2pVaultRemoteId('loans', sharedVaultId);
                if (rid) sharedVaultId = rid;
            }
            const creditorPatch = {
                creditorType,
                tercerosAccId: creditorType === 'terceros' ? tercerosAccId : null,
                pseLinkId: creditorType === 'banco' ? pseLinkId : null,
                paymentNic: creditorType === 'banco' ? creditNic : ''
            };
            if(id) {
                const l = state.loans.find(x => x.id === id);
                if(l) {
                    l.name = name; l.total = amount; l.rate = rate; l.term = term;
                    l.date = new Date(`${date}T12:00:00`).toISOString(); l.currency = currency;
                    Object.assign(l, creditorPatch);
                    if (sharedVaultId) l.sharedVaultId = sharedVaultId; else delete l.sharedVaultId;
                    nexusTouchEntityUpdatedAt(l, 'loan');
                    if (creditorType === 'banco') nexusUpsertLoanPseFromForm(l);
                    else if (pseLinkId) nexusBindPseLinkToLoan(l.id, pseLinkId);
                    nexusPushSharedLoanIfNeeded(l);
                }
            } else {
                const newLoan = {
                    id: 'loan_' + Date.now(), name, total: amount, balance: amount, rate, term,
                    paidQuotas: 0, date: new Date(`${date}T12:00:00`).toISOString(),
                    currency: currency, isBNPL: false, ...creditorPatch
                };
                if (sharedVaultId) newLoan.sharedVaultId = sharedVaultId;
                nexusTouchEntityUpdatedAt(newLoan, 'loan');
                state.loans.push(newLoan);
                if (creditorType === 'banco') nexusUpsertLoanPseFromForm(newLoan);
                else if (pseLinkId) nexusBindPseLinkToLoan(newLoan.id, pseLinkId);
                if (window.__nexusPseLinkForLoanName && !newLoan.pseLinkId) {
                    const pendingLink = (state.pseLinks || []).find(p => p.name === window.__nexusPseLinkForLoanName);
                    if (pendingLink) nexusBindPseLinkToLoan(newLoan.id, pendingLink.id);
                }
                nexusPushSharedLoanIfNeeded(newLoan);
            }
            window.__nexusPseLinkForLoanName = null;
            saveState({ cloudHint: { reason: 'loans' } }); updateDashboard(); closeLoanForm();
            const lv = $id('loans-view-list'); const ld = $id('loans-view-detail'); if(lv) lv.classList.remove('hidden'); if(ld) ld.classList.add('hidden');
            renderLoansList();
        }

        function openPendingForm() { const m = $id('fab-menu'); if(m && !m.classList.contains('hidden')) toggleFab(); const mod = $id('pending-modal'); if(!mod) return; nexusShowModalInstant(mod); if($id('fp-id')) $id('fp-id').value = ''; $id('fp-name').value = ''; const amtEl = $id('fp-amount'); amtEl.value = ''; amtEl.dataset.raw = ''; $id('fp-date').value = new Date().toISOString().split('T')[0]; if($id('fp-priority')) $id('fp-priority').value = 'medium'; if($id('fp-currency')) $id('fp-currency').value = state.activeCurrency === 'GLOBAL' ? state.settings.baseCurrency : state.activeCurrency; }
        
        function closePendingForm() { nexusHideModalInstant($id('pending-modal')); }
        
        function savePending(e) {
            e.preventDefault(); const idEl = $id('fp-id'); const id = idEl ? idEl.value : ''; const name = $id('fp-name').value; const amount = parseFloat($id('fp-amount').dataset.raw) || 0; const date = $id('fp-date').value; const priority = $id('fp-priority') ? $id('fp-priority').value : 'medium';
            if (!nexusRequireFormFields({ name, amount, date })) return;
            const targetDate = new Date(`${date}T12:00:00`);
            const currency = $id('fp-currency') ? $id('fp-currency').value : (state.activeCurrency === 'GLOBAL' ? state.settings.baseCurrency : state.activeCurrency);
            if(id) {
                const p = state.loans.find(x => x.id === id);
                if(p) { p.name = name.startsWith('⚡') ? name : '⚡ ' + name; p.total = amount; p.date = targetDate.toISOString(); p.priority = priority; p.currency = currency; }
            } else {
                const pendId = 'pend_' + Date.now();
                const newPending = { id: pendId, name: '⚡ ' + name, total: amount, balance: amount, rate: 0, term: 1, paidQuotas: 0, date: targetDate.toISOString(), currency: currency, isBNPL: false, priority: priority };
                state.loans.push(newPending);
                
                // Creación automática de recordatorio (Tarea) interconectado
                if(!state.tasks) state.tasks = [];
                const taskId = 'task_' + pendId;
                const taskTitle = 'Pagar: ' + name.replace('⚡ ', '');
                const taskDesc = `Pago pendiente generado automáticamente por ${fmt(amount, currency)}`;
                
                state.tasks.push({
                    id: taskId,
                    title: taskTitle,
                    description: taskDesc,
                    date: date,
                    timeAlarm: '09:00', // Alarma predeterminada a las 9:00 AM
                    priority: priority,
                    completed: false,
                    alarmTriggered: false,
                    createdAt: new Date().toISOString()
                });
                
                // Disparo de la notificación Push en el contenedor iOS
                if (isNativeIosApp()) {
                    postNativeScheduledAlarm({
                        id: taskId,
                        title: "Recordatorio: " + taskTitle,
                        body: taskDesc,
                        date: date,
                        time: '09:00',
                        priority: priority,
                        fireAt: buildTaskFireDate(date, '09:00') || new Date()
                    });
                }
            }
            saveState({ cloudHint: { reason: 'loans' } }); updateDashboard(); closePendingForm();
            const lv = $id('loans-view-list'); const ld = $id('loans-view-detail'); if(lv) lv.classList.remove('hidden'); if(ld) ld.classList.add('hidden');
            renderLoansList();
            if(typeof renderTasksTab === 'function') renderTasksTab(); // Refrescar vista de tareas en segundo plano
        }

        function payLoanQuota(id) {
            const l = state.loans.find(x => x.id === id); if(!l) return;
            const acc = state.accounts.find(a => a.type === 'liquid' && a.currency === l.currency) || getActiveAccounts().find(a => a.type === 'liquid');
            if(!acc) return alert("Necesitas cuenta líquida con saldo para debitar la cuota.");
            if((l.paidQuotas || 0) >= l.term) return alert("Deuda saldada.");
            const sched = nexusCalcLoanFrenchSchedule(l);
            const quotaAmt = sched.A;
            l.paidQuotas = (l.paidQuotas || 0) + 1;
            l.balance = nexusLoanRemainingBalance(l);
            if (l.isCC && l.cardId) nexusRecalcCreditCardBalanceFromLoans(l.cardId);
            acc.balance -= quotaAmt;
            const newTx = buildTransactionSchema({ type: 'expense', amount: quotaAmt, cat: l.isCC ? '💳 Abono TC' : '💳 Pago Deuda', accId: acc.id, date: new Date().toISOString(), note: `[Abono] ${l.name} (${l.paidQuotas}/${l.term})`, currency: l.currency, costType: 'fixed' });
            
            // Inyectar trazabilidad de autor
            if (userProfile && userProfile.name) newTx.createdBy = userProfile.name;
            
            state.tx.push(newTx); saveCloudTx(newTx);
            nexusTouchEntityUpdatedAt(l, 'loan');
            nexusPushSharedLoanIfNeeded(l);
            saveState({ cloudHint: { reason: 'tx', tx: newTx } }); updateDashboard(); switchTab('loans'); alert(`✅ Cuota pagada correctamente.`);
        }

        function saveCCPurchase(e, forceOverdraft = false) {
            if(e && typeof e.preventDefault === 'function') e.preventDefault(); const cardId = $id('cc-p-cardid').value; const desc = $id('cc-p-desc').value.trim(); const amount = parseFloat($id('cc-p-amount').dataset.raw) || 0; const term = parseInt($id('cc-p-term').dataset.raw) || 0; const date = $id('cc-p-date').value;
            if(!amount || amount <= 0 || term <= 0) return alert("Monto y plazo mayor a cero.");
            const card = state.accounts.find(a => a.id === cardId); if(!card) return; const available = (card.limit || 0) - card.balance;
            if(amount > available && !forceOverdraft) {
                triggerUIConfirm(`⚠️ Excede cupo disponible. ¿Sobregiro?`, 'cc_purchase_overdraft');
                return;
            }
            const txId = 'tx_' + Date.now();
            const newTx = { id: txId, type: 'expense', amount: amount, cat: `[Crédito] ${desc}`, accId: cardId, date: new Date(date).toISOString(), note: `[TC] ${desc}`, currency: card.currency, isCCPurchase: true, ccPurchaseNoBalance: true };
            if (userProfile && userProfile.name) newTx.createdBy = userProfile.name;
            
            state.tx.push(newTx); saveCloudTx(newTx);
            state.loans.push({ id: 'CC_' + Date.now(), name: `${desc} (${card.name})`, total: amount, balance: amount, original_total: amount, rate: card.rate || 0, term: term, paidQuotas: 0, isBNPL: false, isCC: true, cardId: cardId, purchaseTxId: txId, date: new Date(date).toISOString(), currency: card.currency });
            nexusRecalcCreditCardBalanceFromLoans(cardId);
            saveState({ cloudHint: { reason: 'tx', tx: newTx } }); closeCCPurchaseModal(); renderAccountsTab(); updateDashboard();
        }
        
        function handleParentCategoryChange() {
            const sel = $id('f-cat-parent-select');
            const parentCont = $id('new-cat-parent-container');
            const subContainer = $id('sub-cat-container');
            const subSel = $id('f-cat-sub-select');
            const newSubCont = $id('new-cat-sub-container');
            
            if (!sel || !parentCont || !subContainer || !subSel || !newSubCont) return;
            
            if (sel.value === 'ADD_NEW_CAT') {
                parentCont.classList.remove('hidden');
                $id('f-cat-parent').focus();
                $id('f-cat-parent').value = '';
                const bucket = nexusCatKindForTxType($id('f-type')?.value || 'expense');
                nexusSetCatIconPicker('tx-parent', nexusCatIconDefault(bucket));
                nexusToggleCatIconPalette('tx-parent', false);
                
                subContainer.classList.add('hidden');
                newSubCont.classList.add('hidden');
            } else if (sel.value !== '') {
                parentCont.classList.add('hidden');
                
                // Conexión con el nuevo Diccionario Global SSoT y Auto-Sanación
                const formType = $id('f-type') ? $id('f-type').value : 'expense';
                const cats = getUserCategoryLabels(nexusCatKindForTxType(formType));
                const parent = sel.value;
                const subs = new Set();
                
                cats.forEach(c => {
                    const m = c.match(/\[(.*?)\]\s*(.*)/);
                    if (m && m[1] === parent && m[2]) subs.add(m[2]);
                });
                
                subContainer.classList.remove('hidden');
                subSel.classList.remove('hidden');
                newSubCont.classList.add('hidden');
                $id('f-cat-sub').value = '';
                
                subSel.innerHTML = '<option value="">-- Seleccionar Subcategoría --</option>';
                if (subs.size > 0) {
                    subs.forEach(s => { subSel.innerHTML += `<option value="${s}">${s}</option>`; });
                } else {
                    subSel.innerHTML += `<option value="" disabled>-- Sin Subcategorías --</option>`;
                }
                subSel.innerHTML += `<option value="ADD_NEW_SUB" class="font-bold text-indigo-600">➕ Agregar subcategoría...</option>`;
                subSel.innerHTML += `<option value="EDIT_PARENT" class="font-bold text-amber-600">✏️ Edición de enlace de categoría padre</option>`;
            } else {
                parentCont.classList.add('hidden');
                subContainer.classList.add('hidden');
            }
        }

        function handleSubCategoryChange() {
            const sel = $id('f-cat-sub-select');
            const newSubCont = $id('new-cat-sub-container');
            const inp = $id('f-cat-sub');
            if (!sel || !newSubCont || !inp) return;

            if (sel.value === 'ADD_NEW_SUB') {
                newSubCont.classList.remove('hidden');
                inp.focus();
                inp.value = '';
                const parentVal = $id('f-cat-parent-select')?.value;
                const bucket = nexusCatKindForTxType($id('f-type')?.value || 'expense');
                if (parentVal) nexusSetCatIconPicker('tx-sub', nexusResolveCatIcon(bucket, parentVal));
                nexusToggleCatIconPalette('tx-sub', false);
            } else if (sel.value === 'EDIT_PARENT') {
                newSubCont.classList.add('hidden');
                const parentSel = $id('f-cat-parent-select');
                const currentParent = parentSel ? parentSel.value : '';
                if(!currentParent || currentParent === 'ADD_NEW_CAT') return;
                
                // Prompt asíncrono In-DOM que previene el freeze en iOS
                triggerUIPrompt(`Editar enlace/nombre de la Categoría Padre:`, currentParent, 'edit_parent_cat', currentParent);
                sel.value = ''; // Reseteamos el selector para evitar bloqueos visuales
            } else {
                newSubCont.classList.add('hidden');
            }
        }

        function confirmNewParentCategory() {
            const inp = $id('f-cat-parent');
            const val = inp.value.trim();
            if (!val) return alert("Escribe un nombre para la categoría.");
            const bucket = nexusCatKindForTxType($id('f-type')?.value || 'expense');
            nexusEnsureCategoryBuckets();
            
            if(!state.catParents[bucket].includes(val)) {
                state.catParents[bucket].push(val);
                const parentIcon = nexusNormalizeCatIcon($id('f-cat-parent-icon')?.value, nexusCatIconDefault(bucket));
                nexusSetCatIcon(bucket, val, parentIcon);
                nexusPersistCloudConfig(['categories', 'catParents', 'catIcons', 'core'], 'settings');
                if(typeof updateCatManageView === 'function') updateCatManageView();
                if(typeof updateDbCatFilter === 'function') updateDbCatFilter();
            }
            
            const selP = $id('f-cat-parent-select');
            selP.innerHTML = '<option value="">-- Seleccionar Categoría --</option>';
            state.catParents[bucket].forEach(p => { selP.innerHTML += `<option value="${p}">${p}</option>`; });
            selP.innerHTML += `<option value="ADD_NEW_CAT" class="font-bold text-indigo-600">➕ Agregar categoría...</option>`;
            
            selP.value = val;
            handleParentCategoryChange();
        }

        function confirmNewSubCategory() {
            const inp = $id('f-cat-sub');
            const subVal = inp.value.trim();
            const parentVal = $id('f-cat-parent-select').value;
            
            if (!subVal) return alert("Escribe un nombre para la subcategoría.");
            if (!parentVal || parentVal === 'ADD_NEW_CAT') return;
            const fullCatName = `[${parentVal}] ${subVal}`;
            
            const bucket = nexusCatKindForTxType($id('f-type')?.value || 'expense');
            nexusEnsureCategoryBuckets();
            
            if(!state.categories[bucket].includes(fullCatName)) {
                state.categories[bucket].push(fullCatName);
                const parentIcon = nexusResolveCatIcon(bucket, parentVal);
                const subIconRaw = $id('f-cat-sub-icon')?.value;
                nexusSetCatIcon(bucket, fullCatName, subIconRaw ? nexusNormalizeCatIcon(subIconRaw, parentIcon) : parentIcon);
                nexusPersistCloudConfig(['categories', 'catParents', 'catIcons', 'core'], 'settings');
                if(typeof updateCatManageView === 'function') updateCatManageView();
                if(typeof updateDbCatFilter === 'function') updateDbCatFilter();
            }
            
            handleParentCategoryChange();
            $id('f-cat-sub-select').value = subVal;
            handleSubCategoryChange();
        }

        function toggleRecurFields() { const isR = $id('f-is-recur').checked; const flds = $id('recur-fields'); if(isR) flds.classList.remove('hidden'); else flds.classList.add('hidden'); }

        function reconcilePastAfterpay(forceConfirmed = false) {
            if(!forceConfirmed) {
                triggerUIConfirm("¿Conciliar automáticamente cuotas pasadas? Se marcarán como pagadas a cero (históricas) sin afectar tu liquidez actual.", 'reconcile_afterpay');
                return;
            }
            let updated = 0; const now = new Date(); now.setHours(0,0,0,0);
            const apPayDay = state.settings.apPayDay !== undefined ? parseInt(state.settings.apPayDay) : 5;
            
            state.tx.forEach(tx => {
                if (tx.type === 'afterpay' && (tx.apPaid || 0) < (tx.apQuotas || 4)) {
                    const quotas = tx.apQuotas || 4;
                    const baseDate = getSafeDate(tx.date);
                    const stD = tx.apFreq === 'fortnightly' ? 14 : 7;
                    let pastQuotas = 0;
                    for(let i = 0; i < quotas; i++) {
                        let d = new Date(baseDate.getTime());
                        if (tx.apFreq === 'monthly') { d.setMonth(d.getMonth() + i); } else { d.setDate(d.getDate() + (i * stD)); }
                        
                        if (i > 0) {
                            let currentDay = d.getDay();
                            let dist = apPayDay - currentDay;
                            if (dist < 0) dist += 7;
                            d.setDate(d.getDate() + dist);
                        }
                        
                        d.setHours(12, 0, 0, 0);
                        if (d < now) pastQuotas++;
                    }
                    if (pastQuotas > (tx.apPaid || 0)) {
                        tx.apPaid = pastQuotas;
                        nexusTouchEntityUpdatedAt(tx, 'tx');
                        saveCloudTx(tx);
                        updated++;
                    }
                }
            });
            if (updated > 0) { saveState({ cloudHint: { reason: 'tx' } }); updateDashboard(); if(state.activeTab === 'afterpay') renderAfterpay(); alert(`✅ Se conciliarion compras pasadas en ${updated} contrato(s).`); } else { alert("No hay cuotas pasadas pendientes de conciliar."); }
        }

        const NEXUS_PURCHASE_TYPE_HINTS = {
            contado: 'Pago inmediato desde cuenta corriente, débito o efectivo. Puedes activar gasto recurrente.',
            credit: 'Compra a crédito: indica cuotas para proyectar pagos, interés y cronograma en Deudas y Agenda.',
            rotativo: 'Cargo al rotativo o línea de sobregiro. El monto suma al saldo endeudado de la cuenta.',
            virtual: 'Compra en app BNPL o billetera virtual. Positivo = a favor; negativo = deuda en la app.'
        };
        const NEXUS_PURCHASE_TYPE_LABELS = {
            contado: 'Contado / Débito',
            credit: 'Tarjeta de crédito',
            rotativo: 'Rotativo / Sobregiro',
            virtual: 'App virtual (BNPL)'
        };
        const NEXUS_PURCHASE_TYPE_ICONS = {
            contado: 'fa-wallet text-indigo-500',
            credit: 'fa-credit-card text-rose-500',
            rotativo: 'fa-arrows-rotate text-amber-500',
            virtual: 'fa-mobile-screen text-purple-500'
        };

        function nexusPurchaseTypeFromAccount(acc) {
            if (!acc) return 'contado';
            if (acc.type === 'credit') return 'credit';
            if (acc.type === 'rotativo') return 'rotativo';
            if (acc.type === 'virtual') return 'virtual';
            return 'contado';
        }

        /** Muestra/oculta bloques del formulario según cuenta seleccionada (solo gastos). */
        function applyExpensePurchaseTypeUI(refreshAccounts) {
            const txTypeEl = $id('f-type');
            const ptCont = $id('expense-purchase-type-container');
            const ptSel = $id('f-purchase-type');
            if (!txTypeEl || !ptCont || !ptSel) return;

            if (txTypeEl.value !== 'expense') {
                ptCont.classList.add('hidden');
                return;
            }
            ptCont.classList.remove('hidden');

            const accId = $id('f-account') ? $id('f-account').value : '';
            const acc = accId ? (state.accounts || []).find(a => a.id === accId) : null;
            const pType = nexusPurchaseTypeFromAccount(acc);
            ptSel.value = pType;

            const badgeLbl = $id('expense-purchase-label');
            const badgeIcon = $id('expense-purchase-icon');
            if (badgeLbl) badgeLbl.textContent = NEXUS_PURCHASE_TYPE_LABELS[pType] || pType;
            if (badgeIcon) {
                badgeIcon.className = 'fa-solid ' + (NEXUS_PURCHASE_TYPE_ICONS[pType] || 'fa-wallet text-indigo-500');
            }

            const hint = $id('expense-purchase-hint');
            if (hint) {
                const msg = NEXUS_PURCHASE_TYPE_HINTS[pType] || '';
                const isNewTx = !($id('f-id') && String($id('f-id').value || '').trim());
                hint.textContent = msg;
                hint.classList.toggle('hidden', !msg || isNewTx);
            }

            const accLbl = $id('f-account') ? $id('f-account').previousElementSibling : null;
            const accLabels = {
                contado: 'Cuenta / Medio',
                credit: 'Tarjeta de crédito',
                rotativo: 'Cuenta rotativo',
                virtual: 'App / Billetera virtual'
            };
            if (accLbl) accLbl.innerText = accLabels[pType] || 'Cuenta';

            const costMod = $id('cost-type-module');
            const ccCont = $id('cc-term-container');
            const recCont = $id('recur-container');

            if (costMod) {
                costMod.classList.remove('hidden');
                costMod.style.display = 'block';
                costMod.style.order = '6';
            }
            if (ccCont) {
                const showCc = pType === 'credit';
                ccCont.classList.toggle('hidden', !showCc);
                ccCont.style.display = showCc ? 'block' : 'none';
                ccCont.style.order = '7';
            }
            if (recCont) {
                const txId = $id('f-id') ? String($id('f-id').value || '').trim() : '';
                const editingTx = txId ? (state.tx || []).find(t => t.id === txId) : null;
                const showRecur = pType === 'contado' && !!(editingTx && editingTx.isRecurrent);
                recCont.classList.toggle('hidden', !showRecur);
                recCont.style.display = showRecur ? 'block' : 'none';
                recCont.style.order = '9';
            }

            if (refreshAccounts) populateFormAccounts();
        }
        window.applyExpensePurchaseTypeUI = applyExpensePurchaseTypeUI;

        function populateFormAccounts() {
            const type = $id('f-type').value;
            const curS = $id('f-currency');
            const aS = $id('f-account'); const accCont = $id('account-container');
            const aSDest = $id('f-account-dest');
            const lbl = $id('f-currency-label');
            
            // Siempre mostrar las cuentas para permitir al usuario seleccionar la fuente del primer abono
            if(accCont) accCont.classList.remove('hidden'); aS.required = true; aS.innerHTML = '';
            if(curS) curS.disabled = true; // Se bloquea visualmente porque la cuenta dictará la divisa (o Afterpay lo fijará global)
            
            if(type === 'afterpay') {
                const apCurr = state.settings.apCurrency || 'AUD';
                if(curS) curS.value = apCurr;
                if(lbl) lbl.innerText = apCurr;
            } else {
                if(aSDest) aSDest.innerHTML = '';
            }
            
            let accs = state.accounts || [];

            if (!accs.length) {
                aS.innerHTML = `<option value="">— Crea una cuenta en Cuentas —</option>`;
                setTimeout(() => checkTxAccount(), 50);
                return;
            }
            
            // Agrupamos visualmente por divisa para fácil lectura en el Select
            const groups = {};
            accs.forEach(a => {
                const c = a.currency || state.settings.baseCurrency || 'COP';
                if (!groups[c]) groups[c] = [];
                groups[c].push(a);
            });

            for (const curr in groups) {
                aS.innerHTML += `<optgroup label="--- ${nexusUi('Bóvedas en')} ${curr} ---">`;
                groups[curr].forEach(a => { aS.innerHTML += `<option value="${a.id}">${a.name}</option>`; });
                aS.innerHTML += `</optgroup>`;
            }

            // Disparamos la actualización asíncrona para sincronizar cuenta destino y labels
            setTimeout(() => checkTxAccount(), 50);
        }

        function checkTxAccount() {
            const accId = $id('f-account').value;
            const acc = state.accounts.find(a => a.id === accId);
            
            const curS = $id('f-currency');
            const lbl = $id('f-currency-label');
            const type = $id('f-type').value;

            // Auto-ajuste de divisa. Si es Afterpay, fuerza su moneda matriz. Si es otra, hereda la de la cuenta.
            if (type === 'afterpay') {
                const apCurr = state.settings.apCurrency || 'AUD';
                if(curS) curS.value = apCurr;
                if(lbl) lbl.innerText = apCurr;
            } else if (acc) {
                const c = acc.currency || state.settings.baseCurrency || 'COP';
                if(curS) curS.value = c;
                if(lbl) lbl.innerText = c;
            }

            const ccCont = $id('cc-term-container');
            if (type === 'expense') {
                applyExpensePurchaseTypeUI(false);
            } else if (ccCont) {
                ccCont.classList.add('hidden');
                ccCont.style.display = 'none';
            }

            // Filtrar cuentas destino para Transferencias a la misma divisa de origen
            const aSDest = $id('f-account-dest');
            if (type === 'transfer' && aSDest && acc) {
                const prevVal = aSDest.value;
                aSDest.innerHTML = '';
                const currentAccCurr = acc.currency || state.settings.baseCurrency || 'COP';
                const sameCurAccs = state.accounts.filter(a => (a.currency || state.settings.baseCurrency || 'COP') === currentAccCurr);

                sameCurAccs.forEach(a => { aSDest.innerHTML += `<option value="${a.id}">${a.name}</option>`; });

                if (sameCurAccs.some(a => a.id === prevVal)) {
                    aSDest.value = prevVal;
                } else if (sameCurAccs.length > 1) {
                    const diff = sameCurAccs.find(a => a.id !== acc.id);
                    if (diff) aSDest.value = diff.id;
                }
            }
        }
        // Función maestra restaurada e integrada con Proyectos y Afterpay
        function openForm(type, txId = null, projectId = null) {
            const m = $id('fab-menu'); if(m && !m.classList.contains('hidden')) toggleFab();
            const mod = $id('tx-modal'); if(!mod) return; nexusShowModalInstant(mod);
            mod.setAttribute('data-tx-form', type === 'expense' ? 'expense' : (type === 'income' ? 'income' : type || ''));
            const txScroll = mod.querySelector('.nexus-modal-scroll-body');
            if (txScroll) txScroll.scrollTop = 0;
            $id('f-id').value = txId || ''; $id('f-type').value = type;
            const txProjEl = $id('f-tx-proj-id');
            if (txProjEl) txProjEl.value = projectId || '';
            const fT = $id('form-title'); const titlesMap = { 'income': 'Ingreso (+)', 'expense': 'Gasto (-)', 'transfer': 'Transferencia', 'afterpay': 'Afterpay' }; fT.innerText = txId ? `Editar ${titlesMap[type]}` : `Nuevo ${titlesMap[type]}`;
            
            const fNoteLbl = $id('f-note-label');
            if (fNoteLbl) fNoteLbl.innerText = type === 'afterpay' ? 'Descripción de la Transacción' : 'Nota / Descripción';

            const curS = $id('f-currency');
            if(curS) {
                curS.innerHTML = '';
                CURRENCIES.forEach(c => curS.innerHTML += `<option value="${c}">${c}</option>`);
                curS.value = state.activeCurrency === 'GLOBAL' ? (state.settings.baseCurrency || 'COP') : state.activeCurrency;
            }

            const catMod = $id('category-module');
            if (catMod) {
                catMod.classList.remove('hidden');
            }

            const amtEl = $id('f-amount');
            const lblWrap = $id('f-currency-label-wrapper');
            const caCont = $id('currency-account-container');
            const destCont = $id('account-dest-container');
            const accLbl = $id('f-account') ? $id('f-account').previousElementSibling : null;
            
            const apFreqC = $id('ap-freq-container');
            const dtCont = $id('datetime-container');
            const dateLbl = $id('lbl-date-main');
            
            $id('note-container').style.order = '1';
            $id('amount-container').style.order = '2';

            if (type === 'afterpay') {
                if(caCont) { caCont.classList.remove('hidden'); caCont.style.display = 'block'; caCont.style.order = '3'; }
                if(accLbl) accLbl.innerText = 'Cuenta (1er abono)';
                if(destCont) { destCont.classList.add('hidden'); destCont.style.display = 'none'; }
                if(catMod) { catMod.classList.remove('hidden'); catMod.style.display = 'block'; catMod.style.order = '4'; }
                
                if (apFreqC) { apFreqC.classList.remove('hidden'); apFreqC.style.display = 'block'; }
                if (dtCont) { dtCont.style.order = '6'; }
                if (dateLbl) { dateLbl.innerText = 'Fecha de Compra'; dateLbl.classList.replace('text-slate-400', 'text-teal-600'); }
                
                if(typeof setApMode === 'function') setApMode('new');
                
                if(amtEl) amtEl.dataset.type = 'currency';
                if(lblWrap) lblWrap.classList.remove('hidden');
                
                const costMod = $id('cost-type-module'); if(costMod) { costMod.classList.add('hidden'); costMod.style.display = 'none'; }
                const ccCont = $id('cc-term-container'); if(ccCont) { ccCont.classList.add('hidden'); ccCont.style.display = 'none'; }
                const recCont = $id('recur-container'); if(recCont) { recCont.classList.add('hidden'); recCont.style.display = 'none'; }
                
            } else if (type === 'transfer') {
                if(caCont) { caCont.classList.remove('hidden'); caCont.style.display = 'block'; caCont.style.order = '3'; }
                if(accLbl) accLbl.innerText = 'Cuenta Origen';
                if(destCont) { destCont.classList.remove('hidden'); destCont.style.display = 'block'; destCont.style.order = '4'; }
                if(catMod) { catMod.classList.add('hidden'); catMod.style.display = 'none'; }
                
                if(apFreqC) { apFreqC.classList.add('hidden'); apFreqC.style.display = 'none'; }
                
                if(dtCont) {
                    dtCont.classList.remove('hidden'); dtCont.style.display = 'grid'; dtCont.style.order = '5';
                    if(dateLbl) dateLbl.innerText = 'Fecha';
                }
                
                if(amtEl) amtEl.dataset.type = 'currency';
                if(lblWrap) lblWrap.classList.remove('hidden');
                const costMod = $id('cost-type-module'); if(costMod) { costMod.classList.add('hidden'); costMod.style.display = 'none'; }
                const ccCont = $id('cc-term-container'); if(ccCont) { ccCont.classList.add('hidden'); ccCont.style.display = 'none'; }
                const recCont = $id('recur-container'); if(recCont) { recCont.classList.add('hidden'); recCont.style.display = 'none'; }
                
            } else {
                const ptCont = $id('expense-purchase-type-container');
                if (type === 'expense' && ptCont) {
                    ptCont.classList.remove('hidden');
                    ptCont.style.order = '2';
                    if ($id('f-purchase-type')) $id('f-purchase-type').value = 'contado';
                    $id('amount-container').style.order = '3';
                } else if (ptCont) {
                    ptCont.classList.add('hidden');
                }
                if(caCont) { caCont.classList.remove('hidden'); caCont.style.display = 'block'; caCont.style.order = type === 'expense' ? '4' : '3'; }
                if(accLbl) accLbl.innerText = 'Cuenta';
                if(destCont) { destCont.classList.add('hidden'); destCont.style.display = 'none'; }
                if(catMod) { catMod.classList.remove('hidden'); catMod.style.display = 'block'; catMod.style.order = type === 'expense' ? '5' : '4'; }
                
                if(apFreqC) { apFreqC.classList.add('hidden'); apFreqC.style.display = 'none'; }
                
                if(dtCont) {
                    dtCont.classList.remove('hidden'); dtCont.style.display = 'grid'; dtCont.style.order = type === 'expense' ? '8' : '5';
                    if(dateLbl) dateLbl.innerText = 'Fecha';
                }
                const recCont = $id('recur-container');
                if(recCont) {
                    if (type === 'expense') { recCont.classList.add('hidden'); recCont.style.display = 'none'; }
                    else { recCont.classList.remove('hidden'); recCont.style.order = '8'; }
                }
                const ccContInit = $id('cc-term-container');
                if (ccContInit && type === 'expense') { ccContInit.classList.add('hidden'); ccContInit.style.display = 'none'; }
            }
            
            const selP = $id('f-cat-parent-select');
            if (selP) {
                selP.innerHTML = '<option value="">-- Seleccionar Categoría --</option>';
                if(!state.catParents) state.catParents = JSON.parse(JSON.stringify(CAT_PARENTS));
                nexusEnsureCategoryBuckets();
                const bucket = nexusCatKindForTxType(type);
                const parents = state.catParents[bucket] || [];
                parents.forEach(p => { selP.innerHTML += `<option value="${p}">${p}</option>`; });
                selP.innerHTML += `<option value="ADD_NEW_CAT" class="font-bold text-indigo-600">➕ Agregar categoría...</option>`;
                selP.classList.remove('hidden');
            }
            if($id('new-cat-parent-container')) $id('new-cat-parent-container').classList.add('hidden');
            const subContainer = $id('sub-cat-container'); if(subContainer) subContainer.classList.add('hidden');
            const newSubCont = $id('new-cat-sub-container'); if(newSubCont) newSubCont.classList.add('hidden');
            
            const costMod = $id('cost-type-module');
            if (costMod && type !== 'expense') {
                if (type === 'income') costMod.classList.remove('hidden');
                else costMod.classList.add('hidden');
            }
            
            populateFormAccounts();
            
            if (type === 'afterpay') {
                const apFreq = $id('ap-freq-container');
                if (apFreq) apFreq.classList.remove('hidden');
            }
            if (type === 'income') {
                const recContInc = $id('recur-container');
                if (recContInc) recContInc.classList.add('hidden');
            }
            
            const datalist = $id('note-suggestions');
            if (datalist) {
                datalist.innerHTML = '';
                const pastNotes = new Set();
                state.tx.filter(t => t.type === type && t.note).sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(t => pastNotes.add(t.note.trim()));
                pastNotes.forEach(n => { datalist.innerHTML += `<option value="${n}">`; });
            }

            const delTxBtn = $id('btn-delete-tx');
            if (delTxBtn) {
                if (txId) delTxBtn.classList.remove('hidden');
                else delTxBtn.classList.add('hidden');
            }

            if(!txId) {
                const txProjEl = $id('f-tx-proj-id');
                if (txProjEl && !projectId) txProjEl.value = '';
                const amtEl = $id('f-amount'); amtEl.value = ''; amtEl.dataset.raw = ''; $id('f-note').value = ''; $id('f-date').value = new Date().toISOString().split('T')[0]; const localNow = new Date(); if($id('f-time')) $id('f-time').value = String(localNow.getHours()).padStart(2, '0') + ':' + String(localNow.getMinutes()).padStart(2, '0');
                if($id('f-cat-parent')) { $id('f-cat-parent').value = ''; if(selP) selP.value = ''; }
                if($id('f-cat-sub')) $id('f-cat-sub').value = '';
                if($id('f-cost-type')) $id('f-cost-type').value = 'variable';
                const termEl = $id('f-cc-term'); if(termEl) { termEl.value = ''; termEl.dataset.raw = ''; }
                const zeroEl = $id('f-cc-zero'); if(zeroEl) zeroEl.checked = false;
                
                if($id('f-ap-quotas')) $id('f-ap-quotas').value = 4;
                if($id('f-ap-freq')) $id('f-ap-freq').value = nexusDefaultApFreq();
                if($id('f-ap-paid')) $id('f-ap-paid').value = '0';
                
                if($id('f-is-recur')) { $id('f-is-recur').checked = false; toggleRecurFields(); $id('f-recur-freq').value = 'monthly'; $id('f-recur-count').value = 12; }
            } else {
                const oldTx = state.tx.find(t => t.id === txId);
                if (oldTx) {
                    const txProjEl = $id('f-tx-proj-id');
                    if (txProjEl) txProjEl.value = oldTx.projectId || '';
                    const amtEl = $id('f-amount');
                    if (amtEl) {
                        const rawAmt = oldTx.original_amount || oldTx.amount;
                        amtEl.dataset.raw = rawAmt;
                        amtEl.value = (type === 'afterpay' || type === 'transfer') ? rawAmt : fmt(rawAmt, oldTx.original_currency || oldTx.currency);
                    }
                    if ($id('f-note')) $id('f-note').value = oldTx.note || '';
                    if (oldTx.date) {
                        const dObj = new Date(oldTx.date);
                        if ($id('f-date')) $id('f-date').value = dObj.toISOString().split('T')[0];
                        if ($id('f-time')) $id('f-time').value = String(dObj.getHours()).padStart(2, '0') + ':' + String(dObj.getMinutes()).padStart(2, '0');
                    }
                    
                    if (oldTx.cat && selP) {
                        const m = oldTx.cat.match(/\[(.*?)\]\s*(.*)/);
                        if (m && m[1]) {
                            let exists = Array.from(selP.options).some(o => o.value === m[1]);
                            if (!exists) selP.innerHTML += `<option value="${m[1]}">${m[1]}</option>`;
                            selP.value = m[1];
                            handleParentCategoryChange();
                            setTimeout(() => {
                                const subSel = $id('f-cat-sub-select');
                                if (subSel && m[2]) {
                                    let subExists = Array.from(subSel.options).some(o => o.value === m[2]);
                                    if (!subExists) subSel.innerHTML += `<option value="${m[2]}">${m[2]}</option>`;
                                    subSel.value = m[2];
                                }
                            }, 50);
                        } else if (oldTx.cat) {
                            let exists = Array.from(selP.options).some(o => o.value === oldTx.cat);
                            if (!exists) selP.innerHTML += `<option value="${oldTx.cat}">${oldTx.cat}</option>`;
                            selP.value = oldTx.cat;
                            handleParentCategoryChange();
                        }
                    }
                    
                    if ($id('f-cost-type') && oldTx.costType) $id('f-cost-type').value = oldTx.costType;
                    
                    if (type === 'transfer' && oldTx.toAccId) {
                        setTimeout(() => { const destEl = $id('f-account-dest'); if(destEl) destEl.value = oldTx.toAccId; }, 100);
                    }
                    
                    if (type === 'afterpay') {
                        if ($id('f-ap-freq')) $id('f-ap-freq').value = oldTx.apFreq || nexusDefaultApFreq();
                        if ($id('f-ap-quotas')) $id('f-ap-quotas').value = oldTx.apQuotas || 4;
                        if (typeof setApMode === 'function') setApMode(oldTx.apRecon ? 'recon' : 'new');
                        if (oldTx.apRecon && $id('f-ap-paid')) $id('f-ap-paid').value = String(oldTx.apPaid || 0);
                    } else if (type === 'expense') {
                        const ptSel = $id('f-purchase-type');
                        const oldAcc = state.accounts.find(a => a.id === oldTx.accId);
                        if (ptSel) {
                            ptSel.value = oldTx.isCCPurchase ? 'credit' : nexusPurchaseTypeFromAccount(oldAcc);
                        }
                        if (oldTx.isCCPurchase) {
                            const ccLoan = typeof nexusFindLoanByPurchaseTx === 'function' ? nexusFindLoanByPurchaseTx(oldTx) : null;
                            const termEl = $id('f-cc-term');
                            const zeroEl = $id('f-cc-zero');
                            if (ccLoan && termEl) {
                                termEl.dataset.raw = String(ccLoan.term || '');
                                termEl.value = ccLoan.term || '';
                            }
                            if (zeroEl && ccLoan) zeroEl.checked = !(ccLoan.rate > 0);
                        }
                        applyExpensePurchaseTypeUI(true);
                        setTimeout(() => {
                            if ($id('f-account')) {
                                $id('f-account').value = oldTx.accId;
                                checkTxAccount();
                            }
                        }, 50);
                    } else {
                        setTimeout(() => {
                            if ($id('f-account')) {
                                $id('f-account').value = oldTx.accId;
                                checkTxAccount();
                            }
                        }, 50);
                    }
                    
                    if ($id('f-is-recur')) {
                        $id('f-is-recur').checked = !!oldTx.isRecurrent;
                        toggleRecurFields();
                        if (oldTx.isRecurrent) {
                            if ($id('f-recur-freq')) $id('f-recur-freq').value = oldTx.recurFreq || 'monthly';
                            if ($id('f-recur-count')) $id('f-recur-count').value = oldTx.recurCount || 12;
                        }
                    }
                }
            }
            
            if (type === 'expense') {
                applyExpensePurchaseTypeUI(false);
            } else {
                const ptCont = $id('expense-purchase-type-container');
                if (ptCont) ptCont.classList.add('hidden');
            }

            if(!txId) setTimeout(() => checkTxAccount(), 80);
        }

        function closeForm() { nexusHideModalInstant($id('tx-modal')); }
        
        // Restauración del Predictor Semántico (Autofill Inteligente)
        function handleNoteAutocomplete(e) {
            const val = e.target.value.trim().toLowerCase();
            if(!val || val.length < 3) return;
            const type = $id('f-type').value;
            // Buscar una transacción pasada con la misma nota
            const match = state.tx.find(t => t.type === type && t.note && t.note.toLowerCase() === val);
            if (match && match.cat) {
                const pSel = $id('f-cat-parent-select');
                if (!pSel) return;
                const m = match.cat.match(/\[(.*?)\]\s*(.*)/);
                if (m && m[1]) {
                    pSel.value = m[1];
                    handleParentCategoryChange();
                    setTimeout(() => {
                        const sSel = $id('f-cat-sub-select');
                        if (sSel && m[2]) {
                            let subExists = Array.from(sSel.options).some(o => o.value === m[2]);
                            if (!subExists) sSel.innerHTML += `<option value="${m[2]}">${m[2]}</option>`;
                            sSel.value = m[2];
                        }
                    }, 50);
                } else {
                    pSel.value = match.cat;
                    handleParentCategoryChange();
                }
            }
        }

        function editTransaction(id) {
            const tx = state.tx.find(t => t.id === id);
            if (!tx) return;
            openForm(tx.type, tx.id);
        }

  const api = {
    __state: global.NexusLoansEngine.__state,
    getActiveLoans,
    prepareList: prepareLoansList,
    paintList: function () { return paintLoansList(false); },
    renderList: renderLoansList,
    changeLoanCalMonth,
    nexusNormalizeMonthlyRatePct,
    nexusCalcLoanFrenchSchedule,
    nexusGetLoanActiveBalance,
    nexusRecalcCreditCardBalanceFromLoans,
    nexusFindLoanByPurchaseTx,
    nexusBuildLoanAmortMiniHtml,
    nexusToggleLoansAcc,
    nexusToggleLoansCard,
    nexusToggleLoansPurchase,
    nexusToggleCcTxAmort,
    nexusToggleCcTxAmortCard,
    nexusRenderLoanCompactCard,
    renderLoansList,
    showLoanDetail,
    hideLoanDetail,
    deleteLoan,
    toggleLoanCreditorFields,
    populateLoanCreditorSelects,
    nexusBindPseLinkToLoan,
    openNewPSEFormFromLoanEditor,
    openNewPSEFormFromLoanPayModal,
    closeLoanPSEPayModal,
    nexusEscapeJsStr,
    openLoanPSEPayModal,
    loanUsePseLinkForDebt,
    editLoan,
    openLoanForm,
    closeLoanForm,
    saveLoan,
    openPendingForm,
    closePendingForm,
    savePending,
    payLoanQuota,
    saveCCPurchase,
    handleParentCategoryChange,
    handleSubCategoryChange,
    confirmNewParentCategory,
    confirmNewSubCategory,
    toggleRecurFields,
    reconcilePastAfterpay,
    nexusPurchaseTypeFromAccount,
    applyExpensePurchaseTypeUI,
    populateFormAccounts,
    checkTxAccount,
    openForm,
    closeForm,
    handleNoteAutocomplete,
    editTransaction,
    renderDeletedTxArchiveList
  };

  global.NexusLoansEngine = api;
  global.getActiveLoans = getActiveLoans;
  global.changeLoanCalMonth = changeLoanCalMonth;
  global.nexusCalcLoanFrenchSchedule = nexusCalcLoanFrenchSchedule;
  global.nexusGetLoanActiveBalance = nexusGetLoanActiveBalance;
  global.nexusToggleLoansAcc = nexusToggleLoansAcc;
  global.nexusToggleLoansPurchase = nexusToggleLoansPurchase;
  global.nexusRenderLoanCompactCard = nexusRenderLoanCompactCard;
  global.renderLoansList = renderLoansList;
  global.deleteLoan = deleteLoan;
  global.editLoan = editLoan;
  global.openLoanForm = openLoanForm;
  global.closeLoanForm = closeLoanForm;
  global.saveLoan = saveLoan;
  global.payLoanQuota = payLoanQuota;
  global.nexusNormalizeMonthlyRatePct = nexusNormalizeMonthlyRatePct;
  global.nexusRecalcCreditCardBalanceFromLoans = nexusRecalcCreditCardBalanceFromLoans;
  global.nexusFindLoanByPurchaseTx = nexusFindLoanByPurchaseTx;
  global.nexusBuildLoanAmortMiniHtml = nexusBuildLoanAmortMiniHtml;
  global.nexusToggleLoansCard = nexusToggleLoansCard;
  global.nexusToggleCcTxAmort = nexusToggleCcTxAmort;
  global.nexusToggleCcTxAmortCard = nexusToggleCcTxAmortCard;
  global.showLoanDetail = showLoanDetail;
  global.hideLoanDetail = hideLoanDetail;
  global.toggleLoanCreditorFields = toggleLoanCreditorFields;
  global.populateLoanCreditorSelects = populateLoanCreditorSelects;
  global.nexusBindPseLinkToLoan = nexusBindPseLinkToLoan;
  global.openNewPSEFormFromLoanEditor = openNewPSEFormFromLoanEditor;
  global.openNewPSEFormFromLoanPayModal = openNewPSEFormFromLoanPayModal;
  global.closeLoanPSEPayModal = closeLoanPSEPayModal;
  global.nexusEscapeJsStr = nexusEscapeJsStr;
  global.openLoanPSEPayModal = openLoanPSEPayModal;
  global.loanUsePseLinkForDebt = loanUsePseLinkForDebt;
  global.openPendingForm = openPendingForm;
  global.closePendingForm = closePendingForm;
  global.savePending = savePending;
  global.saveCCPurchase = saveCCPurchase;
  global.handleParentCategoryChange = handleParentCategoryChange;
  global.handleSubCategoryChange = handleSubCategoryChange;
  global.confirmNewParentCategory = confirmNewParentCategory;
  global.confirmNewSubCategory = confirmNewSubCategory;
  global.toggleRecurFields = toggleRecurFields;
  global.reconcilePastAfterpay = reconcilePastAfterpay;
  global.nexusPurchaseTypeFromAccount = nexusPurchaseTypeFromAccount;
  global.applyExpensePurchaseTypeUI = applyExpensePurchaseTypeUI;
  global.populateFormAccounts = populateFormAccounts;
  global.checkTxAccount = checkTxAccount;
  global.openForm = openForm;
  global.closeForm = closeForm;
  global.handleNoteAutocomplete = handleNoteAutocomplete;
  global.editTransaction = editTransaction;

  console.info("[NEXUS] feature-deudas loans-engine.js cargado");
})(typeof window !== "undefined" ? window : globalThis);
