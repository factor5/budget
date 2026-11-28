# Tests

Behaviour tests for the app. Each one opens the real app in a browser sized like a phone,
taps through it like a person would, and checks what ends up in the Google Sheet.
Google itself is replaced by a fake that runs inside the test, so the tests need no Google
account and no internet, and they give the same result every time.

```
npm install                          # once
npx playwright install chromium      # once, if Chromium isn't installed yet
npm test                             # all tests, about a minute
npx playwright test recent           # only tests/recent.spec.js
npx playwright test -g "one-off"     # only tests whose name contains "one-off"
npm run test:headed                  # watch them run in a visible browser
```

They also run on GitHub on every push (`.github/workflows/tests.yml`). When one fails there,
the run's **playwright-report** download has a trace: open it with `npx playwright show-trace <trace.zip>`
to step through what the browser showed.

## What is where

| File | What it covers |
|---|---|
| `setup.spec.js` | first run, connecting the sheet, wrong sheet, cancelled sign-in |
| `add-entries.spec.js` | expenses, cars, one-off, dates, income, deposits, keypad, quick categories |
| `recent.spec.js` | the Recent list, month and category filters, editing and deleting |
| `search.spec.js` | search on Recent: note and car, several words, with the month and category filters, keyboard and focus, drawing 200 at a time |
| `month.spec.js` | the Month statement and spending by group |
| `undo.spec.js` | Undo after saving: each entry kind, waiting entries, finding the row, failures, sign-in, the message |
| `offline.spec.js` | saving without internet, the waiting queue, sending later |
| `multiple-phones.spec.js` | two phones on one sheet: no overwrites, edits land on the right row |
| `settings.spec.js` | refreshing lists, language, theme, change sheet, new year, sign out, install |
| `sign-in.spec.js` | the one-hour Google sign-in, withdrawn access, Google errors |
| `demo.spec.js` | `?demo=1` |

The specs never touch the app's code or the sheet's cells directly. They go through three helpers
in `support/`, so a refactoring of the app only ever means updating one of these:

| Helper | What it knows |
|---|---|
| `support/phone.js` | the app's screens: which button to tap, where to read a value. **Change this when the interface changes.** |
| `support/budget.js` | the budget file's layout: which tab and column holds what. **Change this when the sheet's format changes.** |
| `support/fake-google/` | how Google's sign-in, file picker, Drive and Sheets API behave. Rarely needs changing. |

`support/fixtures.js` gives each test a fresh fake Google account holding "budget 2026 (new format)",
and a phone already connected to it. The phones' clock is fixed at 18 March 2026, 10:00 (Sofia),
so "today", "yesterday" and the month are always the same.

## Writing a test

```js
const { test, expect } = require('./support/fixtures');

test('a one-off expense is marked in the sheet', async ({ phone, budget }) => {
  await phone.addExpense({ amount: 1420, category: 'битови', oneOff: true });
  expect(budget.expenses()[0]).toMatchObject({ amount: 1420, oneOff: true });
});
```

- Start the sheet with data: `test.use({ budgetOptions: { expenses: [...] } })`, or call
  `budget.addExpense(...)` and then `phone.refreshCategories()` (what Settings → Refresh does).
- Something happening elsewhere: `budget.deleteExpense(...)` (another phone or the sheet itself),
  `google.failNextRequest(503)`, `google.revokeAllTokens()`, `phone.goOffline()`, `phone.laterBy(ms)`.
- A second phone: `const other = await newPhone();`.
- If the driver lacks a step you need, add it to `support/phone.js` rather than tapping buttons in the spec.

## Known issues

When a test finds app behaviour that is wrong but can't be fixed right away, mark it with `test.fail()`
and a comment saying what's wrong. It passes while the problem is there; once the app is fixed it fails,
which is the reminder to remove `test.fail()` so it guards the fix. There are none at the moment.
