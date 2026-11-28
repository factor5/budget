// The New screen: recording an expense, income or investment deposit into the sheet.
const { test, expect } = require('./support/fixtures');

const TODAY = '2026-03-18';

test.describe('expenses', () => {
  test('an expense becomes a new row in Записи', async ({ phone, budget }) => {
    expect(await phone.addExpense({ amount: 12.5, category: 'храна', note: 'хляб и мляко' })).toBe('saved');
    await phone.expectToast('Saved: 12.50 € · храна');
    expect(budget.expenses()).toEqual([{ date: TODAY, amount: 12.5, category: 'храна', car: '', oneOff: false, note: 'хляб и мляко' }]);
  });

  test('new rows go below the existing ones', async ({ phone, budget }) => {
    budget.addExpense({ date: '2026-03-01', amount: 100, category: 'ток' });
    await phone.addExpense({ amount: 7, category: 'вода' });
    await phone.addExpense({ amount: 3, category: 'битови' });
    expect(budget.expenses().map((e) => e.category)).toEqual(['ток', 'вода', 'битови']);
  });

  test('the form is cleared after saving', async ({ phone }) => {
    await phone.addExpense({ amount: 25, category: 'спорт', oneOff: true, note: 'фитнес' });
    expect(await phone.shownAmount()).toBe('0€');
    await expect(phone.saveButton()).toHaveText('Choose a category');
    await expect(phone.saveButton()).toBeDisabled();
    await expect(phone.screen().getByRole('textbox', { name: 'Note' })).toHaveValue('');
    await expect(phone.screen().getByRole('button', { name: 'One-off' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('a one-off expense is marked in the sheet', async ({ phone, budget }) => {
    await phone.addExpense({ amount: 1420, category: 'битови', oneOff: true, note: 'врати' });
    expect(budget.expenses()[0]).toMatchObject({ amount: 1420, oneOff: true, note: 'врати' });
  });

  test('an expense can be for an earlier day', async ({ phone, budget }) => {
    await phone.addExpense({ amount: 30, category: 'храна', date: '2026-03-02' });
    expect(budget.expenses()[0].date).toBe('2026-03-02');
  });

  test('a category that is not on the quick buttons is found under More…, by group', async ({ phone, budget }) => {
    expect(await phone.allCategories()).toEqual({
      Food: ['храна'], Home: ['битови', 'ток', 'вода'], Cars: ['гориво', 'кола – ремонт'], Family: ['дрехи, обувки', 'училище'],
      Health: ['лекарства'], Leisure: ['спорт', 'почивки'], Other: ['други'],
    });
    await phone.addExpense({ amount: 18, category: 'лекарства' });
    expect(budget.expenses()[0].category).toBe('лекарства');
  });

  test('the save button says what will be saved, and works only with an amount and a category', async ({ phone }) => {
    await phone.goTo('new');
    await expect(phone.saveButton()).toBeDisabled();
    await phone.chooseCategory('храна');
    await expect(phone.saveButton()).toHaveText('Save 0 € · храна · today');
    await expect(phone.saveButton()).toBeDisabled();
    await phone.typeAmount('9.9');
    await expect(phone.saveButton()).toHaveText('Save 9.9 € · храна · today');
    await expect(phone.saveButton()).toBeEnabled();
  });

  test('the header shows what was spent this month so far', async ({ phone, budget }) => {
    budget.addExpense({ date: '2026-03-02', amount: 100, category: 'ток' }).addExpense({ date: '2026-02-20', amount: 999, category: 'храна' });
    await phone.refreshCategories();
    await phone.goTo('new');
    expect(await phone.subtitle()).toBe('March so far: 100 €');
    await phone.addExpense({ amount: 1234, category: 'почивки' });
    expect(await phone.subtitle()).toBe('March so far: 1,334 €');
  });
});

test.describe('cars', () => {
  test('car categories ask which car, and the car goes into the sheet', async ({ phone, budget }) => {
    await phone.fillEntry({ amount: 80, choice: 'храна' });
    expect(await phone.carChoices()).toEqual([]);
    await phone.chooseCategory('гориво');
    expect(await phone.carChoices()).toEqual([{ car: 'ML', selected: false }, { car: 'Тойота', selected: false }]);
    await phone.chooseCar('Тойота');
    await phone.saveEntry();
    expect(budget.expenses()[0]).toMatchObject({ category: 'гориво', car: 'Тойота' });
  });

  test('the last car is chosen again next time', async ({ phone, budget }) => {
    await phone.addExpense({ amount: 60, category: 'гориво', car: 'ML' });
    await phone.fillEntry({ amount: 70, choice: 'кола – ремонт' });
    expect(await phone.carChoices()).toEqual([{ car: 'ML', selected: true }, { car: 'Тойота', selected: false }]);
    await phone.saveEntry();
    expect(budget.expenses()[1]).toMatchObject({ category: 'кола – ремонт', car: 'ML' });
  });

  test('a car fuel-up can be saved without a car', async ({ phone, budget }) => {
    await phone.addExpense({ amount: 50, category: 'гориво', car: null });
    expect(budget.expenses()[0]).toMatchObject({ category: 'гориво', car: '' });
  });

  test('other categories never get a car, even after one was picked', async ({ phone, budget }) => {
    await phone.addExpense({ amount: 60, category: 'гориво', car: 'ML' });
    await phone.addExpense({ amount: 10, category: 'храна' });
    expect(budget.expenses()[1]).toMatchObject({ category: 'храна', car: '' });
  });
});

test.describe('income and deposits', () => {
  test('income becomes a new row in Приходи, with its source', async ({ phone, budget }) => {
    await phone.fillEntry({ kind: 'Income' });
    expect(await phone.title()).toBe('New income');
    expect(await phone.quickCategories()).toEqual(['заплата', 'бонуси', 'други']);
    await phone.addIncome({ amount: 5407, source: 'заплата', note: 'март' });
    expect(budget.income()).toEqual([{ date: TODAY, amount: 5407, source: 'заплата', note: 'март' }]);
    expect(budget.expenses()).toEqual([]);
  });

  test('a deposit becomes a new row in Инвестиции, with its type', async ({ phone, budget }) => {
    await phone.fillEntry({ kind: 'Deposit' });
    expect(await phone.title()).toBe('New deposit');
    expect(await phone.quickCategories()).toEqual(['Акции/Фондове', 'Злато', 'Кеш']);
    await phone.addDeposit({ amount: 300, type: 'Злато' });
    expect(budget.deposits()).toEqual([{ date: TODAY, amount: 300, type: 'Злато', note: '' }]);
  });

  test('income and deposits have no one-off flag', async ({ phone }) => {
    await phone.fillEntry({ kind: 'Income' });
    await expect(phone.screen().getByRole('button', { name: 'One-off' })).toHaveCount(0);
  });

  test('switching back to Expense shows the expense categories again', async ({ phone }) => {
    await phone.fillEntry({ kind: 'Income', choice: 'бонуси' });
    await phone.chooseKind('Expense');
    expect(await phone.title()).toBe('New expense');
    expect(await phone.quickCategories()).toContain('храна');
    await expect(phone.saveButton()).toHaveText('Choose a category');
  });
});

test.describe('keypad', () => {
  test('types euros and up to two decimals', async ({ phone }) => {
    await phone.goTo('new');
    await phone.pressKeys('1', '2', ',', '5', '0', '7');
    expect(await phone.shownAmount()).toBe('12.50€');
  });

  test('allows only one decimal point, and a leading point means 0.', async ({ phone }) => {
    await phone.goTo('new');
    await phone.pressKeys(',', '5', ',', '5');
    expect(await phone.shownAmount()).toBe('0.55€');
  });

  test('deletes the last digit, back to 0', async ({ phone }) => {
    await phone.goTo('new');
    await phone.pressKeys('4', '2', 'del');
    expect(await phone.shownAmount()).toBe('4€');
    await phone.pressKeys('del', 'del');
    expect(await phone.shownAmount()).toBe('0€');
  });

  test('stops at eight digits', async ({ phone }) => {
    await phone.goTo('new');
    await phone.pressKeys('1', '2', '3', '4', '5', '6', '7', '8', '9');
    expect(await phone.shownAmount()).toBe('12345678€');
  });

  test('a computer keyboard works too: digits, point, backspace and Enter to save', async ({ phone, budget }) => {
    await phone.goTo('new');
    await phone.chooseCategory('храна');
    await phone.page.keyboard.type('7.259');
    await phone.page.keyboard.press('Backspace');
    expect(await phone.shownAmount()).toBe('7.2€');
    await phone.page.keyboard.press('Enter');
    await phone.expectToast('Saved: 7.20 € · храна');
    expect(budget.expenses()[0].amount).toBe(7.2);
  });
});

test.describe('quick category buttons', () => {
  const day = (d) => '2026-03-' + String(d).padStart(2, '0');

  test('show the seven most used categories of the last 90 days, most used first', async ({ phone, budget }) => {
    const uses = { 'почивки': 5, 'училище': 4, 'лекарства': 3, 'спорт': 2, 'други': 1 };
    let d = 1;
    for (const [category, n] of Object.entries(uses)) for (let i = 0; i < n; i++) budget.addExpense({ date: day(d++ % 17 + 1), amount: 1, category });
    budget.addExpense({ date: '2025-11-01', amount: 1, category: 'кола – ремонт' }); // too long ago
    await phone.refreshCategories();
    await phone.goTo('new');
    expect(await phone.quickCategories()).toEqual(['почивки', 'училище', 'лекарства', 'спорт', 'други', 'храна', 'битови']);
  });

  test('a category picked under More… takes the last button', async ({ phone }) => {
    await phone.goTo('new');
    await phone.chooseCategory('лекарства');
    const quick = await phone.quickCategories();
    expect(quick).toHaveLength(7);
    expect(quick[6]).toBe('лекарства');
  });

  test('can follow the sheet order instead (Settings)', async ({ phone, budget }) => {
    for (let i = 0; i < 3; i++) budget.addExpense({ date: day(i + 1), amount: 1, category: 'почивки' });
    await phone.refreshCategories();
    await phone.setSetting('Most used first', false);
    await phone.goTo('new');
    expect(await phone.quickCategories()).toEqual(['храна', 'битови', 'ток', 'вода', 'гориво', 'кола – ремонт', 'дрехи, обувки']);
  });

  test('the Expense / Income / Deposit switch can be hidden (Settings)', async ({ phone }) => {
    await phone.setSetting('Income and deposits', false);
    await phone.goTo('new');
    await expect(phone.screen().getByRole('group', { name: 'Entry type' })).toHaveCount(0);
    expect(await phone.title()).toBe('New expense');
  });
});
