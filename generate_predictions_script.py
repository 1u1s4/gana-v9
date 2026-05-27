import json
import math

input_data_str = """
{
  "promptVersion": "score-prediction-v2",
  "runId": "85a75bb5-dd27-4238-85cb-c20a33bd726d",
  "createdAt": "2026-05-27T17:27:43.386Z",
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
    "id": "fbd9cc4f-8d12-4443-93c2-8c026fdea9a8",
    "providerFixtureId": "1535322",
    "competitionId": "90183469-503b-48ff-a35d-8e79dc4a3760",
    "season": 2026,
    "homeTeamId": "4435d074-96b5-4beb-9f91-35494fe1141f",
    "awayTeamId": "93895c95-968d-45d5-8606-22306890ceac",
    "scheduledAt": "2026-05-27T22:00:00.000Z",
    "status": "scheduled",
    "scoreHome": null,
    "scoreAway": null,
    "includedByFilters": [],
    "metadata": {
      "league": {
        "id": 13,
        "name": "CONMEBOL Libertadores",
        "country": "World",
        "season": 2026,
        "round": "Group Stage - 6"
      },
      "teams": {
        "home": {
          "id": 1153,
          "name": "Independiente del Valle"
        },
        "away": {
          "id": 437,
          "name": "Rosario Central"
        }
      },
      "venue": "Estadio Banco Guayaquil",
      "round": "Group Stage - 6",
      "timezone": "UTC",
      "apiFootballStatusShort": "NS",
      "apiFootballStatusLong": "Not Started"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1535322",
    "capturedAt": "2026-05-27T17:27:44.575Z",
    "providerSnapshotId": "0fb99292-c11c-4d80-9c92-c384cd1c949a"
  },
  "oddsSnapshot": {
    "id": "05054350-5c69-4a70-97cc-98c28b001f9a",
    "fixtureId": "fbd9cc4f-8d12-4443-93c2-8c026fdea9a8",
    "providerFixtureId": "1535322",
    "providerSnapshotId": "14660932-606c-412d-9d17-044a902b5133",
    "bookmakerCount": 2,
    "capturedAt": "2026-05-27T16:42:49.961Z",
    "payloadHash": "54d27264bd02a9cc01eb25708f185f6731a216a39c82e76cfe47c77bc44272157"
  },
  "researchBundle": {
    "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0",
    "runId": "bde77068-2a26-4c4b-b31a-ca2fe6894955",
    "status": "promotable",
    "gateResult": {
      "reasons": [
        "Structured research generated with available evidence.",
        "Web-search evidence is missing relevant content as no results were found for the future fixture date.",
        "objective research gate passed with current web evidence"
      ],
      "verdict": "promotable",
      "warnings": [
        "No relevant web search results were found for the fixture, likely due to the future date. Web-search evidence is included but provides no analytical insight."
      ]
    },
    "providerAgentic": "gemini",
    "model": "gemini-2.5-flash",
    "promptVersion": "research-fixture-v2",
    "warnings": [
      "No relevant web search results were found for the fixture, likely due to the future date. Web-search evidence is included but provides no analytical insight."
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
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_pinnacle_odds",
      "type": "provider-snapshot",
      "url": null,
      "title": "Pinnacle Odds Snapshot for Independiente del Valle vs Rosario Central",
      "externalId": "api-football://source_pinnacle_odds",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:42:49.961Z",
      "metadata": {
        "bookmaker": "Pinnacle",
        "fixtureId": "fbd9cc4f-8d12-4443-93c2-8c026fdea9a8"
      }
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_bet365_odds",
      "type": "provider-snapshot",
      "url": null,
      "title": "Bet365 Odds Snapshot for Independiente del Valle vs Rosario Central",
      "externalId": "api-football://source_bet365_odds",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:42:49.961Z",
      "metadata": {
        "bookmaker": "Bet365",
        "fixtureId": "fbd9cc4f-8d12-4443-93c2-8c026fdea9a8"
      }
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football odds snapshot",
      "externalId": "1535322",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:42:49.961Z",
      "metadata": {
        "fixtureId": "fbd9cc4f-8d12-4443-93c2-8c026fdea9a8",
        "quoteCount": 52,
        "snapshotId": "14660932-606c-412d-9d17-044a902b5133",
        "bookmakerCount": 2,
        "oddsSnapshotId": "05054350-5c69-4a70-97cc-98c28b001f9a",
        "providerFixtureId": "1535322"
      }
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture statistics",
      "externalId": "1535322",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:42:48.883Z",
      "metadata": {
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "194e2aab-9e5b-48e5-9bda-e16bc298e242",
        "providerFixtureId": "1535322"
      }
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_api_football",
      "type": "api-football",
      "url": "https://api-football.com/fixtures/1535322",
      "title": "API-Football Fixture Data for Independiente del Valle vs Rosario Central",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:42:48.223Z",
      "metadata": {
        "fixtureId": "fbd9cc4f-8d12-4443-93c2-8c026fdea9a8",
        "providerFixtureId": "1535322"
      }
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_web_search",
      "type": "web-search",
      "url": "https://www.google.com/search?q=Independiente+del+Valle+vs+Rosario+Central+2026-05-27+football+match+preview",
      "title": "Google Search: Independiente del Valle vs Rosario Central 2026-05-27 football match preview",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:42:45.009Z",
      "metadata": {
        "query": "Independiente del Valle vs Rosario Central 2026-05-27 football match preview",
        "result": "no search results"
      }
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_api_football_fixture",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture",
      "externalId": "1535322",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:42:45.009Z",
      "metadata": {
        "fixtureId": "fbd9cc4f-8d12-4443-93c2-8c026fdea9a8",
        "providerFixtureId": "1535322"
      }
    }
  ],
  "evidenceItems": [
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_fixture_details",
      "sourceId": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_api_football",
      "summary": "Fixture details from API-Football.",
      "confidence": 1,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_h2h_bet365",
      "sourceId": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_bet365_odds",
      "summary": "Bet365 H2H odds for the fixture.",
      "confidence": 0.9,
      "claimIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_h2h_home",
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_h2h_draw",
        "92d95ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_h2h_away"
      ],
      "metadata": {}
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_goals_ou_bet365",
      "sourceId": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_bet365_odds",
      "summary": "Bet365 Goals Over/Under 2.5 odds.",
      "confidence": 0.9,
      "claimIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_goals_ou_2.5_over",
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_goals_ou_2.5_under"
      ],
      "metadata": {}
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_btts_bet365",
      "sourceId": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_bet365_odds",
      "summary": "Bet365 Both Teams to Score odds.",
      "confidence": 0.9,
      "claimIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_btts_yes",
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_btts_no"
      ],
      "metadata": {}
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_double_chance_bet365",
      "sourceId": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_bet365_odds",
      "summary": "Bet365 Double Chance odds.",
      "confidence": 0.9,
      "claimIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_double_chance_home_or_draw",
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_double_chance_home_or_away",
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_double_chance_draw_or_away"
      ],
      "metadata": {}
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_corners_ou_bet365",
      "sourceId": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_bet365_odds",
      "summary": "Bet365 Corners Over/Under 9.5 odds.",
      "confidence": 0.9,
      "claimIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_corners_ou_9.5_over",
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_corners_ou_9.5_under"
      ],
      "metadata": {}
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_h2h_pinnacle",
      "sourceId": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_pinnacle_odds",
      "summary": "Pinnacle H2H odds for the fixture.",
      "confidence": 0.9,
      "claimIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_h2h_home",
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_h2h_draw",
        "92d95ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_h2h_away"
      ],
      "metadata": {}
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_goals_ou_pinnacle",
      "sourceId": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_pinnacle_odds",
      "summary": "Pinnacle Goals Over/Under 2.5 odds.",
      "confidence": 0.9,
      "claimIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_goals_ou_2.5_over",
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_goals_ou_2.5_under"
      ],
      "metadata": {}
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_web_search_none",
      "sourceId": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:source_web_search",
      "summary": "No relevant web search results found for the future fixture date.",
      "confidence": 0.1,
      "claimIds": [],
      "metadata": {}
    }
  ],
  "claims": [
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_h2h_home",
      "statement": "Independiente del Valle has H2H odds of 2.1 (Bet365) and 2.07 (Pinnacle) to win.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_h2h_bet365",
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_h2h_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_h2h_draw",
      "statement": "A draw has H2H odds of 3.25 (Bet365) and 3.17 (Pinnacle).",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_h2h_bet365",
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_h2h_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "92d95ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_h2h_away",
      "statement": "Rosario Central has H2H odds of 3.75 (Bet365) and 3.81 (Pinnacle) to win.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_h2h_bet365",
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_h2h_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_double_chance_home_or_draw",
      "statement": "Independiente del Valle to win or draw has double chance odds of 1.22 (Bet365).",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_double_chance_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_double_chance_home_or_away",
      "statement": "Either Independiente del Valle or Rosario Central to win has double chance odds of 1.3 (Bet365).",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_double_chance_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_double_chance_draw_or_away",
      "statement": "Draw or Rosario Central to win has double chance odds of 1.8 (Bet365).",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_double_chance_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_goals_ou_2.5_over",
      "statement": "Over 2.5 goals has odds of 2.15 (Bet365) and 2.21 (Pinnacle).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_goals_ou_bet365",
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_goals_ou_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_goals_ou_2.5_under",
      "statement": "Under 2.5 goals has odds of 1.67 (Bet365) and 1.65 (Pinnacle).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_goals_ou_bet365",
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_goals_ou_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_btts_yes",
      "statement": "Both Teams to Score 'Yes' has odds of 1.95 (Bet365).",
      "marketKey": "btts",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_btts_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_btts_no",
      "statement": "Both Teams to Score 'No' has odds of 1.8 (Bet365).",
      "marketKey": "btts",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_btts_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_corners_ou_9.5_over",
      "statement": "Over 9.5 corners has odds of 2 (Bet365).",
      "marketKey": "corners_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_corners_ou_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:claim_corners_ou_9.5_under",
      "statement": "Under 9.5 corners has odds of 1.73 (Bet365).",
      "marketKey": "corners_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "92d5ff2e-088d-4eda-a4a2-7639ce45f5c0:evidence_corners_ou_bet365"
      ],
      "conflictStatus": "none"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "ae553bed-11da-44cc-9d77-d00c92f5cfcd",
      "market": "h2h",
      "selection": "away",
      "line": null,
      "odds": 3.81,
      "impliedProbability": 0.262467,
      "marketImpliedProbability": 0.264567,
      "marketFairProbability": 0.250604,
      "consensusFairOdds": 3.990353,
      "overround": 0.055783,
      "marketEfficiencyScore": 0.7629,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "7c487f18-a8d0-473a-9687-36ef9818045a",
      "market": "h2h",
      "selection": "draw",
      "line": null,
      "odds": 3.25,
      "impliedProbability": 0.307692,
      "marketImpliedProbability": 0.311575,
      "marketFairProbability": 0.295102,
      "consensusFairOdds": 3.388663,
      "overround": 0.055783,
      "marketEfficiencyScore": 0.7629,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "61aa0510-908c-4eb8-a362-b1798041a25e",
      "market": "h2h",
      "selection": "home",
      "line": null,
      "odds": 2.1,
      "impliedProbability": 0.47619,
      "marketImpliedProbability": 0.479641,
      "marketFairProbability": 0.454294,
      "consensusFairOdds": 2.201218,
      "overround": 0.055783,
      "marketEfficiencyScore": 0.7629,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "9a2e1984-65ed-4fbf-8ac4-31ca082db03b",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": null,
      "odds": 1.8,
      "impliedProbability": 0.555556,
      "marketImpliedProbability": 0.555556,
      "marketFairProbability": 0.259066,
      "consensusFairOdds": 3.860025,
      "overround": 1.144458,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "7c2e06d3-b31e-4d21-9b57-167af97680fc",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": null,
      "odds": 1.3,
      "impliedProbability": 0.769231,
      "marketImpliedProbability": 0.769231,
      "marketFairProbability": 0.358706,
      "consensusFairOdds": 2.787796,
      "overround": 1.144458,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "b21acde0-aea0-4190-bd8a-95c41ae7092d",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": null,
      "odds": 1.22,
      "impliedProbability": 0.819672,
      "marketImpliedProbability": 0.819672,
      "marketFairProbability": 0.382228,
      "consensusFairOdds": 2.616239,
      "overround": 1.144458,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "893be526-727b-4bd8-b357-dd98f8889f15",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.5,
      "odds": 1.38,
      "impliedProbability": 0.724638,
      "marketImpliedProbability": 0.729966,
      "marketFairProbability": 0.683572,
      "consensusFairOdds": 1.462905,
      "overround": 0.067865,
      "marketEfficiencyScore": 0.7354,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "1bd10989-6bbf-4cea-9226-f5a1fbd3b2ca",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.5,
      "odds": 3,
      "impliedProbability": 0.333333,
      "marketImpliedProbability": 0.3379,
      "marketFairProbability": 0.316428,
      "consensusFairOdds": 3.160272,
      "overround": 0.067865,
      "marketEfficiencyScore": 0.7354,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "c71bb3ac-ee24-4ef2-9aae-47a3dda42e30",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.5,
      "odds": 2.21,
      "impliedProbability": 0.452489,
      "marketImpliedProbability": 0.458802,
      "marketFairProbability": 0.432317,
      "consensusFairOdds": 2.313118,
      "overround": 0.061234,
      "marketEfficiencyScore": 0.7491,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "005c42bb-ecf3-4440-8c75-80429e0080ab",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.5,
      "odds": 1.67,
      "impliedProbability": 0.598802,
      "marketImpliedProbability": 0.602432,
      "marketFairProbability": 0.567683,
      "consensusFairOdds": 1.761546,
      "overround": 0.061234,
      "marketEfficiencyScore": 0.7491,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "c5c4bd27-c4b0-4f27-9c87-3b73a0677c21",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.5,
      "odds": 4,
      "impliedProbability": 0.25,
      "marketImpliedProbability": 0.250945,
      "marketFairProbability": 0.235127,
      "consensusFairOdds": 4.253012,
      "overround": 0.067285,
      "marketEfficiencyScore": 0.7403,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "0dec8c6a-12af-4c5d-87ad-4d49c7dcb931",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.5,
      "odds": 1.23,
      "impliedProbability": 0.813008,
      "marketImpliedProbability": 0.81634,
      "marketFairProbability": 0.764873,
      "consensusFairOdds": 1.307407,
      "overround": 0.067285,
      "marketEfficiencyScore": 0.7403,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "f1f0fe8a-1fa6-476b-afd8-65f76d867683",
      "market": "goals_over_under",
      "selection": "over",
      "line": 0.5,
      "odds": 1.07,
      "impliedProbability": 0.934579,
      "marketImpliedProbability": 0.934579,
      "marketFairProbability": 0.893744,
      "consensusFairOdds": 1.118889,
      "overround": 0.045691,
      "marketEfficiencyScore": 0.6715,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "9341b25c-0553-4472-bae7-80e868fb6b07",
      "market": "goals_over_under",
      "selection": "under",
      "line": 0.5,
      "odds": 9,
      "impliedProbability": 0.111111,
      "marketImpliedProbability": 0.111111,
      "marketFairProbability": 0.106256,
      "consensusFairOdds": 9.411215,
      "overround": 0.045691,
      "marketEfficiencyScore": 0.6715,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "452d410b-8414-4020-b881-2e6673ad2747",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.5,
      "odds": 9,
      "impliedProbability": 0.111111,
      "marketImpliedProbability": 0.111111,
      "marketFairProbability": 0.106256,
      "consensusFairOdds": 9.411215,
      "overround": 0.045691,
      "marketEfficiencyScore": 0.6715,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "408ea907-8ba1-4211-bd0e-442cdb2aa294",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.5,
      "odds": 1.07,
      "impliedProbability": 0.934579,
      "marketImpliedProbability": 0.934579,
      "marketFairProbability": 0.893744,
      "consensusFairOdds": 1.118889,
      "overround": 0.045691,
      "marketEfficiencyScore": 0.6715,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "c76f57a8-9dc5-4012-b6e8-21eb1c48d427",
      "market": "goals_over_under",
      "selection": "over",
      "line": 5.5,
      "odds": 19,
      "impliedProbability": 0.052632,
      "marketImpliedProbability": 0.052632,
      "marketFairProbability": 0.050949,
      "consensusFairOdds": 19.627451,
      "overround": 0.033024,
      "marketEfficiencyScore": 0.6979,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "faaa6ceb-cd72-4881-82c2-3031d956671e",
      "market": "goals_over_under",
      "selection": "under",
      "line": 5.5,
      "odds": 1.02,
      "impliedProbability": 0.980392,
      "marketImpliedProbability": 0.980392,
      "marketFairProbability": 0.949051,
      "consensusFairOdds": 1.053684,
      "overround": 0.033024,
      "marketEfficiencyScore": 0.6979,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "ae7d1098-f1ae-4836-828d-3e57266b74ae",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.25,
      "odds": 1.94,
      "impliedProbability": 0.515464,
      "marketImpliedProbability": 0.515464,
      "marketFairProbability": 0.488127,
      "consensusFairOdds": 2.048649,
      "overround": 0.056004,
      "marketEfficiencyScore": 0.65,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "eb72b4ef-08a5-43f8-92c5-be7e60305f06",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.25,
      "odds": 1.85,
      "impliedProbability": 0.540541,
      "marketImpliedProbability": 0.540541,
      "marketFairProbability": 0.511873,
      "consensusFairOdds": 1.953608,
      "overround": 0.056004,
      "marketEfficiencyScore": 0.65,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "d0f552a9-98bc-476c-9b87-ea4c7c6fc94e",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.75,
      "odds": 2.58,
      "impliedProbability": 0.387597,
      "marketImpliedProbability": 0.387597,
      "marketFairProbability": 0.364532,
      "consensusFairOdds": 2.743243,
      "overround": 0.063273,
      "marketEfficiencyScore": 0.6348,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "fdcb06b5-6971-46f1-accc-a930f49f4b3b",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.75,
      "odds": 1.48,
      "impliedProbability": 0.675676,
      "marketImpliedProbability": 0.675676,
      "marketFairProbability": 0.635468,
      "consensusFairOdds": 1.573643,
      "overround": 0.063273,
      "marketEfficiencyScore": 0.6348,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "eebea330-7635-4c55-b9e7-987178e27705",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2,
      "odds": 1.65,
      "impliedProbability": 0.606061,
      "marketImpliedProbability": 0.606061,
      "marketFairProbability": 0.572539,
      "consensusFairOdds": 1.746606,
      "overround": 0.058549,
      "marketEfficiencyScore": 0.6447,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "bb603f15-f22f-427f-a683-ef65e70f5c8b",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.75,
      "odds": 1.49,
      "impliedProbability": 0.671141,
      "marketImpliedProbability": 0.671141,
      "marketFairProbability": 0.633907,
      "consensusFairOdds": 1.577519,
      "overround": 0.058738,
      "marketEfficiencyScore": 0.6443,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "e4507cd6-0e89-4ceb-89ac-76355084446f",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.75,
      "odds": 2.58,
      "impliedProbability": 0.387597,
      "marketImpliedProbability": 0.387597,
      "marketFairProbability": 0.366093,
      "consensusFairOdds": 2.731544,
      "overround": 0.058738,
      "marketEfficiencyScore": 0.6443,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "43a05497-59e6-4a8c-8c37-7a402f72689a",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2,
      "odds": 2.21,
      "impliedProbability": 0.452489,
      "marketImpliedProbability": 0.452489,
      "marketFairProbability": 0.427461,
      "consensusFairOdds": 2.339394,
      "overround": 0.058549,
      "marketEfficiencyScore": 0.6447,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "a5a2915c-1cce-4956-94ab-acffb40a165b",
      "market": "goals_over_under",
      "selection": "over",
      "line": 6.5,
      "odds": 41,
      "impliedProbability": 0.02439,
      "marketImpliedProbability": 0.02439,
      "marketFairProbability": 1,
      "consensusFairOdds": 1,
      "overround": -0.97561,
      "marketEfficiencyScore": 0.7667,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "536d84ef-fc52-4e4e-b512-e81c787223a6",
      "market": "btts",
      "selection": "no",
      "line": null,
      "odds": 1.8,
      "impliedProbability": 0.555556,
      "marketImpliedProbability": 0.555556,
      "marketFairProbability": 0.52,
      "consensusFairOdds": 1.923077,
      "overround": 0.068376,
      "marketEfficiencyScore": 0.6242,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "e512110f-1fdc-4073-a2d9-1cc45e616750",
      "market": "btts",
      "selection": "yes",
      "line": null,
      "odds": 1.95,
      "impliedProbability": 0.512821,
      "marketImpliedProbability": 0.512821,
      "marketFairProbability": 0.48,
      "consensusFairOdds": 2.083333,
      "overround": 0.068376,
      "marketEfficiencyScore": 0.6242,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "8ff5d6c1-a43b-4609-91ad-e3b2021ca14c",
      "market": "corners_over_under",
      "selection": "over",
      "line": 8.5,
      "odds": 1.62,
      "impliedProbability": 0.617284,
      "marketImpliedProbability": 0.617284,
      "marketFairProbability": 0.583548,
      "consensusFairOdds": 1.713656,
      "overround": 0.057813,
      "marketEfficiencyScore": 0.6462,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "e266f096-12db-4a0e-be55-30996c7d998a",
      "market": "corners_over_under",
      "selection": "under",
      "line": 8.5,
      "odds": 2.27,
      "impliedProbability": 0.440529,
      "marketImpliedProbability": 0.440529,
      "marketFairProbability": 0.416452,
      "consensusFairOdds": 2.401235,
      "overround": 0.057813,
      "marketEfficiencyScore": 0.6462,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "3087ef2f-3949-45ec-8956-3a29c2a6eeab",
      "market": "corners_over_under",
      "selection": "over",
      "line": 9.5,
      "odds": 2.02,
      "impliedProbability": 0.49505,
      "marketImpliedProbability": 0.497525,
      "marketFairProbability": 0.466114,
      "consensusFairOdds": 2.145398,
      "overround": 0.067441,
      "marketEfficiencyScore": 0.7358,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "13bdd2d3-a2cd-4e3b-95e7-f042f4569484",
      "market": "corners_over_under",
      "selection": "under",
      "line": 9.5,
      "odds": 1.78,
      "impliedProbability": 0.561798,
      "marketImpliedProbability": 0.569916,
      "marketFairProbability": 0.533886,
      "consensusFairOdds": 1.873059,
      "overround": 0.067441,
      "marketEfficiencyScore": 0.7358,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "2c4dda3e-c600-43c2-a03e-d8a62cea5a91",
      "market": "corners_over_under",
      "selection": "over",
      "line": 8,
      "odds": 1.43,
      "impliedProbability": 0.699301,
      "marketImpliedProbability": 0.699301,
      "marketFairProbability": 0.657895,
      "consensusFairOdds": 1.52,
      "overround": 0.062937,
      "marketEfficiencyScore": 0.6355,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "68467276-0420-4c7f-bb0e-8a830879f1c3",
      "market": "corners_over_under",
      "selection": "under",
      "line": 8,
      "odds": 2.75,
      "impliedProbability": 0.363636,
      "marketImpliedProbability": 0.363636,
      "marketFairProbability": 0.342105,
      "consensusFairOdds": 2.923077,
      "overround": 0.062937,
      "marketEfficiencyScore": 0.6355,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "b1e06d78-528b-4ae6-8242-6b2d3e01e892",
      "market": "corners_over_under",
      "selection": "over",
      "line": 9,
      "odds": 1.8,
      "impliedProbability": 0.555556,
      "marketImpliedProbability": 0.557107,
      "marketFairProbability": 0.527632,
      "consensusFairOdds": 1.895262,
      "overround": 0.055864,
      "marketEfficiencyScore": 0.7651,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "2b4b9ab3-4c80-457d-a58d-d24b387a2694",
      "market": "corners_over_under",
      "selection": "under",
      "line": 9,
      "odds": 2.01,
      "impliedProbability": 0.497512,
      "marketImpliedProbability": 0.498756,
      "marketFairProbability": 0.472368,
      "consensusFairOdds": 2.116992,
      "overround": 0.055864,
      "marketEfficiencyScore": 0.7651,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "2bb2469c-22c5-407d-b382-74f38aff68a7",
      "market": "corners_over_under",
      "selection": "over",
      "line": 10,
      "odds": 2.33,
      "impliedProbability": 0.429185,
      "marketImpliedProbability": 0.429185,
      "marketFairProbability": 0.404092,
      "consensusFairOdds": 2.474684,
      "overround": 0.062096,
      "marketEfficiencyScore": 0.6373,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    },
    {
      "oddsQuoteId": "e1d81d2c-99d2-4432-bc19-257f3cf74884",
      "market": "corners_over_under",
      "selection": "under",
      "line": 10,
      "odds": 1.58,
      "impliedProbability": 0.632911,
      "marketImpliedProbability": 0.632911,
      "marketFairProbability": 0.595908,
      "consensusFairOdds": 1.678112,
      "overround": 0.062096,
      "marketEfficiencyScore": 0.6373,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:42:49.961Z"
    }
  ],
  "providerContextWarnings": [
    "scoring prompt allowedQuotes trimmed from 52 to 39 representative quotes"
  ]
}
"""

