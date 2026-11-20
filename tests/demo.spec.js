// Demo mode (?demo=1): sample data to try the app, never touching Google.
const { test, expect } = require('./support/fixtures');

test('the demo works fully with sample data and never contacts Google', async ({ newPhone, google }) => {
  const phone = await newPhone({ demo: true });
  await expect(phone.statusBadge()).toHaveText('Demo');

  expect(await phone.addExpense({ amount: 12, category: 'храна', note: 'демо' })).toBe('saved');
  await phone.goTo('recent');
  await expect(phone.entryRow({ category: 'храна', amount: 12 })).toBeVisible();
  expect((await phone.recentEntries()).length).toBeGreaterThan(10);

  await phone.goTo('month');
  const month = await phone.monthSummary();
  expect(month.income).toBeGreaterThan(0);
  expect(month.groups.map((g) => g.group)).toContain('Food');

  await phone.addIncome({ amount: 100, source: 'бонуси' });
  await phone.addDeposit({ amount: 50, type: 'Злато' });

  expect(google.apiCalls()).toEqual([]);
  expect(google.signIns).toEqual([]);
});

test('entries in the demo can be changed and deleted', async ({ newPhone }) => {
  const phone = await newPhone({ demo: true });
  await phone.addExpense({ amount: 12.34, category: 'храна', note: 'за промяна' });
  expect(await phone.editEntry({ category: 'храна', amount: 12.34 }, { amount: '43.21' })).toBe('Entry updated.');
  await expect(phone.entryRow({ category: 'храна', amount: 43.21 })).toBeVisible();
  expect(await phone.deleteEntry({ category: 'храна', amount: 43.21 })).toBe('Entry deleted.');
  await expect(phone.entryRow({ category: 'храна', amount: 43.21 })).toHaveCount(0);
});

test('the demo has no sheet settings, and Exit demo goes back to the real app untouched', async ({ newPhone }) => {
  const phone = await newPhone({ demo: true });
  await phone.addExpense({ amount: 12, category: 'храна' });
  await phone.goTo('settings');
  await expect(phone.screen().getByRole('button', { name: 'New year from template' })).toHaveCount(0);
  await expect(phone.screen().getByRole('button', { name: 'Sign out of Google' })).toHaveCount(0);
  await phone.screen().getByRole('link', { name: 'Exit demo' }).click();
  await expect(phone.screen()).toContainText('Connect your sheet');
});

test('the demo keeps its entries apart from the real sheet', async ({ phone, newPhone, budget }) => {
  await phone.addExpense({ amount: 1, category: 'храна' });
  await phone.page.goto('/index.html?demo=1');
  await phone.addExpense({ amount: 999, category: 'храна' });
  await phone.page.goto('/index.html');
  await phone.waitUntilSynced();
  expect(budget.expenses().map((e) => e.amount)).toEqual([1]);
  expect(await phone.subtitle()).toBe('March so far: 1 €');
});
