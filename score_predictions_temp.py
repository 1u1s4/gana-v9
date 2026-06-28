
import json
import math

input_json_str = """
{
  "promptVersion": "score-prediction-v2",
  "runId": "bdb4f6b9-6289-43b5-a0a5-06c1c32874e9",
  "createdAt": "2026-06-04T16:59:39.101Z",
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
    "id": "4ba1ef7b-deb9-41e9-9dce-6786ee173e72",
    "providerFixtureId": "1523007",
    "competitionId": "51fd9b84-6409-45be-adf6-2f58793f032f",
    "season": 2026,
    "homeTeamId": "05bf252c-118d-4abe-9336-6f88dc6f3592",
    "awayTeamId": "087f8617-8d6e-49dc-88b3-e1d50516beaa",
    "scheduledAt": "2026-06-05T17:45:00.000Z",
    "status": "scheduled",
    "scoreHome": null,
    "scoreAway": null,
    "includedByFilters": [],
    "metadata": {
      "league": {
        "id": 10,
        "name": "Friendlies",
        "country": "World",
        "season": 2026,
        "round": "Friendly International"
      },
      "teams": {
        "home": {
          "id": 769,
          "name": "Hungary"
        },
        "away": {
          "id": 1099,
          "name": "Finland"
        }
      },
      "venue": "Puskas Arena",
      "round": "Friendly International",
      "timezone": "UTC",
      "apiFootballStatusShort": "NS",
      "apiFootballStatusLong": "Not Started"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1523007",
    "capturedAt": "2026-06-04T16:59:40.731Z",
    "providerSnapshotId": "8953a870-8bbd-4595-a7d9-6a60b7faadad"
  },
  "oddsSnapshot": {
    "id": "f0225310-dd41-4731-a488-bb93c4301baf",
    "fixtureId": "4ba1ef7b-deb9-41e9-9dce-6786ee173e72",
    "providerFixtureId": "1523007",
    "providerSnapshotId": "2f2ddafd-9220-42e0-be8f-2a348dd0ae4d",
    "bookmakerCount": 2,
    "capturedAt": "2026-06-04T16:33:42.129Z",
    "payloadHash": "9fc0e98141b877ef89a9ccdae4876221ed56db8adb82a4908dc3d10e7d12ea09"
  },
  "researchBundle": {
    "id": "51ad0d75-8f93-4782-a95b-501104458cc0",
    "runId": "bdb4f6b9-6289-43b5-a0a5-06c1c32874e9",
    "status": "promotable",
    "gateResult": {
      "reasons": [
        "While odds were available for the 'corners_over_under' market, no supporting evidence could be found from web search to create a confident claim.",
        "objective research gate passed with current web evidence"
      ],
      "verdict": "promotable",
      "warnings": [
        "market corners_over_under skipped/review-required: missing market-specific research evidence"
      ]
    },
    "providerAgentic": "codex",
    "model": "gpt-5.5",
    "promptVersion": "research-fixture-v2",
    "warnings": [
      "market corners_over_under skipped/review-required: missing market-specific research evidence"
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
          "market corners_over_under skipped/review-required: missing market-specific research evidence"
        ],
        "quotedMarkets": [
          "btts",
          "corners_over_under",
          "double_chance",
          "goals_over_under",
          "h2h"
        ],
        "skippedMarkets": [
          {
            "market": "corners_over_under",
            "reason": "missing market-specific research evidence"
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
        "market corners_over_under skipped/review-required: missing market-specific research evidence"
      ],
      "webSearchCoverage": {
        "mode": "live",
        "provider": "codex",
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
      "id": "51ad0d75-8f93-4782-a95b-501104458cc0:source_1",
      "type": "web-search",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQF6KhRXQyNIuJgz57wmwG76yIFD0wwHCp74ldA40O01XqN6_9r_syuPU1MGBayt04MHDW4P7SRCXi6hvgvNVa1QObiaq8qopZMC_koE6qJZQuxJ-m4rzO1CNyAQOHI5kcBJdh7NeB-hkQ==",
      "title": "Hungary vs Finland H2H stats - RSSSF",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:35:10.000Z",
      "metadata": {}
    },
    {
      "id": "51ad0d75-8f93-4782-a95b-501104458cc0:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football odds snapshot",
      "externalId": "1523007",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:33:42.129Z",
      "metadata": {
        "fixtureId": "4ba1ef7b-deb9-41e9-9dce-6786ee173e72",
        "quoteCount": 46,
        "snapshotId": "2f2ddafd-9220-42e0-be8f-2a348dd0ae4d",
        "bookmakerCount": 2,
        "oddsSnapshotId": "f0225310-dd41-4731-a488-bb93c4301baf",
        "providerFixtureId": "1523007"
      }
    },
    {
      "id": "51ad0d75-8f93-4782-a95b-501104458cc0:source_2",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football Odds Snapshot",
      "externalId": "api-football://source_2",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:33:42.129Z",
      "metadata": {
        "provider": "api-football"
      }
    },
    {
      "id": "51ad0d75-8f93-4782-a95b-501104458cc0:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture statistics",
      "externalId": "1523007",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:33:40.964Z",
      "metadata": {
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "ed598514-fe0e-4035-ab89-b00636d2f122",
        "providerFixtureId": "1523007"
      }
    },
    {
      "id": "51ad0d75-8f93-4782-a95b-501104458cc0:source_api_football_fixture",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture",
      "externalId": "1523007",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:33:37.283Z",
      "metadata": {
        "fixtureId": "4ba1ef7b-deb9-41e9-9dce-6786ee173e72",
        "providerFixtureId": "1523007"
      }
    }
  ],
  "evidenceItems": [
    {
      "id": "51ad0d75-8f93-4782-a95b-501104458cc0:evidence_1",
      "sourceId": "51ad0d75-8f93-4782-a95b-501104458cc0:source_1",
      "summary": "Hungary has historically dominated the head-to-head record against Finland.",
      "confidence": 0.9,
      "claimIds": [
        "51ad0d75-8f93-4782-a95b-501104458cc0:claim_1",
        "51ad0d75-8f93-4782-a95b-501104458cc0:claim_4"
      ],
      "metadata": {}
    },
    {
      "id": "51ad0d75-8f93-4782-a95b-501104458cc0:evidence_2",
      "sourceId": "51ad0d75-8f93-4782-a95b-501104458cc0:source_1",
      "summary": "Four of the last five matches between Hungary and Finland have had under 2.5 goals, and three of the last five have seen at least one team fail to score.",
      "confidence": 0.85,
      "claimIds": [
        "51ad0d75-8f93-4782-a95b-501104458cc0:claim_2",
        "51ad0d75-8f93-4782-a95b-501104458cc0:claim_3"
      ],
      "metadata": {}
    },
    {
      "id": "51ad0d75-8f93-4782-a95b-501104458cc0:evidence_3",
      "sourceId": "51ad0d75-8f93-4782-a95b-501104458cc0:source_2",
      "summary": "Bookmakers have priced Hungary as a strong favorite to win the match.",
      "confidence": 0.95,
      "claimIds": [
        "51ad0d75-8f93-4782-a95b-501104458cc0:claim_1"
      ],
      "metadata": {}
    },
    {
      "id": "51ad0d75-8f93-4782-a95b-501104458cc0:evidence_4",
      "sourceId": "51ad0d75-8f93-4782-a95b-501104458cc0:source_2",
      "summary": "The odds slightly favor a low-scoring match with under 2.5 goals.",
      "confidence": 0.8,
      "claimIds": [
        "51ad0d75-8f93-4782-a95b-501104458cc0:claim_2"
      ],
      "metadata": {}
    }
  ],
  "claims": [
    {
      "id": "51ad0d75-8f93-4782-a95b-501104458cc0:claim_1",
      "statement": "Hungary is the favorite to win the match against Finland.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "51ad0d75-8f93-4782-a95b-501104458cc0:evidence_1",
        "51ad0d75-8f93-4782-a95b-501104458cc0:evidence_3"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "51ad0d75-8f93-4782-a95b-501104458cc0:claim_2",
      "statement": "The total number of goals in the match is likely to be under 2.5.",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "51ad0d75-8f93-4782-a95b-501104458cc0:evidence_2",
        "51ad0d75-8f93-4782-a95b-501104458cc0:evidence_4"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "51ad0d75-8f93-4782-a95b-501104458cc0:claim_3",
      "statement": "It is likely that not both teams will score.",
      "marketKey": "btts",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "51ad0d75-8f93-4782-a95b-501104458cc0:evidence_2"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "51ad0d75-8f93-4782-a95b-501104458cc0:claim_4",
      "statement": "Hungary has a high probability of winning or drawing the match.",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "51ad0d75-8f93-4782-a95b-501104458cc0:evidence_1"
      ],
      "conflictStatus": "none"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "cce4096c-808a-4e58-be2b-45a8347f05a2",
      "market": "h2h",
      "selection": "away",
      "line": null,
      "odds": 6,
      "impliedProbability": 0.166667,
      "marketImpliedProbability": 0.173586,
      "marketFairProbability": 0.159822,
      "consensusFairOdds": 6.256943,
      "overround": 0.086689,
      "marketEfficiencyScore": 0.6915,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "12e59d07-6805-4777-bc8b-236c55546434",
      "market": "h2h",
      "selection": "draw",
      "line": null,
      "odds": 3.94,
      "impliedProbability": 0.253807,
      "marketImpliedProbability": 0.265792,
      "marketFairProbability": 0.244501,
      "consensusFairOdds": 4.089966,
      "overround": 0.086689,
      "marketEfficiencyScore": 0.6915,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "b609e2cd-1026-4dca-968d-6c6861002329",
      "market": "h2h",
      "selection": "home",
      "line": null,
      "odds": 1.56,
      "impliedProbability": 0.641026,
      "marketImpliedProbability": 0.64731,
      "marketFairProbability": 0.595677,
      "consensusFairOdds": 1.678763,
      "overround": 0.086689,
      "marketEfficiencyScore": 0.6915,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "694e38a5-fa76-4847-9fa0-04ba7124fddc",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": null,
      "odds": 2.25,
      "impliedProbability": 0.444444,
      "marketImpliedProbability": 0.444444,
      "marketFairProbability": 0.207167,
      "consensusFairOdds": 4.827027,
      "overround": 1.145345,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "c455c258-f177-47b1-ab1b-f1e6e471ed07",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": null,
      "odds": 1.25,
      "impliedProbability": 0.8,
      "marketImpliedProbability": 0.8,
      "marketFairProbability": 0.3729,
      "consensusFairOdds": 2.681682,
      "overround": 1.145345,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "925e92b5-9fac-4499-8772-62c472b10012",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": null,
      "odds": 1.11,
      "impliedProbability": 0.900901,
      "marketImpliedProbability": 0.900901,
      "marketFairProbability": 0.419933,
      "consensusFairOdds": 2.381333,
      "overround": 1.145345,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "58dc02fb-7dd0-4ae7-a48c-9681d818a3a5",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.5,
      "odds": 1.32,
      "impliedProbability": 0.757576,
      "marketImpliedProbability": 0.763403,
      "marketFairProbability": 0.716007,
      "consensusFairOdds": 1.396635,
      "overround": 0.066225,
      "marketEfficiencyScore": 0.7357,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "16e44754-6024-4b1e-83e4-b952b4979cec",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.5,
      "odds": 3.4,
      "impliedProbability": 0.294118,
      "marketImpliedProbability": 0.302822,
      "marketFairProbability": 0.283993,
      "consensusFairOdds": 3.521211,
      "overround": 0.066225,
      "marketEfficiencyScore": 0.7357,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "ea1ef686-7752-4473-8aba-797f86a752b5",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.5,
      "odds": 2,
      "impliedProbability": 0.5,
      "marketImpliedProbability": 0.5,
      "marketFairProbability": 0.474375,
      "consensusFairOdds": 2.108037,
      "overround": 0.054021,
      "marketEfficiencyScore": 0.7698,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "fba8c0bb-6c5b-4ad7-8e31-66f998385a8f",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.5,
      "odds": 1.81,
      "impliedProbability": 0.552486,
      "marketImpliedProbability": 0.554021,
      "marketFairProbability": 0.525625,
      "consensusFairOdds": 1.902497,
      "overround": 0.054021,
      "marketEfficiencyScore": 0.7698,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "6b3350f5-e010-4eb9-a9c0-10b02c5712a8",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.5,
      "odds": 3.5,
      "impliedProbability": 0.285714,
      "marketImpliedProbability": 0.290786,
      "marketFairProbability": 0.272007,
      "consensusFairOdds": 3.676378,
      "overround": 0.069008,
      "marketEfficiencyScore": 0.7342,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "6b354681-04c2-43e5-9c2f-ffbf67a6fc91",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.5,
      "odds": 1.29,
      "impliedProbability": 0.775194,
      "marketImpliedProbability": 0.778222,
      "marketFairProbability": 0.727993,
      "consensusFairOdds": 1.373639,
      "overround": 0.069008,
      "marketEfficiencyScore": 0.7342,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "040c2976-11d7-4720-8e02-c00d7eb26468",
      "market": "goals_over_under",
      "selection": "over",
      "line": 0.5,
      "odds": 1.06,
      "impliedProbability": 0.943396,
      "marketImpliedProbability": 0.943396,
      "marketFairProbability": 0.904159,
      "consensusFairOdds": 1.106,
      "overround": 0.043396,
      "marketEfficiencyScore": 0.6763,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "a15f6388-1e4e-46f0-a343-537e2471528e",
      "market": "goals_over_under",
      "selection": "under",
      "line": 0.5,
      "odds": 10,
      "impliedProbability": 0.1,
      "marketImpliedProbability": 0.1,
      "marketFairProbability": 0.095841,
      "consensusFairOdds": 10.433962,
      "overround": 0.043396,
      "marketEfficiencyScore": 0.6763,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "4f38ae80-7664-4691-b764-cbe2eef1959d",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.5,
      "odds": 7,
      "impliedProbability": 0.142857,
      "marketImpliedProbability": 0.150418,
      "marketFairProbability": 0.141925,
      "consensusFairOdds": 7.045952,
      "overround": 0.059508,
      "marketEfficiencyScore": 0.7543,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "887098bc-58ce-4693-a20c-485118461ca9",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.5,
      "odds": 1.1,
      "impliedProbability": 0.909091,
      "marketImpliedProbability": 0.909091,
      "marketFairProbability": 0.858075,
      "consensusFairOdds": 1.1654,
      "overround": 0.059508,
      "marketEfficiencyScore": 0.7543,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "b88ef2cd-54a8-48d1-8226-9189fccb9e96",
      "market": "goals_over_under",
      "selection": "over",
      "line": 5.5,
      "odds": 15,
      "impliedProbability": 0.066667,
      "marketImpliedProbability": 0.066667,
      "marketFairProbability": 0.064255,
      "consensusFairOdds": 15.563107,
      "overround": 0.03754,
      "marketEfficiencyScore": 0.6885,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "c7063d16-9168-41c5-90f7-9e1d42bd8ddb",
      "market": "goals_over_under",
      "selection": "under",
      "line": 5.5,
      "odds": 1.03,
      "impliedProbability": 0.970874,
      "marketImpliedProbability": 0.970874,
      "marketFairProbability": 0.935745,
      "consensusFairOdds": 1.068667,
      "overround": 0.03754,
      "marketEfficiencyScore": 0.6885,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "a4e220c9-c22b-466d-901b-6425a9c96153",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.25,
      "odds": 1.74,
      "impliedProbability": 0.574713,
      "marketImpliedProbability": 0.574713,
      "marketFairProbability": 0.539683,
      "consensusFairOdds": 1.852941,
      "overround": 0.064909,
      "marketEfficiencyScore": 0.6314,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "9e552cc3-aed2-4c39-a2ca-6e390a1d38e5",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.25,
      "odds": 2.04,
      "impliedProbability": 0.490196,
      "marketImpliedProbability": 0.490196,
      "marketFairProbability": 0.460317,
      "consensusFairOdds": 2.172414,
      "overround": 0.064909,
      "marketEfficiencyScore": 0.6314,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "c0117c22-c2c9-4e8c-a1cc-bd7a4ff9c599",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.75,
      "odds": 2.25,
      "impliedProbability": 0.444444,
      "marketImpliedProbability": 0.444444,
      "marketFairProbability": 0.417098,
      "consensusFairOdds": 2.397516,
      "overround": 0.065562,
      "marketEfficiencyScore": 0.6301,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "bee588c4-a8e1-4808-937c-7d6c5486869e",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.75,
      "odds": 1.61,
      "impliedProbability": 0.621118,
      "marketImpliedProbability": 0.621118,
      "marketFairProbability": 0.582902,
      "consensusFairOdds": 1.715556,
      "overround": 0.065562,
      "marketEfficiencyScore": 0.6301,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "f78af93d-ba96-4668-89cd-25d35f729b83",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3,
      "odds": 2.75,
      "impliedProbability": 0.363636,
      "marketImpliedProbability": 0.363636,
      "marketFairProbability": 0.342105,
      "consensusFairOdds": 2.923077,
      "overround": 0.062937,
      "marketEfficiencyScore": 0.6355,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "45c01539-4fa4-4203-91dd-c53b4f49a7b8",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2,
      "odds": 1.51,
      "impliedProbability": 0.662252,
      "marketImpliedProbability": 0.662252,
      "marketFairProbability": 0.623441,
      "consensusFairOdds": 1.604,
      "overround": 0.062252,
      "marketEfficiencyScore": 0.637,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "9df28db0-0ada-4d76-9edc-34f9a80d3a3c",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2,
      "odds": 2.5,
      "impliedProbability": 0.4,
      "marketImpliedProbability": 0.4,
      "marketFairProbability": 0.376559,
      "consensusFairOdds": 2.655629,
      "overround": 0.062252,
      "marketEfficiencyScore": 0.637,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "628d85c5-392a-4ce4-93a3-e81a00d72a48",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3,
      "odds": 1.43,
      "impliedProbability": 0.699301,
      "marketImpliedProbability": 0.699301,
      "marketFairProbability": 0.657895,
      "consensusFairOdds": 1.52,
      "overround": 0.062937,
      "marketEfficiencyScore": 0.6355,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "7105c75c-3c17-4ff2-93d5-47847cf27706",
      "market": "goals_over_under",
      "selection": "over",
      "line": 6.5,
      "odds": 29,
      "impliedProbability": 0.034483,
      "marketImpliedProbability": 0.034483,
      "marketFairProbability": 0.033655,
      "consensusFairOdds": 29.712871,
      "overround": 0.024582,
      "marketEfficiencyScore": 0.7155,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "ad64b704-2a52-4b83-a8a7-73ac2f3a92b8",
      "market": "goals_over_under",
      "selection": "under",
      "line": 6.5,
      "odds": 1.01,
      "impliedProbability": 0.990099,
      "marketImpliedProbability": 0.990099,
      "marketFairProbability": 0.966345,
      "consensusFairOdds": 1.034828,
      "overround": 0.024582,
      "marketEfficiencyScore": 0.7155,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "f8cad14a-d68f-4f4f-8d87-6ab9f30869e3",
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
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "f31ce613-4071-419d-a5a5-138163bb5572",
      "market": "btts",
      "selection": "no",
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
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "a3231379-2e27-4f23-b5a6-e8bb7e4574f1",
      "market": "btts",
      "selection": "yes",
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
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "b691037b-b91c-49ae-b5b3-1cb39a6ae710",
      "market": "corners_over_under",
      "selection": "over",
      "line": 8.5,
      "odds": 1.73,
      "impliedProbability": 0.578035,
      "marketImpliedProbability": 0.578035,
      "marketFairProbability": 0.536193,
      "consensusFairOdds": 1.865,
      "overround": 0.078035,
      "marketEfficiencyScore": 0.6041,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "432e2083-1746-43c3-93fb-78eaee580797",
      "market": "corners_over_under",
      "selection": "under",
      "line": 8.5,
      "odds": 2,
      "impliedProbability": 0.5,
      "marketImpliedProbability": 0.5,
      "marketFairProbability": 0.463807,
      "consensusFairOdds": 2.156069,
      "overround": 0.078035,
      "marketEfficiencyScore": 0.6041,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "d68a1dca-c083-49c9-a8a9-4a8ace37ac7e",
      "market": "corners_over_under",
      "selection": "over",
      "line": 9,
      "odds": 2,
      "impliedProbability": 0.5,
      "marketImpliedProbability": 0.5,
      "marketFairProbability": 0.473684,
      "consensusFairOdds": 2.111111,
      "overround": 0.055556,
      "marketEfficiencyScore": 0.6509,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    },
    {
      "oddsQuoteId": "531580b8-4ca6-46f6-8868-ae2f30801bbd",
      "market": "corners_over_under",
      "selection": "under",
      "line": 9,
      "odds": 1.8,
      "impliedProbability": 0.555556,
      "marketImpliedProbability": 0.555556,
      "marketFairProbability": 0.526316,
      "consensusFairOdds": 1.9,
      "overround": 0.055556,
      "marketEfficiencyScore": 0.6509,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:33:42.129Z"
    }
  ],
  "providerContextWarnings": [
    "scoring prompt allowedQuotes trimmed from 46 to 35 representative quotes"
  ]
}
"""

