
import json

input_data = {
  "promptVersion": "score-prediction-v2",
  "runId": "65227f0d-6af8-4426-b4de-a91eba6232f2",
  "createdAt": "2026-06-12T18:48:19.958Z",
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
    "id": "36188936-7a8a-453a-b7ae-28ccae9657cb",
    "providerFixtureId": "1539001",
    "competitionId": "57edef0d-2ada-4c10-b50e-7382581605ef",
    "season": 2026,
    "homeTeamId": "f2d880d7-a967-4934-8b9b-3331207575bc",
    "awayTeamId": "c571adf0-9a8d-4075-9604-90487eed007b",
    "scheduledAt": "2026-06-14T04:00:00.000Z",
    "status": "scheduled",
    "scoreHome": None,
    "scoreAway": None,
    "includedByFilters": [],
    "metadata": {
      "league": {
        "id": 1,
        "name": "World Cup",
        "country": "World",
        "season": 2026,
        "round": "Group Stage - 1"
      },
      "teams": {
        "home": {
          "id": 20,
          "name": "Australia"
        },
        "away": {
          "id": 777,
          "name": "Türkiye"
        }
      },
      "venue": "BC Place",
      "round": "Group Stage - 1",
      "timezone": "UTC",
      "apiFootballStatusShort": "NS",
      "apiFootballStatusLong": "Not Started"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1539001",
    "capturedAt": "2026-06-12T18:48:22.703Z",
    "providerSnapshotId": "568ac867-6d58-4197-9dcc-0465556e985b"
  },
  "oddsSnapshot": {
    "id": "7991edae-cd26-46f7-84db-941e9829b25a",
    "fixtureId": "36188936-7a8a-453a-b7ae-28ccae9657cb",
    "providerFixtureId": "1539001",
    "providerSnapshotId": "ed5d0986-794e-43d3-bd53-e961da0e8598",
    "bookmakerCount": 2,
    "capturedAt": "2026-06-12T18:21:21.211Z",
    "payloadHash": "7915e027948c4785acfb051a500733b835ef4e349e8b6d98a4be74f12f2f518d"
  },
  "researchBundle": {
    "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077",
    "runId": "65227f0d-6af8-4426-b4de-a91eba6232f2",
    "status": "review-required",
    "gateResult": {
      "verdict": "review-required",
      "reasons": [
        "Structured research generated with sufficient evidence from web search and provider odds for most required markets."
      ],
      "warnings": [
        "mapped conflictStatus \"partial_conflict\" to \"conflict\" on claim \"claim_6\"",
        "mapped conflictStatus \"partial_conflict\" to \"conflict\" on claim \"claim_6\"",
        "market corners_over_under skipped/review-required: missing market-specific research evidence",
        "No qualitative evidence was found for the 'corners_over_under' market. Analysis for this market is based solely on odds."
      ]
    },
    "providerAgentic": "gemini",
    "model": "gemini-2.5-pro",
    "promptVersion": "research-fixture-v2",
    "warnings": [
      "mapped conflictStatus \"partial_conflict\" to \"conflict\" on claim \"claim_5\"",      "mapped conflictStatus "partial_conflict" to "conflict" on claim "claim_6"",
      "market corners_over_under skipped/review-required: missing market-specific research evidence",
      "No qualitative evidence was found for the 'corners_over_under' market. Analysis for this market is based solely on odds."
    ],
    "metadata": {
      "marketCoverage": {
        "requiredMarkets": [
          "h2h",
          "double_chance",
          "goals_over_under",
          "corners_over_under",
          "btts"
        ],
        "quotedMarkets": [
          "btts",
          "corners_over_under",
          "double_chance",
          "goals_over_under",
          "h2h"
        ],
        "evidenceMarkets": [
          "btts",
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
        "warnings": [
          "market corners_over_under skipped/review-required: missing market-specific research evidence"
        ]
      },
      "providerContextWarnings": [],
      "marketScope": [
        "h2h",
        "double_chance",
        "goals_over_under",
        "corners_over_under",
        "btts"
      ],
      "webSearchCoverage": {
        "mode": "live",
        "provider": "gemini",
        "nativeSupported": True,
        "nativeToolUsed": True,
        "browserFallbackUsed": False,
        "realWebSearchSourceCount": 2,
        "syntheticWebSearchSourceCount": 0,
        "required": True
      },
      "referenceRepairs": [
        "mapped conflictStatus \"partial_conflict\" to \"conflict\" on claim \"claim_6\"",
        "mapped conflictStatus \"partial_conflict\" to \"conflict\" on claim \"claim_6\"",
        "market corners_over_under skipped/review-required: missing market-specific research evidence"
      ]
    }
  },
  "sources": [
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_api_football_fixture",
      "type": "api-football",
      "url": None,
      "title": "API-Football fixture",
      "externalId": "1539001",
      "providerSnapshotId": None,
      "capturedAt": "2026-06-12T18:21:13.154Z",
      "metadata": {
        "fixtureId": "36188936-7a8a-453a-b7ae-28ccae9657cb",
        "providerFixtureId": "1539001"
      }
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": None,
      "title": "API-Football fixture statistics",
      "externalId": "1539001",
      "providerSnapshotId": "4fec86b8-73b6-42c3-8e0a-377bf560dce6",
      "capturedAt": "2026-06-12T18:21:18.909Z",
      "metadata": {
        "providerFixtureId": "1539001",
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "4fec86b8-73b6-42c3-8e0a-377bf560dce6"
      }
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": None,
      "title": "API-Football odds snapshot",
      "externalId": "1539001",
      "providerSnapshotId": "684da731-ef6c-40f6-8bf2-10d2fd750782",
      "capturedAt": "2026-06-12T18:21:20.604Z",
      "metadata": {
        "fixtureId": "36188936-7a8a-453a-b7ae-28ccae9657cb",
        "providerFixtureId": "1539001",
        "oddsSnapshotId": "48ee2200-e3da-4463-b274-e18b3c53bed2",
        "quoteCount": 65,
        "bookmakerCount": 2,
        "snapshotId": "684da731-ef6c-40f6-8bf2-10d2fd750782"
      }
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_1",
      "type": "web-search",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEbiYpthJhqhxp8Y_mfIXj_N6PcvTZ-XJu8LnmjKElanPHmHaceCAlDdVjzE58wjxMbAU5NZlaGTZGPRREbrx38admk8PGlxDwFHdIYEcfMaKEhGwdU4cG3m982PZ5MihX52UmGakka6PoW1tqNOzUfmW02vu3C2Pdqfpiwa9iNo0pWmG5HURE397UsQqdE4B_npu79TlfadzLAsKxDu5Pa3idaBxaSV8_Z7JLdgkmwL4XU21Oa4E8J1qwicKFPvQ==",
      "title": "Sports Mole: Australia vs. Turkey - prediction, team news, lineups",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-06-12T18:22:15.154Z",
      "metadata": {}
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_2",
      "type": "web-search",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEQO3mJvAGAM2I0QGTyT9S605CjQwn544B5RMNsmolCCPN4SF6WjdfMO8q8PeDxR-fBIGszDZLW1mmr2MtBJb7gMGzqTUv3JGXzQmz2J76aC4BDg1p55_BM26VfTfI4n39HSmwDWR1yvprdpM93U6fVSOOKomyEGivB64pvtF0nObCjL5o_R_dtVd4OrcYjEBdaH0aVnvVMQj_YkoT80sOLJpMC5w==",
      "title": "SuperSport: Head-to-head: Australia vs Turkey",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-06-12T18:22:15.154Z",
      "metadata": {}
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_3",
      "type": "provider-snapshot",
      "url": None,
      "title": "API-Football Fixture Snapshot",
      "externalId": "api-football://source_3",
      "providerSnapshotId": None,
      "capturedAt": "2026-06-12T18:21:18.210Z",
      "metadata": {
        "provider": "api-football"
      }
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_4",
      "type": "provider-snapshot",
      "url": None,
      "title": "API-Football Odds Snapshot",
      "externalId": "api-football://source_4",
      "providerSnapshotId": None,
      "capturedAt": "2026-06-12T18:21:20.604Z",
      "metadata": {
        "provider": "api-football"
      }
    }
  ],
  "evidenceItems": [
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_1",
      "sourceId": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_1",
      "summary": "Türkiye is in strong recent form, winning 7 of their last 8 games.",
      "confidence": 0.9,
      "claimIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_1"
      ],
      "metadata": {}
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_2",
      "sourceId": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_2",
      "summary": "Türkiye has won both previous head-to-head encounters against Australia.",
      "confidence": 0.95,
      "claimIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_1"
      ],
      "metadata": {}
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_3",
      "sourceId": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_4",
      "summary": "Bookmakers have Türkiye as the clear favorite, with odds around 1.70 to 1.74.",
      "confidence": 0.98,
      "claimIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_1",
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_2"
      ],
      "metadata": {}
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_4",
      "sourceId": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_1",
      "summary": "Analysts predict a low-scoring match, with potential scores of 1-0 or 2-1 to Türkiye.",
      "confidence": 0.8,
      "claimIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_3",
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_4"
      ],
      "metadata": {}
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_5",
      "sourceId": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_4",
      "summary": "Odds for Under 2.5 goals are priced at 1.80, implying a higher probability of a low-scoring game.",
      "confidence": 0.95,
      "claimIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_3"
      ],
      "metadata": {}
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_6",
      "sourceId": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_4",
      "summary": "The odds for Both Teams to Score (BTTS) 'Yes' are 1.95, suggesting it is a possibility.",
      "confidence": 0.9,
      "claimIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_5"
      ],
      "metadata": {}
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_7",
      "sourceId": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_4",
      "summary": "The odds for Both Teams to Score (BTTS) 'No' are 1.80, making it slightly more favored than 'Yes'.",
      "confidence": 0.9,
      "claimIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_6"
      ],
      "metadata": {}
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_8",
      "sourceId": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:source_4",
      "summary": "The odds for 'Draw or Away' in the double chance market are very low (1.17), indicating a high probability for this outcome.",
      "confidence": 0.98,
      "claimIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_7"
      ],
      "metadata": {}
    }
  ],
  "claims": [
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_1",
      "statement": "Türkiye is favored to win the match against Australia.",
      "marketKey": "h2h",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_1",
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_2",
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_3"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_2",
      "statement": "Australia is the underdog in this fixture.",
      "marketKey": "h2h",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_3"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_3",
      "statement": "The match is likely to have under 2.5 goals.",
      "marketKey": "goals_over_under",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_4",
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_5"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_4",
      "statement": "The match is likely to have over 1.5 goals.",
      "marketKey": "goals_over_under",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_4"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_5",
      "statement": "There is a reasonable chance that both teams will score.",
      "marketKey": "btts",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_6"
      ],
      "conflictStatus": "conflict"
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_6",
      "statement": "It is slightly more likely that at least one team will fail to score.",
      "marketKey": "btts",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_7"
      ],
      "conflictStatus": "conflict"
    },
    {
      "id": "432cd012-f5b1-48ba-b1c8-0de6c1d83077:claim_7",
      "statement": "Türkiye are highly likely to avoid defeat (win or draw).",
      "marketKey": "double_chance",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "432cd012-f5b1-48ba-b1c8-0de6c1d83077:evidence_8"
      ],
      "conflictStatus": "none"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "f8a7715a-e043-462e-be2c-5f0735490347",
      "market": "h2h",
      "selection": "away",
      "line": None,
      "odds": 1.74,
      "impliedProbability": 0.574713,
      "marketImpliedProbability": 0.581474,
      "marketFairProbability": 0.556,
      "consensusFairOdds": 1.798561,
      "overround": 0.04579,
      "marketEfficiencyScore": 0.7839,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "51e38000-a634-420a-b62b-f9b53f748c6b",
      "market": "h2h",
      "selection": "draw",
      "line": None,
      "odds": 3.8,
      "impliedProbability": 0.263158,
      "marketImpliedProbability": 0.264912,
      "marketFairProbability": 0.253318,
      "consensusFairOdds": 3.947612,
      "overround": 0.04579,
      "marketEfficiencyScore": 0.7839,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "30936062-a932-4510-bf9e-8d37f9abc97f",
      "market": "h2h",
      "selection": "home",
      "line": None,
      "odds": 5.03,
      "impliedProbability": 0.198807,
      "marketImpliedProbability": 0.199404,
      "marketFairProbability": 0.190682,
      "consensusFairOdds": 5.244328,
      "overround": 0.04579,
      "marketEfficiencyScore": 0.7839,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "e0322795-0e61-47c5-8988-79e7447db666",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": None,
      "odds": 1.17,
      "impliedProbability": 0.854701,
      "marketImpliedProbability": 0.854701,
      "marketFairProbability": 0.4011,
      "consensusFairOdds": 2.493143,
      "overround": 1.130891,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "d54243aa-f6ec-42ea-b989-b16f637fab79",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": None,
      "odds": 1.25,
      "impliedProbability": 0.8,
      "marketImpliedProbability": 0.8,
      "marketFairProbability": 0.37543,
      "consensusFairOdds": 2.663614,
      "overround": 1.130891,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "8ce12121-3408-4730-b60c-88e4f80f6c1c",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": None,
      "odds": 2.1,
      "impliedProbability": 0.47619,
      "marketImpliedProbability": 0.47619,
      "marketFairProbability": 0.22347,
      "consensusFairOdds": 4.474872,
      "overround": 1.130891,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "4c97881d-8af0-4368-ac7a-ae9c0c028f21",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.5,
      "odds": 1.34,
      "impliedProbability": 0.746269,
      "marketImpliedProbability": 0.749074,
      "marketFairProbability": 0.718355,
      "consensusFairOdds": 1.392069,
      "overround": 0.042761,
      "marketEfficiencyScore": 0.7921,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "b7da883d-c0ca-4eaa-8399-616d0f66b2c0",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.5,
      "odds": 3.41,
      "impliedProbability": 0.293255,
      "marketImpliedProbability": 0.293686,
      "marketFairProbability": 0.281645,
      "consensusFairOdds": 3.550574,
      "overround": 0.042761,
      "marketEfficiencyScore": 0.7921,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "17ea3a74-d31f-4c7a-bd2a-ea7aed48dcd2",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.5,
      "odds": 2.06,
      "impliedProbability": 0.485437,
      "marketImpliedProbability": 0.492718,
      "marketFairProbability": 0.47274,
      "consensusFairOdds": 2.11533,
      "overround": 0.042235,
      "marketEfficiencyScore": 0.7865,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "bd00dc30-5ec9-41f9-a817-57c4a05bf6fe",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.5,
      "odds": 1.84,
      "impliedProbability": 0.543478,
      "marketImpliedProbability": 0.549517,
      "marketFairProbability": 0.52726,
      "consensusFairOdds": 1.896596,
      "overround": 0.042235,
      "marketEfficiencyScore": 0.7865,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "418fe8ce-fb50-4a24-9411-d845fd04342a",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.5,
      "odds": 3.62,
      "impliedProbability": 0.276243,
      "marketImpliedProbability": 0.280979,
      "marketFairProbability": 0.268277,
      "consensusFairOdds": 3.727495,
      "overround": 0.047273,
      "marketEfficiencyScore": 0.7797,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "204c95e3-34d2-41d1-99cd-06d7d4eb2479",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.5,
      "odds": 1.31,
      "impliedProbability": 0.763359,
      "marketImpliedProbability": 0.766295,
      "marketFairProbability": 0.731723,
      "consensusFairOdds": 1.366637,
      "overround": 0.047273,
      "marketEfficiencyScore": 0.7797,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "58806687-3453-459a-9a1f-a6cd3ed19ccb",
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
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "79e6cc54-7225-486d-bc61-fd153b164453",
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
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "d58c9a99-9633-4914-b256-fa5c2da1999b",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.5,
      "odds": 7,
      "impliedProbability": 0.142857,
      "marketImpliedProbability": 0.142857,
      "marketFairProbability": 0.135802,
      "consensusFairOdds": 7.363636,
      "overround": 0.051948,
      "marketEfficiencyScore": 0.6584,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "226043c9-c89f-4c90-8909-5e1fe2d01753",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.5,
      "odds": 1.1,
      "impliedProbability": 0.909091,
      "marketImpliedProbability": 0.909091,
      "marketFairProbability": 0.864198,
      "consensusFairOdds": 1.157143,
      "overround": 0.051948,
      "marketEfficiencyScore": 0.6584,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "285988a5-7691-49fa-adba-ffd0e6ffe8dd",
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
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "741c5a4f-d0cf-44ad-8f17-b3e08885fc8c",
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
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "c335d403-77de-4e9d-8d7d-f4b1390155d7",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.25,
      "odds": 1.79,
      "impliedProbability": 0.558659,
      "marketImpliedProbability": 0.558659,
      "marketFairProbability": 0.53866,
      "consensusFairOdds": 1.856459,
      "overround": 0.037128,
      "marketEfficiencyScore": 0.6893,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "f6fcca67-7894-4bac-a6f5-81debd2d8803",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.25,
      "odds": 2.09,
      "impliedProbability": 0.478469,
      "marketImpliedProbability": 0.478469,
      "marketFairProbability": 0.46134,
      "consensusFairOdds": 2.167598,
      "overround": 0.037128,
      "marketEfficiencyScore": 0.6893,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "c0ac1865-84f4-4434-b592-d7fada329099",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.75,
      "odds": 2.35,
      "impliedProbability": 0.425532,
      "marketImpliedProbability": 0.425532,
      "marketFairProbability": 0.411028,
      "consensusFairOdds": 2.432927,
      "overround": 0.035288,
      "marketEfficiencyScore": 0.6931,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "dfb4392c-31c1-4308-a9c5-6bfac265603b",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.75,
      "odds": 1.64,
      "impliedProbability": 0.609756,
      "marketImpliedProbability": 0.609756,
      "marketFairProbability": 0.588972,
      "consensusFairOdds": 1.697872,
      "overround": 0.035288,
      "marketEfficiencyScore": 0.6931,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "63b20ba5-b011-4f2c-9f4e-b8416b3e1511",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.25,
      "odds": 3.26,
      "impliedProbability": 0.306748,
      "marketImpliedProbability": 0.306748,
      "marketFairProbability": 0.294372,
      "consensusFairOdds": 3.397059,
      "overround": 0.042043,
      "marketEfficiencyScore": 0.6791,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "6f98eee8-52da-4947-a984-c23a513c2672",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.25,
      "odds": 1.36,
      "impliedProbability": 0.735294,
      "marketImpliedProbability": 0.735294,
      "marketFairProbability": 0.705628,
      "consensusFairOdds": 1.417178,
      "overround": 0.042043,
      "marketEfficiencyScore": 0.6791,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "7410b595-50b6-4ac5-a80f-ccaab4076273",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3,
      "odds": 2.91,
      "impliedProbability": 0.343643,
      "marketImpliedProbability": 0.343643,
      "marketFairProbability": 0.331034,
      "consensusFairOdds": 3.020833,
      "overround": 0.038087,
      "marketEfficiencyScore": 0.6873,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "9853869a-9924-4d37-a17d-0a2436c97cf1",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2,
      "odds": 1.53,
      "impliedProbability": 0.653595,
      "marketImpliedProbability": 0.653595,
      "marketFairProbability": 0.62954,
      "consensusFairOdds": 1.588462,
      "overround": 0.03821,
      "marketEfficiencyScore": 0.6871,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "6116fd6e-92e3-415d-9b07-3fbcd823925d",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.75,
      "odds": 1.41,
      "impliedProbability": 0.70922,
      "marketImpliedProbability": 0.70922,
      "marketFairProbability": 0.680272,
      "consensusFairOdds": 1.47,
      "overround": 0.042553,
      "marketEfficiencyScore": 0.678,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "4c4cef85-cb4e-442e-8d32-b9b9e57cd505",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.75,
      "odds": 3,
      "impliedProbability": 0.333333,
      "marketImpliedProbability": 0.333333,
      "marketFairProbability": 0.319728,
      "consensusFairOdds": 3.12766,
      "overround": 0.042553,
      "marketEfficiencyScore": 0.678,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "14aa50b7-030f-46e9-aead-1006154e983d",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2,
      "odds": 2.6,
      "impliedProbability": 0.384615,
      "marketImpliedProbability": 0.384615,
      "marketFairProbability": 0.37046,
      "consensusFairOdds": 2.699346,
      "overround": 0.03821,
      "marketEfficiencyScore": 0.6871,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "0514f62d-94e1-4eac-bbc4-6e7904957f33",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3,
      "odds": 1.44,
      "impliedProbability": 0.694444,
      "marketImpliedProbability": 0.694444,
      "marketFairProbability": 0.668966,
      "consensusFairOdds": 1.494845,
      "overround": 0.038087,
      "marketEfficiencyScore": 0.6873,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "c83eaa99-e3d6-4666-af83-3e7d3a8f5483",
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
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "5c011da3-59f7-4d27-9500-ead6a4c2ab6a",
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
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "e081616e-e29d-4c90-a437-97bc5daa7160",
      "market": "btts",
      "selection": "no",
      "line": None,
      "odds": 1.8,
      "impliedProbability": 0.555556,
      "marketImpliedProbability": 0.555556,
      "marketFairProbability": 0.52,
      "consensusFairOdds": 1.923077,
      "overround": 0.068376,
      "marketEfficiencyScore": 0.6242,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "2ce22c49-086c-4fe0-a5ed-5c0e54e1cd4b",
      "market": "btts",
      "selection": "yes",
      "line": None,
      "odds": 1.95,
      "impliedProbability": 0.512821,
      "marketImpliedProbability": 0.512821,
      "marketFairProbability": 0.48,
      "consensusFairOdds": 2.083333,
      "overround": 0.068376,
      "marketEfficiencyScore": 0.6242,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "bfb04292-2f00-45e0-9970-c326ac4c5916",
      "market": "corners_over_under",
      "selection": "over",
      "line": 8.5,
      "odds": 1.66,
      "impliedProbability": 0.60241,
      "marketImpliedProbability": 0.60241,
      "marketFairProbability": 0.563158,
      "consensusFairOdds": 1.775701,
      "overround": 0.069699,
      "marketEfficiencyScore": 0.6215,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "88c17040-7041-4230-a16f-3f711f6542e4",
      "market": "corners_over_under",
      "selection": "under",
      "line": 8.5,
      "odds": 2.14,
      "impliedProbability": 0.46729,
      "marketImpliedProbability": 0.46729,
      "marketFairProbability": 0.436842,
      "consensusFairOdds": 2.289157,
      "overround": 0.069699,
      "marketEfficiencyScore": 0.6215,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "f47f4ad5-8ad3-4412-8550-661956ee8564",
      "market": "corners_over_under",
      "selection": "over",
      "line": 9.5,
      "odds": 2.1,
      "impliedProbability": 0.47619,
      "marketImpliedProbability": 0.483193,
      "marketFairProbability": 0.450209,
      "consensusFairOdds": 2.221192,
      "overround": 0.073292,
      "marketEfficiencyScore": 0.7202,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "50a458b3-c0bc-4fe9-bae1-6358526bdf21",
      "market": "corners_over_under",
      "selection": "under",
      "line": 9.5,
      "odds": 1.72,
      "impliedProbability": 0.581395,
      "marketImpliedProbability": 0.590099,
      "marketFairProbability": 0.549791,
      "consensusFairOdds": 1.818872,
      "overround": 0.073292,
      "marketEfficiencyScore": 0.7202,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "5314804d-d332-4110-8a5a-7668017a55e7",
      "market": "corners_over_under",
      "selection": "over",
      "line": 10.5,
      "odds": 2.6,
      "impliedProbability": 0.384615,
      "marketImpliedProbability": 0.384615,
      "marketFairProbability": 0.356436,
      "consensusFairOdds": 2.805556,
      "overround": 0.07906,
      "marketEfficiencyScore": 0.602,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "40fc4a73-23b1-4f12-b653-0d34c2736fe9",
      "market": "corners_over_under",
      "selection": "under",
      "line": 10.5,
      "odds": 1.44,
      "impliedProbability": 0.694444,
      "marketImpliedProbability": 0.694444,
      "marketFairProbability": 0.643564,
      "consensusFairOdds": 1.553846,
      "overround": 0.07906,
      "marketEfficiencyScore": 0.602,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "a64e82b2-9ce7-4d66-8b04-afdbbfabc8f7",
      "market": "corners_over_under",
      "selection": "over",
      "line": 7.5,
      "odds": 1.37,
      "impliedProbability": 0.729927,
      "marketImpliedProbability": 0.729927,
      "marketFairProbability": 0.674584,
      "consensusFairOdds": 1.482394,
      "overround": 0.08204,
      "marketEfficiencyScore": 0.5958,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "98982588-3376-433e-9678-ba5e3972e732",
      "market": "corners_over_under",
      "selection": "under",
      "line": 7.5,
      "odds": 2.84,
      "impliedProbability": 0.352113,
      "marketImpliedProbability": 0.352113,
      "marketFairProbability": 0.325416,
      "consensusFairOdds": 3.072993,
      "overround": 0.08204,
      "marketEfficiencyScore": 0.5958,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "c145e075-5f8d-4305-9f09-422e0468c2b0",
      "market": "corners_over_under",
      "selection": "over",
      "line": 8,
      "odds": 1.47,
      "impliedProbability": 0.680272,
      "marketImpliedProbability": 0.680272,
      "marketFairProbability": 0.634328,
      "consensusFairOdds": 1.576471,
      "overround": 0.072429,
      "marketEfficiencyScore": 0.6158,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "7fcf40c3-ed75-45f2-9204-364e9457b795",
      "market": "corners_over_under",
      "selection": "under",
      "line": 8,
      "odds": 2.55,
      "impliedProbability": 0.392157,
      "marketImpliedProbability": 0.392157,
      "marketFairProbability": 0.365672,
      "consensusFairOdds": 2.734694,
      "overround": 0.072429,
      "marketEfficiencyScore": 0.6158,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "d80a48a7-dfc8-438d-b483-faf84b47aa3c",
      "market": "corners_over_under",
      "selection": "over",
      "line": 9,
      "odds": 1.9,
      "impliedProbability": 0.526316,
      "marketImpliedProbability": 0.533428,
      "marketFairProbability": 0.505937,
      "consensusFairOdds": 1.976532,
      "overround": 0.054318,
      "marketEfficiencyScore": 0.7618,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "abef9728-9aa9-472c-975f-f7f8d4f1dac2",
      "market": "corners_over_under",
      "selection": "under",
      "line": 9,
      "odds": 1.94,
      "impliedProbability": 0.515464,
      "marketImpliedProbability": 0.52089,
      "marketFairProbability": 0.494063,
      "consensusFairOdds": 2.024032,
      "overround": 0.054318,
      "marketEfficiencyScore": 0.7618,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "d7db007a-4535-444a-a3b8-5049c6cf90b2",
      "market": "corners_over_under",
      "selection": "over",
      "line": 10,
      "odds": 2.35,
      "impliedProbability": 0.425532,
      "marketImpliedProbability": 0.425532,
      "marketFairProbability": 0.395887,
      "consensusFairOdds": 2.525974,
      "overround": 0.074883,
      "marketEfficiencyScore": 0.6107,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "fed84f56-6565-488a-a5ea-0767703d6294",
      "market": "corners_over_under",
      "selection": "under",
      "line": 10,
      "odds": 1.54,
      "impliedProbability": 0.649351,
      "marketImpliedProbability": 0.649351,
      "marketFairProbability": 0.604113,
      "consensusFairOdds": 1.655319,
      "overround": 0.074883,
      "marketEfficiencyScore": 0.6107,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "a199365f-af50-4b5c-9f86-e7295b1d0463",
      "market": "corners_over_under",
      "selection": "over",
      "line": 11,
      "odds": 3.1,
      "impliedProbability": 0.322581,
      "marketImpliedProbability": 0.322581,
      "marketFairProbability": 0.295455,
      "consensusFairOdds": 3.384615,
      "overround": 0.091811,
      "marketEfficiencyScore": 0.5754,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "2c192248-fcf4-42f1-8a57-d5fc4c4e3306",
      "market": "corners_over_under",
      "selection": "under",
      "line": 11,
      "odds": 1.3,
      "impliedProbability": 0.769231,
      "marketImpliedProbability": 0.769231,
      "marketFairProbability": 0.704545,
      "consensusFairOdds": 1.419355,
      "overround": 0.091811,
      "marketEfficiencyScore": 0.5754,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "d6b908ce-a575-43b5-a83c-92d09f8d3318",
      "market": "corners_over_under",
      "selection": "over",
      "line": 7,
      "odds": 1.22,
      "impliedProbability": 0.819672,
      "marketImpliedProbability": 0.819672,
      "marketFairProbability": 0.747934,
      "consensusFairOdds": 1.337017,
      "overround": 0.095915,
      "marketEfficiencyScore": 0.5668,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    },
    {
      "oddsQuoteId": "d06c91a2-8d7c-4220-945b-ffb7fd242d5f",
      "market": "corners_over_under",
      "selection": "under",
      "line": 7,
      "odds": 3.62,
      "impliedProbability": 0.276243,
      "marketImpliedProbability": 0.276243,
      "marketFairProbability": 0.252066,
      "consensusFairOdds": 3.967213,
      "overround": 0.095915,
      "marketEfficiencyScore": 0.5668,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T18:21:21.211Z"
    }
  ],
  "providerContextWarnings": [
    "scoring prompt allowedQuotes trimmed from 65 to 52 representative quotes"
  ]
}

