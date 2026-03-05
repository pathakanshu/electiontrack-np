/**
 * src/worker.ts
 *
 * Cloudflare Worker that keeps election result data fresh during active counting.
 *
 * Two responsibilities:
 *
 * 1. **Cron trigger (scheduled)** — Runs every minute, fetches the latest
 *    election result files from the Election Commission (ECN) and writes
 *    them to Cloudflare KV if the content has changed.
 *
 * 2. **Request handler (fetch)** — Intercepts requests for cache files
 *    (e.g. `/cache/2082/ElectionResultCentral2082.txt`). If a fresher
 *    version exists in KV, it's served with appropriate cache headers.
 *    Otherwise the request falls through to the static asset.
 *
 * This means the app code doesn't change at all — it still fetches from
 * the same paths. The worker transparently serves live data when available.
 */

export interface Env {
  /** KV namespace bound in wrangler.jsonc */
  ELECTION_DATA: KVNamespace;
  /** Static asset binding — provided automatically by Cloudflare when
   *  the `assets` block is present in wrangler.jsonc */
  ASSETS: Fetcher;
}

// ---------------------------------------------------------------------------
// Sources to poll — only the current (live) election's volatile files
// ---------------------------------------------------------------------------

interface DataSource {
  /** ECN remote URL to fetch from */
  remote: string;
  /** Local path the app requests (must match the endpoint in elections.ts) */
  localPath: string;
  /** KV key */
  kvKey: string;
}

const LIVE_SOURCES: DataSource[] = [
  {
    remote:
      'https://result.election.gov.np/JSONFiles/ElectionResultCentral2082.txt',
    localPath: '/cache/2082/ElectionResultCentral2082.txt',
    kvKey: 'live:2082:candidates',
  },
  {
    remote:
      'https://result.election.gov.np/JSONFiles/Election2082/Common/PRHoRPartyTop5.txt',
    localPath: '/cache/2082/PRHoRPartyTop5.txt',
    kvKey: 'live:2082:pr-national',
  },
];

// KV key that stores a hash of each source's content so we only write on change
function hashKey(kvKey: string): string {
  return `${kvKey}:hash`;
}

// ---------------------------------------------------------------------------
// Cron handler — fetch from ECN, write to KV if changed
// ---------------------------------------------------------------------------

async function handleScheduled(env: Env): Promise<void> {
  for (const source of LIVE_SOURCES) {
    try {
      const response = await fetch(source.remote, {
        headers: {
          // Pretend to be a browser so ECN doesn't reject us
          'User-Agent':
            'Mozilla/5.0 (compatible; ElectionTracker/1.0; +https://election.pathakanshu.com)',
          Accept: 'application/json, text/plain, */*',
        },
        cf: {
          // Don't use Cloudflare's own cache for the upstream fetch —
          // we always want the freshest data from ECN
          cacheTtl: 0,
          cacheEverything: false,
        },
      });

      if (!response.ok) {
        console.error(
          `[cron] ${source.kvKey}: ECN returned HTTP ${response.status}`
        );
        continue;
      }

      const body = await response.text();

      if (!body || body.trim().length === 0) {
        console.log(`[cron] ${source.kvKey}: empty response, skipping`);
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
      // Store with metadata so we can serve proper headers later
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
      console.error(`[cron] ${source.kvKey}: fetch failed:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Request handler — serve from KV if available, else fall through to static
// ---------------------------------------------------------------------------

async function handleFetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext
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
    const kvResponse = await handleFetch(request, env, ctx);
    if (kvResponse) {
      return kvResponse;
    }

    // Fall through to static assets via the ASSETS binding.
    // This is the correct way to serve static files when a Worker has
    // a `main` entry point alongside an `assets` directory — calling
    // bare `fetch(request)` would loop back into this handler.
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
