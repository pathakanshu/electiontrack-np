/**
 * src/i18n/np.ts
 *
 * Nepali (नेपाली) UI string dictionary.
 *
 * Every user-visible string in the app should be defined here (and in en.ts).
 * Components access these via the `useTranslation()` hook which picks the
 * correct dictionary based on the active locale.
 *
 * Keys are grouped by the component / area they belong to.
 */

import type { UiStrings } from './en';

const np: UiStrings = {
  // -- Header / Navbar --
  nav_home: 'गृहपृष्ठ',
  nav_about: 'बारेमा',
  nav_docs: 'कागजात',
  nav_tos: 'सेवा शर्त',
  language_english: 'English',
  language_nepali: 'नेपाली',
  heading_title: 'निर्वाचन ट्र्याकर नेपाल',
  heading_now_tracking: 'अहिले ट्र्याक गर्दै:',
  heading_incomplete_data: '⚠ अपूर्ण तथ्याङ्क',
  heading_incomplete_data_tooltip:
    'यस निर्वाचनको केही तथ्याङ्क अपूर्ण हुन सक्छ',
  select_election_aria: 'हेर्नको लागि निर्वाचन छान्नुहोस्',

  // -- Footer --
  footer_disclaimer: 'यो खुला स्रोत परियोजना नेपाल सरकारसँग सम्बद्ध छैन',

  // -- Loading / Error states --
  loading_title: 'ट्र्याकर सुरु गर्दै...',
  loading_description:
    'निर्वाचन आयोगबाट टोपोलोजी र प्रत्यक्ष निर्वाचन नतिजा प्राप्त गर्दै।',
  error_title: 'निर्वाचन ट्र्याकर लोड गर्न असफल',

  // -- Sidebar: Watchlist --
  watchlist_title: 'तपाईंको वाचलिस्ट',
  search_placeholder: 'उम्मेदवार वा निर्वाचन क्षेत्र खोज्नुहोस्...',
  search_aria: 'उम्मेदवार वा निर्वाचन क्षेत्र खोज्नुहोस्',
  search_no_results: 'कुनै नतिजा भेटिएन',
  watchlist_hint: 'उम्मेदवार वा निर्वाचन क्षेत्र खोजेर यहाँ थप्नुहोस्।',
  watchlist_remove_aria: '{district} - {constituency} वाचलिस्टबाट हटाउनुहोस्',
  watchlist_leading: 'अगाडि: {party}',
  votes_label: 'मत',

  // -- Sidebar: Leaderboard --
  leaderboard_title: 'लिडरबोर्ड (शीर्ष ५)',
  leaderboard_counting: 'मत गणना जारी...',

  leaderboard_won: 'जित',
  leaderboard_lead: 'अग्रता',

  // -- Sidebar: Search entry types --
  search_type_candidate: 'उम्मेदवार',
  search_type_constituency: 'निर्वाचन क्षेत्र',

  // -- Sidebar: Data warning --
  data_warning_symbols: 'यस वर्षको चिन्ह चित्रहरू स्रोतबाट उपलब्ध छैनन्।',

  // -- Map: Tooltip --
  tooltip_conservation_area: 'संरक्षण क्षेत्र',
  tooltip_district_fallback: 'जिल्ला {id}',

  // -- Map: Color index --
  color_index_title: 'पार्टी रङ',
  color_index_show: 'रङ सूचकांक देखाउनुहोस्',
  color_index_hide: 'रङ सूचकांक लुकाउनुहोस्',
  color_index_empty: 'नक्सामा अहिलेसम्म कुनै पार्टी छैन',

  // -- Misc --
  district_fallback: 'जिल्ला {id}',

  // -- Statistics Page --
  stats_title: 'निर्वाचन तथ्याङ्क',
  stats_subtitle_constituencies: 'निर्वाचन क्षेत्र',
  stats_subtitle_candidates: 'उम्मेदवार',
  stats_subtitle_votes: 'खसेको मत',
  stats_loading_title: 'तथ्याङ्क गणना गर्दै…',
  stats_loading_description:
    'प्रत्येक निर्वाचन क्षेत्रबाट तथ्याङ्क गणना गर्दै। स्विङ विश्लेषणको लागि अघिल्लो निर्वाचनको तथ्याङ्क प्राप्त गर्दै।',
  stats_error_title: 'तथ्याङ्क गणना गर्न असफल',
  stats_error_unknown: 'अज्ञात त्रुटि भयो।',
  stats_error_hint:
    'पृष्ठ रिफ्रेस गर्नुहोस् वा अर्को निर्वाचनमा स्विच गर्नुहोस्।',

  // Stats nav
  stats_nav_all: 'सबै',
  stats_nav_core: 'मूल नतिजा',
  stats_nav_competitiveness: 'प्रतिस्पर्धा',
  stats_nav_structural: 'संरचनात्मक',
  stats_nav_demographics: 'जनसांख्यिकी',
  stats_nav_geographic: 'भौगोलिक',
  stats_nav_simulation: 'सिमुलेशन',

  // Stats cards
  stats_card_seats: 'सिट',
  stats_card_candidates_sub: '{count} उम्मेदवार',
  stats_card_votes_cast: 'खसेको मत',
  stats_card_avg_winner_share: 'औसत विजेता हिस्सा',
  stats_card_margin: 'अन्तर: {value}',
  stats_card_competitiveness: 'प्रतिस्पर्धा',
  stats_card_competitiveness_sub: '० = एकतर्फी, १०० = अति नजिक',
  stats_card_wasted_votes: 'बर्बाद मत',
  stats_card_wasted_votes_sub: 'हारेका उम्मेदवारलाई खसेको मत',
  stats_card_candidates_per_seat: 'उम्मेदवार / सिट',
  stats_card_majority_wins: 'बहुमत जित',
  stats_card_majority_wins_sub: '{count} ले ५०% भन्दा कम पाएर जिते',
  stats_card_fragmented: 'विखण्डित',
  stats_card_fragmented_sub: 'विजेताले ३५% भन्दा कम मत पाएको',

  // Core Results section
  stats_core_title: 'मूल नतिजा',
  stats_core_desc:
    'प्रत्येक निर्वाचन क्षेत्रको अन्तर, मत हिस्सा र सिट-स्तरीय विश्लेषण।',
  stats_majority_vs_plurality: 'बहुमत बनाम बहुलता जित',
  stats_majority_label: 'बहुमत (>५०%)',
  stats_plurality_label: 'बहुलता (<५०%)',
  stats_majority_wins_center: 'बहुमत जित',
  stats_cand_per_const: 'उम्मेदवार वितरण',
  stats_cand_per_const_center: 'फरक गणना',
  stats_seat_distribution: 'पार्टी अनुसार सिट वितरण',
  stats_total_seats: 'कुल सिट',
  stats_others: 'अन्य',
  stats_top3_title: 'निर्वाचन क्षेत्र अनुसार शीर्ष-३ मत केन्द्रीकरण',
  stats_top3_xlabel: 'शीर्ष-३ मत केन्द्रीकरण (%)',
  stats_narrowest_title: 'सबैभन्दा नजिकका १० सिट (न्यूनतम अन्तर)',
  stats_safest_title: 'सबैभन्दा सुरक्षित १० सिट (अधिकतम अन्तर)',
  stats_margin_xlabel: 'अन्तर (%)',

  // Competitiveness section
  stats_comp_title: 'प्रतिस्पर्धा र स्विङ',
  stats_comp_desc:
    'दौडहरू कत्ति कडा थिए, कुन सिटहरूले पार्टी बदले, र इन्कम्बेन्टहरू बाँचे कि बाँचेनन्। प्रतिस्पर्धा सूचकांक (CI) ले प्रत्येक सिटलाई ०-१०० स्कोर गर्छ।',
  stats_comp_chart_title:
    'सबैभन्दा प्रतिस्पर्धात्मक निर्वाचन क्षेत्र (प्रतिस्पर्धा सूचकांक ०–१००)',
  stats_comp_xlabel: 'प्रतिस्पर्धा सूचकांक',
  stats_comp_table_title: 'प्रतिस्पर्धा वितरण',
  stats_comp_table_desc: 'प्रतिस्पर्धा सूचकांक अनुसार सबै निर्वाचन क्षेत्र',
  stats_col_constituency: 'निर्वाचन क्षेत्र',
  stats_col_ci_score: 'CI स्कोर',
  stats_col_margin_pct: 'अन्तर %',
  stats_col_top3_conc: 'शीर्ष-३ केन्द्रीकरण',
  stats_col_winner: 'विजेता',
  stats_flipped_title: 'पार्टी परिवर्तन भएका सिट ({count})',
  stats_flipped_desc:
    'अघिल्लो निर्वाचनको तुलनामा फरक पार्टीले जितेका निर्वाचन क्षेत्र',
  stats_col_prev_winner: 'अघिल्लो विजेता',
  stats_col_curr_winner: 'हालको विजेता',
  stats_incumbent_survival: 'इन्कम्बेन्ट बाँच्ने दर',
  stats_survived: 'बाँचेको',
  stats_lost: 'हारेको',
  stats_survival_rate: 'बाँच्ने दर',
  stats_incumbent_change_title: 'इन्कम्बेन्ट मत हिस्सा परिवर्तन (pp)',
  stats_incumbent_change_xlabel: 'मत हिस्सा परिवर्तन (प्रतिशत बिन्दु)',
  stats_reelected: '✅ पुन: निर्वाचित',
  stats_defeated: '❌ पराजित',
  stats_strongholds_title: 'गढ सिट ({count})',
  stats_strongholds_desc:
    'लगातार निर्वाचनमा एउटै पार्टीले जितेका निर्वाचन क्षेत्र',
  stats_col_party: 'पार्टी',
  stats_col_consecutive_wins: 'लगातार जित',
  stats_bellwethers_title: 'बेलवेदर सिट ({count})',
  stats_bellwethers_desc:
    'राष्ट्रिय स्तरमा सबैभन्दा बढी सिट पाउने पार्टीलाई लगातार चुनेका निर्वाचन क्षेत्र',
  stats_col_national_match: 'राष्ट्रिय मिलान गणना',
  stats_no_cross_election: 'क्रस-निर्वाचन विश्लेषण उपलब्ध छैन।',
  stats_no_cross_election_desc:
    'स्विङ, फ्लिप सिट, र इन्कम्बेन्ट विश्लेषणको लागि अघिल्लो निर्वाचनको तथ्याङ्क चाहिन्छ। अहिले एउटा मात्र निर्वाचन लोड भएको छ।',

  // Structural section
  stats_structural_title: 'संरचनात्मक विश्लेषण',
  stats_structural_desc:
    'FPTP ले प्रतिनिधित्वलाई कसरी विकृत गर्छ। बर्बाद मत भनेको हारेका उम्मेदवारलाई खसेको मत हो। सिट-मत अन्तरले कुन पार्टीले आफ्नो मत हिस्सा भन्दा बढी वा कम सिट जित्यो भनी देखाउँछ।',
  stats_svgap_title: 'पार्टी अनुसार राष्ट्रिय सिट-मत अन्तर',
  stats_svgap_xlabel: 'सिट हिस्सा − मत हिस्सा (pp)',
  stats_over_represented: '⬆ अधि-प्रतिनिधित्व',
  stats_under_represented: '⬇ न्यून-प्रतिनिधित्व',
  stats_in_fptp: 'FPTP मा',
  stats_vote_efficiency_title: 'पार्टी अनुसार मत दक्षता',
  stats_vote_efficiency_desc:
    'प्रत्येक पार्टीलाई एक सिट जित्न कति मत चाहिन्छ? कम = FPTP मा बढी दक्ष।',
  stats_col_seats: 'सिट',
  stats_col_total_votes: 'कुल मत',
  stats_col_vote_pct: 'मत %',
  stats_col_seat_pct: 'सिट %',
  stats_col_votes_per_seat: 'मत/सिट',
  stats_col_wasted_votes: 'बर्बाद मत',
  stats_wasted_chart_title: 'बर्बाद मत % अनुसार शीर्ष १० निर्वाचन क्षेत्र',
  stats_wasted_xlabel: 'बर्बाद मत %',
  stats_geo_conc_title: 'पार्टी अनुसार भौगोलिक केन्द्रीकरण स्कोर (HHI)',
  stats_geo_conc_desc:
    'प्रदेश अनुसार पार्टीको मत वितरणको हर्फिन्डल-हर्शम्यान सूचकांक। उच्च = बढी भौगोलिक केन्द्रीकरण। अधिकतम: १०,००० (एक प्रदेशमा सबै मत)।',
  stats_col_hhi: 'HHI स्कोर',
  stats_col_votes: 'मत',
  stats_col_strongest_province: 'सबैभन्दा बलियो प्रदेश',
  stats_col_share_top_province: 'शीर्ष प्रदेशमा हिस्सा',
  stats_province_label: 'प्रदेश {id}',
  stats_fragmented_title: 'विखण्डित सिट — विजेता ३५% भन्दा कम ({count})',
  stats_fragmented_desc:
    'विजेता उम्मेदवारले कुल मतको ३५% भन्दा कम पाएका सिट, जसले अत्यन्त विखण्डित मतदाता संकेत गर्छ।',
  stats_col_winner_vote_pct: 'विजेता मत %',
  stats_col_candidates: 'उम्मेदवार',

  // Demographics section
  stats_demographics_title: 'जनसांख्यिकी',
  stats_demographics_desc: 'उम्मेदवार र विजेताहरूको लिङ्ग र शिक्षा विश्लेषण।',
  stats_gender_donut_title: 'लिङ्ग अनुसार उम्मेदवार',
  stats_gender_candidates: 'उम्मेदवार',
  stats_gender_winners_title: 'लिङ्ग अनुसार विजेता',
  stats_gender_winners_center: 'विजेता',
  stats_gender_avg_votes_title: 'लिङ्ग अनुसार औसत मत',
  stats_gender_avg_votes_xlabel: 'प्राप्त औसत मत',
  stats_gender_party_title: 'पार्टी अनुसार लिङ्ग विभाजन',
  stats_gender_party_desc:
    'पार्टी अनुसार महिला उम्मेदवार प्रतिनिधित्व (३+ उम्मेदवार भएका पार्टी)।',
  stats_col_male: 'पुरुष',
  stats_col_female: 'महिला',
  stats_col_other: 'अन्य',
  stats_col_total: 'कुल',
  stats_col_female_pct: 'महिला %',
  stats_education_donut_title: 'शिक्षा स्तर अनुसार उम्मेदवार',
  stats_education_winners_title: 'शिक्षा स्तर अनुसार विजेता',
  stats_education_avg_title: 'शिक्षा स्तर अनुसार औसत मत',
  stats_education_avg_xlabel: 'प्राप्त औसत मत',
  stats_col_education: 'शिक्षा स्तर',
  stats_col_count: 'गणना',
  stats_col_avg_votes: 'औसत मत',

  // Geographic section
  stats_geo_title: 'भौगोलिक र व्यवहारात्मक',
  stats_geo_desc:
    'प्रदेश र निर्वाचन क्षेत्र अनुसार मतदान ढाँचा। HHI (हर्फिन्डल-हर्शम्यान सूचकांक) ले पार्टीको समर्थन कत्ति भौगोलिक रूपमा केन्द्रित छ भनेर मापन गर्छ।',
  stats_province_perf_title: 'प्रदेश प्रदर्शन',
  stats_turnout_top_title: 'कुल खसेको मत अनुसार शीर्ष १० निर्वाचन क्षेत्र',
  stats_turnout_bottom_title: 'कुल खसेको मत अनुसार तल्लो १० निर्वाचन क्षेत्र',
  stats_turnout_xlabel: 'कुल खसेको मत',
  stats_turnout_change_title:
    'अघिल्लो निर्वाचनको तुलनामा मतदान परिवर्तन (शीर्ष १०)',
  stats_turnout_change_xlabel: 'मतदान परिवर्तन (%)',

  // Simulation section
  stats_sim_title: 'सिमुलेशन',
  stats_sim_desc:
    'के-यदि परिदृश्य। एकसमान स्विङले प्रत्येक सिटमा समान मत परिवर्तन लागू गर्छ। फ्लिप लागत भनेको निर्वाचन क्षेत्रमा विजेता बदल्न आवश्यक न्यूनतम अतिरिक्त मत हो।',
  stats_flip_cost_title: 'फ्लिप लागत क्याल्कुलेटर — सबैभन्दा सस्तो सिट',
  stats_flip_cost_desc:
    '"X मतले Y सिट फ्लिप गर्ने थियो।" प्रत्येक निर्वाचन क्षेत्रमा नतिजा बदल्न आवश्यक न्यूनतम मत देखाउँछ।',
  stats_col_runner_up: 'दोस्रो स्थान',
  stats_col_votes_to_flip: 'फ्लिप गर्न मत',
  stats_close_seat_title: 'नजिकको सिट संवेदनशीलता — अन्तर < ३% ({count} सिट)',
  stats_close_seat_desc:
    'मात्र ३ प्रतिशत बिन्दुको एकसमान स्विङमा फ्लिप हुने निर्वाचन क्षेत्र।',
  stats_flip_thresholds_title: 'फ्लिप लागत सीमा',
  stats_flip_threshold_label: '≤{votes} मतमा फ्लिप हुने सिट',

  // Stats footer
  stats_footer:
    'सबै तथ्याङ्क निर्वाचन आयोगको तथ्याङ्कबाट क्लाइन्ट-साइडमा गणना गरिएको। बर्बाद मत FPTP प्रणाली अन्तर्गत गणना गरिएको। स्विङ सिमुलेशनले एकसमान राष्ट्रिय परिवर्तन मान्छ — वास्तविक निर्वाचन क्षेत्र-स्तरीय प्रभाव फरक हुनेछ।',

  // Stats province performance table
  stats_col_province: 'प्रदेश',
  stats_col_total_seats: 'कुल सिट',
  stats_col_top_party: 'शीर्ष पार्टी',
  stats_col_top_party_seats: 'शीर्ष पार्टी सिट',
  stats_col_top_party_share: 'शीर्ष पार्टी %',

  // DataTable controls
  table_show_more: '{count} थप देखाउनुहोस्',
  table_show_all: 'सबै देखाउनुहोस् ({count})',
  table_collapse: 'संक्षिप्त गर्नुहोस्',
  table_showing: '{total} मध्ये {visible} देखाइँदै',
  table_no_data: 'अहिलेसम्म कुनै तथ्याङ्क उपलब्ध छैन।',
  stats_no_results_yet:
    'अहिलेसम्म कुनै नतिजा उपलब्ध छैन। मत गणना भएपछि तथ्याङ्क देखिनेछ।',
  legend_show_more: 'थप देखाउनुहोस्',
  legend_show_less: 'कम देखाउनुहोस्',

  // Navbar
  nav_map: '← नक्सा',
  nav_statistics: 'तथ्याङ्क →',

  // -- Provinces --
  province_1: 'कोशी प्रदेश',
  province_2: 'मधेश प्रदेश',
  province_3: 'बागमती प्रदेश',
  province_4: 'गण्डकी प्रदेश',
  province_5: 'लुम्बिनी प्रदेश',
  province_6: 'कर्णाली प्रदेश',
  province_7: 'सुदूरपश्चिम प्रदेश',

  // -- Districts --
  district_1: 'ताप्लेजुङ',
  district_2: 'पाँचथर',
  district_3: 'इलाम',
  district_4: 'झापा',
  district_5: 'मोरङ',
  district_6: 'सुनसरी',
  district_7: 'धनकुटा',
  district_8: 'तेह्रथुम',
  district_9: 'सङ्खुवासभा',
  district_10: 'भोजपुर',
  district_11: 'सोलुखुम्बु',
  district_12: 'ओखलढुङ्गा',
  district_13: 'खोटाङ',
  district_14: 'उदयपुर',
  district_15: 'सप्तरी',
  district_16: 'सिरहा',
  district_17: 'धनुषा',
  district_18: 'महोत्तरी',
  district_19: 'सर्लाही',
  district_20: 'सिन्धुली',
  district_21: 'रामेछाप',
  district_22: 'दोलखा',
  district_23: 'सिन्धुपाल्चोक',
  district_24: 'काभ्रेपलाञ्चोक',
  district_25: 'ललितपुर',
  district_26: 'भक्तपुर',
  district_27: 'काठमाडौँ',
  district_28: 'नुवाकोट',
  district_29: 'रसुवा',
  district_30: 'धादिङ',
  district_31: 'मकवानपुर',
  district_32: 'रौतहट',
  district_33: 'बारा',
  district_34: 'पर्सा',
  district_35: 'चितवन',
  district_36: 'गोरखा',
  district_37: 'लमजुङ',
  district_38: 'तनहुँ',
  district_39: 'स्याङ्जा',
  district_40: 'कास्की',
  district_41: 'मनाङ',
  district_42: 'मुस्ताङ',
  district_43: 'म्याग्दी',
  district_44: 'पर्वत',
  district_45: 'बागलुङ',
  district_46: 'गुल्मी',
  district_47: 'पाल्पा',
  district_48: 'नवलपरासी पूर्व',
  district_49: 'नवलपरासी पश्चिम',
  district_50: 'रुपन्देही',
  district_51: 'कपिलवस्तु',
  district_52: 'अर्घाखाँची',
  district_53: 'प्युठान',
  district_54: 'रोल्पा',
  district_55: 'पूर्वी रुकुम',
  district_56: 'पश्चिमी रुकुम',
  district_57: 'सल्यान',
  district_58: 'दाङ',
  district_59: 'बाँके',
  district_60: 'बर्दिया',
  district_61: 'सुर्खेत',
  district_62: 'दैलेख',
  district_63: 'जाजरकोट',
  district_64: 'डोल्पा',
  district_65: 'जुम्ला',
  district_66: 'कालीकोट',
  district_67: 'मुगु',
  district_68: 'हुम्ला',
  district_69: 'बाजुरा',
  district_70: 'बझाङ',
  district_71: 'अछाम',
  district_72: 'डोटी',
  district_73: 'कैलाली',
  district_74: 'कञ्चनपुर',
  district_75: 'डडेल्धुरा',
  district_76: 'बैतडी',
  district_77: 'दार्चुला',

  // -- Parties --
  // Party name translations have been moved to /cache/party_names_np-en.json
  // and are resolved at bundle time (same approach as candidate names).
  // See dataBundler.ts → getPartyNameTranslations().
} as const;

export default np;
