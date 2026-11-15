export type SessionId = 'session-1' | 'session-2' | 'session-3' | 'session-4';

export type StudyMode = 'standard' | 'weakness' | 'exam';

export type NavTab = 'sessions' | 'wordbook' | 'weakness' | 'exam';

export interface KobunWord {
  id: string; // e.g., 'w41'
  number: number; // 41..80
  sessionId: SessionId;
  word: string;
  reading: string;
  partOfSpeech: string;
  sheetMeaning: string; // Exact handwritten meaning from the print
  extraMeanings: string[]; // Additional textbook meanings
  reverseHint?: string; // Disambiguating hint when sheetMeaning matches another word
  memoryHook: string; // Etymology / mnemonic anchor
  exampleClassical: string;
  exampleModern: string;
  confusableIds: string[]; // Similar/opposite word IDs for smart distractors
}

export interface SessionDefinition {
  id: SessionId;
  title: string;
  subtitle: string;
  rangeLabel: string;
  focusTheme: string;
}

export interface WordProgress {
  userId: string;
  wordId: string;
  wordNumber: number;
  masteryLevel: number; // 0..5
  correctCount: number;
  wrongCount: number;
  consecutiveCorrect: number;
  isWeak: boolean;
  isPinned: boolean;
  lastConfusedMeaning: string;
  lastResult: 'correct' | 'wrong' | 'unseen';
  lastStudiedAt: unknown;
  updatedAt: unknown;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  totalAnswered: number;
  totalCorrect: number;
  currentStreak: number;
  bestStreak: number;
  completedSessions: string[];
  createdAt: unknown;
  updatedAt: unknown;
}

export interface StudySessionLog {
  id?: string;
  userId: string;
  sessionId: string;
  sessionTitle: string;
  mode: StudyMode;
  totalQuestions: number;
  firstTryCorrect: number;
  requeuedCount: number;
  durationSeconds: number;
  mistakenWordIds: string[];
  completedAt: unknown;
}
