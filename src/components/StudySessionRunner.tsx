import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  HelpCircle,
  RotateCw,
  Volume2,
  XCircle,
} from 'lucide-react';
import { KOBUN_WORDS, KOBUN_WORD_MAP } from '../data/kobunWords';
import { speakKobun } from '../lib/speech';
import { KobunWord, StudyMode, WordProgress } from '../types/study';

interface StudySessionRunnerProps {
  sessionId: string;
  title: string;
  mode: StudyMode;
  wordIds: string[];
  includeFlashcards: boolean;
  progressMap: Record<string, WordProgress>;
  onRecordAttempt: (word: KobunWord, isCorrect: boolean, confusedMeaning?: string) => Promise<void>;
  onTogglePin: (word: KobunWord) => Promise<void>;
  onCompleteSession: (params: {
    sessionId: string;
    sessionTitle: string;
    mode: StudyMode;
    totalQuestions: number;
    firstTryCorrect: number;
    requeuedCount: number;
    durationSeconds: number;
    mistakenWordIds: string[];
  }) => Promise<void>;
  onExit: () => void;
}

type Direction = 'k2m' | 'm2k';

interface QueueItem {
  uid: string;
  wordId: string;
  direction: Direction;
  isRequeued: boolean;
  streakNeeded: number; // 1 on initial pass, 2 after a mistake
}

