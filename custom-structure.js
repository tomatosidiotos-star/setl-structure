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
            { id: 'cs-build', name: 'Группа строительных компаний', people: [vlash(), erem()], children: [
              { id: 'cs-arch', name: 'Архитектурное бюро', people: [P('Сугак П.Н.', 'Сугак П.Н.', 'Руководитель творческой мастерской')] },
              { id: 'cs-kal', name: 'Калининград', people: [FIO(), FIO()] },   // имена уточнить
              { id: 'cs-sgm', name: 'Группа компаний Сэтл М', people: [
                P('Астахов А.И.', 'Астахов А.И.', 'Руководитель проекта'),
                P('Малахов А.В.', 'Малахов А.В.', 'Технический директор')] },
              { id: 'cs-re', name: 'Управление недвижимостью', people: [krem()] },
            ] },
            // Наборная карточка, как операционный блок. У Дашко подразделения нет — карточка без плашки
            { id: 'cs-sg', type: 'set', name: 'Группа компаний Сэтл Групп', items: [
              { name: '', people: [P('Дашко И.В.', 'Дашко И.В.',
                'Помощник генерального директора по взаимодействию с исполнительными органами власти')] },
              { name: 'Департамент инновационного развития', people: [P('Шубарев Д.М.', 'Шубарев Д.М.', 'Директор департамента')] },
              { name: 'Отдел развития', people: [P('Кузина Н.С.', 'Кузина Н.С.', 'Руководитель проекта')] },
            ] },
            // Операционный блок подчиняется и исполнительному директору, и совету
            { id: 'cs-ops', type: 'set', name: 'Операционный блок', alsoFrom: ['cs-board'], items: [
              { name: 'HR', people: [P('Ермакова М.В.', 'Ермакова М.В.', 'Директор Департамента персонала и организационного развития')] },
              { name: 'Юристы', people: [
                P('Патраков А.В.', 'Патраков А.В.', 'Директор юридического департамента'),
                P('Малюченко М.П.', 'Малюченко М.П.', 'Директор правового департамента')] },
              { name: 'Безопасность', people: [
                P('Рыков Д.И.', 'Рыков Д.И.', 'Директор департамента внутреннего контроля'),
                P('Гурьянов А.О.', 'Гурьянов А.О.', 'Технический директор')] },
              { name: 'Финансы', people: [
                P('Солина О.В.', 'Солина О.В.', 'Директор финансово-экономического департамента'),
                P('Климантова И.В.', 'Климантова И.В.', 'Главный бухгалтер'),
                P('Гуменник П.А.', 'Гуменник П.А.', 'Заместитель генерального директора по экономике и финансам'),
                P('Складчикова Н.В.', 'Складчикова Н.В.', 'Начальник отдела внутреннего контроля и управления задолженностью')] },
              { name: 'IT', people: [krem()] },
              { name: 'АХО', people: [P('Сметанина М.В.', 'Сметанина М.В.', 'Начальник административно-хозяйственного отдела')] },
              { name: 'PR', people: [P('Ярош И.В.', 'Ярош И.В.', 'Директор департамента по связям с общественностью')] },
            ] },
          ] },
        // Петербургская недвижимость — от совета, на уровне исполнительного директора
        { id: 'cs-pn', name: 'Петербургская недвижимость',
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

// Линия: от центра низа родителя вниз, горизонталь, вниз к ребёнку. Обычно горизонталь — над рядом
// ребёнка. Если ребёнок не прямо под родителем (пропущен ряд, второй родитель) — горизонталь сразу
// под родителем, общая с его обычными линиями (от совета целиком, а не от одного человека),
// и дальше вниз к ребёнку — мимо карточек промежуточного ряда
function ctEdge(a, b, VG) {
  const skip = b._level > a._level + 1 || b._parent !== a;
  return { owner: a.id, child: b.id, px: a._x, py: a._y + a._h, cx: b._x, cy: b._y,
    midY: skip ? a._y + a._h + VG / 2 : b._y - VG / 2 };
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
  V2_FOLD = new Map();
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
    let fold = null;
    if (n.type === 'set') {
      // больше V2_FOLD_LIMIT внутренних карточек — видны первые, остальные по боковой кнопке (как у наборных в блоках)
      let items = n.items || [];
      if (items.length > V2_FOLD_LIMIT) {
        const key = 'inner:' + n.id;
        fold = { key, count: items.length - V2_FOLD_LIMIT, folded: v2IsFolded(key, items.length) };
        if (fold.folded) items = items.slice(0, V2_FOLD_LIMIT);
      }
      el = makeMultiDeptV2El({ id: n.id, name: n.name, role: '', noPhoto: true },
        items.map(it => ({ persons: it.people && it.people.length ? it.people : [{ name: 'ФИО', role: '' }], deptName: it.name })));
    } else {
      // размеры, как в блоках: исполнительный директор — высокая без отдела, группы — низкие
      const size = n.type === 'exec' ? 'tall' : n.type === 'board' ? undefined : 'short';
      el = makeMultiHeadV2El(r.people, r.label || null, null, false, size);
    }
    const node = document.createElement('div');
    node.className = 'tree-node';
    node.appendChild(el);
    if (el.matches('.card-v2-multi--short, .card-v2-multi--tall')) node.classList.add('tree-node--bottom');
    inner.appendChild(node);
    els.set(n.id, node);
    if (fold) { node.dataset.pid = n.id; v2AddInnerButton(node, fold); }
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
    e.cy += v2CardTopOffset(els.get(e.child));   // до верха низкой карточки
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const key = v2NodeKey(els.get(e.child));
    if (key) { el.dataset.key = key + '<' + e.owner; el.dataset.geom = JSON.stringify(e); }
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
