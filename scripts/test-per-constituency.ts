/**
 * scripts/test-per-constituency.ts
 *
 * Standalone test script that simulates the Worker's per-constituency fetch
 * logic locally. Bootstraps an ECN session, fetches the constituency list,
 * then fetches a sample of per-constituency files in batches, and compares
 * the result against the central file.
 *
 * Usage:
 *   npx tsx scripts/test-per-constituency.ts
 *   npx tsx scripts/test-per-constituency.ts --all       # fetch all 165
 *   npx tsx scripts/test-per-constituency.ts --sample 10 # fetch 10 random
 *   npx tsx scripts/test-per-constituency.ts --all --delay 500  # 500ms between batches
 *   npx tsx scripts/test-per-constituency.ts --all --batch 3 --delay 1000  # 3 at a time, 1s gap
 */

const ECN_ORIGIN = 'https://result.election.gov.np';
const ECN_HANDLER_PATH = '/Handlers/SecureJson.ashx';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EcnSession {
  cookies: string;
  csrfToken: string;
}

interface ConstituencyEntry {
  distId: number;
  consts: number;
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const fetchAll = args.includes('--all');
const sampleIdx = args.indexOf('--sample');
const sampleSize = sampleIdx !== -1 ? parseInt(args[sampleIdx + 1], 10) : 5;
const delayIdx = args.indexOf('--delay');
const batchDelayMs = delayIdx !== -1 ? parseInt(args[delayIdx + 1], 10) : 150;
const batchIdx = args.indexOf('--batch');
const batchSize = batchIdx !== -1 ? parseInt(args[batchIdx + 1], 10) : 10;

// ---------------------------------------------------------------------------
// ECN session bootstrap
// ---------------------------------------------------------------------------

function parseCookies(headers: Headers): Map<string, string> {
  const map = new Map<string, string>();
  const raw = headers.get('set-cookie') ?? '';
  // Split on commas that are followed by a cookie name=value pattern
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

async function bootstrapSession(): Promise<EcnSession> {
  console.log('🔐 Bootstrapping ECN session…');

  const res = await fetch(ECN_ORIGIN + '/', {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`Bootstrap failed: HTTP ${res.status}`);
  }

  await res.text(); // consume body

  const cookies = parseCookies(res.headers);
  const csrfToken = cookies.get('CsrfToken');

  if (!csrfToken) {
    throw new Error(
      `No CsrfToken cookie. Got cookies: ${Array.from(cookies.keys()).join(', ')}`
    );
  }

  const cookieString = Array.from(cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  console.log(`✅ Session bootstrapped (token: ${csrfToken.slice(0, 12)}…)`);

  return { cookies: cookieString, csrfToken };
}

// ---------------------------------------------------------------------------
// ECN secure fetch
// ---------------------------------------------------------------------------

async function ecnFetch(
  session: EcnSession,
  filePath: string
): Promise<string | null> {
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
    await res.text();
    return null;
  }

  return res.text();
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const session = await bootstrapSession();

  // Step 1: Fetch constituency list
  console.log('\n📋 Fetching constituency list…');
  const constBody = await ecnFetch(
    session,
    'JSONFiles/Election2082/HOR/Lookup/constituencies.json'
  );

  if (!constBody) {
    console.error('❌ Failed to fetch constituency list');
    process.exit(1);
  }

  const rawList: { distId: number; consts: number }[] = JSON.parse(constBody);
  // ECN returns one entry per district where `consts` is the COUNT of
  // constituencies in that district. Expand to individual entries.
  const allConstituencies: ConstituencyEntry[] = [];
  const seen = new Set<string>();
  for (const entry of rawList) {
    for (let c = 1; c <= entry.consts; c++) {
      const key = `${entry.distId}-${c}`;
      if (!seen.has(key)) {
        seen.add(key);
        allConstituencies.push({ distId: entry.distId, consts: c });
      }
    }
  }
  console.log(
    `   ECN returned ${rawList.length} district entries → expanded to ${allConstituencies.length} constituencies`
  );

  // Step 2: Decide which to fetch
  let toFetch: ConstituencyEntry[];
  if (fetchAll) {
    toFetch = allConstituencies;
    console.log(`\n🌐 Fetching ALL ${toFetch.length} constituencies…`);
  } else {
    toFetch = shuffle(allConstituencies).slice(0, sampleSize);
    console.log(
      `\n🎲 Sampling ${toFetch.length} random constituencies: ${toFetch.map((c) => `${c.distId}-${c.consts}`).join(', ')}`
    );
  }

  // Step 3: Fetch per-constituency in batches
  const BATCH_SIZE = batchSize;
  const BATCH_DELAY_MS = batchDelayMs;
  console.log(`   Batch size: ${BATCH_SIZE}, delay: ${BATCH_DELAY_MS}ms`);
  let totalCandidates = 0;
  let totalWithVotes = 0;
  let succeeded = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  const allCandidates: unknown[] = [];

  const startTime = Date.now();

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    if (consecutiveFailures >= 3) {
      console.warn(
        `\n⚠️  ${consecutiveFailures} consecutive batch failures — stopping early`
      );
      failed += toFetch.length - i;
      break;
    }

    const batch = toFetch.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(toFetch.length / BATCH_SIZE);
    process.stdout.write(
      `   Batch ${batchNum}/${totalBatches} (${batch.length} requests)… `
    );

    const results = await Promise.all(
      batch.map(async (c) => {
        const key = `${c.distId}-${c.consts}`;
        const ecnFile = `JSONFiles/Election2082/HOR/FPTP/HOR-${c.distId}-${c.consts}.json`;
        const body = await ecnFetch(session, ecnFile);

        if (!body) {
          return { key, ok: false as const, status: 'fetch-failed' };
        }

        const trimmed = body.trim();
        if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
          return { key, ok: false as const, status: 'not-json' };
        }

        try {
          const parsed = JSON.parse(trimmed);
          const candidates = Array.isArray(parsed) ? parsed : [];
          return { key, ok: true as const, candidates };
        } catch {
          return { key, ok: false as const, status: 'parse-error' };
        }
      })
    );

    let batchOk = 0;
    let batchFail = 0;
    for (const r of results) {
      if (r.ok) {
        batchOk++;
        succeeded++;
        const withVotes = r.candidates.filter(
          (c: any) => (c.TotalVoteReceived ?? 0) > 0
        ).length;
        totalCandidates += r.candidates.length;
        totalWithVotes += withVotes;
        allCandidates.push(...r.candidates);
      } else {
        batchFail++;
        failed++;
        console.warn(`\n      ⚠️  HOR-${r.key}: ${r.status}`);
      }
    }

    console.log(`✓ ${batchOk} ok, ${batchFail} failed`);

    if (batchFail === batch.length) {
      consecutiveFailures++;
    } else {
      consecutiveFailures = 0;
    }

    // Delay between batches
    if (i + BATCH_SIZE < toFetch.length) {
      const jitter = Math.floor(Math.random() * 100);
      await sleep(BATCH_DELAY_MS + jitter);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📊 Per-Constituency Results (${elapsed}s)`);
  console.log(`   Constituencies fetched: ${succeeded}/${toFetch.length}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total candidates: ${totalCandidates}`);
  console.log(`   Candidates with votes > 0: ${totalWithVotes}`);

  // Step 4: Compare with central file
  console.log(`\n📄 Fetching central file for comparison…`);
  const centralBody = await ecnFetch(
    session,
    'JSONFiles/ElectionResultCentral2082.txt'
  );

  if (centralBody) {
    try {
      const centralData = JSON.parse(centralBody.trim());
      if (Array.isArray(centralData)) {
        const centralWithVotes = centralData.filter(
          (c: any) => (c.TotalVoteReceived ?? 0) > 0
        ).length;
        const centralConsts = new Set(
          centralData.map((c: any) => {
            const d = c.DistrictCd || c.CTZDIST || '?';
            const n = c.SCConstID || '?';
            return `${d}-${n}`;
          })
        );

        console.log(`   Central file candidates: ${centralData.length}`);
        console.log(`   Central with votes > 0: ${centralWithVotes}`);
        console.log(`   Central unique constituencies: ${centralConsts.size}`);

        console.log(`\n🔍 Comparison:`);

        if (fetchAll) {
          console.log(
            `   Per-constituency total: ${totalCandidates} candidates`
          );
          console.log(
            `   Central file total:     ${centralData.length} candidates`
          );
          console.log(
            `   Difference: ${totalCandidates > centralData.length ? '+' : ''}${totalCandidates - centralData.length} candidates`
          );
          console.log(
            `   Votes: per-const has ${totalWithVotes}, central has ${centralWithVotes}`
          );
        } else {
          // Compare just the sampled constituencies
          const sampledKeys = new Set(
            toFetch.map((c) => `${c.distId}-${c.consts}`)
          );
          const centralInSample = centralData.filter((c: any) => {
            const d = Number(c.DistrictCd) || Number(c.CTZDIST) || 0;
            const n = Number(c.SCConstID) || 0;
            return d && n && sampledKeys.has(`${d}-${n}`);
          });
          const centralSampleVotes = centralInSample.filter(
            (c: any) => (c.TotalVoteReceived ?? 0) > 0
          ).length;

          console.log(`   For sampled constituencies (${sampledKeys.size}):`);
          console.log(
            `     Per-constituency: ${totalCandidates} candidates (${totalWithVotes} with votes)`
          );
          console.log(
            `     Central file:     ${centralInSample.length} candidates (${centralSampleVotes} with votes)`
          );
        }
      }
    } catch (err) {
      console.warn(`   Failed to parse central file:`, err);
    }
  } else {
    console.warn(`   ⚠️  Central file fetch failed`);
  }

  // Step 5: Simulate the serialized output size
  const serialized = JSON.stringify(allCandidates);
  const sizeMB = (serialized.length / (1024 * 1024)).toFixed(2);
  console.log(
    `\n💾 Merged output: ${serialized.length} bytes (${sizeMB} MB) for ${allCandidates.length} candidates`
  );

  console.log(`\n✅ Done.`);
}

main().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
