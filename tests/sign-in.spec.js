// Google sign-in lasts an hour; after that, or if access is withdrawn, nothing typed is lost.
const { test, expect } = require('./support/fixtures');

const HOUR = 3600 * 1000;

test('after an hour the badge asks to sign in; saving signs in again without the consent screen', async ({ phone, google, budget }) => {
  await phone.laterBy(HOUR + 1);
  await phone.comeBackToApp();
  await expect(phone.statusBadge()).toHaveText('Sign in');

  expect(await phone.addExpense({ amount: 12, category: 'храна' })).toBe('saved');
  expect(google.signIns.map((s) => s.prompt)).toEqual(['consent', '']);
  expect(budget.expenses()).toHaveLength(1);
});

test('tapping "Sign in" signs in and reloads from the sheet', async ({ phone, budget }) => {
  await phone.laterBy(HOUR + 1);
  await phone.comeBackToApp();
  budget.addExpense({ date: '2026-03-18', amount: 80, category: 'вода' });
  await phone.tapStatus();
  await phone.waitUntilSynced();
  expect(await phone.subtitle()).toBe('March so far: 80 €');
});

test('if sign-in is cancelled while saving, the entry waits on the phone', async ({ phone, google, budget }) => {
  await phone.laterBy(HOUR + 1);
  google.onNextSignIn('cancel');
  expect(await phone.addExpense({ amount: 12, category: 'храна' })).toBe('kept');
  await expect(phone.statusBadge()).toHaveText('1 waiting');
  expect(budget.expenses()).toEqual([]);

  await phone.tapStatus();
  await phone.waitUntilSynced();
  expect(budget.expenses()).toHaveLength(1);
});

test('if Google withdraws access, the entry waits and goes out after signing in again', async ({ phone, google, budget }) => {
  google.revokeAllTokens();
  expect(await phone.addExpense({ amount: 12, category: 'храна' })).toBe('kept');
  await expect(phone.statusBadge()).toHaveText('1 waiting');

  await phone.tapStatus();
  await phone.waitUntilSynced();
  expect(budget.expenses()).toHaveLength(1);
  expect(google.signIns).toHaveLength(2);
});

test('the Month screen asks to sign in when access has ended, and loads after signing in', async ({ phone, budget, google }) => {
  budget.setMonth(3, { income: 100, spending: 50 });
  google.revokeAllTokens();
  await phone.goTo('month');
  await expect(phone.screen()).toContainText('Tap "Sign in" at the top right.');
  await phone.comeBackToApp(); // the badge catches up
  await expect(phone.statusBadge()).toHaveText('Sign in');
  await phone.tapStatus();
  await phone.waitUntilSynced();
  await phone.goTo('month');
  expect((await phone.monthSummary()).income).toBe(100);
});

// Known issue: the Month screen says to tap "Sign in", but the badge keeps saying "Synced"
// until something else refreshes it. Remove test.fail() once fixed.
test('when the Month screen asks to sign in, the badge offers it straight away', async ({ phone, google }) => {
  test.fail();
  google.revokeAllTokens();
  await phone.goTo('month');
  await expect(phone.screen()).toContainText('Tap "Sign in" at the top right.');
  await expect(phone.statusBadge()).toHaveText('Sign in', { timeout: 3000 });
});

test('a Google error is shown as Google words it, and nothing changes', async ({ phone, google, budget }) => {
  budget.addExpense({ date: '2026-03-18', amount: 80, category: 'вода' });
  await phone.refreshCategories();
  google.failNextRequest(403, 'The caller does not have permission');
  expect(await phone.editEntry({ category: 'вода' }, { amount: '81' })).toBe('The caller does not have permission');
  expect(budget.expenses()[0].amount).toBe(80);
});
