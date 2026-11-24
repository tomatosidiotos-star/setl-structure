/* ====================================================================
   «Объекты» — вторая структура (концепт, на странице «Цифра» — digital.html).
   — На главной под советом директоров — табы «Сотрудники / Объекты» (красные, корешки как у листов «Цифры»).
     «Сотрудники» — главная как есть; «Объекты» — каталог: поиск + дирекции департамента строительства
     со списками объектов.
   — Клик по дирекции — её дерево объектов; клик по объекту — то же дерево, объект в центре и подсвечен.
   — Дерево объектов рисует обычная отрисовка сайта (buildTreeV2) по рыбным данным; карточки в нём
     перевёрнуты: объект сверху, ответственный снизу (класс .is-objects у #view-tree).
   Данные — РЫБА: настоящая база объектов придёт из отдельного источника. Где сидят дирекции —
   как в реальной структуре: Группа строительных компаний → Департамент строительства → Дирекции №1–4.
==================================================================== */
(function () {
  const CO = 'setlgroup';

  /* ---------- Рыбные данные: дирекции и их объекты ---------- */
  let pid = 0;
  const P = (name, role) => ({ id: 'obj-p' + (++pid), name, fullName: name, role, photo: null, phone: '', email: '', office: '' });
  // объект = карточка: сверху название объекта (dept), снизу ответственный; kids — вложенные объекты
  function obj(name, resp, role, kids = [], desc = '') {
    const p = P(resp, role);
    const id = 'obj-' + (++pid);
    return {
      ...p,
      dept: { name, link: false, id, modal: { description: desc || `Объект «${name}». Рыбные данные для прототипа.`,
        managers: [{ id: p.id, name: p.name, fullName: p.fullName, role: p.role, photo: null, leadsAlso: [] }],
        deputies: [], assistants: [], subdepts: [], team: [] } },
      children: kids,
    };
  }
  const DIRS = [
    { id: 'obj-d1', name: 'Дирекция по строительству №1', head: P('Макаров А.Н.', 'Директор по строительству'), objects: [
      obj('Энгельса, Светлана парк 3–5 уч. (S=90 743 м²)', 'Орлов Д.В.', 'Руководитель проекта'),
      obj('Заповедная (S=90 743 м²)', 'Белов С.К.', 'Руководитель проекта'),
      obj('Бионика', 'Гусев П.А.', 'Руководитель проекта', [
        obj('ДОО 350 мест — Заповедная', 'Лаптев Е.Н.', 'Начальник участка'),
        obj('Школа 825 мест — Заповедная', 'Зотова М.И.', 'Начальник участка'),
      ]),
      obj('ЖК «Город звёзд»', 'Ефремов Г.Л.', 'Руководитель проекта', [
        obj('ЖК «Город звёзд» ДОО на 200 мест', 'Пахомов Р.С.', 'Начальник участка'),
        obj('ЖК «Город звёзд» СОШ на 1100 мест', 'Носова Т.В.', 'Начальник участка'),
      ]),
    ] },
    { id: 'obj-d2', name: 'Дирекция по строительству №2', head: P('Соболев В.Г.', 'Директор по строительству'), objects: [
      obj('ЖК «Северная гавань»', 'Кудрявцев И.О.', 'Руководитель проекта', [
        obj('Корпус 1', 'Миронова А.П.', 'Начальник участка'),
        obj('Корпус 2', 'Фомин Д.Д.', 'Начальник участка'),
      ]),
      obj('ЖК «Невский берег»', 'Данилова Е.С.', 'Руководитель проекта'),
      obj('Паркинг на Комендантском', 'Тарасов Н.М.', 'Руководитель проекта'),
    ] },
    { id: 'obj-d3', name: 'Дирекция по строительству №3', head: P('Шилов К.Р.', 'Директор по строительству'), objects: [
      obj('ЖК «Солнечный квартал»', 'Воронина О.А.', 'Руководитель проекта', [
        obj('ДОО на 220 мест', 'Блинов С.С.', 'Начальник участка'),
      ]),
      obj('Бизнес-центр «Пулково»', 'Комаров А.Ф.', 'Руководитель проекта'),
    ] },
    { id: 'obj-d4', name: 'Дирекция по строительству №4', head: P('Ершова Л.П.', 'Директор по строительству'), objects: [
      obj('ЖК «Морская миля»', 'Галкин В.И.', 'Руководитель проекта'),
      obj('ЖК «Лесной ручей»', 'Ильина Н.Ю.', 'Руководитель проекта', [
        obj('Школа 600 мест', 'Абрамов Т.К.', 'Начальник участка'),
        obj('ДОО 180 мест', 'Чернова Я.В.', 'Начальник участка'),
      ]),
      obj('Склад «Шушары»', 'Медведев Л.А.', 'Руководитель проекта'),
    ] },
  ];
  ORG_DATA.trees = ORG_DATA.trees || {};
  DIRS.forEach(d => {
    ORG_DATA.trees[d.id] = {
      version: 2, objects: true,
      blockName: d.name,
      description: '',
      heads: [d.head], headsLabel: d.name,
      blockDeputies: [],
      persons: d.objects,
    };
  });
  const flat = list => list.flatMap(o => [o, ...flat(o.children || [])]);

  /* ---------- Дерево объектов: перевёрнутые карточки, найденный объект — в центре и подсвечен ---------- */
  const origOpen = openTree;
  openTree = function (companyId, blockId, blockName) {   // eslint-disable-line no-global-assign
    const isObj = !!(ORG_DATA.trees?.[blockId] || {}).objects;
    document.getElementById('view-tree').classList.toggle('is-objects', isObj);
    return origOpen.apply(this, arguments);
  };
  function openDirection(d, objectName) {
    openTree(CO, d.id, d.name);
    if (!objectName) return;
    setTimeout(() => focusObject(objectName), 250);   // после отрисовки и «одевания» карточек
  }
  function focusObject(name) {
    const plate = [...document.querySelectorAll('#canvas-inner .card-v2-multi__dept')].find(p => p.textContent.trim() === name);
    if (!plate) return;
    const node = plate.closest('.tree-node'), wrap = document.getElementById('canvas-wrapper').getBoundingClientRect();
    canvas.scale = 1;
    canvas.x = wrap.width / 2 - (node.offsetLeft + node.offsetWidth / 2);
    canvas.y = wrap.height / 2 - (node.offsetTop + node.offsetHeight / 2);
    applyTransform();
    plate.classList.remove('obj-found'); void plate.offsetWidth; plate.classList.add('obj-found');
  }

  /* ---------- Главная: табы и каталог ---------- */
  let tab = 'people';
  function mountLanding() {
    const view = document.getElementById('view-landing'), dirs = document.getElementById('directors-row');
    if (!view || !dirs || view.querySelector('.obj-tabs')) return;
    const tabs = document.createElement('div');
    tabs.className = 'obj-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.innerHTML = `<button class="obj-tab" role="tab" data-tab="people">Сотрудники</button><button class="obj-tab" role="tab" data-tab="objects">Объекты</button>`;
    dirs.after(tabs);
    const panel = document.createElement('div');
    panel.className = 'obj-panel';
    panel.innerHTML = `
      <div class="lnd-search-wrap obj-search">
        <input type="text" class="lnd-search-input" id="obj-search" placeholder="Найти объект или дирекцию" autocomplete="off">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="lnd-search-icon"><circle cx="6.5" cy="6.5" r="4" stroke="#7c7c7c" stroke-width="1.5"/><line x1="9.5" y1="9.5" x2="13.5" y2="13.5" stroke="#7c7c7c" stroke-width="1.5" stroke-linecap="round"/></svg>
      </div>
      <div class="obj-section">Департамент строительства</div>
      <div class="obj-grid"></div>
      <div class="obj-empty" hidden>Ничего не нашлось</div>`;
    tabs.after(panel);
    const grid = panel.querySelector('.obj-grid');
    DIRS.forEach(d => {
      const card = document.createElement('div');
      card.className = 'obj-card';
      card.dataset.dir = d.id;
      card.innerHTML = `
        <button class="obj-card__head" type="button">
          <span class="obj-card__title">${d.name}</span>
          <span class="obj-card__lead"><span class="obj-ava">${initials(d.head.name)}</span>${d.head.name}</span>
        </button>
        <div class="obj-chips">${flat(d.objects).map(o => `<button class="obj-chip${(o.children || []).length ? '' : ''}" type="button" data-name="${o.dept.name.replace(/"/g, '&quot;')}">${o.dept.name}</button>`).join('')}</div>`;
      card.querySelector('.obj-card__head').addEventListener('click', () => openDirection(d));
      card.querySelectorAll('.obj-chip').forEach(c => c.addEventListener('click', () => openDirection(d, c.dataset.name)));
      grid.appendChild(card);
    });
    tabs.addEventListener('click', e => { const b = e.target.closest('.obj-tab'); if (b) setTab(b.dataset.tab); });
    panel.querySelector('#obj-search').addEventListener('input', e => filter(e.target.value));
    setTab(tab);
  }
  function setTab(t) {
    tab = t;
    const view = document.getElementById('view-landing');
    view.classList.toggle('obj-mode', t === 'objects');
    view.querySelectorAll('.obj-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  }
  function filter(q) {
    q = q.trim().toLowerCase();
    let any = false;
    document.querySelectorAll('.obj-card').forEach(card => {
      const d = DIRS.find(x => x.id === card.dataset.dir);
      const dirHit = !q || d.name.toLowerCase().includes(q) || d.head.name.toLowerCase().includes(q);
      let chipHit = false;
      card.querySelectorAll('.obj-chip').forEach(c => {
        const hit = !!q && c.dataset.name.toLowerCase().includes(q);
        c.classList.toggle('is-hit', hit); chipHit = chipHit || hit;
      });
      const show = dirHit || chipHit;
      card.hidden = !show; any = any || show;
    });
    document.querySelector('.obj-empty').hidden = any;
  }

  // главная перерисовывается при каждом возврате — табы и каталог живут рядом с её рядами, их не трогает
  const origRender = renderLanding;
  renderLanding = function () { origRender.apply(this, arguments); mountLanding(); };   // eslint-disable-line no-global-assign
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountLanding); else mountLanding();
})();