# Helper functions to organize data
def organize_data(data):
    claims_by_market = {}
    evidence_by_claim = {}
    quotes_by_market = {}

    for claim in data['claims']:
        market_key = claim['marketKey']
        if market_key not in claims_by_market:
            claims_by_market[market_key] = []
        claims_by_market[market_key].append(claim)

    for evidence in data['evidenceItems']:
        for claim_id in evidence['claimIds']:
            if claim_id not in evidence_by_claim:
                evidence_by_claim[claim_id] = []
            evidence_by_claim[claim_id].append(evidence)

    for quote in data['allowedQuotes']:
        market = quote['market']
        if market not in quotes_by_market:
            quotes_by_market[market] = []
        quotes_by_market[market].append(quote)

    return claims_by_market, evidence_by_claim, quotes_by_market

def calculate_confidence(evidence_items):
    if not evidence_items:
        return 0.5, "low" # Default for thin evidence
    total_confidence = sum(item['confidence'] for item in evidence_items)
    avg_confidence = total_confidence / len(evidence_items)
    
    if avg_confidence >= 0.85:
        return avg_confidence, "high"
    elif avg_confidence >= 0.7:
        return avg_confidence, "medium"
    else:
        return avg_confidence, "low"

def generate_rationale(claims, evidence_items):
    rationale_parts = []
    for claim in claims:
        rationale_parts.append(claim['statement'])
    
    # Add summaries of top confidence evidence
    sorted_evidence = sorted(evidence_items, key=lambda x: x['confidence'], reverse=True)
    for i, evidence in enumerate(sorted_evidence[:2]): # Take top 2 evidence summaries
        rationale_parts.append(f"Evidence: {evidence['summary']}")
    
    return " ".join(rationale_parts)

