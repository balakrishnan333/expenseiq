// Single Firebase initialisation + the only place SDK URLs/versions live (bump 12.2.1 here).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';
import { firebaseConfig } from './firebase-config.js';
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
export const storage = getStorage(app);
export const functions = getFunctions(app);
export * from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
export * from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
export * from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';
export * from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';


