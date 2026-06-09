
import json
import uuid
from datetime import datetime, timezone

# Input data provided in the prompt
input_data = {
  "promptVersion": "research-fixture-v2",
  "runId": "c4046750-b58d-4bb8-b9c4-9472a301ba06",
  "createdAt": "2026-06-09T16:42:28.835Z",
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
    "id": "a61e11ce-e516-47aa-a82b-f50464b63a27",
    "provider": "api-football",
    "providerFixtureId": "1493530",
    "competitionId": "8c54decb-4ac2-44c4-a307-75bea6beb06a",
    "competitionName": "USL Championship",
    "leagueId": 255,
    "season": 2026,
    "homeTeamId": "c50e136a-8956-4e81-83f7-446aea7b38f7",
    "awayTeamId": "e6cd3208-2a08-40c1-a212-561a4bf442b3",
    "homeTeamName": "Tampa Bay Rowdies",
    "awayTeamName": "Charleston Battery",
    "scheduledAt": "2026-06-10T23:00:00.000Z",
    "status": "scheduled",
    "includedByFilters": [],
    "createdAt": "2026-06-09T16:15:55.235Z",
    "updatedAt": "2026-06-09T16:42:34.226Z",
    "providerSnapshotId": "fd665f13-c63a-4589-9e46-880c94766f69"
  },
  "fixtureStatistics": {
    "providerFixtureId": "1493530",
    "capturedAt": "2026-06-09T16:42:35.089Z",
    "providerSnapshotId": "0cb5e743-0a7a-4456-bd17-446d2472c343"
  },
  "oddsSnapshot": {
    "fixtureId": "a61e11ce-e516-47aa-a82b-f50464b63a27",
    "providerFixtureId": "1493530",
    "providerSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586",
    "oddsSnapshotId": "54a95afd-deac-4bf9-9e8a-d06781156400",
    "capturedAt": "2026-06-09T16:42:37.494Z",
    "bookmakerCount": 2,
    "payloadHash": "e718a8047adab449629340a5e129ad1eb2c29064481560cc373a313fa93dad18",
    "quotes": [
      {
        "market": "h2h",
        "selection": "home",
        "line": None,
        "price": 1.8,
        "impliedProbability": 0.5555555555555556,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "h2h",
        "selection": "draw",
        "line": None,
        "price": 3.6,
        "impliedProbability": 0.2777777777777778,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "h2h",
        "selection": "away",
        "line": None,
        "price": 3.7,
        "impliedProbability": 0.27027027027027023,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 1.5,
        "price": 1.22,
        "impliedProbability": 0.819672131147541,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 1.5,
        "price": 4,
        "impliedProbability": 0.25,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 2.5,
        "price": 1.7,
        "impliedProbability": 0.5882352941176471,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 2.5,
        "price": 2.1,
        "impliedProbability": 0.47619047619047616,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 3.5,
        "price": 2.62,
        "impliedProbability": 0.38167938931297707,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 3.5,
        "price": 1.44,
        "impliedProbability": 0.6944444444444444,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 0.5,
        "price": 1.04,
        "impliedProbability": 0.9615384615384615,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 0.5,
        "price": 9,
        "impliedProbability": 0.1111111111111111,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 4.5,
        "price": 4.5,
        "impliedProbability": 0.2222222222222222,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 4.5,
        "price": 1.17,
        "impliedProbability": 0.8547008547008548,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 7.5,
        "price": 21,
        "impliedProbability": 0.047619047619047616,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 5.5,
        "price": 8.5,
        "impliedProbability": 0.11764705882352941,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 5.5,
        "price": 1.05,
        "impliedProbability": 0.9523809523809523,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 6.5,
        "price": 12,
        "impliedProbability": 0.08333333333333333,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 6.5,
        "price": 1.01,
        "impliedProbability": 0.9900990099009901,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "btts",
        "selection": "yes",
        "line": None,
        "price": 1.67,
        "impliedProbability": 0.5988023952095809,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "btts",
        "selection": "no",
        "line": None,
        "price": 2.1,
        "impliedProbability": 0.47619047619047616,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "double_chance",
        "selection": "home_or_draw",
        "line": None,
        "price": 1.22,
        "impliedProbability": 0.819672131147541,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "double_chance",
        "selection": "home_or_away",
        "line": None,
        "price": 1.22,
        "impliedProbability": 0.819672131147541,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "double_chance",
        "selection": "draw_or_away",
        "line": None,
        "price": 1.83,
        "impliedProbability": 0.5464480874316939,
        "bookmaker": "Bet365",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "h2h",
        "selection": "home",
        "line": None,
        "price": 1.83,
        "impliedProbability": 0.5464480874316939,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "h2h",
        "selection": "draw",
        "line": None,
        "price": 3.91,
        "impliedProbability": 0.2557544757033248,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "h2h",
        "selection": "away",
        "line": None,
        "price": 3.73,
        "impliedProbability": 0.2680965147453083,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 1.5,
        "price": 1.22,
        "impliedProbability": 0.819672131147541,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 1.5,
        "price": 4.03,
        "impliedProbability": 0.24813895781637715,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 2,
        "price": 1.38,
        "impliedProbability": 0.7246376811594204,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 2,
        "price": 2.95,
        "impliedProbability": 0.3389830508474576,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 2.25,
        "price": 1.51,
        "impliedProbability": 0.6622516556291391,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 2.25,
        "price": 2.49,
        "impliedProbability": 0.4016064257028112,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 2.5,
        "price": 1.7,
        "impliedProbability": 0.5882352941176471,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 2.5,
        "price": 2.11,
        "impliedProbability": 0.47393364928909953,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 2.75,
        "price": 1.89,
        "impliedProbability": 0.5291005291005292,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 2.75,
        "price": 1.89,
        "impliedProbability": 0.5291005291005292,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 3.5,
        "price": 2.73,
        "impliedProbability": 0.3663003663003663,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 3.5,
        "price": 1.43,
        "impliedProbability": 0.6993006993006994,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "over",
        "line": 3,
        "price": 2.18,
        "impliedProbability": 0.4587155963302752,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      },
      {
        "market": "goals_over_under",
        "selection": "under",
        "line": 3,
        "price": 1.66,
        "impliedProbability": 0.6024096385542169,
        "bookmaker": "Pinnacle",
        "capturedAt": "2026-06-09T16:42:37.494Z",
        "sourceSnapshotId": "864c2d86-ab8a-4e84-a536-f86361940586"
      }
    ]
  },
  "providerContextWarnings": []
}

