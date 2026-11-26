// Settings: following the sheet's lists, language, theme, switching sheets, a new year, signing out, installing.
const { test, expect } = require('./support/fixtures');
const { createBudget, openBudget } = require('./support/budget');

test.describe('lists from the Категории tab', () => {
  test('Refresh picks up categories added or removed in the sheet', async ({ phone, budget }) => {
    await phone.goTo('settings');
    await expect(phone.screen()).toContainText('12 from the Категории tab');
    budget.setLists({ categories: { 'Храна': ['храна', 'ресторант'], 'Дом': ['ток'] } });
    await phone.refreshCategories();
    await expect(phone.screen()).toContainText('3 from the Категории tab');
    await phone.goTo('new');
    expect(await phone.quickCategories()).toEqual(['храна', 'ресторант', 'ток']);
  });

  test('cars, income sources and deposit types follow the sheet too', async ({ phone, budget }) => {
    budget.setLists({ cars: ['Тойота', 'Ford'], incomeSources: ['заплата', 'наем'], investTypes: ['Земя'] });
    await phone.refreshCategories();
    await phone.fillEntry({ choice: 'гориво' });
    expect((await phone.carChoices()).map((c) => c.car)).toEqual(['Тойота', 'Ford']);
    await phone.fillEntry({ kind: 'Income' });
    expect(await phone.quickCategories()).toEqual(['заплата', 'наем']);
    await phone.fillEntry({ kind: 'Deposit' });
    expect(await phone.quickCategories()).toEqual(['Земя']);
  });

  test('a category used in the past but removed from the sheet still shows on Recent', async ({ phone, budget }) => {
    budget.addExpense({ date: '2026-03-01', amount: 10, category: 'стара категория' });
    await phone.refreshCategories();
    await phone.goTo('recent');
    expect(await phone.recentCategoryChoices()).toEqual(['All categories', 'стара категория']);
  });
});

test.describe('language', () => {
  test('the app starts in Bulgarian', async ({ newPhone }) => {
    const phone = await newPhone({ english: false, connect: false });
    expect(await phone.title()).toBe('Нов разход');
    expect((await phone.page.getByRole('navigation').getByRole('button').allTextContents()).map((s) => s.trim())).toEqual(['Нов', 'Последни', 'Месец', 'Настройки']);
  });

  test('Bulgarian shows amounts like the sheet does: 1 334,50', async ({ newPhone, budget }) => {
    budget.addExpense({ date: '2026-03-01', amount: 1334.5, category: 'храна' });
    const phone = await newPhone({ english: false });
    await phone.goTo('recent');
    await expect(phone.screen().getByRole('listitem')).toContainText('1 334,50 €');
    await expect(phone.page.getByRole('banner')).toContainText('Март до момента: 1 335 €');
  });

  test('switching to English translates the app but not the sheet’s names, and is remembered', async ({ newPhone, budget }) => {
    const phone = await newPhone({ english: false });
    await phone.setLanguage('English');
    expect(await phone.title()).toBe('Settings');
    await phone.goTo('new');
    expect(await phone.allCategories()).toMatchObject({ Food: ['храна'], Cars: ['гориво', 'кола – ремонт'] });
    await phone.reload();
    expect(await phone.title()).toBe('New expense');
    await phone.setLanguage('Български');
    expect(await phone.title()).toBe('Настройки');
  });
});

test.describe('vibrate on tap', () => {
  const countVibrations = (phone) => phone.page.evaluate(() => window.__buzzes || 0);
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => { navigator.vibrate = () => { window.__buzzes = (window.__buzzes || 0) + 1; return true; }; });
  });

  test('pressing buttons gives a short buzz, and it can be turned off', async ({ phone }) => {
    await phone.goTo('new');
    const before = await countVibrations(phone);
    await phone.pressKeys('1', '2');
    expect(await countVibrations(phone)).toBe(before + 2);
    await phone.setSetting('Vibrate on tap', false);
    await phone.goTo('new');
    const off = await countVibrations(phone);
    await phone.pressKeys('3');
    expect(await countVibrations(phone)).toBe(off);
    await phone.reload();
    await phone.goTo('new');
    await phone.pressKeys('4');
    expect(await countVibrations(phone)).toBe(0);
  });
});