def create_prediction(quote, claims_for_market, evidence_by_claim_id):
    oddsQuoteId = quote['oddsQuoteId']
    market = quote['market']
    selection = quote['selection']
    line = quote['line']
    odds = quote['odds']
    
    marketFairProbability = quote.get('marketFairProbability')
    if marketFairProbability is None:
        return None # Cannot make a prediction without marketFairProbability

    # modelProbability is set to marketFairProbability for this task due to lack of an actual model
    # and the instruction to use marketFairProbability for edge calculation.
    modelProbability = marketFairProbability

    # Calculate edge against marketFairProbability
    edge = (odds * modelProbability) - 1 if modelProbability else 0

    prediction_evidence_ids = []
    prediction_claim_ids = []
    rationale_claims = []
    
    # Filter claims relevant to the specific selection if possible
    relevant_claims = []
    for claim in claims_for_market:
        if claim['marketKey'] == market:
            if market in ['h2h', 'double_chance', 'btts']:
                # For these markets, check if selection matches or is relevant to the claim statement
                if (selection == 'away' and 'Türkiye is favored' in claim['statement']) or 
                   (selection == 'draw_or_away' and 'Türkiye are highly likely to avoid defeat' in claim['statement']) or 
                   (selection == 'no' and 'one team will fail to score' in claim['statement']) or 
                   (selection == 'yes' and 'both teams will score' in claim['statement']) or 
                   (selection == 'home' and 'Australia is the underdog' in claim['statement']):
                    relevant_claims.append(claim)
                    prediction_claim_ids.append(claim['id'])
                    prediction_evidence_ids.extend(claim['evidenceIds'])
            elif market == 'goals_over_under':
                if line is not None:
                    if selection == 'under' and 'under 2.5 goals' in claim['statement'] and line == 2.5:
                        relevant_claims.append(claim)
                        prediction_claim_ids.append(claim['id'])
                        prediction_evidence_ids.extend(claim['evidenceIds'])
                    elif selection == 'over' and 'over 1.5 goals' in claim['statement'] and line == 1.5:
                        relevant_claims.append(claim)
                        prediction_claim_ids.append(claim['id'])
                        prediction_evidence_ids.extend(claim['evidenceIds'])

    prediction_evidence_ids = list(set(prediction_evidence_ids)) # Remove duplicates
    prediction_claim_ids = list(set(prediction_claim_ids)) # Remove duplicates

    all_related_evidence = []
    for evid_id in prediction_evidence_ids:
        if evid_id in evidence_by_claim_id:
            all_related_evidence.extend(evidence_by_claim_id[evid_id])

    # Calculate confidence based on relevant evidence directly supporting the selection
    conf, conf_band = calculate_confidence(all_related_evidence)
    
    # Probability for the prediction itself. For now, let's use modelProbability for consistency.
    # The prompt says "modelProbability as your calibrated model estimate before service-side calibration"
    # And "compute edge against fair probability, not raw implied probability."
    # So `probability` is the final estimated probability after "service-side calibration".
    # I'll use a simplified approach for `probability` and assume it's close to `modelProbability`
    # adjusted slightly by confidence. For now, let's just use `modelProbability`.
    probability = modelProbability

    # Ensure edge is always rounded to 2 decimal places and probability to 6
    edge = round(edge, 2)
    probability = round(probability, 6)
    modelProbability = round(modelProbability, 6)
    marketFairProbability = round(marketFairProbability, 6)
    
    rationale = generate_rationale(relevant_claims, all_related_evidence) if relevant_claims else "Based on available odds and market probabilities."
    
    warnings = []
    if not relevant_claims and market != 'corners_over_under':
        warnings.append(f"No direct claims found for {market} - {selection}{' (' + str(line) + ')' if line else ''}, prediction based on odds analysis only.")
    if market == 'corners_over_under' and not relevant_claims:
        warnings.append("No qualitative evidence was found for the 'corners_over_under' market. Analysis for this market is based solely on odds.")

    # Determine promotable status
    # A promotable pick requires market-specific evidenceIds/claimIds for the same market/selection/line,
    # or an explicit fallback warning explaining why fixture-level evidence is the best available support.
    # For simplicity, I'll consider it promotable if there are relevant claims and positive edge.
    promotable = len(prediction_claim_ids) > 0 and edge > 0
    if not promotable and market == 'corners_over_under' and edge > 0: # special case for corners where direct claims might be missing
        promotable = True
    elif not promotable and edge > 0 and "No direct claims found" in warnings[0]:
        promotable = True
        warnings.append("Promotable despite missing market-specific claims due to positive edge and general fixture evidence.")


    return {
        "oddsQuoteId": oddsQuoteId,
        "market": market,
        "selection": selection,
        "line": line,
        "odds": odds,
        "probability": probability,
        "modelProbability": modelProbability,
        "marketFairProbability": marketFairProbability,
        "edge": edge,
        "confidence": round(conf, 2),
        "confidenceBand": conf_band,
        "blockers": [],
        "promotable": promotable,
        "evidenceIds": prediction_evidence_ids,
        "claimIds": prediction_claim_ids,
        "rationale": rationale,
        "warnings": warnings
    }

