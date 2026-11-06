/**
 * Race prediction engine using established running formulas.
 *
 * Uses multiple models and returns a consensus prediction:
 *   - Riegel formula (classic exponential model)
 *   - VDOT/Daniels (VO2max-based equivalence)
 *   - Cameron model (modified exponential)
 *
 * All formulas take a known race result (distance + time) and predict
 * an equivalent performance at a target distance.
 */

// ── Race Distances (meters) ────────────────────────────────

export const RACE_DISTANCES: Record<string, number> = {
  '5k': 5000,
  '10k': 10000,
  'half': 21097.5,
  'marathon': 42195,
};

export const RACE_LABELS: Record<string, string> = {
  '5k': '5K',
  '10k': '10K',
  'half': 'Half Marathon',
  'marathon': 'Marathon',
};

// ── Prediction Models ──────────────────────────────────────

/**
 * Riegel formula: T2 = T1 × (D2 / D1)^1.06
 * Classic model by Peter Riegel (1977).
 */
function riegelPredict(
  knownDistanceM: number,
  knownTimeMin: number,
  targetDistanceM: number,
): number {
  return knownTimeMin * Math.pow(targetDistanceM / knownDistanceM, 1.06);
}

/**
 * VDOT/Daniels model — estimates VO2max from a performance,
 * then predicts equivalent time at target distance.
 *
 * Simplified Daniels formula:
 *   VO2max ≈ (-4.60 + 0.182258 × v + 0.000104 × v²) /
 *            (0.8 + 0.1894393 × e^(-0.012778 × t) + 0.2989558 × e^(-0.1932605 × t))
 * where v = meters/min, t = time in minutes.
 *
 * Uses iterative approach to find target time from VDOT.
 */
function danielsVO2max(distanceM: number, timeMin: number): number {
  const velocity = distanceM / timeMin; // m/min
  const percentMax =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * timeMin) +
    0.2989558 * Math.exp(-0.1932605 * timeMin);
  const vo2 =
    -4.60 + 0.182258 * velocity + 0.000104 * velocity * velocity;
  return vo2 / percentMax;
}

