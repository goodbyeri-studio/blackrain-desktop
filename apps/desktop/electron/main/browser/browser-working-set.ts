export const MAX_LIVE_BROWSER_TABS_PER_OWNER = 8;

export type BrowserWorkingSetCandidate = {
  browserTabId: string;
  crashed: boolean;
  lastActiveAt: number;
  protected: boolean;
};

export type BrowserWorkingSetState = "live" | "suspended" | "crashed";

export function planBrowserWorkingSet(
  candidates: readonly BrowserWorkingSetCandidate[],
  liveBudget = MAX_LIVE_BROWSER_TABS_PER_OWNER,
): Map<string, BrowserWorkingSetState> {
  const budget = Math.max(1, Math.trunc(liveBudget));
  const states = new Map<string, BrowserWorkingSetState>();
  const eligible = candidates.filter((candidate) => {
    if (!candidate.crashed) return true;
    states.set(candidate.browserTabId, "crashed");
    return false;
  });
  const protectedTabs = eligible.filter((candidate) => candidate.protected);
  const ordinaryTabs = eligible
    .filter((candidate) => !candidate.protected)
    .sort((left, right) => right.lastActiveAt - left.lastActiveAt);
  const ordinaryLiveSlots = Math.max(0, budget - protectedTabs.length);

  for (const candidate of protectedTabs) {
    states.set(candidate.browserTabId, "live");
  }
  ordinaryTabs.forEach((candidate, index) => {
    states.set(
      candidate.browserTabId,
      index < ordinaryLiveSlots ? "live" : "suspended",
    );
  });
  return states;
}
