import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Users, Server, Cpu, LogOut, Activity, Edit2, Trash2, Plus, UserPlus, Inbox, CheckCircle, XCircle, Clock, Star, Search, Wallet, TrendingUp, DollarSign, Shield, StopCircle, Phone, Mail, MapPin, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, AreaChart, Area } from 'recharts';
import EditQuotaModal from '../components/EditQuotaModal';
import CreateTenantModal from '../components/CreateTenantModal';
import AssignUserModal from '../components/AssignUserModal';

const MTS_RED = '#E30611';
const MTS_RED_LIGHT = '#fef2f2';

export default function AdminDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [tenants, setTenants] = useState([]);
    const [users, setUsers] = useState([]);
    const [requests, setRequests] = useState([]);
    const [clusterStats, setClusterStats] = useState(null);
    const [clusterTimeline, setClusterTimeline] = useState([]);
    const [heatmapData, setHeatmapData] = useState({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [editingTenant, setEditingTenant] = useState(null);
    const [showCreateTenant, setShowCreateTenant] = useState(false);
    const [assigningUser, setAssigningUser] = useState(null);
    const [tenantSearches, setTenantSearches] = useState({});

    // Billing state
    const [adminBilling, setAdminBilling] = useState(null);
    const [billingLoading, setBillingLoading] = useState(false);

    // Bulk action state
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkImageFilter, setBulkImageFilter] = useState('');

    const handleBulkAction = async (action, tenantId = null, imageFilter = null) => {
        const messages = {
            stop_all: 'Остановить ВСЕ запущенные ВМ на платформе?',
            stop_tenant: 'Остановить все ВМ в этом тенанте?',
            delete_by_image: `Удалить все ВМ с образом "${imageFilter}"?`,
        };
        if (!window.confirm(messages[action] || 'Выполнить действие?')) return;
        setBulkLoading(true);
        try {
            const res = await api.post('/admin/bulk-action', {
                action,
                tenant_id: tenantId || undefined,
                image_filter: imageFilter || undefined,
            });
            alert(`✅ ${res.data.message}`);
            fetchData();
        } catch (err) {
            alert('❌ Ошибка: ' + (err.response?.data?.detail || err.message));
        } finally {
            setBulkLoading(false);
        }
    };

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

    const fetchBilling = async () => {
        setBillingLoading(true);
        try {
            const res = await api.get('/billing/admin');
            setAdminBilling(res.data);
        } catch (err) {
            console.error("Failed to load admin billing:", err);
        } finally {
            setBillingLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        api.get('/admin/activity/heatmap').then(res => setHeatmapData(res.data || {})).catch(() => { });
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (activeTab === 'billing') {
            fetchBilling();
        }
    }, [activeTab]);

    // Cluster timeline polling
    useEffect(() => {
        if (activeTab !== 'overview') return;
        const poll = async () => {
            try {
                const res = await api.get('/admin/cluster/history');
                const d = res.data;
                const point = {
                    time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    cpu: d.total_cpu_percent,
                    ram: d.total_ram_mb,
                    nodeCpu: d.node_cpu,
                    nodeRam: d.node_ram_percent
                };
                setClusterTimeline(prev => {
                    const next = [...prev, point];
                    if (next.length > 60) next.shift();
                    return next;
                });
            } catch (e) { }
        };
        poll();
        const iv = setInterval(poll, 5000);
        return () => clearInterval(iv);
    }, [activeTab]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleDeleteTenant = async (tenantId, tenantName) => {
        if (!window.confirm(`Вы уверены, что хотите удалить тенант "${tenantName}"? Это также удалит все его инстансы и квоты.`)) return;
        try {
            await api.delete(`/admin/tenants/${tenantId}`);
            setTenants(prev => prev.filter(t => t.id !== tenantId));
            fetchData();
        } catch (err) {
            alert("Failed to delete tenant: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleRemoveMember = async (tenantId, userId, email) => {
        if (!window.confirm(`Удалить ${email} из этого тенанта?`)) return;
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
        if (action === 'approve' && !tenantId && tenants.length > 0) {
            const tenantName = prompt(`Введите ID тенанта для назначения пользователя.\nДоступные тенанты:\n${tenants.map(t => `${t.name}: ${t.id}`).join('\n')}`);
            if (!tenantName) return;
            tenantId = tenantName;
        }

        const comment = action === 'reject' ? (prompt('Причина отклонения (необязательно):') || '') : '';

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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: MTS_RED }}></div>
        </div>
    );

    const navItems = [
        { key: 'overview', icon: Activity, label: 'Обзор' },
        { key: 'tenants', icon: Server, label: 'Тенанты' },
        { key: 'users', icon: Users, label: 'Пользователи' },
        { key: 'billing', icon: Wallet, label: 'Биллинг' },
        { key: 'requests', icon: Inbox, label: 'Запросы', badge: pendingRequests.length },
    ];

    return (
        <div className="min-h-screen flex flex-col md:flex-row bg-gray-50/50">
            {/* Mobile Header */}
            <div className="md:hidden px-4 py-3 flex items-center justify-between sticky top-0 z-40" style={{ backgroundColor: '#1a1a1a' }}>
                <div className="flex items-center gap-3 font-semibold text-white">
                    <div className="bg-white rounded-xl p-1 flex-shrink-0">
                        <img src="/logo.png" alt="Тучка МТС" className="h-6 w-auto object-contain" />
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {navItems.map(item => (
                        <button
                            key={item.key}
                            onClick={() => setActiveTab(item.key)}
                            className={`p-2 rounded-xl transition-colors relative ${activeTab === item.key ? 'text-white' : 'text-gray-400'}`}
                            style={activeTab === item.key ? { backgroundColor: MTS_RED } : {}}
                        >
                            <item.icon size={18} />
                            {item.badge > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 text-white text-[10px] rounded-full flex items-center justify-center font-bold" style={{ backgroundColor: MTS_RED }}>
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
            <div className="w-64 border-r border-gray-900 p-6 flex-col hidden md:flex sticky top-0 h-screen text-gray-300" style={{ backgroundColor: '#1a1a1a' }}>
                <div className="flex items-center gap-3 font-semibold text-lg mb-10 text-white">
                    <div className="bg-white rounded-2xl p-1.5 flex-shrink-0">
                        <img src="/logo.png" alt="Тучка МТС" className="h-8 w-auto object-contain" />
                    </div>
                    <div>
                        <div className="text-sm">Админ-панель</div>
                        <div className="text-xs font-normal text-gray-500">{user?.email}</div>
                    </div>
                </div>

                <nav className="flex-1 space-y-2 text-sm font-medium">
                    {navItems.map(item => (
                        <button
                            key={item.key}
                            onClick={() => setActiveTab(item.key)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors relative ${activeTab === item.key ? 'text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                                }`}
                            style={activeTab === item.key ? { backgroundColor: MTS_RED } : {}}
                        >
                            <item.icon size={18} />
                            {item.label}
                            {item.badge > 0 && (
                                <span className="ml-auto w-5 h-5 bg-white text-[10px] rounded-full flex items-center justify-center font-bold" style={{ color: MTS_RED }}>
                                    {item.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </nav>

                <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-red-500/20 rounded-2xl transition-colors text-sm font-medium mt-auto">
                    <LogOut size={18} /> Выйти
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-4 md:p-12 overflow-y-auto">
                {/* ===== OVERVIEW TAB ===== */}
                {activeTab === 'overview' && (
                    <>
                        <div className="mb-8">
                            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Обзор кластера</h1>
                            <p className="text-gray-500 text-sm md:text-base">Состояние инфраструктуры и распределение ресурсов</p>
                        </div>

                        {/* Top Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 mb-8">
                            <div className="apple-card p-5 border border-red-100 bg-gradient-to-br from-red-50/50 to-white">
                                <div className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: MTS_RED }}><Server size={16} /> Всего тенантов</div>
                                <div className="text-3xl font-bold text-gray-900">{tenants.length}</div>
                            </div>
                            <div className="apple-card p-5 border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white">
                                <div className="text-indigo-600/80 mb-2 flex items-center gap-2 text-sm font-medium"><Cpu size={16} /> Выделено vCPU</div>
                                <div className="text-3xl font-bold text-gray-900">
                                    {clusterStats?.tenant_distribution?.reduce((acc, t) => acc + t.used_vcpu, 0) || 0}
                                </div>
                            </div>
                            <div className="apple-card p-5 border border-purple-100 bg-gradient-to-br from-purple-50/50 to-white">
                                <div className="text-purple-600/80 mb-2 flex items-center gap-2 text-sm font-medium"><Activity size={16} /> Выделено RAM</div>
                                <div className="text-3xl font-bold text-gray-900">
                                    {((clusterStats?.tenant_distribution?.reduce((acc, t) => acc + t.used_ram_mb, 0) || 0) / 1024).toFixed(1)} <span className="text-lg font-medium text-gray-500">GB</span>
                                </div>
                            </div>
                            <div className="apple-card p-5 border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-white">
                                <div className="text-emerald-600/80 mb-2 flex items-center gap-2 text-sm font-medium"><CheckCircle size={16} /> Состояние ноды</div>
                                <div className="text-3xl font-bold text-gray-900 flex items-baseline gap-2">
                                    <span>{clusterStats?.node_health ? 'OK' : 'Неизвестно'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                            {/* Stacked Bar Chart: Tenant Distribution */}
                            <div className="apple-card p-6 shadow-sm flex flex-col">
                                <h3 className="text-lg font-semibold text-gray-900 mb-1">Распределение ресурсов</h3>
                                <p className="text-xs text-gray-500 mb-6">Использование vCPU и RAM по тенантам</p>
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
                                                <Bar yAxisId="left" dataKey="used_vcpu" name="vCPU" stackId="a" fill={MTS_RED} radius={[0, 0, 4, 4]} />
                                                <Bar yAxisId="right" dataKey="used_ram_mb" name="RAM (MB)" stackId="b" fill="#a855f7" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-400 text-sm">Нет данных по тенантам</div>
                                    )}
                                </div>
                            </div>

                            {/* Radar Chart: Node Health */}
                            <div className="apple-card p-6 shadow-sm flex flex-col">
                                <h3 className="text-lg font-semibold text-gray-900 mb-1">Нагрузка физической ноды</h3>
                                <p className="text-xs text-gray-500 mb-6">Утилизация системных ресурсов (Радар)</p>
                                <div className="flex-1 min-h-[300px]">
                                    {clusterStats?.node_health ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                                                { subject: 'CPU', A: clusterStats.node_health.cpu_usage_percent || 0, fullMark: 100 },
                                                { subject: 'RAM', A: (clusterStats.node_health.ram_usage_mb / clusterStats.node_health.ram_total_mb) * 100 || 0, fullMark: 100 },
                                                { subject: 'Disk I/O', A: clusterStats.node_health.disk_usage_percent || 0, fullMark: 100 },
                                                { subject: 'Containers', A: Math.min(clusterStats.node_health.containers_running * 10, 100) || 0, fullMark: 100 },
                                                { subject: 'Docker', A: clusterStats.node_health.containers_running * 5 || 0, fullMark: 100 },
                                            ]}>
                                                <PolarGrid stroke="#e5e7eb" />
                                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 12 }} />
                                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                                <Radar name="Node 1" dataKey="A" stroke={MTS_RED} fill={MTS_RED} fillOpacity={0.3} />
                                                <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            </RadarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-400 text-sm">Нет данных о состоянии ноды</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Pie Chart: Instances Statuses */}
                        <div className="apple-card p-6 shadow-sm text-center max-w-2xl mx-auto">
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">Статусы инстансов</h3>
                            <p className="text-xs text-gray-500 mb-6">Распределение состояний ВМ по всем тенантам</p>
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
                                                        return <Cell key={`cell-${index}`} fill={colors[name] || MTS_RED} />;
                                                    })
                                                }
                                            </Pie>
                                            <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            <Legend iconType="circle" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <span className="text-gray-400 text-sm">Нет развёрнутых инстансов в кластере</span>
                                )}
                            </div>
                        </div>

                        {/* Cluster Resource Timeline */}
                        <div className="apple-card p-6 shadow-sm mb-8 mt-8">
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">Нагрузка кластера</h3>
                            <p className="text-xs text-gray-500 mb-6">Использование ресурсов в реальном времени (обновление каждые 5с)</p>
                            <div className="h-72">
                                {clusterTimeline.length > 1 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={clusterTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="clCpu" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={MTS_RED} stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor={MTS_RED} stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="clRam" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                            <XAxis dataKey="time" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} minTickGap={30} />
                                            <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                                            <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0/0.1)' }} />
                                            <Legend iconType="circle" />
                                            <Area type="monotone" dataKey="nodeCpu" name="Node CPU %" stroke={MTS_RED} strokeWidth={2} fillOpacity={1} fill="url(#clCpu)" isAnimationActive={false} />
                                            <Area type="monotone" dataKey="nodeRam" name="Node RAM %" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#clRam)" isAnimationActive={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-gray-400 text-sm">Сбор данных...</div>
                                )}
                            </div>
                        </div>

                        {/* Bulk Actions Panel */}
                        <div className="apple-card p-6 shadow-sm mb-8">
                            <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2"><Shield size={20} style={{ color: MTS_RED }} /> Управление и безопасность</h3>
                            <p className="text-xs text-gray-500 mb-6">Массовые операции для управления инфраструктурой</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <button
                                    onClick={() => handleBulkAction('stop_all')}
                                    disabled={bulkLoading}
                                    className="flex items-center gap-3 p-4 rounded-2xl border border-red-200 bg-red-50/50 hover:bg-red-100 transition-colors text-left disabled:opacity-50"
                                >
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: MTS_RED }}>
                                        <StopCircle size={20} className="text-white" />
                                    </div>
                                    <div>
                                        <div className="font-semibold text-gray-900 text-sm">Остановить все ВМ</div>
                                        <div className="text-xs text-gray-500">Экстренная остановка всех инстансов</div>
                                    </div>
                                </button>

                                <div className="flex items-center gap-2 p-4 rounded-2xl border border-orange-200 bg-orange-50/50">
                                    <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
                                        <AlertTriangle size={20} className="text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-gray-900 text-sm mb-1">Удалить по образу</div>
                                        <div className="flex gap-1">
                                            <input
                                                type="text"
                                                placeholder="ubuntu"
                                                value={bulkImageFilter}
                                                onChange={(e) => setBulkImageFilter(e.target.value)}
                                                className="text-xs border border-gray-200 rounded-lg px-2 py-1 w-20 focus:outline-none"
                                            />
                                            <button
                                                onClick={() => bulkImageFilter && handleBulkAction('delete_by_image', null, bulkImageFilter)}
                                                disabled={bulkLoading || !bulkImageFilter}
                                                className="text-xs px-2 py-1 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 p-4 rounded-2xl border border-blue-200 bg-blue-50/50">
                                    <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
                                        <Server size={20} className="text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-gray-900 text-sm mb-1">Стоп тенант</div>
                                        <div className="flex gap-1">
                                            <select
                                                id="bulk-tenant-select"
                                                className="text-xs border border-gray-200 rounded-lg px-2 py-1 w-24 focus:outline-none"
                                            >
                                                {tenants.map(t => (
                                                    <option key={t.id} value={t.id}>{t.name}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => {
                                                    const sel = document.getElementById('bulk-tenant-select');
                                                    if (sel?.value) handleBulkAction('stop_tenant', sel.value);
                                                }}
                                                disabled={bulkLoading}
                                                className="text-xs px-2 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                                            >
                                                Стоп
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* GitHub-style Heatmap */}
                        <div className="apple-card p-6 shadow-sm">
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">Активность запуска ВМ</h3>
                            <p className="text-xs text-gray-500 mb-6">Частота создания инстансов за последний год</p>
                            <div className="overflow-x-auto pb-2">
                                <svg width={Math.ceil(365 / 7) * 15 + 30} height={7 * 15 + 20} className="mx-auto">
                                    {(() => {
                                        const cells = [];
                                        const today = new Date();
                                        const dayLabels = ['', 'Пн', '', 'Ср', '', 'Пт', ''];
                                        dayLabels.forEach((label, i) => {
                                            if (label) cells.push(<text key={`dl-${i}`} x={0} y={i * 15 + 12} fontSize={10} fill="#9ca3af">{label}</text>);
                                        });
                                        for (let i = 364; i >= 0; i--) {
                                            const d = new Date(today);
                                            d.setDate(d.getDate() - i);
                                            const dateStr = d.toISOString().split('T')[0];
                                            const count = heatmapData[dateStr] || 0;
                                            const weekIdx = Math.floor((364 - i) / 7);
                                            const dayIdx = (364 - i) % 7;
                                            const color = count === 0 ? '#f3f4f6' : count <= 1 ? '#fecaca' : count <= 3 ? '#f87171' : MTS_RED;
                                            cells.push(
                                                <rect
                                                    key={dateStr}
                                                    x={weekIdx * 15 + 30}
                                                    y={dayIdx * 15}
                                                    width={12}
                                                    height={12}
                                                    rx={3}
                                                    fill={color}
                                                    className="transition-colors"
                                                >
                                                    <title>{dateStr}: {count} ВМ запущено</title>
                                                </rect>
                                            );
                                        }
                                        return cells;
                                    })()}
                                </svg>
                                <div className="flex items-center justify-end gap-1 mt-2 text-xs text-gray-500">
                                    <span>Меньше</span>
                                    {['#f3f4f6', '#fecaca', '#f87171', MTS_RED].map((c, i) => (
                                        <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
                                    ))}
                                    <span>Больше</span>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* ===== TENANTS TAB ===== */}
                {activeTab === 'tenants' && (
                    <>
                        <div className="flex justify-between items-end mb-8">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Тенанты</h1>
                                <p className="text-gray-500 text-sm md:text-base">Управление организациями и квотами ресурсов</p>
                            </div>
                            <button
                                onClick={() => setShowCreateTenant(true)}
                                className="apple-button flex items-center gap-2"
                            >
                                <Plus size={18} /> Создать тенант
                            </button>
                        </div>

                        <div className="grid gap-6">
                            {tenants.map(tenant => (
                                <div key={tenant.id} className="apple-card p-0 overflow-hidden border border-gray-200 shadow-sm">
                                    <div className="bg-gray-50 px-4 md:px-6 py-4 border-b border-gray-200 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 text-white bg-gray-700">
                                                {tenant.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-semibold text-gray-900 truncate">{tenant.name}</h3>
                                                <div className="text-xs text-gray-400 flex items-center gap-2">
                                                    <span className="font-mono truncate">ID: {tenant.id}</span>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-1">
                                                        <Users size={10} /> {tenant.members?.length || 0} участников
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 md:gap-6">
                                            <div className="flex gap-4 md:gap-6 text-sm flex-wrap">
                                                <div className="text-right">
                                                    <div className="text-gray-500 mb-1 flex items-center gap-1 justify-end text-xs"><Server size={12} /> Инстансы</div>
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
                                                    title="Редактировать квоты"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteTenant(tenant.id, tenant.name)}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Удалить тенант"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Members section */}
                                    {tenant.members && tenant.members.length > 0 && (
                                        <div className="px-4 md:px-6 py-3 bg-red-50/20 border-b border-gray-100">
                                            <div className="text-xs text-gray-500 font-medium mb-2">Участники</div>
                                            <div className="flex flex-wrap gap-2">
                                                {tenant.members.map(m => (
                                                    <span key={m.user_id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full text-xs font-medium text-gray-700 border border-gray-200 shadow-sm">
                                                        <Users size={12} className="text-gray-400" />
                                                        {m.email}
                                                        <button
                                                            onClick={() => handleToggleOwner(tenant.id, m.user_id)}
                                                            className={`ml-1 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-colors border ${m.is_owner ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-gray-50 text-gray-400 hover:text-amber-600 hover:border-amber-200 border-transparent'}`}
                                                            title={m.is_owner ? "Убрать статус владельца" : "Сделать владельцем"}
                                                        >
                                                            <Star size={10} className={m.is_owner ? "fill-amber-500" : ""} />
                                                            {m.is_owner ? 'Владелец' : 'Назначить'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleRemoveMember(tenant.id, m.user_id, m.email)}
                                                            className="text-gray-300 hover:text-red-500 transition-colors ml-1"
                                                            title="Удалить из тенанта"
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
                                                                inst.status === 'STOPPED' ? 'bg-gray-100 text-gray-600' :
                                                                    inst.status === 'HIBERNATING' ? 'bg-purple-50 text-purple-700' :
                                                                        ['PROVISIONING', 'DELETING'].includes(inst.status) ? 'bg-amber-50 text-amber-700' :
                                                                            'bg-red-50 text-red-700'
                                                                }`}>
                                                                {inst.status === 'HIBERNATING' ? '💤 ZZZ' : inst.status}
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
                                                            Нет активных инстансов в этом тенанте
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
                                    <div className="text-lg font-medium mb-2">Нет тенантов</div>
                                    <p className="text-sm mb-4">Создайте первый тенант для управления облачными ресурсами</p>
                                    <button onClick={() => setShowCreateTenant(true)} className="apple-button flex items-center gap-2 mx-auto">
                                        <Plus size={16} /> Создать тенант
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
                                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Пользователи</h1>
                                <p className="text-gray-500 text-sm md:text-base">Управление пользователями и назначение тенантов</p>
                            </div>
                        </div>

                        <div className="apple-card p-0 overflow-hidden overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50/50 text-gray-500 font-medium border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4">Email</th>
                                        <th className="px-6 py-4">Роль</th>
                                        <th className="px-6 py-4">Тенант</th>
                                        <th className="px-6 py-4">Регистрация</th>
                                        <th className="px-6 py-4 text-right">Действия</th>
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
                                                    <span className="text-gray-500 text-xs font-medium bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200/50">
                                                        Не назначен
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
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium hover:bg-red-50 rounded-lg transition-colors"
                                                        style={{ color: MTS_RED }}
                                                    >
                                                        <UserPlus size={14} />
                                                        {u.tenant_id ? 'Переназначить' : 'Назначить'}
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

                {/* ===== BILLING TAB ===== */}
                {activeTab === 'billing' && (
                    <>
                        <div className="flex justify-between items-end mb-8">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Биллинг платформы</h1>
                                <p className="text-gray-500 text-sm md:text-base">Доходы, расходы и финансовая аналитика</p>
                            </div>
                        </div>

                        {billingLoading && !adminBilling ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: MTS_RED }}></div>
                            </div>
                        ) : adminBilling ? (
                            <>
                                {/* Revenue Summary Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 mb-8">
                                    <div className="apple-card p-5 border border-red-100 bg-gradient-to-br from-red-50/50 to-white">
                                        <div className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: MTS_RED }}>
                                            <Wallet size={16} /> Доход за 30 дней
                                        </div>
                                        <div className="text-3xl font-bold text-gray-900">{adminBilling.total_revenue_30d?.toLocaleString()} <span className="text-lg font-medium text-gray-500">BYN</span></div>
                                    </div>
                                    <div className="apple-card p-5 border border-orange-100 bg-gradient-to-br from-orange-50/50 to-white">
                                        <div className="text-orange-600/80 mb-2 flex items-center gap-2 text-sm font-medium">
                                            <TrendingUp size={16} /> Ставка в час
                                        </div>
                                        <div className="text-3xl font-bold text-gray-900">{adminBilling.global_hourly_rate?.toFixed(2)} <span className="text-lg font-medium text-gray-500">BYN/ч</span></div>
                                    </div>
                                    <div className="apple-card p-5 border border-blue-100 bg-gradient-to-br from-blue-50/50 to-white">
                                        <div className="text-blue-600/80 mb-2 flex items-center gap-2 text-sm font-medium">
                                            <DollarSign size={16} /> Ставка в день
                                        </div>
                                        <div className="text-3xl font-bold text-gray-900">{adminBilling.global_daily_rate?.toFixed(2)} <span className="text-lg font-medium text-gray-500">BYN/д</span></div>
                                    </div>
                                    <div className="apple-card p-5 border border-green-100 bg-gradient-to-br from-green-50/50 to-white">
                                        <div className="text-green-600/80 mb-2 flex items-center gap-2 text-sm font-medium">
                                            <Server size={16} /> Активные ВМ
                                        </div>
                                        <div className="text-3xl font-bold text-gray-900">{adminBilling.total_active_instances}</div>
                                    </div>
                                </div>

                                {/* Revenue Chart */}
                                <div className="apple-card p-6 shadow-sm mb-8">
                                    <h3 className="text-lg font-semibold mb-1">Доход за 30 дней</h3>
                                    <p className="text-xs text-gray-500 mb-6">Ежедневный доход платформы (BYN)</p>
                                    <div className="h-72 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={adminBilling.graph_data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={MTS_RED} stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor={MTS_RED} stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                                <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                                                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                                                <RechartsTooltip
                                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                    formatter={(value) => [`${value.toFixed(2)} BYN`, 'Доход']}
                                                />
                                                <Area type="monotone" dataKey="revenue" stroke={MTS_RED} strokeWidth={2} fillOpacity={1} fill="url(#revenueGrad)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                                    {/* Revenue Breakdown Pie Chart */}
                                    <div className="apple-card p-6 shadow-sm">
                                        <h3 className="text-lg font-semibold mb-1">Структура дохода</h3>
                                        <p className="text-xs text-gray-500 mb-6">Распределение по типам ресурсов</p>
                                        <div className="h-64 flex items-center justify-center">
                                            {adminBilling.revenue_breakdown && (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie
                                                            data={[
                                                                { name: 'vCPU', value: adminBilling.revenue_breakdown.vcpu },
                                                                { name: 'RAM', value: adminBilling.revenue_breakdown.ram },
                                                                { name: 'Хранилище', value: adminBilling.revenue_breakdown.storage },
                                                            ].filter(d => d.value > 0)}
                                                            cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value"
                                                        >
                                                            <Cell fill={MTS_RED} />
                                                            <Cell fill="#6366f1" />
                                                            <Cell fill="#a855f7" />
                                                        </Pie>
                                                        <RechartsTooltip
                                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                            formatter={(value) => [`${value.toFixed(2)} BYN`]}
                                                        />
                                                        <Legend iconType="circle" />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            )}
                                        </div>
                                    </div>

                                    {/* Pricing Info */}
                                    <div className="apple-card p-6 shadow-sm">
                                        <h3 className="text-lg font-semibold mb-4">Тарифы (поминутная оплата)</h3>
                                        <div className="space-y-4">
                                            <div className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between">
                                                <div>
                                                    <div className="font-medium text-gray-900">vCPU</div>
                                                    <div className="text-xs text-gray-500">За ядро в минуту</div>
                                                </div>
                                                <div className="text-2xl font-bold" style={{ color: MTS_RED }}>{adminBilling.pricing?.vcpu_per_min} BYN</div>
                                            </div>
                                            <div className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between">
                                                <div>
                                                    <div className="font-medium text-gray-900">RAM</div>
                                                    <div className="text-xs text-gray-500">За GB в минуту</div>
                                                </div>
                                                <div className="text-2xl font-bold text-indigo-600">{adminBilling.pricing?.ram_gb_per_min} BYN</div>
                                            </div>
                                            <div className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between">
                                                <div>
                                                    <div className="font-medium text-gray-900">Хранилище</div>
                                                    <div className="text-xs text-gray-500">За GB в минуту</div>
                                                </div>
                                                <div className="text-2xl font-bold text-purple-600">{adminBilling.pricing?.storage_gb_per_min} BYN</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Top Tenants Table */}
                                {adminBilling.top_tenants && adminBilling.top_tenants.length > 0 && (
                                    <div className="apple-card p-0 overflow-hidden overflow-x-auto">
                                        <div className="px-6 py-4 border-b border-gray-100">
                                            <h3 className="text-lg font-semibold">Топ тенантов по расходам</h3>
                                            <p className="text-xs text-gray-500 mt-1">Рейтинг тенантов по объёму потребления ресурсов</p>
                                        </div>
                                        <table className="w-full text-left text-sm whitespace-nowrap">
                                            <thead className="bg-gray-50/50 text-gray-500 font-medium border-b border-gray-100">
                                                <tr>
                                                    <th className="px-6 py-3">#</th>
                                                    <th className="px-6 py-3">Тенант</th>
                                                    <th className="px-6 py-3">Инстансы</th>
                                                    <th className="px-6 py-3">BYN/час</th>
                                                    <th className="px-6 py-3 text-right">Итого BYN</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {adminBilling.top_tenants.map((t, idx) => (
                                                    <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="px-6 py-3">
                                                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${idx === 0 ? 'text-white' : idx === 1 ? 'bg-gray-200 text-gray-700' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}
                                                                style={idx === 0 ? { backgroundColor: MTS_RED } : {}}>
                                                                {idx + 1}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 font-medium text-gray-900">{t.name}</td>
                                                        <td className="px-6 py-3 text-gray-500">{t.instance_count}</td>
                                                        <td className="px-6 py-3 font-mono text-xs text-gray-600">{t.hourly_rate?.toFixed(2)} BYN</td>
                                                        <td className="px-6 py-3 text-right font-semibold" style={{ color: MTS_RED }}>{t.spend?.toLocaleString()} BYN</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-20 text-gray-500">
                                <Wallet size={48} className="mx-auto mb-4 text-gray-300" />
                                <p>Нет данных о биллинге</p>
                            </div>
                        )}
                    </>
                )}

                {/* ===== REQUESTS TAB ===== */}
                {activeTab === 'requests' && (
                    <>
                        <div className="flex justify-between items-end mb-8">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">Запросы доступа</h1>
                                <p className="text-gray-500 text-sm md:text-base">Рассмотрение и управление запросами на доступ к тенантам</p>
                            </div>
                            {pendingRequests.length > 0 && (
                                <div className="bg-amber-50 text-amber-700 px-4 py-2 rounded-2xl text-sm font-medium border border-amber-200/50">
                                    {pendingRequests.length} ожидают
                                </div>
                            )}
                        </div>

                        <div className="grid gap-4">
                            {requests.length === 0 ? (
                                <div className="text-center p-12 text-gray-500 bg-white rounded-3xl border border-gray-100 shadow-sm">
                                    <Inbox size={32} className="mx-auto mb-3 text-gray-300" />
                                    <div className="text-lg font-medium mb-1">Нет запросов</div>
                                    <p className="text-sm">Когда пользователи запросят доступ к облачным ресурсам, они появятся здесь</p>
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
                                                        {req.tenant_name && <span> • Запрошен: {req.tenant_name}</span>}
                                                    </div>
                                                    {req.message && (
                                                        <div className="mt-2 text-sm text-gray-600 bg-white/60 rounded-xl p-3 border border-gray-100">
                                                            "{req.message}"
                                                        </div>
                                                    )}
                                                    {req.status !== 'PENDING' && req.admin_comment && (
                                                        <div className="mt-2 text-xs text-gray-500 italic">
                                                            Админ: "{req.admin_comment}"
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
                                                    <div className="flex items-center gap-2 bg-white rounded-2xl p-1.5 border border-gray-200 shadow-sm">
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-0.5">
                                                                <Search size={11} className="text-gray-400" />
                                                                <input
                                                                    type="text"
                                                                    placeholder="Фильтр..."
                                                                    value={tenantSearches[req.id] || ''}
                                                                    onChange={(e) => setTenantSearches(prev => ({ ...prev, [req.id]: e.target.value }))}
                                                                    className="text-xs border-0 bg-transparent w-20 py-0 text-gray-700 focus:outline-none placeholder-gray-400"
                                                                />
                                                            </div>
                                                            <select
                                                                id={`tenant-select-${req.id}`}
                                                                className="text-xs border border-gray-200 rounded-lg bg-transparent px-2 py-1 text-gray-700 focus:outline-none"
                                                                defaultValue={tenants[0]?.id || ''}
                                                            >
                                                                {tenants
                                                                    .filter(t => t.name.toLowerCase().includes((tenantSearches[req.id] || '').toLowerCase()))
                                                                    .map(t => (
                                                                        <option key={t.id} value={t.id}>{t.name}</option>
                                                                    ))}
                                                            </select>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                const sel = document.getElementById(`tenant-select-${req.id}`);
                                                                handleResolveRequest(req.id, 'approve', sel?.value);
                                                            }}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-xl text-xs font-medium hover:bg-green-700 transition-colors"
                                                        >
                                                            <CheckCircle size={13} /> Одобрить
                                                        </button>
                                                    </div>
                                                    <button
                                                        onClick={() => handleResolveRequest(req.id, 'reject')}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 rounded-xl text-xs font-medium hover:bg-red-50 border border-red-200 transition-colors"
                                                    >
                                                        <XCircle size={13} /> Отклонить
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
