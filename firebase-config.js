/* ═══════════════════════════════════════════════════
   NUPTIA — firebase-config.js
   ───────────────────────────────────────────────────
   HOW TO SET UP FIREBASE (FREE):
   1. Go to https://console.firebase.google.com/
   2. Click "Add project" → give it a name → Create
   3. On the project dashboard, click the </> (Web) icon
   4. Register your app, copy the firebaseConfig values below
   5. In the Firebase console → Build → Firestore Database
   6. Click "Create database" → Start in test mode → Enable
   7. Replace the placeholder values below with your real values
   8. That's it! Your data will sync to the cloud automatically.

   NOTE: The app works perfectly WITHOUT Firebase too.
   If you leave these as placeholders, data saves to localStorage.
   ═══════════════════════════════════════════════════ */

const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

/* ── Firebase initialisation (safe — won't crash if not configured) ── */
let db = null;
let FIREBASE_READY = false;

(function initFirebase() {
  const isConfigured = FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY";
  if (!isConfigured) {
    console.info("Nuptia: Firebase not configured — using localStorage. See firebase-config.js for setup instructions.");
    return;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    FIREBASE_READY = true;
    console.info("Nuptia: Firebase connected ✓");
  } catch (err) {
    console.warn("Nuptia: Firebase init failed — falling back to localStorage.", err);
  }
})();
