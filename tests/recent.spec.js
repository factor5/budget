// The Recent screen: browsing expenses, filtering, and changing or deleting one.
const { test, expect } = require('./support/fixtures');

test.describe('browsing', () => {
  test.use({
    budgetOptions: {
      expenses: [
        { date: '2026-01-10', amount: 50, category: 'ток' },
        { date: '2026-02-03', amount: 125, category: 'храна' },
        { date: '2026-02-05', amount: 95, category: 'гориво', car: 'Тойота' },
        { date: '2026-03-17', amount: 20, category: 'вода', note: 'сметка' },
        { date: '2026-03-18', amount: 9, category: 'храна' },
        { date: '2026-03-18', amount: 1420, category: 'битови', oneOff: true, note: 'врати' },
      ],
    },
  });

  test('shows expenses newest first, by day, with day totals', async ({ phone }) => {
    await phone.goTo('recent');
    expect(await phone.title()).toBe('Recent entries');
    expect(await phone.recentDays()).toEqual([
      { day: 'Today, March 18', total: 1429 },
      { day: 'Yesterday, March 17', total: 20 },
      { day: 'February 5', total: 95 },
      { day: 'February 3', total: 125 },
      { day: 'January 10', total: 50 },
    ]);
    expect((await phone.recentEntries()).map(({ category, amount, details }) => ({ category, amount, details }))).toEqual([
      { category: 'битови', amount: 1420, details: 'one-off · врати' },
      { category: 'храна', amount: 9, details: 'No note' },
      { category: 'вода', amount: 20, details: 'сметка' },
      { category: 'гориво', amount: 95, details: 'Тойота' },
      { category: 'храна', amount: 125, details: 'No note' },
      { category: 'ток', amount: 50, details: 'No note' },
    ]);
  });

  test('income and deposits are not listed', async ({ phone, budget }) => {
    budget.addIncome({ date: '2026-03-18', amount: 5000, source: 'заплата' });
    await phone.refreshCategories();
    await phone.goTo('recent');
    expect((await phone.recentEntries()).map((e) => e.category)).not.toContain('заплата');
  });

  test('one month at a time, with the count and total', async ({ phone }) => {
    await phone.goTo('recent');
    expect(await phone.recentMonthChoices()).toEqual(['Latest', 'March 2026', 'February 2026', 'January 2026']);
    await phone.filterRecent({ month: 'February 2026' });
    expect(await phone.title()).toBe('Entries');
    expect((await phone.recentEntries()).map((e) => e.category)).toEqual(['гориво', 'храна']);
    expect(await phone.recentSummary()).toEqual({ count: 2, total: 220 });
  });

  test('the arrows step through the months', async ({ phone }) => {
    await phone.goTo('recent');
    await expect(phone.screen().getByRole('button', { name: 'Newer month' })).toBeDisabled();
    await phone.olderMonth();
    expect(await phone.recentSelectedMonth()).toBe('March 2026');
    await phone.olderMonth();
    await phone.olderMonth();
    expect(await phone.recentSelectedMonth()).toBe('January 2026');
    await expect(phone.screen().getByRole('button', { name: 'Older month' })).toBeDisabled();
    await phone.newerMonth();
    await phone.newerMonth();
    await phone.newerMonth();
    expect(await phone.recentSelectedMonth()).toBe('Latest');
  });

  test('one category at a time; the list offers only categories that were used, in sheet order', async ({ phone }) => {
    await phone.goTo('recent');
    expect(await phone.recentCategoryChoices()).toEqual(['All categories', 'храна', 'битови', 'ток', 'вода', 'гориво']);
    await phone.filterRecent({ category: 'храна' });
    expect((await phone.recentEntries()).map((e) => e.amount)).toEqual([9, 125]);
    expect(await phone.recentSummary()).toEqual({ count: 2, total: 134 });
  });

  test('month and category together, and a selection with nothing in it', async ({ phone }) => {
    await phone.goTo('recent');
    await phone.filterRecent({ month: 'March 2026', category: 'храна' });
    expect(await phone.recentSummary()).toEqual({ count: 1, total: 9 });
    await phone.filterRecent({ month: 'January 2026' });
    await expect(phone.screen()).toContainText('No entries for this selection.');
  });
});

test('an empty sheet says there are no entries yet', async ({ phone }) => {
  await phone.goTo('recent');
  await expect(phone.screen()).toContainText('No entries yet.');
});

test('Latest shows the 80 newest, and offers older ones by month', async ({ phone, budget }) => {
  for (let i = 0; i < 85; i++) budget.addExpense({ date: '2026-03-' + String(1 + (i % 18)).padStart(2, '0'), amount: 1, category: 'храна' });
  await phone.refreshCategories();
  await phone.goTo('recent');
  expect(await phone.recentEntries()).toHaveLength(80);
  await phone.screen().getByRole('button', { name: 'Older entries: pick a month' }).click();
  expect(await phone.recentSelectedMonth()).toBe('March 2026');
  expect(await phone.recentEntries()).toHaveLength(85);
});

