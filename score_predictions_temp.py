import json
import math

input_data = json.loads("""
{
  "promptVersion": "score-prediction-v2",
  "runId": "85a75bb5-dd27-4238-85cb-c20a33bd726d",
  "createdAt": "2026-05-27T17:29:08.612Z",
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
    "id": "4e0195f9-e74b-4def-b84d-79b70e4cdbf9",
    "providerFixtureId": "1521133",
    "competitionId": "c407c9bd-8d7e-46aa-aad6-6786299f3dc7",
    "season": 2025,
    "homeTeamId": "ffcba240-48ad-449c-a464-eb67a28c216c",
    "awayTeamId": "0eca7995-c6c3-4591-8a55-3b6f820e0c95",
    "scheduledAt": "2026-05-27T13:30:00.000Z",
    "status": "completed",
    "scoreHome": 1,
    "scoreAway": 2,
    "includedByFilters": [],
    "metadata": {
      "league": {
        "id": 291,
        "name": "Azadegan League",
        "country": "Iran",
        "season": 2025,
        "round": "Regular Season - 26"
      },
      "teams": {
        "home": {
          "id": 2718,
          "name": "Mes Kerman"
        },
        "away": {
          "id": 2719,
          "name": "Nassaji Mazandaran"
        }
      },
      "round": "Regular Season - 26",
      "timezone": "UTC",
      "apiFootballStatusShort": "FT",
      "apiFootballStatusLong": "Match Finished"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1521133",
    "capturedAt": "2026-05-27T17:29:10.544Z",
    "providerSnapshotId": "2e4bb9d3-01bc-4d44-bb43-36755dc76df5"
  },
  "oddsSnapshot": {
    "id": "d8e3596c-8164-4b5f-8378-5399a4e1d4c5",
    "fixtureId": "4e0195f9-e74b-4def-b84d-79b70e4cdbf9",
    "providerFixtureId": "1521133",
    "providerSnapshotId": "6eb20a6f-49b7-4cba-aa99-94259587787e",
    "bookmakerCount": 1,
    "capturedAt": "2026-05-27T16:43:22.798Z",
    "payloadHash": "0f7427cc70d2c28f4f38ab4239ece69d2715522e27a41309b9ebee6e675e666b"
  },
  "researchBundle": {
    "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b",
    "runId": "bde77068-2a26-4c4b-b31a-ca2fe6894955",
    "status": "promotable",
    "gateResult": {
      "reasons": [
        "structured research generated with sufficient evidence",
        "web-search evidence included as webMode is live",
        "objective research gate passed with current web evidence"
      ],
      "verdict": "promotable",
      "warnings": [
        "market corners_over_under skipped/review-required: missing odds quotes for requested market",
        "market btts skipped/review-required: missing odds quotes for requested market"
      ]
    },
    "providerAgentic": "gemini",
    "model": "gemini-2.5-flash",
    "promptVersion": "research-fixture-v2",
    "warnings": [
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
        "market corners_over_under skipped/review-required: missing odds quotes for requested market",
        "market btts skipped/review-required: missing odds quotes for requested market"
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
      "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football odds snapshot",
      "externalId": "1521133",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:43:22.798Z",
      "metadata": {
        "fixtureId": "4e0195f9-e74b-4def-b84d-79b70e4cdbf9",
        "quoteCount": 8,
        "snapshotId": "6eb20a6f-49b7-4cba-aa99-94259587787e",
        "bookmakerCount": 1,
        "oddsSnapshotId": "d8e3596c-8164-4b5f-8378-5399a4e1d4c5",
        "providerFixtureId": "1521133"
      }
    },
    {
      "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:source_api_football_odds",
      "type": "api-football",
      "url": null,
      "title": "API-Football Odds Snapshot",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:43:22.798Z",
      "metadata": {
        "artifactPath": "N/A",
        "providerSnapshotId": "6eb20a6f-49b7-4cba-aa99-94259587787e"
      }
    },
    {
      "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture statistics",
      "externalId": "1521133",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:43:21.746Z",
      "metadata": {
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "4dd05847-a7cc-42ff-9f99-387c151c7932",
        "providerFixtureId": "1521133"
      }
    },
    {
      "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:source_web_livescores",
      "type": "web-search",
      "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEJFv62EXapMGBnCYqR5-fUl4JYRfbchNyTgAxRwPaeR7VgWB0KLoVgGu6wH87D9bdJhOheE342z3ZlehzfowwCTmOV-lcci8vX6yjOf9zavzd1AaxroylY2MA05VQFqwlnKpDd9nL975u7xCRiZsmrwZKLKw6wN4sBuaqHisUwywArTN4S9ckDos6-jdDNJ4M=",
      "title": "Mes Kerman vs Nassaji Mazandaran - May 27, 2026 - Livescores.biz",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:43:18.046Z",
      "metadata": {}
    },
    {
      "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:source_api_football_fixture",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture",
      "externalId": "1521133",
      "providerSnapshotId": null,
      "capturedAt": "2026-05-27T16:43:18.046Z",
      "metadata": {
        "fixtureId": "4e0195f9-e74b-4def-b84d-79b70e4cdbf9",
        "providerFixtureId": "1521133"
      }
    }
  ],
  "evidenceItems": [
    {
      "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:evidence_web_match_result",
      "sourceId": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:source_web_livescores",
      "summary": "The match result was Mes Kerman 1 - 2 Nassaji Mazandaran, indicating an away win for Nassaji Mazandaran and 3 total goals.",
      "confidence": 0.95,
      "claimIds": [
        "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:claim_h2h_away_win",
        "7fbee6a3-8ca1-4da3-aeca-529071bfa47b:claim_double_chance_draw_or_away",
        "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:claim_goals_over_2_5",
        "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:claim_btts_yes"
      ],
      "metadata": {}
    },
    {
      "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:evidence_web_scorers",
      "sourceId": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:source_web_livescores",
      "summary": "Both Mes Kerman and Nassaji Mazandaran scored goals during the match.",
      "confidence": 0.9,
      "claimIds": [
        "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:claim_btts_yes"
      ],
      "metadata": {}
    },
    {
      "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:evidence_web_corners",
      "sourceId": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:source_web_livescores",
      "summary": "Total corner kicks in the match were 10 (4 for Mes Kerman, 6 for Nassaji Mazandaran).",
      "confidence": 0.85,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:evidence_odds_h2h",
      "sourceId": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:source_api_football_odds",
      "summary": "Bet365 offered odds of 2.15 for Nassaji Mazandaran (away) to win in the H2H market.",
      "confidence": 0.9,
      "claimIds": [
        "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:claim_h2h_away_win"
      ],
      "metadata": {
        "price": 2.15,
        "market": "h2h",
        "selection": "away"
      }
    },
    {
      "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:evidence_odds_double_chance",
      "sourceId": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:source_api_football_odds",
      "summary": "Bet365 offered odds of 1.22 for Draw or Away in the Double Chance market.",
      "confidence": 0.9,
      "claimIds": [
        "7fbee6a3-8ca1-4da3-aeca-529071bfa47b:claim_double_chance_draw_or_away"
      ],
      "metadata": {
        "price": 1.22,
        "market": "double_chance",
        "selection": "draw_or_away"
      }
    },
    {
      "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:evidence_odds_goals_over_under",
      "sourceId": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:source_api_football_odds",
      "summary": "Bet365 offered odds of 3.25 for Over 2.5 goals in the Goals Over/Under market.",
      "confidence": 0.9,
      "claimIds": [
        "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:claim_goals_over_2_5"
      ],
      "metadata": {
        "line": 2.5,
        "price": 3.25,
        "market": "goals_over_under",
        "selection": "over"
      }
    }
  ],
  "claims": [
    {
      "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:claim_h2h_away_win",
      "statement": "Nassaji Mazandaran won the match against Mes Kerman.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:evidence_web_match_result",
        "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:evidence_odds_h2h"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "7fbee6a3-8ca1-4da3-aeca-529071bfa47b:claim_double_chance_draw_or_away",
      "statement": "The match resulted in either a draw or an away win for Nassaji Mazandaran.",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:evidence_web_match_result",
        "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:evidence_odds_double_chance"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:claim_goals_over_2_5",
      "statement": "There were over 2.5 goals scored in the match.",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:evidence_web_match_result",
        "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:evidence_odds_goals_over_under"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:claim_btts_yes",
      "statement": "Both teams scored in the match.",
      "marketKey": "btts",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:evidence_web_match_result",
        "7fbee6a8-8ca1-4da3-aeca-529071bfa47b:evidence_web_scorers"
      ],
      "conflictStatus": "none"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "1af0c387-a8fb-440c-a579-17ec30c185ff",
      "market": "h2h",
      "selection": "away",
      "line": null,
      "odds": 2.15,
      "impliedProbability": 0.465116,
      "marketImpliedProbability": 0.465116,
      "marketFairProbability": 0.413594,
      "consensusFairOdds": 2.417833,
      "overround": 0.124573,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:43:22.798Z"
    },
    {
      "oddsQuoteId": "81bbcfbe-36a7-43d3-a9ce-acd6d3dd8e7c",
      "market": "h2h",
      "selection": "draw",
      "line": null,
      "odds": 2.62,
      "impliedProbability": 0.381679,
      "marketImpliedProbability": 0.381679,
      "marketFairProbability": 0.339399,
      "consensusFairOdds": 2.946382,
      "overround": 0.124573,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:43:22.798Z"
    },
    {
      "oddsQuoteId": "b2ab581f-ec32-4bc8-a34d-0909e50ae0ca",
      "market": "h2h",
      "selection": "home",
      "line": null,
      "odds": 3.6,
      "impliedProbability": 0.277778,
      "marketImpliedProbability": 0.277778,
      "marketFairProbability": 0.247007,
      "consensusFairOdds": 4.048464,
      "overround": 0.124573,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:43:22.798Z"
    },
    {
      "oddsQuoteId": "d80a7169-25f6-48e2-b66c-5470262d2457",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": null,
      "odds": 1.22,
      "impliedProbability": 0.819672,
      "marketImpliedProbability": 0.819672,
      "marketFairProbability": 0.377572,
      "consensusFairOdds": 2.648499,
      "overround": 1.170901,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:43:22.798Z"
    },
    {
      "oddsQuoteId": "de80dc23-180d-4324-a38b-0c50d85bbfda",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": null,
      "odds": 1.4,
      "impliedProbability": 0.714286,
      "marketImpliedProbability": 0.714286,
      "marketFairProbability": 0.329027,
      "consensusFairOdds": 3.039261,
      "overround": 1.170901,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:43:22.798Z"
    },
    {
      "oddsQuoteId": "3c813641-385a-42a4-b22a-6a362517c78b",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": null,
      "odds": 1.57,
      "impliedProbability": 0.636943,
      "marketImpliedProbability": 0.636943,
      "marketFairProbability": 0.2934,
      "consensusFairOdds": 3.408314,
      "overround": 1.170901,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:43:22.798Z"
    },
    {
      "oddsQuoteId": "baca623d-d31c-4ae3-9cdc-ac5b539f8206",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.5,
      "odds": 3.25,
      "impliedProbability": 0.307692,
      "marketImpliedProbability": 0.307692,
      "marketFairProbability": 0.290393,
      "consensusFairOdds": 3.443609,
      "overround": 0.059572,
      "marketEfficiencyScore": 0.6426,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:43:22.798Z"
    },
    {
      "oddsQuoteId": "6c6d0875-a84b-4dff-b004-714b1dad5d55",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.5,
      "odds": 1.33,
      "impliedProbability": 0.75188,
      "marketImpliedProbability": 0.75188,
      "marketFairProbability": 0.709607,
      "consensusFairOdds": 1.409231,
      "overround": 0.059572,
      "marketEfficiencyScore": 0.6426,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-05-27T16:43:22.798Z"
    }
  ],
  "providerContextWarnings": []
}
""")

