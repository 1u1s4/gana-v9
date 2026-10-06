// A delivered review cohort is evaluable, but never becomes approved picks.
export function deliveredReviewRecommendations(artifact) {
  if (artifact?.kind !== 'daily-review-candidates') return null;
  const ids = artifact.displayedPredictionIds;
  const candidates = artifact.candidates;
  if (artifact.status !== 'published' || !Array.isArray(ids) || !ids.length
    || new Set(ids).size !== ids.length || !Array.isArray(candidates)
    || !Array.isArray(artifact.discord?.messageIds) || !artifact.discord.messageIds.length) {
    throw new Error('Review delivery is not a complete published cohort');
  }
  return ids.map((id, index) => {
    const matches = candidates.filter((candidate) => candidate.predictionId === id);
    if (matches.length !== 1 || matches[0].status !== 'review-required') {
      throw new Error(`Review delivery has a missing, duplicate or invalid displayed candidate: ${id}`);
    }
    const candidate = matches[0];
    return {
      ...candidate,
      kind: 'atomic-prediction',
      rank: index + 1,
      title: `${candidate.fixture} · en revisión`,
      harnessStatus: 'review-required',
      selectionMode: 'review-delivered',
      combinedOdds: candidate.odds,
      expectedEdge: candidate.edge,
      aggregateConfidence: candidate.confidence,
      legs: [{ ...candidate }],
    };
  });
}
