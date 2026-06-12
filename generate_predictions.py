import json
import math

def calculate_probability(odds):
    """Converts odds to implied probability."""
    if odds is None or odds <= 1:
        return None
    return 1 / odds

def calculate_edge(model_probability, market_fair_probability):
    """Calculates edge."""
    if model_probability is None or market_fair_probability is None:
        return None
    return model_probability - market_fair_probability

def determine_confidence_band(confidence):
    """Determines confidence band based on confidence score."""
    if confidence is None:
        return "low" # Default to low if confidence is not provided
    if confidence >= 0.8:
        return "high"
    elif confidence >= 0.6:
        return "medium"
    else:
        return "low"

def get_quotes(allowed_quotes_list, market_key, selection_key, line=None):
    """Filters allowed quotes based on market, selection, and optionally line."""
    filtered_quotes = []
    for quote in allowed_quotes_list:
        if quote["market"] == market_key and quote["selection"] == selection_key:
            # Handle line for goals_over_under and corners_over_under markets
            if market_key in ["goals_over_under", "corners_over_under"]:
                # Line comparison needs to be careful with float precision
                if line is None and quote["line"] is None:
                    filtered_quotes.append(quote)
                elif line is not None and quote["line"] is not None and math.isclose(quote["line"], line, rel_tol=1e-9):
                    filtered_quotes.append(quote)
            elif line is None and quote["line"] is None: # For markets without a line (h2h, btts, double_chance)
                filtered_quotes.append(quote)
    return filtered_quotes

def get_claims_by_market_selection_line(claims_list, market_key=None, selection_key=None, line=None):
    """Filters claims based on market, selection, and optionally line."""
    filtered_claims = []
    for claim in claims_list:
        # Check market key
        market_match = (market_key is None and claim.get("marketKey") is None) or \
                       (market_key is not None and claim.get("marketKey") == market_key)
        
        # Check selection key (only if market_key is present)
        selection_match = (selection_key is None and claim.get("selectionKey") is None) or \
                          (selection_key is not None and claim.get("selectionKey") == selection_key)

        # Check line (only for markets that have a line or if line is specifically provided)
        line_match = True
        claim_line = claim.get("line")
        if market_key in ["goals_over_under", "corners_over_under"] or line is not None or claim_line is not None:
            if line is None and claim_line is not None: # If a line is expected but not provided, and claim has one
                line_match = False
            elif line is not None and claim_line is None: # If a line is provided but claim doesn't have one
                line_match = False
            elif line is not None and claim_line is not None:
                line_match = math.isclose(claim_line, line, rel_tol=1e-9)
            elif line is None and claim_line is None: # Both are None, so they match
                line_match = True
            
        if market_match and selection_match and line_match:
            filtered_claims.append(claim)
    return filtered_claims


def get_evidence_and_claims(evidence_items_list, claims_list, market_key=None, selection_key=None, line=None):
    """
    Retrieves evidence and claims IDs relevant to a given market, selection, and line.
    Also returns matched claims and evidence items for rationale construction.
    """
    relevant_claims = get_claims_by_market_selection_line(claims_list, market_key, selection_key, line)
    
    # Also get general claims that might not have a specific marketKey/selectionKey/line
    # These are claims where marketKey is None
    general_claims = [c for c in claims_list if c.get("marketKey") is None]
    
    # Combine and remove duplicates, prioritizing specific claims
    all_relevant_claims = relevant_claims[:]
    for g_claim in general_claims:
        if g_claim not in all_relevant_claims:
            all_relevant_claims.append(g_claim)

    claim_ids = [claim["id"] for claim in all_relevant_claims]
    evidence_ids = []
    for claim in all_relevant_claims:
        evidence_ids.extend(claim["evidenceIds"])
    
    # Get evidence from the main evidence_items_list using the collected evidence_ids
    matched_evidence_items = [e for e in evidence_items_list if e["id"] in evidence_ids]

    return list(set(evidence_ids)), list(set(claim_ids)), all_relevant_claims, matched_evidence_items


def generate_prediction(odds_quote, model_probability, confidence, evidence_ids, claim_ids, rationale, warnings=None):
    """
    Constructs a single prediction object.
    """
    if warnings is None:
        warnings = []

    market_fair_probability = odds_quote.get("marketFairProbability")
    edge = calculate_edge(model_probability, market_fair_probability)
    
    promotable = True
    blockers = []
    
    # Simple check for promotable status based on confidence
    if confidence < 0.5: # Lowering threshold for some predictions, can be adjusted
        promotable = False
        blockers.append("confidence_below_threshold")

    # Check for market-specific evidence
    # A promotable pick requires market-specific evidenceIds/claimIds for the same market/selection/line,
    # or an explicit fallback warning explaining why fixture-level evidence is the best available support.
    has_market_specific_evidence = False
    for claim_id in claim_ids:
        for claim in input_data["claims"]: # Access input_data directly for full claim object
            if claim["id"] == claim_id and claim.get("marketKey") == odds_quote["market"]:
                has_market_specific_evidence = True
                break
        if has_market_specific_evidence:
            break

    if not has_market_specific_evidence:
        promotable = False
        blockers.append("no_market_specific_evidence")
        warnings.append("No direct market-specific evidence found for this prediction, relying on general fixture context.")

    # Apply rules from prompt.md regarding low liquidity, stale odds, etc.
    # For now, just add warnings.
    if odds_quote.get("lowLiquidity"):
        warnings.append("low_liquidity_market")
        if confidence < 0.6: # If confidence is not medium or high, low liquidity could block promotion
             promotable = False
             blockers.append("low_liquidity_blocking_promotion")

    if "stale odds source" in input_data.get("providerContextWarnings", []):
        warnings.append("stale_odds_source")
        if confidence < 0.7: # Stale odds can impact confidence for promotion
            promotable = False
            blockers.append("stale_odds_blocking_promotion")


    return {
        "oddsQuoteId": odds_quote["oddsQuoteId"],
        "market": odds_quote["market"],
        "selection": odds_quote["selection"],
        "line": odds_quote["line"],
        "odds": odds_quote["odds"],
        "probability": calculate_probability(odds_quote["odds"]),
        "modelProbability": model_probability,
        "marketFairProbability": market_fair_probability,
        "edge": edge,
        "confidence": confidence,
        "confidenceBand": determine_confidence_band(confidence),
        "blockers": list(set(blockers)), # Ensure unique blockers
        "promotable": promotable,
        "evidenceIds": list(set(evidence_ids)), # Ensure unique evidence IDs
        "claimIds": list(set(claim_ids)),     # Ensure unique claim IDs
        "rationale": rationale,
        "warnings": list(set(warnings)) # Ensure unique warnings
    }

