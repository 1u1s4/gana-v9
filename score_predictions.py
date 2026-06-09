import json
import sys

# Read input JSON from stdin
input_data = json.load(sys.stdin)

required_markets = input_data['requiredMarkets']
allowed_quotes = input_data['allowedQuotes']
claims = input_data['claims']
evidence_items = input_data['evidenceItems']
research_bundle_warnings = input_data['researchBundle']['warnings']
research_bundle_gate_reasons = input_data['researchBundle']['gateResult']['reasons']

predictions = []
overall_warnings = []

# Helper to get confidence band
def get_confidence_band(confidence):
    if confidence > 0.8:
        return 'high'
    elif confidence >= 0.7:
        return 'medium'
    else:
        return 'low'

# Helper to find relevant claims for a given market and optionally selection/line
def get_relevant_claims(market_key, selection=None, line=None):
    return [
        c for c in claims
        if c['marketKey'] == market_key and 
           (selection is None or c.get('selectionKey') == selection) and 
           (line is None or c.get('line') == line)
    ]

# Helper to find the best matching quote
def get_matching_quote(market_key, selection, line=None):
    for q in allowed_quotes:
        if q['market'] == market_key and q['selection'] == selection:
            if market_key == 'goals_over_under' or market_key == 'corners_over_under':
                # For over/under markets, line must match
                if q['line'] == line:
                    return q
            else:
                # For other markets, line should be null or match
                if q.get('line') == line:
                    return q
    return None

