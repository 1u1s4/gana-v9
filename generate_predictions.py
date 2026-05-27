
import json

input_data = json.loads('''
{
  "promptVersion": "score-prediction-v2",
  "runId": "85a75bb5-dd27-4238-85cb-c20a33bd726d",
  "createdAt": "2026-05-27T17:18:50.357Z",
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
    "id": "0c98de61-c4eb-46a9-a823-d5c9bcf38db7",
    "providerFixtureId": "1527832",
    "competitionId": "04a66994-d428-495a-ba54-4f66432f28ca",
    "season": 2025,
    "homeTeamId": "5abaf0e3-5890-4861-bdbe-254e9219204f",
    "awayTeamId": "a04eb84b-ea75-4de4-8754-1e1e22aae9d0",
    "scheduledAt": "2026-05-27T16:00:00.000Z",
    "status": "live",
    "scoreHome": 0,
    "scoreAway": 0,
    "includedByFilters": [],
    "metadata": {
      "league": {
        "id": 1025,
        "name": "Second League A - Division A Gold",
        "country": "Russia",
        "season": 2025,
        "round": "Spring Season Gold - 15"
      },
      "teams": {
        "home": {
          "id": 6811,
          "name": "Leningradets"
        },
        "away": {
          "id": 2004,
          "name": "Volgar Astrakhan"
        }
      },
      "venue": "Petrovsky Stadium",
      "round": "Spring Season Gold - 15",
      "timezone": "UTC",
      "apiFootballStatusShort": "1H",
      "apiFootballStatusLong": "First Half"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1527832",
    "capturedAt": "2026-05-27T17:18:52.158Z",
    "providerSnapshotId": "f24060ea-d241-4be1-88e6-a85fa0a7f7a6"
  },
  "oddsSnapshot": {
    "id": "c251b290-b0fc-4024-a678-aa54bd4db4fa",
    "fixtureId": "0c98de61-c4eb-46a9-a823-d5c9bcf38db7",
    "providerFixtureId": "1527832",
    "providerSnapshotId": "1ad427b1-25ef-4f63-a539-9d79f1c444f6",
    "bookmakerCount": 3,
    "capturedAt": "2026-05-27T16:31:26.898Z",
    "payloadHash": "cf3bd2877c32fa264210a846d0f5904c969115d824fa26e2b0136836d3631cce"
  },
  "researchBundle": {
    "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7",
    "runId": "bde77068-2a26-4c4b-b31a-ca2fe6894955",
    "status": "review-required",
    "gateResult": {
      "reasons": [
        "Structured research generated with web-search evidence.",
        "Conflicts detected between web-search predictions and bookmaker odds for 'goals_over_under' and 'double_chance' markets."
      ],
      "verdict": "review-required",
      "warnings": [
        "market corners_over_under skipped/review-required: missing odds quotes for requested market"
      ]
    },
    "providerAgentic": "gemini",
    "model": "gemini-2.5-flash",
    "promptVersion": "research-fixture-v2",
    "warnings": [
      "market corners_over_under skipped/review-required: missing odds quotes for requested market"
    ],
    "metadata": {
      "marketScope": [
        "h2h",
        "double_chance",
        "goals_over_under",
        "corners_over_under",
        "btts"
      ],
      "marketCoverage": {
        "warnings": [
          "market corners_over_under skipped/review-required: missing odds quotes for requested market"
        ],
        "quotedMarkets": [
          "btts",
          "double_chance",
          "goals_over_under",
          "h2h"
        ],
        "skippedMarkets": [
          {
            "market": "corners_over_under",
            "reason": "missing odds quotes for requested market"
          }
        ],
        "evidenceMarkets": [
          "btts",
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
      "referenceRepairs": [
        "market corners_over_under skipped/review-required: missing odds quotes for requested market"
      ],
      "webSearchCoverage": {
        "mode": "live",
        "provider": "gemini",
        "required": true,
        "nativeToolUsed": true,
        "nativeSupported": true,
        "browserFallbackUsed": false,
        "realWebSearchSourceCount": 1,
        "syntheticWebSearchSourceCount": 0
      },
      "providerContextWarnings": []
    }
  },
  "sources": [
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football odds snapshot",
      "externalId": "1527832",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:31:26.898Z",
      "metadata": {
        "fixtureId": "0c98de61-c4eb-46a9-a823-d5c9bcf38db7",
        "quoteCount": 73,
        "snapshotId": "1ad427b1-25ef-4f63-a539-9d79f1c444f6",
        "bookmakerCount": 3,
        "oddsSnapshotId": "c251b290-b0fc-4024-a678-aa54bd4db4fa",
        "providerFixtureId": "1527832"
      }
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_api_football_odds",
      "type": "provider-snapshot",
      "url": "https://api-football.com/odds/1527832",
      "title": "API-Football Odds Data for Leningradets vs Volgar Astrakhan",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:31:26.898Z",
      "metadata": {
        "oddsSnapshotId": "c251b290-b0fc-4024-a678-aa54bd4db4fa",
        "providerFixtureId": "1527832"
      }
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture statistics",
      "externalId": "1527832",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:31:25.675Z",
      "metadata": {
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "57caa445-2058-4860-82a3-eb39cfdaed80",
        "providerFixtureId": "1527832"
      }
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_web_1",
      "type": "web-search",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGckx-N3tbLftWoZauYYgnjJEpB9SwkOpITMDk0SAbsn-KKBoKn6spowcanFQ3EgTfmCpJQk8dJjxvwQaImq8_D3LFBgHtVKWPb84xwrJOR4LF3X87U-hk_PZphV4J1dIu1i7XvR4Ao6AONZLgj3IUMzFYYf9lPIKthVFwCUQIQx3qtnH8w_rulf8F1FA==",
      "title": "Leningradets vs Volgar Astrakhan Prediction, H2H, Tips, and Odds",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:31:20.940Z",
      "metadata": {}
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_api_football_fixture",
      "type": "api-football",
      "url": "https://api-football.com/fixtures/1527832",
      "title": "API-Football Fixture Data for Leningradets vs Volgar Astrakhan",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:31:20.940Z",
      "metadata": {
        "providerFixtureId": "1527832"
      }
    }
  ],
  "evidenceItems": [
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_web_h2h_last_match",
      "sourceId": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_web_1",
      "summary": "Volgar Astrakhan defeated Leningradets 3-0 in their last encounter on April 8, 2026.",
      "confidence": 0.8,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_web_h2h_overall",
      "sourceId": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_web_1",
      "summary": "In 9 head-to-head matches, Volgar Astrakhan has 3 wins, Leningradets has 2 wins, and there have been 4 draws.",
      "confidence": 0.7,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_web_low_scoring",
      "sourceId": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_web_1",
      "summary": "The match is predicted to be tight and low-scoring.",
      "confidence": 0.75,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_web_under_2_5_betting_lean",
      "sourceId": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_web_1",
      "summary": "A betting lean towards Under 2.5 Goals due to both teams' low-scoring head-to-head history.",
      "confidence": 0.8,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_web_double_chance_x2",
      "sourceId": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_web_1",
      "summary": "Betting lean towards Double Chance (Draw or Away win for Volgar Astrakhan) given their recent 3-0 victory over Leningradets.",
      "confidence": 0.75,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_h2h_home_price",
      "sourceId": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_api_football_odds",
      "summary": "Marathonbet offers Leningradets (home) win at odds of 1.7 in H2H market.",
      "confidence": 0.9,
      "claimIds": [],
      "metadata": {
        "price": 1.7,
        "market": "h2h",
        "selection": "home"
      }
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_h2h_draw_price",
      "sourceId": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_api_football_odds",
      "summary": "Marathonbet offers Draw at odds of 3.24 in H2H market.",
      "confidence": 0.9,
      "claimIds": [],
      "metadata": {
        "price": 3.24,
        "market": "h2h",
        "selection": "draw"
      }
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_h2h_away_price",
      "sourceId": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_api_football_odds",
      "summary": "Marathonbet offers Volgar Astrakhan (away) win at odds of 4.65 in H2H market.",
      "confidence": 0.9,
      "claimIds": [],
      "metadata": {
        "price": 4.65,
        "market": "h2h",
        "selection": "away"
      }
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_goals_ou_2_5_over",
      "sourceId": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_api_football_odds",
      "summary": "Marathonbet offers Over 2.5 goals at odds of 1.67.",
      "confidence": 0.9,
      "claimIds": [],
      "metadata": {
        "line": 2.5,
        "price": 1.67,
        "market": "goals_over_under",
        "selection": "over"
      }
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_goals_ou_2_5_under",
      "sourceId": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_api_football_odds",
      "summary": "Marathonbet offers Under 2.5 goals at odds of 2.06.",
      "confidence": 0.9,
      "claimIds": [],
      "metadata": {
        "line": 2.5,
        "price": 2.06,
        "market": "goals_over_under",
        "selection": "under"
      }
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_btts_yes",
      "sourceId": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_api_football_odds",
      "summary": "Marathonbet offers Both Teams To Score Yes at odds of 1.61.",
      "confidence": 0.9,
      "claimIds": [],
      "metadata": {
        "price": 1.61,
        "market": "btts",
        "selection": "yes"
      }
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_btts_no",
      "sourceId": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_api_football_odds",
      "summary": "Marathonbet offers Both Teams To Score No at odds of 2.09.",
      "confidence": 0.9,
      "claimIds": [],
      "metadata": {
        "price": 2.09,
        "market": "btts",
        "selection": "no"
      }
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_double_chance_home_draw",
      "sourceId": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_api_football_odds",
      "summary": "Marathonbet offers Home or Draw at odds of 1.12 in Double Chance market.",
      "confidence": 0.9,
      "claimIds": [],
      "metadata": {
        "price": 1.12,
        "market": "double_chance",
        "selection": "home_or_draw"
      }
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_double_chance_draw_away",
      "sourceId": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:source_api_football_odds",
      "summary": "Marathonbet offers Draw or Away at odds of 1.91 in Double Chance market.",
      "confidence": 0.9,
      "claimIds": [],
      "metadata": {
        "price": 1.91,
        "market": "double_chance",
        "selection": "draw_or_away"
      }
    }
  ],
  "claims": [
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:claim_h2h_last_match_volgar_win",
      "statement": "Volgar Astrakhan defeated Leningradets 3-0 in their most recent head-to-head match on April 8, 2026.",
      "marketKey": null,
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_web_h2h_last_match"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:claim_h2h_overall_volgar_advantage",
      "statement": "In their last 9 meetings, Volgar Astrakhan holds a slight historical advantage over Leningradets with 3 wins to 2, and 4 draws.",
      "marketKey": null,
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_web_h2h_overall"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:claim_h2h_odds_home_favored",
      "statement": "The odds indicate Leningradets (home team) is the favorite to win with a price of 1.7.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_h2h_home_price",
        "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_h2h_draw_price",
        "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_h2h_away_price"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:claim_goals_ou_web_low_scoring",
      "statement": "The match is predicted to be a low-scoring affair, with a betting lean towards Under 2.5 Goals.",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_web_low_scoring",
        "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_web_under_2_5_betting_lean"
      ],
      "conflictStatus": "conflict"
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:claim_goals_ou_odds_over_favored",
      "statement": "Bookmaker odds indicate Over 2.5 goals is more likely at a price of 1.67, compared to Under 2.5 goals at 2.06.",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_goals_ou_2_5_over",
        "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_goals_ou_2_5_under"
      ],
      "conflictStatus": "conflict"
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:claim_btts_odds_yes_favored",
      "statement": "Bookmaker odds suggest Both Teams To Score (Yes) is more likely at a price of 1.61, compared to No at 2.09.",
      "marketKey": "btts",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_btts_yes",
        "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_btts_no"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:claim_double_chance_web_draw_away",
      "statement": "Web search suggests Volgar Astrakhan (away team) is likely to secure at least a point (Draw or Away win).",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_web_double_chance_x2"
      ],
      "conflictStatus": "conflict"
    },
    {
      "id": "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:claim_double_chance_odds_home_draw",
      "statement": "Bookmaker odds strongly favor Home or Draw in the Double Chance market at a price of 1.12.",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_double_chance_home_draw",
        "dcd1bb5f-f485-4a1d-a226-0d4055544cb7:evidence_odds_double_chance_draw_away"
      ],
      "conflictStatus": "conflict"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "c9081626-9e1d-4a9b-a002-fca23b1cec05",
      "market": "h2h",
      "selection": "away",
      "line": null,
      "odds": 4.74,
      "impliedProbability": 0.21097,
      "marketImpliedProbability": 0.235905,
      "marketFairProbability": 0.213537,
      "consensusFairOdds": 4.683037,
      "overround": 0.105021,
      "marketEfficiencyScore": 0.7514,
      "lowLiquidity": false,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "4e88a0e5-274b-440b-9b39-91fea5527dd4",
      "market": "h2h",
      "selection": "draw",
      "line": null,
      "odds": 3.4,
      "impliedProbability": 0.294118,
      "marketImpliedProbability": 0.303801,
      "marketFairProbability": 0.274921,
      "consensusFairOdds": 3.637403,
      "overround": 0.105021,
      "marketEfficiencyScore": 0.7514,
      "lowLiquidity": false,
      "bookmaker": "Dafabet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "bd44bea6-33b7-4c7b-a9b4-43b1914baa6c",
      "market": "h2h",
      "selection": "home",
      "line": null,
      "odds": 1.9,
      "impliedProbability": 0.526316,
      "marketImpliedProbability": 0.565315,
      "marketFairProbability": 0.511542,
      "consensusFairOdds": 1.954874,
      "overround": 0.105021,
      "marketEfficiencyScore": 0.7514,
      "lowLiquidity": false,
      "bookmaker": "Dafabet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "d88947d8-7136-471d-8404-e9691f1833b7",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": null,
      "odds": 1.91,
      "impliedProbability": 0.52356,
      "marketImpliedProbability": 0.52356,
      "marketFairProbability": 0.236219,
      "consensusFairOdds": 4.233357,
      "overround": 1.216417,
      "marketEfficiencyScore": 0.6333,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "c1c892ad-c0fd-435c-ac44-901bff4f85d7",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": null,
      "odds": 1.25,
      "impliedProbability": 0.8,
      "marketImpliedProbability": 0.8,
      "marketFairProbability": 0.360943,
      "consensusFairOdds": 2.770522,
      "overround": 1.216417,
      "marketEfficiencyScore": 0.6333,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "992508c8-a924-46a6-94a0-92025024a2f3",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": null,
      "odds": 1.12,
      "impliedProbability": 0.892857,
      "marketImpliedProbability": 0.892857,
      "marketFairProbability": 0.402838,
      "consensusFairOdds": 2.482387,
      "overround": 1.216417,
      "marketEfficiencyScore": 0.6333,
      "lowLiquidity": true,
      "bookmaker": "Marathonbet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "2e0d7908-2b00-44af-9af2-79bdb03d099f",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.5,
      "odds": 1.18,
      "impliedProbability": 0.847458,
      "marketImpliedProbability": 0.847458,
      "marketFairProbability": 0.767717,
      "consensusFairOdds": 1.302564,
      "overround": 0.103868,
      "marketEfficiencyScore": 0.6669,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "fd0400bd-4e8d-48ab-8666-29bcb41d277c",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.5,
      "odds": 3.9,
      "impliedProbability": 0.25641,
      "marketImpliedProbability": 0.25641,
      "marketFairProbability": 0.232283,
      "consensusFairOdds": 4.305085,
      "overround": 0.103868,
      "marketEfficiencyScore": 0.6669,
      "lowLiquidity": true,
      "bookmaker": "Marathonbet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "c74e3c9a-08a7-4193-9b55-1277c1d47c13",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.5,
      "odds": 1.67,
      "impliedProbability": 0.598802,
      "marketImpliedProbability": 0.598802,
      "marketFairProbability": 0.552279,
      "consensusFairOdds": 1.81068,
      "overround": 0.084239,
      "marketEfficiencyScore": 0.7078,
      "lowLiquidity": true,
      "bookmaker": "Marathonbet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "cd7bd0f0-c89d-40f9-af41-d0b22f90c605",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.5,
      "odds": 2.06,
      "impliedProbability": 0.485437,
      "marketImpliedProbability": 0.485437,
      "marketFairProbability": 0.447721,
      "consensusFairOdds": 2.233533,
      "overround": 0.084239,
      "marketEfficiencyScore": 0.7078,
      "lowLiquidity": true,
      "bookmaker": "Marathonbet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "47187a63-0e83-4bd8-9890-f470fe0b785f",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.5,
      "odds": 2.49,
      "impliedProbability": 0.401606,
      "marketImpliedProbability": 0.401606,
      "marketFairProbability": 0.363171,
      "consensusFairOdds": 2.753521,
      "overround": 0.105832,
      "marketEfficiencyScore": 0.6629,
      "lowLiquidity": true,
      "bookmaker": "Marathonbet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "2dcc9bc7-8fa2-49da-b824-0bcf960a42e4",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.5,
      "odds": 1.42,
      "impliedProbability": 0.704225,
      "marketImpliedProbability": 0.704225,
      "marketFairProbability": 0.636829,
      "consensusFairOdds": 1.570281,
      "overround": 0.105832,
      "marketEfficiencyScore": 0.6629,
      "lowLiquidity": true,
      "bookmaker": "Marathonbet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "2aca9c10-11b0-45e5-9ccb-dea8210a949d",
      "market": "goals_over_under",
      "selection": "over",
      "line": 0.5,
      "odds": 1.02,
      "impliedProbability": 0.980392,
      "marketImpliedProbability": 0.980392,
      "marketFairProbability": 0.891142,
      "consensusFairOdds": 1.122156,
      "overround": 0.100153,
      "marketEfficiencyScore": 0.558,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "85fde222-63c0-4aef-8716-acbccba1e537",
      "market": "goals_over_under",
      "selection": "under",
      "line": 0.5,
      "odds": 8.35,
      "impliedProbability": 0.11976,
      "marketImpliedProbability": 0.11976,
      "marketFairProbability": 0.108858,
      "consensusFairOdds": 9.186275,
      "overround": 0.100153,
      "marketEfficiencyScore": 0.558,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "1c95b3e5-9c15-4396-b4df-27766f37a69b",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.5,
      "odds": 4.9,
      "impliedProbability": 0.204082,
      "marketImpliedProbability": 0.204082,
      "marketFairProbability": 0.187396,
      "consensusFairOdds": 5.336283,
      "overround": 0.089037,
      "marketEfficiencyScore": 0.5812,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "20f9c223-bca2-4065-bf95-ae6b2800db13",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.5,
      "odds": 1.13,
      "impliedProbability": 0.884956,
      "marketImpliedProbability": 0.884956,
      "marketFairProbability": 0.812604,
      "consensusFairOdds": 1.230612,
      "overround": 0.089037,
      "marketEfficiencyScore": 0.5812,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "f0c9062a-1181-4915-b558-2156e5dbc980",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.25,
      "odds": 1.49,
      "impliedProbability": 0.671141,
      "marketImpliedProbability": 0.678036,
      "marketFairProbability": 0.619359,
      "consensusFairOdds": 1.614573,
      "overround": 0.094732,
      "marketEfficiencyScore": 0.6791,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "7a0b1e17-a1c6-4fd6-9ba4-bb177a4bf565",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.25,
      "odds": 2.42,
      "impliedProbability": 0.413223,
      "marketImpliedProbability": 0.416696,
      "marketFairProbability": 0.380641,
      "consensusFairOdds": 2.627146,
      "overround": 0.094732,
      "marketEfficiencyScore": 0.6791,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "ff8a7e62-2b34-4f1f-bafb-bea44385df74",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.75,
      "odds": 1.8,
      "impliedProbability": 0.555556,
      "marketImpliedProbability": 0.555556,
      "marketFairProbability": 0.502762,
      "consensusFairOdds": 1.989011,
      "overround": 0.105006,
      "marketEfficiencyScore": 0.6646,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "433ae16b-c2da-46db-8a66-0c2b84ba2ad7",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.75,
      "odds": 1.82,
      "impliedProbability": 0.549451,
      "marketImpliedProbability": 0.549451,
      "marketFairProbability": 0.497238,
      "consensusFairOdds": 2.011111,
      "overround": 0.105006,
      "marketEfficiencyScore": 0.6646,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "09da28a0-5f33-4a85-ac7d-ccb8e6743120",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.25,
      "odds": 2.3,
      "impliedProbability": 0.434783,
      "marketImpliedProbability": 0.43863,
      "marketFairProbability": 0.400786,
      "consensusFairOdds": 2.495097,
      "overround": 0.094431,
      "marketEfficiencyScore": 0.6797,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "6ba8a4f8-edde-4a22-939e-9cc88cc8d3d6",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.25,
      "odds": 1.54,
      "impliedProbability": 0.649351,
      "marketImpliedProbability": 0.655801,
      "marketFairProbability": 0.599214,
      "consensusFairOdds": 1.668853,
      "overround": 0.094431,
      "marketEfficiencyScore": 0.6797,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "768257ac-071a-4f62-87f3-6a755165dc8e",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.75,
      "odds": 2.92,
      "impliedProbability": 0.342466,
      "marketImpliedProbability": 0.342466,
      "marketFairProbability": 0.309693,
      "consensusFairOdds": 3.229008,
      "overround": 0.105825,
      "marketEfficiencyScore": 0.6629,
      "lowLiquidity": true,
      "bookmaker": "Marathonbet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "eee3f6bf-8593-41f6-bac5-49a63f8b9a6e",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.75,
      "odds": 1.31,
      "impliedProbability": 0.763359,
      "marketImpliedProbability": 0.763359,
      "marketFairProbability": 0.690307,
      "consensusFairOdds": 1.44863,
      "overround": 0.105825,
      "marketEfficiencyScore": 0.6629,
      "lowLiquidity": true,
      "bookmaker": "Marathonbet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "e8a6ddda-9cd2-40f5-b70c-2adeab300312",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.25,
      "odds": 4.37,
      "impliedProbability": 0.228833,
      "marketImpliedProbability": 0.228833,
      "marketFairProbability": 0.209765,
      "consensusFairOdds": 4.767241,
      "overround": 0.090902,
      "marketEfficiencyScore": 0.5773,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "cc955a76-49d1-4b22-b97c-6366ccfc222d",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4,
      "odds": 3.8,
      "impliedProbability": 0.263158,
      "marketImpliedProbability": 0.263158,
      "marketFairProbability": 0.238477,
      "consensusFairOdds": 4.193277,
      "overround": 0.103494,
      "marketEfficiencyScore": 0.6677,
      "lowLiquidity": true,
      "bookmaker": "Marathonbet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "acf15a2d-0a5b-47c2-9863-4ec97b9d6e0d",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3,
      "odds": 2.02,
      "impliedProbability": 0.49505,
      "marketImpliedProbability": 0.49505,
      "marketFairProbability": 0.448087,
      "consensusFairOdds": 2.231707,
      "overround": 0.104806,
      "marketEfficiencyScore": 0.665,
      "lowLiquidity": true,
      "bookmaker": "Marathonbet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "c212e609-414b-4fb5-bdb0-067bc6219ae2",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2,
      "odds": 1.28,
      "impliedProbability": 0.78125,
      "marketImpliedProbability": 0.78125,
      "marketFairProbability": 0.706422,
      "consensusFairOdds": 1.415584,
      "overround": 0.105925,
      "marketEfficiencyScore": 0.6627,
      "lowLiquidity": true,
      "bookmaker": "Marathonbet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "d6be1afc-e8e5-4951-a03b-20d04773f9a4",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.75,
      "odds": 1.22,
      "impliedProbability": 0.819672,
      "marketImpliedProbability": 0.819672,
      "marketFairProbability": 0.741525,
      "consensusFairOdds": 1.348571,
      "overround": 0.105386,
      "marketEfficiencyScore": 0.6638,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "e5023174-7ef8-4211-975e-9b7d4f378c28",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.75,
      "odds": 3.5,
      "impliedProbability": 0.285714,
      "marketImpliedProbability": 0.285714,
      "marketFairProbability": 0.258475,
      "consensusFairOdds": 3.868852,
      "overround": 0.105386,
      "marketEfficiencyScore": 0.6638,
      "lowLiquidity": true,
      "bookmaker": "Marathonbet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "ce981277-7ab5-4b7a-908d-34c09426f0ba",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2,
      "odds": 3.08,
      "impliedProbability": 0.324675,
      "marketImpliedProbability": 0.324675,
      "marketFairProbability": 0.293578,
      "consensusFairOdds": 3.40625,
      "overround": 0.105925,
      "marketEfficiencyScore": 0.6627,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "9ee0e36b-e907-4d9c-b154-5e100480df36",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3,
      "odds": 1.64,
      "impliedProbability": 0.609756,
      "marketImpliedProbability": 0.609756,
      "marketFairProbability": 0.551913,
      "consensusFairOdds": 1.811881,
      "overround": 0.104806,
      "marketEfficiencyScore": 0.665,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "f13fef81-838c-42e6-8df3-c880637576e3",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4,
      "odds": 1.19,
      "impliedProbability": 0.840336,
      "marketImpliedProbability": 0.840336,
      "marketFairProbability": 0.761523,
      "consensusFairOdds": 1.313158,
      "overround": 0.103494,
      "marketEfficiencyScore": 0.6677,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "6821fe9e-3d3d-4542-81c5-ea9b9bd45640",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.25,
      "odds": 1.16,
      "impliedProbability": 0.862069,
      "marketImpliedProbability": 0.862069,
      "marketFairProbability": 0.790235,
      "consensusFairOdds": 1.265446,
      "overround": 0.090902,
      "marketEfficiencyScore": 0.5773,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "124dce58-d43b-4135-b735-ce199eeb7389",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1,
      "odds": 1.02,
      "impliedProbability": 0.980392,
      "marketImpliedProbability": 0.980392,
      "marketFairProbability": 0.889371,
      "consensusFairOdds": 1.12439,
      "overround": 0.102343,
      "marketEfficiencyScore": 0.6701,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "9eade647-3f54-4f99-8046-8c1dfcc13ca2",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1,
      "odds": 8.2,
      "impliedProbability": 0.121951,
      "marketImpliedProbability": 0.121951,
      "marketFairProbability": 0.110629,
      "consensusFairOdds": 9.039216,
      "overround": 0.102343,
      "marketEfficiencyScore": 0.6701,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "ce721b68-c2d7-400a-bfbf-6a42e2e08e52",
      "market": "btts",
      "selection": "no",
      "line": null,
      "odds": 2.13,
      "impliedProbability": 0.469484,
      "marketImpliedProbability": 0.473976,
      "marketFairProbability": 0.432808,
      "consensusFairOdds": 2.310492,
      "overround": 0.095094,
      "marketEfficiencyScore": 0.6822,
      "lowLiquidity": true,
      "bookmaker": "1xBet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    },
    {
      "oddsQuoteId": "fb6bb954-03f2-4141-8dc0-64d33eebbbe1",
      "market": "btts",
      "selection": "yes",
      "line": null,
      "odds": 1.61,
      "impliedProbability": 0.621118,
      "marketImpliedProbability": 0.621118,
      "marketFairProbability": 0.567192,
      "consensusFairOdds": 1.763072,
      "overround": 0.095094,
      "marketEfficiencyScore": 0.6822,
      "lowLiquidity": true,
      "bookmaker": "Marathonbet",
      "capturedAt": "2026-05-27T16:31:26.898Z"
    }
  ],
  "providerContextWarnings": [
    "scoring prompt allowedQuotes trimmed from 73 to 38 representative quotes"
  ]
}
''')

