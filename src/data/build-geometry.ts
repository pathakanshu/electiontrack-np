import { topology } from 'topojson-server';
import { simplify, presimplify } from 'topojson-simplify';
import fs from 'fs';
import path from 'path';

import type { Province, District, Constituency } from '../types';

type FeatureCollection<T> = {
  type: 'FeatureCollection';
  features: T[];
};

/**
 * Build a TopoJSON topology from GeoJSON feature arrays and write it to disk.
 *
 * This function adds lightweight validation, logging, and safer file-write
 * semantics (write-to-temp then rename) so build failures are easier to diagnose.
 *
 * Note: This function is synchronous by design (keeps compatibility with existing callers).
 * It throws on error so callers can handle failures.
 */
export function buildGeometry(
  provinces: Province[],
  districts: District[],
  constituencies: Constituency[]
) {
  try {
    console.log('🔧 buildGeometry: starting TopoJSON build');
    // basic validation to catch obvious mistakes early
    if (
      !Array.isArray(provinces) ||
      !Array.isArray(districts) ||
      !Array.isArray(constituencies)
    ) {
      throw new Error(
        'Invalid input: provinces/districts/constituencies must be arrays'
      );
    }

    console.log(
      `🔍 buildGeometry: provinces=${provinces.length}, districts=${districts.length}, constituencies=${constituencies.length}`
    );

    // Wrap everything as FeatureCollections
    const topo = topology({
      provinces: {
        type: 'FeatureCollection',
        features: provinces,
      } as FeatureCollection<Province>,

      districts: {
        type: 'FeatureCollection',
        features: districts,
      } as FeatureCollection<District>,

      constituencies: {
        type: 'FeatureCollection',
        features: constituencies,
      } as FeatureCollection<Constituency>,
    });

    // Prepare for simplification
    const presimplified = presimplify(topo);

    // Tune this number later (0.002–0.01 range)
    const simplified = simplify(presimplified, 2);

    const outDir = path.join(process.cwd(), 'public', 'data');
    const outPath = path.join(outDir, 'geometry.topo.json');
    const tmpPath = outPath + '.tmp';

    // Ensure output directory exists
    fs.mkdirSync(outDir, { recursive: true });

    // Write atomically: write to a temp file and then rename
    const serialized = JSON.stringify(simplified);
    fs.writeFileSync(tmpPath, serialized, { encoding: 'utf8' });
    fs.renameSync(tmpPath, outPath);

    const stats = fs.statSync(outPath);
    console.log(
      '✅ TopoJSON geometry written:',
      outPath,
      `(${stats.size} bytes)`
    );
  } catch (err) {
    // Provide a more descriptive error message and rethrow for caller handling
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ buildGeometry failed:', message);
    throw new Error(`buildGeometry failed: ${message}`);
  }
}
