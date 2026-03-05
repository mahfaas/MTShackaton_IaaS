import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { X, Server, Cpu, HardDrive, ChevronRight, ChevronLeft, Wallet, Database, Tag, Check } from 'lucide-react';

const MTS_RED = '#E30611';

// Pricing constants (must match backend) — BYN per minute
const VCPU_PRICE_PER_MIN = 0.0004;
const RAM_GB_PRICE_PER_MIN = 0.0002;
const STORAGE_GB_PRICE_PER_MIN = 0.00001;
const DEFAULT_STORAGE_GB = 10;

const STEPS = [
    { id: 'config', label: 'Конфигурация', icon: Cpu },
    { id: 'image', label: 'Образ ОС', icon: Server },
    { id: 'details', label: 'Детали', icon: Tag },
    { id: 'review', label: 'Обзор и запуск', icon: Check },
];

export default function CreateInstanceModal({ isOpen, onClose, tenantId, onCreated }) {
    const [name, setName] = useState('');
    const [vcpu, setVcpu] = useState(1);
    const [ram, setRam] = useState(1024);
    const [image, setImage] = useState('ubuntu:22.04');
    const [tags, setTags] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState(0);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setName('');
            setVcpu(1);
            setRam(1024);
            setImage('ubuntu:22.04');
            setTags('');
            setError('');
            setStep(0);
        }
    }, [isOpen]);

    // Real-time cost calculation
    const costs = useMemo(() => {
        const vcpuCostMin = vcpu * VCPU_PRICE_PER_MIN;
        const ramCostMin = (ram / 1024) * RAM_GB_PRICE_PER_MIN;
        const storageCostMin = DEFAULT_STORAGE_GB * STORAGE_GB_PRICE_PER_MIN;
        const totalPerMin = vcpuCostMin + ramCostMin + storageCostMin;
        return {
            vcpuPerMin: vcpuCostMin,
            ramPerMin: ramCostMin,
            storagePerMin: storageCostMin,
            totalPerMin,
            totalPerHour: totalPerMin * 60,
            totalPerDay: totalPerMin * 60 * 24,
            totalPerMonth: totalPerMin * 60 * 24 * 30,
        };
    }, [vcpu, ram]);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        setLoading(true);
        setError('');

        try {
            await api.post('/instances', {
                tenant_id: tenantId,
                name,
                vcpu: parseInt(vcpu),
                ram_mb: parseInt(ram),
                image,
                tags
            });
            onCreated();
            onClose();
        } catch (err) {
            setError(err.response?.data?.detail || 'Не удалось создать инстанс');
        } finally {
            setLoading(false);
        }
    };

    const canProceed = () => {
        if (step === 2) return name.trim().length > 0;
        return true;
    };

    const nextStep = () => {
        if (step < STEPS.length - 1 && canProceed()) setStep(step + 1);
    };
    const prevStep = () => {
        if (step > 0) setStep(step - 1);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
            <div className="apple-card w-full max-w-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-semibold mb-6 flex items-center gap-3">
                    <Server style={{ color: MTS_RED }} />
                    Создание виртуальной машины
                </h2>

                {/* Step Indicator */}
                <div className="flex items-center gap-2 mb-8">
                    {STEPS.map((s, i) => (
                        <div key={s.id} className="flex items-center gap-2 flex-1">
                            <button
                                onClick={() => i <= step && setStep(i)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all w-full ${i === step ? 'text-white' : i < step ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-gray-400 border border-gray-100'}`}
                                style={i === step ? { backgroundColor: MTS_RED } : {}}
                                disabled={i > step}
                            >
                                <s.icon size={14} />
                                <span className="hidden md:inline">{s.label}</span>
                            </button>
                            {i < STEPS.length - 1 && <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />}
                        </div>
                    ))}
                </div>

                {error && (
                    <div className="mb-6 p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
                        {error}
                    </div>
                )}

                {/* Cost Sidebar - always visible */}
                <div className="flex gap-6">
                    <div className="flex-1 min-w-0">
                        {/* Step 0: Configuration */}
                        {step === 0 && (
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-3 ml-1 flex items-center gap-2">
                                        <Cpu size={16} className="text-gray-400" /> Процессор (vCPU)
                                    </label>
                                    <div className="grid grid-cols-4 gap-3">
                                        {[1, 2, 4, 8].map(v => (
                                            <button
                                                key={v}
                                                type="button"
                                                onClick={() => setVcpu(v)}
                                                className={`p-4 rounded-2xl border text-center transition-all ${vcpu === v ? 'text-white border-transparent' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                                                style={vcpu === v ? { backgroundColor: MTS_RED } : {}}
                                            >
                                                <div className="text-2xl font-bold">{v}</div>
                                                <div className={`text-xs mt-1 ${vcpu === v ? 'text-white/80' : 'text-gray-500'}`}>{v === 1 ? 'ядро' : v < 5 ? 'ядра' : 'ядер'}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-3 ml-1 flex items-center gap-2">
                                        <HardDrive size={16} className="text-gray-400" /> Оперативная память (RAM)
                                    </label>
                                    <div className="grid grid-cols-4 gap-3">
                                        {[512, 1024, 2048, 4096].map(r => (
                                            <button
                                                key={r}
                                                type="button"
                                                onClick={() => setRam(r)}
                                                className={`p-4 rounded-2xl border text-center transition-all ${ram === r ? 'text-white border-transparent' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                                                style={ram === r ? { backgroundColor: MTS_RED } : {}}
                                            >
                                                <div className="text-2xl font-bold">{r >= 1024 ? r / 1024 : r}</div>
                                                <div className={`text-xs mt-1 ${ram === r ? 'text-white/80' : 'text-gray-500'}`}>{r >= 1024 ? 'GB' : 'MB'}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-3 ml-1 flex items-center gap-2">
                                        <Database size={16} className="text-gray-400" /> SSD Хранилище
                                    </label>
                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 text-center">
                                        <div className="text-2xl font-bold text-gray-900">{DEFAULT_STORAGE_GB} GB</div>
                                        <div className="text-xs text-gray-500 mt-1">SSD (включено по умолчанию)</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 1: OS Image */}
                        {step === 1 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-3 ml-1">Выберите образ операционной системы</label>
                                <div className="grid grid-cols-2 gap-4">
                                    {[
                                        { id: 'ubuntu:22.04', name: 'Ubuntu', version: '22.04 LTS', desc: 'Популярный Linux дистрибутив' },
                                        { id: 'alpine:3.18', name: 'Alpine', version: '3.18', desc: 'Минималистичный Linux' },
                                        { id: 'debian:12', name: 'Debian', version: '12 Bookworm', desc: 'Стабильный серверный Linux' },
                                        { id: 'nginx:latest', name: 'Nginx', version: 'latest', desc: 'Веб-сервер с Nginx' },
                                    ].map(img => (
                                        <button
                                            key={img.id}
                                            type="button"
                                            onClick={() => setImage(img.id)}
                                            className={`p-5 rounded-2xl border text-left transition-all ${image === img.id
                                                ? 'border-transparent ring-2 text-white'
                                                : 'border-gray-200 hover:border-gray-300 bg-white'
                                                }`}
                                            style={image === img.id ? { backgroundColor: MTS_RED, ringColor: MTS_RED } : {}}
                                        >
                                            <div className="font-semibold text-lg">{img.name}</div>
                                            <div className={`text-sm mt-1 ${image === img.id ? 'text-white/80' : 'text-gray-500'}`}>{img.version}</div>
                                            <div className={`text-xs mt-2 ${image === img.id ? 'text-white/70' : 'text-gray-400'}`}>{img.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 2: Details */}
                        {step === 2 && (
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">Имя виртуальной машины *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="web-server-01"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="apple-input"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">Теги (через запятую)</label>
                                    <input
                                        type="text"
                                        placeholder="prod, frontend, web"
                                        value={tags}
                                        onChange={(e) => setTags(e.target.value)}
                                        className="apple-input"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Step 3: Review */}
                        {step === 3 && (
                            <div className="space-y-4">
                                <div className="bg-gray-50 rounded-2xl p-5 space-y-3">
                                    <h3 className="font-semibold text-gray-900 mb-3">Конфигурация</h3>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div className="text-gray-500">Имя:</div>
                                        <div className="font-medium text-gray-900">{name || '—'}</div>
                                        <div className="text-gray-500">vCPU:</div>
                                        <div className="font-medium text-gray-900">{vcpu} {vcpu === 1 ? 'ядро' : vcpu < 5 ? 'ядра' : 'ядер'}</div>
                                        <div className="text-gray-500">RAM:</div>
                                        <div className="font-medium text-gray-900">{ram >= 1024 ? (ram / 1024) + ' GB' : ram + ' MB'}</div>
                                        <div className="text-gray-500">SSD:</div>
                                        <div className="font-medium text-gray-900">{DEFAULT_STORAGE_GB} GB</div>
                                        <div className="text-gray-500">Образ:</div>
                                        <div className="font-medium text-gray-900">{image}</div>
                                        {tags && <>
                                            <div className="text-gray-500">Теги:</div>
                                            <div className="font-medium text-gray-900">{tags}</div>
                                        </>}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Cost Calculator Panel */}
                    <div className="w-56 flex-shrink-0 hidden md:block">
                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 sticky top-0">
                            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-700">
                                <Wallet size={16} style={{ color: MTS_RED }} />
                                Стоимость
                            </div>

                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">vCPU ({vcpu}×):</span>
                                    <span className="font-mono">{costs.vcpuPerMin.toFixed(4)} BYN</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">RAM ({ram >= 1024 ? (ram / 1024) + 'GB' : ram + 'MB'}):</span>
                                    <span className="font-mono">{costs.ramPerMin.toFixed(4)} BYN</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">SSD ({DEFAULT_STORAGE_GB}GB):</span>
                                    <span className="font-mono">{costs.storagePerMin.toFixed(5)} BYN</span>
                                </div>

                                <div className="border-t border-gray-200 pt-2 mt-2">
                                    <div className="flex justify-between font-semibold">
                                        <span className="text-gray-700">Итого/мин:</span>
                                        <span className="font-mono" style={{ color: MTS_RED }}>{costs.totalPerMin.toFixed(4)} BYN</span>
                                    </div>
                                </div>

                                <div className="border-t border-gray-100 pt-2 space-y-1 text-gray-400">
                                    <div className="flex justify-between">
                                        <span>В час:</span>
                                        <span className="font-mono">{costs.totalPerHour.toFixed(3)} BYN</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>В день:</span>
                                        <span className="font-mono">{costs.totalPerDay.toFixed(2)} BYN</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>В месяц:</span>
                                        <span className="font-mono font-semibold text-gray-600">~{costs.totalPerMonth.toFixed(2)} BYN</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile cost summary */}
                <div className="md:hidden mt-4 bg-gray-50 rounded-2xl p-3 border border-gray-200">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-1"><Wallet size={14} /> Стоимость:</span>
                        <span className="font-bold" style={{ color: MTS_RED }}>{costs.totalPerHour.toFixed(3)} BYN/ч • ~{costs.totalPerMonth.toFixed(2)} BYN/мес</span>
                    </div>
                </div>

                {/* Navigation */}
                <div className="pt-6 flex justify-between items-center">
                    <button
                        type="button"
                        onClick={step === 0 ? onClose : prevStep}
                        className="apple-button-secondary flex items-center gap-2"
                    >
                        <ChevronLeft size={16} />
                        {step === 0 ? 'Отмена' : 'Назад'}
                    </button>

                    {step < STEPS.length - 1 ? (
                        <button
                            type="button"
                            onClick={nextStep}
                            disabled={!canProceed()}
                            className="apple-button flex items-center gap-2"
                        >
                            Далее <ChevronRight size={16} />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={loading || !name.trim()}
                            className="apple-button min-w-[160px] flex items-center justify-center gap-2"
                        >
                            {loading ? 'Создание...' : '🚀 Запустить ВМ'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
