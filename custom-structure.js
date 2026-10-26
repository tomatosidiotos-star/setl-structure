/* ====================================================================
   КАСТОМНАЯ СТРУКТУРА («Структура» на главной)

   Структура верхнего уровня — смесь юридических и управленческих связей. Не приходит
   из 1С: хранится на сервисе, меняется редко, правит разработчик — только объект
   CUSTOM_STRUCTURE ниже. Экран и печать строятся по нему одной раскладкой (ctLayout).

   Узел:
     id        — уникальный ключ
     type      — 'board' (совет директоров, состав — ORG_DATA.board.members) |
                 'exec'  (исполнительный директор — ORG_DATA.board.executive) |
                 'group' (по умолчанию: название + руководители) |
                 'set'   (наборная карточка: название вместо человека + внутренние карточки items)
     name      — название группы / блока
     people    — руководители [{ name, fullName, role, photo }]
     items     — у 'set': внутренние карточки [{ name, people }]
     children  — подчинённые узлы
     alsoFrom  — ещё родители (id): к узлу приходит вторая линия, например от совета
     row       — ряд, если узел должен стоять ниже своего уровня (ряды с 0 — совет)
   Где ФИО неизвестно — «ФИО», заполнить потом.
==================================================================== */

const CUSTOM_STRUCTURE = (function () {
  let n = 0;
  const P = (name, fullName, role, photo) => ({ id: 'cs-p' + (++n), name, fullName, role, photo: photo || null });
  const FIO = role => P('ФИО', 'ФИО', role || 'Руководитель');
  const vlash = () => P('Влащенко И.С.', 'Влащенко Игорь Сергеевич', 'Генеральный директор');
  const erem  = () => P('Еременко И.А.', 'Еременко Игорь Александрович', 'Генеральный директор');
  const krem  = () => P('Кремлёва Е.С.', 'Кремлёва Екатерина Сергеевна', 'Заместитель генерального директора');

  return {
    title: 'Структура',
    description: 'Структура группы компаний верхнего уровня: юридические и управленческие связи.',
    root: {
      id: 'cs-board', type: 'board',
      children: [
        { id: 'cs-exec', type: 'exec',
          children: [
            { id: 'cs-tech', name: 'Сетл тех', people: [krem()], children: [
              { id: 'cs-brio', name: 'БРИО МС', people: [FIO()] },
              { id: 'cs-tech2', name: 'Сэтл технологии', people: [krem()] },
            ] },
            { id: 'cs-build', name: 'Группа строительных компаний', people: [vlash(), erem()] },
            { id: 'cs-sg', name: 'Группа компаний Сэтл Групп', people: [vlash(), erem()], children: [
              { id: 'cs-arch', name: 'Архитектурное бюро', people: [vlash(), erem()] },
              { id: 'cs-kal', name: 'Калининград', people: [vlash(), erem()] },
              { id: 'cs-sgm', name: 'Группа компаний Сэтл М', people: [FIO(), FIO()] },
              { id: 'cs-re', name: 'Управление недвижимостью', people: [vlash(), erem()] },
            ] },
            // Операционный блок подчиняется и исполнительному директору, и совету
            { id: 'cs-ops', type: 'set', name: 'Операционный блок', alsoFrom: ['cs-board'],
              items: ['HR', 'Юристы', 'ДВК', 'Финансы', 'IT', 'АХО', 'PR'].map(name => ({ name, people: [FIO()] })) },
          ] },
        // Петербургская недвижимость — от совета, но в одном ряду с группами
        { id: 'cs-pn', name: 'Петербургская недвижимость', row: 2,
          people: [P('Луговская Н.Ю.', 'Луговская Наталья Юрьевна', 'Заместитель председателя правления')], children: [
            { id: 'cs-agency', name: 'Агентство недвижимости', people: [P('Пашин О.В.', 'Пашин Олег Валентинович', 'Генеральный директор')] },
          ] },
      ],
    },
  };
})();

