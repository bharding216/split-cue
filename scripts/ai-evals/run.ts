/**
 * Plan-quality eval: runs the production plan-outline and workout prompts
 * against one or more OpenAI models for every runner profile in cases.ts,
 * validates the output with the same checks the edge functions use, and
 * writes readable plans for human review.
 *
 * Each call is a single attempt (no validation retry), so the numbers show how
 * often a model gets it right the first time.
 *
 *   OPENAI_API_KEY=sk-... npx tsx scripts/ai-evals/run.ts
 *   npx tsx scripts/ai-evals/run.ts --models gpt-6.1-sol,gpt-6-luna --cases half-locked-days
 *   npx tsx scripts/ai-evals/run.ts --effort low --skip-workouts
 *
 * Output: scripts/ai-evals/results/<timestamp>/summary.md plus one markdown
 * file per model and case.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CASES, type EvalCase } from './cases';
import {
  buildMessages,
  buildSystemPrompt,
  outlineContext,
  planDimensions,
  type RequestBody,
} from '../../supabase/functions/generate-plan-outline/prompt';
import {
  BATCH_SCHEMA,
  buildSystemPrompt as buildWorkoutsPrompt,
  validateBatch,
  type WorkoutBatch,
  type WorkoutRequest,
} from '../../supabase/functions/generate-workouts/prompt';
import {
  OUTLINE_SCHEMA,
  isTrainingDay,
  validateOutline,
  type CompactOutline,
} from '../../supabase/functions/_shared/planValidation';
import { estimateWorkoutSeconds, formatPace, type AIBlock } from '../../supabase/functions/_shared/workoutValidation';

/** USD per million tokens [input, output], for rough cost estimates. */
const PRICES: Record<string, [number, number]> = {
  'gpt-6-astra': [10, 50],
  'gpt-6.1-sol': [2, 10],
  'gpt-6-sol': [2, 10],
  'gpt-6-luna': [0.1, 0.5],
};

const CONCURRENCY = 4;

// ── CLI ──────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const models = (arg('models') ?? 'gpt-6.1-sol').split(',').map((m) => m.trim()).filter(Boolean);
const caseIds = arg('cases')?.split(',').map((c) => c.trim());
const effort = arg('effort') ?? 'medium';
const skipWorkouts = process.argv.includes('--skip-workouts');
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('Set OPENAI_API_KEY first.');
  process.exit(1);
}

const cases = caseIds ? CASES.filter((c) => caseIds.includes(c.id)) : CASES;
if (cases.length === 0) {
  console.error(`No cases matched. Available: ${CASES.map((c) => c.id).join(', ')}`);
  process.exit(1);
}

// ── OpenAI ───────────────────────────────────────────────────

interface CallResult<T> {
  data: T | null;
  error?: string;
  seconds: number;
  inputTokens: number;
  outputTokens: number;
}

async function callModel<T>(
  model: string,
  name: string,
  messages: { role: string; content: string }[],
  schema: object,
  reasoningEffort: string,
  maxCompletionTokens: number,
): Promise<CallResult<T>> {
  const started = Date.now();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      reasoning_effort: reasoningEffort,
      max_completion_tokens: maxCompletionTokens,
      response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } },
    }),
  });
  const seconds = (Date.now() - started) / 1000;
  if (!res.ok) {
    return { data: null, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, seconds, inputTokens: 0, outputTokens: 0 };
  }
  const json = await res.json();
  const choice = json.choices?.[0];
  const usage = { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0 };
  if (choice?.finish_reason === 'length') {
    return { data: null, error: 'Response truncated (finish_reason=length)', seconds, ...usage };
  }
  try {
    return { data: JSON.parse(choice?.message?.content ?? '') as T, seconds, ...usage };
  } catch {
    return { data: null, error: 'Unparseable JSON', seconds, ...usage };
  }
}

// ── Eval ─────────────────────────────────────────────────────

interface CaseResult {
  model: string;
  caseId: string;
  outlineProblems: string[];
  workoutProblems: string[];
  error?: string;
  seconds: number;
  cost: number | null;
  report: string;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

function nextMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  return dateKey(d);
}

function costOf(model: string, input: number, output: number): number | null {
  const price = PRICES[model];
  return price ? (input * price[0] + output * price[1]) / 1_000_000 : null;
}

