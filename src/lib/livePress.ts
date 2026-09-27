import type { Story } from '@/engine/press'

// The press of a season still being played (P8-135's follow-up). A finished
// run keeps its stories on the result, where the story page finds them; while
// the season plays they live only in the season screen, so a story tapped
// mid-season had nowhere to be read from and nothing opened. The season screen
// hands its list over here as each matchday lands, the same module-scope
// hand-off the match sheet uses (src/lib/matchStats.ts).
let current: Story[] = []

export function setLivePress(stories: Story[]) { current = stories }
export function getLivePress(): Story[] { return current }
