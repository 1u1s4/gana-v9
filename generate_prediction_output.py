
import json

input_data = {
  "promptVersion": "score-prediction-v2",
  "runId": "e39f2330-ada0-4514-82f8-8a09d6f71648",
  "createdAt": "2026-05-26T16:30:47.691Z",
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
    "id": "6469748d-cd2b-4128-80c4-f9150e4f3291",
    "providerFixtureId": "1546010",
    "competitionId": "2f85377a-bf57-4ae6-94aa-6ee386b3fe91",
    "season": 2026,
    "homeTeamId": "1ad1ec91-b333-48a8-a4f8-37fcbca8becc",
    "awayTeamId": "900a405d-9efb-4147-b119-78fc89eb62ea",
    "scheduledAt": "2026-05-26T15:00:00.000Z",
    "status": "live",
    "scoreHome": 1,
    "scoreAway": 0,
    "includedByFilters": [],
    "metadata": {
      "league": {
        "id": 1229,
        "name": "Liga Women",
        "country": "Peru",
        "season": 2026,
        "round": "Regular Season - 4"
      },
      "teams": {
        "home": {
          "id": 27781,
          "name": "Yanapuma W"
        },
        "away": {
          "id": 20518,
          "name": "Alianza Lima W"
        }
      },
      "round": "Regular Season - 4",
      "timezone": "UTC",
      "apiFootballStatusShort": "2H",
      "apiFootballStatusLong": "Second Half"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1546010",
    "capturedAt": "2026-05-26T16:30:49.874Z",
    "providerSnapshotId": "d25548c4-c120-42bf-8aa2-0236615e7705"
  },
  "oddsSnapshot": {
    "id": "abdb8926-1f0d-46cf-8350-11d75b8564c1",
    "fixtureId": "6469748d-cd2b-4128-80c4-f9150e4f3291",
    "providerFixtureId": "1546010",
    "providerSnapshotId": "0e6a26af-ead0-416f-93fa-aa3d1ee6a029",
    "bookmakerCount": 2,
    "capturedAt": "2026-05-26T16:05:38.587Z",
    "payloadHash": "d2e622390b6df7bf7fa339afae5101f8c789930a050959171ae778f4ebc250a4"
  },
  "researchBundle": {
    "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4",
    "runId": "e39f2330-ada0-4514-82f8-8a09d6f71648",
    "status": "promotable",
    "gateResult": {
      "reasons": [
        "Research downgraded due to missing odds and reliable statistics for some required markets.",
        "The provided 'fixtureStatistics' snapshot from the provider was empty, requiring full reliance on web search for statistical claims.",
        "objective research gate passed with current web evidence"
      ],
      "verdict": "promotable",
      "warnings": [
        "mapped invalid supportLevel 'uncertain' to 'weak' on claim 'claim-btts'",
        "market corners_over_under skipped/review-required: missing odds quotes for requested market",
        "market btts skipped/review-required: missing odds quotes for requested market"
      ]
    },
    "providerAgentic": "gemini",
    "model": "gemini-2.5-pro",
    "promptVersion": "research-fixture-v2",
    "warnings": [
      "mapped invalid supportLevel 'uncertain' to 'weak' on claim 'claim-btts'",
      "market corners_over_under skipped/review-required: missing odds quotes for requested market",
      "market btts skipped/review-required: missing odds quotes for requested market"
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
          "market corners_over_under skipped/review-required: missing odds quotes for requested market",
          "market btts skipped/review-required: missing odds quotes for requested market"
        ],
        "quotedMarkets": [
          "double_chance",
          "goals_over_under",
          "h2h"
        ],
        "skippedMarkets": [
          {
            "market": "corners_over_under",
            "reason": "missing odds quotes for requested market"
          },
          {
            "market": "btts",
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
        "mapped invalid supportLevel 'uncertain' to 'weak' on claim 'claim-btts'",
        "market corners_over_under skipped/review-required: missing odds quotes for requested market",
        "market btts skipped/review-required: missing odds quotes for requested market"
      ],
      "webSearchCoverage": {
        "mode": "live",
        "provider": "gemini",
        "required": True,
        "nativeToolUsed": True,
        "nativeSupported": True,
        "browserFallbackUsed": False,
        "realWebSearchSourceCount": 1,
        "syntheticWebSearchSourceCount": 0
      },
      "providerContextWarnings": []
    }
  },
  "sources": [
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:web-search-1",
      "type": "web-search",
      "url": "https://livescores.biz/pre-match/yanapuma-sport-vs-alianza-lima-w",
      "title": "Yanapuma Sport vs Alianza Lima W H2H, Standings, Predictions",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-05-26T16:06:00.000Z",
      "metadata": {}
    },
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": None,
      "title": "API-Football odds snapshot",
      "externalId": "1546010",
      "providerSnapshotId": None,
      "capturedAt": "2026-05-26T16:05:38.587Z",
      "metadata": {
        "fixtureId": "6469748d-cd2b-4128-80c4-f9150e4f3291",
        "quoteCount": 25,
        "snapshotId": "0e6a26af-ead0-416f-93fa-aa3d1ee6a029",
        "bookmakerCount": 2,
        "oddsSnapshotId": "abdb8926-1f0d-46cf-8350-11d75b8564c1",
        "providerFixtureId": "1546010"
      }
    },
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:provider-odds-0e6a26af",
      "type": "provider-snapshot",
      "url": None,
      "title": "Odds Snapshot",
      "externalId": "api-football://provider-odds-0e6a26af/1546010",
      "providerSnapshotId": None,
      "capturedAt": "2026-05-26T16:05:38.587Z",
      "metadata": {
        "bookmakerCount": 2,
        "providerFixtureId": "1546010"
      }
    },
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": None,
      "title": "API-Football fixture statistics",
      "externalId": "1546010",
      "providerSnapshotId": None,
      "capturedAt": "2026-05-26T16:05:36.976Z",
      "metadata": {
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "952819f6-e02f-4d95-8686-53ff648b1b75",
        "providerFixtureId": "1546010"
      }
    },
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:provider-stats-952819f6",
      "type": "api-football",
      "url": None,
      "title": "API-Football Statistics Snapshot",
      "externalId": "api-football://provider-stats-952819f6/1546010",
      "providerSnapshotId": None,
      "capturedAt": "2026-05-26T16:05:36.976Z",
      "metadata": {
        "provider": "api-football",
        "providerFixtureId": "1546010"
      }
    },
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:source_api_football_fixture",
      "type": "api-football",
      "url": None,
      "title": "API-Football fixture",
      "externalId": "1546010",
      "providerSnapshotId": None,
      "capturedAt": "2026-05-26T16:05:30.741Z",
      "metadata": {
        "fixtureId": "6469748d-cd2b-4128-80c4-f9150e4f3291",
        "providerFixtureId": "1546010"
      }
    },
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:provider-fixture-18c80997",
      "type": "api-football",
      "url": None,
      "title": "API-Football Fixture Snapshot",
      "externalId": "api-football://provider-fixture-18c80997/1546010",
      "providerSnapshotId": None,
      "capturedAt": "2026-05-26T16:02:55.883Z",
      "metadata": {
        "provider": "api-football",
        "providerFixtureId": "1546010"
      }
    }
  ],
  "evidenceItems": [
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:evidence-h2h-odds",
      "sourceId": "fa56e894-4591-4fcf-9064-05db8f59f1f4:provider-odds-0e6a26af",
      "summary": "The odds across multiple bookmakers heavily favor Alianza Lima W, with an average price around 1.12, implying a probability of ~89% for an away win.",
      "confidence": 0.95,
      "claimIds": [
        "fa56e894-4591-4fcf-9064-05db8f59f1f4:claim-h2h-away-win"
      ],
      "metadata": {}
    },
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:evidence-web-form",
      "sourceId": "fa56e894-4591-4fcf-9064-05db8f59f1f4:web-search-1",
      "summary": "Web search results indicate Yanapuma W had a recent 10-0 loss against a top team (Universitario), suggesting a significant defensive vulnerability against strong opponents like Alianza Lima W.",
      "confidence": 0.85,
      "claimIds": [
        "fa56e894-4591-4fcf-9064-05db8f59f1f4:claim-h2h-away-win",
        "fa56e894-4591-4fcf-9064-05db8f59f1f4:claim-goals-over"
      ],
      "metadata": {}
    },
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:evidence-dc-odds",
      "sourceId": "fa56e894-4591-4fcf-9064-05db8f59f1f4:provider-odds-0e6a26af",
      "summary": "The 'Draw or Away' double chance market has a price of 1.01, indicating it is considered almost a certainty by the bookmaker.",
      "confidence": 0.98,
      "claimIds": [
        "fa56e894-4591-4fcf-9064-05db8f59f1f4:claim-dc-draw-away"
      ],
      "metadata": {}
    },
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:evidence-goals-over-odds",
      "sourceId": "fa56e894-4591-4fcf-9064-05db8f59f1f4:provider-odds-0e6a26af",
      "summary": "Pinnacle's odds for Over 3.5 goals are 1.43, implying a high probability (~70%) of a high-scoring match.",
      "confidence": 0.9,
      "claimIds": [
        "fa56e894-4591-4fcf-9064-05db8f59f1f4:claim-goals-over"
      ],
      "metadata": {}
    },
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:evidence-btts-web",
      "sourceId": "fa56e894-4591-4fcf-9064-05db8f59f1f4:web-search-1",
      "summary": "Web search provides conflicting evidence for BTTS. Yanapuma was shut out in a recent heavy loss but has scored in other matches. Alianza Lima's record is also mixed. There is no clear trend.",
      "confidence": 0.6,
      "claimIds": [
        "fa56e894-4591-4fcf-9064-05db8f59f1f4:claim-btts"
      ],
      "metadata": {}
    }
  ],
  "claims": [
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:claim-h2h-away-win",
      "statement": "Alianza Lima W is the overwhelming favorite to win the match.",
      "marketKey": "h2h",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "fa56e894-4591-4fcf-9064-05db8f59f1f4:evidence-h2h-odds",
        "fa56e894-4591-4fcf-9064-05db8f59f1f4:evidence-web-form"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:claim-dc-draw-away",
      "statement": "Alianza Lima W is extremely likely to secure at least a draw.",
      "marketKey": "double_chance",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "fa56e894-4591-4fcf-9064-05db8f59f1f4:evidence-dc-odds"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:claim-goals-over",
      "statement": "The match is likely to have over 3.5 goals.",
      "marketKey": "goals_over_under",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "fa56e894-4591-4fcf-9064-05db8f59f1f4:evidence-goals-over-odds",
        "fa56e894-4591-4fcf-9064-05db8f59f1f4:evidence-web-form"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "fa56e894-4591-4fcf-9064-05db8f59f1f4:claim-btts",
      "statement": "It is uncertain whether both teams will score.",
      "marketKey": "btts",
      "selectionKey": None,
      "line": None,
      "supportLevel": "weak",
      "confidence": None,
      "evidenceIds": [
        "fa56e894-4591-4fcf-9064-05db8f59f1f4:evidence-btts-web"
      ],
      "conflictStatus": "none"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "4e0609a6-c068-4ead-a506-c13cdf7d549e",
      "market": "h2h",
      "selection": "away",
      "line": None,
      "odds": 1.14,
      "impliedProbability": 0.877193,
      "marketImpliedProbability": 0.893142,
      "marketFairProbability": 0.818187,
      "consensusFairOdds": 1.222214,
      "overround": 0.092003,
      "marketEfficiencyScore": 0.6772,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "72e832eb-73cc-4a2b-86c4-7d07f0e8b2eb",
      "market": "h2h",
      "selection": "draw",
      "line": None,
      "odds": 9.5,
      "impliedProbability": 0.105263,
      "marketImpliedProbability": 0.114821,
      "marketFairProbability": 0.104979,
      "consensusFairOdds": 9.525711,
      "overround": 0.092003,
      "marketEfficiencyScore": 0.6772,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "df396015-fc09-41db-a294-9ef44d513c58",
      "market": "h2h",
      "selection": "home",
      "line": None,
      "odds": 13,
      "impliedProbability": 0.076923,
      "marketImpliedProbability": 0.08404,
      "marketFairProbability": 0.076834,
      "consensusFairOdds": 13.01512,
      "overround": 0.092003,
      "marketEfficiencyScore": 0.6772,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "0e620873-2729-450b-be63-c6da71740daf",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": None,
      "odds": 1.01,
      "impliedProbability": 0.990099,
      "marketImpliedProbability": 0.990099,
      "marketFairProbability": 0.460161,
      "consensusFairOdds": 2.173154,
      "overround": 1.151637,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "823147ba-1dcc-4271-a294-b3093bd66459",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": None,
      "odds": 1.04,
      "impliedProbability": 0.961538,
      "marketImpliedProbability": 0.961538,
      "marketFairProbability": 0.446887,
      "consensusFairOdds": 2.237703,
      "overround": 1.151637,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "7e254c97-2ac2-4832-a8ad-fb9f21f68dde",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": None,
      "odds": 5,
      "impliedProbability": 0.2,
      "marketImpliedProbability": 0.2,
      "marketFairProbability": 0.092952,
      "consensusFairOdds": 10.758187,
      "overround": 1.151637,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "3ae24a6a-8603-46ff-9233-49cc26398162",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.5,
      "odds": 1.17,
      "impliedProbability": 0.854701,
      "marketImpliedProbability": 0.854701,
      "marketFairProbability": 0.793651,
      "consensusFairOdds": 1.26,
      "overround": 0.076923,
      "marketEfficiencyScore": 0.6064,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "b926206b-4e5b-406b-8a93-4e2bc6f4f6d1",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.5,
      "odds": 4.5,
      "impliedProbability": 0.222222,
      "marketImpliedProbability": 0.222222,
      "marketFairProbability": 0.206349,
      "consensusFairOdds": 4.846154,
      "overround": 0.076923,
      "marketEfficiencyScore": 0.6064,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "15b7dcbe-24cc-43a0-b00d-616b36fe40cd",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.5,
      "odds": 1.43,
      "impliedProbability": 0.699301,
      "marketImpliedProbability": 0.699301,
      "marketFairProbability": 0.635204,
      "consensusFairOdds": 1.574297,
      "overround": 0.100907,
      "marketEfficiencyScore": 0.5564,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "4b9e0118-aae8-48dd-b35b-6de268475a9c",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.5,
      "odds": 2.49,
      "impliedProbability": 0.401606,
      "marketImpliedProbability": 0.401606,
      "marketFairProbability": 0.364796,
      "consensusFairOdds": 2.741259,
      "overround": 0.100907,
      "marketEfficiencyScore": 0.5564,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "13783a41-b355-4dd7-b186-c7d1cb28644f",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.5,
      "odds": 2.03,
      "impliedProbability": 0.492611,
      "marketImpliedProbability": 0.492611,
      "marketFairProbability": 0.451351,
      "consensusFairOdds": 2.215569,
      "overround": 0.091413,
      "marketEfficiencyScore": 0.5762,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "f0e4ce38-56c6-4f9b-92be-f4034096e10a",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.5,
      "odds": 1.67,
      "impliedProbability": 0.598802,
      "marketImpliedProbability": 0.598802,
      "marketFairProbability": 0.548649,
      "consensusFairOdds": 1.82266,
      "overround": 0.091413,
      "marketEfficiencyScore": 0.5762,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "52ae43b2-6761-4f36-94c7-8943f883ca43",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.75,
      "odds": 1.52,
      "impliedProbability": 0.657895,
      "marketImpliedProbability": 0.657895,
      "marketFairProbability": 0.598945,
      "consensusFairOdds": 1.669604,
      "overround": 0.098423,
      "marketEfficiencyScore": 0.5616,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "505dd113-bb06-43ba-b16b-220d1da7ac94",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.75,
      "odds": 2.27,
      "impliedProbability": 0.440529,
      "marketImpliedProbability": 0.440529,
      "marketFairProbability": 0.401055,
      "consensusFairOdds": 2.493421,
      "overround": 0.098423,
      "marketEfficiencyScore": 0.5616,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "653116cd-b100-4375-b4a6-4bc2ea939f5a",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.75,
      "odds": 2.25,
      "impliedProbability": 0.444444,
      "marketImpliedProbability": 0.444444,
      "marketFairProbability": 0.404762,
      "consensusFairOdds": 2.470588,
      "overround": 0.098039,
      "marketEfficiencyScore": 0.5624,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "8402c30f-9d7d-43eb-af39-49c66968da8d",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.25,
      "odds": 1.85,
      "impliedProbability": 0.540541,
      "marketImpliedProbability": 0.540541,
      "marketFairProbability": 0.498645,
      "consensusFairOdds": 2.005435,
      "overround": 0.084019,
      "marketEfficiencyScore": 0.5916,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "26bcd6ad-23c3-404d-8e3a-42439dec3cc2",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4,
      "odds": 1.65,
      "impliedProbability": 0.606061,
      "marketImpliedProbability": 0.606061,
      "marketFairProbability": 0.555256,
      "consensusFairOdds": 1.800971,
      "overround": 0.091497,
      "marketEfficiencyScore": 0.576,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "fb2312cc-9898-433d-b2e2-e81d1d4d394c",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4,
      "odds": 2.06,
      "impliedProbability": 0.485437,
      "marketImpliedProbability": 0.485437,
      "marketFairProbability": 0.444744,
      "consensusFairOdds": 2.248485,
      "overround": 0.091497,
      "marketEfficiencyScore": 0.576,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "f30fea5e-d110-462e-a7f7-143607ed1ffc",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.25,
      "odds": 1.84,
      "impliedProbability": 0.543478,
      "marketImpliedProbability": 0.543478,
      "marketFairProbability": 0.501355,
      "consensusFairOdds": 1.994595,
      "overround": 0.084019,
      "marketEfficiencyScore": 0.5916,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "8611ceef-06b4-403d-8108-8f0e5e10ad5e",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.75,
      "odds": 1.53,
      "impliedProbability": 0.653595,
      "marketImpliedProbability": 0.653595,
      "marketFairProbability": 0.595238,
      "consensusFairOdds": 1.68,
      "overround": 0.098039,
      "marketEfficiencyScore": 0.5624,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "b83d240a-25cf-4bf2-9a5a-c82026ba8764",
      "market": "goals_over_under",
      "selection": "over",
      "line": 5,
      "odds": 2.62,
      "impliedProbability": 0.381679,
      "marketImpliedProbability": 0.381679,
      "marketFairProbability": 0.346633,
      "consensusFairOdds": 2.884892,
      "overround": 0.101104,
      "marketEfficiencyScore": 0.556,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    },
    {
      "oddsQuoteId": "09b2ff46-7917-4f72-a008-6d282c79ab72",
      "market": "goals_over_under",
      "selection": "under",
      "line": 5,
      "odds": 1.39,
      "impliedProbability": 0.719424,
      "marketImpliedProbability": 0.719424,
      "marketFairProbability": 0.653367,
      "consensusFairOdds": 1.530534,
      "overround": 0.101104,
      "marketEfficiencyScore": 0.556,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-26T16:05:38.587Z"
    }
  ],
  "providerContextWarnings": [
    "scoring prompt allowedQuotes trimmed from 25 to 22 representative quotes"
  ]
}

