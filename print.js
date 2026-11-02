/* ====================================================================
   ПЕЧАТЬ СТРУКТУРЫ — предпросмотр и сохранение в PDF

   Вся структура на одном листе: руководители блока сверху, карточки
   2-го уровня в ряд, под каждой карточкой — дерево-список (кружки и линии,
   как «Место в структуре» в модалке). Длинный список переливается в соседние
   подколонки в любом месте — с пометкой «продолжение» у разрезанного отдела.
   Опция «Каждая ветка — на своём листе»: первый лист — общая схема,
   дальше по листу на каждую ветку, у каждого своя раскладка.
   Слева в предпросмотре: формат листа, глубина, выбор веток.
   Печать — системная (window.print), «Сохранить как PDF» в диалоге.

   ES-модуль, от страницы не зависит (стили — print.css):
     import { openPrintPreview } from './print.js';
     openPrintPreview(window.STRUCTURE_PRINT, { onClose });
   payload — данные component.php: { graph, head, title, description, logo, board? }.
   board — необязательно: совет директоров и исполнительный директор, уровни над руководителями
   блока (в «Ветках» есть всегда, по умолчанию сняты):
     { label: 'Совет директоров', members: [человек…], executive: человек }
   человек — как sup в graph: { guid, name, fullName, pos, photo, inits }; role — подпись
   вместо должности (например «Председатель совета директоров»).
   Без payload — демо-сайт: данные со страницы (ORG_DATA, state, CUSTOM_STRUCTURE).

   Данные сначала приводятся к одному виду:
   { uid, dept, person, persons, people, team, children } — раскладка
   от исходного формата не зависит.
==================================================================== */

const PP_FORMATS = {           // альбомная ориентация, мм; книжная — те же стороны наоборот
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
  A0: [1189, 841],
};
const PP_PX_PER_MM = 96 / 25.4;
const PP_TILE_MARGIN_MM  = 8;    // печать частями: поле листа, которое принтер не пропечатывает
const PP_TILE_OVERLAP_MM = 10;   // нахлёст соседних кусков — полоса для склейки
const PP_TILE_PAD_MM     = 8;    // отступ содержимого от края склеенного листа

// Размер листа в мм с учётом ориентации
function ppDims(format) {
  const [w, h] = PP_FORMATS[format];
  return pp && pp.orient === 'portrait' ? [h, w] : [w, h];
}
const PP_MARGIN_MM = 10;       // поля листа

/* Шапка листа — фиксированного размера по формату, не масштабируется вместе со структурой:
   у разных блоков на одном формате она одинаковая. Размеры заданы для A4, каждый следующий
   формат крупнее в √2 раза — как сами листы */
const PP_HEAD_SCALE = { A4: 1, A3: Math.SQRT2, A2: 2, A1: 2 * Math.SQRT2, A0: 4 };
const PP_HEAD_MM = 20;         // высота шапки на вертикальном A4 вместе с отступом до структуры (12 + 8)
const PP_TOP_MM  = 6;          // поле над шапкой — меньше обычного поля, чтобы шапка не «опускалась»
// Шапка — по высоте листа: горизонтальный лист ниже, и на нём шапка на ступень меньше
// (горизонтальный A3 = как вертикальный A4), иначе она выглядит огромной
function ppHeadK(format) { return (PP_HEAD_SCALE[format] || 1) / (pp && pp.orient === 'landscape' ? Math.SQRT2 : 1); }
function ppHeadMM(format) { return PP_HEAD_MM * ppHeadK(format); }

/* Лист, на который раскладывается структура. Целым листом — сам формат с полями.
   Частями — ровная сетка кусков, на которую формат делится по стандарту (A1 = 2×4 A4 = 2×2 A3):
   лист = склеенная площадь кусков за вычетом полей принтера и нахлёста, изображение чуть меньше,
   зато сетка делит его ровно */
function ppSheetMM(format) {
  const [w, h] = ppDims(format);
  const t = ppTileGrid(w, h);
  if (!t) return { w, h, pad: PP_MARGIN_MM, tiles: null };
  return { w: t.cols * t.vw - (t.cols - 1) * PP_TILE_OVERLAP_MM,
           h: t.rows * t.vh - (t.rows - 1) * PP_TILE_OVERLAP_MM, pad: PP_TILE_PAD_MM, tiles: t };
}

function ppTileGrid(w, h) {
  if (!pp || pp.tile === 'off') return null;
  const [a, b] = PP_FORMATS[pp.tile];
  const grid = (pw, ph) => {
    const cols = Math.max(1, Math.round(w / pw)), rows = Math.max(1, Math.round(h / ph));
    const vw = pw - PP_TILE_MARGIN_MM * 2, vh = ph - PP_TILE_MARGIN_MM * 2;
    return { pw, ph, cols, rows, n: cols * rows, vw, vh,
      sx: vw - PP_TILE_OVERLAP_MM, sy: vh - PP_TILE_OVERLAP_MM,
      err: Math.abs(cols * pw - w) + Math.abs(rows * ph - h) };
  };
  const g1 = grid(a, b), g2 = grid(b, a);
  const best = g2.err < g1.err ? g2 : g1;
  return best.n > 1 ? best : null;   // формат и так помещается на один кусок — частями не нужно
}
const PP_BASE_FONT = 12;       // кегль пунктов списка в «натуральном» размере, px
const PP_MIN_PT    = 6;        // мельче — предупреждаем
const PP_GOOD_PT   = 7;        // «Подобрать формат» ищет первый формат не мельче этого
const PP_MAX_SCALE = 2.5;
const PP_COL_W     = 220;      // ширина колонки (карточка 2-го уровня), px
const PP_COL_GAP   = 20;       // между колонками — должно совпадать с .pp-cols gap в print.css
const PP_SPLIT_GAP = 16;       // между подколонками длинной колонки
const PP_ROW_GAP   = 32;       // между рядами карточек — как .pp-cols + .pp-cols в print.css
const PP_CORRIDOR  = 40;       // проход для ствола в центре ряда — как .pp-corridor
const PP_MAX_ROWS  = 4;
const PP_MAX_SPLIT = 16;       // подколонок у одной колонки — не больше
const PP_CONT_H    = 20;       // высота строки «… продолжение» над началом подколонки, px
const PP_SHEET_GAP = 32;       // между листами в предпросмотре (на экране), px

let pp = null;   // состояние открытого предпросмотра

/* ---------- Помощники: свои, модуль не зависит от страницы ---------- */

function ppEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Инициалы: из данных (inits), иначе — первые буквы двух слов ФИО
function ppInitials(p) {
  if (p.inits) return p.inits.toUpperCase();
  const parts = (p.fullName || p.name || '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

const PP_AVATAR_COLORS = ['#F2D9D4', '#D4EAE2', '#D4DEF0', '#E0D8F0', '#F0E8D4', '#D0E8E4', '#EDD8E8', '#E0EAD0'];
function ppAvatarColor(name) {
  const key = (name || '').toLowerCase().replace(/[\s\n]+/g, '');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = key.charCodeAt(i) + ((h << 5) - h);
  return PP_AVATAR_COLORS[Math.abs(h) % PP_AVATAR_COLORS.length];
}

// Поле поиска: с введённым текстом лупа меняется на крестик сброса
function ppSearchClear(wrap) {
  const input = wrap.querySelector('.search-input');
  const btn = wrap.querySelector('.search-clear');
  const sync = () => wrap.classList.toggle('has-value', !!input.value);
  input.addEventListener('input', sync);
  btn.addEventListener('mousedown', e => e.preventDefault());   // не отнимать фокус у поля
  btn.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
  sync();
}

const ppClean = s => String(s || '').replace(/\s*\n\s*/g, ' ').trim();

/* ---------- Данные с прода (component.php → window.STRUCTURE_PRINT) ----------
   graph.nodes — контейнеры, в каждом members — подразделения (контейнер из нескольких —
   «рядом», TWO_NEARBY_GROUP); graph.edges — связи родитель → ребёнок между подразделениями.
   head — сама группа: sup — её руководители, tree — порядок подразделений (ORDER_IN_GROUP).
   Узел-должность (isAPosition, «Заместитель генерального директора») печатается такой же
   карточкой: человек + серая плашка с названием узла */
function ppFromPayload(P) {
  const lc = s => String(s ?? '').toLowerCase();   // GUID в разных таблицах — в разном регистре
  const person = (u, role) => u ? {
    id: lc(u.guid) || ppClean(u.fullName || u.name),
    name: ppClean(u.name || u.shortName || u.fullName),
    fullName: ppClean(u.fullName || u.name),
    role: ppClean(role != null ? role : (u.pos || u.position)),
    photo: u.displayPhoto === false ? null : (u.photo || null),
    inits: u.inits || '',
  } : null;

  const members = new Map();
  ((P.graph && P.graph.nodes) || []).forEach(c => (c.members || []).forEach(m => members.set(lc(m.id), m)));
  const parentOf = new Map(), kidsOf = new Map();
  ((P.graph && P.graph.edges) || []).forEach(e => {
    const s = lc(e.source), t = lc(e.target);
    if (!members.has(s) || !members.has(t) || parentOf.has(t) || s === t) return;
    parentOf.set(t, s);
    if (!kidsOf.has(s)) kidsOf.set(s, []);
    kidsOf.get(s).push(t);
  });
  // порядок — как в head.tree (там ORDER_IN_GROUP); чего там нет — в порядке связей, в конце
  const order = new Map();
  (function walk(list) { (list || []).forEach(t => { order.set(lc(t.id), order.size); walk(t.children); }); })(P.head && P.head.tree);
  const ord = id => order.has(id) ? order.get(id) : 1e9;
  kidsOf.forEach(list => list.sort((a, b) => ord(a) - ord(b)));

  const seen = new Set();   // защита от петель в связях
  function node(id) {
    seen.add(id);
    const m = members.get(id);
    const heads = [];
    [m.sup, m.subSup].forEach(u => { const p = person(u); if (p && !heads.some(h => h.id === p.id)) heads.push(p); });
    const ids = new Set(heads.map(h => h.id));
    // команда отдела: помощники и заместители из участников, потом сотрудники; без повторов
    const team = [];
    const add = p => { if (p && !ids.has(p.id)) { ids.add(p.id); team.push(p); } };
    (m.participants || []).filter(x => x.role !== 'Руководитель').forEach(x => add(person(x)));
    (m.team || []).forEach(x => add(person(x)));
    const dept = ppClean(m.label);
    // Узел-должность: в базе название — сама должность, у нескольких одинаковое («Заместитель
    // генерального директора»). В «Ветках» — с ФИО, как исполнительный директор, иначе не найти
    const treeLabel = m.isAPosition && heads[0] && dept
      ? `${heads[0].fullName} — ${dept[0].toLowerCase()}${dept.slice(1)}` : null;
    return {
      uid: 'd-' + id, dept, treeLabel, person: heads[0] || null, persons: heads.slice(1),
      people: team.map(p => p.id), team, position: !!m.isAPosition,
      children: (kidsOf.get(id) || []).filter(k => !seen.has(k)).map(node),
    };
  }

  const roots = [...members.keys()].filter(id => !parentOf.has(id)).sort((a, b) => ord(a) - ord(b));
  // Как в component.php: у группы один ребёнок («Управление») — его дети идут верхним уровнем,
  // а его руководители — руководители блока (head.sup)
  let cards;
  if (roots.length === 1 && kidsOf.has(roots[0])) cards = node(roots[0]).children;
  else cards = roots.map(node);
  const heads = ((P.head && P.head.sup) || []).map(u => person(u)).filter(Boolean);
  // Совет директоров — если пришёл в данных (role — подпись в совете, иначе должность)
  const B = P.board;
  const boardMembers = B ? (B.members || []).map(u => person(u, u.role)).filter(Boolean) : [];
  const board = boardMembers.length ? { label: B.label || 'Совет директоров', members: boardMembers,
    executive: B.executive ? person(B.executive, B.executive.role) : null } : null;
  return { heads, board, cards };
}

/* ---------- Демо-сайт: данные со страницы (ORG_DATA, state) ----------
   На проде не используется — там данные приходят в openPrintPreview(payload) */

function ppNormalize(treeData, rootTreeId) {
  let uid = 0;
  const visitedTrees = new Set([rootTreeId]);
  const person = p => p && !p.vacant ? {   // отдел без руководителя (vacant) — без человека
    id: p.id, name: ppClean(p.name), fullName: ppClean(p.fullName || p.name),
    role: (p.role || '').replace(/\s*\n\s*/g, ' ').replace(/ \/ ?$/, '').trim(), photo: p.photo || null,
  } : null;
  const modalPeople = m => m ? [...(m.managers || []), ...(m.deputies || []), ...(m.assistants || []), ...(m.team || [])]
    .map(x => x.id || x.fullName || x.name) : [];

  const team = m => ((m && m.team) || []).map(person);

  function node(dept, p, extraPeople, teamList) {
    return { uid: 'n' + (++uid), dept: ppClean(dept), person: person(p), persons: [], people: extraPeople || [],
      team: teamList || [], children: [] };
  }

  // Карточка человека: с отделом / над несколькими отделами (nested) / с дочерним блоком
  function fromPerson(p) {
    const n = node(p.dept && p.dept.name, p, modalPeople(p.dept && p.dept.modal), team(p.dept && p.dept.modal));
    (p.nested || []).forEach(x => n.children.push(fromPerson(x)));
    if (p.dept) n.children.push(...fromDeptExtras(p.dept));
    (p.children || []).forEach(c => n.children.push(fromPerson(c)));
    if (p.childBlock) n.children.push(fromChildBlock(p.childBlock));
    return n;
  }

  function fromChildBlock(cb) {
    const n = node('', cb.head);
    (cb.depts || []).forEach(d => n.children.push(fromPerson({
      ...d.person, dept: { name: d.deptName, id: d.deptId, modal: d.deptModal }, children: d.children,
    })));
    return n;
  }

  // Подотделы из модалки и содержимое связанного дерева (отдел-ссылка «ведёт дальше»)
  function fromDeptExtras(dept) {
    const out = [];
    ((dept.modal && dept.modal.subdepts) || []).forEach(s => out.push(node(s.name,
      s.managerName ? { id: s.id + '-m', name: s.managerName, fullName: s.managerName, role: s.managerRole } : null,
      modalPeople(s.modal), team(s.modal))));
    if (dept.treeId && !visitedTrees.has(dept.treeId)) {
      visitedTrees.add(dept.treeId);
      out.push(...treeChildren(ORG_DATA.trees[dept.treeId]));
    }
    return out;
  }

  function treeChildren(t) {
    if (!t) return [];
    const out = [];
    (t.headsDepts || []).forEach(d => {
      if (d.treeId && visitedTrees.has(d.treeId)) return;   // ссылка назад — уже есть в печати
      out.push(fromPerson({ ...d.person, dept: { name: d.deptName, id: d.deptId, treeId: d.treeId } }));
    });
    (t.persons || []).forEach(p => out.push(fromPerson(p)));
    return out;
  }

  return {
    heads: (treeData.heads || []).map(person),   // у руководителей блока команды нет — node() не нужен
    board: ppBoardData(),
    cards: treeChildren(treeData),
  };
}

// Совет директоров и исполнительный директор — из ORG_DATA.board (тот же состав, что на главной)
function ppBoardData() {
  const b = typeof ORG_DATA !== 'undefined' && ORG_DATA.board;
  if (!b || !b.members || !b.members.length) return null;
  const full = p => (p.displayName || p.fullName || p.name || '').replace(/\s*\n\s*/g, ' ').trim();
  const short = f => { const [s, n, m] = f.split(' '); return s + (n ? ` ${n[0]}.` : '') + (m ? `${m[0]}.` : ''); };
  const pers = p => ({ id: p.id, fullName: full(p), name: p.displayName ? short(full(p)) : (p.name || short(full(p))),
    role: (p.role || '').replace(/\s*\n\s*/g, ' '), photo: p.photo || null });
  return { label: b.label || 'Совет директоров', members: b.members.map(pers), executive: b.executive ? pers(b.executive) : null };
}

/* Одна иерархия для «Веток» с вложенностью: совет директоров → исполнительный директор →
   руководители блока → департаменты → отделы. Верхние звенья — узлы-цепочка (kind): их галочка
   убирает только саму карточку-уровень, всё ниже остаётся (сняли совет — лист начинается ниже).
   Департаменты и ниже — ветки: галочка каскадом */
function ppBuildChain(data) {
  const chain = [], B = data.board, heads = data.heads;
  if (B) chain.push({ uid: 'top-board', kind: 'board', label: B.label, members: B.members,
    treeLabel: B.label, people: [], team: [], children: [] });
  if (B && B.executive) chain.push({ uid: 'top-exec', kind: 'exec', person: B.executive,
    treeLabel: `${B.executive.fullName} — ${B.executive.role.toLowerCase()}`, people: [], team: [], children: [] });
  if (heads.length) chain.push({ uid: 'top-heads', kind: 'heads', heads,
    treeLabel: 'Руководители блока: ' + heads.map(h => h.name).join(', '), people: [], team: [], children: [] });
  chain.forEach((n, i) => { n.children = i < chain.length - 1 ? [chain[i + 1]] : data.cards; });
  data.chain = chain;
  data.roots = chain.length ? [chain[0]] : data.cards;
}

// По умолчанию — как раньше: руководители блока и структура, совет и исполнительный директор сняты;
// звенья цепочки раскрыты в «Ветках»
function ppInitTop() {
  pp.data.chain.forEach(n => { pp.open.add(n.uid); if (n.kind !== 'heads') pp.excluded.add(n.uid); });
  if (pp.data.custom) ppAllNodes().forEach(n => pp.open.add(n.uid));   // «Структура» небольшая — «Ветки» раскрыты целиком
}

// Что печатать: отмеченные уровни-звенья над колонками и отмеченные карточки 2-го уровня
function ppTop() {
  const ex = id => pp.excluded.has(id);
  const levels = pp.data.chain.filter(n => !ex(n.uid)).map(n =>
    n.kind === 'board' ? { kind: 'board', people: n.members, label: n.label }
    : n.kind === 'exec' ? { kind: 'exec', people: [n.person] } : { kind: 'heads', people: n.heads });
  return { levels, cols: ppVisibleKids(pp.data.cards) };   // верхние из отмеченных: группа без дирекции — сама колонка
}

/* Листы. Обычно один — вся структура. «Каждая ветка — на своём листе»: первый лист — общая схема
   (руководители, карточки и первый уровень списков, без сотрудников), дальше по листу на каждую отмеченную карточку 2-го уровня:
   сверху её карточка, её подразделения — колонками со своими списками */
function ppSheets() {
  const { levels, cols } = ppTop();
  const main = { title: pp.title, levels, cols, base: 3 };
  let sheets = [main];
  if (pp.perBranch && !pp.data.custom && cols.length) {
    sheets = [...(cols.length > 1 ? [{ ...main, overview: true }] : []), ...cols.map(c => ({   // одна ветка — общая схема не нужна
      title: pp.title, sub: c.dept || (c.person ? c.person.fullName : ''),
      levels: [{ kind: 'node', node: c }],
      cols: pp.depth >= 3 ? ppVisibleKids(c.children) : [], base: 4,
    }))];
  }
  sheets.forEach(s => { s.flows = s.cols.map(c => ppFlow(c, s.base, s.overview)); });
  return sheets;
}

/* ---------- «Структура» (custom-structure.js, демо): та же раскладка, что на экране ----------
   Узлы печати — по узлам CUSTOM_STRUCTURE; «Ветки» — каскадом, снятый узел пропускается,
   отмеченное под ним поднимается (ppVisibleKids). Совет — плашкой и карточками, как в основной печати */
function ppCustomData() {
  const map = n => {
    const r = csResolve(n);
    const label = n.type === 'board' ? r.label
      : n.type === 'exec' ? (r.people[0] ? `${r.people[0].fullName} — исполнительный директор` : 'Исполнительный директор') : r.label;
    const items = csItems(n);   // группы — как наборные карточки, как на экране
    return { uid: 'c-' + n.id, src: n, type: items ? 'set' : n.type, treeLabel: label, dept: r.label, person: null,
      persons: r.people.map(p => ({ ...p, fullName: p.fullName || p.name, name: p.name || p.fullName })),
      items: items || [], people: [], team: [], children: (n.children || []).map(map) };
  };
  const root = map(CUSTOM_STRUCTURE.root);
  return { custom: true, heads: [], board: null, cards: [], chain: [], roots: [root] };
}

function ppCustomCard(n) {
  const person = p => ppCardHTML({ person: p }, 'pp-card--head');
  if (n.type === 'board') return `<div class="pp-lvl-wrap"><div class="pp-lvl__label">${ppEsc(n.dept)}</div>`
    + `<div class="pp-lvl">${n.persons.map(person).join('')}</div></div>`;
  if (n.type === 'set') return `<div class="pp-card pp-card--set"><div class="pp-card__name pp-card__name--block">${ppEsc(n.dept)}</div>`
    + n.items.map(it => {
      const names = (it.people || []).map(p => ppPersonName({ fullName: p.fullName || p.name, name: p.name || p.fullName }));
      return it.name   // без подразделения — человек и его должность вместо названия
        ? `<div class="pp-card__dept">${ppEsc(it.name)}${names.map(nm => `<div class="pp-card__role">${ppEsc(nm)}</div>`).join('')}</div>`
        : `<div class="pp-card__dept">${(it.people || []).map((p, i) => `${ppEsc(names[i])}<div class="pp-card__role">${ppEsc(p.role || '')}</div>`).join('')}</div>`;
    }).join('') + `</div>`;
  return `<div class="pp-card pp-card--group">${n.persons.map(ppPersonHTML).join('')}
    ${n.type !== 'exec' && n.dept ? `<div class="pp-card__dept">${ppEsc(n.dept)}</div>` : ''}</div>`;
}

function ppCustomHTML() {
  // узлы раскладки: только отмеченные; снятый — пропускается, его отмеченные дети поднимаются
  const wrap = n => ({ id: n.uid, row: n.src.row, alsoFrom: (n.src.alsoFrom || []).map(id => 'c-' + id), node: n,
    _kids: ppVisibleKids(n.children).map(wrap) });
  const roots = ppVisibleKids(pp.data.roots).map(wrap);
  if (!roots.length) return '<div class="pp-custom"></div>';
  const all = [];
  (function collect(list) { list.forEach(w => { all.push(w); collect(w._kids); }); })(roots);
  // размеры карточек — в невидимом замере
  const probe = ppProbe(all.map(w => `<div class="pp-custom__probe" data-id="${w.id}">${ppCustomCard(w.node)}</div>`).join(''));
  const size = new Map([...probe.querySelectorAll('.pp-custom__probe')].map(el => [el.dataset.id, { w: el.offsetWidth, h: el.offsetHeight }]));
  probe.remove();
  const lay = ctLayout(roots, w => size.get(w.id), { hg: 32, vg: 56, pad: 0 });
  const paths = ctHops(lay.edges).map(e => `<path d="${ctPathD(e)}"/>`).join('');
  return `<div class="pp-custom" style="width:${lay.width}px;height:${lay.height}px">
    <svg class="pp-custom__lines" width="${lay.width}" height="${lay.height}">${paths}</svg>
    ${lay.nodes.map(w => `<div class="pp-custom__node" style="left:${w._x - w._w / 2}px;top:${w._y}px">${ppCustomCard(w.node)}</div>`).join('')}
  </div>`;
}

/* ---------- Подсчёты ---------- */

function ppPlural(n, forms) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}

function ppStats(n) {
  let depts = 0;
  const people = new Set();
  (function walk(x, isRoot) {
    if (!isRoot && x.dept) depts++;
    [x.person, ...(x.persons || [])].forEach(p => { if (p) people.add(p.id || p.fullName); });
    x.people.forEach(id => people.add(id));
    x.children.forEach(c => walk(c, false));
  })(n, true);
  return { depts, people: people.size };
}

function ppStatsText(s) {
  const parts = [];
  if (s.depts) parts.push(`${s.depts} ${ppPlural(s.depts, ['подразделение', 'подразделения', 'подразделений'])}`);
  if (s.people) parts.push(`${s.people} ${ppPlural(s.people, ['человек', 'человека', 'человек'])}`);
  return parts.join(' · ');
}

/* ---------- Открыть / закрыть ---------- */

// Настройки по умолчанию — при открытии и по кнопке «Сбросить»
function ppDefaults() {
  return {
    format: 'A3',         // при открытии и сбросе заменяется подходящим (ppAutoFormat)
    orient: 'landscape',  // 'landscape' — горизонтально (по умолчанию) | 'portrait' — вертикально
    depth: Infinity,      // уровней: 1 — руководители, 2 — карточки, 3+ — списки
    fullNames: true,
    photos: true,
    team: false,          // сотрудники отделов
    balance: true,        // авто-раскладка: переносить карточки в ряды, делить длинные колонки
    perBranch: false,     // каждая ветка — на своём листе
    excluded: new Set(),  // uid скрытых веток
    open: new Set(),      // раскрытые пункты в дереве выбора
    query: '',            // поиск по веткам
    zoom: null,           // масштаб просмотра листа; null — «лист целиком»
    tile: 'off',          // печать частями: 'off' — целым листом | 'A4' | 'A3'
  };
}

function ppReset() {
  Object.assign(pp, ppDefaults());
  ppInitTop();
  pp.format = ppAutoFormat() || 'A1';
  document.getElementById('pp-fullnames').checked = pp.fullNames;
  document.getElementById('pp-photos').checked = pp.photos;
  document.getElementById('pp-team').checked = pp.team;
  document.getElementById('pp-balance').checked = pp.balance;
  document.getElementById('pp-branch').checked = pp.perBranch;
  const search = document.getElementById('pp-search');
  search.value = '';
  search.dispatchEvent(new Event('input'));
  ppRenderTree();
  ppRender();
}

// Демо-сайт: что открыто на странице — блок из ORG_DATA или «Структура»
function ppDemoSource() {
  const custom = state.blockId === 'custom' && typeof CUSTOM_STRUCTURE !== 'undefined';
  if (custom) return { data: ppCustomData(), title: CUSTOM_STRUCTURE.title, logo: 'Логотипы/SetlGroup-logo.svg' };
  const treeData = ORG_DATA.trees && ORG_DATA.trees[state.blockId];
  if (!treeData || treeData.version !== 2) return null;
  const company = (ORG_DATA.companies || []).find(c => c.id === state.companyId);
  return { data: ppNormalize(treeData, state.blockId), title: treeData.blockName || state.blockName || '',
    logo: company ? company.logo : null };
}

/* Открыть предпросмотр.
   payload — данные страницы печати (window.STRUCTURE_PRINT): { graph, head, title, logo };
   без него — демо-сайт, данные со страницы. opts.onClose — после закрытия */
export function openPrintPreview(payload, opts = {}) {
  if (pp) closePrintPreview();
  const src = payload && payload.graph
    ? { data: ppFromPayload(payload), title: payload.title || (payload.head && payload.head.label) || '', logo: payload.logo || null }
    : ppDemoSource();
  if (!src) return;
  if (!src.data.custom) ppBuildChain(src.data);   // у «Структуры» иерархия уже своя
  pp = { data: src.data, title: src.title, logo: src.logo, onClose: opts.onClose || null, ...ppDefaults() };
  ppInitTop();

  const root = document.createElement('div');
  root.id = 'pp';
  root.innerHTML = `
    <aside class="pp-panel">
      <div class="pp-panel__head">
        <div class="pp-panel__title">Печать структуры</div>
        <button class="pp-reset" id="pp-reset" title="Вернуть все настройки по умолчанию">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10.0005 1.88135C14.4843 1.88157 18.1196 5.5166 18.1196 10.0005C18.1194 14.4842 14.4842 18.1194 10.0005 18.1196C5.5166 18.1196 1.88157 14.4843 1.88135 10.0005C1.88135 9.72435 2.10521 9.50049 2.38135 9.50049C2.65734 9.50066 2.88135 9.72445 2.88135 10.0005C2.88157 13.932 6.06889 17.1196 10.0005 17.1196C13.9319 17.1194 17.1194 13.9319 17.1196 10.0005C17.1196 6.06889 13.932 2.88157 10.0005 2.88135C7.68929 2.88135 5.63552 3.98301 4.33447 5.69092H7.14307C7.41914 5.69099 7.64307 5.91482 7.64307 6.19092C7.64287 6.46684 7.41902 6.69084 7.14307 6.69092H3.3335C3.0575 6.69089 2.8337 6.46687 2.8335 6.19092V2.38135C2.8335 2.10522 3.05737 1.88137 3.3335 1.88135C3.60957 1.88142 3.8335 2.10525 3.8335 2.38135V4.72021C5.32207 2.98319 7.53232 1.88135 10.0005 1.88135Z" fill="currentColor"/></svg>
          Сбросить
        </button>
      </div>
      <div class="pp-panel__body scroll-xs">
        <div class="pp-group">
          <div class="pp-gtitle">Формат листа</div>
          <div class="pp-seg pp-seg--orient" id="pp-orient">
            <button data-v="landscape">Горизонтально</button><button data-v="portrait">Вертикально</button>
          </div>
          <div class="pp-seg" id="pp-format">
            ${Object.keys(PP_FORMATS).map(f => `<button data-v="${f}">${f}</button>`).join('')}
          </div>
          <div class="pp-fit" id="pp-fit"></div>
        </div>
        <div class="pp-group">
          <div class="pp-gtitle">Как печатать</div>
          <div class="pp-seg" id="pp-tile">
            <button data-v="off">Целым листом</button><button data-v="A4">Частями A4</button><button data-v="A3">Частями A3</button>
          </div>
          <div class="pp-hint pp-hint--block" id="pp-tile-info"></div>
          <label class="pp-check pp-check--top"${pp.data.custom ? ' hidden' : ''}><input type="checkbox" id="pp-branch"> Каждая ветка — на своём листе</label>
          <div class="pp-hint pp-hint--block" id="pp-branch-info"${pp.data.custom ? ' hidden' : ''}></div>
        </div>
        <div class="pp-group">
          <div class="pp-gtitle">Уровни</div>
          <div class="pp-seg" id="pp-depth">
            <button data-v="2">2</button><button data-v="3">3</button><button data-v="4">4</button>
            <button data-v="5">5</button><button data-v="all">Все</button>
          </div>
          <div class="pp-hint pp-hint--block">1 — верх листа, 2 — карточки, дальше — уровни списков</div>
        </div>
        <div class="pp-group">
          <label class="pp-check"><input type="checkbox" id="pp-fullnames" checked> ФИО полностью</label>
          <label class="pp-check"><input type="checkbox" id="pp-photos" checked> Фото в карточках</label>
          <label class="pp-check"><input type="checkbox" id="pp-team"> Сотрудники отделов</label>
          <label class="pp-check"><input type="checkbox" id="pp-balance" checked> Авто-раскладка <span class="pp-hint">ряды и подколонки</span></label>
        </div>
        <div class="pp-group pp-group--grow">
          <div class="pp-gtitle">Ветки
            <span class="pp-links"><button id="pp-all">все</button> · <button id="pp-none">ни одной</button></span>
          </div>
          <div class="search-wrap">
            <input type="text" class="search-input" id="pp-search" placeholder="Подразделение или ФИО" autocomplete="off">
            <!-- иконки — Stroke/search 02 и Stroke/close из setl-akademiya-ui-kit -->
            <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18.5 18.5L22 22M21 11.5C21 6.25329 16.7467 2 11.5 2C6.25329 2 2 6.25329 2 11.5C2 16.7467 6.25329 21 11.5 21C16.7467 21 21 16.7467 21 11.5Z" stroke="currentColor" vector-effect="non-scaling-stroke" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <button type="button" class="search-clear" aria-label="Очистить поиск" title="Очистить"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 3L3 21M21 21L3 3" stroke="currentColor" vector-effect="non-scaling-stroke" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </div>
          <div class="pp-tree" id="pp-tree"></div>
        </div>
      </div>
      <div class="pp-panel__foot">
        <button class="pp-btn-primary" id="pp-print">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M4 6V1.5h8V6"/><rect x="1.5" y="6" width="13" height="6" rx="1.5"/><path d="M4 10h8v4.5H4z" fill="#fff"/></svg>
          Сохранить PDF / Печать
        </button>
        <div class="pp-hint pp-hint--block">В окне печати выберите «Сохранить как PDF». Формат и ориентация уже заданы.</div>
      </div>
    </aside>
    <main class="pp-stage" id="pp-stage">
      <div class="pp-viewbar">
        <div class="pp-viewbar__left">
          <div class="pp-seg" id="pp-view">
            <button data-v="fit">Лист целиком</button><button data-v="actual">Реальный размер</button>
          </div>
          <div class="zoom-group">
            <button class="zoom-btn" id="pp-zoom-out" title="Отдалить">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M15.0005 9.50024C15.2765 9.50042 15.5005 9.72421 15.5005 10.0002C15.5003 10.2761 15.2764 10.5001 15.0005 10.5002H5.00049C4.72445 10.5002 4.50066 10.2762 4.50049 10.0002C4.50049 9.7241 4.72435 9.50024 5.00049 9.50024H15.0005Z" fill="#E2221C"/></svg>
            </button>
            <input type="range" class="zoom-slider" id="pp-zoom-slider" min="0" max="100" value="0">
            <button class="zoom-btn" id="pp-zoom-in" title="Приблизить">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10.0005 4.50024C10.2765 4.50042 10.5005 4.72421 10.5005 5.00024V9.50024H15.0005C15.2765 9.50042 15.5005 9.72421 15.5005 10.0002C15.5003 10.2761 15.2764 10.5001 15.0005 10.5002H10.5005V15.0002C10.5003 15.2761 10.2764 15.5001 10.0005 15.5002C9.72445 15.5002 9.50066 15.2762 9.50049 15.0002V10.5002H5.00049C4.72445 10.5002 4.50066 10.2762 4.50049 10.0002C4.50049 9.7241 4.72435 9.50024 5.00049 9.50024H9.50049V5.00024C9.50049 4.7241 9.72435 4.50024 10.0005 4.50024Z" fill="#E2221C"/></svg>
            </button>
          </div>
        </div>
        <button class="vm-close" id="pp-close" title="Закрыть">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.64645 5.64645C5.84171 5.45118 6.15829 5.45118 6.35355 5.64645L12 11.2929L17.6464 5.64652C17.8417 5.45126 18.1583 5.45126 18.3536 5.64652C18.5488 5.84178 18.5488 6.15837 18.3536 6.35363L12.7071 12L18.3536 17.6464C18.5488 17.8416 18.5488 18.1582 18.3536 18.3535C18.1583 18.5487 17.8417 18.5487 17.6464 18.3535L12 12.7071L6.35355 18.3536C6.15829 18.5488 5.84171 18.5488 5.64645 18.3536C5.45118 18.1583 5.45118 17.8417 5.64645 17.6464L11.2929 12L5.64645 6.35355C5.45118 6.15829 5.45118 5.84171 5.64645 5.64645Z" fill="currentColor"/></svg>
        </button>
      </div>
      <div class="pp-sheet-wrap" id="pp-sheet-wrap">
        <div class="pp-sizer" id="pp-sizer"><div class="pp-pages" id="pp-pages"></div></div>
        <div class="pp-tiles" id="pp-tiles"></div>
      </div>
    </main>`;
  document.body.appendChild(root);
  document.body.classList.add('pp-open');

  const style = document.createElement('style');
  style.id = 'pp-page-style';
  document.head.appendChild(style);

  pp.format = ppAutoFormat() || 'A1';

  root.querySelector('#pp-close').onclick = closePrintPreview;
  root.querySelector('#pp-reset').onclick = ppReset;
  root.querySelector('#pp-print').onclick = () => window.print();
  ppSeg('#pp-format', v => { pp.format = v; pp.zoom = null; ppRender(); });
  ppSeg('#pp-orient', v => { pp.orient = v; pp.zoom = null; ppRender(); });
  ppSeg('#pp-tile', v => { pp.tile = v; ppRender(); });
  ppSeg('#pp-depth', v => { pp.depth = v === 'all' ? Infinity : +v; ppRender(); });
  ppSetupZoom(root);
  root.querySelector('#pp-fullnames').onchange = e => { pp.fullNames = e.target.checked; ppRender(); };
  root.querySelector('#pp-photos').onchange = e => { pp.photos = e.target.checked; ppRender(); };
  root.querySelector('#pp-team').onchange = e => { pp.team = e.target.checked; ppRender(); };
  root.querySelector('#pp-balance').onchange = e => { pp.balance = e.target.checked; ppRender(); };
  root.querySelector('#pp-branch').onchange = e => { pp.perBranch = e.target.checked; pp.zoom = null; ppRender(); };
  root.querySelector('#pp-all').onclick = () => { pp.excluded.clear(); ppRenderTree(); ppRender(); };
  root.querySelector('#pp-none').onclick = () => { ppAllNodes().forEach(n => pp.excluded.add(n.uid)); ppRenderTree(); ppRender(); };
  const search = root.querySelector('#pp-search');
  search.oninput = () => { pp.query = search.value; ppRenderTree(); };
  ppSearchClear(search.closest('.search-wrap'));
  window.addEventListener('resize', ppPlaceSheet);
  document.addEventListener('keydown', ppOnKey);

  ppRenderTree();
  ppRender();
}

export function closePrintPreview() {
  const onClose = pp && pp.onClose;
  document.getElementById('pp')?.remove();
  document.getElementById('pp-page-style')?.remove();
  document.body.classList.remove('pp-open', 'pp-tiling');
  window.removeEventListener('resize', ppPlaceSheet);
  document.removeEventListener('keydown', ppOnKey);
  pp = null;
  if (onClose) onClose();
}

function ppOnKey(e) {
  if (e.key !== 'Escape') return;
  const search = document.getElementById('pp-search');
  if (document.activeElement === search && search.value) { search.value = ''; search.dispatchEvent(new Event('input')); return; }
  closePrintPreview();
}

function ppSeg(sel, onPick) {
  document.querySelector(sel).addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (b) onPick(b.dataset.v);
  });
}

