// Conservative indexing eligibility. These are editorial thresholds, not a Google rule.
// Search, collections and subject browsing continue to work below these thresholds.
export const MIN_PROFILE_CARDS = 20;
export const MIN_PROFILE_SETS = 3;

export function shouldIndexProfile(cardCount, setCount) {
  return Number(cardCount) >= MIN_PROFILE_CARDS && Number(setCount) >= MIN_PROFILE_SETS;
}
