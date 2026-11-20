// What every spec gets: a fake Google account with this year's budget file in it, and a phone.
//
//   test('…', async ({ phone, budget, google, newPhone }) => { … })
//
//   google   – the fake Google (Drive, sign-in, Sheets API) shared by all phones in the test
//   budget   – "budget 2026 (new format)" in that Drive (tests/support/budget.js)
//   phone    – the app opened on a phone, signed in and connected to the budget
//   newPhone – opens the app on another phone. Options: connect: false (stop before connecting),
//              demo: true, english: false (keep the Bulgarian default), googleSetUp: false (config.js not filled in)
//
// Options (test.use): now – the phones' date and time; budgetOptions – what the budget starts with.

const base = require('@playwright/test');
const { devices } = base;
const { FakeGoogle } = require('./fake-google');
const { createBudget } = require('./budget');
const { Phone } = require('./phone');

const test = base.test.extend({
  now: ['2026-03-18T10:00:00+02:00', { option: true }],
  budgetOptions: [{}, { option: true }],

  google: async ({}, use) => { await use(new FakeGoogle()); },

  budget: async ({ google, budgetOptions }, use) => {
    await use(createBudget(google, 'budget 2026 (new format)', budgetOptions));
  },

  newPhone: async ({ browser, context, google, budget, now }, use, testInfo) => {
    const opened = [];
    const make = async ({ connect = true, demo = false, sheet = budget.title, english = true, googleSetUp = true } = {}) => {
      // The first phone uses the test's own browser context, so it gets traces on failure.
      const ctx = opened.length === 0 ? context : await browser.newContext({
        ...devices['Pixel 7'],
        baseURL: testInfo.project.use.baseURL,
        timezoneId: testInfo.project.use.timezoneId,
        serviceWorkers: 'block',
      });
      const page = ctx === context ? (context.pages()[0] || await context.newPage()) : await ctx.newPage();
      const phone = new Phone({ context: ctx, page, google, name: 'phone ' + (opened.length + 1) });
      opened.push(phone);
      phone.now = new Date(now);
      await ctx.clock.setFixedTime(phone.now);
      await google.attach(ctx, phone);
      if (!googleSetUp) {
        // config.js as it comes in the zip, before README step 3
        await ctx.route(/\/config\.js$/, (r) => r.fulfill({ contentType: 'text/javascript', body: "window.APP_CONFIG = { CLIENT_ID: 'PASTE_CLIENT_ID', API_KEY: 'PASTE_API_KEY', APP_ID: 'PASTE_APP_ID' };" }));
      }
      await phone.open({ demo, english });
      if (connect && !demo && googleSetUp) await phone.connect(sheet);
      return phone;
    };
    await use(make);
    for (const p of opened.slice(1)) await p.context.close();
  },

  phone: async ({ newPhone }, use) => { await use(await newPhone()); },
});

module.exports = { test, expect: base.expect };
