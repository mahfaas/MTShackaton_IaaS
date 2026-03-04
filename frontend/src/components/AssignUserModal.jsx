import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { X } from 'lucide-react';

export default function AssignUserModal({ isOpen, onClose, user: selectedUser, tenants, onAssigned }) {
    const [selectedTenantId, setSelectedTenantId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && tenants.length > 0) {
            setSelectedTenantId(tenants[0].id);
        }
        setError('');
    }, [isOpen, tenants]);

    if (!isOpen || !selectedUser) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await api.post(`/admin/tenants/${selectedTenantId}/members`, {
                user_id: selectedUser.id
            });
            onAssigned?.();
            onClose();
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to assign user');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="apple-card w-full max-w-md p-0 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold">Assign User to Tenant</h2>
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
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">User</label>
                        <div className="apple-input bg-gray-50 text-gray-600 cursor-not-allowed">
                            {selectedUser.email}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign to Tenant</label>
                        <select
                            value={selectedTenantId}
                            onChange={(e) => setSelectedTenantId(e.target.value)}
                            className="apple-input"
                            required
                        >
                            {tenants.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>

                    {tenants.length === 0 && (
                        <div className="p-3 bg-amber-50 text-amber-700 rounded-xl text-sm border border-amber-100">
                            No tenants available. Create a tenant first.
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading || tenants.length === 0}
                            className="apple-button w-full py-3"
                        >
                            {loading ? 'Assigning...' : 'Assign User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
