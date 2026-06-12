
import json
import sys
import re

def get_model_probability_and_confidence(claim_id, claims_map, evidence_map):
    claim = claims_map[claim_id]
    total_confidence = 0
    num_evidence = 0
    rationales = []

    for evidence_id in claim["evidenceIds"]:
        evidence = evidence_map.get(evidence_id)
        if evidence:
            total_confidence += evidence["confidence"]
            num_evidence += 1
            rationales.append(evidence["summary"])

    if num_evidence > 0:
        avg_confidence = total_confidence / num_evidence
        return avg_confidence, avg_confidence, " ".join(rationales)
    return 0, 0, "No strong evidence for this claim."

def get_confidence_band(confidence):
    if confidence >= 0.85:
        return "high"
    elif confidence >= 0.7:
        return "medium"
    else:
        return "low"

def parse_goals_over_under_claim(statement):
    selection = None
    line = None
    statement_lower = statement.lower()

    # Regex to find "over X.Y" or "under X.Y"
    match = re.search(r'(over|under)\s+(\d+(\.\d+)?)', statement_lower)
    if match:
        selection = match.group(1)
        line = float(match.group(2))
    elif "over" in statement_lower: # Fallback for cases like "over 2 goals" without a specific line number mentioned close by
        selection = "over"
    elif "under" in statement_lower: # Fallback for cases like "under 2 goals" without a specific line number mentioned close by
        selection = "under"

    return selection, line

def infer_selection_from_claim(market_key, claim_statement, home_team_name, away_team_name):
    claim_statement_lower = claim_statement.lower()
    home_team_lower = home_team_name.lower()
    away_team_lower = away_team_name.lower()

    # Heuristic to filter out historical claims from generating direct predictions
    # This should return None if the claim is about a past event.
    if "last meeting" in claim_statement_lower or re.search(r'\d{4}', claim_statement_lower) and "won" in claim_statement_lower: # simple date check
        return None

    if market_key == "h2h":
        if home_team_lower in claim_statement_lower and "win" in claim_statement_lower:
            return "home"
        if away_team_lower in claim_statement_lower and "win" in claim_statement_lower:
            return "away"
        if "draw" in claim_statement_lower:
            return "draw"
    elif market_key == "double_chance":
        if (home_team_lower in claim_statement_lower and ("draw" in claim_statement_lower or "or draw" in claim_statement_lower)):
            return "home_or_draw"
        if (away_team_lower in claim_statement_lower and ("draw" in claim_statement_lower or "or draw" in claim_statement_lower)):
            return "draw_or_away"
        if (home_team_lower in claim_statement_lower and away_team_lower in claim_statement_lower) or ("either team to win" in claim_statement_lower):
            return "home_or_away"
    elif market_key == "btts":
        if "favored yes" in claim_statement_lower or "yes at" in claim_statement_lower or "btts yes" in claim_statement_lower or "both teams to score (yes)" in claim_statement_lower:
            return "yes"
        if "favored no" in claim_statement_lower or "no at" in claim_statement_lower or "btts no" in claim_statement_lower or "both teams to score (no)" in claim_statement_lower:
            return "no"
    elif market_key == "goals_over_under" or market_key == "corners_over_under":
        selection, _ = parse_goals_over_under_claim(claim_statement)
        return selection
    return None