/* ---------- Совет и исполнительный — из ORG_DATA.board (тот же состав, что на главной) ---------- */
function csPerson(p) {
  const full = (p.displayName || p.fullName || p.name || '').replace(/\s*\n\s*/g, ' ').trim();
  const [s, a, b] = full.split(' ');
  return { id: p.id, fullName: full, name: p.displayName ? s + (a ? ` ${a[0]}.` : '') + (b ? `${b[0]}.` : '') : (p.name || full),
    role: (p.role || '').replace(/\s*\n\s*/g, ' '), photo: p.photo || null };
}
function csResolve(node) {
  const B = (typeof ORG_DATA !== 'undefined' && ORG_DATA.board) || {};
  if (node.type === 'board') return { label: B.label || 'Совет директоров', people: (B.members || []).map(csPerson) };
  if (node.type === 'exec') return { label: '', people: B.executive ? [csPerson(B.executive)] : [] };
  return { label: node.name || '', people: node.people || [] };
}

/* ---------- Раскладка (общая для экрана и печати) ----------
   Дерево снизу вверх: ширина поддерева = max(карточка, дети в ряд с зазором hg); ряды — по
   уровню (или row), высота ряда — по самой высокой карточке. Линии — от родителя к ребёнку
   и от дополнительных родителей (alsoFrom). size(node) → { w, h } */
function ctLayout(roots, size, o) {
  const HG = (o && o.hg) || 80, VG = (o && o.vg) || 120, PAD = (o && o.pad) || 40;
  const all = [];
  const walk = (n, level, parent) => {
    n._level = Number.isInteger(n.row) ? Math.max(n.row, level) : level;
    delete n._W;   // ширина поддерева — пересчитать (карточки могли поменяться)
    n._parent = parent;
    const s = size(n); n._w = s.w; n._h = s.h;
    all.push(n);
    (n._kids || []).forEach(c => walk(c, n._level + 1, n));
  };
  roots.forEach(r => walk(r, 0, null));
  const W = n => (n._W !== undefined ? n._W : (n._W = Math.max(n._w,
    (n._kids || []).reduce((s, c) => s + W(c), 0) + Math.max(0, (n._kids || []).length - 1) * HG)));
  const place = (n, cx) => {
    n._x = cx;
    const kids = n._kids || [];
    let x = cx - (kids.reduce((s, c) => s + W(c), 0) + Math.max(0, kids.length - 1) * HG) / 2;
    kids.forEach(c => { place(c, x + W(c) / 2); x += W(c) + HG; });
  };
  let x = 0;
  roots.forEach(r => { place(r, x + W(r) / 2); x += W(r) + HG; });
  // ряды
  const rowH = [];
  all.forEach(n => { rowH[n._level] = Math.max(rowH[n._level] || 0, n._h); });
  const rowTop = [];
  for (let i = 0, y = PAD; i < rowH.length; i++) { rowTop[i] = y; y += (rowH[i] || 0) + VG; }
  all.forEach(n => { n._y = rowTop[n._level]; });
  const minX = Math.min(...all.map(n => n._x - n._w / 2)), maxX = Math.max(...all.map(n => n._x + n._w / 2));
  all.forEach(n => { n._x += PAD - minX; });
  const width = maxX - minX + PAD * 2;
  const height = Math.max(...all.map(n => n._y + n._h)) + PAD;
  // линии: родитель → ребёнок и дополнительные родители
  const byId = new Map(all.map(n => [n.id, n]));
  const edges = [];
  all.forEach(n => {
    if (n._parent) edges.push([n._parent, n]);
    (n.alsoFrom || []).forEach(id => { const p = byId.get(id); if (p) edges.push([p, n]); });
  });
  return { nodes: all, edges: edges.map(([a, b]) => ctEdge(a, b, VG)), width, height, hops: ctHops };
}

// Линия: от низа родителя вниз, горизонталь над рядом ребёнка, вниз к ребёнку. Если ребёнок
// не прямо под родителем (пропущен ряд, второй родитель) — линия выходит из ближайшей к нему
// внутренней карточки родителя (85 = полкарточки), чтобы не пересечь карточку под родителем
function ctEdge(a, b, VG) {
  const skip = b._level > a._level + 1 || b._parent !== a;
  const px = skip ? Math.max(a._x - a._w / 2 + 85, Math.min(a._x + a._w / 2 - 85, b._x)) : a._x;
  return { owner: a.id + (skip ? ':' + b.id : ''), px, py: a._y + a._h, cx: b._x, cy: b._y, midY: b._y - VG / 2 };
}