# Helper function to find a quote
def find_quote(market, selection, line=None):
    for quote in input_data['allowedQuotes']:
        if quote['market'] == market and quote['selection'] == selection:
            if line is None or quote['line'] == line:
                return quote
    return None

# Helper function to get claims and evidence for a market/selection
def get_claims_and_evidence(market_key=None, selection_key=None, line=None):
    relevant_claims = []
    relevant_evidence_ids = []
    for claim in input_data['claims']:
        market_match = (market_key is None or (claim.get('marketKey') == market_key))
        selection_match = (selection_key is None or (claim.get('selectionKey') == selection_key))
        line_match = (line is None or (claim.get('line') == line))

        if market_match and selection_match and line_match:
            relevant_claims.append(claim)
            relevant_evidence_ids.extend(claim['evidenceIds'])
    return relevant_claims, list(set(relevant_evidence_ids))

# Initialize predictions and warnings
predictions = []
output_warnings = []

# --- H2H Market ---
# Claims: Volgar win (recent), Volgar slight advantage (overall), Home favored (odds)
# This indicates a conflict or uncertainty. Let's weigh the direct recent result more, but acknowledge the odds.
h2h_warnings = []
h2h_promotable = True

# Prioritize the most direct recent H2H evidence: Volgar Astrakhan win
volgar_win_claim, volgar_win_evidence_ids = get_claims_and_evidence(
    market_key=None,  # MarketKey is null for these general claims
    selection_key=None
)

