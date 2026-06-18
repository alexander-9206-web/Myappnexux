/**
 * Puente vanilla — Analitica modular + monolito legacy.
 */
(function (global) {
  'use strict';
  function refresh() {
    if (typeof global.renderAnalysis === 'function') global.renderAnalysis();
  }
  global.__nexusFeatureAnaliticaRefresh = refresh;
  function wire() {
    var m = global.NexusModular;
    if (!m || !m.app || !m.app.bus) return;
    m.app.bus.on('router:navigated', function (p) { if (p && p.moduleId === 'analitica') refresh(); });
    m.app.bus.on('feature-analitica:refresh', refresh);
  }
  if (global.NexusModular) wire();
  else global.addEventListener('nexus:modular-ready', wire);
})(typeof window !== 'undefined' ? window : globalThis);
