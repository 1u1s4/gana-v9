
import json
import uuid
from datetime import datetime

# Input data (from the prompt)
fixture_input = {
  'promptVersion': 'research-fixture-v2',
  'runId': '5c714d6c-2123-4797-9e8f-c589e11633c4',
  'createdAt': '2026-06-12T08:35:23.600Z',
  'webMode': 'live',
  'requiredMarkets': [
    'h2h',
    'double_chance',
    'goals_over_under',
    'corners_over_under',
    'btts'
  ],
  'marketFocus': [
    'h2h',
    'double_chance',
    'goals_over_under',
    'corners_over_under',
    'btts'
  ],
  'fixture': {
    'id': '1ab03b5d-a7ce-4efb-b50a-efa6d7decd5d',
    'provider': 'api-football',
    'providerFixtureId': '1545810',
    'competitionId': '945bf1ca-25ad-4674-8d8a-b2d1f3a990bb',
    'competitionName': 'Cup',
    'leagueId': 167,
    'season': 2026,
    'homeTeamId': '90d72b5b-067e-4377-9b71-375d05779443',
    'awayTeamId': '2ac3a90a-4931-4bd3-b39f-627fcfd0bcb8',
    'homeTeamName': 'IA Akranes',
    'awayTeamName': 'Vikingur Reykjavik',
    'scheduledAt': '2026-06-12T20:15:00.000Z',
    'status': 'scheduled',
    'includedByFilters': [],
    'createdAt': '2026-06-12T03:55:47.045Z',
    'updatedAt': '2026-06-12T08:35:27.468Z',
    'providerSnapshotId': '9712874c-7764-4e1c-bca5-9d959ddb5454'
  },
  'fixtureStatistics': {
    'providerFixtureId': '1545810',
    'capturedAt': '2026-06-12T08:35:28.206Z',
    'providerSnapshotId': 'eaeaf76f-39c3-45a4-8a1a-ae563c72ef83'
  },
  'oddsSnapshot': {
    'fixtureId': '1ab03b5d-a7ce-4efb-b50a-efa6d7decd5d',
    'providerFixtureId': '1545810',
    'providerSnapshotId': 'f99af19b-a12e-4d5c-b7f8-59b3cf8e4b68',
    'oddsSnapshotId': 'd4cb0e4f-31fa-458a-aa65-8f95d6c49571',
    'capturedAt': '2026-06-12T08:35:29.249Z',
    'bookmakerCount': 1,
    'payloadHash': 'aafd1fc79be86985818bb4eba316459f2821718c01738efd94bba6a0e9370535',
    'quotes': [
      {
        'market': 'h2h',
        'selection': 'home',
        'line': None,
        'price': 6.25,
        'impliedProbability': 0.16,
        'bookmaker': 'Bet365',
        'capturedAt': '2026-06-12T08:35:29.249Z',
        'sourceSnapshotId': 'f99af19b-a12e-4d5c-b7f8-59b3cf8e4b68'
      },
      {
        'market': 'h2h',
        'selection': 'draw',
        'line': None,
        'price': 5.25,
        'impliedProbability': 0.19047619047619047,
        'bookmaker': 'Bet365',
        'capturedAt': '2026-06-12T08:35:29.249Z',
        'sourceSnapshotId': 'f99af19b-a12e-4d5c-b7f8-59b3cf8e4b68'
      },
      {
        'market': 'h2h',
        'selection': 'away',
        'line': None,
        'price': 1.3,
        'impliedProbability': 0.7692307692307692,
        'bookmaker': 'Bet365',
        'capturedAt': '2026-06-12T08:35:29.249Z',
        'sourceSnapshotId': 'f99af19b-a12e-4d5c-b7f8-59b3cf8e4b68'
      },
      {
        'market': 'goals_over_under',
        'selection': 'over',
        'line': 2.5,
        'price': 1.22,
        'impliedProbability': 0.819672131147541,
        'bookmaker': 'Bet365',
        'capturedAt': '2026-06-12T08:35:29.249Z',
        'sourceSnapshotId': 'f99af19b-a12e-4d5c-b7f8-59b3cf8e4b68'
      },
      {
        'market': 'goals_over_under',
        'selection': 'under',
        'line': 2.5,
        'price': 4,
        'impliedProbability': 0.25,
        'bookmaker': 'Bet365',
        'capturedAt': '2026-06-12T08:35:29.249Z',
        'sourceSnapshotId': 'f99af19b-a12e-4d5c-b7f8-59b3cf8e4b68'
      },
      {
        'market': 'double_chance',
        'selection': 'home_or_draw',
        'line': None,
        'price': 2.75,
        'impliedProbability': 0.36363636363636365,
        'bookmaker': 'Bet365',
        'capturedAt': '2026-06-12T08:35:29.249Z',
        'sourceSnapshotId': 'f99af19b-a12e-4d5c-b7f8-59b3cf8e4b68'
      },
      {
        'market': 'double_chance',
        'selection': 'home_or_away',
        'line': None,
        'price': 1.11,
        'impliedProbability': 0.9009009009009008,
        'bookmaker': 'Bet365',
        'capturedAt': '2026-06-12T08:35:29.249Z',
        'sourceSnapshotId': 'f99af19b-a12e-4d5c-b7f8-59b3cf8e4b68'
      },
      {
        'market': 'double_chance',
        'selection': 'draw_or_away',
        'line': None,
        'price': 1.11,
        'impliedProbability': 0.9009009009009008,
        'bookmaker': 'Bet365',
        'capturedAt': '2026-06-12T08:35:29.249Z',
        'sourceSnapshotId': 'f99af19b-a12e-4d5c-b7f8-59b3cf8e4b68'
      }
    ]
  },
  'providerContextWarnings': []
}

