// Loads this design system's global CSS into the template. In a consuming
// project, point `base` at the bound DS folder relative to this file (e.g.
// '_ds/<folder>' at the project root, '../_ds/<folder>' one level down) —
// one line to edit. (The compiled component bundle is loaded explicitly by
// the template's <helmet> so its load order is deterministic.)
(() => {
  const base = '../..';
  for (const p of ["styles.css"]) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = base + '/' + p;
    document.head.appendChild(l);
  }
})();
