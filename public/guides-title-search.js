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
    const normalize = value => String(value || '').normalize('NFC').toLocaleLowerCase('th-TH').trim();
    const update = () => {
      const query = normalize(input.value);
      const selectedType = normalize(typeSelect?.value);
      const filterType = selectedType && selectedType !== normalize('สื่อทุกประเภท');
      const cards = [...panel.querySelectorAll(':scope > .doc')];
      const filterCategory = appliedCategories.length > 0;
      let visible = 0;
      cards.forEach(card => {
        const title = normalize(card.querySelector('.doc-title')?.textContent);
        const metadata = normalize(card.querySelector('.doc-meta')?.textContent);
        const type = normalize((card.querySelector('.doc-meta')?.textContent || '').split('•').map(part => part.trim())[1]);
        const matchesText = !query || title.includes(query) || metadata.includes(query);
        const matchesType = !filterType || type === selectedType;
        const matchesCategory = !filterCategory || appliedCategories.some(name => metadata.split('•')[0]?.includes(name));
        const matches = matchesText && matchesType && matchesCategory;
        card.hidden = !matches;
        if (matches) visible++;
      });
      reset.hidden = !(query || filterType || filterCategory);
      status.textContent = query || filterType || filterCategory ? 'แสดง ' + visible + ' จาก ' + cards.length + ' รายการที่โหลดแล้ว' : '';
      let empty = document.getElementById('guideTitleSearchEmpty');
      if ((query || filterType || filterCategory) && cards.length && !visible) {
        if (!empty) {
          empty = document.createElement('p');
          empty.id = 'guideTitleSearchEmpty';
          empty.className = 'empty-note';
          empty.textContent = 'ไม่พบคู่มือที่ตรงกับคำค้น ลองใช้คำค้นอื่น';
          panel.appendChild(empty);
        }
      } else empty?.remove();
    };
    input.addEventListener('input',update);
    const readCategories = () => [...(selectedCategories?.querySelectorAll('.selected-item') || [])].map(button => normalize(button.textContent.replace(/\s*×\s*$/, ''))).filter(Boolean);
    applyCategories?.addEventListener('click', () => { appliedCategories = readCategories(); update(); });
    clearCategories?.addEventListener('click', () => { appliedCategories = []; update(); });
    typeSelect?.addEventListener('change',update);
    reset.addEventListener('click', () => {
      input.value = '';
      if (typeSelect) typeSelect.selectedIndex = 0;
      clearCategories?.click();
      appliedCategories = [];
      update();
      input.focus();
    });
    const observer = new MutationObserver(update);
    observer.observe(panel,{childList:true});
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
