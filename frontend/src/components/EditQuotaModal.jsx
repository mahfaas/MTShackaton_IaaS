import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { X, Cpu, HardDrive, Server } from 'lucide-react';

export default function EditQuotaModal({ isOpen, onClose, tenant, onUpdated }) {
    const [vcpu, setVcpu] = useState(0);
    const [ram, setRam] = useState(0);
    const [instances, setInstances] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (tenant && tenant.quota_usage) {
            setVcpu(tenant.quota_usage.max_vcpu || 4);
            setRam(tenant.quota_usage.max_ram_mb || 8192);
            setInstances(tenant.quota_usage.max_instances || 2);
        }
    }, [tenant]);

    if (!isOpen || !tenant) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await api.put(`/admin/tenants/${tenant.id}/quotas`, {
                max_vcpu: parseInt(vcpu),
                max_ram_mb: parseInt(ram),
                max_instances: parseInt(instances)
            });
            onUpdated();
            onClose();
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update quotas');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="apple-card w-full max-w-sm relative animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-semibold mb-6 flex items-center gap-3">
                    <Server className="text-indigo-500" />
                    Edit Quotas
                </h2>
                <p className="text-sm text-gray-500 mb-6 font-medium">
                    {tenant.name}
                </p>

                {error && (
                    <div className="mb-6 p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 ml-1 flex items-center gap-2">
                            <Server size={16} className="text-gray-400" /> Max Instances
                        </label>
                        <input
                            type="number"
                            required
                            min="1"
                            value={instances}
                            onChange={(e) => setInstances(e.target.value)}
                            className="apple-input"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 ml-1 flex items-center gap-2">
                            <Cpu size={16} className="text-gray-400" /> Max vCPUs
                        </label>
                        <input
                            type="number"
                            required
                            min="1"
                            value={vcpu}
                            onChange={(e) => setVcpu(e.target.value)}
                            className="apple-input"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 ml-1 flex items-center gap-2">
                            <HardDrive size={16} className="text-gray-400" /> Max RAM (MB)
                        </label>
                        <input
                            type="number"
                            required
                            min="512"
                            step="512"
                            value={ram}
                            onChange={(e) => setRam(e.target.value)}
                            className="apple-input"
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="apple-button-secondary"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="apple-button min-w-[120px]"
                        >
                            {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
