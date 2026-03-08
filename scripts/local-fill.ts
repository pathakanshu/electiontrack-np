/**
 * scripts/local-fill.ts
 *
 * Local helper that fetches failed/missing constituencies from ECN using your
 * machine's IP (which doesn't get 429'd as aggressively) and patches the
 * worker's const-blob in KV directly via the Wrangler CLI.
 *
 * How it works:
 *   1. Reads the current const-blob from KV to find failed/missing constituencies
 *   2. Bootstraps an ECN session
 *   3. Fetches the missing constituency files in batches (10 concurrent — no
 *      rate limit from residential IPs, just 503s from ECN overload)
 *   4. Patches the blob in memory with successful fetches
 *   5. Writes the updated blob back to KV
 *
 * Usage:
 *   npx tsx scripts/local-fill.ts                  # fill all failed + missing
 *   npx tsx scripts/local-fill.ts --dry-run        # just show what would be fetched
 *   npx tsx scripts/local-fill.ts --batch 5        # 5 concurrent (default: 10)
 *   npx tsx scripts/local-fill.ts --delay 500      # 500ms between batches (default: 200)
 *   npx tsx scripts/local-fill.ts --max 30         # only fetch up to 30
 *   npx tsx scripts/local-fill.ts --merge-only     # skip fetching, just rebuild candidates from blob
 *   npx tsx scripts/local-fill.ts --retry-503      # also retry constituencies that failed with 503 last time
 *   npx tsx scripts/local-fill.ts --all            # re-fetch everything (cached + failed + never-fetched)
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
const retryAll = args.includes('--all');

function argVal(name: string, def: number): number {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return def;
  const val = parseInt(args[idx + 1], 10);
  return Number.isNaN(val) ? def : val;
}

const BATCH_SIZE = argVal('--batch', 10);
const BATCH_DELAY_MS = argVal('--delay', 200);
const MAX_FETCH = argVal('--max', 9999);

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
    `local-fill-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
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
  // set-cookie headers may be comma-separated; split carefully
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
    const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout per request

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

/** Compact progress bar for the terminal */
function progressBar(current: number, total: number, width = 30): string {
  const pct = total > 0 ? current / total : 0;
  const filled = Math.round(width * pct);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${current}/${total} (${Math.round(pct * 100)}%)`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('━'.repeat(60));
  console.log('  📡 local-fill.ts — ECN constituency fetcher');
  console.log('━'.repeat(60));
  console.log();

  // Step 1: Read the const-blob from KV
  console.log('📦 Reading const-blob from KV…');
  const blobRaw = kvGet(CONST_BLOB_KEY);
  const blob: ConstBlob = blobRaw
    ? JSON.parse(blobRaw)
    : { state: {}, constData: {} };

  // Step 2: Read the constituency list from KV
  console.log('📋 Reading constituency list from KV…');
  const constListRaw = kvGet(CONSTITUENCY_LIST_KEY);
  if (!constListRaw) {
    console.error(
      '❌ No constituency list in KV. Run the worker first to populate it.'
    );
    process.exit(1);
  }
  const constituencies: ConstituencyEntry[] = JSON.parse(constListRaw);
  console.log(`   ${constituencies.length} constituencies in list`);

  // Step 3: Determine what needs fetching, prioritized:
  //   failed (oldest first) → never-fetched → stale cached (oldest first)
  const toFetch: ConstituencyEntry[] = [];
  for (const c of constituencies) {
    const key = `${c.distId}-${c.consts}`;
    const s = blob.state[key];
    const hasData =
      blob.constData[key] &&
      Array.isArray(blob.constData[key]) &&
      blob.constData[key].length > 0;

    if (retryAll) {
      toFetch.push(c);
    } else if (!s || s.failed || !hasData) {
      toFetch.push(c);
    }
  }

  // Sort: failed first, then never-fetched, then cached (refresh).
  // Within each group, oldest fetchedAt first so we retry the longest-waiting ones.
  toFetch.sort((a, b) => {
    const ka = `${a.distId}-${a.consts}`;
    const kb = `${b.distId}-${b.consts}`;
    const sa = blob.state[ka];
    const sb = blob.state[kb];

    // Priority: failed=0, never-fetched=1, cached/refresh=2
    const pa = !sa ? 1 : sa.failed ? 0 : 2;
    const pb = !sb ? 1 : sb.failed ? 0 : 2;
    if (pa !== pb) return pa - pb;

    // Within same priority, oldest first
    const ta = sa?.fetchedAt ?? 0;
    const tb = sb?.fetchedAt ?? 0;
    return ta - tb;
  });

  const cachedCount = Object.values(blob.state).filter((s) => !s.failed).length;
  const failedCount = Object.values(blob.state).filter((s) => s.failed).length;
  const neverCount = constituencies.length - Object.keys(blob.state).length;
  const emptyDataCount = Object.entries(blob.state).filter(
    ([key, s]) =>
      !s.failed &&
      (!blob.constData[key] ||
        !Array.isArray(blob.constData[key]) ||
        blob.constData[key].length === 0)
  ).length;

  console.log();
  console.log('📊 Current state:');
  console.log(`   ✅ ${cachedCount} cached (with data)`);
  if (emptyDataCount > 0) {
    console.log(`   ⚠️  ${emptyDataCount} cached but empty data`);
  }
  console.log(`   ❌ ${failedCount} failed`);
  console.log(`   🔲 ${neverCount} never-fetched`);
  console.log(
    `   📥 ${toFetch.length} to fetch${retryAll ? ' (--all mode)' : ''}`
  );
  console.log(`   ${progressBar(cachedCount, constituencies.length)}`);
  console.log();

  if (toFetch.length === 0 && !mergeOnly) {
    console.log('✅ Nothing to fetch — all constituencies are cached!');
    process.exit(0);
  }

  if (dryRun) {
    console.log('🔍 Dry run — would fetch:');
    for (const c of toFetch.slice(0, MAX_FETCH)) {
      const key = `${c.distId}-${c.consts}`;
      const s = blob.state[key];
      const tag = !s ? '(never)' : s.failed ? '(failed)' : '(refresh)';
      console.log(`   HOR-${c.distId}-${c.consts}.json ${tag}`);
    }
    if (toFetch.length > MAX_FETCH) {
      console.log(
        `   … and ${toFetch.length - MAX_FETCH} more (--max ${MAX_FETCH})`
      );
    }
    process.exit(0);
  }

  // Step 4: Fetch from ECN
  if (!mergeOnly && toFetch.length > 0) {
    const session = await bootstrapSession();
    const targets = toFetch.slice(0, MAX_FETCH);
    console.log(
      `🌐 Fetching ${targets.length} constituencies (batch=${BATCH_SIZE}, delay=${BATCH_DELAY_MS}ms)…\n`
    );

    let succeeded = 0;
    let failed = 0;
    let errors503 = 0;
    let errors429 = 0;
    let errorsTimeout = 0;
    let errorsOther = 0;

    const startTime = Date.now();
    const totalBatches = Math.ceil(targets.length / BATCH_SIZE);

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      process.stdout.write(
        `  Batch ${batchNum}/${totalBatches} (${batch.length} req)… `
      );

      const results = await Promise.all(
        batch.map(async (c) => {
          const key = `${c.distId}-${c.consts}`;
          const ecnFile = `JSONFiles/Election2082/HOR/FPTP/HOR-${c.distId}-${c.consts}.json`;
          const res = await ecnFetch(session, ecnFile);
          return { key, ...res };
        })
      );

      let batchOk = 0;
      let batchFail = 0;
      const failedKeys: string[] = [];

      for (const r of results) {
        if (r.ok && r.text) {
          const trimmed = r.text.trim();
          if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
              const parsed = JSON.parse(trimmed);
              const candidates = Array.isArray(parsed) ? parsed : [];

              // Guard: ECN sometimes returns valid 200 with [] when its
              // backend is under load. Don't overwrite existing data with
              // nothing — that silently wipes the constituency off the map.
              if (candidates.length === 0) {
                const existing = blob.constData[r.key];
                if (
                  existing &&
                  Array.isArray(existing) &&
                  existing.length > 0
                ) {
                  console.warn(
                    `\n   ⚠️  HOR-${r.key}: ECN returned [] — keeping ${existing.length} existing candidates`
                  );
                  // Don't update fetchedAt so it stays "stale" and gets
                  // retried sooner instead of being skipped as fresh.
                  batchFail++;
                  failed++;
                  failedKeys.push(r.key);
                  errorsOther++;
                  continue;
                }
                // No existing data either — mark as failed for retry
                blob.state[r.key] = { fetchedAt: Date.now(), failed: true };
                batchFail++;
                failed++;
                failedKeys.push(r.key);
                errorsOther++;
                continue;
              }

              blob.constData[r.key] = candidates;
              blob.state[r.key] = { fetchedAt: Date.now(), failed: false };
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

        blob.state[r.key] = { fetchedAt: Date.now(), failed: true };
        failed++;
        batchFail++;
        failedKeys.push(r.key);
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

      // If we're getting rate-limited, back off more aggressively
      if (results.some((r) => r.status === 429)) {
        const backoff = 3000 + Math.random() * 2000;
        console.log(
          `   ⏳ Hit 429 — backing off ${(backoff / 1000).toFixed(1)}s`
        );
        await sleep(backoff);
      } else if (i + BATCH_SIZE < targets.length) {
        // Normal inter-batch delay
        await sleep(BATCH_DELAY_MS);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log();
    console.log('━'.repeat(40));
    console.log(`📊 Fetch complete in ${elapsed}s:`);
    console.log(`   ✅ ${succeeded} succeeded`);
    if (failed > 0) {
      console.log(
        `   ❌ ${failed} failed (503: ${errors503}, 429: ${errors429}, timeout: ${errorsTimeout}, other: ${errorsOther})`
      );
    }
    console.log('━'.repeat(40));

    if (succeeded === 0) {
      console.log('\n⚠️  No new data fetched — skipping KV writes.');
      process.exit(1);
    }

    // Step 5: Merge-before-write — re-read blob from KV and keep whichever
    // version has more votes per constituency. This prevents stomping fresher
    // data written by the worker cron or local-refresh while we were fetching.
    console.log('\n🔄 Merge-before-write: re-reading blob from KV…');
    const freshBlobRaw = kvGet(CONST_BLOB_KEY);
    if (freshBlobRaw) {
      const freshBlob: ConstBlob = JSON.parse(freshBlobRaw);
      let preserved = 0;

      const sumVotes = (arr: unknown[]): number =>
        arr.reduce<number>(
          (sum, c) =>
            sum +
            ((c as { TotalVoteReceived?: number }).TotalVoteReceived ?? 0),
          0
        );

      for (const key of Object.keys(freshBlob.constData)) {
        const freshData = freshBlob.constData[key];
        const memData = blob.constData[key];

        if (!freshData || !Array.isArray(freshData) || freshData.length === 0) {
          continue;
        }

        const memHasData =
          memData && Array.isArray(memData) && memData.length > 0;

        if (!memHasData) {
          blob.constData[key] = freshData;
          blob.state[key] = freshBlob.state[key] ?? {
            fetchedAt: Date.now(),
            failed: false,
          };
          preserved++;
          continue;
        }

        // Both have data — keep whichever has more total votes (= fresher)
        const freshVotes = sumVotes(freshData);
        const memVotes = sumVotes(memData);
        if (freshVotes > memVotes) {
          blob.constData[key] = freshData;
          blob.state[key] = freshBlob.state[key] ?? blob.state[key];
          preserved++;
        }
      }

      if (preserved > 0) {
        console.log(
          `   ✅ Preserved ${preserved} entries from KV with better data`
        );
      } else {
        console.log('   ✅ No merge conflicts');
      }
    }

    // Step 6: Write updated blob to KV
    console.log('\n📤 Writing updated const-blob to KV…');
    const blobJson = JSON.stringify(blob);
    const blobSizeMB = (
      Buffer.byteLength(blobJson, 'utf-8') /
      (1024 * 1024)
    ).toFixed(2);
    console.log(`   Blob size: ${blobSizeMB} MB`);
    kvPut(CONST_BLOB_KEY, blobJson);
    console.log('   ✅ Blob updated');
  }

  // Step 6: Rebuild and write merged candidates
  console.log('\n🔗 Merging candidates from blob…');
  const allCandidates: unknown[] = [];
  let coveredCount = 0;
  let missingCount = 0;
  const missingKeys: string[] = [];

  for (const c of constituencies) {
    const key = `${c.distId}-${c.consts}`;
    const data = blob.constData[key];
    if (data && Array.isArray(data) && data.length > 0) {
      allCandidates.push(...data);
      coveredCount++;
    } else {
      missingCount++;
      missingKeys.push(key);
    }
  }

  console.log(
    `   ${allCandidates.length} candidates from ${coveredCount}/${constituencies.length} constituencies`
  );
  if (missingCount > 0) {
    console.log(`   ⚠️  ${missingCount} constituencies still missing data`);
    if (missingCount <= 20) {
      console.log(`   Missing: ${missingKeys.join(', ')}`);
    }
  }

  if (allCandidates.length === 0) {
    console.error('   ❌ Zero candidates — not writing to KV');
    process.exit(1);
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
    `   ✅ ${CANDIDATES_KEY} updated — ${allCandidates.length} candidates`
  );

  // Final summary
  const finalCached = Object.values(blob.state).filter((s) => !s.failed).length;
  const finalFailed = Object.values(blob.state).filter((s) => s.failed).length;
  const coverage = Math.round((finalCached / constituencies.length) * 100);

  console.log();
  console.log('━'.repeat(60));
  console.log(`🏁 Done!`);
  console.log(
    `   Coverage: ${progressBar(finalCached, constituencies.length)}`
  );
  if (finalFailed > 0) {
    console.log(`   ${finalFailed} still failed — run again to retry`);
  }
  if (coverage === 100) {
    console.log('   🎉 Full coverage achieved!');
  }
  console.log('━'.repeat(60));
}

main().catch((err) => {
  console.error('💥 Fatal:', err);
  process.exit(1);
});
