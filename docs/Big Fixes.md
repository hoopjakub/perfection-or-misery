Fixes:

Knockouts from Champions League (Full version) should be used everywhere in knockouts, it looks very clean (don't forget about flags being shown still thanks a lot.

What is defined as everywhere:

WC knockouts

CL (classic) knockouts (they should have a little different since a lot of matches and not yet live matches wired in)

CL (full) qualifiers

CL (full) knockouts

![](https://com.miui.notes/note_image/ca43a0e36f5f26aaf71da6cbf4a54a8fc5a8e39b)![1784839328774](image/BigFixes/1784839328774.jpg)

(screenshot for the knockouts)

![](https://com.miui.notes/note_image/4109adf8051fde2d63391f113675eee91df90394)![1784839335931](image/BigFixes/1784839335931.jpg)

Or actually a better option to combine both of these, with the colors and features of the WC one, but things like the size and the footer are better (since in world cup it at the shows the group X - instead of it actually being knockouts)

![](https://com.miui.notes/note_image/33dc2eb258362a55d522416cc93eef3b5afd6a7d)![1784839343505](image/BigFixes/1784839343505.jpg)

(theoretical screenshot of how it should look in the WC mode, only missing is the bottom bar that's in the CL and the header actually overlaying on top always so you can always see and it showing mode specific things (so not the general stuff it shows now and the color schemes, also make as the knockouts go clickable and you can do like that, screenshot after this)

![](https://com.miui.notes/note_image/595da1f3173dfd783dec9bab32d081664e6e8dd4)![1784839371500](image/BigFixes/1784839371500.jpg)

(screenshot mentioned before of it being clickable)

IN league before qualifiers for the champions league see final standings

![](https://com.miui.notes/note_image/ad62df8730a15f28ed27d3f1e2b80e5c07f9079d)![1784839397444](image/BigFixes/1784839397444.jpg)

![](https://com.miui.notes/note_image/b971951c8fd240fc8c5e91276e3c8cfb2ec9485f)![1784839384698](image/BigFixes/1784839384698.jpg)

(how it looks now and it's missing it same for qualifiers, second screenshot)

Guards against going back in simulations when user clicks "back" on their mobile phone (not in app, but the Android OS environment)

In CL (full) do weighted picks in easy and medium level modes (until 4/10 difficulty level aka "medium") and in custom able to click button for weighted picks in drafting phase (that being only teams from top 10 leagues that are in that pool) and if user does a level 3 difficulty and weighted picks are clicked off (automatically on or off based on difficulty, changes in real time, in this scenario user doesn't want weighted picks) prioritize the button being clicked on/off over difficulty level (scenario: over 4 difficulty but button clicked on, button wins and you get weighted picks)

subs don't have which team they are from, shows "-"

chaos mode doesn't "hide" the players that can't play in the spinned position.

in drafting phase the so called highlighted player in the lineup is a visual bug that needs removing.

when subs and your rating is hidden sort players by name from A-Z

removal of era mode all together.

ADDITIONS:

DEEP SIMULATION MATCH FOR FINAL:

At semi finals the knockouts stop, the final match will become a "Deep Simulation match" (For now only for WC and UCL) when you get to it.

First instead of skip all, skip to final and then the button changes to see lineups -> Screen changes to show both teams in the final and their lineups, click on button Start Final -> Takes you into a live match but with a few additions, you can see actual stats appear and change as the game progress (ALL THE STATS and they actually move the moment something happens, so when a goal happens you see a new shot on target and other stuff), you also see actively both lineups and the ratings of the players (also of subs happen you also see that and they update real time) and you also see MATCH MOMENTUM (see more later) happening "live" and then if you lose/win a small ceremony based on that, either you see an animation of a second place medal and a almost moody atmosphere (no sounds, but use background colors more of the depressing tone) or a winner trophy (will provide images of actual trophies, do not care about release and copyright laws) wiht a joyful atmosphere and confetti appearing

then you can just go to final results and you have everything from before (this whole deep match simulation can't be viewed back and is a experience)

timing is 1 minute equals half a second in real time.

You can pause the match and skip the match (of coruse since everything is predetermined before and you just see everything in UI terms)

MATCH MOMENTUM - new stat and feature, shows a graph where it goes from minute 1 to 90 or well, to 120, you see every break with a dotted Y-axis line (the X-axis is meant as the minutes) and as for the y axis, you see with main color and legends to which team the momentum when to, do it as rectangles for every single minute with the width being same but the height changing based on momentum (not a static 0 or 100, but a real derived from stats range from 1 to 100, where 100 is the absolute extreme and happens when the team is REALLY good), it should be derived from goals and stats (aka the work flow is now goals -> stats -> momentum), so 85 percent of times a goal happens the momentum should reflect that (the team that scored has the momentum to them) this will also be shown in the full detailed match stats when you click on them. Isn't actually "real" but is basically real since it derives from data. Red cards and OWN GOALS (see later) should be shown.

![](https://com.miui.notes/note_image/ef22c0aba53d87351943c85f3febe08497cc0c81)![1784839422643](image/BigFixes/1784839422643.jpg)

(screenshot of 90 minute match momentum, the graph is perfect to not only recreate but inspire from heavily)

![](https://com.miui.notes/note_image/d77cc743978856d9d85f0ba548a88b0f70df7d58)![1784839426249](image/BigFixes/1784839426249.jpg)

(how AET momentum looks)

OWN GOALS, PENALTIES and MISTAKES - Events that can happen to players that either "lead" (since the goals are before stats) to goals or instead of the your striker scoring the opposing defender scores and own goal, rare event (90 percent of times defender, other 10 percent any other position on the field including goalie) and some goals can become penalties and that also means new stat for player who "won" the penalty

UPDATE TO MATCH STATS SCREEN AND SMALL SIMULATION - show added time for each half. Update timeline/match stat screen to go from this, it should also show penalties.

![](https://com.miui.notes/note_image/15d3ce72a70f989f4ac696c81ec8e301c9271855)![1784839441897](image/BigFixes/1784839441897.jpg)

to more like this (more spacing for it. and maybe the match stats should go to a dedicated screen instead of a modal and instead of one long strip categories)

![](https://com.miui.notes/note_image/0fdac2f21fb4246ff4726e8adf78f07af5005cfd)![1784839457268](image/BigFixes/1784839457268.jpg)

(how it should look at the top, since no club emblems just show team names)

![](https://com.miui.notes/note_image/97629b43acfc4d28318fd68c4cb4140f68e56b72)![1784839465857](image/BigFixes/1784839465857.jpg)

(Momentum and first few important stats)

![](https://com.miui.notes/note_image/9a29b35c7a5c6d81b4cfa5edbbc002af8b92e6ac)![1784839474791](image/BigFixes/1784839474791.jpg)

(Timeline)

![](https://com.miui.notes/note_image/9be1cb10f3885bbbe28bed7abf7933c1693d1274)![1784839482015](image/BigFixes/1784839482015.jpg)

(Standings at the moment of the game played (aka if the game was in matchday 7 show those teams position and the other things shown in screenshot at the end of matchday 7), Top 3 rated players from each team and last 5 matches before the game was played for both teams and how they finished (since no emblems show team names)

commit message: UPDATE TO MATCH STATS SCREEN AND SMALL SIMULATION - Update to match stats screen and small simulation updates; Penalties, Own Goals and Mistakes; Match momentum; Deep simulation match fir finals; Major fixes/UI redesigns to knockouts and leagues and Minor fixes for drafting and results

AFTER ALL THESE ARE DONE:

FULL WC MODE as detailed as CL mode
