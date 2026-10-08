// Client-side title search over already-authorized guide cards; no extra Firestore reads.
(() => {
  function init() {
    const view = document.getElementById('guidesView');
    const toolbar = view?.querySelector('.guide-toolbar');
    const panel = view?.querySelector('.panel');
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
      const cards = [...panel.querySelectorAll(':scope > .doc')];
      let visible = 0;
      cards.forEach(card => {
        const title = normalize(card.querySelector('.doc-title')?.textContent);
        const metadata = normalize(card.querySelector('.doc-meta')?.textContent);
        const matches = !query || title.includes(query) || metadata.includes(query);
        card.hidden = !matches;
        if (matches) visible++;
      });
      status.textContent = query ? 'แสดง ' + visible + ' จาก ' + cards.length + ' รายการที่โหลดแล้ว' : '';
      let empty = document.getElementById('guideTitleSearchEmpty');
      if (query && cards.length && !visible) {
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
    const observer = new MutationObserver(update);
    observer.observe(panel,{childList:true});
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
