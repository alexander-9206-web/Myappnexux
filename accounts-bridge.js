/**
 * Puente vanilla — Cuentas modular + monolito legacy (sin build Vite).
 */
(function (global) {
  'use strict';

  function refreshAccounts() {
    if (typeof global.renderAccountsTab === 'function') global.renderAccountsTab();
    if (typeof global.renderAccounts === 'function') global.renderAccounts();
  }

  global.__nexusFeatureAccountsRefresh = refreshAccounts;

  function wireModularBus() {
    var modular = global.NexusModular;
    if (!modular || !modular.app || !modular.app.bus) return;
    modular.app.bus.on('router:navigated', function (payload) {
      if (payload && payload.moduleId === 'accounts') refreshAccounts();
    });
    modular.app.bus.on('feature-cuentas:refresh', refreshAccounts);
  }

  if (global.NexusModular) wireModularBus();
  else global.addEventListener('nexus:modular-ready', wireModularBus);
})(typeof window !== 'undefined' ? window : globalThis);
