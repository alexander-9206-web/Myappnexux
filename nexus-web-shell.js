/* NEXUS WEB SHELL v3 — canal navegador (auto-copiado a web/ por sync) */
window.__nexusBundleVariant = 'web-browser';
window.__nexusForceWebBrowserMode = true;
window.__nexusPreferRedirectFallback = true;

(function () {
  if (location.protocol === 'file:') {
    var warn = document.createElement('div');
    warn.id = 'nexus-file-protocol-warn';
    warn.innerHTML = '<strong>NEXUS AR</strong> no puede ejecutarse con <code>file://</code>.<br>'
      + 'Usa: <code>bash scripts/serve-web.sh</code> y abre <code>http://localhost:8787/</code>';
    warn.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;padding:24px;background:#0f172a;color:#e2e8f0;font:600 15px/1.5 system-ui,sans-serif;text-align:center';
    document.documentElement.appendChild(warn);
    return;
  }

  function showAuthBanner(msg) {
    try {
      var el = document.getElementById('nexus-web-auth-banner');
      if (el) { el.textContent = msg; el.style.display = 'block'; return; }
      el = document.createElement('div');
      el.id = 'nexus-web-auth-banner';
      el.textContent = msg;
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;padding:10px 14px;font:600 13px/1.4 system-ui,sans-serif;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.2)';
      (document.body || document.documentElement).appendChild(el);
    } catch (e) { console.error('[NEXUS-WEB] banner', e, msg); }
  }
  window.__nexusShowWebAuthBanner = showAuthBanner;
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    var code = (r && (r.code || r.message)) || '';
    if (typeof code === 'string') {
      if (code.indexOf('auth/unauthorized-domain') >= 0) {
        showAuthBanner('Dominio no autorizado en Firebase. Añade ' + location.hostname + ' a Authentication → Authorized domains.');
      } else if (code.indexOf('auth/popup-blocked') >= 0 || code.indexOf('auth/popup-closed-by-user') >= 0) {
        showAuthBanner('Popup bloqueado. Reintenta con click directo o permite popups para ' + location.hostname + '.');
      } else if (code.indexOf('auth/network-request-failed') >= 0) {
        showAuthBanner('Sin red al contactar Firebase. Verifica tu conexión.');
      } else if (code.indexOf('auth/internal-error') >= 0) {
        showAuthBanner('Google no completó el login en este navegador. Reintenta (se usará redirección completa).');
      } else if (code.indexOf('auth/operation-not-allowed') >= 0) {
        showAuthBanner('Google Sign-In no está habilitado en Firebase Authentication.');
      }
    }
  });
  console.log('[NEXUS-WEB] Bundle navegador v3 · host=' + location.hostname);
})();
