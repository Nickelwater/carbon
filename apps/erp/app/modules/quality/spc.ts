/** d2 constant for a moving range of subgroup size 2 (individuals chart). */
const D2_FOR_MR2 = 1.128;

export type IMRChartPoint = {
  index: number;
  individual: number | null;
  movingRange: number | null;
};

export type CapabilityIndices = {
  mean: number | null;
  sigmaWithin: number | null;
  sigmaOverall: number | null;
  cp: number | null;
  cpk: number | null;
  pp: number | null;
  ppk: number | null;
};

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values: number[]): number | null {
  if (values.length < 2) {
    return null;
  }
  const avg = mean(values);
  if (avg == null) {
    return null;
  }
  const sumSquaredDiff = values.reduce(
    (sum, value) => sum + (value - avg) ** 2,
    0
  );
  return Math.sqrt(sumSquaredDiff / (values.length - 1));
}

function movingRanges(values: number[]): number[] {
  const ranges: number[] = [];
  for (let i = 1; i < values.length; i++) {
    ranges.push(Math.abs(values[i]! - values[i - 1]!));
  }
  return ranges;
}

function averageMovingRange(values: number[]): number | null {
  const ranges = movingRanges(values);
  if (ranges.length === 0) {
    return null;
  }
  return ranges.reduce((sum, range) => sum + range, 0) / ranges.length;
}

function sigmaWithinFromIndividuals(values: number[]): number | null {
  const mrBar = averageMovingRange(values);
  if (mrBar == null) {
    return null;
  }
  return mrBar / D2_FOR_MR2;
}

function hasBothLimits(lsl: number | null, usl: number | null): boolean {
  return lsl != null && usl != null;
}

function cpIndex(
  lsl: number | null,
  usl: number | null,
  sigma: number | null
): number | null {
  if (!hasBothLimits(lsl, usl) || sigma == null || sigma === 0) {
    return null;
  }
  return (usl! - lsl!) / (6 * sigma);
}

function cpkIndex(
  lsl: number | null,
  usl: number | null,
  avg: number | null,
  sigma: number | null
): number | null {
  if (avg == null || sigma == null || sigma === 0) {
    return null;
  }

  const candidates: number[] = [];
  if (usl != null) {
    candidates.push((usl - avg) / (3 * sigma));
  }
  if (lsl != null) {
    candidates.push((avg - lsl) / (3 * sigma));
  }

  if (candidates.length === 0) {
    return null;
  }

  return Math.min(...candidates);
}

/** Individuals + moving ranges for an I-MR chart. */
export function computeIMRChart(values: number[]): IMRChartPoint[] {
  return values.map((value, index) => ({
    index,
    individual: value,
    movingRange: index === 0 ? null : Math.abs(value - values[index - 1]!)
  }));
}

/** Process capability indices from a numeric series and spec limits. */
export function computeCapabilityIndices(args: {
  values: number[];
  lsl?: number | null;
  usl?: number | null;
}): CapabilityIndices {
  const { values } = args;
  const lsl = args.lsl ?? null;
  const usl = args.usl ?? null;

  const avg = mean(values);
  const sigmaWithin = sigmaWithinFromIndividuals(values);
  const sigmaOverall = sampleStandardDeviation(values);

  return {
    mean: avg,
    sigmaWithin,
    sigmaOverall,
    cp: cpIndex(lsl, usl, sigmaWithin),
    cpk: cpkIndex(lsl, usl, avg, sigmaWithin),
    pp: cpIndex(lsl, usl, sigmaOverall),
    ppk: cpkIndex(lsl, usl, avg, sigmaOverall)
  };
}
