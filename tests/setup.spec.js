// Getting started: connecting the app to the year's sheet, and what happens when that goes wrong.
const { test, expect } = require('./support/fixtures');
const { createBudget } = require('./support/budget');

test.describe('first run', () => {
  test('before config.js is filled in, the app says so and offers the demo', async ({ newPhone }) => {
    const phone = await newPhone({ googleSetUp: false, english: false });
    await expect(phone.screen()).toContainText('Почти готово');
    await expect(phone.screen()).toContainText('config.js');
    await phone.screen().getByRole('link', { name: 'Пробвайте демото' }).click();
    await expect(phone.statusBadge()).toHaveText('Демо');
  });

  test('asks to sign in and pick the sheet', async ({ newPhone }) => {
    const phone = await newPhone({ connect: false });
    await expect(phone.screen()).toContainText('Connect your sheet');
    await expect(phone.screen()).toContainText('The app only sees the files you pick here.');
    await expect(phone.statusBadge()).toBeHidden();
  });

  test('connecting asks Google only for the files the person picks, and loads the categories', async ({ newPhone, google, budget }) => {
    const phone = await newPhone({ connect: false });
    await phone.connect(budget.title);

    expect(google.signIns).toEqual([{ prompt: 'consent', scope: 'https://www.googleapis.com/auth/drive.file' }]);
    expect(await phone.quickCategories()).toEqual(['храна', 'битови', 'ток', 'вода', 'гориво', 'кола – ремонт', 'дрехи, обувки']);
    expect(await phone.subtitle()).toBe('March so far: 0 €');
    await phone.goTo('settings');
    await expect(phone.screen()).toContainText(budget.title);
  });

  test('the connection is remembered when the app is opened again', async ({ phone, google, budget }) => {
    budget.addExpense({ date: '2026-03-17', amount: 40, category: 'храна' });
    await phone.reload();
    await phone.waitUntilSynced();
    expect(google.signIns).toHaveLength(1);
    expect(await phone.subtitle()).toBe('March so far: 40 €');
  });

  test('closing the file picker leaves the app as it was', async ({ newPhone }) => {
    const phone = await newPhone({ connect: false });
    await phone.screen().getByRole('button', { name: 'Sign in and pick a sheet' }).click();
    await phone.pickInGooglePicker(null);
    await expect(phone.screen()).toContainText('Connect your sheet');
    await expect(phone.toast()).toBeHidden();
  });

  test('closing the Google sign-in window says sign-in was cancelled', async ({ newPhone, google }) => {
    const phone = await newPhone({ connect: false });
    google.onNextSignIn('cancel');
    await phone.screen().getByRole('button', { name: 'Sign in and pick a sheet' }).click();
    await phone.expectToast('Sign-in was cancelled.');
    await expect(phone.screen()).toContainText('Connect your sheet');
  });

  test('a sheet in the old format is refused, naming the missing tabs', async ({ newPhone, google }) => {
    createBudget(google, 'budget 2025 (old)', { withoutTabs: ['Баланс', 'Инвестиции'] });
    const phone = await newPhone({ connect: false });
    await phone.screen().getByRole('button', { name: 'Sign in and pick a sheet' }).click();
    await phone.pickInGooglePicker('budget 2025 (old)');
    await phone.expectToast("This sheet isn't in the new format (missing: Инвестиции, Баланс).");
    await expect(phone.screen()).toContainText('Connect your sheet');
  });

  test('connecting needs internet', async ({ newPhone }) => {
    const phone = await newPhone({ connect: false });
    await phone.goOffline();
    await phone.screen().getByRole('button', { name: 'Sign in and pick a sheet' }).click();
    await phone.expectToast('No internet.');
  });
});
