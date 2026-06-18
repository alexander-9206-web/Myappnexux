/**
 * Puente vanilla — Presupuesto modular + monolito legacy.
 */
(function (global) {
  'use strict';
  function refresh() {
    if (typeof global.renderBudgetTab === 'function') global.renderBudgetTab();
  }
  global.__nexusFeaturePresupuestoRefresh = refresh;
  function wire() {
    var m = global.NexusModular;
    if (!m || !m.app || !m.app.bus) return;
    m.app.bus.on('router:navigated', function (p) { if (p && p.moduleId === 'presupuesto') refresh(); });
    m.app.bus.on('feature-presupuesto:refresh', refresh);
  }
  if (global.NexusModular) wire();
  else global.addEventListener('nexus:modular-ready', wire);
})(typeof window !== 'undefined' ? window : globalThis);