/** Up to 3 training days from week 1 and from the highest-mileage week. */
function pickWorkoutDays(outline: CompactOutline, startDate: string): WorkoutRequest[] {
  const weeks = outline.weeks;
  const peakIdx = weeks.reduce((best, w, i) => (w.miles > weeks[best].miles ? i : best), 0);
  const picked: WorkoutRequest[] = [];
  for (const weekIdx of [...new Set([0, peakIdx])]) {
    const week = weeks[weekIdx];
    week.days.forEach((day, dayIdx) => {
      if (!isTrainingDay(day) || picked.filter((p) => p.week_number === weekIdx + 1).length >= 3) return;
      picked.push({
        date: addDays(startDate, weekIdx * 7 + dayIdx),
        day_label: day[0]!,
        description: day[1] ?? null,
        week_number: weekIdx + 1,
        week_theme: week.theme,
        total_miles_target: week.miles,
      });
    });
  }
  return picked;
}

function describeBlocks(blocks: AIBlock[], indent = '    '): string {
  return blocks.map((b) => {
    if (b.blockType === 'repeat') {
      return `${indent}- ${b.repetitions}× ${b.name ?? ''}\n${describeBlocks(b.blocks, indent + '  ')}`;
    }
    const target = b.target.type === 'time'
      ? `${Math.round((b.target.durationSeconds ?? 0) / 60 * 10) / 10} min`
      : `${Math.round(b.target.distanceMeters ?? 0)} m`;
    const effortText = b.targetPace != null ? `@ ${formatPace(b.targetPace)}` : b.intensity ?? '';
    return `${indent}- ${b.segmentType}: ${b.label ?? ''} ${target} ${effortText}`.trimEnd();
  }).join('\n');
}

async function runCase(model: string, c: EvalCase): Promise<CaseResult> {
  const startDate = nextMonday();
  const body: RequestBody = {
    ...c.body,
    start_date: startDate,
    race_date: addDays(startDate, c.weeks * 7 + (c.extraDays ?? 0) - 1),
  };
  const dims = planDimensions(body.start_date, body.race_date);
  const ctx = outlineContext(body, dims);
  const messages = buildMessages(body, buildSystemPrompt(body, dims), dims);

  const lines: string[] = [`# ${c.id} — ${model}`, '', `**Look for:** ${c.lookFor}`, ''];
  const result: CaseResult = { model, caseId: c.id, outlineProblems: [], workoutProblems: [], seconds: 0, cost: 0, report: '' };
  const addCost = (r: CallResult<unknown>) => {
    const cost = costOf(model, r.inputTokens, r.outputTokens);
    result.cost = cost == null || result.cost == null ? null : result.cost + cost;
    result.seconds += r.seconds;
  };

  const outlineRes = await callModel<CompactOutline>(model, 'plan_outline', messages, OUTLINE_SCHEMA, effort, 32000);
  addCost(outlineRes);
  if (!outlineRes.data) {
    result.error = `outline: ${outlineRes.error}`;
    result.report = [...lines, `**Error:** ${result.error}`].join('\n');
    return result;
  }
  const outline = outlineRes.data;
  result.outlineProblems = validateOutline(outline, ctx);

  lines.push(`**Approach:** ${outline.approach ?? ''}`, '');
  if (outline.goal_pace) lines.push(`**Coach-picked goal pace:** ${formatPace(outline.goal_pace)}`, '');
  lines.push('| Week | Theme | Miles | Days |', '|---|---|---|---|');
  outline.weeks.forEach((w, i) => {
    const days = w.days.map((d) => (isTrainingDay(d) ? d[0] : '·')).join(', ');
    lines.push(`| ${i + 1} | ${w.theme} | ${w.miles} | ${days} |`);
  });
  lines.push('', '## Outline problems', ...(result.outlineProblems.length ? result.outlineProblems.map((p) => `- ${p}`) : ['None']));

  if (!skipWorkouts) {
    const requested = pickWorkoutDays(outline, startDate);
    const workoutBody = {
      profile: body.profile,
      race_type: body.race_type,
      race_date: body.race_date,
      goal_time_minutes: body.goal_time_minutes,
      goal_type: body.goal_type,
      goal_pace: body.goal_pace ?? outline.goal_pace ?? null,
      days_per_week: body.days_per_week,
      total_weeks: dims.totalWeeks,
      workouts: requested,
    };
    const workoutMessages = [
      { role: 'system', content: buildWorkoutsPrompt(workoutBody) },
      { role: 'user', content: `Generate detailed workouts for these ${requested.length} training days.` },
    ];
    const batchRes = await callModel<WorkoutBatch>(model, 'plan_workouts', workoutMessages, BATCH_SCHEMA, 'low', 24000);
    addCost(batchRes);
    const paces = { easyPace: body.profile?.easy_pace, fastPace: body.profile?.fast_pace };

    lines.push('', '## Sample workouts');
    if (!batchRes.data) {
      result.workoutProblems = [`workouts: ${batchRes.error}`];
    } else {
      result.workoutProblems = validateBatch(batchRes.data, requested, paces);
      for (const w of batchRes.data.workouts) {
        const req = requested.find((r) => r.date === w.date);
        const minutes = Math.round(estimateWorkoutSeconds(w.workout.blocks, paces) / 60);
        lines.push('', `**${w.date} — ${req?.day_label ?? '?'}** (${req?.description ?? ''}) → ${w.workout.name}, ${w.workout.category}, ~${minutes} min`);
        lines.push(describeBlocks(w.workout.blocks));
      }
    }
    lines.push('', '## Workout problems', ...(result.workoutProblems.length ? result.workoutProblems.map((p) => `- ${p}`) : ['None']));
  }

  result.report = lines.join('\n');
  return result;
}

