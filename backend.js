/* Service layer: UI -> backend.js -> Firebase. Keeps the synchronous API the UI already uses,
   backed by live Firestore listeners (cache) with write-through to Firestore. */
import { auth, db, storage, functions, onAuthStateChanged, signOut, signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile,
  doc, collection, query, orderBy, limit, where, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, writeBatch, deleteField,
  ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject, httpsCallable } from './firebase.js';

export const hooks = { toast: console.log, theme() {} };
const S = { uid: null, known: false, tx: [], goals: [], rec: [], prof: {}, pref: {} };
let render = () => {}, unsubs = [];
const AUTH_MSG = { 'auth/invalid-credential': 'Incorrect email or password.', 'auth/user-not-found': 'Incorrect email or password.', 'auth/wrong-password': 'Incorrect email or password.', 'auth/email-already-in-use': 'An account with this email already exists.', 'auth/weak-password': 'Password must be at least 6 characters.', 'auth/invalid-email': 'Enter a valid email address.', 'auth/too-many-requests': 'Too many attempts. Try again later.', 'auth/popup-closed-by-user': '', 'auth/cancelled-popup-request': '' };
export const friendly = e => { console.error(e); const c = e?.code || ''; return c in AUTH_MSG ? AUTH_MSG[c] : c.includes('permission') ? "You don't have permission to access this data." : /unavailable|network/.test(c) ? 'Connection lost. Your data has not been saved yet and will sync when you are back online.' : 'Unable to connect. Please try again.'; };
const fail = e => { const m = friendly(e); m && hooks.toast(m, 'error'); };