def get_claim_by_id(claim_id, claims_data):
    for claim in claims_data:
        if claim["id"] == claim_id:
            return claim
    return None

def get_evidence_by_id(evidence_id, evidence_data):
    for evidence in evidence_data:
        if evidence["id"] == evidence_id:
            return evidence
    return None

def calculate_model_probability_and_confidence(claim_obj, evidence_data):
    if not claim_obj or not claim_obj["evidenceIds"]:
        return 0.5, 0.5, "very low" # Default if claim not found or no evidence

    total_confidence = 0
    count = 0
    for evidence_id in claim_obj["evidenceIds"]:
        evidence = get_evidence_by_id(evidence_id, evidence_data)
        if evidence and evidence["confidence"] is not None:
            total_confidence += evidence["confidence"]
            count += 1
    
    model_probability = total_confidence / count if count > 0 else 0.5 # Default if no evidence
    
    confidence = model_probability # Using model_probability as confidence for now
    
    if confidence > 0.85:
        confidence_band = "high"
    elif confidence > 0.70:
        confidence_band = "medium"
    elif confidence > 0.50:
        confidence_band = "low"
    else:
        confidence_band = "very low"
            
    return model_probability, confidence, confidence_band

# Extract relevant data
claims_data = input_data["claims"]
evidence_items_data = input_data["evidenceItems"]
allowed_quotes_data = input_data["allowedQuotes"]
required_markets = input_data["requiredMarkets"]
research_bundle_warnings = input_data["researchBundle"].get("warnings", [])