function ppSyncControls() {
  const mark = (sel, v) => document.querySelectorAll(sel + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  mark('#pp-format', pp.format);
  mark('#pp-orient', pp.orient);
  mark('#pp-tile', pp.tile);
  mark('#pp-depth', pp.depth === Infinity ? 'all' : String(pp.depth));
}

/* ---------- Дерево выбора веток (левая панель) ---------- */

/* Галочки веток — как обычное дерево с галочками:
   снять ветку — снимается всё внутри; включить — включается всё внутри и путь к ней сверху;
   у отмеченной ветки с частично снятыми подразделениями — частичная галочка (чёрточка) */
function ppAllNodes() {
  const out = [];
  (function walk(list) { list.forEach(n => { out.push(n); walk(n.children); }); })(pp.data.roots);
  return out;
}
function ppDescendants(n) {
  const out = [];
  (function walk(list) { list.forEach(c => { out.push(c); walk(c.children); }); })(n.children);
  return out;
}
// Галочка ветки — она и всё внутри; тех, кто выше, не трогает: отмеченная группа без своей
// дирекции сама становится карточкой на листе
function ppSetChecked(n, on) {
  if (n.kind) { on ? pp.excluded.delete(n.uid) : pp.excluded.add(n.uid); return; }   // звено — только своя карточка
  [n, ...ppDescendants(n)].forEach(x => on ? pp.excluded.delete(x.uid) : pp.excluded.add(x.uid));
}

// Видимые дети узла: снятый ребёнок пропускается, а отмеченное под ним поднимается на его место
function ppVisibleKids(children) {
  return children.flatMap(c => pp.excluded.has(c.uid) ? ppVisibleKids(c.children) : [c]);
}

// Поиск по веткам: без учёта регистра и ё/е, по названию подразделения и ФИО руководителя
function ppNorm(t) { return (t || '').toLowerCase().replace(/ё/g, 'е'); }

function ppMark(text, q) {
  const i = q ? ppNorm(text).indexOf(q) : -1;
  if (i < 0) return ppEsc(text);
  return ppEsc(text.slice(0, i)) + '<mark>' + ppEsc(text.slice(i, i + q.length)) + '</mark>' + ppEsc(text.slice(i + q.length));
}

function ppRenderTree() {
  const box = document.getElementById('pp-tree');
  box.innerHTML = '';
  const q = ppNorm(pp.query.trim());
  const labelOf = n => n.treeLabel || n.dept || (n.person ? n.person.fullName : '');
  // ФИО строкой под названием — когда нашлось по руководителю, а в подписи ветки его нет
  const nameHit = n => q && n.dept && n.person && !n.treeLabel && ppNorm(n.person.fullName).includes(q);
  const selfHit = n => !!q && (ppNorm(labelOf(n)).includes(q) || nameHit(n));

  // При поиске показываем совпадения и путь к ним (раскрытым)
  const shown = new Set();
  if (q) (function mark(list) {
    let any = false;
    list.forEach(n => { if (mark(n.children) | selfHit(n)) { shown.add(n.uid); any = true; } });
    return any;
  })(pp.data.roots);

  const walk = (n, level) => {
    if (q && !shown.has(n.uid)) return;
    const hasKids = n.children.some(c => c.dept || c.children.length);
    const kidsShown = q ? n.children.some(c => shown.has(c.uid)) : hasKids;
    const isOpen = q ? kidsShown : pp.open.has(n.uid);
    const off = pp.excluded.has(n.uid);
    const partial = !n.kind && ppDescendants(n).some(d => pp.excluded.has(d.uid) !== off);
    const item = document.createElement('div');
    item.className = 'pp-ti' + (n.kind ? ' pp-ti--chain' : '');
    item.innerHTML = `
      <div class="pp-ti__row" style="padding-left:${(level - 2) * 16}px">
        <button class="pp-ti__arrow${kidsShown ? '' : ' empty'}${isOpen ? ' open' : ''}" tabindex="${kidsShown ? 0 : -1}">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3.5 2l3 3-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <label class="pp-check"><input type="checkbox" ${off ? '' : 'checked'}>
          <span class="pp-ti__text"><span class="pp-ti__label">${ppMark(labelOf(n), q)}</span>
          ${nameHit(n) ? `<span class="pp-ti__name">${ppMark(n.person.fullName, q)}</span>` : ''}</span></label>
      </div>`;
    item.querySelector('input').onchange = e => {
      ppSetChecked(n, e.target.checked);
      ppRenderTree();
      ppRender();
    };
    item.querySelector('.pp-ti__arrow').onclick = () => {
      if (!kidsShown || q) return;
      isOpen ? pp.open.delete(n.uid) : pp.open.add(n.uid);
      ppRenderTree();
    };
    box.appendChild(item);
    item.querySelector('input').indeterminate = partial;
    if (kidsShown && isOpen) n.children.forEach(c => walk(c, level + 1));
  };
  pp.data.roots.forEach(c => walk(c, 2));
  if (q && !shown.size) box.innerHTML = '<div class="pp-tree__empty">Ничего не нашлось</div>';
}

/* ---------- Лист ---------- */

function ppPersonName(p) { return pp.fullNames ? p.fullName : p.name; }

function ppPhotoHTML(p) {
  if (!pp.photos) return '';
  return p.photo
    ? `<div class="pp-ph"><img src="${ppEsc(p.photo)}" alt=""></div>`
    : `<div class="pp-ph" style="background:${ppAvatarColor(p.fullName)}"><span>${ppEsc(ppInitials(p))}</span></div>`;
}

function ppPersonHTML(p) {
  return `<div class="pp-card__person">${ppPhotoHTML(p)}
    <div class="pp-card__text"><div class="pp-card__name">${ppEsc(ppPersonName(p))}</div>
    ${p.role ? `<div class="pp-card__role">${ppEsc(p.role)}</div>` : ''}</div></div>`;
}

// Сотрудник отдела: аватар + ФИО + должность, как строка «Команды» в модалке, только компактно.
// e — номер строки в потоке колонки (для замера)
function ppMemberHTML(p, e) {
  return `<div class="pp-team__row"${e != null ? ` data-e="${e}"` : ''}>${pp.photos ? `<div class="pp-team__ava" style="background:${ppAvatarColor(p.fullName)}">${ppEsc(ppInitials(p))}</div>` : ''}
    <div class="pp-team__text"><div class="pp-team__name">${ppEsc(ppPersonName(p))}</div>
    ${p.role ? `<div class="pp-team__role">${ppEsc(p.role)}</div>` : ''}</div></div>`;
}

// Карточка: руководитель (и второй руководитель), серая плашка с названием, счётчик.
// withTeam — сотрудники внутри карточки (карточки над колонками); у карточек колонок
// сотрудники идут в поток списка, чтобы длинная команда переливалась в подколонки
function ppCardHTML(n, extraClass, withTeam) {
  const people = [n.person, ...(n.persons || [])].filter(Boolean);
  const stats = n.children ? ppStatsText(ppStats(n)) : '';
  const team = withTeam && pp.team && n.team && n.team.length ? n.team : null;
  return `<div class="pp-card ${extraClass || ''}">
    ${people.map(ppPersonHTML).join('')}
    ${n.dept ? `<div class="pp-card__dept">${ppEsc(n.dept)}</div>` : ''}
    ${stats ? `<div class="pp-card__stats">${stats}</div>` : ''}
    ${team ? `<div class="pp-team" style="--tc:${Math.min(6, Math.ceil(team.length / 12))}">${team.map(p => ppMemberHTML(p)).join('')}</div>` : ''}
  </div>`;
}

/* Колонка под карточкой — поток строк: пункты списка и сотрудники отделов по порядку.
   E[i] = { kind: 'row' | 'member', parent — номер строки-отдела, в который входит (−1 — карточка),
   level }. Поток режется в любом месте, кроме как сразу после названия отдела: длинный отдел
   переливается в соседнюю подколонку, а разрезанные отделы повторяются сверху с пометкой «продолжение» */
function ppFlow(col, base, overview) {
  const E = [];
  const depth = overview ? Math.min(pp.depth, base) : pp.depth;   // общая схема — только первый уровень
  const members = (list, parent, level) => { if (pp.team && !overview) (list || []).forEach(p => E.push({ kind: 'member', p, parent, level })); };
  members(col.team, -1, base);
  (function walk(children, level, parent) {
    if (level > depth) return;
    ppVisibleKids(children).forEach(c => {
      const i = E.length;
      const more = level + 1 > depth && c.children.length ? ppStats(c).depts : 0;
      E.push({ kind: 'row', node: c, parent, level, more });
      members(c.team, i, level);
      walk(c.children, level + 1, i);
    });
  })(col.children, base, -1);
  return E;
}

// Кусок потока [a, b) — дерево-список; отделы, начатые в прошлой подколонке, — с пометкой «продолжение»
function ppFlowHTML(E, a, b, base) {
  const cont = new Set();
  for (let p = E[a].parent; p >= 0; p = E[p].parent) cont.add(p);
  const rows = new Map(), mem = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  [...cont].sort((x, y) => x - y).forEach(i => push(rows, E[i].parent, i));
  for (let i = a; i < b; i++) push(E[i].kind === 'row' ? rows : mem, E[i].parent, i);

  const team = owner => mem.has(owner) ? `<div class="pp-team">${mem.get(owner).map(i => ppMemberHTML(E[i].p, i)).join('')}</div>` : '';
  const items = parent => (rows.get(parent) || []).map(i => {
    const e = E[i], c = e.node, isCont = cont.has(i);
    const label = c.dept || (c.person ? ppPersonName(c.person) : '');
    const sub = c.dept ? [c.person, ...(c.persons || [])].filter(Boolean).map(ppPersonName).join(', ') : (c.person ? c.person.role : '');
    const kids = items(i);
    const nested = kids ? `<div class="pp-list">${kids}</div>` : '';
    return `<div class="pp-item${nested ? ' has-kids' : ''}${e.level === base ? ' pp-item--top' : ''}${isCont ? ' pp-item--cont' : ''}">
      <div class="pp-row"${isCont ? '' : ` data-e="${i}"`}><span class="pp-dot"></span>
        <div class="pp-label">${ppEsc(label)}${isCont ? ' <span class="pp-cont">продолжение</span>' : ''}</div>
        ${!isCont && sub ? `<div class="pp-sub">${ppEsc(sub)}</div>` : ''}
        ${!isCont && e.more ? `<div class="pp-more">ещё ${e.more} ${ppPlural(e.more, ['подразделение', 'подразделения', 'подразделений'])}</div>` : ''}
        ${team(i)}
      </div>${nested}</div>`;
  }).join('');
  return `<div class="pp-list pp-list--root">${team(-1)}${items(-1)}</div>`;
}

// Колонка: карточка + список; cuts — где поток разрезан на подколонки
function ppColHTML(c, E, cuts, base) {
  const bounds = [0, ...(cuts || []), E.length];
  const k = bounds.length - 1;
  let list = '';
  if (E.length) {
    const parts = [];
    for (let j = 0; j < k; j++) parts.push(ppFlowHTML(E, bounds[j], bounds[j + 1], base));
    list = k > 1 ? `<div class="pp-split">${parts.join('')}</div>` : parts[0];
  }
  return `<div class="pp-col" style="width:${k * PP_COL_W + (k - 1) * PP_SPLIT_GAP}px">${ppCardHTML(c)}${list}</div>`;
}

// Ряды карточек. Во всех рядах, кроме последнего, по центру проход, через него ствол идёт к следующему ряду
function ppRowsHTML(sheet, lay) {
  return lay.rows.map((row, ri) => {
    const cols = row.map(i => ppColHTML(sheet.cols[i], sheet.flows[i], lay.splits[i], sheet.base));
    const hv = lay.halves[ri];
    if (hv) return `<div class="pp-cols pp-cols--pass">
        <div class="pp-half pp-half--l" style="width:${hv.half}px">${cols.slice(0, hv.left).join('')}</div>
        <div class="pp-corridor"></div>
        <div class="pp-half pp-half--r" style="width:${hv.half}px">${cols.slice(hv.left).join('')}</div>
      </div>`;
    return `<div class="pp-cols${row.length === 1 ? ' single' : ''}">${cols.join('')}</div>`;
  }).join('');
}

function ppContentHTML(sheet, lay) {
  if (pp.data.custom) return ppCustomHTML();
  const { levels, cols } = sheet;
  lay = lay || { rows: [cols.map((c, i) => i)], halves: [null], splits: {} };
  // Уровни над колонками — отмеченные звенья: [совет директоров] → [исполнительный директор] →
  // [руководители блока]. Исполнительный директор под советом — даже если он же среди руководителей
  // блока: это разные роли
  return `
    <div class="pp-chart${levels.length ? '' : ' pp-chart--no-heads'}">
      ${ppLevelsHTML(levels, cols.length > 0)}
      ${cols.length ? ppRowsHTML(sheet, lay) : ''}
    </div>`;
}

// Уровни над колонками, соединённые вертикальными линиями. У уровня из нескольких карточек —
// шина: снизу, если от него линия идёт дальше вниз (совет), сверху — если в него приходит линия
// (руководители блока под советом). Последний уровень ведёт к шине колонок (has-kids)
function ppLevelsHTML(levels, hasCols) {
  const many = lv => !!lv.people && lv.people.length > 1;
  return levels.map((lv, i) => {
    const multi = many(lv);
    const busTop = multi && i > 0, busBottom = multi && i < levels.length - 1;
    const prevBus = i > 0 && many(levels[i - 1]);
    const cls = ['pp-lvl', `pp-lvl--${lv.kind}`, busTop ? 'bus-top' : '', busBottom ? 'bus-bottom' : '',
      i === levels.length - 1 && hasCols ? 'has-kids' : ''].filter(Boolean).join(' ');
    const link = i > 0 ? `<div class="pp-link${prevBus ? ' from-bus' : ''}${busTop ? ' to-bus' : ''}"></div>` : '';
    const label = lv.label ? `<div class="pp-lvl__label">${ppEsc(lv.label)}</div>` : '';
    const cardsHTML = lv.node ? ppCardHTML(lv.node, 'pp-card--head pp-card--branch', true)   // ветка: со своим отделом, счётчиком и сотрудниками
      : lv.people.map(h => ppCardHTML({ person: h }, 'pp-card--head')).join('');
    return `${link}<div class="pp-lvl-wrap">${label}<div class="${cls}">${cardsHTML}</div></div>`;
  }).join('');
}

/* ---------- Раскладка и масштаб ---------- */

function ppProbe(html) {
  const probe = document.createElement('div');
  probe.className = 'pp-content pp-probe';
  probe.innerHTML = html;
  document.body.appendChild(probe);
  return probe;
}

// Натуральный размер содержимого (до масштабирования)
function ppMeasure(html) {
  const probe = ppProbe(html);
  const size = { w: probe.scrollWidth, h: probe.scrollHeight };
  probe.remove();
  return size;
}

/* Замер для раскладки: высота «шапки» листа и по каждой колонке — карточка и положение
   каждой строки потока от верха списка. Высота куска потока [a, b) = top[b] − top[a]
   плюс строки «продолжение» над ним (cont[a]) */
function ppModel(sheet) {
  if (pp.data.custom) return { top: 0, minW: 0, cols: [] };   // у «Структуры» своя раскладка (ctLayout)
  const probe = ppProbe(ppContentHTML(sheet));
  const colsEl = probe.querySelector('.pp-cols');
  const model = {
    top: colsEl ? colsEl.offsetTop : probe.scrollHeight,
    minW: Math.max(0, ...[...probe.querySelectorAll('.pp-lvl-wrap')].map(e => e.offsetWidth)),
    cols: [...probe.querySelectorAll('.pp-col')].map((el, i) => {
      const root = el.querySelector(':scope > .pp-list--root');
      const E = sheet.flows[i], n = E.length;
      const top = new Float64Array(n + 1);
      if (root) {
        const rt = root.getBoundingClientRect().top;
        root.querySelectorAll('[data-e]').forEach(x => { top[+x.dataset.e] = x.getBoundingClientRect().top - rt; });
        top[n] = root.offsetHeight;
      }
      const depth = new Int32Array(n), cont = new Float64Array(n), ok = new Uint8Array(n);
      E.forEach((e, j) => {
        depth[j] = e.parent < 0 ? 0 : depth[e.parent] + 1;
        cont[j] = depth[j] * PP_CONT_H + (e.kind === 'member' && j > 0 && E[j - 1].kind === 'member' ? 12 : 0);
        // не резать сразу после названия отдела и не оставлять под ним одного сотрудника
        ok[j] = j > 0 && e.parent !== j - 1 && !(j > 1 && E[j - 1].kind === 'member' && E[j - 1].parent === j - 2 && e.parent === j - 2) ? 1 : 0;
      });
      return { base: el.offsetHeight - (root ? root.offsetHeight : 0) + (root ? 10 : 0), n, top, cont, ok, memo: new Map() };
    }),
  };
  probe.remove();
  return model;
}

// Разбить пункты на k подряд идущих групп с минимальной самой высокой группой
function ppPartition(h, k) {
  const n = h.length;
  const sum = h.reduce((a, b) => a + b, 0);
  if (k <= 1 || n <= 1) return { max: sum, groups: [n] };
  k = Math.min(k, n);
  const pre = [0];
  h.forEach(x => pre.push(pre[pre.length - 1] + x));
  const dp = Array.from({ length: k + 1 }, () => Array(n + 1).fill(Infinity));
  const cut = Array.from({ length: k + 1 }, () => Array(n + 1).fill(0));
  dp[0][0] = 0;
  for (let j = 1; j <= k; j++)
    for (let i = j; i <= n; i++)
      for (let m = j - 1; m < i; m++) {
        const v = Math.max(dp[j - 1][m], pre[i] - pre[m]);
        if (v < dp[j][i]) { dp[j][i] = v; cut[j][i] = m; }
      }
  const groups = [];
  for (let j = k, i = n; j > 0; j--) { const m = cut[j][i]; groups.unshift(i - m); i = m; }
  return { max: dp[k][n], groups };
}

/* Переливание колонки в k подколонок: минимальная высота самой высокой подколонки.
   Подбор высоты H делением пополам; при заданной H поток раскладывается жадно — в подколонку
   столько строк, сколько влезает. Результат запоминается (раскладка перебирает много вариантов) */
function ppFlowSplit(col, k) {
  if (col.memo.has(k)) return col.memo.get(k);
  const { n, top, cont, ok } = col;
  const cost = (a, b) => top[b] - top[a] + cont[a];
  const pack = H => {
    const cuts = [];
    let a = 0, max = 0;
    while (a < n) {
      let b = a + 1;
      while (b < n && cost(a, b + 1) <= H) b++;
      while (b < n && b > a + 1 && !ok[b]) b--;
      max = Math.max(max, cost(a, b));
      if (b < n) cuts.push(b);
      a = b;
    }
    return { cuts, max };
  };
  let res;
  if (k <= 1 || n <= 1) res = { max: top[n], cuts: [], k: 1 };
  else {
    let lo = 0, hi = top[n];
    for (let it = 0; it < 32 && hi - lo > 1; it++) {
      const mid = (lo + hi) / 2;
      if (pack(mid).cuts.length < k) hi = mid; else lo = mid;
    }
    const p = pack(hi);
    res = { max: p.max, cuts: p.cuts, k: p.cuts.length + 1 };
  }
  col.memo.set(k, res);
  return res;
}

function ppScaleFor(format, size) {
  const sh = ppSheetMM(format);
  const iw = (sh.w - sh.pad * 2) * PP_PX_PER_MM;
  const ih = (sh.h - 0.5 - PP_TOP_MM - sh.pad - ppHeadMM(format)) * PP_PX_PER_MM;   // под шапкой; 0.5 — запас высоты листа
  return Math.min(iw / size.w, ih / size.h, PP_MAX_SCALE);
}

// Раскладка при заданных делениях колонок (k) и числе рядов (r): ряды — подряд идущие
// колонки примерно равной ширины; в рядах с проходом колонки делятся на левую и правую половины
function ppArrange(model, k, r, format) {
  const sp = model.cols.map((c, i) => ppFlowSplit(c, k[i]));
  const colW = i => sp[i].k * PP_COL_W + (sp[i].k - 1) * PP_SPLIT_GAP;
  const colH = i => model.cols[i].base + sp[i].max;
  const rowW = ws => ws.reduce((a, b) => a + b, 0) + Math.max(0, ws.length - 1) * PP_COL_GAP;
  const n = model.cols.length;
  const rows = [];
  if (n) {
    let idx = 0;
    ppPartition(model.cols.map((c, i) => colW(i) + PP_COL_GAP), r).groups.forEach(sz => {
      rows.push(Array.from({ length: sz }, (_, j) => idx + j));
      idx += sz;
    });
  }
  let w = model.minW, h = model.top;
  const halves = rows.map((row, ri) => {
    const ws = row.map(colW);
    let hv = null, rw;
    if (ri < rows.length - 1) {
      const left = row.length > 1 ? ppPartition(ws.map(x => x + PP_COL_GAP), 2).groups[0] : 1;
      hv = { left, half: Math.max(rowW(ws.slice(0, left)), rowW(ws.slice(left))) };
      rw = hv.half * 2 + PP_CORRIDOR;
    } else rw = rowW(ws);
    w = Math.max(w, rw);
    h += Math.max(...row.map(colH)) + (ri ? PP_ROW_GAP : 0);
    return hv;
  });
  const splits = {};
  sp.forEach((s, i) => { if (s.cuts.length) splits[i] = s.cuts; });
  return { rows, halves, splits, scale: ppScaleFor(format, { w, h }) };
}

// Перебираем число рядов; в каждом варианте ищем деления колонок двумя способами и берём лучший:
// 1) целевая высота H — каждая колонка сразу делится на столько подколонок, чтобы стать не выше H
//    (перебор H от самой низкой возможной до самой высокой колонки);
// 2) по одной — делим колонку, пока от этого растёт масштаб (добирает то, что пропустил перебор).
// Только второй способ застревал, когда несколько колонок одной высоты: деление любой одной
// ничего не даёт. Больше рядов берём, только если это заметно крупнее
function ppLayout(model, format) {
  const n = model.cols.length;
  const maxK = c => Math.max(1, Math.min(c.n, PP_MAX_SPLIT));
  const height = (c, k) => c.base + ppFlowSplit(c, k).max;
  let best = null;
  for (let r = 1; r <= Math.min(PP_MAX_ROWS, Math.max(1, n)); r++) {
    if (r > 1 && !pp.balance) break;
    let cur = ppArrange(model, model.cols.map(() => 1), r, format);
    if (pp.balance && n) {
      const lo = Math.max(...model.cols.map(c => height(c, maxK(c))));
      const hi = Math.max(...model.cols.map(c => height(c, 1)));
      for (let s = 0; s <= 40 && hi > lo; s++) {
        const H = lo * Math.pow(hi / lo, s / 40);
        const k = model.cols.map(c => {
          let j = 1;
          while (j < maxK(c) && height(c, j) > H) j++;
          return j;
        });
        const lay = ppArrange(model, k, r, format);
        if (lay.scale > cur.scale) { cur = lay; cur.k = k; }
      }
    }
    const k = cur.k ? [...cur.k] : model.cols.map(() => 1);
    while (pp.balance) {
      let pick = -1, pickLay = null;
      model.cols.forEach((c, i) => {
        if (k[i] >= maxK(c)) return;
        k[i]++;
        const lay = ppArrange(model, k, r, format);
        k[i]--;
        if (lay.scale > (pickLay ? pickLay.scale : cur.scale * 1.01)) { pick = i; pickLay = lay; }
      });
      if (pick < 0) break;
      k[pick]++;
      cur = pickLay;
    }
    if (!best || cur.scale > best.scale * 1.05) best = cur;
  }
  return best;
}

function ppPt(scale) { return PP_BASE_FONT * scale * 0.75; }

// Первый формат, на котором текст на всех листах не мельче PP_GOOD_PT
function ppAutoFormat(sheets, models) {
  sheets = sheets || ppSheets();
  if (pp.data.custom) {   // своя раскладка — подбираем по реальному размеру
    const size = ppMeasure(ppContentHTML(sheets[0]));
    return Object.keys(PP_FORMATS).find(f => ppPt(ppScaleFor(f, size)) >= PP_GOOD_PT) || null;
  }
  models = models || sheets.map(ppModel);
  return Object.keys(PP_FORMATS).find(f => models.every(m => ppPt(ppLayout(m, f).scale) >= PP_GOOD_PT)) || null;
}

function ppHeadHTML(sheet, i, n) {
  const title = sheet.sub
    ? `${ppEsc(sheet.title)}<br><b>${ppEsc(sheet.sub)}</b>`
    : `Организационная структура<br><b>${ppEsc(sheet.title)}</b>`;
  return `${pp.logo ? `<img class="pp-logo" src="${ppEsc(pp.logo)}" alt="">` : ''}
    <div class="pp-sheet__title">${title}</div>
    <div class="pp-sheet__date">Актуально на ${new Date().toLocaleDateString('ru-RU')}${n > 1 ? ` · лист ${i + 1} из ${n}` : ''}</div>`;
}

function ppRender() {
  const sheets = ppSheets();
  const models = sheets.map(ppModel);
  const sh = ppSheetMM(pp.format);
  const wmm = sh.w, hmm = sh.h;
  const innerW = (wmm - sh.pad * 2) * PP_PX_PER_MM;
  const pages = document.getElementById('pp-pages');
  pages.innerHTML = '';
  // Раскладка и масштаб каждого листа. Листов несколько — у всех один масштаб, по самому плотному:
  // текст во всём комплекте одного размера, маленькая ветка не раздувается на весь лист
  const parts = sheets.map((s, si) => {
    const html = ppContentHTML(s, models[si].cols.length ? ppLayout(models[si], pp.format) : null);
    const size = ppMeasure(html);
    return { html, size, scale: ppScaleFor(pp.format, size) };
  });
  const common = Math.min(...parts.map(x => x.scale));
  const minPt = ppPt(common);

  sheets.forEach((s, si) => {
    const { html, size } = parts[si];
    const scale = common;

    const sheet = document.createElement('div');
    sheet.className = 'pp-sheet';
    sheet.style.width = wmm + 'mm';
    sheet.style.height = (hmm - 0.5) + 'mm';   // запас, чтобы не вылез пустой лишний лист
    sheet.style.padding = `${PP_TOP_MM}mm ${sh.pad}mm ${sh.pad}mm`;
    sheet.innerHTML = '<div class="pp-sheet__head"></div><div class="pp-content"></div><div class="pp-grid"></div>';
    pages.appendChild(sheet);

    const content = sheet.querySelector('.pp-content');
    content.innerHTML = html;
    content.style.width = size.w + 'px';
    content.style.transform = `scale(${scale})`;
    // По центру листа по горизонтали
    content.style.marginLeft = Math.max(0, (innerW - size.w * scale) / 2) + 'px';
    // Шапка: размер — от формата (мм), ширина и положение — по структуре
    const head = sheet.querySelector('.pp-sheet__head');
    head.style.setProperty('--hk', ppHeadK(pp.format));
    head.innerHTML = ppHeadHTML(s, si, sheets.length);
    // по ширине структуры; если структура уже шапки (одна группа) — шапка своей ширины, по центру
    head.style.width = 'auto';
    const headW = Math.min(innerW, Math.max(size.w * scale, head.scrollWidth));
    head.style.width = headW + 'px';
    head.style.marginLeft = Math.max(0, (innerW - headW) / 2) + 'px';
  });

  const tiles = sh.tiles;
  // Ширина печатной страницы — явно по листу: иначе браузер верстает по ширине окна
  // и ужимает всё, чтобы влезло (на широком экране куски A4 выходили уменьшенными)
  const pageW = tiles ? tiles.pw : wmm, pageH = tiles ? tiles.ph : hmm;
  document.getElementById('pp-page-style').textContent =
    `@page { size: ${pageW}mm ${pageH}mm; margin: 0; }
     @media print { html, body.pp-open, #pp, .pp-stage, .pp-sheet-wrap, .pp-tiles {
       width: ${pageW}mm !important; min-width: 0 !important; max-width: ${pageW}mm !important; } }`;
  ppRenderTiles(tiles);

  // Подсказка про читаемость
  const pt = minPt;
  const best = ppAutoFormat(sheets, models);
  const small = pt < PP_MIN_PT;
  const fit = document.getElementById('pp-fit');
  fit.className = 'pp-fit' + (small ? ' warn' : '');
  fit.innerHTML = `Текст ≈ ${pt.toFixed(1).replace('.', ',')} pt` + (sheets.length > 1 ? ' на всех листах' : '') +
    (small ? ' — мелко для печати.' : '') +
    (best && best !== pp.format ? ` <button id="pp-auto">Перейти на ${best}</button>` : '') +
    (small && !best ? (pp.perBranch ? ' Уберите часть уровней или сотрудников.' : ' Уберите часть веток или уровней — или напечатайте каждую ветку на своём листе.') : '');
  const auto = document.getElementById('pp-auto');
  if (auto) auto.onclick = () => { pp.format = best; pp.zoom = null; ppRender(); };
  document.getElementById('pp-branch-info').textContent = pp.perBranch
    ? `${sheets.length} ${ppPlural(sheets.length, ['лист', 'листа', 'листов'])}: общая схема и по листу на каждую отмеченную ветку. В PDF — страницами по порядку.`
    : '';

  ppSyncControls();
  ppPlaceSheet();
}

/* ---------- Печать частями (плакатная печать) ----------
   Большой лист режется на куски A4/A3 с нахлёстом PP_TILE_OVERLAP_MM для склейки.
   Ориентация кусков подбирается так, чтобы листов было меньше. В предпросмотре — сетка
   с номерами поверх листа, в печати — по странице на кусок с метками и подписью */

function ppRenderTiles(t) {
  const box = document.getElementById('pp-tiles');
  const info = document.getElementById('pp-tile-info');
  const sheets = [...document.querySelectorAll('#pp-pages > .pp-sheet')];
  document.body.classList.toggle('pp-tiling', !!t);
  box.innerHTML = '';
  if (!t) {
    info.textContent = pp.tile === 'off' ? ''
      : `${pp.format} и так помещается на ${pp.tile} — печатайте целым листом.`;
    return;
  }
  const word = ppPlural(t.n, ['лист', 'листа', 'листов']);
  info.innerHTML = `${t.n} ${word} ${pp.tile} (${t.rows} × ${t.cols}) — склеенные, дают ${pp.format}`
    + (sheets.length > 1 ? `; всего ${t.n * sheets.length} — на ${sheets.length} ${ppPlural(sheets.length, ['плакат', 'плаката', 'плакатов'])}` : '') + '. '
    + `Изображение чуть уменьшено, чтобы лист делился ровно; нахлёст ${PP_TILE_OVERLAP_MM} мм для склейки.<br>`
    + `В окне печати — масштаб 100%, без «Вписать в страницу».`;

  sheets.forEach((sheet, si) => {
    const grid = sheet.querySelector('.pp-grid');
    const sheetNo = sheets.length > 1 ? ` · плакат ${si + 1} из ${sheets.length}` : '';
    let k = 0;
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
      k++;
      const x = c * t.sx, y = r * t.sy;   // лист = склеенная площадь, куски делят его ровно
      // сетка поверх листа в предпросмотре
      grid.insertAdjacentHTML('beforeend',
        `<div class="pp-grid__tile" style="left:${x}mm;top:${y}mm;width:${t.vw}mm;height:${t.vh}mm"><span>${k}</span></div>`);
      // страница-кусок для печати: окно на копию листа
      const clone = sheet.cloneNode(true);
      clone.querySelector('.pp-grid').remove();
      clone.style.cssText += `;position:absolute;left:${-x}mm;top:${-y}mm;`;
      const tile = document.createElement('div');
      tile.className = 'pp-tile';
      tile.style.cssText = `width:${t.pw}mm;height:${t.ph - 0.5}mm;padding:${PP_TILE_MARGIN_MM}mm`;
      const view = document.createElement('div');
      view.className = 'pp-tile__view';
      view.style.cssText = `width:${t.vw}mm;height:${t.vh}mm`;
      view.appendChild(clone);
      // Склейка: следующий лист кладётся поверх предыдущего (правый на левый, нижний на верхний).
      // У нижнего листа справа/снизу — серая полоса под клей, её закрывает соседний лист.
      // Верхний лист обрезается по меткам реза и кладётся краем на начало серой полосы.
      // На содержимом верхнего листа линий нет — на готовом плакате ничего не остаётся
      const O = PP_TILE_OVERLAP_MM, M = PP_TILE_MARGIN_MM;
      if (c < t.cols - 1) view.insertAdjacentHTML('beforeend', `<div class="pp-tile__glue pp-tile__glue--v" style="left:${t.vw - O}mm;width:${O}mm"></div>`);
      if (r < t.rows - 1) view.insertAdjacentHTML('beforeend', `<div class="pp-tile__glue pp-tile__glue--h" style="top:${t.vh - O}mm;height:${O}mm"></div>`);
      tile.appendChild(view);
      // метки реза — на полях, точно по краям видимой части
      const cut = [];
      for (const yy of [M, t.ph - M]) cut.push(`top:${yy}mm;left:1mm;width:${M - 2}mm`, `top:${yy}mm;right:1mm;width:${M - 2}mm`);
      for (const xx of [M, t.pw - M]) cut.push(`left:${xx}mm;top:1mm;height:${M - 2}mm`, `left:${xx}mm;bottom:1mm;height:${M - 2}mm`);
      tile.insertAdjacentHTML('beforeend',
        cut.map(st => `<i class="pp-tile__cut ${/width/.test(st) ? 'h' : 'v'}" style="${st}"></i>`).join('')
        + `<div class="pp-tile__label">${ppEsc(pp.title)}${sheetNo} · ${pp.format} частями · лист ${k} из ${t.n} · ряд ${r + 1}, колонка ${c + 1}`
        + `${c > 0 || r > 0 ? ' · обрежьте ' + [c > 0 ? 'левое' : '', r > 0 ? 'верхнее' : ''].filter(Boolean).join(' и ') + ' поле по меткам и наложите край на серую полосу соседнего листа' : ''}</div>`);
      box.appendChild(tile);
    }
  });
}

