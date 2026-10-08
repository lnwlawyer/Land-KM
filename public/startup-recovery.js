// Non-invasive startup recovery UI: no credentials, error details, or user data are logged.
const root = document.createElement('div');
root.id = 'landKmStartupRecovery';
root.setAttribute('role', 'alert');
root.setAttribute('aria-live', 'assertive');
root.setAttribute('aria-label', 'การกู้คืนระบบ Land-KM');
root.hidden = true;
root.style.cssText = 'position:fixed;bottom:20px;left:20px;right:20px;max-width:540px;margin:auto;z-index:99999;background:#fff;border:1px solid #e3e8ef;border-radius:14px;box-shadow:0 10px 40px #17233b33;padding:18px;font:15px/1.6 Tahoma,sans-serif;color:#17233b';
const message = document.createElement('p');
message.textContent = 'ระบบเริ่มต้นไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตและลองโหลดหน้าเว็บใหม่';
message.style.margin = '0 0 12px';
const retry = document.createElement('button');
retry.type = 'button';
retry.setAttribute('aria-label', 'ลองโหลดหน้า Land-KM ใหม่');
retry.textContent = 'ลองโหลดใหม่';
retry.style.cssText = 'background:#087f73;color:white;border:0;border-radius:8px;padding:9px 18px;cursor:pointer';
retry.addEventListener('click', () => window.location.reload());
root.append(message, retry);
if (document.body) document.body.append(root);
else document.addEventListener('DOMContentLoaded', () => document.body.append(root), { once:true });

let recovered = false;
let recoveryReason = '';
let appReady = false;
const markReady = () => {
  if (!isAppUnavailable()) {
    appReady = true;
    recovered = false;
    root.hidden = true;
  }
};
const showRecovery = reason => {
  if (recovered || appReady) return;
  recovered = true;
  recoveryReason = reason || 'startup';
  root.dataset.reason = recoveryReason;
  root.hidden = false;
  retry.focus?.();
};
// Only show a global recovery prompt when the application cannot be displayed.
// Individual Firestore requests may fail while the rest of the app is usable.
const isAppUnavailable = () => {
  const shell = document.getElementById('appShell');
  const gate = document.getElementById('authGate');
  const visible = element => {
    if (!element || !element.isConnected) return false;
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      if (node.hidden) return false;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    return true;
  };
  return !visible(shell) && !visible(gate);
};
window.addEventListener('error', event => {
  if (event.target && event.target !== window) return;
  if (isAppUnavailable()) showRecovery('startup');
});
window.addEventListener('unhandledrejection', () => {
  if (isAppUnavailable()) showRecovery();
});

// A stuck sign-in screen is actionable without inspecting sensitive Firebase state.
// Do not display a warning if the application shell is already visible.
window.setTimeout(() => {
  if (isAppUnavailable()) showRecovery('timeout');
  else markReady();
}, 20000);

// Once the sign-in gate or app shell becomes available, ignore late background errors.
window.addEventListener('load', markReady);
