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
      <rect x="-4" y="0" width="${W + 8}" height="${H + T + 4}" fill="url(#${id}e)" mask="url(#${id}m)"/>`;
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
    if (pendingDots) {   // идёт раскрытие ветки: новые точки появляются, когда до них дотянулась линия
      const { at, moves, moveDelay, t0 } = pendingDots, now = T0 !== null ? t0 : performance.now();   // при общем старте задержки — от него
      layer.querySelectorAll('circle').forEach(c => {
        const k = Math.round(+c.getAttribute('cx')) + ',' + Math.round(+c.getAttribute('cy'));
        const mv = moves.get(k), t = at.get(k);
        if (mv)   // точка оставшейся линии едет со старого места вместе с карточкой и линией
          anim(c, [{ transform: `translate(${mv[0]}px, ${mv[1]}px)` }, { transform: 'none' }],
            { duration: 640, delay: Math.max(0, moveDelay - (now - t0)), easing: SETTLE, fill: 'backwards' });
        else if (t !== undefined)   // точка новой линии «щёлкает», когда линия до неё дошла
          anim(c, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
            { duration: 420, delay: Math.max(0, t - (now - t0)), easing: SPRING, fill: 'backwards' });
      });
      pendingDots = null;
    }
  }

  /* ---------- Подсветка пути: от карточки под курсором до верха структуры ---------- */
  // линия ведёт к карточке (data-key = v2NodeKey); её начало (px, py) — низ родительской карточки
  function chainFor(node) {
    const inner = document.getElementById('canvas-inner'), svg = document.getElementById('tree-svg');
    const nodes = [...inner.querySelectorAll(':scope > .tree-node')], out = [];
    let cur = node;
    for (let guard = 0; cur && guard < 30; guard++) {
      const key = typeof v2NodeKey === 'function' ? v2NodeKey(cur) : null;
      const line = key && svg.querySelector(`path[data-key="${CSS.escape(key)}"]`);
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
    const svg = document.getElementById('tree-svg'), dotsLayer = document.querySelector('#canvas-inner > .fr-dots');
    const old = hot; hot = [];
    old.forEach(el => el.classList.remove('on'));
    setTimeout(() => old.forEach(el => el.remove()), 450);   // гаснут плавно, потом убираем
    const chain = node ? chainFor(node) : [];
    svg.classList.toggle('fr-dim', chain.length > 0);
    if (!chain.length) return;
    chain.forEach(p => {
      const lit = p.cloneNode(); lit.removeAttribute('data-key'); lit.setAttribute('class', 'fr-hot');
      const flow = p.cloneNode(); flow.removeAttribute('data-key'); flow.setAttribute('class', 'fr-flow');
      svg.append(lit, flow); hot.push(lit, flow);
      if (dotsLayer) {
        const g = JSON.parse(p.dataset.geom);
        [[g.px, g.py], [g.cx, g.cy]].forEach(([x, y]) => {
          const c = document.createElementNS(SVGNS, 'circle');
          c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 4.5); c.setAttribute('class', 'fr-dot-hot');
          dotsLayer.appendChild(c); hot.push(c);
        });
      }
    });
    requestAnimationFrame(() => requestAnimationFrame(() => hot.forEach(el => el.classList.add('on'))));
  }

  /* ---------- Раскрытие и сворачивание ветки: «папка выпускает содержимое» ----------
     Подменяет v2Rebuild сайта (та же логика: перестроить дерево, якорная карточка остаётся на месте),
     меняется только анимация:
     раскрытие — карточка «проседает» от нажатия, линии рисуются из неё (ствол → ветки), дочерние
     карточки вылетают из родителя, когда линия до них дотянулась, и на пружине встают на место;
     точки «щёлкают», когда линия дошла;
     сворачивание — карточки улетают обратно в родителя (дальние первыми), линии втягиваются,
     родитель в конце чуть «сглатывает» */
  // пружина как функция плавности linear(): zeta — затухание (1 — без перелёта, меньше — с мягким доводом)
  function springEase(zeta) {
    if (!CSS.supports('animation-timing-function', 'linear(0, 1)')) return 'cubic-bezier(.22, 1, .36, 1)';
    const w = 5.6 / zeta, wd = w * Math.sqrt(Math.max(1e-6, 1 - zeta * zeta)), pts = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const x = zeta >= 1 ? 1 - Math.exp(-w * t) * (1 + w * t)
        : 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + zeta * w / wd * Math.sin(wd * t));
      pts.push(+(i === 48 ? 1 : x).toFixed(4));
    }
    return `linear(${pts.join(', ')})`;
  }
  const SPRING = springEase(.72), SETTLE = springEase(1);
  const REDUCED_M = matchMedia('(prefers-reduced-motion: reduce)');
  let pendingDots = null, dotsReady = false;
  // все анимации одной перестройки стартуют в один момент (Safari иначе запускает анимации SVG-точек позже карточек)
  let T0 = null;
  function anim(el, kf, opt) { const a = el.animate(kf, opt); if (T0 !== null) a.startTime = T0; return a; }

  function cardOf(n) { return n.querySelector(':scope > .card-v2-multi, :scope > .card-v3') || n; }

  function frRebuild(mutate, sel) {
    const before = document.querySelector(sel);
    const bx = before ? parseFloat(before.style.left) : 0, by = before ? parseFloat(before.style.top) : 0;
    const snap = new Map(), lines = new Map();
    document.querySelectorAll('#canvas-inner > .tree-node').forEach(n => {
      const k = v2NodeKey(n);
      if (k) snap.set(k, { x: parseFloat(n.style.left), y: parseFloat(n.style.top), el: n });
    });
    document.querySelectorAll('#tree-svg path[data-key]').forEach(l => lines.set(l.dataset.key, JSON.parse(l.dataset.geom)));

    const t0 = performance.now();
    mutate();
    if (state.blockId === 'custom') buildCustomTree(); else buildTreeV2(V2_BLOCK_DATA);

    const after = document.querySelector(sel);
    let dX = 0, dY = 0;   // якорная карточка остаётся на том же месте экрана
    if (before && after) {
      dX = parseFloat(after.style.left) - bx; dY = parseFloat(after.style.top) - by;
      canvas.x -= dX * canvas.scale; canvas.y -= dY * canvas.scale; applyTransform();
    }
    if (REDUCED_M.matches) return;

    const inner = document.getElementById('canvas-inner'), svg = document.getElementById('tree-svg');
    const tA = performance.now(); T0 = document.timeline.currentTime;   // отсчёт для точек — с момента, когда стартуют анимации карточек (после перестройки)
    const lineEl = new Map([...svg.querySelectorAll('path[data-key]')].map(l => [l.dataset.key, l]));
    const seen = new Set(), born = [];
    const PRESS = 90;   // сколько длится «нажатие» до того, как пойдут линии
    // при сворачивании соседи едут на освободившееся место чуть позже — когда улетающие почти исчезли,
    // иначе проходят сквозь них
    const nowKeys = new Set([...inner.querySelectorAll(':scope > .tree-node')].map(v2NodeKey).filter(Boolean));
    const MOVE_DELAY = [...snap.keys()].some(k => !nowKeys.has(k)) ? 190 : 0;

    // карточки, которые остались, — едут на новое место мягко, без перелёта
    inner.querySelectorAll(':scope > .tree-node').forEach(n => {
      const k = v2NodeKey(n), o = k && snap.get(k);
      if (o) {
        seen.add(k);
        const tx = o.x + dX - parseFloat(n.style.left), ty = o.y + dY - parseFloat(n.style.top);
        if (Math.abs(tx) > .5 || Math.abs(ty) > .5)
          anim(n, [{ transform: `translate(${tx}px, ${ty}px)` }, { transform: 'none' }], { duration: 640, delay: MOVE_DELAY, easing: SETTLE, fill: 'backwards' });
      } else if (k && lineEl.get(k)) born.push({ n, k, l: lineEl.get(k) });
      else if (k) anim(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: PRESS, fill: 'backwards' });
    });

    // раскрытие: линии рисуются из родителя, карточки вылетают, когда линия до них дотянулась
    const dotsAt = new Map(), key = (x, y) => Math.round(x) + ',' + Math.round(y);
    born.forEach(({ n, l }) => {
      const g = JSON.parse(l.dataset.geom), L = l.getTotalLength();
      const draw = 240 + Math.sqrt(L) * 15;   // длинные ветки рисуются дольше, но не бесконечно
      l.style.strokeDasharray = `${L} ${L}`;
      anim(l, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }],
        { duration: draw, delay: PRESS, easing: 'cubic-bezier(.45, 0, .25, 1)', fill: 'backwards' })
        .onfinish = () => { l.style.strokeDasharray = ''; };
      dotsAt.set(key(g.px, g.py), PRESS);
      dotsAt.set(key(g.cx, g.cy), PRESS + draw - 40);
      // карточка стартует из точки на низу родителя — маленькая, прозрачная
      const w = n.offsetWidth, x = parseFloat(n.style.left), y = parseFloat(n.style.top);
      const tx = g.px - (x + w / 2), ty = g.py - y - 6, d = PRESS + draw * .55;
      n.style.transformOrigin = '50% 0';
      anim(n, [{ transform: `translate(${tx}px, ${ty}px) scale(.3)` }, { transform: 'none' }],
        { duration: 760, delay: d, easing: SPRING, fill: 'backwards' });
      anim(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: d, easing: 'ease-out', fill: 'backwards' });
    });

    // линии, которые остались, перетекают в новую форму; точки на их концах едут вместе с ними
    const shift = g => ({ px: g.px + dX, py: g.py + dY, cx: g.cx + dX, cy: g.cy + dY, midY: g.midY + dY });
    const dotMoves = new Map();
    svg.querySelectorAll('path[data-key]').forEach(l => {
      const old = lines.get(l.dataset.key);
      if (!old) return;
      const g = JSON.parse(l.dataset.geom), o = shift(old);
      [[g.px, g.py, o.px, o.py], [g.cx, g.cy, o.cx, o.cy]].forEach(([x, y, ox, oy]) => {
        if (Math.abs(ox - x) > .5 || Math.abs(oy - y) > .5) dotMoves.set(key(x, y), [ox - x, oy - y]);
      });
      const from = connectorD(shift(old)), to = l.getAttribute('d');
      if (from !== to) anim(l, [{ d: `path("${from}")` }, { d: `path("${to}")` }], { duration: 640, delay: MOVE_DELAY, easing: SETTLE, fill: 'backwards' });
    });

    pendingDots = { at: dotsAt, moves: dotMoves, moveDelay: MOVE_DELAY, t0: tA };
    dots(); dotsReady = true;   // точки — в том же кадре, что и анимации карточек (иначе отстают на кадр)

    // сворачивание: ушедшие карточки улетают в родителя (дальние первыми), линии втягиваются в него
    const gone = [...snap].filter(([k]) => !seen.has(k)).map(([k, o]) => ({ k, o, g: lines.get(k) && shift(lines.get(k)) }));
    gone.sort((a, b) => (b.g ? Math.abs(b.g.cx - b.g.px) : 0) - (a.g ? Math.abs(a.g.cx - a.g.px) : 0));
    let lastOut = 0;
    gone.forEach(({ o, g }, i) => {
      const ghost = o.el, x = o.x + dX, y = o.y + dY;
      ghost.style.left = x + 'px'; ghost.style.top = y + 'px'; ghost.style.pointerEvents = 'none';
      ghost.style.transformOrigin = '50% 0';
      inner.appendChild(ghost);
      const delay = i * 22, dur = 300;
      lastOut = Math.max(lastOut, delay + dur);
      const to = g ? `translate(${g.px - (x + ghost.offsetWidth / 2)}px, ${g.py - y - 6}px) scale(.3)` : 'scale(.9)';
      anim(ghost, [{ transform: 'none', opacity: 1 }, { opacity: 1, offset: .55 }, { transform: to, opacity: 0 }],
        { duration: dur, delay, easing: 'cubic-bezier(.55, 0, .75, .2)', fill: 'forwards' }).onfinish = () => ghost.remove();
      if (!g) return;
      const gl = document.createElementNS(SVGNS, 'path');
      gl.setAttribute('d', connectorD(g)); gl.setAttribute('fill', 'none');
      gl.setAttribute('stroke', 'var(--canvas-line)'); gl.setAttribute('stroke-width', '1.5'); gl.setAttribute('stroke-linecap', 'round');
      svg.appendChild(gl);
      const L = gl.getTotalLength();
      gl.style.strokeDasharray = `${L} ${L}`;
      anim(gl, [{ strokeDashoffset: 0 }, { strokeDashoffset: L }],   // втягивается от ребёнка к родителю
        { duration: dur + 60, delay, easing: 'cubic-bezier(.5, 0, .7, .3)', fill: 'forwards' }).onfinish = () => gl.remove();
    });

    // родитель: «нажатие» при раскрытии, «сглатывание» в конце сворачивания
    if (after) {
      const c = cardOf(after);
      if (born.length) anim(c, [{ transform: 'scale(1)' }, { transform: 'scale(.965)', offset: .4 }, { transform: 'scale(1)' }],
        { duration: 420, easing: 'cubic-bezier(.3, .7, .4, 1)' });
      else if (gone.length) anim(c, [{ transform: 'scale(1)' }, { transform: 'scale(1.03)', offset: .35 }, { transform: 'scale(1)' }],
        { duration: 460, delay: Math.max(0, lastOut - 120), easing: 'cubic-bezier(.3, .7, .4, 1)' });
    }
    T0 = null;
  }
  if (typeof v2Rebuild === 'function') v2Rebuild = frRebuild;   // eslint-disable-line no-global-assign

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
      node.addEventListener('pointerenter', () => highlight(node));
      node.addEventListener('pointerleave', () => highlight(null));
    });
    if (dotsReady) dotsReady = false; else dots();   // после раскрытия/сворачивания точки уже поставлены
  }

  /* ---------- Подключение: оборачиваем отрисовку сайта ---------- */
  const origBuild = buildTreeV2;
  buildTreeV2 = function (data) {   // eslint-disable-line no-global-assign
    if (DEMO && data === ORG_DATA.trees.construction2) data = trim(data);
    origBuild(data);
    requestAnimationFrame(decorate);
  };
  if (document.getElementById('view-tree') && location.hash.startsWith('#tree/')) restoreFromHash();
})();
