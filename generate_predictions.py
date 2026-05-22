
import json

input_data = {
  "promptVersion": "score-prediction-v2",
  "runId": "8d853a54-b503-47fa-b0a6-9e7256663b2d",
  "createdAt": "2026-05-22T16:29:27.453Z",
  "webMode": "live",
  "requiredMarkets": [
    "h2h",
    "double_chance",
    "goals_over_under",
    "corners_over_under",
    "btts"
  ],
  "marketFocus": [
    "h2h",
    "double_chance",
    "goals_over_under",
    "corners_over_under",
    "btts"
  ],
  "fixture": {
    "id": "62d993c3-00ba-43fd-a8a3-a5ce940cf4f8",
    "providerFixtureId": "1492904",
    "competitionId": "8d29ee2d-03f5-40be-a942-625181f2a7e1",
    "season": 2026,
    "homeTeamId": "cb2824fc-78bb-4693-baa2-5f41c58da34b",
    "awayTeamId": "8a78a6ee-a913-4181-940a-5ce12ccc185d",
    "scheduledAt": "2026-05-22T18:45:00.000Z",
    "status": "scheduled",
    "scoreHome": None,
    "scoreAway": None,
    "includedByFilters": [],
    "metadata": {
      "league": {
        "id": 358,
        "name": "First Division",
        "country": "Ireland",
        "season": 2026,
        "round": "Regular Season - 17"
      },
      "teams": {
        "home": {
          "id": 3855,
          "name": "Wexford"
        },
        "away": {
          "id": 3844,
          "name": "UCD"
        }
      },
      "venue": "Ferrycarrig Park",
      "round": "Regular Season - 17",
      "timezone": "UTC",
      "apiFootballStatusShort": "NS",
      "apiFootballStatusLong": "Not Started"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1492904",
    "capturedAt": "2026-05-22T16:29:39.870Z",
    "providerSnapshotId": "50e392b4-3330-464d-8f60-b0d7c8d317c5"
  },
  "oddsSnapshot": {
    "id": "e209f3bf-5895-45b8-9107-83b3eaa95432",
    "fixtureId": "62d993c3-00ba-43fd-a8a3-a5ce940cf4f8",
    "providerFixtureId": "1492904",
    "providerSnapshotId": "22a46f1b-eda9-49e8-b4a2-d7f0d2599a58",
    "bookmakerCount": 2,
    "capturedAt": "2026-05-22T16:09:59.727Z",
    "payloadHash": "cfa89216b5f368908dca7ff4fcc22ab05798e9a4d94119702ac4c604ad998f32"
  },
  "researchBundle": {
    "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb",
    "runId": "8d853a54-b503-47fa-b0a6-9e7256663b2d",
    "status": "promotable",
    "gateResult": {
      "reasons": [
        "Structured research generated with sufficient evidence.",
        "Web-search evidence included for team information and head-to-head statistics.",
        "All required markets (h2h, double_chance, goals_over_under, corners_over_under, btts) are covered with claims and evidence.",
        "objective research gate passed with current web evidence"
      ],
      "verdict": "promotable",
      "warnings": []
    },
    "providerAgentic": "gemini",
    "model": "gemini-2.5-flash",
    "promptVersion": "research-fixture-v2",
    "warnings": [],
    "metadata": {
      "marketScope": [
        "h2h",
        "double_chance",
        "goals_over_under",
        "corners_over_under",
        "btts"
      ],
      "marketCoverage": {
        "warnings": [],
        "quotedMarkets": [
          "btts",
          "corners_over_under",
          "double_chance",
          "goals_over_under",
          "h2h"
        ],
        "skippedMarkets": [],
        "evidenceMarkets": [
          "btts",
          "corners_over_under",
          "double_chance",
          "goals_over_under",
          "h2h"
        ],
        "requiredMarkets": [
          "h2h",
          "double_chance",
          "goals_over_under",
          "corners_over_under",
          "btts"
        ]
      },
      "webSearchCoverage": {
        "mode": "live",
        "provider": "gemini",
        "required": True,
        "nativeToolUsed": True,
        "nativeSupported": True,
        "browserFallbackUsed": False,
        "realWebSearchSourceCount": 8,
        "syntheticWebSearchSourceCount": 0
      },
      "providerContextWarnings": []
    }
  },
  "sources": [
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": None,
      "title": "API-Football odds snapshot",
      "externalId": "1492904",
      "providerSnapshotId": None,
      "capturedAt": "2026-05-22T16:09:59.727Z",
      "metadata": {
        "fixtureId": "62d993c3-00ba-43fd-a8a3-a5ce940cf4f8",
        "quoteCount": 56,
        "snapshotId": "22a46f1b-eda9-49e8-b4a2-d7f0d2599a58",
        "bookmakerCount": 2,
        "oddsSnapshotId": "e209f3bf-5895-45b8-9107-83b3eaa95432",
        "providerFixtureId": "1492904"
      }
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:provider_odds_snapshot",
      "type": "provider-snapshot",
      "url": None,
      "title": "Provider Odds Snapshot",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-05-22T16:09:59.727Z",
      "metadata": {
        "artifactPath": "N/A",
        "oddsSnapshotId": "e209f3bf-5895-45b8-9107-83b3eaa95432"
      }
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": None,
      "title": "API-Football fixture statistics",
      "externalId": "1492904",
      "providerSnapshotId": None,
      "capturedAt": "2026-05-22T16:09:58.829Z",
      "metadata": {
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "daf62d22-59f9-4d11-9605-95d70bedbefe",
        "providerFixtureId": "1492904"
      }
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:provider_api_football_stats",
      "type": "api-football",
      "url": None,
      "title": "API-Football Fixture Statistics",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-05-22T16:09:58.829Z",
      "metadata": {
        "artifactPath": "N/A",
        "providerFixtureId": "1492904"
      }
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_wexford_info_2",
      "type": "web-search",
      "url": "https://en.wikipedia.org/wiki/Wexford_F.C.",
      "title": "Wexford F.C. - Wikipedia",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-05-22T16:09:55.709Z",
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_wexford_info_1",
      "type": "web-search",
      "url": "https://aiscore.com/team/wexford-fc-6292",
      "title": "Wexford FC - AiScore",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-05-22T16:09:55.709Z",
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_ucd_info_2",
      "type": "web-search",
      "url": "https://www.footystats.org/clubs/university-college-dublin-afc-564",
      "title": "UCD AFC - FootyStats",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-05-22T16:09:55.709Z",
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_ucd_info_1",
      "type": "web-search",
      "url": "https://en.wikipedia.org/wiki/University_College_Dublin_A.F.C.",
      "title": "University College Dublin A.F.C. - Wikipedia",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-05-22T16:09:55.709Z",
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_h2h_4",
      "type": "web-search",
      "url": "https://www.fctables.com/h2h/ucd/wexford/",
      "title": "UCD vs Wexford H2H Stats - FCTables",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-05-22T16:09:55.709Z",
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_h2h_3",
      "type": "web-search",
      "url": "https://www.aiscore.com/match/wexford-fc-vs-ucd-afc-z92h23d11b3d0c2e3",
      "title": "Wexford FC vs UCD AFC H2H - AiScore",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-05-22T16:09:55.709Z",
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_h2h_2",
      "type": "web-search",
      "url": "https://www.footystats.org/ireland/ucd-afc-vs-wexford-fc-h2h-stats",
      "title": "UCD AFC vs Wexford FC H2H Stats - FootyStats",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-05-22T16:09:55.709Z",
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_h2h_1",
      "type": "web-search",
      "url": "https://www.whoscored.com/Matches/1492904/Live",
      "title": "Wexford vs UCD - WhoScored.com",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-05-22T16:09:55.709Z",
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:source_api_football_fixture",
      "type": "api-football",
      "url": None,
      "title": "API-Football fixture",
      "externalId": "1492904",
      "providerSnapshotId": None,
      "capturedAt": "2026-05-22T16:09:55.709Z",
      "metadata": {
        "fixtureId": "62d993c3-00ba-43fd-a8a3-a5ce940cf4f8",
        "providerFixtureId": "1492904"
      }
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:provider_api_football_fixture",
      "type": "api-football",
      "url": None,
      "title": "API-Football Fixture Data",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-05-22T16:09:55.709Z",
      "metadata": {
        "artifactPath": "N/A",
        "providerFixtureId": "1492904"
      }
    }
  ],
  "evidenceItems": [
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_wexford_league_pos_1",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_wexford_info_1",
      "summary": "Wexford FC is currently in the middle of the First Division table (4th-7th) as of May 2026, competing for promotion play-offs.",
      "confidence": 0.8,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_wexford_standing"
      ],
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_ucd_league_pos_1",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_ucd_info_2",
      "summary": "UCD currently holds the 2nd position in the First Division standings.",
      "confidence": 0.9,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_ucd_standing"
      ],
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_h2h_overall_1",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_h2h_2",
      "summary": "In 31 head-to-head meetings, UCD has won 18 times, Wexford 8, and there have been 5 draws.",
      "confidence": 0.9,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_overall"
      ],
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_h2h_recent_1",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_h2h_2",
      "summary": "UCD has won 4 out of the last 5 First Division encounters against Wexford, and also won their last cup meeting.",
      "confidence": 0.85,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_recent_ucd_dominance",
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_recent_no_wexford_win_in_5"
      ],
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_h2h_recent_draw_1",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_h2h_1",
      "summary": "The most recent encounter on April 6, 2026, ended in a 0-0 draw.",
      "confidence": 0.9,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_recent_draw"
      ],
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_h2h_recent_wexford_win_1",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_h2h_2",
      "summary": "Wexford's last win against UCD was on September 27, 2024, with a 2-0 score.",
      "confidence": 0.9,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_recent_wexford_win"
      ],
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_goals_average_1",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_h2h_4",
      "summary": "Head-to-head matches average 2.76 goals. Over 1.5 goals occurred in ~69% of matches, and over 2.5 goals in ~50%.",
      "confidence": 0.9,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_goals_average",
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_over_1_5_goals",
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_over_2_5_goals"
      ],
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_btts_1",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:web_h2h_2",
      "summary": "Both teams have scored in 38% of historical head-to-head encounters.",
      "confidence": 0.9,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_btts"
      ],
      "metadata": {}
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_h2h_bet365",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:provider_odds_snapshot",
      "summary": "Bet365 odds for H2H: Wexford win (2.4), Draw (3.3), UCD win (2.5).",
      "confidence": 0.95,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_odds_home",
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_odds_draw",
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_odds_away"
      ],
      "metadata": {
        "market": "h2h",
        "bookmaker": "Bet365"
      }
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_h2h_pinnacle",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:provider_odds_snapshot",
      "summary": "Pinnacle odds for H2H: Wexford win (2.57), Draw (3.47), UCD win (2.69).",
      "confidence": 0.95,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_odds_home",
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_odds_draw",
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_odds_away"
      ],
      "metadata": {
        "market": "h2h",
        "bookmaker": "Pinnacle"
      }
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_double_chance_bet365",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:provider_odds_snapshot",
      "summary": "Bet365 odds for Double Chance: Home or Draw (1.44), Home or Away (1.25), Draw or Away (1.44).",
      "confidence": 0.95,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_double_chance_home_draw",
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_double_chance_home_away",
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_double_chance_draw_away"
      ],
      "metadata": {
        "market": "double_chance",
        "bookmaker": "Bet365"
      }
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_goals_over_2_5_bet365",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:provider_odds_snapshot",
      "summary": "Bet365 odds for Over 2.5 goals (1.8) and Under 2.5 goals (2.0).",
      "confidence": 0.95,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_goals_over_2_5_odds"
      ],
      "metadata": {
        "line": 2.5,
        "market": "goals_over_under",
        "bookmaker": "Bet365"
      }
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_goals_over_2_5_pinnacle",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:provider_odds_snapshot",
      "summary": "Pinnacle odds for Over 2.5 goals (1.81) and Under 2.5 goals (2.03).",
      "confidence": 0.95,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_goals_over_2_5_odds"
      ],
      "metadata": {
        "line": 2.5,
        "market": "goals_over_under",
        "bookmaker": "Pinnacle"
      }
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_btts_bet365",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:provider_odds_snapshot",
      "summary": "Bet365 odds for BTTS Yes (1.67) and BTTS No (2.1).",
      "confidence": 0.95,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_btts_yes_odds",
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_btts_no_odds"
      ],
      "metadata": {
        "market": "btts",
        "bookmaker": "Bet365"
      }
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_corners_over_8_5_bet365",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:provider_odds_snapshot",
      "summary": "Bet365 odds for Over 8.5 corners (2.0) and Under 8.5 corners (1.8).",
      "confidence": 0.95,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_corners_over_8_5_odds"
      ],
      "metadata": {
        "line": 8.5,
        "market": "corners_over_under",
        "bookmaker": "Bet365"
      }
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_fixture_details",
      "sourceId": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:provider_api_football_fixture",
      "summary": "Match details: Wexford vs UCD, scheduled for 2026-05-22 at 18:45 UTC.",
      "confidence": 1,
      "claimIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_fixture_details"
      ],
      "metadata": {}
    }
  ],
  "claims": [
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_fixture_details",
      "statement": "The match is between Wexford and UCD, scheduled for May 22, 2026, at 18:45 UTC.",
      "marketKey": None,
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_fixture_details"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_wexford_standing",
      "statement": "Wexford FC is currently in the middle of the First Division table (4th-7th), contending for promotion play-off spots.",
      "marketKey": None,
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_wexford_league_pos_1"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_ucd_standing",
      "statement": "UCD currently holds the 2nd position in the First Division standings.",
      "marketKey": None,
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_ucd_league_pos_1"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_overall",
      "statement": "Historically, UCD has a dominant head-to-head record against Wexford, with 18 wins compared to Wexford's 8 in 31 meetings.",
      "marketKey": "h2h",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_h2h_overall_1"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_recent_ucd_dominance",
      "statement": "UCD has won 4 out of the last 5 First Division encounters against Wexford.",
      "marketKey": "h2h",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_h2h_recent_1"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_recent_no_wexford_win_in_5",
      "statement": "Wexford has not beaten UCD in their last 5 First Division matches.",
      "marketKey": "h2h",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_h2h_recent_1"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_recent_draw",
      "statement": "The most recent match between Wexford and UCD on April 6, 2026, ended in a 0-0 draw.",
      "marketKey": "h2h",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_h2h_recent_draw_1"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_recent_wexford_win",
      "statement": "Wexford's last victory against UCD was a 2-0 win on September 27, 2024.",
      "marketKey": "h2h",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_h2h_recent_wexford_win_1"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_odds_home",
      "statement": "The odds for a Wexford win are around 2.40 - 2.57.",
      "marketKey": "h2h",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_h2h_bet365",
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_h2h_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_odds_draw",
      "statement": "The odds for a draw are around 3.30 - 3.47.",
      "marketKey": "h2h",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_h2h_bet365",
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_h2h_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_h2h_odds_away",
      "statement": "The odds for a UCD win are around 2.50 - 2.69.",
      "marketKey": "h2h",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_h2h_bet365",
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_h2h_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_double_chance_home_draw",
      "statement": "The odds for Wexford to win or draw (Home or Draw) are 1.44.",
      "marketKey": "double_chance",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_double_chance_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_double_chance_home_away",
      "statement": "The odds for either Wexford or UCD to win (Home or Away) are 1.25.",
      "marketKey": "double_chance",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_double_chance_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_double_chance_draw_away",
      "statement": "The odds for a draw or UCD to win (Draw or Away) are 1.44.",
      "marketKey": "double_chance",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_double_chance_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_goals_average",
      "statement": "Head-to-head matches between Wexford and UCD average approximately 2.76 goals per game.",
      "marketKey": None,
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_goals_average_1"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_over_1_5_goals",
      "statement": "Over 1.5 goals has occurred in approximately 69% of head-to-head matches.",
      "marketKey": "goals_over_under",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_goals_average_1"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_over_2_5_goals",
      "statement": "Over 2.5 goals has occurred in approximately 50% of head-to-head matches.",
      "marketKey": "goals_over_under",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_goals_average_1"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_goals_over_2_5_odds",
      "statement": "The odds for Over 2.5 goals are around 1.80 - 1.81, and Under 2.5 goals are around 2.00 - 2.03.",
      "marketKey": "goals_over_under",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_goals_over_2_5_bet365",
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_goals_over_2_5_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_btts",
      "statement": "Both teams have scored in 38% of their historical head-to-head encounters.",
      "marketKey": "btts",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_btts_1"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_btts_yes_odds",
      "statement": "The odds for Both Teams to Score (Yes) are 1.67.",
      "marketKey": "btts",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_btts_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_btts_no_odds",
      "statement": "The odds for Both Teams to Score (No) are 2.10.",
      "marketKey": "btts",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_btts_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "ef3f3c49-eb54-48e0-8672-df280d9e00bb:claim_corners_over_8_5_odds",
      "statement": "The odds for Over 8.5 corners are 2.00, and Under 8.5 corners are 1.80.",
      "marketKey": "corners_over_under",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "ef3f3c49-eb54-48e0-8672-df280d9e00bb:ei_odds_corners_over_8_5_bet365"
      ],
      "conflictStatus": "none"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "611d6c5e-b8df-48ac-b2e3-622c08e0e81b",
      "market": "h2h",
      "selection": "away",
      "line": None,
      "odds": 2.69,
      "impliedProbability": 0.371747,
      "marketImpliedProbability": 0.385874,
      "marketFairProbability": 0.355805,
      "consensusFairOdds": 2.81053,
      "overround": 0.084367,
      "marketEfficiencyScore": 0.6919,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "4b61ecba-1937-4e8a-b4df-3143d90b274f",
      "market": "h2h",
      "selection": "draw",
      "line": None,
      "odds": 3.47,
      "impliedProbability": 0.288184,
      "marketImpliedProbability": 0.295607,
      "marketFairProbability": 0.272675,
      "consensusFairOdds": 3.667374,
      "overround": 0.084367,
      "marketEfficiencyScore": 0.6919,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "d35be498-9177-460b-b67d-2d99373bf657",
      "market": "h2h",
      "selection": "home",
      "line": None,
      "odds": 2.57,
      "impliedProbability": 0.389105,
      "marketImpliedProbability": 0.402886,
      "marketFairProbability": 0.371521,
      "consensusFairOdds": 2.691641,
      "overround": 0.084367,
      "marketEfficiencyScore": 0.6919,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "ce253c00-78b3-465a-a5be-d71881a84269",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": None,
      "odds": 1.44,
      "impliedProbability": 0.694444,
      "marketImpliedProbability": 0.694444,
      "marketFairProbability": 0.317259,
      "consensusFairOdds": 3.152,
      "overround": 1.188889,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "ddcb3b6e-06b3-44bf-a719-bf05bfe914c5",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": None,
      "odds": 1.25,
      "impliedProbability": 0.8,
      "marketImpliedProbability": 0.8,
      "marketFairProbability": 0.365482,
      "consensusFairOdds": 2.736111,
      "overround": 1.188889,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "00954bc4-a372-402c-83cc-276337dc4db1",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": None,
      "odds": 1.44,
      "impliedProbability": 0.694444,
      "marketImpliedProbability": 0.694444,
      "marketFairProbability": 0.317259,
      "consensusFairOdds": 3.152,
      "overround": 1.188889,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "cc418020-66f9-4b04-b3e3-c59d4e9389f9",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.5,
      "odds": 1.25,
      "impliedProbability": 0.8,
      "marketImpliedProbability": 0.803226,
      "marketFairProbability": 0.756226,
      "consensusFairOdds": 1.322356,
      "overround": 0.062187,
      "marketEfficiencyScore": 0.7465,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "777d47e9-5252-48ca-b6d0-931a031d0979",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.5,
      "odds": 3.98,
      "impliedProbability": 0.251256,
      "marketImpliedProbability": 0.258961,
      "marketFairProbability": 0.243774,
      "consensusFairOdds": 4.102161,
      "overround": 0.062187,
      "marketEfficiencyScore": 0.7465,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "5671a903-6aef-4cbf-9091-23bbff491d04",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.5,
      "odds": 1.81,
      "impliedProbability": 0.552486,
      "marketImpliedProbability": 0.554021,
      "marketFairProbability": 0.527481,
      "consensusFairOdds": 1.895804,
      "overround": 0.050326,
      "marketEfficiencyScore": 0.775,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "e5fecd7f-1c7b-4270-85d4-029b0988ddd0",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.5,
      "odds": 2.03,
      "impliedProbability": 0.492611,
      "marketImpliedProbability": 0.496305,
      "marketFairProbability": 0.472519,
      "consensusFairOdds": 2.116316,
      "overround": 0.050326,
      "marketEfficiencyScore": 0.775,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "a7fefde4-095c-4482-98cf-c4989a76c2f7",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.5,
      "odds": 2.99,
      "impliedProbability": 0.334448,
      "marketImpliedProbability": 0.349042,
      "marketFairProbability": 0.32735,
      "consensusFairOdds": 3.05483,
      "overround": 0.065897,
      "marketEfficiencyScore": 0.7346,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "beb3d0e0-a8a3-4ecf-af10-21fee8c3684c",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.5,
      "odds": 1.4,
      "impliedProbability": 0.714286,
      "marketImpliedProbability": 0.716855,
      "marketFairProbability": 0.67265,
      "consensusFairOdds": 1.486658,
      "overround": 0.065897,
      "marketEfficiencyScore": 0.7346,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "e786b225-84b2-4cd5-9f9f-15ef4824ed1f",
      "market": "goals_over_under",
      "selection": "over",
      "line": 0.5,
      "odds": 1.04,
      "impliedProbability": 0.961538,
      "marketImpliedProbability": 0.961538,
      "marketFairProbability": 0.896414,
      "consensusFairOdds": 1.115556,
      "overround": 0.07265,
      "marketEfficiencyScore": 0.6153,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "21477451-e38c-4c91-8695-ef912aa5cfd5",
      "market": "goals_over_under",
      "selection": "under",
      "line": 0.5,
      "odds": 9,
      "impliedProbability": 0.111111,
      "marketImpliedProbability": 0.111111,
      "marketFairProbability": 0.103586,
      "consensusFairOdds": 9.653846,
      "overround": 0.07265,
      "marketEfficiencyScore": 0.6153,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "a350e6bf-4137-424d-a572-d576f7e3e797",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.5,
      "odds": 5.56,
      "impliedProbability": 0.179856,
      "marketImpliedProbability": 0.189928,
      "marketFairProbability": 0.177909,
      "consensusFairOdds": 5.620867,
      "overround": 0.067121,
      "marketEfficiencyScore": 0.7368,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "c78acff6-a1a2-42a8-a01f-5e45a9d2b3f0",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.5,
      "odds": 1.14,
      "impliedProbability": 0.877193,
      "marketImpliedProbability": 0.877193,
      "marketFairProbability": 0.822091,
      "consensusFairOdds": 1.21641,
      "overround": 0.067121,
      "marketEfficiencyScore": 0.7368,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "fb1ed5d7-933a-4eda-99f9-bca5dd78fd55",
      "market": "goals_over_under",
      "selection": "over",
      "line": 5.5,
      "odds": 8.5,
      "impliedProbability": 0.117647,
      "marketImpliedProbability": 0.117647,
      "marketFairProbability": 0.109948,
      "consensusFairOdds": 9.095238,
      "overround": 0.070028,
      "marketEfficiencyScore": 0.6208,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "fea4b224-51a6-4045-9eac-2d2667b71001",
      "market": "goals_over_under",
      "selection": "under",
      "line": 5.5,
      "odds": 1.05,
      "impliedProbability": 0.952381,
      "marketImpliedProbability": 0.952381,
      "marketFairProbability": 0.890052,
      "consensusFairOdds": 1.123529,
      "overround": 0.070028,
      "marketEfficiencyScore": 0.6208,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "d292d639-60e0-41f6-b38c-eb10ea30291a",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.25,
      "odds": 1.59,
      "impliedProbability": 0.628931,
      "marketImpliedProbability": 0.628931,
      "marketFairProbability": 0.599496,
      "consensusFairOdds": 1.668067,
      "overround": 0.049099,
      "marketEfficiencyScore": 0.6644,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "6a6ca5e3-05ce-4311-9f48-071f53bc38f1",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.25,
      "odds": 2.38,
      "impliedProbability": 0.420168,
      "marketImpliedProbability": 0.420168,
      "marketFairProbability": 0.400504,
      "consensusFairOdds": 2.496855,
      "overround": 0.049099,
      "marketEfficiencyScore": 0.6644,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "7ab6beb5-0193-4f10-8088-d0bde38d2067",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.75,
      "odds": 2.03,
      "impliedProbability": 0.492611,
      "marketImpliedProbability": 0.492611,
      "marketFairProbability": 0.472727,
      "consensusFairOdds": 2.115385,
      "overround": 0.042061,
      "marketEfficiencyScore": 0.679,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "68d99c4b-f8b9-414a-a18b-901feb451f8e",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.75,
      "odds": 1.82,
      "impliedProbability": 0.549451,
      "marketImpliedProbability": 0.549451,
      "marketFairProbability": 0.527273,
      "consensusFairOdds": 1.896552,
      "overround": 0.042061,
      "marketEfficiencyScore": 0.679,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "089f367d-54ad-4fe9-902f-108e0ca4e1b1",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.25,
      "odds": 2.7,
      "impliedProbability": 0.37037,
      "marketImpliedProbability": 0.37037,
      "marketFairProbability": 0.352518,
      "consensusFairOdds": 2.836735,
      "overround": 0.050642,
      "marketEfficiencyScore": 0.6612,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "6aa25e9f-f4af-42a9-9606-6498bf88be48",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.25,
      "odds": 1.47,
      "impliedProbability": 0.680272,
      "marketImpliedProbability": 0.680272,
      "marketFairProbability": 0.647482,
      "consensusFairOdds": 1.544444,
      "overround": 0.050642,
      "marketEfficiencyScore": 0.6612,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "bf08d43a-362a-432f-b8d5-3fa0b830cf0c",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3,
      "odds": 2.39,
      "impliedProbability": 0.41841,
      "marketImpliedProbability": 0.41841,
      "marketFairProbability": 0.399497,
      "consensusFairOdds": 2.503145,
      "overround": 0.047341,
      "marketEfficiencyScore": 0.668,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "a2c94713-9fde-4259-b4e8-a803d5cb75eb",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2,
      "odds": 1.41,
      "impliedProbability": 0.70922,
      "marketImpliedProbability": 0.70922,
      "marketFairProbability": 0.672093,
      "consensusFairOdds": 1.487889,
      "overround": 0.055241,
      "marketEfficiencyScore": 0.6516,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "cef69438-c7b2-4e7c-96ce-1ecceb71e02f",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2,
      "odds": 2.89,
      "impliedProbability": 0.346021,
      "marketImpliedProbability": 0.346021,
      "marketFairProbability": 0.327907,
      "consensusFairOdds": 3.049645,
      "overround": 0.055241,
      "marketEfficiencyScore": 0.6516,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "6b6e42df-3e87-4574-866a-f88b24083a0f",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3,
      "odds": 1.59,
      "impliedProbability": 0.628931,
      "marketImpliedProbability": 0.628931,
      "marketFairProbability": 0.600503,
      "consensusFairOdds": 1.665272,
      "overround": 0.047341,
      "marketEfficiencyScore": 0.668,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "3a68e4f1-3644-428c-8b36-e500ae267e8c",
      "market": "goals_over_under",
      "selection": "over",
      "line": 6.5,
      "odds": 13,
      "impliedProbability": 0.076923,
      "marketImpliedProbability": 0.076923,
      "marketFairProbability": 0.072091,
      "consensusFairOdds": 13.871287,
      "overround": 0.067022,
      "marketEfficiencyScore": 0.627,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "22c4d4ad-3715-4241-8b95-f7ca05d5b2c9",
      "market": "goals_over_under",
      "selection": "under",
      "line": 6.5,
      "odds": 1.01,
      "impliedProbability": 0.990099,
      "marketImpliedProbability": 0.990099,
      "marketFairProbability": 0.927909,
      "consensusFairOdds": 1.077692,
      "overround": 0.067022,
      "marketEfficiencyScore": 0.627,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "beb98515-9eb5-4579-ae67-ed530adf2713",
      "market": "goals_over_under",
      "selection": "over",
      "line": 7.5,
      "odds": 21,
      "impliedProbability": 0.047619,
      "marketImpliedProbability": 0.047619,
      "marketFairProbability": 1,
      "consensusFairOdds": 1,
      "overround": -0.952381,
      "marketEfficiencyScore": 0.7667,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "22e3bbeb-47c9-4bf9-8467-0ec1c54704b9",
      "market": "btts",
      "selection": "no",
      "line": None,
      "odds": 2.1,
      "impliedProbability": 0.47619,
      "marketImpliedProbability": 0.47619,
      "marketFairProbability": 0.442971,
      "consensusFairOdds": 2.257485,
      "overround": 0.074993,
      "marketEfficiencyScore": 0.6104,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "25d88591-563c-46c9-b85c-35d4a61a9286",
      "market": "btts",
      "selection": "yes",
      "line": None,
      "odds": 1.67,
      "impliedProbability": 0.598802,
      "marketImpliedProbability": 0.598802,
      "marketFairProbability": 0.557029,
      "consensusFairOdds": 1.795238,
      "overround": 0.074993,
      "marketEfficiencyScore": 0.6104,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "f2f725ea-2bb7-4fb5-b9de-3305ec8375cc",
      "market": "corners_over_under",
      "selection": "over",
      "line": 8.5,
      "odds": 2,
      "impliedProbability": 0.5,
      "marketImpliedProbability": 0.535714,
      "marketFairProbability": 0.504747,
      "consensusFairOdds": 1.981192,
      "overround": 0.061017,
      "marketEfficiencyScore": 0.7122,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "543f40f0-dea4-43e5-945e-6542cb79b8b2",
      "market": "corners_over_under",
      "selection": "under",
      "line": 8.5,
      "odds": 2.02,
      "impliedProbability": 0.49505,
      "marketImpliedProbability": 0.525303,
      "marketFairProbability": 0.495253,
      "consensusFairOdds": 2.019168,
      "overround": 0.061017,
      "marketEfficiencyScore": 0.7122,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "fd1bedb7-c004-4bfa-af23-11322c4a2b3d",
      "market": "corners_over_under",
      "selection": "over",
      "line": 9.5,
      "odds": 2.22,
      "impliedProbability": 0.45045,
      "marketImpliedProbability": 0.45045,
      "marketFairProbability": 0.420366,
      "consensusFairOdds": 2.378882,
      "overround": 0.071568,
      "marketEfficiencyScore": 0.6176,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "df819b0f-c602-4b45-912e-a43532dc8c9e",
      "market": "corners_over_under",
      "selection": "under",
      "line": 9.5,
      "odds": 1.61,
      "impliedProbability": 0.621118,
      "marketImpliedProbability": 0.621118,
      "marketFairProbability": 0.579634,
      "consensusFairOdds": 1.725225,
      "overround": 0.071568,
      "marketEfficiencyScore": 0.6176,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "7c4ff490-c8c4-4be4-912f-470b2f0ca833",
      "market": "corners_over_under",
      "selection": "over",
      "line": 8,
      "odds": 1.53,
      "impliedProbability": 0.653595,
      "marketImpliedProbability": 0.653595,
      "marketFairProbability": 0.607692,
      "consensusFairOdds": 1.64557,
      "overround": 0.075536,
      "marketEfficiencyScore": 0.6093,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "539da8e6-bcd2-4871-8424-1d6c1f344b1a",
      "market": "corners_over_under",
      "selection": "under",
      "line": 8,
      "odds": 2.37,
      "impliedProbability": 0.421941,
      "marketImpliedProbability": 0.421941,
      "marketFairProbability": 0.392308,
      "consensusFairOdds": 2.54902,
      "overround": 0.075536,
      "marketEfficiencyScore": 0.6093,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "372f146a-c264-49e6-8ef8-02b722c659d1",
      "market": "corners_over_under",
      "selection": "over",
      "line": 9,
      "odds": 1.97,
      "impliedProbability": 0.507614,
      "marketImpliedProbability": 0.507614,
      "marketFairProbability": 0.476064,
      "consensusFairOdds": 2.100559,
      "overround": 0.066273,
      "marketEfficiencyScore": 0.6286,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "90071ee0-b665-4eb7-a5be-22ee0b49c970",
      "market": "corners_over_under",
      "selection": "under",
      "line": 9,
      "odds": 1.79,
      "impliedProbability": 0.558659,
      "marketImpliedProbability": 0.558659,
      "marketFairProbability": 0.523936,
      "consensusFairOdds": 1.908629,
      "overround": 0.066273,
      "marketEfficiencyScore": 0.6286,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "89a233d1-23d4-40aa-80f6-e05eb47bd0c2",
      "market": "corners_over_under",
      "selection": "over",
      "line": 10,
      "odds": 2.62,
      "impliedProbability": 0.381679,
      "marketImpliedProbability": 0.381679,
      "marketFairProbability": 0.35468,
      "consensusFairOdds": 2.819444,
      "overround": 0.076124,
      "marketEfficiencyScore": 0.6081,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    },
    {
      "oddsQuoteId": "b4b184b7-b0be-4d33-9842-e96d6cecb890",
      "market": "corners_over_under",
      "selection": "under",
      "line": 10,
      "odds": 1.44,
      "impliedProbability": 0.694444,
      "marketImpliedProbability": 0.694444,
      "marketFairProbability": 0.64532,
      "consensusFairOdds": 1.549618,
      "overround": 0.076124,
      "marketEfficiencyScore": 0.6081,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-22T16:09:59.727Z"
    }
  ],
  "providerContextWarnings": [
    "scoring prompt allowedQuotes trimmed from 56 to 43 representative quotes"
  ]
}

