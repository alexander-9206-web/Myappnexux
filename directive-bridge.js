/**
 * Puente vanilla — Directiva modular + monolito legacy.
 */
(function (global) {
  'use strict';
  function refresh() {
    if (typeof global.renderReport === 'function') global.renderReport();
  }
  global.__nexusFeatureDirectivaRefresh = refresh;
  function wire() {
    var m = global.NexusModular;
    if (!m || !m.app || !m.app.bus) return;
    m.app.bus.on('router:navigated', function (p) { if (p && p.moduleId === 'directiva') refresh(); });
    m.app.bus.on('feature-directiva:refresh', refresh);
  }
  if (global.NexusModular) wire();
  else global.addEventListener('nexus:modular-ready', wire);
})(typeof window !== 'undefined' ? window : globalThis);
