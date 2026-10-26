/* ====================================================================
   ПЕЧАТЬ СТРУКТУРЫ — предпросмотр и сохранение в PDF

   Вся структура на одном альбомном листе: руководители блока сверху,
   карточки 2-го уровня в ряд, под каждой карточкой — дерево-список
   (кружки и линии, как «Место в структуре» в модалке).
   Слева в предпросмотре: формат листа, глубина, выбор веток.
   Печать — системная (window.print), «Сохранить как PDF» в диалоге.

   Зависит от: ORG_DATA, state, initials(), avatarColor(), escHtml()
   из index.html. Данные v2-дерева сначала приводятся к одному виду:
   { uid, dept, person, people, children } — раскладка от исходного
   формата не зависит, при переносе достаточно переписать normalize.
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

let pp = null;   // состояние открытого предпросмотра

/* ---------- Приведение данных v2 к одному виду ---------- */

function ppNormalize(treeData, rootTreeId) {
  let uid = 0;
  const visitedTrees = new Set([rootTreeId]);
  const clean = s => (s || '').replace(/\s*\n\s*/g, ' ').trim();
  const person = p => p && !p.vacant ? {   // отдел без руководителя (vacant) — без человека
    id: p.id, name: clean(p.name), fullName: clean(p.fullName || p.name),
    role: (p.role || '').replace(/\s*\n\s*/g, ' ').replace(/ \/ ?$/, '').trim(), photo: p.photo || null,
  } : null;
  const modalPeople = m => m ? [...(m.managers || []), ...(m.deputies || []), ...(m.assistants || []), ...(m.team || [])]
    .map(x => x.id || x.fullName || x.name) : [];

  const team = m => ((m && m.team) || []).map(person);

  function node(dept, p, extraPeople, teamList) {
    return { uid: 'n' + (++uid), dept: clean(dept), person: person(p), people: extraPeople || [],
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

/* ---------- «Структура» (custom-structure.js): та же раскладка, что на экране ----------
   Узлы печати — по узлам CUSTOM_STRUCTURE; «Ветки» — каскадом, снятый узел пропускается,
   отмеченное под ним поднимается (ppVisibleKids). Совет — плашкой и карточками, как в основной печати */
function ppCustomData() {
  const map = n => {
    const r = csResolve(n);
    const label = n.type === 'board' ? r.label
      : n.type === 'exec' ? (r.people[0] ? `${r.people[0].fullName} — исполнительный директор` : 'Исполнительный директор') : r.label;
    return { uid: 'c-' + n.id, src: n, type: n.type || 'group', treeLabel: label, dept: r.label, person: null,
      persons: r.people.map(p => ({ ...p, fullName: p.fullName || p.name, name: p.name || p.fullName })),
      items: n.items || [], people: [], team: [], children: (n.children || []).map(map) };
  };
  const root = map(CUSTOM_STRUCTURE.root);
  return { custom: true, heads: [], board: null, cards: [], chain: [], roots: [root] };
}

function ppCustomCard(n) {
  const person = p => ppCardHTML({ person: p }, 'pp-card--head');
  if (n.type === 'board') return `<div class="pp-lvl-wrap"><div class="pp-lvl__label">${escHtml(n.dept)}</div>`
    + `<div class="pp-lvl">${n.persons.map(person).join('')}</div></div>`;
  if (n.type === 'set') return `<div class="pp-card pp-card--set"><div class="pp-card__name pp-card__name--block">${escHtml(n.dept)}</div>`
    + n.items.map(it => {
      const names = (it.people || []).map(p => ppPersonName({ fullName: p.fullName || p.name, name: p.name || p.fullName }));
      return it.name   // без подразделения — человек и его должность вместо названия
        ? `<div class="pp-card__dept">${escHtml(it.name)}${names.map(nm => `<div class="pp-card__role">${escHtml(nm)}</div>`).join('')}</div>`
        : `<div class="pp-card__dept">${(it.people || []).map((p, i) => `${escHtml(names[i])}<div class="pp-card__role">${escHtml(p.role || '')}</div>`).join('')}</div>`;
    }).join('') + `</div>`;
  return `<div class="pp-card pp-card--group">${n.persons.map(p => `<div class="pp-card__person">${ppPhotoHTML(p)}
      <div class="pp-card__text"><div class="pp-card__name">${escHtml(ppPersonName(p))}</div>
      ${p.role ? `<div class="pp-card__role">${escHtml(p.role)}</div>` : ''}</div></div>`).join('')}
    ${n.type !== 'exec' && n.dept ? `<div class="pp-card__dept">${escHtml(n.dept)}</div>` : ''}</div>`;
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
    if (x.person) people.add(x.person.id || x.person.fullName);
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
    team: false,          // сотрудники отделов (команда из модалки)
    balance: true,        // авто-раскладка: переносить карточки в ряды, делить длинные колонки
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
  const search = document.getElementById('pp-search');
  search.value = '';
  search.dispatchEvent(new Event('input'));
  ppRenderTree();
  ppRender();
}

function openPrintPreview() {
  const custom = state.blockId === 'custom' && typeof CUSTOM_STRUCTURE !== 'undefined';
  const treeData = custom ? { blockName: CUSTOM_STRUCTURE.title } : ORG_DATA.trees && ORG_DATA.trees[state.blockId];
  if (!custom && (!treeData || treeData.version !== 2)) return;
  const company = custom ? { logo: 'Логотипы/SetlGroup-logo.svg' }
    : (ORG_DATA.companies || []).find(c => c.id === state.companyId);
  const data = custom ? ppCustomData() : ppNormalize(treeData, state.blockId);

  if (!custom) ppBuildChain(data);   // у «Структуры» иерархия уже своя
  pp = {
    data,
    title: treeData.blockName || state.blockName || '',
    logo: company ? company.logo : null,
    ...ppDefaults(),
  };
  ppInitTop();
  pp.format = ppAutoFormat() || 'A1';

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
          <!-- Поле поиска страницы (.search-wrap / .search-input / .search-icon из index.html) -->
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
      <!-- Масштаб — компонент страницы (.zoom-group / .zoom-btn / .zoom-slider), закрытие — .vm-close из модалок -->
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
        <div class="pp-sizer" id="pp-sizer">
          <div class="pp-sheet" id="pp-sheet"><div class="pp-sheet__head" id="pp-sheet-head"></div><div class="pp-content" id="pp-content"></div><div class="pp-grid" id="pp-grid"></div></div>
        </div>
        <div class="pp-tiles" id="pp-tiles"></div>
      </div>
    </main>`;
  document.body.appendChild(root);
  document.body.classList.add('pp-open');

  const style = document.createElement('style');
  style.id = 'pp-page-style';
  document.head.appendChild(style);

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
  root.querySelector('#pp-all').onclick = () => { pp.excluded.clear(); ppRenderTree(); ppRender(); };
  root.querySelector('#pp-none').onclick = () => { ppAllNodes().forEach(n => pp.excluded.add(n.uid)); ppRenderTree(); ppRender(); };
  const search = root.querySelector('#pp-search');
  search.oninput = () => { pp.query = search.value; ppRenderTree(); };
  setupSearchClear(search.closest('.search-wrap'));
  window.addEventListener('resize', ppPlaceSheet);
  document.addEventListener('keydown', ppOnKey);

  ppRenderTree();
  ppRender();
}

function closePrintPreview() {
  document.getElementById('pp')?.remove();
  document.getElementById('pp-page-style')?.remove();
  document.body.classList.remove('pp-open', 'pp-tiling');
  window.removeEventListener('resize', ppPlaceSheet);
  document.removeEventListener('keydown', ppOnKey);
  pp = null;
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
function ppAncestors(n) {
  const path = [];
  (function find(list, trail) {
    for (const c of list) {
      if (c === n) { path.push(...trail); return true; }
      if (find(c.children, [...trail, c])) return true;
    }
    return false;
  })(pp.data.roots, []);
  return path;
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
  if (i < 0) return escHtml(text);
  return escHtml(text.slice(0, i)) + '<mark>' + escHtml(text.slice(i, i + q.length)) + '</mark>' + escHtml(text.slice(i + q.length));
}

function ppRenderTree() {
  const box = document.getElementById('pp-tree');
  box.innerHTML = '';
  const q = ppNorm(pp.query.trim());
  const labelOf = n => n.treeLabel || n.dept || (n.person ? n.person.fullName : '');
  const nameHit = n => q && n.dept && n.person && ppNorm(n.person.fullName).includes(q);
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
    ? `<div class="pp-ph"><img src="${p.photo}" alt=""></div>`
    : `<div class="pp-ph" style="background:${avatarColor(p.fullName)}"><span>${escHtml(initials(p.fullName))}</span></div>`;
}

// Команда отдела: аватар + ФИО + должность, как строка «Команды» в модалке, только компактно
function ppTeamHTML(n) {
  if (!pp.team || !n.team || !n.team.length) return '';
  return `<div class="pp-team">${n.team.map(p => `
    <div class="pp-team__row">${pp.photos ? `<div class="pp-team__ava" style="background:${avatarColor(p.fullName)}">${escHtml(initials(p.fullName))}</div>` : ''}
      <div class="pp-team__text"><div class="pp-team__name">${escHtml(ppPersonName(p))}</div>
      ${p.role ? `<div class="pp-team__role">${escHtml(p.role)}</div>` : ''}</div>
    </div>`).join('')}</div>`;
}

function ppCardHTML(n, extraClass) {
  const p = n.person;
  const stats = n.children ? ppStatsText(ppStats(n)) : '';
  return `<div class="pp-card ${extraClass || ''}">
    ${p ? `<div class="pp-card__person">${ppPhotoHTML(p)}
      <div class="pp-card__text"><div class="pp-card__name">${escHtml(ppPersonName(p))}</div>
      ${p.role ? `<div class="pp-card__role">${escHtml(p.role)}</div>` : ''}</div></div>` : ''}
    ${n.dept ? `<div class="pp-card__dept">${escHtml(n.dept)}</div>` : ''}
    ${stats ? `<div class="pp-card__stats">${stats}</div>` : ''}
    ${ppTeamHTML(n)}
  </div>`;
}

function ppItemsHTML(children, level) {
  const kids = ppVisibleKids(children);
  if (level > pp.depth) return [];
  return kids.map(c => {
    const label = c.dept || (c.person ? ppPersonName(c.person) : '');
    const sub = c.dept ? (c.person ? ppPersonName(c.person) : '') : (c.person ? c.person.role : '');
    const nested = ppListHTML(c.children, level + 1);
    const hidden = !nested && c.children.length && level + 1 > pp.depth ? ppStats(c).depts : 0;
    return `<div class="pp-item${nested ? ' has-kids' : ''}${level === 3 ? ' pp-item--top' : ''}">
      <div class="pp-row"><span class="pp-dot"></span>
        <div class="pp-label">${escHtml(label)}</div>
        ${sub ? `<div class="pp-sub">${escHtml(sub)}</div>` : ''}
        ${hidden ? `<div class="pp-more">ещё ${hidden} ${ppPlural(hidden, ['подразделение', 'подразделения', 'подразделений'])}</div>` : ''}
        ${ppTeamHTML(c)}
      </div>${nested}</div>`;
  });
}

function ppListHTML(children, level) {
  const items = ppItemsHTML(children, level);
  return items.length ? `<div class="pp-list">${items.join('')}</div>` : '';
}

// Колонка: карточка + список; groups — сколько пунктов верхнего уровня в каждой подколонке
function ppColHTML(c, groups) {
  const items = ppItemsHTML(c.children, 3);
  const k = groups ? groups.length : 1;
  let list = '';
  if (items.length && k > 1) {
    let i = 0;
    list = `<div class="pp-split">${groups.map(g => {
      const part = items.slice(i, i += g);
      return `<div class="pp-list pp-list--root">${part.join('')}</div>`;
    }).join('')}</div>`;
  } else if (items.length) {
    list = `<div class="pp-list pp-list--root">${items.join('')}</div>`;
  }
  return `<div class="pp-col" style="width:${k * PP_COL_W + (k - 1) * PP_SPLIT_GAP}px">${ppCardHTML(c)}${list}</div>`;
}

// Ряды карточек. Во всех рядах, кроме последнего, по центру проход, через него ствол идёт к следующему ряду
function ppRowsHTML(cards, lay) {
  return lay.rows.map((row, ri) => {
    const cols = row.map(i => ppColHTML(cards[i], lay.splits[cards[i].uid]));
    const hv = lay.halves[ri];
    if (hv) return `<div class="pp-cols pp-cols--pass">
        <div class="pp-half pp-half--l" style="width:${hv.half}px">${cols.slice(0, hv.left).join('')}</div>
        <div class="pp-corridor"></div>
        <div class="pp-half pp-half--r" style="width:${hv.half}px">${cols.slice(hv.left).join('')}</div>
      </div>`;
    return `<div class="pp-cols${row.length === 1 ? ' single' : ''}">${cols.join('')}</div>`;
  }).join('');
}

function ppContentHTML(lay) {
  if (pp.data.custom) return ppCustomHTML();
  const { levels, cols: cards } = ppTop();
  lay = lay || { rows: [cards.map((c, i) => i)], halves: [null], splits: {} };
  // Уровни над колонками — отмеченные звенья: [совет директоров] → [исполнительный директор] →
  // [руководители блока]. Исполнительный директор под советом — даже если он же среди руководителей
  // блока: это разные роли
  return `
    <div class="pp-chart${levels.length ? '' : ' pp-chart--no-heads'}">
      ${ppLevelsHTML(levels, cards.length > 0)}
      ${cards.length ? ppRowsHTML(cards, lay) : ''}
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
    const label = lv.label ? `<div class="pp-lvl__label">${escHtml(lv.label)}</div>` : '';
    const cardsHTML = lv.node ? ppCardHTML(lv.node, 'pp-card--head')   // подразделение-начало: со своим отделом и счётчиком
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

// Замер для раскладки: высота «шапки» листа и по каждой колонке —
// карточка и высоты пунктов верхнего уровня (вместе с их поддеревьями)
function ppModel() {
  if (pp.data.custom) return { top: 0, minW: 0, cols: [] };   // у «Структуры» своя раскладка (ctLayout)
  const cards = ppTop().cols;
  const probe = ppProbe(ppContentHTML());
  const colsEl = probe.querySelector('.pp-cols');
  const model = {
    top: colsEl ? colsEl.offsetTop : probe.scrollHeight,
    minW: Math.max(0, ...[...probe.querySelectorAll('.pp-lvl-wrap')].map(e => e.offsetWidth)),
    cols: [...probe.querySelectorAll('.pp-col')].map((el, i) => {
      const root = el.querySelector(':scope > .pp-list--root');
      return {
        uid: cards[i].uid,
        base: el.offsetHeight - (root ? root.offsetHeight : 0) + (root ? 10 : 0),
        items: root ? [...root.children].map(x => x.offsetHeight) : [],
      };
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

function ppScaleFor(format, size) {
  const sh = ppSheetMM(format);
  const iw = (sh.w - sh.pad * 2) * PP_PX_PER_MM;
  const ih = (sh.h - 0.5 - PP_TOP_MM - sh.pad - ppHeadMM(format)) * PP_PX_PER_MM;   // под шапкой; 0.5 — запас высоты листа
  return Math.min(iw / size.w, ih / size.h, PP_MAX_SCALE);
}

// Раскладка при заданных делениях колонок (k) и числе рядов (r): ряды — подряд идущие
// колонки примерно равной ширины; в рядах с проходом колонки делятся на левую и правую половины
function ppArrange(model, k, r, format) {
  const colW = i => k[i] * PP_COL_W + (k[i] - 1) * PP_SPLIT_GAP;
  const colH = i => model.cols[i].base + ppPartition(model.cols[i].items, k[i]).max;
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
  model.cols.forEach((c, i) => { if (k[i] > 1) splits[c.uid] = ppPartition(c.items, k[i]).groups; });
  return { rows, halves, splits, scale: ppScaleFor(format, { w, h }) };
}

// Перебираем число рядов; в каждом варианте делим колонки, пока от этого растёт масштаб.
// Больше рядов берём, только если это заметно крупнее
function ppLayout(model, format) {
  const n = model.cols.length;
  let best = null;
  for (let r = 1; r <= Math.min(PP_MAX_ROWS, Math.max(1, n)); r++) {
    if (r > 1 && !pp.balance) break;
    const k = model.cols.map(() => 1);
    let cur = ppArrange(model, k, r, format);
    while (pp.balance) {
      let pick = -1, pickLay = null;
      model.cols.forEach((c, i) => {
        if (k[i] >= c.items.length) return;
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

// Первый формат, на котором текст не мельче PP_GOOD_PT
function ppAutoFormat(model) {
  if (pp.data.custom) {   // своя раскладка — подбираем по реальному размеру
    const size = ppMeasure(ppContentHTML());
    return Object.keys(PP_FORMATS).find(f => ppPt(ppScaleFor(f, size)) >= PP_GOOD_PT) || null;
  }
  model = model || ppModel();
  return Object.keys(PP_FORMATS).find(f => ppPt(ppLayout(model, f).scale) >= PP_GOOD_PT) || null;
}

function ppRender() {
  const model = ppModel();
  const html = ppContentHTML(ppLayout(model, pp.format));
  const size = ppMeasure(html);
  const scale = ppScaleFor(pp.format, size);
  const sh = ppSheetMM(pp.format);
  const wmm = sh.w, hmm = sh.h;

  const sheet = document.getElementById('pp-sheet');
  const content = document.getElementById('pp-content');
  sheet.style.width = wmm + 'mm';
  sheet.style.height = (hmm - 0.5) + 'mm';   // запас, чтобы не вылез пустой второй лист
  sheet.style.padding = `${PP_TOP_MM}mm ${sh.pad}mm ${sh.pad}mm`;
  content.innerHTML = html;
  content.style.width = size.w + 'px';
  content.style.transform = `scale(${scale})`;
  // По центру листа по горизонтали
  const innerW = (wmm - sh.pad * 2) * PP_PX_PER_MM;
  content.style.marginLeft = Math.max(0, (innerW - size.w * scale) / 2) + 'px';
  // Шапка: размер — от формата (мм), ширина и положение — по структуре (как раньше)
  const head = document.getElementById('pp-sheet-head');
  head.style.setProperty('--hk', ppHeadK(pp.format));
  head.innerHTML = `${pp.logo ? `<img class="pp-logo" src="${pp.logo}" alt="">` : ''}
    <div class="pp-sheet__title">Организационная структура<br><b>${escHtml(pp.title)}</b></div>
    <div class="pp-sheet__date">Актуально на ${new Date().toLocaleDateString('ru-RU')}</div>`;
  // по ширине структуры; если структура уже шапки (одна группа) — шапка своей ширины, по центру
  head.style.width = 'auto';
  const headW = Math.min(innerW, Math.max(size.w * scale, head.scrollWidth));
  head.style.width = headW + 'px';
  head.style.marginLeft = Math.max(0, (innerW - headW) / 2) + 'px';

  const tiles = sh.tiles;
  // Ширина печатной страницы — явно по листу: иначе браузер верстает по ширине окна
  // и ужимает всё, чтобы влезло (на широком экране куски A4 выходили уменьшенными)
  const pageW = tiles ? tiles.pw : wmm, pageH = tiles ? tiles.ph : hmm;
  document.getElementById('pp-page-style').textContent =
    `@page { size: ${pageW}mm ${pageH}mm; margin: 0; }
     @media print { html, body.pp-open, #pp, .pp-stage, .pp-sheet-wrap, .pp-tiles {
       width: ${pageW}mm !important; min-width: 0 !important; max-width: ${pageW}mm !important; } }`;
  ppRenderTiles(tiles, wmm, hmm);

  // Подсказка про читаемость
  const pt = ppPt(scale);
  const best = ppAutoFormat(model);
  const small = pt < PP_MIN_PT;
  const fit = document.getElementById('pp-fit');
  fit.className = 'pp-fit' + (small ? ' warn' : '');
  fit.innerHTML = `Текст ≈ ${pt.toFixed(1).replace('.', ',')} pt` +
    (small ? ' — мелко для печати.' : '') +
    (best && best !== pp.format ? ` <button id="pp-auto">Перейти на ${best}</button>` : '') +
    (small && !best ? ' Уберите часть веток или уровней.' : '');
  const auto = document.getElementById('pp-auto');
  if (auto) auto.onclick = () => { pp.format = best; pp.zoom = null; ppRender(); };

  ppSyncControls();
  ppPlaceSheet();
}

/* ---------- Печать частями (плакатная печать) ----------
   Большой лист режется на куски A4/A3 с нахлёстом PP_TILE_OVERLAP_MM для склейки.
   Ориентация кусков подбирается так, чтобы листов было меньше. В предпросмотре — сетка
   с номерами поверх листа, в печати — по странице на кусок с метками и подписью */

function ppRenderTiles(t, wmm, hmm) {
  const grid = document.getElementById('pp-grid');
  const box = document.getElementById('pp-tiles');
  const info = document.getElementById('pp-tile-info');
  document.body.classList.toggle('pp-tiling', !!t);
  grid.innerHTML = '';
  box.innerHTML = '';
  if (!t) {
    info.textContent = pp.tile === 'off' ? ''
      : `${pp.format} и так помещается на ${pp.tile} — печатайте целым листом.`;
    return;
  }
  const word = ppPlural(t.n, ['лист', 'листа', 'листов']);
  info.innerHTML = `${t.n} ${word} ${pp.tile} (${t.rows} × ${t.cols}) — склеенные, дают ${pp.format}. `
    + `Изображение чуть уменьшено, чтобы лист делился ровно; нахлёст ${PP_TILE_OVERLAP_MM} мм для склейки.<br>`
    + `В окне печати — масштаб 100%, без «Вписать в страницу».`;

  const sheet = document.getElementById('pp-sheet');
  let k = 0;
  for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
    k++;
    const x = c * t.sx, y = r * t.sy;   // лист = склеенная площадь, куски делят его ровно
    // сетка поверх листа в предпросмотре
    grid.insertAdjacentHTML('beforeend',
      `<div class="pp-grid__tile" style="left:${x}mm;top:${y}mm;width:${t.vw}mm;height:${t.vh}mm"><span>${k}</span></div>`);
    // страница-кусок для печати: окно на копию листа
    const clone = sheet.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
    clone.querySelector('.pp-grid').remove();
    clone.style.cssText += `;position:absolute;left:${-x}mm;top:${-y}mm;transform:none;`;
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
      + `<div class="pp-tile__label">${escHtml(pp.title)} · ${pp.format} частями · лист ${k} из ${t.n} · ряд ${r + 1}, колонка ${c + 1}`
      + `${c > 0 || r > 0 ? ' · обрежьте ' + [c > 0 ? 'левое' : '', r > 0 ? 'верхнее' : ''].filter(Boolean).join(' и ') + ' поле по меткам и наложите край на серую полосу соседнего листа' : ''}</div>`);
    box.appendChild(tile);
  }
}

/* ---------- Масштаб просмотра: как на холсте страницы ----------
   «−»/«+» — шаг ×1.2, колесо — ×1.1 к точке под курсором, перетаскивание — сдвиг,
   «Лист целиком» / «Реальный размер» — быстрые значения. Диапазон: от «лист целиком» до 300%. */

const PP_ZOOM_MAX = 3;

function ppSheetPx() {
  const { w: wmm, h: hmm } = ppSheetMM(pp.format);
  return { sw: wmm * PP_PX_PER_MM, sh: hmm * PP_PX_PER_MM };
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

// Лист на экране в текущем масштабе + ползунок
function ppPlaceSheet() {
  if (!pp) return;
  const sizer = document.getElementById('pp-sizer');
  const sheet = document.getElementById('pp-sheet');
  const { sw, sh } = ppSheetPx();
  const k = ppCurZoom();
  sheet.style.transform = `scale(${k})`;
  sizer.style.width = sw * k + 'px';      // обёртка по видимому размеру — для центрирования и прокрутки
  sizer.style.height = sh * k + 'px';

  const { min, max } = ppZoomRange();
  const val = Math.round((k - min) / (max - min || 1) * 100);
  const sl = document.getElementById('pp-zoom-slider');
  sl.value = val;
  sl.style.background = `linear-gradient(to right,#e2221c 0%,#e2221c ${val}%,#f6f6f6 ${val}%,#f6f6f6 100%)`;

  // «Лист целиком» / «Реальный размер» горят, только когда масштаб ровно такой
  const view = pp.zoom == null ? 'fit' : Math.abs(k - 1) < 0.005 ? 'actual' : '';
  document.querySelectorAll('#pp-view button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
}
