/**
 * NEXUS feature-agenda — Motor SSoT (Fase 1+2)
 */
(function (global) {
  "use strict";

  if (!global.NexusAgendaEngine) global.NexusAgendaEngine = { __state: {} };

        let calMonthOffset = 0;
        let calSelectedDate = null;

        function changeCalMonth(val) {
            if (val === 0) calMonthOffset = 0;
            else calMonthOffset += val;
            calSelectedDate = null;
            renderCalendar();
        }

        function setCalendarDate(dateStr) {
            if (calSelectedDate === dateStr) calSelectedDate = null;
            else calSelectedDate = dateStr;
            renderCalendar();
        }

        // =============================================================================
        // 3.06 — MÓDULO AGENDA
        // Calendario de pagos y vencimientos
        // =============================================================================

        function renderCalendar() {
            if (global.__NexusAgendaDomain && typeof global.__NexusAgendaDomain.render === "function") {
                return global.__NexusAgendaDomain.render();
            }
            prepareCalendar();
            return paintCalendar(true);
        }

        function prepareCalendar() {
            const now = new Date(); now.setHours(0,0,0,0);
            const viewDate = new Date(now.getFullYear(), now.getMonth() + calMonthOffset, 1);
            
            const fE_global = generateFutureEvents();
            let fE = fE_global;
            
            if (state.calendarFilter === 'week') {
                const eW = new Date(now); eW.setDate(eW.getDate() + 7);
                fE = fE.filter(ev => ev.date >= now && ev.date <= eW);
            } else if (state.calendarFilter === 'month') {
                fE = fE.filter(ev => ev.date.getMonth() === now.getMonth() && ev.date.getFullYear() === now.getFullYear());
            } else if (state.calendarFilter === 'all') {
                const eA = new Date(now); eA.setDate(eA.getDate() + 60);
                fE = fE.filter(ev => ev.date >= now && ev.date <= eA);
            } else if (state.calendarFilter === 'custom') {
                const st = new Date($id('cal-filter-start').value);
                const en = new Date($id('cal-filter-end').value); en.setHours(23,59,59);
                fE = fE.filter(ev => ev.date >= st && ev.date <= en);
            }
            fE.sort((a,b) => a.date - b.date);

            const currFilter = $id('cal-filter-currency') ? $id('cal-filter-currency').value : 'ALL';
            if (currFilter !== 'ALL') {
                fE = fE.filter(ev => ev.origCurrency === currFilter);
            }

            let displayFE = fE;
            if (calSelectedDate) {
                displayFE = fE.filter(ev => {
                    const edStr = ev.date.getFullYear() + '-' + String(ev.date.getMonth()+1).padStart(2,'0') + '-' + String(ev.date.getDate()).padStart(2,'0');
                    return edStr === calSelectedDate;
                });
            }

            if (!global.NexusAgendaEngine.__state) global.NexusAgendaEngine.__state = {};
            const stAg = global.NexusAgendaEngine.__state;
            stAg.now = now;
            stAg.viewDate = viewDate;
            stAg.fE = fE;
            stAg.displayFE = displayFE;
            let customDaysPrep = 30;
            if (state.calendarFilter === 'custom') {
                const stD = new Date($id('cal-filter-start').value);
                const enD = new Date($id('cal-filter-end').value);
                customDaysPrep = Math.max(1, Math.round((enD - stD) / 86400000));
            }
            stAg.customDays = customDaysPrep;
        }

        function paintCalendar(computeStats) {
            const stAg = global.NexusAgendaEngine.__state || {};
            const now = stAg.now || new Date();
            const viewDate = stAg.viewDate || new Date();
            const fE = stAg.fE || [];
            const displayFE = stAg.displayFE || [];
            const customDays = stAg.customDays || 30;

            const tC = $id('calendar-timeline');
            if (tC) {
                if (displayFE.length === 0) {
                    tC.innerHTML = `<div class="text-center p-8 bg-slate-50/50 rounded-2xl"><p class="text-[10px] font-black uppercase text-slate-400">${calSelectedDate ? 'No hay pagos para el día seleccionado.' : 'Todo al día.'}</p></div>`;
                }
                else {
                    tC.innerHTML = displayFE.map(ev => {
                        const dT = Math.abs(ev.date - now); const dD = Math.round(dT / 86400000); const tT = dD === 0 ? 'Hoy' : dD === 1 ? 'Mañana' : `En ${dD} días`;
                        const amtStrPrimary = fmt(ev.origAmount, ev.origCurrency);
                        return `<div class="relative timeline-item pb-6"><div class="timeline-dot ${ev.bg}"></div><div class="flex justify-between items-start"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full ${ev.bg} ${ev.color} flex items-center justify-center shrink-0"><i class="fa-solid ${ev.icon} text-[10px]"></i></div><div><h4 class="text-xs font-black uppercase theme-text">${ev.title}</h4><p class="text-[9px] font-bold text-slate-400 uppercase mt-1">${ev.date.toLocaleDateString('es-CO', {weekday: 'short', day: 'numeric', month: 'short'})} • <span class="${ev.color}">${tT}</span></p></div></div><div class="text-right"><p class="text-sm font-black ${ev.color}">${amtStrPrimary}</p></div></div></div>`;
                    }).join('');
                }
            }
            const gmEl = $id('cal-grid-month'); if(gmEl) gmEl.innerText = viewDate.toLocaleDateString('es-CO', {month: 'long', year: 'numeric'});
            
            if (computeStats && !(global.NexusAgendaEngine && global.NexusAgendaEngine.__state && global.NexusAgendaEngine.__state.skipKpiRecompute)) {
            // Lógica Pura: Filtrado Multidivisa Estricto (Sin Conversión)
            const curr1 = $id('cal-cov-currency-1') ? $id('cal-cov-currency-1').value : 'COP';
            const curr2 = $id('cal-cov-currency-2') ? $id('cal-cov-currency-2').value : 'USD';

            // Las deudas ahora se calculan estrictamente en base al periodo filtrado (fE) y no al global
            const debt1 = fE.filter(ev => ev.origCurrency === curr1).reduce((s, ev) => s + ev.origAmount, 0);
            const debt2 = fE.filter(ev => ev.origCurrency === curr2).reduce((s, ev) => s + ev.origAmount, 0);

            let totalDebtConsolidated = 0;
            fE.forEach(ev => { totalDebtConsolidated += convertCurrency(ev.origAmount, ev.origCurrency, curr2); });
            const elTotalCons = $id('cal-total-consolidated-debt'); if (elTotalCons) elTotalCons.innerText = fmt(totalDebtConsolidated, curr2);
            $qAll('.currency-label-2-native').forEach(el => el.innerText = curr2);

            // Etiqueta dinámica del periodo seleccionado
            let pLbl = 'Total';
            if (state.calendarFilter === 'week') pLbl = '7 Días';
            else if (state.calendarFilter === 'month') pLbl = 'Este Mes';
            else if (state.calendarFilter === 'all') pLbl = '60 Días';
            else if (state.calendarFilter === 'custom') pLbl = 'Personalizado';
            $qAll('.cal-period-label').forEach(el => el.innerText = `[${pLbl}]`);

            const rTx = (state.tx || []).filter(t => {
                if (!t || t.type !== 'income' || t.isProjected) return false;
                return new Date(t.date) >= new Date(now.getTime() - 30 * 86400000);
            });
            
            const rI1 = rTx.filter(t => (t.original_currency || t.currency) === curr1).reduce((s,t) => s + (t.original_amount || t.amount), 0);
            const rI2 = rTx.filter(t => (t.original_currency || t.currency) === curr2).reduce((s,t) => s + (t.original_amount || t.amount), 0);

            let inc1 = 0, inc2 = 0;
            if (state.calendarFilter === 'week') { inc1 = rI1 / 4.28; inc2 = rI2 / 4.28; }
            else if (state.calendarFilter === 'month') { inc1 = rI1; inc2 = rI2; }
            else if (state.calendarFilter === 'all') { inc1 = rI1 * 2; inc2 = rI2 * 2; }
            else if (state.calendarFilter === 'custom') { inc1 = (rI1 / 30) * customDays; inc2 = (rI2 / 30) * customDays; }
            else { inc1 = rI1 / 4.28; inc2 = rI2 / 4.28; }

            const wd1 = $id('cal-weekly-debt-1'); if(wd1) wd1.innerText = fmt(debt1, curr1);
            const wi1 = $id('cal-weekly-inc-1'); if(wi1) wi1.innerText = fmt(inc1, curr1);
            const wd2 = $id('cal-weekly-debt-2'); if(wd2) wd2.innerText = fmt(debt2, curr2);
            const wi2 = $id('cal-weekly-inc-2'); if(wi2) wi2.innerText = fmt(inc2, curr2);

            const cv1 = inc1 - debt1;
            const cv2 = inc2 - debt2;
            let nT = `<b>${curr1}:</b> ${cv1 >= 0 ? '<span class="text-emerald-600">Flujo Positivo (+' + fmt(cv1, curr1) + ')</span>' : '<span class="text-red-600">Déficit (-' + fmt(Math.abs(cv1), curr1) + ')</span>'} &nbsp; | &nbsp; `;
            nT += `<b>${curr2}:</b> ${cv2 >= 0 ? '<span class="text-emerald-600">Flujo Positivo (+' + fmt(cv2, curr2) + ')</span>' : '<span class="text-red-600">Déficit (-' + fmt(Math.abs(cv2), curr2) + ')</span>'}`;
            const cnEl = $id('cal-coverage-narrative'); if(cnEl) cnEl.innerHTML = nT;
            }
            nexusScheduleFit($id('tab-calendar'));
            
            const gridDays = $id('cal-grid-days');
            if(gridDays) {
                let gridHtml = ''; const fdom = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1); const ldom = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
                let startDay = fdom.getDay() - 1; if(startDay < 0) startDay = 6;
                for(let i=0; i<startDay; i++) gridHtml += `<div class="cal-cell is-empty"></div>`;
                const globalFE = generateFutureEvents();
                for(let i=1; i<=ldom.getDate(); i++) {
                    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), i); const isToday = d.toDateString() === now.toDateString();
                    const dStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
                    const isSelected = calSelectedDate === dStr;
                    const hasEv = globalFE.some(ev => ev.date.toDateString() === d.toDateString());
                    
                    let extraClasses = 'cursor-pointer transition-all hover:bg-rose-50 ';
                    if(isSelected) extraClasses += 'ring-2 ring-rose-500 ring-offset-1 font-black shadow-sm bg-rose-50 text-rose-600 ';
                    
                    gridHtml += `<div data-nexus-action="setCalendarDate" data-nexus-arg="${dStr}" class="cal-cell ${isToday ? 'is-today' : ''} ${hasEv && !isToday ? 'has-event' : ''} ${extraClasses}">${i}${hasEv ? '<div class="cal-event-dot"></div>' : ''}</div>`;
                }
                gridDays.innerHTML = gridHtml;
            }
        }

        function setCalendarFilter(f) {
            const valid = ['week', 'month', 'all', 'custom'];
            if (!valid.includes(f)) f = NEXUS_FILTER_DEFAULTS.calendar;
            state.calendarFilter = f;
            calSelectedDate = null;
            $qAll('#tab-calendar .filter-chip').forEach(b => b.classList.remove('active'));
            const btn = $id('f-cal-' + f); if(btn) btn.classList.add('active');
            const customRange = $id('cal-custom-range');
            if (customRange) {
                if (f === 'custom') customRange.classList.remove('hidden');
                else customRange.classList.add('hidden');
            }
            renderCalendar();
            nexusPersistCloudConfig(['core'], 'settings');
        }

        function generateFutureEvents() {
            const events = [];
            const enriched = getEnrichedTx({ forAgenda: true }).filter(t => t.isProjected || (t.type === 'expense' && t.cat && t.cat.includes('Afterpay') && t.note && t.note.match(/\[(Abono Realizado|Abono|Pago Inicial)\]/)));
            enriched.forEach(t => {
                const isAp = t.cat.includes('Afterpay');
                const isAmortized = !t.isProjected;
                
                let evBg = isAmortized ? 'bg-emerald-100' : (isAp ? 'bg-teal-100' : 'bg-rose-100');
                let evColor = isAmortized ? 'text-emerald-600' : (isAp ? 'text-teal-600' : 'text-rose-600');
                
                if (!isAmortized && !isAp && t.priority) {
                    if (t.priority === 'high') { evBg = 'bg-red-100'; evColor = 'text-red-600'; }
                    else if (t.priority === 'medium') { evBg = 'bg-amber-100'; evColor = 'text-amber-600'; }
                    else if (t.priority === 'low') { evBg = 'bg-emerald-100'; evColor = 'text-emerald-600'; }
                }

                events.push({
                    date: new Date(t.date),
                    title: t.note || t.cat,
                    amount: t.amount,
                    origAmount: t.original_amount || t.amount,
                    origCurrency: t.original_currency || t.currency,
                    bg: evBg,
                    color: evColor,
                    icon: isAmortized ? 'fa-check' : (isAp ? 'fa-layer-group' : 'fa-file-invoice-dollar')
                });
            });
            return events;
        }


  const api = {
    __state: global.NexusAgendaEngine.__state,
    prepare: prepareCalendar,
    paint: function () { return paintCalendar(false); },
    render: renderCalendar,
    changeCalMonth,
    setCalendarDate,
    setCalendarFilter,
    generateFutureEvents
  };

  global.NexusAgendaEngine = api;
  global.changeCalMonth = changeCalMonth;
  global.setCalendarDate = setCalendarDate;
  global.renderCalendar = renderCalendar;
  global.setCalendarFilter = setCalendarFilter;
  global.generateFutureEvents = generateFutureEvents;

  console.info("[NEXUS] feature-agenda agenda-engine.js cargado");
})(typeof window !== "undefined" ? window : globalThis);
