const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
admin.initializeApp();

// Permanently deletes the caller's Firestore data, Storage files and Auth account.
exports.deleteAccount = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = req.auth.uid, db = admin.firestore();
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await admin.storage().bucket().deleteFiles({ prefix: `users/${uid}/` });
  await admin.auth().deleteUser(uid);
  return { ok: true };
});