web_search_results_content = '''
The football match between **IA Akranes** and **Vikingur Reykjavik** is scheduled for **Friday, June 12, 2026**, as part of the **Iceland Cup (Quarter-finals)**.[1][2]

### **Match Details**
*   **Date:** June 12, 2026[3][4][5][6][1][2][7]
*   **Kickoff Time:** 21:15 GMT (Local Time) / 13:15 GMT (some sources)
*   **Competition:** Iceland Cup (Quarter-finals)
*   **Venue:** Akranesvöllur, Akranes[4]

---

### **Recent Form (Last 5 Matches)**
*   **IA Akranes:** W-D-W-L-W
    *   Akranes has been in decent form, picking up 2 wins and 2 draws in their last five outings.[2] They recently secured a 1-0 win against FH Hafnarfjordur.
*   **Vikingur Reykjavik:** W-W-W-W-W[8][9][1]
    *   The defending champions are in dominant form, coming into this match on a **10-match winning streak**. Their most recent result was a convincing 5-1 victory over Valur Reykjavik.

### **Head-to-Head (H2H) Stats**
Vikingur Reykjavik has historically dominated this fixture:
*   **Total Meetings:** 22–32 (depending on the database)
*   **Vikingur Wins:** 11–13[4]
*   **IA Akranes Wins:** 3–9[10]
*   **Draws:** 8–10
*   **Last Meeting (April 27, 2026):** Vikingur Reykjavik 4 - 0 IA Akranes (Besta deild karla)[4]
*   **Trend:** Vikingur has won the last **4 consecutive matches** against IA Akranes.[5][4]

### **League Standings (Besta deild karla 2026)**
| Pos | Team | P | W | D | L | GD | Pts |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **Vikingur Reykjavik** | 10 | 9 | 1 | 0 | +28 | 28 |
| 6 | **IA Akranes** | 9 | 3 | 3 | 3 | -4 | 12 |[9][10][1]

---

### **Betting Odds & Predictions**
*   **Match Result (1X2):**
    *   **Vikingur Reykjavik:** ~1.30 (Strong Favorite)[2]
    *   **Draw:** ~5.75
    *   **IA Akranes:** ~5.75 – 7.00[4]
*   **Goals (Over/Under):**
    *   **Over 2.5 Goals:** Heavily favored.[1][10][4][7] Vikingur averages 3.4 goals per game this season.
    *   **Both Teams to Score (BTTS):** Statistical probability is around 50-60% based on H2H history.
*   **Score Prediction:** A common AI/statistical tip for this match is a **1-4 victory for Vikingur Reykjavik**.[7]

### **Key Insights**
*   **Vikingur's Defense:** They currently hold the best defensive record in the league, conceding only 6 goals in 10 matches.
*   **Akranes' Home Advantage:** While Akranes is the underdog, they have shown resilience at home, though they struggled significantly in their last league meeting with Vikingur (4-0 loss).
*   **Cup Stakes:** As a quarter-final knockout match, expect a high-intensity game where Vikingur will look to continue their pursuit of a domestic double.

Sources:
[1] footystats.org (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQE4BDLuC-FBf_9e1qxyv4o7yywVwia_RDEFuu2waBOUoAeXkE2GaRplAMHFaCI6QezCuiK9yYA8Eucmt1vLfdJltuk_XhlQnVUfwlPcIVmaOORYyFsxnjnJ6Wi9JvbF_cYwYeePvkF7crMSXTE_TJ-j5o2g9USZeP2Gk-Y13Kijux-6Y_c=)
[2] oddslot.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQH8mr1vacKkARA_hEdVkNvaw7OvCl6j1XPCMXhaTyciyRQkxHy3aycG_uwoJ9g5x01fiGoBQhnCHDX2E4XqDS3A5y3B2pZyhmK-rXeGMwnMAE7a23O9Xv4LXG7iBCSncPAFs2n_T94xgbK1Udsge3uPmszEcgXYt3B7pfT0fUvcRhttlJLyrl4JtnRd6w==)
[3] whoscored.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQE9U5QLhgThP-Z_b2AFZem3wX4B12CWDcFsuO-eFYqI0Pd6w3EYnVoqplQQpv3aw3VCKAel6IbALxYWJBEmGUivkMBEVrPYwxO1XPl2Pz674EbgIkKvOvrcSfeeQ26ccpCBr3wkEiWi4KzbGVBGsibDdhElsyJ8q1gwRRgsiXdamDusxVxvpRubFSy8drsFArOdy2YZJqFkMQ==)
[4] soccervital.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGOwM8hCO0K8ReWL57mg2lyYnTV1mPev4cpRTD_S9wFVk0A01PsGU7_9lfxCUaNNJKUejGjKu9Y1hEHJ9WHFn2ylTztjIGJGdO-k-k-aXEyT-gI0ItMe-m_QXtfm7ySjyHuUnGsMKFHi2iv7bbv3TP3ToXv1E8Q3RTT7da7lW_RlaiEDxqV2dazlUyJYbvyjsz_ppuagYnP5kJA==)
[5] fotmob.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGAI8lB90xTzTr-k75LwA61DIQX5QEp25wu_Rz_OfP0QbD_mClpiMuSfzs-ksqzy79NqFb4fak-Jhb3sbE6cXLOiTxchJF3cTR8_bsYQ-RZdkxVABUqEA9aV008IDea8_wJ-qehwBnrlK6XFF6RkHWR7KYaG8Y90vpgc_cBGRgETcE=)
[6] xscores.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFw_QWRrfic6H4jaT_GUXC1aHqqmw1dfUgbZNgESpJYLBiCujDVu6AGIcFrC-FRHKWRS4oiPXrRKz3239kKdeVCrrdhB7BPiieTvVek-0qEA0zkLgLBhIB0R1iuiztuThOffOokVRV4-kJQUaBgMSGmq2k7c3mIkFa2I2S4AKsp3pzCahTMfoGhIl0TfwALTafJBdeXYw==)
[7] footballpredictions.ai (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHGlOAU0VshMmJsR03OM5z5r5iMzaoav35VNjkzSF5VHPxFVWmEaTiPt9tj6wqX22Su1Bl8hVZvHel3zuxbYBbJmBqSuyw7Hmg6hqHjHnYYkl5gxFqpAqaeypAj1e5YA-QlLAvX0YHB4o2uIJLYKp3s7VGuZsbdeVeJEzl92Y9u1PRTRTRHgO0z_etW-bOeBg47iKQAIdEWQprOF4bVlaxDzGAbC0bvrCTjGEuvpb7Q==)
[8] flashscore.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHhYNqw5y2H10lZF2EgVG0Odyrs2_56TsKOX_pGo_KvBdXsPTw4O-lHw3Q9Z2IssJsWhlpOZ0uWvpCB3UD5MhrUBnWOapTvwT9SWfE_ce6E2Mpn8RVjdGsikR__caXlLBPTdRlMeqltNibzJLHNCrFJgapilsqiv8-JPg4mJFOBOMZO_Q==)
[9] flashfootball.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQENnSYaZ9tfjKV9SziX9aKPl5uWj1u6eaXiFr5E1OwZ1iH3kRQjp0N4vDFIY5p-BaIGfOdVyC9nSi5ntuiAtFSNBjRs3h9RWw-hvw68u_e1iHGw1A1rzmyTT6AdlOzD60GXgjiacMQXpN-Vu7wTzQ79zfpiyq5yTUTEdFVLzw==)
[10] aiscore.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGu1Z4JBtRXvVQhr2WZfiHANl4Z_QmL-zCefSakKNZStGprXkRcdCyuOu7g4pWuaVxbdnLf-269On5_fCvbzNMNRV_rlJyelnf6zXzbc9m9hZGJcw-Siyv9uGGWzZp6PAA6zVeKmUXijQUIEeYqdBE3pN7QO0SFX6udu09D2o1OzQ8MHdoshL9O1KHPtQ==)
'''

