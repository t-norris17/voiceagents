// Pure scoring for the call grader. No SDK, no network, no env — so the weights can be
// unit-tested without an API key, and so the arithmetic is reviewable on its own.
// The grader supplies evidence; this file decides what the evidence costs.
// The rubric, as arithmetic. Weighted by what actually harms a caller: being told something false
// is worse than being told it incompletely, which is worse than being told it awkwardly.
// Exported so the weights are unit-testable without an API key.
export function scoreAnswer(a, hasSource) {
  const claims = Array.isArray(a?.claims) ? a.claims : [];
  const contradicted = claims.filter((c) => c.verdict === "contradicted").length;
  const unsupported = claims.filter((c) => c.verdict === "unsupported").length;

  let score = 5;
  const deductions = [];
  const take = (n, cost, label) => { if (n) { deductions.push({ label, points: n * cost }); score -= n * cost; } };
  take(contradicted, 3, "contradicts the source");
  take(unsupported, 2, "claim the source doesn't establish");
  if (a?.answered_the_question === false) { deductions.push({ label: "didn't answer what was asked", points: 2 }); score -= 2; }
  if (a?.complete === false) { deductions.push({ label: "left out something material", points: 1 }); score -= 1; }
  if (a?.appropriately_routed === false) { deductions.push({ label: "thin answer where the source had more", points: 1 }); score -= 1; }
  score = Math.max(1, Math.min(5, score));

  const grounding = !hasSource ? "no_source"
    : contradicted ? "contradicted"
    : unsupported ? "unsupported"
    : "grounded";

  // Rating bands mirror the DB's check constraint vocabulary.
  const rating = score >= 4.5 ? "good" : score >= 3 ? "partial" : "wrong";

  return { score, rating, grounding, unsupported, contradicted, deductions };
}