input_data = json.loads(input_json_str)

predictions = []
output_warnings = []
output_metadata = {}

# Extracting key data from input
claims_data = input_data["claims"]
evidence_data = input_data["evidenceItems"]
allowed_quotes = input_data["allowedQuotes"]
required_markets = input_data["requiredMarkets"]
research_bundle_warnings = input_data["researchBundle"]["warnings"]

# Helper functions
def get_relevant_claims(market_key, selection_key=None, line=None):
    relevant_claims = []
    for claim in claims_data:
        # Match marketKey
        if claim["marketKey"] == market_key:
            # Match selectionKey if provided. If both are None, they match.
            selection_match = (selection_key == claim["selectionKey"]) or 
                              (selection_key is None and claim["selectionKey"] is None)
            
            # Match line if provided. If both are None, they match.
            line_match = (line == claim["line"]) or 
                         (line is None and claim["line"] is None)
            
            if selection_match and line_match:
                relevant_claims.append(claim)
    return relevant_claims

def get_evidence_ids_from_claims(claims):
    evidence_ids = set()
    for claim in claims:
        evidence_ids.update(claim["evidenceIds"])
    return list(evidence_ids)

def calculate_edge(model_probability, market_fair_probability):
    if market_fair_probability is None or market_fair_probability == 0:
        return 0 # Avoid division by zero if fair probability is missing or zero
    return round(model_probability - market_fair_probability, 6)