fixture_id = fixture_input['fixture']['id']
home_team_name = fixture_input['fixture']['homeTeamName']
away_team_name = fixture_input['fixture']['awayTeamName']
odds_snapshot = fixture_input['oddsSnapshot']
required_markets = fixture_input['requiredMarkets']

# Helper functions
def generate_id():
    return str(uuid.uuid4())

def current_iso_timestamp():
    return datetime.utcnow().isoformat(timespec='milliseconds') + 'Z'

# Initialize output structure
sources = []
evidence_items = []
claims = []
gate_result = {"verdict": "promotable", "reasons": [], "warnings": []}
warnings = []
metadata = {"marketCoverage": {"skippedMarkets": []}}

# --- Process Web Search Results ---
web_search_source_id = generate_id()
sources.append({
    "id": web_search_source_id,
    "type": "web-search",
    "url": "https://www.google.com/search?q=IA+Akranes+vs+Vikingur+Reykjavik+2026-06-12+football+match+preview+stats+odds",
    "title": "Google Search Results for IA Akranes vs Vikingur Reykjavik",
    "capturedAt": current_iso_timestamp(),
    "metadata": {}
})

# Evidence for Vikingur's form and H2H dominance
vikingur_form_evidence_id = generate_id()
evidence_items.append({
    "id": vikingur_form_evidence_id,
    "sourceId": web_search_source_id,
    "claimIds": [], # Will be populated later
    "snippet": "Vikingur Reykjavik: W-W-W-W-W [...] The defending champions are in dominant form, coming into this match on a 10-match winning streak. Their most recent result was a convincing 5-1 victory over Valur Reykjavik. Vikingur has won the last 4 consecutive matches against IA Akranes.",
    "summary": "Vikingur Reykjavik is on a 10-match winning streak and has won the last 4 head-to-head matches against IA Akranes, indicating strong current form and historical dominance.",
    "confidence": 0.9,
    "metadata": {}
})

