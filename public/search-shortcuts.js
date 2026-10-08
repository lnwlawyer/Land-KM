// Keyboard search shortcut. Uses existing search navigation and form handlers.
(() => {
  const isEditing = element => {
    if (!element) return false;
    const tag = element.tagName?.toLowerCase();
    return element.isContentEditable || ['input', 'textarea', 'select'].includes(tag) || Boolean(element.closest?.('[contenteditable="true"]'));
  };
  const visible = element => Boolean(element && element.isConnected && !element.hidden && getComputedStyle(element).display !== 'none');
  function init() {
    const search = document.getElementById('resultInput');
    const home = document.getElementById('heroInput');
    const nav = document.querySelector('#appShell aside .nav button[data-view="searchView"]');
    if (!search || !nav || !home) return;
    home.setAttribute('aria-keyshortcuts', '/');
    search.setAttribute('aria-keyshortcuts', '/');
    const hint = document.createElement('small');
    hint.className = 'search-shortcut-hint';
    hint.textContent = 'กด / เพื่อค้นหาจากทุกหน้า · Esc เพื่อออกจากช่องค้นหา';
    home.closest('form')?.insertAdjacentElement('afterend', hint);
    document.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (event.key === 'Escape' && document.activeElement === search) {
        search.blur();
        return;
      }
      if (event.key !== '/' || isEditing(event.target)) return;
      const shell = document.getElementById('appShell');
      if (!visible(shell) || nav.hidden || nav.disabled) return;
      event.preventDefault();
      const searchView = document.getElementById('searchView');
      if (!searchView?.classList.contains('active')) nav.click();
      requestAnimationFrame(() => search.focus());
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
