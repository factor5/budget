// The Month screen: the month's statement and spending by group, as the Баланс tab works them out.
const { test, expect } = require('./support/fixtures');

const MARCH = {
  income: 5407, spending: 3460, oneOff: 1420, invested: 300,
  groups: { 'Храна': { amount: 380, average: 410 }, 'Дом': { amount: 1650, average: 600 }, 'Коли': { amount: 273, average: 250 } },
};

test('shows this month’s statement from the Баланс tab', async ({ phone, budget }) => {
  budget.setMonth(3, MARCH);
  await phone.goTo('month');
  expect(await phone.title()).toBe('March 2026');
  expect(await phone.monthPeriod()).toBe('to date');
  expect(await phone.monthSummary()).toEqual({
    income: 5407, spending: 3460, regular: 2040, oneOff: 1420, left: 1947,
    footnote: '36% of income · invested 300 €',
    groups: [
      { group: 'Home', amount: 1650, average: 600 },
      { group: 'Food', amount: 380, average: 410 },
      { group: 'Cars', amount: 273, average: 250 },
    ],
  });
});

test('earlier months show the whole month, and the arrows stop at January and December', async ({ phone, budget }) => {
  budget.setMonth(1, { income: 4000, spending: 3000 }).setMonth(2, { income: 5000, spending: 4500 }).setMonth(3, MARCH);
  await phone.goTo('month');
  await phone.previousMonth();
  expect(await phone.title()).toBe('February 2026');
  expect(await phone.monthPeriod()).toBe('whole month');
  expect(await phone.monthSummary()).toMatchObject({ income: 5000, spending: 4500, left: 500 });
  await phone.previousMonth();
  expect(await phone.monthSummary()).toMatchObject({ income: 4000, left: 1000 });
  await expect(phone.screen().getByRole('button', { name: 'Previous month' })).toBeDisabled();
  for (let i = 0; i < 11; i++) await phone.nextMonth();
  expect(await phone.title()).toBe('December 2026');
  await expect(phone.screen().getByRole('button', { name: 'Next month' })).toBeDisabled();
});

test('a month that spent more than it earned shows a negative balance', async ({ phone, budget }) => {
  budget.setMonth(3, { income: 1000, spending: 1500 });
  await phone.goTo('month');
  expect(await phone.monthSummary()).toMatchObject({ left: -500, footnote: '-50% of income' });
});

test('without income there is no percentage', async ({ phone, budget }) => {
  budget.setMonth(3, { income: 0, spending: 200 });
  await phone.goTo('month');
  expect((await phone.monthSummary()).footnote).toBe('');
});

test('after saving an entry the month is read again', async ({ phone, budget }) => {
  budget.setMonth(3, MARCH);
  await phone.goTo('month');
  expect((await phone.monthSummary()).spending).toBe(3460);
  // The sheet's formulas update when the entry arrives.
  budget.setMonth(3, { ...MARCH, spending: 3500 });
  await phone.addExpense({ amount: 40, category: 'храна' });
  await phone.goTo('month');
  expect((await phone.monthSummary()).spending).toBe(3500);
});

test('the month needs internet the first time', async ({ phone, budget }) => {
  budget.setMonth(3, MARCH);
  await phone.goOffline();
  await phone.goTo('month');
  await expect(phone.screen()).toContainText('The month needs internet to load.');
  await phone.goOnline();
  expect((await phone.monthSummary()).income).toBe(5407);
});

test('an error from Google is shown in place of the month', async ({ phone, google }) => {
  google.failAllRequests(500, 'Internal error encountered.');
  await phone.goTo('month');
  await expect(phone.screen()).toContainText('Internal error encountered.');
});

// Known issue: after a failed load the Month screen immediately loads again, and again —
// hundreds of requests a second while Google keeps failing, which uses up the Sheets API quota.
// Remove test.fail() once fixed.
test('a lasting Google error does not make the app ask Google over and over', async ({ phone, google }) => {
  test.fail();
  google.failAllRequests(500, 'Internal error encountered.');
  const before = google.apiCalls().length;
  await phone.goTo('month');
  await expect(phone.screen()).toContainText('Internal error encountered.');
  await phone.page.waitForTimeout(2000);
  expect(google.apiCalls().length - before).toBeLessThan(5);
});
