'use client';

import React, { useState, useEffect, useRef } from 'react';
import ControlPanel from './components/ControlPanel';
import SettingsPanel from './components/SettingsPanel';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  type: 'text' | 'thought' | 'action' | 'artifact'; 
  content: string;
  metadata?: any;
}

const ArtifactMessage = ({ data }: { data: any }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-4 p-4 bg-sec/50 rounded-lg border border-theme animate-in fade-in slide-in-from-bottom-2">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[var(--success)] font-bold text-xs flex items-center gap-2 uppercase tracking-wide">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          {data.label || "File Generated"}
        </span>
        <a 
          href={`http://127.0.0.1:8000${data.download_url}`} 
          target="_blank"
          download={data.filename}
          className="bg-[var(--accent)] hover:bg-blue-600 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-colors uppercase tracking-wider flex items-center gap-2"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
          Download .txt
        </a>
      </div>
      
      <div className="text-[10px] text-sec font-mono bg-main p-3 rounded border border-theme overflow-hidden">
        <div className="whitespace-pre-wrap break-words">
            {expanded ? data.preview : `${data.preview.substring(0, 300)}...`}
        </div>
        
        {data.preview.length > 300 && (
          <button 
            onClick={() => setExpanded(!expanded)}
            className="block mt-2 text-[var(--accent)] hover:underline font-bold uppercase tracking-wide"
          >
            {expanded ? "Show Less" : "Show More"}
          </button>
        )}
      </div>
    </div>
  );
};

