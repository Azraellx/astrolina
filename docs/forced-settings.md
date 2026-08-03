# When a setting changes by itself

Occasionally you will ask for one thing and find that something else moved. The line
system changes when you open a view that needs it; the overlay frame changes when you
jump to a return. This page says exactly when that happens, why, and what becomes of
the setting you had chosen.

The short version: **a setting is only ever rewritten when the thing you just asked
for could not be drawn otherwise, and when that happens the app says so.** Everything
else that looks like a change is a setting being *held* rather than replaced — your
choice is still there and comes back on its own.

## Three situations, and they are not the same

**The combination cannot exist.** Some pairs of settings have no meaning together —
not by policy, but by construction. The geodetic mapping lays the *tropical* zodiac
onto Earth's longitudes, so there is no sidereal version of it to draw. A chart whose
birth time is unknown has no angular framework, so there is no natal frame for a dated
overlay to hold.

Nothing is rewritten here. The control keeps the option visible and marks it
unavailable, with a line saying which other setting to change. Your stored choice is
masked for as long as the conflict lasts and returns the moment it ends — set the
zodiac back to tropical and the geodetic mapping is selected again, exactly as you
left it.

**A tool needs a particular setting to work at all.** The globe-spin tool turns the
sky against a fixed map, which requires lines carrying a sidereal time; geodetic lines
carry none. The local-space view is built from one specific moment, which the
time-independent geodetic mapping does not have.

Here the setting genuinely is rewritten, because you asked for the tool. The app tells
you which setting moved and where it lives. It does **not** put it back when you close
the tool: quietly reversing it later would move every line on the map a second time,
from nothing you did, which is the same surprise one step removed.

**A reading is only that reading in one frame.** Jumping a dated overlay to a return —
the instant a body comes back to its exact natal degree — sets the overlay frame to
the moment's own sidereal time. In the natal frame the returning body is pinned to its
birth position by construction, so its lines would sit on the natal ones and never
move from one return to the next, however many years you stepped through. The map
would be drawn, and it would be empty of information.

As above, the app tells you, and leaves the frame where it put it.

## What this means in practice

| What moves | When | Your setting |
|---|---|---|
| The geodetic mapping becomes unavailable | While the zodiac is sidereal | **Held.** Returns when you go back to tropical |
| The overlay frame is held on the moment's own sky | While the chart's birth time is unknown | **Held.** No preference is written |
| The projection choice (in mundo / in zodiaco) disappears | While the geodetic mapping is on | **Held.** Geodetic places every body on the ecliptic by construction, so there is no choice left to make |
| Your overlay technique reads as None | While the active chart can't carry it — a composite has no moment to advance, a chart with no birth time has no exact one, a two-person chart has nobody left to add | **Held.** Back the moment you select a chart that can carry it |
| Advanced-only techniques read as None | While Advanced is off | **Held.** Back when you turn Advanced on, like every other Advanced setting |
| The line system changes to celestial | When you open the local-space view, or start the globe-spin tool | **Rewritten**, and announced |
| The local-space view closes | When you choose the geodetic mapping | **Rewritten**, and announced |
| The overlay frame changes to the moment's own sky | When you jump a dated overlay to a return | **Rewritten**, and announced |

Every announcement carries a *Don't show me again* tick. Turning one off suppresses
that message everywhere it would appear, including from a different starting point —
having understood the rule once is enough.

One thing on this page is not a setting at all, and belongs here anyway because it
looks like the same kind of surprise. A tool that works out an unknown birth time can
ask the map to draw the chart **as if** it were born at a candidate minute, so you can
see where the lines would fall before deciding anything. While that is happening the
"Birth time unknown" banner is replaced by one naming the minute being tried and saying
it is not saved — because a map drawn from a guess must never be mistaken for one drawn
from a record. Nothing is written: the chart still reads *? Unknown* in every list, the
provisional time is dropped the moment you close the tool or switch charts, and it never
survives a reload. Adopting a time onto the chart is a separate, explicit act, and it is
undoable.

The reasoning behind each setting stays on the setting itself, in its hover tip, where
it is still there next week. The announcement only says what moved.

## Why not simply refuse, or simply revert

Two alternatives are worth naming, because both are worse.

*Refusing* — leaving the tool unavailable until you change the setting yourself —
looks tidier but strands a reader who has no way to know which of a dozen settings is
in the way. That is why an unavailable option here always names the setting to change
rather than merely greying out.

*Reverting* — putting the setting back when you close the tool — sounds like the
polite thing to do, and is the worst of the three. The two overlay frames can place
the same line most of the way around the globe from each other, and the two line
systems disagree about where every angle falls. A map that rearranges itself when you
close an unrelated window, with no gesture to attribute it to, reads as a broken map.
Changing something once and saying so is more honest than changing it twice quietly.
