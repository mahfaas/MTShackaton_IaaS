import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
    const { login } = useAuth();
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await api.post('/auth/register', { email, password });

            // Auto-login after successful registration
            const formData = new URLSearchParams();
            formData.append('username', email);
            formData.append('password', password);

            const tokenResponse = await api.post('/auth/login', formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const token = tokenResponse.data.access_token;

            sessionStorage.setItem('token', token);
            const userResponse = await api.get('/auth/me');

            login(token, userResponse.data);
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.detail || 'Registration failed. Try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="apple-card w-full max-w-md p-8">
                <div className="flex flex-col items-center mb-8">
                    <img src="/logo.png" alt="Тучка МТС" className="h-16 mb-4 object-contain" />
                    <h1 className="text-2xl font-semibold tracking-tight">Создать аккаунт</h1>
                    <p className="text-gray-500 mt-2 text-sm">Присоединяйтесь к облачной платформе Тучка</p>
                </div>

                {error && (
                    <div className="mb-6 p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 flex items-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleRegister} className="space-y-4" autoComplete="off" data-form-type="other">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="apple-input"
                            required
                            placeholder="user@example.com"
                            autoComplete="nope"
                            data-lpignore="true"
                            data-form-type="other"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">Пароль</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="apple-input w-full pr-10"
                                required
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="apple-button w-full py-3 mt-4"
                    >
                        {loading ? 'Создание...' : 'Создать аккаунт'}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-gray-500">
                    Уже есть аккаунт?{' '}
                    <Link to="/login" className="font-medium hover:underline" style={{ color: '#E30611' }}>
                        Войти
                    </Link>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-100">
                    <div className="bg-gray-50 rounded-2xl p-4 text-center">
                        <p className="text-xs text-gray-500 mb-2">Хотите подключить свою компанию?</p>
                        <p className="text-sm font-medium text-gray-700 mb-1">📞 8 (800) 250-08-90</p>
                        <p className="text-xs text-gray-400">Свяжитесь с нами для создания корпоративного тенанта</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