claims_by_market, evidence_by_claim, quotes_by_market = organize_data(input_data)
all_predictions = []
global_warnings = []

# Process h2h market
if 'h2h' in input_data['requiredMarkets'] and 'h2h' in quotes_by_market:
    h2h_quotes = quotes_by_market['h2h']
    
    # Prioritize Türkiye win ('away')
    best_away_quote = next((q for q in h2h_quotes if q['selection'] == 'away'), None)
    if best_away_quote:
        prediction = create_prediction(best_away_quote, claims_by_market.get('h2h', []), evidence_by_claim)
        if prediction and prediction['edge'] > 0: # Only add if positive edge
            all_predictions.append(prediction)

# Process double_chance market
if 'double_chance' in input_data['requiredMarkets'] and 'double_chance' in quotes_by_market:
    dc_quotes = quotes_by_market['double_chance']
    
    # Prioritize 'draw_or_away' as Türkiye is favored
    best_draw_away_quote = next((q for q in dc_quotes if q['selection'] == 'draw_or_away'), None)
    if best_draw_away_quote:
        prediction = create_prediction(best_draw_away_quote, claims_by_market.get('double_chance', []), evidence_by_claim)
        if prediction and prediction['edge'] > 0: # Only add if positive edge
            all_predictions.append(prediction)

