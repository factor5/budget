# Spec: Undo after saving

Status: agreed, 2026-11-24. Roadmap item: **Faster entry → Undo after saving**.

## Why

Most mistakes happen in the second you tap **Запиши**: 54 instead of 45, the wrong category, the wrong car.
Today the only fixes are opening the entry in Последни (expenses only) or editing the sheet by hand
(income and deposits). Undo gives you a few seconds to take the save back and correct it.

## Behaviour

### The Undo button

- After **every** save, the message ("Записано: …" or "Запазено на телефона: …") has an **Отмени** (EN **Undo**) button.
- It works for all three kinds: **Разход** (Записи), **Приход** (Приходи) and **Вноска** (Инвестиции).
- The message stays for about **6 seconds**. The timer pauses while a finger or the keyboard focus is on the message,
  so it does not disappear as you reach for it.
- Background messages (for example an error from an automatic refresh) never replace it. A message caused by
  something you do, such as the next save, does.
- Undo only ever applies to the **latest save**. A new save replaces the previous Undo.
- The message is visible on every tab, and Undo works from any of them.
- **Placement.** On Нов, the **Запиши** button is pinned just above the tabs on every phone height, and the message
  shows right above it, so it never covers Запиши. On a short screen the keypad scrolls under the pinned button.
  On the other tabs the message sits just above the tabs as before.

### What Undo does

| The entry is… | Undo… |
|---|---|
| still waiting on the phone (offline, or Google failed) | takes it out of the waiting queue. No network needed. |
| written to the sheet | finds its row and deletes it. |
| being sent at the moment you tap | waits for the send to finish, then does one of the two above. An undone entry is never sent anyway. |

- **Finding the row.** The app first checks the row number it wrote to. If that row no longer holds the entry
  (the other phone added or deleted rows), it looks for the row with the same date, amount, category, car,
  one-off and note, as edit and delete already do. If two rows are identical, one of them goes. It doesn't matter which.
- **While it works** the button reads **Отменям…** (EN **Undoing…**), can't be tapped again, and the message stays until it finishes.
  This stops a double tap from deleting two identical rows.
- **Signing in.** If the Google sign-in has expired, the sign-in window opens first, straight from the tap, the same way as for save and delete.
- **Afterwards** the message reads **Отменено: 12,50 € · храна** (EN **Undone: …**), with no button. There is no redo.
- **The form.** If the form is still empty (amount 0 and no category chosen), the undone entry is put back into it:
  kind, amount, category, car, one-off, date and note. Fix it and tap Запиши. If you've already started the next entry,
  the form is left alone, so nothing you typed is lost.
- The current screen redraws: the Последни list, the Месец totals and the month total in the header.

### When Undo can't reach Google

This happens with no signal, a cancelled sign-in window, a Google error, or when the row can no longer be found. The entry stays, and the message
says how to fix it by hand. It stays for about 6 seconds.

- Разход: **Не можа да се отмени. Изтрий го от Последни.** (EN *Couldn't undo. Delete it on Recent.*)
- Приход: **Не можа да се отмени. Поправи го в таблицата (Приходи).** (EN *Couldn't undo. Fix it in the sheet (Приходи).*)
- Вноска: **Не можа да се отмени. Поправи го в таблицата (Инвестиции).** (EN *Couldn't undo. Fix it in the sheet (Инвестиции).*)

A failed Undo is not queued to try again later. That would mean ordering queued deletes against queued saves,
which isn't worth it for a rare case.

## Out of scope

- An undo history for older saves. Older entries are fixed in Последни.
- Redo.
- Undo for edits and deletes made in Последни.
- Deleting or editing income and deposits anywhere else in the app.

## Changes

| File | Change |
|---|---|
| `backend.js` | Find and delete rows on Приходи and Инвестиции as well as Записи (Google and demo). |
| `app.js` | The message can carry an Undo button, with the rules above. Saving remembers the latest entry and the row it went to. |
| `i18n.js` | Bulgarian and English texts. |
| `styles.css` | The button inside the message, in light and dark theme. Запиши pinned above the tabs, the message above it. |
| `tests/undo.spec.js` | New behaviour tests (below). |
| `ROADMAP.md` | Move the item to **Done** with the date. |

## Tests

`tests/undo.spec.js`, run with the fake Google like the rest:

- Undo of an expense, an income and a deposit removes that row from its tab.
- Undo of an entry waiting offline takes it out of the queue, and nothing is sent when back online.
- The undone entry is put back into an empty form, and a form you've started is left alone.
- Undo picks the right row after the other phone has added rows above it.
- With identical entries, only one row goes.
- No connection when tapping Undo: the entry stays, and the right message shows for each kind.
- A double tap deletes only one row.
- The message shows Undo for about 6 seconds, then disappears.
- The message never covers Запиши, which stays just above the tabs, on a short and a tall screen.
- Undo works in the demo.
