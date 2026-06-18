/**
 * Puente vanilla — Auditoría modular + monolito legacy (sin build Vite).
 * Carga después de nexus-app.js cuando exista dist/nexus-boot.js o manualmente.
 */
(function (global) {
  'use strict';

  function refreshAudit() {
    if (typeof global.populateDbAccountFilter === 'function') global.populateDbAccountFilter();
    if (typeof global.renderDatabase === 'function') global.renderDatabase();
  }

  global.__nexusFeatureAuditRefresh = refreshAudit;

  function wireModularBus() {
    var modular = global.NexusModular;
    if (!modular || !modular.app || !modular.app.bus) return;
    modular.app.bus.on('router:navigated', function (payload) {
      if (payload && payload.moduleId === 'database') refreshAudit();
    });
    modular.app.bus.on('feature-auditoria:refresh', refreshAudit);
  }

  if (global.NexusModular) wireModularBus();
  else global.addEventListener('nexus:modular-ready', wireModularBus);

  var origSwitch = null;
  if (typeof global.switchTab === 'function') {
    origSwitch = global.switchTab;
    global.switchTab = function (id) {
      var r = origSwitch.apply(this, arguments);
      if (id === 'database' && global.NexusModular) {
        try {
          global.NexusModular.openModule('database');
        } catch (e) { /* coexistencia */ }
      }
      return r;
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
