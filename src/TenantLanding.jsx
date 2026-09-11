import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useTenant } from './context/TenantContext';
import { isReservedSlug } from './constants/reservedRoutes';

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

  // If the app is already installed (running standalone) and the tenant
  // resolved successfully, skip the marketing landing and go straight to
  // the normal auth flow for this Trust identity.
  useEffect(() => {
    if (!resolvedOnce || !tenantTrust) return;
    if (!isStandaloneDisplay()) return;
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    navigate(isLoggedIn ? '/' : '/login', { replace: true });
  }, [resolvedOnce, tenantTrust, navigate]);

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

  const handleContinueInBrowser = () => {
    navigate('/login');
  };

  return (
    <div style={{ ...styles.page, background: backgroundColor }}>
      <div style={styles.card}>
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
          onClick={handleInstallClick}
          style={{ ...styles.installBtn, background: themeColor }}
        >
          Install App
        </button>

        <button type="button" onClick={handleContinueInBrowser} style={styles.continueBtn}>
          Continue in Browser
        </button>

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
    borderRadius: '18px',
    padding: '36px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '12px',
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
  instructions: {
    color: '#a8a8a8',
    fontSize: '12px',
    marginTop: '4px',
  },
};

export default TenantLanding;
