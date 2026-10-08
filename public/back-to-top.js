// Non-invasive return-to-top control for long knowledge pages.
(() => {
  function init() {
    if (document.getElementById('landKmBackToTop')) return;
    const shell = document.getElementById('appShell');
    if (!shell) return;
    const button = document.createElement('button');
    button.id = 'landKmBackToTop';
    button.className = 'land-km-back-to-top';
    button.type = 'button';
    button.textContent = '↑ กลับด้านบน';
    button.setAttribute('aria-label', 'เลื่อนกลับไปด้านบนของหน้า');
    button.hidden = true;
    button.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
    document.body.appendChild(button);
    const update = () => {
      const appVisible = !shell.hidden && getComputedStyle(shell).display !== 'none';
      const visibleView = shell.querySelector('.view.active');
      button.hidden = !appVisible || !visibleView || window.scrollY < 450;
    };
    window.addEventListener('scroll', update, { passive:true });
    window.addEventListener('resize', update);
    const observer = new MutationObserver(update);
    observer.observe(shell, { attributes:true, attributeFilter:['class','hidden'] });
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
