// Undo after saving: the message after each save has an Undo button for a few seconds.
// See docs/specs/undo-after-saving.md.
const { test, expect } = require('./support/fixtures');

const TODAY = '2026-03-18';
const HOUR = 3600 * 1000;

test.describe('undoing a saved entry', () => {
  test('Undo removes the expense from Записи and puts it back into the form', async ({ phone, budget }) => {
    budget.addExpense({ date: '2026-03-01', amount: 100, category: 'ток' });
    await phone.addExpense({ amount: 12.5, category: 'храна', oneOff: true, note: 'хляб' });
    await expect(phone.undoButton()).toBeVisible();

    expect(await phone.undo()).toBe('Undone: 12.50 € · храна');
    expect(budget.expenses().map((e) => e.category)).toEqual(['ток']);
    expect(await phone.form()).toEqual({ kind: 'Expense', amount: '12.5€', category: 'храна', note: 'хляб', oneOff: true });
    await expect(phone.saveButton()).toHaveText('Save 12.5 € · храна');
  });

  test('the corrected entry can be saved straight away', async ({ phone, budget }) => {
    await phone.addExpense({ amount: 54, category: 'гориво', car: 'Тойота' });
    await phone.undo();
    await phone.pressKeys('del', 'del', '4', '5');
    expect(await phone.saveEntry()).toBe('saved');
    expect(budget.expenses()).toEqual([{ date: TODAY, amount: 45, category: 'гориво', car: 'Тойота', oneOff: false, note: '' }]);
  });

  test('Undo removes income from Приходи', async ({ phone, budget }) => {
    budget.addIncome({ date: '2026-03-01', amount: 5407, source: 'заплата' });
    await phone.addIncome({ amount: 300, source: 'бонуси', note: 'март' });
    expect(await phone.undo()).toBe('Undone: 300.00 € · бонуси');
    expect(budget.income().map((e) => e.source)).toEqual(['заплата']);
    expect(await phone.form()).toMatchObject({ kind: 'Income', amount: '300€', category: 'бонуси', note: 'март' });
  });

  test('Undo removes a deposit from Инвестиции', async ({ phone, budget }) => {
    await phone.addDeposit({ amount: 200, type: 'Злато' });
    expect(budget.deposits()).toHaveLength(1);
    expect(await phone.undo()).toBe('Undone: 200.00 € · Злато');
    expect(budget.deposits()).toEqual([]);
  });

  test('the form is left alone when the next entry has been started', async ({ phone, budget }) => {
    await phone.addExpense({ amount: 12, category: 'храна' });
    await phone.typeAmount(7);
    await phone.undo();
    expect(budget.expenses()).toEqual([]);
    expect(await phone.form()).toMatchObject({ amount: '7€', category: null });
  });

  test('Undo works from another tab, and Recent and the header update', async ({ phone }) => {
    await phone.addExpense({ amount: 30, category: 'вода' });
    await phone.goTo('recent');
    await expect(phone.entryRow({ category: 'вода', amount: 30 })).toBeVisible();
    await phone.undo();
    await expect(phone.entryRow({ category: 'вода', amount: 30 })).toHaveCount(0);
    expect(await phone.subtitle()).toBe('March so far: 0 €');
  });

  test('only the latest save can be undone', async ({ phone, budget }) => {
    await phone.addExpense({ amount: 1, category: 'храна' });
    await phone.addExpense({ amount: 2, category: 'вода' });
    await phone.undo();
    expect(budget.expenses().map((e) => e.amount)).toEqual([1]);
    await expect(phone.undoButton()).toHaveCount(0);
  });
});

