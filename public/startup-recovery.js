// Non-invasive startup recovery UI: no credentials, error details, or user data are logged.
const root = document.createElement('div');
root.id = 'landKmStartupRecovery';
root.setAttribute('role', 'alert');
root.hidden = true;
root.style.cssText = 'position:fixed;bottom:20px;left:20px;right:20px;max-width:540px;margin:auto;z-index:99999;background:#fff;border:1px solid #e3e8ef;border-radius:14px;box-shadow:0 10px 40px #17233b33;padding:18px;font:15px/1.6 Tahoma,sans-serif;color:#17233b';
const message = document.createElement('p');
message.textContent = 'ระบบเริ่มต้นไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตและลองโหลดหน้าเว็บใหม่';
message.style.margin = '0 0 12px';
const retry = document.createElement('button');
retry.type = 'button';
retry.textContent = 'ลองโหลดใหม่';
retry.style.cssText = 'background:#087f73;color:white;border:0;border-radius:8px;padding:9px 18px;cursor:pointer';
retry.addEventListener('click', () => window.location.reload());
root.append(message, retry);
document.body.append(root);

let recovered = false;
const showRecovery = () => {
  if (recovered) return;
  recovered = true;
  root.hidden = false;
};
window.addEventListener('error', event => {
  if (event.target && event.target !== window) return;
  showRecovery();
});
window.addEventListener('unhandledrejection', showRecovery);

// A stuck sign-in screen is actionable without inspecting sensitive Firebase state.
// Do not display a warning if the application shell is already visible.
window.setTimeout(() => {
  const shell = document.getElementById('appShell');
  const gate = document.getElementById('authGate');
  const shellVisible = shell && !shell.hidden && getComputedStyle(shell).display !== 'none';
  const gateVisible = gate && !gate.hidden && getComputedStyle(gate).display !== 'none';
  if (!shellVisible && !gateVisible) showRecovery();
}, 20000);
