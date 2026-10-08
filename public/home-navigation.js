// Progressive homepage enhancement: reuses existing navigation and permissions.
(() => {
  const shortcuts = [
    ['searchView', '⌕', 'ค้นหาความรู้', 'ค้นหาเอกสารและเนื้อหาทุกประเภท'],
    ['knowledgeView', '◈', 'องค์ความรู้', 'บทสรุปและแนวทางปฏิบัติ'],
    ['lawsView', '⚖', 'กฎหมายและหนังสือเวียน', 'ค้นกฎหมายและระเบียบที่เกี่ยวข้อง'],
    ['guidesView', '▤', 'คู่มือและแนวทางปฏิบัติ', 'เปิดอ่านคู่มือการทำงาน'],
    ['judgmentsView', '▥', 'คำพิพากษา', 'ศึกษาคำพิพากษาที่เกี่ยวข้อง'],
    ['qaView', '◎', 'ถาม–ตอบ', 'ค้นหาคำตอบจากคลังความรู้'],
    ['packagesView', '▣', 'ชุดองค์ความรู้', 'เรียนรู้เป็นชุดตามหัวข้อ'],
    ['savedView', '♡', 'รายการที่บันทึกไว้', 'กลับไปอ่านรายการที่สนใจ']
  ];
  function initialize() {
    const home = document.getElementById('home');
    const hero = home?.querySelector('.dashboard-hero');
    const nav = document.querySelector('#appShell aside .nav');
    if (!home || !hero || !nav || document.getElementById('homeQuickAccess')) return;
    const section = document.createElement('section');
    section.id = 'homeQuickAccess';
    section.className = 'home-quick-access';
    section.setAttribute('aria-labelledby', 'homeQuickAccessTitle');
    const heading = document.createElement('div');
    heading.className = 'section-title';
    const title = document.createElement('h2');
    title.id = 'homeQuickAccessTitle';
    title.textContent = 'เข้าถึงความรู้ได้ทันที';
    heading.append(title);
    const grid = document.createElement('div');
    grid.className = 'home-shortcut-grid';
    for (const [view, icon, label, description] of shortcuts) {
      const target = [...nav.querySelectorAll('button[data-view]')].find(button => button.dataset.view === view);
      if (!target || target.hidden) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'home-shortcut';
      const symbol = document.createElement('span');
      symbol.className = 'home-shortcut-icon';
      symbol.setAttribute('aria-hidden', 'true');
      symbol.textContent = icon;
      const body = document.createElement('span');
      body.className = 'home-shortcut-copy';
      const name = document.createElement('strong');
      name.textContent = label;
      const note = document.createElement('small');
      note.textContent = description;
      body.append(name, note);
      button.append(symbol, body);
      button.addEventListener('click', () => {
        if (target.hidden || target.disabled || getComputedStyle(target).display === 'none') return;
        target.click();
      });
      grid.append(button);
    }
    if (!grid.children.length) return;
    section.append(heading, grid);
    hero.insertAdjacentElement('afterend', section);
    const input = document.getElementById('heroInput');
    if (input) {
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('aria-label', 'ค้นหาในคลังความรู้');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
