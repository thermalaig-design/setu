// Resolves where "go to app Home" should actually land.
//
// A white-label tenant PWA is installed from /app/<slug> (see
// TenantLanding.jsx / TenantContext.jsx) and keeps running from that same
// origin. On this host, bare '/' belongs to the separate marketing website,
// not the member app — so once installed, any in-app "Home" action must
// return to /app/<slug> instead of '/', or the installed PWA will appear to
// open the marketing site. In a normal (non-standalone) browser tab, Home is
// unaffected and still resolves to '/'.
const INSTALLED_SLUG_KEY = 'installed_app_slug';
const SLUG_PATTERN = /^[a-z0-9-]+$/;

const isStandaloneDisplay = () => {
  if (typeof window === 'undefined') return false;
  const mql = window.matchMedia && window.matchMedia('(display-mode: standalone)');
  return Boolean(mql?.matches) || window.navigator?.standalone === true;
};

const sanitizeSlug = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || !SLUG_PATTERN.test(normalized)) return '';
  return normalized;
};

// getAppHomePath(): the path any "go Home" navigation should use.
// - Installed/standalone PWA with a valid installed_app_slug -> '/app/<slug>'
// - Everything else (normal browser tab, no installed slug, invalid slug) -> '/'
export const getAppHomePath = () => {
  if (!isStandaloneDisplay()) return '/';

  let rawSlug = '';
  try {
    rawSlug = localStorage.getItem(INSTALLED_SLUG_KEY);
  } catch {
    rawSlug = '';
  }

  const slug = sanitizeSlug(rawSlug);
  return slug ? `/app/${slug}` : '/';
};
