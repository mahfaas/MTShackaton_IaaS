import { useState } from 'react';
import { api } from '../lib/api';
import { X } from 'lucide-react';

export default function CreateTenantModal({ isOpen, onClose, onCreated }) {
    const [name, setName] = useState('');
    const [maxVcpu, setMaxVcpu] = useState(8);
    const [maxRam, setMaxRam] = useState(16384);
    const [maxInstances, setMaxInstances] = useState(5);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await api.post('/admin/tenants', {
                name,
                max_vcpu: maxVcpu,
                max_ram_mb: maxRam,
                max_instances: maxInstances,
            });
            setName('');
            setMaxVcpu(8);
            setMaxRam(16384);
            setMaxInstances(5);
            onCreated?.();
            onClose();
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create tenant');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="apple-card w-full max-w-lg p-0 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold">Create New Tenant</h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {error && (
                    <div className="mx-6 mt-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Tenant Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="apple-input"
                            placeholder="e.g. Acme Corporation"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Max vCPU</label>
                            <input
                                type="number"
                                value={maxVcpu}
                                onChange={(e) => setMaxVcpu(parseInt(e.target.value))}
                                className="apple-input"
                                min="1"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Max RAM (MB)</label>
                            <input
                                type="number"
                                value={maxRam}
                                onChange={(e) => setMaxRam(parseInt(e.target.value))}
                                className="apple-input"
                                min="512"
                                step="512"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Instances</label>
                            <input
                                type="number"
                                value={maxInstances}
                                onChange={(e) => setMaxInstances(parseInt(e.target.value))}
                                className="apple-input"
                                min="1"
                                required
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="apple-button w-full py-3"
                        >
                            {loading ? 'Creating...' : 'Create Tenant'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
