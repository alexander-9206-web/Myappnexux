/**
 * NEXUS feature-directiva — Motor SSoT (Fase 1+2)
 */
(function (global) {
  "use strict";

  if (!global.NexusDirectiveEngine) global.NexusDirectiveEngine = { __state: {} };

        // =============================================================================
        // 3.08 — MÓDULO DIRECTIVA
        // Resumen ejecutivo activos/pasivos
        // =============================================================================

        function renderReport() {
            if (global.__NexusDirectiveDomain && typeof global.__NexusDirectiveDomain.render === \"function\") {
                return global.__NexusDirectiveDomain.render.apply(global.__NexusDirectiveDomain, arguments);
            }
            const bC = state.settings.baseCurrency; const rb = $id('rep-base-curr'); if(rb) rb.innerText = bC;
            let totAssets = 0; let totLiab = 0;
            nexusGetPatrimonyEligibleAccounts().forEach(a => {
                if (nexusIsLiabAccount(a) || (a.type === 'virtual' && a.balance < 0)) totLiab += Math.abs(convertCurrency(nexusIsLiabAccount(a) ? a.balance : a.balance, a.currency, bC)); else totAssets += convertCurrency(a.balance, a.currency, bC);
            });
            nexusGetPatrimonyLoansForLiabilities().forEach(l => {
                const rem = nexusLoanRemainingBalance(l);
                totLiab += convertCurrency(rem, l.currency, bC);
            });
            nexusGetPatrimonyAfterpayContracts().forEach(t => {
                const pending = nexusAfterpayPendingAmount(t);
                if (pending > 0) totLiab += convertCurrency(pending, t.original_currency || t.currency, bC);
            });

            const rA = $id('rep-assets'); if(rA) rA.innerText = fmt(totAssets, bC);
            const rL = $id('rep-liabilities'); if(rL) rL.innerText = fmt(totLiab, bC);
            
            const now = new Date(); const past90d = new Date(now.getTime() - (90 * 86400000));
            
            // Aislar proyecciones futuras y flujos no reales (P2P/Terceros)
            const validPastTx = getEnrichedTx().filter(t => nexusIsRealCashflowTx(t) && new Date(t.date) <= now);
            const tx90d = validPastTx.filter(t => new Date(t.date) >= past90d);
            
            const inc90d = tx90d.filter(t=>t.type==='income').reduce((s,t)=>s+convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC),0);
            const exp90d = tx90d.filter(t=>t.type==='expense').reduce((s,t)=>s+convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC),0);
            
            const savingsRate = inc90d > 0 ? ((inc90d - exp90d) / inc90d * 100) : 0;
            const rS = $id('rep-savings'); if(rS) { rS.innerText = savingsRate.toFixed(1) + '%'; rS.className = `nexus-amount-fit font-black tabular-nums ${savingsRate >= 20 ? 'theme-val-inc' : (savingsRate >= 0 ? 'text-amber-500' : 'theme-val-exp')}`; }
            const debtRatio = totAssets > 0 ? (totLiab / totAssets * 100) : 0;
            const rH = $id('rep-health'); if(rH) { rH.innerText = debtRatio.toFixed(1) + '%'; rH.className = `nexus-amount-fit font-black tabular-nums ${debtRatio <= 40 ? 'text-amber-500' : 'theme-val-exp'}`; if(debtRatio <= 20) rH.className = 'nexus-amount-fit font-black tabular-nums theme-val-inc'; }
            const rN = $id('rep-narrative'); if(rN) rN.innerHTML = `Mantenemos liquidez de <strong>${fmt(totAssets, bC)}</strong> frente a un pasivo de <strong>${fmt(totLiab, bC)}</strong>. Apalancamiento del ${debtRatio.toFixed(1)}%.`;
            
            const rAT = $id('rep-assets-text'); if(rAT) rAT.innerText = `Mide liquidez e inversión. Crece al retener capital y adquirir bienes.`;
            const rLT = $id('rep-liabilities-text'); if(rLT) rLT.innerText = `Obligaciones totales. Aumenta al usar crédito o apalancamiento.`;
            const rST = $id('rep-savings-text'); if(rST) rST.innerText = savingsRate >= 20 ? 'Retención óptima. Alta eficiencia entre ingreso y gasto operativo.' : (savingsRate > 0 ? 'Margen ajustado. El costo de vida consume el flujo principal.' : 'Déficit operativo. Fuga de capital por exceso de gastos.');
            const rHT = $id('rep-health-text'); if(rHT) rHT.innerText = debtRatio <= 40 ? 'Apalancamiento sano. Riesgo estructural bajo y controlado.' : 'Sobregiro estructural. Causado por deuda excesiva vs patrimonio.';

            // NEW CODE FOR 6 MONTHS TREND
            const trendLabels = []; const trendInc = []; const trendExp = []; let totalInc6m = 0; let totalExp6m = 0;
            for(let i=5; i>=0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                trendLabels.push(d.toLocaleDateString('es-CO', { month: 'short' }));
                const mTx = validPastTx.filter(t => new Date(t.date).getMonth() === d.getMonth() && new Date(t.date).getFullYear() === d.getFullYear());
                const mI = mTx.filter(t=>t.type==='income').reduce((s,t)=>s+convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC),0);
                const mE = mTx.filter(t=>t.type==='expense').reduce((s,t)=>s+convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC),0);
                trendInc.push(mI); trendExp.push(mE); totalInc6m += mI; totalExp6m += mE;
            }

            const rCT = $id('report-chart-trend'); if(rCT) { const ctxTrend = rCT.getContext('2d'); if(charts.trend) charts.trend.destroy(); charts.trend = new Chart(ctxTrend, { type: 'bar', data: { labels: trendLabels, datasets: [{ label:'Ingresos', data: trendInc, backgroundColor: state.theme.inc }, { label:'Egresos', data: trendExp, backgroundColor: state.theme.exp }]}, options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}, ticks:{font:{size:8, weight:'bold'}}}, y:{display:false}} } }); }
            
            // Structure calculation
            let fixedExp = 0; let varExp = 0;
            const fixedCats = ['vivienda', 'salud', 'transporte', 'deuda', 'afterpay', 'tc', 'préstamo', 'cuota', 'fijos', 'fijo'];
            tx90d.filter(t=>t.type==='expense').forEach(t => { if(fixedCats.some(k => t.cat.toLowerCase().includes(k))) fixedExp += convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC); else varExp += convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC); });
            if(fixedExp === 0 && varExp === 0) { fixedExp = exp90d*0.6; varExp = exp90d*0.4; } // Fallback

            const rCV = $id('report-chart-vs'); if(rCV) { const ctxVs = rCV.getContext('2d'); if(charts.vs) charts.vs.destroy(); charts.vs = new Chart(ctxVs, { type: 'doughnut', data: { labels: ['Fijos', 'Variables'], datasets: [{ data: [fixedExp, varExp], backgroundColor: [state.theme.text, state.theme.exp], borderWidth: 0 }]}, options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position: 'right', labels: {font:{size:8, weight:'bold'}}}}, cutout: '70%' } }); }

            // NEW TEXT BOXES POPULATION
            const rTrendText = $id('rep-trend-text');
            if(rTrendText) {
                const avgInc6m = totalInc6m / 6 || 0; const avgExp6m = totalExp6m / 6 || 0;
                const diff = trendInc[5] - trendInc[4]; const dir = diff >= 0 ? 'crecimiento' : 'caída';
                rTrendText.innerHTML = `En el último semestre, el ingreso promedio mensual fue de <span class="theme-val-inc font-black">${fmt(avgInc6m, bC)}</span> frente a egresos de <span class="theme-val-exp font-black">${fmt(avgExp6m, bC)}</span>. El mes actual presenta una ${dir} de <span class="font-black">${fmt(Math.abs(diff), bC)}</span> respecto al mes anterior.`;
            }

            const rStrText = $id('rep-structure-text');
            if(rStrText) {
                const incCat = {}; tx90d.filter(t=>t.type==='income').forEach(t => incCat[t.cat] = (incCat[t.cat]||0) + convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC));
                const sortedInc = Object.entries(incCat).sort((a,b)=>b[1]-a[1]).slice(0,2);
                let incStr = sortedInc.map(x => `<span class="font-black">${x[0].substring(2)}</span> (${((x[1]/inc90d)*100||0).toFixed(0)}%)`).join(' y ');
                const totE = fixedExp + varExp || 1;
                rStrText.innerHTML = `Tu principal fuente de ingresos son ${incStr || 'entradas diversas'}. Los egresos (90D) se componen de un <span class="font-black">${((fixedExp/totE)*100).toFixed(0)}%</span> en obligaciones fijas y <span class="font-black">${((varExp/totE)*100).toFixed(0)}%</span> en gastos variables.`;
            }
            nexusScheduleFit($id('tab-report'));
        }



  const api = {
    __state: global.NexusDirectiveEngine.__state,
    renderReport,
    render: renderReport
  };

  global.NexusDirectiveEngine = api;
  global.renderReport = renderReport;

  console.info("[NEXUS] feature-directiva directive-engine.js cargado");
})(typeof window !== "undefined" ? window : globalThis);