test.describe('finding the row', () => {
  test('the right row goes after the other phone added rows above it', async ({ phone, budget }) => {
    budget.addExpense({ date: '2026-03-01', amount: 100, category: 'ток' });
    await phone.addExpense({ amount: 12, category: 'храна', note: 'this phone' });
    budget.insertExpenseAtTop({ date: '2026-03-02', amount: 40, category: 'вода', note: 'other phone' });
    await phone.undo();
    expect(budget.expenses().map((e) => e.note)).toEqual(['other phone', '']);
  });

  test('with two identical entries, only one goes', async ({ phone, budget }) => {
    await phone.addExpense({ amount: 3.5, category: 'храна' });
    await phone.addExpense({ amount: 3.5, category: 'храна' });
    await phone.undo();
    expect(budget.expenses()).toHaveLength(1);
  });

  test('a double tap on Undo deletes only one row', async ({ phone, budget }) => {
    await phone.addExpense({ amount: 3.5, category: 'храна' });
    await phone.addExpense({ amount: 3.5, category: 'храна' });
    await phone.undoButton().evaluate((b) => { b.click(); b.click(); });
    await expect(phone.toast()).toHaveText('Undone: 3.50 € · храна');
    expect(budget.expenses()).toHaveLength(1);
  });
});

test.describe('entries waiting on the phone', () => {
  test('Undo of an entry kept offline takes it out of the queue; nothing is sent later', async ({ phone, google, budget }) => {
    await phone.goOffline();
    expect(await phone.addExpense({ amount: 12, category: 'храна' })).toBe('kept');
    await expect(phone.statusBadge()).toHaveText('1 waiting');
    expect(await phone.undo()).toBe('Undone: 12.00 € · храна');
    await expect(phone.statusBadge()).toHaveText('Offline');

    await phone.goOnline();
    await phone.waitUntilSynced();
    expect(budget.expenses()).toEqual([]);
    expect(google.apiCalls(':batchUpdate')).toEqual([]);
  });

  test('Undo tapped while the entry is being sent waits, then removes the row', async ({ phone, google, budget }) => {
    await phone.goOffline();
    await phone.addExpense({ amount: 12, category: 'храна' });
    let release, reached;
    const writing = new Promise((r) => { reached = r; });
    google.beforeNextWrite(() => { reached(); return new Promise((r) => { release = r; }); });

    await phone.goOnline();
    await writing; // the send is on its way to Google
    await phone.undoButton().click();
    await expect(phone.undoButton()).toHaveText('Undoing…');
    await expect(phone.undoButton()).toBeDisabled();
    release();

    await expect(phone.toast()).toHaveText('Undone: 12.00 € · храна');
    await phone.waitUntilSynced();
    expect(budget.expenses()).toEqual([]);
  });
});

test.describe('when Undo cannot reach Google', () => {
  test('an expense stays and the message points to Recent', async ({ phone, budget }) => {
    await phone.addExpense({ amount: 12, category: 'храна' });
    await phone.goOffline();
    expect(await phone.undo()).toBe("Couldn't undo. Delete it on Recent.");
    expect(budget.expenses()).toHaveLength(1);
    expect(await phone.form()).toMatchObject({ amount: '0€', category: null });
  });

  test('income stays and the message points to the sheet', async ({ phone, budget }) => {
    await phone.addIncome({ amount: 300, source: 'бонуси' });
    await phone.goOffline();
    expect(await phone.undo()).toBe("Couldn't undo. Fix it in the sheet (Приходи).");
    expect(budget.income()).toHaveLength(1);
  });

  test('a deposit stays and the message points to the sheet', async ({ phone, google, budget }) => {
    await phone.addDeposit({ amount: 200, type: 'Злато' });
    google.failNextRequest(503, 'The service is currently unavailable.');
    expect(await phone.undo()).toBe("Couldn't undo. Fix it in the sheet (Инвестиции).");
    expect(budget.deposits()).toHaveLength(1);
  });

  test('the row was already deleted elsewhere', async ({ phone, budget }) => {
    await phone.addExpense({ amount: 12, category: 'храна' });
    budget.deleteExpense({ amount: 12, category: 'храна' });
    expect(await phone.undo()).toBe("Couldn't undo. Delete it on Recent.");
  });
});

