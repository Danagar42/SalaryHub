# Desktop UI/UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Усунути виявлені під час аудиту естетичні та функціональні недоліки десктопного інтерфейсу SalaryHub: замінити емодзі на SVG-іконки, гармонізувати палітру перемикачів, покращити типографіку KPI, стилізувати повзунки калькулятора та оптимізувати зону швидкого імпорту.

**Architecture:** Усі зміни вносяться безпосередньо у клієнтський SPA-код `index.html`. Стилізація спирається на Tailwind CSS utilities та SVG-іконки у єдиному стилі.

**Tech Stack:** React 18, Tailwind CSS, Framer Motion, Recharts.

**Spec:** Зауваження з UI/UX аудиту за скілами `ui-ux-pro-max`, `frontend-design`, `design-taste-frontend` (десктопний фокус).

## Global Constraints

- Не зачіпати мобільні брейкпоінти (фокус виключно на десктопному досвіді md/lg/xl).
- Зберігати працездатність усіх існуючих функцій (розрахунки, згладжування, експорт/імпорт, редагування, приватний режим).
- Використовувати виключно вбудовані SVG-іконки замість емодзі або сторонніх важких бібліотек.
- Дотримуватися принципу Color Consistency Lock: зменшити кількість конкуруючих яскравих акцентів.

---

### Task 1: Усунення емодзі та впровадження консистентних SVG-іконок

**Files:**
- Modify: `index.html` (розділ іконок ~L60-L85, сайдбар ~L3120-L3130, інсайти ~L1780-L1815, калькулятор ~L2800-L2810, підказка імпорту ~L2515)

**Interfaces:**
- Produces: `IconLightbulb` (SVG), `IconPalmtree` (SVG)
- Replaces: `🧳` -> `<IconSuitcase />`, `💡` -> `<IconLightbulb />`, `🌴` -> `<IconPalmtree />`

- [x] **Step 1: Створити відсутні SVG-компоненти `IconLightbulb` та `IconPalmtree`**

Додати до блоку іконок в `index.html`:
```jsx
const IconLightbulb = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>;
const IconPalmtree = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/><path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-2l-1-1-1 1h-3"/><path d="M5.89 15.55c1.43-.87 3.11-1.4 4.88-1.51M13 10.5a6 6 0 0 1 4.5 2"/><path d="m11.5 13-1.5 8"/><path d="m12.5 13 1.5 8"/></svg>;
```

- [x] **Step 2: Замінити `🧳` у сайдбарі на `<IconSuitcase />`**

У блоці навігації вкладки `vacation`:
```jsx
<span className="shrink-0"><IconSuitcase /></span>
<span className="truncate whitespace-normal leading-tight">Калькулятор відпустки</span>
```

- [x] **Step 3: Замінити емодзі у підказках та плашках аналітики**

- У `PayslipView` (плашка інсайтів місяця): замінити сирий `💡` на `<span className="p-2 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-xl"><IconLightbulb /></span>`.
- У `PayslipView` (плашка відпустки): замінити `🌴` на `<span className="p-2 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl"><IconPalmtree /></span>`, а кнопку розрахунку оформити із `<IconSuitcase />`.
- У `VacationCalculatorView`: замінити `💡` на `<IconLightbulb />` поруч із заголовком "Як премії впливають на вигідність?".
- У `AddPayslipView` (підказка імпорту): замінити `💡` на `<IconLightbulb />`.

- [x] **Step 4: Перевірити рендеринг у браузері / синтаксис коду**

Переконатися у відсутності синтаксичних помилок Babel.

---

### Task 2: Гармонізація перемикачів графіка та типографіка KPI

**Files:**
- Modify: `index.html` (DashboardView ~L1457-L1505)

**Interfaces:**
- Consumes: `smoothingMode`, `setSmoothingMode`, `chartMode`, `setChartMode`, `avgEarnedUAH`, `avgEarnedForeign`

- [x] **Step 1: Оновити відображення великих сум у картці середнього доходу**

Додати табулярні моноширинні класи для чисел середнього заробітку:
```jsx
<h3 className="text-3xl font-black font-mono tabular-nums tracking-tight text-blue-600 dark:text-blue-400">
  <AnimatedNumber value={avgEarnedUAH} currency="UAH" />
</h3>
<span className="text-lg font-bold font-mono tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
  ~ <AnimatedNumber value={avgEarnedForeign} currency={'USD'} />
</span>
```

- [x] **Step 2: Гармонізувати стиль Segmented Control для перемикачів режимів графіка**

Уніфікувати кольорове підсвічування кнопок згладжування (`Касовий`, `Згладжений`, `Тренд`) та метрик (`Дохід`, `Премії %`, `За год.`):
- Замість трьох різних кольорових плям (синій/індиго/янтар/ціановий/пурпурний) використати консистентний преміальний вигляд активного сегмента:
```jsx
// Для активного стану:
"bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-white font-bold"
// Для неактивного стану:
"text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium"
```
Активний стан метрики позначати акуратною маленькою точкою (accent dot) відповідного кольору лінії графіка.

- [x] **Step 3: Перевірити консистентність перемикання графіків**

---

### Task 3: Стилізація повзунків та карток у Калькуляторі відпустки

**Files:**
- Modify: `index.html` (VacationCalculatorView ~L2815-L2870, секція `<style>`)

- [x] **Step 1: Додати CSS-стилі для сучасного range-повзунка у блок `<style>`**

Додати класи для стилізації `input[type=range]`:
```css
input[type=range]::-webkit-slider-runnable-track { height: 6px; border-radius: 9999px; background: #e2e8f0; }
.dark input[type=range]::-webkit-slider-runnable-track { background: #334155; }
input[type=range]::-webkit-slider-thumb { height: 18px; width: 18px; border-radius: 50%; background: #2563eb; cursor: pointer; margin-top: -6px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
```

- [x] **Step 2: Оформити блок вибору тривалості відпустки з візуальними мітками**

- Додати під повзунком шкалу ключових періодів (7, 10, 14, 24 дні).
- Покращити картку "Ваш середньоденний відпускний" із чіткішим акцентом на формулі (База / Дні).

---

### Task 4: Оптимізація швидкого імпорту та безпека деструктивних дій

**Files:**
- Modify: `index.html` (AddPayslipView ~L2525-L2545, Сайдбар ~L3135-L3150)

- [x] **Step 1: Збільшити висоту та зручність `textarea` для розпізнавання тексту**

- Збільшити висоту поля введення скопійованого тексту з `h-24` до `h-36`.
- Додати підказку щодо автоматичного розпізнавання при вставці.

- [x] **Step 2: Відокремити небезпечну дію "Очистити базу" в навігації**

- Додати мікро-лейбл або візуальний розділювач над деструктивною кнопкою.
- Стилізувати кнопку "Очистити базу" як стриману приглушену дію небезпечної зони (`text-slate-400 hover:text-rose-600 dark:hover:text-rose-400`), щоб вона не привертала випадкову увагу поруч із кнопками експорту/імпорту.

- [x] **Step 3: Перевірити всю десктопну взаємодію у робочому середовищі**

Переконатися, що всі 4 етапи працюють безпомилково, модальні вікна коректні, розрахунки точні.
