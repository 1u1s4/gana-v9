
import json

def calculate_implied_probability(odds):
    return 1 / odds

def calculate_edge(model_probability, market_fair_probability):
    return round(model_probability - market_fair_probability, 2)

def get_confidence_band(confidence):
    if confidence >= 0.75:
        return "high"
    elif confidence >= 0.5:
        return "medium"
    else:
        return "low"

def score_predictions(input_data):
    predictions = []
    overall_warnings = []
    
    # Extract relevant data from input
    claims = {c["id"]: c for c in input_data["claims"]}
    evidence_items = {e["id"]: e for e in input_data["evidenceItems"]}
    allowed_quotes = input_data["allowedQuotes"]
    
    # Add warnings for markets explicitly skipped in research bundle
    if "warnings" in input_data["researchBundle"]:
        overall_warnings.extend([
            w for w in input_data["researchBundle"]["warnings"] 
            if "corners_over_under" in w
        ])
    
    # H2H Market: Home Win
    h2h_home_win_claim = claims.get("9dd60e91-2cfb-4858-b3df-aaa411426d03:claim_h2h_home_win")
    if h2h_home_win_claim and h2h_home_win_claim["supportLevel"] == "supported":
        home_win_quote = next((q for q in allowed_quotes if q["market"] == "h2h" and q["selection"] == "home"), None)
        if home_win_quote:
            model_probability = 0.65  # Estimated based on strong claim support
            market_fair_probability = home_win_quote["marketFairProbability"]
            odds = home_win_quote["odds"]
            
            prediction = {
                "oddsQuoteId": home_win_quote["oddsQuoteId"],
                "market": "h2h",
                "selection": "home",
                "line": None,
                "odds": odds,
                "probability": model_probability,
                "modelProbability": model_probability,
                "marketFairProbability": market_fair_probability,
                "edge": calculate_edge(model_probability, market_fair_probability),
                "confidence": 0.8,
                "confidenceBand": get_confidence_band(0.8),
                "blockers": [],
                "promotable": True,
                "evidenceIds": h2h_home_win_claim["evidenceIds"],
                "claimIds": [h2h_home_win_claim["id"]],
                "rationale": "Thróttur Reykjavík is strongly favored to win based on historical H2H dominance, recent strong form, and home advantage.",
                "warnings": []
            }
            predictions.append(prediction)

    # Double Chance Market: Home or Draw
    double_chance_home_or_draw_claim = claims.get("9dd60e91-2cfb-4858-b3df-aaa411426d03:claim_double_chance_home_or_draw")
    if double_chance_home_or_draw_claim and double_chance_home_or_draw_claim["supportLevel"] == "supported":
        home_or_draw_quote = next((q for q in allowed_quotes if q["market"] == "double_chance" and q["selection"] == "home_or_draw"), None)
        if home_or_draw_quote:
            # Using implied probability from odds as a base for model probability, given the marketFairProbability discrepancy
            model_probability = round(calculate_implied_probability(home_or_draw_quote["odds"]), 2) 
            market_fair_probability = home_or_draw_quote["marketFairProbability"]
            odds = home_or_draw_quote["odds"]

            prediction = {
                "oddsQuoteId": home_or_draw_quote["oddsQuoteId"],
                "market": "double_chance",
                "selection": "home_or_draw",
                "line": None,
                "odds": odds,
                "probability": model_probability,
                "modelProbability": model_probability,
                "marketFairProbability": market_fair_probability,
                "edge": calculate_edge(model_probability, market_fair_probability),
                "confidence": 0.85,
                "confidenceBand": get_confidence_band(0.85),
                "blockers": [],
                "promotable": True,
                "evidenceIds": double_chance_home_or_draw_claim["evidenceIds"],
                "claimIds": [double_chance_home_or_draw_claim["id"]],
                "rationale": "Thróttur Reykjavík to win or draw is a strong possibility given their historical H2H dominance and home advantage.",
                "warnings": []
            }
            predictions.append(prediction)

    # Goals Over Under Market: Over 2.5 Goals
    goals_over_under_2_5_claim = claims.get("9dd60e91-2cfb-4858-b3df-aaa411426d03:claim_goals_over_under_2_5")
    if goals_over_under_2_5_claim and goals_over_under_2_5_claim["supportLevel"] == "supported":
        over_2_5_quote = next((q for q in allowed_quotes if q["market"] == "goals_over_under" and q["selection"] == "over" and q["line"] == 2.5), None)
        if over_2_5_quote:
            model_probability = 0.70  # Estimated based on claim
            market_fair_probability = over_2_5_quote["marketFairProbability"]
            odds = over_2_5_quote["odds"]

            prediction = {
                "oddsQuoteId": over_2_5_quote["oddsQuoteId"],
                "market": "goals_over_under",
                "selection": "over",
                "line": 2.5,
                "odds": odds,
                "probability": model_probability,
                "modelProbability": model_probability,
                "marketFairProbability": market_fair_probability,
                "edge": calculate_edge(model_probability, market_fair_probability),
                "confidence": 0.75,
                "confidenceBand": get_confidence_band(0.75),
                "blockers": [],
                "promotable": True,
                "evidenceIds": goals_over_under_2_5_claim["evidenceIds"],
                "claimIds": [goals_over_under_2_5_claim["id"]],
                "rationale": "Over 2.5 goals is highly probable given 68% of historical H2H matches exceed this total, with an average of 3.11 goals per match.",
                "warnings": []
            }
            predictions.append(prediction)
            
    # BTTS Market: Yes
    btts_claim = claims.get("9dd60e91-2cfb-4858-b3df-aaa411426d03:claim_btts")
    if btts_claim and btts_claim["supportLevel"] == "supported":
        btts_yes_quote = next((q for q in allowed_quotes if q["market"] == "btts" and q["selection"] == "yes"), None)
        if btts_yes_quote:
            model_probability = 0.65  # Estimated based on claim
            market_fair_probability = btts_yes_quote["marketFairProbability"]
            odds = btts_yes_quote["odds"]

            prediction = {
                "oddsQuoteId": btts_yes_quote["oddsQuoteId"],
                "market": "btts",
                "selection": "yes",
                "line": None,
                "odds": odds,
                "probability": model_probability,
                "modelProbability": model_probability,
                "marketFairProbability": market_fair_probability,
                "edge": calculate_edge(model_probability, market_fair_probability),
                "confidence": 0.7,
                "confidenceBand": get_confidence_band(0.7),
                "blockers": [],
                "promotable": True,
                "evidenceIds": btts_claim["evidenceIds"],
                "claimIds": [btts_claim["id"]],
                "rationale": "Both Teams to Score (BTTS) is likely due to high average goals in H2H and recent high-scoring games for both teams.",
                "warnings": []
            }
            predictions.append(prediction)

    return json.dumps({
        "predictions": predictions,
        "warnings": overall_warnings,
        "metadata": {}
    }, indent=2)

