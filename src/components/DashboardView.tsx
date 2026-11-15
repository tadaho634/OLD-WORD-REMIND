import React from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Flame,
  Layers,
  LogIn,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { KOBUN_WORDS, SESSIONS } from '../data/kobunWords';
import { SessionDefinition, StudyMode, StudySessionLog, UserProfile, WordProgress } from '../types/study';

interface DashboardViewProps {
  user: User | null;
  profile: UserProfile | null;
  progressMap: Record<string, WordProgress>;
  sessionLogs: StudySessionLog[];
  signingIn: boolean;
  onSignIn: () => void;
  onStartSession: (params: {
    sessionId: string;
    title: string;
    mode: StudyMode;
    wordIds: string[];
    includeFlashcards: boolean;
  }) => void;
  onOpenWeakness: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  profile,
  progressMap,
  sessionLogs,
  signingIn,
  onSignIn,
  onStartSession,
  onOpenWeakness,
}) => {
  const totalWords = KOBUN_WORDS.length;
  const masteredCount = KOBUN_WORDS.filter((w) => (progressMap[w.id]?.masteryLevel ?? 0) >= 3).length;
  const solidCount = KOBUN_WORDS.filter((w) => (progressMap[w.id]?.masteryLevel ?? 0) >= 4).length;

  const weakWords = KOBUN_WORDS.filter((w) => {
    const p = progressMap[w.id];
    return p && (p.isWeak || p.isPinned || p.wrongCount > 0 && p.masteryLevel < 4);
  });

  const totalAnswered = profile?.totalAnswered ?? 0;
  const totalCorrect = profile?.totalCorrect ?? 0;
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  const bestStreak = profile?.bestStreak ?? 0;

  const getSessionWords = (session: SessionDefinition) =>
    KOBUN_WORDS.filter((w) => w.sessionId === session.id);

  const getMasterySegmentClass = (level: number, isWeak: boolean) => {
    if (isWeak || level === 1) return 'bg-rose-500';
    if (level >= 4) return 'bg-emerald-600';
    if (level >= 2) return 'bg-indigo-600';
    return 'bg-slate-200';
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}分${String(s).padStart(2, '0')}秒`;
  };

  const formatDate = (ts: unknown) => {
    let ms = 0;
    if (typeof ts === 'number') ms = ts;
    else if (ts && typeof ts === 'object' && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
      ms = (ts as { toMillis: () => number }).toMillis();
    }
    if (!ms) return '—';
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-8">
      {/* Intro & Account Sync Notice */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-200">
        <div className="space-y-2 max-w-2xl">
          <div className="text-xs font-medium text-slate-500 tracking-wide">
            『新国語便覧』17〜18ページ · No. 41 – 80
          </div>
          <h1 className="font-kobun text-2xl sm:text-3xl font-bold text-slate-900 leading-tight [text-wrap:balance]">
            10語ずつのセッション区切りと間違いゼロ再出題で、40語を完全定着させる。
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            各セッションは「集中カード暗記 → 古語→意味4択 → 意味→古語逆引き」の3段階構成です。間違えた単語はセッション終了前に連続2回正解するまで再出題されます。
          </p>
        </div>

        {!user ? (
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-slate-900">
                アカウント未連携（端末内保存中）
              </div>
              <div className="text-xs text-slate-600">
                Googleログインで進捗・苦手・間違い履歴を自動保存
              </div>
            </div>
            <button
              type="button"
              onClick={onSignIn}
              disabled={signingIn}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-800 rounded-lg hover:bg-indigo-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{signingIn ? '接続中...' : 'Googleで連携'}</span>
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 shrink-0">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-xs">
              <div className="font-semibold text-slate-900">アカウント同期中</div>
              <div className="text-slate-500">{user.email}</div>
            </div>
          </div>
        )}
      </section>

      {/* 4-column KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>定着済み単語</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono-num text-3xl font-semibold text-slate-900">
              {masteredCount}
            </span>
            <span className="font-mono-num text-sm text-slate-500">/ {totalWords} 語</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono-num">
            完全定着（Lv.4以上）: {solidCount}語
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>苦手・要復習</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono-num text-3xl font-semibold text-slate-900">
              {weakWords.length}
            </span>
            <span className="text-sm text-slate-500">語</span>
          </div>
          <button
            type="button"
            onClick={onOpenWeakness}
            className="mt-1 text-xs font-medium text-indigo-700 hover:underline cursor-pointer"
          >
            苦手リストを確認する →
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>通算正答率</span>
            <Target className="w-4 h-4 text-indigo-700" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono-num text-3xl font-semibold text-slate-900">
              {totalAnswered > 0 ? `${accuracy}%` : '—'}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono-num">
            {totalCorrect} / {totalAnswered} 問正解
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>最高連続正解</span>
            <Flame className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono-num text-3xl font-semibold text-slate-900">
              {bestStreak}
            </span>
            <span className="text-sm text-slate-500">問連続</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono-num">
            現在の連続: {profile?.currentStreak ?? 0}問
          </div>
        </div>
      </section>

      {/* 4 Core Sessions Grid */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-kobun text-xl font-bold text-slate-900">
              セッション別マスター（各10語）
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              バーの色：緑＝習得済（Lv.4+） · 紺＝学習中 · 赤＝要復習（誤答あり） · 灰＝未学習
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {SESSIONS.map((session) => {
            const words = getSessionWords(session);
            const sessionMastered = words.filter(
              (w) => (progressMap[w.id]?.masteryLevel ?? 0) >= 3
            ).length;
            const sessionWeak = words.filter((w) => progressMap[w.id]?.isWeak).length;
            const isSessionCompleted = profile?.completedSessions?.includes(session.id);

            return (
              <div
                key={session.id}
                className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <div className="flex items-center gap-2 font-mono-num">
                      <span className="font-semibold text-indigo-800">{session.rangeLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>全10語</span>
                      {isSessionCompleted && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>クリア済</span>
                          </span>
                        </>
                      )}
                    </div>
                    <span className="font-mono-num text-slate-700 font-medium">
                      定着 {sessionMastered}/10
                    </span>
                  </div>

                  <div>
                    <h3 className="font-kobun text-lg font-bold text-slate-900">
                      {session.title}：{session.subtitle}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">{session.focusTheme}</p>
                  </div>

                  {/* 10-word discrete mastery strip */}
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-10 gap-1.5" aria-label="単語ごとの習得状況">
                      {words.map((w) => {
                        const p = progressMap[w.id];
                        const level = p?.masteryLevel ?? 0;
                        const weak = p?.isWeak ?? false;
                        return (
                          <div
                            key={w.id}
                            title={`No.${w.number} ${w.word}（${w.sheetMeaning}）`}
                            className={`h-2 rounded-sm ${getMasterySegmentClass(level, weak)}`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{words.map((w) => w.word).slice(0, 4).join(' / ')} …</span>
                      {sessionWeak > 0 && (
                        <span className="text-rose-700 font-medium font-mono-num">
                          要復習 {sessionWeak}語
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() =>
                      onStartSession({
                        sessionId: session.id,
                        title: `${session.title}（${session.rangeLabel}）`,
                        mode: 'standard',
                        wordIds: words.map((w) => w.id),
                        includeFlashcards: true,
                      })
                    }
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-800 rounded-lg hover:bg-indigo-900 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>暗記＋定着テスト</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onStartSession({
                        sessionId: session.id,
                        title: `${session.title} 確認テスト`,
                        mode: 'standard',
                        wordIds: words.map((w) => w.id),
                        includeFlashcards: false,
                      })
                    }
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <span>テストのみ</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Intensive Weakness & Full Exam Action Row */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-700">
              <AlertTriangle className="w-4 h-4" />
              <span>弱点克服モード</span>
            </div>
            <h3 className="font-kobun text-lg font-bold text-slate-900">
              間違えた単語・苦手ピン集中特訓
            </h3>
            <p className="text-sm text-slate-600">
              {weakWords.length > 0
                ? `現在、誤答履歴またはピン留めされた ${weakWords.length}語 が特訓対象です。連続2回正解するまで出題し続けます。`
                : 'まだ苦手判定された単語はありません。まずはセッションテストを受けるか、単語帳で気になる単語をピン留めしてください。'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={weakWords.length === 0}
              onClick={() =>
                onStartSession({
                  sessionId: 'weakness-drill',
                  title: `苦手特訓セッション（${weakWords.length}語）`,
                  mode: 'weakness',
                  wordIds: weakWords.map((w) => w.id),
                  includeFlashcards: true,
                })
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-rose-700 rounded-lg hover:bg-rose-800 disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <span>苦手 {weakWords.length}語を特訓する</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-800">
              <Layers className="w-4 h-4" />
              <span>小テスト直前対策</span>
            </div>
            <h3 className="font-kobun text-lg font-bold text-slate-900">
              全40語（No.41–80）総仕上げテスト
            </h3>
            <p className="text-sm text-slate-600">
              全40語をランダム順で出題。間違えた単語はその場で復習キューに入り、全問クリアするまで終わらない完全攻略モードです。
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() =>
                onStartSession({
                  sessionId: 'full-exam-40',
                  title: '全40語 総仕上げテスト（No.41–80）',
                  mode: 'exam',
                  wordIds: KOBUN_WORDS.map((w) => w.id),
                  includeFlashcards: false,
                })
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer"
            >
              <span>全40語テストに挑戦</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Recent Session History */}
      {sessionLogs.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-kobun text-lg font-bold text-slate-900">最近の学習履歴</h2>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-semibold">完了日時</th>
                    <th className="py-3 px-4 font-semibold">セッション</th>
                    <th className="py-3 px-4 font-semibold text-right">初回正答率</th>
                    <th className="py-3 px-4 font-semibold text-right">再出題クリア</th>
                    <th className="py-3 px-4 font-semibold text-right">所要時間</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessionLogs.slice(0, 6).map((log, idx) => {
                    const rate =
                      log.totalQuestions > 0
                        ? Math.round((log.firstTryCorrect / log.totalQuestions) * 100)
                        : 0;
                    return (
                      <tr key={log.id || idx} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono-num text-xs text-slate-500 whitespace-nowrap">
                          {formatDate(log.completedAt)}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {log.sessionTitle}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num text-slate-800 whitespace-nowrap">
                          {rate}%（{log.firstTryCorrect}/{log.totalQuestions}）
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num text-slate-600 whitespace-nowrap">
                          {log.requeuedCount > 0 ? `${log.requeuedCount}回克服` : 'ミスなし'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num text-slate-600 whitespace-nowrap">
                          {formatDuration(log.durationSeconds)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
