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
 * 3. Run: npx ts-node scripts/download-cache.ts (to cache symbols and identifiers)
 * 4. No other code changes needed - everything uses getCurrentElection()
 *
 * To change the default election shown on load, update DEFAULT_ELECTION_ID below.
 */

/**
 * The election shown by default when the app first loads.
 * Change this constant to switch the startup election without touching anything else.
 */
export const DEFAULT_ELECTION_ID = '2082';

export interface ElectionConfig {
  id: string;
  name: string;
  /** Nepali name for the election (shown when locale is 'np'). */
  nameNp: string;
  year: number;
  isCurrent: boolean;
  /** If true, the UI should show a warning that data is incomplete/unavailable. */
  missingData?: boolean;
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

  /**
   * Remote source URLs for downloading cache data.
   * Used by scripts/download-cache.ts
   */
  source: {
    districtLookup: string;
    symbolImages: string;
    candidates: string;
  };
}

/**
 * All configured elections.
 */
export const ELECTIONS: Record<string, ElectionConfig> = {
  '2079': {
    id: '2079',
    name: '2079 General Election',
    nameNp: '२०७९ आम निर्वाचन',
    year: 2079,
    isCurrent: false,
    endpoints: {
      // Live geometry from Election Commission
      provinces:
        'https://result.election.gov.np/JSONFiles/JSONMap/geojson/Province.json',
      districts: (provinceId: number) =>
        `https://result.election.gov.np/JSONFiles/JSONMap/geojson/District/STATE_C_${provinceId}.json`,
      constituencies: (districtId: number) =>
        `https://result.election.gov.np/JSONFiles/JSONMap/geojson/Const/dist-${districtId}.json`,

      // Cached locally (downloaded by download-cache.ts)
      districtLookup: '/cache/2079/districtLookup.json',
      constituencyIdentifiers: '/cache/2079/constituencies.json',
      symbolIdentifiers: '/cache/2079/symbols.json',

      // Cached candidates results
      candidates: '/cache/2079/ElectionResultCentral2079.txt',

      // Fallback: fetch individual constituency results
      constituencyResults: (districtId: number, constituencyId: number) =>
        `https://result.election.gov.np/JSONFiles/Election2079/HOR/FPTP/HOR-${districtId}-${constituencyId}.json`,
    },
    source: {
      districtLookup:
        'https://result.election.gov.np/JSONFiles/Election2079/Local/Lookup/districts.json',
      symbolImages: 'https://result.election.gov.np/Images/symbol-hor-pa',
      candidates:
        'https://result.election.gov.np/JSONFiles/ElectionResultCentral2079.txt',
    },
  },

  '2074': {
    id: '2074',
    name: '2074 General Election',
    nameNp: '२०७४ आम निर्वाचन',
    year: 2074,
    isCurrent: false,
    missingData: true,
    endpoints: {
      provinces:
        'https://result.election.gov.np/JSONFiles/JSONMap/geojson/Province.json',
      districts: (provinceId: number) =>
        `https://result.election.gov.np/JSONFiles/JSONMap/geojson/District/STATE_C_${provinceId}.json`,
      constituencies: (districtId: number) =>
        `https://result.election.gov.np/JSONFiles/JSONMap/geojson/Const/dist-${districtId}.json`,
      districtLookup: '/cache/2074/districtLookup.json',
      constituencyIdentifiers: '/cache/2074/constituencies.json',
      symbolIdentifiers: '/cache/2074/symbols.json',
      candidates: '/cache/2074/ElectionResultCentral.txt',
      constituencyResults: (districtId: number, constituencyId: number) =>
        `https://result.election.gov.np/JSONFiles/Election2074/HOR/FPTP/HOR-${districtId}-${constituencyId}.json`,
    },
    source: {
      // Use 2079 lookup as 2074 specific lookup is not available
      districtLookup:
        'https://result.election.gov.np/JSONFiles/Election2079/Local/Lookup/districts.json',
      symbolImages: 'https://result.election.gov.np/Images/symbol-hor-pa',
      candidates:
        'https://result.election.gov.np/JSONFiles/ElectionResultCentral.txt',
    },
  },

  '2082': {
    id: '2082',
    name: '2082 General Election',
    nameNp: '२०८२ आम निर्वाचन',
    year: 2082,
    isCurrent: true,
    endpoints: {
      provinces:
        'https://result.election.gov.np/JSONFiles/JSONMap/geojson/Province.json',
      districts: (provinceId: number) =>
        `https://result.election.gov.np/JSONFiles/JSONMap/geojson/District/STATE_C_${provinceId}.json`,
      constituencies: (districtId: number) =>
        `https://result.election.gov.np/JSONFiles/JSONMap/geojson/Const/dist-${districtId}.json`,
      districtLookup: '/cache/2082/districtLookup.json',
      constituencyIdentifiers: '/cache/2082/constituencies.json',
      symbolIdentifiers: '/cache/2082/symbols.json',
      candidates: '/cache/2082/ElectionResultCentral2082.txt',
      constituencyResults: (districtId: number, constituencyId: number) =>
        `https://result.election.gov.np/JSONFiles/Election2082/HOR/FPTP/HOR-${districtId}-${constituencyId}.json`,
    },
    source: {
      districtLookup:
        'https://result.election.gov.np/JSONFiles/Election2082/Local/Lookup/districts.json',
      symbolImages: 'https://result.election.gov.np/Images/symbol-hor-pa',
      candidates:
        'https://result.election.gov.np/JSONFiles/ElectionResultCentral2082.txt',
    },
  },
};

/**
 * Runtime-mutable active election ID.
 * Starts at DEFAULT_ELECTION_ID and can be changed via setActiveElection().
 * All data-fetching functions call getCurrentElection(), so changing this
 * causes the next data load to use the new election automatically.
 */
let _activeElectionId: string = DEFAULT_ELECTION_ID;

/**
 * Get the currently active election configuration.
 * Uses the runtime-mutable active ID (set via setActiveElection),
 * falling back to DEFAULT_ELECTION_ID if not yet set.
 *
 * @returns The active ElectionConfig
 * @throws Error if the active election ID is not found in ELECTIONS
 */
export function getCurrentElection(): ElectionConfig {
  const current = ELECTIONS[_activeElectionId];
  if (!current) {
    throw new Error(
      `No election found for active ID "${_activeElectionId}". Check DEFAULT_ELECTION_ID and ELECTIONS config.`
    );
  }
  return current;
}

/**
 * Switch the active election at runtime.
 * Call this from the UI election switcher, then trigger a data reload.
 *
 * @param id - The election ID to activate (must exist in ELECTIONS)
 * @throws Error if the ID is not found
 */
export function setActiveElection(id: string): void {
  if (!ELECTIONS[id]) {
    throw new Error(
      `Cannot activate unknown election ID "${id}". Add it to ELECTIONS first.`
    );
  }
  _activeElectionId = id;
}

/**
 * Get the current active election ID.
 */
export function getActiveElectionId(): string {
  return _activeElectionId;
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
