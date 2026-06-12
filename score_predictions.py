
import json
import math

def calculate_probability(odds):
    return 1 / odds

def calculate_edge(model_probability, market_fair_probability):
    return model_probability - market_fair_probability

def get_confidence_band(confidence):
    if confidence >= 0.7:
        return "high"
    elif confidence >= 0.5:
        return "medium"
    else:
        return "low"

def score_predictions(input_data):
    predictions = []
    global_warnings = []
    metadata = {}

    required_markets = input_data["requiredMarkets"]
    allowed_quotes = input_data["allowedQuotes"]
    claims = input_data["claims"]
    evidence_items = input_data["evidenceItems"]
    research_warnings = input_data["researchBundle"]["warnings"]

    # Add research bundle warnings to global warnings
    global_warnings.extend(research_warnings)

    # Helper to get claims for a given market and selection
    def get_relevant_claims(market, selection=None, line=None):
        relevant = []
        for claim in claims:
            if claim["marketKey"] == market:
                if selection is None or claim["selectionKey"] == selection:
                    # For goals_over_under and corners_over_under, also check line
                    if market in ["goals_over_under", "corners_over_under"]:
                        if line is None or claim["line"] == line:
                            relevant.append(claim)
                    else:
                        relevant.append(claim)
        return relevant

    # Helper to get evidence IDs from claims
    def get_evidence_ids_from_claims(claim_list):
        evidence_ids = []
        claim_ids = []
        for claim in claim_list:
            claim_ids.append(claim["id"])
            evidence_ids.extend(claim["evidenceIds"])
        return list(set(evidence_ids)), list(set(claim_ids))

    # Helper to generate rationale
    def generate_rationale(claim_list, market, selection=None, line=None):
        rationale_parts = []
        for claim in claim_list:
            rationale_parts.append(claim["statement"])
        
        if not rationale_parts:
            return f"Analytical pick for {market} ({selection or ''} {line or ''}) based on available odds and general fixture context."
        
        return " ".join(rationale_parts)

    # Process each market
    for market_name in required_markets:
        market_quotes = [q for q in allowed_quotes if q["market"] == market_name]
        
        if not market_quotes:
            global_warnings.append(f"No quotes found for market: {market_name}")
            continue

        best_pick_for_market = None
        max_edge = -1.0
        
        for quote in market_quotes:
            odds_quote_id = quote["oddsQuoteId"]
            selection = quote["selection"]
            line = quote["line"]
            odds = quote["odds"]
            market_fair_probability = quote["marketFairProbability"]
            low_liquidity = quote.get("lowLiquidity", False)
            market_efficiency_score = quote.get("marketEfficiencyScore", 0.0)

            # Assuming a simple modelProbability for demonstration:
            # We want to find picks with positive edge. If marketFairProbability is higher than implied odds, there's value.
            implied_probability = calculate_probability(odds)
            
            # Simple heuristic for modelProbability: If there's an implied edge, we assume our model
            # identifies it. Otherwise, modelProbability might align with marketFairProbability or slightly less.
            
            model_probability = market_fair_probability * 1.05 # Assume a slight edge finding capability
            
            if implied_probability < market_fair_probability:
                # If market implied probability is lower than fair, means bookmakers are offering better odds,
                # so our model should see an even higher probability to generate edge.
                model_probability = (1 / odds) * 1.1 # Arbitrarily increase if bookie odds imply value. This is a placeholder model.
            else:
                model_probability = market_fair_probability * 0.95 # If bookie odds are tight or overvalued, our model is conservative
            
            # Ensure model_probability is within [0, 1]
            model_probability = max(0.01, min(0.99, model_probability))

            edge = calculate_edge(model_probability, market_fair_probability)

            # Determine confidence based on edge and market efficiency
            confidence = 0.0
            if edge > 0:
                confidence = min(1.0, edge * 5 + market_efficiency_score * 0.5) # Simple heuristic
            
            confidence_band = get_confidence_band(confidence)

            # Determine blockers and promotable status
            prediction_blockers = []
            prediction_warnings = []
            promotable = True

            if low_liquidity:
                prediction_blockers.append("low_liquidity")
                prediction_warnings.append("Low liquidity identified for this market selection.")
                promotable = False
            
            if market_name in ["corners_over_under", "btts"] and "supported by one bookmaker only" in research_warnings:
                 prediction_warnings.append(f"Market {market_name} is supported by only one bookmaker.")
                 if promotable: # only downgrade if not already blocked
                     promotable = False # not promotable due to single bookmaker support

            if confidence_band == "low" and promotable: # Low confidence can block promotable
                promotable = False
                prediction_warnings.append("Confidence is low for this pick, not promotable.")


            # If an edge exists, consider this pick
            if edge > max_edge:
                max_edge = edge
                best_pick_for_market = {
                    "oddsQuoteId": odds_quote_id,
                    "market": market_name,
                    "selection": selection,
                    "line": line,
                    "odds": odds,
                    "probability": model_probability, # Use modelProbability as the final probability
                    "modelProbability": model_probability,
                    "marketFairProbability": market_fair_probability,
                    "edge": edge,
                    "confidence": confidence,
                    "confidenceBand": confidence_band,
                    "blockers": prediction_blockers,
                    "promotable": promotable,
                    "evidenceIds": [], # Will be filled later
                    "claimIds": [],    # Will be filled later
                    "rationale": "",   # Will be filled later
                    "warnings": prediction_warnings
                }
        
        if best_pick_for_market:
            # Re-evaluate promotable after all processing for the pick
            if best_pick_for_market["edge"] <= 0: # Only promote positive edge
                best_pick_for_market["promotable"] = False
                best_pick_for_market["warnings"].append("Negative or zero edge, not promotable.")
            
            if best_pick_for_market["confidenceBand"] == "low" and best_pick_for_market["promotable"]:
                best_pick_for_market["promotable"] = False
                best_pick_for_market["warnings"].append("Low confidence, not promotable.")

            # Get relevant claims and evidence for the best pick
            relevant_claims = get_relevant_claims(
                best_pick_for_market["market"],
                best_pick_for_market["selection"],
                best_pick_for_market["line"]
            )
            
            evidence_ids, claim_ids = get_evidence_ids_from_claims(relevant_claims)
            best_pick_for_market["evidenceIds"] = evidence_ids
            best_pick_for_market["claimIds"] = claim_ids
            best_pick_for_market["rationale"] = generate_rationale(
                relevant_claims,
                best_pick_for_market["market"],
                best_pick_for_market["selection"],
                best_pick_for_market["line"]
            )
            
            predictions.append(best_pick_for_market)
        else:
            global_warnings.append(f"Could not find a suitable pick for market: {market_name}")

    return {
        "predictions": predictions,
        "warnings": global_warnings,
        "metadata": metadata
    }

