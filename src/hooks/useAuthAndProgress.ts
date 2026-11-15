import { useCallback, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  testFirestoreConnection,
} from '../lib/firebase';
import { KobunWord, StudyMode, StudySessionLog, UserProfile, WordProgress } from '../types/study';

const GUEST_STORAGE_KEY = 'kobun_40_guest_state_v1';

interface GuestState {
  profile: UserProfile;
  progressMap: Record<string, WordProgress>;
  sessionLogs: StudySessionLog[];
}

function createEmptyProfile(uid = 'guest', displayName = 'ゲスト', email = 'guest@local'): UserProfile {
  return {
    uid,
    displayName,
    email,
    totalAnswered: 0,
    totalCorrect: 0,
    currentStreak: 0,
    bestStreak: 0,
    completedSessions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function loadGuestState(): GuestState {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GuestState;
      if (parsed && parsed.profile && parsed.progressMap) {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return {
    profile: createEmptyProfile(),
    progressMap: {},
    sessionLogs: [],
  };
}

function saveGuestState(state: GuestState): void {
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function useAuthAndProgress() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [guestState, setGuestState] = useState<GuestState>(() => loadGuestState());
  const [cloudProfile, setCloudProfile] = useState<UserProfile | null>(null);
  const [cloudProgressMap, setCloudProgressMap] = useState<Record<string, WordProgress>>({});
  const [cloudSessionLogs, setCloudSessionLogs] = useState<StudySessionLog[]>([]);
  const [cloudSyncing, setCloudSyncing] = useState(false);

  useEffect(() => {
    void testFirestoreConnection();
  }, []);

  // Auth listener + ensure user profile document exists
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let unsubProgress: (() => void) | null = null;
    let unsubLogs: (() => void) | null = null;

    const cleanupListeners = () => {
      if (unsubProfile) unsubProfile();
      if (unsubProgress) unsubProgress();
      if (unsubLogs) unsubLogs();
      unsubProfile = null;
      unsubProgress = null;
      unsubLogs = null;
    };

    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      cleanupListeners();
      setUser(nextUser);

      if (!nextUser) {
        setCloudProfile(null);
        setCloudProgressMap({});
        setCloudSessionLogs([]);
        setCloudSyncing(false);
        setAuthReady(true);
        return;
      }

      setCloudSyncing(true);
      const userPath = `users/${nextUser.uid}`;
      const userRef = doc(db, 'users', nextUser.uid);

      try {
        const existingSnap = await getDoc(userRef);
        if (!existingSnap.exists()) {
          const initialProfile = {
            uid: nextUser.uid,
            displayName: (nextUser.displayName || '学習者').slice(0, 100),
            email: (nextUser.email || 'user@example.com').slice(0, 200),
            totalAnswered: 0,
            totalCorrect: 0,
            currentStreak: 0,
            bestStreak: 0,
            completedSessions: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(userRef, initialProfile);
        }
      } catch (error) {
        setCloudSyncing(false);
        setAuthReady(true);
        handleFirestoreError(error, OperationType.WRITE, userPath);
        return;
      }

      // Subscribe to user profile
      unsubProfile = onSnapshot(
        userRef,
        (snap) => {
          if (snap.exists()) {
            setCloudProfile(snap.data() as UserProfile);
          }
          setCloudSyncing(false);
        },
        (error) => {
          setCloudSyncing(false);
          handleFirestoreError(error, OperationType.GET, userPath);
        }
      );

      // Subscribe to per-word progress (query filters by userId to match security rule)
      const progressPath = `users/${nextUser.uid}/wordProgress`;
      const progressQuery = query(
        collection(db, 'users', nextUser.uid, 'wordProgress'),
        where('userId', '==', nextUser.uid)
      );
      unsubProgress = onSnapshot(
        progressQuery,
        (snapshot) => {
          const nextMap: Record<string, WordProgress> = {};
          snapshot.forEach((docSnap) => {
            nextMap[docSnap.id] = docSnap.data() as WordProgress;
          });
          setCloudProgressMap(nextMap);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, progressPath);
        }
      );

      // Subscribe to study session logs
      const logsPath = `users/${nextUser.uid}/studySessions`;
      const logsQuery = query(
        collection(db, 'users', nextUser.uid, 'studySessions'),
        where('userId', '==', nextUser.uid)
      );
      unsubLogs = onSnapshot(
        logsQuery,
        (snapshot) => {
          const logs: StudySessionLog[] = [];
          snapshot.forEach((docSnap) => {
            logs.push({ id: docSnap.id, ...(docSnap.data() as StudySessionLog) });
          });
          logs.sort((a, b) => {
            const getMs = (ts: unknown) => {
              if (!ts) return 0;
              if (typeof ts === 'number') return ts;
              if (typeof ts === 'object' && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
                return (ts as { toMillis: () => number }).toMillis();
              }
              return 0;
            };
            return getMs(b.completedAt) - getMs(a.completedAt);
          });
          setCloudSessionLogs(logs);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, logsPath);
        }
      );

      setAuthReady(true);
    });

    return () => {
      cleanupListeners();
      unsubAuth();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'ログインに失敗しました';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError('Googleログインを完了できませんでした。ポップアップを許可して再度お試しください。');
      }
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    await firebaseSignOut(auth);
  }, []);

  const activeProfile = user ? cloudProfile : guestState.profile;
  const activeProgressMap = user ? cloudProgressMap : guestState.progressMap;
  const activeSessionLogs = user ? cloudSessionLogs : guestState.sessionLogs;

  const recordWordAttempt = useCallback(
    async (word: KobunWord, isCorrect: boolean, confusedMeaning = '') => {
      const prev = activeProgressMap[word.id];
      const nextConsecutive = isCorrect ? (prev?.consecutiveCorrect ?? 0) + 1 : 0;
      const nextCorrect = (prev?.correctCount ?? 0) + (isCorrect ? 1 : 0);
      const nextWrong = (prev?.wrongCount ?? 0) + (isCorrect ? 0 : 1);

      let nextMastery = 1;
      if (isCorrect) {
        if (nextConsecutive >= 5) nextMastery = 5;
        else if (nextConsecutive >= 3) nextMastery = 4;
        else if (nextConsecutive >= 2) nextMastery = 3;
        else nextMastery = Math.max(2, prev?.masteryLevel ?? 0);
      } else {
        nextMastery = 1;
      }

      const nextIsWeak = isCorrect ? (prev?.isWeak ? nextConsecutive < 2 : false) : true;
      const sanitizedConfused = isCorrect
        ? nextIsWeak
          ? (prev?.lastConfusedMeaning ?? '').slice(0, 100)
          : ''
        : confusedMeaning.slice(0, 100);

      // Update cumulative user stats
      const curProfile = activeProfile || createEmptyProfile(user?.uid || 'guest');
      const nextTotalAnswered = curProfile.totalAnswered + 1;
      const nextTotalCorrect = curProfile.totalCorrect + (isCorrect ? 1 : 0);
      const nextCurrentStreak = isCorrect ? curProfile.currentStreak + 1 : 0;
      const nextBestStreak = Math.max(curProfile.bestStreak, nextCurrentStreak);

      if (!user) {
        setGuestState((curr) => {
          const updated: GuestState = {
            ...curr,
            profile: {
              ...curr.profile,
              totalAnswered: nextTotalAnswered,
              totalCorrect: nextTotalCorrect,
              currentStreak: nextCurrentStreak,
              bestStreak: nextBestStreak,
              updatedAt: Date.now(),
            },
            progressMap: {
              ...curr.progressMap,
              [word.id]: {
                userId: 'guest',
                wordId: word.id,
                wordNumber: word.number,
                masteryLevel: nextMastery,
                correctCount: nextCorrect,
                wrongCount: nextWrong,
                consecutiveCorrect: nextConsecutive,
                isWeak: nextIsWeak,
                isPinned: prev?.isPinned ?? false,
                lastConfusedMeaning: sanitizedConfused,
                lastResult: isCorrect ? 'correct' : 'wrong',
                lastStudiedAt: Date.now(),
                updatedAt: Date.now(),
              },
            },
          };
          saveGuestState(updated);
          return updated;
        });
        return;
      }

      const wordPath = `users/${user.uid}/wordProgress/${word.id}`;
      const wordRef = doc(db, 'users', user.uid, 'wordProgress', word.id);
      try {
        if (!prev) {
          await setDoc(wordRef, {
            userId: user.uid,
            wordId: word.id,
            wordNumber: word.number,
            masteryLevel: nextMastery,
            correctCount: nextCorrect,
            wrongCount: nextWrong,
            consecutiveCorrect: nextConsecutive,
            isWeak: nextIsWeak,
            isPinned: false,
            lastConfusedMeaning: sanitizedConfused,
            lastResult: isCorrect ? 'correct' : 'wrong',
            lastStudiedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(wordRef, {
            masteryLevel: nextMastery,
            correctCount: nextCorrect,
            wrongCount: nextWrong,
            consecutiveCorrect: nextConsecutive,
            isWeak: nextIsWeak,
            isPinned: prev.isPinned,
            lastConfusedMeaning: sanitizedConfused,
            lastResult: isCorrect ? 'correct' : 'wrong',
            lastStudiedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, prev ? OperationType.UPDATE : OperationType.CREATE, wordPath);
      }

      const userPath = `users/${user.uid}`;
      const userRef = doc(db, 'users', user.uid);
      try {
        await updateDoc(userRef, {
          totalAnswered: nextTotalAnswered,
          totalCorrect: nextTotalCorrect,
          currentStreak: nextCurrentStreak,
          bestStreak: nextBestStreak,
          completedSessions: (curProfile.completedSessions || []).slice(0, 10),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, userPath);
      }
    },
    [activeProfile, activeProgressMap, user]
  );

  const toggleWordPin = useCallback(
    async (word: KobunWord) => {
      const prev = activeProgressMap[word.id];
      const nextPinned = !(prev?.isPinned ?? false);

      if (!user) {
        setGuestState((curr) => {
          const existing = curr.progressMap[word.id];
          const updated: GuestState = {
            ...curr,
            progressMap: {
              ...curr.progressMap,
              [word.id]: existing
                ? { ...existing, isPinned: nextPinned, updatedAt: Date.now() }
                : {
                    userId: 'guest',
                    wordId: word.id,
                    wordNumber: word.number,
                    masteryLevel: 0,
                    correctCount: 0,
                    wrongCount: 0,
                    consecutiveCorrect: 0,
                    isWeak: false,
                    isPinned: nextPinned,
                    lastConfusedMeaning: '',
                    lastResult: 'unseen',
                    lastStudiedAt: Date.now(),
                    updatedAt: Date.now(),
                  },
            },
          };
          saveGuestState(updated);
          return updated;
        });
        return;
      }

      const wordPath = `users/${user.uid}/wordProgress/${word.id}`;
      const wordRef = doc(db, 'users', user.uid, 'wordProgress', word.id);
      try {
        if (!prev) {
          await setDoc(wordRef, {
            userId: user.uid,
            wordId: word.id,
            wordNumber: word.number,
            masteryLevel: 0,
            correctCount: 0,
            wrongCount: 0,
            consecutiveCorrect: 0,
            isWeak: false,
            isPinned: nextPinned,
            lastConfusedMeaning: '',
            lastResult: 'unseen',
            lastStudiedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(wordRef, {
            isPinned: nextPinned,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, prev ? OperationType.UPDATE : OperationType.CREATE, wordPath);
      }
    },
    [activeProgressMap, user]
  );

  const recordSessionCompletion = useCallback(
    async (params: {
      sessionId: string;
      sessionTitle: string;
      mode: StudyMode;
      totalQuestions: number;
      firstTryCorrect: number;
      requeuedCount: number;
      durationSeconds: number;
      mistakenWordIds: string[];
    }) => {
      const safeTotal = Math.max(1, Math.min(100, Math.round(params.totalQuestions)));
      const safeFirstTry = Math.max(0, Math.min(safeTotal, Math.round(params.firstTryCorrect)));
      const safeRequeued = Math.max(0, Math.min(1000, Math.round(params.requeuedCount)));
      const safeDuration = Math.max(0, Math.min(86400, Math.round(params.durationSeconds)));
      const safeMistaken = Array.from(new Set(params.mistakenWordIds)).slice(0, 40);
      const safeSessionId = params.sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'session';
      const safeTitle = params.sessionTitle.slice(0, 100);

      const curProfile = activeProfile || createEmptyProfile(user?.uid || 'guest');
      const nextCompleted = Array.from(
        new Set([...(curProfile.completedSessions || []), safeSessionId])
      ).slice(0, 10);

      if (!user) {
        const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        setGuestState((curr) => {
          const nextLog: StudySessionLog = {
            id: logId,
            userId: 'guest',
            sessionId: safeSessionId,
            sessionTitle: safeTitle,
            mode: params.mode,
            totalQuestions: safeTotal,
            firstTryCorrect: safeFirstTry,
            requeuedCount: safeRequeued,
            durationSeconds: safeDuration,
            mistakenWordIds: safeMistaken,
            completedAt: Date.now(),
          };
          const updated: GuestState = {
            ...curr,
            profile: {
              ...curr.profile,
              completedSessions: nextCompleted,
              updatedAt: Date.now(),
            },
            sessionLogs: [nextLog, ...curr.sessionLogs].slice(0, 30),
          };
          saveGuestState(updated);
          return updated;
        });
        return;
      }

      const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const logPath = `users/${user.uid}/studySessions/${logId}`;
      const logRef = doc(db, 'users', user.uid, 'studySessions', logId);
      try {
        await setDoc(logRef, {
          userId: user.uid,
          sessionId: safeSessionId,
          sessionTitle: safeTitle,
          mode: params.mode,
          totalQuestions: safeTotal,
          firstTryCorrect: safeFirstTry,
          requeuedCount: safeRequeued,
          durationSeconds: safeDuration,
          mistakenWordIds: safeMistaken,
          completedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, logPath);
      }

      const userPath = `users/${user.uid}`;
      const userRef = doc(db, 'users', user.uid);
      try {
        await updateDoc(userRef, {
          completedSessions: nextCompleted,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, userPath);
      }
    },
    [activeProfile, user]
  );

  return {
    user,
    authReady,
    authError,
    signingIn,
    cloudSyncing,
    profile: activeProfile,
    progressMap: activeProgressMap,
    sessionLogs: activeSessionLogs,
    signInWithGoogle,
    signOut,
    recordWordAttempt,
    toggleWordPin,
    recordSessionCompletion,
  };
}
