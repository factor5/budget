// Search on the Recent screen: finding expenses by note or car. Spec: docs/specs/search.md
const { test, expect } = require('./support/fixtures');

const expenses = [
  { date: '2026-01-12', amount: 400, category: 'гориво', car: 'Тойота', note: 'Зимни ГУМИ' },
  { date: '2026-02-03', amount: 125, category: 'храна', note: 'пазар' },
  { date: '2026-02-20', amount: 60, category: 'гориво', car: 'ML', note: 'смяна на гуми' },
  { date: '2026-03-10', amount: 1420, category: 'битови', oneOff: true, note: 'врати' },
  { date: '2026-03-15', amount: 95, category: 'гориво', car: 'Тойота', note: 'пълен резервоар' },
  { date: '2026-03-17', amount: 30, category: 'храна', note: 'гумени ръкавици' },
];
const found = async (phone) => (await phone.recentEntries()).map((e) => e.amount);

test.describe('finding entries', () => {
  test.use({ budgetOptions: { expenses } });

  test('finds part of a word in the note, ignoring case, across the whole year', async ({ phone }) => {
    await phone.search('гуми');
    expect(await found(phone)).toEqual([60, 400]);
    await phone.clearSearch();
    await phone.search('гум');
    expect(await found(phone)).toEqual([30, 60, 400]);
  });

  test('finds the car', async ({ phone }) => {
    await phone.search('тойота');
    expect(await found(phone)).toEqual([95, 400]);
  });

  test('does not match the category name', async ({ phone }) => {
    await phone.search('храна');
    await expect(phone.screen()).toContainText('Nothing matches "храна".');
  });

  test('several words must all appear, in any order', async ({ phone }) => {
    await phone.search('тойота гуми');
    expect(await found(phone)).toEqual([400]);
    await phone.clearSearch();
    await phone.search('гуми   зимни');
    expect(await found(phone)).toEqual([400]);
  });

  test('spaces alone are no search', async ({ phone }) => {
    await phone.search('   ');
    expect(await phone.title()).toBe('Recent entries');
    expect(await phone.recentEntries()).toHaveLength(6);
  });

  test('shows the count and total, and the title says Entries', async ({ phone }) => {
    await phone.search('гуми');
    expect(await phone.recentSummary()).toEqual({ count: 2, total: 460 });
    expect(await phone.title()).toBe('Entries');
  });

  test('the matched text is bold', async ({ phone }) => {
    await phone.search('гуми той');
    expect(await phone.recentHighlights()).toEqual([['Той', 'ГУМИ']]);
    expect((await phone.recentEntries())[0].details).toBe('Тойота · Зимни ГУМИ');
  });

  test('a chosen month narrows the search to it; Latest becomes Whole year', async ({ phone }) => {
    await phone.goTo('recent');
    expect(await phone.recentSelectedMonth()).toBe('Latest');
    await phone.search('гум');
    expect(await phone.recentSelectedMonth()).toBe('Whole year');
    await phone.filterRecent({ month: 'February' });
    expect(await found(phone)).toEqual([60]);
    expect(await phone.recentMonthChoices()).toEqual(['Whole year', 'March', 'February', 'January']);
    await phone.clearSearch();
    expect(await phone.recentMonthChoices()).toEqual(['Latest', 'March', 'February', 'January']);
  });

  test('a chosen category narrows it too', async ({ phone }) => {
    await phone.goTo('recent');
    await phone.filterRecent({ category: 'гориво' });
    await phone.search('гум');
    expect(await found(phone)).toEqual([60, 400]);
  });

  test('nothing found offers the whole year when a filter is on, and keeps the text', async ({ phone }) => {
    await phone.goTo('recent');
    await phone.filterRecent({ month: 'March', category: 'гориво' });
    await phone.search('гуми');
    await expect(phone.screen()).toContainText('Nothing matches "гуми".');
    await phone.screen().getByRole('button', { name: 'Search the whole year' }).click();
    expect(await found(phone)).toEqual([60, 400]);
    expect(await phone.recentSelectedMonth()).toBe('Whole year');
    expect(await phone.recentCategoryChoices()).toContain('All');
    await expect(phone.searchBox()).toHaveValue('гуми');
  });

  test('without a filter, nothing found has no button', async ({ phone }) => {
    await phone.search('велосипед');
    await expect(phone.screen()).toContainText('Nothing matches "велосипед".');
    await expect(phone.screen().getByRole('button', { name: 'Search the whole year' })).toHaveCount(0);
  });

  test('the ✕ clears the search and shows the latest entries again', async ({ phone }) => {
    await phone.search('гуми');
    await phone.clearSearch();
    await expect(phone.searchBox()).toHaveValue('');
    await expect(phone.searchBox()).toBeFocused();
    expect(await phone.recentEntries()).toHaveLength(6);
    expect(await phone.title()).toBe('Recent entries');
    await expect(phone.screen().getByRole('button', { name: 'Clear search' })).toBeHidden();
  });

  test('the box keeps the keyboard and cursor while typing, and when the list is redrawn by a refresh', async ({ phone, budget }) => {
    await phone.search('гу');
    await expect(phone.searchBox()).toBeFocused();
    await phone.searchBox().pressSequentially('ми');
    await expect(phone.searchBox()).toBeFocused();
    await expect(phone.searchBox()).toHaveValue('гуми');
    expect(await phone.searchBox().evaluate((el) => el.selectionStart)).toBe(4);

    budget.addExpense({ date: '2026-03-18', amount: 7, category: 'гориво', note: 'гуми лепенки' });
    await phone.comeBackToApp();
    await expect.poll(() => found(phone)).toEqual([7, 60, 400]);
    await expect(phone.searchBox()).toBeFocused();
  });

  test('Enter puts the keyboard away', async ({ phone }) => {
    await phone.search('гуми');
    await phone.searchBox().press('Enter');
    await expect(phone.searchBox()).not.toBeFocused();
    expect(await found(phone)).toEqual([60, 400]);
  });

  test('tapping a result puts the keyboard away and opens it; the search stays after the change', async ({ phone, budget }) => {
    await phone.search('гуми');
    await phone.entryRow({ category: 'гориво', amount: 60 }).getByRole('button').click();
    await expect(phone.editSheet()).toBeVisible();
    await expect(phone.searchBox()).not.toBeFocused();
    await phone.editSheet().getByRole('textbox', { name: 'Amount (€)' }).fill('65');
    await phone.editSheet().getByRole('button', { name: 'Save changes' }).click();
    await phone.expectToast('Entry updated.');
    expect(budget.expenses()[2].amount).toBe(65);
    await expect(phone.searchBox()).toHaveValue('гуми');
    expect(await found(phone)).toEqual([65, 400]);
  });

  test('the search stays after deleting a result and across tabs, and is gone after a restart', async ({ phone }) => {
    await phone.search('гуми');
    expect(await phone.deleteEntry({ category: 'гориво', amount: 60 })).toBe('Entry deleted.');
    expect(await found(phone)).toEqual([400]);
    await phone.goTo('settings');
    await phone.goTo('recent');
    await expect(phone.searchBox()).toHaveValue('гуми');
    expect(await found(phone)).toEqual([400]);
    await phone.reload();
    await phone.goTo('recent');
    await expect(phone.searchBox()).toHaveValue('');
  });

  test('works offline and includes entries still waiting to be sent', async ({ phone }) => {
    await phone.goOffline();
    await phone.addExpense({ amount: 12, category: 'гориво', car: 'Тойота', note: 'гуми помпа' });
    await phone.search('гуми');
    expect((await phone.recentEntries()).map(({ amount, waiting }) => ({ amount, waiting }))).toEqual([
      { amount: 12, waiting: true },
      { amount: 60, waiting: false },
      { amount: 400, waiting: false },
    ]);
    expect(await phone.recentSummary()).toEqual({ count: 3, total: 472 });
  });
});

