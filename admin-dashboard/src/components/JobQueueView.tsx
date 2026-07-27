import { useState, useEffect } from 'react';
import { Layers, RefreshCw, CheckCircle, AlertTriangle, Clock, RotateCcw, X, Bot, MessageSquare, Sparkles, RefreshCcw } from 'lucide-react';
import axios from 'axios';

const JobQueueView = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [jobLogs, setJobLogs] = useState<any>({ automation: [], whatsapp: [], ai: [], sync: [], error: [] });
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [activeLogTab, setActiveLogTab] = useState<'automation' | 'whatsapp' | 'ai' | 'sync' | 'error'>('automation');
  const [retryingId, setRetryingId] = useState<number | null>(null);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchJobs = async () => {
    try {
      const res = await axios.get('/api/jobs');
      setJobs(res.data || []);
    } catch (err) {
      console.error('Failed to fetch queue jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const openJobLogs = async (job: any) => {
    setSelectedJob(job);
    setLoadingLogs(true);
    try {
      const res = await axios.get(`/api/jobs/${job.id}/logs`);
      setJobLogs(res.data || { automation: [], whatsapp: [], ai: [], sync: [], error: [] });
    } catch (err) {
      console.error('Failed to fetch job logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleRetryJob = async (jobId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetryingId(jobId);
    try {
      await axios.post(`/api/jobs/${jobId}/retry`);
      await fetchJobs();
      if (selectedJob && selectedJob.id === jobId) {
        setSelectedJob({ ...selectedJob, status: 'pending', attempts: 0 });
      }
    } catch (err: any) {
      alert('Failed to retry job: ' + (err.response?.data?.error || err.message));
    } finally {
      setRetryingId(null);
    }
  };

  const renderStatusBadge = (status: string, attempts: number, maxRetries: number) => {
    switch (status) {
      case 'completed':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 w-fit"><CheckCircle size={12} /> Completed</span>;
      case 'processing':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1 w-fit"><RefreshCw size={12} className="animate-spin" /> Processing</span>;
      case 'failed':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 w-fit"><AlertTriangle size={12} /> Failed ({attempts}/{maxRetries})</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 w-fit"><Clock size={12} /> Pending</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
        <RefreshCw size={20} className="animate-spin text-indigo-400" />
        <span>Loading Queue Worker Telemetry...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Layers className="text-indigo-400" size={28} /> Queue Worker Telemetry &amp; Job Log Engine
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Every automation run is processed asynchronously as a Job generating Automation, WhatsApp, AI, Sync, and Error logs.
          </p>
        </div>
        <button
          onClick={fetchJobs}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
        >
          <RefreshCw size={14} /> Refresh Jobs
        </button>
      </div>

      {/* Jobs Table */}
      <div className="glass-card p-5 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Job ID</th>
                <th className="p-3">Job Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Attempts</th>
                <th className="p-3">Created At</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => openJobLogs(job)}
                  className="hover:bg-slate-900/40 cursor-pointer transition-colors"
                >
                  <td className="p-3 font-mono font-bold text-indigo-300">#{job.id}</td>
                  <td className="p-3 font-semibold text-white capitalize">{job.job_type.replace('_', ' ')}</td>
                  <td className="p-3">{renderStatusBadge(job.status, job.attempts, job.max_retries)}</td>
                  <td className="p-3 text-slate-400">{job.attempts} / {job.max_retries}</td>
                  <td className="p-3 text-slate-400">{new Date(job.created_at).toLocaleString()}</td>
                  <td className="p-3 text-right space-x-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); openJobLogs(job); }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-semibold text-[11px] transition-colors cursor-pointer"
                    >
                      View Logs
                    </button>
                    {(job.status === 'failed' || job.status === 'completed') && (
                      <button
                        onClick={(e) => handleRetryJob(job.id, e)}
                        disabled={retryingId === job.id}
                        className="px-2.5 py-1 bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/30 rounded font-semibold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        {retryingId === job.id ? <RefreshCw size={12} className="animate-spin" /> : <RotateCcw size={12} />} Retry Job
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No queue worker jobs created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Job Logs Modal ────────────────────────────────────────────────── */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-card w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-700/50 flex justify-between items-center bg-slate-900 flex-shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers size={20} className="text-indigo-400" /> Telemetry Logs for Job #{selectedJob.id}
                </h3>
                {renderStatusBadge(selectedJob.status, selectedJob.attempts, selectedJob.max_retries)}
              </div>
              <button onClick={() => setSelectedJob(null)} className="text-slate-500 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* 5-Category Log Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 pt-2 gap-2 flex-shrink-0">
              <button
                onClick={() => setActiveLogTab('automation')}
                className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeLogTab === 'automation' ? 'bg-indigo-600/30 text-indigo-300 border-t border-x border-indigo-500/40' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Bot size={14} /> Automation Log ({jobLogs.automation?.length || 0})
              </button>
              <button
                onClick={() => setActiveLogTab('whatsapp')}
                className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeLogTab === 'whatsapp' ? 'bg-emerald-600/30 text-emerald-300 border-t border-x border-emerald-500/40' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MessageSquare size={14} /> WhatsApp Log ({jobLogs.whatsapp?.length || 0})
              </button>
              <button
                onClick={() => setActiveLogTab('ai')}
                className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeLogTab === 'ai' ? 'bg-purple-600/30 text-purple-300 border-t border-x border-purple-500/40' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles size={14} /> AI Log ({jobLogs.ai?.length || 0})
              </button>
              <button
                onClick={() => setActiveLogTab('sync')}
                className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeLogTab === 'sync' ? 'bg-amber-600/30 text-amber-300 border-t border-x border-amber-500/40' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <RefreshCcw size={14} /> Sync Log ({jobLogs.sync?.length || 0})
              </button>
              <button
                onClick={() => setActiveLogTab('error')}
                className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeLogTab === 'error' ? 'bg-rose-600/30 text-rose-300 border-t border-x border-rose-500/40' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <AlertTriangle size={14} /> Error Log ({jobLogs.error?.length || 0})
              </button>
            </div>

            {/* Log Output Body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-3 bg-slate-950/40 font-mono text-xs">
              {loadingLogs ? (
                <div className="text-center py-10 text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw size={16} className="animate-spin text-indigo-400" /> Fetching logs...
                </div>
              ) : jobLogs[activeLogTab]?.length > 0 ? (
                jobLogs[activeLogTab].map((log: any) => (
                  <div key={log.id} className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                    <div className="flex justify-between items-center text-[10px] text-slate-500 border-b border-slate-800/80 pb-1">
                      <span>Log ID #{log.id}</span>
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-slate-200 font-sans font-medium text-xs pt-1">{log.message}</p>
                    {log.details && (
                      <pre className="p-2 bg-slate-950 rounded text-[11px] text-indigo-300 overflow-x-auto border border-slate-800/60 mt-1">
                        {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-slate-500 text-center py-12">No logs recorded under {activeLogTab.toUpperCase()} category for Job #{selectedJob.id}.</p>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-700/50 bg-slate-900 flex justify-between items-center flex-shrink-0">
              {selectedJob.status === 'failed' ? (
                <button
                  onClick={(e) => handleRetryJob(selectedJob.id, e)}
                  disabled={retryingId === selectedJob.id}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <RotateCcw size={14} /> Retry Job Now
                </button>
              ) : <div />}
              <button onClick={() => setSelectedJob(null)} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold transition-all cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobQueueView;