def get_claims_for_market_selection(market, selection, line=None):
    relevant_claims = []
    for claim in input_data['claims']:
        if claim['marketKey'] == market:
            # For h2h and btts, selectionKey is enough.
            # For goals_over_under, line is also important.
            if market in ['h2h', 'btts', 'double_chance']:
                if selection == 'home' and 'home' in claim['statement'].lower():
                    relevant_claims.append(claim)
                elif selection == 'away' and 'ucd' in claim['statement'].lower():
                     relevant_claims.append(claim)
                elif selection == 'draw' and 'draw' in claim['statement'].lower():
                    relevant_claims.append(claim)
                elif selection == 'yes' and 'btts' in claim['statement'].lower() and 'yes' in claim['statement'].lower():
                    relevant_claims.append(claim)
                elif selection == 'no' and 'btts' in claim['statement'].lower() and 'no' in claim['statement'].lower():
                    relevant_claims.append(claim)
                elif selection == 'home_or_draw' and ('wexford to win or draw' in claim['statement'].lower() or 'home or draw' in claim['statement'].lower()):
                    relevant_claims.append(claim)
                elif selection == 'home_or_away' and ('either wexford or ucd to win' in claim['statement'].lower() or 'home or away' in claim['statement'].lower()):
                    relevant_claims.append(claim)
                elif selection == 'draw_or_away' and ('draw or ucd to win' in claim['statement'].lower() or 'draw or away' in claim['statement'].lower()):
                    relevant_claims.append(claim)
                # For H2H, also consider overall dominance claims
                if market == 'h2h':
                    if selection == 'away' and ('ucd has a dominant' in claim['statement'].lower() or 'ucd has won' in claim['statement'].lower()):
                        relevant_claims.append(claim)
                    elif selection == 'home' and ('wexford has not beaten ucd' in claim['statement'].lower() or "wexford's last victory" in claim['statement'].lower()):
                         relevant_claims.append(claim)

            elif market == 'goals_over_under' and claim['marketKey'] == market:
                if line is not None:
                    if selection == 'over' and f"over {line} goals" in claim['statement'].lower():
                        relevant_claims.append(claim)
                    elif selection == 'under' and f"under {line} goals" in claim['statement'].lower():
                        relevant_claims.append(claim)
                    elif f"over {line} goals" in claim['statement'].lower() or f"under {line} goals" in claim['statement'].lower(): # Catch odds claims
                         relevant_claims.append(claim)
                elif "goals" in claim['statement'].lower(): # General goal claims if line is None
                    relevant_claims.append(claim)

            elif market == 'corners_over_under' and claim['marketKey'] == market:
                if line is not None:
                    if selection == 'over' and f"over {line} corners" in claim['statement'].lower():
                        relevant_claims.append(claim)
                    elif selection == 'under' and f"under {line} corners" in claim['statement'].lower():
                        relevant_claims.append(claim)
                    elif f"over {line} corners" in claim['statement'].lower() or f"under {line} corners" in claim['statement'].lower(): # Catch odds claims
                         relevant_claims.append(claim)

    unique_claims = []
    for claim in relevant_claims:
        if claim not in unique_claims:
            unique_claims.append(claim)
    return unique_claims


