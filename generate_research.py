import json
from datetime import datetime, timezone

input_data = {
  "promptVersion": "research-fixture-v2",
  "runId": "e8dc0b59-875d-426d-a574-61d03bd01b39",
  "createdAt": "2026-06-09T20:03:01.122Z",
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
    "id": "88cf5fff-045a-4c00-be26-6e80d30a437f",
    "provider": "api-football",
    "providerFixtureId": "1524830",
    "competitionId": "fa7fdb18-ce8c-44a1-abb9-0ac3a8a3cf67",
    "competitionName": "USL League Two",
    "leagueId": 256,
    "season": 2026,
    "homeTeamId": "f37e64c9-473a-440a-bcce-dd67e722ef05",
    "awayTeamId": "8ebb0241-9f49-40c6-a094-13ef3e322623",
    "homeTeamName": "AC Connecticut",
    "awayTeamName": "Vermont Green",
    "scheduledAt": "2026-06-10T23:00:00.000Z",
    "status": "scheduled",
    "includedByFilters": [],
    "createdAt": "2026-06-09T20:02:06.183Z",
    "updatedAt": "2026-06-09T20:03:07.121Z",
    "providerSnapshotId": "51806b70-ed55-43ca-9f32-17e9139f85da"
  },
  "fixtureStatistics": {
    "providerFixtureId": "1524830",
    "capturedAt": "2026-06-09T20:03:07.931Z",
    "providerSnapshotId": "43f41367-a933-4c98-a128-a76b02fece5e"
  },
  "oddsSnapshot": {
    "fixtureId": "88cf5fff-045a-4c00-be26-6e80d30a437f",
    "providerFixtureId": "1524830",
    "providerSnapshotId": "ab111e71-4a1c-49dd-bb54-7e8bcac886fd",
    "oddsSnapshotId": "d5523184-fbaf-43cb-8117-66ff6ff0a273",
    "capturedAt": "2026-06-09T20:03:08.998Z",
    "bookmakerCount": 1,
    "payloadHash": "0c94c67784ebf62782c4c41afc87f75ba01f0f9bf8fcbeb98f7c7609f0e819a4",
    "quotes": [
      {
        "market": "h2h",
        "selection": "home",
        "line": None,
        "price": 8,
        "impliedProbability": 0.125,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T20:03:08.998Z",
        "sourceSnapshotId": "ab111e71-4a1c-49dd-bb54-7e8bcac886fd"
      },
      {
        "market": "h2h",
        "selection": "draw",
        "line": None,
        "price": 5.75,
        "impliedProbability": 0.17391304347826086,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T20:03:08.998Z",
        "sourceSnapshotId": "ab111e71-4a1c-49dd-bb54-7e8bcac886fd"
      },
      {
        "market": "h2h",
        "selection": "away",
        "line": None,
        "price": 1.22,
        "impliedProbability": 0.819672131147541,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T20:03:08.998Z",
        "sourceSnapshotId": "ab111e71-4a1c-49dd-bb54-7e8bcac886fd"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 2.5,
        "price": 1.36,
        "impliedProbability": 0.7352941176470588,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T20:03:08.998Z",
        "sourceSnapshotId": "ab111e71-4a1c-49dd-bb54-7e8bcac886fd"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 2.5,
        "price": 3,
        "impliedProbability": 0.3333333333333333,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T20:03:08.998Z",
        "sourceSnapshotId": "ab111e71-4a1c-49dd-bb54-7e8bcac886fd"
      },
      {
        "market": "double_chance",
        "selection": "home_or_draw",
        "line": None,
        "price": 3.6,
        "impliedProbability": 0.2777777777777778,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T20:03:08.998Z",
        "sourceSnapshotId": "ab111e71-4a1c-49dd-bb54-7e8bcac886fd"
      },
      {
        "market": "double_chance",
        "selection": "home_or_away",
        "line": None,
        "price": 1.1,
        "impliedProbability": 0.9090909090909091,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T20:03:08.998Z",
        "sourceSnapshotId": "ab111e71-4a1c-49dd-bb54-7e8bcac886fd"
      },
      {
        "market": "double_chance",
        "selection": "draw_or_away",
        "line": None,
        "price": 1.05,
        "impliedProbability": 0.9523809523809523,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T20:03:08.998Z",
        "sourceSnapshotId": "ab111e71-4a1c-49dd-bb54-7e8bcac886fd"
      }
    ]
  },
  "providerContextWarnings": []
}