test('the whole year is searched past the 80 latest entries', async ({ phone, budget }) => {
  budget.addExpense({ date: '2026-01-02', amount: 300, category: 'гориво', note: 'гуми' });
  for (let i = 0; i < 85; i++) budget.addExpense({ date: '2026-03-' + String(1 + (i % 18)).padStart(2, '0'), amount: 1, category: 'храна', note: 'хляб' });
  await phone.refreshCategories();
  await phone.goTo('recent');
  expect(await phone.recentEntries()).toHaveLength(80);
  await phone.search('гуми');
  expect(await found(phone)).toEqual([300]);
  await phone.clearSearch();
  await phone.search('хляб');
  expect(await phone.recentEntries()).toHaveLength(85);
});

test('in Bulgarian', async ({ newPhone }) => {
  const phone = await newPhone({ english: false });
  await phone.goTo('recent');
  await expect(phone.searchBox()).toHaveAttribute('placeholder', 'Търси в бележки и коли');
  await expect(phone.screen().getByRole('combobox', { name: 'Категория' }).locator('option').first()).toHaveText('Всички');
  await phone.searchBox().pressSequentially('гуми');
  await expect(phone.screen()).toContainText('Нищо не съвпада с „гуми“.');
  expect(await phone.screen().getByRole('combobox', { name: 'Месец' }).evaluate((s) => s.options[s.selectedIndex].text)).toBe('Цялата година');
});

test('a long result is drawn 200 at a time; the summary counts them all and a day is never split', async ({ phone, budget }) => {
  // 250 matches: 10 a day from 1 to 25 March, so the cut after 200 falls between two days.
  for (let d = 1; d <= 25; d++) for (let i = 0; i < 10; i++) budget.addExpense({ date: '2026-03-' + String(d).padStart(2, '0'), amount: 2, category: 'храна', note: 'хляб' });
  budget.addExpense({ date: '2026-03-06', amount: 2, category: 'храна', note: 'хляб' });
  await phone.refreshCategories();
  await phone.search('хляб');
  expect(await phone.recentSummary()).toEqual({ count: 251, total: 502 });
  // 200 would end in the middle of 6 March (11 entries): the whole day is shown.
  expect(await phone.recentEntries()).toHaveLength(201);
  expect((await phone.recentDays()).pop()).toEqual({ day: 'March 6', total: 22 });
  await phone.screen().getByRole('button', { name: 'Show 50 more (50 left)' }).click();
  expect(await phone.recentEntries()).toHaveLength(251);
  await expect(phone.screen().getByRole('button', { name: /more/ })).toHaveCount(0);
  await expect(phone.searchBox()).toHaveValue('хляб');
});