def get_evidence_ids_from_claims(claims):
    evidence_ids = []
    for claim in claims:
        evidence_ids.extend(claim['evidenceIds'])
    return list(set(evidence_ids))

def calculate_model_probability_and_rationale(market, selection, line, claims, evidence_items):
    model_probability = None
    rationale = []
    warnings = []
    confidence = 0.5 # Default confidence
    
    # H2H Logic
    if market == 'h2h':
        ucd_dominance = any("ucd has a dominant" in c['statement'].lower() or "ucd has won 4 out of the last 5" in c['statement'].lower() for c in claims)
        wexford_struggle = any("wexford has not beaten ucd" in c['statement'].lower() for c in claims)
        recent_draw = any("ended in a 0-0 draw" in c['statement'].lower() for c in claims)
        ucd_standing = any("ucd currently holds the 2nd position" in c['statement'].lower() for c in claims)
        wexford_standing = any("wexford fc is currently in the middle" in c['statement'].lower() for c in claims)
        
        if selection == 'away': # UCD win
            if ucd_dominance and ucd_standing:
                model_probability = 0.40 # Strong historical and current form for UCD
                rationale.append("UCD has a dominant head-to-head record against Wexford, winning 18 out of 31 matches, and is currently 2nd in the league. They've also won 4 of the last 5 encounters.")
                confidence = 0.75
            elif ucd_dominance:
                model_probability = 0.38
                rationale.append("UCD has a dominant head-to-head record against Wexford, winning 18 out of 31 matches. They've also won 4 of the last 5 encounters.")
                confidence = 0.7
            else:
                model_probability = 0.35 # Default for away win with some support
                rationale.append("UCD has a better league position (2nd) compared to Wexford (4th-7th).")
                confidence = 0.6
        elif selection == 'home': # Wexford win
            if wexford_struggle:
                model_probability = 0.25 # Weak historical for Wexford
                rationale.append("Wexford has a poor head-to-head record against UCD, not beating them in the last 5 First Division matches.")
                confidence = 0.6
            else:
                model_probability = 0.30
                rationale.append("Wexford is playing at home, but their historical performance against UCD is weak.")
                confidence = 0.55
        elif selection == 'draw':
            if recent_draw:
                model_probability = 0.35 # Recent draw increases probability
                rationale.append("The most recent encounter between these teams ended in a 0-0 draw, indicating a potential for another stalemate.")
                confidence = 0.7
            else:
                model_probability = 0.30
                rationale.append("Historically, 5 out of 31 head-to-head matches have ended in a draw.")
                confidence = 0.6

    # Double Chance Logic
    elif market == 'double_chance':
        if selection == 'home_or_draw':
            # Sum of home win and draw probabilities (if we had them)
            # Given UCD dominance, Home or Draw is less likely than Draw or Away
            model_probability = 0.60 # Lower than draw or away
            rationale.append("Considering UCD's strong historical performance, Wexford winning or drawing is less likely than UCD winning or drawing.")
            confidence = 0.6
        elif selection == 'home_or_away':
            model_probability = 0.85 # High probability as only draw is excluded
            rationale.append("It is highly probable that either the home or away team will win, avoiding a draw.")
            confidence = 0.8
        elif selection == 'draw_or_away':
            # Sum of draw and away probabilities
            # Given UCD dominance, this is a strong contender
            model_probability = 0.70
            rationale.append("Given UCD's dominant head-to-head record and stronger league position, a draw or UCD win is a strong possibility.")
            confidence = 0.75

    # Goals Over/Under Logic
    elif market == 'goals_over_under':
        if line == 1.5:
            if selection == 'over':
                model_probability = 0.69 # Based on historical data
                rationale.append(f"Historically, over {line} goals occurred in approximately 69% of head-to-head matches.")
                confidence = 0.8
            elif selection == 'under':
                model_probability = 1 - 0.69
                rationale.append(f"Historically, under {line} goals occurred in approximately {round((1-0.69)*100)}% of head-to-head matches.")
                confidence = 0.8
        elif line == 2.5:
            if selection == 'over':
                model_probability = 0.50 # Based on historical data
                rationale.append(f"Historically, over {line} goals occurred in approximately 50% of head-to-head matches.")
                confidence = 0.7
            elif selection == 'under':
                model_probability = 1 - 0.50
                rationale.append(f"Historically, under {line} goals occurred in approximately {round((1-0.50)*100)}% of head-to-head matches.")
                confidence = 0.7
        elif line == 0.5:
             if selection == 'over':
                model_probability = 0.95 # Very high probability of at least one goal
                rationale.append(f"It is highly probable that at least one goal ({line}) will be scored in the match.")
                confidence = 0.85
             elif selection == 'under':
                model_probability = 0.05 # Very low probability of no goals
                rationale.append(f"It is highly improbable that no goals ({line}) will be scored in the match.")
                confidence = 0.85
        elif line == 3.5:
             if selection == 'over':
                model_probability = 0.30 # Lower probability for more goals
                rationale.append(f"Based on average goals (2.76), over {line} goals is less likely.")
                confidence = 0.6
             elif selection == 'under':
                model_probability = 0.70
                rationale.append(f"Based on average goals (2.76), under {line} goals is more likely.")
                confidence = 0.6
        elif line == 4.5:
             if selection == 'over':
                model_probability = 0.20 # Even lower probability for more goals
                rationale.append(f"Based on average goals (2.76), over {line} goals is highly unlikely.")
                confidence = 0.5
             elif selection == 'under':
                model_probability = 0.80
                rationale.append(f"Based on average goals (2.76), under {line} goals is highly likely.")
                confidence = 0.5
        elif line == 5.5:
             if selection == 'over':
                model_probability = 0.10 # Extremely low probability for many goals
                rationale.append(f"Based on average goals (2.76), over {line} goals is extremely unlikely.")
                confidence = 0.4
             elif selection == 'under':
                model_probability = 0.90
                rationale.append(f"Based on average goals (2.76), under {line} goals is extremely likely.")
                confidence = 0.4
        elif line == 6.5:
             if selection == 'over':
                model_probability = 0.05 # Extremely low probability for many goals
                rationale.append(f"Based on average goals (2.76), over {line} goals is extremely unlikely.")
                confidence = 0.3
             elif selection == 'under':
                model_probability = 0.95
                rationale.append(f"Based on average goals (2.76), under {line} goals is extremely likely.")
                confidence = 0.3

        if model_probability is None: # For lines not specifically handled above, use general average goals
             avg_goals_claim = next((c for c in claims if "average" in c['statement'].lower() and "goals" in c['statement'].lower()), None)
             if avg_goals_claim:
                 avg_goals = float(avg_goals_claim['statement'].split(' ')[-3])
                 if selection == 'over':
                     model_probability = 0.5 if line < avg_goals else 0.3 # Rough estimate
                     rationale.append(f"Model probability for Over {line} goals based on average goals of {avg_goals}.")
                     confidence = 0.5
                 elif selection == 'under':
                     model_probability = 0.5 if line > avg_goals else 0.7 # Rough estimate
                     rationale.append(f"Model probability for Under {line} goals based on average goals of {avg_goals}.")
                     confidence = 0.5
             else:
                 model_probability = 0.5
                 rationale.append("No specific historical data for this goal line; assigned default probability.")
                 warnings.append("No specific historical data for this goal line; model probability is a general estimate.")
                 confidence = 0.4


    # Corners Over/Under Logic
    elif market == 'corners_over_under':
        # No direct historical data, rely more on marketFairProbability with caution
        model_probability = 0.5 # Default to 50/50 without strong evidence
        rationale.append("No direct historical corner statistics found. Model probability is an estimate.")
        warnings.append("No specific historical data for corners; model probability is an estimate.")
        confidence = 0.4 # Lower confidence due to lack of direct evidence

    # BTTS Logic
    elif market == 'btts':
        btts_percentage_claim = next((c for c in claims if "both teams have scored in" in c['statement'].lower() and "of historical" in c['statement'].lower()), None)
        if btts_percentage_claim:
            btts_percentage = float(btts_percentage_claim['statement'].split(' ')[-5].replace('%', '')) / 100
            if selection == 'yes':
                model_probability = btts_percentage
                rationale.append(f"Historically, Both Teams to Score (Yes) occurred in {round(btts_percentage*100)}% of head-to-head matches.")
                confidence = 0.8
            elif selection == 'no':
                model_probability = 1 - btts_percentage
                rationale.append(f"Historically, Both Teams to Score (No) occurred in {round((1-btts_percentage)*100)}% of head-to-head matches.")
                confidence = 0.8
        else:
            model_probability = 0.5 # Default if no specific claim
            rationale.append("No specific historical BTTS data found; assigned default probability.")
            warnings.append("No specific historical data for BTTS; model probability is a general estimate.")
            confidence = 0.5

    return round(model_probability, 4) if model_probability is not None else None, ". ".join(rationale), warnings, confidence

