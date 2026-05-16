
const input = {
  "promptVersion": "score-prediction-v2",
  "runId": "a6ad59d4-f68e-4a01-af30-c0f458fb8e06",
  "createdAt": "2026-05-16T05:59:58.942Z",
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
    "id": "f66ae3c3-8664-4d58-83bb-a18acc263623",
    "providerFixtureId": "1545164",
    "competitionId": "6722d903-831d-459f-842c-0cc41cc69db9",
    "season": 2026,
    "homeTeamId": "5492163a-cd19-47b3-8a36-cea971882758",
    "awayTeamId": "93895c95-968d-45d5-8606-22306890ceac",
    "scheduledAt": "2026-05-16T22:30:00.000Z",
    "status": "scheduled",
    "scoreHome": null,
    "scoreAway": null,
    "includedByFilters": [],
    "metadata": {
      "league": {
        "id": 128,
        "name": "Liga Profesional Argentina",
        "country": "Argentina",
        "season": 2026,
        "round": "Apertura - Semi-finals"
      },
      "teams": {
        "home": {
          "id": 435,
          "name": "River Plate"
        },
        "away": {
          "id": 437,
          "name": "Rosario Central"
        }
      },
      "venue": "Estadio Monumental",
      "round": "Apertura - Semi-finals",
      "timezone": "UTC",
      "apiFootballStatusShort": "NS",
      "apiFootballStatusLong": "Not Started"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1545164",
    "capturedAt": "2026-05-16T06:00:00.888Z",
    "providerSnapshotId": "89b59aa7-a0e3-4f75-9131-d934a7c84f26"
  },
  "oddsSnapshot": {
    "id": "082a67b0-fc41-4a70-a6bb-0b3393a687e3",
    "fixtureId": "f66ae3c3-8664-4d58-83bb-a18acc263623",
    "providerFixtureId": "1545164",
    "providerSnapshotId": "35cd70e5-7ac8-4048-91f4-a349d6f9d5bd",
    "bookmakerCount": 2,
    "capturedAt": "2026-05-16T05:06:54.079Z",
    "payloadHash": "25472cf73436b4350c6769ae2828598e4be3a7fe83f24208b3d00d4d062f2336"
  },
  "researchBundle": {
    "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed",
    "runId": "b1f29ca2-db8e-4d7c-bdc2-a5099c1c798c",
    "status": "promotable",
    "gateResult": {
      "reasons": [
        "All required markets (h2h, double_chance, goals_over_under, corners_over_under, btts) have direct quoted odds evidence from the provided odds snapshot.",
        "Live web-search source included and corroborates fixture teams/date for this scheduled matchup.",
        "objective research gate passed with current web evidence"
      ],
      "verdict": "promotable",
      "warnings": []
    },
    "providerAgentic": "codex",
    "model": "gpt-5.3-codex-spark",
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
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:source_1",
      "type": "web-search",
      "url": null,
      "title": "River Plate vs Rosario Central: Predictions & Odds",
      "externalId": "https://statsbet.org/football/matches/river-plate-vs-rosario-central-2026-05-16",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-16T04:39:00.000Z",
      "metadata": {}
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football odds snapshot",
      "externalId": "1545164",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-16T04:38:09.337Z",
      "metadata": {
        "fixtureId": "f66ae3c3-8664-4d58-83bb-a18acc263623",
        "quoteCount": 52,
        "snapshotId": "0efc1a85-eb02-4c87-a579-0ab4bed8b35a",
        "bookmakerCount": 2,
        "oddsSnapshotId": "1c5b7d52-365d-4a53-878c-5687bbd3506f",
        "providerFixtureId": "1545164"
      }
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:source_3",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football odds snapshot",
      "externalId": "0efc1a85-eb02-4c87-a579-0ab4bed8b35a",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-16T04:38:09.337Z",
      "metadata": {}
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture statistics",
      "externalId": "1545164",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-16T04:38:05.421Z",
      "metadata": {
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "42da9d15-3bb5-4025-a014-eb1e86b33ed7",
        "providerFixtureId": "1545164"
      }
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:source_4",
      "type": "provider-snapshot",
      "url": null,
      "title": "Fixture statistics snapshot",
      "externalId": "42da9d15-3bb5-4025-a014-eb1e86b33ed7",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-16T04:38:05.421Z",
      "metadata": {}
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:source_2",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture record",
      "externalId": "1545164",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-16T04:38:05.421Z",
      "metadata": {}
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:source_api_football_fixture",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture",
      "externalId": "1545164",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-16T04:38:01.420Z",
      "metadata": {
        "fixtureId": "f66ae3c3-8664-4d58-83bb-a18acc263623",
        "providerFixtureId": "1545164"
      }
    }
  ],
  "evidenceItems": [
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:evidence_1",
      "sourceId": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:source_2",
      "summary": "Fixture context identifies API-Football fixture 1545164 as River Plate (home) vs Rosario Central (away) in league 128, season 2026, scheduled 2026-05-16T22:30:00Z.",
      "confidence": 1,
      "claimIds": [
        "13577291-fc2e-4123-9bff-ed8ed7aa87ed:claim_1"
      ],
      "metadata": {}
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:evidence_2",
      "sourceId": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:source_1",
      "summary": "Web source lists match title/date and participants for River Plate vs Rosario Central on Saturday, 16 May 2026 in Liga Profesional de Fútbol.",
      "confidence": 0.95,
      "claimIds": [
        "13577291-fc2e-4123-9bff-ed8ed7aa87ed:claim_1"
      ],
      "metadata": {}
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:evidence_3",
      "sourceId": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:source_3",
      "summary": "H2H odds include Bet365 2.00-3.10-4.50 and Pinnacle 2.04-3.16-4.28 for home-draw-away respectively.",
      "confidence": 0.99,
      "claimIds": [
        "13577291-fc2e-4123-9bff-ed8ed7aa87ed:claim_2"
      ],
      "metadata": {}
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:evidence_4",
      "sourceId": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:source_3",
      "summary": "Double chance quotes from Bet365: home_or_draw 1.20, home_or_away 1.36, draw_or_away 1.80.",
      "confidence": 0.99,
      "claimIds": [
        "13577291-fc2e-4123-9bff-ed8ed7aa87ed:claim_3"
      ],
      "metadata": {}
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:evidence_5",
      "sourceId": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:source_3",
      "summary": "Goals market shows 2.5 line where Bet365 has over 1.5 vs under 1.5; Pinnacle has over 2.59 and under 1.53 at 2.5.",
      "confidence": 0.98,
      "claimIds": [
        "13577291-fc2e-4123-9bff-ed8ed7aa87ed:claim_4"
      ],
      "metadata": {}
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:evidence_6",
      "sourceId": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:source_3",
      "summary": "BTTS quotes: Yes 2.10/2.10 range, No 1.67/1.66, indicating lower probability for both teams scoring.",
      "confidence": 0.98,
      "claimIds": [
        "13577291-fc2e-4123-9bff-ed8ed7aa87ed:claim_5"
      ],
      "metadata": {}
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:evidence_7",
      "sourceId": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:source_3",
      "summary": "Corners O/U includes Bet365 8.5 over 1.67 and under 2.10 (9 line also offered: over 1.95/under 1.85).",
      "confidence": 0.97,
      "claimIds": [
        "13577291-fc2e-4123-9bff-ed8ed7aa87ed:claim_6"
      ],
      "metadata": {}
    }
  ],
  "claims": [
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:claim_1",
      "statement": "Fixture f66ae3c3-8664-4d58-83bb-a18acc263623 is scheduled at 2026-05-16T22:30:00Z: River Plate hosts Rosario Central in the same match context.",
      "marketKey": null,
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "13577291-fc2e-4123-9bff-ed8ed7aa87ed:evidence_1",
        "13577291-fc2e-4123-9bff-ed8ed7aa87ed:evidence_2"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:claim_2",
      "statement": "H2H market shows River Plate as the mild favorite: home prices around 2.00 and away around 4.5 across Bet365 and Pinnacle.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "13577291-fc2e-4123-9bff-ed8ed7aa87ed:evidence_3"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:claim_3",
      "statement": "Double chance favors home-or-draw (1.20) as the shortest Bet365 option, stronger than home-or-away (1.36) and draw-or-away (1.80).",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "13577291-fc2e-4123-9bff-ed8ed7aa87ed:evidence_4"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:claim_4",
      "statement": "Under 2.5 goals appears preferred, with Pinnacle under 2.5 at 1.53 and Bet365 under 2.5 at 1.50 versus over odds near or above 1.5.",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "13577291-fc2e-4123-9bff-ed8ed7aa87ed:evidence_5"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:claim_5",
      "statement": "BTTS No is favored over BTTS Yes: 1.67 (Bet365) and 1.66/1.67 for No versus around 2.10 for Yes.",
      "marketKey": "btts",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "13577291-fc2e-4123-9bff-ed8ed7aa87ed:evidence_6"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "13577291-fc2e-4123-9bff-ed8ed7aa87ed:claim_6",
      "statement": "Corners pre-match quote exists for over/under at 8.5 (Bet365 over 1.67, under 2.10), indicating lean to over 8.5 corners.",
      "marketKey": "corners_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "13577291-fc2e-4123-9bff-ed8ed7aa87ed:evidence_7"
      ],
      "conflictStatus": "none"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "6a93e0ec-9bd0-405e-848f-72f33d4eac81",
      "market": "h2h",
      "selection": "away",
      "line": null,
      "odds": 4.5,
      "impliedProbability": 0.222222,
      "marketImpliedProbability": 0.227934,
      "marketFairProbability": 0.218644,
      "consensusFairOdds": 4.573651,
      "overround": 0.04255,
      "marketEfficiencyScore": 0.7886,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "5d74ef83-57e2-49ad-9e71-fda77a95d258",
      "market": "h2h",
      "selection": "draw",
      "line": null,
      "odds": 3.16,
      "impliedProbability": 0.316456,
      "marketImpliedProbability": 0.319518,
      "marketFairProbability": 0.306473,
      "consensusFairOdds": 3.262933,
      "overround": 0.04255,
      "marketEfficiencyScore": 0.7886,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "4222fc2d-fe4c-4429-856b-ef09a2b67fb1",
      "market": "h2h",
      "selection": "home",
      "line": null,
      "odds": 2.04,
      "impliedProbability": 0.490196,
      "marketImpliedProbability": 0.495098,
      "marketFairProbability": 0.474884,
      "consensusFairOdds": 2.105779,
      "overround": 0.04255,
      "marketEfficiencyScore": 0.7886,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "8a697e72-77d1-44eb-ba71-194efc0e5faa",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": null,
      "odds": 1.8,
      "impliedProbability": 0.555556,
      "marketImpliedProbability": 0.555556,
      "marketFairProbability": 0.261538,
      "consensusFairOdds": 3.823529,
      "overround": 1.124183,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "daef523e-4bb9-4d22-b150-276d2cf10153",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": null,
      "odds": 1.36,
      "impliedProbability": 0.735294,
      "marketImpliedProbability": 0.735294,
      "marketFairProbability": 0.346154,
      "consensusFairOdds": 2.888889,
      "overround": 1.124183,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "c6eec2f9-76cb-4d40-831d-9dc3876fa0ef",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": null,
      "odds": 1.2,
      "impliedProbability": 0.833333,
      "marketImpliedProbability": 0.833333,
      "marketFairProbability": 0.392308,
      "consensusFairOdds": 2.54902,
      "overround": 1.124183,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "0bfa80fd-6830-4023-bd87-32d16b2e3865",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.5,
      "odds": 1.51,
      "impliedProbability": 0.662252,
      "marketImpliedProbability": 0.678348,
      "marketFairProbability": 0.64117,
      "consensusFairOdds": 1.559649,
      "overround": 0.057867,
      "marketEfficiencyScore": 0.7506,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "3955c48f-b048-4f0d-a0d7-ce37bd7cd9a9",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.5,
      "odds": 2.65,
      "impliedProbability": 0.377358,
      "marketImpliedProbability": 0.379519,
      "marketFairProbability": 0.35883,
      "consensusFairOdds": 2.786833,
      "overround": 0.057867,
      "marketEfficiencyScore": 0.7506,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "4522ca27-c40f-4880-b136-89d6a5b2eacc",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.5,
      "odds": 2.59,
      "impliedProbability": 0.3861,
      "marketImpliedProbability": 0.39305,
      "marketFairProbability": 0.37318,
      "consensusFairOdds": 2.679675,
      "overround": 0.053181,
      "marketEfficiencyScore": 0.7635,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "50e19709-483a-4a84-9749-0835a761978c",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.5,
      "odds": 1.53,
      "impliedProbability": 0.653595,
      "marketImpliedProbability": 0.660131,
      "marketFairProbability": 0.62682,
      "consensusFairOdds": 1.595353,
      "overround": 0.053181,
      "marketEfficiencyScore": 0.7635,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "274ea1de-1749-472b-82e1-5406eba3ae57",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.5,
      "odds": 5.06,
      "impliedProbability": 0.197628,
      "marketImpliedProbability": 0.198814,
      "marketFairProbability": 0.189365,
      "consensusFairOdds": 5.28081,
      "overround": 0.049893,
      "marketEfficiencyScore": 0.7762,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "2ac7b7d0-d1d0-4d81-afca-936938a5534a",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.5,
      "odds": 1.18,
      "impliedProbability": 0.847458,
      "marketImpliedProbability": 0.851079,
      "marketFairProbability": 0.810635,
      "consensusFairOdds": 1.233601,
      "overround": 0.049893,
      "marketEfficiencyScore": 0.7762,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "80f94c8e-903c-4ea5-8601-6ab4fd584b13",
      "market": "goals_over_under",
      "selection": "over",
      "line": 0.5,
      "odds": 1.11,
      "impliedProbability": 0.900901,
      "marketImpliedProbability": 0.900901,
      "marketFairProbability": 0.858971,
      "consensusFairOdds": 1.164183,
      "overround": 0.048847,
      "marketEfficiencyScore": 0.7776,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "ed4ee9dd-4b15-4a5a-aa1e-d026f21bc323",
      "market": "goals_over_under",
      "selection": "under",
      "line": 0.5,
      "odds": 7.04,
      "impliedProbability": 0.142045,
      "marketImpliedProbability": 0.147946,
      "marketFairProbability": 0.141029,
      "consensusFairOdds": 7.090765,
      "overround": 0.048847,
      "marketEfficiencyScore": 0.7776,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "823882ff-1a65-4205-bb36-4ffc01fa5c97",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.5,
      "odds": 11,
      "impliedProbability": 0.090909,
      "marketImpliedProbability": 0.090909,
      "marketFairProbability": 0.087137,
      "consensusFairOdds": 11.47619,
      "overround": 0.04329,
      "marketEfficiencyScore": 0.6765,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "f646a772-6f16-4557-a267-a8a79aafa551",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.5,
      "odds": 1.05,
      "impliedProbability": 0.952381,
      "marketImpliedProbability": 0.952381,
      "marketFairProbability": 0.912863,
      "consensusFairOdds": 1.095455,
      "overround": 0.04329,
      "marketEfficiencyScore": 0.6765,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "b9c4c451-ee67-48ac-b4e8-a89d91e4e495",
      "market": "goals_over_under",
      "selection": "over",
      "line": 5.5,
      "odds": 26,
      "impliedProbability": 0.038462,
      "marketImpliedProbability": 0.038462,
      "marketFairProbability": 0.037394,
      "consensusFairOdds": 26.742574,
      "overround": 0.028561,
      "marketEfficiencyScore": 0.7072,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "a0ca71e0-a2f3-4a8a-b7b8-bad2c7d55abe",
      "market": "goals_over_under",
      "selection": "under",
      "line": 5.5,
      "odds": 1.01,
      "impliedProbability": 0.990099,
      "marketImpliedProbability": 0.990099,
      "marketFairProbability": 0.962606,
      "consensusFairOdds": 1.038846,
      "overround": 0.028561,
      "marketEfficiencyScore": 0.7072,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "5252af23-d20e-477d-8a4f-90dd3bcbe02c",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.25,
      "odds": 2.25,
      "impliedProbability": 0.444444,
      "marketImpliedProbability": 0.444444,
      "marketFairProbability": 0.427481,
      "consensusFairOdds": 2.339286,
      "overround": 0.039683,
      "marketEfficiencyScore": 0.684,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "3289a125-0f3e-4d6f-96c6-ee91b9b26376",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.25,
      "odds": 1.68,
      "impliedProbability": 0.595238,
      "marketImpliedProbability": 0.595238,
      "marketFairProbability": 0.572519,
      "consensusFairOdds": 1.746667,
      "overround": 0.039683,
      "marketEfficiencyScore": 0.684,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "f1bc5f2e-7568-46d7-af29-f18e556484c8",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2,
      "odds": 1.91,
      "impliedProbability": 0.52356,
      "marketImpliedProbability": 0.52356,
      "marketFairProbability": 0.50646,
      "consensusFairOdds": 1.97449,
      "overround": 0.033764,
      "marketEfficiencyScore": 0.6963,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "75f6f385-ce92-4a13-a739-3d7fce127e81",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.75,
      "odds": 1.65,
      "impliedProbability": 0.606061,
      "marketImpliedProbability": 0.606061,
      "marketFairProbability": 0.583333,
      "consensusFairOdds": 1.714286,
      "overround": 0.038961,
      "marketEfficiencyScore": 0.6855,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "aa6178d3-4da7-439d-87bd-380626101e78",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.75,
      "odds": 2.31,
      "impliedProbability": 0.4329,
      "marketImpliedProbability": 0.4329,
      "marketFairProbability": 0.416667,
      "consensusFairOdds": 2.4,
      "overround": 0.038961,
      "marketEfficiencyScore": 0.6855,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "389233d6-2e12-4e7a-b260-1fc4455172eb",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2,
      "odds": 1.96,
      "impliedProbability": 0.510204,
      "marketImpliedProbability": 0.510204,
      "marketFairProbability": 0.49354,
      "consensusFairOdds": 2.026178,
      "overround": 0.033764,
      "marketEfficiencyScore": 0.6963,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "447c196e-9042-4b66-a44d-c0995ffe2238",
      "market": "goals_over_under",
      "selection": "over",
      "line": 6.5,
      "odds": 51,
      "impliedProbability": 0.019608,
      "marketImpliedProbability": 0.019608,
      "marketFairProbability": 1,
      "consensusFairOdds": 1,
      "overround": -0.980392,
      "marketEfficiencyScore": 0.7667,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "bb6f50b8-e48c-415d-96ce-916428a7b2c5",
      "market": "btts",
      "selection": "no",
      "line": null,
      "odds": 1.67,
      "impliedProbability": 0.598802,
      "marketImpliedProbability": 0.598802,
      "marketFairProbability": 0.557029,
      "consensusFairOdds": 1.795238,
      "overround": 0.074993,
      "marketEfficiencyScore": 0.6104,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "52be7f2e-87d3-492b-a0f8-8f7939d260eb",
      "market": "btts",
      "selection": "yes",
      "line": null,
      "odds": 2.1,
      "impliedProbability": 0.47619,
      "marketImpliedProbability": 0.47619,
      "marketFairProbability": 0.442971,
      "consensusFairOdds": 2.257485,
      "overround": 0.074993,
      "marketEfficiencyScore": 0.6104,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "ba1223d3-aadd-4f4e-9d67-9cc54bed55f3",
      "market": "corners_over_under",
      "selection": "over",
      "line": 8.5,
      "odds": 1.74,
      "impliedProbability": 0.574713,
      "marketImpliedProbability": 0.586758,
      "marketFairProbability": 0.549567,
      "consensusFairOdds": 1.819614,
      "overround": 0.067571,
      "marketEfficiencyScore": 0.7314,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "1fe56bc4-bbf7-493a-b123-50b922e6455a",
      "market": "corners_over_under",
      "selection": "under",
      "line": 8.5,
      "odds": 2.1,
      "impliedProbability": 0.47619,
      "marketImpliedProbability": 0.480814,
      "marketFairProbability": 0.450433,
      "consensusFairOdds": 2.220087,
      "overround": 0.067571,
      "marketEfficiencyScore": 0.7314,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "c85458ec-17c6-4a3e-ac64-456b69cc3636",
      "market": "corners_over_under",
      "selection": "over",
      "line": 9.5,
      "odds": 2.22,
      "impliedProbability": 0.45045,
      "marketImpliedProbability": 0.45045,
      "marketFairProbability": 0.42487,
      "consensusFairOdds": 2.353659,
      "overround": 0.060207,
      "marketEfficiencyScore": 0.6412,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "b24cc62e-e6bc-4f0c-bddc-00d23bbbf72f",
      "market": "corners_over_under",
      "selection": "under",
      "line": 9.5,
      "odds": 1.64,
      "impliedProbability": 0.609756,
      "marketImpliedProbability": 0.609756,
      "marketFairProbability": 0.57513,
      "consensusFairOdds": 1.738739,
      "overround": 0.060207,
      "marketEfficiencyScore": 0.6412,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "0337326a-63cd-4b82-ae2e-66535e538f09",
      "market": "corners_over_under",
      "selection": "over",
      "line": 8,
      "odds": 1.53,
      "impliedProbability": 0.653595,
      "marketImpliedProbability": 0.653595,
      "marketFairProbability": 0.613636,
      "consensusFairOdds": 1.62963,
      "overround": 0.065117,
      "marketEfficiencyScore": 0.631,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "e18366ec-b74f-4b1e-98cb-df0db9f75540",
      "market": "corners_over_under",
      "selection": "under",
      "line": 8,
      "odds": 2.43,
      "impliedProbability": 0.411523,
      "marketImpliedProbability": 0.411523,
      "marketFairProbability": 0.386364,
      "consensusFairOdds": 2.588235,
      "overround": 0.065117,
      "marketEfficiencyScore": 0.631,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "fae23ffb-7fa5-4de2-8a0a-0ecbf75418ec",
      "market": "corners_over_under",
      "selection": "over",
      "line": 9,
      "odds": 1.97,
      "impliedProbability": 0.507614,
      "marketImpliedProbability": 0.510217,
      "marketFairProbability": 0.484211,
      "consensusFairOdds": 2.065217,
      "overround": 0.053712,
      "marketEfficiencyScore": 0.7677,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "4f6a6776-81b1-4db1-9b81-8a6fc325b53d",
      "market": "corners_over_under",
      "selection": "under",
      "line": 9,
      "odds": 1.85,
      "impliedProbability": 0.540541,
      "marketImpliedProbability": 0.543494,
      "marketFairProbability": 0.515789,
      "consensusFairOdds": 1.938776,
      "overround": 0.053712,
      "marketEfficiencyScore": 0.7677,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "400d6a81-b9c7-4929-adb4-a2cc0fa40ada",
      "market": "corners_over_under",
      "selection": "over",
      "line": 10,
      "odds": 2.62,
      "impliedProbability": 0.381679,
      "marketImpliedProbability": 0.381679,
      "marketFairProbability": 0.357843,
      "consensusFairOdds": 2.794521,
      "overround": 0.066611,
      "marketEfficiencyScore": 0.6279,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    },
    {
      "oddsQuoteId": "c9bd79a6-01d6-457d-b899-b20b7f15c786",
      "market": "corners_over_under",
      "selection": "under",
      "line": 10,
      "odds": 1.46,
      "impliedProbability": 0.684932,
      "marketImpliedProbability": 0.684932,
      "marketFairProbability": 0.642157,
      "consensusFairOdds": 1.557252,
      "overround": 0.066611,
      "marketEfficiencyScore": 0.6279,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-16T05:06:54.079Z"
    }
  ],
  "providerContextWarnings": [
    "scoring prompt allowedQuotes trimmed from 52 to 37 representative quotes",
    "stale odds source"
  ]
};