test.describe('signing in', () => {
  test('after the hour, Undo signs in again first and then removes the row', async ({ phone, google, budget }) => {
    await phone.addExpense({ amount: 12, category: 'храна' });
    await phone.laterBy(HOUR + 1);
    expect(await phone.undo()).toBe('Undone: 12.00 € · храна');
    expect(google.signIns.map((s) => s.prompt)).toEqual(['consent', '']);
    expect(budget.expenses()).toEqual([]);
  });

  test('if that sign-in is cancelled, the entry stays', async ({ phone, google, budget }) => {
    await phone.addExpense({ amount: 12, category: 'храна' });
    await phone.laterBy(HOUR + 1);
    google.onNextSignIn('cancel');
    expect(await phone.undo()).toBe("Couldn't undo. Delete it on Recent.");
    expect(budget.expenses()).toHaveLength(1);
  });
});

test.describe('the message', () => {
  test('shows Undo for about 6 seconds, then disappears', async ({ phone }) => {
    await phone.addExpense({ amount: 12, category: 'храна' });
    await phone.page.waitForTimeout(4500);
    await expect(phone.undoButton()).toBeVisible();
    await expect(phone.toast()).toBeHidden({ timeout: 3000 });
  });

  test('stays while a finger is on it', async ({ phone }) => {
    await phone.addExpense({ amount: 12, category: 'храна' });
    await phone.toast().hover({ position: { x: 8, y: 8 } });
    await phone.page.mouse.down();
    await phone.page.waitForTimeout(7000);
    await expect(phone.undoButton()).toBeVisible();
    await phone.page.mouse.up();
    await expect(phone.toast()).toBeHidden({ timeout: 7000 });
  });

  for (const height of [700, 915]) {
    test(`never covers the Save button, which stays above the tabs (screen ${height}px high)`, async ({ phone }) => {
      await phone.page.setViewportSize({ width: 412, height });
      await phone.addExpense({ amount: 12, category: 'храна' });
      const toast = await phone.toast().boundingBox();
      const save = await phone.saveButton().boundingBox();
      const tabs = await phone.page.getByRole('navigation').boundingBox();
      expect(toast.y + toast.height).toBeLessThanOrEqual(save.y);
      expect(save.y + save.height).toBeLessThanOrEqual(tabs.y);
      expect(tabs.y - (save.y + save.height)).toBeLessThan(20);
      await phone.typeAmount(5); // the keypad still works while the message shows
      await expect(phone.saveButton()).toHaveText('Choose a category');
      await phone.chooseCategory('вода');
      await expect(phone.saveButton()).toBeEnabled();
    });
  }

  test('an automatic refresh failing does not hide Undo', async ({ phone, google }) => {
    await phone.addExpense({ amount: 12, category: 'храна' });
    google.failNextRequest(500, 'Internal error from Google');
    await phone.comeBackToApp();
    await phone.page.waitForTimeout(500);
    await expect(phone.undoButton()).toBeVisible();
  });

  test('is in Bulgarian by default', async ({ newPhone, budget }) => {
    const phone = await newPhone({ english: false });
    await phone.page.keyboard.type('12');
    await phone.screen().getByRole('button', { name: 'храна', exact: true }).click();
    await phone.screen().getByRole('button', { name: /^Запиши/ }).click();
    await expect(phone.toast()).toContainText('Записано: 12,00 € · храна');
    await phone.toast().getByRole('button', { name: 'Отмени' }).click();
    await expect(phone.toast()).toHaveText('Отменено: 12,00 € · храна');
    expect(budget.expenses()).toEqual([]);
  });
});

test('Undo works in the demo: expenses', async ({ newPhone, google }) => {
  const phone = await newPhone({ demo: true });
  await phone.addExpense({ amount: 12.34, category: 'храна', note: 'демо' });
  expect(await phone.undo()).toBe('Undone: 12.34 € · храна');
  await phone.goTo('recent');
  await expect(phone.entryRow({ category: 'храна', amount: 12.34 })).toHaveCount(0);
  expect(google.apiCalls()).toEqual([]);
});

test('Undo works in the demo: income', async ({ newPhone, google }) => {
  const phone = await newPhone({ demo: true });
  await phone.addIncome({ amount: 100, source: 'бонуси' });
  expect(await phone.undo()).toBe('Undone: 100.00 € · бонуси');
  expect(google.apiCalls()).toEqual([]);
});
