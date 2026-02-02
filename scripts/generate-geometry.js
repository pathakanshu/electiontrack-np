#!/usr/bin/env node
/**
 * scripts/generate-geometry.js
 *
 * Fallback Node.js generator that:
 *  - Fetches remote GeoJSON (province, district, constituency)
 *  - Repackages them into the app's Feature shapes
 *  - Builds a TopoJSON topology and simplifies it
 *  - Writes the result to `public/data/geometry.topo.json`
 *
 * Usage:
 *   node scripts/generate-geometry.js
 *
 * Notes:
 * - This is plain CommonJS so you don't need ts-node.
 * - Requires Node 18+ (global `fetch`). If your Node doesn't have fetch,
 *   run with a Node that does, or install a fetch polyfill and adapt this script.
 * - The script writes atomically (tmp file then rename).
 */

const fs = require('fs');
const path = require('path');
const { topology } = require('topojson-server');
const { presimplify, simplify } = require('topojson-simplify');

const OUT_DIR = path.join(process.cwd(), 'public', 'data');
const OUT_PATH = path.join(OUT_DIR, 'geometry.topo.json');
const OUT_TMP = OUT_PATH + '.tmp';

function now() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(`[${now()}]`, ...args);
}

function errorLog(...args) {
  console.error(`[${now()}] ERROR:`, ...args);
}

// Ensure fetch exists (Node 18+); otherwise fail with guidance.
function ensureFetch() {
  if (typeof fetch === 'function') return fetch;
  throw new Error(
    'Global fetch() is not available. Please run this script on Node 18+ or provide a fetch polyfill.'
  );
}

async function fetchJson(url) {
  const f = ensureFetch();
  log('Fetching', url);
  const res = await f(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>');
    throw new Error(
      `Request failed ${res.status} ${res.statusText} for ${url}\n${body.slice(0, 500)}`
    );
  }
  const ct =
    res.headers && res.headers.get ? res.headers.get('content-type') : '';
  if (ct && ct.includes('text/html')) {
    // Common situation: proxy or error returning HTML; include small preview
    const text = await res.text();
    throw new Error(
      `Expected JSON but got HTML for ${url}: ${text.slice(0, 300)}`
    );
  }
  return res.json();
}

function normalizeFeatureCollection(payloadOrArray) {
  // Accept either { type: 'FeatureCollection', features: [...] } or an array [...]
  if (!payloadOrArray) return [];
  if (Array.isArray(payloadOrArray)) return payloadOrArray;
  if (payloadOrArray.features && Array.isArray(payloadOrArray.features)) {
    return payloadOrArray.features;
  }
  // Unknown shape
  throw new Error(
    'Unexpected GeoJSON payload shape (not FeatureCollection or array)'
  );
}

