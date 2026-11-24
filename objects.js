/* ====================================================================
   «Объекты» — вторая структура (концепт, на странице «Цифра» — digital.html).
   — На главной внизу, под компаниями, — раздел «Объекты строительства»: дирекции департамента строительства,
     в карточке — объекты 2-го уровня (вложенные — только в дереве). Поиск — общий, отдельного нет.
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

  /* ---------- Главная: раздел «Объекты строительства» под компаниями ---------- */
  // дирекции департамента строительства; в карточке — только объекты 2-го уровня (вложенные — в дереве)
  function mountLanding() {
    const view = document.getElementById('view-landing'), companies = document.getElementById('companies-row');
    if (!view || !companies || view.querySelector('.obj-panel')) return;
    const panel = document.createElement('section');
    panel.className = 'obj-panel';
    panel.innerHTML = `<h2 class="obj-section">Объекты строительства</h2><div class="obj-grid"></div>`;
    companies.after(panel);
    const grid = panel.querySelector('.obj-grid');
    DIRS.forEach(d => {
      const card = document.createElement('div');
      card.className = 'obj-card';
      card.innerHTML = `
        <button class="obj-card__head" type="button">
          <span class="obj-card__title">${d.name}</span>
          <span class="obj-card__lead"><span class="obj-ava">${initials(d.head.name)}</span>${d.head.name}</span>
        </button>
        <div class="obj-chips">${d.objects.map(o => `<button class="obj-chip" type="button" data-name="${o.dept.name.replace(/"/g, '&quot;')}">${o.dept.name}</button>`).join('')}</div>`;
      card.querySelector('.obj-card__head').addEventListener('click', () => openDirection(d));
      card.querySelectorAll('.obj-chip').forEach(c => c.addEventListener('click', () => openDirection(d, c.dataset.name)));
      grid.appendChild(card);
    });
  }

  // главная перерисовывается при каждом возврате — раздел живёт рядом с её рядами, их перерисовка его не трогает
  const origRender = renderLanding;
  renderLanding = function () { origRender.apply(this, arguments); mountLanding(); };   // eslint-disable-line no-global-assign
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountLanding); else mountLanding();
})();
