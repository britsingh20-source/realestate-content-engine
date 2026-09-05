export function viralScore({ outlier=1, velocityRatio=1, confirmations=0, engagementRatio=1, ageHours=24 }) {
  const clamp = (v, min=0, max=100) => Math.max(min, Math.min(max, v));
  const outlierScore = clamp((outlier / 5) * 100);
  const velocityScore = clamp((velocityRatio / 5) * 100);
  const crossScore = clamp((confirmations / 3) * 100);
  const engagementScore = clamp((engagementRatio / 2) * 100);
  const recencyScore = clamp(100 - Math.max(0, ageHours - 6) * 1.5);

  return Math.round(
    outlierScore * 0.30 +
    velocityScore * 0.25 +
    crossScore * 0.25 +
    engagementScore * 0.10 +
    recencyScore * 0.10
  );
}

export function shouldGeneratePrompt(metrics) {
  const score = viralScore(metrics);
  const exceptional = metrics.outlier >= 5 && metrics.velocityRatio >= 3;
  const crossValidated = metrics.confirmations >= 2 && metrics.outlier >= 2;
  return { score, generate: score >= 80 || exceptional || crossValidated };
}