interface ChoiceOption {
  label: string;
  subLabel?: string;
  isCorrect: boolean;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildOptions(word: KobunWord, direction: Direction): ChoiceOption[] {
  const distractors: KobunWord[] = [];
  const usedLabels = new Set<string>([
    direction === 'k2m' ? word.sheetMeaning : word.word,
  ]);

  // 1. Prefer confusable words first
  for (const cid of word.confusableIds) {
    if (distractors.length >= 3) break;
    const candidate = KOBUN_WORD_MAP[cid];
    if (!candidate) continue;
    const label = direction === 'k2m' ? candidate.sheetMeaning : candidate.word;
    if (!usedLabels.has(label) && candidate.sheetMeaning !== word.sheetMeaning) {
      usedLabels.add(label);
      distractors.push(candidate);
    }
  }

  // 2. Fill remaining slots from the full 40-word pool
  const pool = shuffleArray(KOBUN_WORDS);
  for (const candidate of pool) {
    if (distractors.length >= 3) break;
    if (candidate.id === word.id) continue;
    const label = direction === 'k2m' ? candidate.sheetMeaning : candidate.word;
    if (!usedLabels.has(label) && candidate.sheetMeaning !== word.sheetMeaning) {
      usedLabels.add(label);
      distractors.push(candidate);
    }
  }

  const options: ChoiceOption[] = [
    {
      label: direction === 'k2m' ? word.sheetMeaning : word.word,
      subLabel: direction === 'm2k' && word.word !== word.reading ? word.reading : undefined,
      isCorrect: true,
    },
    ...distractors.map((d) => ({
      label: direction === 'k2m' ? d.sheetMeaning : d.word,
      subLabel: direction === 'm2k' && d.word !== d.reading ? d.reading : undefined,
      isCorrect: false,
    })),
  ];

  return shuffleArray(options);
}

export const StudySessionRunner: React.FC<StudySessionRunnerProps> = ({
  sessionId,
  title,
  mode,
  wordIds,
  includeFlashcards,
  progressMap,
  onRecordAttempt,
  onTogglePin,
  onCompleteSession,
  onExit,
}) => {
  const sessionWords = useMemo(
    () => wordIds.map((id) => KOBUN_WORD_MAP[id]).filter(Boolean),
    [wordIds]
  );

  const [phase, setPhase] = useState<'flashcards' | 'quiz' | 'complete'>(
    includeFlashcards ? 'flashcards' : 'quiz'
  );
  const startTimeRef = useRef<number>(Date.now());

  // --- Phase 1: Flashcard state ---
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [uncertainIds, setUncertainIds] = useState<string[]>([]);

  // --- Phase 2: Quiz queue state ---
  const initialQueue = useMemo<QueueItem[]>(() => {
    const orderedWords =
      mode === 'exam' ? shuffleArray(sessionWords) : sessionWords;
    if (mode === 'exam') {
      return orderedWords.map((w, idx) => ({
        uid: `init_${w.id}_${idx}`,
        wordId: w.id,
        direction: idx % 3 === 2 ? 'm2k' : 'k2m',
        isRequeued: false,
        streakNeeded: 1,
      }));
    }
    const roundA: QueueItem[] = orderedWords.map((w, idx) => ({
      uid: `a_${w.id}_${idx}`,
      wordId: w.id,
      direction: 'k2m',
      isRequeued: false,
      streakNeeded: 1,
    }));
    const roundB: QueueItem[] = shuffleArray(orderedWords).map((w, idx) => ({
      uid: `b_${w.id}_${idx}`,
      wordId: w.id,
      direction: 'm2k',
      isRequeued: false,
      streakNeeded: 1,
    }));
    return [...roundA, ...roundB];
  }, [mode, sessionWords]);

  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
  const [totalInitialQuestions, setTotalInitialQuestions] = useState<number>(initialQueue.length);
  const [completedInitialCount, setCompletedInitialCount] = useState(0);
  const [firstTryMistakes, setFirstTryMistakes] = useState<Set<string>>(() => new Set());
  const [requeuedCompletedCount, setRequeuedCompletedCount] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [passedOut, setPassedOut] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const completionSavedRef = useRef(false);

  // Re-initialize quiz queue when transitioning from flashcards to quiz so uncertain words come first
  const startQuizFromFlashcards = useCallback(() => {
    const prioritized = [
      ...sessionWords.filter((w) => uncertainIds.includes(w.id)),
      ...sessionWords.filter((w) => !uncertainIds.includes(w.id)),
    ];
    const roundA: QueueItem[] = prioritized.map((w, idx) => ({
      uid: `a_${w.id}_${idx}`,
      wordId: w.id,
      direction: 'k2m',
      isRequeued: false,
      streakNeeded: uncertainIds.includes(w.id) ? 2 : 1,
    }));
    const roundB: QueueItem[] = shuffleArray(prioritized).map((w, idx) => ({
      uid: `b_${w.id}_${idx}`,
      wordId: w.id,
      direction: 'm2k',
      isRequeued: false,
      streakNeeded: 1,
    }));
    const full = [...roundA, ...roundB];
    setQueue(full);
    setTotalInitialQuestions(full.length);
    setPhase('quiz');
  }, [sessionWords, uncertainIds]);

  const currentItem = queue[0];
  const currentWord = currentItem ? KOBUN_WORD_MAP[currentItem.wordId] : undefined;

  const currentOptions = useMemo(() => {
    if (!currentWord || !currentItem) return [];
    return buildOptions(currentWord, currentItem.direction);
  }, [currentItem, currentWord]);

  const hasAnswered = selectedIdx !== null || passedOut;
  const isCurrentCorrect =
    selectedIdx !== null && currentOptions[selectedIdx]?.isCorrect === true;

  const handleSelectOption = useCallback(
    (idx: number) => {
      if (hasAnswered || !currentWord || !currentItem) return;
      setSelectedIdx(idx);
      const chosen = currentOptions[idx];
      const correct = chosen.isCorrect;
      void onRecordAttempt(
        currentWord,
        correct,
        correct ? '' : chosen.label
      );
      if (!correct && !currentItem.isRequeued) {
        setFirstTryMistakes((prev) => new Set(prev).add(currentWord.id));
      }
    },
    [currentItem, currentOptions, currentWord, hasAnswered, onRecordAttempt]
  );

  const handlePassDontKnow = useCallback(() => {
    if (hasAnswered || !currentWord || !currentItem) return;
    setPassedOut(true);
    void onRecordAttempt(currentWord, false, '（わからないを選択）');
    if (!currentItem.isRequeued) {
      setFirstTryMistakes((prev) => new Set(prev).add(currentWord.id));
    }
  }, [currentItem, currentWord, hasAnswered, onRecordAttempt]);

  const handleNextQuestion = useCallback(() => {
    if (!hasAnswered || !currentItem || !currentWord) return;

    const rest = queue.slice(1);
    let nextQueue = [...rest];

    if (!currentItem.isRequeued) {
      setCompletedInitialCount((c) => c + 1);
    }

    if (isCurrentCorrect) {
      if (currentItem.isRequeued) {
        setRequeuedCompletedCount((c) => c + 1);
      }
      // If word needed 2 consecutive correct answers, re-insert once more with streakNeeded: 1
      if (currentItem.streakNeeded > 1) {
        const insertPos = Math.min(nextQueue.length, 3);
        nextQueue.splice(insertPos, 0, {
          ...currentItem,
          uid: `req_${currentWord.id}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          isRequeued: true,
          streakNeeded: currentItem.streakNeeded - 1,
        });
      }
    } else {
      // Mistake: immediately re-queue with streakNeeded: 2 (must answer correctly twice in a row!)
      const insertPos = Math.min(nextQueue.length, 2);
      nextQueue.splice(insertPos, 0, {
        uid: `err_${currentWord.id}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        wordId: currentWord.id,
        direction: currentItem.direction,
        isRequeued: true,
        streakNeeded: 2,
      });
    }

    setSelectedIdx(null);
    setPassedOut(false);

    if (nextQueue.length === 0) {
      const sec = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
      setElapsedSec(sec);
      setPhase('complete');
      if (!completionSavedRef.current) {
        completionSavedRef.current = true;
        const mistakenList = Array.from(firstTryMistakes);
        const firstTryCorrectCount = Math.max(
          0,
          totalInitialQuestions - mistakenList.length
        );
        void onCompleteSession({
          sessionId,
          sessionTitle: title,
          mode,
          totalQuestions: totalInitialQuestions,
          firstTryCorrect: firstTryCorrectCount,
          requeuedCount: requeuedCompletedCount + (isCurrentCorrect && currentItem.isRequeued ? 1 : 0),
          durationSeconds: sec,
          mistakenWordIds: mistakenList,
        });
      }
    } else {
      setQueue(nextQueue);
    }
  }, [
    currentItem,
    currentWord,
    firstTryMistakes,
    hasAnswered,
    isCurrentCorrect,
    mode,
    onCompleteSession,
    queue,
    requeuedCompletedCount,
    sessionId,
    title,
    totalInitialQuestions,
  ]);

  // Keyboard shortcuts for fast drilling
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (phase === 'flashcards') {
        if (e.code === 'Space') {
          e.preventDefault();
          setIsFlipped((f) => !f);
        }
      } else if (phase === 'quiz') {
        if (!hasAnswered) {
          if (e.key === '1' && currentOptions[0]) handleSelectOption(0);
          else if (e.key === '2' && currentOptions[1]) handleSelectOption(1);
          else if (e.key === '3' && currentOptions[2]) handleSelectOption(2);
          else if (e.key === '4' && currentOptions[3]) handleSelectOption(3);
        } else if (e.key === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleNextQuestion();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    currentOptions,
    handleNextQuestion,
    handleSelectOption,
    hasAnswered,
    phase,
  ]);

  // --- Render Phase 1: Flashcards ---
  if (phase === 'flashcards') {
    const cardWord = sessionWords[cardIndex];
    if (!cardWord) return null;
    const isPinned = progressMap[cardWord.id]?.isPinned ?? false;

    const advanceFlashcard = (markUncertain: boolean) => {
      if (markUncertain && !uncertainIds.includes(cardWord.id)) {
        setUncertainIds((prev) => [...prev, cardWord.id]);
      }
      setIsFlipped(false);
      if (cardIndex + 1 < sessionWords.length) {
        setCardIndex((i) => i + 1);
      } else {
        startQuizFromFlashcards();
      }
    };

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>セッション一覧に戻る</span>
          </button>
          <div className="text-xs font-medium text-slate-500 font-mono-num">
            {title} · カード暗記 {cardIndex + 1} / {sessionWords.length}
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-700 transition-all duration-200"
            style={{ width: `${((cardIndex + 1) / sessionWords.length) * 100}%` }}
          />
        </div>

        {/* 3D Flip Card */}
        <div className="perspective-1000">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsFlipped((f) => !f)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setIsFlipped((f) => !f);
            }}
            className={`relative w-full min-h-[340px] sm:min-h-[370px] transition-transform duration-300 preserve-3d cursor-pointer ${
              isFlipped ? 'rotate-y-180' : ''
            }`}
          >
            {/* Front */}
            <div className="absolute inset-0 backface-hidden bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-2 font-mono-num">
                  <span className="font-semibold text-indigo-800">No. {cardWord.number}</span>
                  <span aria-hidden="true">·</span>
                  <span>{cardWord.partOfSpeech}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      speakKobun(cardWord.reading);
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:text-indigo-800 hover:bg-slate-100 transition-colors cursor-pointer"
                    aria-label="読みを音声再生"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onTogglePin(cardWord);
                    }}
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${
                      isPinned
                        ? 'text-rose-700 bg-rose-50'
                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                    }`}
                    aria-label="苦手ピン留め"
                  >
                    <Bookmark className="w-4 h-4" fill={isPinned ? 'currentColor' : 'none'} />
                  </button>
                </div>
              </div>

              <div className="text-center space-y-3 my-auto py-4">
                <div className="font-kobun text-4xl sm:text-5xl font-bold text-slate-900 tracking-wide">
                  {cardWord.word}
                </div>
                {cardWord.word !== cardWord.reading && (
                  <div className="text-base text-slate-500 font-medium">
                    （{cardWord.reading}）
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                <RotateCw className="w-3.5 h-3.5" />
                <span>カードをクリック（または Space）で意味と覚え方を表示</span>
              </div>
            </div>

            {/* Back */}
            <div className="absolute inset-0 backface-hidden rotate-y-180 bg-white border border-indigo-200 rounded-2xl p-6 sm:p-10 flex flex-col justify-between overflow-y-auto">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="font-mono-num font-semibold text-indigo-800">
                    No. {cardWord.number}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-kobun font-semibold text-slate-800 text-sm">
                    {cardWord.word}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    speakKobun(cardWord.reading);
                  }}
                  className="p-2 rounded-lg text-slate-500 hover:text-indigo-800 hover:bg-slate-100 cursor-pointer"
                  aria-label="読みを音声再生"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 my-auto py-3">
                <div>
                  <div className="text-xs font-semibold text-indigo-700 mb-1">
                    プリントの最重要訳
                  </div>
                  <div className="font-kobun text-2xl sm:text-3xl font-bold text-slate-900">
                    {cardWord.sheetMeaning}
                  </div>
                  {cardWord.extraMeanings.length > 0 && (
                    <div className="text-xs text-slate-500 mt-1.5">
                      その他の訳：{cardWord.extraMeanings.join(' ／ ')}
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">覚え方：</span>
                  {cardWord.memoryHook}
                </div>

                <div className="text-xs space-y-1 text-slate-600">
                  <div className="font-kobun text-sm text-slate-800">{cardWord.exampleClassical}</div>
                  <div>訳：{cardWord.exampleModern}</div>
                </div>
              </div>

              <div className="text-center text-xs text-slate-400">
                クリックで表面に戻す
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={startQuizFromFlashcards}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 underline underline-offset-4 cursor-pointer self-start sm:self-center"
          >
            カードをスキップしてすぐテストへ進む
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => advanceFlashcard(true)}
              className="flex-1 sm:flex-initial px-5 py-3 text-sm font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors cursor-pointer"
            >
              まだ曖昧（重点出題）
            </button>
            <button
              type="button"
              onClick={() => advanceFlashcard(false)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-indigo-800 rounded-xl hover:bg-indigo-900 transition-colors cursor-pointer"
            >
              <span>{cardIndex + 1 === sessionWords.length ? '定着テスト開始' : '覚えた・次へ'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Render Phase 3: Complete ---
  if (phase === 'complete') {
    const mistakenWords = Array.from(firstTryMistakes)
      .map((id) => KOBUN_WORD_MAP[id])
      .filter(Boolean);
    const firstTryCorrectCount = Math.max(0, totalInitialQuestions - mistakenWords.length);
    const firstTryRate =
      totalInitialQuestions > 0
        ? Math.round((firstTryCorrectCount / totalInitialQuestions) * 100)
        : 100;

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              <span>間違いゼロ再出題ループ完了</span>
            </div>
            <h2 className="font-kobun text-2xl sm:text-3xl font-bold text-slate-900">
              {title} を完全クリアしました
            </h2>
            <p className="text-sm text-slate-600">
              間違えた問題もすべて連続2回正解で克服済みです。結果はアカウントに記録されました。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-100">
            <div>
              <div className="text-xs text-slate-500">初回正答率</div>
              <div className="font-mono-num text-2xl font-bold text-slate-900 mt-1">
                {firstTryRate}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">再出題クリア数</div>
              <div className="font-mono-num text-2xl font-bold text-slate-900 mt-1">
                {requeuedCompletedCount}回
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">所要時間</div>
              <div className="font-mono-num text-2xl font-bold text-slate-900 mt-1">
                {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')}
              </div>
            </div>
          </div>

          {mistakenWords.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">
                このセッションで一度間違えた単語（復習済み・要チェック）
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {mistakenWords.map((w) => {
                  const pinned = progressMap[w.id]?.isPinned ?? false;
                  return (
                    <div
                      key={w.id}
                      className="p-3.5 bg-white flex items-center justify-between gap-4"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-num text-xs text-slate-400">
                            No.{w.number}
                          </span>
                          <span className="font-kobun font-bold text-slate-900">
                            {w.word}
                          </span>
                          <span className="text-xs text-slate-500">（{w.reading}）</span>
                        </div>
                        <div className="text-xs text-slate-700">{w.sheetMeaning}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onTogglePin(w)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                          pinned
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Bookmark className="w-3.5 h-3.5" fill={pinned ? 'currentColor' : 'none'} />
                        <span>{pinned ? 'ピン中' : 'ピン留め'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onExit}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-800 rounded-lg hover:bg-indigo-900 transition-colors cursor-pointer"
            >
              セッション一覧に戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Render Phase 2: Active Zero-Mistake Quiz ---
  if (!currentItem || !currentWord) return null;

  const progressPct = Math.min(
    100,
    Math.round((completedInitialCount / Math.max(1, totalInitialQuestions)) * 100)
  );
  const requeuePendingCount = queue.filter((q) => q.isRequeued).length;
  const isPinned = progressMap[currentWord.id]?.isPinned ?? false;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header & Queue Counter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>中断して戻る</span>
        </button>

        <div className="flex items-center gap-3 text-xs font-mono-num text-slate-600">
          <span>{title}</span>
          <span aria-hidden="true">·</span>
          <span>残り {queue.length}問</span>
          {requeuePendingCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-rose-700 font-semibold">
                再出題待ち {requeuePendingCount}問
              </span>
            </>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-700 transition-all duration-200"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Prompt Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-mono-num font-semibold text-indigo-800">
              No. {currentWord.number}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {currentItem.direction === 'k2m' ? '古語 → 現代語訳' : '現代語訳 → 古語'}
            </span>
            {currentItem.isRequeued && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-rose-700 font-semibold">
                  間違いゼロ再出題（クリアまであと{currentItem.streakNeeded}回連続正解）
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {currentItem.direction === 'k2m' && (
              <button
                type="button"
                onClick={() => speakKobun(currentWord.reading)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-800 hover:bg-slate-100 cursor-pointer"
                aria-label="発音を聞く"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => void onTogglePin(currentWord)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isPinned
                  ? 'text-rose-700 bg-rose-50'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
              }`}
              aria-label="苦手ピン"
            >
              <Bookmark className="w-4 h-4" fill={isPinned ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>

        {/* Question Display */}
        <div className="py-3 text-center space-y-2">
          {currentItem.direction === 'k2m' ? (
            <>
              <div className="font-kobun text-3xl sm:text-4xl font-bold text-slate-900">
                {currentWord.word}
              </div>
              <div className="text-xs text-slate-500">
                {currentWord.word !== currentWord.reading ? `（${currentWord.reading}） · ` : ''}
                {currentWord.partOfSpeech}
              </div>
            </>
          ) : (
            <>
              <div className="font-kobun text-2xl sm:text-3xl font-bold text-slate-900 [text-wrap:balance]">
                「{currentWord.sheetMeaning}」
              </div>
              <div className="text-xs text-slate-500">
                {currentWord.partOfSpeech}
                {currentWord.reverseHint ? ` · ヒント：${currentWord.reverseHint}` : ''}
              </div>
            </>
          )}
        </div>

        {/* 4 Choices */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {currentOptions.map((opt, idx) => {
            const isSelected = selectedIdx === idx;
            let btnClass =
              'bg-white border-slate-200 hover:border-indigo-400 hover:bg-slate-50 text-slate-900';

            if (hasAnswered) {
              if (opt.isCorrect) {
                btnClass = 'bg-emerald-50 border-emerald-500 text-emerald-950 font-semibold';
              } else if (isSelected && !opt.isCorrect) {
                btnClass = 'bg-rose-50 border-rose-500 text-rose-950';
              } else {
                btnClass = 'bg-slate-50 border-slate-200 text-slate-400';
              }
            }

            return (
              <button
                key={idx}
                type="button"
                disabled={hasAnswered}
                onClick={() => handleSelectOption(idx)}
                className={`w-full text-left p-4 rounded-xl border transition-colors flex items-center justify-between gap-3 cursor-pointer disabled:cursor-default ${btnClass}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono-num text-xs font-semibold text-slate-400 shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div
                      className={`text-base truncate ${
                        currentItem.direction === 'm2k' ? 'font-kobun font-bold' : 'font-medium'
                      }`}
                    >
                      {opt.label}
                    </div>
                    {opt.subLabel && (
                      <div className="text-xs text-slate-500">（{opt.subLabel}）</div>
                    )}
                  </div>
                </div>

                {hasAnswered && opt.isCorrect && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                )}
                {hasAnswered && isSelected && !opt.isCorrect && (
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Footer before answer: "わからない" pass button */}
        {!hasAnswered && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-400 hidden sm:inline">
              キーボード 1〜4 で即答できます
            </span>
            <button
              type="button"
              onClick={handlePassDontKnow}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-rose-700 cursor-pointer ml-auto"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>わからない（復習に回す）</span>
            </button>
          </div>
        )}

        {/* Immediate Feedback & Memory Hook */}
        {hasAnswered && (
          <div
            className={`rounded-xl border p-4 sm:p-5 space-y-3 ${
              isCurrentCorrect
                ? 'bg-emerald-50/60 border-emerald-200'
                : 'bg-rose-50/70 border-rose-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                {isCurrentCorrect ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span className="text-emerald-900">
                      正解！
                      {currentItem.streakNeeded > 1
                        ? '（あと1回連続正解で完全クリア）'
                        : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-rose-700" />
                    <span className="text-rose-900">
                      不正解 — 再出題ループに追加（連続2回正解までクリア不可）
                    </span>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => speakKobun(currentWord.reading)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-indigo-800 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>発音</span>
              </button>
            </div>

            <div className="text-sm text-slate-800 space-y-1">
              <div>
                <span className="font-kobun font-bold">{currentWord.word}</span>
                <span className="text-slate-500">（{currentWord.reading}）</span>
                <span className="mx-2 text-slate-400">＝</span>
                <span className="font-semibold text-slate-900">{currentWord.sheetMeaning}</span>
              </div>
              <div className="text-xs text-slate-700">
                <span className="font-semibold">覚え方：</span>
                {currentWord.memoryHook}
              </div>
              <div className="text-xs text-slate-600">
                例文：{currentWord.exampleClassical}（{currentWord.exampleModern}）
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleNextQuestion}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-800 rounded-lg hover:bg-indigo-900 transition-colors cursor-pointer"
              >
                <span>{queue.length === 1 && isCurrentCorrect && currentItem.streakNeeded <= 1 ? '完了レポートを見る' : '次の問題へ (Enter)'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