# Helper functions to get evidence and claims by ID
evidence_items_map = {item['id']: item for item in input_data['evidenceItems']}
claims_map = {item['id']: item for item in input_data['claims']}

def get_evidence_by_id(evidence_id):
    return evidence_items_map.get(evidence_id)

def get_claim_by_id(claim_id):
    return claims_map.get(claim_id)

output = {
    "predictions": [],
    "warnings": [],
    "metadata": {}
}

# Process allowedQuotes for Predictions
for quote in input_data['allowedQuotes']:
    market = quote['market']
    selection = quote['selection']
    line = quote.get('line')
    odds = quote['odds']
    odds_quote_id = quote['oddsQuoteId']
    market_fair_probability = quote['marketFairProbability']
    implied_probability = quote['impliedProbability']

    # Find claims that match the quote's market, selection, and line
    relevant_claims = []
    for claim in input_data['claims']:
        claim_matches_selection = False
        if claim['selectionKey'] is not None:
            if claim['selectionKey'] == selection:
                claim_matches_selection = True
        else: # claim['selectionKey'] is null, try to infer from statement
            if market == 'h2h':
                if selection == 'away' and 'Nassaji Mazandaran won' in claim['statement']:
                    claim_matches_selection = True
                elif selection == 'home' and 'Mes Kerman won' in claim['statement']:
                    claim_matches_selection = True
                elif selection == 'draw' and 'draw' in claim['statement'] and 'The match resulted in a draw' in claim['statement']: # More specific for draw
                    claim_matches_selection = True
            elif market == 'double_chance':
                if selection == 'draw_or_away' and 'draw or an away win' in claim['statement']:
                    claim_matches_selection = True
            elif market == 'goals_over_under':
                if selection == 'over' and line is not None and f'over {line}' in claim['statement']:
                    claim_matches_selection = True
                elif selection == 'under' and line is not None and f'under {line}' in claim['statement']:
                    claim_matches_selection = True
            elif market == 'btts':
                if selection == 'yes' and 'Both teams scored' in claim['statement']:
                    claim_matches_selection = True
        
        # Ensure that market and line also match
        if (claim['marketKey'] == market and
            claim_matches_selection and
            (claim['line'] is None or (line is not None and claim['line'] is not None and math.isclose(claim['line'], line)) or (line is None and claim['line'] is None))):
            relevant_claims.append(claim)

    prediction_evidence_ids = []
    prediction_claim_ids = []
    max_evidence_confidence = 0.0
    rationale_parts = []
    prediction_warnings = []
    promotable = False

    if relevant_claims:
        for claim in relevant_claims:
            prediction_claim_ids.append(claim['id'])
            for evidence_id in claim['evidenceIds']:
                if evidence_id not in prediction_evidence_ids:
                    prediction_evidence_ids.append(evidence_id)
                evidence_item = get_evidence_by_id(evidence_id)
                if evidence_item:
                    max_evidence_confidence = max(max_evidence_confidence, evidence_item['confidence'])
                    rationale_parts.append(evidence_item['summary'])
        
        model_probability = max_evidence_confidence
        confidence = max_evidence_confidence
        
        promotable = True
        if max_evidence_confidence < 0.7 and market_fair_probability is not None and model_probability - market_fair_probability < 0.1: # Heuristic for non-promotable low edge/confidence
            prediction_warnings.append("Confidence or edge is not high enough for an unconditionally promotable pick.")
            promotable = False
    else:
        model_probability = market_fair_probability if market_fair_probability is not None else implied_probability
        confidence = 0.3 # Low confidence as no specific evidence
        prediction_warnings.append("No specific claims or strong evidence found for this market/selection/line. Model probability and confidence are estimated based on available market data.")
        promotable = False

    edge = model_probability - market_fair_probability if market_fair_probability is not None else 0.0
    
    rationale_unique = sorted(list(set(rationale_parts)))
    rationale = ". ".join(rationale_unique)
    if rationale and not rationale.endswith('.'):
        rationale += '.'
    
    if not rationale:
        rationale = f"Prediction for {market} ({selection}{' ' + str(line) if line is not None else ''}) based on available market data."

    if confidence >= 0.7:
        confidence_band = "high"
    elif confidence >= 0.5:
        confidence_band = "medium"
    else:
        confidence_band = "low"

    prediction = {
        "oddsQuoteId": odds_quote_id,
        "market": market,
        "selection": selection,
        "line": line,
        "odds": odds,
        "probability": round(model_probability, 6),
        "modelProbability": round(model_probability, 6),
        "marketFairProbability": round(market_fair_probability, 6) if market_fair_probability is not None else None,
        "edge": round(edge, 6),
        "confidence": round(confidence, 6),
        "confidenceBand": confidence_band,
        "blockers": [],
        "promotable": promotable,
        "evidenceIds": list(set(prediction_evidence_ids)),
        "claimIds": list(set(prediction_claim_ids)),
        "rationale": rationale,
        "warnings": prediction_warnings
    }
    output['predictions'].append(prediction)

predicted_markets = {p['market'] for p in output['predictions']}
for skipped_market_info in input_data['researchBundle']['metadata']['marketCoverage']['skippedMarkets']:
    skipped_market_name = skipped_market_info['market']
    if skipped_market_name in input_data['requiredMarkets'] and skipped_market_name not in predicted_markets:
        output['warnings'].append(f"Market {skipped_market_name} was skipped during research: {skipped_market_info['reason']}. No predictions were generated for this market despite being required.")

print(json.dumps(output, indent=2))