def get_confidence_band(confidence):
    if confidence >= 0.75:
        return "high"
    elif confidence >= 0.55:
        return "medium"
    else:
        return "low"

def calculate_edge(model_probability, market_fair_probability):
    if market_fair_probability == 0:
        return 0 # Avoid division by zero
    return round((model_probability - market_fair_probability) / market_fair_probability, 4)

all_predictions = []
all_warnings = []

# Process each allowed quote
for quote in input_data['allowedQuotes']:
    market = quote['market']
    selection = quote['selection']
    line = quote['line']
    odds = quote['odds']
    market_fair_probability = quote['marketFairProbability']
    odds_quote_id = quote['oddsQuoteId']

    # Get relevant claims and evidence
    relevant_claims = get_claims_for_market_selection(market, selection, line)
    claim_ids = [c['id'] for c in relevant_claims]
    evidence_ids = get_evidence_ids_from_claims(relevant_claims)

    model_probability, rationale, prediction_warnings, confidence = calculate_model_probability_and_rationale(
        market, selection, line, relevant_claims, input_data['evidenceItems']
    )

    if model_probability is None:
        # If model_probability could not be determined, skip this quote
        all_warnings.append(f"Skipping prediction for market {market}, selection {selection}, line {line} due to inability to determine model probability.")
        continue

    edge = calculate_edge(model_probability, market_fair_probability)
    confidence_band = get_confidence_band(confidence)

    # Determine promotable status
    # A pick is promotable if there are market-specific claims with supporting evidence.
    # For this simplified model, if we have specific claims for the market/selection, it's promotable.
    promotable = len(claim_ids) > 0 and len(evidence_ids) > 0

    if not promotable:
        prediction_warnings.append("Pick not promotable due to insufficient market-specific evidence or claims.")

    # Add general warnings if any
    prediction_warnings.extend(input_data['providerContextWarnings'])

    prediction = {
        "oddsQuoteId": odds_quote_id,
        "market": market,
        "selection": selection,
        "line": line,
        "odds": odds,
        "probability": model_probability,
        "modelProbability": model_probability,
        "marketFairProbability": market_fair_probability,
        "edge": edge,
        "confidence": round(confidence, 2),
        "confidenceBand": confidence_band,
        "blockers": [],
        "promotable": promotable,
        "evidenceIds": evidence_ids,
        "claimIds": claim_ids,
        "rationale": rationale,
        "warnings": list(set(prediction_warnings)) # Ensure unique warnings
    }
    all_predictions.append(prediction)

output_json = {
    "predictions": all_predictions,
    "warnings": list(set(all_warnings)),
    "metadata": {}
}

print(json.dumps(output_json, indent=2))