// Горизонтали разных родителей на одной высоте не сливаются — поднимаются на 8px
function ctHops(edges) {
  const segs = [];
  edges.forEach(e => {
    const x1 = Math.min(e.px, e.cx), x2 = Math.max(e.px, e.cx);
    const own = segs.find(s => s.owner === e.owner && s.base === e.midY);
    if (own) { e.midY = own.y; return; }
    const base = e.midY;
    while (segs.some(s => s.owner !== e.owner && Math.abs(s.y - e.midY) < 1 && s.x1 < x2 && s.x2 > x1)) e.midY -= 8;
    segs.push({ owner: e.owner, base, y: e.midY, x1, x2 });
  });
  return edges;
}

function ctPathD({ px, py, cx, cy, midY }) {
  const dx = cx - px;
  const r = Math.max(0, Math.min(10, Math.abs(dx) / 2, (midY - py) / 2, (cy - midY) / 2));
  const s = dx >= 0 ? 1 : -1;
  return `M ${px} ${py} L ${px} ${midY - r} Q ${px} ${midY} ${px + s * r} ${midY} `
       + `L ${cx - s * r} ${midY} Q ${cx} ${midY} ${cx} ${midY + r} L ${cx} ${cy}`;
}

/* ---------- Экран: открыть «Структуру» в экране дерева ---------- */
function openCustomStructure() {
  const cs = CUSTOM_STRUCTURE;
  goTo('tree', 'holding', 'custom', cs.title);
  document.getElementById('view-tree').classList.add('is-custom');   // без юрлиц, отделов, поиска, «развернуть все»
  document.getElementById('tv-title').textContent = cs.title;
  const desc = document.getElementById('tv-desc');
  desc.textContent = cs.description || '';
  desc.style.display = cs.description ? '' : 'none';
  document.getElementById('btn-block-more').style.display = 'none';
  document.getElementById('btn-print-open').style.display = '';
  canvas = { scale: 1, x: 0, y: 0 };
  buildCustomTree();
  centerView(true);
  setupCanvas();
}

function buildCustomTree() {
  const inner = document.getElementById('canvas-inner');
  const svg = document.getElementById('tree-svg');
  inner.innerHTML = '';
  inner.appendChild(svg);
  svg.innerHTML = '';

  const els = new Map();
  const mk = (n) => {
    n._kids = n.children || [];
    const r = csResolve(n);
    let el;
    if (n.type === 'set') {
      el = makeMultiDeptV2El({ id: n.id, name: n.name, role: '', noPhoto: true },
        (n.items || []).map(it => ({ person: (it.people || [])[0] || { name: 'ФИО', role: '' }, deptName: it.name })));
    } else {
      el = makeMultiHeadV2El(r.people, r.label || null);
    }
    const node = document.createElement('div');
    node.className = 'tree-node';
    node.appendChild(el);
    inner.appendChild(node);
    els.set(n.id, node);
    n._kids.forEach(mk);
  };
  mk(CUSTOM_STRUCTURE.root);

  const lay = ctLayout([CUSTOM_STRUCTURE.root], n => ({ w: els.get(n.id).offsetWidth, h: els.get(n.id).offsetHeight }));
  lay.nodes.forEach(n => {
    const node = els.get(n.id);
    node.style.left = (n._x - n._w / 2) + 'px';
    node.style.top = n._y + 'px';
  });
  ctHops(lay.edges).forEach(e => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('stroke', 'var(--canvas-line)');
    el.setAttribute('stroke-width', '1.5');
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('d', ctPathD(e));
    svg.appendChild(el);
  });
  svg.setAttribute('width', lay.width);
  svg.setAttribute('height', lay.height);
  inner.style.width = lay.width + 'px';
  inner.style.height = lay.height + 'px';
  applyTransform();
}
