/**
 * src/hooks/useHashRouter.ts
 *
 * Lightweight hash-based router for the app.
 * No external dependencies — just listens to `window.location.hash`.
 *
 * Usage:
 * ```ts
 * const { path, navigate } = useHashRouter();
 * // path === '/' when hash is '' or '#/'
 * // path === '/statistics' when hash is '#/statistics'
 * ```
 *
 * Why hash-based?
 * - No server configuration needed (no catch-all route for SPA)
 * - Works perfectly with Vite dev server and static hosting
 * - Zero dependencies — keeps the bundle small
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * Extract the path portion from `window.location.hash`.
 *
 * Examples:
 *   ''             → '/'
 *   '#'            → '/'
 *   '#/'           → '/'
 *   '#/statistics' → '/statistics'
 *   '#/about'      → '/about'
 */
function getPathFromHash(): string {
  const hash = window.location.hash;
  if (!hash || hash === '#' || hash === '#/') return '/';
  // Strip the leading '#' and ensure it starts with '/'
  const path = hash.startsWith('#/') ? hash.slice(1) : hash.slice(1);
  return path.startsWith('/') ? path : `/${path}`;
}

export function useHashRouter() {
  const [path, setPath] = useState<string>(getPathFromHash);

  useEffect(() => {
    const handleHashChange = () => {
      setPath(getPathFromHash());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  /**
   * Programmatically navigate to a new hash path.
   *
   * @param to - The path to navigate to (e.g. '/' or '/statistics')
   */
  const navigate = useCallback((to: string) => {
    const normalized = to.startsWith('/') ? to : `/${to}`;
    window.location.hash = `#${normalized}`;
  }, []);

  return { path, navigate };
}

export default useHashRouter;