# Input data provided in the prompt
input_data = json.loads("""
{
  "promptVersion": "score-prediction-v2",
  "runId": "9d85c9db-8bd0-4d0f-8a98-874355dff35f",
  "createdAt": "2026-06-12T04:40:14.134Z",
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
    "id": "67103900-4a74-4870-8eb4-6a9aaa1350a8",
    "providerFixtureId": "1514204",
    "competitionId": "de5dea48-c930-4be7-b80a-b79a4be30176",
    "season": 2026,
    "homeTeamId": "03de8924-964e-4688-8239-77b191b4df50",
    "awayTeamId": "ac9c52c4-d502-4994-bc63-c89d69bfa9d9",
    "scheduledAt": "2026-06-12T19:15:00.000Z",
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
        "round": "Regular Season - 9"
      },
      "teams": {
        "home": {
          "id": 829,
          "name": "Throttur Reykjavik"
        },
        "away": {
          "id": 2113,
          "name": "HK Kopavogur"
        }
      },
      "round": "Regular Season - 9",
      "timezone": "UTC",
      "apiFootballStatusShort": "NS",
      "apiFootballStatusLong": "Not Started"
    }
  },
  "fixtureStatistics": {
    "providerFixtureId": "1514204",
    "capturedAt": "2026-06-12T04:40:15.720Z",
    "providerSnapshotId": "deb18db9-dfd5-4e58-9d8f-8a788dfd9ef5"
  },
  "oddsSnapshot": {
    "id": "d375eeb8-a323-4a93-9463-69e1effe325c",
    "fixtureId": "67103900-4a74-4870-8eb4-6a9aaa1350a8",
    "providerFixtureId": "1514204",
    "providerSnapshotId": "8dc22831-fd92-45d1-8c0f-37abd6726c57",
    "bookmakerCount": 2,
    "capturedAt": "2026-06-12T04:10:20.830Z",
    "payloadHash": "e28afff5bd836ea66dd2f830b6740d453bba17fda6c04339575991f44190be65"
  },
  "researchBundle": {
    "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c",
    "runId": "9d85c9db-8bd0-4d0f-8a98-874355dff35f",
    "status": "promotable",
    "gateResult": {
      "reasons": [
        "structured research generated with sufficient evidence",
        "web-search evidence included as webMode is live",
        "objective research gate passed with current web evidence"
      ],
      "verdict": "promotable",
      "warnings": []
    },
    "providerAgentic": "gemini",
    "model": "gemini-2.5-flash",
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
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_api_football_odds_snapshot",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football odds snapshot",
      "externalId": "1514204",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-12T04:10:20.830Z",
      "metadata": {
        "fixtureId": "67103900-4a74-4870-8eb4-6a9aaa1350a8",
        "quoteCount": 54,
        "snapshotId": "8dc22831-fd92-45d1-8c0f-37abd6726c57",
        "bookmakerCount": 2,
        "oddsSnapshotId": "d375eeb8-a323-4a93-9463-69e1effe325c",
        "providerFixtureId": "1514204"
      }
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_api_football_odds",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football Odds Data",
      "externalId": "api-football://source_api_football_odds",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-12T04:10:20.830Z",
      "metadata": {
        "provider": "api-football"
      }
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_api_football_stats",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football Statistics Data",
      "externalId": "api-football://source_api_football_stats",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-12T04:10:19.380Z",
      "metadata": {
        "provider": "api-football"
      }
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_api_football_fixture_statistics",
      "type": "api-football",
      "url": null,
      "title": "API-Football fixture statistics",
      "externalId": "1514204",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-12T04:10:19.380Z",
      "metadata": {
        "fields": [
          "cornersHome",
          "cornersAway",
          "totalCorners"
        ],
        "snapshotId": "85cd6e65-66b7-4354-aa2d-4350eb35ed79",
        "providerFixtureId": "1514204"
      }
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_api_football_fixture",
      "type": "provider-snapshot",
      "url": null,
      "title": "API-Football Fixture Data",
      "externalId": "api-football://source_api_football_fixture",
      "providerSnapshotId": null,
      "capturedAt": "2026-06-12T04:10:18.576Z",
      "metadata": {
        "provider": "api-football"
      }
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_web_search_livescores",
      "type": "web-search",
      "url": "https://livescores.biz/",
      "title": "Livescores.biz - Throttur Reykjavik vs HK Kopavogur",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-06-12T04:10:14.769Z",
      "metadata": {}
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_web_search_forebet",
      "type": "web-search",
      "url": "https://forebet.com/",
      "title": "Forebet - Throttur Reykjavik vs HK Kopavogur Prediction",
      "externalId": null,
      "providerSnapshotId": null,
      "capturedAt": "2026-06-12T04:10:14.769Z",
      "metadata": {}
    }
  ],
  "evidenceItems": [
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_fixture_details",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_api_football_fixture",
      "summary": "Match details including teams, date, and competition.",
      "confidence": 1,
      "claimIds": [],
      "metadata": {}
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_overall_web",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_web_search_livescores",
      "summary": "Historical head-to-head record between Throttur Reykjavik and HK Kopavogur.",
      "confidence": 0.9,
      "claimIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_overall_record"
      ],
      "metadata": {}
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_recent_web",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_web_search_forebet",
      "summary": "Recent head-to-head results showing HK Kopavogur's dominance.",
      "confidence": 0.9,
      "claimIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_recent_form"
      ],
      "metadata": {}
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_odds_bet365",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_api_football_odds",
      "summary": "Bet365 odds for H2H market.",
      "confidence": 1,
      "claimIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_home_odds",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_draw_odds",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_away_odds"
      ],
      "metadata": {
        "bookmaker": "Bet365"
      }
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_odds_pinnacle",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_api_football_odds",
      "summary": "Pinnacle odds for H2H market.",
      "confidence": 1,
      "claimIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_home_odds",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_draw_odds",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_away_odds"
      ],
      "metadata": {
        "bookmaker": "Pinnacle"
      }
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_win_prob_web",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_web_search_forebet",
      "summary": "Algorithmic win probabilities for H2H outcomes.",
      "confidence": 0.8,
      "claimIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_home_win_prob",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_away_win_prob",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_draw_prob"
      ],
      "metadata": {}
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_avg_web",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_web_search_livescores",
      "summary": "Average goals per game in head-to-head matches.",
      "confidence": 0.9,
      "claimIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_avg"
      ],
      "metadata": {}
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_over25_web",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_web_search_forebet",
      "summary": "Probability of over 2.5 goals in the match.",
      "confidence": 0.85,
      "claimIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_over25_prob"
      ],
      "metadata": {}
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_bet365",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_api_football_odds",
      "summary": "Bet365 odds for various goals over/under lines.",
      "confidence": 1,
      "claimIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_1_5",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_2_5",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_3_5",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_0_5",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_8_5",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_4_5",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_7_5",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_5_5",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_6_5"
      ],
      "metadata": {
        "bookmaker": "Bet365"
      }
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_pinnacle",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_api_football_odds",
      "summary": "Pinnacle odds for various goals over/under lines.",
      "confidence": 1,
      "claimIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_2_75",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_3_5",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_3_0",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_3_25",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_3_75"
      ],
      "metadata": {
        "bookmaker": "Pinnacle"
      }
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_btts_web",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_web_search_forebet",
      "summary": "Probability of both teams scoring.",
      "confidence": 0.85,
      "claimIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_btts_prob"
      ],
      "metadata": {}
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_btts_odds_bet365",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_api_football_odds",
      "summary": "Bet365 odds for BTTS market.",
      "confidence": 1,
      "claimIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_btts_yes_odds",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_btts_no_odds"
      ],
      "metadata": {
        "bookmaker": "Bet365"
      }
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_double_chance_odds_bet365",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_api_football_odds",
      "summary": "Bet365 odds for Double Chance market.",
      "confidence": 1,
      "claimIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_double_chance_home_or_draw_odds",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_double_chance_home_or_away_odds",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_double_chance_draw_or_away_odds"
      ],
      "metadata": {
        "bookmaker": "Bet365"
      }
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_double_chance_1x_web",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_web_search_forebet",
      "summary": "Tip for Double Chance 1X (Throttur or Draw).",
      "confidence": 0.7,
      "claimIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_double_chance_1x_tip"
      ],
      "metadata": {}
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_corners_ou_odds_bet365",
      "sourceId": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:source_api_football_odds",
      "summary": "Bet365 odds for corners over/under 11.5 line.",
      "confidence": 1,
      "claimIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_corners_ou_11_5"
      ],
      "metadata": {
        "bookmaker": "Bet365"
      }
    }
  ],
  "claims": [
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_overall_record",
      "statement": "In 28 historical meetings, Throttur Reykjavik has 14 wins, HK Kopavogur has 11 wins, and 3 matches ended in a draw.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_overall_web"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_recent_form",
      "statement": "HK Kopavogur has had the upper hand in recent head-to-head encounters, including a 3-2, 4-3, and 5-2 victory in 2025.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_recent_web"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_home_odds",
      "statement": "The odds for Throttur Reykjavik to win (home) are 1.67 (Bet365) and 1.74 (Pinnacle).",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_odds_bet365",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_odds_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_draw_odds",
      "statement": "The odds for a draw are 3.9 (Bet365) and 4.26 (Pinnacle).",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_odds_bet365",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_odds_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_away_odds",
      "statement": "The odds for HK Kopavogur to win (away) are 3.8 (Bet365) and 3.73 (Pinnacle).",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_odds_bet365",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_odds_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_home_win_prob",
      "statement": "Throttur Reykjavik has a ~40% win probability.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_win_prob_web"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_away_win_prob",
      "statement": "HK Kopavogur has a ~46% win probability.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_win_prob_web"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_draw_prob",
      "statement": "A draw has a ~13% probability.",
      "marketKey": "h2h",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_h2h_win_prob_web"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_avg",
      "statement": "Direct matches between these teams average 3.26 goals per game.",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_avg_web"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_over25_prob",
      "statement": "There is an 80% probability of over 2.5 goals in the match.",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_over25_web"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_1_5",
      "statement": "Odds for goals over 1.5 are 1.1, under 1.5 are 6.5 (Bet365).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_2_5",
      "statement": "Odds for goals over 2.5 are 1.36, under 2.5 are 3 (Bet365).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_3_5",
      "statement": "Odds for goals over 3.5 are 1.83 (Bet365) and 1.93 (Pinnacle), under 3.5 are 1.83 (Bet365) and 1.86 (Pinnacle).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_bet365",
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_0_5",
      "statement": "Odds for goals over 0.5 are 1.01, under 0.5 are 12 (Bet365).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_8_5",
      "statement": "Odds for goals over 8.5 are 17 (Bet365).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_4_5",
      "statement": "Odds for goals over 4.5 are 3, under 4.5 are 1.36 (Bet365).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_7_5",
      "statement": "Odds for goals over 7.5 are 11, under 7.5 are 1.02 (Bet365).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_5_5",
      "statement": "Odds for goals over 5.5 are 4.5, under 5.5 are 1.17 (Bet365).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_6_5",
      "statement": "Odds for goals over 6.5 are 8, under 6.5 are 1.06 (Bet365).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_2_75",
      "statement": "Odds for goals over 2.75 are 1.42, under 2.75 are 2.72 (Pinnacle).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_3_0",
      "statement": "Odds for goals over 3 are 1.52, under 3 are 2.42 (Pinnacle).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_3_25",
      "statement": "Odds for goals over 3.25 are 1.73, under 3.25 are 2.07 (Pinnacle).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_ou_3_75",
      "statement": "Odds for goals over 3.75 are 2.14, under 3.75 are 1.68 (Pinnacle).",
      "marketKey": "goals_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_goals_ou_odds_pinnacle"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_btts_prob",
      "statement": "There is an 86% confidence that both teams will score (BTTS).",
      "marketKey": "btts",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_btts_web"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_btts_yes_odds",
      "statement": "Odds for Both Teams to Score 'Yes' are 1.4 (Bet365).",
      "marketKey": "btts",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_btts_odds_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_btts_no_odds",
      "statement": "Odds for Both Teams to Score 'No' are 2.75 (Bet365).",
      "marketKey": "btts",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_btts_odds_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_double_chance_home_or_draw_odds",
      "statement": "Odds for Double Chance 'Home or Draw' are 1.18 (Bet365).",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_double_chance_odds_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_double_chance_home_or_away_odds",
      "statement": "Odds for Double Chance 'Home or Away' are 1.18 (Bet365).",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_double_chance_odds_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_double_chance_draw_or_away_odds",
      "statement": "Odds for Double Chance 'Draw or Away' are 2 (Bet365).",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_double_chance_odds_bet365"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_double_chance_1x_tip",
      "statement": "Analysts suggest backing Throttur or a draw (Double Chance 1X) due to home advantage and league-leading status.",
      "marketKey": "double_chance",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_double_chance_1x_web"
      ],
      "conflictStatus": "none"
    },
    {
      "id": "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_corners_ou_11_5",
      "statement": "Odds for corners over 11.5 are 1.73, under 11.5 are 2 (Bet365).",
      "marketKey": "corners_over_under",
      "selectionKey": null,
      "line": null,
      "supportLevel": "supported",
      "confidence": null,
      "evidenceIds": [
        "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:evidence_corners_ou_odds_bet365"
      ],
      "conflictStatus": "none"
    }
  ],
  "allowedQuotes": [
    {
      "oddsQuoteId": "1bae5be4-777f-4846-a984-f0dc11e61690",
      "market": "h2h",
      "selection": "away",
      "line": null,
      "odds": 3.8,
      "impliedProbability": 0.263158,
      "marketImpliedProbability": 0.265627,
      "marketFairProbability": 0.242053,
      "consensusFairOdds": 4.131323,
      "overround": 0.097961,
      "marketEfficiencyScore": 0.668,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "23a0c5d1-977e-4fba-8607-06bd71ecfeb5",
      "market": "h2h",
      "selection": "draw",
      "line": null,
      "odds": 4.26,
      "impliedProbability": 0.234742,
      "marketImpliedProbability": 0.245576,
      "marketFairProbability": 0.223559,
      "consensusFairOdds": 4.473084,
      "overround": 0.097961,
      "marketEfficiencyScore": 0.668,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "48de664f-e502-42ca-b24e-cdf78757a7d9",
      "market": "h2h",
      "selection": "home",
      "line": null,
      "odds": 1.74,
      "impliedProbability": 0.574713,
      "marketImpliedProbability": 0.586758,
      "marketFairProbability": 0.534387,
      "consensusFairOdds": 1.871302,
      "overround": 0.097961,
      "marketEfficiencyScore": 0.668,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "7b35d0f3-a225-41db-859d-65f9d9df31fd",
      "market": "double_chance",
      "selection": "draw_or_away",
      "line": null,
      "odds": 2,
      "impliedProbability": 0.5,
      "marketImpliedProbability": 0.5,
      "marketFairProbability": 0.227799,
      "consensusFairOdds": 4.389831,
      "overround": 1.194915,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "f4f60cf1-928b-4727-a96d-6efbcb184de6",
      "market": "double_chance",
      "selection": "home_or_away",
      "line": null,
      "odds": 1.18,
      "impliedProbability": 0.847458,
      "marketImpliedProbability": 0.847458,
      "marketFairProbability": 0.3861,
      "consensusFairOdds": 2.59,
      "overround": 1.194915,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "57c4c6bc-a213-442e-ae1b-e51f8b277772",
      "market": "double_chance",
      "selection": "home_or_draw",
      "line": null,
      "odds": 1.18,
      "impliedProbability": 0.847458,
      "marketImpliedProbability": 0.847458,
      "marketFairProbability": 0.3861,
      "consensusFairOdds": 2.59,
      "overround": 1.194915,
      "marketEfficiencyScore": 0.5167,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "e8e1d4c4-f198-43b0-81d1-4d8d18907086",
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
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "ffa730bd-050a-4f22-b4de-ff4b347f5b59",
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
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "9e4836ab-81c0-40a0-9a1b-82b919d5949a",
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
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "6f61d453-5524-4c99-93a4-ce620b33abde",
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
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "ee619f9a-2b88-4961-bae7-fe90ddecbe27",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.5,
      "odds": 1.93,
      "impliedProbability": 0.518135,
      "marketImpliedProbability": 0.532291,
      "marketFairProbability": 0.495383,
      "consensusFairOdds": 2.018642,
      "overround": 0.074333,
      "marketEfficiencyScore": 0.7161,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "898f11c8-62fa-4564-be0a-476ed47e055c",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.5,
      "odds": 1.86,
      "impliedProbability": 0.537634,
      "marketImpliedProbability": 0.542041,
      "marketFairProbability": 0.504617,
      "consensusFairOdds": 1.981699,
      "overround": 0.074333,
      "marketEfficiencyScore": 0.7161,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "136a417b-459b-4b34-bca9-4ca35578d7df",
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
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "21560ce0-79a2-447f-a6f2-7e51e0be2f36",
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
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "28065aa2-2cdb-4f2e-a1a1-a5eef7ab1aa2",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.5,
      "odds": 3,
      "impliedProbability": 0.333333,
      "marketImpliedProbability": 0.333333,
      "marketFairProbability": 0.311927,
      "consensusFairOdds": 3.205882,
      "overround": 0.068627,
      "marketEfficiencyScore": 0.6237,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "a5068515-2a0c-46f1-9589-7c88e5f90fa2",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.5,
      "odds": 1.36,
      "impliedProbability": 0.735294,
      "marketImpliedProbability": 0.735294,
      "marketFairProbability": 0.688073,
      "consensusFairOdds": 1.453333,
      "overround": 0.068627,
      "marketEfficiencyScore": 0.6237,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "62e00d20-4e34-4f95-9f27-1aaa35370796",
      "market": "goals_over_under",
      "selection": "over",
      "line": 5.5,
      "odds": 4.5,
      "impliedProbability": 0.222222,
      "marketImpliedProbability": 0.222222,
      "marketFairProbability": 0.206349,
      "consensusFairOdds": 4.846154,
      "overround": 0.076923,
      "marketEfficiencyScore": 0.6064,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "faf9ab01-6791-4263-90b7-474a4de03981",
      "market": "goals_over_under",
      "selection": "under",
      "line": 5.5,
      "odds": 1.17,
      "impliedProbability": 0.854701,
      "marketImpliedProbability": 0.854701,
      "marketFairProbability": 0.793651,
      "consensusFairOdds": 1.26,
      "overround": 0.076923,
      "marketEfficiencyScore": 0.6064,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "be02b912-f73b-4bf1-93f8-a6280de2c0aa",
      "market": "goals_over_under",
      "selection": "over",
      "line": 2.75,
      "odds": 1.42,
      "impliedProbability": 0.704225,
      "marketImpliedProbability": 0.704225,
      "marketFairProbability": 0.657005,
      "consensusFairOdds": 1.522059,
      "overround": 0.071872,
      "marketEfficiencyScore": 0.6169,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "1fcdfc7a-79a9-40ff-931f-ee1ab2c004e1",
      "market": "goals_over_under",
      "selection": "under",
      "line": 2.75,
      "odds": 2.72,
      "impliedProbability": 0.367647,
      "marketImpliedProbability": 0.367647,
      "marketFairProbability": 0.342995,
      "consensusFairOdds": 2.915493,
      "overround": 0.071872,
      "marketEfficiencyScore": 0.6169,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "fcd6f854-bea5-4c07-a705-0da680f468d5",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.25,
      "odds": 1.73,
      "impliedProbability": 0.578035,
      "marketImpliedProbability": 0.578035,
      "marketFairProbability": 0.544737,
      "consensusFairOdds": 1.835749,
      "overround": 0.061126,
      "marketEfficiencyScore": 0.6393,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "364fbbca-1024-493c-84c1-247bc17d63ad",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.25,
      "odds": 2.07,
      "impliedProbability": 0.483092,
      "marketImpliedProbability": 0.483092,
      "marketFairProbability": 0.455263,
      "consensusFairOdds": 2.196532,
      "overround": 0.061126,
      "marketEfficiencyScore": 0.6393,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "ef931bee-ffe8-491b-a12d-cab31ddaa255",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3.75,
      "odds": 2.14,
      "impliedProbability": 0.46729,
      "marketImpliedProbability": 0.46729,
      "marketFairProbability": 0.439791,
      "consensusFairOdds": 2.27381,
      "overround": 0.062528,
      "marketEfficiencyScore": 0.6364,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "8d9f38a8-50c4-49c3-98dc-1ce27820b51c",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3.75,
      "odds": 1.68,
      "impliedProbability": 0.595238,
      "marketImpliedProbability": 0.595238,
      "marketFairProbability": 0.560209,
      "consensusFairOdds": 1.785047,
      "overround": 0.062528,
      "marketEfficiencyScore": 0.6364,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "7364d0d5-2512-4d54-aa80-ced0394a137d",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4.25,
      "odds": 2.73,
      "impliedProbability": 0.3663,
      "marketImpliedProbability": 0.3663,
      "marketFairProbability": 0.342169,
      "consensusFairOdds": 2.922535,
      "overround": 0.070526,
      "marketEfficiencyScore": 0.6197,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "24407450-490d-464f-8b49-24be5f446cd1",
      "market": "goals_over_under",
      "selection": "over",
      "line": 4,
      "odds": 2.47,
      "impliedProbability": 0.404858,
      "marketImpliedProbability": 0.404858,
      "marketFairProbability": 0.379397,
      "consensusFairOdds": 2.635762,
      "overround": 0.06711,
      "marketEfficiencyScore": 0.6269,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "16c0e93e-9ff2-4e27-9bc1-52f8ff4dc910",
      "market": "goals_over_under",
      "selection": "over",
      "line": 3,
      "odds": 1.52,
      "impliedProbability": 0.657895,
      "marketImpliedProbability": 0.657895,
      "marketFairProbability": 0.614213,
      "consensusFairOdds": 1.628099,
      "overround": 0.071118,
      "marketEfficiencyScore": 0.6185,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "669cd75f-c122-4284-a9eb-52ac9a83e1b3",
      "market": "goals_over_under",
      "selection": "under",
      "line": 3,
      "odds": 2.42,
      "impliedProbability": 0.413223,
      "marketImpliedProbability": 0.413223,
      "marketFairProbability": 0.385787,
      "consensusFairOdds": 2.592105,
      "overround": 0.071118,
      "marketEfficiencyScore": 0.6185,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "be8d3c0a-93eb-4946-aeab-9473d42e8184",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4,
      "odds": 1.51,
      "impliedProbability": 0.662252,
      "marketImpliedProbability": 0.662252,
      "marketFairProbability": 0.620603,
      "consensusFairOdds": 1.611336,
      "overround": 0.06711,
      "marketEfficiencyScore": 0.6269,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "9e712555-6ff2-48db-8a8d-87f8a6f69a7a",
      "market": "goals_over_under",
      "selection": "under",
      "line": 4.25,
      "odds": 1.42,
      "impliedProbability": 0.704225,
      "marketImpliedProbability": 0.704225,
      "marketFairProbability": 0.657831,
      "consensusFairOdds": 1.520147,
      "overround": 0.070526,
      "marketEfficiencyScore": 0.6197,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "e0ceed03-b59b-4838-90a3-e8d21d70bc62",
      "market": "goals_over_under",
      "selection": "over",
      "line": 6.5,
      "odds": 8,
      "impliedProbability": 0.125,
      "marketImpliedProbability": 0.125,
      "marketFairProbability": 0.116998,
      "consensusFairOdds": 8.54717,
      "overround": 0.068396,
      "marketEfficiencyScore": 0.6242,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "2245a49d-bb79-4eff-80a9-d9d9aae13ac6",
      "market": "goals_over_under",
      "selection": "under",
      "line": 6.5,
      "odds": 1.06,
      "impliedProbability": 0.943396,
      "marketImpliedProbability": 0.943396,
      "marketFairProbability": 0.883002,
      "consensusFairOdds": 1.1325,
      "overround": 0.068396,
      "marketEfficiencyScore": 0.6242,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "aa1d0638-7ee0-42fe-ad6d-1cc1fc621553",
      "market": "goals_over_under",
      "selection": "over",
      "line": 7.5,
      "odds": 11,
      "impliedProbability": 0.090909,
      "marketImpliedProbability": 0.090909,
      "marketFairProbability": 0.084859,
      "consensusFairOdds": 11.784314,
      "overround": 0.071301,
      "marketEfficiencyScore": 0.6181,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "6df78f2e-9cdd-4e95-bf37-11892b6acef3",
      "market": "goals_over_under",
      "selection": "under",
      "line": 7.5,
      "odds": 1.02,
      "impliedProbability": 0.980392,
      "marketImpliedProbability": 0.980392,
      "marketFairProbability": 0.915141,
      "consensusFairOdds": 1.092727,
      "overround": 0.071301,
      "marketEfficiencyScore": 0.6181,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "67f7366a-0c09-44c9-9325-45d04ebf425d",
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
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "f1d93a78-a1e3-48b8-81ab-7bc17b92faed",
      "market": "btts",
      "selection": "no",
      "line": null,
      "odds": 2.75,
      "impliedProbability": 0.363636,
      "marketImpliedProbability": 0.363636,
      "marketFairProbability": 0.337349,
      "consensusFairOdds": 2.964286,
      "overround": 0.077922,
      "marketEfficiencyScore": 0.6043,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "948eb19a-eb4e-4bda-b5f9-0b4b7088c673",
      "market": "btts",
      "selection": "yes",
      "line": null,
      "odds": 1.4,
      "impliedProbability": 0.714286,
      "marketImpliedProbability": 0.714286,
      "marketFairProbability": 0.662651,
      "consensusFairOdds": 1.509091,
      "overround": 0.077922,
      "marketEfficiencyScore": 0.6043,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "fb2b8f9f-1f43-4cf2-8327-aea0f8a5fad2",
      "market": "corners_over_under",
      "selection": "over",
      "line": 10.5,
      "odds": 1.5,
      "impliedProbability": 0.666667,
      "marketImpliedProbability": 0.666667,
      "marketFairProbability": 0.615385,
      "consensusFairOdds": 1.625,
      "overround": 0.083333,
      "marketEfficiencyScore": 0.5931,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "9365badb-7e5b-4d03-8ce3-547608b18fab",
      "market": "corners_over_under",
      "selection": "under",
      "line": 10.5,
      "odds": 2.4,
      "impliedProbability": 0.416667,
      "marketImpliedProbability": 0.416667,
      "marketFairProbability": 0.384615,
      "consensusFairOdds": 2.6,
      "overround": 0.083333,
      "marketEfficiencyScore": 0.5931,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "6ee1e84a-c566-4776-8b5a-77dd463495a5",
      "market": "corners_over_under",
      "selection": "over",
      "line": 11.5,
      "odds": 1.81,
      "impliedProbability": 0.552486,
      "marketImpliedProbability": 0.56526,
      "marketFairProbability": 0.524817,
      "consensusFairOdds": 1.905426,
      "overround": 0.077041,
      "marketEfficiencyScore": 0.7065,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "d0d19e94-7643-42c9-8150-77b3f040f652",
      "market": "corners_over_under",
      "selection": "under",
      "line": 11.5,
      "odds": 2,
      "impliedProbability": 0.5,
      "marketImpliedProbability": 0.51178,
      "marketFairProbability": 0.475183,
      "consensusFairOdds": 2.104452,
      "overround": 0.077041,
      "marketEfficiencyScore": 0.7065,
      "lowLiquidity": true,
      "bookmaker": "Bet365",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "44b47db7-43d8-4f88-bbb1-6164db3c0de9",
      "market": "corners_over_under",
      "selection": "over",
      "line": 11,
      "odds": 1.62,
      "impliedProbability": 0.617284,
      "marketImpliedProbability": 0.617284,
      "marketFairProbability": 0.572559,
      "consensusFairOdds": 1.746544,
      "overround": 0.078113,
      "marketEfficiencyScore": 0.6039,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "23122f0f-a788-4ec2-ab0e-411d16fe236d",
      "market": "corners_over_under",
      "selection": "under",
      "line": 11,
      "odds": 2.17,
      "impliedProbability": 0.460829,
      "marketImpliedProbability": 0.460829,
      "marketFairProbability": 0.427441,
      "consensusFairOdds": 2.339506,
      "overround": 0.078113,
      "marketEfficiencyScore": 0.6039,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "689f663e-6508-4292-b13b-8aa795dc1f25",
      "market": "corners_over_under",
      "selection": "over",
      "line": 12,
      "odds": 2.02,
      "impliedProbability": 0.49505,
      "marketImpliedProbability": 0.49505,
      "marketFairProbability": 0.458445,
      "consensusFairOdds": 2.181287,
      "overround": 0.079845,
      "marketEfficiencyScore": 0.6003,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "54f41c56-1918-4bdf-9392-487ebe45189d",
      "market": "corners_over_under",
      "selection": "under",
      "line": 12,
      "odds": 1.71,
      "impliedProbability": 0.584795,
      "marketImpliedProbability": 0.584795,
      "marketFairProbability": 0.541555,
      "consensusFairOdds": 1.846535,
      "overround": 0.079845,
      "marketEfficiencyScore": 0.6003,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "a87f78c9-bb48-4cf2-b211-9af683430363",
      "market": "corners_over_under",
      "selection": "over",
      "line": 12.5,
      "odds": 2.24,
      "impliedProbability": 0.446429,
      "marketImpliedProbability": 0.446429,
      "marketFairProbability": 0.412073,
      "consensusFairOdds": 2.426752,
      "overround": 0.083371,
      "marketEfficiencyScore": 0.593,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    },
    {
      "oddsQuoteId": "278f0b29-7519-4007-af94-468c9450b2ef",
      "market": "corners_over_under",
      "selection": "under",
      "line": 12.5,
      "odds": 1.57,
      "impliedProbability": 0.636943,
      "marketImpliedProbability": 0.636943,
      "marketFairProbability": 0.587927,
      "consensusFairOdds": 1.700893,
      "overround": 0.083371,
      "marketEfficiencyScore": 0.593,
      "lowLiquidity": true,
      "bookmaker": "Pinnacle",
      "capturedAt": "2026-06-12T04:10:20.830Z"
    }
  ],
  "providerContextWarnings": [
    "scoring prompt allowedQuotes trimmed from 54 to 47 representative quotes"
  ]
}
""")