# Filter for the most relevant ones for H2H away
volgar_recent_win_claim = next((c for c in volgar_win_claim if "Volgar Astrakhan defeated Leningradets 3-0" in c['statement']), None)
volgar_overall_advantage_claim = next((c for c in volgar_win_claim if "Volgar Astrakhan holds a slight historical advantage" in c['statement']), None)
h2h_odds_home_favored_claim = next((c for c in input_data['claims'] if c.get('marketKey') == 'h2h' and "home team) is the favorite" in c['statement']), None)

h2h_claim_ids = []
h2h_evidence_ids = []

if volgar_recent_win_claim:
    h2h_claim_ids.append(volgar_recent_win_claim['id'])
    h2h_evidence_ids.extend(volgar_recent_win_claim['evidenceIds'])
if volgar_overall_advantage_claim:
    h2h_claim_ids.append(volgar_overall_advantage_claim['id'])
    h2h_evidence_ids.extend(volgar_overall_advantage_claim['evidenceIds'])
if h2h_odds_home_favored_claim:
    h2h_claim_ids.append(h2h_odds_home_favored_claim['id'])
    h2h_evidence_ids.extend(h2h_odds_home_favored_claim['evidenceIds'])


# The web search indicates a recent away win and slight historical advantage for away,
# while the odds favor home. The prompt says "if a market is thin or uncertain, still emit the best analytical candidate with explicit warnings instead of silently omitting it."
# Given the explicit web evidence of a recent 3-0 away win, let's lean towards 'draw_or_away' as a safer bet in double chance, or 'away' if feeling bold for H2H.
# For H2H, the odds for home are 1.9, draw 3.4, away 4.74.
# The web evidence points to Volgar (away) having an advantage.
# Let's consider 'draw' as a reasonable analytical pick, given the "slight historical advantage" and "4 draws" mentioned, and then check against odds.
# Or, if we strictly follow "best analytical candidate", the recent 3-0 away win is strong.
# Let's make a prediction for H2H Away win, but mark it with warnings about conflicting odds.

