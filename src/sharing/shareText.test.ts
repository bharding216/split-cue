import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CompletedWorkout, WorkoutDefinition } from '../workout/workoutTypes';
import {
  compareResults,
  composeShareBody,
  defaultCaption,
  formatResultMark,
  type ShareSubject,
} from './shareText';

const MILE = 1609.344;

const workout: WorkoutDefinition = {
  id: 'w1',
  name: 'Tempo Mile',
  blocks: [
    { id: 's1', blockType: 'segment', segmentType: 'warmup', target: { type: 'time', durationSeconds: 600 } },
    {
      id: 'r1',
      blockType: 'repeat',
      repetitions: 3,
      blocks: [
        { id: 's2', blockType: 'segment', segmentType: 'run', label: 'Tempo', target: { type: 'distance', distanceMeters: MILE } },
        { id: 's3', blockType: 'segment', segmentType: 'recovery', target: { type: 'time', durationSeconds: 120 } },
      ],
    },
  ],
  createdAt: 0,
  updatedAt: 0,
};

const run: CompletedWorkout = {
  id: 'c1',
  workoutId: 'w1',
  workoutName: 'Tempo Mile',
  completedAt: 0,
  totalDurationMs: 32 * 60_000,
  totalDistanceMeters: 4 * MILE,
  splits: [
    {
      label: 'Tempo',
      type: 'hard',
      plannedDurationSec: 0,
      actualDurationMs: 7 * 60_000,
      distanceMeters: MILE,
      avgPaceMinPerMile: 7,
      avgPaceMinPerKm: null,
      targetPace: undefined,
      effort: undefined,
    },
  ],
};

const all = { includeResult: true, includeSplits: true };
const none = { includeResult: false, includeSplits: false };

test('result mark shows time, distance, and pace', () => {
  assert.equal(formatResultMark({ durationMs: 32 * 60_000, distanceMeters: 4 * MILE }, 'minPerMile'), '32:00 · 4.00 mi · 8:00/mi');
  assert.equal(formatResultMark({ durationMs: 90_000 }, 'minPerMile'), '1:30');
  assert.equal(formatResultMark({ durationMs: 0 }, 'minPerMile'), null);
});

test('captions leave the result out when the runner hides it', () => {
  const subject: ShareSubject = { kind: 'challenge', workout, workoutName: 'Tempo Mile', run };
  assert.match(defaultCaption(subject, all, 'minPerMile'), /32:00/);
  assert.doesNotMatch(defaultCaption(subject, none, 'minPerMile'), /32:00/);
});

test('reply caption says who won', () => {
  const faster: ShareSubject = {
    kind: 'challenge',
    workout,
    workoutName: 'Tempo Mile',
    run,
    replyTo: { senderName: 'Alex', result: { durationMs: 34 * 60_000, distanceMeters: 4 * MILE } },
  };
  assert.match(defaultCaption(faster, all, 'minPerMile'), /0:30\/mi faster than you/);

  const slower = { ...faster, replyTo: { result: { durationMs: 30 * 60_000, distanceMeters: 4 * MILE } } };
  assert.match(defaultCaption(slower, all, 'minPerMile'), /You win this round/);
});

test('compare falls back to total time without distance', () => {
  const c = compareResults({ durationMs: 600_000 }, { durationMs: 632_000 }, 'minPerMile');
  assert.deepEqual(c, { basis: 'time', deltaSeconds: 32, label: '0:32 faster' });
  assert.equal(compareResults({ durationMs: 600_000 }, { durationMs: 600_000 }, 'minPerMile')?.label, 'dead even');
});

test('pace comparison uses the runner unit', () => {
  const c = compareResults(
    { durationMs: 25 * 60_000, distanceMeters: 5000 },
    { durationMs: 30 * 60_000, distanceMeters: 5000 },
    'minPerKm',
  );
  assert.equal(c?.label, '1:00/km faster');
});

test('consistency challenges compare scores, not pace', () => {
  const mine = { durationMs: 30 * 60_000, distanceMeters: 4 * MILE, consistency: 92 };
  const theirs = { durationMs: 28 * 60_000, distanceMeters: 4 * MILE, consistency: 88 };
  assert.deepEqual(compareResults(mine, theirs, 'minPerMile', 'consistency'), {
    basis: 'consistency',
    deltaSeconds: 4,
    label: '4 points higher',
  });
  assert.equal(compareResults(mine, theirs, 'minPerMile', 'time')?.basis, 'pace');
  assert.equal(compareResults({ ...mine, consistency: 87 }, theirs, 'minPerMile', 'consistency')?.label, '1 point lower');
  assert.equal(compareResults({ ...mine, consistency: undefined }, theirs, 'minPerMile', 'consistency')?.basis, 'pace');
});

const steadyRun: CompletedWorkout = {
  ...run,
  splits: [0, 1, 2].map(() => ({ ...run.splits![0], segmentType: 'run' as const })),
};

test('consistency challenge captions use the score', () => {
  const subject: ShareSubject = {
    kind: 'challenge',
    workout,
    workoutName: 'Tempo Mile',
    run: steadyRun,
    challengeType: 'consistency',
  };
  assert.equal(
    defaultCaption(subject, all, 'minPerMile'),
    'I scored 100/100 for interval consistency on "Tempo Mile". Can you match my consistency?',
  );

  const reply: ShareSubject = {
    ...subject,
    challengeType: undefined,
    replyTo: { senderName: 'Alex', challengeType: 'consistency', result: { durationMs: 30 * 60_000, consistency: 90 } },
  };
  assert.match(defaultCaption(reply, all, 'minPerMile'), /100\/100 consistency, 10 points higher than you/);
});

test('achievement captions name the PR or milestone', () => {
  const base: ShareSubject = { kind: 'achievement', workout, workoutName: 'Tempo Mile', run };
  const pr = { id: 'fastest_5k', label: 'Fastest 5K', value: '21:48', kicker: 'New PR', message: '' };
  assert.equal(defaultCaption({ ...base, achievement: pr }, all, 'minPerMile'), 'New Fastest 5K PR: 21:48!');
  const milestone = { id: 'count_20', label: 'Workouts Completed', value: '20', kicker: 'Milestone', message: 'Keep showing up.' };
  assert.equal(defaultCaption({ ...base, achievement: milestone }, all, 'minPerMile'), 'Workouts Completed! Keep showing up.');
});

test('body lists the structure, and splits only when included', () => {
  const subject: ShareSubject = { kind: 'results', workout, workoutName: 'Tempo Mile', run };
  const withSplits = composeShareBody(subject, all, 'minPerMile');
  assert.match(withSplits, /3× \(1 mile Tempo|3× \(1\.00 mi Tempo/);
  assert.match(withSplits, /Splits:/);
  assert.doesNotMatch(composeShareBody(subject, { includeResult: true, includeSplits: false }, 'minPerMile'), /Splits:/);
  assert.doesNotMatch(composeShareBody(subject, none, 'minPerMile'), /Splits:/);
});