def calculate_implied_probability(odds):
    if odds == 0:
        return 0
    return round(1 / odds, 6)

def determine_confidence_and_band(model_probability, market_fair_probability, claims_for_quote, quote_market_efficiency_score):
    confidence = 0.5 # Starting point

    # Stronger confidence if model and market fair probability are aligned
    if market_fair_probability is not None:
        diff = abs(model_probability - market_fair_probability)
        if diff < 0.03: # Very close alignment
            confidence += 0.2
        elif diff < 0.1: # Reasonable alignment
            confidence += 0.1
        else: # Significant divergence, might reduce confidence
            confidence -= 0.1

    # Boost confidence based on number and strength of specific claims
    if claims_for_quote:
        confidence += 0.1 * len(claims_for_quote) # Each claim adds a bit of confidence
        # Could also integrate claim's own confidence if available
        # For this problem, claims don't have explicit confidence, using count as proxy

    # Consider market efficiency (higher efficiency means market is well-priced, might influence confidence in predictions)
    # This is a soft factor. If market is efficient, our model should ideally align, so alignment boosts confidence.
    # If market is very inefficient, and we find an edge, it might be high risk/high reward.
    # For simplicity, I'll keep the previous approach for now.
    confidence += (quote_market_efficiency_score - 0.5) * 0.1 # Smaller impact

    # Cap and floor confidence
    confidence = max(0.1, min(0.99, confidence))
    confidence = round(confidence, 2)

    if confidence >= 0.8:
        confidence_band = "high"
    elif confidence >= 0.6:
        confidence_band = "medium"
    else:
        confidence_band = "low"

    return confidence, confidence_band

