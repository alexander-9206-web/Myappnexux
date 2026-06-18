/**
 * NEXUS feature-cuentas — Motor SSoT (Fase 1)
 * Extraído del monolito. Requiere globals de nexus-app.js ($id, state, fmt, …).
 */
(function (global) {
  "use strict";

  if (!global.NexusAccountsEngine) global.NexusAccountsEngine = { __state: {} };

  function prepareAccountsTab() {
    if (typeof scheduleP2PListenersAttach === "function") scheduleP2PListenersAttach(true);
    nexusApplyAccountTombstonesToState();
  }

        function renderAccounts() {
            if (global.__NexusAccountsDomain && typeof global.__NexusAccountsDomain.renderDashboard === "function") {
                return global.__NexusAccountsDomain.renderDashboard();
            }
            return paintAccountsDashboard();
        }

        function paintAccountsDashboard() {
            const cont = $id('accounts-container'); if(!cont) return;
            if(!state.accounts || state.accounts.length === 0) { cont.innerHTML = `<div class="text-center p-8 border border-slate-100 rounded-3xl"><p class="text-xs font-bold text-slate-400 uppercase">Sin cuentas</p></div>`; return; }
            
            const groups = {}; const sharedGroups = {};
            
            state.accounts.forEach(a => {
                const curr = a.currency || state.settings.baseCurrency || 'COP'; // Auto-Sanación de divisa
                if(a.isShared) {
                    if(!sharedGroups[curr]) sharedGroups[curr] = [];
                    sharedGroups[curr].push(a);
                } else {
                    if(!groups[curr]) groups[curr] = [];
                    groups[curr].push(a);
                }
            });
            
            let html = '';
            
            for(let curr in groups) {
                const accs = groups[curr]; let total = 0; accs.forEach(a => { if(nexusIsLiabAccount(a)) total -= a.balance; else total += a.balance; });
                const grpTotal = fmt(total, curr);
                html += `<div class="theme-card nexus-list-card p-4 rounded-[2rem] border shadow-sm mb-2.5 min-w-0"><div class="border-b border-slate-100/50 pb-2.5 mb-2 flex justify-between items-center gap-2 min-w-0"><h3 class="text-xs font-black uppercase text-slate-500 shrink-0">Divisa ${curr}</h3><div class="acc-vault-amt-wrap nexus-amount-box"><span class="acc-vault-amt nexus-amount-fit nexus-amt-summary nexus-amt-compact font-black ${total>=0?'theme-val-inc':'theme-val-exp'}" title="${grpTotal}">${grpTotal}</span></div></div><div class="space-y-1">`;
                accs.forEach(a => {
                    const icon = nexusAccountCardIcon(a.type);
                    const color = nexusIsLiabAccount(a) ? 'theme-val-exp' : 'theme-text';
                    const iconHtml = a.logoUrl ? `<img src="${a.logoUrl}" class="w-5 h-5 object-cover rounded-full shadow-sm">` : `<i class="fa-solid ${icon} text-[10px] text-slate-400 w-5 text-center"></i>`;
                    const rowAmt = `${nexusIsLiabAccount(a)?'-':''}${fmt(a.balance, curr)}`;
                    html += `<div data-nexus-action="switchTab" data-nexus-arg="accounts" class="p-1.5 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors min-w-0"><div class="flex items-center justify-between gap-2 min-w-0"><div class="flex items-center gap-2 min-w-0 flex-1">${iconHtml}<p class="text-[11px] font-black uppercase theme-text truncate">${a.name}</p></div><div class="acc-vault-amt-wrap nexus-amount-box"><span class="acc-vault-amt nexus-amount-fit nexus-amt-summary nexus-amt-compact font-black ${color}" title="${rowAmt}">${rowAmt}</span></div></div></div>`;
                });
                html += `</div></div>`;
            }
            
            // Aislamiento para Cuentas Compartidas P2P en Dashboard
            if(Object.keys(sharedGroups).length > 0) {
                for(let curr in sharedGroups) {
                    const accs = sharedGroups[curr]; let total = 0; accs.forEach(a => { if(nexusIsLiabAccount(a)) total -= a.balance; else total += a.balance; });
                    const grpTotalSh = fmt(total, curr);
                    html += `<div class="theme-card nexus-list-card p-4 rounded-[2rem] border shadow-sm border-purple-100/50 bg-slate-50/50 mb-2.5 min-w-0"><div class="border-b border-slate-200/50 pb-2.5 mb-2 flex justify-between items-center gap-2 min-w-0"><h3 class="text-xs font-black uppercase text-purple-600 shrink-0"><i class="fa-solid fa-link mr-1"></i> Compartidas ${curr}</h3><div class="acc-vault-amt-wrap nexus-amount-box"><span class="acc-vault-amt nexus-amount-fit nexus-amt-summary nexus-amt-compact font-black ${total>=0?'theme-val-inc':'theme-val-exp'}" title="${grpTotalSh}">${grpTotalSh}</span></div></div><div class="space-y-1">`;
                    accs.forEach(a => {
                        const icon = 'fa-link'; const color = nexusIsLiabAccount(a) ? 'theme-val-exp' : 'theme-text';
                        const iconHtml = a.logoUrl ? `<img src="${a.logoUrl}" class="w-5 h-5 object-cover rounded-full shadow-sm border border-purple-200">` : `<i class="fa-solid ${icon} text-[10px] text-purple-400 w-5 text-center"></i>`;
                        const rowAmt = `${nexusIsLiabAccount(a)?'-':''}${fmt(a.balance, curr)}`;
                        html += `<div data-nexus-action="switchTab" data-nexus-arg="accounts" class="p-1.5 hover:bg-white rounded-xl cursor-pointer transition-colors min-w-0"><div class="flex items-center justify-between gap-2 min-w-0"><div class="flex items-center gap-2 min-w-0 flex-1">${iconHtml}<p class="text-[11px] font-black uppercase theme-text truncate">${a.name}</p></div><div class="acc-vault-amt-wrap nexus-amount-box"><span class="acc-vault-amt nexus-amount-fit nexus-amt-summary nexus-amt-compact font-black ${color}" title="${rowAmt}">${rowAmt}</span></div></div></div>`;
                    });
                    html += `</div></div>`;
                }
            }
            
            cont.innerHTML = html;
            requestAnimationFrame(() => fitNexusAmounts(cont));

            // Estado visual del acordeón de cuentas del dashboard
            const accIcon = $id('icon-dash-accounts');
            if (state.ui && state.ui['dash_accounts_view'] === false) {
                cont.classList.add('hidden');
                if (accIcon) { accIcon.classList.remove('fa-eye', 'text-indigo-400'); accIcon.classList.add('fa-eye-slash', 'text-slate-400'); }
            } else {
                cont.classList.remove('hidden');
                if (accIcon) { accIcon.classList.remove('fa-eye-slash', 'text-slate-400'); accIcon.classList.add('fa-eye', 'text-indigo-400'); }
            }
        }

        function render7DaysChart(aTx) {
            const canvas = $id('chart-7days'); if(!canvas) return; const ctx = canvas.getContext('2d'); if(charts.d7) charts.d7.destroy();
            const chartTx = (aTx || []).filter(t => nexusIsRealCashflowTx(t) && t.type !== 'isolated');
            const dI = [], dO = [], l = [];
            for(let i=6; i>=0; i--) { const d = new Date(); d.setDate(d.getDate() - i); l.push(d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })); const dTx = chartTx.filter(t => new Date(t.date).toDateString() === d.toDateString()); dI.push(dTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0)); dO.push(dTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0)); }
            charts.d7 = new Chart(ctx, { type: 'line', data: { labels: l, datasets: [{ data: dI, borderColor: state.theme.inc, tension: 0.4 }, { data: dO, borderColor: state.theme.exp, tension: 0.4 }]}, options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{display:true, grid:{display:false}, ticks:{font:{size:8, weight:'bold'}}}, y:{display:false}} } });
        }

        function renderPeriodChart(cTx) {
            const canvas = $id('chart-period'); if(!canvas) return; const ctx = canvas.getContext('2d'); if(charts.period) charts.period.destroy();
            const grp = {};
            (cTx || []).filter(t => nexusIsRealCashflowTx(t) && t.type !== 'isolated').forEach(t => {
                const dStr = t.date.split('T')[0];
                grp[dStr] = (grp[dStr]||0) + (t.type==='income' ? t.amount : -t.amount);
            });
            const sortedKeys = Object.keys(grp).sort();
            const l = sortedKeys.map(k => {
                const [y,m,d] = k.split('-');
                return new Date(y, m-1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
            });
            const dataVals = sortedKeys.map(k => grp[k]);
            charts.period = new Chart(ctx, { type: 'line', data: { labels: l, datasets: [{ data: dataVals, borderColor: state.theme.text, backgroundColor: 'rgba(0,0,0,0.05)', fill: true, tension: 0.4, borderWidth: 2 }] }, options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{display:true, grid:{display:false}, ticks:{font:{size:8, weight:'bold'}}}, y:{display:false}} } });
        }

        function populateFilters() {
            const select = $id('period-cat-filter');
            if (!select) return;
            const allCat = nexusUi('Todas las Categorías');
            select.innerHTML = `<option value="all">${allCat}</option>`;
            const pfType = state.periodFilter?.type;
            const cats = (pfType === 'income' || pfType === 'expense') ? getUserCategoryLabels(pfType) : getUserCategoryLabels();
            cats.forEach(c => { select.innerHTML += `<option value="${c}">${c}</option>`; });
        }

        function setPeriodFilter(key, val) {
            state.periodFilter[key] = val;
            if(key === 'type') {
                $qAll('#view-period .filter-chip').forEach(b => b.classList.remove('active')); const act = $id('f-type-' + val); if(act) act.classList.add('active');
                const select = $id('period-cat-filter');
                if(select) {
                    select.innerHTML = '<option value="all">Todas</option>';
                    const cats = (val === 'income' || val === 'expense') ? getUserCategoryLabels(val) : getUserCategoryLabels();
                    cats.forEach(c => select.innerHTML += `<option value="${c}">${c}</option>`);
                }
                state.periodFilter.cat = 'all';
            }
            updateDashboard();
            nexusPersistCloudConfig(['core'], 'settings');
        }

        function renderPeriodList(cTx) {
            const list = $id('period-list'); if(!list) return;
            const fTx = cTx.filter(t => {
                const rType = t.renderType || t.type;
                if(rType === 'afterpay') return false;
                if(state.periodFilter.type !== 'all' && rType !== state.periodFilter.type) return false;
                if(state.periodFilter.cat !== 'all' && t.cat !== state.periodFilter.cat) return false;
                if(t.type === 'isolated') return false; // Ocultar gastos internos de cuentas aisladas en el Dashboard
                return true;
            });
            fTx.sort((a,b) => new Date(b.date) - new Date(a.date));
            list.innerHTML = fTx.map(t => {
                const rType = t.renderType || t.type;
                let projBadge = '';
                if(t.isProjected) {
                    const isPast = new Date(t.date) <= new Date(); const bTxt = isPast ? (t.cat.includes('Afterpay') ? 'PENDIENTE' : 'AMORTIZADO') : 'PROY.';
                    const bCls = isPast ? (t.cat.includes('Afterpay') ? 'bg-red-100 text-red-600 border-red-200' : 'bg-blue-100 text-blue-600 border-blue-200') : 'bg-amber-100 text-amber-600 border-amber-200';
                    projBadge = `<span class="text-[8px] ${bCls} px-2 py-0.5 rounded-full ml-2 border">${bTxt}</span>`;
                }
                const dDate = new Date(t.date);
                const timeStr = String(dDate.getHours()).padStart(2,'0') + ':' + String(dDate.getMinutes()).padStart(2,'0');
                
                // Inyecta visualmente el efecto contable real (Gasto o Ingreso)
                return `<div ${t.isProjected ? '' : `data-nexus-action="editTransaction" data-nexus-arg="${t.id}"`} class="${t.isProjected ? '' : 'cursor-pointer'} theme-card nexus-list-card p-5 rounded-2xl flex justify-between items-center gap-2 min-w-0 shadow-sm border border-slate-50/50 h-full"><div class="flex items-center gap-4 min-w-0 flex-1"><div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${rType==='income'?'bg-emerald-50 text-emerald-600':rType==='expense'?'bg-red-50 text-red-600':'bg-indigo-50 text-indigo-600'}"><i class="fa-solid ${rType==='income'?'fa-arrow-up':rType==='expense'?'fa-arrow-down':'fa-right-left'} text-xs"></i></div><div class="min-w-0"><p class="text-xs font-black uppercase theme-text flex items-center truncate">${t.cat.substring(2)} ${projBadge}</p><p class="text-[9px] font-bold opacity-40 theme-text">${dDate.toLocaleDateString()} ${timeStr}</p></div></div><div class="nexus-amount-box min-w-0 max-w-[45%] text-right shrink-0"><p class="nexus-amount-fit nexus-amt-compact font-black ${t.type==='income'?'theme-val-inc':t.type==='expense'?'theme-val-exp':'text-indigo-500'}">${t.type==='expense'?'-':'+'}${fmt(t.amount, t.currency)}</p></div></div>`;
            }).join('');
            const sI = fTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0); const sE = fTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
            const piEl = $id('period-sub-inc'); const peEl = $id('period-sub-exp'); const psEl = $id('period-subtotal');
            if(piEl) piEl.innerText = fmt(sI); if(peEl) peEl.innerText = fmt(sE);
            if(psEl) { psEl.innerText = fmt(sI - sE); psEl.className = `nexus-amount-fit nexus-amt-summary font-black tabular-nums ${(sI - sE) >= 0 ? 'theme-text' : 'theme-val-exp'}`; }
            nexusScheduleFit($id('tab-home'));
        }

        // TABS
        function renderAccountsTab() {
            if (global.__NexusAccountsDomain && typeof global.__NexusAccountsDomain.renderTab === "function") {
                return global.__NexusAccountsDomain.renderTab();
            }
            prepareAccountsTab();
            return paintAccountsTabList(true);
        }

        function paintAccountsTabList(computeStats) {
            const sumContainer = $id('acc-hub-summary'); const listContainer = $id('acc-hub-list'); if(!sumContainer || !listContainer) return;
            
            let totalAssets = 0, totalLiabilities = 0;
            const bC = state.settings.baseCurrency || 'COP';
            
            if (computeStats && !(global.NexusAccountsEngine && global.NexusAccountsEngine.__state && global.NexusAccountsEngine.__state.skipHubStatsRecompute)) {
            (state.accounts || []).forEach(a => {
                // Aislamiento contable estricto para cuentas de Terceros y Compartidas (P2P)
                if(a.type === 'terceros' || a.isShared) return;

                const balInBase = convertCurrency(a.balance, a.currency, bC);
                if(nexusIsLiabAccount(a) || (a.type === 'virtual' && a.balance < 0)) totalLiabilities += Math.abs(balInBase);
                else totalAssets += balInBase;
            });
            
            sumContainer.innerHTML = `<div class="theme-card p-3 rounded-[1.25rem] border shadow-sm text-center min-w-0"><i class="fa-solid fa-wallet text-slate-400 mb-1 text-xs"></i><p class="text-[8px] font-black uppercase opacity-40 theme-text">Líquido</p><p class="nexus-amount-box mt-0.5"><span class="acc-summary-amt nexus-amount-fit nexus-amt-summary nexus-amt-compact font-black theme-text" title="${fmt(totalAssets, bC)}">${fmt(totalAssets, bC)}</span></p></div><div class="theme-card p-3 rounded-[1.25rem] border shadow-sm text-center min-w-0"><i class="fa-solid fa-credit-card text-red-400 mb-1 text-xs"></i><p class="text-[8px] font-black uppercase opacity-40 theme-text">Crédito</p><p class="nexus-amount-box mt-0.5"><span class="acc-summary-amt nexus-amount-fit nexus-amt-summary nexus-amt-compact font-black theme-val-exp" title="${fmt(totalLiabilities, bC)}">${fmt(totalLiabilities, bC)}</span></p></div><div class="theme-card p-3 rounded-[1.25rem] border shadow-sm text-center min-w-0"><i class="fa-solid fa-chart-line text-emerald-400 mb-1 text-xs"></i><p class="text-[8px] font-black uppercase opacity-40 theme-text">Inversión</p><p class="nexus-amount-box mt-0.5"><span class="acc-summary-amt nexus-amount-fit nexus-amt-summary nexus-amt-compact font-black theme-val-inc" title="${fmt(0, bC)}">${fmt(0, bC)}</span></p></div>`;
            }
            
            if(!state.accounts || state.accounts.length === 0) {
                listContainer.innerHTML = '<p class="text-xs text-center text-slate-400 font-bold p-8 border border-dashed rounded-2xl">No hay cuentas configuradas.</p>';
                return;
            }

            const groups = {};
            const rotativoGroups = {};
            const virtualGroups = {};
            const tercerosGroups = {}; // Contenedor para Cuentas de Terceros
            const sharedGroups = {}; // Contenedor aislado para Cuentas Compartidas P2P

            state.accounts.forEach(a => {
                const curr = a.currency || state.settings.baseCurrency || 'COP'; // Auto-Sanación de divisa
                if (a.isShared) {
                    if(!sharedGroups[curr]) sharedGroups[curr] = [];
                    sharedGroups[curr].push(a);
                } else if (a.type === 'rotativo') {
                    if(!rotativoGroups[curr]) rotativoGroups[curr] = [];
                    rotativoGroups[curr].push(a);
                } else if (a.type === 'virtual') {
                    if(!virtualGroups[curr]) virtualGroups[curr] = [];
                    virtualGroups[curr].push(a);
                } else if (a.type === 'terceros') {
                    if(!tercerosGroups[curr]) tercerosGroups[curr] = [];
                    tercerosGroups[curr].push(a);
                } else {
                    if(!groups[curr]) groups[curr] = [];
                    groups[curr].push(a);
                }
            });

            let html = '';
            
            if (Object.keys(groups).length > 0) {
                for(let curr in groups) {
                    const gId = `grp-std-${curr}`;
                    const isOpen = state.ui && state.ui[`acc_view_${gId}`] === true;
                    const eyeIcon = isOpen ? 'fa-eye text-indigo-500' : 'fa-eye-slash text-slate-400';
                    const dispCls = isOpen ? '' : 'hidden';

                    const accs = groups[curr];
                    let subTotal = 0;
                    accs.forEach(a => { if(nexusIsLiabAccount(a)) subTotal -= a.balance; else subTotal += a.balance; });
                    
                    html += `<div class="theme-card acc-group-card rounded-[2rem] border shadow-sm flex flex-col group relative overflow-hidden border-slate-100 mb-2.5"><div data-nexus-action="toggleAccGroup" data-nexus-arg="${gId}" class="flex justify-between items-center border-b border-slate-100/50 pb-2 cursor-pointer select-none hover:opacity-70 transition-opacity gap-2 min-w-0"><h3 class="text-xs font-black uppercase text-slate-500 flex items-center shrink-0">Divisa ${curr}</h3><div class="flex items-center gap-2 min-w-0 justify-end"><div class="acc-group-amt-wrap nexus-amount-box"><span class="acc-group-amt nexus-amount-fit nexus-amt-summary nexus-amt-compact font-black ${subTotal>=0?'theme-val-inc':'theme-val-exp'}" title="${fmt(subTotal, curr)}">${fmt(subTotal, curr)}</span></div><i id="icon-${gId}" class="fa-solid ${eyeIcon} text-[14px] transition-colors shrink-0"></i></div></div><div id="${gId}" class="${dispCls} space-y-1.5 pt-2 animate-slideUp">`;
                    
                    // Agrupación interna por tipos de cuenta
                    const accsByType = { liquid: [], credit: [], investment: [] };
                    accs.forEach(a => { if(accsByType[a.type]) accsByType[a.type].push(a); else accsByType['liquid'].push(a); });
                    
                    const typeLabels = {
                        liquid: '<i class="fa-solid fa-wallet mr-1 text-slate-400"></i> Efectivo / Débito',
                        credit: '<i class="fa-solid fa-credit-card mr-1 text-red-400"></i> Tarjetas de Crédito',
                        investment: '<i class="fa-solid fa-chart-line mr-1 text-emerald-400"></i> Inversiones'
                    };
                    
                    ['liquid', 'credit', 'investment'].forEach(t => {
                        if(accsByType[t].length > 0) {
                            html += `<p class="text-[9px] font-black uppercase text-slate-400 mt-2 mb-1 tracking-widest pl-2">${typeLabels[t]}</p>`;
                            accsByType[t].forEach(a => {
                                const row = nexusAccountCardRowBundle(a, curr);
                                html += buildAccountCardHtml(a, curr, row.color, row.sign, row.detailText, row.customStyle, row.iconBg, row.iconContent, row.p2pBtn);
                            });
                        }
                    });
                    
                    html += `</div></div>`;
                }
            }

            if (Object.keys(rotativoGroups).length > 0) {
                html += `<div><h3 class="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2 mb-3 mt-2"><i class="fa-solid fa-arrows-rotate text-teal-600 mr-1"></i> Créditos Rotativos</h3></div>`;
                for(let curr in rotativoGroups) {
                    const gId = `grp-rot-${curr}`;
                    const isOpen = state.ui && state.ui[`acc_view_${gId}`] === true;
                    const eyeIcon = isOpen ? 'fa-eye text-teal-600' : 'fa-eye-slash text-slate-400';
                    const dispCls = isOpen ? '' : 'hidden';
                    const accs = rotativoGroups[curr];
                    let subTotal = 0;
                    accs.forEach(a => { subTotal -= a.balance; });
                    html += `<div class="theme-card acc-group-card rounded-[2rem] border shadow-sm flex flex-col group relative overflow-hidden border-teal-100/60 bg-teal-50/20 mb-2.5"><div data-nexus-action="toggleAccGroup" data-nexus-arg="${gId}" class="flex justify-between items-center border-b border-teal-200/50 pb-2 cursor-pointer select-none hover:opacity-70 transition-opacity gap-2 min-w-0"><h3 class="text-xs font-black uppercase text-teal-800 flex items-center shrink-0">Rotativos ${curr}</h3><div class="flex items-center gap-2 min-w-0 justify-end"><div class="acc-group-amt-wrap nexus-amount-box"><span class="acc-group-amt nexus-amount-fit nexus-amt-summary nexus-amt-compact font-black theme-val-exp" title="${fmt(subTotal, curr)}">${fmt(subTotal, curr)}</span></div><i id="icon-${gId}" class="fa-solid ${eyeIcon} text-[14px] transition-colors shrink-0"></i></div></div><div id="${gId}" class="${dispCls} space-y-1.5 pt-2 animate-slideUp">`;
                    accs.forEach(a => {
                        const row = nexusAccountCardRowBundle(a, curr);
                        html += buildAccountCardHtml(a, curr, row.color, row.sign, row.detailText, row.customStyle, row.iconBg, row.iconContent, row.p2pBtn);
                    });
                    html += `</div></div>`;
                }
            }

            if (Object.keys(virtualGroups).length > 0) {
                html += `<div><h3 class="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2 mb-3"><i class="fa-solid fa-mobile-screen text-purple-500 mr-1"></i> Apps y Tarjetas Virtuales</h3></div>`;
                for(let curr in virtualGroups) {
                    const gId = `grp-virt-${curr}`;
                    const isOpen = state.ui && state.ui[`acc_view_${gId}`] === true;
                    const eyeIcon = isOpen ? 'fa-eye text-purple-500' : 'fa-eye-slash text-slate-400';
                    const dispCls = isOpen ? '' : 'hidden';

                    const accs = virtualGroups[curr];
                    let subTotal = 0;
                    accs.forEach(a => { subTotal += a.balance; });
                    
                    html += `<div class="theme-card acc-group-card rounded-[2rem] border shadow-sm flex flex-col group relative overflow-hidden border-purple-100/50 bg-slate-50/50 mb-2.5"><div data-nexus-action="toggleAccGroup" data-nexus-arg="${gId}" class="flex justify-between items-center border-b border-slate-200/50 pb-2 cursor-pointer select-none hover:opacity-70 transition-opacity gap-2 min-w-0"><h3 class="text-xs font-black uppercase text-purple-600 flex items-center shrink-0">Virtuales ${curr}</h3><div class="flex items-center gap-2 min-w-0 justify-end"><div class="acc-group-amt-wrap nexus-amount-box"><span class="acc-group-amt nexus-amount-fit nexus-amt-summary nexus-amt-compact font-black ${subTotal>=0?'theme-val-inc':'theme-val-exp'}" title="${fmt(subTotal, curr)}">${fmt(subTotal, curr)}</span></div><i id="icon-${gId}" class="fa-solid ${eyeIcon} text-[14px] transition-colors shrink-0"></i></div></div><div id="${gId}" class="${dispCls} space-y-1.5 pt-2 animate-slideUp">`;
                    
                    accs.forEach(a => {
                        const row = nexusAccountCardRowBundle(a, curr);
                        html += buildAccountCardHtml(a, curr, row.color, row.sign, row.detailText, row.customStyle, row.iconBg, row.iconContent, row.p2pBtn);
                    });
                    
                    html += `</div></div>`;
                }
            }

            // Cuentas de terceros (aisladas del patrimonio global)
            if (Object.keys(tercerosGroups).length > 0) {
                html += `<div><h3 class="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2 mb-3 mt-4"><i class="fa-solid fa-users text-orange-500 mr-1"></i> Cuentas de Terceros (Aisladas)</h3></div>`;
                for(let curr in tercerosGroups) {
                    const gId = `grp-terc-${curr}`;
                    const isOpen = state.ui && state.ui[`acc_view_${gId}`] === true;
                    const eyeIcon = isOpen ? 'fa-eye text-orange-500' : 'fa-eye-slash text-slate-400';
                    const dispCls = isOpen ? '' : 'hidden';

                    const accs = tercerosGroups[curr];
                    let subTotal = 0;
                    accs.forEach(a => { subTotal += a.balance; });
                    
                    html += `<div class="theme-card acc-group-card rounded-[2rem] border shadow-sm flex flex-col group relative overflow-hidden border-orange-100/50 bg-slate-50/50 mb-2.5"><div data-nexus-action="toggleAccGroup" data-nexus-arg="${gId}" class="flex justify-between items-center border-b border-slate-200/50 pb-2 cursor-pointer select-none hover:opacity-70 transition-opacity gap-2 min-w-0"><h3 class="text-xs font-black uppercase text-orange-600 flex items-center shrink-0">Terceros ${curr}</h3><div class="flex items-center gap-2 min-w-0 justify-end"><div class="acc-group-amt-wrap nexus-amount-box"><span class="acc-group-amt nexus-amount-fit nexus-amt-summary nexus-amt-compact font-black text-orange-600" title="${fmt(subTotal, curr)}">${fmt(subTotal, curr)}</span></div><i id="icon-${gId}" class="fa-solid ${eyeIcon} text-[14px] transition-colors shrink-0"></i></div></div><div id="${gId}" class="${dispCls} space-y-1.5 pt-2 animate-slideUp">`;
                    
                    accs.forEach(a => {
                        const row = nexusAccountCardRowBundle(a, curr);
                        html += buildAccountCardHtml(a, curr, row.color, row.sign, row.detailText, row.customStyle, row.iconBg, row.iconContent, row.p2pBtn);
                    });
                    
                    html += `</div></div>`;
                }
            }

            // Bóvedas P2P compartidas
            if (Object.keys(sharedGroups).length > 0) {
                html += `<div><h3 class="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2 mb-3 mt-4"><i class="fa-solid fa-link text-purple-500 mr-1"></i> Bóvedas Vinculadas (P2P)</h3></div>`;
                for(let curr in sharedGroups) {
                    const gId = `grp-shared-${curr}`;
                    const isOpen = state.ui && state.ui[`acc_view_${gId}`] === true;
                    const eyeIcon = isOpen ? 'fa-eye text-purple-500' : 'fa-eye-slash text-slate-400';
                    const dispCls = isOpen ? '' : 'hidden';

                    const accs = sharedGroups[curr];
                    let subTotal = 0;
                    accs.forEach(a => { if(nexusIsLiabAccount(a)) subTotal -= a.balance; else subTotal += a.balance; });
                    
                    html += `<div class="theme-card acc-group-card rounded-[2rem] border shadow-sm flex flex-col group relative overflow-hidden border-purple-100/50 bg-slate-50/50 mb-2.5"><div data-nexus-action="toggleAccGroup" data-nexus-arg="${gId}" class="flex justify-between items-center border-b border-slate-200/50 pb-2 cursor-pointer select-none hover:opacity-70 transition-opacity gap-2 min-w-0"><h3 class="text-xs font-black uppercase text-purple-600 flex items-center shrink-0">Compartidas ${curr}</h3><div class="flex items-center gap-2 min-w-0 justify-end"><div class="acc-group-amt-wrap nexus-amount-box"><span class="acc-group-amt nexus-amount-fit nexus-amt-summary nexus-amt-compact font-black ${subTotal>=0?'theme-val-inc':'theme-val-exp'}" title="${fmt(subTotal, curr)}">${fmt(subTotal, curr)}</span></div><i id="icon-${gId}" class="fa-solid ${eyeIcon} text-[14px] transition-colors shrink-0"></i></div></div><div id="${gId}" class="${dispCls} space-y-1.5 pt-2 animate-slideUp">`;
                    
                    accs.forEach(a => {
                        const row = nexusAccountCardRowBundle(a, curr);
                        html += buildAccountCardHtml(a, curr, row.color, row.sign, row.detailText, row.customStyle, row.iconBg, row.iconContent, row.p2pBtn);
                    });
                    
                    html += `</div></div>`;
                }
            }

            listContainer.innerHTML = html;
            requestAnimationFrame(() => fitNexusAmounts($id('tab-accounts')));
        }

        // Controlador Lógico de Listas Desprendibles (Acordeón) y Persistencia Visual
        function toggleGlobalWealth() {
            const content = $id('global-wealth-content');
            const icon = $id('icon-global-wealth');
            if(!content) return;
            let isOpen = false;
            if(content.classList.contains('hidden')) {
                content.classList.remove('hidden'); content.classList.add('flex');
                if(icon) { icon.classList.remove('fa-chevron-right'); icon.classList.add('fa-chevron-down'); }
                isOpen = true;
            } else {
                content.classList.add('hidden'); content.classList.remove('flex');
                if(icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-right'); }
                isOpen = false;
            }
            if (!state.ui) state.ui = {};
            state.ui['global_wealth_view'] = isOpen;
            saveState();
        }

        function toggleDashAccounts() {
            const cont = $id('accounts-container');
            const icon = $id('icon-dash-accounts');
            if(!cont) return;
            let isOpen = false;
            if(cont.classList.contains('hidden')) {
                cont.classList.remove('hidden');
                if(icon) { icon.classList.remove('fa-eye-slash', 'text-slate-400'); icon.classList.add('fa-eye', 'text-indigo-400'); }
                isOpen = true;
            } else {
                cont.classList.add('hidden');
                if(icon) { icon.classList.remove('fa-eye', 'text-indigo-400'); icon.classList.add('fa-eye-slash', 'text-slate-400'); }
                isOpen = false;
            }
            if (!state.ui) state.ui = {};
            state.ui['dash_accounts_view'] = isOpen;
            saveState();
        }

        function toggleAccGroup(id) {
            const el = $id(id);
            const icon = $id('icon-' + id);
            if(!el) return;
            
            let isOpen = false;
            if(el.classList.contains('hidden')) {
                el.classList.remove('hidden');
                if(icon) {
                    icon.classList.remove('fa-eye-slash', 'text-slate-400');
                    
                    let accentColor = 'text-indigo-500';
                    if (id.includes('virt')) accentColor = 'text-purple-500';
                    if (id.includes('terc')) accentColor = 'text-orange-500';
                    if (id.includes('shared')) accentColor = 'text-purple-500';
                    
                    icon.classList.add('fa-eye', accentColor);
                }
                isOpen = true;
            } else {
                el.classList.add('hidden');
                if(icon) {
                    icon.className = 'fa-solid fa-eye-slash text-[14px] transition-colors text-slate-400';
                }
                isOpen = false;
            }
            if (!state.ui) state.ui = {};
            state.ui['acc_view_' + id] = isOpen;
            saveState();
            if (isOpen) requestAnimationFrame(() => fitNexusAmounts(el));
        }

        function nexusFormatAccountTxTitle(t) {
            let s = String(t.note || '').replace(/^\[TC\]\s*/i, '').replace(/\s*·\s*Extracto\s*$/i, '').trim();
            if (s.includes('· Ref:')) s = s.split('· Ref:')[0].trim();
            if ((!s || s.length < 2) && t.cat) {
                s = String(t.cat).replace(/^\[(Crédito|TC)\]\s*/i, '').replace(/^💳\s*/, '').trim();
            }
            return s || 'Movimiento';
        }

        function nexusIsScannerAccountTx(t) {
            if (!t) return false;
            if (t.scannerImport) return true;
            if (String(t.id || '').startsWith('tx_scan_')) return true;
            const note = String(t.note || '');
            return note.includes('Extracto') || note.includes('extracto');
        }

        function nexusShouldHideScannerTxInAccountList(t, acc) {
            if (!t || !acc || !nexusIsLiabAccount(acc)) return false;
            if (!nexusIsScannerAccountTx(t)) return false;
            return !!(t.isCCPurchase || t.ccPurchaseNoBalance || String(t.cat || '').includes('Seguro') || String(t.cat || '').includes('Cargo') || String(t.cat || '').includes('Interes'));
        }

        function nexusBuildScannerImportSummaryHtml(accId, acc) {
            if (!acc || !nexusIsLiabAccount(acc)) return '';
            const hidden = nexusGetOperationalTxList().filter(t => t.accId === accId && nexusShouldHideScannerTxInAccountList(t, acc));
            if (!hidden.length) return '';
            const loans = (state.loans || []).filter(l => l.isCC && l.cardId === accId);
            const activeLoans = loans.filter(l => typeof nexusCalcLoanFrenchSchedule === 'function' && nexusCalcLoanFrenchSchedule(l).remaining > 0);
            const purchases = activeLoans.length || loans.length;
            const fixed = hidden.filter(t => !t.isCCPurchase).length;
            const curr = acc.currency || state.settings.baseCurrency || 'COP';
            return `<div class="acc-hist-card theme-card p-3 rounded-2xl shadow-sm border border-indigo-100/80 bg-indigo-50/30 mb-2 min-w-0 max-w-full overflow-hidden">
                <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-indigo-100 text-indigo-600"><i class="fa-solid fa-file-invoice text-[10px]"></i></div>
                    <div class="min-w-0 flex-1">
                        <p class="text-[10px] font-black uppercase text-indigo-800 truncate">Extracto importado</p>
                        <p class="text-[8px] font-bold text-slate-500 uppercase mt-0.5 truncate">${purchases} compra(s)${fixed > 0 ? ' · ' + fixed + ' cargo(s)' : ''} · Saldo ${fmt(acc.balance, curr)}</p>
                    </div>
                    <button type="button" data-nexus-action="switchTab" data-nexus-arg="loans" data-nexus-pass-event="1" class="text-[8px] font-black uppercase text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1.5 rounded-lg shrink-0 active:scale-95">Deudas</button>
                </div>
            </div>`;
        }

        function nexusBuildAccountTxRowHtml(t, accId, acc) {
            const dDate = new Date(t.date);
            const timeStr = String(dDate.getHours()).padStart(2, '0') + ':' + String(dDate.getMinutes()).padStart(2, '0');
            const isOutflow = t.type === 'expense' || (t.type === 'transfer' && t.accId === accId);
            const isInflow = t.type === 'income' || (t.type === 'transfer' && t.toAccId === accId);
            const colorCls = isOutflow ? 'theme-val-exp' : (isInflow ? 'theme-val-inc' : 'theme-text');
            const sign = isOutflow ? '-' : '+';
            const iClass = isOutflow ? 'fa-arrow-down text-red-500 bg-red-50' : (isInflow ? 'fa-arrow-up text-emerald-500 bg-emerald-50' : 'fa-right-left text-indigo-500 bg-indigo-50');
            const creatorBadge = t.createdBy ? `<span class="bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-md ml-1"><i class="fa-solid fa-user"></i> ${t.createdBy.split(' ')[0]}</span>` : '';
            const amtFull = `${sign}${fmt(t.amount, t.currency)}`;
            const titleTxt = nexusFormatAccountTxTitle(t).replace(/</g, '&lt;');
            const isCreditAcc = acc && nexusIsLiabAccount(acc);
            const ccLoan = isCreditAcc && (t.isCCPurchase || (t.cat && String(t.cat).includes('[Crédito]'))) ? nexusFindLoanByPurchaseTx(t) : null;
            const clickAttrs = ccLoan
                ? `data-nexus-action="nexusToggleCcTxAmortCard" data-nexus-payload='["${t.id}","${accId}"]' data-nexus-pass-event="1"`
                : `data-nexus-action="editTransaction" data-nexus-arg="${t.id}"`;
            const amortBadge = ccLoan ? '<span class="bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-md ml-1 text-[7px] font-black uppercase">Cuotas</span>' : '';
            return `<div class="acc-hist-card theme-card p-3 rounded-2xl shadow-sm border border-slate-50/50 mb-2 min-w-0 max-w-full overflow-hidden">
                <div class="flex items-center gap-2 min-w-0">
                    <div class="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer" ${clickAttrs}>
                        <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iClass.split(' ').slice(1).join(' ')}"><i class="fa-solid ${iClass.split(' ')[0]} text-[10px]"></i></div>
                        <div class="min-w-0 flex-1">
                            <p class="text-[10px] font-black uppercase theme-text truncate">${titleTxt}${amortBadge}</p>
                            <p class="text-[8px] font-bold text-slate-400 uppercase mt-0.5 flex items-center flex-wrap">${dDate.toLocaleDateString('es-CO')} ${timeStr}${creatorBadge}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0 min-w-0">
                        <div class="acc-tx-amt-wrap nexus-amount-box"><span class="acc-tx-amt nexus-amount-fit font-black ${colorCls}" title="${amtFull}">${amtFull}</span></div>
                        <button type="button" title="Eliminar de raíz" data-nexus-action="promptRootDeleteTransaction" data-nexus-payload='["${t.id}", "${accId}"]' data-nexus-pass-event="1" class="w-8 h-8 rounded-full bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 flex items-center justify-center transition-colors active:scale-90 shrink-0"><i class="fa-solid fa-eraser text-[10px]"></i></button>
                    </div>
                </div>
            </div>`;
        }

        function nexusAccountTxListForCard(accId) {
            const acc = (state.accounts || []).find(a => a.id === accId);
            if (!acc) return [];
            return nexusGetOperationalTxList()
                .filter(t => (acc.isShared
                    ? nexusTxBelongsToSharedAccountLocal(t, acc, null)
                    : (t.accId === accId || (t.type === 'transfer' && t.toAccId === accId))))
                .filter(t => t.type !== 'afterpay')
                .filter(t => !nexusShouldHideScannerTxInAccountList(t, acc))
                .sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        function nexusRefreshOpenAccountTxPanel(accId) {
            const el = $id('acc-tx-' + accId);
            if (!el || el.classList.contains('hidden')) return;
            const acc = (state.accounts || []).find(a => a.id === accId);
            if (!acc) return;
            const txs = nexusAccountTxListForCard(accId);
            const summaryHtml = nexusBuildScannerImportSummaryHtml(accId, acc);
            if (!summaryHtml && txs.length === 0) {
                el.innerHTML = '<p class="text-[10px] text-center text-slate-400 font-bold uppercase py-2">Sin transacciones.</p>';
            } else {
                el.innerHTML = summaryHtml + txs.slice(0, 50).map(t => nexusBuildAccountTxRowHtml(t, accId, acc)).join('');
            }
            requestAnimationFrame(() => fitNexusAmounts(el));
        }

        function nexusRefreshSharedAccountCardBalance(accId) {
            const acc = (state.accounts || []).find(a => a.id === accId);
            if (!acc) return;
            const panel = $id('acc-tx-' + accId);
            const card = panel && panel.closest('.acc-vault-card');
            if (!card) return;
            const curr = acc.currency || (state.settings && state.settings.baseCurrency) || 'COP';
            const color = acc.balance >= 0 ? 'text-emerald-600' : 'text-rose-600';
            const sign = acc.balance >= 0 ? '+' : '';
            const balFull = `${sign}${fmt(acc.balance, curr)}`;
            const amtEl = card.querySelector('.acc-vault-amt');
            if (amtEl) {
                amtEl.innerText = balFull;
                amtEl.title = balFull;
                amtEl.className = 'acc-vault-amt nexus-amount-fit nexus-amt-summary nexus-amt-compact font-black ' + color;
            }
            requestAnimationFrame(() => fitNexusAmounts(card));
        }

        function toggleAccountTx(id) {
            const el = $id('acc-tx-' + id);
            if(!el) return;
            if(el.classList.contains('hidden')) {
                el.classList.remove('hidden'); el.classList.add('flex');
                const acc = state.accounts.find(a => a.id === id);
                const txs = nexusAccountTxListForCard(id);
                const summaryHtml = nexusBuildScannerImportSummaryHtml(id, acc);
                if (!summaryHtml && txs.length === 0) {
                    el.innerHTML = '<p class="text-[10px] text-center text-slate-400 font-bold uppercase py-2">Sin transacciones.</p>';
                    return;
                }
                el.innerHTML = summaryHtml + txs.slice(0, 50).map(t => nexusBuildAccountTxRowHtml(t, id, acc)).join('');
                requestAnimationFrame(() => fitNexusAmounts(el));
            } else {
                el.classList.add('hidden'); el.classList.remove('flex');
            }
        }
        
        // Restauración de funciones del modal de Historial de Cuenta
        function openAccountHistory(id) { currentHistAccId = id; const acc = state.accounts.find(a => a.id === id); if(!acc) return; const mod = $id('account-history-modal'); if(mod) nexusShowModalInstant(mod); $id('hist-acc-name').innerText = acc.name; const balEl = $id('hist-acc-balance'); const balTxt = fmt(acc.balance, acc.currency); if (balEl) { balEl.innerText = balTxt; balEl.title = balTxt; } setHistFilter(NEXUS_FILTER_DEFAULTS.histAccount); requestAnimationFrame(() => fitNexusAmounts(mod)); }
        function closeAccountHistory() { nexusHideModalInstant($id('account-history-modal')); currentHistAccId = null; }
        function setHistFilter(period) { currentHistPeriod = period; $qAll('#account-history-modal .filter-chip').forEach(b => b.classList.remove('active')); const btn = $id('hf-' + period); if(btn) btn.classList.add('active'); renderHistAccList(); }
        function renderHistAccList() {
            const list = $id('hist-acc-list'); if(!list || !currentHistAccId) return; const acc = state.accounts.find(a => a.id === currentHistAccId); if(!acc) return;
            let txs = nexusAccountTxListForCard(currentHistAccId);
            const now = new Date();
            if(currentHistPeriod === '30d') { const past30 = new Date(now.getTime() - 30 * 86400000); txs = txs.filter(t => new Date(t.date) >= past30); } else if(currentHistPeriod === 'month') { txs = txs.filter(t => new Date(t.date).getMonth() === now.getMonth() && new Date(t.date).getFullYear() === now.getFullYear()); } else if(currentHistPeriod === 'year') { txs = txs.filter(t => new Date(t.date).getFullYear() === now.getFullYear()); }
            txs.sort((a,b) => new Date(b.date) - new Date(a.date));
            const summaryHtml = nexusBuildScannerImportSummaryHtml(currentHistAccId, acc);
            if (!summaryHtml && txs.length === 0) { list.innerHTML = '<p class="text-center text-[10px] font-bold uppercase text-slate-400 mt-4">No hay transacciones en este periodo.</p>'; return; }
            list.innerHTML = summaryHtml + txs.map(t => nexusBuildAccountTxRowHtml(t, currentHistAccId, acc)).join('');
            requestAnimationFrame(() => fitNexusAmounts(list));
        }

        function nexusAccountCardRowBundle(a, curr) {
            const type = a.type || 'liquid';
            const isShared = !!a.isShared;
            const isTerceros = type === 'terceros';
            const isVirtual = type === 'virtual';
            const isRotativo = type === 'rotativo';
            let icon = isShared ? 'fa-link' : (isTerceros ? 'fa-users' : (isVirtual ? 'fa-mobile-screen' : nexusAccountCardIcon(type)));
            let color = nexusIsLiabAccount(a) ? 'theme-val-exp' : (type === 'investment' ? 'theme-val-inc' : 'theme-text');
            if (isVirtual && !nexusIsLiabAccount(a)) color = a.balance < 0 ? 'theme-val-exp' : (a.balance > 0 ? 'theme-val-inc' : 'theme-text');
            if (isTerceros) color = a.balance < 0 ? 'text-red-500' : 'text-orange-500';
            if (isRotativo) color = 'theme-val-exp';
            const sign = (nexusIsLiabAccount(a) || isRotativo) ? '-' : '';
            const detailText = nexusAccountMetaLine(a, curr);
            const customStyle = a.color ? `background-color: var(--card-bg, #ffffff); border: 2px solid ${a.color};` : 'background-color: var(--card-bg, #ffffff); border: 1.5px solid rgba(148,163,184,0.18);';
            let iconBg = a.color ? `background-color: ${a.color}; border: 2px solid #ffffff40; color: #ffffff;` : 'background-color: #f1f5f9; color: #64748b;';
            if (!a.color) {
                if (isRotativo) iconBg = 'background-color: #ccfbf1; color: #0d9488;';
                else if (isVirtual || isShared) iconBg = 'background-color: #f3e8ff; color: #a855f7;';
                else if (isTerceros) iconBg = 'background-color: #fff7ed; color: #f97316;';
            }
            const iconContent = a.logoUrl
                ? `<img src="${a.logoUrl}" class="w-full h-full object-cover rounded-full bg-white p-0.5 shadow-sm${isShared ? ' border border-purple-200' : ''}">`
                : `<i class="fa-solid ${icon} text-[14px]"></i>`;
            return { color, sign, detailText, customStyle, iconBg, iconContent, p2pBtn: nexusAccountP2pBtnHtml(a) };
        }

        function nexusRequireFormFields(fields, opts) {
            const o = opts || {};
            const name = fields.name != null ? String(fields.name).trim() : '';
            const amount = Number(fields.amount);
            const date = fields.date != null ? String(fields.date).trim() : '';
            if (!name || amount <= 0 || !date) {
                const msg = o.message || (o.budget
                    ? 'Llena todos los campos. El presupuesto debe ser mayor a cero.'
                    : (o.numpad ? 'Llena todos los campos usando el teclado numérico.' : 'Completa todos los campos.'));
                alert(msg);
                return false;
            }
            return true;
        }

        function buildAccountCardHtml(a, curr, color, sign, detailText, customStyle, iconBg, iconContent, p2pBtn) {
            const safeId = String(a.id).replace(/'/g, "\\'");
            const balFull = `${sign}${fmt(a.balance, curr)}`;
            const idSub = nexusAccountIdentitySubtitle(a);
            const idLine = idSub ? `<p class="text-[9px] font-bold text-slate-600 font-mono truncate leading-tight" title="${idSub.replace(/"/g, '&quot;')}">${idSub}</p>` : '';
            const metaLine = detailText ? `<p class="text-[8px] font-bold text-slate-500 uppercase truncate leading-tight">${detailText}</p>` : '';
            const creditPayBtn = (nexusIsRotativoAccount(a) && (a.pseLinkId || a.paymentNic))
                ? `<button type="button" data-nexus-action="openAccountCreditPSEPay" data-nexus-arg="${safeId}" class="text-emerald-600 hover:text-emerald-700 transition-colors p-1" title="Pagar tarjeta vía PSE"><i class="fa-solid fa-bolt text-[11px]"></i></button>`
                : '';
            return `<div class="acc-vault-card flex flex-col py-1 px-2 hover:bg-slate-50 rounded-[1rem] transition-all shadow-sm min-w-0 max-w-full overflow-hidden" style="${customStyle}"><div class="flex justify-between items-center gap-1.5 min-w-0"><div role="button" tabindex="0" data-nexus-action="toggleAccountTx" data-nexus-arg="${safeId}" class="flex items-center gap-2 min-w-0 flex-1 pr-1 cursor-pointer"><div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm" style="${iconBg}">${iconContent}</div><div class="min-w-0 flex-1 acc-vault-meta"><p class="text-xs font-black uppercase theme-text truncate leading-tight">${a.name}</p>${idLine}${metaLine}</div></div><div class="acc-vault-amt-wrap nexus-amount-box shrink min-w-0"><span class="acc-vault-amt nexus-amount-fit nexus-amt-summary nexus-amt-compact font-black ${color}" title="${balFull}">${balFull}</span></div><div class="acc-vault-actions flex flex-col items-center shrink-0 relative z-10" data-nexus-stop-propagation="1">${p2pBtn}${creditPayBtn}<button type="button" data-nexus-action="editAccount" data-nexus-arg="${safeId}" class="text-slate-400 hover:text-blue-600 transition-colors p-1" title="Editar cuenta"><i class="fa-solid fa-pen text-[11px]"></i></button><button type="button" data-nexus-action="openAccountHistory" data-nexus-arg="${safeId}" class="text-slate-400 hover:text-indigo-600 transition-colors p-1" title="Historial"><i class="fa-solid fa-clock-rotate-left text-[11px]"></i></button></div></div><div id="acc-tx-${safeId}" class="hidden flex-col gap-2 pt-2 border-t border-slate-200 mt-2 animate-slideUp max-h-[400px] overflow-y-auto hide-scrollbar"></div></div>`;
        }

        function openAccountCreditPSEPay(accId) {
            const acc = (state.accounts || []).find(a => a.id === accId);
            if (!acc) return;
            const link = acc.pseLinkId ? (state.pseLinks || []).find(p => p.id === acc.pseLinkId) : null;
            const nic = String(acc.paymentNic || (link && link.reference) || acc.accountNumber || '').trim();
            const url = (link && link.url) ? link.url : '';
            if (!nic && !url) return alert('Configura el NIC y el enlace PSE en la tarjeta de crédito.');
            copyAndPayPSE(nic, url || 'https://');
        }

        function resetAccountFormForNew() {
            if($id('acc-form-title')) $id('acc-form-title').innerText = "Nueva Cuenta";
            if($id('fa-id')) $id('fa-id').value = '';
            if($id('fa-name')) $id('fa-name').value = '';
            if($id('fa-currency')) $id('fa-currency').value = state.settings.baseCurrency || 'COP';
            const scp = $id('fa-scope'); if(scp) scp.value = 'personal';
            const balEl = $id('fa-balance'); if(balEl) { balEl.value = ''; balEl.dataset.raw = ''; }
            if($id('fa-type')) $id('fa-type').value = 'liquid';
            if($id('fa-color')) $id('fa-color').value = '#e2e8f0';
            if($id('fa-bank-url')) $id('fa-bank-url').value = '';
            if($id('fa-account-number')) $id('fa-account-number').value = '';
            if($id('fa-bsb')) $id('fa-bsb').value = '';
            if($id('fa-pse-link')) $id('fa-pse-link').value = '';
            if($id('fa-payment-nic')) $id('fa-payment-nic').value = '';
            if($id('fa-custom-logo-b64')) $id('fa-custom-logo-b64').value = '';
            if(typeof updateBankLogoPreview === 'function') updateBankLogoPreview();
            if(typeof nexusOnAccountCurrencyChange === 'function') nexusOnAccountCurrencyChange();
            ['fa-virtual-limit','fa-virtual-term','fa-virtual-payday','fa-limit','fa-cutoff','fa-payday','fa-rate'].forEach(id => {
                const el = $id(id); if(el) { el.value=''; el.dataset.raw=''; }
            });
            const vPlat = $id('fa-virtual-platform'); if(vPlat) vPlat.value = 'latitud';
            toggleCreditFields();
            const delBtn = $id('btn-delete-account'); if(delBtn) delBtn.classList.add('hidden');
            const recBtn = $id('btn-reconcile-account'); if(recBtn) recBtn.classList.add('hidden');
            if (typeof nexusUpdateAccountShareTokenButton === 'function') nexusUpdateAccountShareTokenButton();
        }

        function fillAccountFormFromAccount(acc) {
            if(!acc) return;
            if($id('acc-form-title')) $id('acc-form-title').innerText = "Detalles y Edición";
            if($id('fa-id')) $id('fa-id').value = acc.id;
            if($id('fa-name')) $id('fa-name').value = String(acc.name || '').replace(/^👥\s*/, '');
            if($id('fa-currency')) $id('fa-currency').value = acc.currency || 'COP';
            const scp = $id('fa-scope'); if(scp) scp.value = acc.isShared ? 'shared' : 'personal';
            const balEl = $id('fa-balance');
            if(balEl) { balEl.dataset.raw = String(acc.balance ?? 0); balEl.value = fmt(acc.balance, acc.currency || 'COP'); }
            if($id('fa-type')) $id('fa-type').value = acc.type || 'liquid';
            if($id('fa-color')) $id('fa-color').value = acc.color || '#e2e8f0';
            if($id('fa-bank-url')) $id('fa-bank-url').value = acc.bankUrl || '';
            if($id('fa-account-number')) $id('fa-account-number').value = acc.accountNumber || '';
            if($id('fa-bsb')) $id('fa-bsb').value = acc.bsb || '';
            const customB64 = $id('fa-custom-logo-b64');
            if(customB64) customB64.value = (acc.logoUrl && acc.logoUrl.startsWith('data:image')) ? acc.logoUrl : '';
            if(typeof updateBankLogoPreview === 'function') {
                const preview = $id('fa-logo-preview');
                if (acc.logoUrl && acc.logoUrl.startsWith('data:image') && preview) {
                    preview.innerHTML = `<img src="${acc.logoUrl}" class="w-full h-full object-cover">`;
                } else if (acc.logoUrl && preview) {
                    preview.innerHTML = `<img src="${acc.logoUrl}" class="w-full h-full object-cover" onerror="this.onerror=null; if(typeof updateBankLogoPreview==='function')updateBankLogoPreview();">`;
                } else updateBankLogoPreview();
            }
            toggleCreditFields();
            nexusOnAccountCurrencyChange();
            if(acc.type === 'credit' || acc.type === 'rotativo') {
                const limEl = $id('fa-limit'); if(limEl) { limEl.dataset.raw = String(acc.limit||0); limEl.value = fmt(acc.limit||0, acc.currency); }
                const cutEl = $id('fa-cutoff'); if(cutEl) { cutEl.dataset.raw = String(acc.cutoffDay||1); cutEl.value = acc.cutoffDay||1; }
                const payEl = $id('fa-payday'); if(payEl) { payEl.dataset.raw = String(acc.payDay||15); payEl.value = acc.payDay||15; }
                const rateEl = $id('fa-rate'); if(rateEl) { rateEl.dataset.raw = String(acc.rate||0); rateEl.value = acc.rate||0; }
                if (acc.type === 'rotativo') {
                    if (typeof populateAccountPseSelect === 'function') populateAccountPseSelect();
                    const pseSel = $id('fa-pse-link'); if (pseSel) pseSel.value = acc.pseLinkId || '';
                    const nicEl = $id('fa-payment-nic'); if (nicEl) nicEl.value = acc.paymentNic || '';
                }
            } else if(acc.type === 'virtual') {
                const vLimEl = $id('fa-virtual-limit'); if(vLimEl) { vLimEl.dataset.raw = String(acc.limit||0); vLimEl.value = fmt(acc.limit||0, acc.currency); }
                const vTerm = $id('fa-virtual-term'); if(vTerm) { vTerm.dataset.raw = String(acc.virtualTerm||''); vTerm.value = acc.virtualTerm||''; }
                const vPay = $id('fa-virtual-payday'); if(vPay) { vPay.dataset.raw = String(acc.payDay||''); vPay.value = acc.payDay||''; }
                const vPlat = $id('fa-virtual-platform'); if(vPlat) vPlat.value = acc.platform || 'latitud';
            }
            const delBtn = $id('btn-delete-account');
            if(delBtn) { delBtn.innerText = acc.isShared ? "Desvincular Bóveda P2P" : "Eliminar Cuenta"; delBtn.classList.remove('hidden'); }
            const recBtn = $id('btn-reconcile-account'); if(recBtn) recBtn.classList.remove('hidden');
            if (typeof nexusUpdateAccountShareTokenButton === 'function') nexusUpdateAccountShareTokenButton();
        }

        function openAccountModal(editId) {
            const mod = $id('new-account-modal'); if(!mod) return;
            const accScroll = mod.querySelector('.nexus-modal-scroll-body');
            if (accScroll) accScroll.scrollTop = 0;
            if (editId) {
                const acc = (state.accounts || []).find(a => a.id === editId);
                if (!acc || nexusIsAccountTombstoned(editId, acc.remoteId)) {
                    nexusHideModalInstant(mod);
                    renderAccountsTab();
                    return;
                }
                nexusShowModalInstant(mod);
                fillAccountFormFromAccount(acc);
            } else {
                nexusShowModalInstant(mod);
                resetAccountFormForNew();
            }
            setTimeout(() => { const nm = $id('fa-name'); if(nm) nm.focus(); }, 80);
        }

        function editAccount(id) { openAccountModal(id); }

        function closeAccountModal() { nexusHideModalInstant($id('new-account-modal')); }

        function reconcileAccountToZero() {
            const id = $id('fa-id').value;
            if(!id) return;
            const acc = state.accounts.find(a => a.id === id);
            if(!acc) return;
            
            if(acc.balance === 0) {
                alert("La cuenta ya se encuentra en $0.");
                return;
            }
            
            // Requiere Autenticación antes de conciliar
            requireAuthForAction(() => {
                triggerUIConfirm(`¿Deseas conciliar la cuenta a $0? Se creará una transacción de ajuste automático por ${fmt(Math.abs(acc.balance), acc.currency)}.`, 'reconcile_zero', id);
            }, "Autoriza la conciliación de esta bóveda a $0.");
        }

        function executeReconcileZero(id) {
            const acc = state.accounts.find(a => a.id === id);
            if(!acc || acc.balance === 0) return;

            const amount = acc.balance;
            let txType = '';
            
            if (nexusIsLiabAccount(acc)) {
                txType = amount > 0 ? 'income' : 'expense';
            } else {
                txType = amount > 0 ? 'expense' : 'income';
            }

            const absAmount = Math.abs(amount);
            const catName = '🔄 Ajuste Contable';

            nexusEnsureCategoryBuckets();
            const adjBucket = nexusCatKindForTxType(txType);
            if(!state.categories[adjBucket].includes(catName)) {
                state.categories[adjBucket].push(catName);
            }
            
            const newTx = buildTransactionSchema({
                type: txType,
                amount: absAmount,
                cat: catName,
                accId: acc.id,
                date: new Date().toISOString(),
                note: '[Conciliación] Ajuste automático a $0',
                currency: acc.currency,
                costType: 'fixed'
            });

            if (userProfile && userProfile.name) newTx.createdBy = userProfile.name;
            
            state.tx.push(newTx);
            saveCloudTx(newTx);
            
            acc.balance = 0;
            
            saveState({ cloudHint: { reason: 'tx', tx: newTx } });
            
            alert("✅ Cuenta conciliada a $0 exitosamente mediante ajuste automático.");
        }
        // --- INICIO REORDENAR CUENTAS ---
        function openReorderModal() {
            const mod = $id('reorder-accounts-modal');
            if(!mod) return;
            renderReorderList();
            nexusShowModalInstant(mod);
        }

        function closeReorderModal() { nexusHideModalInstant($id('reorder-accounts-modal')); }

        function renderReorderList() {
            const list = $id('reorder-accounts-list');
            if(!list) return;

            if(!state.accounts || state.accounts.length === 0) {
                list.innerHTML = '<p class="text-xs text-center text-slate-400 font-bold p-6 border border-dashed rounded-3xl">No hay bóvedas creadas.</p>';
                return;
            }

            list.innerHTML = state.accounts.map((a, i) => {
                let badgeColor = 'bg-slate-100 text-slate-500 border-slate-200';
                if(a.isShared) badgeColor = 'bg-purple-50 text-purple-600 border-purple-200';
                else if(a.type === 'terceros') badgeColor = 'bg-orange-50 text-orange-600 border-orange-200';
                else if(a.type === 'virtual') badgeColor = 'bg-indigo-50 text-indigo-600 border-indigo-200';
                else if(a.type === 'credit') badgeColor = 'bg-red-50 text-red-600 border-red-200';
                else if(a.type === 'rotativo') badgeColor = 'bg-teal-50 text-teal-700 border-teal-200';

                return `<div class="flex items-center justify-between p-3 bg-slate-50 hover:bg-white border border-slate-100 hover:border-indigo-200 rounded-[1.25rem] shadow-sm transition-colors">
                    <div class="flex items-center gap-3 overflow-hidden">
                        <div class="flex flex-col gap-1 shrink-0 bg-white p-1 rounded-lg border border-slate-100 shadow-sm">
                            <button type="button" data-nexus-action="moveAccountOrder" data-nexus-payload='["${i}", -1]' class="text-slate-400 hover:text-indigo-500 active:scale-90 p-1 transition-colors" ${i === 0 ? 'disabled style="opacity:0.2"' : ''}><i class="fa-solid fa-chevron-up text-[10px]"></i></button>
                            <button type="button" data-nexus-action="moveAccountOrder" data-nexus-payload='["${i}", 1]' class="text-slate-400 hover:text-indigo-500 active:scale-90 p-1 transition-colors" ${i === state.accounts.length - 1 ? 'disabled style="opacity:0.2"' : ''}><i class="fa-solid fa-chevron-down text-[10px]"></i></button>
                        </div>
                        <div class="truncate">
                            <p class="text-[10px] font-black uppercase text-slate-700 truncate">${a.name}</p>
                            <p class="text-[7px] font-black uppercase mt-1 px-1.5 py-0.5 rounded shadow-sm border inline-block ${badgeColor}">${a.currency || state.settings.baseCurrency} • ${a.type}</p>
                        </div>
                    </div>
                    <i class="fa-solid fa-grip-lines text-slate-300 ml-2 shrink-0"></i>
                </div>`;
            }).join('');
        }

        function moveAccountOrder(index, direction) {
            if (index + direction < 0 || index + direction >= state.accounts.length) return;
            
            // Swap atómico
            const temp = state.accounts[index];
            state.accounts[index] = state.accounts[index + direction];
            state.accounts[index + direction] = temp;

            renderReorderList();
            saveState();
            renderAccountsTab();
            updateDashboard(); // Refresca los sumadores globales en el mismo orden
        }
        // --- FIN REORDENAR CUENTAS ---
        
        function deleteAccount() {
            const id = $id('fa-id').value; if(!id) return; const acc = state.accounts.find(a => a.id === id); if(!acc) return;
            
            if (state.accounts.length <= 1) {
                return alert("⚠️ SISTEMA PROTEGIDO:\nNo puedes eliminar la única bóveda de tu sistema. Crea otra primero.");
            }

            requireAuthForAction(() => {
                if (acc.isShared && !nexusIsAccountVaultOwner(acc)) {
                    triggerUIDelete('account_shared', id);
                    return;
                }
                if (acc.isShared && nexusIsAccountVaultOwner(acc)) {
                    openAccountDeleteOptionsModal(acc);
                    return;
                }
                openAccountDeleteOptionsModal(acc);
            }, "Autoriza la eliminación de esta bóveda.");
        }

        function openAccountDeleteOptionsModal(acc) {
            const mod = $id('account-delete-options-modal');
            const msg = $id('account-delete-options-msg');
            const hid = $id('account-delete-options-id');
            if (!mod || !acc) return;
            if (hid) hid.value = acc.id;
            if (msg) {
                msg.textContent = acc.isShared
                    ? `Eres el creador de «${acc.name}». Elige cómo eliminar esta bóveda compartida en Firebase y en tus dispositivos.`
                    : `Eliminar «${acc.name}». Elige si conservas el historial en auditoría o borras todo.`;
            }
            nexusShowModalInstant(mod);
        }

        function closeAccountDeleteOptionsModal() {
            const mod = $id('account-delete-options-modal');
            if (mod) mod.classList.add('hidden');
        }

        function confirmAccountDeleteMode(mode) {
            const id = $id('account-delete-options-id')?.value;
            closeAccountDeleteOptionsModal();
            if (!id) return;
            executeAccountDeletion(id, mode);
        }

        async function executeAccountDeletion(id, mode) {
            const acc = state.accounts.find(a => a.id === id);
            if (!acc) return;
            const deleteMode = mode === 'purge' ? 'purge' : 'audit';
            const relatedTx = (state.tx || []).filter(t => t && (t.accId === id || t.toAccId === id));
            const purgedTxIds = relatedTx.map(t => t.id).filter(Boolean);

            if (deleteMode === 'audit') {
                const now = Date.now();
                relatedTx.forEach(t => {
                    t.auditArchived = true;
                    t.auditAccountId = id;
                    t.auditAccountName = acc.name || 'Cuenta eliminada';
                    t.updatedAt = now;
                });
            } else {
                relatedTx.forEach(t => { if (typeof nexusReverseTxBalanceEffect === 'function') nexusReverseTxBalanceEffect(t); });
                state.tx = (state.tx || []).filter(t => t.accId !== id && t.toAccId !== id);
            }

            state.accounts = state.accounts.filter(a => a.id !== id);
            if (state.loans) state.loans = state.loans.filter(l => l.cardId !== id);

            nexusRecordAccountDeletion(acc, deleteMode, purgedTxIds);

            if (acc.isShared && acc.remoteId) {
                if (nexusIsAccountVaultOwner(acc)) {
                    await nexusDeleteSharedVaultFromCloud(acc.remoteId);
                }
            }

            if (acc.remoteId) setTimeout(() => scheduleP2PListenersAttach(true), 50);

            nexusApplyAccountTombstonesToState();
            nexusMarkPersonalCloudDirty(['accounts', 'tombstones']);
            saveState({ cloudHint: { reason: 'account-delete', module: 'accounts' } });
            closeAccountModal();
            nexusRefreshAllModules();

            const msg = deleteMode === 'audit'
                ? '✅ Cuenta eliminada. Los movimientos siguen en Auditoría sin afectar balances activos.'
                : '✅ Cuenta y transacciones eliminadas por completo (local y nube).';
            alert(msg);
        }

        function executeSharedAccountUnlink(id) {
            const acc = state.accounts.find(a => a.id === id);
            if (!acc) {
                closeAccountModal();
                closeUIDeleteModal();
                renderAccountsTab();
                return;
            }
            const purgedTxIds = (state.tx || []).filter(t => t && (t.accId === id || t.toAccId === id)).map(t => t.id).filter(Boolean);
            state.accounts = state.accounts.filter(a => a.id !== id);
            state.tx = (state.tx || []).filter(t => t.accId !== id && t.toAccId !== id);
            nexusRecordAccountDeletion(acc, 'unlink', purgedTxIds);
            setTimeout(() => scheduleP2PListenersAttach(true), 50);
            nexusApplyAccountTombstonesToState();
            nexusMarkPersonalCloudDirty(['accounts', 'tombstones']);
            saveState({ cloudHint: { reason: 'account-unlink', module: 'accounts' } });
            updateDashboard();
            renderAccountsTab();
            closeAccountModal();
            closeUIDeleteModal();
            alert('✅ Bóveda compartida desvinculada. No volverá a sincronizarse en este dispositivo.');
        }
        
        function nexusAccountIdentitySubtitle(acc) {
            if (!acc) return '';
            const bits = [];
            if (acc.accountNumber) {
                const lbl = (nexusIsLiabAccount(acc) || acc.type === 'virtual') ? 'Tarjeta' : 'Cuenta';
                bits.push(`${lbl} ${String(acc.accountNumber).trim()}`);
            }
            if (acc.bsb) bits.push(`BSB ${String(acc.bsb).trim()}`);
            return bits.join(' · ');
        }

        function nexusAccountMetaLine(acc, curr) {
            if (!acc) return '';
            if (nexusIsLiabAccount(acc)) return `TC · Cupo: ${fmt(acc.limit || 0, curr)} | Corte: ${acc.cutoffDay || 'N/A'} | Pago: ${acc.payDay || 'N/A'}`;
            if (acc.type === 'rotativo') return `Rotativo · Cupo: ${fmt(acc.limit || 0, curr)} | Corte: ${acc.cutoffDay || 'N/A'} | Pago: ${acc.payDay || 'N/A'}`;
            if (acc.type === 'virtual') return `App: ${acc.platform ? acc.platform.toUpperCase() : 'N/A'} | Cupo: ${fmt(acc.limit || 0, curr)}`;
            if (acc.isShared) return `Conexión P2P activa`;
            if (acc.type === 'terceros') return `Cuenta externa aislada`;
            return '';
        }

        function nexusNormalizeAfterpayAuditCat(cat) {
            const c = cat || '🛍️ Afterpay';
            return String(c).includes('Afterpay') ? c : '🛍️ Afterpay';
        }

        /** Proyecciones Afterpay + deudas activas para auditoría (cronograma + enriched, sin duplicar). */
        function nexusCollectAuditProjections(cDisplay) {
            const apSchedule = nexusBuildAfterpayAuditSchedule(cDisplay);
            const debtSchedule = nexusBuildDebtAuditSchedule(cDisplay);
            const prevCurr = state.activeCurrency;
            state.activeCurrency = 'GLOBAL';
            const fromEnriched = getEnrichedTx().filter(t => {
                const id = String(t.id || '');
                return id.startsWith('proj_ap_') || id.startsWith('audit_ap_')
                    || id.startsWith('proj_loan_') || id.startsWith('proj_pend_') || id.startsWith('proj_recur_');
            }).map(t => {
                const id = String(t.id || '');
                const renderType = id.startsWith('proj_ap_') || (t.cat || '').includes('Afterpay') ? 'afterpay'
                    : (id.startsWith('proj_pend_') ? 'single_debt' : 'debt');
                return {
                    ...t,
                    renderType: t.renderType || renderType,
                    cat: renderType === 'afterpay' ? nexusNormalizeAfterpayAuditCat(t.cat) : t.cat,
                    original_amount: t.original_amount != null ? t.original_amount : t.amount,
                    original_currency: t.original_currency || t.currency,
                    currency: t.currency || cDisplay
                };
            });
            state.activeCurrency = prevCurr;
            const map = new Map();
            const ingest = (r, rType) => {
                if (!r || !r.id) return;
                if (rType === 'afterpay') {
                    r.cat = nexusNormalizeAfterpayAuditCat(r.cat);
                    r.renderType = 'afterpay';
                } else if (!r.renderType) {
                    r.renderType = rType || 'debt';
                }
                map.set(r.id, r);
            };
            apSchedule.forEach(r => ingest(r, 'afterpay'));
            debtSchedule.forEach(r => ingest(r, 'debt'));
            fromEnriched.forEach(r => { if (r && r.id && !map.has(r.id)) map.set(r.id, r); });
            return Array.from(map.values()).filter(t => nexusShouldShowTxInAudit(t));
        }

        function nexusCurrencyUsesDecimals(currency) {
            return nexusResolveDecimalPlaces(currency) > 0;
        }

        function nexusFormatNumpadLiveCurrency(rawStr, currency) {
            const c = currency || state.settings.baseCurrency || 'COP';
            if (!rawStr || rawStr === '') return fmt(0, c);
            if (/[\+\-\*/()]/.test(rawStr)) return rawStr;
            const usesDec = nexusCurrencyUsesDecimals(c);
            const parts = String(rawStr).split('.');
            const intPart = parseInt(parts[0] || '0', 10);
            const safeInt = Number.isNaN(intPart) ? 0 : intPart;
            if (!usesDec) return fmt(parseFloat(rawStr) || safeInt, c);
            const intFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: c, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(safeInt);
            if (parts.length === 1) return intFmt;
            return intFmt + ',' + (parts[1] || '');
        }

        function populateAccountPseSelect() {
            const sel = $id('fa-pse-link');
            if (!sel) return;
            const prev = sel.value;
            sel.innerHTML = '<option value="">Sin enlace PSE</option>';
            (state.pseLinks || []).forEach(p => {
                if (!p || !p.id) return;
                const ref = p.reference ? (' • ' + p.reference) : '';
                sel.innerHTML += `<option value="${p.id}">${p.name}${ref}</option>`;
            });
            if (prev) sel.value = prev;
        }

        function nexusSyncAccountPaymentNicFromPse() {
            const sel = $id('fa-pse-link');
            const nic = $id('fa-payment-nic');
            if (!sel || !nic || !sel.value) return;
            const link = (state.pseLinks || []).find(p => p.id === sel.value);
            if (link && link.reference) nic.value = link.reference;
        }

        function nexusSyncLoanCreditRefFromPse() {
            const sel = $id('fl-pse-link');
            const refEl = $id('fl-credit-ref');
            if (!sel || !refEl || !sel.value) return;
            const link = (state.pseLinks || []).find(p => p.id === sel.value);
            if (link && link.reference) refEl.value = link.reference;
        }

        function nexusEnsurePseLinkForDebt(name, nic, urlHint) {
            if (!state.pseLinks) state.pseLinks = [];
            const ref = String(nic || '').trim();
            const label = String(name || 'Deuda bancaria').trim();
            let link = null;
            if (ref) link = (state.pseLinks || []).find(p => p.reference === ref && (p.type === 'debt' || !p.type));
            if (!link) {
                link = { id: 'pse_' + Date.now(), name: label, type: 'debt', reference: ref, url: urlHint || 'https://', icon: 'fa-building-columns', freq: 'none', cutoff: 0, payday: 0 };
                state.pseLinks.push(link);
            } else if (ref) {
                link.reference = ref;
                if (label) link.name = label;
            }
            return link;
        }

        function nexusUpsertLoanPseFromForm(loan) {
            if (!loan || loan.creditorType !== 'banco') return null;
            const nicEl = $id('fl-credit-ref');
            const nic = nicEl ? String(nicEl.value || '').trim() : '';
            const pseSel = $id('fl-pse-link');
            let linkId = (pseSel && pseSel.value) ? pseSel.value : (loan.pseLinkId || null);
            if (linkId) {
                const link = (state.pseLinks || []).find(p => p.id === linkId);
                if (link && nic) link.reference = nic;
                if (link) { loan.pseLinkId = link.id; loan.paymentNic = nic || link.reference || ''; return link; }
            }
            if (nic) {
                const link = nexusEnsurePseLinkForDebt(loan.name, nic);
                loan.pseLinkId = link.id;
                loan.paymentNic = nic;
                if (pseSel) pseSel.value = link.id;
                return link;
            }
            return null;
        }

        function nexusBuildAccountVaultProfile(acc) {
            if (!acc) return {};
            let logoUrl = acc.logoUrl || '';
            if (logoUrl.startsWith('data:image')) {
                if (logoUrl.length > 120000) {
                    logoUrl = faviconFromBankUrl(acc.bankUrl) || '';
                }
            } else if (logoUrl && String(logoUrl).length > 2048) {
                logoUrl = faviconFromBankUrl(acc.bankUrl) || String(logoUrl).slice(0, 512);
            }
            return {
                type: acc.type || 'liquid',
                color: acc.color || null,
                bankUrl: acc.bankUrl || '',
                logoUrl: logoUrl || null,
                accountNumber: String(acc.accountNumber || '').trim(),
                bsb: String(acc.bsb || '').trim(),
                platform: acc.platform || null,
                limit: acc.limit || 0,
                cutoffDay: acc.cutoffDay || 0,
                payDay: acc.payDay || 0,
                rate: acc.rate || 0,
                virtualTerm: acc.virtualTerm || null,
                pseLinkId: acc.pseLinkId || null,
                paymentNic: String(acc.paymentNic || '').trim(),
                profileUpdatedAt: acc.profileUpdatedAt || new Date().toISOString()
            };
        }

        function nexusMergeP2PAccountProfile(acc, data) {
            if (!acc || !data) return false;
            const remoteTs = Date.parse(data.profileUpdatedAt || data.updatedAt || 0) || 0;
            const localTs = Date.parse(acc.profileUpdatedAt || 0) || 0;
            if (remoteTs && localTs && remoteTs < localTs) return false;
            let changed = false;
            const apply = (key, val) => {
                if (val === undefined) return;
                if (acc[key] !== val) { acc[key] = val; changed = true; }
            };
            const applyNonEmpty = (key, val) => {
                if (val === undefined) return;
                const next = val == null ? '' : val;
                const cur = acc[key];
                if (next === '' && cur != null && String(cur).trim() !== '') return;
                apply(key, next);
            };
            const localLogo = acc.logoUrl != null ? String(acc.logoUrl) : '';
            const remoteLogo = data.logoUrl != null ? String(data.logoUrl) : '';
            if (nexusAccountLogoRich(localLogo) && !nexusAccountLogoRich(remoteLogo)) {
                /* conservar icono local (base64) */
            } else if (data.logoUrl != null) {
                applyNonEmpty('logoUrl', data.logoUrl || null);
            }
            applyNonEmpty('bankUrl', data.bankUrl != null ? (data.bankUrl || '') : undefined);
            apply('color', data.color !== undefined ? (data.color || null) : undefined);
            applyNonEmpty('accountNumber', data.accountNumber != null ? String(data.accountNumber || '').trim() : undefined);
            applyNonEmpty('bsb', data.bsb != null ? String(data.bsb || '').trim() : undefined);
            apply('type', data.type || undefined);
            apply('platform', data.platform !== undefined ? data.platform : undefined);
            apply('limit', data.limit != null ? data.limit : undefined);
            apply('cutoffDay', data.cutoffDay != null ? data.cutoffDay : undefined);
            apply('payDay', data.payDay != null ? data.payDay : undefined);
            apply('rate', data.rate != null ? data.rate : undefined);
            apply('virtualTerm', data.virtualTerm !== undefined ? data.virtualTerm : undefined);
            apply('pseLinkId', data.pseLinkId !== undefined ? data.pseLinkId : undefined);
            applyNonEmpty('paymentNic', data.paymentNic != null ? String(data.paymentNic || '').trim() : undefined);
            if (data.name) {
                const nm = String(data.name).replace(/^👥\s*/, '').trim();
                const nextName = acc.isShared ? ('👥 ' + nm) : nm;
                if (nm && acc.name !== nextName) { acc.name = nextName; changed = true; }
            }
            if (data.profileUpdatedAt) acc.profileUpdatedAt = data.profileUpdatedAt;
            else if (data.updatedAt) acc.profileUpdatedAt = data.updatedAt;
            return changed;
        }

        function toggleAccountIdentityFields() {
            const curr = $id('fa-currency') ? $id('fa-currency').value : 'COP';
            const type = $id('fa-type') ? $id('fa-type').value : 'liquid';
            const accLbl = $id('fa-account-number-lbl');
            const accInp = $id('fa-account-number');
            const bsbWrap = $id('fa-bsb-wrap');
            const bsbLbl = $id('fa-bsb-lbl');
            const bsbInp = $id('fa-bsb');
            if (accLbl) {
                if (nexusIsLiabAccount(type) || type === 'virtual') accLbl.innerText = 'Nº tarjeta (referencia)';
                else accLbl.innerText = 'Nº cuenta (referencia)';
            }
            if (accInp) {
                if (type === 'credit' || type === 'rotativo') accInp.placeholder = 'Ej: •••• 4242 o últimos dígitos';
                else if (type === 'virtual') accInp.placeholder = 'Ej: alias o últimos dígitos';
                else if (curr === 'EUR') accInp.placeholder = 'Ej: IBAN o número de cuenta';
                else accInp.placeholder = 'Ej: 1234567890';
            }
            if (bsbWrap) {
                const showBsb = curr !== 'COP';
                bsbWrap.classList.toggle('hidden', !showBsb);
                if (bsbLbl) {
                    if (curr === 'AUD') bsbLbl.innerText = 'BSB (Australia)';
                    else if (curr === 'EUR') bsbLbl.innerText = 'BIC / Sort code (opcional)';
                    else bsbLbl.innerText = 'Routing / ABA (opcional)';
                }
                if (bsbInp) {
                    if (curr === 'AUD') bsbInp.placeholder = 'Ej: 062-000';
                    else if (curr === 'EUR') bsbInp.placeholder = 'Ej: DEUTDEFF';
                    else bsbInp.placeholder = 'Ej: 021000021';
                }
            }
        }

        function toggleCreditFields() {
            const typeEl = $id('fa-type'); const type = typeEl ? typeEl.value : 'liquid';
            const scpEl = $id('fa-scope'); const scope = scpEl ? scpEl.value : 'personal';
            const fields = $id('credit-fields'); const vFields = $id('virtual-fields'); const rotPse = $id('rotativo-pse-fields');
            const helper = $id('fa-type-helper');

            if(fields) fields.classList.add('hidden'); if(vFields) vFields.classList.add('hidden');
            if(rotPse) rotPse.classList.add('hidden');
            if(helper) { helper.classList.add('hidden'); helper.innerHTML = ''; }
            const lim = $id('fa-limit'); if(lim) lim.required = false;

            if(type === 'credit' || type === 'rotativo') {
                if(fields) fields.classList.remove('hidden'); if(lim) lim.required = true;
            }
            if(type === 'rotativo') {
                if(rotPse) rotPse.classList.remove('hidden');
                if (typeof populateAccountPseSelect === 'function') populateAccountPseSelect();
            } else if (type === 'virtual') {
                if(vFields) vFields.classList.remove('hidden');
            }
            nexusUpdateAccountBalanceLabel();
            if (typeof toggleAccountIdentityFields === 'function') toggleAccountIdentityFields();
            
            // Textos de ayuda dinámicos para cuentas especiales con Aislamiento Patrimonial
            if (helper) {
                if (scope === 'shared') {
                    helper.innerHTML = '<i class="fa-solid fa-satellite-dish text-purple-500 mr-1"></i> <b>Bóveda Compartida:</b> Sincroniza movimientos, logo y números de cuenta/tarjeta (referencia) con otros usuarios P2P. No incluye datos de seguridad para banca en línea.';
                    helper.classList.remove('hidden');
                } else if (type === 'terceros') {
                    helper.innerHTML = '<i class="fa-solid fa-users text-orange-500 mr-1"></i> <b>Cuenta de Terceros:</b> Dinero que administras pero no es tuyo (caja menor de tu empresa, encargos, remesas). Totalmente aislada de tu patrimonio y KPIs personales.';
                    helper.classList.remove('hidden');
                } else if (type === 'rotativo') {
                    helper.innerHTML = '<i class="fa-solid fa-arrows-rotate text-teal-600 mr-1"></i> <b>Crédito rotativo:</b> Línea o cupo revolvente del banco con pago PSE y NIC. Usa <b>Cupo total</b> como límite y <b>Monto endeudado</b> como saldo que debes hoy (no el cupo libre).';
                    helper.classList.remove('hidden');
                } else if (type === 'credit') {
                    helper.innerHTML = '<i class="fa-solid fa-credit-card text-red-500 mr-1"></i> <b>Tarjeta de crédito:</b> al comprar, Nexus suma al monto endeudado y resta del cupo disponible automáticamente.';
                    helper.classList.remove('hidden');
                }
            }
            if (typeof nexusUpdateAccountShareTokenButton === 'function') nexusUpdateAccountShareTokenButton();
        }

        function copyAccountFormP2PToken() {
            const id = $id('fa-id') ? String($id('fa-id').value || '').trim() : '';
            if (!id) return alert('Primero guarda la cuenta con alcance «Compartida (P2P)»; luego copia el token nx_.');
            generateShareTokenForAccount(id);
        }

        function saveAccount(e) {
            e.preventDefault();
            const id = $id('fa-id') ? $id('fa-id').value : '';
            const name = $id('fa-name') ? $id('fa-name').value : '';
            const currency = $id('fa-currency') ? $id('fa-currency').value : 'COP';
            const balanceEl = $id('fa-balance');
            const balance = balanceEl ? (parseFloat(balanceEl.dataset.raw) || 0) : 0;
            const type = $id('fa-type') ? $id('fa-type').value : 'liquid';
            
            if(!balanceEl || balanceEl.dataset.raw === "" || balanceEl.dataset.raw === undefined) return alert("Por favor ingresa un balance inicial.");
            
            const color = ($id('fa-color') && $id('fa-color').value !== '#e2e8f0') ? $id('fa-color').value : null;
            const bankUrl = $id('fa-bank-url') ? $id('fa-bank-url').value.trim() : '';
            const accountNumber = $id('fa-account-number') ? String($id('fa-account-number').value || '').trim() : '';
            const bsb = $id('fa-bsb') ? String($id('fa-bsb').value || '').trim() : '';
            const customLogoB64 = $id('fa-custom-logo-b64') ? $id('fa-custom-logo-b64').value : '';
            let logoUrl = null;
            
            if (customLogoB64) {
                logoUrl = customLogoB64;
            } else if (bankUrl) {
                const lowerUrl = bankUrl.toLowerCase();
                if (lowerUrl.match(/\.(jpeg|jpg|gif|png|svg|webp)(\?.*)?$/) || lowerUrl.includes('firebasestorage') || lowerUrl.includes('drive.google') || lowerUrl.includes('image')) {
                    logoUrl = bankUrl;
                } else {
                    let domain = bankUrl.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split('/')[0];
                    if (domain) logoUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
                }
            } else if (id) {
                const prevAcc = state.accounts.find(a => a.id === id);
                if (prevAcc && prevAcc.logoUrl) logoUrl = prevAcc.logoUrl;
            }

            const scpEl = $id('fa-scope'); const isShared = scpEl ? (scpEl.value === 'shared') : false;
            const newId = id || ('acc_' + Date.now());
            let rId = null;
            if (isShared) {
                const ext = id ? state.accounts.find(a => a.id === id) : null;
                if (ext && ext.remoteId && String(ext.remoteId).startsWith('nxv_')) {
                    rId = ext.remoteId;
                } else {
                    rId = nexusGenerateP2PRemoteId('nxv_');
                }
            }

            const ownerEmail = nexusP2POwnerEmail();
            const ownerUid = (fbUser && fbUser.uid) || (userProfile && userProfile.linkedUid) || '';
            const displayName = isShared && name && !name.startsWith('👥') ? ('👥 ' + name) : name;
            let pseLinkId = null;
            let paymentNic = '';
            if (type === 'rotativo') {
                pseLinkId = ($id('fa-pse-link') && $id('fa-pse-link').value) ? $id('fa-pse-link').value : null;
                paymentNic = $id('fa-payment-nic') ? String($id('fa-payment-nic').value || '').trim() : '';
                if (pseLinkId && paymentNic) {
                    const pl = (state.pseLinks || []).find(p => p.id === pseLinkId);
                    if (pl) pl.reference = paymentNic;
                } else if (paymentNic && !pseLinkId) {
                    const pl = nexusEnsurePseLinkForDebt(displayName, paymentNic);
                    pseLinkId = pl.id;
                }
            }
            const usesCardFields = type === 'credit' || type === 'rotativo';
            const newAcc = {
                id: newId,
                name: displayName,
                currency, balance, type,
                isShared,
                limit: type === 'virtual' ? (parseFloat($id('fa-virtual-limit').dataset.raw) || 0) : (usesCardFields ? (parseFloat($id('fa-limit').dataset.raw) || 0) : 0),
                cutoffDay: usesCardFields ? (parseInt($id('fa-cutoff') ? $id('fa-cutoff').dataset.raw : 0) || 0) : 0,
                payDay: type === 'virtual' ? (parseInt($id('fa-virtual-payday') ? $id('fa-virtual-payday').dataset.raw : 0) || 0) : (usesCardFields ? (parseInt($id('fa-payday') ? $id('fa-payday').dataset.raw : 0) || 0) : 0),
                rate: usesCardFields ? (parseFloat($id('fa-rate') ? $id('fa-rate').dataset.raw : 0) || 0) : 0,
                platform: type === 'virtual' ? ($id('fa-virtual-platform') ? $id('fa-virtual-platform').value : null) : null,
                virtualTerm: type === 'virtual' ? (parseInt($id('fa-virtual-term') ? $id('fa-virtual-term').dataset.raw : 0) || 0) : null,
                color: color,
                bankUrl: bankUrl,
                logoUrl: logoUrl,
                accountNumber: accountNumber,
                bsb: bsb,
                pseLinkId: type === 'rotativo' ? pseLinkId : null,
                paymentNic: type === 'rotativo' ? paymentNic : '',
                profileUpdatedAt: new Date().toISOString(),
                updatedAt: Date.now()
            };
            if (isShared) {
                newAcc.remoteId = rId;
                if (ownerEmail) {
                    newAcc.owner = ownerEmail;
                    newAcc.ownerEmail = ownerEmail;
                    newAcc.members = [ownerEmail];
                }
                if (ownerUid) newAcc.memberUids = [ownerUid];
                newAcc.syncedOnce = false;
            } else if (rId) {
                newAcc.remoteId = rId;
            }
            
            const wasNew = !id;
            if (id) {
                const idx = state.accounts.findIndex(a => a.id === id);
                if (idx !== -1) {
                    const prev = state.accounts[idx];
                    if (prev.owner) newAcc.owner = prev.owner;
                    if (prev.ownerEmail) newAcc.ownerEmail = prev.ownerEmail;
                    if (prev.syncedOnce) newAcc.syncedOnce = prev.syncedOnce;
                    state.accounts[idx] = newAcc;
                }
            } else {
                state.accounts.push(newAcc);
            }
            
            nexusMarkPersonalCloudDirty(['accounts'], { ms: 180000 });
            saveState({ cloudHint: { reason: 'account', shared: !!newAcc.isShared, kind: 'accounts', remoteId: newAcc.remoteId } });
            if (newAcc.isShared) {
                nexusEnsureSharedAccountRemoteId(newAcc);
                nexusEnsureSharedVaultOwnerMeta(newAcc);
                if (wasNew && typeof generateShareTokenForAccount === 'function') {
                    generateShareTokenForAccount(newAcc.id, { skipBackgroundPublish: false, immediateCreate: true });
                } else {
                    nexusPublishSharedVaultInBackground('accounts', newAcc.remoteId, { promptGoogle: true });
                }
                if (typeof nexusPushSharedP2PInstant === 'function') {
                    nexusPushSharedP2PInstant('accounts', newAcc.remoteId);
                }
            }
            updateDashboard();
            renderAccountsTab();
            closeAccountModal();
        }



  const api = {
    __state: global.NexusAccountsEngine.__state,
    prepareTab: prepareAccountsTab,
    paintTabList: function () { return paintAccountsTabList(false); },
    paintDashboard: paintAccountsDashboard,
    renderTab: renderAccountsTab,
    renderDashboard: renderAccounts,
    renderAccounts,
    render7DaysChart,
    renderPeriodChart,
    populateFilters,
    setPeriodFilter,
    renderPeriodList,
    renderAccountsTab,
    toggleGlobalWealth,
    toggleDashAccounts,
    toggleAccGroup,
    nexusFormatAccountTxTitle,
    nexusIsScannerAccountTx,
    nexusShouldHideScannerTxInAccountList,
    nexusBuildScannerImportSummaryHtml,
    nexusBuildAccountTxRowHtml,
    nexusAccountTxListForCard,
    nexusRefreshOpenAccountTxPanel,
    nexusRefreshSharedAccountCardBalance,
    toggleAccountTx,
    openAccountHistory,
    closeAccountHistory,
    setHistFilter,
    renderHistAccList,
    nexusAccountCardRowBundle,
    nexusRequireFormFields,
    buildAccountCardHtml,
    openAccountCreditPSEPay,
    resetAccountFormForNew,
    fillAccountFormFromAccount,
    openAccountModal,
    editAccount,
    closeAccountModal,
    reconcileAccountToZero,
    executeReconcileZero,
    openReorderModal,
    closeReorderModal,
    renderReorderList,
    moveAccountOrder,
    deleteAccount,
    openAccountDeleteOptionsModal,
    closeAccountDeleteOptionsModal,
    confirmAccountDeleteMode,
    executeSharedAccountUnlink,
    nexusAccountIdentitySubtitle,
    nexusAccountMetaLine,
    nexusNormalizeAfterpayAuditCat,
    nexusCollectAuditProjections,
    nexusCurrencyUsesDecimals,
    nexusFormatNumpadLiveCurrency,
    populateAccountPseSelect,
    nexusSyncAccountPaymentNicFromPse,
    nexusSyncLoanCreditRefFromPse,
    nexusEnsurePseLinkForDebt,
    nexusUpsertLoanPseFromForm,
    nexusBuildAccountVaultProfile,
    nexusMergeP2PAccountProfile,
    toggleAccountIdentityFields,
    toggleCreditFields,
    copyAccountFormP2PToken,
    saveAccount
  };

  global.NexusAccountsEngine = api;
  global.renderAccounts = renderAccounts;
  global.renderAccountsTab = renderAccountsTab;
  global.openAccountModal = openAccountModal;
  global.closeAccountModal = closeAccountModal;
  global.saveAccount = saveAccount;
  global.editAccount = editAccount;
  global.deleteAccount = deleteAccount;
  global.toggleAccountTx = toggleAccountTx;
  global.openAccountHistory = openAccountHistory;
  global.closeAccountHistory = closeAccountHistory;
  global.render7DaysChart = render7DaysChart;
  global.renderPeriodChart = renderPeriodChart;
  global.populateFilters = populateFilters;
  global.setPeriodFilter = setPeriodFilter;
  global.renderPeriodList = renderPeriodList;
  global.toggleGlobalWealth = toggleGlobalWealth;
  global.toggleDashAccounts = toggleDashAccounts;
  global.toggleAccGroup = toggleAccGroup;
  global.nexusFormatAccountTxTitle = nexusFormatAccountTxTitle;
  global.nexusIsScannerAccountTx = nexusIsScannerAccountTx;
  global.nexusShouldHideScannerTxInAccountList = nexusShouldHideScannerTxInAccountList;
  global.nexusBuildScannerImportSummaryHtml = nexusBuildScannerImportSummaryHtml;
  global.nexusBuildAccountTxRowHtml = nexusBuildAccountTxRowHtml;
  global.nexusAccountTxListForCard = nexusAccountTxListForCard;
  global.nexusRefreshOpenAccountTxPanel = nexusRefreshOpenAccountTxPanel;
  global.nexusRefreshSharedAccountCardBalance = nexusRefreshSharedAccountCardBalance;
  global.setHistFilter = setHistFilter;
  global.renderHistAccList = renderHistAccList;
  global.nexusAccountCardRowBundle = nexusAccountCardRowBundle;
  global.nexusRequireFormFields = nexusRequireFormFields;
  global.buildAccountCardHtml = buildAccountCardHtml;
  global.openAccountCreditPSEPay = openAccountCreditPSEPay;
  global.resetAccountFormForNew = resetAccountFormForNew;
  global.fillAccountFormFromAccount = fillAccountFormFromAccount;
  global.reconcileAccountToZero = reconcileAccountToZero;
  global.executeReconcileZero = executeReconcileZero;
  global.openReorderModal = openReorderModal;
  global.closeReorderModal = closeReorderModal;
  global.renderReorderList = renderReorderList;
  global.moveAccountOrder = moveAccountOrder;
  global.openAccountDeleteOptionsModal = openAccountDeleteOptionsModal;
  global.closeAccountDeleteOptionsModal = closeAccountDeleteOptionsModal;
  global.confirmAccountDeleteMode = confirmAccountDeleteMode;
  global.executeSharedAccountUnlink = executeSharedAccountUnlink;
  global.nexusAccountIdentitySubtitle = nexusAccountIdentitySubtitle;
  global.nexusAccountMetaLine = nexusAccountMetaLine;
  global.nexusNormalizeAfterpayAuditCat = nexusNormalizeAfterpayAuditCat;
  global.nexusCollectAuditProjections = nexusCollectAuditProjections;
  global.nexusCurrencyUsesDecimals = nexusCurrencyUsesDecimals;
  global.nexusFormatNumpadLiveCurrency = nexusFormatNumpadLiveCurrency;
  global.populateAccountPseSelect = populateAccountPseSelect;
  global.nexusSyncAccountPaymentNicFromPse = nexusSyncAccountPaymentNicFromPse;
  global.nexusSyncLoanCreditRefFromPse = nexusSyncLoanCreditRefFromPse;
  global.nexusEnsurePseLinkForDebt = nexusEnsurePseLinkForDebt;
  global.nexusUpsertLoanPseFromForm = nexusUpsertLoanPseFromForm;
  global.nexusBuildAccountVaultProfile = nexusBuildAccountVaultProfile;
  global.nexusMergeP2PAccountProfile = nexusMergeP2PAccountProfile;
  global.toggleAccountIdentityFields = toggleAccountIdentityFields;
  global.toggleCreditFields = toggleCreditFields;
  global.copyAccountFormP2PToken = copyAccountFormP2PToken;

  console.info("[NEXUS] feature-cuentas accounts-engine.js cargado");
})(typeof window !== "undefined" ? window : globalThis);
