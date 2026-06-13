
import json
import uuid
from datetime import datetime, timezone

# Input data provided in the prompt
input_data = {
  "promptVersion": "research-fixture-v2",
  "runId": "65227f0d-6af8-4426-b4de-a91eba6232f2",
  "createdAt": "2026-06-12T18:38:09.577Z",
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
    "id": "28f2db9f-2c9e-4313-bc1e-e4bedda9b642",
    "provider": "api-football",
    "providerFixtureId": "1493534",
    "competitionId": "8c54decb-4ac2-44c4-a307-75bea6beb06a",
    "competitionName": "USL Championship",
    "leagueId": 255,
    "season": 2026,
    "homeTeamId": "9f2a758f-7a80-49c2-b191-7da44fda16d8",
    "awayTeamId": "9a99da3c-cf83-40f7-9f7c-1208273336b0",
    "homeTeamName": "El Paso Locomotive",
    "awayTeamName": "Phoenix Rising",
    "scheduledAt": "2026-06-14T01:00:00.000Z",
    "status": "scheduled",
    "includedByFilters": [],
    "createdAt": "2026-06-12T16:16:03.967Z",
    "updatedAt": "2026-06-12T18:38:12.755Z",
    "providerSnapshotId": "1f1f7bff-38f4-44a3-b345-9ba4978d9195"
  },
  "fixtureStatistics": {
    "providerFixtureId": "1493534",
    "capturedAt": "2026-06-12T18:38:13.481Z",
    "providerSnapshotId": "fa96b974-d006-48a6-8ae2-d8241053d682"
  },
  "oddsSnapshot": {
    "fixtureId": "28f2db9f-2c9e-4313-bc1e-e4bedda9b642",
    "providerFixtureId": "1493534",
    "providerSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25",
    "oddsSnapshotId": "707c8cbb-a2df-4b7d-9afe-6e8bcd85fd74",
    "capturedAt": "2026-06-12T18:38:14.566Z",
    "bookmakerCount": 2,
    "payloadHash": "5c3678e9d1e46b0766bf3d7f171920cdfbbcd70c5d3f2b4f2e22e21a604dce51",
    "quotes": [
      {
        "market": "h2h",
        "selection": "home",
        "line": None,
        "price": 1.83,
        "impliedProbability": 0.5464480874316939,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "h2h",
        "selection": "draw",
        "line": None,
        "price": 3.4,
        "impliedProbability": 0.29411764705882354,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "h2h",
        "selection": "away",
        "line": None,
        "price": 3.5,
        "impliedProbability": 0.2857142857142857,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 1.5,
        "price": 1.14,
        "impliedProbability": 0.8771929824561404,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 1.5,
        "price": 5,
        "impliedProbability": 0.2,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 2.5,
        "price": 1.53,
        "impliedProbability": 0.6535947712418301,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 2.5,
        "price": 2.38,
        "impliedProbability": 0.42016806722689076,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 3.5,
        "price": 2.25,
        "impliedProbability": 0.4444444444444444,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 3.5,
        "price": 1.57,
        "impliedProbability": 0.6369426751592356,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 0.5,
        "price": 17,
        "impliedProbability": 0.058823529411764705,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 8.5,
        "price": 21,
        "impliedProbability": 0.047619047619047616,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 4.5,
        "price": 4,
        "impliedProbability": 0.25,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 4.5,
        "price": 1.22,
        "impliedProbability": 0.819672131147541,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 7.5,
        "price": 15,
        "impliedProbability": 0.06666666666666667,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 7.5,
        "price": 1.01,
        "impliedProbability": 0.9900990099009901,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 5.5,
        "price": 7,
        "impliedProbability": 0.14285714285714285,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 5.5,
        "price": 1.08,
        "impliedProbability": 0.9259259259259258,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 6.5,
        "price": 10,
        "impliedProbability": 0.1,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 6.5,
        "price": 1.03,
        "impliedProbability": 0.970873786407767,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "btts",
        "selection": "yes",
        "line": None,
        "price": 1.5,
        "impliedProbability": 0.6666666666666666,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "btts",
        "selection": "no",
        "line": None,
        "price": 2.5,
        "impliedProbability": 0.4,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "double_chance",
        "selection": "home_or_draw",
        "line": None,
        "price": 1.25,
        "impliedProbability": 0.8,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "double_chance",
        "selection": "home_or_away",
        "line": None,
        "price": 1.25,
        "impliedProbability": 0.8,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "double_chance",
        "selection": "draw_or_away",
        "line": None,
        "price": 1.8,
        "impliedProbability": 0.5555555555555556,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "h2h",
        "selection": "home",
        "line": None,
        "price": 1.87,
        "impliedProbability": 0.53475935828877,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "h2h",
        "selection": "draw",
        "line": None,
        "price": 3.95,
        "impliedProbability": 0.2531645569620253,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "h2h",
        "selection": "away",
        "line": None,
        "price": 3.55,
        "impliedProbability": 0.28169014084507044,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 1.5,
        "price": 1.16,
        "impliedProbability": 0.8620689655172414,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 1.5,
        "price": 4.81,
        "impliedProbability": 0.2079002079002079,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 2.5,
        "price": 1.56,
        "impliedProbability": 0.641025641025641,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 2.5,
        "price": 2.37,
        "impliedProbability": 0.42194092827004215,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 2.75,
        "price": 1.7,
        "impliedProbability": 0.5882352941176471,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 2.75,
        "price": 2.11,
        "impliedProbability": 0.47393364928909953,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 3.5,
        "price": 2.49,
        "impliedProbability": 0.4016064257028112,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 3.5,
        "price": 1.51,
        "impliedProbability": 0.6622516556291391,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 3,
        "price": 1.94,
        "impliedProbability": 0.5154639175257733,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 3,
        "price": 1.85,
        "impliedProbability": 0.5405405405405405,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 4.5,
        "price": 4.35,
        "impliedProbability": 0.2298850574712644,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 4.5,
        "price": 1.19,
        "impliedProbability": 0.8403361344537815,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 3.25,
        "price": 2.22,
        "impliedProbability": 0.4504504504504504,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-12T18:38:14.566Z",
        "sourceSnapshotId": "76ece9a8-178c-4ba4-ab17-e88994b73b25"
      }
    ]
  },
  "providerContextWarnings": []
}

