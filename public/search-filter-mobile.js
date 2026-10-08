// Progressive disclosure of existing search filters on narrow screens.
(() => {
  function init() {
    const search = document.getElementById('searchView');
    const filters = search?.querySelector('.results-layout > aside.filters');
    if (!search || !filters || document.getElementById('searchFilterToggle')) return;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'searchFilterToggle';
    toggle.className = 'btn search-filter-toggle';
    toggle.textContent = 'ตัวกรองผลการค้นหา';
    toggle.setAttribute('aria-controls', 'searchFiltersPanel');
    filters.id = 'searchFiltersPanel';
    filters.before(toggle);
    const narrow = window.matchMedia('(max-width: 700px)');
    let userChanged = false;
    const setExpanded = expanded => {
      filters.classList.toggle('filters-collapsed', !expanded);
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'ซ่อนตัวกรอง' : 'แสดงตัวกรองผลการค้นหา';
    };
    const sync = () => {
      if (!narrow.matches) {
        setExpanded(true);
      } else if (!userChanged) {
        setExpanded(false);
      }
    };
    toggle.addEventListener('click', () => {
      userChanged = true;
      setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
    });
    filters.querySelector('#applyFilters')?.addEventListener('click', () => {
      if (narrow.matches) setExpanded(false);
    });
    narrow.addEventListener?.('change', () => {
      userChanged = false;
      sync();
    });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
