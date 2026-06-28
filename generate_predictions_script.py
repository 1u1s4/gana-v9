
import json

def calculate_edge(probability, market_fair_probability):
    return round(probability - market_fair_probability, 6)

def get_confidence_band(confidence):
    if confidence >= 0.7:
        return "high"
    elif confidence >= 0.6:
        return "medium"
    else:
        return "low"

def generate_predictions(input_data):
    predictions = []
    overall_warnings = input_data.get("researchBundle", {}).get("warnings", [])
    
    fixture = input_data["fixture"]
    allowed_quotes = input_data["allowedQuotes"]
    evidence_items = input_data["evidenceItems"]
    claims = input_data["claims"]
    
    # Helper to find claims/evidence by market
    def get_market_specific_claims_and_evidence(market_key, selection_key=None, line=None):
        market_claims = []
        market_evidence_ids = set()
        
        for claim in claims:
            if claim.get("marketKey") == market_key:
                if (selection_key is None or claim.get("selectionKey") == selection_key) and (line is None or claim.get("line") == line):
                    market_claims.append(claim)
                    for evidence_id in claim.get("evidenceIds", []):
                        market_evidence_ids.add(evidence_id)
        
        return market_claims, list(market_evidence_ids)

    # --- H2H Market ---
    # Find quotes for Detroit City (away team) winning
    h2h_away_quote = next((q for q in allowed_quotes if q["market"] == "h2h" and q["selection"] == "away"), None)
    
    if h2h_away_quote:
        # Based on claim_1 and claim_2, Detroit City FC is favored (62% win probability)
        model_probability = 0.62 
        h2h_away_claims, h2h_away_evidence_ids = get_market_specific_claims_and_evidence("h2h")

        predictions.append({
            "oddsQuoteId": h2h_away_quote["oddsQuoteId"],
            "market": "h2h",
            "selection": "away",
            "line": None,
            "odds": h2h_away_quote["odds"],
            "probability": model_probability,
            "modelProbability": model_probability,
            "marketFairProbability": h2h_away_quote["marketFairProbability"],
            "edge": calculate_edge(model_probability, h2h_away_quote["marketFairProbability"]),
            "confidence": 0.75,
            "confidenceBand": "medium",
            "blockers": [],
            "promotable": True, # Has market-specific evidence
            "evidenceIds": h2h_away_evidence_ids,
            "claimIds": [c["id"] for c in h2h_away_claims],
            "rationale": "Detroit City FC is favored to win based on market analysis (62% probability) and a recent 1-0 victory against Sporting JAX. Sporting JAX has a weak defense.",
            "warnings": []
        })

    # --- Double Chance Market ---
    # Pick "draw_or_away" as a conservative alternative, but acknowledge warnings
    double_chance_draw_or_away_quote = next((q for q in allowed_quotes if q["market"] == "double_chance" and q["selection"] == "draw_or_away"), None)
    
    if double_chance_draw_or_away_quote:
        # Using H2H claims/evidence as fixture-level support due to lack of market-specific evidence
        dc_evidence_ids = [e["id"] for e in evidence_items if e["id"] in h2h_away_evidence_ids]
        dc_claim_ids = [c["id"] for c in claims if c["marketKey"] == "h2h"]

        # Estimate probability based on h2h away win (0.62) + h2h draw (0.228655)
        model_probability_dc = round(0.62 + 0.228655, 6) # Approx 0.848655

        predictions.append({
            "oddsQuoteId": double_chance_draw_or_away_quote["oddsQuoteId"],
            "market": "double_chance",
            "selection": "draw_or_away",
            "line": None,
            "odds": double_chance_draw_or_away_quote["odds"],
            "probability": model_probability_dc,
            "modelProbability": model_probability_dc,
            "marketFairProbability": double_chance_draw_or_away_quote["marketFairProbability"],
            "edge": calculate_edge(model_probability_dc, double_chance_draw_or_away_quote["marketFairProbability"]),
            "confidence": 0.5, # Lower due to missing evidence and potential anomaly
            "confidenceBand": "low",
            "blockers": [],
            "promotable": False, # No market-specific evidence, and potential anomaly
            "evidenceIds": dc_evidence_ids,
            "claimIds": dc_claim_ids,
            "rationale": "Detroit City FC is favored to win, making draw or away a conservative pick. However, there is no market-specific evidence for double chance, and market fair probability appears anomalous with a very high overround.",
            "warnings": ["Missing market-specific research evidence for double_chance", "Market fair probability appears anomalous or distorted."]
        })

    # --- Goals Over/Under Market ---
    # Pick "under 2.5" based on Detroit's strong defense and previous 1-0 result
    goals_under_2_5_quote = next((q for q in allowed_quotes if q["market"] == "goals_over_under" and q["selection"] == "under" and q["line"] == 2.5), None)

    if goals_under_2_5_quote:
        goals_claims, goals_evidence_ids = get_market_specific_claims_and_evidence("goals_over_under")
        model_probability_goals = 0.55 # Estimate based on defensive strength

        predictions.append({
            "oddsQuoteId": goals_under_2_5_quote["oddsQuoteId"],
            "market": "goals_over_under",
            "selection": "under",
            "line": 2.5,
            "odds": goals_under_2_5_quote["odds"],
            "probability": model_probability_goals,
            "modelProbability": model_probability_goals,
            "marketFairProbability": goals_under_2_5_quote["marketFairProbability"],
            "edge": calculate_edge(model_probability_goals, goals_under_2_5_quote["marketFairProbability"]),
            "confidence": 0.7,
            "confidenceBand": "medium",
            "blockers": [],
            "promotable": True, # Has market-specific evidence
            "evidenceIds": goals_evidence_ids,
            "claimIds": [c["id"] for c in goals_claims],
            "rationale": "Detroit City FC's disciplined defense (11 goals conceded in 12 matches) and previous 1-0 result suggest a lower-scoring game, despite Sporting JAX's weak defense.",
            "warnings": []
        })

    # --- Corners Over/Under Market ---
    # Pick "over 8.5" with warnings due to lack of market-specific evidence
    corners_over_8_5_quote = next((q for q in allowed_quotes if q["market"] == "corners_over_under" and q["selection"] == "over" and q["line"] == 8.5), None)

    if corners_over_8_5_quote:
        model_probability_corners = 0.55 # Generic estimate
        
        predictions.append({
            "oddsQuoteId": corners_over_8_5_quote["oddsQuoteId"],
            "market": "corners_over_under",
            "selection": "over",
            "line": 8.5,
            "odds": corners_over_8_5_quote["odds"],
            "probability": model_probability_corners,
            "modelProbability": model_probability_corners,
            "marketFairProbability": corners_over_8_5_quote["marketFairProbability"],
            "edge": calculate_edge(model_probability_corners, corners_over_8_5_quote["marketFairProbability"]),
            "confidence": 0.5,
            "confidenceBand": "low",
            "blockers": [],
            "promotable": False, # No market-specific evidence
            "evidenceIds": [],
            "claimIds": [],
            "rationale": "No specific evidence for corners over/under. General expectation of active play might lead to average corner counts. This is a speculative pick due to lack of specific data.",
            "warnings": ["Missing market-specific research evidence for corners_over_under."]
        })

    # --- BTTS Market ---
    # Pick "no" based on Detroit's strong defense and previous 1-0 result
    btts_no_quote = next((q for q in allowed_quotes if q["market"] == "btts" and q["selection"] == "no"), None)

    if btts_no_quote:
        # Use general defensive claims as fixture-level support
        btts_evidence_ids = [
            "271e133a-9feb-4e9c-bcb1-f6401c9301e9:evidence_2", # Detroit won 1-0
            "271e133a-9feb-4e9c-bcb1-f6401c9301e9:evidence_3"  # Detroit strong defense
        ]
        btts_claim_ids = [
            "271e133a-9feb-4e9c-bcb1-f6401c9301e9:claim_2",
            "271e133a-9feb-4e9c-bcb1-f6401c9301e9:claim_3"
        ]
        model_probability_btts = 0.58 # Estimate based on defensive strength and prior result

        predictions.append({
            "oddsQuoteId": btts_no_quote["oddsQuoteId"],
            "market": "btts",
            "selection": "no",
            "line": None,
            "odds": btts_no_quote["odds"],
            "probability": model_probability_btts,
            "modelProbability": model_probability_btts,
            "marketFairProbability": btts_no_quote["marketFairProbability"],
            "edge": calculate_edge(model_probability_btts, btts_no_quote["marketFairProbability"]),
            "confidence": 0.65,
            "confidenceBand": "medium",
            "blockers": [],
            "promotable": False, # No market-specific evidence for BTTS
            "evidenceIds": btts_evidence_ids,
            "claimIds": btts_claim_ids,
            "rationale": "Detroit City FC's strong defense and the previous 1-0 result against Sporting JAX suggest that both teams may not score.",
            "warnings": ["Missing market-specific research evidence for btts."]
        })

    return {
        "predictions": predictions,
        "warnings": overall_warnings,
        "metadata": {}
    }

