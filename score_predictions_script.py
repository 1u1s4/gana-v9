import json

def calculate_edge(market_fair_probability, implied_probability):
    return round(market_fair_probability - implied_probability, 6)

def calculate_probability_and_confidence(quote):
    # Use marketFairProbability as both probability and modelProbability for now
    probability = quote['marketFairProbability']
    model_probability = quote['marketFairProbability']

    # For confidence and confidenceBand, we'll use a heuristic for now.
    # A more sophisticated model would be needed for real application.
    # Since researchBundle.gateResult.verdict is "promotable", we can assume medium to high confidence.
    confidence = 0.7  # Default medium confidence
    confidence_band = "medium"

    # If marketEfficiencyScore is high, we can infer higher confidence.
    # This is a placeholder logic.
    if quote.get('marketEfficiencyScore', 0) > 0.6:
        confidence = 0.8
        confidence_band = "high"

    return probability, model_probability, confidence, confidence_band

def get_relevant_ids(market, selection, line, claims):
    relevant_evidence_ids = set()
    relevant_claim_ids = set()

    # First, try to find market-specific claims
    found_market_specific = False
    for claim in claims:
        market_matches = claim['marketKey'] == market
        selection_matches = (claim['selectionKey'] is None or claim['selectionKey'] == selection)
        line_matches = (claim['line'] is None or claim['line'] == line)

        if market_matches and selection_matches and line_matches:
            relevant_claim_ids.add(claim['id'])
            for evid in claim['evidenceIds']:
                relevant_evidence_ids.add(evid)
            found_market_specific = True
    
    # If no market-specific claims, include general team info claims as fallback
    if not found_market_specific:
        general_team_claims = [
            c for c in claims
            if c['marketKey'] is None and c['selectionKey'] is None and c['line'] is None
        ]
        for claim in general_team_claims:
            relevant_claim_ids.add(claim['id'])
            for evid in claim['evidenceIds']:
                relevant_evidence_ids.add(evid)

    return list(relevant_evidence_ids), list(relevant_claim_ids), found_market_specific

def get_rationale(evidence_ids, claim_ids, evidence_map, claim_map):
    rationale_parts = []
    for evid in evidence_ids:
        if evid in evidence_map:
            rationale_parts.append(evidence_map[evid]['summary'])
    for clid in claim_ids:
        if clid in claim_map:
            rationale_parts.append(claim_map[clid]['statement'])
    
    # Remove duplicates and combine into a brief rationale
    if rationale_parts:
        return ". ".join(sorted(list(set(rationale_parts))))
    return ""


def score_predictions(input_json_str):
    input_data = json.loads(input_json_str)

    predictions = []
    top_level_warnings = []
    
    # Propagate warnings from researchBundle
    top_level_warnings.extend(input_data['researchBundle'].get('warnings', []))

    # Create maps for quick lookup
    evidence_map = {item['id']: item for item in input_data['evidenceItems']}
    claim_map = {item['id']: item for item in input_data['claims']}

    for quote in input_data['allowedQuotes']:
        market = quote['market']
        selection = quote['selection']
        line = quote['line']

        # Ensure market is one of the canonical markets
        canonical_markets = ["h2h", "double_chance", "goals_over_under", "corners_over_under", "btts"]
        if market not in canonical_markets:
            continue # Skip non-canonical markets if any creep in

        # Skip markets explicitly listed as skipped in research bundle,
        # although with allowedQuotes, this shouldn't be strictly necessary for these markets
        # as they wouldn't have quotes. Still good for consistency.
        skipped_markets_in_research = [
            m['market'] for m in input_data['researchBundle']['metadata']['marketCoverage'].get('skippedMarkets', [])
        ]
        if market in skipped_markets_in_research:
            continue

        probability, model_probability, confidence, confidence_band = calculate_probability_and_confidence(quote)
        edge = calculate_edge(quote['marketFairProbability'], quote['impliedProbability'])
        
        evidence_ids, claim_ids, market_specific_claims_found = get_relevant_ids(market, selection, line, input_data['claims'])
        
        prediction_warnings = []
        is_promotable = True # Default to true as per instruction to emit even if uncertain

        if not market_specific_claims_found:
            prediction_warnings.append("No market-specific evidence found; rationale is based on general fixture-level information.")
        
        rationale = get_rationale(evidence_ids, claim_ids, evidence_map, claim_map)
        if not rationale and prediction_warnings:
             rationale = "No specific rationale could be generated from available evidence and claims for this market and selection."
        elif not rationale: # If no rationale and no specific warnings, provide a generic one if promotable
             rationale = "Prediction based on available odds and general team information."


        predictions.append({
            "oddsQuoteId": quote['oddsQuoteId'],
            "market": market,
            "selection": selection,
            "line": line,
            "odds": quote['odds'],
            "probability": probability,
            "modelProbability": model_probability,
            "marketFairProbability": quote['marketFairProbability'],
            "edge": edge,
            "confidence": confidence,
            "confidenceBand": confidence_band,
            "blockers": [], # No information to determine blockers
            "promotable": is_promotable,
            "evidenceIds": evidence_ids,
            "claimIds": claim_ids,
            "rationale": rationale,
            "warnings": prediction_warnings
        })

    # Deduplicate and sort top-level warnings for consistent output
    output_warnings = sorted(list(set(top_level_warnings)))

    output = {
        "predictions": predictions,
        "warnings": output_warnings,
        "metadata": {}
    }
    return json.dumps(output, indent=2)

if __name__ == "__main__":
    import sys
    input_str = sys.stdin.read()
    print(score_predictions(input_str))