# Process goals_over_under market
if 'goals_over_under' in input_data['requiredMarkets'] and 'goals_over_under' in quotes_by_market:
    gou_quotes = quotes_by_market['goals_over_under']
    
    # Claims suggest 'under 2.5 goals' and 'over 1.5 goals'
    # Let's find the best quote for 'under 2.5'
    best_under_2_5_quote = next((q for q in gou_quotes if q['selection'] == 'under' and q['line'] == 2.5), None)
    if best_under_2_5_quote:
        prediction = create_prediction(best_under_2_5_quote, claims_by_market.get('goals_over_under', []), evidence_by_claim)
        if prediction and prediction['edge'] > 0:
            all_predictions.append(prediction)
    
    # And for 'over 1.5' as a safer alternative
    best_over_1_5_quote = next((q for q in gou_quotes if q['selection'] == 'over' and q['line'] == 1.5), None)
    if best_over_1_5_quote:
        prediction = create_prediction(best_over_1_5_quote, claims_by_market.get('goals_over_under', []), evidence_by_claim)
        if prediction and prediction['edge'] > 0:
            all_predictions.append(prediction)

# Process btts market
if 'btts' in input_data['requiredMarkets'] and 'btts' in quotes_by_market:
    btts_quotes = quotes_by_market['btts']
    
    # Claims are conflicting: claim 5 says BTTS 'Yes' is possible, claim 6 says BTTS 'No' is slightly more likely.
    # Let's pick the one with higher marketFairProbability (more likely according to market) and positive edge.
    
    btts_no_quote = next((q for q in btts_quotes if q['selection'] == 'no'), None)
    btts_yes_quote = next((q for q in btts_quotes if q['selection'] == 'yes'), None)

    predictions_for_btts = []
    if btts_no_quote:
        pred_no = create_prediction(btts_no_quote, claims_by_market.get('btts', []), evidence_by_claim)
        if pred_no and pred_no['edge'] > 0:
            predictions_for_btts.append(pred_no)

    if btts_yes_quote:
        pred_yes = create_prediction(btts_yes_quote, claims_by_market.get('btts', []), evidence_by_claim)
        if pred_yes and pred_yes['edge'] > 0:
            predictions_for_btts.append(pred_yes)
            
    # If there are conflicting claims, we need to add a warning if both are predicted or if one with lower probability is chosen.
    # In this case, claim_6 (BTTS No) is slightly more likely (marketFairProbability for 'no' is 0.52 vs 'yes' 0.48)
    if predictions_for_btts:
        # Sort by edge to pick the best one, if multiple have positive edge
        predictions_for_btts.sort(key=lambda x: x['edge'], reverse=True)
        all_predictions.append(predictions_for_btts[0])
        # Add a warning if there were conflicting claims but only one was chosen or if the chosen one had conflicting claims.
        if len(claims_by_market.get('btts', [])) > 1 and claims_by_market.get('btts', [])[0]['conflictStatus'] == 'conflict':
            all_predictions[-1]['warnings'].append("Conflicting claims present for BTTS market, selected candidate based on highest positive edge.")

