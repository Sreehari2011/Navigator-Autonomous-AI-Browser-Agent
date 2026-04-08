import React, { useState, useRef, useEffect } from 'react';

interface ControlPanelProps {
  onStartRun: (config: { url: string; username: string; password: string; mode: 'explore' | 'goal'; objective: string }) => void;
  onStopRun: () => void;
  isRunning: boolean;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ onStartRun, onStopRun, isRunning }) => {
  const [url, setUrl] = useState(() => {
      if (typeof window !== 'undefined') {
          return localStorage.getItem('navigator_default_url') || 'https://duckduckgo.com';
      }
      return 'https://duckduckgo.com';
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [objective, setObjective] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${scrollHeight}px`;
    }
  }, [objective]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRunning) {
      onStopRun();
    } else {
      if (!objective.trim()) return;
      onStartRun({ url, username, password, mode: 'goal', objective });
      setObjective('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        if (!isRunning) {
            e.preventDefault();
            handleSubmit(e as any);
        }
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 border-t border-theme bg-main transition-colors duration-300">
      <form onSubmit={handleSubmit} className="relative flex items-start">
        <div className="relative w-full">
            <textarea
              ref={textareaRef}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Start typing a prompt"
              disabled={isRunning}
              className="w-full bg-sec border border-theme rounded-lg pl-4 pr-32 py-3 text-sm text-[var(--text-primary)] placeholder-sec focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] resize-none disabled:opacity-50 transition-all font-mono"
              style={{ 
                minHeight: '48px', 
                maxHeight: '200px',
                overflowY: 'auto'
              }}
            />
            <div className="absolute bottom-2 right-2 flex items-center">
              {isRunning ? (
                <button
                  type="button"
                  onClick={onStopRun}
                  className="flex items-center gap-2 bg-main border border-theme rounded-md px-3 py-1.5 text-xs text-sec hover:text-[var(--text-primary)] transition-colors"
                >
                  <svg className="animate-spin h-3 w-3 text-[var(--accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!objective.trim()}
                  className={`flex items-center gap-2 border rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200
                    ${!objective.trim() 
                      ? 'bg-zinc-800 border-transparent text-zinc-500 cursor-not-allowed'
                      : 'bg-zinc-700 border-transparent text-zinc-100 hover:bg-zinc-600'
                    }`
                  }
                >
                  Run
                  <span className="text-zinc-400 font-light">Ctrl &crarr;</span>
                </button>
              )}
            </div>
        </div>
      </form>
    </div>
  );
};

export default ControlPanel;