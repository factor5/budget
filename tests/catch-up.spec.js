// Catching up on old expenses: the date stays, sits under the amount, Keep, the duplicate question.
// See docs/specs/catch-up-entry.md. The phones' clock is 18 March 2026 (a Wednesday).
const { test, expect } = require('./support/fixtures');

const MIN = 60 * 1000;

test.describe('the date stays', () => {
  test('several entries in a row land on the chosen date', async ({ phone, budget }) => {
    await phone.pickDate('2026-01-12');
    await phone.addExpense({ amount: 12, category: 'храна' });
    await phone.addExpense({ amount: 30, category: 'гориво' });
    await phone.addExpense({ amount: 7.5, category: 'храна' });
    expect(budget.expenses().map((e) => e.date)).toEqual(['2026-01-12', '2026-01-12', '2026-01-12']);
    expect((await phone.dateShown()).text).toBe('Mon, Jan 12');
  });

  test('income and deposits keep the date too', async ({ phone, budget }) => {
    await phone.pickDate('2026-02-01');
    await phone.addIncome({ amount: 100, source: 'бонуси' });
    await phone.addDeposit({ amount: 50, type: 'Злато' });
    expect(budget.income()[0].date).toBe('2026-02-01');
    expect(budget.deposits()[0].date).toBe('2026-02-01');
  });

  test('without a chosen date, entries are for today', async ({ phone, budget }) => {
    await phone.addExpense({ amount: 12, category: 'храна' });
    expect(await phone.dateShown()).toEqual({ text: 'Today, Mar 18', notToday: false, value: '2026-03-18' });
    expect(budget.expenses()[0].date).toBe('2026-03-18');
  });

  test('goes back to today after 10 minutes without use, with a message', async ({ phone, budget }) => {
    await phone.pickDate('2026-02-10');
    await phone.addExpense({ amount: 12, category: 'храна' });
    await phone.laterBy(11 * MIN);
    await phone.comeBackToApp();
    await expect(phone.toast()).toHaveText('Date is back to today');
    expect((await phone.dateShown()).value).toBe('2026-03-18');
    await phone.addExpense({ amount: 5, category: 'храна' });
    expect(budget.expenses().map((e) => e.date)).toEqual(['2026-02-10', '2026-03-18']);
  });

  test('also goes back while the app stays open', async ({ phone }) => {
    await phone.pickDate('2026-02-10');
    await phone.laterBy(11 * MIN);
    await expect(phone.toast()).toHaveText('Date is back to today', { timeout: 10000 });
    expect((await phone.dateShown()).notToday).toBe(false);
  });

  test('using the screen within 10 minutes keeps it', async ({ phone, budget }) => {
    await phone.pickDate('2026-02-10');
    await phone.laterBy(8 * MIN);
    await phone.typeAmount(4);
    await phone.laterBy(8 * MIN);
    await phone.comeBackToApp();
    await phone.chooseCategory('храна');
    await phone.saveEntry();
    expect(budget.expenses()[0].date).toBe('2026-02-10');
  });

  test('a fresh open starts on today', async ({ phone }) => {
    await phone.pickDate('2026-02-10');
    await phone.reload();
    expect((await phone.dateShown()).value).toBe('2026-03-18');
  });
});

test.describe('the date line', () => {
  test('shows not-today in the line, the Save button and the message', async ({ phone }) => {
    await phone.pickDate('2026-03-06');
    expect(await phone.dateShown()).toEqual({ text: 'Fri, Mar 6', notToday: true, value: '2026-03-06' });
    await phone.typeAmount(12);
    await phone.chooseCategory('храна');
    await expect(phone.saveButton()).toHaveText('Save 12 € · храна · Mar 6');
    await phone.saveEntry();
    await expect(phone.toast()).toContainText('Saved: 12.00 € · храна · Mar 6');
  });

  test('the arrows step a day, never past today', async ({ phone }) => {
    await phone.goTo('new');
    await expect(phone.nextDayButton()).toBeDisabled();
    await phone.previousDayButton().click();
    await phone.previousDayButton().click();
    expect((await phone.dateShown()).text).toBe('Mon, Mar 16');
    await phone.nextDayButton().click();
    expect((await phone.dateShown()).text).toBe('Tue, Mar 17');
    await phone.nextDayButton().click();
    expect(await phone.dateShown()).toEqual({ text: 'Today, Mar 18', notToday: false, value: '2026-03-18' });
    await expect(phone.nextDayButton()).toBeDisabled();
  });

  test('stops at 1 January of the sheet\'s year', async ({ phone }) => {
    await phone.pickDate('2026-01-02');
    await phone.previousDayButton().click();
    expect((await phone.dateShown()).value).toBe('2026-01-01');
    await expect(phone.previousDayButton()).toBeDisabled();
    await phone.pickDate('2025-12-20'); // typed into the calendar anyway
    expect((await phone.dateShown()).value).toBe('2026-01-01');
  });

  test('the date line is in Bulgarian by default', async ({ newPhone }) => {
    const phone = await newPhone({ english: false });
    await phone.dateRegion().locator('input[type="date"]').fill('2026-03-06');
    await expect(phone.dateRegion()).toContainText('Пт, 6 мар');
  });
});

