import json
import sys
import re # Import re for regex parsing
from collections import defaultdict

def calculate_probability_metrics(odds, model_probability, market_fair_probability):
    implied_probability = 1 / odds
    edge = model_probability - market_fair_probability
    return implied_probability, edge

def get_confidence_band(confidence):
    if confidence >= 0.8:
        return "high"
    elif confidence >= 0.6:
        return "medium"
    else:
        return "low"

def map_claim_to_selection(claim, home_team_name, away_team_name):
    market_key = claim["marketKey"]
    statement = claim["statement"]
    selection_key = claim["selectionKey"]
    line = claim["line"]

    if selection_key:
        return selection_key, line

    if market_key == "h2h":
        if home_team_name and (home_team_name in statement or "home win" in statement or "favored to win" in statement.lower().replace(home_team_name.lower(), "")):
            return "home", None
        elif away_team_name and (away_team_name in statement or "away win" in statement):
            return "away", None
        elif "draw" in statement:
            return "draw", None
    elif market_key == "double_chance":
        if home_team_name and ("win or draw" in statement and home_team_name in statement) or ("home or draw" in statement):
            return "home_or_draw", None
        elif away_team_name and ("win or draw" in statement and away_team_name in statement) or ("draw or away" in statement):
            return "draw_or_away", None
        elif "home or away" in statement:
            return "home_or_away", None
    elif market_key == "goals_over_under":
        # Try to extract line from statement
        line_match = re.search(r'(over|under)\s+([\d.]+)\s+goals', statement, re.IGNORECASE)
        if line_match:
            extracted_selection = line_match.group(1).lower()
            extracted_line = float(line_match.group(2))
            return extracted_selection, extracted_line
        else:
            # Fallback to claim's line or default if not found
            if "over" in statement and "goals" in statement:
                return "over", line if line else 2.5
            elif "under" in statement and "goals" in statement:
                return "under", line if line else 2.5
    elif market_key == "btts":
        if "both teams to score" in statement or "both teams are likely to score" in statement:
            return "yes", None
        elif "both teams not to score" in statement:
            return "no", None

    return None, None # Fallback if no specific mapping found


def score_predictions():
    input_data = json.load(sys.stdin)

    predictions = []
    output_warnings = []

    required_markets = input_data["requiredMarkets"]
    allowed_quotes = input_data["allowedQuotes"]
    claims = input_data["claims"]
    evidence_items = input_data["evidenceItems"]
    research_bundle_warnings = input_data["researchBundle"]["warnings"]
    fixture = input_data["fixture"] # Extract fixture
    home_team_name = fixture["metadata"]["teams"]["home"]["name"] # Extract home team name
    away_team_name = fixture["metadata"]["teams"]["away"]["name"] # Extract away team name

    # Helper dictionaries
    evidence_by_id = {item["id"]: item for item in evidence_items}
    claims_by_id = {item["id"]: item for item in claims}

    # Group allowed quotes by market for easier processing
    quotes_by_market = defaultdict(list)
    for quote in allowed_quotes:
        quotes_by_market[quote["market"]].append(quote)

    # Group claims by market and inferred selection for easier lookup
    claims_by_market_selection_line = defaultdict(lambda: defaultdict(list))
    for claim in claims:
        # Pass team names to map_claim_to_selection
        inferred_selection, inferred_line = map_claim_to_selection(claim, home_team_name, away_team_name)
        if inferred_selection:
            key_line = str(inferred_line) if inferred_line is not None else "None"
            claims_by_market_selection_line[claim["marketKey"]][f"{inferred_selection}_{key_line}"].append(claim)
        else:
            # If selection cannot be inferred, store by market only
            claims_by_market_selection_line[claim["marketKey"]]["general"].append(claim)

    for market in required_markets:
        if market not in quotes_by_market:
            output_warnings.append(f"market {market} skipped/review-required: missing odds quotes for requested market")
            continue

        for quote in quotes_by_market[market]:
            # Default values
            model_probability = 0.5
            confidence = 0.5
            current_evidence_ids = []
            current_claim_ids = []
            rationale_parts = []
            prediction_warnings = []
            promotable = False

            quote_selection = quote["selection"]
            quote_line = quote["line"]

            # Try to find specific claims first
            matched_claims = []
            key_line = str(quote_line) if quote_line is not None else "None"
            key = f"{quote_selection}_{key_line}"
            if key in claims_by_market_selection_line[market]:
                matched_claims.extend(claims_by_market_selection_line[market][key])

            # If no specific claims, try to find general claims that match the statement
            # This part needs to be updated to use the new map_claim_to_selection with team names
            if not matched_claims and "general" in claims_by_market_selection_line[market]:
                for claim in claims_by_market_selection_line[market]["general"]:
                    # Ensure general claims are also checked with team names if they fit
                    inferred_selection, inferred_line = map_claim_to_selection(claim, home_team_name, away_team_name)
                    if inferred_selection == quote_selection and inferred_line == quote_line:
                        matched_claims.append(claim)

            if matched_claims:
                promotable = True
                total_evidence_confidence = 0
                count_evidence = 0
                unique_evidence_ids = set()
                unique_claim_ids = set()

                for claim in matched_claims:
                    unique_claim_ids.add(claim["id"])
                    for eid in claim["evidenceIds"]:
                        if eid in evidence_by_id:
                            unique_evidence_ids.add(eid)
                            total_evidence_confidence += evidence_by_id[eid]["confidence"]
                            rationale_parts.append(evidence_by_id[eid]["summary"])
                            count_evidence += 1

                if count_evidence > 0:
                    confidence = total_evidence_confidence / count_evidence
                    model_probability = confidence # Simple assumption for now: model_probability is directly related to evidence confidence
                else:
                    prediction_warnings.append("No direct evidence found for this claim, using default confidence.")

                current_evidence_ids = list(unique_evidence_ids)
                current_claim_ids = list(unique_claim_ids)
            else:
                prediction_warnings.append(f"No specific claims or direct evidence found for {market} - {quote_selection} (Line: {quote_line}). Using default model probability (0.5).")

            implied_probability, edge = calculate_probability_metrics(
                quote["odds"],
                model_probability,
                quote["marketFairProbability"]
            )
            # Ensure the prediction line is correctly set from the quote, not inferred from claim (if claim had null line)
            final_line = quote_line if quote_line is not None else (inferred_line if inferred_line is not None else None)

            predictions.append({
                "oddsQuoteId": quote["oddsQuoteId"],
                "market": market,
                "selection": quote_selection,
                "line": final_line,
                "odds": quote["odds"],
                "probability": implied_probability,
                "modelProbability": model_probability,
                "marketFairProbability": quote["marketFairProbability"],
                "edge": edge,
                "confidence": confidence,
                "confidenceBand": get_confidence_band(confidence),
                "blockers": [],
                "promotable": promotable,
                "evidenceIds": current_evidence_ids,
                "claimIds": current_claim_ids,
                "rationale": ". ".join(list(set(rationale_parts))).strip(),
                "warnings": prediction_warnings
            })

    final_output = {
        "predictions": predictions,
        "warnings": output_warnings + research_bundle_warnings,
        "metadata": {}
    }

    print(json.dumps(final_output, indent=2))

if __name__ == "__main__":
    score_predictions()