h2h_away_quote = find_quote("h2h", "away")
if h2h_away_quote:
    model_probability_h2h_away = 0.25 # slightly higher than implied, based on recent form and historical H2H
    market_fair_probability_h2h_away = h2h_away_quote['marketFairProbability']
    edge_h2h_away = round(model_probability_h2h_away - market_fair_probability_h2h_away, 4)
    
    h2h_predictions_warnings = [
        "Conflicting evidence: Web search indicates recent away win and slight historical away advantage, while bookmaker odds favor home.",
        f"Volgar Astrakhan recent 3-0 win in head-to-head match (claim {volgar_recent_win_claim['id']})." if volgar_recent_win_claim else ""
    ]
    h2h_predictions_warnings = [w for w in h2h_predictions_warnings if w]

    predictions.append({
        "oddsQuoteId": h2h_away_quote['oddsQuoteId'],
        "market": "h2h",
        "selection": "away",
        "line": None,
        "odds": h2h_away_quote['odds'],
        "probability": round(model_probability_h2h_away, 2),
        "modelProbability": model_probability_h2h_away,
        "marketFairProbability": market_fair_probability_h2h_away,
        "edge": edge_h2h_away,
        "confidence": 0.6,
        "confidenceBand": "low",
        "blockers": [],
        "promotable": False,
        "evidenceIds": list(set(h2h_evidence_ids)),
        "claimIds": list(set(h2h_claim_ids)),
        "rationale": "Analytical pick for away win (Volgar Astrakhan) based on recent 3-0 victory and slight historical advantage. Bookmaker odds favor home, creating uncertainty.",
        "warnings": h2h_predictions_warnings
    })

