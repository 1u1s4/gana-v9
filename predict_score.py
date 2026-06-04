
import json

input_data_str = """
{
  "promptVersion": "score-prediction-v2",
  "runId": "bdb4f6b9-6289-43b5-a0a5-06c1c32874e9",
  "createdAt": "2026-06-04T17:04:13.651Z",
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
    "id": "6749be13-8ec3-4064-8503-3ecc6794a4fd",
    "providerFixtureId": "1504238",
    "competitionId": "245ff5de-ffef-42e3-a272-adffdb13d0b6",
    "season": 2026,
    "homeTeamId": "90f86128-8a70-4bed-8ebb-f374edeb66e3",
    "awayTeamId": "81fee3b7-fd62-4efd-9c63-cf7c8127faaa",
    "scheduledAt": "2026-06-05T16:00:00.000Z",
    "status": "scheduled",
    "scoreHome": null,
    "scoreAway": null,
    "includedByFilters": [],
    "metadata": {
      "league": {
        "id": 1087,
        "name": "Ykkösliiga",
        "country": "Finland",
        "season": 2026,
        "round": "Group Stage"
      },
      "teams": {
        "home": {
          "id": 9187,
          "name": "KäPa"
        },
        "away": {
          "id": 2076,
          "name": "Kooteepee"
        }
      },
      "venue": "Markku.fi Areena",
      "round": "Group Stage",
      "timezone": "UTC",
      "apiFootballStatusShort": "NS",
      "apiFootballStatusLong": "Not Started"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1504238",
    "capturedAt": "2026-06-04T17:04:15.948Z",
    "providerSnapshotId": "74427806-3377-416b-9842-9125bec190a3"
  },
  "oddsSnapshot": {
    "id": "c4777c14-0629-4457-bf1f-377af35c297b",
    "fixtureId": "6749be13-8ec3-4064-8503-3ecc6794a4fd",
    "providerFixtureId": "1504238",
    "providerSnapshotId": "0eef2648-9a3c-483a-ba22-f4c708c1044d",
    "bookmakerCount": 2,
    "capturedAt": "2026-06-04T16:37:11.621Z",
    "payloadHash": "562aeca5d0c4825215d5ddcecca046ae23a2e49a12443947f19c80836a441b13"
  },
  "researchBundle": {
    "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b",
    "runId": "bdb4f6b9-6289-43b5-a0a5-06c1c32874e9",
    "status": "promotable",
    "gateResult": {
      "reasons": [
        "Structured research generated with sufficient evidence from web search and provider snapshots.",
        "objective research gate passed with current web evidence"
      ],
      "verdict": "promotable",
      "warnings": [
        "market corners_over_under skipped/review-required: missing odds quotes for requested market"
      ]
    },
    "providerAgentic": "gemini",
    "model": "gemini-2.5-pro",
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
      "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football odds snapshot",
      "externalId": "1504238",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:37:11.621Z",
      "metadata": {
        "fixtureId": "6749be13-8ec3-4064-8503-3ecc6794a4fd",
        "quoteCount": 44,
        "snapshotId": "0eef2648-9a3c-483a-ba22-f4c708c1044d",
        "bookmakerCount": 2,
        "oddsSnapshotId": "c4777c14-0629-4457-bf1f-377af35c297b",
        "providerFixtureId": "1504238"
      }
    },
    {
      "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b:provider_snapshot_odds",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football Odds Snapshot",
      "externalId": "api-football://provider_snapshot_odds/1504238",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:37:11.621Z",
      "metadata": {
        "provider": "api-football",
        "providerFixtureId": "1504238"
      }
    },
    {
      "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture statistics",
      "externalId": "1504238",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:37:10.200Z",
      "metadata": {
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "d95996b0-aa50-4f06-97bc-6f00fb824cb3",
        "providerFixtureId": "1504238"
      }
    },
    {
      "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b:web_search_1",
      "type": "web-search",
      "url": "https://apwin.com/ice-hockey/finland/ykkosliiga/kapa-vs-ktp-prediction-05-06-2026",
      "title": "KäPa vs KTP Prediction, Odds & Betting Tips | 05.06.2026",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:37:07.258Z",
      "metadata": {}
    },
    {
      "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b:source_api_football_fixture",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture",
      "externalId": "1504238",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:37:07.258Z",
      "metadata": {
        "fixtureId": "6749be13-8ec3-4064-8503-3ecc6794a4fd",
        "providerFixtureId": "1504238"
      }
    },
    {
      "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b:provider_snapshot_fixture",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football Fixture Snapshot",
      "externalId": "api-football://provider_snapshot_fixture/1504238",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:17:01.284Z",
      "metadata": {
        "provider": "api-football",
        "providerFixtureId": "1504238"
      }
    }
  ],
  "evidenceItems": [
    {
      "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b:evidence_1",
      "sourceId": "f84dc7b9-707c-41b4-bb83-45a732185f9b:web_search_1",
      "summary": "KTP is in strong form, leading the league, while KäPa's performance has been inconsistent.",
      "confidence": 0.9,
      "claimIds": [
        "f84dc7b9-707c-41b4-bb83-45a732185f9b:claim_1",
        "f84dc7b9-707c-41b4-bb83-45a732185f9b:claim_2"
      ],
      "metadata": {}
    },
    {
      "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b:evidence_2",
      "sourceId": "f84dc7b9-707c-41b4-bb83-45a732185f9b:web_search_1",
      "summary": "There is a high likelihood of both teams scoring, especially considering KäPa's record at home.",
      "confidence": 0.8,
      "claimIds": [
        "f84dc7b9-707c-41b4-bb83-45a732185f9b:claim_3"
      ],
      "metadata": {}
    },
    {
      "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b:evidence_3",
      "sourceId": "f84dc7b9-707c-41b4-bb83-45a732185f9b:web_search_1",
      "summary": "Historical data between the two teams suggests a high-scoring game.",
      "confidence": 0.85,
      "claimIds": [
        "f84dc7b9-707c-41b4-bb83-45a732185f9b:claim_4"
      ],
      "metadata": {}
    },
    {
      "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b:evidence_4",
      "sourceId": "f84dc7b9-707c-41b4-bb83-45a732185f9b:provider_snapshot_odds",
      "summary": "The betting market strongly favors an away win for KTP.",
      "confidence": 0.95,
      "claimIds": [
        "f84dc7b9-707c-41b4-bb83-45a732185f9b:claim_1"
      ],
      "metadata": {}
    }
  ],
  "claims": [
    {
      "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b:claim_1",
      "statement": "KTP will win the match against KäPa.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "f84dc7b9-707c-41b4-bb83-45a732185f9b:evidence_1",
        "f84dc7b9-707c-41b4-bb83-45a732185f9b:evidence_4"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b:claim_2",
      "statement": "KTP will win or draw the match.",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "f84dc7b9-707c-41b4-bb83-45a732185f9b:evidence_1"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b:claim_3",
      "statement": "Both teams will score in the match.",
      "marketKey": "btts",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "f84dc7b9-707c-41b4-bb83-45a732185f9b:evidence_2"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "f84dc7b9-707c-41b4-bb83-45a732185f9b:claim_4",
      "statement": "There will be over 2.5 goals in the match.",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "f84dc7b9-707c-41b4-bb83-45a732185f9b:evidence_3"
      ],
      "conflictStatus": "none"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "828f8880-bec5-440b-a9b3-833687621b2d",
      "market": "h2h",
      "selection": "away",
      "line": null,
      "odds": 1.64,
      "impliedProbability": 0.609756,
      "marketImpliedProbability": 0.61352,
      "marketFairProbability": 0.560362,
      "consensusFairOdds": 1.78456,
      "overround": 0.095217,
      "marketEfficiencyScore": 0.6746,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "282cd56b-c8b3-43cd-ad0b-ae081adb8026",
      "market": "h2h",
      "selection": "draw",
      "line": null,
      "odds": 3.94,
      "impliedProbability": 0.253807,
      "marketImpliedProbability": 0.258483,
      "marketFairProbability": 0.236026,
      "consensusFairOdds": 4.236813,
      "overround": 0.095217,
      "marketEfficiencyScore": 0.6746,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "75ee1fd1-4fad-42aa-b4e0-f6c8a7763cc7",
      "market": "h2h",
      "selection": "home",
      "line": null,
      "odds": 4.8,
      "impliedProbability": 0.208333,
      "marketImpliedProbability": 0.223214,
      "marketFairProbability": 0.203611,
      "consensusFairOdds": 4.911318,
      "overround": 0.095217,
      "marketEfficiencyScore": 0.6746,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "3c60fa6d-60fa-4c50-b38e-499c4827aa03",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": null,
      "odds": 1.2,
      "impliedProbability": 0.833333,
      "marketImpliedProbability": 0.833333,
      "marketFairProbability": 0.395034,
      "consensusFairOdds": 2.531429,
      "overround": 1.109524,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "4b19a164-5742-4dc4-92f8-9fc47bd80d19",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": null,
      "odds": 1.25,
      "impliedProbability": 0.8,
      "marketImpliedProbability": 0.8,
      "marketFairProbability": 0.379233,
      "consensusFairOdds": 2.636905,
      "overround": 1.109524,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "47b02fcd-91b9-4024-a00e-e00496177856",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": null,
      "odds": 2.1,
      "impliedProbability": 0.47619,
      "marketImpliedProbability": 0.47619,
      "marketFairProbability": 0.225734,
      "consensusFairOdds": 4.43,
      "overround": 1.109524,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "b5bf9420-f9bc-43a5-8d57-968b3cf43aaa",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.5,
      "odds": 1.22,
      "impliedProbability": 0.819672,
      "marketImpliedProbability": 0.830004,
      "marketFairProbability": 0.778018,
      "consensusFairOdds": 1.285317,
      "overround": 0.066861,
      "marketEfficiencyScore": 0.7284,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "21893a88-4a9a-4636-b236-b17875a8cb3e",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.5,
      "odds": 4.47,
      "impliedProbability": 0.223714,
      "marketImpliedProbability": 0.236857,
      "marketFairProbability": 0.221982,
      "consensusFairOdds": 4.504872,
      "overround": 0.066861,
      "marketEfficiencyScore": 0.7284,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "1267bc17-04a9-446b-93a1-e27eeb760825",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.5,
      "odds": 1.73,
      "impliedProbability": 0.578035,
      "marketImpliedProbability": 0.593895,
      "marketFairProbability": 0.561626,
      "consensusFairOdds": 1.780545,
      "overround": 0.057494,
      "marketEfficiencyScore": 0.7415,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "d0b37329-915a-42f6-b95d-58f039535400",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.5,
      "odds": 2.24,
      "impliedProbability": 0.446429,
      "marketImpliedProbability": 0.463599,
      "marketFairProbability": 0.438374,
      "consensusFairOdds": 2.281155,
      "overround": 0.057494,
      "marketEfficiencyScore": 0.7415,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "860f521c-c6a8-49f7-ae00-785a2fe7b0ff",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.5,
      "odds": 2.75,
      "impliedProbability": 0.363636,
      "marketImpliedProbability": 0.378669,
      "marketFairProbability": 0.353538,
      "consensusFairOdds": 2.828548,
      "overround": 0.071382,
      "marketEfficiencyScore": 0.7102,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "6d533d08-2da3-4f52-ac04-457e96da4b22",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.5,
      "odds": 1.49,
      "impliedProbability": 0.671141,
      "marketImpliedProbability": 0.692713,
      "marketFairProbability": 0.646462,
      "consensusFairOdds": 1.546882,
      "overround": 0.071382,
      "marketEfficiencyScore": 0.7102,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "86fbd1a8-29fd-4214-a996-a27de49725a1",
      "market": "goals_over_under",
      "selection": "over",
      "line": 0.5,
      "odds": 1.04,
      "impliedProbability": 0.961538,
      "marketImpliedProbability": 0.961538,
      "marketFairProbability": 0.925926,
      "consensusFairOdds": 1.08,
      "overround": 0.038462,
      "marketEfficiencyScore": 0.6865,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "aac3e589-8305-4578-b492-b76c2d9ea43a",
      "market": "goals_over_under",
      "selection": "under",
      "line": 0.5,
      "odds": 13,
      "impliedProbability": 0.076923,
      "marketImpliedProbability": 0.076923,
      "marketFairProbability": 0.074074,
      "consensusFairOdds": 13.5,
      "overround": 0.038462,
      "marketEfficiencyScore": 0.6865,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "6989ecf0-4cd0-4c93-b9d0-9b97b75df96b",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.5,
      "odds": 5.5,
      "impliedProbability": 0.181818,
      "marketImpliedProbability": 0.201041,
      "marketFairProbability": 0.189683,
      "consensusFairOdds": 5.271959,
      "overround": 0.059806,
      "marketEfficiencyScore": 0.7336,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "6b37159b-521b-40e0-abb2-adc30bb176f1",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.5,
      "odds": 1.19,
      "impliedProbability": 0.840336,
      "marketImpliedProbability": 0.858765,
      "marketFairProbability": 0.810317,
      "consensusFairOdds": 1.234085,
      "overround": 0.059806,
      "marketEfficiencyScore": 0.7336,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "437d23be-ee03-4f40-aee7-f0c567397d60",
      "market": "goals_over_under",
      "selection": "over",
      "line": 5.5,
      "odds": 11,
      "impliedProbability": 0.090909,
      "marketImpliedProbability": 0.090909,
      "marketFairProbability": 0.087137,
      "consensusFairOdds": 11.47619,
      "overround": 0.04329,
      "marketEfficiencyScore": 0.6765,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "0c326f94-cc87-4582-ab87-4c7dd761cb4c",
      "market": "goals_over_under",
      "selection": "under",
      "line": 5.5,
      "odds": 1.05,
      "impliedProbability": 0.952381,
      "marketImpliedProbability": 0.952381,
      "marketFairProbability": 0.912863,
      "consensusFairOdds": 1.095455,
      "overround": 0.04329,
      "marketEfficiencyScore": 0.6765,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "e01d0854-97f3-4bfa-a03f-0e3ada642456",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.25,
      "odds": 1.46,
      "impliedProbability": 0.684932,
      "marketImpliedProbability": 0.684932,
      "marketFairProbability": 0.647343,
      "consensusFairOdds": 1.544776,
      "overround": 0.058066,
      "marketEfficiencyScore": 0.6457,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "c0304e1c-4aab-407d-8f58-e44206024555",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.25,
      "odds": 2.68,
      "impliedProbability": 0.373134,
      "marketImpliedProbability": 0.373134,
      "marketFairProbability": 0.352657,
      "consensusFairOdds": 2.835616,
      "overround": 0.058066,
      "marketEfficiencyScore": 0.6457,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "2a239026-7f35-4afd-b9a5-1d3bdb9e6919",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.75,
      "odds": 1.8,
      "impliedProbability": 0.555556,
      "marketImpliedProbability": 0.555556,
      "marketFairProbability": 0.528796,
      "consensusFairOdds": 1.891089,
      "overround": 0.050605,
      "marketEfficiencyScore": 0.6612,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "15ad9f6d-abfd-4dbd-a142-510079dcdaef",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.75,
      "odds": 2.02,
      "impliedProbability": 0.49505,
      "marketImpliedProbability": 0.49505,
      "marketFairProbability": 0.471204,
      "consensusFairOdds": 2.122222,
      "overround": 0.050605,
      "marketEfficiencyScore": 0.6612,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "2094bec7-db19-457a-be74-f5cce9368108",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.25,
      "odds": 2.29,
      "impliedProbability": 0.436681,
      "marketImpliedProbability": 0.436681,
      "marketFairProbability": 0.412821,
      "consensusFairOdds": 2.42236,
      "overround": 0.057799,
      "marketEfficiencyScore": 0.6463,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "0c9e5deb-41fd-4ceb-bb1f-a7af10610e56",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.25,
      "odds": 1.61,
      "impliedProbability": 0.621118,
      "marketImpliedProbability": 0.621118,
      "marketFairProbability": 0.587179,
      "consensusFairOdds": 1.703057,
      "overround": 0.057799,
      "marketEfficiencyScore": 0.6463,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "c8d84b3e-da6a-4e6e-882a-bf3f8b90b1d9",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3,
      "odds": 2.03,
      "impliedProbability": 0.492611,
      "marketImpliedProbability": 0.492611,
      "marketFairProbability": 0.467192,
      "consensusFairOdds": 2.140449,
      "overround": 0.054409,
      "marketEfficiencyScore": 0.6533,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "7a9c8ec3-4b1f-4377-a8ad-f7f14422101b",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2,
      "odds": 1.42,
      "impliedProbability": 0.704225,
      "marketImpliedProbability": 0.704225,
      "marketFairProbability": 0.663507,
      "consensusFairOdds": 1.507143,
      "overround": 0.061368,
      "marketEfficiencyScore": 0.6388,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "3bdec59b-c68b-45be-a18b-96c1411852f3",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2,
      "odds": 2.8,
      "impliedProbability": 0.357143,
      "marketImpliedProbability": 0.357143,
      "marketFairProbability": 0.336493,
      "consensusFairOdds": 2.971831,
      "overround": 0.061368,
      "marketEfficiencyScore": 0.6388,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "caa11c2a-6634-40fd-8bf3-a927ea6785f5",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3,
      "odds": 1.78,
      "impliedProbability": 0.561798,
      "marketImpliedProbability": 0.561798,
      "marketFairProbability": 0.532808,
      "consensusFairOdds": 1.876847,
      "overround": 0.054409,
      "marketEfficiencyScore": 0.6533,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "470f114d-edc3-463f-a7b9-25ab59caa32e",
      "market": "goals_over_under",
      "selection": "over",
      "line": 6.5,
      "odds": 23,
      "impliedProbability": 0.043478,
      "marketImpliedProbability": 0.043478,
      "marketFairProbability": 0.042066,
      "consensusFairOdds": 23.772277,
      "overround": 0.033577,
      "marketEfficiencyScore": 0.6967,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "20c43123-15e5-4dd1-8169-c528c3a7c77e",
      "market": "goals_over_under",
      "selection": "under",
      "line": 6.5,
      "odds": 1.01,
      "impliedProbability": 0.990099,
      "marketImpliedProbability": 0.990099,
      "marketFairProbability": 0.957934,
      "consensusFairOdds": 1.043913,
      "overround": 0.033577,
      "marketEfficiencyScore": 0.6967,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "d5070435-b028-4fe9-9a4b-5696a881bea5",
      "market": "goals_over_under",
      "selection": "over",
      "line": 7.5,
      "odds": 51,
      "impliedProbability": 0.019608,
      "marketImpliedProbability": 0.019608,
      "marketFairProbability": 1,
      "consensusFairOdds": 1,
      "overround": -0.980392,
      "marketEfficiencyScore": 0.7667,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "454cd013-00e3-4c7e-ac30-dfb54a03a6f5",
      "market": "btts",
      "selection": "no",
      "line": null,
      "odds": 2,
      "impliedProbability": 0.5,
      "marketImpliedProbability": 0.5,
      "marketFairProbability": 0.463807,
      "consensusFairOdds": 2.156069,
      "overround": 0.078035,
      "marketEfficiencyScore": 0.6041,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    },
    {
      "oddsQuoteId": "2b0aac94-aa96-4193-9206-30facfe28ee2",
      "market": "btts",
      "selection": "yes",
      "line": null,
      "odds": 1.73,
      "impliedProbability": 0.578035,
      "marketImpliedProbability": 0.578035,
      "marketFairProbability": 0.536193,
      "consensusFairOdds": 1.865,
      "overround": 0.078035,
      "marketEfficiencyScore": 0.6041,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:37:11.621Z"
    }
  ],
  "providerContextWarnings": [
    "scoring prompt allowedQuotes trimmed from 44 to 33 representative quotes"
  ]
}
"""