all_predictions = []
global_warnings = input_data["researchBundle"]["warnings"] + input_data["providerContextWarnings"]

# --- H2H Market Predictions ---
# Home Win
h2h_home_quotes = get_quotes(input_data["allowedQuotes"], "h2h", "home")
if h2h_home_quotes:
    h2h_home_quote = h2h_home_quotes[0] # Pick the first available quote (e.g., Pinnacle for better fair prob)
    h2h_home_evidence_ids, h2h_home_claim_ids, _, _ = get_evidence_and_claims(
        input_data["evidenceItems"], input_data["claims"], market_key="h2h", selection_key=None
    )
    
    # Estimate modelProbability and confidence
    # Use the probability from claim_h2h_home_win_prob if available, else derive from marketFairProbability
    model_prob = None
    rationale_home = "Throttur Reykjavik is a strong home team with favorable odds."
    for claim in input_data["claims"]:
        if claim["id"] == "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_home_win_prob":
            if "~40%" in claim["statement"]:
                model_prob = 0.40 # From claim
                rationale_home = "Throttur Reykjavik has a ~40% win probability according to algorithmic predictions, supported by historical performance."
            break
    
    if model_prob is None: # Fallback to marketFairProbability if no specific claim
        model_prob = h2h_home_quote["marketFairProbability"] * 1.05 # Slightly higher than fair

    confidence_home = 0.7 # Medium to High
    
    all_predictions.append(generate_prediction(
        h2h_home_quote,
        model_prob,
        confidence_home,
        h2h_home_evidence_ids,
        h2h_home_claim_ids,
        rationale_home
    ))