# --- Double Chance Market ---
# Claims: Web search suggests Draw or Away win (conflict), Odds strongly favor Home or Draw (conflict)
# Prioritize web search evidence where conflicts are detected.
double_chance_claims, double_chance_evidence_ids = get_claims_and_evidence("double_chance")
double_chance_warnings = []
double_chance_promotable = True
conflict_double_chance = any(c['conflictStatus'] == 'conflict' for c in double_chance_claims if c['marketKey'] == 'double_chance')

if conflict_double_chance:
    double_chance_warnings.append("Conflicts detected between web-search predictions and bookmaker odds for 'double_chance' market. Prioritizing web-search evidence.")
    
# Web search suggests "Draw or Away win for Volgar Astrakhan"
draw_or_away_quote = find_quote("double_chance", "draw_or_away")
if draw_or_away_quote:
    model_probability_double_chance_x2 = 0.45 # Estimated based on web search lean, despite low marketFairProbability in allowedQuotes
    market_fair_probability_double_chance_x2 = draw_or_away_quote['marketFairProbability']
    edge_double_chance_x2 = round(model_probability_double_chance_x2 - market_fair_probability_double_chance_x2, 4)

    predictions.append({
        "oddsQuoteId": draw_or_away_quote['oddsQuoteId'],
        "market": "double_chance",
        "selection": "draw_or_away",
        "line": None,
        "odds": draw_or_away_quote['odds'],
        "probability": round(model_probability_double_chance_x2, 2),
        "modelProbability": model_probability_double_chance_x2,
        "marketFairProbability": market_fair_probability_double_chance_x2,
        "edge": edge_double_chance_x2,
        "confidence": 0.7,
        "confidenceBand": "medium",
        "blockers": [],
        "promotable": True if not conflict_double_chance else False,
        "evidenceIds": list(set([eid for c in double_chance_claims for eid in c['evidenceIds']])),
        "claimIds": list(set([c['id'] for c in double_chance_claims])),
        "rationale": "Betting lean towards Draw or Away win for Volgar Astrakhan, supported by web search given their recent 3-0 victory over Leningradets.",
        "warnings": double_chance_warnings
    })