test.describe('theme', () => {
  test('follows the phone’s dark mode by default', async ({ phone }) => {
    await phone.setPhoneDarkMode(false);
    expect(await phone.appearance()).toBe('light');
    await phone.setPhoneDarkMode(true);
    expect(await phone.appearance()).toBe('dark');
  });

  test('can be set to dark or light regardless of the phone, and is remembered', async ({ phone }) => {
    await phone.setPhoneDarkMode(false);
    await phone.setTheme('Dark');
    expect(await phone.appearance()).toBe('dark');
    expect(await phone.statusBarColor()).toBe('#0F1216');
    await phone.reload();
    expect(await phone.appearance()).toBe('dark');

    await phone.setPhoneDarkMode(true);
    await phone.setTheme('Light');
    expect(await phone.appearance()).toBe('light');
    expect(await phone.statusBarColor()).toBe('#116A55');

    await phone.setTheme('Automatic');
    expect(await phone.appearance()).toBe('dark');
  });
});

test.describe('sheets and years', () => {
  test('Change sheet switches to another file; new entries go there', async ({ phone, google, budget }) => {
    const other = createBudget(google, 'budget 2026 – вила', { expenses: [{ date: '2026-03-05', amount: 70, category: 'ток' }] });
    await phone.goTo('settings');
    await phone.screen().getByRole('button', { name: 'Change sheet' }).click();
    await phone.pickInGooglePicker(other.title);
    await phone.expectToast('Connected: budget 2026 – вила');
    expect(await phone.subtitle()).toBe(other.title);
    await phone.addExpense({ amount: 5, category: 'вода' });
    expect(other.expenses().map((e) => e.category)).toEqual(['ток', 'вода']);
    expect(budget.expenses()).toEqual([]);
  });

  test('New year copies the template as next year’s budget and switches to it', async ({ phone, google, budget }) => {
    createBudget(google, 'budget template 2027', { categories: { 'Храна': ['храна'], 'Дом': ['ток', 'газ'] } });
    await phone.goTo('settings');
    await expect(phone.screen()).toContainText('copies the template as "budget 2027"');
    await phone.screen().getByRole('button', { name: 'New year from template' }).click();
    await phone.pickInGooglePicker('budget template 2027');
    await phone.expectToast('Created and connected: budget 2027');

    await phone.goTo('new');
    expect(await phone.quickCategories()).toEqual(['храна', 'ток', 'газ']);
    await phone.addExpense({ amount: 3, category: 'газ' });
    expect(openBudget(google, 'budget 2027').expenses()).toEqual([expect.objectContaining({ amount: 3, category: 'газ' })]);
    expect(openBudget(google, 'budget template 2027').expenses()).toEqual([]);
    expect(budget.expenses()).toEqual([]);
  });

  test('from last year’s sheet, New year makes this year’s', async ({ newPhone, google }) => {
    createBudget(google, 'budget 2025 (new format)');
    createBudget(google, 'budget template');
    const phone = await newPhone({ sheet: 'budget 2025 (new format)' });
    await phone.goTo('settings');
    await phone.screen().getByRole('button', { name: 'New year from template' }).click();
    await phone.pickInGooglePicker('budget template');
    await phone.expectToast('Created and connected: budget 2026');
  });
});

test('Sign out forgets the sheet and ends Google access', async ({ phone, google }) => {
  await phone.goTo('settings');
  await phone.screen().getByRole('button', { name: 'Sign out of Google' }).click();
  await phone.expectToast('Signed out.');
  await phone.goTo('new');
  await expect(phone.screen()).toContainText('Connect your sheet');
  expect(google.hasValidAccess()).toBe(false);

  await phone.connect('budget 2026 (new format)');
  expect(google.signIns.map((s) => s.prompt)).toEqual(['consent', 'consent']);
});

test.describe('install', () => {
  test('explains how to install when Chrome has not offered it', async ({ phone }) => {
    await phone.goTo('settings');
    await expect(phone.screen()).toContainText('choose "Install app"');
  });

  test('offers an install button when Chrome allows it', async ({ phone }) => {
    await phone.goTo('settings');
    const offer = await phone.browserOffersInstall();
    await phone.screen().getByRole('button', { name: 'Install on this phone' }).click();
    expect(await offer.wasShown()).toBe(true);
    await expect(phone.screen().getByRole('button', { name: 'Install on this phone' })).toHaveCount(0);
  });
});
