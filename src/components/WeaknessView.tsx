import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Volume2,
} from 'lucide-react';
import { KOBUN_WORDS } from '../data/kobunWords';
import { speakKobun } from '../lib/speech';
import { KobunWord, StudyMode, WordProgress } from '../types/study';

interface WeaknessViewProps {
  progressMap: Record<string, WordProgress>;
  onTogglePin: (word: KobunWord) => Promise<void>;
  onStartWeaknessDrill: (params: {
    sessionId: string;
    title: string;
    mode: StudyMode;
    wordIds: string[];
    includeFlashcards: boolean;
  }) => void;
}

export const WeaknessView: React.FC<WeaknessViewProps> = ({
  progressMap,
  onTogglePin,
  onStartWeaknessDrill,
}) => {
  const weakOrMistaken = KOBUN_WORDS.filter((w) => {
    const p = progressMap[w.id];
    return p && (p.isWeak || p.isPinned || p.wrongCount > 0);
  }).sort((a, b) => {
    const pa = progressMap[a.id];
    const pb = progressMap[b.id];
    const scoreA = (pa?.isWeak ? 10 : 0) + (pa?.wrongCount ?? 0) * 3 + (pa?.isPinned ? 2 : 0);
    const scoreB = (pb?.isWeak ? 10 : 0) + (pb?.wrongCount ?? 0) * 3 + (pb?.isPinned ? 2 : 0);
    return scoreB - scoreA;
  });

  const activeWeakIds = weakOrMistaken
    .filter((w) => {
      const p = progressMap[w.id];
      return p?.isWeak || p?.isPinned || (p && p.masteryLevel < 4);
    })
    .map((w) => w.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="font-kobun text-2xl font-bold text-slate-900">
            苦手・間違い記録ノート
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            過去に間違えた単語やピン留めした単語と、「何と取り違えたか（誤答メモ）」を一覧で確認できます。
          </p>
        </div>

        <button
          type="button"
          disabled={activeWeakIds.length === 0}
          onClick={() =>
            onStartWeaknessDrill({
              sessionId: 'weakness-drill',
              title: `苦手集中特訓（${activeWeakIds.length}語）`,
              mode: 'weakness',
              wordIds: activeWeakIds,
              includeFlashcards: true,
            })
          }
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-rose-700 rounded-lg hover:bg-rose-800 disabled:bg-slate-200 disabled:text-slate-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
        >
          <span>要復習 {activeWeakIds.length}語を特訓する</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {weakOrMistaken.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <div className="font-kobun text-lg font-bold text-slate-900">
            まだ間違い・苦手記録はありません
          </div>
          <p className="text-sm text-slate-600">
            セッションテストで間違えた単語や、単語帳でピン留めした単語がここに自動で蓄積されます。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {weakOrMistaken.map((w) => {
            const p = progressMap[w.id];
            const total = (p?.correctCount ?? 0) + (p?.wrongCount ?? 0);
            const acc = total > 0 ? Math.round(((p?.correctCount ?? 0) / total) * 100) : 0;

            return (
              <div
                key={w.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 font-mono-num text-slate-500">
                      <span className="font-semibold text-slate-700">No. {w.number}</span>
                      <span aria-hidden="true">·</span>
                      <span>誤答 {p?.wrongCount ?? 0}回</span>
                      <span aria-hidden="true">·</span>
                      <span>正答率 {acc}%</span>
                    </div>

                    {p?.isWeak ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>要復習</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>克服済</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <span className="font-kobun text-2xl font-bold text-slate-900">
                        {w.word}
                      </span>
                      {w.word !== w.reading && (
                        <span className="ml-2 text-xs text-slate-500">（{w.reading}）</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => speakKobun(w.reading)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-800 hover:bg-slate-100 cursor-pointer"
                        aria-label="音声再生"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onTogglePin(w)}
                        className={`p-1.5 rounded-lg cursor-pointer ${
                          p?.isPinned
                            ? 'text-rose-700 bg-rose-50'
                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                        aria-label="ピン切り替え"
                      >
                        <Bookmark className="w-4 h-4" fill={p?.isPinned ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>

                  <div className="text-base font-semibold text-slate-900">
                    正解：{w.sheetMeaning}
                  </div>

                  {p?.lastConfusedMeaning && (
                    <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      前回の誤答：
                      <span className="font-semibold">「{p.lastConfusedMeaning}」</span>
                      と混同
                    </div>
                  )}

                  <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="font-semibold text-slate-800">覚え方：</span>
                    {w.memoryHook}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
