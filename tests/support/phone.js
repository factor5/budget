// The app as a person uses it on a phone: tap, type, read the screen.
// This is the only file that knows the app's buttons and labels. When a screen changes,
// fix it here and the specs keep reading the same.
// The driver uses the English interface; category names are whatever the sheet says.

const { expect } = require('@playwright/test');

const TABS = { new: /^(New|Нов)$/, recent: /^(Recent|Последни)$/, month: /^(Month|Месец)$/, settings: /^(Settings|Настройки)$/ };

/** "1,234.50 €", "−3,000 €", "+5,407 €" → number */
function parseMoney(text) {
  const m = /([+−-]?)([\d,]+(?:\.\d+)?)\s*€/.exec(text);
  if (!m) throw new Error('No amount in ' + JSON.stringify(text));
  const n = Number(m[2].replace(/,/g, ''));
  return m[1] === '−' || m[1] === '-' ? -n : n;
}

/** 12.5 → '12.50' as typed on the keypad */
function amountKeys(amount) {
  const s = typeof amount === 'number' ? String(amount) : amount.replace(',', '.');
  return [...s].map((ch) => (ch === '.' ? 'Decimal point' : ch));
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class Phone {
  constructor({ context, page, google, name }) {
    this.context = context; this.page = page; this.google = google; this.name = name;
    this.offline = false;
  }

  /* ---------- opening ---------- */

  /** Opens the app. In a fresh phone it switches the app to English first, through Settings. */
  async open({ demo = false, english = true } = {}) {
    await this.page.goto(demo ? '/index.html?demo=1' : '/index.html');
    await expect(this.tab('new')).toBeVisible();
    if (english && (await this.page.locator('html').getAttribute('lang')) !== 'en') {
      await this.tab('settings').click();
      const en = this.page.getByRole('button', { name: 'English' });
      if (await en.count()) await en.click(); // not offered before Google is set up
      await this.tab('new').click();
    }
    return this;
  }

  async reload() {
    await this.page.reload();
    await expect(this.tab('new')).toBeVisible();
  }

  /** First run: sign in and pick the year's sheet in Google's file picker. */
  async connect(sheetTitle) {
    // Works in either language, so a phone can stay on the Bulgarian default.
    await this.page.getByRole('button', { name: /^(Sign in and pick a sheet|Влез и избери таблица)$/ }).click();
    await this.pickInGooglePicker(sheetTitle);
    await expect(this.toast()).toHaveText(new RegExp('^(Connected|Свързано): ' + esc(sheetTitle) + '$'));
    await this.waitUntilSynced();
  }

  async pickInGooglePicker(fileTitle) {
    const picker = this.page.getByRole('dialog', { name: /^Google Picker/ });
    await expect(picker).toBeVisible();
    if (fileTitle == null) await picker.getByRole('button', { name: 'Cancel' }).click();
    else await picker.getByRole('button', { name: fileTitle, exact: true }).click();
  }

  /* ---------- navigation and header ---------- */

  tab(which) { return this.page.getByRole('navigation').getByRole('button', { name: TABS[which] }); }
  async goTo(which) { await this.tab(which).click(); }

  async title() { return (await this.page.getByRole('heading', { level: 1 }).textContent()).trim(); }
  async subtitle() { return (await this.page.getByRole('banner').locator('span').last().textContent()).trim(); }

  /** The connection badge at the top right: 'Synced', 'Offline', '2 waiting', 'Sign in', 'Demo'… */
  statusBadge() { return this.page.getByRole('banner').getByRole('button'); }
  async status() { const b = this.statusBadge(); return (await b.isVisible()) ? (await b.textContent()).trim() : ''; }
  async tapStatus() { await this.statusBadge().click(); }
  async waitUntilSynced() { await expect(this.statusBadge()).toHaveText(/^(Synced|Синхронизирано)$/); }

  toast() { return this.page.getByRole('status', { includeHidden: true }); }
  async expectToast(text) { await expect(this.toast()).toContainText(text); }

  /** Main content of the screen, for "this text is shown" checks. */
  screen() { return this.page.getByRole('main'); }

  /* ---------- New entry ---------- */

  async addExpense({ amount, category, car, oneOff, note, date }) {
    await this.fillEntry({ kind: 'Expense', amount, choice: category, car, oneOff, note, date });
    return this.saveEntry();
  }

  async addIncome({ amount, source, note, date }) {
    await this.fillEntry({ kind: 'Income', amount, choice: source, note, date });
    return this.saveEntry();
  }

  async addDeposit({ amount, type, note, date }) {
    await this.fillEntry({ kind: 'Deposit', amount, choice: type, note, date });
    return this.saveEntry();
  }

  async fillEntry({ kind, amount, choice, car, oneOff, note, date }) {
    await this.goTo('new');
    // Wait for the form: until the categories have loaded there is no Entry type to choose.
    await expect(this.screen().getByRole('region', { name: 'Keypad' })).toBeVisible();
    if (kind) await this.chooseKind(kind);
    if (amount != null) await this.typeAmount(amount);
    if (choice) await this.chooseCategory(choice);
    if (car !== undefined) await this.chooseCar(car);
    if (oneOff !== undefined) await this.setPressed(this.screen().getByRole('button', { name: 'One-off' }), oneOff);
    if (date) await this.screen().locator('input[type="date"]').fill(date);
    if (note) await this.screen().getByRole('textbox', { name: 'Note' }).fill(note);
  }

  async chooseKind(kind) {
    const group = this.screen().getByRole('group', { name: 'Entry type' });
    if (await group.count()) await group.getByRole('button', { name: kind }).click();
  }

  async typeAmount(amount) {
    const keypad = this.screen().getByRole('region', { name: 'Keypad' });
    for (const key of amountKeys(amount)) await keypad.getByRole('button', { name: key, exact: true }).click();
  }

  async pressKeys(...keys) {
    const names = { del: 'Delete digit', ',': 'Decimal point', '.': 'Decimal point' };
    const keypad = this.screen().getByRole('region', { name: 'Keypad' });
    for (const k of keys) await keypad.getByRole('button', { name: names[k] || k, exact: true }).click();
  }

  async shownAmount() { return (await this.screen().getByRole('region', { name: 'Amount' }).textContent()).replace(/\s/g, ''); }

  /** Taps a category button, or finds it under "More…". */
  async chooseCategory(name) {
    const quick = this.categoryButtons().getByRole('button', { name, exact: true });
    if (await quick.count()) { await quick.click(); return; }
    await this.categoryButtons().getByRole('button', { name: 'More…' }).click();
    await this.page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  }

  categoryButtons() { return this.screen().getByRole('region', { name: 'Category' }); }

  /** The category (or source / type) buttons shown without opening "More…". */
  async quickCategories() {
    return (await this.categoryButtons().getByRole('button').allTextContents()).map((s) => s.trim()).filter((s) => s !== 'More…');
  }

  /** The "More…" list, grouped as shown: { 'Food': ['храна'], ... } */
  async allCategories() {
    await this.categoryButtons().getByRole('button', { name: 'More…' }).click();
    const dialog = this.page.getByRole('dialog');
    const out = await dialog.evaluate((el) => {
      const groups = {}; let current = '';
      for (const node of el.querySelectorAll('*')) {
        if (node.children.length === 0 && node.tagName !== 'BUTTON' && node.textContent.trim() && !node.closest('button') && node.tagName !== 'H2') current = node.textContent.trim();
        if (node.tagName === 'BUTTON') (groups[current] = groups[current] || []).push(node.textContent.trim());
      }
      return groups;
    });
    await this.closeSheet();
    return out;
  }

  /** The car buttons under the category (shown for car categories): buttons in Details other than date and one-off. */
  carButtons() { return this.screen().getByRole('region', { name: 'Details' }).getByRole('button').filter({ hasNotText: /One-off/ }).and(this.page.locator(':not([role="button"])')); }

  async chooseCar(car) {
    if (!car) { // no car: un-press whichever is pressed
      for (const b of await this.carButtons().all()) if ((await b.getAttribute('aria-pressed')) === 'true') await b.click();
      return;
    }
    await this.setPressed(this.carButtons().filter({ hasText: new RegExp('^' + esc(car) + '$') }), true);
  }

  /** [{ car: 'ML', selected: false }, ...], empty when the category isn't a car one. */
  async carChoices() {
    const out = [];
    for (const b of await this.carButtons().all()) out.push({ car: (await b.textContent()).trim(), selected: (await b.getAttribute('aria-pressed')) === 'true' });
    return out;
  }

  async setPressed(button, on) {
    if (((await button.getAttribute('aria-pressed')) === 'true') !== !!on) await button.click();
    await expect(button).toHaveAttribute('aria-pressed', String(!!on));
  }

  saveButton() { return this.screen().getByRole('button', { name: /^(Save |Choose a category)/ }); }

  /** Taps Save and returns how it went: 'saved' (in the sheet) or 'kept' (on the phone, waiting). */
  async saveEntry() {
    await expect(this.saveButton()).toBeEnabled();
    await this.dismissToast();
    await this.saveButton().click();
    await expect(this.toast()).toHaveText(/^(Saved: |Kept on the phone: )/);
    return (await this.toast().textContent()).startsWith('Saved') ? 'saved' : 'kept';
  }

  /* ---------- Undo after saving ---------- */

  /** The Undo button on the message shown after saving. */
  undoButton() { return this.toast().getByRole('button', { name: /^(Undo|Undoing…)$/ }); }

  /** Taps Undo and returns the message shown afterwards ("Undone: …" or "Couldn't undo. …"). */
  async undo() {
    await this.undoButton().click();
    await expect(this.toast()).toHaveText(/^(Undone: |Couldn't undo)/);
    return (await this.toast().textContent()).trim();
  }

  /** What the New form holds: kind, amount, chosen category, note, one-off. */
  async form() {
    const pressed = async (loc) => { for (const b of await loc.all()) if ((await b.getAttribute('aria-pressed')) === 'true') return (await b.textContent()).trim(); return null; };
    const kinds = this.screen().getByRole('group', { name: 'Entry type' });
    const oneOff = this.screen().getByRole('button', { name: 'One-off' });
    return {
      kind: (await kinds.count()) ? await pressed(kinds.getByRole('button')) : null,
      amount: await this.shownAmount(),
      category: await pressed(this.categoryButtons().getByRole('button')),
      note: await this.screen().getByRole('textbox', { name: 'Note' }).inputValue(),
      oneOff: (await oneOff.count()) ? (await oneOff.getAttribute('aria-pressed')) === 'true' : null,
    };
  }

  /* ---------- Recent ---------- */

  /** The list on Recent, newest first: [{ category, amount, details, day }] */
  async recentEntries() {
    await expect(this.screen().getByRole('combobox', { name: 'Month' })).toBeVisible();
    const sections = this.screen().locator('section:has(ul)');
    const out = [];
    for (const sec of await sections.all()) {
      const day = (await sec.locator(':scope > :first-child > :first-child').textContent()).trim();
      for (const item of await sec.getByRole('listitem').all()) {
        const lines = (await item.innerText()).split('\n').map((s) => s.trim()).filter(Boolean);
        // badge letter, category, details, amount
        const amountLine = lines.find((l) => /€$/.test(l));
        const [, category, details] = lines;
        out.push({ day, category, details, amount: parseMoney(amountLine), waiting: await item.getByRole('button').isDisabled() });
      }
    }
    return out;
  }

  /** Day headers on Recent with their totals: [{ day: 'Today, March 18', total: 21.5 }] */
  async recentDays() {
    const out = [];
    for (const sec of await this.screen().locator('section:has(ul)').all()) {
      const head = sec.locator(':scope > :first-child');
      out.push({ day: (await head.locator(':scope > :first-child').textContent()).trim(), total: parseMoney(await head.locator(':scope > :last-child').textContent()) });
    }
    return out;
  }

  async filterRecent({ month, category } = {}) {
    if (month !== undefined) await this.screen().getByRole('combobox', { name: 'Month' }).selectOption({ label: month });
    if (category !== undefined) await this.screen().getByRole('combobox', { name: 'Category' }).selectOption({ label: category || 'All' });
  }

  async recentMonthChoices() { return (await this.screen().getByRole('combobox', { name: 'Month' }).locator('option').allTextContents()).map((s) => s.trim()); }
  async recentCategoryChoices() { return (await this.screen().getByRole('combobox', { name: 'Category' }).locator('option').allTextContents()).map((s) => s.trim()); }
  async recentSelectedMonth() { return this.screen().getByRole('combobox', { name: 'Month' }).evaluate((s) => s.options[s.selectedIndex].text); }
  searchBox() { return this.screen().getByRole('searchbox', { name: /Search notes and cars|Търси в бележки и коли/ }); }
  /** Types into the search box on Recent one key at a time, like a person. */
  async search(text) { await this.goTo('recent'); await this.searchBox().pressSequentially(text); }
  async clearSearch() { await this.screen().getByRole('button', { name: /Clear search|Изчисти търсенето/ }).click(); }
  /** The bold parts of each entry's details line, in list order: [['гуми'], []] */
  async recentHighlights() { return Promise.all((await this.screen().getByRole('listitem').all()).map((li) => li.locator('mark').allTextContents())); }

  /** "3 entries · 45.00 €" shown when a filter is on. */
  async recentSummary() {
    const text = await this.screen().getByText(/^\d+ entr(y|ies)$/).locator('..').innerText();
    return { count: Number(/(\d+) entr/.exec(text)[1]), total: parseMoney(text) };
  }

  entryRow({ category, amount }) {
    let item = this.screen().getByRole('listitem').filter({ hasText: category });
    if (amount != null) item = item.filter({ hasText: new RegExp(esc(amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')) + ' €') });
    return item;
  }

  async openEntry(which) {
    await this.goTo('recent');
    await this.entryRow(which).first().getByRole('button').click();
    await expect(this.editSheet()).toBeVisible();
  }

  editSheet() { return this.page.getByRole('dialog').filter({ has: this.page.getByRole('heading', { name: 'Edit entry' }) }); }

  async editEntryForm() {
    const d = this.editSheet();
    const car = d.getByRole('combobox', { name: 'Car' });
    return {
      amount: await d.getByRole('textbox', { name: 'Amount (€)' }).inputValue(),
      date: await d.getByLabel('Date').inputValue(),
      category: await d.getByRole('combobox', { name: 'Category' }).evaluate((s) => s.value),
      car: (await car.count()) ? await car.evaluate((s) => s.value) : null,
      oneOff: await d.getByRole('checkbox', { name: 'One-off' }).isChecked(),
      note: await d.getByRole('textbox', { name: 'Note' }).inputValue(),
    };
  }

  /** Changes an entry on Recent. Returns the message shown afterwards. */
  async editEntry(which, changes) {
    await this.openEntry(which);
    const d = this.editSheet();
    if (changes.amount != null) await d.getByRole('textbox', { name: 'Amount (€)' }).fill(String(changes.amount));
    if (changes.date) await d.getByLabel('Date').fill(changes.date);
    if (changes.category) await d.getByRole('combobox', { name: 'Category' }).selectOption(changes.category);
    if (changes.car !== undefined) await d.getByRole('combobox', { name: 'Car' }).selectOption(changes.car || '');
    if (changes.oneOff !== undefined) await d.getByRole('checkbox', { name: 'One-off' }).setChecked(changes.oneOff);
    if (changes.note !== undefined) await d.getByRole('textbox', { name: 'Note' }).fill(changes.note);
    await this.dismissToast();
    await d.getByRole('button', { name: 'Save changes' }).click();
    return this.nextToast();
  }

  /** Deletes an entry on Recent (Delete, then "Are you sure?"). Returns the message shown. */
  async deleteEntry(which) {
    await this.openEntry(which);
    await this.editSheet().getByRole('button', { name: 'Delete' }).click();
    await this.dismissToast();
    await this.editSheet().getByRole('button', { name: 'Are you sure?' }).click();
    return this.nextToast();
  }

  /** Clears the current message so the next one can be read. */
  async dismissToast() { await this.toast().evaluate((el) => { el.hidden = true; el.textContent = ''; }); }

  async nextToast() {
    await expect(this.toast()).toBeVisible();
    await expect(this.toast()).not.toHaveText('');
    return (await this.toast().textContent()).trim();
  }

  async closeSheet() {
    await this.page.mouse.click(5, 5); // tap the dimmed area above the sheet
    await expect(this.page.getByRole('dialog')).toBeHidden();
  }

  /* ---------- Month ---------- */

  /** The month statement and the spending by group, as numbers. */
  async monthSummary() {
    const card = this.screen().getByRole('region', { name: 'Month summary' });
    await expect(card).toBeVisible();
    const lines = (await card.innerText()).split('\n').map((s) => s.trim()).filter(Boolean);
    const after = (label) => { const i = lines.indexOf(label); return i < 0 ? undefined : parseMoney(lines[i + 1]); };
    const footnote = lines.find((l) => /% of income|invested/.test(l)) || '';
    const groups = [];
    for (const bar of await this.screen().getByRole('img').all()) {
      const label = await bar.getAttribute('aria-label'); // "Food: 380 €, average 400 €"
      const m = /^(.*): (.*€), average (.*€)$/.exec(label);
      groups.push({ group: m[1], amount: parseMoney(m[2]), average: parseMoney(m[3]) });
    }
    return {
      income: after('Income'), spending: Math.abs(after('Spending')), regular: after('regular'), oneOff: after('one-off'), left: after('Left'),
      footnote, groups,
    };
  }

  async monthPeriod() { return (await this.screen().getByText(/^(to date|whole month)$/).textContent()).trim(); }
  async previousMonth() { await this.screen().getByRole('button', { name: 'Previous month' }).click(); }
  async nextMonth() { await this.screen().getByRole('button', { name: 'Next month' }).click(); }

  /* ---------- Settings ---------- */

  async refreshCategories() {
    await this.goTo('settings');
    await this.screen().getByRole('button', { name: 'Refresh' }).click();
    await this.expectToast('Refreshed.');
  }

  async setSetting(title, on) {
    await this.goTo('settings');
    await this.screen().getByRole('checkbox', { name: new RegExp('^' + esc(title)) }).setChecked(on);
  }

  async setLanguage(label) { await this.goTo('settings'); await this.screen().getByRole('button', { name: label }).click(); }
  async setTheme(label) { await this.goTo('settings'); await this.screen().getByRole('group', { name: /Theme|Тема/ }).getByRole('button', { name: label }).click(); }
  /** 'dark' or 'light', from how the page actually looks. */
  async appearance() {
    const rgb = await this.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    return (0.299 * r + 0.587 * g + 0.114 * b) < 128 ? 'dark' : 'light';
  }
  /** The colour Android gives the status bar while the app is open. */
  async statusBarColor() { return this.page.locator('meta[name="theme-color"]').getAttribute('content'); }
  /** The phone's own dark mode setting. */
  async setPhoneDarkMode(on) { await this.page.emulateMedia({ colorScheme: on ? 'dark' : 'light' }); }

  /** Chrome offers to install the app. Resolves to true once the install prompt has been shown. */
  async browserOffersInstall() {
    await this.page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      window.__installPrompted = false;
      e.prompt = () => { window.__installPrompted = true; };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    return { wasShown: () => this.page.evaluate(() => window.__installPrompted) };
  }

  /* ---------- connection ---------- */

  async goOffline() { this.offline = true; await this.context.setOffline(true); }
  async goOnline() { this.offline = false; await this.context.setOffline(false); }

  /** Moves the phone's clock forward, e.g. past the one-hour Google sign-in. */
  async laterBy(ms) { this.now = new Date((this.now || Date.now()).valueOf() + ms); await this.page.clock.setFixedTime(this.now); }

  /** Switching back to the app from another app. */
  async comeBackToApp() {
    await this.page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }
}

module.exports = { Phone, parseMoney };