/* ---- mappers (UI shape <-> Firestore shape) ---- */
const PM = ['Cash', 'UPI', 'Debit Card', 'Credit Card', 'Bank Transfer', 'Other'];
const in30 = () => new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
const toTx = t => ({ type: t.amount > 0 ? 'income' : 'expense', amount: Math.abs(+t.amount), description: String(t.name).trim().slice(0, 120), category: t.category == 'Subscription' ? 'Subscriptions' : t.category, paymentMethod: PM.includes(t.method) ? t.method : 'Other', date: t.date, notes: (t.notes || '').slice(0, 500) });
const fromTx = d => { const x = d.data(); return { id: d.id, name: x.description, category: x.category, amount: x.type == 'income' ? x.amount : -x.amount, date: x.date, method: x.paymentMethod, notes: x.notes || '', receiptUrl: x.receiptUrl || '', receiptPath: x.receiptPath || '' }; };
const toGoal = g => ({ name: String(g.name).trim().slice(0, 60), icon: String(g.icon || '🎯').slice(0, 8), color: /^#[0-9a-f]{6}$/i.test(g.color) ? g.color : '#7C5CFC', targetAmount: +g.target, currentAmount: Math.max(0, +g.current || 0), targetDate: g.date || '' });
const fromGoal = d => { const x = d.data(); return { id: d.id, name: x.name, icon: x.icon, color: x.color, target: x.targetAmount, current: x.currentAmount, date: x.targetDate }; };
const toRec = r => ({ name: String(r.name).trim().slice(0, 60), amount: +r.amount, category: r.category || 'Subscriptions', frequency: r.frequency || 'Monthly', nextDueDate: r.nextDueDate || in30(), paymentMethod: PM.includes(r.method) ? r.method : 'Other', active: r.active !== false, icon: String(r.icon || '🔁').slice(0, 8), color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#7C5CFC' });
const fromRec = d => { const x = d.data(); return { id: d.id, name: x.name, amount: x.amount, category: x.category, frequency: x.frequency, active: x.active, icon: x.icon, color: x.color, nextDueDate: x.nextDueDate }; };
const DEMO_GOALS = [{ name: 'New Laptop', icon: '💻', color: '#7C5CFC', current: 42000, target: 70000 }, { name: 'Trip to Goa', icon: '✈️', color: '#4D8DFF', current: 18500, target: 50000 }, { name: 'Bike', icon: '🏍️', color: '#FF4D5A', current: 12000, target: 60000 }, { name: 'Education', icon: '🎓', color: '#2BCB8A', current: 8000, target: 40000 }];
const DEMO_REC = [['Netflix', 649, '🎬', '#FF4D5A'], ['Spotify', 119, '🎧', '#2BCB8A'], ['Internet', 799, '📡', '#4D8DFF'], ['Mobile', 499, '📱', '#FF9F43'], ['Cloud Storage', 130, '☁️', '#7C5CFC']].map(r => ({ name: r[0], amount: r[1], icon: r[2], color: r[3] }));

/* ---- generic Firestore helpers (all paths are users/{uid}/...) ---- */
const col = p => collection(db, 'users', S.uid, p), dref = (p, id) => doc(db, 'users', S.uid, p, id), stamp = () => ({ updatedAt: serverTimestamp() });
const add = (p, d) => { const r = doc(col(p)); setDoc(r, { ...d, createdAt: serverTimestamp(), ...stamp() }).catch(fail); return r.id; };
const upd = (p, id, d) => updateDoc(dref(p, id), { ...d, ...stamp() }).catch(fail);
const del = (p, id) => deleteDoc(dref(p, id)).catch(fail);
const isPublic = () => !/^#\/(?!landing$)[\w-]+$/.test(location.hash);

export const API = {
  gate() { if (!S.known) return false; if (S.uid || isPublic()) return true; location.replace('login.html'); return false; },
  getTransactions: () => S.tx,
  addTransaction: t => add('transactions', toTx(t)),
  updateTransaction: (id, t) => upd('transactions', id, toTx(t)),
  async deleteTransaction(id) { const t = S.tx.find(x => x.id == id); if (t?.receiptPath) await deleteObject(ref(storage, t.receiptPath)).catch(() => {}); return del('transactions', id); },
  getGoals: () => S.uid ? S.goals : DEMO_GOALS.map((g, i) => ({ ...g, id: 'd' + i })),
  addGoal: g => add('goals', toGoal(g)),
  updateGoal: (id, g) => upd('goals', id, toGoal(g)),
  addToGoal(id, delta) { const g = S.goals.find(x => x.id == id); return g && upd('goals', id, { currentAmount: Math.max(0, g.current + delta) }); },
  deleteGoal: id => del('goals', id),
  getRecurring: () => S.uid ? S.rec : [],
  addRecurring: r => add('recurringExpenses', toRec(r)),
  updateRecurring: (id, r) => upd('recurringExpenses', id, toRec(r)),
  setRecurringActive: (id, active) => upd('recurringExpenses', id, { active }),
  deleteRecurring: id => del('recurringExpenses', id),
  getSettings: () => ({ name: S.prof.displayName || auth.currentUser?.displayName || 'Friend', email: S.prof.email || '', photoURL: S.prof.photoURL || '', currency: S.prof.currency || 'INR', dark: localStorage.getItem('eiq_dark') == '1', monday: true, n1: true, n2: true, n3: true, ...S.pref }),
  saveSettings(s) {
    localStorage.setItem('eiq_dark', s.dark ? '1' : '0'); if (!S.uid) return;
    const pref = { dark: !!s.dark, monday: !!s.monday, n1: !!s.n1, n2: !!s.n2, n3: !!s.n3 };
    S.pref = pref; S.prof = { ...S.prof, displayName: s.name, currency: s.currency };
    const b = writeBatch(db);
    b.update(doc(db, 'users', S.uid), { displayName: String(s.name).slice(0, 60), currency: s.currency, ...stamp() });
    b.set(doc(db, 'users', S.uid, 'settings', 'preferences'), { ...pref, ...stamp() });
    b.commit().catch(fail);
  }
};

/* ---- auth ---- */
async function ensureProfile(u, name) {
  const r = doc(db, 'users', u.uid); if ((await getDoc(r)).exists()) return;
  await setDoc(r, { uid: u.uid, displayName: name || u.displayName || '', email: u.email || '', photoURL: u.photoURL || '', currency: 'INR', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export const register = async (name, email, pw) => { const c = await createUserWithEmailAndPassword(auth, email, pw); await updateProfile(c.user, { displayName: name }); await ensureProfile(c.user, name); };
export const login = (e, p) => signInWithEmailAndPassword(auth, e, p);
export const google = async () => { const c = await signInWithPopup(auth, new GoogleAuthProvider()); await ensureProfile(c.user); };
export const resetPassword = e => sendPasswordResetEmail(auth, e);
export const logout = async () => { unsubs.forEach(f => f()); await signOut(auth); location.replace('login.html'); };

/* ---- boot: auth gate + live listeners ---- */
export function initBackend(r) {
  render = r; netPill();
  onAuthStateChanged(auth, u => {
    S.known = true;
    if (!u) { S.uid = null; if (isPublic()) r(); else location.replace('login.html'); return; }
    S.uid = u.uid; ensureProfile(u).catch(fail); listen();
  });
}
function listen() {
  unsubs.forEach(f => f()); unsubs = []; let pend = 5;
  const watch = (q, fn) => { let first = 1; unsubs.push(onSnapshot(q, s => { fn(s); if (first) { first = 0; if (!--pend) { hooks.theme(); render(); } } else changed(); }, fail)); };
  watch(query(col('transactions'), orderBy('date', 'desc'), limit(1000)), s => S.tx = s.docs.map(fromTx));
  watch(query(col('goals'), orderBy('createdAt')), s => S.goals = s.docs.map(fromGoal));
  watch(query(col('recurringExpenses'), orderBy('createdAt')), s => S.rec = s.docs.map(fromRec));
  watch(doc(db, 'users', S.uid), s => S.prof = s.data() || {});
  watch(doc(db, 'users', S.uid, 'settings', 'preferences'), s => S.pref = s.data() || {});
}
let raf; function changed() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (document.querySelector('main form')?.contains(document.activeElement)) return; hooks.theme(); render(); }); }
function netPill() { const p = document.createElement('div'); p.id = 'off'; p.textContent = 'Offline · changes will sync'; document.body.append(p); const n = () => p.style.display = navigator.onLine ? 'none' : 'block'; addEventListener('online', n); addEventListener('offline', n); n(); }

/* ---- files ---- */
export function uploadReceipt(id, file, onProgress) {
  if (!/^(image\/|application\/pdf$)/.test(file.type) || file.size > 5e6) { hooks.toast('Receipt must be an image or PDF under 5 MB.', 'error'); return Promise.resolve(); }
  const path = `users/${S.uid}/receipts/${id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`, task = uploadBytesResumable(ref(storage, path), file);
  return new Promise(res => task.on('state_changed', s => onProgress?.(Math.round(s.bytesTransferred / s.totalBytes * 100)), e => { fail(e); res(); }, async () => {
    try { const url = await getDownloadURL(task.snapshot.ref); await upd('transactions', id, { receiptUrl: url, receiptPath: path }); hooks.toast('Receipt uploaded ✓'); } catch (e) { fail(e); } res();
  }));
}
export async function deleteReceipt(id) { const t = S.tx.find(x => x.id == id); if (!t?.receiptPath) return; try { await deleteObject(ref(storage, t.receiptPath)); await upd('transactions', id, { receiptUrl: deleteField(), receiptPath: deleteField() }); hooks.toast('Receipt deleted', 'warning'); } catch (e) { fail(e); } }
export async function uploadPhoto(f) {
  if (!/^image\//.test(f.type) || f.size > 2e6) throw new Error('Choose an image under 2 MB.');
  const r = ref(storage, `users/${S.uid}/profile/profile.jpg`); await uploadBytes(r, f, { contentType: f.type });
  await updateDoc(doc(db, 'users', S.uid), { photoURL: await getDownloadURL(r), ...stamp() });
}

/* ---- demo data + account deletion ---- */
export async function loadDemo(seed) {
  try { const b = writeBatch(db), set = (p, d) => b.set(doc(col(p)), { ...d, demo: true, createdAt: serverTimestamp(), ...stamp() });
    seed.forEach(t => set('transactions', toTx(t))); DEMO_GOALS.forEach(g => set('goals', toGoal(g))); DEMO_REC.forEach(r => set('recurringExpenses', toRec(r)));
    await b.commit(); hooks.toast('Demo data loaded ✓'); } catch (e) { fail(e); }
}
export async function clearDemo() {
  try { const b = writeBatch(db); for (const p of ['transactions', 'goals', 'recurringExpenses']) (await getDocs(query(col(p), where('demo', '==', true)))).forEach(d => b.delete(d.ref)); await b.commit(); hooks.toast('Demo data removed', 'warning'); } catch (e) { fail(e); }
}
export async function deleteAccount() {
  try { await httpsCallable(functions, 'deleteAccount')(); unsubs.forEach(f => f()); await signOut(auth); location.replace('login.html'); } catch (e) { fail(e); }
}