input_data = json.loads(input_data_str)

claims_map = {claim["id"]: claim for claim in input_data["claims"]}
evidence_map = {evidence["id"]: evidence for evidence in input_data["evidenceItems"]}
allowed_quotes = input_data["allowedQuotes"]
required_markets = input_data["requiredMarkets"]
all_warnings = []
predictions = []

def get_model_probability_and_confidence(claim_id):
    claim = claims_map[claim_id]
    total_confidence = 0
    num_evidence = 0
    rationales = []
    
    for evidence_id in claim["evidenceIds"]:
        evidence = evidence_map.get(evidence_id)
        if evidence:
            total_confidence += evidence["confidence"]
            num_evidence += 1
            rationales.append(evidence["summary"])
            
    if num_evidence > 0:
        # Use average confidence of supporting evidence for modelProbability and confidence
        avg_confidence = total_confidence / num_evidence
        return avg_confidence, avg_confidence, " ".join(rationales)
    return 0, 0, "No strong evidence for this claim."

def get_confidence_band(confidence):
    if confidence >= 0.85:
        return "high"
    elif confidence >= 0.7:
        return "medium"
    else:
        return "low"

for market_key in required_markets:
    # Handle corners_over_under specifically as it's noted as skipped
    if market_key == "corners_over_under":
        all_warnings.append("market corners_over_under skipped: missing odds quotes for requested market")
        continue

    for claim in input_data["claims"]:
        if claim["marketKey"] == market_key and claim["supportLevel"] == "supported":
            model_probability, confidence, rationale = get_model_probability_and_confidence(claim["id"])

            for quote in allowed_quotes:
                if quote["market"] == market_key:
                    # Logic to match claim to specific quote selection and line
                    match_found = False
                    if market_key == "h2h":
                        if (claim["statement"] == "KTP will win the match against KäPa." and quote["selection"] == "away"):
                            match_found = True
                    elif market_key == "double_chance":
                        if (claim["statement"] == "KTP will win or draw the match." and quote["selection"] == "draw_or_away"):
                            match_found = True
                    elif market_key == "btts":
                        if (claim["statement"] == "Both teams will score in the match." and quote["selection"] == "yes"):
                            match_found = True
                    elif market_key == "goals_over_under":
                        statement_parts = claim["statement"].split(" ")
                        line = None
                        selection = None

                        if "over" in statement_parts:
                            selection = "over"
                            for part in statement_parts:
                                try:
                                    # This might pick up other numbers, need to be more specific
                                    if part.replace('.', '', 1).isdigit(): # check if it's a number
                                        line = float(part)
                                        break
                                except ValueError:
                                    continue
                        elif "under" in statement_parts:
                            selection = "under"
                            for part in statement_parts:
                                try:
                                    if part.replace('.', '', 1).isdigit():
                                        line = float(part)
                                        break
                                except ValueError:
                                    continue
                        
                        # Match claim to quote based on parsed line and selection
                        if selection and line is not None:
                            if quote["selection"] == selection and quote["line"] == line:
                                match_found = True
                        
                    if match_found:
                        market_fair_probability = quote["marketFairProbability"]
                        edge = (model_probability / market_fair_probability) - 1 if market_fair_probability else 0

                        prediction = {
                            "oddsQuoteId": quote["oddsQuoteId"],
                            "market": market_key,
                            "selection": quote["selection"],
                            "line": quote["line"],
                            "odds": quote["odds"],
                            "probability": round(model_probability, 6),
                            "modelProbability": round(model_probability, 6),
                            "marketFairProbability": round(market_fair_probability, 6),
                            "edge": round(edge, 6),
                            "confidence": round(confidence, 6),
                            "confidenceBand": get_confidence_band(confidence),
                            "blockers": [],
                            "promotable": True,
                            "evidenceIds": claim["evidenceIds"],
                            "claimIds": [claim["id"]],
                            "rationale": rationale,
                            "warnings": []
                        }
                        predictions.append(prediction)
                        break

output = {
    "predictions": predictions,
    "warnings": all_warnings,
    "metadata": {}
}

print(json.dumps(output, indent=2))