test.describe('keep the category', () => {
  test('off by default: the category clears after saving', async ({ phone }) => {
    await phone.addExpense({ amount: 12, category: 'храна' });
    expect((await phone.form()).category).toBe(null);
  });

  test('on: the category stays for the next amount', async ({ phone, budget }) => {
    await phone.fillEntry({ kind: 'Expense', amount: 12, choice: 'храна', date: '2026-02-03' });
    await phone.setKeep(true);
    await phone.saveEntry();
    expect((await phone.form()).category).toBe('храна');
    await phone.typeAmount(8);
    await phone.saveEntry();
    await phone.typeAmount(3);
    await phone.saveEntry();
    expect(budget.expenses().map((e) => [e.date, e.amount, e.category])).toEqual([
      ['2026-02-03', 12, 'храна'], ['2026-02-03', 8, 'храна'], ['2026-02-03', 3, 'храна']]);
  });

  test('turns off when the date goes back to today', async ({ phone }) => {
    await phone.fillEntry({ kind: 'Expense', amount: 12, choice: 'храна', date: '2026-02-03' });
    await phone.setKeep(true);
    await phone.saveEntry();
    await phone.laterBy(11 * MIN);
    await phone.comeBackToApp();
    await expect(phone.toast()).toHaveText('Date is back to today');
    await expect(phone.keepButton()).toHaveAttribute('aria-pressed', 'false');
  });

  test('switching to income turns it off', async ({ phone }) => {
    await phone.fillEntry({ kind: 'Expense', choice: 'храна' });
    await phone.setKeep(true);
    await phone.chooseKind('Income');
    await phone.chooseKind('Expense');
    await phone.chooseCategory('храна');
    await expect(phone.keepButton()).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('duplicate check', () => {
  test('the same date, amount and category asks first; Cancel saves nothing', async ({ phone, budget }) => {
    budget.addExpense({ date: '2026-03-03', amount: 12.5, category: 'храна' });
    await phone.comeBackToApp(); // the app re-reads the sheet
    await expect(phone.page.getByRole('banner')).toContainText('March so far: 13 €');
    await phone.fillEntry({ kind: 'Expense', amount: 12.5, choice: 'храна', date: '2026-03-03' });
    await phone.dismissToast();
    await phone.saveButton().click();
    await expect(phone.duplicateQuestion()).toContainText("There's already 12.50 € · храна on Mar 3. Save it again?");
    await phone.duplicateQuestion().getByRole('button', { name: 'Cancel' }).click();
    expect(budget.expenses()).toHaveLength(1);
    expect(await phone.form()).toMatchObject({ amount: '12.5€', category: 'храна' });
  });

  test('Save again saves it', async ({ phone, budget }) => {
    budget.addExpense({ date: '2026-03-03', amount: 12.5, category: 'храна' });
    await phone.comeBackToApp(); // the app re-reads the sheet
    await expect(phone.page.getByRole('banner')).toContainText('March so far: 13 €');
    await phone.fillEntry({ kind: 'Expense', amount: 12.5, choice: 'храна', date: '2026-03-03' });
    await phone.saveDuplicate('again');
    expect(budget.expenses()).toHaveLength(2);
  });

  test('also asks for an entry still waiting on the phone', async ({ phone, budget }) => {
    await phone.goOffline();
    await phone.addExpense({ amount: 9, category: 'храна' });
    await phone.fillEntry({ kind: 'Expense', amount: 9, choice: 'храна' });
    await phone.saveDuplicate('cancel');
    await phone.goOnline();
    await phone.waitUntilSynced();
    expect(budget.expenses()).toHaveLength(1);
  });

  test('a different date or amount saves without asking', async ({ phone, budget }) => {
    budget.addExpense({ date: '2026-02-03', amount: 12.5, category: 'храна' });
    await phone.addExpense({ amount: 12.5, category: 'храна', date: '2026-02-04' });
    await phone.addExpense({ amount: 12, category: 'храна', date: '2026-02-03' });
    await phone.addExpense({ amount: 12.5, category: 'гориво', date: '2026-02-03' });
    expect(budget.expenses()).toHaveLength(4);
  });
});
