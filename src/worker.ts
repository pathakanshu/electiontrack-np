/**
 * src/worker.ts
 *
 * Cloudflare Worker that keeps election result data fresh during active counting.
 *
 * Two responsibilities:
 *
 * 1. **Cron trigger (scheduled)** — Runs every minute. If `config:live-mode`
 *    is `"true"` in KV, bootstraps an ECN session, fetches the central
 *    results file (primary) and per-constituency FPTP files (overlay).
 *    For each constituency the source with more total votes wins — so
 *    per-constituency data is never overwritten by a staler central file.
 *    Also fetches PR and FPTP party leaderboards.
 *    If live-mode is off, the cron is a no-op.
 *
 * 2. **Request handler (fetch)** — Intercepts requests for cache files
 *    (e.g. `/cache/2082/ElectionResultCentral2082.txt`). If a fresher
 *    version exists in KV, it's served with appropriate cache headers.
 *    Otherwise the request falls through to the static asset.
 *
 * Safety invariant: KV is NEVER written with data that is worse than what's
 * already there. If a cron run fails or returns fewer candidates than the
 * previous run, the write is skipped and users keep seeing the last good data.
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
// KV Keys
// ---------------------------------------------------------------------------

/** KV flag — set to "true" to enable live fetching, anything else = off */
const LIVE_MODE_KEY = 'config:live-mode';

/** Cached constituency list from ECN */
const CONSTITUENCY_LIST_KEY = 'cache:2082:constituencies';

/** Main candidates data (merged from all per-const caches) */
const CANDIDATES_KV_KEY = 'live:2082:candidates';

/** PR national aggregate */
const PR_NATIONAL_KV_KEY = 'live:2082:pr-national';

// Central file path kept for reference but no longer fetched — per-constituency
// files are the sole data source as they update faster during active counting.
// const CENTRAL_FILE_ECN_PATH = 'JSONFiles/ElectionResultCentral2082.txt';

/**
 * Combined state blob: per-constituency fetch state + per-constituency
 * candidate data, all in a single KV key to minimize KV operations.
 *
 * Shape: { state: ConstStateMap, constData: Record<string, unknown[]> }
 */
const CONST_BLOB_KV_KEY = 'cache:2082:const-blob';

/** Lightweight run-status key — written at start/end of each cron run
 *  so the /admin/status endpoint can show what the worker is currently doing. */
const RUN_STATUS_KV_KEY = 'cron:run-status';

interface RunStatus {
  /** "running" while a cron is active, "idle" after it finishes */
  state: 'running' | 'idle';
  startedAt: string;
  /** Only present when state is "idle" */
  finishedAt?: string;
  /** Human-readable summary of what happened / is happening */
  detail: string;
}

// ---------------------------------------------------------------------------
// Batching / Rate-limit Config
// ---------------------------------------------------------------------------

/**
 * Max number of per-constituency fetches per cron run.
 * On paid plan we can afford to fetch all 165 every run.
 * Failed constituencies are tried first, then never-fetched, then stale ones.
 */
const MAX_FETCHES_PER_RUN = 165;

/**
 * Number of requests to fire concurrently in each batch.
 * ECN has a very tight per-IP rate limit from data center IPs (~25-30 req/min).
 * 3 concurrent requests with a 500ms inter-batch delay keeps the sustained
 * rate manageable while being ~3× faster than sequential.
 */
const BATCH_SIZE = 3;

/** Delay between each batch of concurrent requests in ms */
const BATCH_DELAY_MS = 500;

/** Extra random jitter (0 to this many ms) added to each batch delay */
const BATCH_JITTER_MS = 200;

/**
 * When we hit a 429, pause for this long before continuing.
 * Each successive 429 within a run doubles the pause (exponential backoff)
 * up to BACKOFF_MAX_MS. After a successful post-backoff batch, the breaker
 * counter is decremented by 1 to give ECN recovery credit.
 */
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 10000;

/**
 * After this many consecutive *batch* failures within a queue phase,
 * skip ahead to the next phase. If both phases trip, stop entirely.
 */
const MAX_CONSECUTIVE_BATCH_FAILURES = 5;

/**
 * Skip constituencies that were successfully fetched less than this many
 * ms ago. Set close to the cron interval (60s) so back-to-back runs
 * don't waste budget re-fetching cached ones — leaving more room for retries.
 */
const FRESHNESS_THRESHOLD_MS = 45_000; // 45 seconds

/**
 * Constituencies with data older than this are eligible for refresh
 * (lower priority than failed/zero-vote ones). During an active election
 * this keeps vote counts reasonably current even for already-cached
 * constituencies. Set to 2 minutes so each constituency gets refreshed
 * roughly every 2 cron cycles.
 */
const STALE_REFRESH_MS = 120_000; // 2 minutes

/**
 * If a cron run assembles fewer candidates than this fraction of the previous
 * run's count, we refuse to write — something is probably wrong.
 * e.g. 0.5 means "don't write if we got less than 50% of previous count".
 */
const MIN_CANDIDATE_RATIO = 0.9;

// ---------------------------------------------------------------------------
// ECN Session Types
// ---------------------------------------------------------------------------

interface EcnSession {
  cookies: string;
  csrfToken: string;
  bootstrappedAt: number; // epoch ms
}

// ---------------------------------------------------------------------------
// Sources for simple single-file fetches (PR + FPTP leaderboard)
// ---------------------------------------------------------------------------

interface SimpleSource {
  ecnFile: string;
  localPath: string;
  kvKey: string;
}

const SIMPLE_SOURCES: SimpleSource[] = [
  {
    ecnFile: 'JSONFiles/Election2082/Common/PRHoRPartyTop5.txt',
    localPath: '/cache/2082/PRHoRPartyTop5.txt',
    kvKey: PR_NATIONAL_KV_KEY,
  },
];

/**
 * All local paths that the fetch handler should intercept and serve from KV.
 * Maps localPath → kvKey.
 */
const LIVE_PATH_MAP: Record<string, string> = {
  '/cache/2082/ElectionResultCentral2082.txt': CANDIDATES_KV_KEY,
  '/cache/2082/PRHoRPartyTop5.txt': PR_NATIONAL_KV_KEY,
};

// ---------------------------------------------------------------------------
// ECN Session Management
// ---------------------------------------------------------------------------

