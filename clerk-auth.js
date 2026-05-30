/* ═══════════════════════════════════════════════
   NUPTIA — Clerk Authentication Utilities
   Only the PUBLISHABLE key is used client-side.
   The secret key must never appear here.
   ═══════════════════════════════════════════════ */

const CLERK_PK     = 'pk_test_Z29yZ2VvdXMtdnVsdHVyZS00OS5jbGVyay5hY2NvdW50cy5kZXYk';
const CLERK_DOMAIN = 'gorgeous-vulture-49.clerk.accounts.dev';

/* ── Load Clerk JS dynamically ───────────────── */
function loadClerkScript() {
  return new Promise((resolve, reject) => {
    if (window.Clerk) { resolve(); return; }
    const s = document.createElement('script');
    s.src = `https://${CLERK_DOMAIN}/npm/@clerk/clerk-js@latest/dist/clerk.browser.js`;
    s.setAttribute('data-clerk-publishable-key', CLERK_PK);
    s.crossOrigin = 'anonymous';
    s.async = false;
    s.onload  = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* ── Initialise Clerk and call back ─────────── */
async function initClerk(onReady) {
  try {
    await loadClerkScript();
    const clerk = window.Clerk;
    await clerk.load({
      publishableKey: CLERK_PK,
      appearance: {
        variables: {
          colorPrimary:    '#B8872A',
          colorBackground: '#FEFCF7',
          colorText:       '#1C0E06',
          borderRadius:    '10px',
          fontFamily:      'Inter, sans-serif',
        },
        elements: {
          card:             'clerk-card',
          formButtonPrimary:'clerk-btn-primary',
        },
      },
    });
    if (onReady) onReady(clerk);
  } catch (err) {
    console.error('Clerk failed to load:', err);
  }
}

/* ── Require auth — redirect if not signed in ─ */
async function requireAuth() {
  await loadClerkScript();
  await window.Clerk.load({ publishableKey: CLERK_PK });
  if (!window.Clerk.user) {
    window.location.replace('sign-in.html');
    return false;
  }
  return true;
}

/* ── Per-user storage key prefix ────────────── */
function getUserPrefix() {
  const uid = window.Clerk?.user?.id;
  return uid ? `nuptia_${uid}_` : 'nuptia_anon_';
}

/* ── Current user shorthand ─────────────────── */
function currentUser() { return window.Clerk?.user || null; }

/* ── Populate nav avatar / name ─────────────── */
function populateNavUser() {
  const user = currentUser();
  if (!user) return;

  /* Avatar */
  const avatars = document.querySelectorAll('.nav-user-avatar');
  avatars.forEach(el => {
    if (user.imageUrl) {
      el.style.backgroundImage = `url('${user.imageUrl}')`;
      el.style.backgroundSize  = 'cover';
      el.style.backgroundPosition = 'center';
      el.textContent = '';
    } else {
      const initial = (user.firstName?.[0] || user.primaryEmailAddress?.emailAddress?.[0] || 'U').toUpperCase();
      el.textContent = initial;
    }
  });

  /* Name */
  document.querySelectorAll('.nav-user-name').forEach(el => {
    el.textContent = user.firstName
      || user.primaryEmailAddress?.emailAddress?.split('@')[0]
      || 'My Profile';
  });

  /* Email */
  document.querySelectorAll('.nav-user-email').forEach(el => {
    el.textContent = user.primaryEmailAddress?.emailAddress || '';
  });
}

/* ── Sign out ────────────────────────────────── */
async function signOut() {
  await window.Clerk?.signOut();
  window.location.replace('sign-in.html');
}

/* ── Expose globally ─────────────────────────── */
window.NuptiaAuth = {
  initClerk,
  requireAuth,
  getUserPrefix,
  currentUser,
  populateNavUser,
  signOut,
  CLERK_PK,
  CLERK_DOMAIN,
};
