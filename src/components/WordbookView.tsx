import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  Eye,
  EyeOff,
  Search,
  Volume2,
} from 'lucide-react';
import { KOBUN_WORDS, SESSIONS } from '../data/kobunWords';
import { speakKobun } from '../lib/speech';
import { KobunWord, WordProgress } from '../types/study';

interface WordbookViewProps {
  progressMap: Record<string, WordProgress>;
  onTogglePin: (word: KobunWord) => Promise<void>;
}

type RedSheetMode = 'none' | 'hide-meaning' | 'hide-word';

export const WordbookView: React.FC<WordbookViewProps> = ({
  progressMap,
  onTogglePin,
}) => {
  const [filterTab, setFilterTab] = useState<string>('all');
  const [redSheet, setRedSheet] = useState<RedSheetMode>('none');
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const filteredWords = useMemo(() => {
    return KOBUN_WORDS.filter((w) => {
      if (filterTab === 'weak') {
        const p = progressMap[w.id];
        if (!p || (!p.isWeak && !p.isPinned && p.wrongCount === 0)) return false;
      } else if (filterTab !== 'all') {
        if (w.sessionId !== filterTab) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return (
          w.word.toLowerCase().includes(q) ||
          w.reading.toLowerCase().includes(q) ||
          w.sheetMeaning.toLowerCase().includes(q) ||
          String(w.number).includes(q)
        );
      }
      return true;
    });
  }, [filterTab, progressMap, searchQuery]);

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSetRedSheet = (mode: RedSheetMode) => {
    setRedSheet(mode);
    setRevealedIds({});
  };

  const renderMasteryText = (p?: WordProgress) => {
    if (!p || p.lastResult === 'unseen' && p.correctCount === 0 && p.wrongCount === 0) {
      return <span className="text-xs text-slate-400">未学習</span>;
    }
    if (p.isWeak || p.masteryLevel <= 1) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>要復習</span>
        </span>
      );
    }
    if (p.masteryLevel >= 4) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>完全定着</span>
        </span>
      );
    }
    return (
      <span className="text-xs font-medium text-indigo-700">
        定着中 (Lv.{p.masteryLevel})
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="font-kobun text-2xl font-bold text-slate-900">
            単語帳・赤シート暗記（No.41–80）
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            テスト直前の高速チェック用。隠した箇所をタップすると答えが表示されます。
          </p>
        </div>

        {/* Red-Sheet Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start lg:self-auto">
          <button
            type="button"
            onClick={() => handleSetRedSheet('none')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              redSheet === 'none'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>通常表示</span>
          </button>
          <button
            type="button"
            onClick={() => handleSetRedSheet('hide-meaning')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              redSheet === 'hide-meaning'
                ? 'bg-rose-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>訳を隠す</span>
          </button>
          <button
            type="button"
            onClick={() => handleSetRedSheet('hide-word')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              redSheet === 'hide-word'
                ? 'bg-rose-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>古語を隠す</span>
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          {[
            { id: 'all', label: '全40語' },
            ...SESSIONS.map((s, i) => ({
              id: s.id,
              label: `S${i + 1} (${41 + i * 10}–${50 + i * 10})`,
            })),
            { id: 'weak', label: '苦手・誤答' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="単語・読み・意味・番号で検索"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
        </div>
      </div>

      {/* Word List */}
      {filteredWords.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          条件に一致する単語はありません。
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {filteredWords.map((w) => {
            const p = progressMap[w.id];
            const isPinned = p?.isPinned ?? false;
            const isRevealed = Boolean(revealedIds[w.id]);
            const hideWord = redSheet === 'hide-word' && !isRevealed;
            const hideMeaning = redSheet === 'hide-meaning' && !isRevealed;

            return (
              <div
                key={w.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
              >
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <span className="font-mono-num text-xs font-semibold text-slate-400 pt-1.5 w-8 shrink-0">
                    #{w.number}
                  </span>

                  <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    {/* Classical Word Column */}
                    <div className="md:col-span-4 flex items-center gap-2">
                      {hideWord ? (
                        <button
                          type="button"
                          onClick={() => toggleReveal(w.id)}
                          className="px-4 py-1.5 rounded-lg bg-rose-600 text-rose-100 text-xs font-medium hover:bg-rose-700 cursor-pointer"
                        >
                          タップして古語を表示
                        </button>
                      ) : (
                        <div
                          onClick={() => redSheet === 'hide-word' && toggleReveal(w.id)}
                          className={redSheet === 'hide-word' ? 'cursor-pointer' : ''}
                        >
                          <div className="font-kobun text-lg font-bold text-slate-900">
                            {w.word}
                          </div>
                          <div className="text-xs text-slate-500">
                            {w.word !== w.reading ? `${w.reading} · ` : ''}
                            {w.partOfSpeech}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Meaning & Memory Hook Column */}
                    <div className="md:col-span-8">
                      {hideMeaning ? (
                        <button
                          type="button"
                          onClick={() => toggleReveal(w.id)}
                          className="px-4 py-1.5 rounded-lg bg-rose-600 text-rose-100 text-xs font-medium hover:bg-rose-700 cursor-pointer"
                        >
                          タップして訳を表示
                        </button>
                      ) : (
                        <div
                          onClick={() => redSheet === 'hide-meaning' && toggleReveal(w.id)}
                          className={redSheet === 'hide-meaning' ? 'cursor-pointer' : ''}
                        >
                          <div className="text-base font-semibold text-slate-900">
                            {w.sheetMeaning}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">{w.memoryHook}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-4 pl-12 sm:pl-0 shrink-0">
                  <div className="text-right">
                    <div>{renderMasteryText(p)}</div>
                    {p && (p.correctCount > 0 || p.wrongCount > 0) && (
                      <div className="font-mono-num text-[11px] text-slate-500 mt-0.5">
                        正 {p.correctCount} · 誤 {p.wrongCount}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => speakKobun(w.reading)}
                      className="p-2 rounded-lg text-slate-400 hover:text-indigo-800 hover:bg-slate-100 cursor-pointer"
                      aria-label={`${w.word}を読み上げる`}
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onTogglePin(w)}
                      className={`p-2 rounded-lg transition-colors cursor-pointer ${
                        isPinned
                          ? 'text-rose-700 bg-rose-50'
                          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                      }`}
                      aria-label={`${w.word}をピン留め`}
                    >
                      <Bookmark className="w-4 h-4" fill={isPinned ? 'currentColor' : 'none'} />
                    </button>
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