async function build() {
  try {
    log('Starting geometry generation');

    // URLs (copied from project code)
    const PROVINCES_URL =
      'https://result.election.gov.np/JSONFiles/JSONMap/geojson/Province.json';
    const DISTRICT_IDS_URL =
      'https://result.election.gov.np/JSONFiles/Election2079/Local/Lookup/districts.json';
    const CONSTITUENCY_IDS_URL =
      'https://result.election.gov.np/JSONFiles/Election2079/HOR/Lookup/constituencies.json';

    // Fetch provinces payload
    const provincesRaw = await fetchJson(PROVINCES_URL);
    const provinceFeatures = normalizeFeatureCollection(provincesRaw);

    // Fetch identifier lookup tables used by bundling logic
    const districtIdentifiers = await fetchJson(DISTRICT_IDS_URL);
    const constituencyIdentifiers = await fetchJson(CONSTITUENCY_IDS_URL);

    // Build provinces array in the app's Feature shape
    const provinces = provinceFeatures.map((feature) => {
      const province_id = feature.properties && feature.properties.STATE_C;
      const province_name = feature.properties && feature.properties.STATE_N;
      const geometry_coords = feature.geometry && feature.geometry.coordinates;
      const district_ids = (districtIdentifiers || [])
        .filter((d) => d.parentId === province_id)
        .map((d) => d.id);

      return {
        type: 'Feature',
        properties: {
          province_id,
          name_np: province_name,
          name_en: null,
          district_ids,
        },
        geometry: {
          type: 'MultiPolygon',
          coordinates: geometry_coords,
        },
      };
    });

    log(`Prepared ${provinces.length} provinces`);

    // For each province, fetch districts (STATE_C_{provinceId}.json)
    const districts = [];
    for (const prov of provinces) {
      const pid = prov.properties && prov.properties.province_id;
      if (typeof pid !== 'number') {
        log('Skipping invalid province id', pid);
        continue;
      }
      const url = `https://result.election.gov.np/JSONFiles/JSONMap/geojson/District/STATE_C_${pid}.json`;
      const raw = await fetchJson(url);
      const features = normalizeFeatureCollection(raw);
      const mapped = features.map((feature) => {
        const district_id = feature.properties && feature.properties.DCODE;
        const district_name =
          feature.properties && feature.properties.DISTRICT_N;
        const geometry_coords =
          feature.geometry && feature.geometry.coordinates;
        const province_id = feature.properties && feature.properties.STATE_C;

        const constituency_ids = (constituencyIdentifiers || [])
          .filter((c) => c.distId === district_id)
          .map((c) => Number(String(district_id) + String(c.consts)));

        return {
          type: 'Feature',
          id: Number(String(province_id) + String(district_id)),
          properties: {
            district_id,
            province_id,
            name_np: district_name,
            name_en: null,
            constituency_ids,
          },
          geometry: {
            type: 'MultiPolygon',
            coordinates: geometry_coords,
          },
        };
      });
      log(`  Province ${pid}: fetched ${mapped.length} districts`);
      districts.push(...mapped);
    }

    log(`Prepared ${districts.length} districts`);

    // For each district, fetch constituencies (dist-{districtId}.json)
    const constituencies = [];
    for (const d of districts) {
      const did = d.properties && d.properties.district_id;
      if (typeof did !== 'number') {
        log('Skipping invalid district id', did);
        continue;
      }
      const url = `https://result.election.gov.np/JSONFiles/JSONMap/geojson/Const/dist-${did}.json`;
      const raw = await fetchJson(url);
      // Note: in upstream code this endpoint returned an array
      const features = normalizeFeatureCollection(raw);
      const mapped = features.map((feature) => {
        const district_id = feature.properties && feature.properties.DCODE;
        const province_id = feature.properties && feature.properties.STATE_C;
        const sub_id = feature.properties && feature.properties.F_CONST;
        const constituency_id = Number(String(district_id) + String(sub_id));
        const coordinates = feature.geometry && feature.geometry.coordinates;
        const conservation_area = !!(
          feature.properties && feature.properties.Conservati
        );

        return {
          type: 'Feature',
          properties: {
            constituency_id,
            district_id,
            sub_id,
            province_id,
            conservation_area,
          },
          geometry: {
            type: 'MultiPolygon',
            coordinates,
          },
        };
      });
      log(`  District ${did}: fetched ${mapped.length} constituencies`);
      constituencies.push(...mapped);
    }

    log(`Prepared ${constituencies.length} constituencies`);

    if (
      provinces.length === 0 ||
      districts.length === 0 ||
      constituencies.length === 0
    ) {
      throw new Error('No features prepared; aborting topology build');
    }

    // Build TopoJSON topology
    log('Building TopoJSON topology (topojson-server)...');
    const topo = topology({
      provinces: {
        type: 'FeatureCollection',
        features: provinces,
      },
      districts: {
        type: 'FeatureCollection',
        features: districts,
      },
      constituencies: {
        type: 'FeatureCollection',
        features: constituencies,
      },
    });

    log('Presimplifying topology...');
    const pres = presimplify(topo);

    // Tolerance chosen to match earlier value; tweak if needed
    log('Simplifying topology...');
    const simplified = simplify(pres, 0.005);

    // Ensure output dir exists
    fs.mkdirSync(OUT_DIR, { recursive: true });

    // Write atomically
    const serialized = JSON.stringify(simplified);
    fs.writeFileSync(OUT_TMP, serialized, { encoding: 'utf8' });
    fs.renameSync(OUT_TMP, OUT_PATH);

    const stats = fs.statSync(OUT_PATH);
    log(`Wrote TopoJSON to ${OUT_PATH} (${stats.size} bytes)`);

    log('Geometry generation completed successfully');
    process.exit(0);
  } catch (err) {
    errorLog('Geometry generation failed:', (err && err.message) || err);
    // Try to write an error marker to help debugging
    try {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(OUT_DIR, 'generate_error.txt'),
        String((err && err.stack) || err),
        'utf8'
      );
    } catch (e) {
      // ignore
    }
    process.exit(1);
  }
}

if (require.main === module) {
  build();
}
