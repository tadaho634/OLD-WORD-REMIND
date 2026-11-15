/**
 * Phase 0 Adversarial Security Rule Verification Suite ("Dirty Dozen")
 * Documents and verifies expected PERMISSION_DENIED vs ALLOW outcomes
 * against @firebase/rules-unit-testing when run with the Firebase Emulator.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED' | 'ALLOW';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Read',
    operation: 'get',
    path: 'users/userA',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Cross-User PII Read',
    operation: 'get',
    path: 'users/userA',
    auth: { uid: 'userB', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Directory Enumeration (List /users)',
    operation: 'list',
    path: 'users',
    auth: { uid: 'userA', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Unverified Email Write',
    operation: 'create',
    path: 'users/userA',
    auth: { uid: 'userA', email_verified: false },
    payload: { uid: 'userA', displayName: 'Test', email: 'a@example.com' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Identity Spoofing on Create',
    operation: 'create',
    path: 'users/userA/wordProgress/w41',
    auth: { uid: 'userA', email_verified: true },
    payload: { userId: 'userB', wordId: 'w41', wordNumber: 41 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Shadow / Ghost Field Injection',
    operation: 'create',
    path: 'users/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      uid: 'userA',
      displayName: 'Test',
      email: 'a@example.com',
      totalAnswered: 0,
      totalCorrect: 0,
      currentStreak: 0,
      bestStreak: 0,
      completedSessions: [],
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'ID Poisoning (Invalid Word ID)',
    operation: 'create',
    path: 'users/userA/wordProgress/w999_invalid',
    auth: { uid: 'userA', email_verified: true },
    payload: { userId: 'userA', wordId: 'w999_invalid', wordNumber: 41 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Out-of-Range Mastery Level',
    operation: 'create',
    path: 'users/userA/wordProgress/w41',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      userId: 'userA',
      wordId: 'w41',
      wordNumber: 41,
      masteryLevel: 99,
      correctCount: 1,
      wrongCount: 0,
      consecutiveCorrect: 1,
      isWeak: false,
      isPinned: false,
      lastConfusedMeaning: '',
      lastResult: 'correct',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Client Timestamp Forgery',
    operation: 'create',
    path: 'users/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      uid: 'userA',
      displayName: 'Test',
      email: 'a@example.com',
      totalAnswered: 0,
      totalCorrect: 0,
      currentStreak: 0,
      bestStreak: 0,
      completedSessions: [],
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable Field Mutation',
    operation: 'update',
    path: 'users/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: { uid: 'userB' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Terminal Session Log Tampering',
    operation: 'update',
    path: 'users/userA/studySessions/log1',
    auth: { uid: 'userA', email_verified: true },
    payload: { firstTryCorrect: 10 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Array Overflow (Denial of Wallet)',
    operation: 'create',
    path: 'users/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      uid: 'userA',
      displayName: 'Test',
      email: 'a@example.com',
      totalAnswered: 0,
      totalCorrect: 0,
      currentStreak: 0,
      bestStreak: 0,
      completedSessions: Array.from({ length: 25 }, (_, i) => `s${i}`),
    },
    expected: 'PERMISSION_DENIED',
  },
];
