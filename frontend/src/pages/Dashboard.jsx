import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import CreateInstanceModal from '../components/CreateInstanceModal';
import { Activity, Server, Cpu, LogOut, Plus, CloudRain, Clock, Trash2, PieChart, Menu, TerminalSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import TerminalModal from '../components/TerminalModal';

export default function Dashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [instances, setInstances] = useState([]);
    const [quotas, setQuotas] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('compute');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [terminalInstance, setTerminalInstance] = useState(null);

    const fetchData = async () => {
        try {
            const [instancesRes, quotasRes] = await Promise.all([
                api.get('/instances').catch(() => ({ data: [] })),
                api.get('/instances/quotas').catch(() => ({ data: null }))
            ]);
            setInstances(instancesRes.data || []);
            setQuotas(quotasRes.data);
        } catch (err) {
            console.error("Failed to load dashboard data:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // Poll every 5 seconds for status updates
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleDelete = async (instanceId) => {
        if (!window.confirm("Are you sure you want to delete this instance?")) return;
        try {
            await api.delete(`/instances/${instanceId}`);
            // Optimistic update to DELETING
            setInstances(prev => prev.map(inst =>
                inst.id === instanceId ? { ...inst, status: 'DELETING' } : inst
            ));
        } catch (err) {
            alert("Failed to delete instance: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    if (loading && !quotas && !instances.length) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
        </div>
    );

    return (
        <div className="min-h-screen flex flex-col md:flex-row bg-gray-50/50">
            {/* Mobile Header */}
            <div className="md:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
                <div className="flex items-center gap-3 font-semibold">
                    <div className="bg-black text-white p-1.5 rounded-lg">
                        <CloudRain size={16} />
                    </div>
                    <span className="text-sm">Cloud Platform</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setActiveTab('compute')}
                        className={`p-2 rounded-xl transition-colors ${activeTab === 'compute' ? 'bg-black text-white' : 'text-gray-400'}`}
                    >
                        <Server size={18} />
                    </button>
                    <button
                        onClick={() => setActiveTab('monitoring')}
                        className={`p-2 rounded-xl transition-colors ${activeTab === 'monitoring' ? 'bg-black text-white' : 'text-gray-400'}`}
                    >
                        <PieChart size={18} />
                    </button>
                    <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 rounded-xl transition-colors ml-1">
                        <LogOut size={18} />
                    </button>
                </div>
            </div>

            {/* Desktop Sidebar */}
            <div className="w-64 bg-white border-r border-gray-100 p-6 flex-col hidden md:flex sticky top-0 h-screen">
                <div className="flex items-center gap-3 font-semibold text-lg mb-10">
                    <div className="bg-black text-white p-2 rounded-xl">
                        <CloudRain size={20} />
                    </div>
                    <div className="flex flex-col">
                        <span>Cloud Platform</span>
                        <span className="text-xs font-normal text-gray-400">{user?.email}</span>
                    </div>
                </div>

                <nav className="flex-1 space-y-2 text-sm font-medium">
                    <button
                        onClick={() => setActiveTab('compute')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${activeTab === 'compute' ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                    >
                        <Server size={18} /> Compute
                    </button>
                    <button
                        onClick={() => setActiveTab('monitoring')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${activeTab === 'monitoring' ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                    >
                        <PieChart size={18} /> Monitoring
                    </button>
                </nav>

                <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-colors text-sm font-medium mt-auto">
                    <LogOut size={18} /> Sign Out
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-4 md:p-12 max-w-6xl mx-auto overflow-y-auto w-full">
                {activeTab === 'compute' ? (
                    <>
                        <div className="flex justify-between items-end mb-10">
                            <div>
                                <h1 className="text-3xl font-semibold tracking-tight mb-2">Compute Instances</h1>
                                <p className="text-gray-500">Manage your virtual infrastructure</p>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="apple-button flex items-center gap-2"
                                disabled={quotas?.used_instances >= quotas?.max_instances}
                            >
                                <Plus size={18} /> Deploy Instance
                            </button>
                        </div>

                        {/* Quotas / Usage Header */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                            <div className="apple-card p-5">
                                <div className="text-sm font-medium text-gray-500 mb-4 flex items-center gap-2">
                                    <Server size={16} /> Active Instances
                                </div>
                                <div className="text-3xl font-semibold">{quotas?.used_instances || 0} <span className="text-lg text-gray-400 font-normal">/ {quotas?.max_instances || 0}</span></div>
                                <div className="mt-4 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${quotas?.used_instances >= quotas?.max_instances ? 'bg-red-500' : 'bg-blue-500'}`}
                                        style={{ width: `${Math.min(((quotas?.used_instances || 0) / (quotas?.max_instances || 1)) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                            <div className="apple-card p-5">
                                <div className="text-sm font-medium text-gray-500 mb-4 flex items-center gap-2">
                                    <Cpu size={16} /> vCPU Usage
                                </div>
                                <div className="text-3xl font-semibold">{quotas?.used_vcpu || 0} <span className="text-lg text-gray-400 font-normal">/ {quotas?.max_vcpu || 0} Cores</span></div>
                                <div className="mt-4 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${quotas?.used_vcpu >= quotas?.max_vcpu ? 'bg-red-500' : 'bg-indigo-500'}`}
                                        style={{ width: `${Math.min(((quotas?.used_vcpu || 0) / (quotas?.max_vcpu || 1)) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                            <div className="apple-card p-5">
                                <div className="text-sm font-medium text-gray-500 mb-4 flex items-center gap-2">
                                    <Activity size={16} /> RAM Usage
                                </div>
                                <div className="text-3xl font-semibold">{((quotas?.used_ram || 0) / 1024).toFixed(1)} <span className="text-lg text-gray-400 font-normal">/ {((quotas?.max_ram_mb || 0) / 1024).toFixed(1)} GB</span></div>
                                <div className="mt-4 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${quotas?.used_ram >= quotas?.max_ram_mb ? 'bg-red-500' : 'bg-purple-500'}`}
                                        style={{ width: `${Math.min(((quotas?.used_ram || 0) / (quotas?.max_ram_mb || 1)) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Instance List */}
                        <div className="apple-card p-0 overflow-hidden overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50/50 text-gray-500 font-medium border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4">Name</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Specs</th>
                                        <th className="px-6 py-4">Tags</th>
                                        <th className="px-6 py-4">IP Address</th>
                                        <th className="px-6 py-4">Created</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {instances.map(inst => (
                                        <tr key={inst.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-5 font-medium text-gray-900">{inst.name}</td>
                                            <td className="px-6 py-5">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${inst.status === 'RUNNING' ? 'bg-green-50 text-green-700 border border-green-200/50' :
                                                    ['PROVISIONING', 'DELETING'].includes(inst.status) ? 'bg-amber-50 text-amber-700 border border-amber-200/50 animate-pulse' :
                                                        'bg-red-50 text-red-700 border border-red-200/50'
                                                    }`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${inst.status === 'RUNNING' ? 'bg-green-500' : ['PROVISIONING', 'DELETING'].includes(inst.status) ? 'bg-amber-500' : 'bg-red-500'}`} />
                                                    {inst.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 text-gray-500">
                                                {inst.vcpu} vCPU • {inst.ram_mb / 1024} GB • {inst.image}
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex flex-wrap gap-1">
                                                    {inst.tags ? inst.tags.split(',').map(tag => tag.trim()).filter(Boolean).map(tag => (
                                                        <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium border border-gray-200">
                                                            {tag}
                                                        </span>
                                                    )) : <span className="text-gray-400 text-xs italic">—</span>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 font-mono text-xs">
                                                {inst.ip_address && inst.ip_address.includes('|port:') ? (
                                                    <>
                                                        <a
                                                            href={`http://localhost:${inst.ip_address.split('|port:')[1]}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 underline font-semibold"
                                                        >
                                                            🌐 Open :{inst.ip_address.split('|port:')[1]}
                                                        </a>
                                                        <div className="text-gray-400 text-[10px] mt-0.5">{inst.ip_address.split('|')[0]}</div>
                                                    </>
                                                ) : (
                                                    <span className="text-gray-600">{inst.ip_address || '—'}</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-5 text-gray-500 flex items-center gap-2">
                                                <Clock size={14} className="text-gray-400" />
                                                {new Date(inst.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    {inst.status === 'RUNNING' && (
                                                        <button
                                                            onClick={() => setTerminalInstance(inst)}
                                                            className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                            title="Open Terminal"
                                                        >
                                                            <TerminalSquare size={16} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDelete(inst.id)}
                                                        disabled={inst.status === 'DELETING' || inst.status === 'DELETED'}
                                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Delete Instance"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {instances.length === 0 && (
                                        <tr>
                                            <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                                                No instances deployed yet. Click "Deploy Instance" to get started.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex justify-between items-end mb-10">
                            <div>
                                <h1 className="text-3xl font-semibold tracking-tight mb-2">Monitoring & Quotas</h1>
                                <p className="text-gray-500">Real-time resource allocation and consumption</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {/* Pie Chart: Instances */}
                            <div className="apple-card p-8 flex flex-col items-center justify-center text-center">
                                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                                    <Server size={24} />
                                </div>
                                <h3 className="text-lg font-semibold mb-1">Instances</h3>
                                <p className="text-gray-500 text-sm mb-6">Virtual machines running</p>
                                <div
                                    className="w-40 h-40 rounded-full flex items-center justify-center mb-6 shadow-sm border border-gray-100 relative"
                                    style={{
                                        background: `conic-gradient(#3b82f6 ${Math.min(((quotas?.used_instances || 0) / (quotas?.max_instances || 1)) * 100, 100)}%, #f3f4f6 0)`
                                    }}
                                >
                                    <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center flex-col shadow-inner">
                                        <span className="text-2xl font-bold text-gray-900">{quotas?.used_instances || 0}</span>
                                        <span className="text-xs text-gray-500 font-medium">/ {quotas?.max_instances || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Pie Chart: CPU */}
                            <div className="apple-card p-8 flex flex-col items-center justify-center text-center">
                                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                                    <Cpu size={24} />
                                </div>
                                <h3 className="text-lg font-semibold mb-1">Compute Cores</h3>
                                <p className="text-gray-500 text-sm mb-6">vCPU block allocation</p>
                                <div
                                    className="w-40 h-40 rounded-full flex items-center justify-center mb-6 shadow-sm border border-gray-100 relative"
                                    style={{
                                        background: `conic-gradient(#6366f1 ${Math.min(((quotas?.used_vcpu || 0) / (quotas?.max_vcpu || 1)) * 100, 100)}%, #f3f4f6 0)`
                                    }}
                                >
                                    <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center flex-col shadow-inner">
                                        <span className="text-2xl font-bold text-gray-900">{quotas?.used_vcpu || 0}</span>
                                        <span className="text-xs text-gray-500 font-medium">/ {quotas?.max_vcpu || 0} CPU</span>
                                    </div>
                                </div>
                            </div>

                            {/* Pie Chart: RAM */}
                            <div className="apple-card p-8 flex flex-col items-center justify-center text-center">
                                <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-6">
                                    <Activity size={24} />
                                </div>
                                <h3 className="text-lg font-semibold mb-1">Memory</h3>
                                <p className="text-gray-500 text-sm mb-6">RAM allocation in GB</p>
                                <div
                                    className="w-40 h-40 rounded-full flex items-center justify-center mb-6 shadow-sm border border-gray-100 relative"
                                    style={{
                                        background: `conic-gradient(#a855f7 ${Math.min(((quotas?.used_ram || 0) / (quotas?.max_ram_mb || 1)) * 100, 100)}%, #f3f4f6 0)`
                                    }}
                                >
                                    <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center flex-col shadow-inner">
                                        <span className="text-2xl font-bold text-gray-900">{((quotas?.used_ram || 0) / 1024).toFixed(1)}</span>
                                        <span className="text-xs text-gray-500 font-medium">/ {((quotas?.max_ram_mb || 1) / 1024).toFixed(1)} GB</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </>
                )}
            </div>

            <CreateInstanceModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                tenantId={user?.tenant_id}
                onCreated={() => fetchData()}
            />

            <TerminalModal
                isOpen={!!terminalInstance}
                onClose={() => setTerminalInstance(null)}
                instanceId={terminalInstance?.id}
                instanceName={terminalInstance?.name}
            />
        </div>
    );
}
