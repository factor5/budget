# Spec: Search

Status: agreed, 2026-11-28. Roadmap item: **Seeing where the money goes → Search**.

## Why

"When did we last buy гуми, and how much did they cost this year?" Today the only way to answer
that is scrolling Последни month by month or opening the sheet. The whole year of expenses is
already on the phone, so the app can find them instantly, even offline.

## What it searches

- **This year's expenses only** (Записи in the open file). Income and deposits aren't listed on
  Последни and can't be edited in the app, so they stay out. Other years are other files and are not searched.
- **Two fields: the note and the car.** Category is not matched: it has its own filter.
- **Matching:** ignores case and finds part of a word, so "гум" finds "гуми" and "гума".
  Several words must **all** appear, in any order: "гуми тойота" finds entries whose note or car
  holds both. Spaces alone count as an empty search. There is no Latin-to-Cyrillic matching
  ("gumi" does not find "гуми").
- **Entries still waiting to be sent** are included, greyed out as everywhere else on Последни.
- Everything runs on the phone. No Google request, and it works offline.

## Screen

On **Последни**, the filters are:

1. **A search box**, full width, on top. Placeholder **Търси в бележки и коли** (EN **Search notes and cars**),
   a magnifier on the left and a **✕** on the right once there's text. Enter closes the keyboard.
2. **One row below it:** the month and category dropdowns, half each. The month arrows are gone: they were
   hardly used, and the dropdown reaches any month in one tap.
   On a very narrow screen the row wraps into two lines.

To fit the row:

- Month choices show the month without the year: **Септември**, not "Септември 2026". The year is always the open file's.
- The category dropdown's first choice reads **Всички** (EN **All**). Screen readers still hear "Категория".

## Behaviour

- **Live:** the list updates with every letter typed. There's no Search button. Only the list under the
  filters redraws, so the keyboard stays open and the cursor stays where it was.
- **With the month filters:**
  - Month **Последни** and text in the box: the **whole year** is searched, with no 80-entry limit.
    While the box has text, that choice reads **Цялата година** (EN **Whole year**).
  - A month chosen: only that month is searched.
  - A category chosen: results are narrowed to it as well.
- **Results** look like the normal list: newest first, grouped by day with day totals. Above them the
  summary line shows the count and total (**3 записа · 245,00 €**). The matched text is in bold in the
  note and car line.
- **Header:** while the box has text the title is **Записи**, as with the other filters.
- **Nothing found:** **Нищо не съвпада с „гуми“.** (EN *Nothing matches "гуми".*). If a month or
  category is also chosen, a **Търси в цялата година** (EN **Search the whole year**) button resets both
  and keeps the text.
- **How long the text stays:** while the app is open, also across tabs and after changing or deleting
  an entry from the results. It's cleared by the ✕ and when the app is started again.
- **Keyboard:** tapping a result, or scrolling the list with a finger, closes the keyboard first, so it
  doesn't cover the edit sheet.

## Speed

Measured with 3,000 expenses and the browser's CPU slowed 4× (roughly a mid-range phone). Drawing every
result took up to about 860 ms for a one-letter search matching 2,100 entries, well over the 50 ms aim. So:

- **Results are drawn 200 at a time.** Below them, **Покажи още 200 (остават 450)** (EN **Show 200 more (450 left)**)
  draws the next 200. The cut never splits a day, so the day totals are always right. The summary line counts
  and totals **all** results, not only the ones drawn.
- Each entry's note and car are lower-cased once per screen, not on every key press.

With that, a redraw takes about 15–35 ms at normal speed and 45–110 ms at 4× slower, against about 50 ms
for the existing 80-entry Последни list. Typing stays smooth; the keyboard never closes.

## Out of scope

- Income and deposits, and other years' files.
- Matching category names, amounts or dates.
- Latin-to-Cyrillic matching, and word-form matching beyond "part of a word".
- Remembering the search after the app is closed.
