import json

input_data = json.loads('''
{
  "promptVersion": "score-prediction-v2",
  "runId": "98235d1a-68e2-4e10-980f-1db7d08b6a42",
  "createdAt": "2026-05-28T17:46:19.236Z",
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
    "id": "29ff1215-57f6-40f8-b313-f1fcebd300af",
    "providerFixtureId": "1492709",
    "competitionId": "c5c97086-853b-4df8-841b-1b44bb81bd17",
    "season": 2026,
    "homeTeamId": "bc752199-0c95-461a-99f4-9e919dfe5a54",
    "awayTeamId": "3b1849da-0da6-4f99-92da-a572d2945fa9",
    "scheduledAt": "2026-05-29T18:45:00.000Z",
    "status": "scheduled",
    "scoreHome": null,
    "scoreAway": null,
    "includedByFilters": [],
    "metadata": {
      "league": {
        "id": 357,
        "name": "Premier Division",
        "country": "Ireland",
        "season": 2026,
        "round": "Regular Season - 19"
      },
      "teams": {
        "home": {
          "id": 3842,
          "name": "Sligo Rovers"
        },
        "away": {
          "id": 3840,
          "name": "Bohemians"
        }
      },
      "venue": "Showgrounds",
      "round": "Regular Season - 19",
      "timezone": "UTC",
      "apiFootballStatusShort": "NS",
      "apiFootballStatusLong": "Not Started"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1492709",
    "capturedAt": "2026-05-28T17:46:21.083Z",
    "providerSnapshotId": "df903998-9d70-4a96-a531-1394866b7164"
  },
  "oddsSnapshot": {
    "id": "52f5c2a0-ae5c-4c63-8264-7254f7420184",
    "fixtureId": "29ff1215-57f6-40f8-b313-f1fcebd300af",
    "providerFixtureId": "1492709",
    "providerSnapshotId": "63ec5004-a902-4e9e-8504-49aec9c8e0ba",
    "bookmakerCount": 2,
    "capturedAt": "2026-05-28T17:14:05.309Z",
    "payloadHash": "e39bbb65ca1df19184cda92d82e122922dfa830f1b9177038e63b56b08ab9aa1"
  },
  "researchBundle": {
    "id": "d332fbfd-636d-4b27-a63e-a4169e033949",
    "runId": "98235d1a-68e2-4e10-980f-1db7d08b6a42",
    "status": "promotable",
    "gateResult": {
      "reasons": [
        "Structured research generated with sufficient evidence from provider data and web search for all required markets.",
        "objective research gate passed with current web evidence"
      ],
      "verdict": "promotable",
      "warnings": [
        "Evidence for the corners_over_under market is based only on odds data, lacking statistical support from web research."
      ]
    },
    "providerAgentic": "gemini",
    "model": "gemini-2.5-pro",
    "promptVersion": "research-fixture-v2",
    "warnings": [
      "Evidence for the corners_over_under market is based only on odds data, lacking statistical support from web research."
    ],
    "metadata": {
      "runId": "98235d1a-68e2-4e10-980f-1db7d08b6a42",
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
        "realWebSearchSourceCount": 3,
        "syntheticWebSearchSourceCount": 0
      },
      "providerContextWarnings": []
    }
  },
  "sources": [
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:web-search-tips-gg",
      "type": "web-search",
      "url": "https://tips.gg/",
      "title": "Sligo Rovers vs Bohemians Dublin Prediction",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-05-28T17:15:00.000Z",
      "metadata": {}
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:web-search-sportsgambler",
      "type": "web-search",
      "url": "https://sportsgambler.com/",
      "title": "Sligo Rovers vs Bohemians Prediction, Team News, Lineups",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-05-28T17:15:00.000Z",
      "metadata": {}
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:web-search-fctables",
      "type": "web-search",
      "url": "https://fctables.com/",
      "title": "Sligo Rovers vs Bohemians H2H",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-05-28T17:15:00.000Z",
      "metadata": {}
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football odds snapshot",
      "externalId": "1492709",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-28T17:14:05.309Z",
      "metadata": {
        "fixtureId": "29ff1215-57f6-40f8-b313-f1fcebd300af",
        "quoteCount": 45,
        "snapshotId": "63ec5004-a902-4e9e-8504-49aec9c8e0ba",
        "bookmakerCount": 2,
        "oddsSnapshotId": "52f5c2a0-ae5c-4c63-8264-7254f7420184",
        "providerFixtureId": "1492709"
      }
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:api-football-odds",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football Odds Snapshot",
      "externalId": "api-football://api-football-odds/1492709",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-28T17:14:05.309Z",
      "metadata": {
        "provider": "api-football",
        "providerFixtureId": "1492709"
      }
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture statistics",
      "externalId": "1492709",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-28T17:14:04.427Z",
      "metadata": {
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "b88d211d-8258-4e5b-b44e-8cb4b2319f19",
        "providerFixtureId": "1492709"
      }
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:api-football-fixture",
      "type": "api-football",
      "url": null,
      "title": "API-Football Fixture Data",
      "externalId": "api-football://api-football-fixture/1492709",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-28T17:14:03.695Z",
      "metadata": {
        "provider": "api-football",
        "providerFixtureId": "1492709"
      }
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:source_api_football_fixture",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture",
      "externalId": "1492709",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-28T17:14:00.635Z",
      "metadata": {
        "fixtureId": "29ff1215-57f6-40f8-b313-f1fcebd300af",
        "providerFixtureId": "1492709"
      }
    }
  ],
  "evidenceItems": [
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-h2h-odds",
      "sourceId": "d332fbfd-636d-4b27-a63e-a4169e033949:api-football-odds",
      "summary": "Bohemians are the market favorites to win, with average odds around 1.70.",
      "confidence": 0.9,
      "claimIds": [
        "d332fbfd-636d-4b27-a63e-a4169e033949:claim-h2h-away"
      ],
      "metadata": {}
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-h2h-form",
      "sourceId": "d332fbfd-636d-4b27-a63e-a4169e033949:web-search-sportsgambler",
      "summary": "Bohemians are significantly higher in the league standings (3rd vs 9th) and have strong recent away form.",
      "confidence": 0.8,
      "claimIds": [
        "d332fbfd-636d-4b27-a63e-a4169e033949:claim-h2h-away"
      ],
      "metadata": {}
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-h2h-record",
      "sourceId": "d332fbfd-636d-4b27-a63e-a4169e033949:web-search-fctables",
      "summary": "Bohemians hold a historical head-to-head advantage over Sligo Rovers.",
      "confidence": 0.7,
      "claimIds": [
        "d332fbfd-636d-4b27-a63e-a4169e033949:claim-h2h-away"
      ],
      "metadata": {}
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-btts-prediction",
      "sourceId": "d332fbfd-636d-4b27-a63e-a4169e033949:web-search-tips-gg",
      "summary": "Multiple betting prediction sites suggest that both teams are likely to score in this match.",
      "confidence": 0.75,
      "claimIds": [
        "d332fbfd-636d-4b27-a63e-a4169e033949:claim-btts-yes"
      ],
      "metadata": {}
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-btts-odds",
      "sourceId": "d332fbfd-636d-4b27-a63e-a4169e033949:api-football-odds",
      "summary": "The odds for Both Teams to Score (BTTS) are evenly poised at 1.91, indicating a reasonable chance of it occurring.",
      "confidence": 0.85,
      "claimIds": [
        "d332fbfd-636d-4b27-a63e-a4169e033949:claim-btts-yes"
      ],
      "metadata": {}
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-over-under-prediction",
      "sourceId": "d332fbfd-636d-4b27-a63e-a4169e033949:web-search-tips-gg",
      "summary": "Web sources predict the match will have over 2.5 goals, citing Bohemians' recent scoring record.",
      "confidence": 0.7,
      "claimIds": [
        "d332fbfd-636d-4b27-a63e-a4169e033949:claim-goals-over-2.5"
      ],
      "metadata": {}
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-over-under-odds",
      "sourceId": "d332fbfd-636d-4b27-a63e-a4169e033949:api-football-odds",
      "summary": "The market odds for Over 2.5 goals are 1.95, suggesting it is a likely outcome.",
      "confidence": 0.9,
      "claimIds": [
        "d332fbfd-636d-4b27-a63e-a4169e033949:claim-goals-over-2.5"
      ],
      "metadata": {}
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-double-chance-odds",
      "sourceId": "d332fbfd-636d-4b27-a63e-a4169e033949:api-football-odds",
      "summary": "The odds for Bohemians to win or draw are very short at 1.17, indicating high confidence from the bookmakers.",
      "confidence": 0.95,
      "claimIds": [
        "d332fbfd-636d-4b27-a63e-a4169e033949:claim-dc-draw-away"
      ],
      "metadata": {}
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-corners-odds",
      "sourceId": "d332fbfd-636d-4b27-a63e-a4169e033949:api-football-odds",
      "summary": "Bookmaker odds suggest that Over 9.5 corners is the favored outcome at a price of 1.67.",
      "confidence": 0.8,
      "claimIds": [
        "d332fbfd-636d-4b27-a63e-a4169e033949:claim-corners-over-9.5"
      ],
      "metadata": {}
    }
  ],
  "claims": [
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:claim-h2h-away",
      "statement": "Bohemians are the favorites to win the match against Sligo Rovers.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-h2h-odds",
        "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-h2h-form",
        "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-h2h-record"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:claim-btts-yes",
      "statement": "Both teams are likely to score.",
      "marketKey": "btts",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-btts-prediction",
        "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-btts-odds"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:claim-goals-over-2.5",
      "statement": "The match is likely to have over 2.5 goals.",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-over-under-prediction",
        "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-over-under-odds"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:claim-dc-draw-away",
      "statement": "Bohemians are likely to win or draw the match.",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-double-chance-odds",
        "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-h2h-form"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "d332fbfd-636d-4b27-a63e-a4169e033949:claim-corners-over-9.5",
      "statement": "The match is likely to have over 9.5 corners.",
      "marketKey": "corners_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "d332fbfd-636d-4b27-a63e-a4169e033949:evidence-corners-odds"
      ],
      "conflictStatus": "none"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "b1702e45-be5a-4ff9-b6cf-ed7f5a2ff6c2",
      "market": "h2h",
      "selection": "away",
      "line": null,
      "odds": 1.71,
      "impliedProbability": 0.584795,
      "marketImpliedProbability": 0.586515,
      "marketFairProbability": 0.541801,
      "consensusFairOdds": 1.845698,
      "overround": 0.0829,
      "marketEfficiencyScore": 0.701,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "c23b6407-e6fe-4d96-b341-cf1aeeab02fe",
      "market": "h2h",
      "selection": "draw",
      "line": null,
      "odds": 3.73,
      "impliedProbability": 0.268097,
      "marketImpliedProbability": 0.281107,
      "marketFairProbability": 0.259451,
      "consensusFairOdds": 3.854297,
      "overround": 0.0829,
      "marketEfficiencyScore": 0.701,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "2457a994-30c6-4e22-aace-1ed3b9483484",
      "market": "h2h",
      "selection": "home",
      "line": null,
      "odds": 4.8,
      "impliedProbability": 0.208333,
      "marketImpliedProbability": 0.215278,
      "marketFairProbability": 0.198749,
      "consensusFairOdds": 5.031479,
      "overround": 0.0829,
      "marketEfficiencyScore": 0.701,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "9070ea61-a133-4974-98ef-2a36bfae42ef",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": null,
      "odds": 1.17,
      "impliedProbability": 0.854701,
      "marketImpliedProbability": 0.854701,
      "marketFairProbability": 0.40015,
      "consensusFairOdds": 2.499063,
      "overround": 1.135951,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "2efbde60-65fa-4954-91e3-7c970f2992e3",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": null,
      "odds": 1.28,
      "impliedProbability": 0.78125,
      "marketImpliedProbability": 0.78125,
      "marketFairProbability": 0.365762,
      "consensusFairOdds": 2.734017,
      "overround": 1.135951,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "f638e2f1-acd8-4393-8ffe-00e131f1174d",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": null,
      "odds": 2,
      "impliedProbability": 0.5,
      "marketImpliedProbability": 0.5,
      "marketFairProbability": 0.234088,
      "consensusFairOdds": 4.271902,
      "overround": 1.135951,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "6841dd97-5eba-4ddf-95ee-354960e38016",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.5,
      "odds": 1.3,
      "impliedProbability": 0.769231,
      "marketImpliedProbability": 0.77524,
      "marketFairProbability": 0.729267,
      "consensusFairOdds": 1.37124,
      "overround": 0.063025,
      "marketEfficiencyScore": 0.7466,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "5c7ec3bb-a08c-4949-ac0c-57e77cf503f6",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.5,
      "odds": 3.5,
      "impliedProbability": 0.285714,
      "marketImpliedProbability": 0.287785,
      "marketFairProbability": 0.270733,
      "consensusFairOdds": 3.693672,
      "overround": 0.063025,
      "marketEfficiencyScore": 0.7466,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "e39ba5af-7370-457c-b532-77191b5e2fc4",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.5,
      "odds": 1.95,
      "impliedProbability": 0.512821,
      "marketImpliedProbability": 0.514142,
      "marketFairProbability": 0.489494,
      "consensusFairOdds": 2.042924,
      "overround": 0.05037,
      "marketEfficiencyScore": 0.7746,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "0feb1aa0-221a-49f1-88dc-15d89ca0c53f",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.5,
      "odds": 1.88,
      "impliedProbability": 0.531915,
      "marketImpliedProbability": 0.536228,
      "marketFairProbability": 0.510506,
      "consensusFairOdds": 1.958842,
      "overround": 0.05037,
      "marketEfficiencyScore": 0.7746,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "714a5990-1664-4b8d-a007-a611bb4d2937",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.5,
      "odds": 3.4,
      "impliedProbability": 0.294118,
      "marketImpliedProbability": 0.296759,
      "marketFairProbability": 0.279158,
      "consensusFairOdds": 3.5822,
      "overround": 0.063054,
      "marketEfficiencyScore": 0.7483,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "1093299f-1755-4d4c-b884-d17011f2a39c",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.5,
      "odds": 1.31,
      "impliedProbability": 0.763359,
      "marketImpliedProbability": 0.766295,
      "marketFairProbability": 0.720842,
      "consensusFairOdds": 1.387267,
      "overround": 0.063054,
      "marketEfficiencyScore": 0.7483,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "54b8d26b-3995-4993-b067-68f88a7cbd71",
      "market": "goals_over_under",
      "selection": "over",
      "line": 0.5,
      "odds": 1.05,
      "impliedProbability": 0.952381,
      "marketImpliedProbability": 0.952381,
      "marketFairProbability": 0.912863,
      "consensusFairOdds": 1.095455,
      "overround": 0.04329,
      "marketEfficiencyScore": 0.6765,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "7fb6f68d-74a0-48b3-ab57-4df5eaa30661",
      "market": "goals_over_under",
      "selection": "under",
      "line": 0.5,
      "odds": 11,
      "impliedProbability": 0.090909,
      "marketImpliedProbability": 0.090909,
      "marketFairProbability": 0.087137,
      "consensusFairOdds": 11.47619,
      "overround": 0.04329,
      "marketEfficiencyScore": 0.6765,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "a5344eb4-c0b7-47ae-bab1-065854c2bee3",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.5,
      "odds": 6.5,
      "impliedProbability": 0.153846,
      "marketImpliedProbability": 0.154322,
      "marketFairProbability": 0.146246,
      "consensusFairOdds": 6.83779,
      "overround": 0.055223,
      "marketEfficiencyScore": 0.768,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "ab349481-7ebe-4160-ab23-ed970245b053",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.5,
      "odds": 1.11,
      "impliedProbability": 0.900901,
      "marketImpliedProbability": 0.900901,
      "marketFairProbability": 0.853754,
      "consensusFairOdds": 1.171298,
      "overround": 0.055223,
      "marketEfficiencyScore": 0.768,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "9fcb26d6-4ec8-4b9f-b7e2-66d00de07713",
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
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "040e70d1-6faa-4713-b708-782751d0cdac",
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
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "3fb3dd1b-3ffd-414b-b8be-cdb8ca87f821",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.25,
      "odds": 1.7,
      "impliedProbability": 0.588235,
      "marketImpliedProbability": 0.588235,
      "marketFairProbability": 0.558442,
      "consensusFairOdds": 1.790698,
      "overround": 0.053352,
      "marketEfficiencyScore": 0.6555,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "3dd5cf58-46b7-4966-a725-1297442b13e0",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.25,
      "odds": 2.15,
      "impliedProbability": 0.465116,
      "marketImpliedProbability": 0.465116,
      "marketFairProbability": 0.441558,
      "consensusFairOdds": 2.264706,
      "overround": 0.053352,
      "marketEfficiencyScore": 0.6555,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "6d542f5f-d72b-416d-adcd-bc6e79a17c28",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.75,
      "odds": 2.2,
      "impliedProbability": 0.454545,
      "marketImpliedProbability": 0.454545,
      "marketFairProbability": 0.431525,
      "consensusFairOdds": 2.317365,
      "overround": 0.053348,
      "marketEfficiencyScore": 0.6555,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "ed771813-8bc7-45fc-af46-b302902bb9fb",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.75,
      "odds": 1.67,
      "impliedProbability": 0.598802,
      "marketImpliedProbability": 0.598802,
      "marketFairProbability": 0.568475,
      "consensusFairOdds": 1.759091,
      "overround": 0.053348,
      "marketEfficiencyScore": 0.6555,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "db6944e4-0641-4d04-aa74-3b7a77ffe66a",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3,
      "odds": 2.68,
      "impliedProbability": 0.373134,
      "marketImpliedProbability": 0.373134,
      "marketFairProbability": 0.354217,
      "consensusFairOdds": 2.823129,
      "overround": 0.053406,
      "marketEfficiencyScore": 0.6554,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "e8acf23f-0a9f-42e4-bab1-2428922c9773",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2,
      "odds": 1.47,
      "impliedProbability": 0.680272,
      "marketImpliedProbability": 0.680272,
      "marketFairProbability": 0.645783,
      "consensusFairOdds": 1.548507,
      "overround": 0.053406,
      "marketEfficiencyScore": 0.6554,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "5d36ee19-7b72-4854-9e24-f64e2fc56739",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2,
      "odds": 2.68,
      "impliedProbability": 0.373134,
      "marketImpliedProbability": 0.373134,
      "marketFairProbability": 0.354217,
      "consensusFairOdds": 2.823129,
      "overround": 0.053406,
      "marketEfficiencyScore": 0.6554,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "198eb0d9-53f0-4150-886e-5bdda93405a2",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3,
      "odds": 1.47,
      "impliedProbability": 0.680272,
      "marketImpliedProbability": 0.680272,
      "marketFairProbability": 0.645783,
      "consensusFairOdds": 1.548507,
      "overround": 0.053406,
      "marketEfficiencyScore": 0.6554,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "4c2d152f-9fe9-4612-bf64-6198313775ee",
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
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "a68ceb21-2f14-44aa-ba24-ae7db83d0544",
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
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "f53985cb-468a-4380-bc56-dbe026a31b3c",
      "market": "btts",
      "selection": "no",
      "line": null,
      "odds": 1.91,
      "impliedProbability": 0.52356,
      "marketImpliedProbability": 0.52356,
      "marketFairProbability": 0.5,
      "consensusFairOdds": 2,
      "overround": 0.04712,
      "marketEfficiencyScore": 0.6685,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "6dd58035-de7d-4d87-b361-a744bf3bf118",
      "market": "btts",
      "selection": "yes",
      "line": null,
      "odds": 1.91,
      "impliedProbability": 0.52356,
      "marketImpliedProbability": 0.52356,
      "marketFairProbability": 0.5,
      "consensusFairOdds": 2,
      "overround": 0.04712,
      "marketEfficiencyScore": 0.6685,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "67da065a-48aa-412d-ad7d-e38fe094b0ed",
      "market": "corners_over_under",
      "selection": "over",
      "line": 9.5,
      "odds": 1.67,
      "impliedProbability": 0.598802,
      "marketImpliedProbability": 0.598802,
      "marketFairProbability": 0.557029,
      "consensusFairOdds": 1.795238,
      "overround": 0.074993,
      "marketEfficiencyScore": 0.6104,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "af7ccf12-8533-47f8-93d3-d73cf51f323b",
      "market": "corners_over_under",
      "selection": "under",
      "line": 9.5,
      "odds": 2.1,
      "impliedProbability": 0.47619,
      "marketImpliedProbability": 0.47619,
      "marketFairProbability": 0.442971,
      "consensusFairOdds": 2.257485,
      "overround": 0.074993,
      "marketEfficiencyScore": 0.6104,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "add39d17-147b-48b6-93de-2d42afb0b585",
      "market": "corners_over_under",
      "selection": "over",
      "line": 10,
      "odds": 1.92,
      "impliedProbability": 0.520833,
      "marketImpliedProbability": 0.520833,
      "marketFairProbability": 0.494737,
      "consensusFairOdds": 2.021277,
      "overround": 0.052748,
      "marketEfficiencyScore": 0.6568,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    },
    {
      "oddsQuoteId": "87238c72-5b6a-4650-9368-d116737b3028",
      "market": "corners_over_under",
      "selection": "under",
      "line": 10,
      "odds": 1.88,
      "impliedProbability": 0.531915,
      "marketImpliedProbability": 0.531915,
      "marketFairProbability": 0.505263,
      "consensusFairOdds": 1.979167,
      "overround": 0.052748,
      "marketEfficiencyScore": 0.6568,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-28T17:14:05.309Z"
    }
  ],
  "providerContextWarnings": [
    "scoring prompt allowedQuotes trimmed from 45 to 34 representative quotes"
  ]
}
''')

