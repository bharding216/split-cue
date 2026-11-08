/**
 * Prompt construction for generate-plan-outline. Kept free of Deno APIs so
 * scripts/ai-evals can run the production prompt against candidate models.
 */

import type { ChatMessage } from "../_shared/openai.ts";
import type { OutlineContext } from "../_shared/planValidation.ts";

// ── Types ────────────────────────────────────────────────────

export interface RunnerProfile {
  experience_level?: string;
  typical_run_minutes?: number;
  typical_run_minutes_max?: number;
  easy_pace?: number;
  fast_pace?: number;
  race_times?: Record<string, unknown>;
  weekly_mileage?: number;
  longest_recent_run_minutes?: number;
  max_workout_minutes?: number;
  preferred_days?: { day: string; locked: boolean }[];
  cross_training?: string[];
}

export interface RequestBody {
  profile?: RunnerProfile;
  goals?: string[];
  preferences?: string[];
  limitations?: string[];
  race_type: string;
  race_distance_meters?: number | null;
  race_date: string;
  goal_time_minutes?: number | null;
  goal_type?: 'race' | 'pace_target';
  goal_pace?: number | null;
  /** Client-side estimate of current pace, e.g. "About 11:40/mi for 5K (from your recent runs)". */
  pace_baseline?: string | null;
  start_date: string;
  days_per_week: number;
  days_per_week_min?: number | null;
  history_summary?: string | null;
  /** Present when the runner asked for changes to a proposed outline. */
  revision?: {
    previous: {
      approach?: string | null;
      phases?: PlanPhase[] | null;
      goal_pace?: number | null;
      weeks: {
        theme: string;
        total_miles_target: number;
        days: { day_label: string; description: string | null }[];
      }[];
    };
    feedback: string;
    /** Earlier feedback from this same review session, oldest first. */
    prior_feedback?: string[];
  } | null;
}

export interface PlanPhase {
  start_week: number;
  end_week: number;
  name: string;
  focus: string;
}

