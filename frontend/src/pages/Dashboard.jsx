import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import CreateInstanceModal from '../components/CreateInstanceModal';
import { Activity, Server, Cpu, LogOut, Plus, Clock, Trash2, PieChart, TerminalSquare, Send, CheckCircle, XCircle, AlertCircle, Play, Square, Camera, Moon, Sunrise, Upload, DollarSign, TrendingUp, Wallet, Phone, Mail, MapPin, MessageCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import TerminalModal from '../components/TerminalModal';
import InstanceMonitoringModal from '../components/InstanceMonitoringModal';
import BackupManager from '../components/BackupManager';
import { PieChart as RechartsPieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend } from 'recharts';

const MTS_RED = '#E30611';
const MTS_RED_LIGHT = '#fef2f2';

export default function Dashboard() {
    const { user, logout, setUser } = useAuth();
    const navigate = useNavigate();
    const [instances, setInstances] = useState([]);
    const [quotas, setQuotas] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('compute');
    const [terminalInstance, setTerminalInstance] = useState(null);
    const [monitoringInstance, setMonitoringInstance] = useState(null);
    const [backupInstance, setBackupInstance] = useState(null);

    // Billing state
    const [billingData, setBillingData] = useState(null);
    const [billingLoading, setBillingLoading] = useState(false);

    // Request state
    const [requestMessage, setRequestMessage] = useState('');
    const [requestLoading, setRequestLoading] = useState(false);
    const [requestStatus, setRequestStatus] = useState(null);
    const [requestInfo, setRequestInfo] = useState(null);

    const hasTenant = !!user?.tenant_id;

    const fetchData = async () => {
        try {
            if (hasTenant) {
                const [instancesRes, quotasRes] = await Promise.all([
                    api.get('/instances').catch(() => ({ data: [] })),
                    api.get('/instances/quotas').catch(() => ({ data: null }))
                ]);
                setInstances(instancesRes.data || []);
                setQuotas(quotasRes.data);
            } else {
                try {
                    const res = await api.get('/instances/my-request');
                    setRequestStatus(res.data.status);
                    setRequestInfo(res.data);
                } catch { }
            }
        } catch (err) {
            console.error("Failed to load dashboard data:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchBilling = async () => {
        if (!hasTenant || !user?.tenant_id) return;
        setBillingLoading(true);
        try {
            const res = await api.get(`/billing/tenant/${user.tenant_id}`);
            setBillingData(res.data);
        } catch (err) {
            console.error("Failed to load billing:", err);
        } finally {
            setBillingLoading(false);
        }
    };

    const refreshUser = async () => {
        if (!hasTenant) {
            try {
                const res = await api.get('/auth/me');
                if (res.data.tenant_id) {
                    setUser(res.data);
                }
            } catch { }
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => {
            fetchData();
            refreshUser();
        }, 5000);
        return () => clearInterval(interval);
    }, [hasTenant]);

    useEffect(() => {
        if (activeTab === 'billing') {
            fetchBilling();
        }
    }, [activeTab, hasTenant]);

    const handleDelete = async (instanceId) => {
        if (!window.confirm("Are you sure you want to delete this instance?")) return;
        try {
            await api.delete(`/instances/${instanceId}`);
            setInstances(prev => prev.map(inst =>
                inst.id === instanceId ? { ...inst, status: 'DELETING' } : inst
            ));
        } catch (err) {
            alert("Failed to delete instance: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleStart = async (instanceId) => {
        try {
            await api.post(`/instances/${instanceId}/start`);
            fetchData();
        } catch (err) {
            alert("Failed to start instance: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleWake = async (instanceId) => {
        try {
            await api.post(`/instances/${instanceId}/wake`);
            fetchData();
        } catch (err) {
            alert("Failed to wake instance: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        const name = file.name.replace('.tar', '').replace('.gz', '');
        try {
            await api.post(`/instances/import?tenant_id=${user.tenant_id}&name=${encodeURIComponent(name)}&vcpu=1&ram_mb=512`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            fetchData();
        } catch (err) {
            alert("Import failed: " + (err.response?.data?.detail || err.message));
        }
        e.target.value = '';
    };

    const handleStop = async (instanceId) => {
        try {
            await api.post(`/instances/${instanceId}/stop`);
            fetchData();
        } catch (err) {
            alert("Failed to stop instance: " + (err.response?.data?.detail || err.message));
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleSendRequest = async () => {
        setRequestLoading(true);
        try {
            await api.post('/instances/request-access', { message: requestMessage });
            setRequestStatus('PENDING');
            setRequestMessage('');
            const meRes = await api.get('/auth/me');
            setUser(meRes.data);
        } catch (err) {
            alert(err.response?.data?.detail || 'Failed to send request');
        } finally {
            setRequestLoading(false);
        }
    };

    if (loading && !quotas && !instances.length) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: MTS_RED }}></div>
        </div>
    );

    // ==========================================
    //  NO TENANT STATE — Request access screen
    // ==========================================
    if (!hasTenant) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50/50 p-4">
                <div className="apple-card w-full max-w-lg p-8 text-center">
                    <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <AlertCircle size={32} />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight mb-3">Нет назначенного тенанта</h1>
                    <p className="text-gray-500 mb-8 leading-relaxed">
                        Ваш аккаунт создан, но вы ещё не назначены в тенант.
                        Отправьте запрос администратору для получения доступа к облачным ресурсам.
                    </p>

                    {requestStatus === 'PENDING' || user?.has_pending_request ? (
                        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-left">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                                    <Clock size={16} />
                                </div>
                                <div>
                                    <div className="font-semibold text-blue-900 text-sm">Запрос на рассмотрении</div>
                                    <div className="text-blue-600 text-xs">Ожидание одобрения администратором</div>
                                </div>
                            </div>
                            {requestInfo?.message && (
                                <div className="mt-3 text-sm text-blue-700 bg-blue-100/50 rounded-xl p-3">
                                    "{requestInfo.message}"
                                </div>
                            )}
                        </div>
                    ) : requestStatus === 'REJECTED' ? (
                        <div className="space-y-4">
                            <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-left">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
                                        <XCircle size={16} />
                                    </div>
                                    <div>
                                        <div className="font-semibold text-red-900 text-sm">Запрос отклонён</div>
                                        {requestInfo?.admin_comment && (
                                            <div className="text-red-600 text-xs mt-1">"{requestInfo.admin_comment}"</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <textarea
                                    value={requestMessage}
                                    onChange={(e) => setRequestMessage(e.target.value)}
                                    placeholder="Опишите, зачем вам нужен доступ..."
                                    className="apple-input w-full h-24 resize-none"
                                />
                                <button
                                    onClick={handleSendRequest}
                                    disabled={requestLoading}
                                    className="apple-button w-full py-3 flex items-center justify-center gap-2"
                                >
                                    <Send size={16} />
                                    {requestLoading ? 'Отправка...' : 'Отправить новый запрос'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <textarea
                                value={requestMessage}
                                onChange={(e) => setRequestMessage(e.target.value)}
                                placeholder="Опишите, зачем вам нужен доступ к облачным ресурсам..."
                                className="apple-input w-full h-24 resize-none"
                            />
                            <button
                                onClick={handleSendRequest}
                                disabled={requestLoading}
                                className="apple-button w-full py-3 flex items-center justify-center gap-2"
                            >
                                <Send size={16} />
                                {requestLoading ? 'Отправка...' : 'Запросить доступ'}
                            </button>
                        </div>
                    )}

                    <div className="mt-6 pt-6 border-t border-gray-100">
                        <div className="text-xs text-gray-400 mb-3">Вы вошли как {user?.email}</div>
                        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-600 transition-colors flex items-center gap-2 mx-auto">
                            <LogOut size={14} /> Выйти
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ==========================================
    //  NORMAL DASHBOARD (with tenant)
    // ==========================================
    return (
        <div className="min-h-screen flex flex-col md:flex-row bg-gray-50/50">
            {/* Mobile Header */}
            <div className="md:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
                <div className="flex items-center gap-3 font-semibold">
                    <img src="/logo.png" alt="Тучка МТС" className="h-8 object-contain" />
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setActiveTab('compute')}
                        className={`p-2 rounded-xl transition-colors ${activeTab === 'compute' ? 'text-white' : 'text-gray-400'}`}
                        style={activeTab === 'compute' ? { backgroundColor: MTS_RED } : {}}
                    >
                        <Server size={18} />
                    </button>
                    <button
                        onClick={() => setActiveTab('monitoring')}
                        className={`p-2 rounded-xl transition-colors ${activeTab === 'monitoring' ? 'text-white' : 'text-gray-400'}`}
                        style={activeTab === 'monitoring' ? { backgroundColor: MTS_RED } : {}}
                    >
                        <PieChart size={18} />
                    </button>
                    <button
                        onClick={() => setActiveTab('billing')}
                        className={`p-2 rounded-xl transition-colors ${activeTab === 'billing' ? 'text-white' : 'text-gray-400'}`}
                        style={activeTab === 'billing' ? { backgroundColor: MTS_RED } : {}}
                    >
                        <Wallet size={18} />
                    </button>
                    <button
                        onClick={() => setActiveTab('contacts')}
                        className={`p-2 rounded-xl transition-colors ${activeTab === 'contacts' ? 'text-white' : 'text-gray-400'}`}
                        style={activeTab === 'contacts' ? { backgroundColor: MTS_RED } : {}}
                    >
                        <Phone size={18} />
                    </button>
                    <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 rounded-xl transition-colors ml-1">
                        <LogOut size={18} />
                    </button>
                </div>
            </div>

            {/* Desktop Sidebar */}
            <div className="w-64 bg-white border-r border-gray-100 p-6 flex-col hidden md:flex sticky top-0 h-screen">
                <div className="flex items-center gap-3 font-semibold text-lg mb-2">
                    <img src="/logo.png" alt="Тучка МТС" className="h-10 object-contain" />
                </div>
                <div className="mb-8 ml-1">
                    <span className="text-xs font-normal text-gray-400">{user?.email}</span>
                    {user?.tenant_name && (
                        <div className="mt-1">
                            <span className="text-[11px] font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
                                {user.tenant_name}
                            </span>
                        </div>
                    )}
                </div>

                <nav className="flex-1 space-y-2 text-sm font-medium">
                    <button
                        onClick={() => setActiveTab('compute')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${activeTab === 'compute' ? 'text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                        style={activeTab === 'compute' ? { backgroundColor: MTS_RED } : {}}
                    >
                        <Server size={18} /> Compute
                    </button>
                    <button
                        onClick={() => setActiveTab('monitoring')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${activeTab === 'monitoring' ? 'text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                        style={activeTab === 'monitoring' ? { backgroundColor: MTS_RED } : {}}
                    >
                        <PieChart size={18} /> Мониторинг
                    </button>
                    <button
                        onClick={() => setActiveTab('billing')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${activeTab === 'billing' ? 'text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                        style={activeTab === 'billing' ? { backgroundColor: MTS_RED } : {}}
                    >
                        <Wallet size={18} /> Биллинг
                    </button>
                    <button
                        onClick={() => setActiveTab('contacts')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${activeTab === 'contacts' ? 'text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                        style={activeTab === 'contacts' ? { backgroundColor: MTS_RED } : {}}
                    >
                        <Phone size={18} /> Контакты
                    </button>
                </nav>

                <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-colors text-sm font-medium mt-auto">
                    <LogOut size={18} /> Выйти
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-4 md:p-12 max-w-[90rem] mx-auto overflow-y-auto w-full">
                {activeTab === 'compute' ? (
                    <>
                        <div className="flex justify-between items-end mb-10">
                            <div>
                                <h1 className="text-3xl font-semibold tracking-tight mb-2">Виртуальные машины</h1>
                                <p className="text-gray-500">Управление вашей облачной инфраструктурой</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <label className={`apple-button-secondary flex items-center gap-2 cursor-pointer border border-gray-200 ${quotas?.used_instances >= quotas?.max_instances ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <Upload size={18} /> Импорт ВМ
                                    <input type="file" accept=".tar,.tar.gz" className="hidden" onChange={handleImport} disabled={quotas?.used_instances >= quotas?.max_instances} />
                                </label>
                                <button
                                    onClick={() => setIsModalOpen(true)}
                                    className="apple-button flex items-center gap-2"
                                    disabled={quotas?.used_instances >= quotas?.max_instances}
                                >
                                    <Plus size={18} /> Создать ВМ
                                </button>
                            </div>
                        </div>

                        {/* Quotas / Usage Header */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                            <div className="apple-card p-5">
                                <div className="text-sm font-medium text-gray-500 mb-4 flex items-center gap-2">
                                    <Server size={16} /> Активные ВМ
                                </div>
                                <div className="text-3xl font-semibold">{quotas?.used_instances || 0} <span className="text-lg text-gray-400 font-normal">/ {quotas?.max_instances || 0}</span></div>
                                <div className="mt-4 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${Math.min(((quotas?.used_instances || 0) / (quotas?.max_instances || 1)) * 100, 100)}%`,
                                            backgroundColor: quotas?.used_instances >= quotas?.max_instances ? '#ef4444' : MTS_RED
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="apple-card p-5">
                                <div className="text-sm font-medium text-gray-500 mb-4 flex items-center gap-2">
                                    <Cpu size={16} /> vCPU
                                </div>
                                <div className="text-3xl font-semibold">{quotas?.used_vcpu || 0} <span className="text-lg text-gray-400 font-normal">/ {quotas?.max_vcpu || 0} Ядер</span></div>
                                <div className="mt-4 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${quotas?.used_vcpu >= quotas?.max_vcpu ? 'bg-red-500' : 'bg-indigo-500'}`}
                                        style={{ width: `${Math.min(((quotas?.used_vcpu || 0) / (quotas?.max_vcpu || 1)) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                            <div className="apple-card p-5">
                                <div className="text-sm font-medium text-gray-500 mb-4 flex items-center gap-2">
                                    <Activity size={16} /> RAM
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
                                        <th className="px-4 py-3">Имя</th>
                                        <th className="px-4 py-3">Статус</th>
                                        <th className="px-4 py-3">Конфигурация</th>
                                        <th className="px-4 py-3">Теги</th>
                                        <th className="px-4 py-3">IP / Доступ</th>
                                        <th className="px-4 py-3">Создано</th>
                                        <th className="px-4 py-3 text-right">Действия</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {instances.map(inst => (
                                        <tr key={inst.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-4 font-medium text-gray-900 text-sm">{inst.name}</td>
                                            <td className="px-4 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${inst.status === 'RUNNING' ? 'bg-green-50 text-green-700 border border-green-200/50' :
                                                    inst.status === 'STOPPED' ? 'bg-gray-100 text-gray-700 border border-gray-200/50' :
                                                        inst.status === 'HIBERNATING' ? 'bg-purple-50 text-purple-700 border border-purple-200/50' :
                                                            ['PROVISIONING', 'DELETING'].includes(inst.status) ? 'bg-amber-50 text-amber-700 border border-amber-200/50 animate-pulse' :
                                                                'bg-red-50 text-red-700 border border-red-200/50'
                                                    }`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${inst.status === 'RUNNING' ? 'bg-green-500' : inst.status === 'STOPPED' ? 'bg-gray-400' : inst.status === 'HIBERNATING' ? 'bg-purple-500' : ['PROVISIONING', 'DELETING'].includes(inst.status) ? 'bg-amber-500' : 'bg-red-500'}`} />
                                                    {inst.status === 'HIBERNATING' ? '💤 ZZZ' : inst.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-gray-500 text-xs">
                                                {inst.vcpu} vCPU • {inst.ram_mb >= 1024 ? (inst.ram_mb / 1024) + ' GB' : inst.ram_mb + ' MB'} • {inst.image}
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {inst.tags ? inst.tags.split(',').map(tag => tag.trim()).filter(Boolean).map(tag => (
                                                        <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs border border-gray-200">
                                                            {tag}
                                                        </span>
                                                    )) : <span className="text-gray-400 text-xs italic">—</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 font-mono text-xs">
                                                {inst.ip_address && inst.ip_address.includes('|port:') ? (
                                                    <a
                                                        href={`/api/v1/instances/${inst.id}/proxy/`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="hover:underline font-semibold"
                                                        style={{ color: MTS_RED }}
                                                    >
                                                        🌐 Web App
                                                    </a>
                                                ) : (
                                                    <span className="text-gray-500 text-xs">{inst.ip_address || '—'}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 text-gray-500 text-xs">
                                                {new Date(inst.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <div className="flex items-center justify-end gap-0.5 flex-nowrap">
                                                    {inst.status === 'STOPPED' && (
                                                        <button
                                                            onClick={() => handleStart(inst.id)}
                                                            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                            title="Запустить"
                                                        >
                                                            <Play size={16} />
                                                        </button>
                                                    )}
                                                    {inst.status === 'HIBERNATING' && (
                                                        <button
                                                            onClick={() => handleWake(inst.id)}
                                                            className="p-2 text-purple-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors animate-pulse"
                                                            title="Разбудить"
                                                        >
                                                            <Sunrise size={16} />
                                                        </button>
                                                    )}
                                                    {inst.status === 'RUNNING' && (
                                                        <button
                                                            onClick={() => handleStop(inst.id)}
                                                            className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                            title="Остановить"
                                                        >
                                                            <Square size={16} />
                                                        </button>
                                                    )}
                                                    {inst.status === 'RUNNING' && (
                                                        <button
                                                            onClick={() => setTerminalInstance(inst)}
                                                            className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                            title="Терминал"
                                                        >
                                                            <TerminalSquare size={16} />
                                                        </button>
                                                    )}
                                                    {inst.status === 'RUNNING' && (
                                                        <button
                                                            onClick={() => setMonitoringInstance(inst)}
                                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Мониторинг"
                                                        >
                                                            <Activity size={16} />
                                                        </button>
                                                    )}
                                                    {(inst.status === 'RUNNING' || inst.status === 'STOPPED') && (
                                                        <button
                                                            onClick={() => setBackupInstance(inst)}
                                                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                            title="Снапшоты"
                                                        >
                                                            <Camera size={16} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDelete(inst.id)}
                                                        disabled={inst.status === 'DELETING' || inst.status === 'DELETED'}
                                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Удалить"
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
                                                Нет развёрнутых ВМ. Нажмите «Создать ВМ» чтобы начать.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : activeTab === 'monitoring' ? (
                    <>
                        <div className="flex justify-between items-end mb-10">
                            <div>
                                <h1 className="text-3xl font-semibold tracking-tight mb-2">Мониторинг и квоты</h1>
                                <p className="text-gray-500">Распределение и потребление ресурсов в реальном времени</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                            {/* Pie Chart: Instances */}
                            <div className="apple-card p-6 flex flex-col items-center justify-center text-center shadow-sm">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: MTS_RED_LIGHT, color: MTS_RED }}>
                                    <Server size={20} />
                                </div>
                                <h3 className="text-lg font-semibold mb-1">Инстансы</h3>
                                <p className="text-gray-500 text-sm mb-4">Запущенные виртуальные машины</p>
                                <div className="h-48 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsPieChart>
                                            <Pie
                                                data={[
                                                    { name: 'Используется', value: quotas?.used_instances || 0 },
                                                    { name: 'Свободно', value: Math.max((quotas?.max_instances || 0) - (quotas?.used_instances || 0), 0) }
                                                ]}
                                                cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none"
                                            >
                                                <Cell fill={MTS_RED} />
                                                <Cell fill="#f3f4f6" />
                                            </Pie>
                                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-2xl font-bold fill-gray-900">
                                                {quotas?.used_instances || 0}
                                            </text>
                                        </RechartsPieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Pie Chart: CPU */}
                            <div className="apple-card p-6 flex flex-col items-center justify-center text-center shadow-sm">
                                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
                                    <Cpu size={20} />
                                </div>
                                <h3 className="text-lg font-semibold mb-1">Вычислительные ядра</h3>
                                <p className="text-gray-500 text-sm mb-4">Распределение vCPU</p>
                                <div className="h-48 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsPieChart>
                                            <Pie
                                                data={[
                                                    { name: 'Используется', value: quotas?.used_vcpu || 0 },
                                                    { name: 'Свободно', value: Math.max((quotas?.max_vcpu || 0) - (quotas?.used_vcpu || 0), 0) }
                                                ]}
                                                cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none"
                                            >
                                                <Cell fill="#6366f1" />
                                                <Cell fill="#f3f4f6" />
                                            </Pie>
                                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-2xl font-bold fill-gray-900">
                                                {quotas?.used_vcpu || 0}
                                            </text>
                                        </RechartsPieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Pie Chart: RAM */}
                            <div className="apple-card p-6 flex flex-col items-center justify-center text-center shadow-sm">
                                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-4">
                                    <Activity size={20} />
                                </div>
                                <h3 className="text-lg font-semibold mb-1">Память</h3>
                                <p className="text-gray-500 text-sm mb-4">Распределение RAM в GB</p>
                                <div className="h-48 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsPieChart>
                                            <Pie
                                                data={[
                                                    { name: 'Используется', value: Number(((quotas?.used_ram || 0) / 1024).toFixed(1)) },
                                                    { name: 'Свободно', value: Number((Math.max((quotas?.max_ram_mb || 0) - (quotas?.used_ram || 0), 0) / 1024).toFixed(1)) }
                                                ]}
                                                cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none"
                                            >
                                                <Cell fill="#a855f7" />
                                                <Cell fill="#f3f4f6" />
                                            </Pie>
                                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-2xl font-bold fill-gray-900">
                                                {((quotas?.used_ram || 0) / 1024).toFixed(1)}
                                            </text>
                                        </RechartsPieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </>
                ) : activeTab === 'billing' ? (
                    /* ===== BILLING TAB ===== */
                    <>
                        <div className="flex justify-between items-end mb-10">
                            <div>
                                <h1 className="text-3xl font-semibold tracking-tight mb-2">Биллинг</h1>
                                <p className="text-gray-500">Расходы и стоимость ваших облачных ресурсов</p>
                            </div>
                        </div>

                        {billingLoading && !billingData ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: MTS_RED }}></div>
                            </div>
                        ) : billingData ? (
                            <>
                                {/* Billing Summary Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                                    <div className="apple-card p-5 border border-red-100 bg-gradient-to-br from-red-50/50 to-white">
                                        <div className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: MTS_RED }}>
                                            <Wallet size={16} /> За месяц
                                        </div>
                                        <div className="text-3xl font-bold text-gray-900">{billingData.current_month_total?.toLocaleString()} <span className="text-lg font-medium text-gray-500">BYN</span></div>
                                    </div>
                                    <div className="apple-card p-5 border border-orange-100 bg-gradient-to-br from-orange-50/50 to-white">
                                        <div className="text-orange-600/80 mb-2 flex items-center gap-2 text-sm font-medium">
                                            <TrendingUp size={16} /> В час
                                        </div>
                                        <div className="text-3xl font-bold text-gray-900">{billingData.hourly_rate?.toFixed(2)} <span className="text-lg font-medium text-gray-500">BYN/ч</span></div>
                                    </div>
                                    <div className="apple-card p-5 border border-green-100 bg-gradient-to-br from-green-50/50 to-white">
                                        <div className="text-green-600/80 mb-2 flex items-center gap-2 text-sm font-medium">
                                            <Server size={16} /> Активные ВМ
                                        </div>
                                        <div className="text-3xl font-bold text-gray-900">{billingData.active_instances}</div>
                                    </div>
                                    <div className="apple-card p-5 border border-purple-100 bg-gradient-to-br from-purple-50/50 to-white">
                                        <div className="text-purple-600/80 mb-2 flex items-center gap-2 text-sm font-medium">
                                            <Moon size={16} /> В гибернации
                                        </div>
                                        <div className="text-3xl font-bold text-gray-900">{billingData.hibernating_instances}</div>
                                    </div>
                                </div>

                                {/* Spending Chart */}
                                <div className="apple-card p-6 shadow-sm mb-8">
                                    <h3 className="text-lg font-semibold mb-1">Расходы за 30 дней</h3>
                                    <p className="text-xs text-gray-500 mb-6">Ежедневные затраты на облачные ресурсы (BYN)</p>
                                    <div className="h-72 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={billingData.graph_data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={MTS_RED} stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor={MTS_RED} stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                                <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                                                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                    formatter={(value) => [`${value.toFixed(2)} BYN`, 'Расход']}
                                                />
                                                <Area type="monotone" dataKey="spend" stroke={MTS_RED} strokeWidth={2} fillOpacity={1} fill="url(#spendGrad)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Pricing Info */}
                                <div className="apple-card p-6 shadow-sm mb-8">
                                    <h3 className="text-lg font-semibold mb-4">Тарифы (поминутная оплата)</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-gray-50 rounded-2xl p-4 text-center">
                                            <div className="text-sm text-gray-500 mb-1">vCPU</div>
                                            <div className="text-2xl font-bold" style={{ color: MTS_RED }}>{billingData.pricing?.vcpu_per_min} BYN</div>
                                            <div className="text-xs text-gray-400">за ядро / мин</div>
                                        </div>
                                        <div className="bg-gray-50 rounded-2xl p-4 text-center">
                                            <div className="text-sm text-gray-500 mb-1">RAM</div>
                                            <div className="text-2xl font-bold text-indigo-600">{billingData.pricing?.ram_gb_per_min} BYN</div>
                                            <div className="text-xs text-gray-400">за GB / мин</div>
                                        </div>
                                        <div className="bg-gray-50 rounded-2xl p-4 text-center">
                                            <div className="text-sm text-gray-500 mb-1">Хранилище</div>
                                            <div className="text-2xl font-bold text-purple-600">{billingData.pricing?.storage_gb_per_min} BYN</div>
                                            <div className="text-xs text-gray-400">за GB / мин</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Per-Instance Cost Breakdown */}
                                {billingData.instance_costs && billingData.instance_costs.length > 0 && (
                                    <div className="apple-card p-0 overflow-hidden overflow-x-auto">
                                        <div className="px-6 py-4 border-b border-gray-100">
                                            <h3 className="text-lg font-semibold">Стоимость по инстансам</h3>
                                            <p className="text-xs text-gray-500 mt-1">Детализация расходов по каждой виртуальной машине</p>
                                        </div>
                                        <table className="w-full text-left text-sm whitespace-nowrap">
                                            <thead className="bg-gray-50/50 text-gray-500 font-medium border-b border-gray-100">
                                                <tr>
                                                    <th className="px-6 py-3">Имя</th>
                                                    <th className="px-6 py-3">Статус</th>
                                                    <th className="px-6 py-3">Конфигурация</th>
                                                    <th className="px-6 py-3">BYN/мин</th>
                                                    <th className="px-6 py-3">BYN/час</th>
                                                    <th className="px-6 py-3">Время работы</th>
                                                    <th className="px-6 py-3 text-right">Итого BYN</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {billingData.instance_costs.map(ic => (
                                                    <tr key={ic.id} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="px-6 py-3 font-medium text-gray-900">{ic.name}</td>
                                                        <td className="px-6 py-3">
                                                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${ic.status === 'RUNNING' ? 'bg-green-50 text-green-700' :
                                                                ic.status === 'STOPPED' ? 'bg-gray-100 text-gray-600' :
                                                                    ic.status === 'HIBERNATING' ? 'bg-purple-50 text-purple-700' :
                                                                        'bg-amber-50 text-amber-700'
                                                                }`}>
                                                                {ic.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 text-gray-500 text-xs">{ic.vcpu} vCPU • {ic.ram_mb >= 1024 ? (ic.ram_mb / 1024) + ' GB' : ic.ram_mb + ' MB'}</td>
                                                        <td className="px-6 py-3 font-mono text-xs">{ic.cost_per_min.toFixed(4)}</td>
                                                        <td className="px-6 py-3 font-mono text-xs">{ic.cost_per_hour.toFixed(2)}</td>
                                                        <td className="px-6 py-3 text-gray-500 text-xs">{Math.round(ic.running_minutes)} мин</td>
                                                        <td className="px-6 py-3 text-right font-semibold" style={{ color: MTS_RED }}>{ic.total_cost.toLocaleString()} BYN</td>
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
                ) : activeTab === 'contacts' ? (
                    /* ===== CONTACTS TAB ===== */
                    <>
                        <div className="flex justify-between items-end mb-10">
                            <div>
                                <h1 className="text-3xl font-semibold tracking-tight mb-2">Контакты</h1>
                                <p className="text-gray-500">Связь с администрацией и поддержкой</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            <div className="apple-card p-8 shadow-sm">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: MTS_RED }}>
                                        <Phone size={28} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">Техническая поддержка</h3>
                                        <p className="text-sm text-gray-500">Круглосуточная линия помощи</p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                        <Phone size={18} className="text-gray-400" />
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">8 (800) 250-08-90</div>
                                            <div className="text-xs text-gray-500">Бесплатно по России</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                        <Mail size={18} className="text-gray-400" />
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">cloud@mts.ru</div>
                                            <div className="text-xs text-gray-500">Электронная почта поддержки</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                        <MessageCircle size={18} className="text-gray-400" />
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">Telegram: @mts_cloud_support</div>
                                            <div className="text-xs text-gray-500">Быстрая связь через мессенджер</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="apple-card p-8 shadow-sm">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-14 h-14 rounded-2xl bg-indigo-500 flex items-center justify-center">
                                        <Mail size={28} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">Отдел продаж</h3>
                                        <p className="text-sm text-gray-500">Подключение и тарифы</p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                        <Phone size={18} className="text-gray-400" />
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">+7 (495) 636-06-36</div>
                                            <div className="text-xs text-gray-500">Для корпоративных клиентов</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                        <Mail size={18} className="text-gray-400" />
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">sales-cloud@mts.ru</div>
                                            <div className="text-xs text-gray-500">Запрос на подключение тенанта</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                        <MapPin size={18} className="text-gray-400" />
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">г. Москва, ул. Марксистская, 4</div>
                                            <div className="text-xs text-gray-500">Центральный офис МТС</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="apple-card p-8 shadow-sm">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">Как получить тенант для вашей компании?</h3>
                            <p className="text-gray-500 text-sm mb-6">Если вы представляете новую компанию и хотите подключиться к облачной платформе Тучка МТС:</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-gray-50 rounded-2xl p-5 text-center">
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 text-white font-bold" style={{ backgroundColor: MTS_RED }}>1</div>
                                    <div className="font-medium text-gray-900 text-sm">Свяжитесь с нами</div>
                                    <div className="text-xs text-gray-500 mt-1">Напишите на sales-cloud@mts.ru или позвоните</div>
                                </div>
                                <div className="bg-gray-50 rounded-2xl p-5 text-center">
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 text-white font-bold" style={{ backgroundColor: MTS_RED }}>2</div>
                                    <div className="font-medium text-gray-900 text-sm">Обсудите потребности</div>
                                    <div className="text-xs text-gray-500 mt-1">Менеджер подберёт оптимальный тариф</div>
                                </div>
                                <div className="bg-gray-50 rounded-2xl p-5 text-center">
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 text-white font-bold" style={{ backgroundColor: MTS_RED }}>3</div>
                                    <div className="font-medium text-gray-900 text-sm">Получите доступ</div>
                                    <div className="text-xs text-gray-500 mt-1">Администратор создаст тенант и назначит вас</div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : null}
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

            <InstanceMonitoringModal
                isOpen={!!monitoringInstance}
                onClose={() => setMonitoringInstance(null)}
                instanceId={monitoringInstance?.id}
                instanceName={monitoringInstance?.name}
            />

            <BackupManager
                isOpen={!!backupInstance}
                onClose={() => setBackupInstance(null)}
                instance={backupInstance}
                onRestored={() => fetchData()}
            />
        </div>
    );
}
