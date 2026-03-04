import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Users, Server, Cpu, LogOut, CloudRain, Activity, Edit2, Trash2, Plus, UserPlus, Inbox, CheckCircle, XCircle, Clock, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend } from 'recharts';
import EditQuotaModal from '../components/EditQuotaModal';
import CreateTenantModal from '../components/CreateTenantModal';
import AssignUserModal from '../components/AssignUserModal';

export default function AdminDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [tenants, setTenants] = useState([]);
    const [users, setUsers] = useState([]);
    const [requests, setRequests] = useState([]);
    const [clusterStats, setClusterStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [editingTenant, setEditingTenant] = useState(null);
    const [showCreateTenant, setShowCreateTenant] = useState(false);
    const [assigningUser, setAssigningUser] = useState(null);

    const fetchData = async () => {
        try {
            const [tenantsRes, usersRes, requestsRes, statsRes] = await Promise.all([
                api.get('/admin/tenants').catch(() => ({ data: [] })),
                api.get('/admin/users').catch(() => ({ data: [] })),
                api.get('/admin/requests').catch(() => ({ data: [] })),
                api.get('/admin/cluster/stats').catch(() => ({ data: null }))
            ]);
            setTenants(tenantsRes.data);
            setUsers(usersRes.data);
            setRequests(requestsRes.data);
            setClusterStats(statsRes.data);
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
            fetchData();
        } catch (err) {
            alert("Failed to delete tenant: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleRemoveMember = async (tenantId, userId, email) => {
        if (!window.confirm(`Remove ${email} from this tenant?`)) return;
        try {
            await api.delete(`/admin/tenants/${tenantId}/members/${userId}`);
            fetchData();
        } catch (err) {
            alert("Failed: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleToggleOwner = async (tenantId, userId) => {
        try {
            await api.put(`/admin/tenants/${tenantId}/members/${userId}/set-owner`);
            fetchData();
        } catch (err) {
            alert("Failed to update role: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleResolveRequest = async (requestId, action, tenantId = null) => {
        // If approving without a selected tenant, prompt
        if (action === 'approve' && !tenantId && tenants.length > 0) {
            const tenantName = prompt(`Enter Tenant ID to assign user to.\nAvailable tenants:\n${tenants.map(t => `${t.name}: ${t.id}`).join('\n')}`);
            if (!tenantName) return;
            tenantId = tenantName;
        }

        const comment = action === 'reject' ? (prompt('Reason for rejection (optional):') || '') : '';

        try {
            await api.post(`/admin/requests/${requestId}/resolve`, {
                action,
                tenant_id: tenantId || undefined,
                comment
            });
            fetchData();
        } catch (err) {
            alert("Failed: " + (err.response?.data?.detail || err.message));
        }
    };

    const pendingRequests = requests.filter(r => r.status === 'PENDING');

    if (loading && tenants.length === 0) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
        </div>
    );

    const navItems = [
        { key: 'overview', icon: Activity, label: 'Overview' },
        { key: 'tenants', icon: Server, label: 'Tenants' },
        { key: 'users', icon: Users, label: 'Users' },
        { key: 'requests', icon: Inbox, label: 'Requests', badge: pendingRequests.length },
    ];

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
                <div className="flex items-center gap-1">
                    {navItems.map(item => (
                        <button
                            key={item.key}
                            onClick={() => setActiveTab(item.key)}
                            className={`p-2 rounded-xl transition-colors relative ${activeTab === item.key ? 'bg-white text-black' : 'text-gray-400'}`}
                        >
                            <item.icon size={18} />
                            {item.badge > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                                    {item.badge}
                                </span>
                            )}
                        </button>
                    ))}
                    <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-400 rounded-xl transition-colors ml-1">
                        <LogOut size={18} />
                    </button>
                </div>
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
                    {navItems.map(item => (
                        <button
                            key={item.key}
                            onClick={() => setActiveTab(item.key)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors relative ${activeTab === item.key ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                                }`}
                        >
                            <item.icon size={18} />
                            {item.label}
                            {item.badge > 0 && (
                                <span className="ml-auto w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                                    {item.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </nav>

                <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-red-500/20 rounded-2xl transition-colors text-sm font-medium mt-auto">
                    <LogOut size={18} /> Sign Out
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-4 md:p-12 overflow-y-auto">
                {/* ===== OVERVIEW TAB ===== */}
                {activeTab === 'overview' && (
                    <>
                        <div className="mb-8">
                            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Cluster Overview</h1>
                            <p className="text-gray-500 text-sm md:text-base">Global infrastructure health and resource distribution</p>
                        </div>

                        {/* Top Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 mb-8">
                            <div className="apple-card p-5 border border-blue-100 bg-gradient-to-br from-blue-50/50 to-white">
                                <div className="text-blue-600/80 mb-2 flex items-center gap-2 text-sm font-medium"><Server size={16} /> Total Tenants</div>
                                <div className="text-3xl font-bold text-gray-900">{tenants.length}</div>
                            </div>
                            <div className="apple-card p-5 border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white">
                                <div className="text-indigo-600/80 mb-2 flex items-center gap-2 text-sm font-medium"><Cpu size={16} /> Allocated vCPU</div>
                                <div className="text-3xl font-bold text-gray-900">
                                    {clusterStats?.tenant_distribution?.reduce((acc, t) => acc + t.used_vcpu, 0) || 0}
                                </div>
                            </div>
                            <div className="apple-card p-5 border border-purple-100 bg-gradient-to-br from-purple-50/50 to-white">
                                <div className="text-purple-600/80 mb-2 flex items-center gap-2 text-sm font-medium"><Activity size={16} /> Allocated RAM</div>
                                <div className="text-3xl font-bold text-gray-900">
                                    {((clusterStats?.tenant_distribution?.reduce((acc, t) => acc + t.used_ram_mb, 0) || 0) / 1024).toFixed(1)} <span className="text-lg font-medium text-gray-500">GB</span>
                                </div>
                            </div>
                            <div className="apple-card p-5 border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-white">
                                <div className="text-emerald-600/80 mb-2 flex items-center gap-2 text-sm font-medium"><CheckCircle size={16} /> Node Health</div>
                                <div className="text-3xl font-bold text-gray-900 flex items-baseline gap-2">
                                    <span>{clusterStats?.node_health ? 'OK' : 'Unknown'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                            {/* Stacked Bar Chart: Tenant Distribution */}
                            <div className="apple-card p-6 shadow-sm flex flex-col">
                                <h3 className="text-lg font-semibold text-gray-900 mb-1">Resource Distribution</h3>
                                <p className="text-xs text-gray-500 mb-6">vCPU and RAM usage per tenant</p>
                                <div className="flex-1 min-h-[300px]">
                                    {clusterStats?.tenant_distribution?.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={clusterStats.tenant_distribution} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                                <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                                                <YAxis yAxisId="left" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                                                <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                                                <RechartsTooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                                <Legend iconType="circle" />
                                                <Bar yAxisId="left" dataKey="used_vcpu" name="vCPU" stackId="a" fill="#6366f1" radius={[0, 0, 4, 4]} />
                                                <Bar yAxisId="right" dataKey="used_ram_mb" name="RAM (MB)" stackId="b" fill="#a855f7" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-400 text-sm">No tenant data available</div>
                                    )}
                                </div>
                            </div>

                            {/* Radar Chart: Node Health (Mocked partly) */}
                            <div className="apple-card p-6 shadow-sm flex flex-col">
                                <h3 className="text-lg font-semibold text-gray-900 mb-1">Physical Node Load</h3>
                                <p className="text-xs text-gray-500 mb-6">System resource utilization (Radar Profile)</p>
                                <div className="flex-1 min-h-[300px]">
                                    {clusterStats?.node_health ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                                                { subject: 'CPU', A: clusterStats.node_health.cpu_usage_percent || 0, fullMark: 100 },
                                                { subject: 'RAM', A: (clusterStats.node_health.ram_usage_mb / clusterStats.node_health.ram_total_mb) * 100 || 0, fullMark: 100 },
                                                { subject: 'Disk I/O', A: clusterStats.node_health.disk_usage_percent || 0, fullMark: 100 },
                                                { subject: 'Network', A: 35 /* Mock */, fullMark: 100 },
                                                { subject: 'Docker', A: clusterStats.node_health.containers_running * 5 || 0, fullMark: 100 },
                                            ]}>
                                                <PolarGrid stroke="#e5e7eb" />
                                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 12 }} />
                                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                                <Radar name="Node 1" dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.4} />
                                                <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            </RadarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-400 text-sm">No node health data</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Pie Chart: Instances Statuses */}
                        <div className="apple-card p-6 shadow-sm text-center max-w-2xl mx-auto">
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">Global Instance Status</h3>
                            <p className="text-xs text-gray-500 mb-6">Proportion of VM states across all tenants</p>
                            <div className="h-64 flex items-center justify-center">
                                {clusterStats?.instance_statuses && Object.keys(clusterStats.instance_statuses).length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={Object.entries(clusterStats.instance_statuses).map(([name, value]) => ({ name, value })).filter(d => d.value > 0)}
                                                cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value"
                                            >
                                                {
                                                    Object.entries(clusterStats.instance_statuses).filter(([_, v]) => v > 0).map(([name, _], index) => {
                                                        const colors = {
                                                            'RUNNING': '#10b981',
                                                            'STOPPED': '#9ca3af',
                                                            'FAILED': '#ef4444',
                                                            'PROVISIONING': '#f59e0b',
                                                            'DELETING': '#f97316'
                                                        };
                                                        return <Cell key={`cell-${index}`} fill={colors[name] || '#3b82f6'} />;
                                                    })
                                                }
                                            </Pie>
                                            <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            <Legend iconType="circle" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <span className="text-gray-400 text-sm">No instances deployed in the cluster</span>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* ===== TENANTS TAB ===== */}
                {activeTab === 'tenants' && (
                    <>
                        <div className="flex justify-between items-end mb-8">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Tenants</h1>
                                <p className="text-gray-500 text-sm md:text-base">Manage tenant organizations and resource quotas</p>
                            </div>
                            <button
                                onClick={() => setShowCreateTenant(true)}
                                className="apple-button flex items-center gap-2"
                            >
                                <Plus size={18} /> Create Tenant
                            </button>
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
                                                <div className="text-xs text-gray-400 flex items-center gap-2">
                                                    <span className="font-mono truncate">ID: {tenant.id}</span>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-1">
                                                        <Users size={10} /> {tenant.members?.length || 0} members
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 md:gap-6">
                                            <div className="flex gap-4 md:gap-6 text-sm flex-wrap">
                                                <div className="text-right">
                                                    <div className="text-gray-500 mb-1 flex items-center gap-1 justify-end text-xs"><Server size={12} /> Instances</div>
                                                    <div className="font-medium text-gray-900">{tenant.quota_usage?.used_instances || 0} / {tenant.quota_usage?.max_instances || 0}</div>
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

                                    {/* Members section */}
                                    {tenant.members && tenant.members.length > 0 && (
                                        <div className="px-4 md:px-6 py-3 bg-blue-50/30 border-b border-gray-100">
                                            <div className="text-xs text-gray-500 font-medium mb-2">Members</div>
                                            <div className="flex flex-wrap gap-2">
                                                {tenant.members.map(m => (
                                                    <span key={m.user_id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full text-xs font-medium text-gray-700 border border-gray-200 shadow-sm">
                                                        <Users size={12} className="text-gray-400" />
                                                        {m.email}
                                                        <button
                                                            onClick={() => handleToggleOwner(tenant.id, m.user_id)}
                                                            className={`ml-1 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-colors border ${m.is_owner ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-gray-50 text-gray-400 hover:text-amber-600 hover:border-amber-200 border-transparent'}`}
                                                            title={m.is_owner ? "Remove owner status" : "Make owner"}
                                                        >
                                                            <Star size={10} className={m.is_owner ? "fill-amber-500" : ""} />
                                                            {m.is_owner ? 'Owner' : 'Set Owner'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleRemoveMember(tenant.id, m.user_id, m.email)}
                                                            className="text-gray-300 hover:text-red-500 transition-colors ml-1"
                                                            title="Remove from tenant"
                                                        >
                                                            <XCircle size={12} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

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
                                    <div className="text-lg font-medium mb-2">No tenants yet</div>
                                    <p className="text-sm mb-4">Create your first tenant to start managing cloud resources</p>
                                    <button onClick={() => setShowCreateTenant(true)} className="apple-button flex items-center gap-2 mx-auto">
                                        <Plus size={16} /> Create Tenant
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* ===== USERS TAB ===== */}
                {activeTab === 'users' && (
                    <>
                        <div className="flex justify-between items-end mb-8">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Users</h1>
                                <p className="text-gray-500 text-sm md:text-base">Manage platform users and tenant assignments</p>
                            </div>
                        </div>

                        <div className="apple-card p-0 overflow-hidden overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50/50 text-gray-500 font-medium border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4">Email</th>
                                        <th className="px-6 py-4">Role</th>
                                        <th className="px-6 py-4">Tenant</th>
                                        <th className="px-6 py-4">Registered</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {users.map(u => (
                                        <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-gray-900">{u.email}</td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${u.role === 'ADMIN' ? 'bg-purple-50 text-purple-700 border border-purple-200/50' : 'bg-gray-100 text-gray-600 border border-gray-200/50'
                                                    }`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {u.tenant_name ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-200/50">
                                                        <Server size={12} /> {u.tenant_name}
                                                    </span>
                                                ) : (
                                                    <span className="text-amber-600 text-xs font-medium bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200/50">
                                                        Unassigned
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 text-xs">
                                                {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {u.role !== 'ADMIN' && (
                                                    <button
                                                        onClick={() => setAssigningUser(u)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    >
                                                        <UserPlus size={14} />
                                                        {u.tenant_id ? 'Reassign' : 'Assign'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* ===== REQUESTS TAB ===== */}
                {activeTab === 'requests' && (
                    <>
                        <div className="flex justify-between items-end mb-8">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Access Requests</h1>
                                <p className="text-gray-500 text-sm md:text-base">Review and manage tenant access requests from users</p>
                            </div>
                            {pendingRequests.length > 0 && (
                                <div className="bg-amber-50 text-amber-700 px-4 py-2 rounded-2xl text-sm font-medium border border-amber-200/50">
                                    {pendingRequests.length} pending
                                </div>
                            )}
                        </div>

                        <div className="grid gap-4">
                            {requests.length === 0 ? (
                                <div className="text-center p-12 text-gray-500 bg-white rounded-3xl border border-gray-100 shadow-sm">
                                    <Inbox size={32} className="mx-auto mb-3 text-gray-300" />
                                    <div className="text-lg font-medium mb-1">No requests yet</div>
                                    <p className="text-sm">When users request access to cloud resources, they'll appear here</p>
                                </div>
                            ) : (
                                requests.map(req => (
                                    <div key={req.id} className={`apple-card p-5 border ${req.status === 'PENDING' ? 'border-amber-200 bg-amber-50/30' :
                                        req.status === 'APPROVED' ? 'border-green-200 bg-green-50/20' :
                                            'border-red-200 bg-red-50/20'
                                        }`}>
                                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                            <div className="flex items-start gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${req.status === 'PENDING' ? 'bg-amber-100 text-amber-600' :
                                                    req.status === 'APPROVED' ? 'bg-green-100 text-green-600' :
                                                        'bg-red-100 text-red-600'
                                                    }`}>
                                                    {req.status === 'PENDING' ? <Clock size={18} /> :
                                                        req.status === 'APPROVED' ? <CheckCircle size={18} /> :
                                                            <XCircle size={18} />}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-gray-900 text-sm">{req.user_email}</div>
                                                    <div className="text-xs text-gray-500 mt-0.5">
                                                        {new Date(req.created_at).toLocaleString()}
                                                        {req.tenant_name && <span> • Requested: {req.tenant_name}</span>}
                                                    </div>
                                                    {req.message && (
                                                        <div className="mt-2 text-sm text-gray-600 bg-white/60 rounded-xl p-3 border border-gray-100">
                                                            "{req.message}"
                                                        </div>
                                                    )}
                                                    {req.status !== 'PENDING' && req.admin_comment && (
                                                        <div className="mt-2 text-xs text-gray-500 italic">
                                                            Admin: "{req.admin_comment}"
                                                        </div>
                                                    )}
                                                    {req.status !== 'PENDING' && (
                                                        <div className={`mt-1 text-xs font-medium ${req.status === 'APPROVED' ? 'text-green-600' : 'text-red-600'}`}>
                                                            {req.status} {req.resolved_at && `• ${new Date(req.resolved_at).toLocaleString()}`}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {req.status === 'PENDING' && (
                                                <div className="flex items-center gap-2 md:flex-shrink-0">
                                                    {/* Approve with tenant selector */}
                                                    <div className="flex items-center gap-2 bg-white rounded-2xl p-1.5 border border-gray-200 shadow-sm">
                                                        <select
                                                            id={`tenant-select-${req.id}`}
                                                            className="text-xs border-0 bg-transparent pr-6 pl-2 py-1.5 text-gray-700 focus:outline-none"
                                                            defaultValue={tenants[0]?.id || ''}
                                                        >
                                                            {tenants.map(t => (
                                                                <option key={t.id} value={t.id}>{t.name}</option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            onClick={() => {
                                                                const sel = document.getElementById(`tenant-select-${req.id}`);
                                                                handleResolveRequest(req.id, 'approve', sel?.value);
                                                            }}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-xl text-xs font-medium hover:bg-green-700 transition-colors"
                                                        >
                                                            <CheckCircle size={13} /> Approve
                                                        </button>
                                                    </div>
                                                    <button
                                                        onClick={() => handleResolveRequest(req.id, 'reject')}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 rounded-xl text-xs font-medium hover:bg-red-50 border border-red-200 transition-colors"
                                                    >
                                                        <XCircle size={13} /> Reject
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Modals */}
            <EditQuotaModal
                isOpen={!!editingTenant}
                onClose={() => setEditingTenant(null)}
                tenant={editingTenant}
                onUpdated={() => fetchData()}
            />
            <CreateTenantModal
                isOpen={showCreateTenant}
                onClose={() => setShowCreateTenant(false)}
                onCreated={() => fetchData()}
            />
            <AssignUserModal
                isOpen={!!assigningUser}
                onClose={() => setAssigningUser(null)}
                user={assigningUser}
                tenants={tenants}
                onAssigned={() => fetchData()}
            />
        </div>
    );
}