export function formatPaceMi(pace: number): string {
  const total = Math.round(pace * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}/mi`;
}

function weekdayName(date: string): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

// ── Plan dimensions ──────────────────────────────────────────

export interface PlanDimensions {
  totalWeeks: number;
  lastWeekDays: number;
}

export function planDimensions(startDate: string, endDate: string): PlanDimensions {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  const remaining = totalDays - fullWeeks * 7;
  return {
    totalWeeks: remaining > 0 ? fullWeeks + 1 : Math.max(1, fullWeeks),
    lastWeekDays: remaining > 0 ? remaining : 7,
  };
}

export function outlineContext(body: RequestBody, dims: PlanDimensions): OutlineContext {
  const isPaceTarget = body.goal_type === 'pace_target';
  return {
    totalWeeks: dims.totalWeeks,
    lastWeekDays: dims.lastWeekDays,
    startDate: body.start_date,
    daysPerWeekMin: body.days_per_week_min && body.days_per_week_min < body.days_per_week
      ? body.days_per_week_min
      : body.days_per_week,
    daysPerWeekMax: body.days_per_week,
    isPaceTarget,
    coachPicksPace: isPaceTarget && !body.goal_pace,
    lockedDays: (body.profile?.preferred_days ?? [])
      .filter((d) => d.locked)
      .map((d) => d.day.toLowerCase()),
    weeklyMileage: body.profile?.weekly_mileage ?? null,
  };
}

// ── System prompt ────────────────────────────────────────────

export function buildSystemPrompt(body: RequestBody, dims: PlanDimensions): string {
  const sections: string[] = [];

  const isPaceTarget = body.goal_type === 'pace_target';

  const raceLabel = body.race_type === 'custom'
    ? isPaceTarget ? 'pace development' : `${body.race_distance_meters ?? 'unknown'}m race`
    : body.race_type.replace('_', ' ');

  if (isPaceTarget) {
    const paceStr = body.goal_pace ? formatPaceMi(body.goal_pace) : 'a realistic target pace that YOU choose';
    const distanceContext = body.race_type !== 'custom'
      ? ` for ${body.race_type.replace('_', ' ')} distance`
      : '';
    const coachPicks = !body.goal_pace
      ? `\n\nThe runner did not choose a target pace — you must pick one. Base it on their profile, history, and current pace estimate; if there is little data, be conservative for their experience level. The FIRST training day of week 1 must be ["Baseline Run", "Comfortable continuous run to measure your starting pace"].`
      : '';

    sections.push(`You are SplitCue's AI running coach creating a ${dims.totalWeeks}-week pace development plan OUTLINE.

The runner wants to comfortably hold ${paceStr}${distanceContext} by ${body.race_date}.${coachPicks}

This is NOT a race plan. There is no race at the end. Focus on:
- Progressive pace development through tempo, threshold, and interval work
- Building aerobic base that supports the target pace
- Periodic benchmark/time-trial runs to track progress
- NO taper phase — maintain fitness through the end
- Last day should be a "Benchmark Run" or "Time Trial", NOT "Race Day"

Follow progressive periodization: Base (~35%), Build (~35%), Sharpen (~30%).

OUTLINE only — no detailed workout structures. Just day labels and short coaching notes.`);
  } else {
    sections.push(`You are SplitCue's AI running coach creating a ${dims.totalWeeks}-week ${raceLabel} training plan OUTLINE.

Follow standard periodization: Base (~30%), Build (~30%), Peak (~25%), Taper (~15%).

OUTLINE only — no detailed workout structures. Just day labels and short coaching notes.`);
  }

  // Runner profile
  const profile = body.profile;
  if (profile) {
    const parts: string[] = [];
    if (profile.experience_level) parts.push(`Experience: ${profile.experience_level}`);
    if (profile.typical_run_minutes) {
      const max = profile.typical_run_minutes_max;
      parts.push(`Typical run: ${profile.typical_run_minutes}${max ? `–${max}` : ''} min`);
    }
    if (profile.easy_pace) {
      const m = Math.floor(profile.easy_pace);
      const s = Math.round((profile.easy_pace - m) * 60);
      parts.push(`Easy pace: ${m}:${s.toString().padStart(2, "0")}/mi`);
    }
    if (profile.fast_pace) {
      const m = Math.floor(profile.fast_pace);
      const s = Math.round((profile.fast_pace - m) * 60);
      parts.push(`Fast pace: ${m}:${s.toString().padStart(2, "0")}/mi`);
    }
    if (profile.weekly_mileage) parts.push(`Weekly mileage: ~${profile.weekly_mileage} mi`);
    if (profile.longest_recent_run_minutes) parts.push(`Longest recent run: ${profile.longest_recent_run_minutes} min`);
    if (profile.max_workout_minutes) parts.push(`Max workout: ${profile.max_workout_minutes} min`);
    if (parts.length > 0) {
      sections.push(`## Runner\n${parts.join(" | ")}`);
    }
    if (profile.cross_training?.length) {
      sections.push(`## Cross Training\n${profile.cross_training.join(", ")}\nAccount for cross-training load when planning recovery.`);
    }
    if (profile.preferred_days?.length) {
      const locked = profile.preferred_days.filter((d) => d.locked).map((d) => d.day);
      const flexible = profile.preferred_days.filter((d) => !d.locked).map((d) => d.day);
      const lines: string[] = [];
      if (locked.length) lines.push(`Locked days (MUST schedule a workout): ${locked.join(", ")}`);
      if (flexible.length) lines.push(`Flexible days (preferred but can be swapped/moved if needed): ${flexible.join(", ")}`);
      lines.push("Place rest days on non-preferred days. When adjusting the schedule, move workouts off flexible days first — never move workouts off locked days.");
      sections.push(`## Training Day Availability\n${lines.join("\n")}`);
    }
  }

  // Race / goal details
  const goalParts: string[] = [];
  if (isPaceTarget) {
    const paceStr = body.goal_pace ? formatPaceMi(body.goal_pace) : 'coach to choose';
    goalParts.push(`Target pace: ${paceStr} by ${body.race_date}`);
    if (body.pace_baseline) {
      goalParts.push(`Current pace estimate: ${body.pace_baseline}`);
    }
    if (body.race_type !== 'custom') {
      goalParts.push(`Distance context: ${body.race_type.replace('_', ' ')}`);
    }
  } else {
    goalParts.push(`Race: ${raceLabel} on ${body.race_date}`);
    if (body.goal_time_minutes) {
      const hrs = Math.floor(body.goal_time_minutes / 60);
      const mins = Math.round(body.goal_time_minutes % 60);
      goalParts.push(`Goal: ${hrs > 0 ? `${hrs}h ` : ''}${mins}m`);
    }
  }
  const daysLabel = body.days_per_week_min && body.days_per_week_min < body.days_per_week
    ? `${body.days_per_week_min}–${body.days_per_week}`
    : `${body.days_per_week}`;
  goalParts.push(`${daysLabel} training days/week, start ${body.start_date}`);
  sections.push(`## ${isPaceTarget ? 'Goal' : 'Race'}\n${goalParts.join(" | ")}`);

  if (body.goals?.length) {
    sections.push(`## Goals\n${body.goals.join(", ")}`);
  }
  if (body.preferences?.length) {
    sections.push(`## Preferences\n${body.preferences.join(", ")}`);
  }
  if (body.limitations?.length) {
    sections.push(`## Limitations\n${body.limitations.join(", ")}\nIMPORTANT: Respect these — adjust volume, intensity, and rest accordingly.`);
  }
  if (body.history_summary) {
    sections.push(`## History\n${body.history_summary}\nCalibrate starting volume accordingly.`);
  }

  // Compact output schema — dates are assigned server-side, not by the model
  const coachPicksPace = isPaceTarget && !body.goal_pace;
  const isRevision = !!body.revision;

  sections.push(`## Output — COMPACT FORMAT (dates assigned automatically)

JSON only, no markdown fences:

{${coachPicksPace ? `\n  "goal_pace": number (the target pace you chose, decimal min/mile, e.g. 10.5 = 10:30/mi),` : ''}${isRevision ? `\n  "message": "1–2 sentences to the runner explaining what you changed (or why you kept something the same)",` : ''}
  "approach": "2–3 sentences, written to the runner, explaining the overall strategy of this plan",
  "phases": [
    { "start_week": 1, "end_week": 3, "name": "Base Building", "focus": "one sentence on what these weeks focus on and why" }
  ],
  "weeks": [
    {
      "theme": "phase name, e.g. Base Building 1",
      "miles": number,
      "days": [
        ["Easy Run", "30 min conversational effort"],
        [null],
        ["Tempo", "20 min at threshold pace"],
        [null],
        ["Easy Run", "30 min easy"],
        ["Long Run", "60 min relaxed"],
        [null]
      ]
    }
  ]
}

Rules:
- Training day = ["label", "short description"]. Rest day = [null].
- Labels: Easy Run, Long Run, Tempo, Intervals, Recovery, Fartlek${isPaceTarget ? ', Benchmark Run, Time Trial' : ', Race Day'}, etc.
- Weeks 1–${dims.totalWeeks > 1 ? dims.totalWeeks - 1 : 1}: exactly 7 entries each.${dims.totalWeeks > 1 ? (isPaceTarget
  ? `\n- Week ${dims.totalWeeks}: exactly ${dims.lastWeekDays} entries. Last training entry should be ["Benchmark Run", "Time trial — test your target pace!"].`
  : `\n- Week ${dims.totalWeeks}: exactly ${dims.lastWeekDays} entries. Last entry must be ["Race Day", "Race day! Trust your training."].`) : ''}
- ${daysLabel} training days per full week; rest days fill remaining slots.
- Day entries start on ${weekdayName(body.start_date)} (${body.start_date}); entry 1 of every week falls on ${weekdayName(body.start_date)}.
- miles = reasonable weekly mileage for runner's level and phase. Never raise weekly miles more than ~10–15% above the highest previous week; include a lighter recovery week every 3–4 weeks.
- Any field not shown in the format above must be null.
- Keep descriptions to one short sentence.
- phases must cover weeks 1–${dims.totalWeeks} in order with no gaps or overlaps, and match the week themes. Use 2–5 phases.
- REUSE THE SAME DAY LABELS across weeks. Real training plans repeat the same session types (e.g. "Intervals" every Tuesday, "Tempo" every Thursday, "Long Run" every Saturday). Use the SAME label for the same slot across weeks — progress by changing the description (e.g. "4×800m" → "5×800m"), not by inventing new labels each week. Limit yourself to 3–5 distinct workout labels for the entire plan.`);

  return sections.join("\n\n");
}