/* ---------- Масштаб просмотра: как на холсте страницы ----------
   «−»/«+» — шаг ×1.2, колесо — ×1.1 к точке под курсором, перетаскивание — сдвиг,
   «Лист целиком» / «Реальный размер» — быстрые значения. Диапазон: от «лист целиком» до 300%.
   Листов несколько — идут столбиком, «лист целиком» вписывает один лист */

const PP_ZOOM_MAX = 3;

function ppSheetPx() {
  const { w: wmm, h: hmm } = ppSheetMM(pp.format);
  return { sw: wmm * PP_PX_PER_MM, sh: (hmm - 0.5) * PP_PX_PER_MM };
}

function ppZoomRange() {
  const wrap = document.getElementById('pp-sheet-wrap');
  const { sw, sh } = ppSheetPx();
  const min = Math.min((wrap.clientWidth - 64) / sw, (wrap.clientHeight - 64) / sh, 1);
  return { min, max: Math.max(PP_ZOOM_MAX, min) };
}

function ppCurZoom() {
  const { min, max } = ppZoomRange();
  return pp.zoom == null ? min : Math.min(max, Math.max(min, pp.zoom));
}

// Новый масштаб, точка (px, py) в координатах области просмотра остаётся на месте
function ppSetZoom(k, px, py) {
  const wrap = document.getElementById('pp-sheet-wrap');
  if (px == null) { px = wrap.clientWidth / 2; py = wrap.clientHeight / 2; }
  const fx = (wrap.scrollLeft + px) / wrap.scrollWidth;
  const fy = (wrap.scrollTop + py) / wrap.scrollHeight;
  const { min, max } = ppZoomRange();
  k = Math.min(max, Math.max(min, k));
  pp.zoom = k <= min * 1.001 ? null : k;
  ppPlaceSheet();
  wrap.scrollLeft = fx * wrap.scrollWidth - px;
  wrap.scrollTop = fy * wrap.scrollHeight - py;
}

