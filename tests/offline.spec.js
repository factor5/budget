// Without internet: entries wait on the phone and are sent later, in order, without being lost.
const { test, expect } = require('./support/fixtures');

test('an entry saved offline waits on the phone and is sent when back online', async ({ phone, budget }) => {
  await phone.goOffline();
  await expect(phone.statusBadge()).toHaveText('Offline');

  expect(await phone.addExpense({ amount: 12, category: 'храна' })).toBe('kept');
  await phone.expectToast("Kept on the phone: 12.00 € · храна. It'll be sent when you're online.");
  await expect(phone.statusBadge()).toHaveText('1 waiting');
  expect(budget.expenses()).toEqual([]);

  await phone.goOnline();
  await phone.waitUntilSynced();
  expect(budget.expenses()).toEqual([expect.objectContaining({ amount: 12, category: 'храна' })]);
});

test('waiting entries are listed on Recent, and cannot be edited yet', async ({ phone }) => {
  await phone.goOffline();
  await phone.addExpense({ amount: 12, category: 'храна', note: 'пазар' });
  await phone.addExpense({ amount: 5, category: 'вода' });
  await phone.goTo('recent');
  await expect(phone.screen()).toContainText('2 entries waiting to be sent');
  expect((await phone.recentEntries()).map(({ category, details, waiting }) => ({ category, details, waiting }))).toEqual([
    { category: 'храна', details: 'пазар · waiting for connection', waiting: true },
    { category: 'вода', details: 'waiting for connection', waiting: true },
  ]);
});

test('several entries are sent in the order they were made, income and deposits included', async ({ phone, budget }) => {
  await phone.goOffline();
  await phone.addExpense({ amount: 1, category: 'храна' });
  await phone.addIncome({ amount: 2, source: 'бонуси' });
  await phone.addExpense({ amount: 3, category: 'ток' });
  await phone.addDeposit({ amount: 4, type: 'Кеш' });
  await expect(phone.statusBadge()).toHaveText('4 waiting');

  await phone.goOnline();
  await phone.waitUntilSynced();
  expect(budget.expenses().map((e) => e.amount)).toEqual([1, 3]);
  expect(budget.income().map((e) => e.amount)).toEqual([2]);
  expect(budget.deposits().map((e) => e.amount)).toEqual([4]);
});

test('waiting entries count in the month total in the header', async ({ phone }) => {
  await phone.goOffline();
  await phone.addExpense({ amount: 30, category: 'храна' });
  expect(await phone.subtitle()).toBe('March so far: 30 €');
});

test('if Google fails, the entry waits; tapping the badge sends it', async ({ phone, google, budget }) => {
  google.failNextRequest(503, 'The service is currently unavailable.');
  expect(await phone.addExpense({ amount: 12, category: 'храна' })).toBe('kept');
  await expect(phone.statusBadge()).toHaveText('1 waiting');
  expect(budget.expenses()).toEqual([]);

  await phone.dismissToast();
  await phone.tapStatus();
  await phone.expectToast('Sent: 1');
  await phone.waitUntilSynced();
  expect(budget.expenses()).toHaveLength(1);
});

test('the Send button on Recent sends waiting entries', async ({ phone, google, budget }) => {
  google.failNextRequest(503);
  await phone.addExpense({ amount: 12, category: 'храна' });
  await phone.goTo('recent');
  await phone.screen().getByRole('button', { name: 'Send' }).click();
  await phone.waitUntilSynced();
  expect(budget.expenses()).toHaveLength(1);
  await expect(phone.screen()).not.toContainText('waiting to be sent');
});

test('waiting entries survive closing the app, and go out the next time it opens', async ({ phone, google, budget }) => {
  google.failNextRequest(503);
  await phone.addExpense({ amount: 12, category: 'храна' });
  await phone.reload();
  await phone.waitUntilSynced();
  expect(budget.expenses()).toEqual([expect.objectContaining({ amount: 12, category: 'храна' })]);
});

test('an entry is never sent twice', async ({ phone, budget }) => {
  await phone.goOffline();
  await phone.addExpense({ amount: 12, category: 'храна' });
  await phone.goOnline();
  await phone.waitUntilSynced();
  await phone.comeBackToApp();
  await phone.reload();
  await phone.waitUntilSynced();
  expect(budget.expenses()).toHaveLength(1);
});
