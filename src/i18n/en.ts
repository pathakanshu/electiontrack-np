/**
 * src/i18n/en.ts
 *
 * English UI string dictionary.
 *
 * Every user-visible string in the app should be defined here (and in np.ts).
 * Components access these via the `useTranslation()` hook which picks the
 * correct dictionary based on the active locale.
 *
 * Keys are grouped by the component / area they belong to.
 */

const en: Record<string, string> = {
  // -- Header / Navbar --
  nav_home: 'Home',
  nav_about: 'About',
  nav_docs: 'Docs',
  nav_tos: 'ToS',
  language_english: 'English',
  language_nepali: 'नेपाली',
  heading_title: 'Nepal Election Tracker',
  heading_now_tracking: 'Now Tracking:',
  heading_incomplete_data: '⚠ incomplete data',
  heading_incomplete_data_tooltip:
    'Some data may be incomplete for this election',
  select_election_aria: 'Select election to view',

  // -- Footer --
  footer_disclaimer:
    'This open source project is not affiliated with the Government of Nepal',

  // -- Loading / Error states --
  loading_title: 'Initialising Tracker...',
  loading_description:
    'Fetching topology and live election results from the Election Commission.',
  error_title: 'Failed to load election tracker',

  // -- Sidebar: Watchlist --
  watchlist_title: 'Your Watchlist',
  search_placeholder: 'Search candidates or constituencies...',
  search_aria: 'Search candidates or constituencies',
  search_no_results: 'No results found',
  watchlist_hint: 'Search for a candidate or constituency to add it here.',
  watchlist_remove_aria: 'Remove {district} - {constituency} from watchlist',
  watchlist_leading: 'Leading: {party}',
  votes_label: 'votes',

  // -- Sidebar: Leaderboard --
  leaderboard_title: 'Leaderboard (Top 5)',
  leaderboard_counting: 'Counting in progress...',
  leaderboard_won: 'Won',
  leaderboard_lead: 'Leading',

  // -- Sidebar: Search entry types --
  search_type_candidate: 'candidate',
  search_type_constituency: 'Constituency',

  // -- Sidebar: Data warning --
  data_warning_symbols:
    'Symbol images for this year are unavailable from the source.',

  // -- Map: Tooltip --
  tooltip_conservation_area: 'Conservation Area',
  tooltip_district_fallback: 'District {id}',

  // -- Map: Color index --
  color_index_title: 'Party Colors',
  color_index_show: 'Show color index',
  color_index_hide: 'Hide color index',
  color_index_empty: 'No parties on the map yet',

  // -- Misc --
  district_fallback: 'District {id}',

  // -- Statistics Page --
  stats_title: 'Election Statistics',
  stats_subtitle_prefix: 'Data found for:',
  stats_subtitle_constituencies: 'constituencies',
  stats_subtitle_candidates: 'candidates',
  stats_subtitle_votes: 'votes cast',
  stats_loading_title: 'Computing Statistics…',
  stats_loading_description:
    'Crunching the numbers from every constituency. Fetching comparison data from the previous election for swing analysis.',
  stats_error_title: 'Failed to compute statistics',
  stats_error_unknown: 'Unknown error occurred.',
  stats_error_hint:
    'Try refreshing the page or switching to a different election.',

  // Stats nav
  stats_nav_all: 'All',
  stats_nav_core: 'Core Results',
  stats_nav_competitiveness: 'Competitiveness',
  stats_nav_structural: 'Structural',
  stats_nav_demographics: 'Demographics',
  stats_nav_geographic: 'Geographic',
  stats_nav_simulation: 'Simulation',

  // Stats cards
  stats_card_seats: 'Total Seats Contested',
  stats_card_candidates_sub: '{count} candidates across all constituencies',
  stats_card_votes_cast: 'Total Votes Cast',
  stats_card_avg_winner_share: 'Avg. Winner Vote Share',
  stats_card_margin: 'Avg. victory margin: {value}',
  stats_card_competitiveness: 'Competitiveness Index',
  stats_card_competitiveness_sub:
    'Avg. score — 0 is a landslide, 100 is a dead heat',
  stats_card_wasted_votes: 'Wasted Vote Rate',
  stats_card_wasted_votes_sub:
    'Share of ballots that went to non-winning candidates',
  stats_card_candidates_per_seat: 'Avg. Candidates per Seat',
  stats_card_majority_wins: 'Majority Wins (>50%)',
  stats_card_majority_wins_sub: '{count} seats won without a majority',
  stats_card_fragmented: 'Fragmented Seats',
  stats_card_fragmented_sub: 'Seats where the winner got under 35% of the vote',

  // Core Results section
  stats_core_title: 'Core Results',
  stats_core_desc:
    'Margins, vote shares, and seat-level breakdowns for every constituency.',
  stats_majority_vs_plurality: 'Majority vs Plurality Wins',
  stats_majority_label: 'Majority (>50%)',
  stats_plurality_label: 'Plurality (<50%)',
  stats_majority_wins_center: 'majority wins',
  stats_cand_per_const: 'Cand. Distribution',
  stats_cand_per_const_center: 'distinct counts',
  stats_seat_distribution: 'Seat Distribution by Party',
  stats_total_seats: 'total seats',
  stats_others: 'Others',
  stats_top3_title: 'Top-3 Vote Concentration by Constituency',
  stats_top3_xlabel: 'Top-3 Vote Concentration (%)',
  stats_narrowest_title: 'Narrowest 10 Seats (closest margins)',
  stats_safest_title: 'Safest 10 Seats (biggest margins)',
  stats_margin_xlabel: 'Margin (%)',

  // Competitiveness section
  stats_comp_title: 'Competitiveness & Swing',
  stats_comp_desc:
    'How tight the races were, which seats changed hands, and whether incumbents survived. The Competitiveness Index (CI) scores each seat 0–100 based on margin and vote concentration — higher means closer.',
  stats_comp_chart_title:
    'Most Competitive Constituencies (Competitiveness Index 0–100)',
  stats_comp_xlabel: 'Competitiveness Index',
  stats_comp_table_title: 'Competitiveness Distribution',
  stats_comp_table_desc: 'All constituencies ranked by competitiveness index',
  stats_col_constituency: 'Constituency',
  stats_col_ci_score: 'CI Score',
  stats_col_margin_pct: 'Margin %',
  stats_col_top3_conc: 'Top-3 Conc.',
  stats_col_winner: 'Winner',
  stats_flipped_title: 'Seats That Changed Party Control ({count})',
  stats_flipped_desc:
    'Constituencies where a different party won compared to the previous election',
  stats_col_prev_winner: 'Previous Winner',
  stats_col_curr_winner: 'Current Winner',
  stats_incumbent_survival: 'Incumbent Survival Rate',
  stats_survived: 'Survived',
  stats_lost: 'Lost',
  stats_survival_rate: 'survival rate',
  stats_incumbent_change_title: 'Incumbent Vote Share Change (pp)',
  stats_incumbent_change_xlabel: 'Vote Share Change (percentage points)',
  stats_reelected: '✅ Re-elected',
  stats_defeated: '❌ Defeated',
  stats_strongholds_title: 'Stronghold Seats ({count})',
  stats_strongholds_desc:
    'Constituencies where the same party has won in consecutive elections',
  stats_col_party: 'Party',
  stats_col_consecutive_wins: 'Consecutive Wins',
  stats_bellwethers_title: 'Bellwether Seats ({count})',
  stats_bellwethers_desc:
    'Constituencies that consistently elected the party with the most seats nationally',
  stats_col_national_match: 'National Match Count',
  stats_no_cross_election: 'Cross-election analysis unavailable.',
  stats_no_cross_election_desc:
    'Swing, flipped seats, and incumbent survival require data from a previous election. Only one election is currently loaded.',

  // Structural section
  stats_structural_title: 'Structural Analysis',
  stats_structural_desc:
    'How First-Past-The-Post (FPTP) distorts representation. Wasted votes are ballots cast for losing candidates. The Seat–Vote Gap shows which parties won more (or fewer) seats than their vote share would suggest.',
  stats_svgap_title: 'National Seat–Vote Gap by Party',
  stats_svgap_xlabel: 'Seat Share − Vote Share (pp)',
  stats_over_represented: '⬆ Over-represented',
  stats_under_represented: '⬇ Under-represented',
  stats_in_fptp: 'in FPTP',
  stats_vote_efficiency_title: 'Vote Efficiency by Party',
  stats_vote_efficiency_desc:
    'How many total votes does each party need per seat won? Lower = more efficient under FPTP.',
  stats_col_seats: 'Seats',
  stats_col_total_votes: 'Total Votes',
  stats_col_vote_pct: 'Vote %',
  stats_col_seat_pct: 'Seat %',
  stats_col_votes_per_seat: 'Votes/Seat',
  stats_col_wasted_votes: 'Wasted Votes',
  stats_wasted_chart_title: 'Top 10 Constituencies by Wasted Vote %',
  stats_wasted_xlabel: 'Wasted Vote %',
  stats_geo_conc_title: 'Geographic Concentration Score (HHI) by Party',
  stats_geo_conc_desc:
    "Herfindahl-Hirschman Index of a party's vote distribution across provinces. Higher = more geographically concentrated. Max: 10,000 (all votes in one province).",
  stats_col_hhi: 'HHI Score',
  stats_col_votes: 'Votes',
  stats_col_strongest_province: 'Strongest Province',
  stats_col_share_top_province: 'Share in Top Province',
  stats_province_label: 'Province {id}',
  stats_fragmented_title: 'Fragmented Seats — Winner Under 35% ({count})',
  stats_fragmented_desc:
    'Seats where the winning candidate received less than 35% of the total vote, indicating a highly fragmented electorate.',
  stats_col_winner_vote_pct: 'Winner Vote %',
  stats_col_candidates: 'Candidates',

  // Demographics section
  stats_demographics_title: 'Demographics',
  stats_demographics_desc:
    'Gender and education breakdowns of candidates and winners.',
  stats_gender_donut_title: 'Candidates by Gender',
  stats_gender_candidates: 'candidates',
  stats_gender_winners_title: 'Winners by Gender',
  stats_gender_winners_center: 'winners',
  stats_gender_avg_votes_title: 'Average Votes by Gender',
  stats_gender_avg_votes_xlabel: 'Average Votes Received',
  stats_gender_party_title: 'Party-wise Gender Breakdown',
  stats_gender_party_desc:
    'Female candidate representation by party (parties with 3+ candidates).',
  stats_col_male: 'Male',
  stats_col_female: 'Female',
  stats_col_other: 'Other',
  stats_col_total: 'Total',
  stats_col_female_pct: 'Female %',
  stats_education_donut_title: 'Candidates by Education Level',
  stats_education_winners_title: 'Winners by Education Level',
  stats_education_avg_title: 'Average Votes by Education Level',
  stats_education_avg_xlabel: 'Average Votes Received',
  stats_col_education: 'Education Level',
  stats_col_count: 'Count',
  stats_col_avg_votes: 'Avg Votes',

  // Geographic section
  stats_geo_title: 'Geographic & Behavioral',
  stats_geo_desc:
    "Turnout patterns across provinces and constituencies. HHI (Herfindahl–Hirschman Index) measures how geographically concentrated a party's support is — higher means more regional, lower means more nationally spread.",
  stats_province_perf_title: 'Province Performance',
  stats_turnout_top_title: 'Top 10 Constituencies by Total Votes Cast',
  stats_turnout_bottom_title: 'Bottom 10 Constituencies by Total Votes Cast',
  stats_turnout_xlabel: 'Total Votes Cast',
  stats_turnout_change_title:
    'Turnout Change vs Previous Election (Top 10 by magnitude)',
  stats_turnout_change_xlabel: 'Turnout Change (%)',

  // Simulation section
  stats_sim_title: 'Simulation',
  stats_sim_desc:
    'What-if scenarios. Uniform swing applies the same vote shift to every seat. Flip cost is the minimum number of extra votes needed to change the winner in a constituency.',
  stats_flip_cost_title: 'Flip Cost Calculator — Cheapest Seats to Flip',
  stats_flip_cost_desc:
    '"X votes would have flipped Y seats." Shows the minimum votes needed to change the outcome in each constituency.',
  stats_col_runner_up: 'Runner-Up',
  stats_col_votes_to_flip: 'Votes to Flip',
  stats_close_seat_title:
    'Close Seat Sensitivity — Margin < 3% ({count} seats)',
  stats_close_seat_desc:
    'Constituencies that would flip under a small uniform swing of just 3 percentage points.',
  stats_flip_thresholds_title: 'Flip Cost Thresholds',
  stats_flip_threshold_label: 'seats flippable with ≤{votes} votes',

  // Stats footer
  stats_footer:
    'All statistics computed client-side from Election Commission data. Wasted votes calculated under the FPTP system. Swing simulations assume a uniform national shift — actual constituency-level effects will vary.',

  // Stats province performance table
  stats_col_province: 'Province',
  stats_col_total_seats: 'Total Seats',
  stats_col_top_party: 'Top Party',
  stats_col_top_party_seats: 'Top Party Seats',
  stats_col_top_party_share: 'Top Party %',

  // DataTable controls
  table_show_more: 'Show {count} more',
  table_show_all: 'Show all ({count})',
  table_collapse: 'Collapse',
  table_showing: 'Showing {visible} of {total}',
  table_no_data: 'No data available yet.',
  stats_no_results_yet:
    'No results available yet. Data will appear once votes are counted.',
  legend_show_more: 'Show more',
  legend_show_less: 'Show less',

  // Navbar
  nav_map: '← Map',
  nav_statistics: 'Statistics →',

  // Voting mode toggle (FPTP ↔ PR)
  mode_fptp: 'FPTP',
  mode_fptp_long: 'First Past The Post',
  mode_pr: 'PR',
  mode_pr_long: 'Proportional Representation',
  mode_toggle_aria: 'Switch between FPTP and PR results',

  // PR Leaderboard
  leaderboard_pr_title: 'PR Votes (Top 5)',
  leaderboard_pr_votes: 'Votes',
  leaderboard_pr_no_data: 'No PR data available for this election.',

  // -- Provinces --
  province_1: 'Koshi Province',
  province_2: 'Madhesh Province',
  province_3: 'Bagmati Province',
  province_4: 'Gandaki Province',
  province_5: 'Lumbini Province',
  province_6: 'Karnali Province',
  province_7: 'Sudurpashchim Province',

  // -- Districts --
  district_1: 'Taplejung',
  district_2: 'Panchthar',
  district_3: 'Ilam',
  district_4: 'Jhapa',
  district_5: 'Morang',
  district_6: 'Sunsari',
  district_7: 'Dhankuta',
  district_8: 'Terhathum',
  district_9: 'Sankhuwasabha',
  district_10: 'Bhojpur',
  district_11: 'Solukhumbu',
  district_12: 'Okhaldhunga',
  district_13: 'Khotang',
  district_14: 'Udayapur',
  district_15: 'Saptari',
  district_16: 'Siraha',
  district_17: 'Dhanusha',
  district_18: 'Mahottari',
  district_19: 'Sarlahi',
  district_20: 'Sindhuli',
  district_21: 'Ramechhap',
  district_22: 'Dolakha',
  district_23: 'Sindhupalchok',
  district_24: 'Kavrepalanchok',
  district_25: 'Lalitpur',
  district_26: 'Bhaktapur',
  district_27: 'Kathmandu',
  district_28: 'Nuwakot',
  district_29: 'Rasuwa',
  district_30: 'Dhading',
  district_31: 'Makwanpur',
  district_32: 'Rautahat',
  district_33: 'Bara',
  district_34: 'Parsa',
  district_35: 'Chitwan',
  district_36: 'Gorkha',
  district_37: 'Lamjung',
  district_38: 'Tanahu',
  district_39: 'Syangja',
  district_40: 'Kaski',
  district_41: 'Manang',
  district_42: 'Mustang',
  district_43: 'Myagdi',
  district_44: 'Parbat',
  district_45: 'Baglung',
  district_46: 'Gulmi',
  district_47: 'Palpa',
  district_48: 'Nawalparasi East',
  district_49: 'Nawalparasi West',
  district_50: 'Rupandehi',
  district_51: 'Kapilvastu',
  district_52: 'Arghakhanchi',
  district_53: 'Pyuthan',
  district_54: 'Rolpa',
  district_55: 'Rukum East',
  district_56: 'Rukum West',
  district_57: 'Salyan',
  district_58: 'Dang',
  district_59: 'Banke',
  district_60: 'Bardiya',
  district_61: 'Surkhet',
  district_62: 'Dailekh',
  district_63: 'Jajarkot',
  district_64: 'Dolpa',
  district_65: 'Jumla',
  district_66: 'Kalikot',
  district_67: 'Mugu',
  district_68: 'Humla',
  district_69: 'Bajura',
  district_70: 'Bajhang',
  district_71: 'Achham',
  district_72: 'Doti',
  district_73: 'Kailali',
  district_74: 'Kanchanpur',
  district_75: 'Dadeldhura',
  district_76: 'Baitadi',
  district_77: 'Darchula',

  // -- Parties --
  // Party name translations have been moved to /cache/party_names_np-en.json
  // and are resolved at bundle time (same approach as candidate names).
  // See dataBundler.ts → getPartyNameTranslations().
};

export type UiStringKey = keyof typeof en;
export type UiStrings = Record<UiStringKey, string>;
export default en;