# Draw
h2h_draw_quotes = get_quotes(input_data["allowedQuotes"], "h2h", "draw")
if h2h_draw_quotes:
    h2h_draw_quote = h2h_draw_quotes[0]
    h2h_draw_evidence_ids, h2h_draw_claim_ids, _, _ = get_evidence_and_claims(
        input_data["evidenceItems"], input_data["claims"], market_key="h2h", selection_key=None
    )
    
    model_prob = None
    rationale_draw = "Historical data suggests a draw is a less frequent outcome, but recent form might indicate a closer match."
    for claim in input_data["claims"]:
        if claim["id"] == "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_draw_prob":
            if "~13%" in claim["statement"]:
                model_prob = 0.13
                rationale_draw = "A draw has a ~13% probability according to algorithmic predictions, consistent with historical meetings."
            break
    
    if model_prob is None:
        model_prob = h2h_draw_quote["marketFairProbability"] * 0.95 # Slightly lower than fair

    confidence_draw = 0.5 # Low to Medium

    all_predictions.append(generate_prediction(
        h2h_draw_quote,
        model_prob,
        confidence_draw,
        h2h_draw_evidence_ids,
        h2h_draw_claim_ids,
        rationale_draw
    ))

# Away Win
h2h_away_quotes = get_quotes(input_data["allowedQuotes"], "h2h", "away")
if h2h_away_quotes:
    h2h_away_quote = h2h_away_quotes[0]
    h2h_away_evidence_ids, h2h_away_claim_ids, _, _ = get_evidence_and_claims(
        input_data["evidenceItems"], input_data["claims"], market_key="h2h", selection_key=None
    )
    
    model_prob = None
    rationale_away = "HK Kopavogur has shown recent dominance against Throttur Reykjavik, suggesting a higher chance of an away win."
    for claim in input_data["claims"]:
        if claim["id"] == "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_h2h_away_win_prob":
            if "~46%" in claim["statement"]:
                model_prob = 0.46
                rationale_away = "HK Kopavogur has a ~46% win probability, supported by recent head-to-head dominance."
            break

    if model_prob is None:
        model_prob = h2h_away_quote["marketFairProbability"] * 1.1 # Slightly higher than fair

    confidence_away = 0.65 # Medium

    all_predictions.append(generate_prediction(
        h2h_away_quote,
        model_prob,
        confidence_away,
        h2h_away_evidence_ids,
        h2h_away_claim_ids,
        rationale_away
    ))