# --- Goals Over/Under Market ---
# Claims: Web search (low scoring, Under 2.5) conflicts with Odds (Over 2.5 favored)
# Instruction: "Prioritize web search evidence... over bookmaker odds if they conflict"
goals_ou_claims, goals_ou_evidence_ids = get_claims_and_evidence("goals_over_under")
goals_ou_warnings = []
goals_ou_promotable = True
conflict_goals_ou = any(c['conflictStatus'] == 'conflict' for c in goals_ou_claims if c['marketKey'] == 'goals_over_under')

if conflict_goals_ou:
    goals_ou_warnings.append("Conflicts detected between web-search predictions and bookmaker odds for 'goals_over_under' market. Prioritizing web-search evidence (Under 2.5 Goals).")

under_2_5_quote = find_quote("goals_over_under", "under", 2.5)
if under_2_5_quote:
    model_probability_under_2_5 = 0.55 # Estimated based on web search lean
    market_fair_probability_under_2_5 = under_2_5_quote['marketFairProbability']
    edge_under_2_5 = round(model_probability_under_2_5 - market_fair_probability_under_2_5, 4)

    predictions.append({
        "oddsQuoteId": under_2_5_quote['oddsQuoteId'],
        "market": "goals_over_under",
        "selection": "under",
        "line": 2.5,
        "odds": under_2_5_quote['odds'],
        "probability": round(model_probability_under_2_5, 2),
        "modelProbability": model_probability_under_2_5,
        "marketFairProbability": market_fair_probability_under_2_5,
        "edge": edge_under_2_5,
        "confidence": 0.75,
        "confidenceBand": "medium",
        "blockers": [],
        "promotable": True if not conflict_goals_ou else False,
        "evidenceIds": list(set([eid for c in goals_ou_claims for eid in c['evidenceIds'] if "goals_ou_web_low_scoring" in c['id']])),
        "claimIds": list(set([c['id'] for c in goals_ou_claims if "goals_ou_web_low_scoring" in c['id']])),
        "rationale": "Match predicted to be low-scoring with a betting lean towards Under 2.5 Goals, based on web search and head-to-head history.",
        "warnings": goals_ou_warnings
    })

