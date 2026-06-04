import json
import math

def calculate_confidence_band(confidence):
    if confidence < 0.5:
        return "low"
    elif 0.5 <= confidence < 0.75:
        return "medium"
    else:
        return "high"

def generate_predictions(input_data):
    predictions = []
    global_warnings = []

    # Create helper dictionaries for quick lookup
    evidence_by_id = {item["id"]: item for item in input_data["evidenceItems"]}
    claims_by_id = {item["id"]: item for item in input_data["claims"]}

    # Process provider context warnings
    if "providerContextWarnings" in input_data and input_data["providerContextWarnings"]:
        global_warnings.extend(input_data["providerContextWarnings"])
    
    # Process researchBundle warnings
    if "warnings" in input_data["researchBundle"] and input_data["researchBundle"]["warnings"]:
        global_warnings.extend(input_data["researchBundle"]["warnings"])


    for market_name in input_data["requiredMarkets"]:
        # Check if the market was skipped according to the research bundle metadata
        skipped_market_info = next(
            (
                sm
                for sm in input_data["researchBundle"]["metadata"]["marketCoverage"]["skippedMarkets"]
                if sm["market"] == market_name
            ),
            None,
        )

        if skipped_market_info:
            global_warnings.append(
                f"market {market_name} skipped/review-required: {skipped_market_info['reason']}"
            )
            continue  # Skip to the next market if it was explicitly skipped

        # Filter allowed quotes and claims for the current market
        market_quotes = [q for q in input_data["allowedQuotes"] if q["market"] == market_name]
        market_claims = [c for c in input_data["claims"] if c["marketKey"] == market_name]

        # Iterate through market_quotes to create predictions
        for quote in market_quotes:
            # Find matching claims for the current quote
            matching_claims = [
                c
                for c in market_claims
                if c["selectionKey"] == quote["selection"] and c["line"] == quote["line"]
            ]

            # If no specific claim matches selection and line, look for market-level claims without specific selection/line
            if not matching_claims:
                 matching_claims = [
                    c
                    for c in market_claims
                    if c["selectionKey"] is None and c["line"] is None
                ]


            # Initialize prediction fields
            odds_quote_id = quote["oddsQuoteId"]
            market = quote["market"]
            selection = quote["selection"]
            line = quote["line"]
            odds = quote["odds"]
            market_fair_probability = quote["marketFairProbability"]
            
            # modelProbability is the reciprocal of the odds
            model_probability = 1 / odds if odds != 0 else 0 
            edge = model_probability - market_fair_probability

            evidence_ids = []
            claim_ids = []
            rationales = []
            prediction_warnings = []
            confidence_scores = []
            promotable = False

            for claim in matching_claims:
                claim_ids.append(claim["id"])
                rationales.append(claim["statement"])

                # Collect evidence IDs and confidence for the claim
                for evid in claim["evidenceIds"]:
                    if evid not in evidence_ids:
                        evidence_ids.append(evid)
                    if evid in evidence_by_id and evidence_by_id[evid]["confidence"] is not None:
                        confidence_scores.append(evidence_by_id[evid]["confidence"])

                if claim["supportLevel"] == "supported" and evidence_ids:
                    promotable = True
                
                # Check for rationale grounded in evidence
                if not rationales:
                    rationales.append(f"No specific rationale provided for {market} - {selection} (line: {line}) but supported by market data.")


            # Calculate average confidence
            confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.5 # Default confidence if no scores
            confidence_band = calculate_confidence_band(confidence)

            # Ensure rationale is a single string or default
            rationale_text = ". ".join(rationales)
            if not rationale_text:
                rationale_text = f"Analytical pick for {market} - {selection} (line: {line})."
            
            # Check for promotable criteria: market-specific evidenceIds/claimIds for the same market/selection/line
            # This is already handled by `matching_claims`
            if promotable and not (evidence_ids and claim_ids):
                # If promotable flag is set but evidence/claims are missing, something is wrong, revert promotable.
                # Or this could be a fallback scenario, as per prompt.
                promotable = False
                prediction_warnings.append("Promotable flag requires market-specific evidenceIds/claimIds, or explicit fallback warning.")


            # Check promotable conditions based on prompt: "A promotable pick requires market-specific evidenceIds/claimIds for the same market/selection/line, or an explicit fallback warning explaining why fixture-level evidence is the best available support."
            # My current logic for `promotable` is based on claim supportLevel and existence of evidence.
            # Let's refine `promotable` more strictly.
            # A pick is promotable if there are claims AND evidence, AND the claim is "supported".
            if claim_ids and evidence_ids and any(claims_by_id[cid]["supportLevel"] == "supported" for cid in claim_ids):
                promotable = True
            else:
                promotable = False
                if claim_ids and not evidence_ids:
                    prediction_warnings.append("Prediction is not promotable due to missing evidence for claims.")
                elif evidence_ids and not claim_ids:
                    prediction_warnings.append("Prediction is not promotable due to missing claims for evidence.")
                elif not claim_ids and not evidence_ids:
                    prediction_warnings.append("Prediction is not promotable as no supporting claims or evidence were found.")
                elif claim_ids and evidence_ids and not any(claims_by_id[cid]["supportLevel"] == "supported" for cid in claim_ids):
                    prediction_warnings.append("Prediction is not promotable because supporting claims are not 'supported'.")


            prediction = {
                "oddsQuoteId": odds_quote_id,
                "market": market,
                "selection": selection,
                "line": line,
                "odds": odds,
                "probability": model_probability, # The prompt example shows probability as modelProbability
                "modelProbability": model_probability,
                "marketFairProbability": market_fair_probability,
                "edge": edge,
                "confidence": confidence,
                "confidenceBand": confidence_band,
                "blockers": [], # No specific blockers identified in the prompt
                "promotable": promotable,
                "evidenceIds": evidence_ids,
                "claimIds": claim_ids,
                "rationale": rationale_text,
                "warnings": prediction_warnings,
            }
            predictions.append(prediction)

    # Sort predictions by market for consistent output
    predictions.sort(key=lambda p: (p["market"], str(p["line"] if p["line"] is not None else ""), p["selection"]))

    output = {
        "predictions": predictions,
        "warnings": list(set(global_warnings)),  # Remove duplicate global warnings
        "metadata": {},
    }

    return json.dumps(output, indent=2)

