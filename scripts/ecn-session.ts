/**
 * scripts/ecn-session.ts
 *
 * Server-side helper for authenticating with the Election Commission of
 * Nepal (ECN) website. The ECN now routes all JSON data through a secure
 * handler (`/Handlers/SecureJson.ashx`) that requires:
 *
 *   1. A valid `ASP.NET_SessionId` cookie (set on first page load)
 *   2. A `CsrfToken` cookie (also set on first page load)
 *   3. The CSRF token echoed back in an `X-CSRF-Token` request header
 *   4. `Referer` and `Origin` headers matching the ECN origin
 *
 * This module handles the full bootstrap dance and exposes a simple
 * `ecnFetch(filePath)` function for use in Node scripts (download-cache,
 * generate-geometry, etc.).
 *
 * Usage:
 *   import { ecnFetch, bootstrapEcnSession } from './ecn-session';
 *
 *   await bootstrapEcnSession();          // optional — ecnFetch auto-bootstraps
 *   const data = await ecnFetch('JSONFiles/ElectionResultCentral2082.txt');
 *   const json = JSON.parse(data);
 */

// ── Constants ───────────────────────────────────────────────────────────

const ECN_ORIGIN = 'https://result.election.gov.np';
const ECN_HANDLER_PATH = '/Handlers/SecureJson.ashx';
const USER_AGENT = 'Mozilla/5.0 (compatible; ElectionTrackNP/1.0)';

/** Maximum time (ms) to wait for a single ECN request. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Maximum time (ms) for the large central results file. */
const LARGE_REQUEST_TIMEOUT_MS = 120_000;

// ── Session state ───────────────────────────────────────────────────────

let sessionCookies: string | null = null;
let csrfToken: string | null = null;
let bootstrapInFlight: Promise<void> | null = null;

// ── Internal helpers ────────────────────────────────────────────────────

function log(...args: unknown[]) {
  console.log(`[ecn-session]`, ...args);
}

function warn(...args: unknown[]) {
  console.warn(`[ecn-session]`, ...args);
}

/**
 * Parse `Set-Cookie` headers into a Map of name → value.
 *
 * Node's fetch (undici) returns `set-cookie` as a comma-joined string
 * when accessed via `headers.get('set-cookie')`, but provides
 * `headers.getSetCookie()` as an array in newer versions.
 */
function parseCookies(res: Response): Map<string, string> {
  const map = new Map<string, string>();

  // Prefer getSetCookie() if available (Node ≥ 18.14 / undici)
  const setCookieArray =
    typeof (res.headers as any).getSetCookie === 'function'
      ? ((res.headers as any).getSetCookie() as string[])
      : null;

  const rawHeaders: string[] =
    setCookieArray ??
    (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);

  for (const header of rawHeaders) {
    const pair = header.split(';')[0].trim(); // "Name=Value"
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      map.set(pair.slice(0, eqIdx).trim(), pair.slice(eqIdx + 1).trim());
    }
  }

  return map;
}

/**
 * Build a `Cookie` header string from the parsed cookie map.
 */