# --- Corners Over/Under Market ---
# Research bundle explicitly states this market is skipped due to missing odds quotes.
output_warnings.append("Market 'corners_over_under' skipped: missing odds quotes for requested market.")


# --- BTTS Market ---
# Claims: Bookmaker odds suggest BTTS Yes is more likely.
btts_claims, btts_evidence_ids = get_claims_and_evidence("btts")
btts_yes_quote = find_quote("btts", "yes")

if btts_yes_quote:
    model_probability_btts_yes = 0.6 # Estimated based on odds favoring it and no conflicting evidence
    market_fair_probability_btts_yes = btts_yes_quote['marketFairProbability']
    edge_btts_yes = round(model_probability_btts_yes - market_fair_probability_btts_yes, 4)

    predictions.append({
        "oddsQuoteId": btts_yes_quote['oddsQuoteId'],
        "market": "btts",
        "selection": "yes",
        "line": None,
        "odds": btts_yes_quote['odds'],
        "probability": round(model_probability_btts_yes, 2),
        "modelProbability": model_probability_btts_yes,
        "marketFairProbability": market_fair_probability_btts_yes,
        "edge": edge_btts_yes,
        "confidence": 0.7,
        "confidenceBand": "medium",
        "blockers": [],
        "promotable": True,
        "evidenceIds": list(set([eid for c in btts_claims for eid in c['evidenceIds']])),
        "claimIds": list(set([c['id'] for c in btts_claims])),
        "rationale": "Bookmaker odds suggest Both Teams To Score (Yes) is more likely.",
        "warnings": []
    })

# Final Output
final_output = {
  "predictions": predictions,
  "warnings": output_warnings,
  "metadata": {}
}

print(json.dumps(final_output, indent=2))
