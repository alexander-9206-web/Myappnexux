/**
 * Puente vanilla — Deudas modular + monolito legacy (sin build Vite).
 */
(function (global) {
  'use strict';

  function refreshLoans() {
    if (typeof global.renderLoansList === 'function') global.renderLoansList();
  }

  global.__nexusFeatureLoansRefresh = refreshLoans;

  function wireModularBus() {
    var modular = global.NexusModular;
    if (!modular || !modular.app || !modular.app.bus) return;
    modular.app.bus.on('router:navigated', function (payload) {
      if (payload && payload.moduleId === 'loans') refreshLoans();
    });
    modular.app.bus.on('feature-deudas:refresh', refreshLoans);
  }

  if (global.NexusModular) wireModularBus();
  else global.addEventListener('nexus:modular-ready', wireModularBus);
})(typeof window !== 'undefined' ? window : globalThis);