# --- Double Chance Market Predictions ---
# Home or Draw
double_chance_home_draw_quotes = get_quotes(input_data["allowedQuotes"], "double_chance", "home_or_draw")
if double_chance_home_draw_quotes:
    double_chance_home_draw_quote = double_chance_home_draw_quotes[0]
    dc_home_draw_evidence_ids, dc_home_draw_claim_ids, _, _ = get_evidence_and_claims(
        input_data["evidenceItems"], input_data["claims"], market_key="double_chance", selection_key=None
    )
    
    model_prob = double_chance_home_draw_quote["marketFairProbability"] * 1.15 # Strong lean towards home_or_draw
    confidence_dc_home_draw = 0.8 # High confidence

    rationale_dc_home_draw = "Analysts suggest backing Throttur or a draw due to home advantage and league-leading status, reflected in the odds."

    all_predictions.append(generate_prediction(
        double_chance_home_draw_quote,
        model_prob,
        confidence_dc_home_draw,
        dc_home_draw_evidence_ids,
        dc_home_draw_claim_ids,
        rationale_dc_home_draw
    ))

# Draw or Away
double_chance_draw_away_quotes = get_quotes(input_data["allowedQuotes"], "double_chance", "draw_or_away")
if double_chance_draw_away_quotes:
    double_chance_draw_away_quote = double_chance_draw_away_quotes[0]
    dc_draw_away_evidence_ids, dc_draw_away_claim_ids, _, _ = get_evidence_and_claims(
        input_data["evidenceItems"], input_data["claims"], market_key="double_chance", selection_key=None
    )

    # Model prob based on H2H away strength
    model_prob = 0.45 # Derived from HK Kopavogur's ~46% win prob, slightly adjusting for draw possibility
    confidence_dc_draw_away = 0.6 # Medium confidence

    rationale_dc_draw_away = "HK Kopavogur's recent form and strong head-to-head record against Throttur Reykjavik suggest a decent chance of avoiding a loss."

    all_predictions.append(generate_prediction(
        double_chance_draw_away_quote,
        model_prob,
        confidence_dc_draw_away,
        dc_draw_away_evidence_ids,
        dc_draw_away_claim_ids,
        rationale_dc_draw_away
    ))

