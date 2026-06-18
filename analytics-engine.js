/**
 * NEXUS feature-analitica — Motor SSoT (Fase 1+2)
 */
(function (global) {
  "use strict";

  if (!global.NexusAnalyticsEngine) global.NexusAnalyticsEngine = { __state: {} };

        // ANALÍTICA
        function setStatsType(type) {
            state.statsType = type;
            renderAnalysis();
            nexusPersistCloudConfig(['core'], 'settings');
        }

        // Ruteo directo desde Analítica hasta la Auditoría pre-filtrada (Drill-down)
        function auditCategory(catName, type) {
            switchTab('database');
            setDbQuickFilter('mes');
            const typeSel = $id('db-filter-type');
            if(typeSel) typeSel.value = type;
            updateDbCatFilter();
            setTimeout(() => {
                const catSel = $id('db-filter-cat');
                if(catSel) {
                    let exists = Array.from(catSel.options).some(o => o.value === catName);
                    if(exists) { catSel.value = catName; renderDatabase(); }
                }
            }, 100);
        }


        // =============================================================================
        // 3.07 — MÓDULO ANALÍTICA
        // Gráficos y tendencias
        // =============================================================================

        function renderAnalysis() {
            if (global.__NexusAnalyticsDomain && typeof global.__NexusAnalyticsDomain.render === \"function\") {
                return global.__NexusAnalyticsDomain.render.apply(global.__NexusAnalyticsDomain, arguments);
            }
            const now = new Date();
            
            // Motor unificado SSoT. Utiliza getEnrichedTx() para incorporar amortizaciones reales
            // de Afterpay/Deudas y aislar estrictamente las cuentas compartidas y de terceros.
            const enrichedTx = getEnrichedTx();
            const currentMonthTx = enrichedTx.filter(t => {
                const d = new Date(t.date);
                return nexusIsRealCashflowTx(t) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && d <= now;
            });
            
            const splEl = $id('stat-period-label'); if(splEl) splEl.innerText = 'Mes Actual (Unificado)';
            const inc = currentMonthTx.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
            const exp = currentMonthTx.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
            
            let days = now.getDate() || 1;

            const sriEl = $id('stat-real-inc'); if(sriEl) sriEl.innerText = fmt(inc);
            const sreEl = $id('stat-real-exp'); if(sreEl) sreEl.innerText = fmt(exp);
            const sbEl = $id('stat-burn'); const ssEl = $id('stat-save');
            if(sbEl) sbEl.innerText = fmt(exp / days);
            const saveEff = inc > 0 ? ((inc - exp) / inc * 100).toFixed(1) : 0;
            if(ssEl) { ssEl.innerText = saveEff + '%'; ssEl.className = `nexus-amount-fit font-black tabular-nums ${saveEff >= 20 ? 'theme-val-inc' : (saveEff >= 0 ? 'text-amber-500' : 'theme-val-exp')}`; }
            
            const sid = $id('stat-inc-desc'); if(sid) sid.innerText = "Función: Entrada líquida. Causa: Sube por salarios o cobros.";
            const sed = $id('stat-exp-desc'); if(sed) sed.innerText = "Función: Salida de capital. Causa: Crece por compras y pagos.";
            const sbd = $id('stat-burn-desc'); if(sbd) sbd.innerText = "Función: Gasto diario. Causa: Sube por exceso de egresos.";
            const ssd = $id('stat-save-desc'); if(ssd) ssd.innerText = saveEff >= 0 ? "Función: Retención. Causa: Ingreso supera al gasto." : "Función: Retención. Causa: Gasto supera al ingreso.";

            const typeTx = currentMonthTx.filter(t => t.type === state.statsType);
            const totalType = typeTx.reduce((s,t) => s + t.amount, 0);
            const catGroup = {}; typeTx.forEach(t => catGroup[t.cat] = (catGroup[t.cat] || 0) + t.amount);
            const sortedCats = Object.keys(catGroup).map(k => ({ cat: k, amount: catGroup[k] })).sort((a,b) => b.amount - a.amount).slice(0, 10);
            const tbody = $id('stat-top-table'); if(tbody) { if (sortedCats.length === 0) { tbody.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-[10px] text-slate-400 font-bold uppercase">Sin datos</td></tr>`; } else { tbody.innerHTML = sortedCats.map(c => { const perc = totalType > 0 ? ((c.amount / totalType) * 100).toFixed(1) : 0; return `<tr data-nexus-action="auditCategory" data-nexus-payload='["${c.cat}", "${state.statsType}"]' class="border-b border-slate-50/50 last:border-0 cursor-pointer hover:bg-slate-50 transition-colors"><td class="py-3 font-bold theme-text pl-2 rounded-l-xl">${c.cat.substring(2)}</td><td class="py-3 text-right max-w-[45%]"><span class="nexus-amount-fit nexus-amt-compact font-mono font-bold theme-text inline-block max-w-full text-right">${fmt(c.amount)}</span></td><td class="py-3 text-right text-slate-400 font-bold pr-2 rounded-r-xl">${perc}%</td></tr>`; }).join(''); } }
            
            const btnExp = $id('btn-stat-exp'); const btnInc = $id('btn-stat-inc'); if(btnExp) btnExp.className = `px-3 py-1.5 text-[9px] font-black uppercase rounded-md theme-card shadow-sm transition-all ${state.statsType === 'expense' ? 'theme-val-exp' : 'text-slate-400'}`; if(btnInc) btnInc.className = `px-3 py-1.5 text-[9px] font-black uppercase rounded-md theme-card shadow-sm transition-all ${state.statsType === 'income' ? 'theme-val-inc' : 'text-slate-400'}`;
            
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const dailyInc = inc / days; const dailyExp = exp / days;
            const projMesInc = dailyInc * daysInMonth; const projMesExp = dailyExp * daysInMonth;
            const projAnoInc = dailyInc * 365; const projAnoExp = dailyExp * 365;

            const tri = $id('tbl-real-inc'); if(tri) tri.innerText = fmt(inc);
            const tpmi = $id('tbl-proj-mes-inc'); if(tpmi) tpmi.innerText = fmt(projMesInc);
            const tpi = $id('tbl-proj-inc'); if(tpi) tpi.innerText = fmt(projAnoInc);
            
            const tre = $id('tbl-real-exp'); if(tre) tre.innerText = fmt(exp);
            const tpme = $id('tbl-proj-mes-exp'); if(tpme) tpme.innerText = fmt(projMesExp);
            const tpe = $id('tbl-proj-exp'); if(tpe) tpe.innerText = fmt(projAnoExp);
            
            const trn = $id('tbl-real-net'); if(trn) trn.innerText = fmt(inc - exp);
            const tpmn = $id('tbl-proj-mes-net'); if(tpmn) tpmn.innerText = fmt(projMesInc - projMesExp);
            const tpn = $id('tbl-proj-net'); if(tpn) tpn.innerText = fmt(projAnoInc - projAnoExp);

            // --- MOTORES PREDICTIVOS V2.0 ---
            let liquidAssets = 0;
            // Aislamiento patrimonial para motores predictivos
            (state.accounts || []).forEach(a => {
                if(a.type === 'liquid' && !a.isShared && a.type !== 'terceros') {
                    liquidAssets += convertCurrency(a.balance, a.currency, state.settings.baseCurrency);
                }
            });
            
            // 1. Runway (Supervivencia)
            const runwayDays = dailyExp > 0 ? (liquidAssets / dailyExp) : Infinity;
            const projRunwayEl = $id('proj-runway');
            if (projRunwayEl) {
                if (!isFinite(runwayDays)) projRunwayEl.innerText = "Infinito";
                else if (runwayDays < 30) projRunwayEl.innerText = `${Math.floor(runwayDays)} Días`;
                else projRunwayEl.innerText = `${(runwayDays / 30).toFixed(1)} Meses`;
            }

            // 2. F.I.R.E. (Regla del 4% -> Gasto Anual * 25)
            const fireTarget = projAnoExp * 25;
            const annualSavings = projAnoInc - projAnoExp;
            const projFireEl = $id('proj-fire');
            if (projFireEl) {
                if (annualSavings <= 0) projFireEl.innerText = "Déficit";
                else {
                    const yearsToFire = Math.max(0, (fireTarget - liquidAssets) / annualSavings);
                    projFireEl.innerText = `${yearsToFire.toFixed(1)} Años`;
                }
            }

            // 3. Interés Compuesto (10 Años al 8% E.A. con aporte mensual)
            const monthlySavings = projMesInc - projMesExp;
            const projCompoundEl = $id('proj-compound');
            if (projCompoundEl) {
                if (monthlySavings <= 0) projCompoundEl.innerText = fmt(liquidAssets * Math.pow(1.08, 10));
                else {
                    const r = 0.08 / 12; const n = 120;
                    const fv = liquidAssets * Math.pow(1+r, n) + monthlySavings * ((Math.pow(1+r, n) - 1) / r);
                    projCompoundEl.innerText = fmt(fv);
                }
            }

            // 4. Erosión por Inflación (-4% sobre patrimonio año 1)
            const projInflationEl = $id('proj-inflation');
            if (projInflationEl) {
                const netWorthAno = liquidAssets + annualSavings;
                const realValue = netWorthAno > 0 ? netWorthAno * 0.96 : 0;
                projInflationEl.innerText = fmt(realValue);
            }
            nexusScheduleFit($id('tab-analysis'));
        }
        // FINANZAS PERSONALES UNIFICADO



  const api = {
    __state: global.NexusAnalyticsEngine.__state,
    setStatsType,
    auditCategory,
    renderAnalysis,
    render: renderAnalysis
  };

  global.NexusAnalyticsEngine = api;
  global.setStatsType = setStatsType;
  global.auditCategory = auditCategory;
  global.renderAnalysis = renderAnalysis;

  console.info("[NEXUS] feature-analitica analytics-engine.js cargado");
})(typeof window !== "undefined" ? window : globalThis);