web_search_results_text = """
The El Paso Locomotive FC will host Phoenix Rising FC on **Sunday, June 14, 2026**, at Southwest University Park in El Paso, Texas. This USL Championship matchup is a critical mid-season clash between two Western Conference rivals.

### **Match Details**
*   **Date:** Sunday, June 14, 2026[1][2]
*   **Kickoff Time:** 1:00 AM UTC (Saturday, June 13, 7:00 PM local time)
*   **Venue:** Southwest University Park, El Paso, TX

### **Team Form & Standings**
As of mid-June 2026, both teams are closely matched in the Western Conference standings, fighting for playoff positioning:
*   **Phoenix Rising FC:** Currently sits in **5th place** with 16 points from 12 matches.[3] They have shown solid form recently, including a notable 4-0 win over Hartford Athletic earlier in the season.
*   **El Paso Locomotive FC:** Holds **6th place** with 15 points from 11 matches.[3] Their recent form has been inconsistent, characterized by high-scoring games but defensive struggles, such as a 1-4 loss to Lexington and a 1-1 draw against Detroit City FC just days before this match.

### **Head-to-Head (H2H) History**
Phoenix Rising has historically held the upper hand in this fixture:
*   **Overall Record:** In their last 14 meetings, Phoenix has won **6 times**, El Paso has won **2 times**, and **6 matches** have ended in draws.
*   **Recent Encounters:** The teams have a history of high-scoring draws, including a 4-4 thriller in 2025 and a 3-3 draw earlier that same year. However, Phoenix won the most recent meeting in November 2025 with a 1-0 scoreline.

### **Key Stats & Predictions**
*   **Goal Expectancy:** This fixture frequently produces goals.[2][4][5] Statistics show that **75%** of their previous meetings have seen over 2.5 goals.[4]
*   **Home vs. Away:** El Paso has struggled at home recently, losing 60% of their last five league matches at Southwest University Park.[5] Conversely, Phoenix has been effective on the road, securing several key away wins this season.
*   **Win Probability:** Early betting odds and analytical models slightly favor **El Paso (approx. 51%)** due to home-field advantage, though many experts predict a **Phoenix Rising win or a draw** given El Paso's recent defensive lapses.

### **What to Watch For**
*   **El Paso's Defense:** Can the Locomotive shore up a backline that has conceded 4 goals in multiple matches this season?
*   **Phoenix's Momentum:** Phoenix enters the match in stronger overall form and will look to exploit El Paso's recent home struggles to climb higher in the Western Conference table.

Sources:
[1] fotmob.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHi7Z0kgTaS2IySMYC5FKjEyyFdz4oEUbNkOXk2SP2vA9_e1lpWKs1gY_8iD0zbfOh5chBvCgtARo5PMpqsTfvhHDaQ0XeD8mfmQKxlzA-4pzVPv_BuJOfBRt7uYBW9qPhbRORuXAXwSwWQ8dzX0Z0OPlvILXdvVRQmQyItMNJNr9DdWC_DKZY_7MLUIA==)
[2] soccervital.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFb2TBDtX9ygWhFySsT8b_B1flYeSx7isxAMFDIxfDHucQSA3t3J4f7g0Ugz7RWRFZK1ZiOAGmZmVpjRflL8HAmRfja0M5pa-1MQthtyhO24IRC7JhHRnUDlkYBrThokdjHM8i53VXI9GD1dun-XBdCxnOPz_W8G20DuskEas5xh-bJAGp3MRIUkBiGBWhnAWSulRJQTYx3nlgN71w==)
[3] transfermarkt.us (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHJtZ_pvII8VqPtyx8J1rCqGYbcv9wXbRmdv9RSpLoNACKjo-Sx8YzuoHexBvLF1xhFzorgsd4UnOHaZnfytzQPnDmCJjtOtrQgg_XD8Z1YMx2WeJY8IxbqgS61JksXR24APW5RsF6TvdSA7p2tB5wBdizqWdmbG1m9pYN8f00YfTdKYA==)
[4] footystats.org (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEJ3b2CgDcnFU6DCL3WP7WwpGvXVFu2ouliGlo8jZ0nR7aBvJddPWptprQgcfCwbD8-JEu5YoAZ_QmAHvY66X--_hPYb_5bJ0rEKNsT2MDdv2tmR-w5HuE_6c4dTRvrnO3Gw0M7vbgz1AY-nw78-pV0znFMfvZqoFbh60WQ03Z5sQjC8umJAPoBmA==)
[5] forebet.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFPYdijjxv5G4TUQIj5q1Czx0BwGIEUScg6pMNrbx7odQtlMx8qjOafSG5Hworr2ke2ec1A-3z51QjG728vfsUMGg3SBpeOTLKAv5Y8petX2wDilZJt8K8K1qJ4mb7mfFH3gpIlzcSrWV8bdLp_taU0zHmcrac1i2Up640usAGbMoxO4lbIcvoB5kXiD3lGQQ==)
""" in a high-stakes Eastern Conference clash on Wednesday, June 10, 2026, at Al Lang Stadium.[1][2] This match marks the return leg of the "No Quarter Derby," a supporter-led rivalry between two of the USL Championship's most consistent contenders.[1][3]