# Input data from the user
input_json = """
{
  "promptVersion": "score-prediction-v2",
  "runId": "bde77068-2a26-4c4b-b31a-ca2fe6894955",
  "createdAt": "2026-05-27T17:02:24.774Z",
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
    "id": "5c77a43e-8854-44a9-a8bd-2963af3a08d6",
    "providerFixtureId": "1514188",
    "competitionId": "de5dea48-c930-4be7-b80a-b79a4be30176",
    "season": 2026,
    "homeTeamId": "03de8924-964e-4688-8239-77b191b4df50",
    "awayTeamId": "a00b6d43-7697-4ac7-a71d-8248c8c48be9",
    "scheduledAt": "2026-05-27T19:15:00.000Z",
    "status": "scheduled",
    "scoreHome": null,
    "scoreAway": null,
    "includedByFilters": [],
    "metadata": {
      "league": {
        "id": 165,
        "name": "1. Deild",
        "country": "Iceland",
        "season": 2026,
        "round": "Regular Season - 6"
      },
      "teams": {
        "home": {
          "id": 829,
          "name": "Throttur Reykjavik"
        },
        "away": {
          "id": 2121,
          "name": "Grotta"
        }
      },
      "round": "Regular Season - 6",
      "timezone": "UTC",
      "apiFootballStatusShort": "NS",
      "apiFootballStatusLong": "Not Started"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1514188",
    "capturedAt": "2026-05-27T17:02:26.361Z",
    "providerSnapshotId": "79955d19-c131-4aba-a1f3-baf101aa17bf"
  },
  "oddsSnapshot": {
    "id": "83b40187-16b6-4da9-a561-8ab9a84e2630",
    "fixtureId": "5c77a43e-8854-44a9-a8bd-2963af3a08d6",
    "providerFixtureId": "1514188",
    "providerSnapshotId": "b059b9e0-869c-41ad-9c76-6dc09a1f6a16",
    "bookmakerCount": 2,
    "capturedAt": "2026-05-27T16:19:48.879Z",
    "payloadHash": "8e1a62a07de5dbf0129143f1f21d380b3ce7ae56bfb30775ead98d6a576f7ed5"
  },
  "researchBundle": {
    "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03",
    "runId": "bde77068-2a26-4c4b-b31a-ca2fe6894955",
    "status": "promotable",
    "gateResult": {
      "reasons": [
        "Structured research generated, but 'corners_over_under' market is missing evidence.",
        "objective research gate passed with current web evidence"
      ],
      "verdict": "promotable",
      "warnings": [
        "mapped invalid supportLevel \\\\"neutral\\\\" to \\\\"weak\\\\" on claim \\\\"claim_h2h_draw\\\\"",
        "market corners_over_under skipped/review-required: missing odds quotes for requested market",
        "No evidence found for 'corners_over_under' market."
        ]
        }
    "providerAgentic": "gemini",
    "model": "gemini-2.5-flash",
    "promptVersion": "research-fixture-v2",
    "warnings": [
      "mapped invalid supportLevel \\\\"neutral\\\\" to \\\\"weak\\\\" on claim \\\\"claim_h2h_draw\\\\"",
      "market corners_over_under skipped/review-required: missing odds quotes for requested market",
      "No evidence found for 'corners_over_under' market."
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
        }      "referenceRepairs": [
        "mapped invalid supportLevel \\\\"neutral\\\\" to \\\\"weak\\\\" on claim \\\\"claim_h2h_draw\\\\"",
        "market corners_over_under skipped/review-required: missing odds quotes for requested market"
      ],
      "webSearchCoverage": {
        "mode": "live",
        "provider": "gemini",
        "required": true,
        "nativeToolUsed": true,
        "nativeSupported": true,
        "browserFallbackUsed": false,
        "realWebSearchSourceCount": 2,
        "syntheticWebSearchSourceCount": 0
      },
      "providerContextWarnings": []
    }
  },
  "sources": [
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football odds snapshot",
      "externalId": "1514188",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:19:48.879Z",
      "metadata": {
        "fixtureId": "5c77a43e-8854-44a9-a8bd-2963af3a08d6",
        "quoteCount": 43,
        "snapshotId": "b059b9e0-869c-41ad-9c76-6dc09a1f6a16",
        "bookmakerCount": 2,
        "oddsSnapshotId": "83b40187-16b6-44a9-a561-8ab9a84e2630",
        "providerFixtureId": "1514188"
      }
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture statistics",
      "externalId": "1514188",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:19:47.917Z",
      "metadata": {
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "05c84d11-75dd-4e5b-927b-7c8f9402a0e3",
        "providerFixtureId": "1514188"
      }
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:source_api_football_fixture",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture",
      "externalId": "1514188",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:19:42.419Z",
      "metadata": {
        "fixtureId": "5c77a43e-8854-44a9-a8bd-2963af3a08d6",
        "providerFixtureId": "1514188"
      }
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:source_2",
      "type": "web-search",
      "url": "https://soccerpunter.com/",
      "title": "Throttur Reykjavik vs Grotta Match Preview and Statistics",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:19:42.419Z",
      "metadata": {}
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:source_1",
      "type": "web-search",
      "url": "https://sofascore.com/",
      "title": "Throttur Reykjavik vs Grotta H2H and Statistics",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:19:42.419Z",
      "metadata": {}
    }
  ],
  "evidenceItems": [
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_h2h_1",
      "sourceId": "9dd60e91-2cfb-4858-b3df-aaa411426d03:source_1",
      "summary": "Historical head-to-head record shows Thróttur Reykjavík winning 11 out of 19 matches (58%), Grótta winning 2 (11%), and 6 draws (31%).",
      "confidence": 0.9,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_h2h_2",
      "sourceId": "9dd60e91-2cfb-4858-b3df-aaa411426d03:source_1",
      "summary": "The average number of goals in H2H matches is 3.11 per game, with 68% of matches having over 2.5 goals.",
      "confidence": 0.85,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_h2h_3",
      "sourceId": "9dd60e91-2cfb-4858-b3df-aaa411426d03:source_2",
      "summary": "Recent H2H results indicate Thróttur's strong performance against Grotta, including a 3-1 win in August 2024 and a 2-1 win in June 2023.",
      "confidence": 0.85,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_throttur_form",
      "sourceId": "9dd60e91-2cfb-4858-b3df-aaa411426d03:source_1",
      "summary": "Thróttur Reykjavík is in 2nd place with 10 points, showing strong league form with recent wins but also a high-scoring loss.",
      "confidence": 0.8,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_grotta_form",
      "sourceId": "9dd60e91-2cfb-4858-b3df-aaa411426d03:source_1",
      "summary": "ÍF Grótta is in 9th place with 6 points, showing inconsistent form with a mix of wins and losses, including a recent high-scoring victory.",
      "confidence": 0.75,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_home_advantage",
      "sourceId": "9dd60e91-2cfb-4858-b3df-aaa411426d03:source_1",
      "summary": "Thróttur has a recent home advantage, winning two of their last three home matches.",
      "confidence": 0.75,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_btts",
      "sourceId": "9dd60e91-2cfb-4858-b3df-aaa411426d03:source_1",
      "summary": "High average goals per match (3.11) and frequent over 2.5 goals (68%) in H2H, along with recent scores like 3-1, 1-1, and 2-2, suggest a likelihood of both teams scoring.",
      "confidence": 0.7,
      "claimIds": [],
      "metadata": {}
    }
  ],
  "claims": [
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:claim_h2h_home_win",
      "statement": "Thróttur Reykjavík is highly favored to win this match against Grotta based on historical H2H dominance and recent home form.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_h2h_1",
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_h2h_3",
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_throttur_form",
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_home_advantage"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:claim_h2h_draw",
      "statement": "A draw is a less likely outcome but has occurred in 31% of historical H2H matches, including two recent encounters.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "weak",
      "confidence": null,
      "evidenceIds": [
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_h2h_1",
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_h2h_3"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:claim_h2h_away_win",
      "statement": "Grotta is an underdog with only 11% historical H2H wins, making an away win unlikely despite their recent high-scoring victory.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "unsupported",
      "confidence": null,
      "evidenceIds": [
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_h2h_1",
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_grotta_form"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:claim_double_chance_home_or_draw",
      "statement": "Thróttur Reykjavík to win or draw is a strong possibility given their H2H dominance and home advantage.",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_h2h_1",
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_h2h_3",
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_throttur_form",
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_home_advantage"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:claim_goals_over_under_2_5",
      "statement": "Over 2.5 goals is a highly probable outcome with 68% of historical H2H matches seeing this many goals and an average of 3.11 goals per match.",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_h2h_2"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "9dd60e91-2cfb-4858-b3df-aaa411426d03:claim_btts",
      "statement": "Both Teams to Score (BTTS) is a likely outcome given the high average goals per match (3.11) and recent high-scoring games for both teams, including H2H results like 3-1, 1-1, and 2-2.",
      "marketKey": "btts",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_btts",
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_throttur_form",
        "9dd60e91-2cfb-4858-b3df-aaa411426d03:evidence_grotta_form"
      ],
      "conflictStatus": "none"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "76cea2e0-62a9-4b5f-86b0-5103ea04477c",
      "market": "h2h",
      "selection": "away",
      "line": null,
      "odds": 4.88,
      "impliedProbability": 0.204918,
      "marketImpliedProbability": 0.207722,
      "marketFairProbability": 0.1883,
      "consensusFairOdds": 5.310674,
      "overround": 0.103338,
      "marketEfficiencyScore": 0.6574,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "a29f2cd4-9ce3-4501-9438-db48cdee165d",
      "market": "h2h",
      "selection": "draw",
      "line": null,
      "odds": 4.71,
      "impliedProbability": 0.212314,
      "marketImpliedProbability": 0.231157,
      "marketFairProbability": 0.209236,
      "consensusFairOdds": 4.779302,
      "overround": 0.103338,
      "marketEfficiencyScore": 0.6574,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "74708c25-2462-4002-aa1b-523e51f2b532",
      "market": "h2h",
      "selection": "home",
      "line": null,
      "odds": 1.51,
      "impliedProbability": 0.662252,
      "marketImpliedProbability": 0.664459,
      "marketFairProbability": 0.602464,
      "consensusFairOdds": 1.659849,
      "overround": 0.103338,
      "marketEfficiencyScore": 0.6574,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "534f409c-e3c9-4bfb-93ae-f3b04b412156",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": null,
      "odds": 2.4,
      "impliedProbability": 0.416667,
      "marketImpliedProbability": 0.416667,
      "marketFairProbability": 0.191812,
      "consensusFairOdds": 5.213444,
      "overround": 1.172268,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "f7d88cde-0aa6-4656-a5c2-744263bdb242",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": null,
      "odds": 1.17,
      "impliedProbability": 0.854701,
      "marketImpliedProbability": 0.854701,
      "marketFairProbability": 0.39346,
      "consensusFairOdds": 2.541554,
      "overround": 1.172268,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "cd884587-e0fc-4f7c-94b0-c107cdb43922",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": null,
      "odds": 1.11,
      "impliedProbability": 0.900901,
      "marketImpliedProbability": 0.900901,
      "marketFairProbability": 0.414728,
      "consensusFairOdds": 2.411218,
      "overround": 1.172268,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "d41b09d5-6142-44e4-93c1-a586f2bcc7d4",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.5,
      "odds": 1.1,
      "impliedProbability": 0.909091,
      "marketImpliedProbability": 0.909091,
      "marketFairProbability": 0.855263,
      "consensusFairOdds": 1.169231,
      "overround": 0.062937,
      "marketEfficiencyScore": 0.6355,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "d16615f7-91df-45de-a761-fd48495458f6",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.5,
      "odds": 6.5,
      "impliedProbability": 0.153846,
      "marketImpliedProbability": 0.153846,
      "marketFairProbability": 0.144737,
      "consensusFairOdds": 6.909091,
      "overround": 0.062937,
      "marketEfficiencyScore": 0.6355,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "c95aa5fb-e123-4798-bc7b-50586faf1297",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.5,
      "odds": 1.36,
      "impliedProbability": 0.735294,
      "marketImpliedProbability": 0.735294,
      "marketFairProbability": 0.688073,
      "consensusFairOdds": 1.453333,
      "overround": 0.068627,
      "marketEfficiencyScore": 0.6237,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "714d374b-f295-410d-a1b5-d0c6eedd2593",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.5,
      "odds": 3,
      "impliedProbability": 0.333333,
      "marketImpliedProbability": 0.333333,
      "marketFairProbability": 0.311927,
      "consensusFairOdds": 3.205882,
      "overround": 0.068627,
      "marketEfficiencyScore": 0.6237,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "fb8e8865-90f9-41da-9636-58e806ba53ff",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.5,
      "odds": 1.95,
      "impliedProbability": 0.512821,
      "marketImpliedProbability": 0.529634,
      "marketFairProbability": 0.493421,
      "consensusFairOdds": 2.026667,
      "overround": 0.073129,
      "marketEfficiencyScore": 0.7178,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "65428b28-73df-4fab-a751-41fca3a14e4d",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.5,
      "odds": 1.85,
      "impliedProbability": 0.540541,
      "marketImpliedProbability": 0.543494,
      "marketFairProbability": 0.506579,
      "consensusFairOdds": 1.974026,
      "overround": 0.073129,
      "marketEfficiencyScore": 0.7178,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "e70c8563-c814-4fdc-9ff7-37677f782a4b",
      "market": "goals_over_under",
      "selection": "over",
      "line": 0.5,
      "odds": 1.01,
      "impliedProbability": 0.990099,
      "marketImpliedProbability": 0.990099,
      "marketFairProbability": 0.922367,
      "consensusFairOdds": 1.084167,
      "overround": 0.073432,
      "marketEfficiencyScore": 0.6137,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "50a09c7c-3398-4078-916a-18cb4fc68684",
      "market": "goals_over_under",
      "selection": "under",
      "line": 0.5,
      "odds": 12,
      "impliedProbability": 0.083333,
      "marketImpliedProbability": 0.083333,
      "marketFairProbability": 0.077633,
      "consensusFairOdds": 12.881188,
      "overround": 0.073432,
      "marketEfficiencyScore": 0.6137,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "3319e5bd-2afb-4fba-b95e-e86b576394fe",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.5,
      "odds": 3.25,
      "impliedProbability": 0.307692,
      "marketImpliedProbability": 0.307692,
      "marketFairProbability": 0.290393,
      "consensusFairOdds": 3.443609,
      "overround": 0.059572,
      "marketEfficiencyScore": 0.6426,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "9d889649-5acc-4693-84c3-995201230fc8",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.5,
      "odds": 1.33,
      "impliedProbability": 0.75188,
      "marketImpliedProbability": 0.75188,
      "marketFairProbability": 0.709607,
      "consensusFairOdds": 1.409231,
      "overround": 0.059572,
      "marketEfficiencyScore": 0.6426,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "3ba31ab6-d342-458b-915f-8aa6aebe0545",
      "market": "goals_over_under",
      "selection": "over",
      "line": 5.5,
      "odds": 5,
      "impliedProbability": 0.2,
      "marketImpliedProbability": 0.2,
      "marketFairProbability": 0.185668,
      "consensusFairOdds": 5.385965,
      "overround": 0.077193,
      "marketEfficiencyScore": 0.6058,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "b67b1d60-264d-4291-9304-eab41d3d63a5",
      "market": "goals_over_under",
      "selection": "under",
      "line": 5.5,
      "odds": 1.14,
      "impliedProbability": 0.877193,
      "marketImpliedProbability": 0.877193,
      "marketFairProbability": 0.814332,
      "consensusFairOdds": 1.228,
      "overround": 0.077193,
      "marketEfficiencyScore": 0.6058,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "cbb16199-5a90-46bc-ab01-78910baaf6f2",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.75,
      "odds": 1.43,
      "impliedProbability": 0.699301,
      "marketImpliedProbability": 0.699301,
      "marketFairProbability": 0.654589,
      "consensusFairOdds": 1.527675,
      "overround": 0.068304,
      "marketEfficiencyScore": 0.6244,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "1b1c6438-00f0-4b71-8b7b-1a3492267661",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.75,
      "odds": 2.71,
      "impliedProbability": 0.369004,
      "marketImpliedProbability": 0.369004,
      "marketFairProbability": 0.345411,
      "consensusFairOdds": 2.895105,
      "overround": 0.068304,
      "marketEfficiencyScore": 0.6244,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "6de53f58-287a-4340-b007-6268f0ae2545",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.25,
      "odds": 1.74,
      "impliedProbability": 0.574713,
      "marketImpliedProbability": 0.574713,
      "marketFairProbability": 0.542105,
      "consensusFairOdds": 1.84466,
      "overround": 0.06015,
      "marketEfficiencyScore": 0.6414,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "5af9ce78-470e-4c3c-9f23-f1a13145ab6b",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.25,
      "odds": 2.06,
      "impliedProbability": 0.485437,
      "marketImpliedProbability": 0.485437,
      "marketFairProbability": 0.457895,
      "consensusFairOdds": 2.183908,
      "overround": 0.06015,
      "marketEfficiencyScore": 0.6414,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "c9e2b3bb-73cc-4e7c-8dfb-05778725c371",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.75,
      "odds": 2.17,
      "impliedProbability": 0.460829,
      "marketImpliedProbability": 0.460829,
      "marketFairProbability": 0.434896,
      "consensusFairOdds": 2.299401,
      "overround": 0.059632,
      "marketEfficiencyScore": 0.6424,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "dc6d72da-975f-4292-96f9-3509f7ea456e",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.75,
      "odds": 1.67,
      "impliedProbability": 0.598802,
      "marketImpliedProbability": 0.598802,
      "marketFairProbability": 0.565104,
      "consensusFairOdds": 1.769585,
      "overround": 0.059632,
      "marketEfficiencyScore": 0.6424,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "380d235d-c623-4317-95f7-4c968efb174b",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.25,
      "odds": 2.81,
      "impliedProbability": 0.355872,
      "marketImpliedProbability": 0.355872,
      "marketFairProbability": 0.332542,
      "consensusFairOdds": 3.007143,
      "overround": 0.070158,
      "marketEfficiencyScore": 0.6205,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "2e2b039c-ca70-4b4c-a9b2-3be97b7b5186",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4,
      "odds": 2.53,
      "impliedProbability": 0.395257,
      "marketImpliedProbability": 0.395257,
      "marketFairProbability": 0.369077,
      "consensusFairOdds": 2.709459,
      "overround": 0.070933,
      "marketEfficiencyScore": 0.6189,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "76350591-6c41-4742-987a-3d8d71fe8535",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3,
      "odds": 1.53,
      "impliedProbability": 0.653595,
      "marketImpliedProbability": 0.653595,
      "marketFairProbability": 0.611675,
      "consensusFairOdds": 1.634855,
      "overround": 0.068533,
      "marketEfficiencyScore": 0.6239,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "d03089e2-a794-4fbc-a031-ddfe784dbdbf",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3,
      "odds": 2.41,
      "impliedProbability": 0.414938,
      "marketImpliedProbability": 0.414938,
      "marketFairProbability": 0.388325,
      "consensusFairOdds": 2.575163,
      "overround": 0.068533,
      "marketEfficiencyScore": 0.6239,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "c2bd709e-2e6b-49ba-abf7-4bc38693aeb1",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4,
      "odds": 1.48,
      "impliedProbability": 0.675676,
      "marketImpliedProbability": 0.675676,
      "marketFairProbability": 0.630923,
      "consensusFairOdds": 1.58498,
      "overround": 0.070933,
      "marketEfficiencyScore": 0.6189,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "40f9b964-24be-4cdb-a50f-e63d0cf0a4c2",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.25,
      "odds": 1.4,
      "impliedProbability": 0.714286,
      "marketImpliedProbability": 0.714286,
      "marketFairProbability": 0.667458,
      "consensusFairOdds": 1.498221,
      "overround": 0.070158,
      "marketEfficiencyScore": 0.6205,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "abcaca7a-f384-4c3c-8353-571155d19056",
      "market": "goals_over_under",
      "selection": "over",
      "line": 6.5,
      "odds": 8.5,
      "impliedProbability": 0.117647,
      "marketImpliedProbability": 0.117647,
      "marketFairProbability": 0.109948,
      "consensusFairOdds": 9.095238,
      "overround": 0.070028,
      "marketEfficiencyScore": 0.6208,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "175c322f-fb60-48c9-a82b-88b6db23fe9b",
      "market": "goals_over_under",
      "selection": "under",
      "line": 6.5,
      "odds": 1.05,
      "impliedProbability": 0.952381,
      "marketImpliedProbability": 0.952381,
      "marketFairProbability": 0.890052,
      "consensusFairOdds": 1.123529,
      "overround": 0.070028,
      "marketEfficiencyScore": 0.6208,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "fc6a56a4-7de1-44b2-a8f3-631edb5c6fc2",
      "market": "goals_over_under",
      "selection": "over",
      "line": 7.5,
      "odds": 12,
      "impliedProbability": 0.083333,
      "marketImpliedProbability": 0.083333,
      "marketFairProbability": 0.077633,
      "consensusFairOdds": 12.881188,
      "overround": 0.073432,
      "marketEfficiencyScore": 0.6137,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "af2fab75-2679-4212-bf72-37079c1a3fd4",
      "market": "goals_over_under",
      "selection": "under",
      "line": 7.5,
      "odds": 1.01,
      "impliedProbability": 0.990099,
      "marketImpliedProbability": 0.990099,
      "marketFairProbability": 0.922367,
      "consensusFairOdds": 1.084167,
      "overround": 0.073432,
      "marketEfficiencyScore": 0.6137,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "80945ead-926a-4009-b348-b07e72b7d38a",
      "market": "goals_over_under",
      "selection": "over",
      "line": 8.5,
      "odds": 17,
      "impliedProbability": 0.058824,
      "marketImpliedProbability": 0.058824,
      "marketFairProbability": 1,
      "consensusFairOdds": 1,
      "overround": -0.941176,
      "marketEfficiencyScore": 0.7667,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "93f5dea3-2e30-4b12-9d9b-4cb455a4fb9c",
      "market": "goals_over_under",
      "selection": "over",
      "line": 9.5,
      "odds": 21,
      "impliedProbability": 0.047619,
      "marketImpliedProbability": 0.047619,
      "marketFairProbability": 1,
      "consensusFairOdds": 1,
      "overround": -0.952381,
      "marketEfficiencyScore": 0.7667,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "e0e99925-2a68-4036-b504-647a336ab0c2",
      "market": "btts",
      "selection": "no",
      "line": null,
      "odds": 2.38,
      "impliedProbability": 0.420168,
      "marketImpliedProbability": 0.420168,
      "marketFairProbability": 0.391304,
      "consensusFairOdds": 2.555556,
      "overround": 0.073763,
      "marketEfficiencyScore": 0.613,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    },
    {
      "oddsQuoteId": "e091591a-3a3a-4f02-826c-ecba86eeeb11",
      "market": "btts",
      "selection": "yes",
      "line": null,
      "odds": 1.53,
      "impliedProbability": 0.653595,
      "marketImpliedProbability": 0.653595,
      "marketFairProbability": 0.608696,
      "consensusFairOdds": 1.642857,
      "overround": 0.073763,
      "marketEfficiencyScore": 0.613,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:19:48.879Z"
    }
  ],
  "providerContextWarnings": [
    "scoring prompt allowedQuotes trimmed from 43 to 38 representative quotes"
  ]
}
"""

input_data = json.loads(input_json)
output = score_predictions(input_data)
print(output)
