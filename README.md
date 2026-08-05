# Fantasy Football Drafter
A project made to help assist fantasy football users during their draft

<img width="1917" height="927" alt="Screenshot 2026-07-30 151753" src="https://github.com/user-attachments/assets/e2ac9c47-2f7b-499c-8a2c-fd36f33b2984" />

## Instructions
### Main Link
Try it out yourself at: https://ffdrafter.atharva02.hackclub.app/
### Sleeper Usage
To try out Sleeper draft integration, visit https://sleeper.com/ and sign in with your account

If you don't want to sign-up to create an account, you may use the following temporary details

Username: temp2112

Password: temporary@1

**DO NOT MESS WITH ACCOUNT SETTINGS, THIS RUINS THE FEATURE FOR EVERYONE!**

After signing in, visit https://sleeper.com/draftboards and create a new NFL mock draft

After creating a mock draft the URL at the top will appear similar to this structure: https://sleeper.com/draft/nfl/XXXXXXXXXXXXXXXXXXX

The "X" are numbers and the 19 displayed in the URL are the league ID which you copy over to FFDrafter.

## Features
### Start Menu
* Team Amount
* Draft Position
* Scoring Type
* Draft Type (Linear vs Snake)
* Roster Slot Count
* Sleeper Draft Integration
### Draft Page
* Suggested Players
* Top Talent (View top players)
* Current and Upcoming Picks
* Live Draft Board
* Live Roster Slots

## How It Works
### Value Calculation Algorithm
Takes into account a multitude of factors
* Player bye week
  * Incrementing penalty start at 6 (12 if same position) increasing by 10
* Player SOS
  * Bonus of 4 for very easy, 2 for easy, 0 for medium, -2 for hard, and -4 for very hard
* Player Ranking
  * Base of 500, drops 25 with each tier drop
* Current roster state
  * 5 bonus for Roster Need / -20 penalty for surplus
  * 14 bonus for starter need / 2 bonus for bench
  * -18 penalty for oversaturation
### Node/Express.js
Handles routing for starting draft, logging picks, viewing suggestions, and syncing with Sleeper

## Credits
* Claude was used to generate the UI along with node.js concepts/syntax
* FantasyPros player rankings for different scoring types
* Sleeper API for player database and draft integration