# Evidence for Vikingur being strong favorite and score prediction
vikingur_favorite_evidence_id = generate_id()
evidence_items.append({
    "id": vikingur_favorite_evidence_id,
    "sourceId": web_search_source_id,
    "claimIds": [],
    "snippet": "Vikingur Reykjavik: ~1.30 (Strong Favorite) [...] A common AI/statistical tip for this match is a 1-4 victory for Vikingur Reykjavik.",
    "summary": "Betting odds show Vikingur Reykjavik as a strong favorite with odds around 1.30, and an AI prediction suggests a 1-4 victory for Vikingur.",
    "confidence": 0.85,
    "metadata": {}
})

# Evidence for Over 2.5 Goals
over_2_5_goals_evidence_id = generate_id()
evidence_items.append({
    "id": over_2_5_goals_evidence_id,
    "sourceId": web_search_source_id,
    "claimIds": [],
    "snippet": "Goals (Over/Under): Over 2.5 Goals: Heavily favored. Vikingur averages 3.4 goals per game this season.",
    "summary": "Over 2.5 goals is heavily favored based on betting insights, and Vikingur Reykjavik averages 3.4 goals per game.",
    "confidence": 0.8,
    "metadata": {}
})

# Evidence for BTTS probability
btts_probability_evidence_id = generate_id()
evidence_items.append({
    "id": btts_probability_evidence_id,
    "sourceId": web_search_source_id,
    "claimIds": [],
    "snippet": "Both Teams to Score (BTTS): Statistical probability is around 50-60% based on H2H history.",
    "summary": "Statistical probability for Both Teams to Score (BTTS) is estimated to be around 50-60% based on head-to-head history.",
    "confidence": 0.6,
    "metadata": {}
})


