import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Users, Server, Cpu, LogOut, CloudRain, Activity, Edit2, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import EditQuotaModal from '../components/EditQuotaModal';

export default function AdminDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [tenants, setTenants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingTenant, setEditingTenant] = useState(null);

    const fetchData = async () => {
        try {
            const res = await api.get('/admin/tenants');
            setTenants(res.data);
        } catch (err) {
            console.error("Failed to load admin data:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleDeleteTenant = async (tenantId, tenantName) => {
        if (!window.confirm(`Are you sure you want to delete tenant "${tenantName}"? This will also delete all its instances and quotas.`)) return;
        try {
            await api.delete(`/admin/tenants/${tenantId}`);
            setTenants(prev => prev.filter(t => t.id !== tenantId));
        } catch (err) {
            alert("Failed to delete tenant: " + (err.response?.data?.detail || err.message));
        }
    };

    if (loading && tenants.length === 0) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
        </div>
    );

    return (
        <div className="min-h-screen flex flex-col md:flex-row bg-gray-50/50">
            {/* Mobile Header */}
            <div className="md:hidden bg-gray-900 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
                <div className="flex items-center gap-3 font-semibold text-white">
                    <div className="bg-white text-black p-1.5 rounded-lg">
                        <CloudRain size={16} />
                    </div>
                    <span className="text-sm">IaaS Admin</span>
                </div>
                <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-400 rounded-xl transition-colors">
                    <LogOut size={18} />
                </button>
            </div>

            {/* Desktop Sidebar */}
            <div className="w-64 bg-black border-r border-gray-900 p-6 flex-col hidden md:flex sticky top-0 h-screen text-gray-300">
                <div className="flex items-center gap-3 font-semibold text-lg mb-10 text-white">
                    <div className="bg-white text-black p-2 rounded-xl">
                        <CloudRain size={20} />
                    </div>
                    <div>
                        <div>IaaS Admin</div>
                        <div className="text-xs font-normal text-gray-500">{user?.email}</div>
                    </div>
                </div>

                <nav className="flex-1 space-y-2 text-sm font-medium">
                    <a href="#" className="flex items-center gap-3 px-4 py-3 bg-gray-800 text-white rounded-2xl">
                        <Users size={18} /> Tenants & Usage
                    </a>
                </nav>

                <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-red-500/20 rounded-2xl transition-colors text-sm font-medium mt-auto">
                    <LogOut size={18} /> Sign Out
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-4 md:p-12 overflow-y-auto">
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">System Administration</h1>
                        <p className="text-gray-500 text-sm md:text-base">View cross-tenant resource utilization globally</p>
                    </div>
                </div>

                <div className="grid gap-6">
                    {tenants.map(tenant => (
                        <div key={tenant.id} className="apple-card p-0 overflow-hidden border border-gray-200 shadow-sm">
                            <div className="bg-gray-50 px-4 md:px-6 py-4 border-b border-gray-200 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                        {tenant.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-semibold text-gray-900 truncate">{tenant.name}</h3>
                                        <div className="text-xs text-mono text-gray-400 truncate">ID: {tenant.id}</div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 md:gap-6">
                                    <div className="flex gap-4 md:gap-6 text-sm flex-wrap">
                                        <div className="text-right">
                                            <div className="text-gray-500 mb-1 flex items-center gap-1 justify-end text-xs"><Server size={12} /> Instances</div>
                                            <div className="font-medium text-gray-900">{tenant.instances_count} Active</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-gray-500 mb-1 flex items-center gap-1 justify-end text-xs"><Cpu size={12} /> vCPU</div>
                                            <div className="font-medium text-gray-900">{tenant.quota_usage.used_vcpu} / {tenant.quota_usage.max_vcpu}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-gray-500 mb-1 flex items-center gap-1 justify-end text-xs"><Activity size={12} /> RAM</div>
                                            <div className="font-medium text-gray-900">{tenant.quota_usage.used_ram / 1024} / {tenant.quota_usage.max_ram_mb / 1024} GB</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 ml-auto md:ml-4">
                                        <button
                                            onClick={() => setEditingTenant(tenant)}
                                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                            title="Edit Quotas"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteTenant(tenant.id, tenant.name)}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete Tenant"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="p-0 overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <tbody className="divide-y divide-gray-100">
                                        {tenant.instances.map(inst => (
                                            <tr key={inst.id} className="hover:bg-gray-50/20 transition-colors">
                                                <td className="px-4 md:px-6 py-3 font-medium text-gray-700 w-1/4">{inst.name}</td>
                                                <td className="px-4 md:px-6 py-3 w-1/4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${inst.status === 'RUNNING' ? 'bg-green-50 text-green-700' :
                                                        ['PROVISIONING', 'DELETING'].includes(inst.status) ? 'bg-amber-50 text-amber-700' :
                                                            'bg-red-50 text-red-700'
                                                        }`}>
                                                        {inst.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 md:px-6 py-3 text-gray-500 w-1/4 text-xs">
                                                    {inst.vcpu} vCores, {inst.ram_mb / 1024}GB RAM
                                                </td>
                                                <td className="px-4 md:px-6 py-3 font-mono text-gray-400 text-xs w-1/4 text-right">
                                                    {inst.ip_address || '—'}
                                                </td>
                                            </tr>
                                        ))}
                                        {tenant.instances.length === 0 && (
                                            <tr>
                                                <td colSpan="4" className="px-6 py-4 text-center text-gray-400 text-xs italic">
                                                    No active instances in this tenant
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                    {tenants.length === 0 && (
                        <div className="text-center p-12 text-gray-500 bg-white rounded-3xl border border-gray-100 shadow-sm">
                            No tenants found in the database.
                        </div>
                    )}
                </div>
            </div>

            <EditQuotaModal
                isOpen={!!editingTenant}
                onClose={() => setEditingTenant(null)}
                tenant={editingTenant}
                onUpdated={() => fetchData()}
            />
        </div>
    );
}
