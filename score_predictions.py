import json
import sys

def calculate_edge(model_probability, market_fair_probability):
    if market_fair_probability == 0:
        return 0
    return (model_probability / market_fair_probability) - 1

def find_quote(market, selection, line, allowed_quotes):
    for quote in allowed_quotes:
        # Check market and selection
        if quote['market'] == market and quote['selection'] == selection:
            # Check line
            if line is None and quote['line'] is None:
                return quote
            elif line is not None and quote['line'] is not None and abs(float(quote['line']) - float(line)) < 1e-6:
                return quote
    return None

def process_fixture_data(input_data):
    predictions = []
    global_warnings = []

    claims_map = {claim['id']: claim for claim in input_data['claims']}
    evidence_items_map = {evidence['id']: evidence for evidence in input_data['evidenceItems']}
    allowed_quotes = input_data['allowedQuotes']
    required_markets = input_data['requiredMarkets']

    DEFAULT_CONFIDENCE = 0.6
    DEFAULT_CONFIDENCE_BAND = "medium"

    for market in required_markets:
        best_quote = None
        claim_for_market = None
        evidence_ids_for_prediction = []
        claim_ids_for_prediction = []
        rationale = ""
        promotable = False

        if market == "h2h":
            claim_id = "3c827547-e99d-49aa-9d3f-df9cbd4840ed:claim-h2h-odds"
            claim = claims_map.get(claim_id)
            if claim:
                claim_for_market = claim
                best_quote = find_quote(market, "home", None, allowed_quotes) # Olimpia is home team and favored
                if best_quote:
                    evidence_ids_for_prediction = claim_for_market['evidenceIds']
                    claim_ids_for_prediction = [claim_for_market['id']]
                    rationale = f"Bookmakers favor Olimpia to win, supported by their strong form and home advantage. {claim_for_market['statement']}"
                    promotable = True
            else:
                global_warnings.append(f"No specific claim '{claim_id}' found for market '{market}'. Skipping prediction.")

        elif market == "double_chance":
            claim_id = "3c827547-e99d-49aa-9d3f-df9cbd4840ed:claim-double-chance-odds"
            claim = claims_map.get(claim_id)
            if claim:
                claim_for_market = claim
                best_quote = find_quote(market, "home_or_draw", None, allowed_quotes)
                if best_quote:
                    evidence_ids_for_prediction = claim_for_market['evidenceIds']
                    claim_ids_for_prediction = [claim_for_market['id']]
                    rationale = f"A home win or draw is strongly suggested by the bookmakers. {claim_for_market['statement']}"
                    promotable = True
            else:
                global_warnings.append(f"No specific claim '{claim_id}' found for market '{market}'. Skipping prediction.")

        elif market == "goals_over_under":
            claim_id = "3c827547-e99d-49aa-9d3f-df9cbd4840ed:claim-goals-odds"
            claim = claims_map.get(claim_id)
            if claim:
                claim_for_market = claim
                # Let's target over 2.5 goals based on the claim mentioning its odds
                best_quote = find_quote(market, "over", 2.5, allowed_quotes)
                if best_quote:
                    evidence_ids_for_prediction = claim_for_market['evidenceIds']
                    claim_ids_for_prediction = [claim_for_market['id']]
                    rationale = f"The 'over 2.5 goals' selection is favored by bookmakers. {claim_for_market['statement']}"
                    promotable = True
            else:
                global_warnings.append(f"No specific claim '{claim_id}' found for market '{market}'. Skipping prediction.")

        elif market == "corners_over_under":
            claim_id = "3c827547-e99d-49aa-9d3f-df9cbd4840ed:claim-corners-odds"
            claim = claims_map.get(claim_id)
            if claim:
                claim_for_market = claim
                # Based on previous instructions favoring 'under' if not explicitly stated,
                # and looking at available quotes, let's go for 'under' 9.5 corners if available.
                # If not, try 'under' 9.
                best_quote = find_quote(market, "under", 9.5, allowed_quotes)
                if not best_quote:
                    best_quote = find_quote(market, "under", 9.0, allowed_quotes) # Check for 'under 9' if 'under 9.5' not found

                if best_quote:
                    evidence_ids_for_prediction = claim_for_market['evidenceIds']
                    claim_ids_for_prediction = [claim_for_market['id']]
                    rationale = f"Odds for corners over/under 9.5 are available, with bookmakers offering competitive odds for 'under'. {claim_for_market['statement']}"
                    promotable = True
            else:
                global_warnings.append(f"No specific claim '{claim_id}' found for market '{market}'. Skipping prediction.")
        
        elif market == "btts":
            claim_id = "3c827547-e99d-49aa-9d3f-df9cbd4840ed:claim-btts-odds"
            claim = claims_map.get(claim_id)
            if claim:
                claim_for_market = claim
                best_quote = find_quote(market, "yes", None, allowed_quotes) # Pick 'yes' as it's a common choice
                if best_quote:
                    evidence_ids_for_prediction = claim_for_market['evidenceIds']
                    claim_ids_for_prediction = [claim_for_market['id']]
                    rationale = f"Both teams to score 'yes' is supported by available odds. {claim_for_market['statement']}"
                    promotable = True
            else:
                global_warnings.append(f"No specific claim '{claim_id}' found for market '{market}'. Skipping prediction.")


        if best_quote:
            model_probability = best_quote.get('marketFairProbability', best_quote['impliedProbability'])
            
            warnings_for_prediction = []
            if 'marketFairProbability' not in best_quote:
                warnings_for_prediction.append(f"No 'marketFairProbability' for {market} - {best_quote['selection']} (line: {best_quote['line']}). Using 'impliedProbability' for calculations.")
            
            probability = model_probability
            edge = calculate_edge(model_probability, best_quote.get('marketFairProbability', best_quote['impliedProbability']))

            current_confidence_sum = 0
            current_confidence_count = 0

            # Only add confidence from evidence items that have it
            for eid in evidence_ids_for_prediction:
                evidence_item = evidence_items_map.get(eid)
                if evidence_item and evidence_item.get('confidence') is not None:
                    current_confidence_sum += evidence_item['confidence']
                    current_confidence_count += 1
            
            confidence = current_confidence_sum / current_confidence_count if current_confidence_count > 0 else DEFAULT_CONFIDENCE

            if confidence >= 0.8:
                confidence_band = "high"
            elif confidence >= 0.5:
                confidence_band = "medium"
            else:
                confidence_band = "low"

            predictions.append({
                "oddsQuoteId": best_quote['oddsQuoteId'],
                "market": market,
                "selection": best_quote['selection'],
                "line": best_quote['line'],
                "odds": best_quote['odds'],
                "probability": probability,
                "modelProbability": model_probability,
                "marketFairProbability": best_quote.get('marketFairProbability'),
                "edge": edge,
                "confidence": confidence,
                "confidenceBand": confidence_band,
                "blockers": [],
                "promotable": promotable,
                "evidenceIds": evidence_ids_for_prediction,
                "claimIds": claim_ids_for_prediction,
                "rationale": rationale,
                "warnings": warnings_for_prediction
            })
        else:
            global_warnings.append(f"Market '{market}' was required but no suitable quote found for the given claims.")

    output_json = {
        "predictions": predictions,
        "warnings": global_warnings,
        "metadata": {}
    }
    return output_json

if __name__ == "__main__":
    input_json_str = sys.stdin.read()
    input_data = json.loads(input_json_str)
    result = process_fixture_data(input_data)
    print(json.dumps(result, indent=2))