predictions = []
output_warnings = list(research_bundle_warnings) # Start with existing research bundle warnings

# Helper to find an allowed quote
def find_quote(market, selection, line=None):
    for quote in allowed_quotes_data:
        if quote["market"] == market and quote["selection"] == selection:
            if line is None or (quote.get("line") is not None and abs(quote["line"] - line) < 0.001):
                return quote
    return None

# Process H2H market
if "h2h" in required_markets:
    h2h_claim = get_claim_by_id("fa56e894-4591-4fcf-9064-05db8f59f1f4:claim-h2h-away-win", claims_data)
    if h2h_claim:
        h2h_quote = find_quote("h2h", "away")
        if h2h_quote:
            model_prob, confidence, confidence_band = calculate_model_probability_and_confidence(h2h_claim, evidence_items_data)
            edge = model_prob - h2h_quote["marketFairProbability"]
            
            predictions.append({
                "oddsQuoteId": h2h_quote["oddsQuoteId"],
                "market": "h2h",
                "selection": "away",
                "line": None,
                "odds": h2h_quote["odds"],
                "probability": round(model_prob, 2), # Round to 2 decimal places as in example
                "modelProbability": round(model_prob, 2),
                "marketFairProbability": h2h_quote["marketFairProbability"],
                "edge": round(edge, 5), # Round to 5 decimal places
                "confidence": round(confidence, 2),
                "confidenceBand": confidence_band,
                "blockers": [],
                "promotable": True if edge > 0 else False,
                "evidenceIds": h2h_claim["evidenceIds"],
                "claimIds": [h2h_claim["id"]],
                "rationale": "Alianza Lima W is heavily favored according to bookmaker odds (1.14) and recent web search results indicating Yanapuma W's significant defensive vulnerabilities, including a 10-0 loss to a top team.",
                "warnings": []
            })

