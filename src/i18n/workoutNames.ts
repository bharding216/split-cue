/**
 * Locale-aware generated workout names.
 *
 * This is a minimal localization layer for names the app generates (next-run
 * suggestions, plan fallbacks). Saved workouts keep whatever name the user
 * gave them. Start with the languages where SplitCue has active users;
 * everything else falls back to English.
 */

import { getLocales } from 'expo-localization';

type WorkoutNameKey =
  | 'easyRun'
  | 'training';

interface Translations {
  /** "Easy {N}-Minute Run" — {N} is replaced at call time. */
  easyRun: string;
  /** Default name for a plan workout with no label. */
  training: string;
}

const TRANSLATIONS: Record<string, Translations> = {
  en: {
    easyRun: 'Easy {N}-Minute Run',
    training: 'Training',
  },
  pt: {
    easyRun: 'Corrida Leve de {N} Minutos',
    training: 'Treino',
  },
  es: {
    easyRun: 'Carrera Suave de {N} Minutos',
    training: 'Entrenamiento',
  },
  fr: {
    easyRun: 'Footing de {N} Minutes',
    training: 'Entraînement',
  },
  de: {
    easyRun: 'Lockerer {N}-Minuten-Lauf',
    training: 'Training',
  },
  ja: {
    easyRun: 'イージーラン {N}分',
    training: 'トレーニング',
  },
};

function getLanguageCode(): string {
  try {
    const locales = getLocales();
    return locales[0]?.languageCode ?? 'en';
  } catch {
    return 'en';
  }
}

function getTranslations(): Translations {
  const lang = getLanguageCode();
  return TRANSLATIONS[lang] ?? TRANSLATIONS.en;
}

/** Localized name for a generated easy run suggestion. */
export function easyRunName(minutes: number): string {
  return getTranslations().easyRun.replace('{N}', String(minutes));
}

/** Localized fallback name for a plan workout with no label. */
export function trainingName(): string {
  return getTranslations().training;
}
