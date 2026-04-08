'use client';

import React, { useState, useEffect, useRef } from 'react';

const NavIcon = ({ path }: { path: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
);

interface SettingsPanelProps {
    onSave: (settings: any) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onSave }) => {
  const [activeTab, setActiveTab] = useState<'General' | 'Models' | 'Agent'>('General');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const searchEngines = [
    { 
      name: 'Google', 
      url: 'https://www.google.com',
      icon: <img src="/icons/google.png" alt="Google" className="w-4 h-4 object-contain" />
    },
    { 
      name: 'Bing', 
      url: 'https://www.bing.com',
      icon: <img src="/icons/bing.png" alt="Bing" className="w-4 h-4 object-contain" />
    },
    { 
      name: 'DuckDuckGo', 
      url: 'https://www.duckduckgo.com',
      icon: <img src="/icons/duckduckgo.png" alt="DuckDuckGo" className="w-4 h-4 object-contain" />
    },
    { 
      name: 'Perplexity', 
      url: 'https://www.perplexity.ai',
      icon: <img src="/icons/perplexity.png" alt="Perplexity" className="w-4 h-4 object-contain" />
    },
    { 
      name: 'Wikipedia', 
      url: 'https://www.wikipedia.org',
      icon: <img src="/icons/wiki.png" alt="Wikipedia" className="w-4 h-4 object-contain" />
    }
  ];

  const [selectedEngine, setSelectedEngine] = useState(() => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('navigator_default_url') || 'https://www.duckduckgo.com';
    }
    return 'https://www.duckduckgo.com';
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    localStorage.setItem('navigator_default_url', selectedEngine);
  }, [selectedEngine]);
  
  const [modelConfig, setModelConfig] = useState(() => {
      if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('navigator_model_config');
          return saved ? JSON.parse(saved) : {
            baseUrl: 'https://api.openai.com/v1',
            apiKey: '',
            plannerModel: 'gpt-4o',
            executorModel: 'gpt-4o-mini'
          };
      }
      return { baseUrl: '', apiKey: '', plannerModel: '', executorModel: '' };
  });

  const [agentConfig, setAgentConfig] = useState(() => {
      if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('navigator_agent_config');
          return saved ? JSON.parse(saved) : {
            recursionLimit: 150,
            headless: false,
            jsonRetries: 3
          };
      }
      return { recursionLimit: 150, headless: false, jsonRetries: 3 };
  });

  // --- SAVE HANDLER ---
  const handleSave = () => {
    const fullSettings = {
        url: selectedEngine,
        ...modelConfig,
        ...agentConfig
    };
    
    localStorage.setItem('navigator_default_url', selectedEngine);
    localStorage.setItem('navigator_model_config', JSON.stringify(modelConfig));
    localStorage.setItem('navigator_agent_config', JSON.stringify(agentConfig));

    onSave(fullSettings);
    alert("Settings Saved!");
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'General':
        return (
          <>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">General Configuration</h3>
            
            <div className="bg-sec border border-theme p-4 rounded-lg mb-4">
                 <h4 className="font-bold text-sm mb-1">Default Search Engine</h4>
                 <p className="text-xs text-sec mb-4">Select the starting point for the browser agent.</p>
                 <div className="grid grid-cols-1 gap-4 text-xs">
                  <div className="relative" ref={dropdownRef}>
                    <label className="text-sec font-medium">Search Provider</label>
                    <button 
                        type="button"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="mt-1 w-full bg-main border border-theme rounded px-3 py-2 text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors flex items-center justify-between text-left"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-[var(--accent)]">
                                {searchEngines.find(e => e.url === selectedEngine)?.icon}
                            </span>
                            <span>{searchEngines.find(e => e.url === selectedEngine)?.name}</span>
                        </div>
                        <svg className={`w-3 h-3 text-sec transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {isDropdownOpen && (
                        <div className="absolute z-10 top-full left-0 w-full mt-1 bg-main border border-theme rounded shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-100">
                            {searchEngines.map((engine) => (
                                <button
                                    key={engine.name}
                                    type="button"
                                    onClick={() => {
                                        setSelectedEngine(engine.url);
                                        setIsDropdownOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs text-left transition-colors ${
                                        selectedEngine === engine.url 
                                        ? 'bg-sec text-[var(--text-primary)]' 
                                        : 'hover:bg-sec text-sec hover:text-[var(--text-primary)]'
                                    }`}
                                >
                                    <span className={selectedEngine === engine.url ? 'text-[var(--accent)]' : 'text-sec'}>
                                        {engine.icon}
                                    </span>
                                    <span>{engine.name}</span>
                                    {selectedEngine === engine.url && (
                                        <svg className="w-3 h-3 ml-auto text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                  </div>
                  <div>
                    <label className="text-sec font-medium">Starting URL Preview</label>
                    <input 
                        type="text" 
                        value={selectedEngine} 
                        readOnly 
                        className="mt-1 w-full bg-main/50 border border-theme rounded px-3 py-2 text-sec cursor-not-allowed focus:outline-none font-mono" 
                    />
                  </div>
                </div>
            </div>
          </>
        );
      case 'Models':
        return (
          <>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Model & Endpoint Settings</h3>
            <div className="bg-sec border border-theme rounded-lg p-4">
              <h4 className="font-bold text-sm mb-1">Connection Details</h4>
              <p className="text-xs text-sec mb-4">Configuration for the LLM proxy.</p>
              <div className="space-y-4 text-xs">
                <div>
                  <label className="font-medium">Base URL</label>
                  <input type="text" value={modelConfig.baseUrl} onChange={(e) => setModelConfig({...modelConfig, baseUrl: e.target.value})} className="mt-1 w-full bg-main border border-theme rounded px-3 py-2 placeholder-sec focus:border-[var(--accent)] focus:outline-none transition-colors" />
                </div>
                <div>
                  <label className="font-medium">API Key</label>
                  <input type="password" value={modelConfig.apiKey} onChange={(e) => setModelConfig({...modelConfig, apiKey: e.target.value})} className="mt-1 w-full bg-main border border-theme rounded px-3 py-2 placeholder-sec focus:border-[var(--accent)] focus:outline-none transition-colors" />
                </div>
              </div>
            </div>

            <div className="bg-sec border border-theme rounded-lg p-4 mt-6">
              <h4 className="font-bold text-sm mb-1">Agent Model Assignments</h4>
              <p className="text-xs text-sec mb-4">Assign models to the Planner and Executor agents.</p>
              <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                      <label className="font-medium">Planner Model (High Reasoning)</label>
                      <input type="text" value={modelConfig.plannerModel} onChange={(e) => setModelConfig({...modelConfig, plannerModel: e.target.value})} className="mt-1 w-full bg-main border border-theme rounded px-3 py-2 placeholder-sec focus:border-[var(--accent)] focus:outline-none transition-colors" />
                  </div>
                  <div>
                      <label className="font-medium">Executor Model (Fast)</label>
                      <input type="text" value={modelConfig.executorModel} onChange={(e) => setModelConfig({...modelConfig, executorModel: e.target.value})} className="mt-1 w-full bg-main border border-theme rounded px-3 py-2 placeholder-sec focus:border-[var(--accent)] focus:outline-none transition-colors" />
                  </div>
              </div>
            </div>
          </>
        );
      case 'Agent':
        return (
            <>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Agent Behavior</h3>
            <div className="bg-sec border border-theme rounded-lg p-4">
              <h4 className="font-bold text-sm mb-1">Execution Parameters</h4>
              <p className="text-xs text-sec mb-4">Control the agent's core logic and safety limits.</p>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                    <label className="font-medium">Recursion Limit</label>
                    <input type="number" value={agentConfig.recursionLimit} onChange={(e) => setAgentConfig({...agentConfig, recursionLimit: parseInt(e.target.value)})} className="mt-1 w-full bg-main border border-theme rounded px-3 py-2 placeholder-sec focus:border-[var(--accent)] focus:outline-none transition-colors" />
                </div>
                <div>
                    <label className="font-medium">JSON Retries</label>
                    <input type="number" value={agentConfig.jsonRetries} onChange={(e) => setAgentConfig({...agentConfig, jsonRetries: parseInt(e.target.value)})} className="mt-1 w-full bg-main border border-theme rounded px-3 py-2 placeholder-sec focus:border-[var(--accent)] focus:outline-none transition-colors" />
                </div>
              </div>
            </div>

            <div className="bg-sec border border-theme rounded-lg p-4 mt-6">
              <h4 className="font-bold text-sm mb-1">Browser Environment</h4>
              <p className="text-xs text-sec mb-4">Settings for the Playwright browser instance.</p>
              <div className="flex items-center justify-between mt-4 bg-main p-3 rounded-md border border-theme">
                <label className="text-xs font-medium">Run browser in headless mode</label>
                <button onClick={() => setAgentConfig({...agentConfig, headless: !agentConfig.headless})} className={`relative inline-flex items-center h-5 w-10 rounded-full transition-colors ${agentConfig.headless ? 'bg-[var(--accent)]' : 'bg-sec border border-theme'}`}>
                    <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${agentConfig.headless ? 'translate-x-5' : 'translate-x-1'}`}/>
                </button>
              </div>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const navItems = [
    { name: 'General', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9V3m-9 9a9 9 0 019-9' },
    { name: 'Models', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
    { name: 'Agent', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-theme bg-sec">
        <h2 className="text-sm font-bold uppercase tracking-widest">Settings</h2>
      </div>
      <div className="flex flex-grow overflow-hidden">
        <aside className="w-52 flex-shrink-0 border-r border-theme bg-main p-2">
          <nav className="flex flex-col gap-1">
            {navItems.map(item => (
              <button
                key={item.name}
                onClick={() => setActiveTab(item.name as any)}
                className={`flex items-center gap-3 text-left w-full px-3 py-2 rounded-md text-sm transition-colors ${
                  activeTab === item.name
                    ? 'bg-sec text-[var(--text-primary)] font-semibold'
                    : 'text-sec hover:bg-sec hover:text-[var(--text-primary)]'
                }`}
              >
                <NavIcon path={item.icon} />
                {item.name}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex flex-col flex-grow bg-main">
    <main className="flex-grow p-6 overflow-y-auto custom-scrollbar">
        {renderContent()}
    </main>
    <div className="p-4 border-t border-theme flex-shrink-0">
         <button 
                    onClick={handleSave}
                    className="w-full bg-[var(--accent)] text-white font-bold py-2 rounded-md hover:opacity-90 transition-opacity"
                >
                    Save Settings
                </button>
    </div>
</div>
      </div>
    </div>
  );
};

export default SettingsPanel;