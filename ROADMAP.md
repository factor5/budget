# Roadmap

Ideas for the app, and what's already done. To add an idea, put it under **Ideas** with a line on what it does and what it needs. When one is built, tick it and move it to **Done** with the date.

## Ideas

### Faster entry

- [ ] **Undo after saving.** The "Записано" message gets an "Отмени" button for a few seconds; tapping it removes the row that was just written. Small, useful every day.
- [ ] **Repeat an entry.** Long-press an entry in Последни to add it again with today's date (fuel, the usual groceries).
- [ ] **Monthly bills checklist.** Mark some categories as monthly (ток, вода, интернет, телефон, абонаменти), for example with a new column in Категории. In a new month the app shows "Bills not entered yet" and pre-fills last month's amount, so you only adjust and save.
- [ ] **Home-screen shortcuts.** Long-press the app icon on Android to open "Гориво", "Храна" or "Приход" with the category already chosen (`shortcuts` in the manifest plus a URL parameter).
- [ ] **Voice entry.** Say "гориво 54 тойота" and the app fills in amount, category and car. Uses the browser's speech recognition; no extra service, but it can mishear.

### Seeing where the money goes

- [ ] **Monthly limits per group.** A limit per group (for example Храна 400 €) in a new column in Категории. Месец shows "320 of 400 €", and saving warns when an entry pushes a group over its limit.
- [ ] **Year view.** A tab with a bar per month, the year's average, and the same month last year. Last year comes from that year's file, picked once.
- [ ] **Cost per car.** ML vs Тойота this year: fuel, repairs, insurance, and cost per month. The car is already saved with every car expense.
- [ ] **Search.** Find entries by note text ("гуми", "врати") across the whole year.

### Using it together

- [ ] **Who entered it.** A "Кой" column filled in automatically from the Google account, with a small initial on each entry in Последни.

### Considered, not planned

- **Daily reminder notifications.** Reliable notifications on Android need a server to send them, and the app deliberately has none. The bills checklist and home-screen shortcuts cover most of the need.
- **Reading amounts from receipt photos.** Needs an outside text-recognition service and makes mistakes.

## Done

| Date | What |
|---|---|
| 2026-11-20 | **First version.** Add expenses, income and investment deposits straight into the year's sheet; categories, cars and sources come from Категории. Works offline and sends later. Installable on Android. |
| 2026-11-20 | **Date button** opens the calendar from anywhere on it, also on desktop. |
| 2026-11-20 | **Последни: any month and category filter,** with a count and total for the selection. |
| 2026-11-20 | **Месец as a statement:** income, minus spending (regular / one-off), what's left, share kept and amount invested. Chart titled "Разходи по групи". |
| 2026-11-20 | **English and Bulgarian** (Настройки → Език). All texts in `i18n.js`. |
| 2026-11-20 | **Several phones on one sheet.** Saving inserts its own row in one step, so two phones never overwrite each other; edits and deletes check the row still holds that entry. |
| 2026-11-20 | **Dark mode** (Настройки → Тема: automatic, light, dark). |
| 2026-11-20 | **Behaviour tests** for every feature (`npm test`, also on every push), with a fake Google so no account is needed. |
| 2026-11-20 | **Fixes found by the tests:** Месец no longer retries in a tight loop after a Google error (shows "Try again"), the badge switches to "Sign in" when access has ended, and coming back to the app redraws an open Последни list. |
