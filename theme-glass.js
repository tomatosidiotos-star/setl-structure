/* ====================================================================
   Тема «Стекло и желе» для полотна структуры (концепт). Подключается на glass.html — копии
   сайта; меняет только полотно. Логику сайта не трогает: оборачивает buildTreeV2 и после
   отрисовки «одевает» карточки и линии.
   ?demo=3 — «Строительный блок 2» урезан до трёх карточек (верх, наборная, обычная)
==================================================================== */
(function () {
  document.documentElement.classList.add('theme-glass');
  const DEMO = new URLSearchParams(location.search).get('demo') === '3';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVGNS = 'http://www.w3.org/2000/svg';

  /* ---------- Палитра рефа, градиент считается в OKLCH (без серой смеси) ---------- */
  const toLin = c => (c /= 255) <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  const toSrgb = c => Math.round(255 * Math.min(1, Math.max(0, c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055)));
  function oklch(hex) {
    const [r, g, b] = [1, 3, 5].map(i => toLin(parseInt(hex.slice(i, i + 2), 16)));
    const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
    const L = .2104542553 * l + .793617785 * m - .0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, B = .0259040371 * l + .7827717662 * m - .808675766 * s;
    return [L, Math.hypot(A, B), Math.atan2(B, A)];
  }
  function hexOf([L, C, H]) {
    const A = C * Math.cos(H), B = C * Math.sin(H);
    const l = (L + .3963377774 * A + .2158037573 * B) ** 3, m = (L - .1055613458 * A - .0638541728 * B) ** 3, s = (L - .0894841775 * A - 1.291485548 * B) ** 3;
    return '#' + [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s]
      .map(c => toSrgb(c).toString(16).padStart(2, '0')).join('');
  }
  function ramp(points, n = 16) {   // points: [[pos, hex], …]
    const P = points.map(([p, h]) => [p, oklch(h)]), out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n; let k = 0;
      while (k < P.length - 2 && t > P[k + 1][0]) k++;
      const [p0, a] = P[k], [p1, b] = P[k + 1], f = Math.min(1, Math.max(0, (t - p0) / (p1 - p0)));
      let dh = b[2] - a[2]; if (dh > Math.PI) dh -= 2 * Math.PI; if (dh < -Math.PI) dh += 2 * Math.PI;
      out.push(`<stop offset="${t}" stop-color="${hexOf([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + dh * f])}"/>`);
    }
    return out.join('');
  }
  // ?palette=kraft — крафт как у папок: от карамельного (снизу-слева) к светлому беж (вверх-вправо),
  // текст тёмный; линии остаются голубыми, путь подсвечивается ярко-голубым
  const KRAFT = new URLSearchParams(location.search).get('palette') === 'kraft';
  if (KRAFT) document.documentElement.classList.add('gl-kraft');
  const STOPS = KRAFT
    ? ramp([[0, '#B5835A'], [.4, '#C49A6C'], [.75, '#D8B58A'], [1, '#EAD3B0']])
    : ramp([[0, '#FF7A3D'], [.45, '#FF5B5B'], [.75, '#9C7BDC'], [1, '#6EC9F5']]);
  const HOT_STOPS = KRAFT ? ramp([[0, '#2E8BE6'], [1, '#7FD3FA']]) : STOPS;
  const SHADOW = KRAFT ? '#5a3a22' : '#4a2f6e', SIDE = KRAFT ? '#4a2c18' : '#3a1d52';

  /* ---------- Демо: блок 2 из трёх карточек ---------- */
  function trim(data) {
    const d = JSON.parse(JSON.stringify(data));
    d.persons = d.persons.filter(p => p.id === 'v2-pokr' || p.id === 'v2-ersh');
    d.persons.forEach(p => { delete p.children; delete p.childBlock; (p.nested || []).forEach(n => { delete n.children; delete n.childBlock; }); });
    return d;
  }

  /* ---------- Сцена: пятна света, сетка, слой для ракурса ---------- */
  let stage, grid;
  function setupStage() {
    const wrap = document.getElementById('canvas-wrapper'), inner = document.getElementById('canvas-inner');
    if (!wrap || stage) return;
    ['1', '2', '3'].forEach(i => { const b = document.createElement('div'); b.className = 'gl-blob gl-blob--' + i; wrap.insertBefore(b, wrap.firstChild); });
    stage = document.createElement('div'); stage.className = 'gl-stage';
    grid = document.createElement('div'); grid.className = 'gl-grid';
    stage.appendChild(grid);
    wrap.insertBefore(stage, inner);
    stage.appendChild(inner);
    sway(wrap);
  }

  /* Ракурс: полотно чуть развёрнуто по горизонтали; за мышью — лёгкое «дыхание» на пружине */
  function sway(wrap) {
    const BASE_Y = -4;   // ~5% поворота по горизонтали
    let tx = 0, ty = 0, x = 0, y = 0, vx = 0, vy = 0;
    wrap.addEventListener('pointermove', e => {
      const r = wrap.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - .5; ty = (e.clientY - r.top) / r.height - .5;
      grid.style.setProperty('--gl-mx', (tx + .5) * 100 + '%'); grid.style.setProperty('--gl-my', (ty + .5) * 100 + '%');
    });
    wrap.addEventListener('pointerleave', () => { tx = 0; ty = 0; });
    const apply = () => { stage.style.transform = `perspective(2200px) rotateY(${BASE_Y + x * 2.4}deg) rotateX(${-y * 1.6}deg)`; };
    if (REDUCED) { apply(); return; }
    (function tick() {   // пружина: мягко догоняет курсор, без рывков
      vx += ((tx - x) * 0.012 - vx * 0.16); vy += ((ty - y) * 0.012 - vy * 0.16);
      x += vx; y += vy; apply();
      requestAnimationFrame(tick);
    })();
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

  /* ---------- «Желе» и стеклянная оболочка ---------- */
  let uid = 0, bbox = { x: 0, y: 0, w: 1, h: 1 };
  function dress(root, kind, inner) {
    const shapes = pieces(root, kind === 'shell' ? '.card-v3__sub' : null);
    if (!shapes) return;
    const W = root.offsetWidth, H = root.offsetHeight, id = 'gl' + (++uid), T = kind === 'jelly' ? 6 : 4;
    const o = offsetIn(root, inner);
    // общий градиент по всей структуре: снизу-слева (оранжевый) вверх-вправо (голубой)
    const gx1 = bbox.x - o.x, gy1 = bbox.y + bbox.h - o.y, gx2 = bbox.x + bbox.w - o.x, gy2 = bbox.y - o.y;
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'gl-jelly'); svg.setAttribute('width', W); svg.setAttribute('height', H + T + 24);
    const clip = `url(#${id}c)`, clipSide = `url(#${id}cs)`;
    const defs = `<defs>
      <clipPath id="${id}c">${shapes}</clipPath>
      <clipPath id="${id}cs" transform="translate(0,${T})">${shapes}</clipPath>
      <linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="${gx1}" y1="${gy1}" x2="${gx2}" y2="${gy2}">${STOPS}</linearGradient>
      <radialGradient id="${id}sss" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <filter id="${id}b18" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
      <filter id="${id}b7" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
      <filter id="${id}b10" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10"/></filter>
    </defs>`;
    let body;
    if (kind === 'jelly') {
      body = `
        <g filter="url(#${id}b10)" opacity=".22"><rect x="6" y="${T + 10}" width="${W - 12}" height="${H}" rx="24" fill="${SHADOW}" clip-path="${clipSide}"/></g>
        <rect width="${W}" height="${H + T}" fill="url(#${id}g)" clip-path="${clipSide}"/>
        <rect width="${W}" height="${H + T}" fill="${SIDE}" opacity=".16" clip-path="${clipSide}"/>
        <g clip-path="${clip}">
          <rect width="${W}" height="${H}" fill="url(#${id}g)" opacity=".96"/>
          <rect width="${W}" height="${H}" fill="url(#${id}sss)"/>
          <ellipse cx="${W * .22}" cy="${H * .06}" rx="${W * .5}" ry="${H * .32}" fill="#fff" opacity=".34" filter="url(#${id}b18)"/>
          <ellipse cx="${W * .9}" cy="${H * 1.05}" rx="${W * .45}" ry="${H * .25}" fill="#fff" opacity=".12" filter="url(#${id}b18)"/>
          <g filter="url(#${id}b7)" opacity=".42">${shapes.replace(/<path /g, '<path fill="none" stroke="#fff" stroke-width="10" ')}</g>
        </g>`;
    } else {   // стеклянная оболочка наборной карточки: почти прозрачная, кольцо свечения внутри, широкий блик
      body = `
        <g filter="url(#${id}b10)" opacity=".14"><rect x="8" y="${T + 12}" width="${W - 16}" height="${H}" rx="24" fill="${SHADOW}" clip-path="${clipSide}"/></g>
        <rect width="${W}" height="${H + T}" fill="#fff" opacity=".45" clip-path="${clipSide}"/>
        <g clip-path="${clip}">
          <rect width="${W}" height="${H}" fill="#fff" opacity=".5"/>
          <g filter="url(#${id}b10)" opacity=".38">${shapes.replace(/<path /g, '<path fill="none" stroke="url(#' + id + 'g)" stroke-width="16" ')}</g>
          <ellipse cx="${W * .25}" cy="${H * .02}" rx="${W * .45}" ry="${H * .3}" fill="#fff" opacity=".7" filter="url(#${id}b18)"/>
          <g filter="url(#${id}b7)" opacity=".7">${shapes.replace(/<path /g, '<path fill="none" stroke="#fff" stroke-width="8" ')}</g>
        </g>`;
    }
    svg.innerHTML = defs + body;
    root.insertBefore(svg, root.firstChild);
    root.classList.add('gl-done', kind === 'jelly' ? 'gl-jelly-host' : 'gl-shell-host');
  }

  /* ---------- Линии: объёмные трубки и подсветка пути ---------- */
  function tubeDefs(svg) {
    const defs = document.createElementNS(SVGNS, 'defs');
    defs.innerHTML = `
      <linearGradient id="glHotGrad" gradientUnits="userSpaceOnUse" x1="${bbox.x}" y1="${bbox.y + bbox.h}" x2="${bbox.x + bbox.w}" y2="${bbox.y}">${HOT_STOPS}</linearGradient>
      <filter id="glTube" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1.4" result="b"/>
        <feSpecularLighting in="b" surfaceScale="2.6" specularConstant=".85" specularExponent="22" lighting-color="#ffffff" result="s"><feDistantLight azimuth="235" elevation="48"/></feSpecularLighting>
        <feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>
        <feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k2="1" k3=".9" result="lit"/>
        <feGaussianBlur in="SourceAlpha" stdDeviation="3.5" result="sh"/>
        <feOffset in="sh" dy="5" result="sh2"/>
        <feFlood flood-color="#3b4a8c" flood-opacity=".16"/><feComposite in2="sh2" operator="in" result="shadow"/>
        <feMerge><feMergeNode in="shadow"/><feMergeNode in="lit"/></feMerge>
      </filter>
      <filter id="glTubeHot" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1.4" result="b"/>
        <feSpecularLighting in="b" surfaceScale="2.6" specularConstant=".9" specularExponent="22" lighting-color="#ffffff" result="s"><feDistantLight azimuth="235" elevation="48"/></feSpecularLighting>
        <feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>
        <feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k2="1" k3=".9" result="lit"/>
        <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="glow"/>
        <feMerge><feMergeNode in="glow"/><feMergeNode in="lit"/></feMerge>
      </filter>`;
    svg.insertBefore(defs, svg.firstChild);
  }

  // путь от карточки до верха: линия ведёт к карточке (data-key), её начало — низ родительской
  function chainFor(node) {
    const inner = document.getElementById('canvas-inner'), svg = document.getElementById('tree-svg');
    const nodes = [...inner.querySelectorAll(':scope > .tree-node')], out = [];
    let cur = node;
    for (let guard = 0; cur && guard < 20; guard++) {
      const key = typeof v2NodeKey === 'function' ? v2NodeKey(cur) : null;
      const line = key && svg.querySelector(`path[data-key="${CSS.escape(key)}"]`);
      if (!line) break;
      out.push(line);
      const g = JSON.parse(line.dataset.geom || '{}');
      cur = nodes.find(n => g.px >= n.offsetLeft - 1 && g.px <= n.offsetLeft + n.offsetWidth + 1
        && g.py >= n.offsetTop - 1 && g.py <= n.offsetTop + n.offsetHeight + 4 && n !== cur);
    }
    return out;
  }
  let hot = null;
  function highlight(node) {
    const svg = document.getElementById('tree-svg');
    if (hot) { const old = hot; old.forEach(p => p.classList.remove('on')); setTimeout(() => old.forEach(p => p.remove()), 460); hot = null; }
    if (!node) return;
    hot = chainFor(node).map(p => { const c = p.cloneNode(); c.removeAttribute('data-key'); c.setAttribute('class', 'gl-hot'); svg.appendChild(c); return c; });
    requestAnimationFrame(() => hot && hot.forEach(p => p.classList.add('on')));
  }

  /* ---------- Движение: только плавное увеличение на пружине при наведении (само по себе ничего не качается) ---------- */
  const bodies = [];
  function animate() {
    if (REDUCED) return;
    (function tick() {
      bodies.forEach(b => {
        if (!b.el.isConnected) return;
        b.v += (b.target - b.s) * 0.06 - b.v * 0.22; b.s += b.v;   // пружина масштаба
        b.el.style.scale = b.s.toFixed(4);
      });
      requestAnimationFrame(tick);
    })();
  }
  let animating = false;

  /* ---------- Одеть отрисованное дерево ---------- */
  function decorate() {
    const inner = document.getElementById('canvas-inner'), svg = document.getElementById('tree-svg');
    if (!inner) return;
    const nodes = [...inner.querySelectorAll(':scope > .tree-node')];
    if (!nodes.length) return;
    const xs = nodes.map(n => n.offsetLeft), ys = nodes.map(n => n.offsetTop);
    bbox = { x: Math.min(...xs), y: Math.min(...ys) };
    bbox.w = Math.max(...nodes.map(n => n.offsetLeft + n.offsetWidth)) - bbox.x;
    bbox.h = Math.max(...nodes.map(n => n.offsetTop + n.offsetHeight)) - bbox.y;
    tubeDefs(svg);
    bodies.length = 0;
    nodes.forEach((node, i) => {
      const root = node.querySelector(':scope > .card-v2-multi, :scope > .card-v3');
      if (!root) return;
      if (root.classList.contains('card-v3')) {
        dress(root, 'shell', inner);
        root.querySelectorAll('.card-v3__sub').forEach(sub => dress(sub, 'jelly', inner));
      } else dress(root, 'jelly', inner);
      const b = { el: root, s: 1, v: 0, target: 1, phase: i * 1.7 };
      bodies.push(b);
      node.addEventListener('pointerenter', () => { b.target = 1.035; highlight(node); });
      node.addEventListener('pointerleave', () => { b.target = 1; highlight(null); });
    });
    if (!animating) { animating = true; animate(); }
  }

  /* ---------- Подключение: оборачиваем отрисовку сайта ---------- */
  const origBuild = buildTreeV2;
  buildTreeV2 = function (data) {   // eslint-disable-line no-global-assign
    if (DEMO && data === ORG_DATA.trees.construction2) data = trim(data);
    origBuild(data);
    setupStage();
    requestAnimationFrame(decorate);
  };
  setupStage();
  if (document.getElementById('view-tree') && location.hash.startsWith('#tree/')) restoreFromHash();
})();
