import React from 'react';
import { User } from 'firebase/auth';
import { LogIn, LogOut } from 'lucide-react';
import { NavTab } from '../types/study';

interface TopBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: User | null;
  signingIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  weakCount: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  user,
  signingIn,
  onSignIn,
  onSignOut,
  weakCount,
}) => {
  const navItems: { id: NavTab; label: string }[] = [
    { id: 'sessions', label: '学習セッション' },
    { id: 'wordbook', label: '単語帳・赤シート' },
    { id: 'weakness', label: weakCount > 0 ? `苦手・間違い (${weakCount})` : '苦手・間違い' },
    { id: 'exam', label: '総仕上げテスト' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Brand wordmark (single text element) */}
        <button
          type="button"
          onClick={() => onSelectTab('sessions')}
          className="font-kobun text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded"
        >
          古文単語 四十選
        </button>

        {/* Zone 2: 4 clean single-line text nav links */}
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded ${
                  isActive
                    ? 'text-indigo-800 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-700" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-block text-sm text-slate-700 font-medium max-w-[140px] truncate">
                {user.displayName || user.email}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>ログアウト</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              disabled={signingIn}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-indigo-800 rounded-lg hover:bg-indigo-900 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
            >
              <LogIn className="w-4 h-4" />
              <span>{signingIn ? '接続中...' : 'Googleでログイン'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile compact secondary nav */}
      <nav className="md:hidden flex items-center gap-4 px-4 pb-2.5 overflow-x-auto border-t border-slate-100">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`pt-2 pb-1 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                isActive
                  ? 'border-indigo-700 text-indigo-800 font-semibold'
                  : 'border-transparent text-slate-600'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
