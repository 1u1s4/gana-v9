
# Main script logic
if __name__ == "__main__":
    input_data = json.loads("""
{
  "promptVersion": "score-prediction-v2",
  "runId": "4be2a1bf-ac88-48cc-9c89-63f6c2bb15af",
  "createdAt": "2026-06-09T13:14:43.770Z",
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
    "id": "ae185bcf-d293-489e-87e5-357cfa81e716",
    "providerFixtureId": "1523945",
    "competitionId": "8f612f17-d302-4f89-a87b-c2e721545bd2",
    "season": 2027,
    "homeTeamId": "c604143f-e8a8-46e8-b6c9-6ecb6a7ad8be",
    "awayTeamId": "c7f82ff7-5930-4617-ba6f-5aba1f1eff57",
    "scheduledAt": "2026-06-09T19:00:00.000Z",
    "status": "scheduled",
    "scoreHome": None,
    "scoreAway": None,
    "includedByFilters": [],
    "metadata": {
      "league": {
        "id": 880,
        "name": "World Cup - Women - Qualification Europe",
        "country": "World",
        "season": 2027,
        "round": "Group Stage - 6"
      },
      "teams": {
        "home": {
          "id": 1733,
          "name": "Netherlands W"
        },
        "away": {
          "id": 1749,
          "name": "Poland W"
        }
      },
      "round": "Group Stage - 6",
      "timezone": "UTC",
      "apiFootballStatusShort": "NS",
      "apiFootballStatusLong": "Not Started"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1523945",
    "capturedAt": "2026-06-09T13:14:45.375Z",
    "providerSnapshotId": "e6d65f92-8145-42ea-97ee-337aaedd529b"
  },
  "oddsSnapshot": {
    "id": "16a37d9d-ecc0-40f0-9f3a-a8362b7ed63b",
    "fixtureId": "ae185bcf-d293-489e-87e5-357cfa81e716",
    "providerFixtureId": "1523945",
    "providerSnapshotId": "dd7b6fe8-ded4-490c-bca4-bc371743722c",
    "bookmakerCount": 2,
    "capturedAt": "2026-06-09T12:12:16.277Z",
    "payloadHash": "3a6f2c5a1e6a01419bdf08d337a54bdbe0378314fa98a968eb7f5e8503a2de4d"
  },
  "researchBundle": {
    "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd",
    "runId": "4be2a1bf-ac88-48cc-9c89-63f6c2bb15af",
    "status": "promotable",
    "gateResult": {
      "reasons": [
        "Structured research generated with sufficient evidence from web search and odds data for all required markets.",
        "Web-search evidence included as webMode is live.",
        "objective research gate passed with current web evidence"
      ],
      "verdict": "promotable",
      "warnings": [
        "market btts skipped/review-required: missing odds quotes for requested market"
      ]
    },
    "providerAgentic": "gemini",
    "model": "gemini-2.5-flash",
    "promptVersion": "research-fixture-v2",
    "warnings": [
      "market btts skipped/review-required: missing odds quotes for requested market"
    ],
    "metadata": {
      "runId": "4be2a1bf-ac88-48cc-9c89-63f6c2bb15af",
      "fixture": {
        "id": "ae185bcf-d293-489e-87e5-357cfa81e716",
        "scheduledAt": "2026-06-09T19:00:00.000Z",
        "awayTeamName": "Poland W",
        "homeTeamName": "Netherlands W"
      },
      "webMode": "live",
      "createdAt": "2026-06-09T12:12:10.235Z",
      "marketScope": [
        "h2h",
        "double_chance",
        "goals_over_under",
        "corners_over_under",
        "btts"
      ],
      "promptVersion": "research-fixture-v2",
      "marketCoverage": {
        "warnings": [
          "market btts skipped/review-required: missing odds quotes for requested market"
        ],
        "quotedMarkets": [
          "corners_over_under",
          "double_chance",
          "goals_over_under",
          "h2h"
        ],
        "skippedMarkets": [
          {
            "market": "btts",
            "reason": "missing odds quotes for requested market"
          }
        ],
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
      "requiredMarkets": [
        "h2h",
        "double_chance",
        "goals_over_under",
        "corners_over_under",
        "btts"
      ],
      "referenceRepairs": [
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
      }
    }
  },
  "sources": [
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": None,
      "title": "API-Football odds snapshot",
      "externalId": "1523945",
      "providerSnapshotId": None,
      "capturedAt": "2026-06-09T12:12:16.277Z",
      "metadata": {
        "fixtureId": "ae185bcf-d293-489e-87e5-357cfa81e716",
        "quoteCount": 31,
        "snapshotId": "dd7b6fe8-ded4-490c-bca4-bc371743722c",
        "bookmakerCount": 2,
        "oddsSnapshotId": "16a37d9d-ecc0-40f0-9f3a-a8362b7ed63b",
        "providerFixtureId": "1523945"
      }
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_api_football_odds",
      "type": "provider-snapshot",
      "url": None,
      "title": "API-Football Odds Snapshot",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-06-09T12:12:16.277Z",
      "metadata": {
        "provider": "api-football",
        "fixtureId": "ae185bcf-d293-489e-87e5-357cfa81e716",
        "artifactPath": "n/a"
      }
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": None,
      "title": "API-Football fixture statistics",
      "externalId": "1523945",
      "providerSnapshotId": None,
      "capturedAt": "2026-06-09T12:12:14.814Z",
      "metadata": {
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "54b41b57-df5f-471b-939f-08c584f4b70f",
        "providerFixtureId": "1523945"
      }
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_web_1",
      "type": "web-search",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEkwmNd-yvJTOlTYEKRETEwLmrjOyFyk-0rMbwLmvvjOz3Eb_Jk_nrtZxnUl71tWcVYRGbF07y2jFAay30yjrAthiGBkf_OeTjGv0WNRmUY3mlWtHFz8p-AP0mnJDpYtUqO-xRJlyypDKj-BL3o2SGLGtp27svOS85-FEkMVs_zJcf1uQfON-ALLaCuyicAT-5fcr0jN_TJKlCxCYf8lEX7jKNRv3g_HZ8tFaYekw==",
      "title": "Netherlands Women vs Poland Women, World Cup Qualifiers - 365Scores",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-06-09T12:12:10.235Z",
      "metadata": {}
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_api_football_fixture",
      "type": "api-football",
      "url": None,
      "title": "API-Football Fixture Data",
      "externalId": None,
      "providerSnapshotId": None,
      "capturedAt": "2026-06-09T12:12:10.235Z",
      "metadata": {
        "provider": "api-football",
        "fixtureId": "ae185bcf-d293-489e-87e5-357cfa81e716",
        "artifactPath": "n/a"
      }
    }
  ],
  "evidenceItems": [
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_web_h2h_past_match",
      "sourceId": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_web_1",
      "summary": "The previous encounter between Poland W and Netherlands W on March 3, 2026, ended in a 2-2 draw.",
      "confidence": 0.9,
      "claimIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_h2h_past_draw",
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_goals_past_match",
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_btts_past_match",
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_corners_past_match"
      ],
      "metadata": {}
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_web_corners_past_match",
      "sourceId": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_web_1",
      "summary": "In the previous match, Poland W had 6 corners and Netherlands W had 10 corners, totaling 16 corners.",
      "confidence": 0.9,
      "claimIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_corners_past_match"
      ],
      "metadata": {}
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_odds_h2h_bet365_home",
      "sourceId": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_api_football_odds",
      "summary": "Bet365 offers odds of 1.18 for Netherlands W to win (home team) in the H2H market, indicating a high implied probability of 84.7%.",
      "confidence": 0.8,
      "claimIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_h2h_odds_home"
      ],
      "metadata": {
        "price": 1.18,
        "market": "h2h",
        "bookmaker": "Bet365",
        "selection": "home"
      }
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_odds_h2h_pinnacle_home",
      "sourceId": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_api_football_odds",
      "summary": "Pinnacle offers odds of 1.19 for Netherlands W to win (home team) in the H2H market, indicating a high implied probability of 84.0%.",
      "confidence": 0.8,
      "claimIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_h2h_odds_home"
      ],
      "metadata": {
        "price": 1.19,
        "market": "h2h",
        "bookmaker": "Pinnacle",
        "selection": "home"
      }
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_odds_goals_over_bet365",
      "sourceId": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_api_football_odds",
      "summary": "Bet365 offers odds of 1.57 for Over 2.5 Goals, indicating a 63.7% implied probability.",
      "confidence": 0.75,
      "claimIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_goals_over_2_5"
      ],
      "metadata": {
        "line": 2.5,
        "price": 1.57,
        "market": "goals_over_under",
        "bookmaker": "Bet365",
        "selection": "over"
      }
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_odds_goals_over_pinnacle",
      "sourceId": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_api_football_odds",
      "summary": "Pinnacle offers odds of 1.53 for Over 2.5 Goals, indicating a 65.4% implied probability.",
      "confidence": 0.75,
      "claimIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_goals_over_2_5"
      ],
      "metadata": {
        "line": 2.5,
        "price": 1.53,
        "market": "goals_over_under",
        "bookmaker": "Pinnacle",
        "selection": "over"
      }
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_odds_double_chance_home_draw",
      "sourceId": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_api_football_odds",
      "summary": "Bet365 offers odds of 1.01 for Double Chance: Home or Draw, indicating a 99.0% implied probability.",
      "confidence": 0.85,
      "claimIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_double_chance_home_draw"
      ],
      "metadata": {
        "price": 1.01,
        "market": "double_chance",
        "bookmaker": "Bet365",
        "selection": "home_or_draw"
      }
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_odds_corners_over_bet365_9_5",
      "sourceId": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_api_football_odds",
      "summary": "Bet365 offers odds of 1.73 for Over 9.5 Corners, indicating a 57.8% implied probability.",
      "confidence": 0.7,
      "claimIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_corners_over_9_5"
      ],
      "metadata": {
        "line": 9.5,
        "price": 1.73,
        "market": "corners_over_under",
        "bookmaker": "Bet365",
        "selection": "over"
      }
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_odds_btts_yes_implied_by_past_match",
      "sourceId": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_web_1",
      "summary": "Both teams scored in the previous match, with Poland W scoring 2 goals and Netherlands W scoring 2 goals.",
      "confidence": 0.8,
      "claimIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_btts_implied"
      ],
      "metadata": {}
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_group_standings",
      "sourceId": "d3da5466-df2a-42f0-a045-9f55d96d37cd:source_web_1",
      "summary": "Pre-match standings show Netherlands in 3rd place with 8 points from 5 matches (2 wins, 2 draws, 1 loss) and Poland in 4th place with 1 point from 5 matches (0 wins, 1 draw, 4 losses).",
      "confidence": 0.85,
      "claimIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_netherlands_form",
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_poland_form"
      ],
      "metadata": {}
    }
  ],
  "claims": [
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_h2h_odds_home",
      "statement": "Netherlands W is strongly favored to win this match based on current H2H odds from multiple bookmakers.",
      "marketKey": "h2h",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_odds_h2h_bet365_home",
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_odds_h2h_pinnacle_home"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_h2h_past_draw",
      "statement": "The previous match between Netherlands W and Poland W ended in a 2-2 draw.",
      "marketKey": None,
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_web_h2h_past_match"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_goals_past_match",
      "statement": "The previous match between these teams featured 4 goals in total.",
      "marketKey": "goals_over_under",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_web_h2h_past_match"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_goals_over_2_5",
      "statement": "Odds from multiple bookmakers suggest that Over 2.5 Goals is more likely in this match.",
      "marketKey": "goals_over_under",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_odds_goals_over_bet365",
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_odds_goals_over_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_double_chance_home_draw",
      "statement": "The double chance market indicates a very high probability for Netherlands W to win or draw.",
      "marketKey": "double_chance",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_odds_double_chance_home_draw"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_corners_past_match",
      "statement": "The previous match between these teams had a total of 16 corners (6 for Poland W, 10 for Netherlands W).",
      "marketKey": "corners_over_under",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_web_corners_past_match"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_corners_over_9_5",
      "statement": "Odds suggest that Over 9.5 Corners is more likely in this match.",
      "marketKey": "corners_over_under",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_odds_corners_over_bet365_9_5"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_btts_past_match",
      "statement": "Both teams scored in the previous encounter between Netherlands W and Poland W.",
      "marketKey": "btts",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_web_h2h_past_match"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_btts_implied",
      "statement": "Given the 2-2 draw in their last match, both teams have shown capability to score against each other, implying BTTS (Yes) is a reasonable consideration.",
      "marketKey": "btts",
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_odds_btts_yes_implied_by_past_match"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_netherlands_form",
      "statement": "Netherlands W is in significantly better form than Poland W based on current group standings (3rd vs 4th).",
      "marketKey": None,
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_group_standings"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "d3da5466-df2a-42f0-a045-9f55d96d37cd:claim_poland_form",
      "statement": "Poland W has struggled in the group stage, with only one draw and four losses in five matches.",
      "marketKey": None,
      "selectionKey": None,
      "line": None,
      "supportLevel": "supported",
      "confidence": None,
      "evidenceIds": [
        "d3da5466-df2a-42f0-a045-9f55d96d37cd:evidence_group_standings"
      ],
      "conflictStatus": "none"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "1f8daa31-98fc-4b4f-9e7d-2aae85a2d261",
      "market": "h2h",
      "selection": "away",
      "line": None,
      "odds": 13,
      "impliedProbability": 0.076923,
      "marketImpliedProbability": 0.086538,
      "marketFairProbability": 0.078239,
      "consensusFairOdds": 12.781347,
      "overround": 0.10609,
      "marketEfficiencyScore": 0.6537,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "6f4b8ae6-d7f1-4c6d-bb79-10adae684181",
      "market": "h2h",
      "selection": "draw",
      "line": None,
      "odds": 5.9,
      "impliedProbability": 0.169492,
      "marketImpliedProbability": 0.175655,
      "marketFairProbability": 0.158806,
      "consensusFairOdds": 6.296974,
      "overround": 0.10609,
      "marketEfficiencyScore": 0.6537,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "6fe43f0e-7951-4c1c-a144-06c098d15b78",
      "market": "h2h",
      "selection": "home",
      "line": None,
      "odds": 1.19,
      "impliedProbability": 0.840336,
      "marketImpliedProbability": 0.843897,
      "marketFairProbability": 0.762955,
      "consensusFairOdds": 1.310694,
      "overround": 0.10609,
      "marketEfficiencyScore": 0.6537,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "92e5dd32-e772-4fb3-9b1d-bcd4699bafae",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": None,
      "odds": 3.8,
      "impliedProbability": 0.263158,
      "marketImpliedProbability": 0.263158,
      "marketFairProbability": 0.1217,
      "consensusFairOdds": 8.216922,
      "overround": 1.162348,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "39410466-021b-4eb4-b5c2-921949b4738d",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": None,
      "odds": 1.1,
      "impliedProbability": 0.909091,
      "marketImpliedProbability": 0.909091,
      "marketFairProbability": 0.420418,
      "consensusFairOdds": 2.378583,
      "overround": 1.162348,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "ee29ca84-8fa7-4592-8fda-6d13472575b5",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": None,
      "odds": 1.01,
      "impliedProbability": 0.990099,
      "marketImpliedProbability": 0.990099,
      "marketFairProbability": 0.457881,
      "consensusFairOdds": 2.183971,
      "overround": 1.162348,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "b5253c73-47c1-41e5-868f-00eb5f97921f",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.5,
      "odds": 1.57,
      "impliedProbability": 0.636943,
      "marketImpliedProbability": 0.645269,
      "marketFairProbability": 0.600526,
      "consensusFairOdds": 1.665206,
      "overround": 0.074485,
      "marketEfficiencyScore": 0.7201,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "e289aa89-e3b5-4e01-8296-18464336a50a",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.5,
      "odds": 2.35,
      "impliedProbability": 0.425532,
      "marketImpliedProbability": 0.429216,
      "marketFairProbability": 0.399474,
      "consensusFairOdds": 2.503293,
      "overround": 0.074485,
      "marketEfficiencyScore": 0.7201,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "6498b91e-d62f-4114-86af-8dbdd89f941f",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.5,
      "odds": 2.34,
      "impliedProbability": 0.42735,
      "marketImpliedProbability": 0.42735,
      "marketFairProbability": 0.393782,
      "consensusFairOdds": 2.539474,
      "overround": 0.085245,
      "marketEfficiencyScore": 0.5891,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "9e3e55e3-bcbd-4e4e-9a0e-d326ccedc2e6",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.5,
      "odds": 1.52,
      "impliedProbability": 0.657895,
      "marketImpliedProbability": 0.657895,
      "marketFairProbability": 0.606218,
      "consensusFairOdds": 1.649573,
      "overround": 0.085245,
      "marketEfficiencyScore": 0.5891,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "8d1c477a-b644-418b-8e99-0ae3cd593bc8",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.25,
      "odds": 1.38,
      "impliedProbability": 0.724638,
      "marketImpliedProbability": 0.724638,
      "marketFairProbability": 0.66586,
      "consensusFairOdds": 1.501818,
      "overround": 0.088274,
      "marketEfficiencyScore": 0.5828,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "025c86a2-7464-453b-8d4e-e94cc4de4e27",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.25,
      "odds": 2.75,
      "impliedProbability": 0.363636,
      "marketImpliedProbability": 0.363636,
      "marketFairProbability": 0.33414,
      "consensusFairOdds": 2.992754,
      "overround": 0.088274,
      "marketEfficiencyScore": 0.5828,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "8544b057-6050-473f-ba0f-b90a2ffa3aa4",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.75,
      "odds": 1.67,
      "impliedProbability": 0.598802,
      "marketImpliedProbability": 0.598802,
      "marketFairProbability": 0.555851,
      "consensusFairOdds": 1.799043,
      "overround": 0.077271,
      "marketEfficiencyScore": 0.6057,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "0eff8555-779e-4f48-a112-bd1cb5fb8bf8",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.75,
      "odds": 2.09,
      "impliedProbability": 0.478469,
      "marketImpliedProbability": 0.478469,
      "marketFairProbability": 0.444149,
      "consensusFairOdds": 2.251497,
      "overround": 0.077271,
      "marketEfficiencyScore": 0.6057,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "bfb998b0-b2fc-4f8b-a959-ee9b44e4022c",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.25,
      "odds": 2.12,
      "impliedProbability": 0.471698,
      "marketImpliedProbability": 0.471698,
      "marketFairProbability": 0.437666,
      "consensusFairOdds": 2.284848,
      "overround": 0.077759,
      "marketEfficiencyScore": 0.6047,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "7492747f-b1c9-4031-ac2f-873421409aaa",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.25,
      "odds": 1.65,
      "impliedProbability": 0.606061,
      "marketImpliedProbability": 0.606061,
      "marketFairProbability": 0.562334,
      "consensusFairOdds": 1.778302,
      "overround": 0.077759,
      "marketEfficiencyScore": 0.6047,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "95e9f5bc-11c5-4a0e-9ee1-dad2650aa92d",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.75,
      "odds": 2.74,
      "impliedProbability": 0.364964,
      "marketImpliedProbability": 0.364964,
      "marketFairProbability": 0.334951,
      "consensusFairOdds": 2.985507,
      "overround": 0.089601,
      "marketEfficiencyScore": 0.58,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "f9c93ef1-8bc0-467c-bf3e-f3bb4c08ed38",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.75,
      "odds": 1.38,
      "impliedProbability": 0.724638,
      "marketImpliedProbability": 0.724638,
      "marketFairProbability": 0.665049,
      "consensusFairOdds": 1.50365,
      "overround": 0.089601,
      "marketEfficiencyScore": 0.58,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "ae183d97-e71a-47ad-854b-82f830a86e42",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3,
      "odds": 1.88,
      "impliedProbability": 0.531915,
      "marketImpliedProbability": 0.531915,
      "marketFairProbability": 0.495979,
      "consensusFairOdds": 2.016216,
      "overround": 0.072455,
      "marketEfficiencyScore": 0.6157,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "77939480-6c70-4bc1-807b-955dc48b047d",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2,
      "odds": 1.29,
      "impliedProbability": 0.775194,
      "marketImpliedProbability": 0.775194,
      "marketFairProbability": 0.702765,
      "consensusFairOdds": 1.422951,
      "overround": 0.103063,
      "marketEfficiencyScore": 0.552,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "ff76fb84-ecd3-4c26-acdf-4f0398a29515",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2,
      "odds": 3.05,
      "impliedProbability": 0.327869,
      "marketImpliedProbability": 0.327869,
      "marketFairProbability": 0.297235,
      "consensusFairOdds": 3.364341,
      "overround": 0.103063,
      "marketEfficiencyScore": 0.552,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "c4c01a04-ca2b-44dd-a32d-6bb665f916b9",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3,
      "odds": 1.85,
      "impliedProbability": 0.540541,
      "marketImpliedProbability": 0.540541,
      "marketFairProbability": 0.504021,
      "consensusFairOdds": 1.984043,
      "overround": 0.072455,
      "marketEfficiencyScore": 0.6157,
      "lowLiquidity": True,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "88652545-7816-4e46-ba6f-01c70e998ca1",
      "market": "corners_over_under",
      "selection": "over",
      "line": 9.5,
      "odds": 1.73,
      "impliedProbability": 0.578035,
      "marketImpliedProbability": 0.578035,
      "marketFairProbability": 0.536193,
      "consensusFairOdds": 1.865,
      "overround": 0.078035,
      "marketEfficiencyScore": 0.6041,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "d800c468-17db-4714-b2a8-22403c9be22a",
      "market": "corners_over_under",
      "selection": "under",
      "line": 9.5,
      "odds": 2,
      "impliedProbability": 0.5,
      "marketImpliedProbability": 0.5,
      "marketFairProbability": 0.463807,
      "consensusFairOdds": 2.156069,
      "overround": 0.078035,
      "marketEfficiencyScore": 0.6041,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "fd61e036-c0ab-491a-b5b1-3079483549a6",
      "market": "corners_over_under",
      "selection": "over",
      "line": 10,
      "odds": 1.98,
      "impliedProbability": 0.505051,
      "marketImpliedProbability": 0.505051,
      "marketFairProbability": 0.478947,
      "consensusFairOdds": 2.087912,
      "overround": 0.054501,
      "marketEfficiencyScore": 0.6531,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    },
    {
      "oddsQuoteId": "45ed2c03-3ec8-48d7-a6a4-da781bb823e1",
      "market": "corners_over_under",
      "selection": "under",
      "line": 10,
      "odds": 1.82,
      "impliedProbability": 0.549451,
      "marketImpliedProbability": 0.549451,
      "marketFairProbability": 0.521053,
      "consensusFairOdds": 1.919192,
      "overround": 0.054501,
      "marketEfficiencyScore": 0.6531,
      "lowLiquidity": True,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-09T12:12:16.277Z"
    }
  ],
  "providerContextWarnings": [
    "scoring prompt allowedQuotes trimmed from 31 to 26 representative quotes",
    "stale odds source"
  ]
}
    """)

    all_predictions = []
    global_warnings = input_data["researchBundle"]["warnings"] + input_data["providerContextWarnings"]
    allowed_quotes = input_data["allowedQuotes"]
    evidence_items = input_data["evidenceItems"]
    claims = input_data["claims"]

    # --- H2H Market Predictions ---
    h2h_home_quotes = get_quotes(allowed_quotes, "h2h", "home")
    if h2h_home_quotes:
        h2h_home_quote = h2h_home_quotes[0] # Pick the first available quote
        
        # Determine modelProbability and confidence for H2H Home
        # Based on claims: claim_h2h_odds_home, claim_netherlands_form
        h2h_home_evidence_ids, h2h_home_claim_ids, _, _ = get_evidence_and_claims(
            evidence_items, claims, market_key="h2h", selection_key=None
        )
        h2h_home_evidence_ids_form, h2h_home_claim_ids_form, _, _ = get_evidence_and_claims(
            evidence_items, claims, market_key=None, selection_key=None
        )
        # Combine evidence and claims. Filter out non-unique items
        h2h_home_evidence_ids = list(set(h2h_home_evidence_ids + h2h_home_evidence_ids_form))
        h2h_home_claim_ids = list(set(h2h_home_claim_ids + h2h_home_claim_ids_form))

        # A strong favorite, so model probability should be high, and confidence medium-high
        model_probability_h2h_home = max(h2h_home_quote["marketFairProbability"], 0.78) # A bit higher than fair probability
        confidence_h2h_home = 0.8 # High confidence due to strong form and odds

        rationale_h2h_home = "Netherlands W is strongly favored based on current H2H odds and superior group standings."

        all_predictions.append(generate_prediction(
            h2h_home_quote,
            model_probability_h2h_home,
            confidence_h2h_home,
            h2h_home_evidence_ids,
            h2h_home_claim_ids,
            rationale_h2h_home,
            claims
        ))

    # --- Double Chance Market Predictions ---
    double_chance_home_draw_quotes = get_quotes(allowed_quotes, "double_chance", "home_or_draw")
    if double_chance_home_draw_quotes:
        double_chance_home_draw_quote = double_chance_home_draw_quotes[0] # Pick the first available quote

        # Determine modelProbability and confidence for Double Chance Home or Draw
        # Based on claims: claim_double_chance_home_draw, claim_netherlands_form
        double_chance_home_draw_evidence_ids, double_chance_home_draw_claim_ids, _, _ = get_evidence_and_claims(
            evidence_items, claims, market_key="double_chance", selection_key=None
        )
        double_chance_home_draw_evidence_ids_form, double_chance_home_draw_claim_ids_form, _, _ = get_evidence_and_claims(
            evidence_items, claims, market_key=None, selection_key=None
        )
        # Combine evidence and claims. Filter out non-unique items
        double_chance_home_draw_evidence_ids = list(set(double_chance_home_draw_evidence_ids + double_chance_home_draw_evidence_ids_form))
        double_chance_home_draw_claim_ids = list(set(double_chance_home_draw_claim_ids + double_chance_home_draw_claim_ids_form))


        # Very high probability, close to 1
        model_probability_double_chance_home_draw = max(double_chance_home_draw_quote["marketFairProbability"], 0.95)
        confidence_double_chance_home_draw = 0.9 # High confidence

        rationale_double_chance_home_draw = "Netherlands W is highly likely to win or draw given their strong form and the odds reflecting this."

        all_predictions.append(generate_prediction(
            double_chance_home_draw_quote,
            model_probability_double_chance_home_draw,
            confidence_double_chance_home_draw,
            double_chance_home_draw_evidence_ids,
            double_chance_home_draw_claim_ids,
            rationale_double_chance_home_draw,
            claims
        ))

    h2h_draw_quotes = get_quotes(allowed_quotes, "h2h", "draw")
    if h2h_draw_quotes:
        h2h_draw_quote = h2h_draw_quotes[0] # Pick the first available quote

        # Determine modelProbability and confidence for H2H Draw
        # Based on claims: claim_h2h_past_draw
        h2h_draw_evidence_ids, h2h_draw_claim_ids, _, _ = get_evidence_and_claims(
            evidence_items, claims, market_key=None, selection_key=None
        ) # claim_h2h_past_draw does not have a marketKey/selectionKey

        # Model probability closer to fair, but slightly elevated due to past draw
        model_probability_h2h_draw = max(h2h_draw_quote["marketFairProbability"], 0.18)
        confidence_h2h_draw = 0.65 # Medium confidence

        rationale_h2h_draw = "The previous encounter between these teams ended in a 2-2 draw, suggesting a possibility of another draw."

        all_predictions.append(generate_prediction(
            h2h_draw_quote,
            model_probability_h2h_draw,
            confidence_h2h_draw,
            h2h_draw_evidence_ids,
            h2h_draw_claim_ids,
            rationale_h2h_draw,
            claims
        ))

    # --- Double Chance Market Predictions ---
    double_chance_home_draw_quotes = get_quotes(allowed_quotes, "double_chance", "home_or_draw")
    if double_chance_home_draw_quotes:
        double_chance_home_draw_quote = double_chance_home_draw_quotes[0] # Pick the first available quote

        # Determine modelProbability and confidence for Double Chance Home or Draw
        # Based on claims: claim_double_chance_home_draw, claim_netherlands_form
        double_chance_home_draw_evidence_ids, double_chance_home_draw_claim_ids, _, _ = get_evidence_and_claims(
            evidence_items, claims, market_key="double_chance", selection_key=None
        )
        double_chance_home_draw_evidence_ids_form, double_chance_home_draw_claim_ids_form, _, _ = get_evidence_and_claims(
            evidence_items, claims, market_key=None, selection_key=None
        )
        # Combine evidence and claims. Filter out non-unique items
        double_chance_home_draw_evidence_ids = list(set(double_chance_home_draw_evidence_ids + double_chance_home_draw_evidence_ids_form))
        double_chance_home_draw_claim_ids = list(set(double_chance_home_draw_claim_ids + double_chance_home_draw_claim_ids_form))


        # Very high probability, close to 1
        model_probability_double_chance_home_draw = max(double_chance_home_draw_quote["marketFairProbability"], 0.95)
        confidence_double_chance_home_draw = 0.9 # High confidence

        rationale_double_chance_home_draw = "Netherlands W is highly likely to win or draw given their strong form and the odds reflecting this."

        all_predictions.append(generate_prediction(
            double_chance_home_draw_quote,
            model_probability_double_chance_home_draw,
            confidence_double_chance_home_draw,
            double_chance_home_draw_evidence_ids,
            double_chance_home_draw_claim_ids,
            rationale_double_chance_home_draw,
            claims
        ))

    h2h_away_quotes = get_quotes(allowed_quotes, "h2h", "away")
    if h2h_away_quotes:
        h2h_away_quote = h2h_away_quotes[0] # Pick the first available quote

        # Determine modelProbability and confidence for H2H Away
        # Based on claims: claim_poland_form (negative influence)
        h2h_away_evidence_ids, h2h_away_claim_ids, _, _ = get_evidence_and_claims(
            evidence_items, claims, market_key=None, selection_key=None
        ) # claim_poland_form does not have a marketKey/selectionKey

        # Model probability slightly lower than fair due to poor form
        model_probability_h2h_away = min(h2h_away_quote["marketFairProbability"], 0.07)
        confidence_h2h_away = 0.4 # Low confidence

        rationale_h2h_away = "Poland W has struggled in the group stage, making an away win unlikely."

        all_predictions.append(generate_prediction(
            h2h_away_quote,
            model_probability_h2h_away,
            confidence_h2h_away,
            h2h_away_evidence_ids,
            h2h_away_claim_ids,
            rationale_h2h_away,
            claims
        ))

    # --- Double Chance Market Predictions ---
    double_chance_home_draw_quotes = get_quotes(allowed_quotes, "double_chance", "home_or_draw")
    if double_chance_home_draw_quotes:
        double_chance_home_draw_quote = double_chance_home_draw_quotes[0] # Pick the first available quote

        # Determine modelProbability and confidence for Double Chance Home or Draw
        # Based on claims: claim_double_chance_home_draw, claim_netherlands_form
        double_chance_home_draw_evidence_ids, double_chance_home_draw_claim_ids, _, _ = get_evidence_and_claims(
            evidence_items, claims, market_key="double_chance", selection_key=None
        )
        double_chance_home_draw_evidence_ids_form, double_chance_home_draw_claim_ids_form, _, _ = get_evidence_and_claims(
            evidence_items, claims, market_key=None, selection_key=None
        )
        # Combine evidence and claims. Filter out non-unique items
        double_chance_home_draw_evidence_ids = list(set(double_chance_home_draw_evidence_ids + double_chance_home_draw_evidence_ids_form))
        double_chance_home_draw_claim_ids = list(set(double_chance_home_draw_claim_ids + double_chance_home_draw_claim_ids_form))


        # Very high probability, close to 1
        model_probability_double_chance_home_draw = max(double_chance_home_draw_quote["marketFairProbability"], 0.95)
        confidence_double_chance_home_draw = 0.9 # High confidence

        rationale_double_chance_home_draw = "Netherlands W is highly likely to win or draw given their strong form and the odds reflecting this."

        all_predictions.append(generate_prediction(
            double_chance_home_draw_quote,
            model_probability_double_chance_home_draw,
            confidence_double_chance_home_draw,
            double_chance_home_draw_evidence_ids,
            double_chance_home_draw_claim_ids,
            rationale_double_chance_home_draw,
            claims
        ))
    
    # Final Output Structure
    final_output = {
        "predictions": all_predictions,
        "warnings": global_warnings,
        "metadata": {}
    }

    print(json.dumps(final_output, indent=2))
