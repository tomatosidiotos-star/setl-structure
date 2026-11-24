/* ====================================================================
   Тема «Гиперреализм» для полотна структуры (концепт, вариант 1). Подключается на real.html —
   копии сайта; меняет только полотно. Логику сайта не трогает: оборачивает buildTreeV2 и после
   отрисовки «одевает» карточки и линии.
   Фактуры — фото-сканы CC0 с ambientCG (textures/: крафт Paper006, металл Metal009, стена Plaster001,
   бумага Paper001), подогнаны по цвету. Отдел — крафтовая папка с листами, руководитель — полароид на скрепке, куратор — металлическая
   табличка на гвоздях, связи — синие нитки между гвоздями, фон — светлая крашеная стена.
   ?demo=3 — «Строительный блок 2» урезан до трёх карточек
==================================================================== */
(function () {
  document.documentElement.classList.add('theme-real');
  const DEMO = new URLSearchParams(location.search).get('demo') === '3';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVGNS = 'http://www.w3.org/2000/svg';

  function trim(data) {
    const d = JSON.parse(JSON.stringify(data));
    d.persons = d.persons.filter(p => p.id === 'v2-pokr' || p.id === 'v2-ersh');
    d.persons.forEach(p => { delete p.children; delete p.childBlock; (p.nested || []).forEach(n => { delete n.children; delete n.childBlock; }); });
    return d;
  }

  /* ---------- Общие материалы: крафт, бумага, металл, гвозди (один раз на страницу) ---------- */
  function materials() {
    if (document.getElementById('rl-defs')) return;
    const s = document.createElementNS(SVGNS, 'svg');
    s.id = 'rl-defs'; s.setAttribute('width', 0); s.setAttribute('height', 0);
    s.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    s.innerHTML = `<defs>
      <radialGradient id="rlNail" cx=".36" cy=".32" r=".7">
        <stop offset="0" stop-color="#FFFFFF"/><stop offset=".3" stop-color="#D4D7DC"/><stop offset=".85" stop-color="#7A8089"/><stop offset="1" stop-color="#555A62"/></radialGradient>
      <linearGradient id="rlKraftLight" x1="0" y1="0" x2=".25" y2="1">   <!-- свет сверху-слева поверх крафта -->
        <stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#3a2210" stop-opacity=".10"/></linearGradient>
      <linearGradient id="rlMetalLight" x1="0" y1="0" x2="0" y2="1">   <!-- объём таблички поверх шлифа -->
        <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#2a2f38" stop-opacity=".22"/></linearGradient>
      <filter id="rlShadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
      <filter id="rlShadowS" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6"/></filter>
      <filter id="rlThreadSh" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.3"/></filter>
    </defs>`;
    document.body.appendChild(s);
  }

  /* ---------- Папка: задник с ярлыком, листы, передняя обложка ---------- */
  function rnd(seed) { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }
  let seedN = 0;
  // текстура-узор в своей SVG: у каждой папки свой сдвиг, чтобы не было видно одинаковый рисунок
  const TEX = 'textures/';
  function pattern(id, file, w, h, k) {
    const dx = Math.round(rnd(k + 3) * w), dy = Math.round(rnd(k + 11) * h);
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${w}" height="${h}" patternTransform="translate(${-dx},${-dy})">`
      + `<image href="${TEX}${file}" width="${w}" height="${h}" preserveAspectRatio="none"/></pattern>`;
  }
  function folderSVG(W, H) {
    const tabW = Math.round(W * .56), tabH = 16, F = 28, r = 9, k = ++seedN;
    const kp = 'rlk' + k, pp = 'rlp' + k;
    const a1 = (rnd(k) - .5) * 2.4, a2 = (rnd(k + 7) - .5) * 2;
    const back = `M0,${H - r} V8 Q0,0 8,0 H${tabW - 12} C${tabW - 5},0 ${tabW - 3},${tabH} ${tabW + 8},${tabH}`
      + ` H${W - r} Q${W},${tabH} ${W},${tabH + r} V${H - r} Q${W},${H} ${W - r},${H} H${r} Q0,${H} 0,${H - r} Z`;
    const front = `M0,${F + 6} Q0,${F} 6,${F} H${W - 6} Q${W},${F} ${W},${F + 6} V${H - r} Q${W},${H} ${W - r},${H} H${r} Q0,${H} 0,${H - r} Z`;
    return `<defs>${pattern(kp, 'kraft.jpg', 220, 220, k)}${pattern(pp, 'paper.jpg', 160, 160, k + 5)}</defs>
      <path d="${back}" transform="translate(1,7)" fill="#3a2a18" opacity=".32" filter="url(#rlShadow)"/>
      <path d="${back}" fill="url(#${kp})"/>
      <path d="${back}" fill="#4a2c12" opacity=".2"/>
      <g class="rl-sheet rl-sheet--2"><g transform="rotate(${a2} ${W / 2} ${F})"><rect x="7" y="12" width="${W - 16}" height="${H - 22}" rx="2" fill="url(#${pp})"/><rect x="7" y="12" width="${W - 16}" height="${H - 22}" rx="2" fill="#7a6a50" opacity=".1"/></g></g>
      <g class="rl-sheet rl-sheet--1"><rect x="6" y="11" width="${W - 12}" height="${H - 20}" rx="2" fill="url(#${pp})" transform="rotate(${a1} ${W / 2} ${F})"/>
        <rect x="16" y="17" width="${Math.round(W * .32)}" height="2" rx="1" fill="#C9C3B6" transform="rotate(${a1} ${W / 2} ${F})"/>
        <rect x="16" y="22" width="${Math.round(W * .48)}" height="2" rx="1" fill="#D6D1C5" transform="rotate(${a1} ${W / 2} ${F})"/></g>
      <rect x="8" y="${F - 3}" width="${W - 16}" height="8" fill="#3a2a18" opacity=".18" filter="url(#rlShadowS)"/>
      <path d="${front}" fill="url(#${kp})"/>
      <path d="${front}" fill="url(#rlKraftLight)"/>
      <rect x="2" y="${F}" width="${W - 4}" height="2.5" rx="1.25" fill="#fff" opacity=".28"/>`;
  }
  function sheetSVG(W, H) {   // зам без подразделения — отдельный лист, приколотый к стене
    const k = ++seedN, a = (rnd(k) - .5) * 2, pp = 'rlp' + k;
    return `<defs>${pattern(pp, 'paper.jpg', 160, 160, k)}</defs>
      <rect x="2" y="8" width="${W - 4}" height="${H - 6}" rx="2" fill="#3a2a18" opacity=".26" filter="url(#rlShadow)"/>
      <rect x="3" y="2" width="${W - 6}" height="${H - 4}" rx="2" fill="url(#${pp})" transform="rotate(${a + 1.4} ${W / 2} 6)"/>
      <rect x="3" y="2" width="${W - 6}" height="${H - 4}" rx="2" fill="#7a6a50" opacity=".1" transform="rotate(${a + 1.4} ${W / 2} 6)"/>
      <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="2" fill="url(#${pp})" transform="rotate(${a} ${W / 2} 6)"/>`;
  }
  function plaqueSVG(W, y = 3, h = 42) {   // табличка: шлифованный металл, фаска, гвозди по краям
    const k = ++seedN, mp = 'rlm' + k;
    return `<defs>${pattern(mp, 'metal.jpg', 360, 180, k)}</defs>
      <rect x="2" y="${y + 5}" width="${W - 4}" height="${h}" rx="6" fill="#20242c" opacity=".35" filter="url(#rlShadow)"/>
      <rect x="0" y="${y}" width="${W}" height="${h}" rx="6" fill="url(#${mp})"/>
      <rect x="0" y="${y}" width="${W}" height="${h}" rx="6" fill="url(#rlMetalLight)"/>
      <rect x="1" y="${y + .5}" width="${W - 2}" height="2" rx="1" fill="#fff" opacity=".9"/>
      <rect x="1" y="${y + h - 2.5}" width="${W - 2}" height="2" rx="1" fill="#5b6069" opacity=".35"/>
      ${nail(11, y + h / 2)}${nail(W - 11, y + h / 2)}`;
  }
  function nail(x, y, r = 3.6) {
    return `<g><circle cx="${x + 1.2}" cy="${y + 2}" r="${r}" fill="#1d2027" opacity=".35" filter="url(#rlShadowS)"/>`
      + `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#rlNail)"/></g>`;
  }

  function dress(el, html) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'rl-mat');
    svg.setAttribute('width', el.offsetWidth); svg.setAttribute('height', el.offsetHeight + 14);
    svg.innerHTML = html;
    el.insertBefore(svg, el.firstChild);
    el.classList.add('rl-done');
  }

  /* ---------- Нитки между гвоздями ---------- */
  const SAG_MAX = 14;
  function sagOf(a, b) { return Math.min(SAG_MAX, Math.abs(b.x - a.x) * .06 + Math.abs(b.y - a.y) * .02 + 1.5); }
  function threadD(a, b, sag) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + sag;
    return `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`;
  }
  let threads = [], layer = null;
  function addThread(a, b, keys, tight) {
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'rl-thread');
    g.innerHTML = '<path class="rl-thread__sh"/><path class="rl-thread__main"/><path class="rl-thread__strand"/>';
    layer.threads.appendChild(g);
    const t = { g, a, b, keys, sag0: tight ? 1.5 : sagOf(a, b), f: 1, v: 0, target: 1 };
    setD(t); threads.push(t);
  }
  function setD(t) {
    const d = threadD(t.a, t.b, t.sag0 * t.f);
    t.g.querySelectorAll('path').forEach(p => p.setAttribute('d', d));
  }

  function buildThreads() {
    const inner = document.getElementById('canvas-inner'), svg = document.getElementById('tree-svg');
    if (layer) layer.root.remove();
    threads = [];
    const root = document.createElementNS(SVGNS, 'svg');
    root.setAttribute('class', 'rl-strings');
    root.innerHTML = '<g class="rl-strings__threads"></g><g class="rl-strings__nails"></g>';
    inner.appendChild(root);
    layer = { root, threads: root.firstChild, nails: root.lastChild };
    const lines = [...svg.querySelectorAll('path[data-key]')].map(p => ({ key: p.dataset.key, g: JSON.parse(p.dataset.geom || '{}') }));
    const nails = new Map(), pin = (x, y, r) => nails.set(Math.round(x) + ',' + Math.round(y), [x, y, r]);
    const groups = new Map();
    lines.forEach(l => {   // у одного родителя на одной высоте — одна группа
      const id = l.g.px + ',' + l.g.py + ',' + l.g.midY;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(l);
    });
    groups.forEach(list => {
      const { px, py, midY } = list[0].g, P = { x: px, y: py - 8 };
      pin(P.x, P.y);
      if (list.length < 5) {   // мало детей — каждая нитка от гвоздя к гвоздю
        list.forEach(l => { const C = { x: l.g.cx, y: l.g.cy + 7 }; pin(C.x, C.y); addThread(P, C, [l.key]); });
        return;
      }
      // много детей — общая натянутая нитка над рядом и короткие отводы вниз
      const by = midY, xs = [...new Set([px, ...list.map(l => l.g.cx)])].sort((a, b) => a - b);
      addThread(P, { x: px, y: by }, list.map(l => l.key), true);
      xs.forEach(x => pin(x, by, 2.8));
      for (let i = 0; i < xs.length - 1; i++) {
        const x1 = xs[i], x2 = xs[i + 1];
        const keys = list.filter(l => Math.min(px, l.g.cx) <= x1 && x2 <= Math.max(px, l.g.cx)).map(l => l.key);
        addThread({ x: x1, y: by }, { x: x2, y: by }, keys, true);
      }
      list.forEach(l => { const C = { x: l.g.cx, y: l.g.cy + 7 }; pin(C.x, C.y); addThread({ x: l.g.cx, y: by }, C, [l.key], true); });
    });
    layer.nails.innerHTML = [...nails.values()].map(([x, y, r]) => nail(x, y, r)).join('');
  }

  /* ---------- Подсветка пути: нитки до верха натягиваются и становятся ярче ---------- */
  function chainKeys(node) {
    const inner = document.getElementById('canvas-inner'), svg = document.getElementById('tree-svg');
    const nodes = [...inner.querySelectorAll(':scope > .tree-node')], out = new Set();
    let cur = node;
    for (let guard = 0; cur && guard < 20; guard++) {
      const key = typeof v2NodeKey === 'function' ? v2NodeKey(cur) : null;
      const line = key && svg.querySelector(`path[data-key="${CSS.escape(key)}"]`);
      if (!line) break;
      out.add(key);
      const g = JSON.parse(line.dataset.geom || '{}');
      cur = nodes.find(n => g.px >= n.offsetLeft - 1 && g.px <= n.offsetLeft + n.offsetWidth + 1
        && g.py >= n.offsetTop - 1 && g.py <= n.offsetTop + n.offsetHeight + 4 && n !== cur);
    }
    return out;
  }
  function highlight(node) {
    const keys = node ? chainKeys(node) : new Set();
    threads.forEach(t => {
      const on = t.keys.some(k => keys.has(k));
      t.g.classList.toggle('hot', on);
      t.target = on ? 0 : 1;
    });
    kick();
  }
  let running = false;
  function kick() {
    if (running) return;
    if (REDUCED) { threads.forEach(t => { t.f = t.target; setD(t); }); return; }
    running = true;
    (function tick() {
      let busy = false;
      threads.forEach(t => {
        if (Math.abs(t.target - t.f) < .002 && Math.abs(t.v) < .002) { if (t.f !== t.target) { t.f = t.target; setD(t); } return; }
        t.v += (t.target - t.f) * .09 - t.v * .2; t.f += t.v; setD(t); busy = true;   // пружина: натянулась с лёгкой отдачей
      });
      if (busy) requestAnimationFrame(tick); else running = false;
    })();
  }

  /* ---------- Одеть отрисованное дерево ---------- */
  function decorate() {
    const inner = document.getElementById('canvas-inner');
    if (!inner) return;
    const nodes = [...inner.querySelectorAll(':scope > .tree-node')];
    if (!nodes.length) return;
    materials();
    nodes.forEach((node, i) => {
      const root = node.querySelector(':scope > .card-v2-multi, :scope > .card-v3');
      if (!root || root.classList.contains('rl-done')) return;
      if (root.classList.contains('card-v3')) {
        dress(root, plaqueSVG(root.offsetWidth));
        root.querySelectorAll('.card-v3__sub').forEach(sub =>
          dress(sub, sub.classList.contains('card-v3__sub--nodept') ? sheetSVG(sub.offsetWidth, sub.offsetHeight) : folderSVG(sub.offsetWidth, sub.offsetHeight)));
      } else {
        const heads = [...root.querySelectorAll(':scope > .card-v2-multi__heads > .card-v2')];
        const deptWrap = root.querySelector(':scope > .card-v2-multi__dept-wrap');
        if (heads.length > 1 && deptWrap) {   // несколько руководителей одного отдела: у каждого своя папка, отдел — табличка под ними
          root.classList.add('rl-multi');
          const folders = heads.map(h => `<g transform="translate(${h.offsetLeft},0)">${folderSVG(h.offsetWidth, h.offsetHeight)}</g>`).join('');
          dress(root, folders + plaqueSVG(root.offsetWidth, deptWrap.offsetTop + 8, deptWrap.offsetHeight - 12));
        } else
          dress(root, root.classList.contains('card-v2-multi--nodept') ? sheetSVG(root.offsetWidth, root.offsetHeight) : folderSVG(root.offsetWidth, root.offsetHeight));
      }
      root.querySelectorAll('.card-v2-mh__wrap .card-v2__photo').forEach((ph, j) => {
        if (!ph.closest('.v2-deps')) ph.style.setProperty('--rl-rot', ((rnd(i * 5 + j) - .6) * 9).toFixed(1) + 'deg');
      });
      // кнопка раскрытия — в левый нижний угол своей папки (у папок наборной сайт ставит её по центру папки)
      const folders = root.classList.contains('card-v3') ? [...root.querySelectorAll('.card-v3__sub')] : [root];
      const leftIn = el => { let x = 0; for (let e = el; e && e !== node; e = e.offsetParent) x += e.offsetLeft; return x; };
      node.querySelectorAll(':scope > .fold-btn:not(.fold-btn--side)').forEach(btn => {
        const c = btn.style.left ? parseFloat(btn.style.left) : node.offsetWidth / 2;   // сайт: left = центр папки
        const f = folders.find(f => c >= leftIn(f) - 1 && c <= leftIn(f) + f.offsetWidth + 1) || root;
        btn.style.left = (leftIn(f) + 14) + 'px';
      });
      // листы выдвигаются у той папки, на которую навели: у обычной карточки — она сама, у наборной — каждая папка
      const peekers = root.classList.contains('card-v3') ? [...root.querySelectorAll('.card-v3__sub')] : [root];
      peekers.forEach(f => {
        f.addEventListener('pointerenter', () => f.classList.add('rl-peek'));
        f.addEventListener('pointerleave', () => f.classList.remove('rl-peek'));
      });
      node.addEventListener('pointerenter', () => { root.classList.add('rl-lift'); highlight(node); });
      node.addEventListener('pointerleave', () => { root.classList.remove('rl-lift'); highlight(null); });
    });
    buildThreads();
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