def determine_promotability(claims_for_quote, market_key, quote, research_bundle_warnings):
    # A promotable pick requires market-specific evidenceIds/claimIds for the same market/selection/line,
    # or an explicit fallback warning explaining why fixture-level evidence is the best available support.

    if claims_for_quote:
        # If there are claims directly supporting this quote's market, selection, and line, it's promotable.
        return True
    
    # Check if there's a warning indicating missing market-specific research evidence for THIS market.
    # If so, and we have ANY general claims for this market (not necessarily selection/line specific),
    # we can consider it promotable with a warning.
    market_specific_warning = False
    for warning_text in research_bundle_warnings:
        if market_key in warning_text and "missing market-specific research evidence" in warning_text:
            market_specific_warning = True
            break
    
    if market_specific_warning:
        # Check if there are any claims for this market, even if not specific to selection/line
        general_market_claims = get_relevant_claims(market_key)
        if general_market_claims:
            return True # Promotable with fallback rationale
            
    return False

# Main loop to generate predictions for each allowed quote
for quote in allowed_quotes:
    market = quote["market"]
    selection = quote["selection"]
    line = quote["line"]

    # Skip if market is not in required_markets (though allowedQuotes should already filter this)
    if market not in required_markets:
        continue

    claims_for_quote = get_relevant_claims(market, selection, line)
    
    # Determine modelProbability
    model_probability = quote.get("marketFairProbability")
    if model_probability is None:
        model_probability = calculate_implied_probability(quote["odds"])

    # If claims directly support this selection, give a slight boost to model_probability
    if claims_for_quote:
        # Heuristic: increase model probability slightly if strongly supported by claims
        model_probability = min(0.99, model_probability + 0.05 * len(claims_for_quote))
    
    # Ensure probability is within valid range
    model_probability = max(0.01, min(0.99, model_probability))

    edge = calculate_edge(model_probability, quote.get("marketFairProbability"))
    confidence, confidence_band = determine_confidence_and_band(
        model_probability,
        quote.get("marketFairProbability"),
        claims_for_quote,
        quote.get("marketEfficiencyScore", 0.5) # Default to 0.5 if not present
    )
    promotable = determine_promotability(claims_for_quote, market, quote, research_bundle_warnings)

    evidence_ids = get_evidence_ids_from_claims(claims_for_quote)
    claim_ids = [c["id"] for c in claims_for_quote]

    rationale_statements = [c["statement"] for c in claims_for_quote]
    if not rationale_statements:
        rationale = f"Prediction for {market} - {selection}"
        if line is not None:
            rationale += f" {line}"
        rationale += " based on available odds and market data."
    else:
        rationale = "; ".join(rationale_statements)
        # If promotable due to fallback but claims exist, clarify rationale
        if promotable and not claims_for_quote: # This case means promotable by general claims + warning
            rationale += " (Promotable based on general market claims and explicit warning for missing market-specific evidence.)"
        elif not promotable: # Add a note if not promotable despite claims (e.g., claims not specific enough)
             rationale += " (Note: Claims may not be perfectly market/selection/line specific for full promotability without additional evidence.)"


    prediction_warnings = []
    # Add research bundle warning if applicable for corners_over_under and it's not promotable
    if market == "corners_over_under":
        corner_warning = next((w for w in research_bundle_warnings if "corners_over_under" in w), None)
        if corner_warning:
            prediction_warnings.append(corner_warning)
            if not promotable and "Lacks specific research evidence" not in rationale:
                rationale += f" Lacks specific research evidence, making it a speculative pick. Research bundle warning: {corner_warning}"
            elif promotable and "Research bundle warning" not in rationale:
                 rationale += f" Research bundle warning: {corner_warning}"


    predictions.append({
        "oddsQuoteId": quote["oddsQuoteId"],
        "market": market,
        "selection": selection,
        "line": line,
        "odds": quote["odds"],
        "probability": round(model_probability, 6),
        "modelProbability": round(model_probability, 6),
        "marketFairProbability": quote.get("marketFairProbability"),
        "edge": edge,
        "confidence": confidence,
        "confidenceBand": confidence_band,
        "blockers": [], # No specific blockers identified in problem
        "promotable": promotable,
        "evidenceIds": evidence_ids,
        "claimIds": claim_ids,
        "rationale": rationale,
        "warnings": prediction_warnings
    })

final_output = {
    "predictions": predictions,
    "warnings": input_data.get("researchBundle", {}).get("warnings", []), # Copy warnings from research bundle
    "metadata": input_data.get("metadata", {})
}

print(json.dumps(final_output, indent=2))
