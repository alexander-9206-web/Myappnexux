/**
 * Puente vanilla — Finanzas modular + monolito legacy.
 */
(function (global) {
  'use strict';
  function refresh() {
    if (typeof global.renderFinancesUnified === 'function') global.renderFinancesUnified();
  }
  global.__nexusFeatureFinanzasRefresh = refresh;
  function wire() {
    var m = global.NexusModular;
    if (!m || !m.app || !m.app.bus) return;
    m.app.bus.on('router:navigated', function (p) { if (p && p.moduleId === 'finanzas') refresh(); });
    m.app.bus.on('feature-finanzas:refresh', refresh);
  }
  if (global.NexusModular) wire();
  else global.addEventListener('nexus:modular-ready', wire);
})(typeof window !== 'undefined' ? window : globalThis);
