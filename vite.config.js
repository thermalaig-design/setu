import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/_setu-app/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The manifest is served dynamically per Trust at
      // /pwa-manifest/<slug>.webmanifest (see src/utils/pwaManifest.js) —
      // never let this plugin generate/link a static one.
      manifest: false,
      injectRegister: 'auto',
      // Assets are built with base '/_setu-app/', but page routes like
      // /setu, /abc-association, /login and / are served from the domain
      // root. The service worker itself must be registered at root scope
      // '/' (independent of the asset base) so it can control every one of
      // those tenant/app routes instead of being confined to /_setu-app/.
      base: '/',
      scope: '/',
      // Only ever register a service worker for production builds — never
      // during `npm run dev`.
      devOptions: {
        enabled: false
      },
      workbox: {
        // The app's main bundle exceeds workbox's default 2 MiB precache
        // limit; raise it so the build doesn't fail precaching that asset.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Disable Workbox's navigation fallback. With scope '/', generateSW
        // otherwise auto-registers a NavigationRoute that serves the cached
        // index.html for every navigation under that scope — including
        // /<slug> routes like /setu, which Nginx already resolves correctly
        // to the member-app index.html. Without this, the service worker
        // hijacks those document navigations and replaces them with the
        // root site's (404) index.html instead of letting them hit the
        // network/Nginx normally.
        navigateFallback: null
      }
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || 'dev')
  }
}))