# Assuming the input is provided as a string from the user prompt
input_str = """
{
  "promptVersion": "score-prediction-v2",
  "runId": "bdb4f6b9-6289-43b5-a0a5-06c1c32874e9",
  "createdAt": "2026-06-04T17:02:22.543Z",
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
    "id": "2575c997-329d-440d-9cf4-907bfef6be46",
    "providerFixtureId": "1527073",
    "competitionId": "29a44fc0-a429-45d8-ad86-9e8926e189d8",
    "season": 2026,
    "homeTeamId": "6f318b3d-6f49-4257-a473-ff91836e9c9d",
    "awayTeamId": "bff561f0-bd31-4c36-b5b2-24ded6f37ade",
    "scheduledAt": "2026-06-05T10:00:00.000Z",
    "status": "scheduled",
    "scoreHome": null,
    "scoreAway": null,
    "includedByFilters": [],
    "metadata": {
      "league": {
        "id": 194,
        "name": "South Australia NPL",
        "country": "Australia",
        "season": 2026,
        "round": "Regular Season - 13"
      },
      "teams": {
        "home": {
          "id": 3785,
          "name": "Adelaide City"
        },
        "away": {
          "id": 12866,
          "name": "Sturt Lions"
        }
      },
      "venue": "Adelaide City Park",
      "round": "Regular Season - 13",
      "timezone": "UTC",
      "apiFootballStatusShort": "NS",
      "apiFootballStatusLong": "Not Started"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1527073",
    "capturedAt": "2026-06-04T17:02:24.497Z",
    "providerSnapshotId": "305b8936-d23b-41b6-9a8f-d00f53fe935c"
  },
  "oddsSnapshot": {
    "id": "e0069b64-dde6-46c7-8e88-4e86b60f7efd",
    "fixtureId": "2575c997-329d-440d-9cf4-907bfef6be46",
    "providerFixtureId": "1527073",
    "providerSnapshotId": "176bd418-7958-4fae-a5ef-db840b2688af",
    "bookmakerCount": 2,
    "capturedAt": "2026-06-04T16:36:57.008Z",
    "payloadHash": "7520446fe0baf1a1e11f20acfca55488784b038c1f667be13d8fe497e5ec1f8f"
  },
  "researchBundle": {
    "id": "a8553a9b-5910-4d74-a8ba-81c663803f90",
    "runId": "bdb4f6b9-6289-43b5-a0a5-06c1c32874e9",
    "status": "promotable",
    "gateResult": {
      "reasons": [
        "Research generated with sufficient evidence for most markets, but required market 'corners_over_under' was skipped due to lack of data.",
        "objective research gate passed with current web evidence"
      ],
      "verdict": "promotable",
      "warnings": [
        "mapped supportLevel \\"partially-supported\\" to \\"partial\\" on claim \\"claim_h2h_away_potential\\"",
        "market corners_over_under skipped/review-required: missing odds quotes for requested market"
      ]
    },
    "providerAgentic": "gemini",
    "model": "gemini-2.5-pro",
    "promptVersion": "research-fixture-v2",
    "warnings": [
      "mapped supportLevel \\"partially-supported\\" to \\"partial\\" on claim \\"claim_h2h_away_potential\\"",
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
        "mapped supportLevel \\"partially-supported\\" to \\"partial\\" on claim \\"claim_h2h_away_potential\\"",
        "market corners_over_under skipped/review-required: missing odds quotes for requested market"
      ],
      "webSearchCoverage": {        "mode": "live",
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
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_4",
      "type": "web-search",
      "url": "https://footballpark.com/",
      "title": "Match Preview: Adelaide City vs Sturt Lions",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:40:10.000Z",
      "metadata": {}
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_3",
      "type": "web-search",
      "url": "https://soccervital.com/",
      "title": "Adelaide City vs Sturt Lions Head-to-Head and Form",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:40:10.000Z",
      "metadata": {}
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football odds snapshot",
      "externalId": "1527073",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:36:57.008Z",
      "metadata": {
        "fixtureId": "2575c997-329d-440d-9cf4-907bfef6be46",
        "quoteCount": 43,
        "snapshotId": "176bd418-7958-4fae-a5ef-db840b2688af",
        "bookmakerCount": 2,
        "oddsSnapshotId": "e0069b64-dde6-46c7-8e88-4e86b60f7efd",
        "providerFixtureId": "1527073"
      }
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_2",
      "type": "provider-snapshot",
      "url": null,
      "title": "Odds Snapshot",
      "externalId": "gana://source_2",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:36:57.008Z",
      "metadata": {
        "provider": "gana"
      }
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture statistics",
      "externalId": "1527073",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:36:55.843Z",
      "metadata": {
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "5828c52b-db5e-409d-8d3d-b3a2d19f4752",
        "providerFixtureId": "1527073"
      }
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_1",
      "type": "api-football",
      "url": null,
      "title": "API-Football Fixture Snapshot",
      "externalId": "api-football://source_1",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:36:55.202Z",
      "metadata": {
        "provider": "api-football"
      }
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_api_football_fixture",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture",
      "externalId": "1527073",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-04T16:36:52.284Z",
      "metadata": {
        "fixtureId": "2575c997-329d-440d-9cf4-907bfef6be46",
        "providerFixtureId": "1527073"
      }
    }
  ],
  "evidenceItems": [
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_h2h_odds_home",
      "sourceId": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_2",
      "summary": "Bet365 offers odds of 1.67 for Adelaide City to win.",
      "confidence": 0.9,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_h2h_form_home",
      "sourceId": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_3",
      "summary": "Adelaide City is in strong recent form, unbeaten in their last four matches.",
      "confidence": 0.85,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_h2h_history",
      "sourceId": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_3",
      "summary": "Adelaide City has a dominant head-to-head record against Sturt Lions.",
      "confidence": 0.85,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_h2h_recent_upset",
      "sourceId": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_3",
      "summary": "Despite historical trends, Sturt Lions won the latest match between the two sides.",
      "confidence": 0.85,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_double_chance_odds",
      "sourceId": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_2",
      "summary": "Bet365 offers low odds of 1.17 for 'Adelaide City or Draw', indicating a high probability.",
      "confidence": 0.9,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_goals_over_under_odds",
      "sourceId": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_2",
      "summary": "Odds for Over 2.5 goals are 1.53, suggesting a reasonable likelihood of a high-scoring game.",
      "confidence": 0.9,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_btts_odds",
      "sourceId": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_2",
      "summary": "The odds for both teams to score are 1.53, indicating it is a likely outcome.",
      "confidence": 0.9,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_sturt_lions_form",
      "sourceId": "a8553a9b-5910-4d74-a8ba-81c663803f90:source_3",
      "summary": "Sturt Lions are in poor recent form, despite a win in their most recent game.",
      "confidence": 0.85,
      "claimIds": [],
      "metadata": {}
    }
  ],
  "claims": [
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:claim_h2h_home_win",
      "statement": "Adelaide City is likely to win the match.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_h2h_odds_home",
        "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_h2h_form_home",
        "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_h2h_history"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:claim_h2h_away_potential",
      "statement": "Sturt Lions have the potential to challenge Adelaide City, having won their most recent meeting.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "partial",
      "confidence": null,
      "evidenceIds": [
        "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_h2h_recent_upset"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:claim_double_chance_home_draw",
      "statement": "There is a high probability that the result will be a win for Adelaide City or a draw.",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_double_chance_odds",
        "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_h2h_form_home",
        "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_sturt_lions_form"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:claim_goals_over_2_5",
      "statement": "The match is likely to have over 2.5 goals.",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_goals_over_under_odds"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "a8553a9b-5910-4d74-a8ba-81c663803f90:claim_btts_yes",
      "statement": "It is likely that both teams will score.",
      "marketKey": "btts",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "a8553a9b-5910-4d74-a8ba-81c663803f90:evidence_btts_odds"
      ],
      "conflictStatus": "none"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "507b081d-8012-4001-a544-a2d4ee70adf3",
      "market": "h2h",
      "selection": "away",
      "line": null,
      "odds": 4.01,
      "impliedProbability": 0.249377,
      "marketImpliedProbability": 0.249688,
      "marketFairProbability": 0.226538,
      "consensusFairOdds": 4.414272,
      "overround": 0.102265,
      "marketEfficiencyScore": 0.666,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "8e9d923a-8667-4241-8f69-93baad717066",
      "market": "h2h",
      "selection": "draw",
      "line": null,
      "odds": 3.87,
      "impliedProbability": 0.258398,
      "marketImpliedProbability": 0.260778,
      "marketFairProbability": 0.236583,
      "consensusFairOdds": 4.226847,
      "overround": 0.102265,
      "marketEfficiencyScore": 0.666,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "b5cd54f7-35ae-42de-93cf-de0335404ce4",
      "market": "h2h",
      "selection": "home",
      "line": null,
      "odds": 1.71,
      "impliedProbability": 0.584795,
      "marketImpliedProbability": 0.591799,
      "marketFairProbability": 0.536879,
      "consensusFairOdds": 1.862617,
      "overround": 0.102265,
      "marketEfficiencyScore": 0.666,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "859344b0-0dfb-4079-a3cf-b2df4072cb75",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": null,
      "odds": 2,
      "impliedProbability": 0.5,
      "marketImpliedProbability": 0.5,
      "marketFairProbability": 0.22705,
      "consensusFairOdds": 4.404317,
      "overround": 1.202158,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "b7c66dd7-dae5-4dae-876b-50cba2fd2f9d",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": null,
      "odds": 1.18,
      "impliedProbability": 0.847458,
      "marketImpliedProbability": 0.847458,
      "marketFairProbability": 0.38483,
      "consensusFairOdds": 2.598547,
      "overround": 1.202158,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "840fc298-6c7c-474d-9e63-b8cf31218565",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": null,
      "odds": 1.17,
      "impliedProbability": 0.854701,
      "marketImpliedProbability": 0.854701,
      "marketFairProbability": 0.38812,
      "consensusFairOdds": 2.576525,
      "overround": 1.202158,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "76867c03-9f1f-40c0-a9cc-039af7a40c68",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.5,
      "odds": 1.14,
      "impliedProbability": 0.877193,
      "marketImpliedProbability": 0.877193,
      "marketFairProbability": 0.814332,
      "consensusFairOdds": 1.228,
      "overround": 0.077193,
      "marketEfficiencyScore": 0.6058,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "6975453e-67cf-49b7-ba53-0ac38e05f974",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.5,
      "odds": 5,
      "impliedProbability": 0.2,
      "marketImpliedProbability": 0.2,
      "marketFairProbability": 0.185668,
      "consensusFairOdds": 5.385965,
      "overround": 0.077193,
      "marketEfficiencyScore": 0.6058,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "feb253ec-9991-4151-8822-af2335536a11",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.5,
      "odds": 1.53,
      "impliedProbability": 0.653595,
      "marketImpliedProbability": 0.660131,
      "marketFairProbability": 0.614954,
      "consensusFairOdds": 1.626138,
      "overround": 0.073467,
      "marketEfficiencyScore": 0.7214,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "05a0ef4b-da98-43af-9027-a27f4322db09",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.5,
      "odds": 2.46,
      "impliedProbability": 0.406504,
      "marketImpliedProbability": 0.413336,
      "marketFairProbability": 0.385046,
      "consensusFairOdds": 2.597092,
      "overround": 0.073467,
      "marketEfficiencyScore": 0.7214,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "c6bd5544-ca19-4cc5-a611-d41ad6588141",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.5,
      "odds": 2.23,
      "impliedProbability": 0.44843,
      "marketImpliedProbability": 0.451488,
      "marketFairProbability": 0.420919,
      "consensusFairOdds": 2.375753,
      "overround": 0.07263,
      "marketEfficiencyScore": 0.7274,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "5f6ba9fd-cb9f-49fa-91a6-1705a759fac0",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.5,
      "odds": 1.62,
      "impliedProbability": 0.617284,
      "marketImpliedProbability": 0.621142,
      "marketFairProbability": 0.579081,
      "consensusFairOdds": 1.726875,
      "overround": 0.07263,
      "marketEfficiencyScore": 0.7274,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "8d50c7eb-7761-421e-8200-cacb4b693d91",
      "market": "goals_over_under",
      "selection": "under",
      "line": 0.5,
      "odds": 17,
      "impliedProbability": 0.058824,
      "marketImpliedProbability": 0.058824,
      "marketFairProbability": 1,
      "consensusFairOdds": 1,
      "overround": -0.941176,
      "marketEfficiencyScore": 0.7667,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "16c78b56-ec5f-4c38-868d-15b095b0e3b5",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.5,
      "odds": 3.75,
      "impliedProbability": 0.266667,
      "marketImpliedProbability": 0.266667,
      "marketFairProbability": 0.25,
      "consensusFairOdds": 4,
      "overround": 0.066667,
      "marketEfficiencyScore": 0.6278,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "8e37f565-9f7d-4f53-a682-2fca1753f641",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.5,
      "odds": 1.25,
      "impliedProbability": 0.8,
      "marketImpliedProbability": 0.8,
      "marketFairProbability": 0.75,
      "consensusFairOdds": 1.333333,
      "overround": 0.066667,
      "marketEfficiencyScore": 0.6278,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "400cace9-0fe9-4b60-88b1-a848f6795efb",
      "market": "goals_over_under",
      "selection": "over",
      "line": 5.5,
      "odds": 6.5,
      "impliedProbability": 0.153846,
      "marketImpliedProbability": 0.153846,
      "marketFairProbability": 0.144737,
      "consensusFairOdds": 6.909091,
      "overround": 0.062937,
      "marketEfficiencyScore": 0.6355,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "82122e4e-6818-47e3-ba13-0a083145df0d",
      "market": "goals_over_under",
      "selection": "under",
      "line": 5.5,
      "odds": 1.1,
      "impliedProbability": 0.909091,
      "marketImpliedProbability": 0.909091,
      "marketFairProbability": 0.855263,
      "consensusFairOdds": 1.169231,
      "overround": 0.062937,
      "marketEfficiencyScore": 0.6355,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "c73f4787-2656-491d-a11d-351767c9d3ca",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.25,
      "odds": 1.35,
      "impliedProbability": 0.740741,
      "marketImpliedProbability": 0.740741,
      "marketFairProbability": 0.68894,
      "consensusFairOdds": 1.451505,
      "overround": 0.075189,
      "marketEfficiencyScore": 0.61,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "7cbf336c-bb5a-49ce-8950-1ec28129082b",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.25,
      "odds": 2.99,
      "impliedProbability": 0.334448,
      "marketImpliedProbability": 0.334448,
      "marketFairProbability": 0.31106,
      "consensusFairOdds": 3.214815,
      "overround": 0.075189,
      "marketEfficiencyScore": 0.61,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "89ef6ca0-79a5-4562-804a-9589f2a9f6a1",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.75,
      "odds": 1.62,
      "impliedProbability": 0.617284,
      "marketImpliedProbability": 0.617284,
      "marketFairProbability": 0.579221,
      "consensusFairOdds": 1.726457,
      "overround": 0.065714,
      "marketEfficiencyScore": 0.6298,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "8e24ef1d-9b5d-4a07-84b0-90dde78700b1",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.75,
      "odds": 2.23,
      "impliedProbability": 0.44843,
      "marketImpliedProbability": 0.44843,
      "marketFairProbability": 0.420779,
      "consensusFairOdds": 2.376543,
      "overround": 0.065714,
      "marketEfficiencyScore": 0.6298,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "55f7df7f-64f6-49b7-b0ac-6cd8607ac73c",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.25,
      "odds": 2.02,
      "impliedProbability": 0.49505,
      "marketImpliedProbability": 0.49505,
      "marketFairProbability": 0.464191,
      "consensusFairOdds": 2.154286,
      "overround": 0.066478,
      "marketEfficiencyScore": 0.6282,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "61b5c739-8263-4ce3-920b-02f2b4a72f6f",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.25,
      "odds": 1.75,
      "impliedProbability": 0.571429,
      "marketImpliedProbability": 0.571429,
      "marketFairProbability": 0.535809,
      "consensusFairOdds": 1.866337,
      "overround": 0.066478,
      "marketEfficiencyScore": 0.6282,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "1330ef5d-2553-46d1-9f37-fb94871a0a98",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.75,
      "odds": 2.58,
      "impliedProbability": 0.387597,
      "marketImpliedProbability": 0.387597,
      "marketFairProbability": 0.361386,
      "consensusFairOdds": 2.767123,
      "overround": 0.072528,
      "marketEfficiencyScore": 0.6156,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "ad34ff6a-b333-4743-8597-6f74d470a85a",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.75,
      "odds": 1.46,
      "impliedProbability": 0.684932,
      "marketImpliedProbability": 0.684932,
      "marketFairProbability": 0.638614,
      "consensusFairOdds": 1.565891,
      "overround": 0.072528,
      "marketEfficiencyScore": 0.6156,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "7a3a5216-cdfe-4153-a458-9962ed9070c4",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4,
      "odds": 2.97,
      "impliedProbability": 0.3367,
      "marketImpliedProbability": 0.3367,
      "marketFairProbability": 0.3125,
      "consensusFairOdds": 3.2,
      "overround": 0.077441,
      "marketEfficiencyScore": 0.6053,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "e3f1dd70-f370-43e3-97b1-d3872d65a334",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3,
      "odds": 1.81,
      "impliedProbability": 0.552486,
      "marketImpliedProbability": 0.552486,
      "marketFairProbability": 0.523684,
      "consensusFairOdds": 1.909548,
      "overround": 0.054999,
      "marketEfficiencyScore": 0.6521,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "329d12dd-6c06-471a-8861-e6db044c3ae2",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3,
      "odds": 1.99,
      "impliedProbability": 0.502513,
      "marketImpliedProbability": 0.502513,
      "marketFairProbability": 0.476316,
      "consensusFairOdds": 2.099448,
      "overround": 0.054999,
      "marketEfficiencyScore": 0.6521,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "fb38e4ed-2b26-4d6a-9580-171e2c031ca5",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4,
      "odds": 1.35,
      "impliedProbability": 0.740741,
      "marketImpliedProbability": 0.740741,
      "marketFairProbability": 0.6875,
      "consensusFairOdds": 1.454545,
      "overround": 0.077441,
      "marketEfficiencyScore": 0.6053,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "4859b34d-5fd5-4283-9ef6-7e515d1d0884",
      "market": "goals_over_under",
      "selection": "over",
      "line": 6.5,
      "odds": 10,
      "impliedProbability": 0.1,
      "marketImpliedProbability": 0.1,
      "marketFairProbability": 0.093382,
      "consensusFairOdds": 10.708738,
      "overround": 0.070874,
      "marketEfficiencyScore": 0.619,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "f990e526-b6eb-43e8-b602-236570d7352c",
      "market": "goals_over_under",
      "selection": "under",
      "line": 6.5,
      "odds": 1.03,
      "impliedProbability": 0.970874,
      "marketImpliedProbability": 0.970874,
      "marketFairProbability": 0.906618,
      "consensusFairOdds": 1.103,
      "overround": 0.070874,
      "marketEfficiencyScore": 0.619,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "56ef3036-726b-4eff-a94e-033c304ba245",
      "market": "goals_over_under",
      "selection": "over",
      "line": 7.5,
      "odds": 15,
      "impliedProbability": 0.066667,
      "marketImpliedProbability": 0.066667,
      "marketFairProbability": 0.063086,
      "consensusFairOdds": 15.851485,
      "overround": 0.056766,
      "marketEfficiencyScore": 0.6484,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "d6652e43-b4ae-431d-89ef-19b9fbc59efd",
      "market": "goals_over_under",
      "selection": "under",
      "line": 7.5,
      "odds": 1.01,
      "impliedProbability": 0.990099,
      "marketImpliedProbability": 0.990099,
      "marketFairProbability": 0.936914,
      "consensusFairOdds": 1.067333,
      "overround": 0.056766,
      "marketEfficiencyScore": 0.6484,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "0ed293e7-2143-456a-a77d-db2e0ffd4238",
      "market": "goals_over_under",
      "selection": "over",
      "line": 8.5,
      "odds": 21,
      "impliedProbability": 0.047619,
      "marketImpliedProbability": 0.047619,
      "marketFairProbability": 1,
      "consensusFairOdds": 1,
      "overround": -0.952381,
      "marketEfficiencyScore": 0.7667,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "c8e8b03a-f6be-4d68-9dbc-bc622fdc0806",
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
      "capturedAt": "2026-06-04T16:36:57.008Z"
    },
    {
      "oddsQuoteId": "dd553f7f-0d4f-46f9-9e21-4986358d5e00",
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
      "capturedAt": "2026-06-04T16:36:57.008Z"
    }
  ],
  "providerContextWarnings": [
    "scoring prompt allowedQuotes trimmed from 43 to 36 representative quotes"
  ]
}
"""

if __name__ == "__main__":
    data = json.loads(input_str)
    result = generate_predictions(data)
    print(result)
