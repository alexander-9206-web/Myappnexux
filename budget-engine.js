/**
 * NEXUS feature-presupuesto — Motor SSoT (Fase 1+2)
 */
(function (global) {
  "use strict";

  if (!global.NexusBudgetEngine) global.NexusBudgetEngine = { __state: {} };

        // =============================================================================
        // 3.10 — MÓDULO PRESUPUESTOS
        // Límites por categoría
        // =============================================================================

        function renderBudgetTab() {
            if (global.__NexusBudgetDomain && typeof global.__NexusBudgetDomain.render === \"function\") {
                return global.__NexusBudgetDomain.render.apply(global.__NexusBudgetDomain, arguments);
            }
            const cont = $id('budget-unified-content'); if (!cont) return;
            const now = new Date(); const enrichedTx = getEnrichedTx();
            const bC = state.settings.baseCurrency || 'COP';
            const past90d = new Date(now.getTime() - (90 * 86400000));
            
            // Aislar proyecciones y fondos de terceros/compartidos del cálculo base
            const tx90d = enrichedTx.filter(t => new Date(t.date) >= past90d && new Date(t.date) <= now && nexusIsRealCashflowTx(t));
            const inc90d = tx90d.filter(t=>t.type==='income').reduce((s,t)=>s+convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC),0);
            let avgMonthlyInc = inc90d / 3;
            
            const currentMonthTx = enrichedTx.filter(t => new Date(t.date).getMonth() === now.getMonth() && new Date(t.date).getFullYear() === now.getFullYear() && nexusIsRealCashflowTx(t));
            const currentInc = currentMonthTx.filter(t=>t.type==='income').reduce((s,t)=>s+convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC),0);
            const baseIncome = avgMonthlyInc > 0 ? avgMonthlyInc : (currentInc > 0 ? currentInc : 1000000);
            const targetFixed = baseIncome * 0.50; const targetVar = baseIncome * 0.30; const targetSave = baseIncome * 0.20;
            
            let actFixed = 0, actVar = 0; const fixedKeywords = ['vivienda', 'salud', 'transporte', 'deuda', 'afterpay', 'tc', 'préstamo', 'cuota', 'fijos', 'fijo'];
            currentMonthTx.filter(t=>t.type==='expense' && !nexusIsDebtPaymentTx(t)).forEach(t => {
                const amtBase = convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC);
                const isF = fixedKeywords.some(k => t.cat.toLowerCase().includes(k));
                if(isF) actFixed += amtBase; else actVar += amtBase;
            });
            const fixedPct = Math.min(100, (actFixed / targetFixed) * 100) || 0; const varPct = Math.min(100, (actVar / targetVar) * 100) || 0;
            
            // NUEVA ARQUITECTURA: ESTRUCTURA FINANCIERA Y BASE CERO
            let totalReqSavings = 0;
            state.goals = state.goals || [];
            const goalsHtml = state.goals.map(g => {
                const dl = new Date(g.deadline); const monthsLeft = Math.max(1, Math.ceil((dl - now) / (1000 * 60 * 60 * 24 * 30)));
                const reqMonthly = convertCurrency(g.amount, g.currency || bC, bC) / monthsLeft;
                totalReqSavings += reqMonthly;
                return `<div class="theme-card p-4 rounded-2xl border shadow-sm mb-3 md:mb-0"><div class="flex justify-between items-center mb-2"><h4 class="text-xs font-black uppercase theme-text">${g.name}</h4><button data-nexus-action="triggerUIDelete" data-nexus-payload='["goal", "${g.id}"]' class="text-slate-300 hover:text-red-500"><i class="fa-solid fa-trash text-[10px]"></i></button></div><div class="flex justify-between items-end mb-3"><div><p class="text-[8px] font-black uppercase text-slate-400">Meta Total</p><p class="text-sm font-black theme-text">${fmt(g.amount, g.currency || bC)}</p></div><div class="text-right"><p class="text-[8px] font-black uppercase text-slate-400">Fecha Límite</p><p class="text-xs font-bold text-slate-500">${dl.toLocaleDateString()}</p></div></div><div class="bg-orange-50 p-3 rounded-xl border border-orange-100 flex justify-between items-center"><p class="text-[9px] font-black uppercase text-orange-800">Ahorro Requerido</p><p class="text-sm font-black text-orange-600">${fmt(reqMonthly, bC)} <span class="text-[9px]">/ mes</span></p></div></div>`;
            }).join('') || `<div class="text-center p-8 border border-dashed border-orange-200 rounded-3xl bg-orange-50/30 w-full md:col-span-2 lg:col-span-3"><p class="text-[10px] font-bold text-orange-600/70 uppercase">No hay metas activas</p></div>`;

            const unassignedCapital = baseIncome - actFixed - actVar - totalReqSavings;
            const currentMonthLoans = enrichedTx.filter(t => t.isProjected && (t.cat.includes('Deuda') || t.cat.includes('TC') || t.cat.includes('Afterpay')) && new Date(t.date).getMonth() === now.getMonth() && new Date(t.date).getFullYear() === now.getFullYear()).reduce((s,t)=>s+convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC), 0);
            const maxDebtCapacity = baseIncome * 0.35;
            const availableDebtCapacity = maxDebtCapacity - currentMonthLoans;
            const frictionRate = baseIncome > 0 ? ((actFixed + currentMonthLoans) / baseIncome) * 100 : 0;

            const html503020 = `<div class="theme-card p-4 rounded-[2rem] border shadow-sm h-fit"><div class="flex justify-between items-center border-b border-slate-100/50 pb-3 mb-4"><h3 class="text-[10px] font-black uppercase text-slate-500 tracking-widest">Presupuesto Inteligente (50/30/20)</h3><span class="text-[8px] font-black uppercase bg-slate-100 text-slate-600 px-2 py-1 rounded">Mes Actual</span></div><div class="mb-3"><div class="flex justify-between items-end mb-1"><p class="text-[10px] font-black uppercase theme-text">Necesidades (Fijos) <span class="text-[8px] text-slate-400 font-bold ml-1">Meta: 50%</span></p><p class="text-xs font-black ${actFixed > targetFixed ? 'text-red-500' : 'theme-text'}">${fmt(actFixed, bC)} <span class="text-[9px] text-slate-400">/ ${fmt(targetFixed, bC)}</span></p></div><div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div class="h-full ${actFixed > targetFixed ? 'bg-red-500' : 'bg-indigo-500'} rounded-full transition-all" style="width: ${fixedPct}%"></div></div></div><div class="mb-3"><div class="flex justify-between items-end mb-1"><p class="text-[10px] font-black uppercase theme-text">Deseos (Variables) <span class="text-[8px] text-slate-400 font-bold ml-1">Meta: 30%</span></p><p class="text-xs font-black ${actVar > targetVar ? 'text-red-500' : 'theme-text'}">${fmt(actVar, bC)} <span class="text-[9px] text-slate-400">/ ${fmt(targetVar, bC)}</span></p></div><div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div class="h-full ${actVar > targetVar ? 'bg-red-500' : 'bg-purple-500'} rounded-full transition-all" style="width: ${varPct}%"></div></div></div><div class="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex justify-between items-center gap-2 min-w-0"><div class="min-w-0"><p class="text-[9px] font-black uppercase text-emerald-800">Ahorro Proyectado (20%)</p><p class="text-[8px] text-emerald-600 mt-1">Si respetas los límites, salvarás:</p></div><div class="nexus-amount-box min-w-0 max-w-[50%] text-right"><p class="nexus-amount-fit nexus-amt-summary font-black text-emerald-600">${fmt(targetSave, bC)}</p></div></div></div>`;

            const htmlZBB = `<div class="theme-card p-4 rounded-[2rem] border shadow-sm h-fit"><div class="flex justify-between items-center border-b border-slate-100/50 pb-3 mb-4"><h3 class="text-[10px] font-black uppercase text-slate-500 tracking-widest">Estructura Base Cero y Capacidad</h3><span class="text-[8px] font-black uppercase bg-slate-100 text-slate-600 px-2 py-1 rounded">Análisis</span></div><div class="mb-4"><p class="text-[9px] font-black uppercase text-slate-400">Capital Sin Asignar (ZBB)</p><h4 class="nexus-amount-fit nexus-amt-summary font-black ${unassignedCapital >= 0 ? 'theme-text' : 'text-red-500'} mt-1">${fmt(unassignedCapital, bC)}</h4><p class="text-[8px] text-slate-500 mt-1 leading-tight">Función: Rastrear cada centavo. Causa: Ingreso Total - (Gastos Fijos + Variables + Metas).</p></div><div class="mb-4 border-t border-slate-100/50 pt-4"><p class="text-[9px] font-black uppercase text-slate-400">Margen de Endeudamiento (35%)</p><h4 class="nexus-amount-fit nexus-amt-summary font-black ${availableDebtCapacity >= 0 ? 'theme-val-inc' : 'text-red-500'} mt-1">${fmt(availableDebtCapacity, bC)}</h4><p class="text-[8px] text-slate-500 mt-1 leading-tight">Función: Límite seguro para nuevo crédito. Causa: 35% del Ingreso - Carga de Deuda Actual.</p></div><div class="border-t border-slate-100/50 pt-4"><p class="text-[9px] font-black uppercase text-slate-400">Fricción Financiera</p><h4 class="nexus-amount-fit nexus-amt-summary font-black ${frictionRate >= 80 ? 'text-red-500' : 'theme-val-exp'} mt-1">${frictionRate.toFixed(1)}%</h4><p class="text-[8px] text-slate-500 mt-1 leading-tight">Función: Riesgo de iliquidez. Causa: Porcentaje del ingreso absorbido en gastos fijos y deuda.</p></div></div>`;

            // Presupuestos por Categoría con Matemática Unificada
            state.budgets = state.budgets || {};
            let catBudgetsHtml = '';
            
            if (Object.keys(state.budgets).length > 0) {
                const expByCat = {};
                currentMonthTx.filter(t=>t.type==='expense' && !nexusIsDebtPaymentTx(t)).forEach(t => {
                    const cAmt = convertCurrency(t.original_amount || t.amount, t.original_currency || t.currency, bC);
                    expByCat[t.cat] = (expByCat[t.cat] || 0) + cAmt;
                    const m = t.cat.match(/\[(.*?)\]\s*(.*)/);
                    if (m && m[1]) {
                        expByCat[m[1]] = (expByCat[m[1]] || 0) + cAmt;
                    }
                });

                catBudgetsHtml += `<div class="col-span-1 md:col-span-2 w-full mt-2"><h3 class="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2 mb-3">Límites por Categoría (Mes Actual)</h3><div class="space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 md:space-y-0">`;
                
                for (const [catName, limit] of Object.entries(state.budgets)) {
                    const spent = expByCat[catName] || 0;
                    const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
                    const isOver = spent > limit;
                    const barColor = isOver ? 'bg-red-500' : (pct > 80 ? 'bg-amber-500' : 'bg-emerald-500');
                    const textColor = isOver ? 'text-red-500' : 'theme-text';
                    
                    catBudgetsHtml += `<div class="theme-card p-4 rounded-2xl border shadow-sm flex flex-col justify-center"><div class="flex justify-between items-center mb-2"><h4 class="text-[10px] font-black uppercase ${textColor} truncate pr-2">${catName}</h4><button data-nexus-action="triggerUIDelete" data-nexus-payload='["cat_budget", "${catName}"]' class="text-slate-300 hover:text-red-500 shrink-0"><i class="fa-solid fa-trash text-[10px]"></i></button></div><div class="flex justify-between items-end gap-2 min-w-0 mb-1"><p class="text-[9px] font-black uppercase text-slate-400 shrink-0">Consumo</p><div class="nexus-amount-box min-w-0 text-right"><p class="nexus-amount-fit nexus-amt-compact font-black ${textColor}">${fmt(spent, bC)} <span class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">/ ${fmt(limit, bC)}</span></p></div></div><div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-1"><div class="h-full ${barColor} rounded-full transition-all" style="width: ${pct}%"></div></div><p class="text-[8px] font-bold text-slate-400 uppercase text-right">${pct.toFixed(1)}%</p></div>`;
                }
                catBudgetsHtml += `</div></div>`;
            }

            cont.innerHTML = `${html503020}${htmlZBB}${catBudgetsHtml}<div class="col-span-1 md:col-span-2 w-full mt-2"><h3 class="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2 mb-3">Proyección de Metas (Sinking Funds)</h3><div id="goals-list-container" class="space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 md:space-y-0">${goalsHtml}</div></div>`;
            nexusScheduleFit(cont);
        }

        function openGoalForm() { const mod = $id('goal-modal'); if(!mod) return; nexusShowModalInstant(mod); $id('g-name').value = ''; const amtEl = $id('g-amount'); amtEl.value = ''; amtEl.dataset.raw = ''; $id('g-date').value = ''; }
        function closeGoalForm() { nexusHideModalInstant($id('goal-modal')); }
        
        function saveGoal(e) {
            e.preventDefault(); const name = $id('g-name').value; const amount = parseFloat($id('g-amount').dataset.raw) || 0; const date = $id('g-date').value;
            if (!nexusRequireFormFields({ name, amount, date }, { numpad: true })) return;
            const [y,m,d] = date.split('-'); const goalDate = new Date(y, m-1, d); const now = new Date(); now.setHours(0,0,0,0);
            if (goalDate <= now) return alert("La fecha objetivo debe ser en el futuro.");
            state.goals = state.goals || []; state.goals.push({ id: 'goal_'+Date.now(), name, amount, currency: state.settings.baseCurrency || 'COP', deadline: date, createdAt: new Date().toISOString() });
            saveState(); closeGoalForm(); renderBudgetTab();
        }

        function openCatBudgetForm() {
            const mod = $id('cat-budget-modal'); if(!mod) return;
            const catSel = $id('cb-cat');
            if(catSel) {
                catSel.innerHTML = '';
                let expCats = new Set();
                
                nexusEnsureCategoryBuckets();
                
                (state.catParents.expense || []).forEach(p => expCats.add(p));
                (state.categories.expense || []).forEach(c => {
                    expCats.add(c);
                    const m = c.match(/\[(.*?)\]\s*(.*)/);
                    if(m && m[1]) expCats.add(m[1]);
                });
                
                Array.from(expCats).sort().forEach(c => {
                    catSel.innerHTML += `<option value="${c}">${c}</option>`;
                });
            }
            const amtEl = $id('cb-amount'); if(amtEl) { amtEl.value = ''; amtEl.dataset.raw = ''; }
            nexusShowModalInstant(mod);
        }

        function closeCatBudgetForm() { nexusHideModalInstant($id('cat-budget-modal')); }

        function saveCatBudget(e) {
            e.preventDefault();
            const cat = $id('cb-cat').value;
            const limit = parseFloat($id('cb-amount').dataset.raw);
            if (!cat || !limit || limit <= 0) return alert("Selecciona una categoría e ingresa un límite válido mayor a cero.");
            
            state.budgets = state.budgets || {};
            state.budgets[cat] = limit;
            saveState(); closeCatBudgetForm(); renderBudgetTab();
        }

        // --- MÓDULO DE TAREAS / PENDIENTES NO FINANCIEROS ---
        let taskCalMonthOffset = 0;
        let taskCalSelectedDate = null;
        let taskPriorityFilter = 'all'; // Estado del fichero de prioridades


  const api = {
    __state: global.NexusBudgetEngine.__state,
    renderBudgetTab,
    openGoalForm,
    closeGoalForm,
    saveGoal,
    openCatBudgetForm,
    closeCatBudgetForm,
    saveCatBudget
  };

  global.NexusBudgetEngine = api;
  global.renderBudgetTab = renderBudgetTab;
  global.openGoalForm = openGoalForm;
  global.closeGoalForm = closeGoalForm;
  global.saveGoal = saveGoal;
  global.openCatBudgetForm = openCatBudgetForm;
  global.closeCatBudgetForm = closeCatBudgetForm;
  global.saveCatBudget = saveCatBudget;

  console.info("[NEXUS] feature-presupuesto budget-engine.js cargado");
})(typeof window !== "undefined" ? window : globalThis);
