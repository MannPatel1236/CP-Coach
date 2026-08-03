// Difficulty band shared by Recommendations.jsx (display) and WhyThisRec (provenance).
// ponytail: extracted so the two band displays can never drift; band shape is
// the recommender's existing ±350 rule (stretch = ±600, computed server-side).
export const BASE_RECOMMEND_RATING = 800;
export const RATING_STEP = 100;
export const NORMAL_RANGE = 350;

export function bandFor(userRating) {
  const lo = Math.max(
    BASE_RECOMMEND_RATING,
    Math.floor((userRating - 100) / RATING_STEP) * RATING_STEP
  );
  const hi = Math.ceil((userRating + NORMAL_RANGE) / RATING_STEP) * RATING_STEP;
  return { lo, hi };
}