function parseCookies(headers: Headers): Map<string, string> {
  const map = new Map<string, string>();

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

    await res.text(); // consume body

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

async function getSession(
  env: Env,
  forceNew = false
): Promise<EcnSession | null> {
  if (!forceNew) {
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

  const session = await bootstrapEcnSession();
  if (session) {
    await env.ELECTION_DATA.put(SESSION_KV_KEY, JSON.stringify(session), {
      expirationTtl: SESSION_TTL_SECONDS,
    });
  }
  return session;
}

// ---------------------------------------------------------------------------
// ECN Fetch — 429-aware
// ---------------------------------------------------------------------------

type EcnFetchResult =
  | { text: string; ok: true }
  | { ok: false; status: number };

async function ecnFetch(
  session: EcnSession,
  filePath: string
): Promise<EcnFetchResult> {
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
    await res.text(); // consume body
    return { ok: false, status: res.status };
  }

  const text = await res.text();
  return { ok: true, text };
}

/**
 * Fetch with 403-retry and 429 awareness.
 * Returns both the text (or null) AND whether a 429 was encountered,
 * so callers can trigger backoff.
 */
async function ecnFetchWithRetry(
  env: Env,
  filePath: string
): Promise<{ text: string | null; hit429: boolean }> {
  let session = await getSession(env);
  if (!session) {
    console.error(`[ecn] No session available for "${filePath}"`);
    return { text: null, hit429: false };
  }

  let result = await ecnFetch(session, filePath);

  // Retry once on 403 (session expired)
  if (!result.ok && result.status === 403) {
    console.log(`[ecn] Got 403 for "${filePath}", re-bootstrapping…`);
    session = await getSession(env, true);
    if (!session) {
      console.error(`[ecn] Re-bootstrap failed for "${filePath}"`);
      return { text: null, hit429: false };
    }
    result = await ecnFetch(session, filePath);
  }

  if (!result.ok) {
    const is429 = result.status === 429;
    if (is429) {
      console.warn(`[ecn] 429 rate-limited for "${filePath}"`);
    } else {
      console.error(`[ecn] HTTP ${result.status} for "${filePath}"`);
    }
    return { text: null, hit429: is429 };
  }

  return { text: result.text, hit429: false };
}

/**
 * Simple wrapper for code paths (simple sources, constituency list)
 * that don't need 429 awareness.
 */
async function ecnFetchSimple(
  env: Env,
  filePath: string
): Promise<string | null> {
  const { text } = await ecnFetchWithRetry(env, filePath);
  return text;
}

// ---------------------------------------------------------------------------
// Constituency list management
// ---------------------------------------------------------------------------

interface ConstituencyEntry {
  distId: number;
  consts: number;
}

/**
 * Get the list of all 165 constituencies. Cached in KV so we don't
 * re-fetch every minute. Falls back to fetching from ECN if not cached.
 */
async function getConstituencyList(
  env: Env
): Promise<ConstituencyEntry[] | null> {
  // Try KV cache first — but validate it's the expanded list (165 entries),
  // not the raw district list (78 entries where `consts` is a count).
  const cached = await env.ELECTION_DATA.get<ConstituencyEntry[]>(
    CONSTITUENCY_LIST_KEY,
    'json'
  );
  if (cached && Array.isArray(cached) && cached.length >= 100) {
    return cached;
  }
  if (cached) {
    console.warn(
      `[cron] Cached constituency list has only ${cached.length} entries — ` +
        `expected ≥165, likely stale unexpanded data. Re-fetching…`
    );
  }

  // Fetch from ECN
  console.log('[cron] Fetching constituency list from ECN…');
  const body = await ecnFetchSimple(
    env,
    'JSONFiles/Election2082/HOR/Lookup/constituencies.json'
  );

  if (!body) {
    console.error('[cron] Failed to fetch constituency list');
    return null;
  }

  try {
    const rawList: { distId: number; consts: number }[] = JSON.parse(body);
    if (!Array.isArray(rawList) || rawList.length === 0) {
      console.error('[cron] Constituency list is empty or not an array');
      return null;
    }

    // ECN returns one entry per district where `consts` is the COUNT of
    // constituencies in that district (e.g. {distId:4, consts:5} means
    // district 4 has constituencies 1–5). Expand to individual entries.
    const list: ConstituencyEntry[] = [];
    const seen = new Set<string>();
    for (const entry of rawList) {
      for (let c = 1; c <= entry.consts; c++) {
        const key = `${entry.distId}-${c}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ distId: entry.distId, consts: c });
        }
      }
    }

    if (list.length === 0) {
      console.error('[cron] Constituency list expanded to zero entries');
      return null;
    }

    // Cache the expanded list in KV (long TTL — doesn't change during an election)
    await env.ELECTION_DATA.put(CONSTITUENCY_LIST_KEY, JSON.stringify(list), {
      expirationTtl: 86400, // 24 hours
    });

    console.log(
      `[cron] Expanded ${rawList.length} district entries → ${list.length} constituencies, cached`
    );
    return list;
  } catch (err) {
    console.error('[cron] Failed to parse constituency list:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-constituency state + data (all in one KV blob to minimize ops)
// ---------------------------------------------------------------------------

/**
 * Tracks the fetch state for each constituency across cron runs.
 */
interface ConstState {
  /** epoch ms of last successful fetch, or 0 if never fetched */
  fetchedAt: number;
  /** true if the last attempt failed */
  failed: boolean;
}

type ConstStateMap = Record<string, ConstState>;

/**
 * The combined blob stored in CONST_BLOB_KV_KEY.
 * One KV read gets us everything; one KV write persists everything.
 */
interface ConstBlob {
  state: ConstStateMap;
  /** Per-constituency candidate arrays keyed by "distId-constNum" */
  constData: Record<string, unknown[]>;
}

async function getConstBlob(env: Env): Promise<ConstBlob> {
  const raw = await env.ELECTION_DATA.get<ConstBlob>(CONST_BLOB_KV_KEY, 'json');
  return raw ?? { state: {}, constData: {} };
}

// ---------------------------------------------------------------------------
// Priority ordering: failed first, then never-fetched, then stalest
// ---------------------------------------------------------------------------

function prioritize(
  constituencies: ConstituencyEntry[],
  state: ConstStateMap
): ConstituencyEntry[] {
  return [...constituencies].sort((a, b) => {
    const ka = `${a.distId}-${a.consts}`;
    const kb = `${b.distId}-${b.consts}`;
    const sa = state[ka];
    const sb = state[kb];

    // Failed → 0, never-fetched → 1, success → 2
    const pa = !sa ? 1 : sa.failed ? 0 : 2;
    const pb = !sb ? 1 : sb.failed ? 0 : 2;

    if (pa !== pb) return pa - pb;

    // Within the same priority, oldest first
    const ta = sa?.fetchedAt ?? 0;
    const tb = sb?.fetchedAt ?? 0;
    return ta - tb;
  });
}

// ---------------------------------------------------------------------------
// Per-constituency result processing
// ---------------------------------------------------------------------------

/**
 * Process a single constituency fetch result. Returns whether the fetch
 * succeeded, and whether a 429 was encountered.
 */
/** Sum TotalVoteReceived across an array of candidate-like objects. */
function sumVotesArr(arr: unknown[]): number {
  return arr.reduce<number>(
    (sum, c) =>
      sum + ((c as { TotalVoteReceived?: number }).TotalVoteReceived ?? 0),
    0
  );
}

function processConstResult(
  key: string,
  text: string | null,
  hit429: boolean,
  blob: ConstBlob
): { ok: boolean; hit429: boolean } {
  if (!text || text.trim().length === 0) {
    blob.state[key] = { fetchedAt: Date.now(), failed: true };
    return { ok: false, hit429 };
  }

  const trimmed = text.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    console.warn(`[cron] HOR-${key}: response is not JSON`);
    blob.state[key] = { fetchedAt: Date.now(), failed: true };
    return { ok: false, hit429: false };
  }

  try {
    const parsed = JSON.parse(trimmed);
    const candidates = Array.isArray(parsed) ? parsed : [];

    // Guard: if ECN returned an empty array but we already have data for
    // this constituency, keep the existing data. ECN sometimes serves
    // valid 200 responses with [] when its backend is under load — treating
    // that as "success" would silently wipe the constituency off the map.
    if (candidates.length === 0) {
      const existing = blob.constData[key];
      if (existing && Array.isArray(existing) && existing.length > 0) {
        console.warn(
          `[cron] HOR-${key}: ECN returned empty array — keeping ${existing.length} existing candidates`
        );
        // Don't update fetchedAt so this constituency stays "stale" and
        // gets retried sooner rather than being skipped as fresh.
        return { ok: false, hit429: false };
      }
      // No existing data either — mark as failed so it's retried next run
      blob.state[key] = { fetchedAt: Date.now(), failed: true };
      return { ok: false, hit429: false };
    }

    // Vote regression: if we already have data with MORE total votes,
    // it's likely an ECN correction. We trust the new data.
    const existing = blob.constData[key];
    if (existing && Array.isArray(existing) && existing.length > 0) {
      const existingVotes = sumVotesArr(existing);
      const newVotes = sumVotesArr(candidates);
      if (existingVotes > 0 && newVotes < existingVotes) {
        console.warn(
          `[cron] HOR-${key}: vote regression detected (${existingVotes} → ${newVotes}) — accepting correction`
        );
      }
    }

    blob.constData[key] = candidates;
    blob.state[key] = { fetchedAt: Date.now(), failed: false };
    return { ok: true, hit429: false };
  } catch (err) {
    console.warn(`[cron] HOR-${key}: parse error:`, err);
    blob.state[key] = { fetchedAt: Date.now(), failed: true };
    return { ok: false, hit429: false };
  }
}

// ---------------------------------------------------------------------------
// Batched concurrent fetching with interleaved retry/refresh queues
// ---------------------------------------------------------------------------

/**
 * Fetch up to MAX_FETCHES_PER_RUN constituencies in concurrent batches.
 *
 * Two-phase approach:
 *   Phase 1: Process retries (failed + never-fetched) — these are the most
 *            important since they represent missing data.
 *   Phase 2: Process refreshes (stale cached) — keep existing data fresh.
 *
 * If phase 1 hits the circuit breaker, we cool down 3s then try phase 2,
 * since ECN may rate-limit differently for different file paths or the
 * rate limit window may have partially reset.
 *
 * Within each phase:
 *   - Batches of BATCH_SIZE requests fire concurrently
 *   - On 429: exponential backoff pause, breaker counter decremented by 1
 *     after the pause to give ECN recovery credit
 *   - Circuit breaker trips after MAX_CONSECUTIVE_BATCH_FAILURES full-batch
 *     failures (every request in the batch failed)
 */
async function fetchConstituenciesIncremental(
  env: Env,
  constituencies: ConstituencyEntry[],
  blob: ConstBlob
): Promise<{ fetched: number; failed: number; skipped: number }> {
  const now = Date.now();
  const ordered = prioritize(constituencies, blob.state);

  // Three priority tiers for fetching:
  //   1. refreshQueue — has vote data but older than STALE_REFRESH_MS
  //                     (highest priority — refreshing these gives users fresher
  //                     numbers immediately; most valuable during active counting)
  //   2. retryQueue   — failed / never-fetched / has data but 0 total votes
  //                     (lower priority — counting may not have started there yet)
  //   3. skipped      — recently refreshed with actual votes → leave alone
  //
  // The merge-before-write step later in fetchAndMergeCandidates() guards
  // against KV eventual-consistency stomping: before writing the blob back
  // we re-read from KV and preserve any constData that another writer added.
  // The per-const vote regression guard in processConstResult() ensures we
  // never overwrite higher vote counts with a stale ECN response.
  const retryQueue: ConstituencyEntry[] = [];
  const refreshQueue: ConstituencyEntry[] = [];
  let alreadyFresh = 0;

  for (const c of ordered) {
    const key = `${c.distId}-${c.consts}`;
    const s = blob.state[key];
    const data = blob.constData[key];
    const hasData = data && Array.isArray(data) && data.length > 0;
    const totalVotes = hasData ? sumVotesArr(data) : 0;

    if (!hasData || totalVotes === 0) {
      // No data, or data is just candidate stubs with 0 votes — high priority
      retryQueue.push(c);
      continue;
    }

    // Has real vote data — check staleness
    const age = s?.fetchedAt ? now - s.fetchedAt : Infinity;

    if (age < FRESHNESS_THRESHOLD_MS) {
      // Very recently fetched — skip entirely this run
      alreadyFresh++;
      continue;
    }

    if (age >= STALE_REFRESH_MS) {
      // Stale — eligible for refresh at lower priority
      refreshQueue.push(c);
      continue;
    }

    // Between FRESHNESS_THRESHOLD and STALE_REFRESH — skip
    alreadyFresh++;
  }

  console.log(
    `[cron] Queue: ${refreshQueue.length} refresh (stale w/ votes), ` +
      `${retryQueue.length} retry (failed/zero-vote), ${alreadyFresh} fresh — skipped`
  );

  let fetched = 0;
  let failed = 0;

  /**
   * Process a queue of constituencies in batches. Returns true if the
   * circuit breaker tripped (all budget consumed by failures).
   */
  async function processQueue(
    queue: ConstituencyEntry[],
    label: string
  ): Promise<boolean> {
    let consecutiveBatchFailures = 0;
    let backoffMs = BACKOFF_BASE_MS;

    for (
      let batchStart = 0;
      batchStart < queue.length;
      batchStart += BATCH_SIZE
    ) {
      // Circuit breaker
      if (consecutiveBatchFailures >= MAX_CONSECUTIVE_BATCH_FAILURES) {
        const remaining = queue.length - batchStart;
        console.warn(
          `[cron] ${label}: ${consecutiveBatchFailures} consecutive batch failures — ` +
            `breaking (${remaining} remaining)`
        );
        return true; // breaker tripped
      }

      const batch = queue.slice(batchStart, batchStart + BATCH_SIZE);

      // Fire all requests in this batch concurrently
      const results = await Promise.all(
        batch.map(async (c) => {
          const key = `${c.distId}-${c.consts}`;
          const ecnFile = `JSONFiles/Election2082/HOR/FPTP/HOR-${c.distId}-${c.consts}.json`;
          try {
            const { text, hit429 } = await ecnFetchWithRetry(env, ecnFile);
            return { key, ...processConstResult(key, text, hit429, blob) };
          } catch (err) {
            console.warn(`[cron] HOR-${key}: unexpected error:`, err);
            blob.state[key] = { fetchedAt: Date.now(), failed: true };
            return { key, ok: false, hit429: false };
          }
        })
      );

      // Tally results for this batch
      let batchOk = 0;
      let batchFailed = 0;
      let batchHit429 = false;

      for (const r of results) {
        if (r.ok) {
          batchOk++;
          fetched++;
        } else {
          batchFailed++;
          failed++;
        }
        if (r.hit429) batchHit429 = true;
      }

      // Update circuit breaker: only count as a batch failure if EVERY request failed
      if (batchOk === 0 && batchFailed > 0) {
        consecutiveBatchFailures++;
      } else {
        consecutiveBatchFailures = 0;
      }

      // If we hit a 429, do an exponential backoff pause before continuing
      if (batchHit429) {
        console.warn(`[cron] ${label}: 429 — backing off ${backoffMs}ms`);
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);

        // After the pause, decrement the breaker by 1 — give ECN a chance
        // to recover. If the next batch also fails, the counter climbs
        // again; if it succeeds, it resets to 0 naturally.
        if (consecutiveBatchFailures > 0) {
          consecutiveBatchFailures--;
        }
      } else if (batchOk > 0) {
        // Clean successful batch — reset backoff
        backoffMs = BACKOFF_BASE_MS;
      }

      // Inter-batch delay (skip after the last batch)
      if (batchStart + BATCH_SIZE < queue.length) {
        const jitter = Math.floor(Math.random() * BATCH_JITTER_MS);
        await sleep(BATCH_DELAY_MS + jitter);
      }
    }

    return false; // completed without breaker trip
  }

  // Phase 1: Refresh stale constituencies with votes (highest value)
  let breakerTripped = false;
  if (refreshQueue.length > 0) {
    console.log(
      `[cron] Phase 1: refreshing ${refreshQueue.length} stale constituencies with votes`
    );
    breakerTripped = await processQueue(refreshQueue, 'refresh');
  }

  // Phase 2: If we still have budget, fill zero-vote / failed / missing
  const budgetLeft = MAX_FETCHES_PER_RUN - fetched - failed;
  if (!breakerTripped && budgetLeft > 0 && retryQueue.length > 0) {
    const retrySlice = retryQueue.slice(0, budgetLeft);
    console.log(
      `[cron] Phase 2: retrying ${retrySlice.length} zero-vote/failed constituencies (budget left: ${budgetLeft})`
    );
    await processQueue(retrySlice, 'retries');
  } else if (retryQueue.length > 0) {
    console.log(
      `[cron] Skipping ${retryQueue.length} zero-vote/failed retries ` +
        `(breaker=${breakerTripped}, budgetLeft=${budgetLeft})`
    );
  }

  return { fetched, failed, skipped: alreadyFresh };
}

// ---------------------------------------------------------------------------
// Cron: fetch, patch, merge, write
// ---------------------------------------------------------------------------

/**
 * Main candidates logic. KV operations per run:
 *
 *   READS:  1 (const-blob) + 1 (constituency list, usually cached)
 *           + 1 (candidates metadata for hash check) = 3 reads
 *   WRITES: 1 (const-blob) + 1 (merged candidates, if changed)
 *           + occasionally 1 (constituency list on first run) = 2-3 writes
 *
 * On the paid plan there are no KV read/write limits to worry about.
 */
async function fetchAndMergeCandidates(
  env: Env,
  targetOnly?: string
): Promise<void> {
  // Step 1: Get constituency list
  let constituencies = await getConstituencyList(env);
  if (!constituencies) {
    console.error('[cron] Cannot proceed without constituency list');
    return;
  }

  const allConstituencies = constituencies;

  // Filter if restricted to a specific constituency (e.g., Dhanusha-1)
  if (targetOnly) {
    const [dId, cId] = targetOnly.split('-').map((s) => parseInt(s, 10));
    constituencies = constituencies.filter(
      (c) => c.distId === dId && c.consts === cId
    );
    console.log(`[cron] Target restriction: ${targetOnly} only`);
  }

  // Step 2: Load the combined per-constituency blob — 1 KV read
  const blob = await getConstBlob(env);

  const blobWithData = Object.keys(blob.constData).filter(
    (k) => blob.constData[k]?.length > 0
  ).length;
  console.log(
    `[cron] Per-const blob: ${blobWithData} with data, ` +
      `${constituencies.length - blobWithData} missing`
  );

  // Step 3: Fetch per-constituency files (sole data source)
  const { fetched, failed, skipped } = await fetchConstituenciesIncremental(
    env,
    constituencies,
    blob
  );

  console.log(
    `[cron] Per-const this run: ${fetched} fetched, ${failed} failed, ${skipped} deferred`
  );

  // Step 4: Merge-before-write — re-read the blob from KV and for each
  // constituency keep whichever version (in-memory vs KV) has MORE total
  // votes. This guards against both:
  //   a) KV eventual-consistency stomping (another writer added data we lack)
  //   b) Our stale in-memory data overwriting fresher data from local-fill /
  //      local-refresh that wrote to KV while we were fetching
  const freshBlob = await getConstBlob(env);
  let mergePreserved = 0;
  for (const key of Object.keys(freshBlob.constData)) {
    const freshData = freshBlob.constData[key];
    const memData = blob.constData[key];

    if (!freshData || !Array.isArray(freshData) || freshData.length === 0) {
      continue; // KV has nothing useful for this key
    }

    const memHasData = memData && Array.isArray(memData) && memData.length > 0;

    if (!memHasData) {
      // KV has data we don't — always take it
      blob.constData[key] = freshData;
      blob.state[key] = freshBlob.state[key] ?? {
        fetchedAt: Date.now(),
        failed: false,
      };
      mergePreserved++;
      continue;
    }

    // Both have data — we trust our current fetch (memData) to allow for
    // vote regressions/corrections.
  }
  if (mergePreserved > 0) {
    console.log(
      `[cron] Merge-before-write: preserved ${mergePreserved} entries from KV with better data`
    );
  }

  // Persist the merged blob — 1 KV write
  await env.ELECTION_DATA.put(CONST_BLOB_KV_KEY, JSON.stringify(blob));

  // Step 5: Assemble final candidates from per-constituency data only
  // Use allConstituencies to ensure we don't wipe the list when targetOnly is set
  const allCandidates: unknown[] = [];
  let covered = 0;

  for (const c of allConstituencies) {
    const key = `${c.distId}-${c.consts}`;
    const data = blob.constData[key];

    if (data && Array.isArray(data) && data.length > 0) {
      allCandidates.push(...data);
      covered++;
    } else {
      missing++;
    }
  }

  console.log(
    `[cron] Assembly: ${allCandidates.length} candidates from ` +
      `${covered} constituencies, ${missing} still missing`
  );

  // Don't touch KV if we got nothing
  if (allCandidates.length === 0) {
    console.error(
      '[cron] Zero candidates after merge — skipping KV write to preserve existing data'
    );
    return;
  }

  // Step 6: Regression check — use count from metadata (no extra KV read)
  const existingMeta = await env.ELECTION_DATA.getWithMetadata<{
    updatedAt: string;
    contentType: string;
    etag: string;
    candidateCount: number;
  }>(CANDIDATES_KV_KEY, 'stream');

  if (existingMeta.value) {
    (existingMeta.value as ReadableStream).cancel();
  }

  const previousCount = existingMeta.metadata?.candidateCount ?? 0;
  const previousEtag = existingMeta.metadata?.etag ?? '';

  if (
    previousCount > 0 &&
    allCandidates.length < previousCount * MIN_CANDIDATE_RATIO
  ) {
    console.error(
      `[cron] Regression: got ${allCandidates.length} but previously had ${previousCount}. Skipping.`
    );
    return;
  }

  // Step 7: Hash check — skip write if unchanged
  const body = JSON.stringify(allCandidates);
  const hash = await computeHash(body);

  if (hash === previousEtag) {
    console.log(
      `[cron] ${CANDIDATES_KV_KEY}: unchanged (${allCandidates.length} candidates)`
    );
    return;
  }

  // Step 8: Write merged candidates — 1 KV write
  const nowStr = new Date().toUTCString();
  await env.ELECTION_DATA.put(CANDIDATES_KV_KEY, body, {
    metadata: {
      updatedAt: nowStr,
      contentType: 'application/json',
      etag: hash,
      candidateCount: allCandidates.length,
    },
  });

  console.log(
    `[cron] ${CANDIDATES_KV_KEY}: updated — ${allCandidates.length} candidates ` +
      `(${covered} constituencies, ${missing} missing), ` +
      `${body.length} bytes, hash=${hash.slice(0, 12)}…`
  );
}

// ---------------------------------------------------------------------------
// Cron: Simple single-file sources (PR leaderboard, FPTP leaderboard)
// ---------------------------------------------------------------------------

/**
 * Fetch simple single-file sources (PR + FPTP leaderboard).
 *
 * KV ops per source: 1 read (metadata for hash check) + 1 write (if changed).
 * Uses metadata for the hash — no separate hash key needed.
 */
async function fetchSimpleSources(env: Env): Promise<void> {
  for (const source of SIMPLE_SOURCES) {
    try {
      const body = await ecnFetchSimple(env, source.ecnFile);

      if (!body || body.trim().length === 0) {
        console.log(`[cron] ${source.kvKey}: empty or null response, skipping`);
        continue;
      }

      const trimmed = body.trim();
      if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
        console.error(
          `[cron] ${source.kvKey}: response doesn't look like JSON, first 200 chars:`,
          trimmed.slice(0, 200)
        );
        continue;
      }

      const hash = await computeHash(body);

      // Check existing hash via metadata — no separate KV key needed
      const existing = await env.ELECTION_DATA.getWithMetadata<{
        etag: string;
      }>(source.kvKey, 'stream');
      if (existing.value) {
        (existing.value as ReadableStream).cancel();
      }

      if (existing.metadata?.etag === hash) {
        console.log(`[cron] ${source.kvKey}: unchanged`);
        continue;
      }

      const nowStr = new Date().toUTCString();
      await env.ELECTION_DATA.put(source.kvKey, body, {
        metadata: {
          updatedAt: nowStr,
          contentType: 'application/json',
          etag: hash,
        },
      });

      console.log(
        `[cron] ${source.kvKey}: updated (${body.length} bytes, hash=${hash.slice(0, 12)}…)`
      );
    } catch (err) {
      console.error(`[cron] ${source.kvKey}: failed:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Cron handler — orchestrates all fetching
// ---------------------------------------------------------------------------

async function writeRunStatus(env: Env, status: RunStatus): Promise<void> {
  try {
    await env.ELECTION_DATA.put(RUN_STATUS_KV_KEY, JSON.stringify(status), {
      expirationTtl: 300, // auto-expire after 5 min in case worker crashes mid-run
    });
  } catch {
    // Non-critical — don't let a status write failure break the cron
  }
}

async function handleScheduled(env: Env): Promise<void> {
  // Check live-mode flag — if not "true", skip all ECN fetching.
  // This prevents unnecessary polling when vote counting isn't active.
  const liveMode = await env.ELECTION_DATA.get(LIVE_MODE_KEY);

  if (liveMode !== 'true') {
    console.log(
      `[cron] Live mode is OFF (${LIVE_MODE_KEY}=${liveMode ?? 'null'}). Skipping.`
    );
    return;
  }

  const startedAt = new Date().toISOString();
  console.log('[cron] Live mode is ON — starting ECN fetch cycle…');

  await writeRunStatus(env, {
    state: 'running',
    startedAt,
    detail: 'Fetching Dhanusha-1 + PR source…',
  });

  // Fetch candidates (Dhanusha-1 only) and simple sources in parallel.
  // Each handles its own errors internally and never throws.
  const results = await Promise.allSettled([
    fetchAndMergeCandidates(env, '20-1'),
    fetchSimpleSources(env),
  ]);

  // Build a short summary for the idle status
  const errors: string[] = [];
  if (results[0].status === 'rejected')
    errors.push(`candidates: ${results[0].reason}`);
  if (results[1].status === 'rejected')
    errors.push(`simple: ${results[1].reason}`);

  const finishedAt = new Date().toISOString();
  const detail =
    errors.length > 0
      ? `Finished with errors: ${errors.join('; ')}`
      : 'Finished successfully';

  await writeRunStatus(env, {
    state: 'idle',
    startedAt,
    finishedAt,
    detail,
  });

  console.log('[cron] Fetch cycle complete.');
}

// ---------------------------------------------------------------------------
// Admin status endpoint — lightweight health snapshot from KV
// ---------------------------------------------------------------------------

async function handleStatus(env: Env): Promise<Response> {
  const [liveMode, blob, constList, candidatesMeta, prMeta, runStatusRaw] =
    await Promise.all([
      env.ELECTION_DATA.get(LIVE_MODE_KEY),
      getConstBlob(env),
      env.ELECTION_DATA.get<{ length: number }[]>(
        CONSTITUENCY_LIST_KEY,
        'json'
      ),
      env.ELECTION_DATA.getWithMetadata<{
        updatedAt: string;
        etag: string;
        candidateCount: number;
      }>(CANDIDATES_KV_KEY, 'stream'),
      env.ELECTION_DATA.getWithMetadata<{
        updatedAt: string;
        etag: string;
      }>(PR_NATIONAL_KV_KEY, 'stream'),
      env.ELECTION_DATA.get<RunStatus>(RUN_STATUS_KV_KEY, 'json'),
    ]);

  // Cancel streams — we only need metadata
  if (candidatesMeta.value) (candidatesMeta.value as ReadableStream).cancel();
  if (prMeta.value) (prMeta.value as ReadableStream).cancel();

  // Tally constituency states
  const stateEntries = Object.entries(blob.state) as [string, ConstState][];
  const cached = stateEntries.filter(([, s]) => !s.failed);
  const failed = stateEntries.filter(([, s]) => s.failed);
  const totalConstituencies = constList?.length ?? 0;
  const neverFetched = totalConstituencies - stateEntries.length;

  // Find the most recent fetch time and oldest cached time
  let lastFetchAt = 0;
  let oldestCachedAt = Infinity;
  for (const [, s] of cached) {
    if (s.fetchedAt > lastFetchAt) lastFetchAt = s.fetchedAt;
    if (s.fetchedAt < oldestCachedAt) oldestCachedAt = s.fetchedAt;
  }
  for (const [, s] of failed) {
    if (s.fetchedAt > lastFetchAt) lastFetchAt = s.fetchedAt;
  }

  const now = Date.now();

  // Build currentRun from the run-status KV key
  let currentRun: Record<string, unknown> | null = null;
  if (runStatusRaw) {
    const r = runStatusRaw;
    if (r.state === 'running') {
      const runningSec = Math.round(
        (now - new Date(r.startedAt).getTime()) / 1000
      );
      currentRun = {
        state: r.state,
        startedAt: r.startedAt,
        runningSec,
        detail: r.detail,
      };
    } else {
      currentRun = {
        state: r.state,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        detail: r.detail,
      };
    }
  }

  const status = {
    liveMode: liveMode === 'true',
    currentRun,
    timestamp: new Date().toISOString(),
    constituencies: {
      total: totalConstituencies,
      cached: cached.length,
      failed: failed.length,
      neverFetched: Math.max(0, neverFetched),
      coverage: totalConstituencies
        ? `${Math.round((cached.length / totalConstituencies) * 100)}%`
        : 'n/a',
    },
    candidates: {
      count: candidatesMeta.metadata?.candidateCount ?? null,
      updatedAt: candidatesMeta.metadata?.updatedAt ?? null,
      etag: candidatesMeta.metadata?.etag?.slice(0, 12) ?? null,
    },
    prLeaderboard: {
      updatedAt: prMeta.metadata?.updatedAt ?? null,
    },

    timing: {
      lastFetchAgoSec: lastFetchAt
        ? Math.round((now - lastFetchAt) / 1000)
        : null,
      oldestCachedAgoSec:
        oldestCachedAt < Infinity
          ? Math.round((now - oldestCachedAt) / 1000)
          : null,
    },
    failedConstituencies: failed.map(([key, s]) => ({
      key,
      lastAttemptAgoSec: Math.round((now - s.fetchedAt) / 1000),
    })),
    config: {
      batchSize: BATCH_SIZE,
      batchDelayMs: BATCH_DELAY_MS,
      maxFetchesPerRun: MAX_FETCHES_PER_RUN,
      freshnessThresholdMs: FRESHNESS_THRESHOLD_MS,
      targetRestriction: '20-1 (Dhanusha-1)',
      allowRegression: true,
    },
  };

  return new Response(JSON.stringify(status, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ---------------------------------------------------------------------------
// Admin dashboard — self-contained HTML that polls /admin/status
// ---------------------------------------------------------------------------

function adminDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Worker Dashboard — Nepal Election Tracker</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;
       background:#0a0a0a;color:#e0e0e0;padding:20px;max-width:900px;margin:0 auto}
  h1{font-size:1.3rem;color:#7eb8ff;margin-bottom:4px}
  .subtitle{font-size:.75rem;color:#666;margin-bottom:20px}
  .card{background:#161616;border:1px solid #252525;border-radius:8px;padding:16px;margin-bottom:14px}
  .card h2{font-size:.85rem;color:#999;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
  .stat{background:#1a1a1a;border-radius:6px;padding:12px}
  .stat .label{font-size:.7rem;color:#666;text-transform:uppercase;letter-spacing:.03em}
  .stat .value{font-size:1.5rem;font-weight:700;margin-top:2px}
  .stat .sub{font-size:.7rem;color:#555;margin-top:2px}
  .green{color:#4ade80} .yellow{color:#facc15} .red{color:#f87171} .blue{color:#60a5fa} .dim{color:#555}
  .progress-wrap{background:#1a1a1a;border-radius:4px;height:24px;overflow:hidden;margin-top:6px;position:relative}
  .progress-bar{height:100%;border-radius:4px;transition:width .5s ease}
  .progress-text{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;
                  justify-content:center;font-size:.7rem;font-weight:600;color:#e0e0e0;text-shadow:0 1px 2px #000}
  .bar-cached{background:linear-gradient(90deg,#166534,#22c55e)}
  .bar-failed{background:linear-gradient(90deg,#991b1b,#ef4444)}
  .bar-never{background:linear-gradient(90deg,#44403c,#78716c)}
  .run-box{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:6px;margin-bottom:8px}
  .run-running{background:#172554;border:1px solid #1e40af}
  .run-idle{background:#14231a;border:1px solid #166534}
  .run-unknown{background:#1a1a1a;border:1px solid #333}
  .pulse{width:10px;height:10px;border-radius:50%;flex-shrink:0}
  .pulse-running{background:#3b82f6;animation:pulse 1.5s infinite}
  .pulse-idle{background:#22c55e}
  .pulse-off{background:#555}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  .run-detail{font-size:.8rem;color:#ccc}
  .run-time{font-size:.7rem;color:#666;margin-top:2px}
  .failed-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:4px;margin-top:8px}
  .failed-chip{background:#1c1917;border:1px solid #44403c;border-radius:4px;padding:4px 8px;
               font-size:.7rem;font-family:monospace;text-align:center}
  .failed-chip .fk{color:#f87171;font-weight:600}
  .failed-chip .ft{color:#555;font-size:.6rem}
  .cfg-row{display:flex;gap:16px;flex-wrap:wrap}
  .cfg-item{font-size:.75rem;color:#888}
  .cfg-item b{color:#ccc}
  .sources{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
  .source-item{background:#1a1a1a;border-radius:6px;padding:10px}
  .source-item .slabel{font-size:.7rem;color:#666;text-transform:uppercase}
  .source-item .sval{font-size:.75rem;color:#aaa;margin-top:2px}
  .poll-indicator{display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;margin-right:6px;
                  transition:background .2s}
  .poll-indicator.fetching{background:#3b82f6}
  .poll-indicator.error{background:#ef4444}
  .topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
  .topbar-right{display:flex;align-items:center;gap:12px;font-size:.7rem;color:#555}
  .live-badge{font-size:.7rem;padding:2px 8px;border-radius:10px;font-weight:600}
  .live-on{background:#166534;color:#4ade80}
  .live-off{background:#991b1b;color:#fca5a5}
  .stacked-bar{display:flex;height:24px;border-radius:4px;overflow:hidden;margin-top:6px}
  .stacked-bar > div{transition:width .5s ease;min-width:0}
</style>
</head>
<body>
<div class="topbar">
  <div>
    <h1>Worker Dashboard</h1>
    <div class="subtitle">election.pathakanshu.com</div>
  </div>
  <div class="topbar-right">
    <span id="pollDot" class="poll-indicator"></span>
    <span id="pollLabel">connecting…</span>
    <span id="liveBadge" class="live-badge live-off">—</span>
  </div>
</div>

<div id="runCard" class="card">
  <h2>Current Run</h2>
  <div id="runContent" class="run-box run-unknown"><span class="pulse pulse-off"></span><span>Loading…</span></div>
</div>

<div class="card">
  <h2>Constituency Coverage</h2>
  <div class="grid" id="constStats"></div>
  <div class="stacked-bar" id="coverageBar"></div>
  <div id="coverageLabel" style="font-size:.65rem;color:#555;margin-top:4px;text-align:center"></div>
</div>

<div class="card">
  <h2>Candidate Data</h2>
  <div class="grid" id="candStats"></div>
</div>

<div class="card">
  <h2>Data Sources</h2>
  <div class="sources" id="sourcesGrid"></div>
</div>

<div class="card">
  <h2>Failed Constituencies <span id="failedCount" style="color:#f87171"></span></h2>
  <div id="failedList" class="failed-grid"></div>
  <div id="failedEmpty" style="font-size:.75rem;color:#555;padding:8px 0">None</div>
</div>

<div class="card">
  <h2>Config</h2>
  <div class="cfg-row" id="configRow"></div>
</div>

<div class="card">
  <h2>Timing</h2>
  <div class="grid" id="timingStats"></div>
</div>

<script>
const $ = s => document.getElementById(s);

function ago(sec) {
  if (sec == null) return '—';
  if (sec < 60) return sec + 's ago';
  if (sec < 3600) return Math.floor(sec/60) + 'm ' + (sec%60) + 's ago';
  return Math.floor(sec/3600) + 'h ' + Math.floor((sec%3600)/60) + 'm ago';
}

function statBox(label, value, cls, sub) {
  return '<div class="stat"><div class="label">' + label + '</div><div class="value ' + (cls||'') + '">'
    + value + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
}

function render(d) {
  // Live badge
  const lb = $('liveBadge');
  lb.textContent = d.liveMode ? 'LIVE' : 'OFF';
  lb.className = 'live-badge ' + (d.liveMode ? 'live-on' : 'live-off');

  // Run state
  const rc = $('runContent');
  const r = d.currentRun;
  if (!r) {
    rc.className = 'run-box run-unknown';
    rc.innerHTML = '<span class="pulse pulse-off"></span><span class="run-detail">No run data yet</span>';
  } else if (r.state === 'running') {
    rc.className = 'run-box run-running';
    rc.innerHTML = '<span class="pulse pulse-running"></span><div><div class="run-detail">'
      + r.detail + '</div><div class="run-time">Running for ' + r.runningSec + 's — started ' + new Date(r.startedAt).toLocaleTimeString() + '</div></div>';
  } else {
    rc.className = 'run-box run-idle';
    rc.innerHTML = '<span class="pulse pulse-idle"></span><div><div class="run-detail">'
      + r.detail + '</div><div class="run-time">Started ' + new Date(r.startedAt).toLocaleTimeString()
      + (r.finishedAt ? ' — finished ' + new Date(r.finishedAt).toLocaleTimeString() : '') + '</div></div>';
  }

  // Constituency coverage
  const c = d.constituencies;
  $('constStats').innerHTML =
    statBox('Cached', c.cached, 'green') +
    statBox('Failed', c.failed, c.failed > 0 ? 'red' : 'dim') +
    statBox('Never Fetched', c.neverFetched, c.neverFetched > 0 ? 'yellow' : 'dim') +
    statBox('Total', c.total, 'blue');

  const pCached = c.total ? (c.cached / c.total * 100) : 0;
  const pFailed = c.total ? (c.failed / c.total * 100) : 0;
  const pNever = c.total ? (c.neverFetched / c.total * 100) : 0;
  $('coverageBar').innerHTML =
    '<div class="bar-cached" style="width:' + pCached + '%"></div>' +
    '<div class="bar-failed" style="width:' + pFailed + '%"></div>' +
    '<div class="bar-never" style="width:' + pNever + '%"></div>';
  $('coverageLabel').textContent = c.cached + ' cached / ' + c.failed + ' failed / ' + c.neverFetched + ' pending — ' + c.coverage + ' coverage';

  // Candidates
  const cd = d.candidates;
  $('candStats').innerHTML =
    statBox('Count', cd.count != null ? cd.count.toLocaleString() : '—', 'blue') +
    statBox('Updated', cd.updatedAt ? new Date(cd.updatedAt).toLocaleTimeString() : '—', '') +
    statBox('ETag', cd.etag || '—', 'dim');

  // Sources
  $('sourcesGrid').innerHTML =
    '<div class="source-item"><div class="slabel">PR Leaderboard</div><div class="sval">' +
      (d.prLeaderboard.updatedAt ? new Date(d.prLeaderboard.updatedAt).toLocaleTimeString() : 'not yet') +
    '</div></div>';

  // Failed
  const fl = d.failedConstituencies;
  $('failedCount').textContent = fl.length > 0 ? '(' + fl.length + ')' : '';
  if (fl.length === 0) {
    $('failedList').style.display = 'none';
    $('failedEmpty').style.display = 'block';
  } else {
    $('failedList').style.display = 'grid';
    $('failedEmpty').style.display = 'none';
    $('failedList').innerHTML = fl.map(f =>
      '<div class="failed-chip"><div class="fk">HOR-' + f.key + '</div><div class="ft">' + ago(f.lastAttemptAgoSec) + '</div></div>'
    ).join('');
  }

  // Config
  const cfg = d.config;
  $('configRow').innerHTML =
    '<div class="cfg-item">Batch size: <b>' + cfg.batchSize + '</b></div>' +
    '<div class="cfg-item">Batch delay: <b>' + cfg.batchDelayMs + 'ms</b></div>' +
    '<div class="cfg-item">Max fetches/run: <b>' + cfg.maxFetchesPerRun + '</b></div>' +
    '<div class="cfg-item">Freshness: <b>' + (cfg.freshnessThresholdMs/1000) + 's</b></div>' +
    '<div class="cfg-item">Target: <b style="color:#facc15">' + (cfg.targetRestriction || 'All') + '</b></div>' +
    '<div class="cfg-item">Regression: <b style="color:#4ade80">' + (cfg.allowRegression ? 'Allowed' : 'Blocked') + '</b></div>';

  // Timing
  $('timingStats').innerHTML =
    statBox('Last Fetch', ago(d.timing.lastFetchAgoSec), d.timing.lastFetchAgoSec > 120 ? 'yellow' : 'green') +
    statBox('Oldest Cached', ago(d.timing.oldestCachedAgoSec), d.timing.oldestCachedAgoSec > 300 ? 'yellow' : 'dim');
}

let errCount = 0;
async function poll() {
  const dot = $('pollDot');
  const label = $('pollLabel');
  dot.className = 'poll-indicator fetching';
  try {
    const res = await fetch('/admin/status');
    const d = await res.json();
    render(d);
    dot.className = 'poll-indicator';
    label.textContent = 'updated ' + new Date().toLocaleTimeString();
    errCount = 0;
  } catch(e) {
    errCount++;
    dot.className = 'poll-indicator error';
    label.textContent = 'fetch error (' + errCount + ')';
  }
}

poll();
setInterval(poll, 5000);
</script>
</body>
</html>`;
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

  // Admin dashboard — serves self-contained HTML that polls /admin/status
  if (pathname === '/admin' || pathname === '/admin/') {
    return new Response(adminDashboardHTML(), {
      status: 200,
      headers: {
        'Content-Type': 'text/html;charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Admin status endpoint — no auth needed, read-only KV snapshot
  if (pathname === '/admin/status') {
    return handleStatus(env);
  }

  // Check if this path matches any of our live sources
  const kvKey = LIVE_PATH_MAP[pathname];

  if (!kvKey) {
    // Not a live data path — let the static asset handler deal with it
    return undefined;
  }

  // First, do a metadata-only check. This avoids reading the full (potentially
  // multi-MB) value into memory just to discover there's nothing in KV or
  // that the client already has the latest version (304).
  const metaOnly = await env.ELECTION_DATA.getWithMetadata<{
    updatedAt: string;
    contentType: string;
    etag: string;
  }>(kvKey, 'stream');

  if (!metaOnly.value || !metaOnly.metadata) {
    // No KV data yet — fall through to static asset.
    if (metaOnly.value) {
      (metaOnly.value as ReadableStream).cancel();
    }
    return undefined;
  }

  const metadata = metaOnly.metadata;

  // Check If-None-Match for 304 support (HEAD and GET).
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch && metadata.etag && ifNoneMatch === `"${metadata.etag}"`) {
    (metaOnly.value as ReadableStream).cancel();
    return new Response(null, {
      status: 304,
      headers: {
        ETag: `"${metadata.etag}"`,
        'Cache-Control': 'public, max-age=15, s-maxage=10',
      },
    });
  }

  // For HEAD requests the client only wants headers (e.g. polling for changes).
  if (request.method === 'HEAD') {
    (metaOnly.value as ReadableStream).cancel();
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': metadata.contentType || 'application/json',
        'Last-Modified': metadata.updatedAt,
        ETag: `"${metadata.etag}"`,
        'Cache-Control': 'public, max-age=15, s-maxage=10',
        'Access-Control-Allow-Origin': '*',
        'X-Data-Source': 'kv-live',
      },
    });
  }

  // GET — stream the body directly from KV to the client without buffering
  return new Response(metaOnly.value as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': metadata.contentType || 'application/json',
      'Last-Modified': metadata.updatedAt,
      ETag: `"${metadata.etag}"`,
      'Cache-Control': 'public, max-age=15, s-maxage=10',
      'Access-Control-Allow-Origin': '*',
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const kvResponse = await handleFetch(request, env);
    if (kvResponse) {
      return kvResponse;
    }

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