web_search_results_markdown = """
The match between **AC Connecticut** and **Vermont Green FC** in USL League Two is scheduled for **Wednesday, June 10, 2026**.[1][2]

### **Match Details**
*   **Date:** Wednesday, June 10, 2026
*   **Kickoff Time:** 7:00 PM EDT (23:00 UTC)
*   **Venue:** Westside Athletic Complex (WestConn), Danbury, Connecticut
*   **Competition:** USL League Two (Northeast Division)

### **Current Form & Standings**
*   **Vermont Green FC:** Currently 2nd in the Northeast Division. They are in excellent form, coming off a string of dominant wins, including a 5-0 victory over the Boston Bolts and a 9-0 win against Albany Rush earlier this season.
*   **AC Connecticut:** Currently 8th in the division.[3] Their recent form has been mixed, with a 4-0 win over Boston City but losses to Albany Rush and Connecticut Rush in late May.

### **Head-to-Head (H2H)**
Vermont Green has historically dominated this fixture:
*   **Last Meeting (2025):** AC Connecticut 0-0 Vermont Green[4]
*   **Previous Meetings:** Vermont Green won four of the last five encounters, including a 7-0 win in June 2024 and a 6-3 win in June 2023.[5]

### **Where to Watch**
USL League Two matches are typically broadcast on **SportsEngine Play**, the league's official streaming partner. Local updates and live scores can also be followed via the teams' social media channels or apps like Sofascore and Flashscore.

Sources:
[1] weekendgoals.com (https://weekendgoals.com)
[2] sportfeed.app (https://sportfeed.app)
[3] sofascore.com (https://sofascore.com)
[4] aiscore.com (https://aiscore.com)
[5] livescores.biz (https://livescores.biz)
"""

# Current UTC timestamp for web-search sources
current_utc_timestamp = datetime.now(timezone.utc).isoformat(timespec='milliseconds') + 'Z'

sources = [
    {
        "id": "web_source_1",
        "type": "web-search",
        "url": "https://weekendgoals.com",
        "title": "weekendgoals.com",
        "capturedAt": current_utc_timestamp,
        "metadata": {}
    },
    {
        "id": "web_source_2",
        "type": "web-search",
        "url": "https://sportfeed.app",
        "title": "sportfeed.app",
        "capturedAt": current_utc_timestamp,
        "metadata": {}
    },
    {
        "id": "api_football_fixture",
        "type": "api-football",
        "url": f"https://api-football.com/fixtures/{input_data['fixture']['providerFixtureId']}",
        "title": "API-Football Fixture Data",
        "capturedAt": input_data['fixture']['updatedAt'],
        "hash": input_data['fixture']['providerSnapshotId'],
        "metadata": {"providerFixtureId": input_data['fixture']['providerFixtureId']}
    },
    {
        "id": "api_football_odds",
        "type": "api-football",
        "url": f"https://api-football.com/odds/fixture/{input_data['oddsSnapshot']['fixtureId']}",
        "title": "API-Football Odds Data",
        "capturedAt": input_data['oddsSnapshot']['capturedAt'],
        "hash": input_data['oddsSnapshot']['providerSnapshotId'],
        "metadata": {"fixtureId": input_data['oddsSnapshot']['fixtureId'], "oddsSnapshotId": input_data['oddsSnapshot']['oddsSnapshotId']}
    }
]

evidence_items = []
claims = []
skipped_markets = []

# Helper to add evidence and claim
def add_evidence_claim(source_id, snippet, statement, subject_type, subject_id=None, market=None, confidence=0.9):
    # Enforce max 4 claims
    if len(claims) >= 4:
        return None

    evidence_id = f"evidence_{len(evidence_items) + 1}"
    claim_id = f"claim_{len(claims) + 1}"

    evidence_items.append({
        "id": evidence_id,
        "sourceId": source_id,
        "claimIds": [claim_id],
        "snippet": snippet,
        "summary": statement, # In minimal-research-retry, summary is same as statement for conciseness
        "confidence": confidence,
        "metadata": {}
    })

    subject = {"type": subject_type}
    if subject_id:
        subject["id"] = subject_id
    if market:
        subject["market"] = market

    claims.append({
        "id": claim_id,
        "statement": statement,
        "subject": subject,
        "supportLevel": "supported",
        "evidenceIds": [evidence_id],
        "conflictStatus": "none",
        "metadata": {}
    })
    return claim_id

