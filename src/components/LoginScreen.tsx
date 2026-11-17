import React, { useState } from 'react';
import { Shield, Lock, User as UserIcon, AlertCircle, ArrowLeft, Chrome } from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { api } from '../services/api';
import { User } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setErrorMessage('لطفاً نام کاربری و رمز عبور را وارد فرمایید.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      const res = await api.login(username, password);

      if (res.success && res.data?.user) {
        localStorage.setItem('hr_auth_token', res.data.token);
        localStorage.setItem('hr_current_user', JSON.stringify(res.data.user));
        onLoginSuccess(res.data.user);
      } else {
        setErrorMessage(res.message || 'نام کاربری یا رمز عبور اشتباه است.');
      }
    } catch {
      setErrorMessage('خطا در برقراری ارتباط با پایگاه داده سرور. لطفاً مجدداً تلاش کنید.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true);
      setErrorMessage('');
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken();
      const res = await api.firebaseLogin(idToken);

      if (res.success && res.data?.user) {
        localStorage.setItem('hr_auth_token', res.data.token);
        localStorage.setItem('hr_current_user', JSON.stringify(res.data.user));
        onLoginSuccess(res.data.user);
      } else {
        setErrorMessage(res.message || 'حساب گوگل شما مجوز ورود به این سامانه را ندارد.');
      }
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setErrorMessage('پنجره ورود با گوگل بسته شد.');
      } else if (code === 'auth/popup-blocked') {
        setErrorMessage('مرورگر پنجره بازشو (Popup) را مسدود کرده است. لطفاً اجازه باز شدن پنجره را بدهید یا از نام کاربری و رمز عبور استفاده کنید.');
      } else if (code === 'auth/network-request-failed') {
        setErrorMessage('اتصال مستقیم مرورگر به سرویس گوگل برقرار نشد. در صورت نداشتن دسترسی به گوگل، می‌توانید با نام کاربری و رمز عبور از طریق سرور وارد شوید.');
      } else {
        setErrorMessage('خطا در ورود با حساب گوگل: ' + (err?.message || 'نامشخص'));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 p-8 text-white text-center relative">
          <div className="w-16 h-16 mx-auto mb-4 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
            <Shield className="w-8 h-8 text-indigo-200" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">سامانه جامع راهبردی شرکت نگین پرتو نصر</h1>
          <p className="text-xs text-indigo-200 mt-1">مدیریت پرسنلی، عملیات معدنی، حقوق، کارانه و داشبورد مدیر عامل</p>
        </div>

        {/* Form */}
        <div className="p-8">
          {errorMessage && (
            <div className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2.5">
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
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="نام کاربری خود را وارد کنید"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  required
                />
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                رمز عبور
              </label>
              <div className="relative">
                <input
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  required
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 mt-4 cursor-pointer"
            >
              {loading ? (
                <span>در حال تأیید هویت...</span>
              ) : (
                <>
                  <span>ورود به پنل کارگزینی</span>
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] font-bold text-slate-400">یا ورود ابری با Firebase Auth</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading || googleLoading}
            className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <Chrome className="w-4 h-4 text-indigo-600" />
            <span>
              {googleLoading ? 'در حال اتصال به حساب گوگل...' : 'ورود با حساب گوگل (مدیر ارشد / همگام‌سازی ابری)'}
            </span>
          </button>

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