// ── Revision conversation ────────────────────────────────────

export function buildMessages(body: RequestBody, systemPrompt: string, dims: PlanDimensions): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Generate the ${dims.totalWeeks}-week plan outline.` },
  ];
  const revision = body.revision;
  if (!revision) return messages;

  const prev = revision.previous;
  const previousCompact = {
    ...(prev.goal_pace ? { goal_pace: prev.goal_pace } : {}),
    approach: prev.approach ?? "",
    phases: prev.phases ?? [],
    weeks: prev.weeks.map((w) => ({
      theme: w.theme,
      miles: w.total_miles_target,
      days: w.days.map((d) => d.day_label === "Rest Day" ? [null] : [d.day_label, d.description ?? ""]),
    })),
  };
  messages.push({ role: "assistant", content: JSON.stringify(previousCompact) });

  const earlier = (revision.prior_feedback ?? []).filter((f) => f.trim());
  const earlierNote = earlier.length
    ? `\n\nEarlier requests in this conversation (already reflected above — keep honoring them):\n${earlier.map((f) => `- ${f}`).join("\n")}`
    : "";
  messages.push({
    role: "user",
    content: `The runner reviewed this plan and replied:\n"${revision.feedback}"${earlierNote}\n\nRevise the plan to address their feedback while keeping it safe and appropriate for their level. If a request would be unsafe or conflicts with the plan rules, adjust as close as you responsibly can and explain in "message". Return the FULL revised plan in the same JSON format, including "message".`,
  });
  return messages;
}