export default function Home() {
  const [runId, setRunId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const isRunningRef = useRef(false);
  const [status, setStatus] = useState<'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'>('IDLE');
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [activeNav, setActiveNav] = useState<'agent' | 'settings'>('agent');
  const [leftTab, setLeftTab] = useState<'chat'>('chat');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const formatDuration = (seconds: number) => {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m > 0 ? `${m}m ${s}s` : `${s.toFixed(1)}s`;};
  
  const [latency, setLatency] = useState<number>(0);
  const [connectionStatus, setConnectionStatus] = useState<'SECURE' | 'LOCAL' | 'UNSECURE'>('UNSECURE');

  const ws = useRef<WebSocket | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const terminalScrollRef = useRef<HTMLDivElement>(null);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    if (newTheme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  };

  const [globalSettings, setGlobalSettings] = useState({
      url: 'https://duckduckgo.com',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      plannerModel: 'gpt-4o',
      executorModel: 'gpt-4o-mini',
      recursionLimit: 150,
      jsonRetries: 3,
      headless: false
  });

  useEffect(() => {
      const url = localStorage.getItem('navigator_default_url') || 'https://duckduckgo.com';
      const modelConfig = JSON.parse(localStorage.getItem('navigator_model_config') || '{}');
      const agentConfig = JSON.parse(localStorage.getItem('navigator_agent_config') || '{}');
      
      setGlobalSettings(prev => ({
          ...prev,
          url,
          ...modelConfig,
          ...agentConfig
      }));
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    if (protocol === 'https:') setConnectionStatus('SECURE');
    else if (hostname === 'localhost' || hostname === '127.0.0.1') setConnectionStatus('LOCAL');
    else setConnectionStatus('UNSECURE');

    const checkLatency = async () => {
      const start = Date.now();
      try {
        await fetch('http://127.0.0.1:8000/health');
        const end = Date.now();
        setLatency(end - start);
      } catch (e) {
        setLatency(999);
      }
    };
    checkLatency();
    const interval = setInterval(checkLatency, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, [chatHistory]);
  useEffect(() => { if (terminalScrollRef.current) terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight; }, [logs]);

  useEffect(() => {
    if (!runId) return;
    const wsUrl = `ws://127.0.0.1:8000/ws/runs/${runId}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      setLogs(prev => [...prev, { timestamp: new Date().toISOString(), level: 'INFO', message: `Uplink established: ${runId}` }]);
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'log') setLogs(prev => [...prev, data.payload]);
      else if (data.type === 'screenshot') setScreenshot(data.payload.screenshot);
      else if (data.type === 'agent_thought') {
        setChatHistory(prev => [...prev, {
          id: Date.now().toString(),
          role: 'agent',
          type: 'thought',
          content: data.payload.thought,
          metadata: data.payload.action_json
        }]);
      }

      else if (data.type === 'artifact') {
        setChatHistory(prev => [...prev, {
            id: Date.now().toString(),
            role: 'agent',
            type: 'artifact',
            content: '',
            metadata: data.payload
        }]);
      }

      else if (data.type === 'completion') {
        const completionStatus = data.payload.status as 'COMPLETED' | 'FAILED';
        const duration = data.payload.duration;

        setStatus(completionStatus);
        setIsRunning(false);
        isRunningRef.current = false;

        const timeTaken = duration ? ` (Time taken: ${formatDuration(duration)})` : "";
        
        setChatHistory(prev => [...prev, {
          id: `final-${Date.now()}`,
          role: 'agent',
          type: 'text',
          content: `Task ${completionStatus}.${timeTaken}`
        }]);
      }
    };

    ws.current.onclose = () => {
      if (isRunningRef.current) {
        setStatus('FAILED');
        setIsRunning(false);
        isRunningRef.current = false;
      }
    };
    return () => { ws.current?.close(); };
  }, [runId]);

  const handleStartRun = async (config: { url: string; username: string; password: string; mode: 'explore' | 'goal'; objective: string }) => {
    setIsRunning(true);
    isRunningRef.current = true; 
    setStatus('RUNNING');
    setLogs([]);
    setScreenshot(null);
    setRunId(null);
    
    setChatHistory([{
      id: Date.now().toString(),
      role: 'user',
      type: 'text',
      content: config.objective
    }]);
    setLeftTab('chat');

    const payload = {
        ...config,
        llm_model: globalSettings.executorModel,
        planner_model: globalSettings.plannerModel,
        base_url: globalSettings.baseUrl,
        api_key: globalSettings.apiKey,
        recursion_limit: globalSettings.recursionLimit,
        json_retries: globalSettings.jsonRetries,
        headless: globalSettings.headless
    };

    try {
      const response = await fetch('http://127.0.0.1:8000/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (response.ok) setRunId(data.run_id);
      else throw new Error(data.message || 'Failed to start run');
    } catch (error) {
      setIsRunning(false);
      setStatus('FAILED');
      setChatHistory(prev => [...prev, {
        id: Date.now().toString(),
        role: 'agent',
        type: 'text',
        content: `System Error: ${error}`
      }]);
    }
  };

  const handleStopRun = async () => {
    if (!runId || !isRunning) return;
    try {
      await fetch(`http://127.0.0.1:8000/api/run/${runId}/stop`, { method: 'POST' });
      setIsRunning(false);
      setStatus('CANCELLED');
      isRunningRef.current = false;
      ws.current?.close();
      setChatHistory(prev => [...prev, {
        id: Date.now().toString(),
        role: 'agent',
        type: 'text',
        content: '🛑 Task Aborted.'
      }]);
    } catch (error) { console.error("Failed to stop", error); }
  };

  return (
    <main className="flex h-screen w-full font-sans overflow-hidden bg-main text-[var(--text-primary)] transition-colors duration-300">
      
      <nav className="w-50 flex-shrink-0 flex flex-col py-4 px-3 border-r border-theme bg-sec z-30">
    <div className="px-2 mb-8">
    <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-[var(--accent)] tracking-tight">Auto</span>
        <span className="text-xl font-light text-[var(--text-primary)] tracking-tight">Navigator</span>
    </div>
</div>
    
    <div className="flex flex-col gap-2">
        <button onClick={() => setActiveNav('agent')} className={`flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors ${activeNav === 'agent' ? 'bg-main text-[var(--text-primary)] font-semibold' : 'text-sec hover:bg-main hover:text-[var(--text-primary)]'}`} title="Agent Console">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            <span>Console</span>
        </button>
        <button onClick={() => setActiveNav('settings')} className={`flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors ${activeNav === 'settings' ? 'bg-main text-[var(--text-primary)] font-semibold' : 'text-sec hover:bg-main hover:text-[var(--text-primary)]'}`} title="Settings">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span>Settings</span>
        </button>
    </div>

    <div className="mt-auto">
        <button onClick={toggleTheme} className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-sec hover:bg-main hover:text-[var(--text-primary)] transition-colors" title="Toggle Theme">
            {theme === 'dark' ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
            )}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
    </div>
</nav>

      <aside className="w-1/3 min-w-[400px] flex flex-col shrink-0 border-r border-theme bg-main relative z-20">
        
        {activeNav === 'agent' && (
            
            <div className="flex-grow overflow-hidden relative flex flex-col">
                <div ref={chatScrollRef} className="flex-grow overflow-y-auto p-4 space-y-6 custom-scrollbar bg-main">
                    {chatHistory.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-sec p-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                            <h3 className="text-sm font-bold text-[var(--text-primary)]">Agent Console</h3>
                            <p className="text-xs mt-1 font-mono">
                                The agent's reasoning and your task-specific objectives will appear here.
                            </p>
                        </div>
                    ) : (
                    chatHistory.map((msg) => (
                        <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        {msg.type === 'artifact' ? (
                            <ArtifactMessage data={msg.metadata} />
                        ) : (
                            <div className={`max-w-[90%] rounded-lg p-3 text-sm border shadow-sm ${ msg.role === 'user' ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-sec border-theme text-[var(--text-primary)]' }`}>
                                {msg.type === 'thought' && ( <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10"><span className="text-[10px] font-mono opacity-70 uppercase">Reasoning Engine</span></div> )}
                                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                                {msg.metadata && typeof msg.metadata === 'string' && ( <div className="mt-2 p-2 bg-main rounded border border-theme text-[10px] font-mono text-sec overflow-x-auto">{msg.metadata}</div> )}
                            </div>
                        )}
                        </div>
                    ))
                    )}
                </div>
                <ControlPanel onStartRun={handleStartRun} onStopRun={handleStopRun} isRunning={isRunning} />
            </div>
        )}

        {activeNav === 'settings' && <SettingsPanel onSave={(s) => setGlobalSettings(prev => ({...prev, ...s}))} />}
      </aside>

      <section className="flex-1 flex flex-col h-full relative min-w-0 bg-sec">
        
        <div className="h-8 bg-main border-b border-theme flex items-center justify-between px-4 text-[10px] font-mono text-sec select-none">
            <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-[var(--success)] animate-pulse' : 'bg-gray-500'}`}></span> SYSTEM: {isRunning ? 'ACTIVE' : 'STANDBY'}</span>
                <span className={latency > 100 ? "text-yellow-500" : "text-[var(--success)]"}>LATENCY: {latency}ms</span>
            </div>
            <div className="flex items-center gap-1.5">
              {connectionStatus === 'SECURE' && ( <><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-[var(--success)]" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg><span className="text-[var(--success)]">ENCRYPTED</span></> )}
              {connectionStatus === 'LOCAL' && ( <><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-blue-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg><span className="text-blue-400">LOCALHOST</span></> )}
              {connectionStatus === 'UNSECURE' && ( <><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-[var(--error)]" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg><span className="text-[var(--error)]">UNSECURE</span></> )}
            </div>
        </div>

        <div className="h-[60%] relative border-b border-theme flex flex-col z-10 bg-black">
          <div className="absolute top-4 left-4 z-20 flex gap-3">
            <div className="bg-main/80 border border-theme px-3 py-1.5 rounded-md flex items-center gap-2 backdrop-blur-sm"><span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-[var(--success)] animate-pulse' : 'bg-gray-500'}`}></span><span className="text-[10px] font-medium text-sec">Live Feed</span></div>
            {status !== 'IDLE' && ( <div className={`px-3 py-1.5 rounded-md text-[10px] font-medium border backdrop-blur-sm ${ status === 'COMPLETED' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : status === 'FAILED' ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : status === 'RUNNING' ? 'bg-blue-500/10 border-blue-500/20 text-blue-500' : 'bg-zinc-800 border-zinc-700 text-zinc-400' }`}>{status}</div> )}
          </div>
          <div className="flex-grow flex items-center justify-center overflow-hidden p-8 bg-[url('/grid.svg')]">
            {screenshot ? ( <img src={`data:image/jpeg;base64,${screenshot}`} alt="Live View" className="max-w-full max-h-full object-contain shadow-2xl border border-theme rounded-lg" /> ) : ( <div className="text-sec flex flex-col items-center"><p className="text-xs font-mono uppercase tracking-widest">Video Feed Offline</p></div> )}
          </div>
        </div>

        <div className="h-[40%] bg-main flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-theme bg-sec">
                <span className="text-[10px] font-mono text-sec uppercase">System Logs</span>
                <button onClick={() => setLogs([])} className="text-[10px] text-sec hover:text-[var(--text-primary)] transition-colors">CLEAR</button>
            </div>
            <div ref={terminalScrollRef} className="flex-grow overflow-y-auto p-4 font-mono text-xs custom-scrollbar">
                {logs.map((log, index) => (
                    <div key={index} className="mb-1 flex items-start">
                    <span className="text-sec mr-3 select-none shrink-0 w-16">{new Date(log.timestamp).toLocaleTimeString([], {hour12: false})}</span>
                    <span className={`mr-3 font-bold w-12 shrink-0 ${log.level === 'INFO' ? 'text-[var(--accent)]' : log.level === 'WARNING' ? 'text-yellow-500' : log.level === 'ERROR' ? 'text-[var(--error)]' : 'text-sec'}`}>{log.level}</span>
                    <span className="text-[var(--text-primary)] break-all whitespace-pre-wrap">{log.message}</span>
                    </div>
                ))}
            </div>
        </div>
      </section>
    </main>
  );
}