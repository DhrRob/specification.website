// Dashboard interaction for /admin/stats — extracted from the inline page
// because the site's CSP disallows inline scripts (see public/_headers).

// Tab groups: clicking a .tab toggles .active and shows its data-tab pane.
document.querySelectorAll('.tabs').forEach((group) => {
  const buttons = group.querySelectorAll('.tab');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => {
        b.classList.toggle('active', b === btn);
        const pane = document.getElementById(b.dataset.tab);
        if (pane) pane.hidden = b !== btn;
      });
    });
  });
});

// Generic table filters: a .filter-row[data-filter-for] drives the table
// with that id. <select data-col> = exact match, <input data-col> = substring.
document.querySelectorAll('[data-filter-for]').forEach((wrap) => {
  const table = document.getElementById(wrap.dataset.filterFor);
  if (!table) return;
  const controls = Array.from(wrap.querySelectorAll('[data-col]'));
  const stats = wrap.querySelector('[data-filter-stats]');
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  const total = rows.length;
  function apply() {
    let visible = 0;
    for (const r of rows) {
      const cells = r.querySelectorAll('td');
      const show = controls.every((c) => {
        const v = c.value.trim();
        if (!v) return true;
        const cellText = (cells[Number(c.dataset.col)]?.textContent || '').trim();
        return c.tagName === 'SELECT'
          ? cellText === v
          : cellText.toLowerCase().includes(v.toLowerCase());
      });
      r.style.display = show ? '' : 'none';
      if (show) visible++;
    }
    if (stats)
      stats.textContent =
        visible === total ? total + ' rows' : visible + ' of ' + total + ' rows';
  }
  controls.forEach((c) => {
    c.addEventListener('input', apply);
    c.addEventListener('change', apply);
  });
  apply();
});