web_search_results_text = """
The Tampa Bay Rowdies host the Charleston Battery in a high-stakes Eastern Conference clash on Wednesday, June 10, 2026, at Al Lang Stadium.[1][2] This match marks the return leg of the "No Quarter Derby," a supporter-led rivalry between two of the USL Championship's most consistent contenders.[1][3]

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
    {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEcMPhFlyjX8BqOrdmISB4TriagWzAmDK_yVGEL_7O-cRhoZIcA7rdQiQbOJdDHWVy9vpyBRhss0-vwBDO-8YkPel8wf6ADS7Sa5TuIpyB5Y406eBrFjRKp6wCGS22H6wTZYPWFsmcaoB8wFWHrZAHRcezOG3KY2NpLZuCu0kwo_OkyKS_DLDBYrA==", "title": "rowdiessoccer.com"},
    {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQH9A4KXCAMqCT9MD_xAAP51YAVzOOP6LROc-5EmBszkXU3klpCMt-Go32lJg0XcyOI9QNkC39pO48GGGB8_shTrG6zz2RoIpPZ0jCO6x3hQuxIrN6sy56MM5SNp1LnwcKCh2wkrL-G2lNlWtbkGJxDB2Ix1K9uhV3rEHJkpDuGy3GauGapvDUIxlEqN8ba50k1z6Jo=", "title": "forebet.com"},
    {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEJo43mrhRvKldlbdUAbc7iOefLRyFnoFgvKQsPJMd1Z8JbdRiQOcGraTqB-LruWJvJXZ05u8Ho-TwncVpv4wp2ktU8IRaEC4BCWJXlruVfjYMCbunkWLhtGQkPlBstYohQEhBoQOxZRG5CuP8VCxESR3vS2xRSRYVZOGRlMIUJq9ajizWoTiBliaVky9tk1g5RdEfHjQbhVPg==", "title": "charlestonbattery.com"},
    {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGndptf9cSuLfVWGAEQV29Anm6M552SO_A9cV-sWl_AxkueF4mzEAOY5nYubvzvVJyHnp5I9YRBy2_v7ULH3fmb8Ec9xKUs_xUWyGnDuyouOIVy93sUTXaiSXeeooKyHsZkRWRkBOooU0AcCkwhWQ-9e4AesTFRSBcyFzZpyi7FinJYkBA10w9Odx1IsHXcENTS0T2D8LI0Zg==", "title": "xscores.com"},
    {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHx7dRPzSgB7CIBmv61SVR5a0x8dcanIwyOfnj4Rg9Cm4fmX4IqCKJdwjEbj43951efDQHln-BL2sSE3W2yT4iR7AT7MgRleM55kJ8RYZCUOjPPM77gxoBQEm34BMVCAGZpx0teAGPAlhET1lgxZpMIV4Zonmwi", "title": "foxsports.com"},
    {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGZY5etbjM8qINrwvIIlbVmEiJNW162_sJfZFi8QVrdk8DNZXZqECW7mgaH2rCXAkO0UsxD7_5W8ptIMR-rFHyHr2duOJQ6YkxV3CgxVX7n8exOfKUbyWW6qFkJBVjiM7U4ukwvEHcf_gxoVt_M2drd_mwJTh3bfmAwY_40tmaJmjQG7iCEu05KR8FCD5UsiQ1R", "title": "sport-news.ca"},
    {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQE15oViVHOoYz9eQNMmJjWGqcVu-7-aFmOkHUSq05vNpaudT16Jn6p6SZNG7hOtq1oSzuWE8WZag1ttnAYzQXPQ8HlWbPIoRTflEgacaS5FJv0bUhu6ZwjnTx26qdMuTQbrAeZHB1hSIZ6CDavS1suOvBTQzVRHcOVYf2nJXVn9d5zFnf77kY9Gc7m_uK6", "title": "aiscore.com"},
    {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFO7k0MIvqglNhh0kG1iSGfq6DOoVWmAvJNlTf0sqhtjn3sYzF_N_bzl-O5b8LOOTqu7rFLCq-0xSHhHWp43bQCPJh3uMrl7jN6jQpqSPlFStSFHjDwosI78BSEB5mrde7Lkv9Ra99DjqVrDW0MBmtNPVRMs4V6bC5P7EfeCW7UDExgMEYymIJ0JQ==", "title": "fotmob.com"},
    {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGEhZL6nSmGVBmYlv1E4fMRRuU4f40WgL8cM94B0B8JX4A99vcj_HPT8JRFEsL6QV8uI9lE2nfd_KMv8Bhx4jTzep_5jm6KdrfE04oKjLwiOgiytvPfwNhVdt-s1iOPTHkjn16CeozJwRVecsR6lpqH4jsy-Xp7YNXLzB88wg==", "title": "fctables.com"}
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

# H2H Claims & Evidence
h2h_claim_tampa_id = create_claim_id()
h2h_claim_draw_id = create_claim_id()
h2h_claim_charleston_id = create_claim_id()

# Evidence for Tampa Bay Rowdies form and dominance
evidence_tampa_form_id = create_evidence_id()
evidence_items.append({
    "id": evidence_tampa_form_id,
    "sourceId": web_source_map["forebet.com"], # Linking to forebet.com
    "claimIds": [h2h_claim_tampa_id],
    "snippet": "Tampa Bay Rowdies (1st in East): Record: 8W-3D-0L (27 pts). Home Form: Dominant at Al Lang with 4 wins and 1 draw in 5 matches. They remain the only unbeaten team in the Eastern Conference, boasting the league's best defense (0.5 goals conceded per match).",
    "summary": "Tampa Bay Rowdies are 1st in the Eastern Conference, unbeaten with a dominant home record (4W-1D-0L in 5 matches) and the league's best defense (0.5 goals conceded per match).",
    "confidence": 0.9,
    "metadata": {}
})

# Evidence for Charleston Battery away form
evidence_charleston_away_form_id = create_evidence_id()
evidence_items.append({
    "id": evidence_charleston_away_form_id,
    "sourceId": web_source_map["forebet.com"], # Linking to forebet.com
    "claimIds": [h2h_claim_tampa_id, h2h_claim_charleston_id], # Supports Tampa win, contradicts Charleston win
    "snippet": "Charleston Battery (5th in East): Away Form: Struggling on the road with only 1 win and 4 losses in 5 away fixtures. While strong at home, their 'fragile' away form (only 2 goals scored on the road) contrasts sharply with Tampa Bay's defensive solidity.",
    "summary": "Charleston Battery struggles on the road with 1 win and 4 losses in 5 away fixtures, scoring only 2 goals.",
    "confidence": 0.85,
    "metadata": {}
})

# Evidence for H2H history
evidence_h2h_history_id = create_evidence_id()
evidence_items.append({
    "id": evidence_h2h_history_id,
    "sourceId": web_source_map["fotmob.com"], # Linking to fotmob.com
    "claimIds": [h2h_claim_tampa_id, h2h_claim_charleston_id, h2h_claim_draw_id], # Relevant for all H2H outcomes
    "snippet": "Charleston has historically held the upper hand in this rivalry, though the gap is narrowing. All-Time Record: Charleston 15 wins, Tampa Bay 9 wins, 4 draws. Recent Meeting: The sides drew 1-1 earlier this season (April 18, 2026) at Charleston.",
    "summary": "Historically, Charleston leads the H2H (15W-9L-4D), but the gap is closing. Their last meeting (April 18, 2026) was a 1-1 draw.",
    "confidence": 0.7,
    "metadata": {}
})

# Evidence for Win Probability from web search
evidence_win_probability_id = create_evidence_id()
evidence_items.append({
    "id": evidence_win_probability_id,
    "sourceId": web_source_map["fctables.com"], # Linking to fctables.com
    "claimIds": [h2h_claim_tampa_id, h2h_claim_draw_id, h2h_claim_charleston_id],
    "snippet": "Win Probability: Early projections favor Tampa Bay at ~50%, with a draw at 25% and a Charleston win at 24%.",
    "summary": "Early web projections suggest Tampa Bay has a ~50% win probability, draw 25%, and Charleston 24%.",
    "confidence": 0.75,
    "metadata": {}
})

# Evidence for H2H Odds
evidence_h2h_odds_id = create_evidence_id()
evidence_items.append({
    "id": evidence_h2h_odds_id,
    "sourceId": odds_source_id,
    "claimIds": [h2h_claim_tampa_id, h2h_claim_draw_id, h2h_claim_charleston_id],
    "snippet": json.dumps([q for q in input_data["oddsSnapshot"]["quotes"] if q["market"] == "h2h"]),
    "summary": "Bet365 quotes Tampa Bay win at 1.8 (55.5%), draw at 3.6 (27.7%), Charleston win at 3.7 (27%). Pinnacle offers similar odds.",
    "confidence": 0.95,
    "metadata": {"market": "h2h"}
})

# Claims for H2H
claims.append({
    "id": h2h_claim_tampa_id,
    "statement": "Tampa Bay Rowdies are strong favorites to win this match due to their unbeaten record, dominant home form, and strong defense.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "h2h"},
    "supportLevel": "supported",
    "evidenceIds": [evidence_tampa_form_id, evidence_charleston_away_form_id, evidence_win_probability_id, evidence_h2h_odds_id],
    "conflictStatus": "none",
    "metadata": {"selection": "home"}
})
claims.append({
    "id": h2h_claim_draw_id,
    "statement": "A draw is a plausible outcome given the recent 1-1 tie between the teams and current win probabilities.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "h2h"},
    "supportLevel": "supported",
    "evidenceIds": [evidence_h2h_history_id, evidence_win_probability_id, evidence_h2h_odds_id],
    "conflictStatus": "none",
    "metadata": {"selection": "draw"}
})
claims.append({
    "id": h2h_claim_charleston_id,
    "statement": "Charleston Battery is an underdog due to their poor away form, despite historical H2H advantage.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "h2h"},
    "supportLevel": "weak", # Weak due to poor away form conflicting with historical H2H
    "evidenceIds": [evidence_charleston_away_form_id, evidence_h2h_history_id, evidence_win_probability_id, evidence_h2h_odds_id],
    "conflictStatus": "minor", # Minor conflict between historical H2H and current form/odds
    "metadata": {"selection": "away"}
})


# Double Chance Claims & Evidence
dc_home_or_draw_claim_id = create_claim_id()
dc_home_or_away_claim_id = create_claim_id()
dc_draw_or_away_claim_id = create_claim_id()

evidence_dc_odds_id = create_evidence_id()
evidence_items.append({
    "id": evidence_dc_odds_id,
    "sourceId": odds_source_id,
    "claimIds": [dc_home_or_draw_claim_id, dc_home_or_away_claim_id, dc_draw_or_away_claim_id],
    "snippet": json.dumps([q for q in input_data["oddsSnapshot"]["quotes"] if q["market"] == "double_chance"]),
    "summary": "Bet365 odds for Double Chance: Home or Draw at 1.22 (81.9%), Home or Away at 1.22 (81.9%), Draw or Away at 1.83 (54.6%).",
    "confidence": 0.95,
    "metadata": {"market": "double_chance"}
})

claims.append({
    "id": dc_home_or_draw_claim_id,
    "statement": "Tampa Bay Rowdies are highly likely to either win or draw, supported by their strong home record and favorable odds.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "double_chance"},
    "supportLevel": "supported",
    "evidenceIds": [evidence_tampa_form_id, evidence_h2h_odds_id, evidence_dc_odds_id],
    "conflictStatus": "none",
    "metadata": {"selection": "home_or_draw"}
})
claims.append({
    "id": dc_home_or_away_claim_id,
    "statement": "There is a good chance the match will not end in a draw, with Tampa Bay favored to win.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "double_chance"},
    "supportLevel": "supported",
    "evidenceIds": [evidence_win_probability_id, evidence_h2h_odds_id, evidence_dc_odds_id],
    "conflictStatus": "none",
    "metadata": {"selection": "home_or_away"}
})
claims.append({
    "id": dc_draw_or_away_claim_id,
    "statement": "Charleston Battery has a moderate chance of securing at least a draw, but their away form remains a concern.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "double_chance"},
    "supportLevel": "weak",
    "evidenceIds": [evidence_charleston_away_form_id, evidence_h2h_odds_id, evidence_dc_odds_id],
    "conflictStatus": "minor",
    "metadata": {"selection": "draw_or_away"}
})


# Goals Over/Under Claims & Evidence
goals_over_25_claim_id = create_claim_id()
goals_under_25_claim_id = create_claim_id()

evidence_goals_stats_id = create_evidence_id()
evidence_items.append({
    "id": evidence_goals_stats_id,
    "sourceId": web_source_map["forebet.com"], # Linking to forebet.com
    "claimIds": [goals_over_25_claim_id, goals_under_25_claim_id],
    "snippet": "Tampa Bay Rowdies: 19 Goals For / 5 Goals Against. Charleston Battery: 14 Goals For / 13 Goals Against. Over 2.5 Goals: Occurred in 55% of Tampa Bay's home games and 52% of all H2H meetings.",
    "summary": "Tampa Bay (19 GF/5 GA) and Charleston (14 GF/13 GA) show moderate scoring and conceding. Over 2.5 goals occurred in 55% of Tampa Bay home games and 52% of H2H.",
    "confidence": 0.8,
    "metadata": {}
})

evidence_goals_odds_id = create_evidence_id()
evidence_items.append({
    "id": evidence_goals_odds_id,
    "sourceId": odds_source_id,
    "claimIds": [goals_over_25_claim_id, goals_under_25_claim_id],
    "snippet": json.dumps([q for q in input_data["oddsSnapshot"]["quotes"] if q["market"] == "goals_over_under" and q["line"] == 2.5]),
    "summary": "Bet365 odds for Over 2.5 goals at 1.7 (58.8%) and Under 2.5 goals at 2.1 (47.6%). Pinnacle offers similar odds.",
    "confidence": 0.95,
    "metadata": {"market": "goals_over_under", "line": 2.5}
})

claims.append({
    "id": goals_over_25_claim_id,
    "statement": "The match has a reasonable chance of exceeding 2.5 goals, supported by historical trends in Tampa Bay's home games and H2H encounters.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "goals_over_under"},
    "supportLevel": "supported",
    "evidenceIds": [evidence_goals_stats_id, evidence_goals_odds_id],
    "conflictStatus": "none",
    "metadata": {"selection": "over", "line": 2.5}
})
claims.append({
    "id": goals_under_25_claim_id,
    "statement": "While less likely, an under 2.5 goals outcome is possible given Tampa Bay's strong defense.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "goals_over_under"},
    "supportLevel": "weak",
    "evidenceIds": [evidence_tampa_form_id, evidence_goals_odds_id], # Referring to Tampa's strong defense
    "conflictStatus": "minor",
    "metadata": {"selection": "under", "line": 2.5}
})


# BTTS Claims & Evidence
btts_yes_claim_id = create_claim_id()
btts_no_claim_id = create_claim_id()

evidence_btts_odds_id = create_evidence_id()
evidence_items.append({
    "id": evidence_btts_odds_id,
    "sourceId": odds_source_id,
    "claimIds": [btts_yes_claim_id, btts_no_claim_id],
    "snippet": json.dumps([q for q in input_data["oddsSnapshot"]["quotes"] if q["market"] == "btts"]),
    "summary": "Bet365 odds for BTTS Yes at 1.67 (59.8%) and BTTS No at 2.1 (47.6%).",
    "confidence": 0.95,
    "metadata": {"market": "btts"}
})

evidence_btts_stats_id = create_evidence_id()
evidence_items.append({
    "id": evidence_btts_stats_id,
    "sourceId": web_source_map["forebet.com"], # Linking to forebet.com
    "claimIds": [btts_yes_claim_id, btts_no_claim_id],
    "snippet": "Tampa Bay has not failed to score in a single match this season. Charleston Battery: 14 Goals For / 13 Goals Against.",
    "summary": "Tampa Bay has scored in every match this season. Charleston has scored 14 and conceded 13 goals.",
    "confidence": 0.7,
    "metadata": {}
})

claims.append({
    "id": btts_yes_claim_id,
    "statement": "Both teams are likely to score, considering Tampa Bay's consistent scoring record and Charleston's ability to score, albeit less frequently on the road.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "btts"},
    "supportLevel": "supported",
    "evidenceIds": [evidence_btts_odds_id, evidence_btts_stats_id],
    "conflictStatus": "none",
    "metadata": {"selection": "yes"}
})
claims.append({
    "id": btts_no_claim_id,
    "statement": "It is less likely that both teams will fail to score, especially given Tampa Bay's consistent offense.",
    "subject": {"type": "market", "id": input_data["fixture"]["id"], "market": "btts"},
    "supportLevel": "weak",
    "evidenceIds": [evidence_tampa_form_id, evidence_btts_odds_id, evidence_btts_stats_id], # Referring to Tampa's strong defense
    "conflictStatus": "none",
    "metadata": {"selection": "no"}
})


# Corners Over/Under - No specific evidence found from web search or input for this market
corners_market_id = create_claim_id() # Using claim_id for market identification for consistency

claims.append({
    "id": corners_market_id,
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
