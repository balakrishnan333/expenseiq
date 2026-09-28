# ExpenseIQ (Firebase)

## Structure
public/index.html          the app (landing + all pages, hash routes)
public/login.html          login / register / forgot password / Google
public/js/firebase-config.js   PUBLIC web config -> paste your values here (only place)
public/js/firebase.js      single Firebase init + SDK version (bump in one place)
public/js/backend.js       service layer: auth, Firestore, Storage, demo data
firestore.rules, storage.rules, firestore.indexes.json, firebase.json
functions/                 deleteAccount Cloud Function

## Setup
1. Create a project at https://console.firebase.google.com, add a Web app, copy its config into `public/js/firebase-config.js`.
2. Build > Authentication > enable **Email/Password** and **Google**. Add your hosting domain under Authorized domains.
3. Build > Firestore Database (production mode) and Build > Storage. Cloud Functions needs the Blaze plan.
4. `npm i -g firebase-tools && firebase login && firebase use --add`
5. `cd functions && npm install && cd ..`
6. `firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting`
Local: `firebase emulators:start` or `npx serve public` (ES modules need http://, not file://).

## Security
Service-account keys never go in the frontend or Git (.gitignore covers them). Web config is public by design; rules enforce
request.auth.uid == {uid} on every path, validate fields, and deny everything else. Receipt URLs contain a download token, so do not share them.

## Manual test checklist
Register / login / Google / logout / reset email; add expense and income (refresh, still there); edit and delete (confirm dialog);
dashboard totals; receipt upload (5 MB, image/PDF); profile photo; Load/Remove demo data; dark mode persists after re-login;
go offline (pill appears), add expense, go online (syncs); sign in as two users and confirm neither sees the other's data (or use the emulator rules tests).
