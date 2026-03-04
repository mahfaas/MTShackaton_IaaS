import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { X, Camera, RotateCcw, Clock, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';

export default function BackupManager({ isOpen, onClose, instance, onRestored }) {
    const [backups, setBackups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [restoringId, setRestoringId] = useState(null);

    const fetchBackups = async () => {
        if (!instance) return;
        try {
            const res = await api.get(`/instances/${instance.id}/snapshots`);
            setBackups(res.data);
        } catch (e) {
            console.error("Failed to fetch backups", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && instance) {
            setLoading(true);
            fetchBackups();
        }
    }, [isOpen, instance]);

    const handleCreate = async () => {
        setCreating(true);
        try {
            await api.post(`/instances/${instance.id}/snapshots`);
            await fetchBackups();
        } catch (e) {
            console.error("Failed to create snapshot", e);
        } finally {
            setCreating(false);
        }
    };

    const handleRestore = async (backupId) => {
        if (!confirm("Restoring will replace the current VM state. Continue?")) return;
        setRestoringId(backupId);
        try {
            await api.post(`/instances/${instance.id}/snapshots/${backupId}/restore`);
            await fetchBackups();
            if (onRestored) onRestored();
        } catch (e) {
            console.error("Failed to restore snapshot", e);
        } finally {
            setRestoringId(null);
        }
    };

    if (!isOpen) return null;

    const statusConfig = {
        READY: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', label: 'Ready' },
        CREATING: { icon: Loader2, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Creating...' },
        RESTORING: { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Restoring...' },
        FAILED: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', label: 'Failed' },
    };

    return (
        <div className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl border border-gray-100">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                            <Camera size={20} className="text-indigo-500" />
                            Snapshots
                        </h2>
                        <p className="text-sm text-gray-500 mt-1 font-mono">{instance?.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCreate}
                            disabled={creating || instance?.status !== 'RUNNING'}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {creating ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                            {creating ? 'Creating...' : 'Create Snapshot'}
                        </button>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-gray-400">
                            <Loader2 size={24} className="animate-spin mr-2" /> Loading snapshots...
                        </div>
                    ) : backups.length === 0 ? (
                        <div className="text-center py-16">
                            <Camera size={40} className="mx-auto text-gray-300 mb-4" />
                            <h3 className="font-semibold text-gray-900 mb-1">No snapshots yet</h3>
                            <p className="text-sm text-gray-500">Create your first snapshot to enable "Time Machine" recovery</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {backups.map((b) => {
                                const cfg = statusConfig[b.status] || statusConfig.FAILED;
                                const StatusIcon = cfg.icon;
                                return (
                                    <div key={b.id} className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 hover:border-gray-200 transition-colors bg-white shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-9 h-9 rounded-xl ${cfg.bg} ${cfg.color} flex items-center justify-center`}>
                                                <StatusIcon size={16} className={b.status === 'CREATING' || b.status === 'RESTORING' ? 'animate-spin' : ''} />
                                            </div>
                                            <div>
                                                <div className="font-medium text-gray-900 text-sm">{b.name}</div>
                                                <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                                                    <Clock size={10} />
                                                    {new Date(b.created_at).toLocaleString()}
                                                    {b.size_mb > 0 && <span>• {b.size_mb} MB</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
                                                {cfg.label}
                                            </span>
                                            {b.status === 'READY' && (
                                                <button
                                                    onClick={() => handleRestore(b.id)}
                                                    disabled={restoringId === b.id}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 disabled:opacity-50"
                                                >
                                                    {restoringId === b.id ? (
                                                        <Loader2 size={12} className="animate-spin" />
                                                    ) : (
                                                        <RotateCcw size={12} />
                                                    )}
                                                    Restore
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