# --- Goals Over/Under Market Predictions ---
# Over 2.5 Goals
goals_ou_over_2_5_quotes = get_quotes(input_data["allowedQuotes"], "goals_over_under", "over", 2.5)
if goals_ou_over_2_5_quotes:
    goals_ou_over_2_5_quote = goals_ou_over_2_5_quotes[0]
    goals_ou_over_2_5_evidence_ids, goals_ou_over_2_5_claim_ids, _, _ = get_evidence_and_claims(
        input_data["evidenceItems"], input_data["claims"], market_key="goals_over_under", selection_key=None, line=None # Broader search for claims
    )
    
    model_prob = None
    rationale_over25 = "Direct matches between these teams average 3.26 goals per game, and web sources suggest an 80% probability of over 2.5 goals."
    for claim in input_data["claims"]:
        if claim["id"] == "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_goals_over25_prob":
            if "80%" in claim["statement"]:
                model_prob = 0.80
            break
    
    if model_prob is None:
        model_prob = goals_ou_over_2_5_quote["marketFairProbability"] * 1.1 # Lean towards over

    confidence_over25 = 0.85 # High confidence

    all_predictions.append(generate_prediction(
        goals_ou_over_2_5_quote,
        model_prob,
        confidence_over25,
        goals_ou_over_2_5_evidence_ids,
        goals_ou_over_2_5_claim_ids,
        rationale_over25
    ))

