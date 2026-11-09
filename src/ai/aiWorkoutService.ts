/**
 * AI Workout Builder service.
 *
 * Calls a Supabase Edge Function that orchestrates the LLM call.
 * The edge function receives the user's prompt + running profile
 * context and returns a WorkoutDefinition-compatible JSON object.
 */

import { supabase } from '../analytics/supabaseClient';
import type { AiClientMeta } from '../analytics/aiOutcome';
import {
  WorkoutDefinition,
  WorkoutBlock,
  Segment,
  RepeatGroup,
  generateId,
  totalWorkoutSeconds,
  totalWorkoutDistanceMeters,
  formatDistanceShort,
  formatTime,
  defaultSegmentLabel,
  parseWorkoutCategory,
} from '../workout/workoutTypes';
import { migrateToBlockModel } from '../workout/workoutStorage';
import { HistorySummary, serializeHistorySummary } from './historySummary';

export interface AIContext {
  experienceLevel?: string;
  typicalRunMinutes?: number;
  easyPace?: number;
  fastPace?: number;
  goals: string[];
  preferences: string[];
  historySummary?: HistorySummary;
}

export interface AIResponse {
  workout: WorkoutDefinition;
  message: string;
  /** Links outcome events to the logged request. */
  requestId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  workout?: WorkoutDefinition;
  timestamp: number;
}

/**
 * Ensure mutual exclusivity of intensity vs. targetPace on each segment,
 * and assign ids to blocks that the AI didn't include.
 */
export function sanitizeBlock(block: WorkoutBlock): WorkoutBlock {
  if (block.blockType === 'segment') {
    const seg = { ...block };
    if (!seg.id) seg.id = generateId();
    if (seg.intensity && seg.targetPace != null) {
      delete seg.targetPace;
    }
    return seg;
  }
  // RepeatGroup
  const rg = { ...block };
  if (!rg.id) rg.id = generateId();
  rg.blocks = rg.blocks.map(sanitizeBlock);
  return rg;
}

/**
 * Serialize a workout into a concise text block so the AI can reference
 * the exact structure when the user asks for edits in a follow-up message.
 */
function serializeWorkoutForContext(workout: WorkoutDefinition): string {
  const totals: string[] = [];
  const seconds = totalWorkoutSeconds(workout);
  if (seconds > 0) totals.push(formatTime(seconds));
  const meters = totalWorkoutDistanceMeters(workout);
  if (meters) totals.push(formatDistanceShort(meters, 'minPerMile'));
  const total = totals.join(' + ') || 'open-ended';

  const serializeBlockTree = (blocks: WorkoutBlock[], indent = ''): string => {
    return blocks.map((b) => {
      if (b.blockType === 'segment') {
        const label = b.label || defaultSegmentLabel(b.segmentType);
        const parts = [`${label} (${b.segmentType})`];

        if (b.target.type === 'time' && b.target.durationSeconds) {
          parts.push(formatTime(b.target.durationSeconds));
        } else if (b.target.type === 'distance' && b.target.distanceMeters) {
          parts.push(`${Math.round(b.target.distanceMeters)}m (${formatDistanceShort(b.target.distanceMeters, 'minPerMile')})`);
        } else if (b.target.type === 'manual') {
          parts.push('manual');
        }

        if (b.intensity) parts.push(`intensity: ${b.intensity}`);
        if (b.targetPace != null) {
          const total = Math.round(b.targetPace * 60);
          const m = Math.floor(total / 60);
          const s = total % 60;
          parts.push(`pace ${m}:${s.toString().padStart(2, '0')}/mi`);
        }
        return `${indent}- ${parts.join(', ')}`;
      }
      // RepeatGroup
      const header = `${indent}${b.name ?? 'Repeat'} ×${b.repetitions}`;
      const inner = serializeBlockTree(b.blocks, indent + '    ');
      return `${header}\n${inner}`;
    }).join('\n');
  };

  const category = workout.category ? ` — Category: ${workout.category}` : '';
  return `[Workout: "${workout.name}"${category} — Total: ${total}]\n${serializeBlockTree(workout.blocks)}`;
}

/**
 * Generate a workout via the AI edge function.
 */
export async function generateWorkout(
  prompt: string,
  context: AIContext,
  conversationHistory: ChatMessage[],
  client?: AiClientMeta,
): Promise<AIResponse> {
  const enrichedConversation = conversationHistory.map((m) => ({
    role: m.role,
    content: m.workout
      ? `${m.content}\n\n${serializeWorkoutForContext(m.workout)}`
      : m.content,
  }));

  const historySummaryText = context.historySummary
    ? serializeHistorySummary(context.historySummary)
    : null;

  const { data, error } = await supabase.functions.invoke('generate-workout', {
    body: {
      prompt,
      profile: {
        experience_level: context.experienceLevel,
        typical_run_minutes: context.typicalRunMinutes,
        easy_pace: context.easyPace,
        fast_pace: context.fastPace,
      },
      goals: context.goals,
      preferences: context.preferences,
      conversation: enrichedConversation,
      history_summary: historySummaryText,
      client,
    },
  });

  if (error) {
    const body = error.context
      ? await error.context.json().catch(() => null)
      : null;
    throw new Error(body?.error || error.message || 'Failed to generate workout');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  const now = Date.now();
  const rawWorkout = data.workout;

  let workout: WorkoutDefinition;

  // Handle new format (blocks with blockType) or old format (warmup/blocks/cooldown)
  if (rawWorkout?.blocks?.[0]?.blockType) {
    // New format — sanitize and add ids
    workout = {
      id: generateId(),
      name: rawWorkout.name ?? 'AI Workout',
      category: parseWorkoutCategory(rawWorkout.category),
      blocks: (rawWorkout.blocks as WorkoutBlock[]).map(sanitizeBlock),
      targetDistanceMeters: rawWorkout.targetDistanceMeters ?? undefined,
      createdAt: now,
      updatedAt: now,
    };
  } else {
    // Old format from cached edge function — migrate through block model
    const oldDef = {
      id: generateId(),
      name: rawWorkout?.name ?? 'AI Workout',
      category: parseWorkoutCategory(rawWorkout?.category),
      warmup: rawWorkout?.warmup ?? [],
      blocks: rawWorkout?.blocks ?? [],
      cooldown: rawWorkout?.cooldown ?? [],
      targetDistanceMeters: rawWorkout?.targetDistanceMeters ?? undefined,
      createdAt: now,
      updatedAt: now,
    };
    workout = migrateToBlockModel(oldDef);
    workout.blocks = workout.blocks.map(sanitizeBlock);
  }

  return {
    workout,
    message: data.message ?? 'Here\'s a workout for you!',
    requestId: data.request_id,
  };
}