# Process Double Chance market
if "double_chance" in required_markets:
    dc_claim = get_claim_by_id("fa56e894-4591-4fcf-9064-05db8f59f1f4:claim-dc-draw-away", claims_data)
    if dc_claim:
        dc_quote = find_quote("double_chance", "draw_or_away")
        if dc_quote:
            model_prob, confidence, confidence_band = calculate_model_probability_and_confidence(dc_claim, evidence_items_data)
            edge = model_prob - dc_quote["marketFairProbability"]
            
            predictions.append({
                "oddsQuoteId": dc_quote["oddsQuoteId"],
                "market": "double_chance",
                "selection": "draw_or_away",
                "line": None,
                "odds": dc_quote["odds"],
                "probability": round(model_prob, 2),
                "modelProbability": round(model_prob, 2),
                "marketFairProbability": dc_quote["marketFairProbability"],
                "edge": round(edge, 5),
                "confidence": round(confidence, 2),
                "confidenceBand": confidence_band,
                "blockers": [],
                "promotable": True if edge > 0 else False,
                "evidenceIds": dc_claim["evidenceIds"],
                "claimIds": [dc_claim["id"]],
                "rationale": "The 'Draw or Away' double chance market is considered almost a certainty by bookmakers (odds 1.01), with strong evidence supporting Alianza Lima W securing at least a draw.",
                "warnings": []
            })