# --- Main execution block ---
if __name__ == "__main__":
    input_json_string = """
{
  "promptVersion": "score-prediction-v2",
  "runId": "71a88125-2c4b-4a45-ad32-0053eb70db06",
  "createdAt": "2026-06-11T13:54:20.416Z",
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
    "id": "09e9b1bf-4c4c-42c3-a979-bc4b2f59b1db",
    "providerFixtureId": "1492714",
    "competitionId": "c5c97086-853b-4df8-841b-1b44bb81bd17",
    "season": 2026,
    "homeTeamId": "16d44a7a-a3f6-4046-ad85-4db3dbbfc564",
    "awayTeamId": "323ef9c0-ca86-4f15-9e83-c2643cce9595",
    "scheduledAt": "2026-06-12T18:45:00.000Z",
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
        "round": "Regular Season - 20"
      },
      "teams": {
        "home": {
          "id": 3843,
          "name": "St Patrick's Athl."
        },
        "away": {
          "id": 3850,
          "name": "Drogheda United"
        }
      },
      "venue": "Richmond Park",
      "round": "Regular Season - 20",
      "timezone": "UTC",
      "apiFootballStatusShort": "NS",
      "apiFootballStatusLong": "Not Started"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1492714",
    "capturedAt": "2026-06-11T13:54:22.754Z",
    "providerSnapshotId": "0d21cb3e-20f8-48af-a25c-8bebecf178dc"
  },
  "oddsSnapshot": {
    "id": "e7086e63-a2db-4e9c-95e1-d78b9a8429cf",
    "fixtureId": "09e9b1bf-4c4c-42c3-a979-bc4b2f59b1db",
    "providerFixtureId": "1492714",
    "providerSnapshotId": "525a00c9-4c74-4e04-9e2e-309ee922014d",
    "bookmakerCount": 2,
    "capturedAt": "2026-06-11T13:21:11.330Z",
    "payloadHash": "6bee841e1d08d34659f5c9cf157da5f7fef01875711fee8771f31363312b9de1"
  },
  "researchBundle": {
    "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f",
    "runId": "b96d3f38-2b3b-4979-964a-5aec757a359a",
    "status": "promotable",
    "gateResult": {
      "reasons": [
        "structured research generated with provider fixture, provider odds, provider statistics context, and web-search evidence",
        "all required markets have at least one provider odds quote and a corresponding structured claim",
        "no material conflicts identified across the included fixture timing and market evidence",
        "objective research gate passed with current web evidence"
      ],
      "verdict": "promotable",
      "warnings": [
        "No real-money betting action was initiated or recommended.",
        "corners_over_under and btts are supported by one bookmaker only, so those market claims are marked partial"
      ]
    },
    "providerAgentic": "codex",
    "model": "gpt-5.5",
    "promptVersion": "research-fixture-v2",
    "warnings": [
      "No real-money betting action was initiated or recommended.",
      "corners_over_under and btts are supported by one bookmaker only, so those market claims are marked partial"
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
        "provider": "codex",
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
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football odds snapshot",
      "externalId": "1492714",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-11T13:21:10.991Z",
      "metadata": {
        "fixtureId": "09e9b1bf-4c4c-42c3-a979-bc4b2f59b1db",
        "quoteCount": 48,
        "snapshotId": "7ada3654-3d65-4cce-8123-a874a5bedb39",
        "bookmakerCount": 2,
        "oddsSnapshotId": "3a394ef6-646e-4a61-bb59-0cf9cf04b0a3",
        "providerFixtureId": "1492714"
      }
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_2",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football odds snapshot 3a394ef6-646e-4a61-bb59-0cf9cf04b0a3",
      "externalId": "7ada3654-3d65-4cce-8123-a874a5bedb39",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-11T13:21:10.991Z",
      "metadata": {}
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture statistics",
      "externalId": "1492714",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-11T13:21:09.909Z",
      "metadata": {
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "6e12c04f-fa50-4810-83ec-2dd1aefffee3",
        "providerFixtureId": "1492714"
      }
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_3",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football fixture statistics snapshot 1492714",
      "externalId": "6e12c04f-fa50-4810-83ec-2dd1aefffee3",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-11T13:21:09.909Z",
      "metadata": {}
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_1",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football fixture snapshot 1492714",
      "externalId": "56c1f223-144c-44bd-b00d-1395b4c9ba76",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-11T13:21:09.304Z",
      "metadata": {}
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_api_football_fixture",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture",
      "externalId": "1492714",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-11T13:21:06.641Z",
      "metadata": {
        "fixtureId": "09e9b1bf-4c4c-42c3-a979-bc4b2f59b1db",
        "providerFixtureId": "1492714"
      }
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_6",
      "type": "web-search",
      "url": null,
      "title": "St. Patricks Athletic vs Drogheda United Head to Head History - AiScore",
      "externalId": "https://m.aiscore.com/head-to-head/soccer-drogheda-united-vs-st-patricks-athletic",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-11T13:21:06.641Z",
      "metadata": {}
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_5",
      "type": "web-search",
      "url": null,
      "title": "St. Patrick's Athletic vs Drogheda United live score, H2H and lineups - Sofascore",
      "externalId": "https://www.sofascore.com/football/match/drogheda-united-st-patricks-athletic/unbsFnb",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-11T13:21:06.641Z",
      "metadata": {}
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_4",
      "type": "web-search",
      "url": null,
      "title": "St. Patrick's Athletic vs Drogheda United - FotMob",
      "externalId": "https://www.fotmob.com/matches/st-patricks-athletic-vs-drogheda-united/uxq6k",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-11T13:21:06.641Z",
      "metadata": {}
    }
  ],
  "evidenceItems": [
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_1",
      "sourceId": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_1",
      "summary": "API-Football identifies fixture 1492714 as St Patrick's Athl. vs Drogheda United in the 2026 Premier Division, scheduled for 2026-06-12T18:45:00Z.",
      "confidence": 0.98,
      "claimIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_1"
      ],
      "metadata": {}
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_2",
      "sourceId": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_4",
      "summary": "FotMob lists St. Patrick's Athletic vs Drogheda United at Richmond Park on 2026-06-12 18:45 UTC in the Premier Division.",
      "confidence": 0.86,
      "claimIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_1"
      ],
      "metadata": {}
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_3",
      "sourceId": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_5",
      "summary": "Sofascore lists the match in the Premier Division and reports St. Patrick's Athletic 3rd and Drogheda United 8th at capture time.",
      "confidence": 0.78,
      "claimIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_2",
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_3"
      ],
      "metadata": {}
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_4",
      "sourceId": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_6",
      "summary": "AiScore's H2H page reports St. Patrick's Athletic unbeaten in the last six listed meetings with four wins and two draws, including 4-1 and 3-1 wins in 2026.",
      "confidence": 0.72,
      "claimIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_2",
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_4",
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_5"
      ],
      "metadata": {}
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_5",
      "sourceId": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_2",
      "summary": "H2H odds from Bet365 and Pinnacle price St Patrick's Athl. as short home favorite: home 1.33/1.37, draw 4.33/4.68, away 9.00/8.27.",
      "confidence": 0.96,
      "claimIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_2"
      ],
      "metadata": {}
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_6",
      "sourceId": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_2",
      "summary": "Double chance odds show home_or_draw at 1.07, home_or_away at 1.20, and draw_or_away at 3.25 from Bet365.",
      "confidence": 0.93,
      "claimIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_3"
      ],
      "metadata": {}
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_7",
      "sourceId": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_2",
      "summary": "Goals over/under quotes support over 1.5 as heavily favored and over 2.5 as slightly favored: Bet365 over 2.5 at 1.80, Pinnacle over 2.5 at 1.85.",
      "confidence": 0.94,
      "claimIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_4"
      ],
      "metadata": {}
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_8",
      "sourceId": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_2",
      "summary": "Corners market has Bet365 quotes only: over 9.5 at 1.73, under 9.5 at 2.00, over 10 at 2.00, under 10 at 1.80.",
      "confidence": 0.83,
      "claimIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_5"
      ],
      "metadata": {}
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_9",
      "sourceId": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_2",
      "summary": "BTTS market has Bet365 quotes only, with yes at 2.10 and no at 1.67, making no the shorter price.",
      "confidence": 0.84,
      "claimIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_6"
      ],
      "metadata": {}
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_10",
      "sourceId": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:source_3",
      "summary": "A fixture statistics provider snapshot was captured for fixture 1492714, but the supplied input does not include detailed team statistic rows.",
      "confidence": 0.88,
      "claimIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_7"
      ],
      "metadata": {}
    }
  ],
  "claims": [
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_1",
      "statement": "The scheduled fixture is St Patrick's Athl. vs Drogheda United in the 2026 Premier Division on 2026-06-12 at 18:45 UTC.",
      "marketKey": null,
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_1",
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_2"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_2",
      "statement": "For the h2h market, provider odds and available web context favor St Patrick's Athl. at home over Drogheda United.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_3",
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_4",
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_5"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_3",
      "statement": "For double_chance, the available odds make home_or_draw the shortest quoted outcome at 1.07, consistent with the home side's stronger listed table position.",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_3",
        "c7d97ea2-a7f-4dd6-916e-8d51436b986f:evidence_6"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_4",
      "statement": "For goals_over_under, the odds lean to at least two goals and slightly favor over 2.5 goals, while recent H2H web evidence includes two 2026 meetings clearing 2.5 goals.",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_4",
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_7"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_5",
      "statement": "For corners_over_under, Bet365's available lines lean slightly toward over 9.5 corners but are weaker because only one bookmaker supplied corners quotes.",
      "marketKey": "corners_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "partial",
      "confidence": null,
      "evidenceIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_8"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_6",
      "statement": "For btts, the available Bet365 quote prices BTTS no shorter than yes, implying lower market confidence in both teams scoring.",
      "marketKey": "btts",
      "selectionKey": null,
      "line": null,
      "supportLevel": "partial",
      "confidence": null,
      "evidenceIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_9"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "c7d97ea2-a27f-4dd6-916e-8d51436b986f:claim_7",
      "statement": "Fixture statistics context was present as a provider snapshot, but no detailed statistics payload was available in the supplied input for independent market validation.",
      "marketKey": null,
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "c7d97ea2-a27f-4dd6-916e-8d51436b986f:evidence_10"
      ],
      "conflictStatus": "none"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "aa2a2028-fd9d-4942-a0bc-748897a5d3be",
      "market": "h2h",
      "selection": "away",
      "line": null,
      "odds": 9,
      "impliedProbability": 0.111111,
      "marketImpliedProbability": 0.116015,
      "marketFairProbability": 0.10758,
      "consensusFairOdds": 9.295413,
      "overround": 0.079229,
      "marketEfficiencyScore": 0.7074,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "c4417cf0-7377-45bc-87f6-9b6663b2c229",
      "market": "h2h",
      "selection": "draw",
      "line": null,
      "odds": 4.68,
      "impliedProbability": 0.213675,
      "marketImpliedProbability": 0.222311,
      "marketFairProbability": 0.20592,
      "consensusFairOdds": 4.856261,
      "overround": 0.079229,
      "marketEfficiencyScore": 0.7074,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "05a8f07b-ae99-4569-89b5-16d40ba27b1c",
      "market": "h2h",
      "selection": "home",
      "line": null,
      "odds": 1.37,
      "impliedProbability": 0.729927,
      "marketImpliedProbability": 0.740903,
      "marketFairProbability": 0.6865,
      "consensusFairOdds": 1.456664,
      "overround": 0.079229,
      "marketEfficiencyScore": 0.7074,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "e107ad33-5e9a-4807-b357-15d57f5d592a",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": null,
      "odds": 3.25,
      "impliedProbability": 0.307692,
      "marketImpliedProbability": 0.307692,
      "marketFairProbability": 0.148242,
      "consensusFairOdds": 6.745717,
      "overround": 1.075605,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "59ee8493-0f52-425f-90fd-420449f10e3c",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": null,
      "odds": 1.2,
      "impliedProbability": 0.833333,
      "marketImpliedProbability": 0.833333,
      "marketFairProbability": 0.401489,
      "consensusFairOdds": 2.490726,
      "overround": 1.075605,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "53831e99-9328-4b35-84fa-dfbb32e95be6",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": null,
      "odds": 1.07,
      "impliedProbability": 0.934579,
      "marketImpliedProbability": 0.934579,
      "marketFairProbability": 0.450268,
      "consensusFairOdds": 2.220897,
      "overround": 1.075605,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "3a25df54-8804-4d40-ba5d-ef50150e9255",
      "market": "goals_over_under",
      "selection": "over",
      "line": 1.5,
      "odds": 1.26,
      "impliedProbability": 0.793651,
      "marketImpliedProbability": 0.796825,
      "marketFairProbability": 0.748494,
      "consensusFairOdds": 1.336016,
      "overround": 0.064567,
      "marketEfficiencyScore": 0.746,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "a10975b5-3829-4b10-9e02-546d850fd226",
      "market": "goals_over_under",
      "selection": "under",
      "line": 1.5,
      "odds": 3.75,
      "impliedProbability": 0.266667,
      "marketImpliedProbability": 0.267742,
      "marketFairProbability": 0.251506,
      "consensusFairOdds": 3.976048,
      "overround": 0.064567,
      "marketEfficiencyScore": 0.746,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "3975276b-ae96-4803-99cf-ffe6ce7e98f7",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.5,
      "odds": 1.85,
      "impliedProbability": 0.540541,
      "marketImpliedProbability": 0.548048,
      "marketFairProbability": 0.522272,
      "consensusFairOdds": 1.914709,
      "overround": 0.049304,
      "marketEfficiencyScore": 0.7748,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "9612a75a-e247-4ffc-94fa-fa4b16ee2af6",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.5,
      "odds": 2,
      "impliedProbability": 0.5,
      "marketImpliedProbability": 0.501256,
      "marketFairProbability": 0.477728,
      "consensusFairOdds": 2.093243,
      "overround": 0.049304,
      "marketEfficiencyScore": 0.7748,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "e8b65d43-11a3-48ad-b54e-50d0b0ced226",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.5,
      "odds": 3,
      "impliedProbability": 0.333333,
      "marketImpliedProbability": 0.335017,
      "marketFairProbability": 0.314584,
      "consensusFairOdds": 3.178801,
      "overround": 0.064983,
      "marketEfficiencyScore": 0.7433,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "f20241cc-cf74-40b6-8cf0-88271272e5e7",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.5,
      "odds": 1.38,
      "impliedProbability": 0.724638,
      "marketImpliedProbability": 0.729966,
      "marketFairProbability": 0.685416,
      "consensusFairOdds": 1.458968,
      "overround": 0.064983,
      "marketEfficiencyScore": 0.7433,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "9b13f147-b91f-4abe-a8b4-9e9d5ad35a72",
      "market": "goals_over_under",
      "selection": "over",
      "line": 0.5,
      "odds": 1.04,
      "impliedProbability": 0.961538,
      "marketImpliedProbability": 0.961538,
      "marketFairProbability": 0.925926,
      "consensusFairOdds": 1.08,
      "overround": 0.038462,
      "marketEfficiencyScore": 0.6865,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "40a7b1ab-afbb-44d2-a845-98fa6bf29650",
      "market": "goals_over_under",
      "selection": "under",
      "line": 0.5,
      "odds": 13,
      "impliedProbability": 0.076923,
      "marketImpliedProbability": 0.076923,
      "marketFairProbability": 0.074074,
      "consensusFairOdds": 13.5,
      "overround": 0.038462,
      "marketEfficiencyScore": 0.6865,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "68522f92-db55-4881-af47-9157725bff0c",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.5,
      "odds": 6,
      "impliedProbability": 0.166667,
      "marketImpliedProbability": 0.173423,
      "marketFairProbability": 0.163853,
      "consensusFairOdds": 6.103014,
      "overround": 0.058448,
      "marketEfficiencyScore": 0.7518,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "fd622f5c-2eee-4209-87a7-d4149f08ed20",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.5,
      "odds": 1.14,
      "impliedProbability": 0.877193,
      "marketImpliedProbability": 0.885025,
      "marketFairProbability": 0.836147,
      "consensusFairOdds": 1.195963,
      "overround": 0.058448,
      "marketEfficiencyScore": 0.7518,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "fff09b22-680b-477e-bbd2-26ac1098d190",
      "market": "goals_over_under",
      "selection": "over",
      "line": 5.5,
      "odds": 13,
      "impliedProbability": 0.076923,
      "marketImpliedProbability": 0.076923,
      "marketFairProbability": 0.074074,
      "consensusFairOdds": 13.5,
      "overround": 0.038462,
      "marketEfficiencyScore": 0.6865,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "60038cdd-c663-41d6-be67-d1d501a0fbf3",
      "market": "goals_over_under",
      "selection": "under",
      "line": 5.5,
      "odds": 1.04,
      "impliedProbability": 0.961538,
      "marketImpliedProbability": 0.961538,
      "marketFairProbability": 0.925926,
      "consensusFairOdds": 1.08,
      "overround": 0.038462,
      "marketEfficiencyScore": 0.6865,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "f81da896-8c06-4fe3-bf83-1a853376d7ab",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.25,
      "odds": 1.62,
      "impliedProbability": 0.617284,
      "marketImpliedProbability": 0.617284,
      "marketFairProbability": 0.585678,
      "consensusFairOdds": 1.707424,
      "overround": 0.053965,
      "marketEfficiencyScore": 0.6542,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "d833cce6-720d-4b5c-bc77-ca3022654075",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.25,
      "odds": 2.29,
      "impliedProbability": 0.436681,
      "marketImpliedProbability": 0.436681,
      "marketFairProbability": 0.414322,
      "consensusFairOdds": 2.41358,
      "overround": 0.053965,
      "marketEfficiencyScore": 0.6542,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "1dbdd054-3710-42b3-b70f-be8e5460044f",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.75,
      "odds": 2.05,
      "impliedProbability": 0.487805,
      "marketImpliedProbability": 0.487805,
      "marketFairProbability": 0.463351,
      "consensusFairOdds": 2.158192,
      "overround": 0.052777,
      "marketEfficiencyScore": 0.6567,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "3f52d87e-fd15-4365-95ba-aee83675f608",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.75,
      "odds": 1.77,
      "impliedProbability": 0.564972,
      "marketImpliedProbability": 0.564972,
      "marketFairProbability": 0.536649,
      "consensusFairOdds": 1.863415,
      "overround": 0.052777,
      "marketEfficiencyScore": 0.6567,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "af693b8b-e6ec-41c9-8d4b-42aa511dcac1",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.25,
      "odds": 2.61,
      "impliedProbability": 0.383142,
      "marketImpliedProbability": 0.383142,
      "marketFairProbability": 0.363415,
      "consensusFairOdds": 2.751678,
      "overround": 0.054283,
      "marketEfficiencyScore": 0.6536,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "3fe384ee-b00a-40ba-a42e-4a77f70205a0",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.25,
      "odds": 1.49,
      "impliedProbability": 0.671141,
      "marketImpliedProbability": 0.671141,
      "marketFairProbability": 0.636585,
      "consensusFairOdds": 1.570881,
      "overround": 0.054283,
      "marketEfficiencyScore": 0.6536,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "4d23bca8-babf-44fb-9315-c6c44860d958",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3,
      "odds": 2.4,
      "impliedProbability": 0.416667,
      "marketImpliedProbability": 0.416667,
      "marketFairProbability": 0.395466,
      "consensusFairOdds": 2.528662,
      "overround": 0.053609,
      "marketEfficiencyScore": 0.655,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "77487221-9718-4b97-af78-8bec5a421254",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2,
      "odds": 1.4,
      "impliedProbability": 0.714286,
      "marketImpliedProbability": 0.714286,
      "marketFairProbability": 0.675926,
      "consensusFairOdds": 1.479452,
      "overround": 0.056751,
      "marketEfficiencyScore": 0.6484,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "b5c00c43-5644-40cb-a2a0-9eb2f38de0ac",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2,
      "odds": 2.92,
      "impliedProbability": 0.342466,
      "marketImpliedProbability": 0.342466,
      "marketFairProbability": 0.324074,
      "consensusFairOdds": 3.085714,
      "overround": 0.056751,
      "marketEfficiencyScore": 0.6484,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "857bcb92-883b-4742-b7ba-6c5ed3ae109a",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3,
      "odds": 1.57,
      "impliedProbability": 0.636943,
      "marketImpliedProbability": 0.636943,
      "marketFairProbability": 0.604534,
      "consensusFairOdds": 1.654167,
      "overround": 0.053609,
      "marketEfficiencyScore": 0.655,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "5758ab9c-3a4d-4ce1-95a3-5bf51582f149",
      "market": "goals_over_under",
      "selection": "over",
      "line": 6.5,
      "odds": 26,
      "impliedProbability": 0.038462,
      "marketImpliedProbability": 0.038462,
      "marketFairProbability": 0.037394,
      "consensusFairOdds": 26.742574,
      "overround": 0.028561,
      "marketEfficiencyScore": 0.7072,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "04d94655-d95f-49eb-8966-44b0914ae635",
      "market": "goals_over_under",
      "selection": "under",
      "line": 6.5,
      "odds": 1.01,
      "impliedProbability": 0.990099,
      "marketImpliedProbability": 0.990099,
      "marketFairProbability": 0.962606,
      "consensusFairOdds": 1.038846,
      "overround": 0.028561,
      "marketEfficiencyScore": 0.7072,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "0c4c485e-285b-4761-a90e-e7a012d23b33",
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
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "2f53a0d2-8629-405c-9938-41837b20cb04",
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
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "d13bebc4-92b0-4ff7-9551-67052993a7d4",
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
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "78199b6a-ca05-4872-91e3-77fd8ea44a10",
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
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "70df948c-27ec-47f7-8a4d-9bcca8007355",
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
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "c90b83df-922b-4ecc-9d86-f0eac69cc9de",
      "market": "corners_over_under",
      "selection": "over",
      "line": 10,
      "odds": 2,
      "impliedProbability": 0.5,
      "marketImpliedProbability": 0.5,
      "marketFairProbability": 0.473684,
      "consensusFairOdds": 2.111111,
      "overround": 0.055556,
      "marketEfficiencyScore": 0.6509,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    },
    {
      "oddsQuoteId": "6c14651c-8668-436a-ac0d-3ff266b5f424",
      "market": "corners_over_under",
      "selection": "under",
      "line": 10,
      "odds": 1.8,
      "impliedProbability": 0.555556,
      "marketImpliedProbability": 0.555556,
      "marketFairProbability": 0.526316,
      "consensusFairOdds": 1.9,
      "overround": 0.055556,
      "marketEfficiencyScore": 0.6509,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-11T13:21:11.330Z"
    }
  ],
  "providerContextWarnings": [
    "scoring prompt allowedQuotes trimmed from 48 to 37 representative quotes"
  ]
}
    """
    input_data = json.loads(input_json_string)
    output = score_predictions(input_data)
    print(json.dumps(output, indent=2))