# Under 2.5 Goals
goals_ou_under_2_5_quotes = get_quotes(input_data["allowedQuotes"], "goals_over_under", "under", 2.5)
if goals_ou_under_2_5_quotes:
    goals_ou_under_2_5_quote = goals_ou_under_2_5_quotes[0]
    goals_ou_under_2_5_evidence_ids, goals_ou_under_2_5_claim_ids, _, _ = get_evidence_and_claims(
        input_data["evidenceItems"], input_data["claims"], market_key="goals_over_under", selection_key=None, line=None
    )
    
    # Model probability derived from over 2.5 prob
    model_prob = 1 - (all_predictions[len(all_predictions) - 1]["modelProbability"] if len(all_predictions)>0 else 0.7) # Use the calculated over prob for consistency
    confidence_under25 = 0.6 # Medium confidence, less likely than over

    rationale_under25 = "While direct matches average many goals, a lower-scoring affair is less probable but still possible."

    all_predictions.append(generate_prediction(
        goals_ou_under_2_5_quote,
        model_prob,
        confidence_under25,
        goals_ou_under_2_5_evidence_ids,
        goals_ou_under_2_5_claim_ids,
        rationale_under25
    ))


# --- BTTS Market Predictions ---
# BTTS Yes
btts_yes_quotes = get_quotes(input_data["allowedQuotes"], "btts", "yes")
if btts_yes_quotes:
    btts_yes_quote = btts_yes_quotes[0]
    btts_yes_evidence_ids, btts_yes_claim_ids, _, _ = get_evidence_and_claims(
        input_data["evidenceItems"], input_data["claims"], market_key="btts", selection_key=None
    )
    
    model_prob = None
    rationale_btts_yes = "There is an 86% confidence that both teams will score based on web analysis."
    for claim in input_data["claims"]:
        if claim["id"] == "cf9eacc0-06ed-4d1b-85f9-7d761ba5956c:claim_btts_prob":
            if "86%" in claim["statement"]:
                model_prob = 0.86
            break
    
    if model_prob is None:
        model_prob = btts_yes_quote["marketFairProbability"] * 1.1 # Lean towards yes

    confidence_btts_yes = 0.8 # High confidence

    all_predictions.append(generate_prediction(
        btts_yes_quote,
        model_prob,
        confidence_btts_yes,
        btts_yes_evidence_ids,
        btts_yes_claim_ids,
        rationale_btts_yes
    ))