# Process Goals Over/Under market (specifically Over 3.5 based on claim and evidence)
if "goals_over_under" in required_markets:
    goals_over_claim = get_claim_by_id("fa56e894-4591-4fcf-9064-05db8f59f1f4:claim-goals-over", claims_data)
    if goals_over_claim:
        # Find the quote for Over 3.5 goals
        goals_over_quote = find_quote("goals_over_under", "over", 3.5)
        if goals_over_quote:
            model_prob, confidence, confidence_band = calculate_model_probability_and_confidence(goals_over_claim, evidence_items_data)
            edge = model_prob - goals_over_quote["marketFairProbability"]
            
            predictions.append({
                "oddsQuoteId": goals_over_quote["oddsQuoteId"],
                "market": "goals_over_under",
                "selection": "over",
                "line": 3.5,
                "odds": goals_over_quote["odds"],
                "probability": round(model_prob, 2),
                "modelProbability": round(model_prob, 2),
                "marketFairProbability": goals_over_quote["marketFairProbability"],
                "edge": round(edge, 5),
                "confidence": round(confidence, 2),
                "confidenceBand": confidence_band,
                "blockers": [],
                "promotable": True if edge > 0 else False,
                "evidenceIds": goals_over_claim["evidenceIds"],
                "claimIds": [goals_over_claim["id"]],
                "rationale": "Pinnacle's odds for Over 3.5 goals (1.43) imply a high probability, reinforced by Yanapuma W's recent heavy loss (10-0), suggesting a high-scoring match is likely.",
                "warnings": []
            })

