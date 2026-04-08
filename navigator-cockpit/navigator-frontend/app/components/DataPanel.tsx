'use client';

import React, { useState, useMemo } from 'react';

export type ApiStatus = 'PASS' | 'FAIL' | 'NO_API_CALL';

export interface ApiReportEntry {
  id?: string;
  element_identifier: string;
  triggered_api_url: string;
  status_code: number | string;
  status: ApiStatus;
  method?: string;
}

interface DataPanelProps {
  apiReport: ApiReportEntry[];
}

const FILTER_ORDER: Array<'ALL' | 'FAIL' | 'PASS' | 'NO_API_CALL'> = ['ALL', 'FAIL', 'PASS', 'NO_API_CALL'];

const DataPanel: React.FC<DataPanelProps> = ({ apiReport }) => {
  const [apiFilter, setApiFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const getStatusPill = (status: ApiStatus, code: number | string) => {
    const styles: Record<string, string> = {
      PASS: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      FAIL: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      NO_API_CALL: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'
    };
    const text = status === 'PASS' ? `PASS ${code}` : 
                 status === 'FAIL' ? `FAIL ${code}` : 'NO CALL';
    
    return (
      <span className={`px-2 py-1 rounded-full text-[10px] font-mono font-bold border ${styles[status] || styles.NO_API_CALL}`}>
        {text}
      </span>
    );
  };
  
  const getMethodPill = (method?: string) => {
    if (!method || method === 'NO_API_CALL') return <span className="text-zinc-500 font-mono text-xs">--</span>;
    
    const styles: Record<string, string> = {
        GET: 'text-sky-400',
        POST: 'text-emerald-400',
        PUT: 'text-amber-400',
        DELETE: 'text-rose-400',
        PATCH: 'text-purple-400',
    };

    return (
        <span className={`font-mono font-bold text-xs ${styles[method.toUpperCase()] || 'text-zinc-400'}`}>
            {method.toUpperCase()}
        </span>
    );
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: apiReport.length, PASS: 0, FAIL: 0, NO_API_CALL: 0 };
    apiReport.forEach(entry => {
      if (counts[entry.status] !== undefined) counts[entry.status]++;
    });
    return counts;
  }, [apiReport]);

  const filteredReport = useMemo(() => {
    const lowercasedQuery = searchQuery.toLowerCase();

    let report = apiReport;

    if (apiFilter !== 'ALL') {
      report = report.filter(e => e.status === apiFilter);
    }

    if (!lowercasedQuery) {
      return report;
    }

    return report.filter(entry => {
      const urlMatch = entry.triggered_api_url?.toLowerCase().includes(lowercasedQuery);
      const triggerMatch = entry.element_identifier?.toLowerCase().includes(lowercasedQuery);
      const methodMatch = entry.method?.toLowerCase().includes(lowercasedQuery);
      const statusCodeMatch = String(entry.status_code).toLowerCase().includes(lowercasedQuery);

      return urlMatch || triggerMatch || methodMatch || statusCodeMatch;
    });
}, [apiReport, apiFilter, searchQuery]);

  const getFilterButtonClass = (status: string) => {
    const isActive = status === apiFilter;
    if (!isActive) return 'text-sec hover:text-[var(--text-primary)] bg-sec';

    const activeStyles: Record<string, string> = {
      FAIL: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      PASS: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      ALL: 'bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/30',
      NO_API_CALL: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30'
    };
    return `${activeStyles[status]} border`;
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="px-4 pt-2 pb-3 border-b border-theme">
            
<div className="flex justify-between items-center mb-3">
    <h2 className="text-xs font-bold text-sec uppercase tracking-widest">Network Intercepts</h2>
    <div className="relative w-1/2 max-w-xs">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sec" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${apiReport.length} requests...`}
            className="w-full bg-main border border-theme rounded-md pl-8 pr-2 py-1.5 text-xs text-[var(--text-primary)] placeholder-sec focus:border-[var(--accent)] focus:outline-none transition-colors"
        />
    </div>
</div>

  
        <div className="flex items-center gap-2 flex-wrap">
            {FILTER_ORDER.map(status => {
            const count = statusCounts[status] || 0;
            if (count === 0 && status !== 'ALL' && status !== apiFilter) return null;
            return (
                <button
                key={status}
                onClick={() => setApiFilter(status)}
                className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${getFilterButtonClass(status)}`}
                >
                {status.replace('_', ' ')} <span className="opacity-60 ml-1">{count}</span>
                </button>
            );
            })}
        </div>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar">
        {filteredReport.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-sec text-center p-4 pb-24">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <p className="text-xs font-bold text-[var(--text-primary)] mb-1">Awaiting Network Activity</p>
            <p className="text-[11px] font-mono max-w-xs">Intercepted API calls from the agent's actions will appear here.</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-sec z-10">
              <tr>
                <th className="text-left font-bold uppercase text-sec p-3 w-28">Status</th>
                <th className="text-left font-bold uppercase text-sec p-3 w-20">Method</th>
                <th className="text-left font-bold uppercase text-sec p-3">URL</th>
                <th className="text-left font-bold uppercase text-sec p-3">Trigger</th>
              </tr>
            </thead>
            <tbody>
              {filteredReport.map((entry, idx) => (
                <tr 
                  key={entry.id || `${entry.element_identifier}-${idx}`} 
                  className="border-t border-theme hover:bg-sec/50 transition-colors group"
                >
                  <td className="p-3 align-top">
                    {getStatusPill(entry.status, entry.status_code)}
                  </td>
                  <td className="p-3 align-top">
                    {getMethodPill(entry.method)}
                  </td>
                  <td className="p-3 font-mono text-sec group-hover:text-[var(--text-primary)] align-top break-all">
                    {entry.triggered_api_url || 'N/A'}
                  </td>
                  <td className="p-3 font-mono text-[var(--accent)]/80 group-hover:text-[var(--accent)] align-top break-words" title={entry.element_identifier}>
                    {entry.element_identifier}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DataPanel;