# BTTS No
btts_no_quotes = get_quotes(input_data["allowedQuotes"], "btts", "no")
if btts_no_quotes:
    btts_no_quote = btts_no_quotes[0]
    btts_no_evidence_ids, btts_no_claim_ids, _, _ = get_evidence_and_claims(
        input_data["evidenceItems"], input_data["claims"], market_key="btts", selection_key=None
    )
    
    # Model probability derived from BTTS Yes prob
    model_prob = 1 - (all_predictions[len(all_predictions) - 1]["modelProbability"] if len(all_predictions)>0 else 0.8)
    confidence_btts_no = 0.5 # Low to Medium

    rationale_btts_no = "While both teams are expected to score, there's always a chance for a clean sheet from either side."

    all_predictions.append(generate_prediction(
        btts_no_quote,
        model_prob,
        confidence_btts_no,
        btts_no_evidence_ids,
        btts_no_claim_ids,
        rationale_btts_no
    ))

# --- Corners Over/Under Market Predictions ---
# Over 11.5 Corners
corners_ou_over_11_5_quotes = get_quotes(input_data["allowedQuotes"], "corners_over_under", "over", 11.5)
if corners_ou_over_11_5_quotes:
    corners_ou_over_11_5_quote = corners_ou_over_11_5_quotes[0]
    corners_ou_over_11_5_evidence_ids, corners_ou_over_11_5_claim_ids, _, _ = get_evidence_and_claims(
        input_data["evidenceItems"], input_data["claims"], market_key="corners_over_under", selection_key=None, line=None
    )
    
    model_prob = corners_ou_over_11_5_quote["marketFairProbability"] * 1.05 # Slightly above fair
    confidence_corners_over = 0.65 # Medium confidence

    rationale_corners_over = "High average number of corners in past games suggests a decent probability for over 11.5 corners."

    all_predictions.append(generate_prediction(
        corners_ou_over_11_5_quote,
        model_prob,
        confidence_corners_over,
        corners_ou_over_11_5_evidence_ids,
        corners_ou_over_11_5_claim_ids,
        rationale_corners_over
    ))

# Under 11.5 Corners
corners_ou_under_11_5_quotes = get_quotes(input_data["allowedQuotes"], "corners_over_under", "under", 11.5)
if corners_ou_under_11_5_quotes:
    corners_ou_under_11_5_quote = corners_ou_under_11_5_quotes[0]
    corners_ou_under_11_5_evidence_ids, corners_ou_under_11_5_claim_ids, _, _ = get_evidence_and_claims(
        input_data["evidenceItems"], input_data["claims"], market_key="corners_over_under", selection_key=None, line=None
    )
    
    # Model probability derived from over 11.5 prob
    model_prob = 1 - (all_predictions[len(all_predictions) - 1]["modelProbability"] if len(all_predictions)>0 else 0.5)
    confidence_corners_under = 0.5 # Low to Medium

    rationale_corners_under = "While a high number of corners is expected, there's always a possibility for fewer corners."

    all_predictions.append(generate_prediction(
        corners_ou_under_11_5_quote,
        model_prob,
        confidence_corners_under,
        corners_ou_under_11_5_evidence_ids,
        corners_ou_under_11_5_claim_ids,
        rationale_corners_under
    ))


# Final Output Structure
final_output = {
    "predictions": all_predictions,
    "warnings": global_warnings,
    "metadata": {}
}

print(json.dumps(final_output, indent=2))