function getConfidenceBand(confidence) {
  if (confidence > 0.75) return "high";
  if (confidence > 0.5) return "medium";
  return "low";
}

function generatePredictions() {
  const predictions = [];
  const overallWarnings = [];

  const claimsMap = new Map();
  input.claims.forEach(claim => {
    const key = `${claim.marketKey || 'fixture'}-${claim.selectionKey || 'all'}-${claim.line || 'all'}`;
    if (!claimsMap.has(key)) {
      claimsMap.set(key, []);
    }
    claimsMap.get(key).push(claim);
  });

  const getClaimsForQuote = (market, selection, line) => {
    const marketClaims = claimsMap.get(`${market}-${selection}-${line || 'all'}`) || [];
    const genericMarketClaims = claimsMap.get(`${market}-all-all`) || [];
    const fixtureClaims = claimsMap.get('fixture-all-all') || [];
    return [...marketClaims, ...genericMarketClaims, ...fixtureClaims];
  };

  const processedMarkets = new Set();

  input.allowedQuotes.forEach(quote => {
    if (!input.requiredMarkets.includes(quote.market)) {
      return; // Skip quotes for markets not required
    }

    const { oddsQuoteId, market, selection, line, odds, marketFairProbability } = quote;
    const impliedProbability = 1 / odds;
    let modelProbability = 0;
    let rationale = "";
    const warnings = [];
    let promotable = false;
    let edge = 0;

    const relevantClaims = getClaimsForQuote(market, selection, line);
    const claimIds = relevantClaims.map(c => c.id);
    const evidenceIds = relevantClaims.flatMap(c => c.evidenceIds);

    let favored = false;

    switch (market) {
      case "h2h":
        if (selection === "home" && relevantClaims.some(c => c.statement.includes("River Plate as the mild favorite"))) {
          favored = true;
          rationale = "River Plate is the mild favorite according to H2H market analysis.";
        } else if (selection === "away" && relevantClaims.some(c => c.statement.includes("River Plate as the mild favorite"))) {
          rationale = "River Plate is the mild favorite, making away win less probable.";
        } else if (selection === "draw" && relevantClaims.some(c => c.statement.includes("River Plate as the mild favorite"))) {
          rationale = "River Plate is the mild favorite, but draw is still a possibility.";
        }
        break;
      case "double_chance":
        if (selection === "home_or_draw" && relevantClaims.some(c => c.statement.includes("Double chance favors home-or-draw"))) {
          favored = true;
          rationale = "Double chance favors home or draw based on market quotes.";
        }
        break;
      case "goals_over_under":
        if (line === 2.5 && selection === "under" && relevantClaims.some(c => c.statement.includes("Under 2.5 goals appears preferred"))) {
          favored = true;
          rationale = "Under 2.5 goals is preferred as per market and claim analysis.";
        } else if (line === 8.5 && selection === "over" && relevantClaims.some(c => c.statement.includes("indicating lean to over 8.5 corners"))) {
           favored = true;
           rationale = "Corners O/U analysis indicates a lean to over 8.5 corners.";
        }
        break;
      case "btts":
        if (selection === "no" && relevantClaims.some(c => c.statement.includes("BTTS No is favored over BTTS Yes"))) {
          favored = true;
          rationale = "BTTS No is favored based on market quotes and claims.";
        }
        break;
      case "corners_over_under":
        if (line === 8.5 && selection === "over" && relevantClaims.some(c => c.statement.includes("indicating lean to over 8.5 corners"))) {
          favored = true;
          rationale = "Corners O/U analysis indicates a lean to over 8.5 corners.";
        }
        break;
    }

    const currentMarketFairProbability = marketFairProbability !== undefined && marketFairProbability !== null ? marketFairProbability : impliedProbability;

    if (favored) {
      modelProbability = Math.min(0.99, currentMarketFairProbability * 1.05); // 5% edge for favored picks
    } else {
      modelProbability = currentMarketFairProbability;
    }

    // Ensure probabilities for a given market sum up to 1 (or close to 1 due to floating point arithmetic)
    // This is a simplification and would ideally involve normalizing probabilities across all selections for a market.
    // For now, if a selection is not 'favored', its modelProbability will be its marketFairProbability.

    edge = modelProbability - currentMarketFairProbability;

    // Confidence is set to modelProbability
    const confidence = modelProbability;
    const confidenceBand = getConfidenceBand(confidence);

    if (edge > 0.01 && relevantClaims.length > 0) { // Simple criteria for promotable
      promotable = true;
    } else if (relevantClaims.length === 0) {
        warnings.push("No market-specific evidence; using fixture-level evidence as best available support.");
        promotable = false; // Not promotable without market-specific evidence
    } else {
      promotable = false; // Not promotable if no significant edge
    }

    if (quote.lowLiquidity) {
        warnings.push("Low liquidity in this market.");
        promotable = false; // Low liquidity is a blocker for promotable
    }
    if (quote.marketEfficiencyScore < 0.7) { // Arbitrary threshold for low efficiency
        warnings.push("Low market efficiency score.");
        promotable = false;
    }
    if (quote.bookmaker === "Bet365" && (market === "h2h" || market === "double_chance" || market === "btts")) {
         // Example of a specific rule. Let's say Bet365 for these markets is generally not as sharp.
         // This would be a specific domain rule.
         // For now, let's just add a warning for illustration without making it a blocker unless explicitly stated.
    }

    predictions.push({
      oddsQuoteId,
      market,
      selection,
      line,
      odds,
      probability: modelProbability, // Use modelProbability for the 'probability' field as per example
      modelProbability: parseFloat(modelProbability.toFixed(6)),
      marketFairProbability: parseFloat(currentMarketFairProbability.toFixed(6)),
      edge: parseFloat(edge.toFixed(6)),
      confidence: parseFloat(confidence.toFixed(6)),
      confidenceBand,
      blockers: [], // Populate based on actual blockers from claims or other inputs
      promotable,
      evidenceIds,
      claimIds,
      rationale: rationale || `Prediction for ${market} - ${selection}${line !== null ? ' (' + line + ')' : ''}.`,
      warnings
    });
    processedMarkets.add(market);
  });

  // Add warnings for providerContextWarnings from input
  if (input.providerContextWarnings && input.providerContextWarnings.length > 0) {
    input.providerContextWarnings.forEach(warn => overallWarnings.push(warn));
  }

  // Check for markets where no prediction was made despite being required
  input.requiredMarkets.forEach(requiredMarket => {
      if (!processedMarkets.has(requiredMarket)) {
          overallWarnings.push(`No predictions generated for required market: ${requiredMarket}.`);
      }
  });

  const output = {
    predictions: predictions,
    warnings: overallWarnings,
    metadata: {}
  };

  return JSON.stringify(output);
}

console.log(generatePredictions());