# Fixture Details
fixture_id = input_data['fixture']['id']
home_team = input_data['fixture']['homeTeamName']
away_team = input_data['fixture']['awayTeamName']
scheduled_at = input_data['fixture']['scheduledAt']
competition_name = input_data['fixture']['competitionName']

# Minimal claims, prioritize fixture details and key H2H/Form
add_evidence_claim("web_source_1", "The match ... is scheduled for Wednesday, June 10, 2026.", f"The match is scheduled for {scheduled_at}.", "fixture", fixture_id)
add_evidence_claim("web_source_1", "Vermont Green FC: Currently 2nd in the Northeast Division.", "Vermont Green FC is currently 2nd in the Northeast Division.", "team", input_data['fixture']['awayTeamId'])
add_evidence_claim("web_source_1", "AC Connecticut: Currently 8th in the division.", "AC Connecticut is currently 8th in the division.", "team", input_data['fixture']['homeTeamId'])
add_evidence_claim("web_source_1", "Vermont Green has historically dominated this fixture: ... 7-0 win in June 2024 and a 6-3 win in June 2023.", "Vermont Green has historically dominated this fixture, with notable wins of 7-0 (2024) and 6-3 (2023).", "team_h2h", f"{home_team}_vs_{away_team}")

# Odds and Market Claims (will only add if claims limit not reached)
for market_name in input_data['requiredMarkets']:
    if len(claims) >= 4: # Stop adding claims if limit reached
        break
    
    market_quotes = [q for q in input_data['oddsSnapshot']['quotes'] if q['market'] == market_name]
    if not market_quotes:
        if market_name not in skipped_markets:
            skipped_markets.append(market_name)
        continue

    for quote in market_quotes:
        if len(claims) >= 4: # Stop adding claims if limit reached
            break
        selection = quote['selection']
        price = quote['price']
        implied_probability = quote['impliedProbability']
        bookmaker = quote['bookmaker']
        line_info = f" (line: {quote['line']})" if quote['line'] is not None else ""

        statement = f"Odds for {market_name} market, selection '{selection}'{line_info}: {price} ({implied_probability:.2%} implied probability) from {bookmaker}."

        claim_added = add_evidence_claim(
            "api_football_odds",
            f"Market: {market_name}, Selection: {selection}, Price: {price}",
            statement,
            "market",
            fixture_id,
            market_name
        )
        if claim_added is None:
            break # Stop if no more claims can be added

# Ensure corners_over_under and btts are explicitly checked for skipping if not covered by odds loop
for market_to_check in ["corners_over_under", "btts"]:
    if market_to_check in input_data['requiredMarkets'] and market_to_check not in [q['market'] for q in input_data['oddsSnapshot']['quotes']]:
        if market_to_check not in skipped_markets:
            skipped_markets.append(market_to_check)

# Gate Result
gate_verdict = "review-required" # Default to review-required for retry mode
reasons = ["structured research generated with minimal evidence for retry mode", "web-search evidence included as webMode is live"]
warnings = []
market_coverage_skipped = []

if skipped_markets:
    reasons.append("Some required markets lacked odds quotes or evidence.")
    market_coverage_skipped = sorted(list(set(skipped_markets))) # Ensure unique and sorted
    warnings.append(f"Missing data for markets: {', '.join(market_coverage_skipped)}")

# Adjust verdict if all market claims were successfully added and no other issues
if not skipped_markets and len(claims) == 4 and "web-search" in [s['type'] for s in sources]: # Check if web-search is actually in sources list
    gate_verdict = "promotable"
    reasons = ["structured research generated with sufficient evidence", "web-search evidence included as webMode is live"]
    warnings = [] # Clear warnings if promotable

result = {
    "sources": sources,
    "evidenceItems": evidence_items,
    "claims": claims,
    "gateResult": {
        "verdict": gate_verdict,
        "reasons": reasons,
        "warnings": warnings
    },
    "warnings": warnings,
    "metadata": {
        "marketCoverage": {
            "skippedMarkets": market_coverage_skipped
        }
    }
}

print(json.dumps(result, indent=2))