def main():
    input_data = json.load(sys.stdin)

    claims_map = {claim["id"]: claim for claim in input_data["claims"]}
    evidence_map = {evidence["id"]: evidence for evidence in input_data["evidenceItems"]}
    allowed_quotes = input_data["allowedQuotes"]
    required_markets = input_data["requiredMarkets"]
    
    home_team_name = input_data["fixture"]["metadata"]["teams"]["home"]["name"]
    away_team_name = input_data["fixture"]["metadata"]["teams"]["away"]["name"]

    all_warnings = []
    predictions = []

    for market_key in required_markets:
        market_quotes = [q for q in allowed_quotes if q["market"] == market_key]
        market_claims = [c for c in input_data["claims"] if c["marketKey"] == market_key and c["supportLevel"] == "supported"]

        if not market_quotes:
            all_warnings.append(f"market {market_key} skipped: missing odds quotes for requested market")
            continue
        
        if not market_claims:
            all_warnings.append(f"market {market_key} has no supporting claims, emitting best analytical candidate with warning.")
            best_quote = min(market_quotes, key=lambda x: x["odds"])
            default_model_probability = 1 / best_quote["odds"] if best_quote["odds"] > 0 else 0
            market_fair_probability = best_quote.get("marketFairProbability", best_quote["impliedProbability"])
            edge = (default_model_probability - market_fair_probability) / market_fair_probability if market_fair_probability else 0
            
            predictions.append({
                "oddsQuoteId": best_quote["oddsQuoteId"],
                "market": market_key,
                "selection": best_quote["selection"],
                "line": best_quote["line"],
                "odds": best_quote["odds"],
                "probability": round(default_model_probability, 6),
                "modelProbability": round(default_model_probability, 6),
                "marketFairProbability": round(market_fair_probability, 6),
                "edge": round(edge, 6),
                "confidence": 0.5,
                "confidenceBand": get_confidence_band(0.5),
                "blockers": [],
                "promotable": False,
                "evidenceIds": [],
                "claimIds": [],
                "rationale": f"No specific claims for {market_key}. Defaulting to shortest odds quote.",
                "warnings": [f"No specific claims for {market_key}. Prediction based on market shortest odds."]
            })
            continue

        for claim in market_claims:
            model_probability, confidence, rationale = get_model_probability_and_confidence(claim["id"], claims_map, evidence_map)
            
            matched_quote = None
            
            # Special handling for goals_over_under and corners_over_under to extract line and selection
            if market_key == "goals_over_under" or market_key == "corners_over_under":
                claim_selection, claim_line = parse_goals_over_under_claim(claim["statement"])
                for quote in market_quotes:
                    # Compare selection and line for over/under markets
                    if quote["selection"] == claim_selection and quote["line"] == claim_line:
                        matched_quote = quote
                        break
            else:
                # For other markets, infer selection directly
                inferred_selection = infer_selection_from_claim(market_key, claim["statement"], home_team_name, away_team_name)
                for quote in market_quotes:
                    if quote["selection"] == inferred_selection:
                        matched_quote = quote
                        break
            
            if matched_quote:
                market_fair_probability = matched_quote.get("marketFairProbability", matched_quote["impliedProbability"])
                edge = (model_probability - market_fair_probability) / market_fair_probability if market_fair_probability else 0
                
                predictions.append({
                    "oddsQuoteId": matched_quote["oddsQuoteId"],
                    "market": market_key,
                    "selection": matched_quote["selection"],
                    "line": matched_quote["line"],
                    "odds": matched_quote["odds"],
                    "probability": round(model_probability, 6),
                    "modelProbability": round(model_probability, 6),
                    "marketFairProbability": round(market_fair_probability, 6),
                    "edge": round(edge, 6),
                    "confidence": round(confidence, 6),
                    "confidenceBand": get_confidence_band(confidence),
                    "blockers": [],
                    "promotable": True,
                    "evidenceIds": claim["evidenceIds"],
                    "claimIds": [claim["id"]],
                    "rationale": rationale,
                    "warnings": []
                })
            else:
                all_warnings.append(f"Could not find a matching quote for claim '{claim['statement']}' in market {market_key}. Emitting best analytical candidate with warning.")
                # Fallback to shortest odds quote for the market if no direct match found
                if market_quotes:
                    best_quote_for_market = min(market_quotes, key=lambda x: x["odds"])
                    default_model_probability = 1 / best_quote_for_market["odds"] if best_quote_for_market["odds"] > 0 else 0
                    market_fair_probability = best_quote_for_market.get("marketFairProbability", best_quote_for_market["impliedProbability"])
                    edge = (default_model_probability - market_fair_probability) / market_fair_probability if market_fair_probability else 0

                    predictions.append({
                        "oddsQuoteId": best_quote_for_market["oddsQuoteId"],
                        "market": market_key,
                        "selection": best_quote_for_market["selection"],
                        "line": best_quote_for_market["line"],
                        "odds": best_quote_for_market["odds"],
                        "probability": round(default_model_probability, 6),
                        "modelProbability": round(default_model_probability, 6),
                        "marketFairProbability": round(market_fair_probability, 6),
                        "edge": round(edge, 6),
                        "confidence": round(confidence, 6),
                        "confidenceBand": get_confidence_band(confidence),
                        "blockers": [],
                        "promotable": False,
                        "evidenceIds": claim["evidenceIds"],
                        "claimIds": [claim["id"]],
                        "rationale": f"Claim '{claim['statement']}' couldn't be directly matched to a quote, using shortest odds quote as fallback. " + rationale,
                        "warnings": [f"No direct quote match for claim '{claim['statement']}' in market {market_key}."]
                    })

    output = {
        "predictions": predictions,
        "warnings": all_warnings,
        "metadata": {}
    }

    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    main()
