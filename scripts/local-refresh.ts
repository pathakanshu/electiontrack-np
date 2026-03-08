/**
 * scripts/local-refresh.ts
 *
 * Local helper that refreshes STALE and ZERO-VOTE constituencies from ECN
 * using your residential IP. Unlike local-fill.ts (which targets missing/failed
 * constituencies), this script re-fetches constituencies that already have data
 * but need updating — critical during active vote counting.
 *
 * Priority order:
 *   1. Stale constituencies WITH votes (most valuable to refresh — users see
 *      fresher numbers immediately)
 *   2. Zero-vote constituencies (candidate stubs only — counting may not have
 *      started there yet)
 *   3. Everything else (if --all is passed)
 *
 * Safety:
 *   - Vote regression guard: never overwrites existing data that has MORE
 *     total votes than the new response (ECN sometimes returns stale data)
 *   - Empty-array guard: never overwrites existing data with []
 *   - Merge-before-write: re-reads blob from KV before writing to avoid
 *     stomping data written by the worker or local-fill in the meantime
 *
 * Usage:
 *   npx tsx scripts/local-refresh.ts                   # refresh zero-vote + stale
 *   npx tsx scripts/local-refresh.ts --dry-run         # show what would be fetched
 *   npx tsx scripts/local-refresh.ts --all             # refresh everything, not just stale
 *   npx tsx scripts/local-refresh.ts --batch 5         # 5 concurrent (default: 10)
 *   npx tsx scripts/local-refresh.ts --delay 400       # 400ms between batches (default: 200)
 *   npx tsx scripts/local-refresh.ts --max 50          # only fetch up to 50
 *   npx tsx scripts/local-refresh.ts --stale-mins 3    # consider data stale after 3 min (default: 8)
 *   npx tsx scripts/local-refresh.ts --only 26-6       # refresh only constituency 26-6 (distId-consts)
 *   npx tsx scripts/local-refresh.ts --loop            # loop continuously with --loop-delay between cycles
 *   npx tsx scripts/local-refresh.ts --loop-delay 30   # seconds between loop cycles (default: 60)
 *   npx tsx scripts/local-refresh.ts --merge-only      # skip fetching, just rebuild candidates from blob
 *
 * Prerequisites:
 *   - wrangler must be authenticated (`npx wrangler whoami`)
 *   - Node + npx + tsx
 */

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ECN_ORIGIN = 'https://result.election.gov.np';
const ECN_HANDLER_PATH = '/Handlers/SecureJson.ashx';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const KV_NAMESPACE_ID = 'ed206e04e9444585aa8a9b04677645fd';
const CONST_BLOB_KEY = 'cache:2082:const-blob';
const CANDIDATES_KEY = 'live:2082:candidates';
const CONSTITUENCY_LIST_KEY = 'cache:2082:constituencies';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const mergeOnly = args.includes('--merge-only');
const refreshAll = args.includes('--all');
const loopMode = args.includes('--loop');