for market_key in required_markets:
    # --- H2H Market ---
    if market_key == 'h2h':
        # Find claims for home, away, and draw
        home_claim = next((c for c in claims if c['marketKey'] == 'h2h' and 'Resovia Rzeszów' in c['statement'] and 'favorite' in c['statement']), None)
        away_claim = next((c for c in claims if c['marketKey'] == 'h2h' and 'KSZO 1929' in c['statement'] and 'favorite' in c['statement']), None)
        draw_claim = next((c for c in claims if c['marketKey'] == 'h2h' and 'draw' in c['statement']), None)

        # Identify the stronger claim based on initial analysis or confidence if available
        # For this specific input, the researchBundle points to a conflict
        # "Significant conflict exists between provider odds and web search analysis regarding the match outcome (h2h, double_chance). Odds favor Resovia Rzeszów, while form and analysis favor KSZO 1929."
        # This implies that the 'home' selection (Resovia) based on odds is conflicting with web search favoring 'away' (KSZO).

        best_h2h_selection = None
        best_h2h_claim = None

        if "Odds favor Resovia Rzeszów, while form and analysis favor KSZO 1929." in research_bundle_gate_reasons:
            # Conflict identified: odds favor home (Resovia), analysis favors away (KSZO)
            # The prompt asks to "Emit at least one prediction per requested available market when evidence is sufficient; if a market is thin or uncertain, still emit the best analytical candidate with explicit warnings instead of silently omitting it."
            # "Use API-Football statistics and web-search evidence when present, especially for injuries, news, rotations, goals, BTTS, and corners context."
            # So, we should lean towards the web search analysis for KSZO 1929 (away).
            away_team_name = input_data['fixture']['metadata']['teams']['away']['name']
            home_team_name = input_data['fixture']['metadata']['teams']['home']['name']

            # Find the odds for the 'away' win (KSZO 1929)
            away_win_quote = get_matching_quote('h2h', 'away')
            if away_win_quote:
                # Use a general confidence for the analytical pick given the conflicting info.
                # The conflict makes it less promotable, and lowers overall confidence.
                # Default to a medium-low confidence.
                model_confidence = 0.6
                confidence = model_confidence
                
                # Check if there is an explicit claim for 'away' win (KSZO)
                relevant_claim = next((c for c in claims if c['marketKey'] == 'h2h' and 'Resovia Rzeszów' in c['statement']), None)
                # This claim (claim_1) is for Resovia (home) but has conflict status.
                # The rationale will need to reflect this conflict.

                # Evidence for the away win. Evidence 2 implies Resovia's poor form, indirectly supporting away.
                evidence_ids_for_away = []
                claim_ids_for_away = []
                for ev in evidence_items:
                    if "Resovia Rzeszów is in poor form" in ev['summary']:
                        evidence_ids_for_away.append(ev['id'])
                        claim_ids_for_away.extend(ev['claimIds'])
                
                # Filter out duplicate claim IDs
                claim_ids_for_away = list(set(claim_ids_for_away))

                # If claim_1 (Resovia favorite) is conflicting, then picking 'away' should be highlighted.
                # The promotable flag should be false due to the conflict stated in research_bundle_gate_reasons.
                is_promotable = False
                prediction_warnings = ["Significant conflict exists between provider odds (favoring Home) and web search analysis (favoring Away) for H2H market."]
                rationale = f"Despite odds favoring {home_team_name}, web search analysis indicates {home_team_name} is in poor form, especially away, which supports an {away_team_name} win."
                # The user input has "Resovia Rzeszów" as the home team, but the `evidence_2` says "Resovia Rzeszów is in poor form, especially away".
                # This implies there's a mismatch or a subtle point about Resovia's away performance being relevant even when they are home.
                # Given the `researchBundle.gateResult.reasons` says "The home team in the fixture (Resovia Rzeszów) is playing away according to web search analysis of recent form, which may confuse interpretation."
                # This means we need to be careful with "home" and "away" interpretation from web search.
                # However, "Odds favor Resovia Rzeszów, while form and analysis favor KSZO 1929." is clear. So I'll go with away.

                # Calculate edge against market fair probability
                model_probability = round(model_confidence, 2)
                market_fair_probability = away_win_quote['marketFairProbability']
                edge = round(model_probability - market_fair_probability, 2)

                predictions.append({
                    'oddsQuoteId': away_win_quote['oddsQuoteId'],
                    'market': 'h2h',
                    'selection': 'away',
                    'line': None,
                    'odds': away_win_quote['odds'],
                    'probability': model_probability,
                    'modelProbability': model_probability,
                    'marketFairProbability': round(market_fair_probability, 2),
                    'edge': edge,
                    'confidence': confidence,
                    'confidenceBand': get_confidence_band(confidence),
                    'blockers': ["Conflicting evidence on match outcome."],
                    'promotable': False, # Not promotable due to conflict
                    'evidenceIds': evidence_ids_for_away,
                    'claimIds': claim_ids_for_away,
                    'rationale': rationale,
                    'warnings': prediction_warnings
                })

    # --- Double Chance Market ---
    elif market_key == 'double_chance':
        # "Significant conflict exists between provider odds and web search analysis regarding the match outcome (h2h, double_chance). Odds favor Resovia Rzeszów, while form and analysis favor KSZO 1929."
        # The gate result says odds favor Resovia (home) but analysis favors KSZO (away).
        # We made a pick for H2H Away. So for double chance, we should consider 'draw_or_away'.
        
        # Claim 2: "There is a high probability that Resovia Rzeszów will not lose the match (win or draw)."
        # This claim is for 'home_or_draw' but it has conflict status.
        # Evidence 6: "Odds for a 'home or draw' (Resovia Rzeszów or Draw) outcome are very low (1.12), indicating high likelihood according to bookmakers."
        # This seems to be the source of the "odds favor Resovia" part of the conflict.

        # Given the overall analysis favors KSZO (away), a double chance of 'draw_or_away' seems analytically sounder.
        # Let's find the quote for 'draw_or_away'
        draw_or_away_quote = get_matching_quote('double_chance', 'draw_or_away')

        if draw_or_away_quote:
            model_confidence = 0.65 # Slightly higher confidence than H2H away, as it includes draw.
            confidence = model_confidence

            # Evidence for draw_or_away. Evidence 2 for Resovia's poor form, indirect support for draw_or_away.
            evidence_ids_for_dc = []
            claim_ids_for_dc = []
            for ev in evidence_items:
                if "Resovia Rzeszów is in poor form" in ev['summary'] or "KSZO 1929" in ev['summary'] or "KSZO 1929" in ev.get('metadata',{}).get('teamName', ''): # Assuming metadata might have teamName
                    evidence_ids_for_dc.append(ev['id'])
                    claim_ids_for_dc.extend(ev['claimIds'])
            
            claim_ids_for_dc = list(set(claim_ids_for_dc))

            is_promotable = False # Not promotable due to general conflict
            prediction_warnings = ["Significant conflict exists between provider odds (favoring Home_or_Draw) and web search analysis (favoring Draw_or_Away) for Double Chance market."]
            rationale = f"Given the conflicting analysis for match outcome, and web search leaning towards {input_data['fixture']['metadata']['teams']['away']['name']}'s form, a 'draw or away' outcome is a more robust analytical pick."

            model_probability = round(model_confidence, 2)
            market_fair_probability = draw_or_away_quote['marketFairProbability']
            edge = round(model_probability - market_fair_probability, 2)


            predictions.append({
                'oddsQuoteId': draw_or_away_quote['oddsQuoteId'],
                'market': 'double_chance',
                'selection': 'draw_or_away',
                'line': None,
                'odds': draw_or_away_quote['odds'],
                'probability': model_probability,
                'modelProbability': model_probability,
                'marketFairProbability': round(market_fair_probability, 2),
                'edge': edge,
                'confidence': confidence,
                'confidenceBand': get_confidence_band(confidence),
                'blockers': ["Conflicting evidence on match outcome."],
                'promotable': False,
                'evidenceIds': evidence_ids_for_dc,
                'claimIds': claim_ids_for_dc,
                'rationale': rationale,
                'warnings': prediction_warnings
            })


    # --- Goals Over/Under Market ---
    elif market_key == 'goals_over_under':
        # Claim 3: "The match is likely to have more than 2.5 goals." (supported, no conflict)
        relevant_claim = next((c for c in claims if c['marketKey'] == 'goals_over_under' and 'over 2.5 goals' in c['statement']), None)
        if relevant_claim:
            selection = 'over'
            line = 2.5
            matching_quote = get_matching_quote(market_key, selection, line)

            if matching_quote:
                supporting_evidence_confidences = [
                    e['confidence'] for e in evidence_items
                    if any(claim_id in relevant_claim['evidenceIds'] for claim_id in e['claimIds']) and 'confidence' in e
                ]
                
                model_confidence = sum(supporting_evidence_confidences) / len(supporting_evidence_confidences) if supporting_evidence_confidences else 0.7
                confidence = round(model_confidence, 2)

                model_probability = round(model_confidence, 2)
                market_fair_probability = matching_quote['marketFairProbability']
                edge = round(model_probability - market_fair_probability, 2)

                predictions.append({
                    'oddsQuoteId': matching_quote['oddsQuoteId'],
                    'market': market_key,
                    'selection': selection,
                    'line': line,
                    'odds': matching_quote['odds'],
                    'probability': model_probability,
                    'modelProbability': model_probability,
                    'marketFairProbability': round(market_fair_probability, 2),
                    'edge': edge,
                    'confidence': confidence,
                    'confidenceBand': get_confidence_band(confidence),
                    'blockers': [],
                    'promotable': relevant_claim['conflictStatus'] == 'none', # Promotable if no conflict
                    'evidenceIds': relevant_claim['evidenceIds'],
                    'claimIds': [relevant_claim['id']],
                    'rationale': relevant_claim['statement'],
                    'warnings': []
                })

    # --- Corners Over/Under Market ---
    elif market_key == 'corners_over_under':
        # Claim 4: "The match is likely to have over 10 corners." (partial support, no conflict)
        relevant_claim = next((c for c in claims if c['marketKey'] == 'corners_over_under' and 'over 10 corners' in c['statement']), None)
        if relevant_claim:
            selection = 'over'
            line = 10.0 # Line can be float, adjust from 10 to 10.0
            
            # The allowed quotes has a line of 10.5 for over and under, and 10 for over and under.
            # Claim 4 is "over 10 corners", let's try to match 10.0 line first, and if not then 10.5
            
            matching_quote = get_matching_quote(market_key, selection, line)
            if not matching_quote:
                line = 10.5
                matching_quote = get_matching_quote(market_key, selection, line)

            if matching_quote:
                supporting_evidence_confidences = [
                    e['confidence'] for e in evidence_items
                    if any(claim_id in relevant_claim['evidenceIds'] for claim_id in e['claimIds']) and 'confidence' in e
                ]
                model_confidence = sum(supporting_evidence_confidences) / len(supporting_evidence_confidences) if supporting_evidence_confidences else 0.6
                confidence = round(model_confidence, 2)

                model_probability = round(model_confidence, 2)
                market_fair_probability = matching_quote['marketFairProbability']
                edge = round(model_probability - market_fair_probability, 2)

                prediction_warnings = []
                if "The 'corners_over_under' claim is based only on odds, lacking external statistical validation." in research_bundle_gate_reasons:
                    prediction_warnings.append("Evidence for this market is based only on odds data, lacking statistical support from web research.")
                
                predictions.append({
                    'oddsQuoteId': matching_quote['oddsQuoteId'],
                    'market': market_key,
                    'selection': selection,
                    'line': line,
                    'odds': matching_quote['odds'],
                    'probability': model_probability,
                    'modelProbability': model_probability,
                    'marketFairProbability': round(market_fair_probability, 2),
                    'edge': edge,
                    'confidence': confidence,
                    'confidenceBand': get_confidence_band(confidence),
                    'blockers': [],
                    'promotable': relevant_claim['conflictStatus'] == 'none' and not prediction_warnings, # Not promotable if there are significant warnings
                    'evidenceIds': relevant_claim['evidenceIds'],
                    'claimIds': [relevant_claim['id']],
                    'rationale': relevant_claim['statement'],
                    'warnings': prediction_warnings
                })

    # --- BTTS Market ---
    elif market_key == 'btts':
        # Claim 5: "Both teams are likely to score in the match." (supported, no conflict)
        relevant_claim = next((c for c in claims if c['marketKey'] == 'btts' and 'Both teams are likely to score' in c['statement']), None)
        if relevant_claim:
            selection = 'yes'
            line = None # BTTS usually doesn't have a line
            matching_quote = get_matching_quote(market_key, selection, line)

            if matching_quote:
                supporting_evidence_confidences = [
                    e['confidence'] for e in evidence_items
                    if any(claim_id in relevant_claim['evidenceIds'] for claim_id in e['claimIds']) and 'confidence' in e
                ]
                model_confidence = sum(supporting_evidence_confidences) / len(supporting_evidence_confidences) if supporting_evidence_confidences else 0.7
                confidence = round(model_confidence, 2)

                model_probability = round(model_confidence, 2)
                market_fair_probability = matching_quote['marketFairProbability']
                edge = round(model_probability - market_fair_probability, 2)

                predictions.append({
                    'oddsQuoteId': matching_quote['oddsQuoteId'],
                    'market': market_key,
                    'selection': selection,
                    'line': line,
                    'odds': matching_quote['odds'],
                    'probability': model_probability,
                    'modelProbability': model_probability,
                    'marketFairProbability': round(market_fair_probability, 2),
                    'edge': edge,
                    'confidence': confidence,
                    'confidenceBand': get_confidence_band(confidence),
                    'blockers': [],
                    'promotable': relevant_claim['conflictStatus'] == 'none',
                    'evidenceIds': relevant_claim['evidenceIds'],
                    'claimIds': [relevant_claim['id']],
                    'rationale': relevant_claim['statement'],
                    'warnings': []
                })

# Final output
output_json = {
    'predictions': predictions,
    'warnings': overall_warnings,
    'metadata': {}
}

print(json.dumps(output_json, indent=2))