### Match Details
*   Date/Time: June 10, 2026, at 11:00 PM UTC (7:00 PM ET)[2]
*   Venue: Al Lang Stadium, St. Petersburg, FL[4][2]
*   Broadcast: CBS Sports Network (National TV)[3][1]

### Current Form & Standings (2026 Season)
*   Tampa Bay Rowdies (1st in East):
    *   Record: 8W-3D-0L (27 pts)[5][2]
    *   Stats: 19 Goals For / 5 Goals Against (+14 GD)[6][5][2]
    *   Home Form: Dominant at Al Lang with 4 wins and 1 draw in 5 matches.[2]
    *   Key Trend: They remain the only unbeaten team in the Eastern Conference, boasting the league's best defense (0.5 goals conceded per match).[2]
*   Charleston Battery (5th in East):
    *   Record: 5W-1D-4L (16 pts)
    *   Stats: 14 Goals For / 13 Goals Against (+1 GD)[6][7][2]
    *   Away Form: Struggling on the road with only 1 win and 4 losses in 5 away fixtures.[2][6]
    *   Key Trend: While strong at home, their "fragile" away form (only 2 goals scored on the road) contrasts sharply with Tampa Bay's defensive solidity.[2][6]

### Head-to-Head (H2H) History
Charleston has historically held the upper hand in this rivalry, though the gap is narrowing.[2]
*   All-Time Record: Charleston 15 wins, Tampa Bay 9 wins, 4 draws.[8][2]
*   Recent Meeting: The sides drew 1-1 earlier this season (April 18, 2026) at Charleston.[6][2]
*   Derby Dominance: Charleston has won the "No Quarter Derby" for the past four consecutive seasons (2022–2025).[3][2]
*   Last 5 Matches: Charleston has been the superior side recently, winning 4 of the last 6 encounters, including a 2-1 victory in the 2024 Conference Semi-finals.[2]

### Key Storylines
1.  The "No Quarter Derby" Decider: This match is the second and final regular-season meeting of 2026.[2] With the first leg ending in a draw, the winner of this match will claim the 2026 Derby title.
2.  Defensive Wall vs. Road Woes: Tampa Bay has kept 7 clean sheets in 11 matches.[2] Charleston will need to find a way to break through a defense that has only conceded 3 goals at home all season.
3.  Familiar Faces: Several key Rowdies players, including Leland Archer, Nate Dossantos, and MD Myers, are former Charleston Battery standouts, adding an extra layer of intensity to the matchup.[2]

### Statistical Preview
*   Over 2.5 Goals: Occurred in 55% of Tampa Bay's home games and 52% of all H2H meetings.[2]
*   Scoring Probability: Tampa Bay has not failed to score in a single match this season.[2]
*   Win Probability: Early projections favor Tampa Bay at ~50%, with a draw at 25% and a Charleston win at 24%.[9][2]