if __name__ == "__main__":
    input_json = {
        "promptVersion": "score-prediction-v2",
        "runId": "65227f0d-6af8-4426-b4de-a91eba6232f2",
        "createdAt": "2026-06-12T19:03:17.446Z",
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
            "id": "96f49ccd-76f7-42a5-8ee3-8690e6b65b2d",
            "providerFixtureId": "1493541",
            "competitionId": "8c54decb-4ac2-44c4-a307-75bea6beb06a",
            "season": 2026,
            "homeTeamId": "0c4af1a8-dee1-4517-aa96-a9ee180b4d1e",
            "awayTeamId": "a635174f-50b0-40fd-8cec-9e5b92306dc8",
            "scheduledAt": "2026-06-13T23:00:00.000Z",
            "status": "scheduled",
            "scoreHome": None,
            "scoreAway": None,
            "includedByFilters": [],
            "metadata": {
                "league": {
                    "id": 255,
                    "name": "USL Championship",
                    "country": "USA",
                    "season": 2026,
                    "round": "Group Stage"
                },
                "teams": {
                    "home": {
                        "id": 25959,
                        "name": "Sporting JAX"
                    },
                    "away": {
                        "id": 9043,
                        "name": "Detroit City"
                    }
                },
                "venue": "Hodges Stadium",
                "round": "Group Stage",
                "timezone": "UTC",
                "apiFootballStatusShort": "NS",
                "apiFootballStatusLong": "Not Started"
            }
        },
        "fixtureStatistics": {
            "providerFixtureId": "1493541",
            "capturedAt": "2026-06-12T19:03:18.600Z",
            "providerSnapshotId": "e464c1d8-0631-4486-88b7-c7ee92753fd7"
        },
        "oddsSnapshot": {
            "id": "bfbae452-0be2-4b05-8e25-4d00c0a44d70",
            "fixtureId": "96f49ccd-76f7-42a5-8ee3-8690e6b65b2d",
            "providerFixtureId": "1493541",
            "providerSnapshotId": "b615dfc0-4276-4c25-a418-1bfdaa937ead",
            "bookmakerCount": 2,
            "capturedAt": "2026-06-12T18:32:51.640Z",
            "payloadHash": "0eea4ab01bcf0e2fc6419da09729ed4e1ba67e6873c48cd22613bf79d22313f9"
        },
        "researchBundle": {
            "id": "271e133a-9feb-4e9c-bcb1-f6401c9301e9",
            "runId": "65227f0d-6af8-4426-b4de-a91eba6232f2",
            "status": "promotable",
            "gateResult": {
                "verdict": "promotable",
                "reasons": [
                    "Structured research generated with sufficient evidence including web search, adhering to minimal-research-retry constraints.",
                    "objective research gate passed with current web evidence"
                ],
                "warnings": [
                    "market double_chance skipped/review-required: missing market-specific research evidence",
                    "market corners_over_under skipped/review-required: missing market-specific research evidence",
                    "market btts skipped/review-required: missing market-specific research evidence"
                ]
            },
            "providerAgentic": "codex",
            "model": "gpt-5.5",
            "promptVersion": "research-fixture-v2",
            "warnings": [
                "market double_chance skipped/review-required: missing market-specific research evidence",
                "market corners_over_under skipped/review-required: missing market-specific research evidence",
                "market btts skipped/review-required: missing market-specific research evidence"
            ],
            "metadata": {
                "marketCoverage": {
                    "requiredMarkets": [
                        "h2h",
                        "double_chance",
                        "goals_over_under",
                        "corners_over_under",
                        "btts"
                    ],
                    "quotedMarkets": [
                        "btts",
                        "corners_over_under",
                        "double_chance",
                        "goals_over_under",
                        "h2h"
                    ],
                    "evidenceMarkets": [
                        "goals_over_under",
                        "h2h"
                    ],
                    "skippedMarkets": [
                        {
                            "market": "double_chance",
                            "reason": "missing market-specific research evidence"
                        },
                        {
                            "market": "corners_over_under",
                            "reason": "missing market-specific research evidence"
                        },
                        {
                            "market": "btts",
                            "reason": "missing market-specific research evidence"
                        }
                    ],
                    "warnings": [
                        "market double_chance skipped/review-required: missing market-specific research evidence",
                        "market corners_over_under skipped/review-required: missing market-specific research evidence",
                        "market btts skipped/review-required: missing market-specific research evidence"
                    ]
                },
                "providerContextWarnings": [],
                "marketScope": [
                    "h2h",
                    "double_chance",
                    "goals_over_under",
                    "corners_over_under",
                    "btts"
                ],
                "webSearchCoverage": {
                    "mode": "live",
                    "provider": "codex",
                    "nativeSupported": True,
                    "nativeToolUsed": True,
                    "browserFallbackUsed": False,
                    "realWebSearchSourceCount": 2,
                    "syntheticWebSearchSourceCount": 0,
                    "required": True
                },
                "referenceRepairs": [
                    "market double_chance skipped/review-required: missing market-specific research evidence",
                    "market corners_over_under skipped/review-required: missing market-specific research evidence",
                    "market btts skipped/review-required: missing market-specific research evidence"
                ]
            }
        },
        "sources": [
            {
                "id": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:source_api_football_fixture",
                "type": "api-football",
                "url": None,
                "title": "API-Football fixture",
                "externalId": "1493541",
                "providerSnapshotId": None,
                "capturedAt": "2026-06-12T18:32:46.400Z",
                "metadata": {
                    "fixtureId": "96f49ccd-76f7-42a5-8ee3-8690e6b65b2d",
                    "providerFixtureId": "1493541"
                }
            },
            {
                "id": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:source_api_football_fixture_statistics",
                "type": "api-football",
                "url": None,
                "title": "API-Football fixture statistics",
                "externalId": "1493541",
                "providerSnapshotId": "88c96707-fd13-478d-9e61-5b6b046a65d6",
                "capturedAt": "2026-06-12T18:32:50.036Z",
                "metadata": {
                    "providerFixtureId": "1493541",
                    "fields": [
                        "cornersHome",
                        "cornersAway",
                        "totalCorners"
                    ],
                    "snapshotId": "88c96707-fd13-478d-9e61-5b6b046a65d6"
                }
            },
            {
                "id": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:source_api_football_odds_snapshot",
                "type": "provider-snapshot",
                "url": None,
                "title": "API-Football odds snapshot",
                "externalId": "1493541",
                "providerSnapshotId": "b615dfc0-4276-4c25-a418-1bfdaa937ead",
                "capturedAt": "2026-06-12T18:32:51.640Z",
                "metadata": {
                    "fixtureId": "96f49ccd-76f7-42a5-8ee3-8690e6b65b2d",
                    "providerFixtureId": "1493541",
                    "oddsSnapshotId": "bfbae452-0be2-4b05-8e25-4d00c0a44d70",
                    "quoteCount": 54,
                    "bookmakerCount": 2,
                    "snapshotId": "b615dfc0-4276-4c25-a418-1bfdaa937ead"
                }
            },
            {
                "id": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:source_1",
                "type": "web-search",
                "url": "https://detcityfc.com",
                "title": "Detroit City FC Match Preview",
                "externalId": None,
                "providerSnapshotId": None,
                "capturedAt": "2026-06-12T18:32:46.400Z",
                "metadata": {}
            },
            {
                "id": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:source_2",
                "type": "web-search",
                "url": "https://kalshi.com",
                "title": "Kalshi Betting Market Odds",
                "externalId": None,
                "providerSnapshotId": None,
                "capturedAt": "2026-06-12T18:32:46.400Z",
                "metadata": {}
            }
        ],
        "evidenceItems": [
            {
                "id": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:evidence_1",
                "sourceId": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:source_2",
                "summary": "Detroit City FC has a 62% win probability according to betting markets.",
                "confidence": 0.8,
                "claimIds": [
                    "271e133a-9feb-4e9c-bcb1-f6401c9301e9:claim_1"
                ],
                "metadata": {}
            },
            {
                "id": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:evidence_2",
                "sourceId": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:source_1",
                "summary": "Detroit City FC won their previous match against Sporting JAX 1-0 on April 11.",
                "confidence": 0.9,
                "claimIds": [
                    "271e133a-9feb-4e9c-bcb1-f6401c9301e9:claim_2"
                ],
                "metadata": {}
            },
            {
                "id": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:evidence_3",
                "sourceId": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:source_1",
                "summary": "Detroit City FC has a disciplined defense, conceding only 11 goals in 12 matches.",
                "confidence": 0.9,
                "claimIds": [
                    "271e133a-9feb-4e9c-bcb1-f6401c9301e9:claim_3"
                ],
                "metadata": {}
            },
            {
                "id": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:evidence_4",
                "sourceId": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:source_1",
                "summary": "Sporting JAX has conceded a league-high 28 goals in their inaugural season.",
                "confidence": 0.9,
                "claimIds": [
                    "271e133a-9feb-4e9c-bcb1-f6401c9301e9:claim_4"
                ],
                "metadata": {}
            }
        ],
        "claims": [
            {
                "id": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:claim_1",
                "statement": "Detroit City FC is favored to win the match against Sporting JAX.",
                "marketKey": "h2h",
                "selectionKey": None,
                "line": None,
                "supportLevel": "supported",
                "confidence": None,
                "evidenceIds": [
                    "271e133a-9feb-4e9c-bcb1-f6401c9301e9:evidence_1"
                ],
                "conflictStatus": "none"
            },
            {
                "id": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:claim_2",
                "statement": "Detroit City FC defeated Sporting JAX in their prior encounter.",
                "marketKey": "h2h",
                "selectionKey": None,
                "line": None,
                "supportLevel": "supported",
                "confidence": None,
                "evidenceIds": [
                    "271e133a-9feb-4e9c-bcb1-f6401c9301e9:evidence_2"
                ],
                "conflictStatus": "none"
            },
            {
                "id": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:claim_3",
                "statement": "Detroit City FC possesses a strong defensive record in the USL Championship.",
                "marketKey": "goals_over_under",
                "selectionKey": None,
                "line": None,
                "supportLevel": "supported",
                "confidence": None,
                "evidenceIds": [
                    "271e133a-9feb-4e9c-bcb1-f6401c9301e9:evidence_3"
                ],
                "conflictStatus": "none"
            },
            {
                "id": "271e133a-9feb-4e9c-bcb1-f6401c9301e9:claim_4",
                "statement": "Sporting JAX has a weak defensive record, conceding a high number of goals.",
                "marketKey": "goals_over_under",
                "selectionKey": None,
                "line": None,
                "supportLevel": "supported",
                "confidence": None,
                "evidenceIds": [
                    "271e133a-9feb-4e9c-bcb1-f6401c9301e9:evidence_4"
                ],
                "conflictStatus": "none"
            }
        ],
        "allowedQuotes": [
            {
                "oddsQuoteId": "b3ae8f3c-42f7-41aa-bd5c-64d826ea74bc",
                "market": "h2h",
                "selection": "away",
                "line": None,
                "odds": 1.55,
                "impliedProbability": 0.645161,
                "marketImpliedProbability": 0.649378,
                "marketFairProbability": 0.591619,
                "consensusFairOdds": 1.690278,
                "overround": 0.097947,
                "marketEfficiencyScore": 0.6692,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "47e96e5b-7268-4edb-a7a5-dea943805f59",
                "market": "h2h",
                "selection": "draw",
                "line": None,
                "odds": 4.07,
                "impliedProbability": 0.2457,
                "marketImpliedProbability": 0.251055,
                "marketFairProbability": 0.228655,
                "consensusFairOdds": 4.373398,
                "overround": 0.097947,
                "marketEfficiencyScore": 0.6692,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "903a14cf-5628-4bc9-956c-4cc8be7a4516",
                "market": "h2h",
                "selection": "home",
                "line": None,
                "odds": 5.42,
                "impliedProbability": 0.184502,
                "marketImpliedProbability": 0.197514,
                "marketFairProbability": 0.179726,
                "consensusFairOdds": 5.564019,
                "overround": 0.097947,
                "marketEfficiencyScore": 0.6692,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "8612d89a-6ddc-41ea-8d26-645b068eb9f6",
                "market": "double_chance",
                "selection": "draw_or_away",
                "line": None,
                "odds": 1.12,
                "impliedProbability": 0.892857,
                "marketImpliedProbability": 0.892857,
                "marketFairProbability": 0.408675,
                "consensusFairOdds": 2.44693,
                "overround": 1.184759,
                "marketEfficiencyScore": 0.5167,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "a704cb5c-b731-467e-83d0-79d8d46d0124",
                "market": "double_chance",
                "selection": "home_or_away",
                "line": None,
                "odds": 1.18,
                "impliedProbability": 0.847458,
                "marketImpliedProbability": 0.847458,
                "marketFairProbability": 0.387895,
                "consensusFairOdds": 2.578016,
                "overround": 1.184759,
                "marketEfficiencyScore": 0.5167,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "15c5b96e-1124-4705-a311-37858fb7272c",
                "market": "double_chance",
                "selection": "home_or_draw",
                "line": None,
                "odds": 2.25,
                "impliedProbability": 0.444444,
                "marketImpliedProbability": 0.444444,
                "marketFairProbability": 0.203429,
                "consensusFairOdds": 4.915708,
                "overround": 1.184759,
                "marketEfficiencyScore": 0.5167,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "a53d85f0-ba50-471d-b67e-89a1f64ddfbd",
                "market": "goals_over_under",
                "selection": "over",
                "line": 1.5,
                "odds": 1.27,
                "impliedProbability": 0.787402,
                "marketImpliedProbability": 0.793701,
                "marketFairProbability": 0.745935,
                "consensusFairOdds": 1.340599,
                "overround": 0.06402,
                "marketEfficiencyScore": 0.7433,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "6e7f2649-7880-4cc9-9c32-bd577774ee57",
                "market": "goals_over_under",
                "selection": "under",
                "line": 1.5,
                "odds": 3.75,
                "impliedProbability": 0.266667,
                "marketImpliedProbability": 0.27032,
                "marketFairProbability": 0.254065,
                "consensusFairOdds": 3.936,
                "overround": 0.06402,
                "marketEfficiencyScore": 0.7433,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "711615c8-8209-4fb2-a3be-5f2babcf3b4a",
                "market": "goals_over_under",
                "selection": "over",
                "line": 2.5,
                "odds": 1.85,
                "impliedProbability": 0.540541,
                "marketImpliedProbability": 0.543494,
                "marketFairProbability": 0.516421,
                "consensusFairOdds": 1.936403,
                "overround": 0.05243,
                "marketEfficiencyScore": 0.7695,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "dedccc64-aaae-4e2c-9f10-1d56bd7cf393",
                "market": "goals_over_under",
                "selection": "under",
                "line": 2.5,
                "odds": 1.98,
                "impliedProbability": 0.505051,
                "marketImpliedProbability": 0.508936,
                "marketFairProbability": 0.483579,
                "consensusFairOdds": 2.067916,
                "overround": 0.05243,
                "marketEfficiencyScore": 0.7695,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "92c6bef6-e1c4-4769-b750-7fd44b489277",
                "market": "goals_over_under",
                "selection": "over",
                "line": 3.5,
                "odds": 3,
                "impliedProbability": 0.333333,
                "marketImpliedProbability": 0.336735,
                "marketFairProbability": 0.315686,
                "consensusFairOdds": 3.167709,
                "overround": 0.066701,
                "marketEfficiencyScore": 0.7386,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "d89c280e-2785-4204-b517-8eb1080b3a3f",
                "market": "goals_over_under",
                "selection": "under",
                "line": 3.5,
                "odds": 1.38,
                "impliedProbability": 0.724638,
                "marketImpliedProbability": 0.729966,
                "marketFairProbability": 0.684314,
                "consensusFairOdds": 1.461316,
                "overround": 0.066701,
                "marketEfficiencyScore": 0.7386,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "e85e39b0-51db-4935-bf99-d2803392b648",
                "market": "goals_over_under",
                "selection": "over",
                "line": 0.5,
                "odds": 1.04,
                "impliedProbability": 0.961538,
                "marketImpliedProbability": 0.961538,
                "marketFairProbability": 0.896414,
                "consensusFairOdds": 1.115556,
                "overround": 0.07265,
                "marketEfficiencyScore": 0.6153,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "c9b0122a-bf7b-4673-95f2-e2e264bc500a",
                "market": "goals_over_under",
                "selection": "under",
                "line": 0.5,
                "odds": 9,
                "impliedProbability": 0.111111,
                "marketImpliedProbability": 0.111111,
                "marketFairProbability": 0.103586,
                "consensusFairOdds": 9.653846,
                "overround": 0.07265,
                "marketEfficiencyScore": 0.6153,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "712e7a90-1b07-478c-a634-10674cf6fa2b",
                "market": "goals_over_under",
                "selection": "over",
                "line": 4.5,
                "odds": 5.5,
                "impliedProbability": 0.181818,
                "marketImpliedProbability": 0.184019,
                "marketFairProbability": 0.17215,
                "consensusFairOdds": 5.808896,
                "overround": 0.069044,
                "marketEfficiencyScore": 0.7328,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "01dcf8af-1472-4b6e-a41b-a4927541d65e",
                "market": "goals_over_under",
                "selection": "under",
                "line": 4.5,
                "odds": 1.14,
                "impliedProbability": 0.877193,
                "marketImpliedProbability": 0.885025,
                "marketFairProbability": 0.82785,
                "consensusFairOdds": 1.207948,
                "overround": 0.069044,
                "marketEfficiencyScore": 0.7328,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "73e0ff11-ff1b-4b3c-9424-b57fd3cf91b9",
                "market": "goals_over_under",
                "selection": "over",
                "line": 5.5,
                "odds": 9,
                "impliedProbability": 0.111111,
                "marketImpliedProbability": 0.111111,
                "marketFairProbability": 0.103586,
                "consensusFairOdds": 9.653846,
                "overround": 0.07265,
                "marketEfficiencyScore": 0.6153,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "fe3eaf78-2e80-4f19-b62e-29222393792d",
                "market": "goals_over_under",
                "selection": "under",
                "line": 5.5,
                "odds": 1.04,
                "impliedProbability": 0.961538,
                "marketImpliedProbability": 0.961538,
                "marketFairProbability": 0.896414,
                "consensusFairOdds": 1.115556,
                "overround": 0.07265,
                "marketEfficiencyScore": 0.6153,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "d06ca1d8-e09f-4f39-bad9-0ef45203ca82",
                "market": "goals_over_under",
                "selection": "over",
                "line": 2.25,
                "odds": 1.61,
                "impliedProbability": 0.621118,
                "marketImpliedProbability": 0.621118,
                "marketFairProbability": 0.587179,
                "consensusFairOdds": 1.703057,
                "overround": 0.057799,
                "marketEfficiencyScore": 0.6463,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "f30c748d-b1a6-4711-9466-73c562bd31fd",
                "market": "goals_over_under",
                "selection": "under",
                "line": 2.25,
                "odds": 2.29,
                "impliedProbability": 0.436681,
                "marketImpliedProbability": 0.436681,
                "marketFairProbability": 0.412821,
                "consensusFairOdds": 2.42236,
                "overround": 0.057799,
                "marketEfficiencyScore": 0.6463,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "9e3e5336-0298-4fb5-b282-9c1e04facc7a",
                "market": "goals_over_under",
                "selection": "over",
                "line": 2.75,
                "odds": 2.03,
                "impliedProbability": 0.492611,
                "marketImpliedProbability": 0.492611,
                "marketFairProbability": 0.467192,
                "consensusFairOdds": 2.140449,
                "overround": 0.054409,
                "marketEfficiencyScore": 0.6533,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "7fe73c02-75f4-481f-b262-bb98dfb0af7f",
                "market": "goals_over_under",
                "selection": "under",
                "line": 2.75,
                "odds": 1.78,
                "impliedProbability": 0.561798,
                "marketImpliedProbability": 0.561798,
                "marketFairProbability": 0.532808,
                "consensusFairOdds": 1.876847,
                "overround": 0.054409,
                "marketEfficiencyScore": 0.6533,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "3484c147-a5b4-41df-9946-0e1953f703b6",
                "market": "goals_over_under",
                "selection": "over",
                "line": 3.25,
                "odds": 2.61,
                "impliedProbability": 0.383142,
                "marketImpliedProbability": 0.383142,
                "marketFairProbability": 0.361858,
                "consensusFairOdds": 2.763514,
                "overround": 0.058817,
                "marketEfficiencyScore": 0.6441,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "3b9d745d-43a1-4ac8-80e6-380e68e3c839",
                "market": "goals_over_under",
                "selection": "under",
                "line": 3.25,
                "odds": 1.48,
                "impliedProbability": 0.675676,
                "marketImpliedProbability": 0.675676,
                "marketFairProbability": 0.638142,
                "consensusFairOdds": 1.56705,
                "overround": 0.058817,
                "marketEfficiencyScore": 0.6441,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "b06be0fa-cbcf-4cc6-8a4c-7728b9358d1f",
                "market": "goals_over_under",
                "selection": "over",
                "line": 3,
                "odds": 2.37,
                "impliedProbability": 0.421941,
                "marketImpliedProbability": 0.421941,
                "marketFairProbability": 0.398477,
                "consensusFairOdds": 2.509554,
                "overround": 0.058884,
                "marketEfficiencyScore": 0.644,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "1d177b1c-d2d3-4660-9637-52e4fc78e166",
                "market": "goals_over_under",
                "selection": "over",
                "line": 2,
                "odds": 1.4,
                "impliedProbability": 0.714286,
                "marketImpliedProbability": 0.714286,
                "marketFairProbability": 0.67366,
                "consensusFairOdds": 1.484429,
                "overround": 0.060306,
                "marketEfficiencyScore": 0.641,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "1d132722-b8ab-42eb-861c-95173aaa2351",
                "market": "goals_over_under",
                "selection": "under",
                "line": 2,
                "odds": 2.89,
                "impliedProbability": 0.346021,
                "marketImpliedProbability": 0.346021,
                "marketFairProbability": 0.32634,
                "consensusFairOdds": 3.064286,
                "overround": 0.060306,
                "marketEfficiencyScore": 0.641,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "8f552070-943e-41bd-b41e-4fcfa325ecac",
                "market": "goals_over_under",
                "selection": "under",
                "line": 3,
                "odds": 1.57,
                "impliedProbability": 0.636943,
                "marketImpliedProbability": 0.636943,
                "marketFairProbability": 0.601523,
                "consensusFairOdds": 1.662447,
                "overround": 0.058884,
                "marketEfficiencyScore": 0.644,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "61dedffa-bb84-48d7-a078-038b2b9d4af7",
                "market": "goals_over_under",
                "selection": "over",
                "line": 6.5,
                "odds": 15,
                "impliedProbability": 0.066667,
                "marketImpliedProbability": 0.066667,
                "marketFairProbability": 0.063086,
                "consensusFairOdds": 15.851485,
                "overround": 0.056766,
                "marketEfficiencyScore": 0.6484,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "7b864d38-ac11-44eb-a551-e6b778e3db38",
                "market": "goals_over_under",
                "selection": "under",
                "line": 6.5,
                "odds": 1.01,
                "impliedProbability": 0.990099,
                "marketImpliedProbability": 0.990099,
                "marketFairProbability": 0.936914,
                "consensusFairOdds": 1.067333,
                "overround": 0.056766,
                "marketEfficiencyScore": 0.6484,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "6964d47c-fc30-4f60-abb1-949fec84d2a0",
                "market": "goals_over_under",
                "selection": "over",
                "line": 7.5,
                "odds": 21,
                "impliedProbability": 0.047619,
                "marketImpliedProbability": 0.047619,
                "marketFairProbability": 1,
                "consensusFairOdds": 1,
                "overround": -0.952381,
                "marketEfficiencyScore": 0.7667,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "88e67e75-7184-4e2b-b156-2336984543fe",
                "market": "btts",
                "selection": "no",
                "line": None,
                "odds": 1.83,
                "impliedProbability": 0.546448,
                "marketImpliedProbability": 0.546448,
                "marketFairProbability": 0.5,
                "consensusFairOdds": 2,
                "overround": 0.092896,
                "marketEfficiencyScore": 0.5731,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "95c725f8-41bd-435b-ab84-592cc0e10269",
                "market": "btts",
                "selection": "yes",
                "line": None,
                "odds": 1.83,
                "impliedProbability": 0.546448,
                "marketImpliedProbability": 0.546448,
                "marketFairProbability": 0.5,
                "consensusFairOdds": 2,
                "overround": 0.092896,
                "marketEfficiencyScore": 0.5731,
                "lowLiquidity": True,
                "bookmaker": "Bet365",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "00b0a771-4706-45d8-87fa-7112cf7b3aa9",
                "market": "corners_over_under",
                "selection": "over",
                "line": 8.5,
                "odds": 1.72,
                "impliedProbability": 0.581395,
                "marketImpliedProbability": 0.581395,
                "marketFairProbability": 0.543767,
                "consensusFairOdds": 1.839024,
                "overround": 0.0692,
                "marketEfficiencyScore": 0.6225,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "1cf6c459-9540-44b5-bdc9-33c36751deef",
                "market": "corners_over_under",
                "selection": "under",
                "line": 8.5,
                "odds": 2.05,
                "impliedProbability": 0.487805,
                "marketImpliedProbability": 0.487805,
                "marketFairProbability": 0.456233,
                "consensusFairOdds": 2.19186,
                "overround": 0.0692,
                "marketEfficiencyScore": 0.6225,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "a4ba7e9d-17c8-4f7d-a664-d5a26641a89f",
                "market": "corners_over_under",
                "selection": "over",
                "line": 9.5,
                "odds": 2.15,
                "impliedProbability": 0.465116,
                "marketImpliedProbability": 0.465116,
                "marketFairProbability": 0.434211,
                "consensusFairOdds": 2.30303,
                "overround": 0.071177,
                "marketEfficiencyScore": 0.6184,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "4bde884f-d3e1-41ad-99a0-337416ccd211",
                "market": "corners_over_under",
                "selection": "under",
                "line": 9.5,
                "odds": 1.65,
                "impliedProbability": 0.606061,
                "marketImpliedProbability": 0.606061,
                "marketFairProbability": 0.565789,
                "consensusFairOdds": 1.767442,
                "overround": 0.071177,
                "marketEfficiencyScore": 0.6184,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "0a497929-6c03-41c1-9107-0912c2aeeef5",
                "market": "corners_over_under",
                "selection": "over",
                "line": 8,
                "odds": 1.52,
                "impliedProbability": 0.657895,
                "marketImpliedProbability": 0.657895,
                "marketFairProbability": 0.612245,
                "consensusFairOdds": 1.633333,
                "overround": 0.074561,
                "marketEfficiencyScore": 0.6113,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "ed76523f-7ddd-4a33-b658-4afe9bf61b66",
                "market": "corners_over_under",
                "selection": "under",
                "line": 8,
                "odds": 2.4,
                "impliedProbability": 0.416667,
                "marketImpliedProbability": 0.416667,
                "marketFairProbability": 0.387755,
                "consensusFairOdds": 2.578947,
                "overround": 0.074561,
                "marketEfficiencyScore": 0.6113,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "f0b76351-a9d2-4866-8db6-9f81b2aaabad",
                "market": "corners_over_under",
                "selection": "over",
                "line": 9,
                "odds": 1.93,
                "impliedProbability": 0.518135,
                "marketImpliedProbability": 0.518135,
                "marketFairProbability": 0.488064,
                "consensusFairOdds": 2.048913,
                "overround": 0.061613,
                "marketEfficiencyScore": 0.6383,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "d71409a0-17e2-4079-ae1c-57608970ddc6",
                "market": "corners_over_under",
                "selection": "under",
                "line": 9,
                "odds": 1.84,
                "impliedProbability": 0.543478,
                "marketImpliedProbability": 0.543478,
                "marketFairProbability": 0.511936,
                "consensusFairOdds": 1.953368,
                "overround": 0.061613,
                "marketEfficiencyScore": 0.6383,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "ce81577a-08d9-4c4c-9cf4-9880acc45fb3",
                "market": "corners_over_under",
                "selection": "over",
                "line": 10,
                "odds": 2.5,
                "impliedProbability": 0.4,
                "marketImpliedProbability": 0.4,
                "marketFairProbability": 0.371859,
                "consensusFairOdds": 2.689189,
                "overround": 0.075676,
                "marketEfficiencyScore": 0.609,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            },
            {
                "oddsQuoteId": "cd945f2d-da49-454e-a503-34bf643a4083",
                "market": "corners_over_under",
                "selection": "under",
                "line": 10,
                "odds": 1.48,
                "impliedProbability": 0.675676,
                "marketImpliedProbability": 0.675676,
                "marketFairProbability": 0.628141,
                "consensusFairOdds": 1.592,
                "overround": 0.075676,
                "marketEfficiencyScore": 0.609,
                "lowLiquidity": True,
                "bookmaker": "Pinnacle",
                "capturedAt": "2026-06-12T18:32:51.640Z"
            }
        ],
        "providerContextWarnings": [
            "scoring prompt allowedQuotes trimmed from 54 to 43 representative quotes"
        ]
    }
    
    result = generate_predictions(input_json)
    print(json.dumps(result, indent=2))
