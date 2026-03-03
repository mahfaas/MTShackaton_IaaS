import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { X, Server, Cpu, HardDrive } from 'lucide-react';

export default function CreateInstanceModal({ isOpen, onClose, tenantId, onCreated }) {
    const [name, setName] = useState('');
    const [vcpu, setVcpu] = useState(1);
    const [ram, setRam] = useState(1024);
    const [image, setImage] = useState('ubuntu:22.04');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await api.post('/instances', {
                tenant_id: tenantId,
                name,
                vcpu: parseInt(vcpu),
                ram_mb: parseInt(ram),
                image
            });
            onCreated();
            onClose();
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create instance');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="apple-card w-full max-w-lg relative animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-semibold mb-6 flex items-center gap-3">
                    <Server className="text-blue-500" />
                    Deploy New Instance
                </h2>

                {error && (
                    <div className="mb-6 p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">Instance Name</label>
                        <input
                            type="text"
                            required
                            placeholder="web-server-01"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="apple-input"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 ml-1 flex items-center gap-2">
                                <Cpu size={16} className="text-gray-400" /> vCPUs
                            </label>
                            <select
                                value={vcpu}
                                onChange={(e) => setVcpu(e.target.value)}
                                className="apple-input bg-white"
                            >
                                <option value={1}>1 Core</option>
                                <option value={2}>2 Cores</option>
                                <option value={4}>4 Cores</option>
                                <option value={8}>8 Cores</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 ml-1 flex items-center gap-2">
                                <HardDrive size={16} className="text-gray-400" /> RAM
                            </label>
                            <select
                                value={ram}
                                onChange={(e) => setRam(e.target.value)}
                                className="apple-input bg-white"
                            >
                                <option value={512}>512 MB</option>
                                <option value={1024}>1 GB</option>
                                <option value={2048}>2 GB</option>
                                <option value={4096}>4 GB</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">OS Image</label>
                        <div className="grid grid-cols-2 gap-3">
                            {['ubuntu:22.04', 'alpine:3.18'].map(img => (
                                <button
                                    key={img}
                                    type="button"
                                    onClick={() => setImage(img)}
                                    className={`p-4 rounded-2xl border text-left transition-all ${image === img
                                            ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500'
                                            : 'border-gray-200 hover:border-gray-300 bg-white'
                                        }`}
                                >
                                    <div className="font-medium text-gray-900">{img.split(':')[0].toUpperCase()}</div>
                                    <div className="text-xs text-gray-500 mt-1">{img.split(':')[1]}</div>
                                </button>
                            ))}
                        </div>
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
                            {loading ? 'Deploying...' : 'Deploy'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
