import { useState } from 'react';
import { ArrowRight, CheckCircle2, Layers, ShieldAlert } from 'lucide-react';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StudySessionRunner } from './components/StudySessionRunner';
import { TopBar } from './components/TopBar';
import { WeaknessView } from './components/WeaknessView';
import { WordbookView } from './components/WordbookView';
import { KOBUN_WORDS } from './data/kobunWords';
import { useAuthAndProgress } from './hooks/useAuthAndProgress';
import { NavTab, StudyMode } from './types/study';

interface ActiveSessionConfig {
  sessionId: string;
  title: string;
  mode: StudyMode;
  wordIds: string[];
  includeFlashcards: boolean;
}

export default function App() {
  const {
    user,
    authReady,
    authError,
    signingIn,
    cloudSyncing,
    profile,
    progressMap,
    sessionLogs,
    signInWithGoogle,
    signOut,
    recordWordAttempt,
    toggleWordPin,
    recordSessionCompletion,
  } = useAuthAndProgress();

  const [activeTab, setActiveTab] = useState<NavTab>('sessions');
  const [activeSession, setActiveSession] = useState<ActiveSessionConfig | null>(null);

  const weakCount = KOBUN_WORDS.filter((w) => {
    const p = progressMap[w.id];
    return p && (p.isWeak || p.isPinned || (p.wrongCount > 0 && p.masteryLevel < 4));
  }).length;

  const handleSelectTab = (tab: NavTab) => {
    setActiveSession(null);
    setActiveTab(tab);
  };

  const renderExamHub = () => {
    const firstSheetWords = KOBUN_WORDS.filter((w) => w.number <= 60);
    const secondSheetWords = KOBUN_WORDS.filter((w) => w.number >= 61);
    const unmasteredWords = KOBUN_WORDS.filter(
      (w) => (progressMap[w.id]?.masteryLevel ?? 0) < 4
    );

    return (
      <div className="space-y-6">
        <div className="pb-4 border-b border-slate-200">
          <h1 className="font-kobun text-2xl font-bold text-slate-900">
            総仕上げテスト（間違いゼロ再出題モード）
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            プリント範囲ごとに総点検。すべてのテストで「間違えた単語は連続2回正解するまで再出題」が作動します。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-800">
                <Layers className="w-4 h-4" />
                <span>全範囲 · No. 41–80</span>
              </div>
              <h2 className="font-kobun text-xl font-bold text-slate-900">
                全40語 完全制覇テスト
              </h2>
              <p className="text-sm text-slate-600">
                『新国語便覧』41〜80番の全40語をランダム順でテスト。古語→訳と訳→古語の両方を織り交ぜて出題します。
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setActiveSession({
                  sessionId: 'full-exam-40',
                  title: '全40語 完全制覇テスト（No.41–80）',
                  mode: 'exam',
                  wordIds: KOBUN_WORDS.map((w) => w.id),
                  includeFlashcards: false,
                })
              }
              className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-indigo-800 rounded-lg hover:bg-indigo-900 transition-colors cursor-pointer"
            >
              <span>全40語テストを開始</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-700">
                <ShieldAlert className="w-4 h-4" />
                <span>未定着語のみ抽出 · {unmasteredWords.length}語</span>
              </div>
              <h2 className="font-kobun text-xl font-bold text-slate-900">
                未習得・Lv.3以下 集中テスト
              </h2>
              <p className="text-sm text-slate-600">
                まだ完全定着（Lv.4）に達していない単語だけを一気に潰すテストです。
              </p>
            </div>
            <button
              type="button"
              disabled={unmasteredWords.length === 0}
              onClick={() =>
                setActiveSession({
                  sessionId: 'unmastered-exam',
                  title: `未習得集中テスト（${unmasteredWords.length}語）`,
                  mode: 'exam',
                  wordIds: unmasteredWords.map((w) => w.id),
                  includeFlashcards: false,
                })
              }
              className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-rose-700 rounded-lg hover:bg-rose-800 disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {unmasteredWords.length === 0 ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>全40語が完全定着済みです</span>
                </>
              ) : (
                <>
                  <span>残り {unmasteredWords.length}語をテストする</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4">
            <div className="space-y-1.5">
              <div className="text-xs font-mono-num font-semibold text-slate-500">
                プリント1枚目 · No. 41 – 60（20語）
              </div>
              <h3 className="font-kobun text-lg font-bold text-slate-900">
                前半20語 総点検テスト（聞こゆ〜さらでも）
              </h3>
            </div>
            <button
              type="button"
              onClick={() =>
                setActiveSession({
                  sessionId: 'sheet-1-exam',
                  title: '前半20語テスト（No.41–60）',
                  mode: 'exam',
                  wordIds: firstSheetWords.map((w) => w.id),
                  includeFlashcards: false,
                })
              }
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <span>前半20語を開始</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4">
            <div className="space-y-1.5">
              <div className="text-xs font-mono-num font-semibold text-slate-500">
                プリント2枚目 · No. 61 – 80（20語）
              </div>
              <h3 className="font-kobun text-lg font-bold text-slate-900">
                後半20語 総点検テスト（さらなり〜なほ）
              </h3>
            </div>
            <button
              type="button"
              onClick={() =>
                setActiveSession({
                  sessionId: 'sheet-2-exam',
                  title: '後半20語テスト（No.61–80）',
                  mode: 'exam',
                  wordIds: secondSheetWords.map((w) => w.id),
                  includeFlashcards: false,
                })
              }
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <span>後半20語を開始</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-slate-50">
        <TopBar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          user={user}
          signingIn={signingIn}
          onSignIn={() => void signInWithGoogle()}
          onSignOut={() => void signOut()}
          weakCount={weakCount}
        />

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
          {authError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
              {authError}
            </div>
          )}

          {!authReady || cloudSyncing ? (
            <div className="py-20 text-center text-sm text-slate-500">
              学習データを読み込み中...
            </div>
          ) : activeSession ? (
            <StudySessionRunner
              key={activeSession.sessionId + '_' + activeSession.wordIds.join(',')}
              sessionId={activeSession.sessionId}
              title={activeSession.title}
              mode={activeSession.mode}
              wordIds={activeSession.wordIds}
              includeFlashcards={activeSession.includeFlashcards}
              progressMap={progressMap}
              onRecordAttempt={recordWordAttempt}
              onTogglePin={toggleWordPin}
              onCompleteSession={recordSessionCompletion}
              onExit={() => setActiveSession(null)}
            />
          ) : activeTab === 'sessions' ? (
            <DashboardView
              user={user}
              profile={profile}
              progressMap={progressMap}
              sessionLogs={sessionLogs}
              signingIn={signingIn}
              onSignIn={() => void signInWithGoogle()}
              onStartSession={(cfg) => setActiveSession(cfg)}
              onOpenWeakness={() => setActiveTab('weakness')}
            />
          ) : activeTab === 'wordbook' ? (
            <WordbookView progressMap={progressMap} onTogglePin={toggleWordPin} />
          ) : activeTab === 'weakness' ? (
            <WeaknessView
              progressMap={progressMap}
              onTogglePin={toggleWordPin}
              onStartWeaknessDrill={(cfg) => setActiveSession(cfg)}
            />
          ) : (
            renderExamHub()
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