# --- Process Fixture and Odds Data ---
odds_snapshot_source_id = generate_id()
sources.append({
    "id": odds_snapshot_source_id,
    "type": "provider-snapshot",
    "url": "N/A", # No direct URL for snapshot, this is internal
    "title": "API-Football Odds Snapshot for Fixture " + fixture_input['fixture']['providerFixtureId'],
    "capturedAt": odds_snapshot['capturedAt'],
    "hash": odds_snapshot['payloadHash'],
    "metadata": {
        "providerSnapshotId": odds_snapshot['providerSnapshotId'],
        "bookmakerCount": odds_snapshot['bookmakerCount']
    }
})

# H2H Market
h2h_quotes = [q for q in odds_snapshot['quotes'] if q['market'] == 'h2h']
if h2h_quotes:
    # Find the favorite based on lowest price
    favorite_selection = min(h2h_quotes, key=lambda x: x['price'])
    h2h_claim_statement = f"{away_team_name} is favored to win against {home_team_name} with odds of {favorite_selection['price']}."
    if favorite_selection['selection'] == 'draw':
        h2h_claim_statement = f"A draw is the most favored outcome between {home_team_name} and {away_team_name} with odds of {favorite_selection['price']}."
    elif favorite_selection['selection'] == 'home':
        h2h_claim_statement = f"{home_team_name} is favored to win against {away_team_name} with odds of {favorite_selection['price']}."

    h2h_odds_evidence_id = generate_id()
    h2h_claim_id = generate_id()

    evidence_items.append({
        "id": h2h_odds_evidence_id,
        "sourceId": odds_snapshot_source_id,
        "claimIds": [h2h_claim_id],
        "snippet": json.dumps(h2h_quotes),
        "summary": f"Betting odds from Bet365 show {favorite_selection['selection']} as the favored outcome for the H2H market with a price of {favorite_selection['price']}.",
        "confidence": 0.95,
        "metadata": {"market": "h2h", "selection": favorite_selection['selection'], "price": favorite_selection['price']}
    })

    claims.append({
        "id": h2h_claim_id,
        "statement": h2h_claim_statement,
        "subject": {
            "type": "market",
            "id": fixture_id,
            "market": "h2h"
        },
        "supportLevel": "supported",
        "evidenceIds": [h2h_odds_evidence_id, vikingur_form_evidence_id, vikingur_favorite_evidence_id],
        "conflictStatus": "none",
        "metadata": {}
    })
    # Link web search evidence to h2h claim
    evidence_items[0]['claimIds'].append(h2h_claim_id) 
    evidence_items[1]['claimIds'].append(h2h_claim_id) 

