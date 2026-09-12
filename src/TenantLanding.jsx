import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useTenant } from './context/TenantContext';
import { isReservedSlug } from './constants/reservedRoutes';
import { fetchMemberTrustMemberships } from './services/trustService';
import { getUserHospitalMemberships } from './utils/storageUtils';

const LAST_SELECTED_TRUST_ID_KEY = 'last_selected_trust_id';
const normalizeText = (value) => String(value || '').trim();

const isIosSafari = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
};

const isStandaloneDisplay = () => {
  if (typeof window === 'undefined') return false;
  const mql = window.matchMedia && window.matchMedia('(display-mode: standalone)');
  return Boolean(mql?.matches) || window.navigator?.standalone === true;
};

function TenantLanding() {
  const { appSlug } = useParams();
  const navigate = useNavigate();
  const { tenantTrust, tenantLoading, tenantError, resolveTenantFromSlug } = useTenant();

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installOutcome, setInstallOutcome] = useState('');
  const [resolvedOnce, setResolvedOnce] = useState(false);
  const [checkingMembership, setCheckingMembership] = useState(false);
  const [membershipMessage, setMembershipMessage] = useState('');

  const reserved = isReservedSlug(appSlug);

  useEffect(() => {
    if (reserved) return;
    let active = true;
    resolveTenantFromSlug(appSlug).finally(() => {
      if (active) setResolvedOnce(true);
    });
    return () => { active = false; };
  }, [appSlug, reserved, resolveTenantFromSlug]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  // Shared by "Continue in Browser" and the standalone (installed PWA) auto
  // entry below: resolves the same Trust identity through both paths so the
  // Trust opened from /<slug> is always the Trust the user lands in after
  // login, never whatever Trust was last selected on another app.
  const enterTenantTrust = useCallback(async ({ source } = {}) => {
    setMembershipMessage('');

    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const rawUser = isLoggedIn ? localStorage.getItem('user') : null;
    let user = null;
    try {
      user = rawUser ? JSON.parse(rawUser) : null;
    } catch {
      user = null;
    }

    if (!isLoggedIn || !user) {
      navigate('/login', { replace: true });
      return false;
    }

    const tenantTrustId = normalizeText(tenantTrust?.id);
    const membersId = user.members_id || user.member_id || user.id || null;
    const membershipNumber = user.membership_number || user['Membership number'] || '';

    setCheckingMembership(true);
    try {
      // Reuse the same membership-lookup service OTPVerification.jsx uses to
      // verify Trust membership, instead of introducing a second model.
      let memberships = [];
      try {
        memberships = await fetchMemberTrustMemberships({ membersId, membershipNumber });
      } catch (fetchErr) {
        console.warn('[TenantLanding] Live membership check failed, using cached memberships:', fetchErr?.message || fetchErr);
        memberships = getUserHospitalMemberships(user);
      }

      const tenantMembership = (Array.isArray(memberships) ? memberships : [])
        .find((membership) => normalizeText(membership?.trust_id) === tenantTrustId);

      if (tenantMembership) {
        const trustName = normalizeText(tenantMembership.trust_name || tenantTrust?.name);
        localStorage.setItem('selected_trust_id', tenantTrustId);
        localStorage.setItem(LAST_SELECTED_TRUST_ID_KEY, tenantTrustId);
        if (trustName) localStorage.setItem('selected_trust_name', trustName);
        window.dispatchEvent(new CustomEvent('trust-changed', {
          detail: { trustId: tenantTrustId, trustName: trustName || null, source: source || 'tenant-continue-in-browser' }
        }));
        navigate('/', { replace: true });
        return true;
      }

      setMembershipMessage(`Your account is not a member of ${tenantTrust?.name || 'this'}. Please log in with the mobile number registered for this Trust.`);
      return false;
    } catch (err) {
      console.warn('[TenantLanding] Membership verification failed:', err?.message || err);
      setMembershipMessage('Unable to verify your membership right now. Please try again.');
      return false;
    } finally {
      setCheckingMembership(false);
    }
  }, [navigate, tenantTrust]);

  // If the app is already installed (running standalone) and the tenant
  // resolved successfully, skip the marketing landing and go straight to
  // the normal auth flow for this Trust identity — verifying membership and
  // switching selected_trust_id the same way "Continue in Browser" does, so
  // opening the installed Setu app never lands you inside another Trust.
  useEffect(() => {
    if (!resolvedOnce || !tenantTrust) return;
    if (!isStandaloneDisplay()) return;
    enterTenantTrust({ source: 'tenant-standalone-launch' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedOnce, tenantTrust]);

  if (reserved) {
    return <Navigate to="/" replace />;
  }

  if (tenantLoading || !resolvedOnce) {
    return (
      <div style={styles.page}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Loading…</p>
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  if (!tenantTrust || tenantError === 'not_found') {
    return (
      <div style={styles.page}>
        <div style={styles.notAvailableCard}>
          <h1 style={styles.notAvailableHeading}>App not available</h1>
          <p style={styles.notAvailableText}>
            This link is not active. Please check the link or contact your organization.
          </p>
        </div>
      </div>
    );
  }

  const themeColor = tenantTrust.pwa_theme_color || '#d4af37';
  const backgroundColor = tenantTrust.pwa_background_color || '#1a1a1a';
  const logoUrl = tenantTrust.pwa_icon_192_url || tenantTrust.icon_url || '';

  // Standalone (installed PWA) launches auto-enter via enterTenantTrust above;
  // show a branded spinner instead of flashing the Install/Continue card
  // while that redirect/membership check is in flight.
  if (isStandaloneDisplay() && !membershipMessage) {
    return (
      <div style={{ ...styles.page, background: backgroundColor }}>
        <div style={{ ...styles.spinner, borderTopColor: themeColor }} />
        <p style={styles.loadingText}>Opening {tenantTrust.name}…</p>
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setInstallOutcome(outcome);
      setDeferredPrompt(null);
      return;
    }
    setInstallOutcome(isIosSafari() ? 'ios-instructions' : 'unsupported');
  };

  const handleContinueInBrowser = () => enterTenantTrust({ source: 'tenant-continue-in-browser' });

  return (
    <div style={{ ...styles.page, background: backgroundColor }}>
      <div className="tenant-card" style={styles.card}>
        {logoUrl && (
          <img
            src={logoUrl}
            alt={tenantTrust.name || 'App icon'}
            style={styles.logo}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <h1 style={{ ...styles.heading, color: themeColor }}>{tenantTrust.name}</h1>
        <p style={styles.subheading}>Install the app for the best experience</p>

        <button
          type="button"
          className="tenant-install-btn"
          onClick={handleInstallClick}
          style={{ ...styles.installBtn, background: themeColor }}
        >
          Install App
        </button>

        <button
          type="button"
          className="tenant-continue-btn"
          onClick={handleContinueInBrowser}
          disabled={checkingMembership}
          style={{ ...styles.continueBtn, ...(checkingMembership ? styles.continueBtnDisabled : {}) }}
        >
          {checkingMembership ? (
            <span style={styles.btnLoading}>
              <span style={styles.btnSpinner} />
              Checking…
            </span>
          ) : 'Continue in Browser'}
        </button>

        {membershipMessage && (
          <p style={styles.membershipMessage}>{membershipMessage}</p>
        )}

        {installOutcome === 'ios-instructions' && (
          <p style={styles.instructions}>
            To install: tap the <strong>Share</strong> icon in Safari, then choose{' '}
            <strong>Add to Home Screen</strong>.
          </p>
        )}
        {installOutcome === 'unsupported' && (
          <p style={styles.instructions}>
            Your browser does not support one-tap install. Use your browser menu and choose{' '}
            <strong>Add to Home Screen</strong> / <strong>Install App</strong>.
          </p>
        )}
        {installOutcome === 'dismissed' && (
          <p style={styles.instructions}>You can install the app anytime from your browser menu.</p>
        )}
      </div>
      <style>{`
        @keyframes tenantCardIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .tenant-card { animation: tenantCardIn 0.35s ease-out; }
        .tenant-install-btn { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .tenant-install-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(0,0,0,0.3); }
        .tenant-install-btn:active { transform: translateY(0); }
        .tenant-continue-btn { transition: border-color 0.15s ease, background 0.15s ease; }
        .tenant-continue-btn:hover:not(:disabled) { border-color: #7a7a7a; background: rgba(255,255,255,0.04); }
      `}</style>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
    background: '#1a1a1a',
  },
  spinner: {
    width: '28px',
    height: '28px',
    border: '3px solid rgba(255,255,255,0.2)',
    borderTopColor: '#d4af37',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: '#a0a0a0',
    marginTop: '12px',
    fontSize: '13px',
  },
  notAvailableCard: {
    background: '#222',
    border: '1px solid #3a3a3a',
    borderRadius: '14px',
    padding: '32px 24px',
    textAlign: 'center',
    maxWidth: '360px',
  },
  notAvailableHeading: {
    color: '#f0e8d0',
    margin: '0 0 8px',
    fontSize: '20px',
  },
  notAvailableText: {
    color: '#8a8a8a',
    fontSize: '13px',
    margin: 0,
  },
  card: {
    width: '100%',
    maxWidth: '380px',
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '18px',
    padding: '36px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '12px',
    boxShadow: '0 20px 44px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(6px)',
  },
  logo: {
    width: '88px',
    height: '88px',
    borderRadius: '20px',
    objectFit: 'cover',
    marginBottom: '8px',
  },
  heading: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 700,
  },
  subheading: {
    margin: '0 0 12px',
    color: '#c8c8c8',
    fontSize: '13px',
  },
  installBtn: {
    width: '100%',
    border: 'none',
    borderRadius: '10px',
    padding: '15px',
    color: '#080808',
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
  },
  continueBtn: {
    width: '100%',
    border: '1px solid #4a4a4a',
    borderRadius: '10px',
    padding: '13px',
    background: 'transparent',
    color: '#d8d8d8',
    fontWeight: 600,
    fontSize: '14px',
    cursor: 'pointer',
  },
  continueBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  btnLoading: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  btnSpinner: {
    width: '13px',
    height: '13px',
    border: '2px solid rgba(255,255,255,0.25)',
    borderTopColor: '#d8d8d8',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  membershipMessage: {
    color: '#f5c842',
    fontSize: '12px',
    marginTop: '4px',
    lineHeight: 1.4,
  },
  instructions: {
    color: '#a8a8a8',
    fontSize: '12px',
    marginTop: '4px',
  },
};

export default TenantLanding;
