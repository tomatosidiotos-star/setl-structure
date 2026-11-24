/* ====================================================================
   Тема «Матовое стекло» для полотна структуры (концепт). Подключается на frost.html — копии
   сайта; фон, линии, карточки и анимации — сайта, без изменений, кроме:
   — карточка: лёгкое утолщение (торец снизу), непрозрачно белая; у наборной подложка куратора —
     голубое матовое стекло, текст куратора белый;
   — плашка подразделения: голубоватое матовое стекло (theme-frost.css);
   — на концах линий — непрозрачные точки.
   Логику сайта не трогает: оборачивает buildTreeV2 и после отрисовки «одевает» карточки.
   ?demo=3 — «Строительный блок 2» урезан до трёх карточек
==================================================================== */
(function () {
  document.documentElement.classList.add('theme-frost');
  // Firefox искажает скругления подложек с внутренними тенями при повороте/увеличении — для него свои стили
  if (/Firefox\//.test(navigator.userAgent)) document.documentElement.classList.add('fr-ff');
  const DEMO = new URLSearchParams(location.search).get('demo') === '3';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const T = 4;   // толщина карточки, px

  function trim(data) {
    const d = JSON.parse(JSON.stringify(data));
    d.persons = d.persons.filter(p => p.id === 'v2-pokr' || p.id === 'v2-ersh');
    d.persons.forEach(p => { delete p.children; delete p.childBlock; (p.nested || []).forEach(n => { delete n.children; delete n.childBlock; }); });
    return d;
  }

  /* ---------- Силуэт карточки: union тех же белых кусков, из которых она собрана ---------- */
  function offsetIn(el, root) {
    let x = 0, y = 0, e = el;
    while (e && e !== root) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
    return { x, y };
  }
  function rr(x, y, w, h, r) {   // скруглённый прямоугольник: r = [tl, tr, br, bl]
    const [a, b, c, d] = r.map(v => Math.min(v, w / 2, h / 2));
    return `M${x + a},${y} H${x + w - b} Q${x + w},${y} ${x + w},${y + b} V${y + h - c} Q${x + w},${y + h} ${x + w - c},${y + h}`
      + ` H${x + d} Q${x},${y + h} ${x},${y + h - d} V${y + a} Q${x},${y} ${x + a},${y} Z`;
  }
  function pieces(root, exclude) {
    const out = [];
    root.querySelectorAll('.card-v2-mh__wrap, .card-v2-mh__body, .card-v3__head-wrap, .card-v3__cards, .card-v2-multi__dept-wrap, .card-v2-mh__surface svg').forEach(el => {
      if (exclude && el.closest(exclude) && el.closest(exclude) !== root) return;
      if (!el.offsetParent && el.tagName !== 'svg') return;
      if (el.tagName === 'svg') {   // «ушко» из Surface.svg
        const p = el.querySelector('path'); if (!p) return;
        const host = el.parentElement, o = offsetIn(host, root), w = host.offsetWidth, h = host.offsetHeight;
        out.push(`<path d="${p.getAttribute('d')}" transform="translate(${o.x - .6},${o.y}) scale(${(w + 1) / 52},${(h + .8) / 50})"/>`);
        return;
      }
      const cs = getComputedStyle(el), o = offsetIn(el, root), k = .7;
      const rad = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(p => parseFloat(cs[p]) || 0);
      out.push(`<path d="${rr(o.x - k, o.y - k, el.offsetWidth + 2 * k, el.offsetHeight + 2 * k, rad)}"/>`);
    });
    return out.join('');
  }

  /* ---------- Стекло: тень + торец (SVG) и матовая лицевая сторона (div с размытием фона) ---------- */
  let uid = 0;
  function dress(root, exclude, curator) {   // curator — внешнее стекло наборной: темнее-голубое
    const shapes = pieces(root, exclude);
    if (!shapes) return;
    const W = root.offsetWidth, H = root.offsetHeight, id = 'fr' + (++uid);
    const under = document.createElementNS(SVGNS, 'svg');
    under.setAttribute('class', 'fr-under');
    under.setAttribute('width', W); under.setAttribute('height', H + T + 30);
    under.innerHTML = `<defs>
        <clipPath id="${id}c">${shapes}</clipPath>
        <mask id="${id}m" maskUnits="userSpaceOnUse" x="-40" y="-40" width="${W + 80}" height="${H + 80}">
          <g transform="translate(0,${T})" fill="#fff">${shapes}</g><g fill="#000">${shapes}</g></mask>
        <linearGradient id="${id}e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${curator ? '#4F86D9' : '#D6E6F8'}"/><stop offset="1" stop-color="${curator ? '#3466B8' : '#AFC9EA'}"/></linearGradient>
        <filter id="${id}b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
      </defs>
      <g filter="url(#${id}b)" opacity=".16"><g transform="translate(0,${T + 6})" fill="#1789BE">${shapes}</g></g>
      <rect x="-4" y="0" width="${W + 8}" height="${H + T + 4}" fill="url(#${id}e)" opacity=".85" mask="url(#${id}m)"/>`;
    root.insertBefore(under, root.firstChild);
    // лицевая сторона: HTML-слой, чтобы работало размытие фона (backdrop-filter), обрезан по силуэту
    const face = document.createElement('div');
    face.className = 'fr-face' + (curator ? ' fr-face--curator' : '');
    face.style.width = W + 'px'; face.style.height = H + 'px';
    // обрезка по силуэту — маской-картинкой: clip-path: url() Chrome к размытию фона не применяет
    // (углы и вырез оставались прямоугольными), а маска режет и его
    const m = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="${SVGNS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g fill="#000">${shapes}</g></svg>`)}")`;
    face.style.webkitMaskImage = face.style.maskImage = m;
    face.style.webkitMaskSize = face.style.maskSize = `${W}px ${H}px`;
    face.style.webkitMaskRepeat = face.style.maskRepeat = 'no-repeat';
    under.after(face);
    root.classList.add('fr-done');
  }

  /* ---------- Листы в папке: при наведении из-за выреза (угла папки) выглядывают уголки листов ---------- */
  // owner — карточка или под-карточка наборной; trigger — на что наводим; листы — за матовой лицевой стороной
  function sheets(owner, trigger) {
    const own = [...owner.querySelectorAll('.card-v2-mh__surface')].filter(s => {
      const sub = s.closest('.card-v3__sub');
      return owner.classList.contains('card-v3__sub') ? sub === owner : !sub;
    });
    if (!own.length) return;
    const face = owner.querySelector(':scope > .fr-face');
    // листы видны только снаружи силуэта карточки (маска «всё, кроме карточки») — так они выходят
    // из-за папки одинаково во всех браузерах (Safari рисовал их поверх стекла)
    const W = owner.offsetWidth, H = owner.offsetHeight, P = 40;
    const inv = encodeURIComponent(`<svg xmlns="${SVGNS}" width="${W + 2 * P}" height="${H + 2 * P}"><defs><mask id="m">`
      + `<rect width="100%" height="100%" fill="#fff"/><g transform="translate(${P},${P})" fill="#000">${pieces(owner)}</g></mask></defs>`
      + `<rect width="100%" height="100%" fill="#000" mask="url(#m)"/></svg>`);
    own.forEach(s => {
      const o = offsetIn(s, owner), box = document.createElement('div');
      const x = o.x + s.offsetWidth - 64, y = o.y + 54;   // правый край листов — у правого края карточки; в покое — за ней
      box.className = 'fr-sheets';
      box.style.left = x + 'px'; box.style.top = (y - 80) + 'px'; box.style.paddingTop = '80px';   // запас сверху — место, куда листы выезжают
      box.style.webkitMaskImage = box.style.maskImage = `url("data:image/svg+xml,${inv}")`;
      box.style.webkitMaskPosition = box.style.maskPosition = `${-x - P}px ${-(y - 80) - P}px`;
      box.style.webkitMaskSize = box.style.maskSize = `${W + 2 * P}px ${H + 2 * P}px`;
      box.style.webkitMaskRepeat = box.style.maskRepeat = 'no-repeat';
      box.innerHTML = '<i class="fr-sheet fr-sheet--2"></i><i class="fr-sheet fr-sheet--1"></i>';
      owner.insertBefore(box, face);   // перед лицевой стороной в DOM — значит, под ней
    });
    trigger.addEventListener('pointerenter', () => owner.classList.add('fr-peek'));
    trigger.addEventListener('pointerleave', () => owner.classList.remove('fr-peek'));
  }

  /* ---------- Непрозрачные точки на концах линий ---------- */
  function dots() {
    const inner = document.getElementById('canvas-inner'), svg = document.getElementById('tree-svg');
    inner.querySelectorAll(':scope > .fr-dots').forEach(n => n.remove());
    const seen = new Set(), out = [];
    const put = (x, y) => { const k = Math.round(x) + ',' + Math.round(y); if (seen.has(k)) return; seen.add(k); out.push(`<circle cx="${x}" cy="${y}" r="3.5"/>`); };
    svg.querySelectorAll('path[data-geom]').forEach(p => {
      const g = JSON.parse(p.dataset.geom);
      put(g.px, g.py); put(g.cx, g.cy);
    });
    const layer = document.createElementNS(SVGNS, 'svg');
    layer.setAttribute('class', 'fr-dots');
    layer.innerHTML = out.join('');
    inner.appendChild(layer);
  }

  /* ---------- Одеть отрисованное дерево ---------- */
  function decorate() {
    const inner = document.getElementById('canvas-inner');
    if (!inner) return;
    inner.querySelectorAll(':scope > .tree-node').forEach(node => {
      const root = node.querySelector(':scope > .card-v2-multi, :scope > .card-v3');
      if (!root || root.classList.contains('fr-done')) return;
      if (root.classList.contains('card-v3')) {
        dress(root, '.card-v3__sub', true);
        sheets(root, root.querySelector('.card-v3__header') || root);   // у наборной — только при наведении на шапку
        root.querySelectorAll('.card-v3__sub').forEach(sub => { dress(sub); sheets(sub, sub); });
      } else { dress(root); sheets(root, root); }
    });
    dots();
  }

  /* ---------- Подключение: оборачиваем отрисовку сайта ---------- */
  const origBuild = buildTreeV2;
  buildTreeV2 = function (data) {   // eslint-disable-line no-global-assign
    if (DEMO && data === ORG_DATA.trees.construction2) data = trim(data);
    origBuild(data);
    requestAnimationFrame(decorate);
    setTimeout(dots, 700);   // после анимации сворачивания линии могли сдвинуться
  };
  if (document.getElementById('view-tree') && location.hash.startsWith('#tree/')) restoreFromHash();
})();
