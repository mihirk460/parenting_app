// Firebase Auth + Firestore, loaded from Google's CDN only when a config is
// present. One document per parent account: families/{uid} holds the whole
// app state, so the rest of the app never talks to Firestore directly.
import { firebaseConfig } from './firebase-config.js';

const VERSION = '12.18.0';
const CDN = `https://www.gstatic.com/firebasejs/${VERSION}`;

export const enabled = Boolean(firebaseConfig);

let fb; // merged auth + firestore exports
let auth;
let db;

export async function init() {
  const [appMod, authMod, fsMod] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);
  fb = { ...authMod, ...fsMod };
  const app = appMod.initializeApp(firebaseConfig);
  auth = authMod.getAuth(app);
  // Persistent cache: reads and queued writes survive going offline / reloads.
  db = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache() });
}

// ---- Auth ----
export const onAuth = (cb) => fb.onAuthStateChanged(auth, cb);
export const currentUser = () => auth?.currentUser || null;
export const signIn = (email, password) => fb.signInWithEmailAndPassword(auth, email, password);
export const signUp = (email, password) => fb.createUserWithEmailAndPassword(auth, email, password);
export const resetPassword = (email) => fb.sendPasswordResetEmail(auth, email);
export const signOut = () => fb.signOut(auth);

export function friendlyError(e) {
  const code = e?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Wrong email or password.';
  if (code.includes('email-already-in-use')) return 'That email already has an account. Sign in instead.';
  if (code.includes('weak-password')) return 'Password needs at least 6 characters.';
  if (code.includes('invalid-email')) return 'That email address does not look right.';
  if (code.includes('network-request-failed')) return 'No internet connection.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a minute and try again.';
  return e?.message || 'Something went wrong.';
}

// ---- Family document ----
const ref = (uid) => fb.doc(db, 'families', uid);

export async function loadFamily(uid) {
  const snap = await fb.getDoc(ref(uid));
  return snap.exists() ? snap.data() : null;
}

// Fires when the document changes on the server (another device, or the
// parent's other browser). Local echoes are skipped.
export function watchFamily(uid, cb) {
  return fb.onSnapshot(ref(uid), (snap) => {
    if (snap.metadata.hasPendingWrites || !snap.exists()) return;
    cb(snap.data());
  });
}

let timer;
export function saveFamily(uid, state) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    // JSON round-trip strips `undefined`, which Firestore rejects.
    fb.setDoc(ref(uid), JSON.parse(JSON.stringify(state))).catch((e) => console.warn('Cloud save failed', e));
  }, 400);
}
