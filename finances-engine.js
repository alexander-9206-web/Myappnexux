/**
 * NEXUS feature-finanzas — Motor SSoT (Fase 1+2)
 */
(function (global) {
  "use strict";

  if (!global.NexusFinancesEngine) global.NexusFinancesEngine = { __state: {} };

        // =============================================================================
        // 3.09 — MÓDULO FINANZAS
        // Ingresos, egresos, flujo de caja
        // =============================================================================

        function renderFinancesUnified() {
            if (global.__NexusFinancesDomain && typeof global.__NexusFinancesDomain.render === \"function\") {
                return global.__NexusFinancesDomain.render.apply(global.__NexusFinancesDomain, arguments);
            }
            const cont = $id('finances-unified-content'); if (!cont) return;
            const bC = state.settings.baseCurrency; const now = new Date(); const enrichedTx = getEnrichedTx();
            let liquidAssets = 0, investmentAssets = 0, totalLiabilities = 0;
            
            nexusGetPatrimonyEligibleAccounts().forEach(a => {
                const balInBase = convertCurrency(a.balance, a.currency, bC);
                if (a.type === 'liquid' || (a.type === 'virtual' && a.balance >= 0)) liquidAssets += balInBase;
                else if (a.type === 'investment') investmentAssets += balInBase;
                else if (nexusIsLiabAccount(a) || (a.type === 'virtual' && a.balance < 0)) totalLiabilities += Math.abs(balInBase);
            });
            
            let nonCurrentLiabilities = 0;
            nexusGetPatrimonyLoansForLiabilities().forEach(l => {
                if (!l.isBNPL) {
                    const balance = nexusLoanRemainingBalance(l);
                    nonCurrentLiabilities += convertCurrency(balance, l.original_currency || l.currency, bC);
                }
            });
            
            const shortTermLiabilities = totalLiabilities + nexusGetPatrimonyAfterpayContracts().reduce((sum, t) => {
                const pending = nexusAfterpayPendingAmount(t);
                return sum + convertCurrency(pending, t.original_currency || t.currency, bC);
            }, 0);
            
            const totalAssets = liquidAssets + investmentAssets; const allLiabilities = shortTermLiabilities + nonCurrentLiabilities; const netWorth = totalAssets - allLiabilities;
            const past90d = new Date(now.getTime() - (90 * 86400000));
            
            // Aislar flujos no reales y proyecciones
            const validPastTx = enrichedTx.filter(t => nexusIsRealCashflowTx(t) && new Date(t.date) <= now);
            const tx90d = validPastTx.filter(t => new Date(t.date) >= past90d);
            
            const inc90d = tx90d.filter(t=>t.type==='income').reduce((s,t)=>s+convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC),0);
            const exp90d = tx90d.filter(t=>t.type==='expense').reduce((s,t)=>s+convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC),0);
            
            const avgMonthlyInc = inc90d / 3 || 1; const avgMonthlyExp = exp90d / 3; const savingsRate = avgMonthlyInc > 1 ? ((avgMonthlyInc - avgMonthlyExp) / avgMonthlyInc) * 100 : 0;
            const emergencyFundMonths = avgMonthlyExp > 0 ? (liquidAssets / avgMonthlyExp).toFixed(1) : '∞'; const debtToAsset = totalAssets > 0 ? (allLiabilities / totalAssets) * 100 : 0;
            
            // Conversión estricta de las cuotas de deuda del mes actual
            const currentMonthLoans = enrichedTx.filter(t => t.isProjected && (t.cat.includes('Deuda') || t.cat.includes('TC') || t.cat.includes('Afterpay')) && new Date(t.date).getMonth() === now.getMonth() && new Date(t.date).getFullYear() === now.getFullYear()).reduce((s,t)=>s+convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC), 0);
            const monthlyDebtLoad = (currentMonthLoans / avgMonthlyInc) * 100;
            
            const currentMonthTx = validPastTx.filter(t => new Date(t.date).getMonth() === now.getMonth() && new Date(t.date).getFullYear() === now.getFullYear());
            const mInc = currentMonthTx.filter(t=>t.type==='income').reduce((s,t)=>s+convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC),0);
            const mExp = currentMonthTx.filter(t=>t.type==='expense').reduce((s,t)=>s+convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC),0);
            
            const fixedCats = ['Vivienda', 'Salud', 'Deuda', 'Transporte', 'TC', 'Préstamo', 'Afterpay', 'fijo']; let mFixed = 0, mVar = 0;
            currentMonthTx.filter(t => t.type === 'expense' && !nexusIsDebtPaymentTx(t)).forEach(t => {
                const amtBase = convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC);
                if(fixedCats.some(c => t.cat.toLowerCase().includes(c.toLowerCase()))) mFixed += amtBase; else mVar += amtBase;
            });
            const mNet = mInc - mExp;

            cont.innerHTML = `<div role="button" tabindex="0" data-nexus-action="openKpiInsight" data-nexus-arg="fin-networth" class="bg-slate-900 text-white p-6 md:p-8 rounded-[2rem] shadow-lg flex justify-between items-center gap-3 mb-6 cursor-pointer hover:opacity-95 active:scale-[0.99] transition-all min-w-0"><div class="min-w-0 flex-1"><p class="text-[10px] md:text-xs font-black uppercase text-slate-400 tracking-widest">Patrimonio Neto <i class="fa-solid fa-circle-info opacity-60"></i></p><p class="text-[8px] md:text-[10px] opacity-50 uppercase">Activos Totales - Pasivos Totales</p></div><div class="nexus-amount-box min-w-0 shrink max-w-[50%] text-right"><p class="nexus-amount-fit nexus-amt-hero font-black ${netWorth >= 0 ? 'text-emerald-400' : 'text-red-400'}">${fmt(netWorth, bC)}</p></div></div><h3 class="text-[10px] md:text-xs font-black uppercase text-slate-400 tracking-widest ml-2 mb-3">KPIs Finanzas Personales</h3><div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8"><div role="button" tabindex="0" data-nexus-action="openKpiInsight" data-nexus-arg="fin-emergency" class="theme-card p-5 rounded-[1.5rem] border shadow-sm cursor-pointer hover:border-blue-300 active:scale-[0.98] transition-all"><p class="text-[9px] font-black opacity-40 uppercase mb-1 theme-text">Cobertura Emergencia <i class="fa-solid fa-circle-info text-blue-400"></i></p><h4 class="nexus-amount-fit font-black ${emergencyFundMonths >= 3 ? 'theme-val-inc' : 'theme-val-exp'} tabular-nums">${emergencyFundMonths} <span class="text-[10px]">Meses</span></h4><p class="text-[7px] md:text-[9px] text-slate-400 mt-1 leading-tight">Toca para ver origen</p></div><div role="button" tabindex="0" data-nexus-action="openKpiInsight" data-nexus-arg="fin-savings" class="theme-card p-5 rounded-[1.5rem] border shadow-sm cursor-pointer hover:border-blue-300 active:scale-[0.98] transition-all"><p class="text-[9px] font-black opacity-40 uppercase mb-1 theme-text">Tasa Ahorro Promedio <i class="fa-solid fa-circle-info text-blue-400"></i></p><h4 class="nexus-amount-fit font-black ${savingsRate >= 20 ? 'theme-val-inc' : (savingsRate > 0 ? 'text-amber-500' : 'theme-val-exp')} tabular-nums">${savingsRate.toFixed(1)}%</h4><p class="text-[7px] md:text-[9px] text-slate-400 mt-1 leading-tight">Toca para ver origen</p></div><div role="button" tabindex="0" data-nexus-action="openKpiInsight" data-nexus-arg="fin-debtload" class="theme-card p-5 rounded-[1.5rem] border shadow-sm cursor-pointer hover:border-blue-300 active:scale-[0.98] transition-all"><p class="text-[9px] font-black opacity-40 uppercase mb-1 theme-text">Carga Deuda Mensual <i class="fa-solid fa-circle-info text-blue-400"></i></p><h4 class="nexus-amount-fit font-black ${monthlyDebtLoad <= 30 ? 'theme-val-inc' : 'theme-val-exp'} tabular-nums">${monthlyDebtLoad.toFixed(1)}%</h4><p class="text-[7px] md:text-[9px] text-slate-400 mt-1 leading-tight">Toca para ver origen</p></div><div role="button" tabindex="0" data-nexus-action="openKpiInsight" data-nexus-arg="fin-debtasset" class="theme-card p-5 rounded-[1.5rem] border shadow-sm cursor-pointer hover:border-blue-300 active:scale-[0.98] transition-all"><p class="text-[9px] font-black opacity-40 uppercase mb-1 theme-text">Endeudamiento <i class="fa-solid fa-circle-info text-blue-400"></i></p><h4 class="nexus-amount-fit font-black ${debtToAsset <= 40 ? 'theme-val-inc' : 'theme-val-exp'} tabular-nums">${debtToAsset.toFixed(1)}%</h4><p class="text-[7px] md:text-[9px] text-slate-400 mt-1 leading-tight">Toca para ver origen</p></div></div><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div class="theme-card rounded-[2rem] border shadow-sm overflow-hidden mb-6"><div class="p-5 border-b border-slate-100/50 bg-slate-50"><h3 class="text-[10px] md:text-xs font-black uppercase text-slate-500 tracking-widest">Balance General Simplificado</h3></div><div class="p-5 space-y-3"><div data-nexus-action="switchTab" data-nexus-arg="accounts" class="flex justify-between items-center gap-2 min-w-0 cursor-pointer hover:bg-slate-50 p-2 -mx-2 rounded-xl transition-colors"><p class="text-xs font-bold text-slate-500">Activos Líquidos</p><div class="nexus-amount-box min-w-0 max-w-[55%] text-right"><p class="nexus-amount-fit nexus-amt-compact font-mono font-bold theme-text">${fmt(liquidAssets, bC)}</p></div></div><div data-nexus-action="switchTab" data-nexus-arg="accounts" class="flex justify-between items-center gap-2 min-w-0 cursor-pointer hover:bg-slate-50 p-2 -mx-2 rounded-xl transition-colors"><p class="text-xs font-bold text-slate-500">Inversiones</p><div class="nexus-amount-box min-w-0 max-w-[55%] text-right"><p class="nexus-amount-fit nexus-amt-compact font-mono font-bold theme-text">${fmt(investmentAssets, bC)}</p></div></div><div class="flex justify-between items-center gap-2 min-w-0 border-t border-slate-100 pt-2"><p class="text-[9px] font-black uppercase text-blue-500">Total Activos</p><div class="nexus-amount-box min-w-0 max-w-[55%] text-right"><p class="nexus-amount-fit nexus-amt-compact font-black text-blue-600">${fmt(totalAssets, bC)}</p></div></div><div data-nexus-action="switchTab" data-nexus-arg="loans" class="flex justify-between mt-2 cursor-pointer hover:bg-slate-50 p-2 -mx-2 rounded-xl transition-colors"><p class="text-xs font-bold text-slate-500">Pasivos Corto Plazo</p><div class="nexus-amount-box min-w-0 max-w-[55%] text-right"><p class="nexus-amount-fit nexus-amt-compact font-mono font-bold theme-text">${fmt(shortTermLiabilities, bC)}</p></div></div><div data-nexus-action="switchTab" data-nexus-arg="loans" class="flex justify-between items-center gap-2 min-w-0 cursor-pointer hover:bg-slate-50 p-2 -mx-2 rounded-xl transition-colors"><p class="text-xs font-bold text-slate-500">Pasivos Largo Plazo</p><div class="nexus-amount-box min-w-0 max-w-[55%] text-right"><p class="nexus-amount-fit nexus-amt-compact font-mono font-bold theme-text">${fmt(nonCurrentLiabilities, bC)}</p></div></div><div class="flex justify-between items-center gap-2 min-w-0 border-t border-slate-100 pt-2"><p class="text-[9px] font-black uppercase text-red-500">Total Pasivos</p><div class="nexus-amount-box min-w-0 max-w-[55%] text-right"><p class="nexus-amount-fit nexus-amt-compact font-black text-red-600">${fmt(allLiabilities, bC)}</p></div></div></div></div><div class="theme-card rounded-[2rem] border shadow-sm overflow-hidden h-fit"><div class="p-5 border-b border-slate-100/50 bg-slate-50"><h3 class="text-[10px] md:text-xs font-black uppercase text-slate-500 tracking-widest">Estado de Resultados (Mes Actual)</h3></div><div class="p-5 space-y-3"><div class="flex justify-between items-center gap-2 min-w-0"><p class="text-xs font-black uppercase theme-val-inc">Ingresos Operativos</p><div class="nexus-amount-box min-w-0 max-w-[55%] text-right"><p class="nexus-amount-fit nexus-amt-compact font-mono font-bold theme-text">${fmt(mInc, bC)}</p></div></div><div class="pt-3 pb-3 border-y border-slate-100/50 my-2"><p class="text-[9px] font-black uppercase text-slate-400 mb-2">Estructura de Gastos</p><div class="flex justify-between items-center gap-2 min-w-0 mb-1"><p class="text-[10px] font-bold text-slate-500">Gastos Fijos</p><div class="nexus-amount-box min-w-0 max-w-[55%] text-right"><p class="nexus-amount-fit nexus-amt-compact font-mono font-bold theme-text">${fmt(mFixed, bC)}</p></div></div><div class="flex justify-between items-center gap-2 min-w-0"><p class="text-[10px] font-bold text-slate-500">Gastos Variables</p><div class="nexus-amount-box min-w-0 max-w-[55%] text-right"><p class="nexus-amount-fit nexus-amt-compact font-mono font-bold theme-text">${fmt(mVar, bC)}</p></div></div></div><div class="flex justify-between items-center gap-2 min-w-0"><p class="text-xs font-black uppercase theme-val-exp">Gastos Totales</p><div class="nexus-amount-box min-w-0 max-w-[55%] text-right"><p class="nexus-amount-fit nexus-amt-compact font-mono font-bold theme-val-exp">${fmt(mExp, bC)}</p></div></div><div class="flex justify-between items-center bg-slate-50 p-3 rounded-xl mt-3"><p class="text-[9px] md:text-[10px] font-black uppercase text-slate-500">Utilidad Neta</p><div class="nexus-amount-box min-w-0 max-w-[55%] text-right"><p class="nexus-amount-fit nexus-amt-hero font-black ${mNet >= 0 ? 'theme-val-inc' : 'theme-val-exp'}">${fmt(mNet, bC)}</p></div></div></div></div></div>`;
            nexusScheduleFit(cont);
        }
        // PRESUPUESTOS Y METAS



  const api = {
    __state: global.NexusFinancesEngine.__state,
    renderFinancesUnified,
    render: renderFinancesUnified
  };

  global.NexusFinancesEngine = api;
  global.renderFinancesUnified = renderFinancesUnified;

  console.info("[NEXUS] feature-finanzas finances-engine.js cargado");
})(typeof window !== "undefined" ? window : globalThis);
