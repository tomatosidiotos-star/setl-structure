/* ====================================================================
   Переключатель версий нового вида структуры (концепт): «Текущая» (основной сайт), «Мульт», «Игра» и «Цифра».
   Подключён на frost.html («Мульт» — матовое стекло), real.html («Игра» — гиперреализм)
   и digital.html («Цифра» — спокойный digital).
   Встаёт в шапку блока справа вместо описания блока; текущая версия выбрана.
   При переходе сохраняются открытый блок (#…) и параметры ссылки (?demo=3)
==================================================================== */
(function () {
  const VERSIONS = [
    { title: 'Текущая', file: 'index.html' },   // основной сайт в нынешнем стиле
    { title: 'Мульт', file: 'frost.html' },
    { title: 'Игра', file: 'real.html' },
    { title: 'Цифра', file: 'digital.html' },
  ];
  const here = location.pathname.split('/').pop();

  const css = document.createElement('style');
  css.textContent = `
    /* описание блока на этих страницах не показываем — на его месте переключатель */
    .vs-on #tv-desc, .vs-on #btn-block-more { display: none !important; }
    /* кнопки небольшие — справа от названия при любой ширине (сайт на узком переносит описание под название) */
    .vs-on .tv-head { flex-direction: row !important; align-items: center !important; flex-wrap: wrap; }
    .vs-on .tv-head__desc { flex: 0 0 auto; padding-left: 0 !important; margin-left: auto; align-items: flex-end; justify-content: center; }
    .ver-switch { display: flex; gap: 8px; }
    .ver-switch__btn {
      display: inline-flex; align-items: center; justify-content: center;
      height: 36px; padding: 0 20px; border: none; border-radius: 8px; cursor: pointer;
      background: #fdf0f0; color: #d33831;
      font-family: var(--f-exp); font-weight: 600; font-size: 16px; line-height: 1;
      transition: background .15s, color .15s;
    }
    .ver-switch__btn:hover { background: #fad8d8; color: #c0302a; }
    .ver-switch__btn[aria-pressed="true"] { background: #e2221c; color: #fff; cursor: default; }
  `;
  document.head.appendChild(css);

  // «Структура» (кнопка на главной, custom-structure.js) рисуется своим кодом — тему на ней не показываем:
  // пока на полотне «Структура», класс темы с <html> снимаем, в остальных деревьях — возвращаем
  const root = document.documentElement;
  const themes = [...root.classList].filter(c => /^theme-/.test(c));
  const tree = document.getElementById('view-tree');
  if (tree && themes.length) {
    const sync = () => themes.forEach(t => root.classList.toggle(t, !tree.classList.contains('is-custom')));
    new MutationObserver(sync).observe(tree, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  const slot = document.querySelector('.tv-head__desc');
  if (!slot) return;
  document.documentElement.classList.add('vs-on');
  const box = document.createElement('div');
  box.className = 'ver-switch';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Версия вида структуры');
  VERSIONS.forEach(v => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ver-switch__btn';
    b.textContent = v.title;
    const current = v.file === here;
    b.setAttribute('aria-pressed', String(current));
    if (!current) b.addEventListener('click', () => { location.href = v.file + location.search + location.hash; });
    box.appendChild(b);
  });
  slot.appendChild(box);
})();