test('last year’s sheet can be browsed through December', async ({ newPhone, google }) => {
  const { createBudget } = require('./support/budget');
  createBudget(google, 'budget 2025 (new format)', { expenses: [{ date: '2025-12-30', amount: 60, category: 'храна' }] });
  const phone = await newPhone({ sheet: 'budget 2025 (new format)' });
  await phone.goTo('recent');
  expect((await phone.recentMonthChoices()).slice(0, 3)).toEqual(['Latest', 'December 2025', 'November 2025']);
  expect(await phone.recentDays()).toEqual([{ day: 'December 30 2025', total: 60 }]);
});

test.describe('changing an entry', () => {
  test.use({
    budgetOptions: {
      expenses: [
        { date: '2026-03-10', amount: 40, category: 'храна' },
        { date: '2026-03-12', amount: 95, category: 'гориво', car: 'Тойота', note: 'пълен резервоар' },
        { date: '2026-03-15', amount: 15, category: 'битови' },
      ],
    },
  });

  test('the form shows the entry as it is', async ({ phone }) => {
    await phone.openEntry({ category: 'гориво' });
    expect(await phone.editEntryForm()).toEqual({ amount: '95.00', date: '2026-03-12', category: 'гориво', car: 'Тойота', oneOff: false, note: 'пълен резервоар' });
  });

  test('every field can be changed, and the same row in the sheet changes', async ({ phone, budget }) => {
    expect(await phone.editEntry({ category: 'гориво' }, { amount: '101.30', date: '2026-03-11', car: 'ML', oneOff: true, note: 'и масло' })).toBe('Entry updated.');
    expect(budget.expenses()).toEqual([
      { date: '2026-03-10', amount: 40, category: 'храна', car: '', oneOff: false, note: '' },
      { date: '2026-03-11', amount: 101.3, category: 'гориво', car: 'ML', oneOff: true, note: 'и масло' },
      { date: '2026-03-15', amount: 15, category: 'битови', car: '', oneOff: false, note: '' },
    ]);
    expect(await phone.recentEntries()).toContainEqual(expect.objectContaining({ category: 'гориво', amount: 101.3, details: 'ML · one-off · и масло' }));
  });

  test('moving an entry to a non-car category drops the car', async ({ phone, budget }) => {
    await phone.editEntry({ category: 'гориво' }, { category: 'храна' });
    expect(budget.expenses()[1]).toMatchObject({ category: 'храна', car: '' });
  });

  test('an amount of zero is refused', async ({ phone, budget }) => {
    expect(await phone.editEntry({ category: 'храна' }, { amount: '0' })).toBe('Enter an amount.');
    expect(budget.expenses()[0].amount).toBe(40);
  });

  test('Cancel leaves the entry as it was', async ({ phone, budget }) => {
    const before = budget.expenses();
    await phone.openEntry({ category: 'храна' });
    await phone.editSheet().getByRole('textbox', { name: 'Amount (€)' }).fill('999');
    await phone.editSheet().getByRole('button', { name: 'Cancel' }).click();
    await expect(phone.editSheet()).toBeHidden();
    expect(budget.expenses()).toEqual(before);
  });

  test('deleting asks to confirm, then removes the row', async ({ phone, budget }) => {
    await phone.openEntry({ category: 'гориво' });
    await phone.editSheet().getByRole('button', { name: 'Delete' }).click();
    await expect(phone.editSheet().getByRole('button', { name: 'Are you sure?' })).toBeVisible();
    expect(budget.expenses()).toHaveLength(3);
    await phone.closeSheet();

    expect(await phone.deleteEntry({ category: 'гориво' })).toBe('Entry deleted.');
    expect(budget.expenses().map((e) => e.category)).toEqual(['храна', 'битови']);
    expect((await phone.recentEntries()).map((e) => e.category)).toEqual(['битови', 'храна']);
  });

  test('after deleting, the next change still hits the right row', async ({ phone, budget }) => {
    await phone.deleteEntry({ category: 'храна' });
    await phone.editEntry({ category: 'битови' }, { amount: '16' });
    expect(budget.expenses()).toEqual([
      expect.objectContaining({ category: 'гориво', amount: 95 }),
      expect.objectContaining({ category: 'битови', amount: 16 }),
    ]);
  });

  test('changing and deleting need internet', async ({ phone, budget }) => {
    const before = budget.expenses();
    await phone.goTo('recent');
    await phone.goOffline();
    await phone.openEntry({ category: 'храна' });
    await expect(phone.editSheet()).toContainText('Editing and deleting need internet.');
    await phone.closeSheet();
    expect(await phone.editEntry({ category: 'храна' }, { amount: '41' })).toBe('No internet.');
    await phone.closeSheet();
    expect(await phone.deleteEntry({ category: 'храна' })).toBe('No internet.');
    expect(budget.expenses()).toEqual(before);
  });
});
