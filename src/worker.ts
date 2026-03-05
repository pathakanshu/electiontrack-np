/**
 * src/worker.ts
 *
 * Cloudflare Worker that keeps election result data fresh during active counting.
 *
 * Two responsibilities:
 *
 * 1. **Cron trigger (scheduled)** — Runs every minute, bootstraps an ECN
 *    session (ASP.NET_SessionId + CsrfToken), fetches the latest election
 *    result files through the CSRF-protected SecureJson handler, and writes
 *    them to Cloudflare KV if the content has changed.
 *
 * 2. **Request handler (fetch)** — Intercepts requests for cache files
 *    (e.g. `/cache/2082/ElectionResultCentral2082.txt`). If a fresher
 *    version exists in KV, it's served with appropriate cache headers.
 *    Otherwise the request falls through to the static asset.
 *
 * ECN Authentication Flow:
 *   1. GET the homepage → capture ASP.NET_SessionId + CsrfToken cookies
 *   2. Use those cookies + X-CSRF-Token header to fetch via SecureJson.ashx
 *   3. On 403, re-bootstrap and retry once (session expired)
 *   4. Session is cached in KV to avoid bootstrapping on every cron tick
 */

export interface Env {
  /** KV namespace bound in wrangler.jsonc */
  ELECTION_DATA: KVNamespace;
  /** Static asset binding — provided automatically by Cloudflare when
   *  the `assets` block is present in wrangler.jsonc */
  ASSETS: Fetcher;
}

// ---------------------------------------------------------------------------
// ECN Constants
// ---------------------------------------------------------------------------

const ECN_ORIGIN = 'https://result.election.gov.np';
const ECN_HANDLER_PATH = '/Handlers/SecureJson.ashx';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// KV key for the cached ECN session
const SESSION_KV_KEY = 'ecn:session';
// Session TTL — re-bootstrap after this many seconds even if not expired
const SESSION_TTL_SECONDS = 600; // 10 minutes

// ---------------------------------------------------------------------------
// ECN Session Types
// ---------------------------------------------------------------------------

interface EcnSession {
  cookies: string;
  csrfToken: string;
  bootstrappedAt: number; // epoch ms
}

// ---------------------------------------------------------------------------
// Sources to poll — only the current (live) election's volatile files
// ---------------------------------------------------------------------------

interface DataSource {
  /** File path for the SecureJson handler (relative to JSONFiles/) */
  ecnFile: string;
  /** Local path the app requests (must match the endpoint in elections.ts) */
  localPath: string;
  /** KV key */
  kvKey: string;
}

const LIVE_SOURCES: DataSource[] = [
  {
    ecnFile: 'JSONFiles/ElectionResultCentral2082.txt',
    localPath: '/cache/2082/ElectionResultCentral2082.txt',
    kvKey: 'live:2082:candidates',
  },
  {
    ecnFile: 'JSONFiles/Election2082/Common/PRHoRPartyTop5.txt',
    localPath: '/cache/2082/PRHoRPartyTop5.txt',
    kvKey: 'live:2082:pr-national',
  },
];

// KV key that stores a hash of each source's content so we only write on change
function hashKey(kvKey: string): string {
  return `${kvKey}:hash`;
}

// ---------------------------------------------------------------------------
// ECN Session Management
// ---------------------------------------------------------------------------

/**
 * Parse `Set-Cookie` headers into a Map of name → value.
 */
function parseCookies(headers: Headers): Map<string, string> {
  const map = new Map<string, string>();

  // Cloudflare Workers support headers.getAll() for set-cookie
  const setCookieHeaders: string[] =
    typeof (headers as any).getAll === 'function'
      ? (headers as any).getAll('set-cookie')
      : (headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);

  for (const header of setCookieHeaders) {
    const pair = header.split(';')[0].trim();
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      map.set(pair.slice(0, eqIdx).trim(), pair.slice(eqIdx + 1).trim());
    }
  }

  return map;
}

/**
 * Bootstrap a fresh ECN session by loading the homepage.
 */
