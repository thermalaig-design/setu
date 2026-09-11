import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchTrustByAppSlug } from '../services/trustService';
import { applyTenantManifest } from '../utils/pwaManifest';

// These keys represent the identity of THIS installed PWA / customer link.
// They are set once when a valid Trust slug is resolved and must never be
// overwritten by in-app Trust switching (that uses `selected_trust_id`).
const INSTALLED_TRUST_ID_KEY = 'installed_app_trust_id';
const INSTALLED_SLUG_KEY = 'installed_app_slug';

const TenantContext = createContext(null);

const readStored = (key) => {
  try {
    return String(localStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
};

const writeStored = (key, value) => {
  try {
    if (value) {
      localStorage.setItem(key, value);
    }
  } catch {
    // ignore storage failures
  }
};

export const TenantProvider = ({ children }) => {
  const [tenantTrust, setTenantTrust] = useState(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState('');
  const [installedTrustId, setInstalledTrustId] = useState(() => readStored(INSTALLED_TRUST_ID_KEY));
  const [installedSlug, setInstalledSlug] = useState(() => readStored(INSTALLED_SLUG_KEY));
  const rehydratedRef = useRef(false);

  const resolveTenantFromSlug = useCallback(async (slug) => {
    const normalizedSlug = String(slug || '').trim().toLowerCase();
    if (!normalizedSlug) {
      setTenantError('');
      return null;
    }

    setTenantLoading(true);
    setTenantError('');
    try {
      const trust = await fetchTrustByAppSlug(normalizedSlug);
      if (!trust) {
        setTenantTrust(null);
        setTenantError('not_found');
        return null;
      }

      setTenantTrust(trust);
      writeStored(INSTALLED_TRUST_ID_KEY, String(trust.id));
      writeStored(INSTALLED_SLUG_KEY, normalizedSlug);
      setInstalledTrustId(String(trust.id));
      setInstalledSlug(normalizedSlug);

      return trust;
    } catch (err) {
      console.warn('[Tenant] Failed to resolve slug:', err?.message || err);
      setTenantTrust(null);
      setTenantError('error');
      return null;
    } finally {
      setTenantLoading(false);
    }
  }, []);

  // On app boot, if this device already has an installed tenant identity
  // (a slug resolved on a previous launch), re-resolve it so branding /
  // manifest / theme are available immediately without needing the user to
  // revisit the /<slug> landing route again.
  useEffect(() => {
    if (rehydratedRef.current) return;
    rehydratedRef.current = true;
    if (installedSlug && !tenantTrust) {
      resolveTenantFromSlug(installedSlug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!tenantTrust || !installedSlug) return;
    applyTenantManifest({ slug: installedSlug, trust: tenantTrust });
  }, [tenantTrust, installedSlug]);

  const value = useMemo(() => ({
    tenantTrust,
    tenantLoading,
    tenantError,
    installedTrustId,
    installedSlug,
    resolveTenantFromSlug
  }), [tenantTrust, tenantLoading, tenantError, installedTrustId, installedSlug, resolveTenantFromSlug]);

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return ctx;
};