# Double Chance Market
double_chance_quotes = [q for q in odds_snapshot['quotes'] if q['market'] == 'double_chance']
if double_chance_quotes:
    dc_favorite_selection = min(double_chance_quotes, key=lambda x: x['price'])
    double_chance_claim_statement = f"The most likely outcome in the double chance market is {dc_favorite_selection['selection'].replace('_',' ')} with odds of {dc_favorite_selection['price']}."

    dc_odds_evidence_id = generate_id()
    dc_claim_id = generate_id()

    evidence_items.append({
        "id": dc_odds_evidence_id,
        "sourceId": odds_snapshot_source_id,
        "claimIds": [dc_claim_id],
        "snippet": json.dumps(double_chance_quotes),
        "summary": f"Betting odds from Bet365 indicate {dc_favorite_selection['selection'].replace('_',' ')} as the most probable outcome in the double chance market with a price of {dc_favorite_selection['price']}.",
        "confidence": 0.95,
        "metadata": {"market": "double_chance", "selection": dc_favorite_selection['selection'], "price": dc_favorite_selection['price']}
    })

    claims.append({
        "id": dc_claim_id,
        "statement": double_chance_claim_statement,
        "subject": {
            "type": "market",
            "id": fixture_id,
            "market": "double_chance"
        },
        "supportLevel": "supported",
        "evidenceIds": [dc_odds_evidence_id],
        "conflictStatus": "none",
        "metadata": {}
    })

# Goals Over/Under Market (2.5)
goals_quotes = [q for q in odds_snapshot['quotes'] if q['market'] == 'goals_over_under' and q['line'] == 2.5]
if goals_quotes:
    over_2_5_quote = next((q for q in goals_quotes if q['selection'] == 'over'), None)
    under_2_5_quote = next((q for q in goals_quotes if q['selection'] == 'under'), None)

    if over_2_5_quote and under_2_5_quote:
        goals_claim_statement = f"Odds heavily favor over 2.5 goals at {over_2_5_quote['price']} compared to under 2.5 goals at {under_2_5_quote['price']}."
        
        goals_odds_evidence_id = generate_id()
        goals_claim_id = generate_id()

        evidence_items.append({
            "id": goals_odds_evidence_id,
            "sourceId": odds_snapshot_source_id,
            "claimIds": [goals_claim_id],
            "snippet": json.dumps(goals_quotes),
            "summary": f"Betting odds from Bet365 strongly suggest over 2.5 goals ({over_2_5_quote['price']}) for the match.",
            "confidence": 0.95,
            "metadata": {"market": "goals_over_under", "line": 2.5, "over_price": over_2_5_quote['price'], "under_price": under_2_5_quote['price']}
        })

        claims.append({
            "id": goals_claim_id,
            "statement": goals_claim_statement,
            "subject": {
                "type": "market",
                "id": fixture_id,
                "market": "goals_over_under"
            },
            "supportLevel": "supported",
            "evidenceIds": [goals_odds_evidence_id, over_2_5_goals_evidence_id],
            "conflictStatus": "none",
            "metadata": {}
        })
        # Link web search evidence to goals claim
        evidence_items[2]['claimIds'].append(goals_claim_id) 