async function runAll(): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = resolve(__dirname, 'results', stamp);
  const jobs = models.flatMap((model) => cases.map((c) => ({ model, c })));
  const results: CaseResult[] = [];

  console.log(`Running ${jobs.length} eval(s): ${models.join(', ')} × ${cases.length} case(s), outline effort=${effort}`);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (next < jobs.length) {
      const { model, c } = jobs[next++];
      const r = await runCase(model, c).catch((err): CaseResult => ({
        model, caseId: c.id, outlineProblems: [], workoutProblems: [], seconds: 0, cost: null,
        error: String(err), report: `# ${c.id} — ${model}\n\n**Error:** ${String(err)}`,
      }));
      results.push(r);
      const dir = join(outDir, r.model);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${r.caseId}.md`), r.report);
      const status = r.error ? `ERROR ${r.error}` : `${r.outlineProblems.length} outline / ${r.workoutProblems.length} workout problem(s)`;
      console.log(`  ${r.model}  ${r.caseId}: ${status} (${r.seconds.toFixed(1)}s)`);
    }
  }));

  const summary = [
    `# AI eval — ${stamp}`,
    '',
    `Outline reasoning effort: ${effort}. Single attempt per call (production retries once on problems).`,
    '',
    '| Model | Clean outlines | Clean workout batches | Errors | Avg seconds | Est. cost |',
    '|---|---|---|---|---|---|',
  ];
  for (const model of models) {
    const rs = results.filter((r) => r.model === model);
    const ok = rs.filter((r) => !r.error);
    const clean = ok.filter((r) => r.outlineProblems.length === 0).length;
    const cleanWorkouts = ok.filter((r) => r.workoutProblems.length === 0).length;
    const avg = ok.length ? ok.reduce((s, r) => s + r.seconds, 0) / ok.length : 0;
    const cost = rs.some((r) => r.cost == null) ? 'n/a' : `$${rs.reduce((s, r) => s + (r.cost ?? 0), 0).toFixed(3)}`;
    summary.push(`| ${model} | ${clean}/${rs.length} | ${skipWorkouts ? '—' : `${cleanWorkouts}/${rs.length}`} | ${rs.length - ok.length} | ${avg.toFixed(1)} | ${cost} |`);
  }
  summary.push('', '## Problems by case', '');
  for (const r of results.sort((a, b) => a.caseId.localeCompare(b.caseId) || a.model.localeCompare(b.model))) {
    const problems = [...(r.error ? [r.error] : []), ...r.outlineProblems, ...r.workoutProblems];
    if (problems.length) summary.push(`**${r.caseId} (${r.model})**`, ...problems.map((p) => `- ${p}`), '');
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'summary.md'), summary.join('\n'));
  console.log(`\n${summary.slice(4, 6 + models.length).join('\n')}\n\nFull results: ${outDir}`);
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
