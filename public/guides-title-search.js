// Client-side title search over already-authorized guide cards; no extra Firestore reads.
(() => {
  function init() {
    const view = document.getElementById('guidesView');
    const toolbar = view?.querySelector('.guide-toolbar');
    const panel = view?.querySelector('.panel');
    const typeSelect = document.getElementById('guideType');
    const applyCategories = document.getElementById('guideApply');
    const clearCategories = document.getElementById('guideClear');
    const selectedCategories = document.getElementById('guideSelected');
    let appliedCategories = [];
    if (!toolbar || !panel || document.getElementById('guideTitleSearch')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'guide-title-search';
    const label = document.createElement('label');
    label.htmlFor = 'guideTitleSearch';
    label.textContent = 'ค้นหาชื่อคู่มือ';
    const input = document.createElement('input');
    input.id = 'guideTitleSearch';
    input.type = 'search';
    input.placeholder = 'พิมพ์ชื่อคู่มือหรือคำสำคัญ…';
    input.autocomplete = 'off';
    const status = document.createElement('span');
    status.id = 'guideTitleSearchStatus';
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
    wrapper.append(label,input,status);
    toolbar.insertAdjacentElement('afterend',wrapper);
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.id = 'guideResetAllFilters';
    reset.className = 'btn guide-reset-all';
    reset.textContent = 'ล้างตัวกรองทั้งหมด';
    reset.hidden = true;
    wrapper.appendChild(reset);
    const normalize = value => String(value || '').normalize('NFC').toLocaleLowerCase('th-TH').trim();
    const update = () => {
      const query = normalize(input.value);
      const selectedType = normalize(typeSelect?.value);
      const filterType = selectedType && selectedType !== normalize('สื่อทุกประเภท');
      const cards = [...panel.querySelectorAll(':scope > .doc')];
      const filterCategory = appliedCategories.length > 0;
      let visible = 0;
      cards.forEach(card => {
        // Rows already open on click; make the same action available to keyboard users.
        if (!card.hasAttribute('tabindex')) {
          card.tabIndex = 0;
          card.setAttribute('role', 'link');
          card.setAttribute('aria-label', 'เปิดอ่าน ' + (card.querySelector('.doc-title')?.textContent || 'คู่มือ'));
        }
        const title = normalize(card.querySelector('.doc-title')?.textContent);
        const metadata = normalize(card.querySelector('.doc-meta')?.textContent);
        // Category display can contain both group and name, separated by •.
        // Match the selected media type by an exact metadata segment, not a fixed index.
        const segments = metadata.split('•').map(normalize).filter(Boolean);
        const knownTypes = new Set([...(typeSelect?.options || [])].map(option => normalize(option.value || option.textContent)).filter(type => type && type !== normalize('สื่อทุกประเภท')));
        const typeIndex = segments.findIndex(segment => knownTypes.has(segment));
        const type = typeIndex < 0 ? '' : segments[typeIndex];
        const categorySegments = typeIndex < 0 ? segments.slice(0, 2) : segments.slice(0, typeIndex);
        const matchesText = !query || title.includes(query) || metadata.includes(query);
        const matchesType = !filterType || type === selectedType;
        const matchesCategory = !filterCategory || appliedCategories.some(name => categorySegments.includes(name));
        const matches = matchesText && matchesType && matchesCategory;
        card.hidden = !matches;
        if (matches) visible++;
      });
      reset.hidden = !(query || filterType || filterCategory);
      status.textContent = 'แสดง ' + visible + ' จาก ' + cards.length + ' รายการที่โหลดแล้ว';
      const count = document.getElementById('guideResultCount');
      if (count && cards.length) count.textContent = 'พบ ' + visible + ' รายการ';
      let empty = document.getElementById('guideTitleSearchEmpty');
      if ((query || filterType || filterCategory) && cards.length && !visible) {
        if (!empty) {
          empty = document.createElement('p');
          empty.id = 'guideTitleSearchEmpty';
          empty.className = 'empty-note';
          empty.textContent = 'ไม่พบคู่มือที่ตรงกับตัวกรองที่เลือก';
          const clear = document.createElement('button');
          clear.type = 'button';
          clear.className = 'btn';
          clear.textContent = 'ล้างตัวกรองทั้งหมด';
          clear.addEventListener('click', () => reset.click());
          empty.appendChild(clear);
          panel.appendChild(empty);
        }
      } else empty?.remove();
    };
    input.addEventListener('input',update);
    input.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (input.value) {
        event.preventDefault();
        event.stopPropagation();
        input.value = '';
        update();
      } else input.blur();
    });
    document.addEventListener('keydown', event => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing) return;
      if (!view.classList.contains('active') || view.closest('[hidden]')) return;
      const target = event.target;
      if (target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.focus();
    }, true);
    const readCategories = () => [...(selectedCategories?.querySelectorAll('.selected-item') || [])].map(button => normalize(button.textContent.replace(/\s*×\s*$/, ''))).filter(Boolean);
    applyCategories?.addEventListener('click', () => { appliedCategories = readCategories(); queueMicrotask(update); });
    clearCategories?.addEventListener('click', () => { appliedCategories = []; queueMicrotask(update); });
    typeSelect?.addEventListener('change',update);
    reset.addEventListener('click', () => {
      input.value = '';
      if (typeSelect) typeSelect.selectedIndex = 0;
      clearCategories?.click();
      appliedCategories = [];
      update();
      input.focus();
    });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target?.closest?.('.doc');
      if (!row || event.target !== row || row.hidden) return;
      event.preventDefault();
      row.click();
    });
    const observer = new MutationObserver(update);
    observer.observe(panel,{childList:true});
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
