/**
 * Strict JSON schema, validation, and repair for AI-generated plan outlines
 * (the compact week/day format produced by generate-plan-outline).
 *
 * Pure TypeScript with no Deno APIs so scripts/ai-evals can reuse it.
 */

export const OUTLINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["goal_pace", "message", "approach", "phases", "weeks"],
  properties: {
    goal_pace: { type: ["number", "null"] },
    message: { type: ["string", "null"] },
    approach: { type: "string" },
    phases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["start_week", "end_week", "name", "focus"],
        properties: {
          start_week: { type: "integer" },
          end_week: { type: "integer" },
          name: { type: "string" },
          focus: { type: "string" },
        },
      },
    },
    weeks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["theme", "miles", "days"],
        properties: {
          theme: { type: "string" },
          miles: { type: "number" },
          days: {
            type: "array",
            description: 'Training day = ["label", "short description"]. Rest day = [null].',
            items: { type: "array", items: { type: ["string", "null"] } },
          },
        },
      },
    },
  },
};

export type CompactDay = (string | null)[];

export interface CompactWeek {
  theme: string;
  miles: number;
  days: CompactDay[];
}

export interface CompactOutline {
  goal_pace?: number | null;
  message?: string | null;
  approach?: string;
  phases?: { start_week: number; end_week: number; name: string; focus: string }[];
  weeks: CompactWeek[];
}

export interface OutlineContext {
  totalWeeks: number;
  lastWeekDays: number;
  /** YYYY-MM-DD; day index 0 of week 1. */
  startDate: string;
  daysPerWeekMin: number;
  daysPerWeekMax: number;
  isPaceTarget: boolean;
  /** Coach must choose goal_pace and open with a baseline run. */
  coachPicksPace: boolean;
  /** Lowercase weekday names, e.g. "tuesday". */
  lockedDays: string[];
  /** Runner's current weekly mileage, if known. */
  weeklyMileage?: number | null;
}

/** Week-over-week growth allowed on top of the highest week so far. */
const MAX_WEEKLY_GROWTH = 0.15;
/** Extra miles allowed regardless of percentage, so low-mileage runners can still progress. */
const GROWTH_SLACK_MILES = 1.5;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function isTrainingDay(day: CompactDay | undefined): boolean {
  return !!day && typeof day[0] === "string" && day[0].trim().length > 0;
}

function expectedDays(weekIdx: number, ctx: OutlineContext): number {
  return weekIdx === ctx.totalWeeks - 1 ? ctx.lastWeekDays : 7;
}

function weekdayOf(ctx: OutlineContext, weekIdx: number, dayIdx: number): string {
  const start = new Date(ctx.startDate + "T00:00:00Z");
  return WEEKDAYS[(start.getUTCDay() + weekIdx * 7 + dayIdx) % 7];
}

/** Highest mileage allowed for each week given the weeks before it. */
function mileageCap(prevPeak: number): number {
  return prevPeak * (1 + MAX_WEEKLY_GROWTH) + GROWTH_SLACK_MILES;
}

function week1Cap(weeklyMileage: number): number {
  return weeklyMileage * 1.2 + 2;
}

