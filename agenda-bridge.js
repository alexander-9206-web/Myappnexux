/**
 * Puente vanilla — Agenda modular + monolito legacy.
 */
(function (global) {
  'use strict';
  function refresh() {
    if (typeof global.renderCalendar === 'function') global.renderCalendar();
  }
  global.__nexusFeatureAgendaRefresh = refresh;
  function wire() {
    var m = global.NexusModular;
    if (!m || !m.app || !m.app.bus) return;
    m.app.bus.on('router:navigated', function (p) { if (p && p.moduleId === 'agenda') refresh(); });
    m.app.bus.on('feature-agenda:refresh', refresh);
  }
  if (global.NexusModular) wire();
  else global.addEventListener('nexus:modular-ready', wire);
})(typeof window !== 'undefined' ? window : globalThis);
