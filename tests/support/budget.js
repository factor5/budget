// The yearly budget file ("budget 2026 (new format)") as the person sees it in Google Sheets.
// This is the contract between the app and the sheet: which tab holds what, in which column.
// Tests read and change the sheet only through this file, never through raw cells.

const TABS = { entries: 'Записи', income: 'Приходи', invest: 'Инвестиции', balance: 'Баланс', lists: 'Категории' };

// Google Sheets stores dates as days since 30 Dec 1899.
const EPOCH = Date.UTC(1899, 11, 30);
const toSerial = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 864e5); };
const fromSerial = (n) => new Date(EPOCH + Math.round(n) * 864e5).toISOString().slice(0, 10);

const DEFAULT_CATEGORIES = {
  'Храна': ['храна'],
  'Дом': ['битови', 'ток', 'вода'],
  'Коли': ['гориво', 'кола – ремонт'],
  'Семейство': ['дрехи, обувки', 'училище'],
  'Здраве': ['лекарства'],
  'Свободно време': ['спорт', 'почивки'],
  'Други': ['други'],
};
const DEFAULT_CARS = ['ML', 'Тойота'];
const DEFAULT_INCOME_SOURCES = ['заплата', 'бонуси', 'други'];
const DEFAULT_INVEST_TYPES = ['Акции/Фондове', 'Злато', 'Кеш'];

// Баланс: rows 5–11 are the month statement, rows 14–20 spending by group; column B is January, O the average.
const BALANCE = { income: 5, spending: 6, oneOff: 7, regular: 8, left: 9, invested: 11, firstGroup: 14, avgCol: 14 };

class Budget {
  constructor(spreadsheet) { this.s = spreadsheet; }

  get title() { return this.s.title; }
  get id() { return this.s.id; }

  /* ---------- reading, as a person looking at the sheet ---------- */

  expenses() {
    return this.rows(TABS.entries, 6).map(([date, amount, category, car, oneOff, note]) => ({
      date: typeof date === 'number' ? fromSerial(date) : date, amount, category, car: car || '', oneOff: oneOff === true, note: note || '',
    }));
  }

  income() { return this.rows(TABS.income, 4).map(([date, amount, source, note]) => ({ date: fromSerial(date), amount, source, note: note || '' })); }

  deposits() { return this.rows(TABS.invest, 4).map(([date, amount, type, note]) => ({ date: fromSerial(date), amount, type, note: note || '' })); }

  /** Non-empty data rows of a tab, below the header row. */
  rows(title, cols) {
    const tab = this.s.tab(title);
    const out = [];
    for (let r = 1; r < tab.usedRows; r++) {
      const row = Array.from({ length: cols }, (_, c) => tab.get(r, c));
      if (row.some((v) => v !== undefined && v !== null && v !== '')) out.push(row);
    }
    return out;
  }

  /* ---------- changing, as another phone or the person in Google Sheets ---------- */

  addExpense(e) { this.appendRow(TABS.entries, expenseRow(e)); return this; }
  addIncome(e) { this.appendRow(TABS.income, [toSerial(e.date), e.amount, e.source, e.note || '']); return this; }

  /** Inserts a row right under the header, pushing every entry down one row. */
  insertExpenseAtTop(e) {
    this.s.tab(TABS.entries).rows.splice(1, 0, expenseRow(e));
    return this;
  }

  /** Deletes the expense row matching all the given fields (the rows below move up). */
  deleteExpense(match) {
    const tab = this.s.tab(TABS.entries);
    tab.rows.splice(this.expenseRowIndex(match), 1);
    return this;
  }

  editExpense(match, changes) {
    const r = this.expenseRowIndex(match);
    const current = this.expenses().find((x) => matches(x, match));
    expenseRow(Object.assign({}, current, changes)).forEach((v, c) => this.s.tab(TABS.entries).set(r, c, v));
    return this;
  }

  expenseRowIndex(match) {
    const tab = this.s.tab(TABS.entries);
    for (let r = 1; r < tab.usedRows; r++) {
      const [date, amount, category, car, oneOff, note] = Array.from({ length: 6 }, (_, c) => tab.get(r, c));
      if (date == null || date === '') continue;
      if (matches({ date: fromSerial(date), amount, category, car: car || '', oneOff: oneOff === true, note: note || '' }, match)) return r;
    }
    throw new Error('No expense like ' + JSON.stringify(match) + ' in ' + this.title);
  }

  appendRow(title, values) {
    const tab = this.s.tab(title);
    const r = Math.max(1, tab.usedRows);
    values.forEach((v, c) => tab.set(r, c, v));
  }

