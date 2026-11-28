# Spec: Catching up on old expenses

Status: agreed, 2026-11-28. Roadmap item: **Faster entry → Catching up on old expenses**.

## Why

Expenses often get entered days or months later: from receipts, or from the notebook where the second person in
the household writes theirs down. A catch-up session is typically **30+ entries on the phone**, a notebook page at a
time: several entries for one day, then the next day.

Today that is slow and error-prone:

- After every save the date jumps back to today, so each entry means opening the calendar again.
- The date is a small chip below the categories, far from the amount, so it's easy to save with the wrong date.

## Behaviour

### The date stays put

- After saving, the date you picked is **kept** for the next entry (expense, income and deposit alike).
- It goes back to **today** by itself:
  - when the app is **opened fresh** (the date is never stored on the phone), or
  - after **10 minutes without using** the Нов screen (no tap or key on it), checked every few seconds
    and whenever you come back to the app.
- When it goes back, a short message says **Датата е отново днес** (EN **Date is back to today**).
- If you never changed the date, it simply follows today (also past midnight), with no message.

### The date next to the amount

- A date line sits **right under the amount**: `‹  📅 Пт, 12 авг  ›`.
  - **‹ / ›** move one day back or forward (EN labels *Previous day*, *Next day*).
  - Tapping the date opens the calendar on that date.
  - Today reads **Днес, 28 ноем** (EN *Today, Nov 28*).
- When the date is **not today**, the line is highlighted in the warning colour (amber), in light and dark theme.
- The **Save button names the date**: `Запиши 87,40 € · Храна · 12 авг`, or `… · днес` for today.
- The message after saving names the date when it isn't today: `Записано: 87,40 € · храна · 12 авг`.
- The old date chip in the details row is gone. One-off stays there.

### Limits

- No date after today.
- No date before **1 January of the sheet's year** (the year of its entries, or this year for an empty sheet),
  and none after 31 December of it, so nothing lands in the wrong year's file.
- At a limit the arrow is disabled and the calendar won't go further.

### Keep the category

- Next to the **Категория** label, once a category is chosen, a **📌 Задръж** (EN **Keep**) toggle appears.
- On: the category (and car) stays selected after saving, so you only type the next amount.
  Off (the default): the category clears after saving, as before.
- Choosing another category while it's on keeps the new one. Switching between Разход / Приход / Вноска turns it off.
- It turns off together with the date going back to today.

### Duplicate check

- Expenses only (income and deposits aren't loaded on the phone).
- When an expense with the **same date, amount and category** is already in the sheet or waiting on the phone,
  tapping Save first asks:
  **Вече има 12,50 € · храна на 12 авг. Да запиша ли пак?** (EN *There's already 12.50 € · храна on Mar 12. Save it again?*)
  with **Запиши пак** (*Save again*) and **Отказ** (*Cancel*).
- Cancel leaves the form as it was.

### Unchanged

- Undo puts the entry back into the form with its own date (and that date is then kept, as above).
- Entries can be saved in any date order. Последни sorts by date.

## Out of scope

- A day total while catching up.
- Marking who entered an entry (stays in ROADMAP as **Who entered it**).

## Changes

| File | Change |
|---|---|
| `app.js` | Kept date with the 10-minute reset, date line with arrows and limits, date in the Save button and message, Keep toggle, duplicate check. |
| `i18n.js` | Bulgarian and English texts. |
| `styles.css` | Date line (normal and amber), Keep toggle, in light and dark theme. |
| `tests/catch-up.spec.js` | New behaviour tests (below). |
| `tests/support/phone.js` | Helpers for the date line, Keep and the duplicate question. |
| `ROADMAP.md` | Add the item to **Done** with the date. |

## Tests

`tests/catch-up.spec.js`:

- The date stays after saving; several entries in a row land on that date.
- The arrows step a day; › is disabled on today; ‹ is disabled on 1 January.
- The date line is marked as not today, and the Save button names the date.
- The date goes back to today after 10 minutes without use (with the message), and on a fresh open.
- Using the screen within 10 minutes keeps the date.
- Keep: the category stays after saving; off by default; turns off when the date goes back.
- Duplicate: the question appears for the same date, amount and category (also for a waiting entry); Cancel saves nothing, Save again saves.
- A different date or amount saves without asking.