function ppSetupZoom(root) {
  const wrap = root.querySelector('#pp-sheet-wrap');
  root.querySelector('#pp-zoom-out').onclick = () => ppSetZoom(ppCurZoom() / 1.2);
  root.querySelector('#pp-zoom-in').onclick = () => ppSetZoom(ppCurZoom() * 1.2);
  ppSeg('#pp-view', v => v === 'fit' ? (pp.zoom = null, ppPlaceSheet()) : ppSetZoom(1));
  root.querySelector('#pp-zoom-slider').oninput = e => {
    const { min, max } = ppZoomRange();
    ppSetZoom(min + (e.target.value / 100) * (max - min));
  };
  wrap.onwheel = e => {
    e.preventDefault();
    const r = wrap.getBoundingClientRect();
    ppSetZoom(ppCurZoom() * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
  };
  wrap.onmousedown = e => {
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY, l: wrap.scrollLeft, t: wrap.scrollTop };
    wrap.classList.add('dragging');
    const move = ev => {
      wrap.scrollLeft = start.l - (ev.clientX - start.x);
      wrap.scrollTop = start.t - (ev.clientY - start.y);
    };
    const up = () => {
      wrap.classList.remove('dragging');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    e.preventDefault();
  };
}

// Листы на экране в текущем масштабе + ползунок
function ppPlaceSheet() {
  if (!pp) return;
  const sizer = document.getElementById('pp-sizer');
  const pages = document.getElementById('pp-pages');
  const n = Math.max(1, pages.children.length);
  const { sw, sh } = ppSheetPx();
  const k = ppCurZoom();
  pages.style.transform = `scale(${k})`;
  pages.style.gap = PP_SHEET_GAP / k + 'px';   // промежуток между листами на экране — постоянный
  sizer.style.width = sw * k + 'px';           // обёртка по видимому размеру — для центрирования и прокрутки
  sizer.style.height = n * sh * k + (n - 1) * PP_SHEET_GAP + 'px';

  const { min, max } = ppZoomRange();
  const val = Math.round((k - min) / (max - min || 1) * 100);
  const sl = document.getElementById('pp-zoom-slider');
  sl.value = val;
  sl.style.background = `linear-gradient(to right,#e2221c 0%,#e2221c ${val}%,#f6f6f6 ${val}%,#f6f6f6 100%)`;

  // «Лист целиком» / «Реальный размер» горят, только когда масштаб ровно такой
  const view = pp.zoom == null ? 'fit' : Math.abs(k - 1) < 0.005 ? 'actual' : '';
  document.querySelectorAll('#pp-view button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
}