input_data = json.loads(input_data_str)

predictions = []
overall_warnings = []
metadata = {}

# Helper to normalize team names for claim matching
home_team_name_lower = input_data["fixture"]["metadata"]["teams"]["home"]["name"].lower()
away_team_name_lower = input_data["fixture"]["metadata"]["teams"]["away"]["name"].lower()

def calculate_edge_confidence(odds, model_probability, market_fair_probability):
    edge = round(model_probability - market_fair_probability, 6) # Round edge for consistency
    # Simple confidence calculation based on edge magnitude and general assessment
    # Given no specific model for confidence, use a moderate default
    confidence = 0.6
    confidence_band = "medium"
    
    # Adjust confidence slightly based on availability of marketFairProbability
    if market_fair_probability is None:
        confidence = 0.5
        confidence_band = "low"

    return edge, confidence, confidence_band

# Canonical markets
canonical_markets = ["h2h", "double_chance", "goals_over_under", "corners_over_under", "btts"]

for market_type in input_data["requiredMarkets"]:
    if market_type not in canonical_markets:
        overall_warnings.append(f"Market '{market_type}' is not a canonical market and will be skipped.")
        continue

    market_quotes = [q for q in input_data["allowedQuotes"] if q["market"] == market_type]

    # Group quotes by line for markets like goals_over_under and corners_over_under
    if market_type in ["goals_over_under", "corners_over_under"]:
        quotes_by_line = {}
        for quote in market_quotes:
            line_key = str(quote["line"]) if quote["line"] is not None else "null"
            if line_key not in quotes_by_line:
                quotes_by_line[line_key] = []
            quotes_by_line[line_key].append(quote)
        
        # Process each line
        for line_key, quotes_for_line in quotes_by_line.items():
            for quote in quotes_for_line:
                odds_quote_id = quote["oddsQuoteId"]
                market = quote["market"]
                selection = quote["selection"]
                line = quote["line"]
                odds = quote["odds"]
                implied_probability = quote["impliedProbability"]
                market_fair_probability = quote.get("marketFairProbability")

                model_probability = market_fair_probability if market_fair_probability is not None else implied_probability
                
                prediction_warnings = []
                if market_fair_probability is None:
                    prediction_warnings.append("marketFairProbability not available for this quote, using impliedProbability as modelProbability for edge calculation.")

                edge, confidence, confidence_band = calculate_edge_confidence(odds, model_probability, market_fair_probability)

                relevant_claims = []
                relevant_claim_ids = []
                relevant_evidence_ids = []
                
                # Logic for finding claims
                for claim_obj in input_data["claims"]:
                    if claim_obj["marketKey"] == market:
                        match_selection_and_line = False
                        
                        claim_statement_lower = claim_obj["statement"].lower()

                        if market == "goals_over_under" and line is not None:
                            if f"{selection} {line} goals" in claim_statement_lower:
                                match_selection_and_line = True
                        elif market == "corners_over_under" and line is not None:
                             if f"{selection} {line} corners" in claim_statement_lower:
                                match_selection_and_line = True
                        
                        if match_selection_and_line:
                            relevant_claims.append(claim_obj)
                            relevant_claim_ids.append(claim_obj["id"])
                            relevant_evidence_ids.extend(claim_obj["evidenceIds"])

                relevant_evidence_ids = list(set(relevant_evidence_ids))

                promotable = bool(relevant_claim_ids)
                if not promotable:
                    prediction_warnings.append("No market-specific claimIds found for this selection and line. This pick is not promotable based on current evidence.")

                rationale = f"Based on available odds for {selection.replace('_', ' ')} {line if line is not None else ''} in {market} market."
                if relevant_claims:
                    rationale += " Supported by claims: " + "; ".join([c["statement"] for c in relevant_claims])
                else:
                    rationale += " No specific claims found to support this selection and line."
                
                predictions.append({
                    "oddsQuoteId": odds_quote_id,
                    "market": market,
                    "selection": selection,
                    "line": line,
                    "odds": odds,
                    "probability": round(model_probability, 6),
                    "modelProbability": round(model_probability, 6),
                    "marketFairProbability": round(market_fair_probability, 6) if market_fair_probability is not None else None,
                    "edge": edge,
                    "confidence": round(confidence, 2),
                    "confidenceBand": confidence_band,
                    "blockers": [],
                    "promotable": promotable,
                    "evidenceIds": relevant_evidence_ids,
                    "claimIds": relevant_claim_ids,
                    "rationale": rationale,
                    "warnings": prediction_warnings
                })
    else: # Markets without specific lines (h2h, double_chance, btts)
        for quote in market_quotes:
            odds_quote_id = quote["oddsQuoteId"]
            market = quote["market"]
            selection = quote["selection"]
            line = quote["line"] # Will be null for these markets
            odds = quote["odds"]
            implied_probability = quote["impliedProbability"]
            market_fair_probability = quote.get("marketFairProbability")

            model_probability = market_fair_probability if market_fair_probability is not None else implied_probability
            
            prediction_warnings = []
            if market_fair_probability is None:
                prediction_warnings.append("marketFairProbability not available for this quote, using impliedProbability as modelProbability for edge calculation.")

            edge, confidence, confidence_band = calculate_edge_confidence(odds, model_probability, market_fair_probability)

            relevant_claims = []
            relevant_claim_ids = []
            relevant_evidence_ids = []

            for claim_obj in input_data["claims"]:
                if claim_obj["marketKey"] == market:
                    match_selection = False
                    claim_statement_lower = claim_obj["statement"].lower()

                    if market == "h2h":
                        if selection == "home" and home_team_name_lower in claim_statement_lower and "win" in claim_statement_lower:
                            match_selection = True
                        elif selection == "draw" and "draw" in claim_statement_lower:
                            match_selection = True
                        elif selection == "away" and away_team_name_lower in claim_statement_lower and "win" in claim_statement_lower:
                            match_selection = True
                    elif market == "double_chance":
                        if selection == "home_or_draw" and f"{home_team_name_lower} to win or draw" in claim_statement_lower:
                            match_selection = True
                        elif selection == "home_or_away" and f"either {home_team_name_lower} or {away_team_name_lower} to win" in claim_statement_lower:
                            match_selection = True
                        elif selection == "draw_or_away" and f"draw or {away_team_name_lower} to win" in claim_statement_lower:
                            match_selection = True
                    elif market == "btts":
                        if selection == "yes" and "both teams to score 'yes'" in claim_statement_lower:
                            match_selection = True
                        elif selection == "no" and "both teams to score 'no'" in claim_statement_lower:
                            match_selection = True
                    
                    if match_selection:
                        relevant_claims.append(claim_obj)
                        relevant_claim_ids.append(claim_obj["id"])
                        relevant_evidence_ids.extend(claim_obj["evidenceIds"])

            relevant_evidence_ids = list(set(relevant_evidence_ids))

            promotable = bool(relevant_claim_ids)
            if not promotable:
                prediction_warnings.append("No market-specific claimIds found for this selection. This pick is not promotable based on current evidence.")

            rationale = f"Based on available odds for {selection.replace('_', ' ')} in {market} market."
            if relevant_claims:
                rationale += " Supported by claims: " + "; ".join([c["statement"] for c in relevant_claims])
            else:
                rationale += " No specific claims found to support this selection."
            
            predictions.append({
                "oddsQuoteId": odds_quote_id,
                "market": market,
                "selection": selection,
                "line": line,
                "odds": odds,
                "probability": round(model_probability, 6),
                "modelProbability": round(model_probability, 6),
                "marketFairProbability": round(market_fair_probability, 6) if market_fair_probability is not None else None,
                "edge": edge,
                "confidence": round(confidence, 2),
                "confidenceBand": confidence_band,
                "blockers": [],
                "promotable": promotable,
                "evidenceIds": relevant_evidence_ids,
                "claimIds": relevant_claim_ids,
                "rationale": rationale,
                "warnings": prediction_warnings
            })


output_json = {
    "predictions": predictions,
    "warnings": overall_warnings,
    "metadata": metadata
}

print(json.dumps(output_json, indent=2))
