/**
 * src/config/elections.ts
 *
 * Centralized configuration for all election data sources.
 * This is the single unified file where you manage URLs for different elections.
 *
 * Structure:
 * - Each election has a unique ID (e.g., "2079", "2082")
 * - URLs can be either remote API endpoints or cached local files
 * - URL templates use {provinceId}, {districtId}, {constituencyId} placeholders
 * - Geometry data (provinces, districts, constituencies) comes from live APIs
 * - Large result files are cached locally to reduce bandwidth
 *
 * To add a new election:
 * 1. Create a new election object with unique year/ID
 * 2. Fill in all endpoint URLs
 * 3. Set one election as isCurrent: true
 * 4. Run: npx ts-node scripts/download-cache.ts (to cache symbols and identifiers)
 * 5. No other code changes needed - everything uses getCurrentElection()
 *
 * To switch elections:
 * 1. Set isCurrent: false on old election
 * 2. Set isCurrent: true on new election
 * 3. Restart the app
 */

export interface ElectionConfig {
  id: string;
  name: string;
  year: number;
  isCurrent: boolean;
  endpoints: {
    // Geometry endpoints - serve GeoJSON for map rendering
    // These typically come from the live Election Commission API
    provinces: string;
    districts: (provinceId: number) => string;
    constituencies: (districtId: number) => string;

    // Lookup/Cache endpoints - served from public/cache/ directory
    // All of these are downloaded and cached locally
    districtLookup: string;
    constituencyIdentifiers: string;
    symbolIdentifiers: string;

    // Results endpoint - large file, typically cached
    // Can be .txt or .json format
    candidates: string;

    // Optional: per-constituency result endpoint (fallback)
    constituencyResults?: (
      districtId: number,
      constituencyId: number
    ) => string;
  };
}

/**
 * All configured elections.
 * The app will use whichever one has isCurrent: true.
 */
export const ELECTIONS: Record<string, ElectionConfig> = {
  '2079': {
    id: '2079',
    name: '2079 General Election',
    year: 2079,
    isCurrent: true,
    endpoints: {
      // Live geometry from Election Commission
      provinces:
        'https://result.election.gov.np/JSONFiles/JSONMap/geojson/Province.json',
      districts: (provinceId: number) =>
        `https://result.election.gov.np/JSONFiles/JSONMap/geojson/District/STATE_C_${provinceId}.json`,
      constituencies: (districtId: number) =>
        `https://result.election.gov.np/JSONFiles/JSONMap/geojson/Const/dist-${districtId}.json`,

      // Cached locally (downloaded by download-cache.ts)
      districtLookup: '/cache/districtLookup.json',
      constituencyIdentifiers: '/cache/constituencies.json',
      symbolIdentifiers: '/cache/symbols.json',

      // Cached candidates results
      candidates: '/cache/ElectionResultCentral2079.txt',

      // Fallback: fetch individual constituency results
      constituencyResults: (districtId: number, constituencyId: number) =>
        `https://result.election.gov.np/JSONFiles/Election2079/HOR/FPTP/HOR-${districtId}-${constituencyId}.json`,
    },
  },

  // Example: Add historical 2074 election when data is available
  // "2074": {
  //   id: "2074",
  //   name: "2074 General Election",
  //   year: 2074,
  //   isCurrent: false,
  //   endpoints: {
  //     provinces:
  //       "https://result.election.gov.np/JSONFiles/JSONMap/geojson/Province.json",
  //     districts: (provinceId: number) =>
  //       `https://result.election.gov.np/JSONFiles/JSONMap/geojson/District/STATE_C_${provinceId}.json`,
  //     constituencies: (districtId: number) =>
  //       `https://result.election.gov.np/JSONFiles/JSONMap/geojson/Const/dist-${districtId}.json`,
  //     districtLookup: "/cache/2074/districtLookup.json",
  //     constituencyIdentifiers: "/cache/2074/constituencies.json",
  //     symbolIdentifiers: "/cache/2074/symbols.json",
  //     candidates: "/cache/ElectionResultCentral2074.txt",
  //     constituencyResults: (districtId: number, constituencyId: number) =>
  //       `https://result.election.gov.np/JSONFiles/Election2074/HOR/FPTP/HOR-${districtId}-${constituencyId}.json`,
  //   },
  // },

  // Example: Add future 2082 election when available
  // "2082": {
  //   id: "2082",
  //   name: "2082 General Election",
  //   year: 2082,
  //   isCurrent: false,
  //   endpoints: {
  //     provinces:
  //       "https://result.election.gov.np/JSONFiles/JSONMap/geojson/Province.json",
  //     districts: (provinceId: number) =>
  //       `https://result.election.gov.np/JSONFiles/JSONMap/geojson/District/STATE_C_${provinceId}.json`,
  //     constituencies: (districtId: number) =>
  //       `https://result.election.gov.np/JSONFiles/JSONMap/geojson/Const/dist-${districtId}.json`,
  //     districtLookup: "/cache/2082/districtLookup.json",
  //     constituencyIdentifiers: "/cache/2082/constituencies.json",
  //     symbolIdentifiers: "/cache/2082/symbols.json",
  //     candidates: "/cache/ElectionResultCentral2082.txt",
  //     constituencyResults: (districtId: number, constituencyId: number) =>
  //       `https://result.election.gov.np/JSONFiles/Election2082/HOR/FPTP/HOR-${districtId}-${constituencyId}.json`,
  //   },
  // },
};

/**
 * Get the currently active election configuration.
 * This is the election displayed in the UI.
 *
 * @returns The active ElectionConfig
 * @throws Error if no election is marked as current
 */
export function getCurrentElection(): ElectionConfig {
  const current = Object.values(ELECTIONS).find((e) => e.isCurrent);
  if (!current) {
    throw new Error(
      'No election marked as isCurrent: true in ELECTIONS config'
    );
  }
  return current;
}

/**
 * Get a specific election by ID.
 *
 * @param id - The election ID (e.g., "2079")
 * @returns The ElectionConfig, or undefined if not found
 */
export function getElection(id: string): ElectionConfig | undefined {
  return ELECTIONS[id];
}

/**
 * Get all configured elections sorted by year (newest first).
 * Useful for showing election previews/archives.
 *
 * @returns Array of all elections sorted by year descending
 */
export function getAllElections(): ElectionConfig[] {
  return Object.values(ELECTIONS).sort((a, b) => b.year - a.year);
}

/**
 * Get all elections marked as available for preview.
 * These are elections that have isCurrent: true (currently active).
 *
 * @returns Array of available elections
 */
export function getAvailableElections(): ElectionConfig[] {
  return Object.values(ELECTIONS).filter((e) => e.isCurrent);
}
