import json
import sys
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

def map_claim_to_selection(claim):
    market_key = claim["marketKey"]
    statement = claim["statement"]
    selection_key = claim["selectionKey"]
    line = claim["line"]

    if selection_key:
        return selection_key, line

    if market_key == "h2h":
        if "favored to win" in statement or "home win" in statement:
            return "home", None
        elif "away win" in statement:
            return "away", None
        elif "draw" in statement:
            return "draw", None
    elif market_key == "double_chance":
        if "win or draw" in statement and "Dainava" in statement: # Assuming Dainava is home team
            return "home_or_draw", None
        elif "win or draw" in statement and "Ekranas" in statement: # Assuming Ekranas is away team
            return "draw_or_away", None
        elif "home or away" in statement:
            return "home_or_away", None
    elif market_key == "goals_over_under":
        if "over" in statement and "goals" in statement:
            return "over", line if line else 2.5 # Default line to 2.5 if not specified in claim
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
        inferred_selection, inferred_line = map_claim_to_selection(claim)
        if inferred_selection:
            claims_by_market_selection_line[claim["marketKey"]][f"{inferred_selection}_{inferred_line}"].append(claim)
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
            key = f"{quote_selection}_{quote_line}" if quote_line else f"{quote_selection}_None"
            if key in claims_by_market_selection_line[market]:
                matched_claims.extend(claims_by_market_selection_line[market][key])

            # If no specific claims, try to find general claims that match the statement
            if not matched_claims and "general" in claims_by_market_selection_line[market]:
                for claim in claims_by_market_selection_line[market]["general"]:
                    inferred_selection, inferred_line = map_claim_to_selection(claim)
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

            predictions.append({
                "oddsQuoteId": quote["oddsQuoteId"],
                "market": market,
                "selection": quote_selection,
                "line": quote_line,
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
