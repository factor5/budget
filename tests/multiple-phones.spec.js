// Two phones on the same sheet: nobody's entry is overwritten, and changes land on the right row.
const { test, expect } = require('./support/fixtures');

test('two phones saving at the same moment each get their own row', async ({ phone, google, budget }) => {
  budget.addExpense({ date: '2026-03-01', amount: 100, category: 'ток' });
  // The other phone's entry reaches the sheet between this phone finding the first empty row and writing to it.
  google.beforeNextWrite(() => budget.addExpense({ date: '2026-03-18', amount: 55, category: 'гориво', car: 'ML', note: 'other phone' }));
  await phone.addExpense({ amount: 12, category: 'храна', note: 'this phone' });
  expect(budget.expenses().map((e) => e.note).sort()).toEqual(['', 'other phone', 'this phone']);
});

test('what one phone saves shows on the other when it comes back to the app', async ({ phone, newPhone }) => {
  const other = await newPhone();
  await other.addExpense({ amount: 33, category: 'вода', note: 'from the other phone' });

  await phone.comeBackToApp();
  await expect(phone.page.getByRole('banner')).toContainText('March so far: 33 €');
  await phone.goTo('recent');
  await expect(phone.entryRow({ category: 'вода', amount: 33 })).toBeVisible();
});

// Known issue: coming back to the app reloads the entries but leaves an open Recent list as it was,
// until you switch tabs. Remove test.fail() once fixed; the test will then guard the fix.
test('an open Recent list updates when coming back to the app', async ({ phone, newPhone }) => {
  test.fail();
  await phone.goTo('recent');
  const other = await newPhone();
  await other.addExpense({ amount: 33, category: 'вода' });
  await phone.comeBackToApp();
  await expect(phone.entryRow({ category: 'вода', amount: 33 })).toBeVisible({ timeout: 3000 });
});

test('both phones offline: everything arrives once both are back', async ({ phone, newPhone, budget }) => {
  const other = await newPhone();
  await phone.goOffline(); await other.goOffline();
  await phone.addExpense({ amount: 1, category: 'храна' });
  await other.addExpense({ amount: 2, category: 'храна' });
  await phone.addExpense({ amount: 3, category: 'храна' });
  await other.goOnline(); await other.waitUntilSynced();
  await phone.goOnline(); await phone.waitUntilSynced();
  expect(budget.expenses().map((e) => e.amount).sort()).toEqual([1, 2, 3]);
});

test.describe('the sheet changed since this phone loaded it', () => {
  test.use({
    budgetOptions: {
      expenses: [
        { date: '2026-03-10', amount: 40, category: 'храна' },
        { date: '2026-03-12', amount: 95, category: 'гориво', car: 'Тойота' },
        { date: '2026-03-15', amount: 15, category: 'битови' },
      ],
    },
  });

  test('editing still changes the right entry when rows above it were deleted', async ({ phone, budget }) => {
    await phone.openEntry({ category: 'битови' });
    budget.deleteExpense({ category: 'храна' }); // on another phone
    await phone.closeSheet();
    expect(await phone.editEntry({ category: 'битови' }, { amount: '16' })).toBe('Entry updated.');
    expect(budget.expenses()).toEqual([
      expect.objectContaining({ category: 'гориво', amount: 95 }),
      expect.objectContaining({ category: 'битови', amount: 16 }),
    ]);
  });

  test('editing still changes the right entry when rows were added above it', async ({ phone, budget }) => {
    await phone.goTo('recent');
    budget.insertExpenseAtTop({ date: '2026-03-01', amount: 7, category: 'вода' }); // in Google Sheets
    await phone.editEntry({ category: 'гориво' }, { note: 'сменена' });
    expect(budget.expenses()).toEqual([
      expect.objectContaining({ category: 'вода', note: '' }),
      expect.objectContaining({ category: 'храна', note: '' }),
      expect.objectContaining({ category: 'гориво', note: 'сменена' }),
      expect.objectContaining({ category: 'битови', note: '' }),
    ]);
  });

  test('deleting still removes the right entry when rows moved', async ({ phone, budget }) => {
    await phone.goTo('recent');
    budget.deleteExpense({ category: 'храна' });
    expect(await phone.deleteEntry({ category: 'битови' })).toBe('Entry deleted.');
    expect(budget.expenses()).toEqual([expect.objectContaining({ category: 'гориво' })]);
  });

  test('an entry deleted on another phone is not touched; the list refreshes', async ({ phone, budget }) => {
    await phone.goTo('recent');
    budget.deleteExpense({ category: 'гориво' });
    const msg = await phone.editEntry({ category: 'гориво' }, { amount: '100' });
    expect(msg).toBe('This entry was changed on another device. The list has been refreshed; try again.');
    expect(budget.expenses().map((e) => e.category)).toEqual(['храна', 'битови']);
    await expect(phone.entryRow({ category: 'гориво' })).toHaveCount(0);
  });

  test('an entry changed on another phone is not overwritten', async ({ phone, budget }) => {
    await phone.goTo('recent');
    budget.editExpense({ category: 'храна' }, { amount: 44 });
    expect(await phone.deleteEntry({ category: 'храна', amount: 40 })).toMatch(/changed on another device/);
    expect(budget.expenses()[0]).toMatchObject({ category: 'храна', amount: 44 });
    await expect(phone.entryRow({ category: 'храна', amount: 44 })).toBeVisible();
  });
});

test('of two identical entries, the one the person tapped is changed', async ({ phone, budget }) => {
  budget
    .addExpense({ date: '2026-03-18', amount: 5, category: 'храна' })
    .addExpense({ date: '2026-03-18', amount: 7, category: 'вода' })
    .addExpense({ date: '2026-03-18', amount: 5, category: 'храна' });
  await phone.refreshCategories();
  await phone.goTo('recent');
  // Newest first: the first "храна 5" in the list is the bottom row of the sheet.
  await phone.entryRow({ category: 'храна', amount: 5 }).first().getByRole('button').click();
  await phone.editSheet().getByRole('textbox', { name: 'Note' }).fill('this one');
  await phone.editSheet().getByRole('button', { name: 'Save changes' }).click();
  await phone.expectToast('Entry updated.');
  expect(budget.expenses().map((e) => e.note)).toEqual(['', '', 'this one']);
});