function danielsTimeFromVO2max(
  vdot: number,
  targetDistanceM: number,
): number {
  // Binary search for time that produces matching VDOT
  let lo = targetDistanceM / 500; // fastest reasonable pace (~500 m/min)
  let hi = targetDistanceM / 50; // slowest reasonable pace (~50 m/min)

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const estVdot = danielsVO2max(targetDistanceM, mid);
    if (estVdot > vdot) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

function danielsPredict(
  knownDistanceM: number,
  knownTimeMin: number,
  targetDistanceM: number,
): number {
  const vdot = danielsVO2max(knownDistanceM, knownTimeMin);
  return danielsTimeFromVO2max(vdot, targetDistanceM);
}

/**
 * Cameron model (Dave Cameron, 1999):
 * T2 = T1 × (D2 / D1) × (a + b × D1^c) / (a + b × D2^c)
 * Constants: a = 13.49681 - 0.000030363 × D1
 *           (simplified approximation)
 */
function cameronPredict(
  knownDistanceM: number,
  knownTimeMin: number,
  targetDistanceM: number,
): number {
  const a = 13.49681;
  const b = 0.000030363;
  // Cameron's full model uses distance-dependent coefficients
  const t1Seconds = knownTimeMin * 60;
  const factor1 = a + b * Math.pow(knownDistanceM, 1.06);
  const factor2 = a + b * Math.pow(targetDistanceM, 1.06);
  const t2Seconds = t1Seconds * (targetDistanceM / knownDistanceM) * (factor1 / factor2);
  return t2Seconds / 60;
}

// ── Consensus Prediction ───────────────────────────────────

export interface RacePrediction {
  raceType: string;
  raceLabel: string;
  distanceMeters: number;
  predictedTimeMinutes: number;
  /** Formatted as H:MM:SS or MM:SS */
  predictedTimeFormatted: string;
  /** Predicted pace per mile */
  pacePerMile: number;
  paceFormatted: string;
  models: {
    riegel: number;
    daniels: number;
    cameron: number;
  };
  /** Confidence: 'high' if input race distance is close, 'moderate' if distant */
  confidence: 'high' | 'moderate' | 'low';
}

export interface PredictionInput {
  /** Known recent race/workout distance in meters */
  distanceMeters: number;
  /** Known time in minutes */
  timeMinutes: number;
  /** When this performance was recorded */
  date: string;
}

/**
 * Generate race predictions for all standard distances using
 * the consensus of multiple prediction models.
 */
export function predictRaceTimes(
  input: PredictionInput,
  targetDistances?: string[],
): RacePrediction[] {
  const targets = targetDistances ?? Object.keys(RACE_DISTANCES);

  return targets
    .filter((key) => RACE_DISTANCES[key] !== undefined)
    .map((key) => {
      const targetM = RACE_DISTANCES[key];

      const riegel = riegelPredict(input.distanceMeters, input.timeMinutes, targetM);
      const daniels = danielsPredict(input.distanceMeters, input.timeMinutes, targetM);
      const cameron = cameronPredict(input.distanceMeters, input.timeMinutes, targetM);

      // Weighted average: Daniels gets slightly more weight for longer races
      const isLong = targetM >= 21097;
      const predictedTimeMinutes = isLong
        ? riegel * 0.3 + daniels * 0.4 + cameron * 0.3
        : riegel * 0.35 + daniels * 0.35 + cameron * 0.3;

      // Confidence based on distance ratio
      const distRatio = targetM / input.distanceMeters;
      let confidence: 'high' | 'moderate' | 'low';
      if (distRatio >= 0.5 && distRatio <= 3) confidence = 'high';
      else if (distRatio >= 0.2 && distRatio <= 8) confidence = 'moderate';
      else confidence = 'low';

      const pacePerMile = predictedTimeMinutes / (targetM / 1609.344);

      return {
        raceType: key,
        raceLabel: RACE_LABELS[key],
        distanceMeters: targetM,
        predictedTimeMinutes,
        predictedTimeFormatted: formatTime(predictedTimeMinutes),
        pacePerMile,
        paceFormatted: formatPace(pacePerMile),
        models: { riegel, daniels, cameron },
        confidence,
      };
    });
}

/**
 * Find the best recent GPS workout to use as prediction input.
 * Prefers workouts that are:
 *   1. At least 1.5 miles
 *   2. From the last 30 days
 *   3. Fastest relative performance
 */
export function selectBestInputWorkout(
  workouts: Array<{
    distance_meters: number;
    duration_ms: number;
    date: string;
  }>,
): PredictionInput | null {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const candidates = workouts
    .filter((w) => {
      if (!w.distance_meters || w.distance_meters < 2414) return false; // 1.5 miles min
      if (!w.duration_ms || w.duration_ms <= 0) return false;
      return new Date(w.date) >= thirtyDaysAgo;
    })
    .map((w) => ({
      distanceMeters: w.distance_meters,
      timeMinutes: w.duration_ms / 60000,
      date: w.date,
      // Estimate VDOT for ranking
      vdot: danielsVO2max(w.distance_meters, w.duration_ms / 60000),
    }))
    .sort((a, b) => b.vdot - a.vdot); // Best VDOT first

  if (candidates.length === 0) return null;

  const best = candidates[0];
  return {
    distanceMeters: best.distanceMeters,
    timeMinutes: best.timeMinutes,
    date: best.date,
  };
}

// ── Formatting Helpers ─────────────────────────────────────

function formatTime(totalMinutes: number): string {
  const totalSec = Math.round(totalMinutes * 60);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatPace(paceMinPerMile: number): string {
  const total = Math.round(paceMinPerMile * 60);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, '0')}/mi`;
}
