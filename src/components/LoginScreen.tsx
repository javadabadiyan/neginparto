import React, { useState } from 'react';
import { Shield, Lock, User as UserIcon, AlertCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';
import { User } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [noticeMessage, setNoticeMessage] = useState<string>(() => {
    try {
      const reason = sessionStorage.getItem('hr_logout_reason') || '';
      if (reason) sessionStorage.removeItem('hr_logout_reason');
      return reason;
    } catch {
      return '';
    }
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setErrorMessage('لطفاً نام کاربری و رمز عبور را وارد فرمایید.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      setNoticeMessage('');
      const res = await api.login(username, password);

      if (res.success && res.data?.user) {
        const expiresAt = Number(res.data.expiresAt || Date.now() + 2 * 60 * 60 * 1000);
        localStorage.setItem('hr_auth_token', res.data.token);
        localStorage.setItem('hr_current_user', JSON.stringify(res.data.user));
        localStorage.setItem('hr_auth_expires_at', String(expiresAt));
        try {
          sessionStorage.removeItem('hr_logout_reason');
        } catch {
          // ignore
        }
        onLoginSuccess(res.data.user);
      } else {
        setErrorMessage(res.message || 'نام کاربری یا رمز عبور اشتباه است.');
      }
    } catch {
      setErrorMessage('خطا در برقراری ارتباط با پایگاه داده. لطفاً مجدداً تلاش کنید.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-slate-100 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 px-5 py-7 sm:p-8 text-white text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3.5 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
            <Shield className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-200" />
          </div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight leading-snug text-balance">
            سامانه جامع راهبردی شرکت نگین پرتو نصر
          </h1>
        </div>

        {/* Form */}
        <div className="p-5 sm:p-8">
          {noticeMessage && !errorMessage && (
            <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2.5 font-medium">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{noticeMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                نام کاربری
              </label>
              <div className="relative">
                <input
                  type="text"
                  dir="ltr"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="نام کاربری خود را وارد کنید"
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  required
                />
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                رمز عبور
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] pl-16 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  required
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'مخفی کردن رمز عبور' : 'نمایش رمز عبور'}
                  className="absolute left-9 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[46px] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 mt-4 cursor-pointer"
            >
              {loading ? (
                <span>در حال تأیید هویت...</span>
              ) : (
                <>
                  <span>ورود به سامانه</span>
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <span className="text-xs text-slate-500 font-medium">
              طراحی و کد نویسی جواد آبادیان
            </span>
          </div>

        </div>

      </div>
    </div>
  );
};