/** Problems in an outline, phrased as instructions the model can act on. */
export function validateOutline(outline: CompactOutline, ctx: OutlineContext): string[] {
  const problems: string[] = [];
  const weeks = outline.weeks ?? [];

  if (weeks.length !== ctx.totalWeeks) {
    problems.push(`weeks must contain exactly ${ctx.totalWeeks} weeks (got ${weeks.length}).`);
  }

  const lockedEnforceable = ctx.lockedDays.length > 0 && ctx.lockedDays.length <= ctx.daysPerWeekMax;
  const isFinalWeek = (i: number) => i === ctx.totalWeeks - 1;

  weeks.forEach((week, i) => {
    const n = i + 1;
    const days = week.days ?? [];
    const expected = expectedDays(i, ctx);
    if (days.length !== expected) {
      problems.push(`Week ${n}: must have exactly ${expected} day entries (got ${days.length}).`);
    }
    days.forEach((day, d) => {
      if (isTrainingDay(day) && (day.length !== 2 || typeof day[1] !== "string")) {
        problems.push(`Week ${n} day ${d + 1}: training days must be ["label", "short description"].`);
      }
    });

    if (!isFinalWeek(i) && days.length === 7) {
      const training = days.filter(isTrainingDay).length;
      if (training < ctx.daysPerWeekMin || training > ctx.daysPerWeekMax) {
        const range = ctx.daysPerWeekMin === ctx.daysPerWeekMax
          ? `${ctx.daysPerWeekMax}`
          : `${ctx.daysPerWeekMin}–${ctx.daysPerWeekMax}`;
        problems.push(`Week ${n}: has ${training} training days but must have ${range}.`);
      }
      if (lockedEnforceable) {
        const missing = ctx.lockedDays.filter((locked) =>
          !days.some((day, d) => isTrainingDay(day) && weekdayOf(ctx, i, d) === locked)
        );
        if (missing.length) {
          problems.push(`Week ${n}: locked day(s) ${missing.join(", ")} must be training days.`);
        }
      }
    }

    if (!(Number.isFinite(week.miles) && week.miles > 0)) {
      problems.push(`Week ${n}: miles must be a positive number.`);
    }
  });

  // Mileage progression. The final week of a race plan includes the race itself, so skip it.
  const lastChecked = ctx.isPaceTarget ? weeks.length : weeks.length - 1;
  if (ctx.weeklyMileage && ctx.weeklyMileage > 0 && weeks[0]?.miles > week1Cap(ctx.weeklyMileage)) {
    problems.push(
      `Week 1: ${weeks[0].miles} miles is too big a jump from the runner's current ~${ctx.weeklyMileage} mi/week (max ${week1Cap(ctx.weeklyMileage).toFixed(1)}).`,
    );
  }
  let peak = weeks[0]?.miles ?? 0;
  for (let i = 1; i < lastChecked; i++) {
    const miles = weeks[i].miles;
    const cap = mileageCap(peak);
    if (miles > cap) {
      problems.push(
        `Week ${i + 1}: ${miles} miles increases too fast (highest previous week was ${peak}; keep it at or below ${cap.toFixed(1)}).`,
      );
    }
    peak = Math.max(peak, miles);
  }

  // Ending
  const final = weeks[ctx.totalWeeks - 1];
  if (final) {
    const trainingDays = (final.days ?? []).filter(isTrainingDay);
    const lastLabel = trainingDays[trainingDays.length - 1]?.[0] ?? "";
    if (ctx.isPaceTarget) {
      if (!/benchmark|time trial/i.test(lastLabel)) {
        problems.push(`Week ${ctx.totalWeeks}: the last training day must be a "Benchmark Run" or "Time Trial".`);
      }
    } else {
      const lastEntry = final.days?.[final.days.length - 1];
      if (!isTrainingDay(lastEntry) || !/race day/i.test(lastEntry![0] ?? "")) {
        problems.push(`Week ${ctx.totalWeeks}: the very last day entry must be ["Race Day", "..."].`);
      }
    }
  }
  if (ctx.isPaceTarget && weeks.some((w) => (w.days ?? []).some((d) => isTrainingDay(d) && /race day/i.test(d[0]!)))) {
    problems.push(`This is a pace development plan with no race — do not use "Race Day".`);
  }

  if (ctx.coachPicksPace) {
    const gp = Number(outline.goal_pace);
    if (!(gp >= 4 && gp <= 20)) {
      problems.push(`goal_pace must be the target pace you chose, in decimal min/mile between 4 and 20.`);
    }
    const firstTraining = (weeks[0]?.days ?? []).find(isTrainingDay);
    if (!firstTraining || !/baseline/i.test(firstTraining[0] ?? "")) {
      problems.push(`Week 1: the first training day must be ["Baseline Run", "..."].`);
    }
  }

  problems.push(...validatePhases(outline.phases, ctx.totalWeeks));
  return problems;
}

function validatePhases(phases: CompactOutline["phases"], totalWeeks: number): string[] {
  if (!phases?.length) return ["phases must contain 2–5 phases covering every week."];
  const sorted = [...phases].sort((a, b) => a.start_week - b.start_week);
  let expectedStart = 1;
  for (const p of sorted) {
    if (p.start_week !== expectedStart || p.end_week < p.start_week) {
      return [`phases must cover weeks 1–${totalWeeks} in order with no gaps or overlaps.`];
    }
    expectedStart = p.end_week + 1;
  }
  return expectedStart === totalWeeks + 1
    ? []
    : [`phases must cover weeks 1–${totalWeeks} in order with no gaps or overlaps.`];
}

/**
 * Deterministic fixes for problems left after the model's retry. Returns null
 * if the outline is missing weeks and can't be safely repaired.
 */
export function repairOutline(outline: CompactOutline, ctx: OutlineContext): CompactOutline | null {
  const weeks = (outline.weeks ?? []).slice(0, ctx.totalWeeks);
  if (weeks.length < ctx.totalWeeks) return null;

  const repaired = weeks.map((week, i) => {
    const expected = expectedDays(i, ctx);
    const days = (week.days ?? []).slice(0, expected).map((d) =>
      isTrainingDay(d) ? [d[0], typeof d[1] === "string" ? d[1] : ""] : [null]
    );
    while (days.length < expected) days.push([null]);
    return { ...week, days };
  });

  const lastChecked = ctx.isPaceTarget ? repaired.length : repaired.length - 1;
  if (ctx.weeklyMileage && ctx.weeklyMileage > 0 && repaired[0]) {
    repaired[0].miles = Math.min(repaired[0].miles, Math.round(week1Cap(ctx.weeklyMileage)));
  }
  let peak = repaired[0]?.miles ?? 0;
  for (let i = 1; i < lastChecked; i++) {
    const cap = Math.floor(mileageCap(peak));
    if (repaired[i].miles > cap) repaired[i].miles = cap;
    peak = Math.max(peak, repaired[i].miles);
  }

  if (!ctx.isPaceTarget) {
    const final = repaired[repaired.length - 1];
    const lastIdx = final.days.length - 1;
    if (!isTrainingDay(final.days[lastIdx]) || !/race day/i.test(final.days[lastIdx][0] ?? "")) {
      final.days[lastIdx] = ["Race Day", "Race day! Trust your training."];
    }
  }

  return { ...outline, weeks: repaired };
}