# Process Corners Over/Under market (missing quotes)
if "corners_over_under" in required_markets:
    corners_warnings = ["Market skipped/review-required: missing odds quotes for requested market"]
    # Add to overall warnings if not already present
    if corners_warnings[0] not in output_warnings:
        output_warnings.extend(corners_warnings)
    
    # Emit a prediction with warnings, even without quotes
    predictions.append({
        "oddsQuoteId": None,
        "market": "corners_over_under",
        "selection": None,
        "line": None,
        "odds": None,
        "probability": None,
        "modelProbability": None,
        "marketFairProbability": None,
        "edge": None,
        "confidence": None,
        "confidenceBand": None,
        "blockers": [],
        "promotable": False,
        "evidenceIds": [],
        "claimIds": [],
        "rationale": "No odds available for corners over/under, therefore no analytical pick can be made.",
        "warnings": corners_warnings
    })

# Process BTTS market (missing quotes)
if "btts" in required_markets:
    btts_claim = get_claim_by_id("fa56e894-4591-4fcf-9064-05db8f59f1f4:claim-btts", claims_data)
    btts_warnings = ["Market skipped/review-required: missing odds quotes for requested market"]
    if btts_warnings[0] not in output_warnings:
        output_warnings.extend(btts_warnings)

    btts_evidence_ids = []
    btts_claim_ids = []
    btts_rationale = "No odds available for Both Teams to Score (BTTS). Web search provides conflicting evidence for BTTS, with Yanapuma's recent shutout vs. other scoring matches and Alianza Lima's mixed record. No clear trend."
    model_prob = None
    confidence = None
    confidence_band = None

    if btts_claim:
        model_prob, confidence, confidence_band = calculate_model_probability_and_confidence(btts_claim, evidence_items_data)
        btts_evidence_ids = btts_claim["evidenceIds"]
        btts_claim_ids = [btts_claim["id"]]
        btts_warnings.append("Conflicting web search evidence for BTTS, no clear trend.")
        
    predictions.append({
        "oddsQuoteId": None,
        "market": "btts",
        "selection": None,
        "line": None,
        "odds": None,
        "probability": round(model_prob, 2) if model_prob is not None else None,
        "modelProbability": round(model_prob, 2) if model_prob is not None else None,
        "marketFairProbability": None,
        "edge": None,
        "confidence": round(confidence, 2) if confidence is not None else None,
        "confidenceBand": confidence_band,
        "blockers": [],
        "promotable": False,
        "evidenceIds": btts_evidence_ids,
        "claimIds": btts_claim_ids,
        "rationale": btts_rationale,
        "warnings": btts_warnings
    })

final_output = {
    "predictions": predictions,
    "warnings": sorted(list(set(output_warnings))), # Remove duplicates and sort
    "metadata": {}
}

print(json.dumps(final_output, indent=2))