required_markets = input_data['requiredMarkets']
allowed_quotes = input_data['allowedQuotes']
claims = input_data['claims']
evidence_items = input_data['evidenceItems']
research_bundle_warnings = input_data['researchBundle']['warnings']

predictions = []
overall_warnings = []

# Helper to get confidence band
def get_confidence_band(confidence):
    if confidence > 0.8:
        return 'high'
    elif confidence >= 0.7:
        return 'medium'
    else:
        return 'low'

for market_key in required_markets:
    # Find the claim for the current market
    relevant_claim = next((c for c in claims if c['marketKey'] == market_key), None)

    if not relevant_claim:
        overall_warnings.append(f"No relevant claim found for market: {market_key}")
        continue

    # Determine the selection based on the claim statement. This is a heuristic.
    selection = None
    line = None

    if market_key == 'h2h':
        if 'Bohemians are the favorites to win' in relevant_claim['statement']:
            selection = 'away'
        elif 'Sligo Rovers are the favorites to win' in relevant_claim['statement']:
            selection = 'home'
        elif 'draw' in relevant_claim['statement']:
            selection = 'draw'
    elif market_key == 'double_chance':
        if 'Bohemians are likely to win or draw' in relevant_claim['statement']:
            selection = 'draw_or_away'
        elif 'Sligo Rovers are likely to win or draw' in relevant_claim['statement']:
            selection = 'home_or_draw'
        elif 'Either team to win' in relevant_claim['statement']: # Assuming this for home_or_away
            selection = 'home_or_away'
    elif market_key == 'goals_over_under':
        if 'over 2.5 goals' in relevant_claim['statement']:
            selection = 'over'
            line = 2.5
        elif 'under 2.5 goals' in relevant_claim['statement']:
            selection = 'under'
            line = 2.5
        elif 'over 1.5 goals' in relevant_claim['statement']: # Add other common lines
            selection = 'over'
            line = 1.5
        elif 'under 1.5 goals' in relevant_claim['statement']:
            selection = 'under'
            line = 1.5
        elif 'over 3.5 goals' in relevant_claim['statement']:
            selection = 'over'
            line = 3.5
        elif 'under 3.5 goals' in relevant_claim['statement']:
            selection = 'under'
            line = 3.5
        elif 'over 0.5 goals' in relevant_claim['statement']:
            selection = 'over'
            line = 0.5
        elif 'under 0.5 goals' in relevant_claim['statement']:
            selection = 'under'
            line = 0.5
        elif 'over 4.5 goals' in relevant_claim['statement']:
            selection = 'over'
            line = 4.5
        elif 'under 4.5 goals' in relevant_claim['statement']:
            selection = 'under'
            line = 4.5
        elif 'over 5.5 goals' in relevant_claim['statement']:
            selection = 'over'
            line = 5.5
        elif 'under 5.5 goals' in relevant_claim['statement']:
            selection = 'under'
            line = 5.5
        elif 'over 6.5 goals' in relevant_claim['statement']:
            selection = 'over'
            line = 6.5
        elif 'under 6.5 goals' in relevant_claim['statement']:
            selection = 'under'
            line = 6.5
    elif market_key == 'corners_over_under':
        if 'over 9.5 corners' in relevant_claim['statement']:
            selection = 'over'
            line = 9.5
        elif 'under 9.5 corners' in relevant_claim['statement']:
            selection = 'under'
            line = 9.5
        elif 'over 10.5 corners' in relevant_claim['statement']: # Add other common lines
            selection = 'over'
            line = 10.5
        elif 'under 10.5 corners' in relevant_claim['statement']:
            selection = 'under'
            line = 10.5
    elif market_key == 'btts':
        if 'Both teams are likely to score' in relevant_claim['statement']:
            selection = 'yes'
        elif 'Both teams are not likely to score' in relevant_claim['statement']:
            selection = 'no'

    if not selection:
        overall_warnings.append(f"Could not determine selection for market {market_key} from claim: {relevant_claim['statement']}")
        continue

    # Find the matching allowedQuote
    matching_quote = next((
        q for q in allowed_quotes
        if q['market'] == market_key and q['selection'] == selection and q['line'] == line
    ), None)

    if not matching_quote:
        overall_warnings.append(f"No matching allowedQuote found for market: {market_key}, selection: {selection}, line: {line}")
        continue

    # Calculate modelProbability and confidence based on supporting evidence
    supporting_evidence_confidences = []
    for evidence_id in relevant_claim['evidenceIds']:
        evidence = next((e for e in evidence_items if e['id'] == evidence_id), None)
        if evidence and 'confidence' in evidence:
            supporting_evidence_confidences.append(evidence['confidence'])

    # Heuristic for modelProbability and confidence: average of supporting evidence confidences.
    # If no evidence, use a default low confidence to still emit a pick with warnings.
    if supporting_evidence_confidences:
        model_confidence = sum(supporting_evidence_confidences) / len(supporting_evidence_confidences)
    else:
        model_confidence = 0.5 # Default low confidence if no direct evidence confidence

    model_probability = round(model_confidence, 2) # Use confidence as probability heuristic
    confidence = round(model_confidence, 2)

    market_fair_probability = matching_quote['marketFairProbability']
    edge = round(model_probability - market_fair_probability, 2)
    confidence_band = get_confidence_band(confidence)

    # Check for promotability warnings
    prediction_warnings = []
    is_promotable = True
    if market_key == 'corners_over_under' and 'Evidence for the corners_over_under market is based only on odds data, lacking statistical support from web research.' in research_bundle_warnings:
        prediction_warnings.append('Evidence for this market is based only on odds data, lacking statistical support from web research.')
        # Based on the prompt, even with this warning, it can still be promotable if it's the best analytical candidate.
        # For this exercise, I'll keep it promotable but with the warning.

    prediction = {
        'oddsQuoteId': matching_quote['oddsQuoteId'],
        'market': market_key,
        'selection': selection,
        'line': line,
        'odds': matching_quote['odds'],
        'probability': round(model_probability, 2), # Using model_probability for probability
        'modelProbability': round(model_probability, 2),
        'marketFairProbability': round(market_fair_probability, 2),
        'edge': round(edge, 2), # Ensure edge is rounded
        'confidence': confidence,
        'confidenceBand': confidence_band,
        'blockers': [],
        'promotable': is_promotable,
        'evidenceIds': relevant_claim['evidenceIds'],
        'claimIds': [relevant_claim['id']],
        'rationale': relevant_claim['statement'].replace('Bohemians', 'Away Team').replace('Sligo Rovers', 'Home Team'), # Redact team names for generic rationale
        'warnings': prediction_warnings
    }
    predictions.append(prediction)

output_json = {
    'predictions': predictions,
    'warnings': overall_warnings,
    'metadata': {}
}

print(json.dumps(output_json, indent=2))