async function bootstrapEcnSession(): Promise<EcnSession | null> {
  try {
    console.log('[ecn] Bootstrapping session…');

    const res = await fetch(ECN_ORIGIN + '/', {
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      console.error(`[ecn] Bootstrap: homepage returned HTTP ${res.status}`);
      return null;
    }

    // Consume body to free the connection
    await res.text();

    const cookies = parseCookies(res.headers);
    const csrfToken = cookies.get('CsrfToken') ?? null;

    if (!csrfToken) {
      console.error(
        '[ecn] Bootstrap: no CsrfToken cookie received. Got:',
        Array.from(cookies.keys()).join(', ')
      );
      return null;
    }

    const cookieString = Array.from(cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    console.log('[ecn] Session bootstrapped successfully.');

    return {
      cookies: cookieString,
      csrfToken,
      bootstrappedAt: Date.now(),
    };
  } catch (err) {
    console.error('[ecn] Bootstrap failed:', (err as Error).message);
    return null;
  }
}

/**
 * Get a valid ECN session — from KV cache or freshly bootstrapped.
 */
async function getSession(
  env: Env,
  forceNew = false
): Promise<EcnSession | null> {
  if (!forceNew) {
    // Try cached session from KV
    const cached = await env.ELECTION_DATA.get<EcnSession>(
      SESSION_KV_KEY,
      'json'
    );
    if (
      cached &&
      Date.now() - cached.bootstrappedAt < SESSION_TTL_SECONDS * 1000
    ) {
      return cached;
    }
  }

  // Bootstrap fresh
  const session = await bootstrapEcnSession();
  if (session) {
    // Cache in KV with TTL
    await env.ELECTION_DATA.put(SESSION_KV_KEY, JSON.stringify(session), {
      expirationTtl: SESSION_TTL_SECONDS,
    });
  }
  return session;
}

/**
 * Fetch a file from ECN's secure handler using the given session.
 * Returns the response text, or null on failure.
 */
async function ecnFetch(
  session: EcnSession,
  filePath: string
): Promise<{ text: string; ok: true } | { ok: false; status: number }> {
  const url = `${ECN_ORIGIN}${ECN_HANDLER_PATH}?file=${encodeURIComponent(filePath)}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Cookie: session.cookies,
      'X-CSRF-Token': session.csrfToken,
      Referer: ECN_ORIGIN + '/',
      Origin: ECN_ORIGIN,
      Accept: 'application/json, text/plain, */*',
    },
  });

  if (!res.ok) {
    // Consume body to free the connection
    await res.text();
    return { ok: false, status: res.status };
  }

  const text = await res.text();
  return { ok: true, text };
}

/**
 * Fetch from ECN with automatic session retry on 403.
 */
async function ecnFetchWithRetry(
  env: Env,
  filePath: string
): Promise<string | null> {
  let session = await getSession(env);
  if (!session) {
    console.error(`[ecn] No session available for "${filePath}"`);
    return null;
  }

  let result = await ecnFetch(session, filePath);

  // Retry once on 403 (session expired)
  if (!result.ok && result.status === 403) {
    console.log(`[ecn] Got 403 for "${filePath}", re-bootstrapping…`);
    session = await getSession(env, true);
    if (!session) {
      console.error(`[ecn] Re-bootstrap failed for "${filePath}"`);
      return null;
    }
    result = await ecnFetch(session, filePath);
  }

  if (!result.ok) {
    console.error(`[ecn] HTTP ${result.status} for "${filePath}"`);
    return null;
  }

  return result.text;
}

// ---------------------------------------------------------------------------
// Cron handler — fetch from ECN, write to KV if changed
// ---------------------------------------------------------------------------

async function handleScheduled(env: Env): Promise<void> {
  for (const source of LIVE_SOURCES) {
    try {
      const body = await ecnFetchWithRetry(env, source.ecnFile);

      if (!body || body.trim().length === 0) {
        console.log(`[cron] ${source.kvKey}: empty or null response, skipping`);
        continue;
      }

      // Quick sanity — the response should look like JSON (starts with [ or {)
      const trimmed = body.trim();
      if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
        console.error(
          `[cron] ${source.kvKey}: response doesn't look like JSON, first 200 chars:`,
          trimmed.slice(0, 200)
        );
        continue;
      }

      // Simple hash to detect changes without storing the full previous body
      const hash = await computeHash(body);
      const previousHash = await env.ELECTION_DATA.get(hashKey(source.kvKey));

      if (hash === previousHash) {
        console.log(`[cron] ${source.kvKey}: unchanged`);
        continue;
      }

      // Content changed — write to KV
      const now = new Date().toUTCString();
      await env.ELECTION_DATA.put(source.kvKey, body, {
        metadata: {
          updatedAt: now,
          contentType: 'application/json',
          etag: hash,
        },
      });

      // Store hash separately
      await env.ELECTION_DATA.put(hashKey(source.kvKey), hash);

      console.log(
        `[cron] ${source.kvKey}: updated (${body.length} bytes, hash=${hash.slice(0, 12)}…)`
      );
    } catch (err) {
      console.error(`[cron] ${source.kvKey}: failed:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Request handler — serve from KV if available, else fall through to static
// ---------------------------------------------------------------------------

async function handleFetch(
  request: Request,
  env: Env
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Check if this path matches any of our live sources
  const source = LIVE_SOURCES.find((s) => s.localPath === pathname);

  if (!source) {
    // Not a live data path — let the static asset handler deal with it
    return undefined;
  }

  // Try to serve from KV
  const { value, metadata } = await env.ELECTION_DATA.getWithMetadata<{
    updatedAt: string;
    contentType: string;
    etag: string;
  }>(source.kvKey, 'text');

  if (!value || !metadata) {
    // No KV data yet — fall through to static asset
    return undefined;
  }

  // Check If-None-Match for 304 support
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch && metadata.etag && ifNoneMatch === `"${metadata.etag}"`) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: `"${metadata.etag}"`,
        'Cache-Control': 'public, max-age=15, s-maxage=10',
      },
    });
  }

  // Serve the fresh data from KV
  return new Response(value, {
    status: 200,
    headers: {
      'Content-Type': metadata.contentType || 'application/json',
      'Last-Modified': metadata.updatedAt,
      ETag: `"${metadata.etag}"`,
      // Short cache — the client polls every 15s anyway. The s-maxage
      // controls Cloudflare's edge cache so not every client request
      // hits KV (which has read limits on the free tier).
      'Cache-Control': 'public, max-age=15, s-maxage=10',
      'Access-Control-Allow-Origin': '*',
      // Signal to the client that this is live data, not the static build
      'X-Data-Source': 'kv-live',
    },
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

async function computeHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Worker entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    // Try to serve live data from KV
    const kvResponse = await handleFetch(request, env);
    if (kvResponse) {
      return kvResponse;
    }

    // Fall through to static assets via the ASSETS binding.
    return env.ASSETS.fetch(request);
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },
};