function cookieString(cookies: Map<string, string>): string {
  return Array.from(cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * Create an AbortController that auto-aborts after `ms` milliseconds.
 */
function timeoutController(ms: number): {
  controller: AbortController;
  clear: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    controller,
    clear: () => clearTimeout(timer),
  };
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Bootstrap an ECN session by loading the homepage and capturing cookies.
 *
 * Multiple concurrent callers share the same in-flight promise.
 * Safe to call multiple times — it will skip if a session already exists.
 *
 * @param force  If `true`, discard the current session and create a new one.
 */
export async function bootstrapEcnSession(force = false): Promise<void> {
  if (!force && csrfToken && sessionCookies) return;

  if (bootstrapInFlight) return bootstrapInFlight;

  bootstrapInFlight = (async () => {
    try {
      log('Bootstrapping session…');

      const { controller, clear } = timeoutController(REQUEST_TIMEOUT_MS);

      const res = await fetch(ECN_ORIGIN + '/', {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
        signal: controller.signal,
      });
      clear();

      const cookies = parseCookies(res);
      csrfToken = cookies.get('CsrfToken') ?? null;
      sessionCookies = cookieString(cookies);

      if (!csrfToken) {
        warn('Bootstrap succeeded but no CsrfToken cookie received.');
        warn('Cookies received:', Array.from(cookies.keys()).join(', '));
      } else {
        log('Session bootstrapped successfully. CSRF token obtained.');
      }
    } catch (err) {
      console.error('[ecn-session] Bootstrap failed:', (err as Error).message);
      sessionCookies = null;
      csrfToken = null;
    } finally {
      bootstrapInFlight = null;
    }
  })();

  return bootstrapInFlight;
}

/**
 * Invalidate the current session, forcing a re-bootstrap on the next fetch.
 */
export function invalidateEcnSession(): void {
  sessionCookies = null;
  csrfToken = null;
  bootstrapInFlight = null;
}

/**
 * Fetch a file from the ECN secure handler.
 *
 * Automatically bootstraps a session if one doesn't exist, and retries
 * once on a 403 (session expired).
 *
 * @param filePath  The file path on the ECN server, e.g.
 *                  `"JSONFiles/ElectionResultCentral2082.txt"` or
 *                  `"JSONFiles/Election2082/HOR/FPTP/HOR-1-1.json"`.
 * @param options   Optional overrides.
 * @returns The raw response text (usually JSON).
 * @throws On network errors or if the ECN returns a non-success status
 *         after retry.
 */
export async function ecnFetch(
  filePath: string,
  options?: {
    /** Override the default timeout (ms). Use for large files. */
    timeoutMs?: number;
    /** If true, parse and return JSON directly. */
    json?: boolean;
  }
): Promise<string>;
export async function ecnFetch<T = unknown>(
  filePath: string,
  options: { timeoutMs?: number; json: true }
): Promise<T>;
export async function ecnFetch(
  filePath: string,
  options?: { timeoutMs?: number; json?: boolean }
): Promise<unknown> {
  // Auto-bootstrap
  if (!csrfToken || !sessionCookies) {
    await bootstrapEcnSession();
  }

  if (!csrfToken || !sessionCookies) {
    throw new Error(
      `[ecn-session] Cannot fetch "${filePath}": session bootstrap failed.`
    );
  }

  const isLargeFile = filePath.includes('ElectionResultCentral');
  const timeoutMs =
    options?.timeoutMs ??
    (isLargeFile ? LARGE_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  const url = `${ECN_ORIGIN}${ECN_HANDLER_PATH}?file=${encodeURIComponent(filePath)}`;

  const doFetch = async (): Promise<Response> => {
    const { controller, clear } = timeoutController(timeoutMs);
    try {
      return await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Cookie: sessionCookies!,
          'X-CSRF-Token': csrfToken!,
          Referer: ECN_ORIGIN + '/',
          Origin: ECN_ORIGIN,
        },
        signal: controller.signal,
      });
    } finally {
      clear();
    }
  };

  // First attempt
  let res = await doFetch();

  // Retry once on 403 (session expired)
  if (res.status === 403) {
    log(`Got 403 for "${filePath}", re-bootstrapping session…`);
    invalidateEcnSession();
    await bootstrapEcnSession(true);

    if (!csrfToken || !sessionCookies) {
      throw new Error(
        `[ecn-session] Re-bootstrap failed while fetching "${filePath}".`
      );
    }

    res = await doFetch();
  }

  if (!res.ok) {
    const snippet = (await res.text()).slice(0, 300);
    throw new Error(
      `[ecn-session] HTTP ${res.status} for "${filePath}": ${snippet}`
    );
  }

  const text = await res.text();

  if (options?.json) {
    return JSON.parse(text);
  }

  return text;
}

/**
 * Convenience: fetch and parse JSON from ECN.
 */
export async function ecnFetchJson<T = unknown>(filePath: string): Promise<T> {
  return ecnFetch<T>(filePath, { json: true });
}

/**
 * Check whether the ECN secure handler is reachable with the current session.
 * Useful as a connectivity check before starting a long download.
 *
 * Retries once after re-bootstrapping the session if the first attempt fails,
 * since the ECN server is aggressive with session timeouts.
 *
 * @returns `true` if a small file can be fetched successfully.
 */
export async function isEcnReachable(): Promise<boolean> {
  const probe = 'JSONFiles/Election2082/Local/Lookup/states.json';

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      log(`Reachability check (attempt ${attempt}/2)…`);
      const data = await ecnFetch(probe, { timeoutMs: 20_000 });
      // Quick sanity: should start with '[' (array of states)
      if (data.trimStart().startsWith('[')) {
        log('Reachability check passed.');
        return true;
      }
      warn(
        `Reachability check returned unexpected data: ${data.slice(0, 100)}`
      );
    } catch (err) {
      warn(
        `Reachability check attempt ${attempt} failed: ${(err as Error).message}`
      );
      if (attempt === 1) {
        // Session may have expired between bootstrap and probe — retry
        log('Re-bootstrapping session before retry…');
        invalidateEcnSession();
        await bootstrapEcnSession(true);
      }
    }
  }

  warn('ECN reachability check failed after 2 attempts.');
  return false;
}