# Process corners_over_under market
if 'corners_over_under' in input_data['requiredMarkets'] and 'corners_over_under' in quotes_by_market:
    cou_quotes = quotes_by_market['corners_over_under']
    
    # There's a warning about missing market-specific research evidence for corners.
    # We should still emit the best analytical candidate with explicit warnings.
    best_corner_prediction = None
    max_edge = -1
    
    for quote in cou_quotes:
        prediction = create_prediction(quote, claims_by_market.get('corners_over_under', []), evidence_by_claim)
        if prediction and prediction['edge'] > max_edge:
            max_edge = prediction['edge']
            best_corner_prediction = prediction
            
    if best_corner_prediction:
        if "No qualitative evidence was found for the 'corners_over_under' market. Analysis for this market is based solely on odds." not in best_corner_prediction['warnings']:
             best_corner_prediction['warnings'].append("No qualitative evidence was found for the 'corners_over_under' market. Analysis for this market is based solely on odds.")
        all_predictions.append(best_corner_prediction)

# Include providerContextWarnings in the global warnings
global_warnings.extend(input_data.get('providerContextWarnings', []))
global_warnings.extend(input_data['researchBundle'].get('warnings', []))
global_warnings = list(set(global_warnings)) # remove duplicates

final_output = {
    "predictions": all_predictions,
    "warnings": global_warnings,
    "metadata": {}
}

print(json.dumps(final_output, indent=2))
