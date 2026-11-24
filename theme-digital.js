/* ====================================================================
   Тема «Цифра» для полотна структуры (концепт, вариант 3): спокойный «рабочий» digital.
   Подключается на digital.html — копии сайта; меняет только полотно.
   Форма — папка из двух листов:
   — передний лист (с невысокой ступенькой справа сверху) — сама карточка;
   — задний лист (с язычком слева) — куратор: на нём лежат передние листы его отделов.
   Линии — тонкие серые с цветными точками-портами; на наведении путь до верха подсвечивается.
   Логику сайта не трогает: оборачивает buildTreeV2 и после отрисовки «одевает» карточки.
   ?demo=3 — «Строительный блок 2» урезан до трёх карточек
==================================================================== */
(function () {
  document.documentElement.classList.add('theme-digital');
  const DEMO = new URLSearchParams(location.search).get('demo') === '3';
  const SVGNS = 'http://www.w3.org/2000/svg';

  function trim(data) {
    const d = JSON.parse(JSON.stringify(data));
    d.persons = d.persons.filter(p => p.id === 'v2-pokr' || p.id === 'v2-ersh');
    d.persons.forEach(p => { delete p.children; delete p.childBlock; (p.nested || []).forEach(n => { delete n.children; delete n.childBlock; }); });
    return d;
  }

  /* ---------- Формы листов ---------- */
  // передний лист: слева верх выше, на ~62% ширины — плавная ступенька вниз
  function frontD(W, H, r = 16, s = 10) {
    const a = Math.round(W * .62), b = a + 20;
    return `M0,${r} Q0,0 ${r},0 H${a} C${a + 10},0 ${b - 10},${s} ${b},${s} H${W - r} Q${W},${s} ${W},${s + r}`
      + ` V${H - r} Q${W},${H} ${W - r},${H} H${r} Q0,${H} 0,${H - r} Z`;
  }
  // задний лист: язычок слева сверху, справа — ниже на s
  function backD(W, H, r = 16, s = 12) {
    const t = Math.round(Math.min(W * .42, 260)), b = t + 24;
    return `M0,${r} Q0,0 ${r},0 H${t} C${t + 12},0 ${b - 12},${s} ${b},${s} H${W - r} Q${W},${s} ${W},${s + r}`
      + ` V${H - r} Q${W},${H} ${W - r},${H} H${r} Q0,${H} 0,${H - r} Z`;
  }
  let uid = 0;
  function dress(el, kind) {
    const W = el.offsetWidth, H = el.offsetHeight, id = 'dg' + (++uid);
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'dg-mat dg-mat--' + kind);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    const P = 8;   // задний лист выступает за передние по бокам и снизу — видно, что отделы лежат в папке куратора
    // кромка и внутреннее свечение, как в рефе: белое осветление вдоль краёв изнутри + тонкая светлая кромка
    // (кромка — половина обводки внутри формы, обрезана по ней: читается как край стекла, не как контур)
    const d = kind === 'back' ? backD(W + 2 * P, H + P, 18, 14) : frontD(W, H);
    const shift = kind === 'back' ? `translate(${-P},0)` : '';
    const fill = kind === 'back'
      ? '<stop offset="0" stop-color="#D4E4FD"/><stop offset="1" stop-color="#BDD3FA"/>'
      : '<stop offset="0" stop-color="#FBFCFF"/><stop offset="1" stop-color="#F0F3FA"/>';
    const glow = kind === 'back' ? .55 : .95, rim = kind === 'back' ? .8 : 1;
    const R = Math.max(80, Math.min(W, H) * .8), spot = kind === 'back' ? '#FFFFFF' : '#3C83F6', edge = kind === 'back' ? '#FFFFFF' : '#5B95F7';
    svg.innerHTML = `<defs>
        <linearGradient id="${id}" x1="0" y1="0" x2=".2" y2="1">${fill}</linearGradient>
        <clipPath id="${id}c"><path d="${d}" transform="${shift}"/></clipPath>
        <filter id="${id}b" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="4"/></filter>
        <radialGradient id="${id}s" class="dg-spot" gradientUnits="userSpaceOnUse" cx="${W / 2}" cy="${H / 3}" r="${R}">
          <stop offset="0" stop-color="${spot}" stop-opacity="${kind === 'back' ? .5 : .16}"/><stop offset="1" stop-color="${spot}" stop-opacity="0"/></radialGradient>
        <radialGradient id="${id}e" class="dg-spot" gradientUnits="userSpaceOnUse" cx="${W / 2}" cy="${H / 3}" r="${R * .85}">
          <stop offset="0" stop-color="${edge}" stop-opacity="1"/><stop offset="1" stop-color="${edge}" stop-opacity="0"/></radialGradient>
      </defs>
      <path d="${d}" transform="${shift}" fill="url(#${id})"/>
      <g clip-path="url(#${id}c)">
        <path d="${d}" transform="${shift}" fill="none" stroke="#fff" stroke-width="14" opacity="${glow}" filter="url(#${id}b)"/>
        <path d="${d}" transform="${shift}" fill="none" stroke="#fff" stroke-width="2.4" opacity="${rim}"/>
        <g class="dg-glare">   <!-- «прожектор» за курсором: мягкое свечение на листе + подсветка ближайшего участка кромки -->
          <path d="${d}" transform="${shift}" fill="url(#${id}s)"/>
          <path d="${d}" transform="${shift}" fill="none" stroke="url(#${id}e)" stroke-width="2.6"/>
        </g>
      </g>`;
    el.insertBefore(svg, el.firstChild);
    el.classList.add('dg-done', 'dg-' + kind);
  }

  /* ---------- Точки-порты на концах линий ---------- */
  function dots() {
    const inner = document.getElementById('canvas-inner'), svg = document.getElementById('tree-svg');
    inner.querySelectorAll(':scope > .dg-dots').forEach(n => n.remove());
    const seen = new Set(), out = [];
    const put = (x, y) => { const k = Math.round(x) + ',' + Math.round(y); if (!seen.has(k)) { seen.add(k); out.push(`<circle cx="${x}" cy="${y}" r="3"/>`); } };
    svg.querySelectorAll('path[data-geom]').forEach(p => { const g = JSON.parse(p.dataset.geom); put(g.px, g.py); put(g.cx, g.cy); });
    const layer = document.createElementNS(SVGNS, 'svg');
    layer.setAttribute('class', 'dg-dots' + (rebuilding ? ' dg-dots--wait' : ''));
    layer.innerHTML = out.join('');
    inner.appendChild(layer);
    if (rebuilding) setTimeout(() => layer.classList.remove('dg-dots--wait'), 460);   // после перестройки линий — проявляются
  }

  /* ---------- Подсветка пути до верха ---------- */
  function chainFor(node) {
    const inner = document.getElementById('canvas-inner'), svg = document.getElementById('tree-svg');
    const nodes = [...inner.querySelectorAll(':scope > .tree-node')], out = [];
    let cur = node;
    for (let guard = 0; cur && guard < 30; guard++) {
      const key = v2NodeKey(cur), line = key && svg.querySelector(`path[data-key="${CSS.escape(key)}"]`);
      if (!line) break;
      out.push(line);
      const g = JSON.parse(line.dataset.geom || '{}');
      cur = nodes.find(n => n !== cur && g.px >= n.offsetLeft - 1 && g.px <= n.offsetLeft + n.offsetWidth + 1
        && g.py >= n.offsetTop - 1 && g.py <= n.offsetTop + n.offsetHeight + 4);
    }
    return out;
  }
  let hot = [];
  function highlight(node) {
    const svg = document.getElementById('tree-svg'), dl = document.querySelector('#canvas-inner > .dg-dots');
    const old = hot; hot = [];
    old.forEach(el => el.classList.remove('on'));
    setTimeout(() => old.forEach(el => el.remove()), 300);
    const chain = node ? chainFor(node) : [];
    svg.classList.toggle('dg-dim', chain.length > 0);
    chain.forEach(p => {
      const c = p.cloneNode(); c.removeAttribute('data-key'); c.setAttribute('class', 'dg-hot');
      svg.appendChild(c); hot.push(c);
      if (dl) {
        const g = JSON.parse(p.dataset.geom);
        [[g.px, g.py], [g.cx, g.cy]].forEach(([x, y]) => {
          const d = document.createElementNS(SVGNS, 'circle');
          d.setAttribute('cx', x); d.setAttribute('cy', y); d.setAttribute('r', 3.5); d.setAttribute('class', 'dg-dot-hot');
          dl.appendChild(d); hot.push(d);
        });
      }
    });
    requestAnimationFrame(() => requestAnimationFrame(() => hot.forEach(el => el.classList.add('on'))));
  }

  /* ---------- Наведение: карточка приподнимается и чуть наклоняется вслед за курсором ---------- */
  // спокойно, без отскоков: поворот до 5° (у широкой наборной — меньше), плавное догоняние курсора
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function tilt(node, card) {
    if (REDUCED) return;
    // Firefox рисует наклонённый (3D) слой в пониженном разрешении — текст мылится; там только подъём
    const FF = /Firefox\//.test(navigator.userAgent);
    const max = FF ? 0 : card.classList.contains('card-v3') ? 2.5 : 5;
    node.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      const x = Math.max(-.5, Math.min(.5, (e.clientX - r.left) / r.width - .5));
      const y = Math.max(-.5, Math.min(.5, (e.clientY - r.top) / r.height - .5));
      card.style.transform = max ? `perspective(900px) translateY(-4px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg)` : 'translateY(-4px)';
      card.classList.add('dg-lift');
      // «прожектор» скользит за курсором по каждому листу карточки (координаты — в системе листа)
      card.querySelectorAll('.dg-mat').forEach(m => {
        const mr = m.getBoundingClientRect(), k = m.width.baseVal.value / mr.width;
        const cx = ((e.clientX - mr.left) * k).toFixed(1), cy = ((e.clientY - mr.top) * k).toFixed(1);
        m.querySelectorAll('.dg-spot').forEach(g => { g.setAttribute('cx', cx); g.setAttribute('cy', cy); });
      });
    });
    node.addEventListener('pointerleave', () => { card.style.transform = ''; card.classList.remove('dg-lift'); });
  }

  /* ---------- Одеть отрисованное дерево ---------- */
  function decorate() {
    const inner = document.getElementById('canvas-inner');
    if (!inner) return;
    inner.querySelectorAll(':scope > .tree-node').forEach(node => {
      const root = node.querySelector(':scope > .card-v2-multi, :scope > .card-v3');
      if (!root || root.classList.contains('dg-done')) return;
      if (root.classList.contains('card-v3')) {   // куратор — задний лист, его отделы — передние листы на нём
        dress(root, 'back');
        root.querySelectorAll('.card-v3__sub').forEach(sub => dress(sub, 'front'));
      } else dress(root, 'front');
      node.addEventListener('pointerenter', () => highlight(node));
      node.addEventListener('pointerleave', () => highlight(null));
      tilt(node, root);
    });
    dots();
  }

  /* ---------- Подключение ---------- */
  let rebuilding = false;
  const origBuild = buildTreeV2;
  buildTreeV2 = function (data) {   // eslint-disable-line no-global-assign
    if (DEMO && data === ORG_DATA.trees.construction2) data = trim(data);
    origBuild(data);
    requestAnimationFrame(() => { decorate(); rebuilding = false; });
  };
  // при раскрытии/сворачивании линии сайта перетекают ~420 мс — точки на это время прячем, потом проявляем
  if (typeof v2Rebuild === 'function') {
    const origRebuild = v2Rebuild;
    v2Rebuild = function (...a) { rebuilding = true; return origRebuild.apply(this, a); };   // eslint-disable-line no-global-assign
  }
  if (document.getElementById('view-tree') && location.hash.startsWith('#tree/')) restoreFromHash();
})();
