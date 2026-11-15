import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || '予期しないエラーが発生しました。',
    };
  }

  render() {
    if (this.state.hasError) {
      let displayMsg = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string };
        if (parsed?.error) displayMsg = parsed.error;
      } catch {
        // Keep original string
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-700 font-semibold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>同期または表示中にエラーが発生しました</span>
            </div>
            <p className="text-xs text-slate-600 break-words">{displayMsg}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-800 rounded-lg hover:bg-indigo-900 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>再読み込み</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