# General claims based on web search
# Claim about Vikingur's general dominance and high scoring potential
vikingur_dominance_claim_id = generate_id()
claims.append({
    "id": vikingur_dominance_claim_id,
    "statement": f"{away_team_name} is in excellent form, having won their last 10 matches and historically dominating {home_team_name}, making them strong favorites to win this Cup Quarter-final match. They also average 3.4 goals per game.",
    "subject": {
        "type": "team",
        "id": fixture_input['fixture']['awayTeamId'],
        "name": away_team_name
    },
    "supportLevel": "supported",
    "evidenceIds": [vikingur_form_evidence_id, vikingur_favorite_evidence_id, over_2_5_goals_evidence_id],
    "conflictStatus": "none",
    "metadata": {}
})
evidence_items[0]['claimIds'].append(vikingur_dominance_claim_id)
evidence_items[1]['claimIds'].append(vikingur_dominance_claim_id)
evidence_items[2]['claimIds'].append(vikingur_dominance_claim_id)

# Claim about IA Akranes being the underdog
ia_akranes_underdog_claim_id = generate_id()
claims.append({
    "id": ia_akranes_underdog_claim_id,
    "statement": f"{home_team_name} is the underdog in this match, having struggled against {away_team_name} historically and currently being lower in the league standings.",
    "subject": {
        "type": "team",
        "id": fixture_input['fixture']['homeTeamId'],
        "name": home_team_name
    },
    "supportLevel": "supported",
    "evidenceIds": [vikingur_form_evidence_id, vikingur_favorite_evidence_id],
    "conflictStatus": "none",
    "metadata": {}
})
evidence_items[0]['claimIds'].append(ia_akranes_underdog_claim_id)
evidence_items[1]['claimIds'].append(ia_akranes_underdog_claim_id)


# BTTS Claim
btts_claim_id = generate_id()
claims.append({
    "id": btts_claim_id,
    "statement": "The statistical probability for both teams to score (BTTS) is around 50-60% based on head-to-head history.",
    "subject": {
        "type": "market",
        "id": fixture_id,
        "market": "btts"
    },
    "supportLevel": "supported",
    "evidenceIds": [btts_probability_evidence_id],
    "conflictStatus": "none",
    "metadata": {}
})
evidence_items[3]['claimIds'].append(btts_claim_id)


# --- Handle Skipped Markets and Update Gate Result ---
markets_in_odds_snapshot = {q['market'] for q in odds_snapshot['quotes']}
for market in required_markets:
    if market not in markets_in_odds_snapshot:
        if market not in metadata['marketCoverage']['skippedMarkets']:
            metadata['marketCoverage']['skippedMarkets'].append(market)
            if gate_result['verdict'] == 'promotable':
                gate_result['verdict'] = 'review-required'
                gate_result['reasons'].append(f"Market '{market}' is required but not present in the odds snapshot.")

# Check for web-search source, especially if webMode is 'live'
if fixture_input['webMode'] == 'live':
    web_search_present = any(s['type'] == 'web-search' for s in sources)
    if not web_search_present:
        if gate_result['verdict'] == 'promotable':
            gate_result['verdict'] = 'review-required'
            gate_result['reasons'].append("webMode is 'live' but no 'web-search' source was included.")
        else:
            # If already review-required, just add the reason
            gate_result['reasons'].append("webMode is 'live' but no 'web-search' source was included.")

# If still promotable and no reasons, add a default promotable reason
if gate_result['verdict'] == 'promotable' and not gate_result['reasons']:
    gate_result['reasons'].append("Structured research generated with sufficient evidence and web-search included.")

# Final Output
output = {
    "sources": sources,
    "evidenceItems": evidence_items,
    "claims": claims,
    "gateResult": gate_result,
    "warnings": warnings,
    "metadata": metadata
}

print(json.dumps(output, indent=2))