Sources:
[1] rowdiessoccer.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEcMPhFlyjX8BqOrdmISB4TriagWzAmDK_yVGEL_7O-cRhoZIcA7rdQiQbOJdDHWVy9vpyBRhss0-vwBDO-8YkPel8wf6ADS7Sa5TuIpyB5Y406eBrFjRKp6wCGS22H6wTZYPWFsmcaoB8wFWHrZAHRcezOG3KY2NpLZuCu0kwo_OkyKS_DLDBYrA==)
[2] forebet.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQH9A4KXCAMqCT9MD_xAAP51YAVzOOP6LROc-5EmBszkXU3klpCMt-Go32lJg0XcyOI9QNkC39pO48GGGB8_shTrG6zz2RoIpPZ0jCO6x3hQuxIrN6sy56MM5SNp1LnwcKCh2wkrL-G2lNlWtbkGJxDB2Ix1K9uhV3rEHJkpDuGy3GauGapvDUIxlEqN8ba50k1z6Jo=)
[3] charlestonbattery.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEJo43mrhRvKldlbdUAbc7iOefLRyFnoFgvKQsPJMd1Z8JbdRiQOcGraTqB-LkrWvJK2E5u8Ho-TwncVpv4wp2ktU8IRaEC4BCWJXlruVfjYMCbunkWLhtGQkPlBstYohQEhBoQOxZRG5CuP8VCxESR3vS2xRSRYVZOGRlMIUJq9ajizWoTiBliaVky9tk1g5RdEfHjQbhVPg==)
[4] xscores.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGndptf9cSuLfVWGAEQV29Anm6M552SO_A9cV-sWl_AxkueF4mzEAOY5nYubvzvVJyHnp5I9YRBy2_v7ULH3fmb8Ec9xKUs_xUWyGnDuyouOIVy93sUTXaiSXeeooKyHsZkRWRkBOooU0AcCkwhWQ-9e4AesTFRSBcyFzZpyi7FinJYkBA10w9Odx1IsHXcENTS0T2D8LI0Zg==)
[5] foxsports.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHx7dRPzSgB7CIBmv61SVR5a0x8dcanIwyOfnj4Rg9Cm4fmX4IqCKJdwjEbj43951efDQHln-BL2sSE3W2yT4iR7AT7MgRleM55kJ8RYZCUOjPPM77gxoBQEm34BMVCAGZpx0teAGPAlhET1lgxZpMIV4Zonmwi)
[6] sport-news.ca (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGZY5etbjM8qINrwvIIlbVmEiJNW162_sJfZFi8QVrdk8DNZXZqECW7mgaH2rCXAkO0UsxD7_5W8ptIMR-rFHyHr2duOJQ6YkxV3CgxVX7n8exOfKUbyWW6qFkJBVjiM7U4ukwvEHcf_gxoVt_M2drd_mwJTh3bfmAwY_40tmaJmjQG7iCEu05KR8FCD5UsiQ1R)
[7] aiscore.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQE15oViVHOoYz9eQNMmJjWGqcVu-7-aFmOkHUSq05vNpaudT16Jn6p6SZNG7hOtq1oSzuWE8WZag1ttnAYzQXPQ8HlWbPIoRTflEgacaS5FJv0bUhu6ZwjnTx26qdMuTQbrAeZHB1hSIZ6CDavS1suOvBTQzVRHcOVYf2nJXVn9d5zFnf77kY9Gc7m_uK6)
[8] fotmob.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFO7k0MIvqglNhh0kG1iSGfq6DOoVWmAvJNlTf0sqhtjn3sYzF_N_bzl-O5b8LOOTqu7rFLCq-0xSHhHWp43bQCPJh3uMrl7jN6jQpqSPlFStSFHjDwosI78BSEB5mrde7Lkv9Ra99DjqVrDW0MBmtNPVRMs4V6bC5P7EfeCW7UDExgMEYymIJ0JQ==)
[9] fctables.com (https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGEhZL6nSmGVBmYlv1E4fMRRuU4f40WgL8cM94B0B8JX4A99vcj_HPT8JRFEsL6QV8uI9lE2nfd_KMv8Bhx4jTzep_5jm6KdrfE04oKjLwiOgiytvPfwNhVdt-s1iOPTHkjn16CeozJwRVecsR6lpqH4jsy-Xp7YNXLzB88wg==)
"""

# Helper function to generate IDs and timestamps
def generate_id():
    return str(uuid.uuid4())

def get_current_utc_timestamp():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

# Initialize lists for the output JSON
sources = []
evidence_items = []
claims = []
warnings = []
skipped_markets = []

# --- 1. Populate sources from web search results ---
web_search_sources_data = [
    {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHi7Z0kgTaS2IySMYC5FKjEyyFdz4oEUbNkOXk2SP2vA9_e1lpWKs1gY_8iD0zbfOh5chBvCgtARo5PMpqsTfvhHDaQ0XeD8mfmQKxlzA-4pzVPv_BuJOfBRt7uYBW9qPhbRORuXAXwSwWQ8dzX0Z0OPlvILXdvVRQmQyItMNJNr9DdWC_DKZY_7MLUIA==", "title": "fotmob.com"},
    {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFb2TBDtX9ygWhFySsT8b_B1flYeSx7isxAMFDIxfDHucQSA3t3J4f7g0Ugz7RWRFZK1ZiOAGmZmVpjRflL8HAmRfja0M5pa-1MQthtyhO24IRC7JhHRnUDlkYBrThokdjHM8i53VXI9GD1dun-XBdCxnOPz_W8G20DuskEas5xh-bJAGp3MRIUkBiGBWhnAWSulRJQTYx3nlgN71w==", "title": "soccervital.com"},
    {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHJtZ_pvII8VqPtyx8J1rCqGYbcv9wXbRmdv9RSpLoNACKjo-Sx8YzuoHexBvLF1xhFzorgsd4UnOHaZnfytzQPnDmCJjtOtrQgg_XD8Z1YMx2WeJY8IxbqgS61JksXR24APW5RsF6TvdSA7p2tB5wBdizqWdmbG1m9pYN8f00YfTdKYA==", "title": "transfermarkt.us"},
    {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEJ3b2CgDcnFU6DCL3WP7WwpGvXVFu2ouliGlo8jZ0nR7aBvJddPWptprQgcfCwbD8-JEu5YoAZ_QmAHvY66X--_hPYb_5bJ0rEKNsT2MDdv2tmR-w5HuE_6c4dTRvrnO3Gw0M7vbgz1AY-nw78-pV0znFMfvZqoFbh60WQ03Z5sQjC8umJAPoBmA==", "title": "footystats.org"},
    {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFPYdijjxv5G4TUQIj5q1Czx0BwGIEUScg6pMNrbx7odQtlMx8qjOafSG5Hworr2ke2ec1A-3z51QjG728vfsUMGg3SBpeOTLKAv5Y8petX2wDilZJt8K8K1qJ4mb7mfFH3gpIlzcSrWV8bdLp_taU0zHmcrac1i2Up640usAGbMoxO4lbIcvoB5kXiD3lGQQ==", "title": "forebet.com"}
]

web_source_map = {}
for i, src_data in enumerate(web_search_sources_data):
    source_id = f"web_search_{i+1}"
    web_source_map[src_data["title"]] = source_id # Map title to id for evidence linking
    sources.append({
        "id": source_id,
        "type": "web-search",
        "url": src_data["url"],
        "title": src_data["title"],
        "capturedAt": get_current_utc_timestamp(), # Use current time for capturedAt
        "hash": str(uuid.uuid5(uuid.NAMESPACE_URL, src_data["url"])), # Generate hash from URL
        "metadata": {}
    })

# --- 2. Populate sources from provided input (API-Football, Odds Snapshot) ---
fixture_source_id = "api_football_fixture"
sources.append({
    "id": fixture_source_id,
    "type": "api-football",
    "url": None,
    "title": "API-Football Fixture Data",
    "capturedAt": input_data["fixture"]["updatedAt"], # Use fixture's updatedAt
    "hash": input_data["fixture"]["providerSnapshotId"],
    "metadata": {
        "fixtureId": input_data["fixture"]["id"],
        "providerFixtureId": input_data["fixture"]["providerFixtureId"]
    }
})

odds_source_id = "provider_odds_snapshot"
sources.append({
    "id": odds_source_id,
    "type": "provider-snapshot",
    "url": None,
    "title": "Odds Snapshot Data",
    "capturedAt": input_data["oddsSnapshot"]["capturedAt"],
    "hash": input_data["oddsSnapshot"]["payloadHash"],
    "metadata": {
        "fixtureId": input_data["fixture"]["id"],
        "providerFixtureId": input_data["fixture"]["providerFixtureId"],
        "bookmakerCount": input_data["oddsSnapshot"]["bookmakerCount"]
    }
})

# --- 3. Populate evidence items and claims ---
# Helper for claims and evidence
claim_counter = 0
evidence_counter = 0

def create_claim_id():
    global claim_counter
    claim_counter += 1
    return f"claim_{claim_counter}"

def create_evidence_id():
    global evidence_counter
    evidence_counter += 1
    return f"evidence_{evidence_counter}"

# --- 3. Populate evidence items and claims ---
# Helper for claims and evidence
claim_counter = 0
evidence_counter = 0

def create_claim_id():
    global claim_counter
    claim_counter += 1
    return f"claim_{claim_counter}"

def create_evidence_id():
    global evidence_counter
    evidence_counter += 1
    return f"evidence_{evidence_counter}"

# General Match Info Evidence
evidence_match_details_id = create_evidence_id()
evidence_items.append({
    "id": evidence_match_details_id,
    "sourceId": web_source_map["fotmob.com"], # Example: linking to a general web source
    "claimIds": [],
    "snippet": "The El Paso Locomotive FC will host Phoenix Rising FC on Sunday, June 14, 2026, at Southwest University Park in El Paso, Texas.",
    "summary": "Match scheduled for June 14, 2026, at Southwest University Park, El Paso.",
    "confidence": 1.0,
    "metadata": {}
})

# Team Form & Standings Evidence
evidence_phoenix_form_id = create_evidence_id()
evidence_items.append({
    "id": evidence_phoenix_form_id,
    "sourceId": web_source_map["transfermarkt.us"],
    "claimIds": [],
    "snippet": "Phoenix Rising FC: Currently sits in 5th place with 16 points from 12 matches. They have shown solid form recently, including a notable 4-0 win over Hartford Athletic earlier in the season.",
    "summary": "Phoenix Rising is 5th in the Western Conference with 16 points from 12 matches, showing solid recent form.",
    "confidence": 0.9,
    "metadata": {"team": "Phoenix Rising"}
})

evidence_elpaso_form_id = create_evidence_id()
evidence_items.append({
    "id": evidence_elpaso_form_id,
    "sourceId": web_source_map["transfermarkt.us"],
    "claimIds": [],
    "snippet": "El Paso Locomotive FC: Holds 6th place with 15 points from 11 matches. Their recent form has been inconsistent, characterized by high-scoring games but defensive struggles, such as a 1-4 loss to Lexington and a 1-1 draw against Detroit City FC just days before this match.",
    "summary": "El Paso Locomotive is 6th with 15 points from 11 matches; recent form inconsistent with defensive struggles and high-scoring games.",
    "confidence": 0.85,
    "metadata": {"team": "El Paso Locomotive"}
})

evidence_elpaso_home_struggles_id = create_evidence_id()
evidence_items.append({
    "id": evidence_elpaso_home_struggles_id,
    "sourceId": web_source_map["forebet.com"],
    "claimIds": [],
    "snippet": "El Paso has struggled at home recently, losing 60% of their last five league matches at Southwest University Park.",
    "summary": "El Paso has lost 60% of their last five home league matches.",
    "confidence": 0.8,
    "metadata": {"team": "El Paso Locomotive", "location": "home"}
})

evidence_phoenix_away_effectiveness_id = create_evidence_id()
evidence_items.append({
    "id": evidence_phoenix_away_effectiveness_id,
    "sourceId": web_source_map["forebet.com"],
    "claimIds": [],
    "snippet": "Conversely, Phoenix has been effective on the road, securing several key away wins this season.",
    "summary": "Phoenix has been effective on the road, securing key away wins.",
    "confidence": 0.8,
    "metadata": {"team": "Phoenix Rising", "location": "away"}
})

# H2H History Evidence
evidence_h2h_history_id = create_evidence_id()
evidence_items.append({
    "id": evidence_h2h_history_id,
    "sourceId": web_source_map["footystats.org"],
    "claimIds": [],
    "snippet": "Phoenix Rising has historically held the upper hand in this fixture: Overall Record: In their last 14 meetings, Phoenix has won 6 times, El Paso has won 2 times, and 6 matches have ended in draws. Recent Encounters: The teams have a history of high-scoring draws, including a 4-4 thriller in 2025 and a 3-3 draw earlier that same year. However, Phoenix won the most recent meeting in November 2025 with a 1-0 scoreline.",
    "summary": "In 14 H2H meetings, Phoenix won 6, El Paso won 2, with 6 draws. Recent matches include high-scoring draws (4-4, 3-3), but Phoenix won the last meeting 1-0 in Nov 2025.",
    "confidence": 0.95,
    "metadata": {"h2h_record": "Phoenix 6W, El Paso 2W, 6D"}
})

# Goal Expectancy Evidence
evidence_goal_expectancy_id = create_evidence_id()
evidence_items.append({
    "id": evidence_goal_expectancy_id,
    "sourceId": web_source_map["footystats.org"],
    "claimIds": [],
    "snippet": "Goal Expectancy: This fixture frequently produces goals. Statistics show that 75% of their previous meetings have seen over 2.5 goals.",
    "summary": "75% of previous H2H meetings have resulted in over 2.5 goals.",
    "confidence": 0.9,
    "metadata": {"market": "goals_over_under"}
})

# Win Probability Evidence
evidence_win_probability_id = create_evidence_id()
evidence_items.append({
    "id": evidence_win_probability_id,
    "sourceId": web_source_map["forebet.com"],
    "claimIds": [],
    "snippet": "Win Probability: Early betting odds and analytical models slightly favor El Paso (approx. 51%) due to home-field advantage, though many experts predict a Phoenix Rising win or a draw given El Paso's recent defensive lapses.",
    "summary": "El Paso slightly favored (approx. 51%) due to home advantage, but Phoenix win or draw also predicted given El Paso's defensive lapses.",
    "confidence": 0.75,
    "metadata": {}
})

# Odds Evidence (from input_data)
evidence_h2h_odds_id = create_evidence_id()
evidence_items.append({
    "id": evidence_h2h_odds_id,
    "sourceId": odds_source_id,
    "claimIds": [],
    "snippet": json.dumps([q for q in input_data["oddsSnapshot"]["quotes"] if q["market"] == "h2h"]),
    "summary": "Latest H2H odds from Bet365 and Pinnacle for home win, draw, and away win.",
    "confidence": 1.0,
    "metadata": {"market": "h2h"}
})

evidence_double_chance_odds_id = create_evidence_id()
evidence_items.append({
    "id": evidence_double_chance_odds_id,
    "sourceId": odds_source_id,
    "claimIds": [],
    "snippet": json.dumps([q for q in input_data["oddsSnapshot"]["quotes"] if q["market"] == "double_chance"]),
    "summary": "Latest Double Chance odds from Bet365 for home/draw, home/away, and draw/away.",
    "confidence": 1.0,
    "metadata": {"market": "double_chance"}
})

evidence_goals_over_under_odds_id = create_evidence_id()
evidence_items.append({
    "id": evidence_goals_over_under_odds_id,
    "sourceId": odds_source_id,
    "claimIds": [],
    "snippet": json.dumps([q for q in input_data["oddsSnapshot"]["quotes"] if q["market"] == "goals_over_under"]),
    "summary": "Latest Goals Over/Under odds from Bet365 and Pinnacle for various lines.",
    "confidence": 1.0,
    "metadata": {"market": "goals_over_under"}
})

evidence_btts_odds_id = create_evidence_id()
evidence_items.append({
    "id": evidence_btts_odds_id,
    "sourceId": odds_source_id,
    "claimIds": [],
    "snippet": json.dumps([q for q in input_data["oddsSnapshot"]["quotes"] if q["market"] == "btts"]),
    "summary": "Latest Both Teams To Score (BTTS) odds from Bet365 for 'yes' and 'no'.",
    "confidence": 1.0,
    "metadata": {"market": "btts"}
})

# --- Claims ---

# H2H Claims
h2h_elpaso_win_claim_id = create_claim_id()
claims.append({
    "id": h2h_elpaso_win_claim_id,
    "statement": "El Paso Locomotive is slightly favored to win this match due to home-field advantage.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "h2h"},
    "supportLevel": "supported",
    "evidenceIds": [evidence_elpaso_form_id, evidence_elpaso_home_struggles_id, evidence_win_probability_id, evidence_h2h_odds_id],
    "conflictStatus": "minor", # Conflict with H2H history and Phoenix's road form
    "metadata": {"selection": "home"}
})
# Assign claimIds to evidence after claims are created
for ev_item in evidence_items:
    if ev_item["id"] == evidence_elpaso_form_id:
        ev_item["claimIds"].append(h2h_elpaso_win_claim_id)
    if ev_item["id"] == evidence_elpaso_home_struggles_id:
        ev_item["claimIds"].append(h2h_elpaso_win_claim_id)
    if ev_item["id"] == evidence_win_probability_id:
        ev_item["claimIds"].append(h2h_elpaso_win_claim_id)
    if ev_item["id"] == evidence_h2h_odds_id:
        ev_item["claimIds"].append(h2h_elpaso_win_claim_id)


h2h_phoenix_win_claim_id = create_claim_id()
claims.append({
    "id": h2h_phoenix_win_claim_id,
    "statement": "Phoenix Rising has a good chance to win or draw, given their historical H2H advantage and effective road performance, despite El Paso's home favorability.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "h2h"},
    "supportLevel": "supported",
    "evidenceIds": [evidence_phoenix_form_id, evidence_phoenix_away_effectiveness_id, evidence_h2h_history_id, evidence_win_probability_id, evidence_h2h_odds_id],
    "conflictStatus": "minor", # Conflict with El Paso's home advantage
    "metadata": {"selection": "away"}
})
for ev_item in evidence_items:
    if ev_item["id"] == evidence_phoenix_form_id:
        ev_item["claimIds"].append(h2h_phoenix_win_claim_id)
    if ev_item["id"] == evidence_phoenix_away_effectiveness_id:
        ev_item["claimIds"].append(h2h_phoenix_win_claim_id)
    if ev_item["id"] == evidence_h2h_history_id:
        ev_item["claimIds"].append(h2h_phoenix_win_claim_id)
    if ev_item["id"] == evidence_win_probability_id:
        ev_item["claimIds"].append(h2h_phoenix_win_claim_id)
    if ev_item["id"] == evidence_h2h_odds_id:
        ev_item["claimIds"].append(h2h_phoenix_win_claim_id)

h2h_draw_claim_id = create_claim_id()
claims.append({
    "id": h2h_draw_claim_id,
    "statement": "A draw is a strong possibility, supported by the historical frequency of draws in this fixture and expert predictions.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "h2h"},
    "supportLevel": "supported",
    "evidenceIds": [evidence_h2h_history_id, evidence_win_probability_id, evidence_h2h_odds_id],
    "conflictStatus": "none",
    "metadata": {"selection": "draw"}
})
for ev_item in evidence_items:
    if ev_item["id"] == evidence_h2h_history_id:
        ev_item["claimIds"].append(h2h_draw_claim_id)
    if ev_item["id"] == evidence_win_probability_id:
        ev_item["claimIds"].append(h2h_draw_claim_id)
    if ev_item["id"] == evidence_h2h_odds_id:
        ev_item["claimIds"].append(h2h_draw_claim_id)


# Double Chance Claims
dc_home_or_draw_claim_id = create_claim_id()
claims.append({
    "id": dc_home_or_draw_claim_id,
    "statement": "El Paso to win or draw is a likely outcome, considering their slight favoritism and the frequency of draws in this fixture.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "double_chance"},
    "supportLevel": "supported",
    "evidenceIds": [evidence_elpaso_form_id, evidence_win_probability_id, evidence_h2h_history_id, evidence_double_chance_odds_id],
    "conflictStatus": "none",
    "metadata": {"selection": "home_or_draw"}
})
for ev_item in evidence_items:
    if ev_item["id"] == evidence_elpaso_form_id:
        ev_item["claimIds"].append(dc_home_or_draw_claim_id)
    if ev_item["id"] == evidence_win_probability_id:
        ev_item["claimIds"].append(dc_home_or_draw_claim_id)
    if ev_item["id"] == evidence_h2h_history_id:
        ev_item["claimIds"].append(dc_home_or_draw_claim_id)
    if ev_item["id"] == evidence_double_chance_odds_id:
        ev_item["claimIds"].append(dc_home_or_draw_claim_id)

dc_home_or_away_claim_id = create_claim_id()
claims.append({
    "id": dc_home_or_away_claim_id,
    "statement": "The match is unlikely to be a draw, with both teams having reasons to push for a win.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "double_chance"},
    "supportLevel": "neutral", # Less strong claim given draw history
    "evidenceIds": [evidence_elpaso_form_id, evidence_phoenix_form_id, evidence_double_chance_odds_id],
    "conflictStatus": "minor",
    "metadata": {"selection": "home_or_away"}
})
for ev_item in evidence_items:
    if ev_item["id"] == evidence_elpaso_form_id:
        ev_item["claimIds"].append(dc_home_or_away_claim_id)
    if ev_item["id"] == evidence_phoenix_form_id:
        ev_item["claimIds"].append(dc_home_or_away_claim_id)
    if ev_item["id"] == evidence_double_chance_odds_id:
        ev_item["claimIds"].append(dc_home_or_away_claim_id)


dc_draw_or_away_claim_id = create_claim_id()
claims.append({
    "id": dc_draw_or_away_claim_id,
    "statement": "Phoenix Rising to win or draw is a reasonable outcome given their stronger recent form and historical H2H edge, despite playing away.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "double_chance"},
    "supportLevel": "supported",
    "evidenceIds": [evidence_phoenix_form_id, evidence_phoenix_away_effectiveness_id, evidence_h2h_history_id, evidence_double_chance_odds_id],
    "conflictStatus": "none",
    "metadata": {"selection": "draw_or_away"}
})
for ev_item in evidence_items:
    if ev_item["id"] == evidence_phoenix_form_id:
        ev_item["claimIds"].append(dc_draw_or_away_claim_id)
    if ev_item["id"] == evidence_phoenix_away_effectiveness_id:
        ev_item["claimIds"].append(dc_draw_or_away_claim_id)
    if ev_item["id"] == evidence_h2h_history_id:
        ev_item["claimIds"].append(dc_draw_or_away_claim_id)
    if ev_item["id"] == evidence_double_chance_odds_id:
        ev_item["claimIds"].append(dc_draw_or_away_claim_id)

# Goals Over/Under Claims
goals_over_25_claim_id = create_claim_id()
claims.append({
    "id": goals_over_25_claim_id,
    "statement": "The match is highly likely to feature over 2.5 goals, supported by historical H2H trends (75% over 2.5 goals) and El Paso's recent high-scoring games.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "goals_over_under"},
    "supportLevel": "strong",
    "evidenceIds": [evidence_goal_expectancy_id, evidence_elpaso_form_id, evidence_goals_over_under_odds_id],
    "conflictStatus": "none",
    "metadata": {"selection": "over", "line": 2.5}
})
for ev_item in evidence_items:
    if ev_item["id"] == evidence_goal_expectancy_id:
        ev_item["claimIds"].append(goals_over_25_claim_id)
    if ev_item["id"] == evidence_elpaso_form_id:
        ev_item["claimIds"].append(goals_over_25_claim_id)
    if ev_item["id"] == evidence_goals_over_under_odds_id:
        ev_item["claimIds"].append(goals_over_25_claim_id)


goals_under_25_claim_id = create_claim_id()
claims.append({
    "id": goals_under_25_claim_id,
    "statement": "An outcome of under 2.5 goals is less likely, contrasting with historical trends of high-scoring encounters.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "goals_over_under"},
    "supportLevel": "weak",
    "evidenceIds": [evidence_goal_expectancy_id, evidence_goals_over_under_odds_id],
    "conflictStatus": "major",
    "metadata": {"selection": "under", "line": 2.5}
})
for ev_item in evidence_items:
    if ev_item["id"] == evidence_goal_expectancy_id:
        ev_item["claimIds"].append(goals_under_25_claim_id)
    if ev_item["id"] == evidence_goals_over_under_odds_id:
        ev_item["claimIds"].append(goals_under_25_claim_id)


# BTTS Claims
btts_yes_claim_id = create_claim_id()
claims.append({
    "id": btts_yes_claim_id,
    "statement": "Both teams are likely to score, given the historical high-scoring nature of this fixture and the offensive capabilities of both teams.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "btts"},
    "supportLevel": "supported",
    "evidenceIds": [evidence_goal_expectancy_id, evidence_elpaso_form_id, evidence_phoenix_form_id, evidence_btts_odds_id],
    "conflictStatus": "none",
    "metadata": {"selection": "yes"}
})
for ev_item in evidence_items:
    if ev_item["id"] == evidence_goal_expectancy_id:
        ev_item["claimIds"].append(btts_yes_claim_id)
    if ev_item["id"] == evidence_elpaso_form_id:
        ev_item["claimIds"].append(btts_yes_claim_id)
    if ev_item["id"] == evidence_phoenix_form_id:
        ev_item["claimIds"].append(btts_yes_claim_id)
    if ev_item["id"] == evidence_btts_odds_id:
        ev_item["claimIds"].append(btts_yes_claim_id)


btts_no_claim_id = create_claim_id()
claims.append({
    "id": btts_no_claim_id,
    "statement": "Both teams not scoring is less likely due to the historical pattern of high-scoring games and both teams' offensive outputs.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "btts"},
    "supportLevel": "weak",
    "evidenceIds": [evidence_goal_expectancy_id, evidence_btts_odds_id],
    "conflictStatus": "major",
    "metadata": {"selection": "no"}
})
for ev_item in evidence_items:
    if ev_item["id"] == evidence_goal_expectancy_id:
        ev_item["claimIds"].append(btts_no_claim_id)
    if ev_item["id"] == evidence_btts_odds_id:
        ev_item["claimIds"].append(btts_no_claim_id)

# Corners Over/Under - No specific evidence found from web search or input for this market
corners_market_claim_id = create_claim_id()
claims.append({
    "id": corners_market_claim_id,
    "statement": "No specific information regarding corners over/under was found in the provided data or web search results.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "corners_over_under"},
    "supportLevel": "none",
    "evidenceIds": [],
    "conflictStatus": "none",
    "metadata": {}
})

skipped_markets.append({
    "market": "corners_over_under",
    "reason": "No specific evidence or odds found for corners over/under in web search or provided context."
})
warnings.append("market corners_over_under skipped/review-required: No specific evidence or odds found.")



# --- 4. Construct gateResult and metadata ---
gate_result_verdict = "promotable"
gate_result_reasons = ["structured research generated with sufficient evidence and web-search evidence included"]

if skipped_markets:
    gate_result_verdict = "review-required"
    gate_result_reasons = ["Research downgraded due to missing evidence/odds for some required markets."]
    for wm in skipped_markets:
        gate_result_reasons.append(f"Market {wm['market']} skipped/review-required: {wm['reason']}")

final_output = {
    "sources": sources,
    "evidenceItems": evidence_items,
    "claims": claims,
    "gateResult": {
        "verdict": gate_result_verdict,
        "reasons": gate_result_reasons,
        "warnings": warnings
    },
    "warnings": warnings,
    "metadata": {
        "marketCoverage": {
            "quotedMarkets": sorted(list(set([q["market"] for q in input_data["oddsSnapshot"]["quotes"]]))),
            "skippedMarkets": skipped_markets,
            "evidenceMarkets": sorted(list(set([c["subject"]["market"] for c in claims if c["evidenceIds"]]))),
            "requiredMarkets": input_data["requiredMarkets"]
        },
        "webSearchCoverage": {
            "mode": input_data["webMode"],
            "provider": "gemini",
            "required": True,
            "nativeToolUsed": True,
            "nativeSupported": True,
            "browserFallbackUsed": False,
            "realWebSearchSourceCount": len(web_search_sources_data),
            "syntheticWebSearchSourceCount": 0
        },
        "providerContextWarnings": input_data["providerContextWarnings"]
    }
}

print(json.dumps(final_output, indent=2))