  /** Replaces the lists on the Категории tab. Pass only what changes. */
  setLists({ categories, cars, incomeSources, investTypes } = {}) {
    const tab = this.s.tab(TABS.lists);
    const column = (col, values, max) => { for (let i = 0; i < max; i++) tab.set(i + 1, col, values[i] === undefined ? undefined : values[i]); };
    if (categories) {
      const flat = Object.entries(categories).flatMap(([group, names]) => names.map((n) => [n, group]));
      for (let i = 0; i < 40; i++) { tab.set(i + 1, 0, flat[i] ? flat[i][0] : undefined); tab.set(i + 1, 1, flat[i] ? flat[i][1] : undefined); }
    }
    if (cars) column(3, cars, 14);
    if (incomeSources) column(5, incomeSources, 19);
    if (investTypes) column(7, investTypes, 14);
    return this;
  }

  /**
   * What the Баланс tab shows for a month (1–12). In the real sheet these are formulas;
   * the app only reads them, so tests set them directly.
   * groups: { 'Храна': { amount, average }, ... }
   */
  setMonth(month, { income = 0, spending = 0, oneOff = 0, regular = spending - oneOff, left = income - spending, invested = 0, groups = {} }) {
    const tab = this.s.tab(TABS.balance);
    const put = (row, v) => tab.set(row - 1, month, v);
    put(BALANCE.income, income); put(BALANCE.spending, spending); put(BALANCE.oneOff, oneOff);
    put(BALANCE.regular, regular); put(BALANCE.left, left); put(BALANCE.invested, invested);
    Object.entries(groups).forEach(([name, g]) => {
      let r = BALANCE.firstGroup - 1;
      while (tab.get(r, 0) && tab.get(r, 0) !== name) r++;
      tab.set(r, 0, name); tab.set(r, month, g.amount || 0); tab.set(r, BALANCE.avgCol, g.average || 0);
    });
    return this;
  }
}

function expenseRow(e) { return [toSerial(e.date), e.amount, e.category, e.car || '', !!e.oneOff, e.note || '']; }
function matches(x, m) { return Object.entries(m).every(([k, v]) => x[k] === v); }

/** Creates a budget file in the fake Drive, like a copy of "budget template". */
function createBudget(google, title, opts = {}) {
  const s = google.createSpreadsheet(title);
  const lists = s.addTab(TABS.lists);
  ['Категория', 'Група', '', 'Кола', '', 'Източник', '', 'Тип'].forEach((h, c) => lists.set(0, c, h || undefined));
  const entries = s.addTab(TABS.entries);
  ['Дата', 'Сума', 'Категория', 'Кола', 'Еднократен', 'Бележка'].forEach((h, c) => entries.set(0, c, h));
  const income = s.addTab(TABS.income);
  ['Дата', 'Сума', 'Източник', 'Бележка'].forEach((h, c) => income.set(0, c, h));
  const invest = s.addTab(TABS.invest);
  ['Дата', 'Сума', 'Тип', 'Бележка'].forEach((h, c) => invest.set(0, c, h));
  const balance = s.addTab(TABS.balance);
  balance.set(3, 0, 'Баланс'); balance.set(4, 0, 'Приходи'); balance.set(5, 0, 'Разходи'); balance.set(6, 0, 'еднократни');
  balance.set(7, 0, 'редовни'); balance.set(8, 0, 'Остават'); balance.set(10, 0, 'Инвестирани');
  (opts.extraTabs || []).forEach((t) => s.addTab(t));
  (opts.withoutTabs || []).forEach((t) => { s.tabs = s.tabs.filter((x) => x.title !== t); });

  const b = new Budget(s);
  if (!(opts.withoutTabs || []).includes(TABS.lists)) {
    b.setLists({
      categories: opts.categories || DEFAULT_CATEGORIES,
      cars: opts.cars || DEFAULT_CARS,
      incomeSources: opts.incomeSources || DEFAULT_INCOME_SOURCES,
      investTypes: opts.investTypes || DEFAULT_INVEST_TYPES,
    });
  }
  (opts.expenses || []).forEach((e) => b.addExpense(e));
  return b;
}

/** A budget file already in the fake Drive, by its name. */
const openBudget = (google, title) => new Budget(google.file(title));

module.exports = { createBudget, openBudget, Budget, TABS, DEFAULT_CATEGORIES, DEFAULT_CARS, DEFAULT_INCOME_SOURCES, DEFAULT_INVEST_TYPES };
