# Разходи: expense app for your budget sheets

A small web app you install on your Android phone. It writes each expense, income or investment deposit straight into your yearly Google Sheet ("budget 2026 (new format)" and later years made from "budget template 2027").

- No server of its own: the app runs in the phone's browser and talks to Google directly with your account.
- It only sees the files you pick inside the app, not the rest of your Drive.
- Without internet, entries are kept on the phone and sent when you're back online.

Try it first, without any setup: open `index.html?demo=1` once it's hosted (step 1). The demo uses sample data and never touches Google.

Setup takes about 15 minutes, once. You need a GitHub account (free) and your Google account.

---

## Step 1. Put the app online (GitHub Pages)

1. Sign in at https://github.com and create a new repository: **New** → name it `razhodi` → **Public** → **Create repository**.
   (The code has no personal data in it; your expenses stay in your Google Sheet.)
2. On the new repository page click **uploading an existing file**, drag in **all files and the `icons` folder** from this zip, and click **Commit changes**.
3. Open **Settings → Pages**. Under **Build and deployment** choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and **Save**.
4. After a minute the page shows your app's address, for example:
   `https://YOUR-GITHUB-NAME.github.io/razhodi/`
   Keep it; you need it in step 2.

Open `https://YOUR-GITHUB-NAME.github.io/razhodi/?demo=1` to check it works.

## Step 2. Let the app sign in with Google (Google Cloud)

All of this is free. Use the same Google account as your budget sheets.

1. Go to https://console.cloud.google.com, click the project picker at the top → **New project** → name `Razhodi` → **Create**. Make sure the new project is selected.
2. **Turn on the APIs**: menu ☰ → **APIs & Services → Library**. Search and **Enable** each of:
   - **Google Sheets API**
   - **Google Drive API**
   - **Google Picker API**
3. **Consent screen**: **APIs & Services → OAuth consent screen** (may be called **Google Auth Platform → Branding**).
   - App name `Разходи`, your email as support and developer contact. User type **External**.
   - **Audience / Test users**: add your own Gmail address.
   - **Data access / Scopes**: add `.../auth/drive.file` ("See, edit, create and delete only the specific Google Drive files you use with this app"). This is the only permission the app asks for.
4. **Sign-in key (OAuth client ID)**: **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type **Web application**, name `Razhodi web`.
   - **Authorized JavaScript origins** → **Add URI**: `https://YOUR-GITHUB-NAME.github.io` (only the start of the address, no `/razhodi/` and no slash at the end).
   - **Create**, then copy the **Client ID** (ends in `.apps.googleusercontent.com`).
5. **API key (for the file picker)**: **Credentials → Create credentials → API key**. Copy it, then click **Edit API key**:
   - **Application restrictions → Websites**: add `https://YOUR-GITHUB-NAME.github.io/*`
   - **API restrictions → Restrict key**: tick **Google Picker API** only. **Save**.
6. **Project number**: open the project **Dashboard** (☰ → **Cloud overview**). Copy the **Project number** (digits only).

## Step 3. Put the three values in `config.js`

In your GitHub repository open `config.js` → pencil icon (**Edit**), replace the three `PASTE_…` texts with your values, and **Commit changes**:

```js
window.APP_CONFIG = {
  CLIENT_ID: '1234567890-abc123.apps.googleusercontent.com',
  API_KEY: 'AIzaSy...',
  APP_ID: '1234567890',
};
```

These values are not secret. Google only accepts them from your own web address, and every user still has to sign in with their own Google account.

## Step 4. Connect the sheet and install on the phone

1. On the phone, open `https://YOUR-GITHUB-NAME.github.io/razhodi/` in **Chrome**.
2. Tap **Влез и избери таблица**. Sign in with Google and allow access.
   Google may say the app isn't verified: tap **Continue**. That's expected for a personal app that only you use.
3. In the file picker choose **budget 2026 (new format)**. The categories load from its Категории tab.
4. Install: Chrome menu **⋮ → Install app** (or **Add to Home screen**), or **Настройки → Инсталирай на телефона** in the app. The app now has its own icon and opens full screen.

Done. Add an expense: type the amount, tap a category, tap **Запиши**.

---

## How it uses your sheet

| In the app | In the sheet |
|---|---|
| Разход (expense) | new row in **Записи**: Дата, Сума, Категория, Кола, Еднократен, Бележка |
| Приход (income) | new row in **Приходи**: Дата, Сума, Източник, Бележка |
| Вноска (investment deposit) | new row in **Инвестиции**: Дата, Сума, Тип, Бележка |
| Category buttons and lists | read from **Категории** (categories, cars, income sources, investment types) |
| Месец screen | read from **Баланс** |
| Последни screen: edit / delete | changes or deletes that row in **Записи** |

Change a category, car or income source in the **Категории** tab, then tap **Настройки → Обнови**. The app follows the sheet.

## New year

On 1 January: **Настройки → Нова година от шаблона**, pick **budget template 2027**. The app copies it as **budget 2027** in your Drive and switches to it. Fill in the start-of-year values on Инвестиции and Имущество in the sheet.

## Good to know

- **Signing in again.** Google's sign-in lasts an hour. After that, the next save opens a short Google window that closes by itself. If the "Влез" button shows at the top right, tap it.
- **Offline.** Entries saved without internet show as waiting (top right and on **Последни**). They are sent automatically when the phone is back online, or when you tap the waiting badge.
- **Sign-in stops working after 7 days?** Apps in Google's "Testing" mode can ask you to sign in again weekly. To avoid it: **OAuth consent screen → Publish app**. Because the app only asks for access to files you pick, Google doesn't require a review.
- **Changing the app later.** Edit the files on GitHub; the phone picks up the new version the next time the app opens with internet.
- **Removing access.** https://myaccount.google.com/permissions → Разходи → **Remove access**.

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | the screens and their behaviour |
| `backend.js` | reading and writing the Google Sheet (and the demo data) |
| `config.js` | your three Google values (step 3) |
| `manifest.webmanifest`, `sw.js`, `icons/` | what makes it installable and work offline |