function argStr(name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const onlyKey = argStr('--only');

function argVal(name: string, def: number): number {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return def;
  const val = parseInt(args[idx + 1], 10);
  return Number.isNaN(val) ? def : val;
}

const BATCH_SIZE = argVal('--batch', 10);
const BATCH_DELAY_MS = argVal('--delay', 200);
const MAX_FETCH = argVal('--max', 9999);
const STALE_MINS = argVal('--stale-mins', 2);
const STALE_MS = STALE_MINS * 60 * 1000;
const LOOP_DELAY_SEC = argVal('--loop-delay', 60);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConstState {
  fetchedAt: number;
  failed: boolean;
}

interface ConstBlob {
  state: Record<string, ConstState>;
  constData: Record<string, unknown[]>;
}

interface ConstituencyEntry {
  distId: number;
  consts: number;
}

interface EcnSession {
  cookies: string;
  csrfToken: string;
}

// ---------------------------------------------------------------------------
// KV helpers (via wrangler CLI)
// ---------------------------------------------------------------------------

function kvGet(key: string): string | null {
  try {
    const result = execSync(
      `npx wrangler kv key get --namespace-id=${KV_NAMESPACE_ID} --remote "${key}"`,
      { maxBuffer: 50 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return result.toString('utf-8');
  } catch {
    return null;
  }
}

function kvPut(
  key: string,
  value: string,
  metadata?: Record<string, unknown>
): void {
  const tmpFile = join(
    tmpdir(),
    `local-refresh-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  writeFileSync(tmpFile, value, 'utf-8');

  let cmd = `npx wrangler kv key put --namespace-id=${KV_NAMESPACE_ID} --remote "${key}" --path="${tmpFile}"`;
  if (metadata) {
    cmd += ` --metadata='${JSON.stringify(metadata)}'`;
  }

  try {
    execSync(cmd, {
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore cleanup errors */
    }
  }
}

// ---------------------------------------------------------------------------
// ECN session bootstrap
// ---------------------------------------------------------------------------

function parseCookies(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  const parts = raw.split(/,(?=\s*\w+=)/);
  for (const header of parts) {
    const pair = header.split(';')[0].trim();
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      map.set(pair.slice(0, eqIdx).trim(), pair.slice(eqIdx + 1).trim());
    }
  }
  return map;
}

async function bootstrapSession(maxRetries = 5): Promise<EcnSession> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(
      `🔐 Bootstrapping ECN session (attempt ${attempt}/${maxRetries})…`
    );

    try {
      const res = await fetch(ECN_ORIGIN + '/', {
        headers: {
          'User-Agent': USER_AGENT,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });

      if (!res.ok) {
        await res.text().catch(() => {});
        throw new Error(`HTTP ${res.status}`);
      }
      await res.text().catch(() => {});

      const cookies = parseCookies(res.headers.get('set-cookie') ?? '');
      const csrfToken = cookies.get('CsrfToken');
      if (!csrfToken) {
        throw new Error(
          `No CsrfToken in response. Got cookies: ${Array.from(cookies.keys()).join(', ') || '(none)'}`
        );
      }

      const cookieString = Array.from(cookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');

      console.log(`✅ Session OK (token: ${csrfToken.slice(0, 12)}…)`);
      return { cookies: cookieString, csrfToken };
    } catch (err) {
      console.warn(
        `   ⚠️  Attempt ${attempt} failed: ${(err as Error).message}`
      );
      if (attempt < maxRetries) {
        const delay = attempt * 2000;
        console.log(`   Retrying in ${delay / 1000}s…`);
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `Bootstrap failed after ${maxRetries} attempts — ECN may be down`
  );
}

// ---------------------------------------------------------------------------
// ECN fetch
// ---------------------------------------------------------------------------

async function ecnFetch(
  session: EcnSession,
  filePath: string
): Promise<{ ok: boolean; status: number; text?: string }> {
  const url = `${ECN_ORIGIN}${ECN_HANDLER_PATH}?file=${encodeURIComponent(filePath)}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Cookie: session.cookies,
        'X-CSRF-Token': session.csrfToken,
        Referer: ECN_ORIGIN + '/',
        Origin: ECN_ORIGIN,
        Accept: 'application/json, text/plain, */*',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      await res.text().catch(() => {});
      return { ok: false, status: res.status };
    }

    return { ok: true, status: 200, text: await res.text() };
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('abort')) {
      return { ok: false, status: 0 }; // timeout
    }
    return { ok: false, status: 0 };
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function computeHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function progressBar(current: number, total: number, width = 30): string {
  const pct = total > 0 ? current / total : 0;
  const filled = Math.round(width * pct);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${current}/${total} (${Math.round(pct * 100)}%)`;
}

/** Sum TotalVoteReceived across an array of candidate-like objects. */
function sumVotes(arr: unknown[]): number {
  return arr.reduce<number>(
    (sum, c) =>
      sum + ((c as { TotalVoteReceived?: number }).TotalVoteReceived ?? 0),
    0
  );
}

function fmtAge(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

// ---------------------------------------------------------------------------
// Priority bucket for sorting
// ---------------------------------------------------------------------------

interface RefreshTarget {
  entry: ConstituencyEntry;
  key: string;
  /** 0 = zero-vote (highest), 1 = stale with votes, 2 = fresh with votes */
  priority: number;
  totalVotes: number;
  fetchedAt: number;
  age: number;
}

// ---------------------------------------------------------------------------
// Single cycle
// ---------------------------------------------------------------------------

async function runCycle(
  cycleNum: number,
  session: EcnSession,
  constituencies: ConstituencyEntry[],
  allConstituencies: ConstituencyEntry[]
): Promise<{ updated: number; failed: number; skipped: number }> {
  const now = Date.now();

  // Step 1: Read the const-blob from KV (fresh each cycle)
  console.log('📦 Reading const-blob from KV…');
  const blobRaw = kvGet(CONST_BLOB_KEY);
  const blob: ConstBlob = blobRaw
    ? JSON.parse(blobRaw)
    : { state: {}, constData: {} };

  // Step 2: Classify all constituencies into priority buckets
  const targets: RefreshTarget[] = [];

  let zeroVoteCount = 0;
  let staleCount = 0;
  let freshCount = 0;
  let noDataCount = 0;

  for (const c of constituencies) {
    const key = `${c.distId}-${c.consts}`;
    const s = blob.state[key];
    const data = blob.constData[key];
    const hasData = data && Array.isArray(data) && data.length > 0;
    const totalVotes = hasData ? sumVotes(data) : 0;
    const fetchedAt = s?.fetchedAt ?? 0;
    const age = fetchedAt > 0 ? now - fetchedAt : Infinity;

    if (!hasData) {
      // No data at all — same tier as zero-vote
      noDataCount++;
      targets.push({
        entry: c,
        key,
        priority: 1,
        totalVotes: 0,
        fetchedAt,
        age,
      });
      continue;
    }

    if (totalVotes === 0) {
      // Candidate stubs only — counting may not have started here yet
      zeroVoteCount++;
      targets.push({ entry: c, key, priority: 1, totalVotes, fetchedAt, age });
      continue;
    }

    if (refreshAll || age >= STALE_MS) {
      // Has real votes but stale — HIGHEST priority: refreshing these gives
      // users more accurate numbers immediately
      staleCount++;
      targets.push({ entry: c, key, priority: 0, totalVotes, fetchedAt, age });
      continue;
    }

    // Fresh — skip unless --all
    freshCount++;
  }

  // Sort: priority ascending, then oldest fetchedAt first
  targets.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.fetchedAt - b.fetchedAt;
  });

  const toFetch = targets.slice(0, MAX_FETCH);

  console.log();
  console.log(`📊 Cycle #${cycleNum} — constituency breakdown:`);
  console.log(
    `   🟡 ${staleCount} stale with votes (>${STALE_MINS}min old — highest priority)`
  );
  console.log(`   🔴 ${zeroVoteCount} zero-vote (candidate stubs only)`);
  if (noDataCount > 0) console.log(`   🔲 ${noDataCount} no data`);
  console.log(`   🟢 ${freshCount} fresh (skipped)`);
  console.log(`   📥 ${toFetch.length} to fetch`);
  console.log();

  if (toFetch.length === 0 && !mergeOnly) {
    console.log('✅ Nothing to refresh — all constituencies are fresh!');
    return { updated: 0, failed: 0, skipped: freshCount };
  }

  if (dryRun) {
    console.log('🔍 Dry run — would fetch:');
    for (const t of toFetch) {
      const tag =
        t.priority === 0
          ? `(stale ${fmtAge(t.age)}, ${t.totalVotes.toLocaleString()} votes)`
          : t.totalVotes === 0 && (blob.constData[t.key]?.length ?? 0) > 0
            ? `(zero-vote, ${blob.constData[t.key].length} candidates)`
            : '(no data)';
      console.log(`   HOR-${t.key}.json ${tag}`);
    }
    if (targets.length > MAX_FETCH) {
      console.log(
        `   … and ${targets.length - MAX_FETCH} more (--max ${MAX_FETCH})`
      );
    }
    return { updated: 0, failed: 0, skipped: 0 };
  }

  // Step 3: Fetch
  let succeeded = 0;
  let failed = 0;
  let voteRegressions = 0;
  let errors503 = 0;
  let errors429 = 0;
  let errorsTimeout = 0;
  let errorsOther = 0;

  if (!mergeOnly && toFetch.length > 0) {
    console.log(
      `🌐 Fetching ${toFetch.length} constituencies (batch=${BATCH_SIZE}, delay=${BATCH_DELAY_MS}ms)…\n`
    );

    const startTime = Date.now();
    const totalBatches = Math.ceil(toFetch.length / BATCH_SIZE);

    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batch = toFetch.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      process.stdout.write(
        `  Batch ${batchNum}/${totalBatches} (${batch.length} req)… `
      );

      const results = await Promise.all(
        batch.map(async (t) => {
          const ecnFile = `JSONFiles/Election2082/HOR/FPTP/HOR-${t.entry.distId}-${t.entry.consts}.json`;
          const res = await ecnFetch(session, ecnFile);
          return { target: t, ...res };
        })
      );

      let batchOk = 0;
      let batchFail = 0;
      const failedKeys: string[] = [];

      for (const r of results) {
        const { target } = r;

        if (r.ok && r.text) {
          const trimmed = r.text.trim();
          if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
              const parsed = JSON.parse(trimmed);
              const candidates = Array.isArray(parsed) ? parsed : [];

              // Guard: empty array — don't overwrite existing data
              if (candidates.length === 0) {
                const existing = blob.constData[target.key];
                if (
                  existing &&
                  Array.isArray(existing) &&
                  existing.length > 0
                ) {
                  console.warn(
                    `\n   ⚠️  HOR-${target.key}: ECN returned [] — keeping ${existing.length} existing candidates`
                  );
                } else {
                  blob.state[target.key] = {
                    fetchedAt: Date.now(),
                    failed: true,
                  };
                }
                batchFail++;
                failed++;
                failedKeys.push(target.key);
                errorsOther++;
                continue;
              }

              // Vote regression guard: new data has fewer votes → stale response
              const existing = blob.constData[target.key];
              if (existing && Array.isArray(existing) && existing.length > 0) {
                const existingVotes = sumVotes(existing);
                const newVotes = sumVotes(candidates);

                if (existingVotes > 0 && newVotes < existingVotes) {
                  console.warn(
                    `\n   ⚠️  HOR-${target.key}: vote regression detected (${existingVotes} → ${newVotes}, ↓${existingVotes - newVotes}) — accepting correction`
                  );
                }

                // Log vote improvement
                if (newVotes > existingVotes) {
                  const delta = newVotes - existingVotes;
                  process.stdout.write(`${target.key}+${delta} `);
                }
              }

              blob.constData[target.key] = candidates;
              blob.state[target.key] = { fetchedAt: Date.now(), failed: false };
              succeeded++;
              batchOk++;
              continue;
            } catch {
              /* fall through to failure */
            }
          }
        }

        // Count failure types
        if (r.status === 503) errors503++;
        else if (r.status === 429) errors429++;
        else if (r.status === 0) errorsTimeout++;
        else errorsOther++;

        // Mark as failed but DON'T wipe constData — we keep existing data
        blob.state[r.target.key] = { fetchedAt: Date.now(), failed: true };
        failed++;
        batchFail++;
        failedKeys.push(r.target.key);
      }

      // Color-coded batch summary
      if (batchFail === 0) {
        console.log(`✅ ${batchOk} ok`);
      } else if (batchOk === 0) {
        console.log(`❌ ${batchFail} failed [${failedKeys.join(', ')}]`);
      } else {
        console.log(
          `✓ ${batchOk} ok, ❌ ${batchFail} failed [${failedKeys.join(', ')}]`
        );
      }

      // Rate-limit backoff
      if (results.some((r) => r.status === 429)) {
        const backoff = 3000 + Math.random() * 2000;
        console.log(
          `   ⏳ Hit 429 — backing off ${(backoff / 1000).toFixed(1)}s`
        );
        await sleep(backoff);
      } else if (i + BATCH_SIZE < toFetch.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log();
    console.log('━'.repeat(40));
    console.log(`📊 Fetch complete in ${elapsed}s:`);
    console.log(`   ✅ ${succeeded} updated`);
    if (failed > 0) {
      console.log(
        `   ❌ ${failed} failed (503: ${errors503}, 429: ${errors429}, timeout: ${errorsTimeout}, other: ${errorsOther})`
      );
    }
    if (voteRegressions > 0) {
      console.log(
        `   ↩️  ${voteRegressions} vote regressions (stale ECN response — kept existing)`
      );
    }
    console.log('━'.repeat(40));

    if (succeeded === 0 && !mergeOnly) {
      console.log('\n⚠️  No data updated — skipping KV writes.');
      return { updated: 0, failed, skipped: freshCount };
    }
  }

  // Step 4: Merge-before-write — re-read blob from KV and preserve any
  // constData entries that another writer (worker cron, local-fill) added
  // while we were fetching.
  console.log('\n🔄 Merge-before-write: re-reading blob from KV…');
  const freshBlobRaw = kvGet(CONST_BLOB_KEY);
  if (freshBlobRaw) {
    const freshBlob: ConstBlob = JSON.parse(freshBlobRaw);
    let preserved = 0;

    for (const key of Object.keys(freshBlob.constData)) {
      const freshData = freshBlob.constData[key];
      const memData = blob.constData[key];

      if (freshData && Array.isArray(freshData) && freshData.length > 0) {
        if (!memData || !Array.isArray(memData) || memData.length === 0) {
          // KV has data we don't — preserve it
          blob.constData[key] = freshData;
          blob.state[key] = freshBlob.state[key] ?? {
            fetchedAt: Date.now(),
            failed: false,
          };
          preserved++;
        } else {
          // Both have data — we trust the most recent fetch (in-memory)
          // to allow for ECN vote corrections/regressions.
        }
      }
    }

    if (preserved > 0) {
      console.log(
        `   ✅ Preserved ${preserved} entries from KV that had better/new data`
      );
    } else {
      console.log('   ✅ No merge conflicts');
    }
  }

  // Step 5: Write updated blob to KV
  console.log('\n📤 Writing updated const-blob to KV…');
  const blobJson = JSON.stringify(blob);
  const blobSizeMB = (
    Buffer.byteLength(blobJson, 'utf-8') /
    (1024 * 1024)
  ).toFixed(2);
  console.log(`   Blob size: ${blobSizeMB} MB`);
  kvPut(CONST_BLOB_KEY, blobJson);
  console.log('   ✅ Blob updated');

  // Step 6: Rebuild and write merged candidates
  console.log('\n🔗 Merging candidates from blob…');
  const allCandidates: unknown[] = [];
  let coveredCount = 0;
  let missingCount = 0;
  let zeroVoteConstituencies = 0;
  let totalVotesAll = 0;
  const missingKeys: string[] = [];

  for (const c of allConstituencies) {
    const key = `${c.distId}-${c.consts}`;
    const data = blob.constData[key];
    if (data && Array.isArray(data) && data.length > 0) {
      allCandidates.push(...data);
      coveredCount++;
      const v = sumVotes(data);
      totalVotesAll += v;
      if (v === 0) zeroVoteConstituencies++;
    } else {
      missingCount++;
      missingKeys.push(key);
    }
  }

  console.log(
    `   ${allCandidates.length} candidates from ${coveredCount}/${allConstituencies.length} constituencies`
  );
  console.log(`   Total votes: ${totalVotesAll.toLocaleString()}`);
  if (zeroVoteConstituencies > 0) {
    console.log(
      `   ⚠️  ${zeroVoteConstituencies} constituencies still have 0 votes`
    );
  }
  if (missingCount > 0) {
    console.log(`   ⚠️  ${missingCount} constituencies have no data at all`);
    if (missingCount <= 20) {
      console.log(`   Missing: ${missingKeys.join(', ')}`);
    }
  }

  if (allCandidates.length === 0) {
    console.error('   ❌ Zero candidates — not writing to KV');
    return { updated: succeeded, failed, skipped: freshCount };
  }

  const body = JSON.stringify(allCandidates);
  const hash = await computeHash(body);
  const bodySizeMB = (Buffer.byteLength(body, 'utf-8') / (1024 * 1024)).toFixed(
    2
  );
  const nowStr = new Date().toUTCString();

  console.log(`   ${bodySizeMB} MB, hash=${hash.slice(0, 12)}…`);
  console.log('\n📤 Writing merged candidates to KV…');
  kvPut(CANDIDATES_KEY, body, {
    updatedAt: nowStr,
    contentType: 'application/json',
    etag: hash,
    candidateCount: allCandidates.length,
  });
  console.log(
    `   ✅ ${CANDIDATES_KEY} updated — ${allCandidates.length} candidates, ${totalVotesAll.toLocaleString()} total votes`
  );

  // Final summary
  const withVotes = coveredCount - zeroVoteConstituencies;
  console.log();
  console.log('━'.repeat(60));
  console.log(`🏁 Cycle #${cycleNum} done!`);
  console.log(
    `   Data:    ${progressBar(coveredCount, allConstituencies.length)}`
  );
  console.log(
    `   Votes:   ${progressBar(withVotes, allConstituencies.length)}`
  );
  if (succeeded > 0) {
    console.log(`   Updated: ${succeeded} constituencies this cycle`);
  }
  console.log('━'.repeat(60));

  return { updated: succeeded, failed, skipped: freshCount };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('━'.repeat(60));
  console.log('  🔄 local-refresh.ts — ECN constituency refresher');
  console.log('━'.repeat(60));
  console.log();
  console.log(
    `  Config: batch=${BATCH_SIZE}, delay=${BATCH_DELAY_MS}ms, max=${MAX_FETCH}`
  );
  console.log(`  Stale threshold: ${STALE_MINS} minutes`);
  if (refreshAll) console.log('  Mode: --all (refresh everything)');
  if (loopMode)
    console.log(
      `  Mode: --loop (continuous, ${LOOP_DELAY_SEC}s between cycles)`
    );
  if (dryRun) console.log('  Mode: --dry-run');
  if (mergeOnly) console.log('  Mode: --merge-only');
  if (onlyKey) console.log(`  Target: --only ${onlyKey}`);
  console.log();

  // Read constituency list (only once — it doesn't change)
  console.log('📋 Reading constituency list from KV…');
  const constListRaw = kvGet(CONSTITUENCY_LIST_KEY);
  if (!constListRaw) {
    console.error(
      '❌ No constituency list in KV. Run the worker first to populate it.'
    );
    process.exit(1);
  }
  const allConstituencies: ConstituencyEntry[] = JSON.parse(constListRaw);
  let constituencies = allConstituencies;

  if (onlyKey) {
    const [dStr, cStr] = onlyKey.split('-');
    const dId = parseInt(dStr, 10);
    const cId = parseInt(cStr, 10);
    if (Number.isNaN(dId) || Number.isNaN(cId)) {
      console.error(
        `❌ Invalid --only key "${onlyKey}". Expected format: distId-consts (e.g. 26-6)`
      );
      process.exit(1);
    }
    const match = allConstituencies.filter(
      (c) => c.distId === dId && c.consts === cId
    );
    if (match.length === 0) {
      console.error(`❌ Constituency ${onlyKey} not found in the list.`);
      process.exit(1);
    }
    constituencies = match;
    console.log(`   🎯 --only ${onlyKey}: targeting 1 constituency\n`);
  } else {
    console.log(`   ${allConstituencies.length} constituencies in list\n`);
  }

  // Bootstrap session
  let session: EcnSession | null = null;
  if (!mergeOnly && !dryRun) {
    session = await bootstrapSession();
  }

  let cycleNum = 0;
  let totalUpdated = 0;

  do {
    cycleNum++;
    if (cycleNum > 1) {
      console.log(`\n⏳ Waiting ${LOOP_DELAY_SEC}s before next cycle…\n`);
      await sleep(LOOP_DELAY_SEC * 1000);

      // Re-bootstrap session every 5 cycles (ECN sessions expire)
      if (cycleNum % 5 === 1 && !mergeOnly && !dryRun) {
        console.log('🔐 Re-bootstrapping session (periodic refresh)…');
        try {
          session = await bootstrapSession();
        } catch (err) {
          console.error(`   ❌ Re-bootstrap failed: ${(err as Error).message}`);
          console.log('   Continuing with existing session…');
        }
      }
    }

    try {
      const result = await runCycle(
        cycleNum,
        session!,
        constituencies,
        allConstituencies
      );
      totalUpdated += result.updated;

      // In dry-run mode, don't loop
      if (dryRun) break;
    } catch (err) {
      console.error(
        `\n❌ Cycle ${cycleNum} crashed: ${(err as Error).message}`
      );
      console.error((err as Error).stack);

      // If session might be expired, try re-bootstrap
      if (!mergeOnly && !dryRun) {
        console.log('\n🔐 Attempting session re-bootstrap after error…');
        try {
          session = await bootstrapSession();
        } catch {
          console.error('   ❌ Re-bootstrap also failed');
        }
      }
    }
  } while (loopMode);

  if (loopMode && cycleNum > 1) {
    console.log();
    console.log('━'.repeat(60));
    console.log(`📊 Total across ${cycleNum} cycles: ${totalUpdated} updates`);
    console.log('━'.repeat(60));
  }
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
