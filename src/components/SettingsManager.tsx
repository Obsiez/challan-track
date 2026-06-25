import React, { useState } from 'react';
import { Customer, Transaction, UserSettings } from '../types';
import { 
 Settings, Moon, Sun, Cloud, Download, LogOut, CheckCircle2, Globe 
} from 'lucide-react';
import { auth } from '../firebase';
import { translations, formatNumber, Language } from '../lib/translations';

interface SettingsManagerProps {
 settings: UserSettings | null;
 updateTheme: (theme: 'light' | 'dark') => Promise<void>;
 customers: Customer[];
 transactions: Transaction[];
 onSignOut: () => void;
 lang: Language;
 onLangChange: (lang: Language) => void;
}

export default function SettingsManager({
 settings,
 updateTheme,
 customers,
 transactions,
 onSignOut,
 lang,
 onLangChange
}: SettingsManagerProps) {
 const t = translations[lang];

 const [hapticsOn, setHapticsOn] = useState(() => localStorage.getItem('haptics') === 'true');

 const toggleHaptics = () => {
 const newVal = !hapticsOn;
 setHapticsOn(newVal);
 localStorage.setItem('haptics', String(newVal));
 if (newVal) window.navigator?.vibrate?.(50);
 };

 const handleBackupExport = () => {
 const backupData = {
 backupTimestamp: new Date().toISOString(),
 ownerEmail: settings?.email || 'unknown',
 customers: customers.map(c => ({
 name: c.name,
 phone: c.phone,
 outstandingDue: c.outstandingDue,
 createdAt: c.createdAt
 })),
 ledgerTransactions: transactions.map(t => ({
 customer: t.customerName,
 type: t.type,
 amount: t.amount,
 description: t.description,
 date: t.date
 }))
 };

 const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `ChallanTrack_Backup_${new Date().toISOString().slice(0, 10)}.json`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 };

 const activeTheme = settings?.theme || 'light';

 return (
 <div className="space-y-6 no-select">
 
 {/* 1. LANGUAGE SELECTOR CARD */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-md space-y-4">
 <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
 <Globe className="w-5 h-5 text-emerald-500" />
 {t.displayLang}
 </h2>
 
 <div className="grid grid-cols-2 gap-4">
 <button
 type="button"
 onClick={() => {
    if (localStorage.getItem('haptics') === 'true') window.navigator?.vibrate?.(50);
    onLangChange('en');
  }}
 className={`py-4 px-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
 lang === 'en'
 ? 'bg-emerald-50 border-emerald-500 text-emerald-600 font-bold dark:bg-emerald-950/20'
 : 'bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-50/50 dark:hover:bg-zinc-850/50'
 }`}
 >
 <span className="text-lg font-black">{t.english}</span>
 <span className="text-xs opacity-75">English System</span>
 </button>

 <button
 type="button"
 onClick={() => {
    if (localStorage.getItem('haptics') === 'true') window.navigator?.vibrate?.(50);
    onLangChange('bn');
  }}
 className={`py-4 px-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
 lang === 'bn'
 ? 'bg-emerald-50 border-emerald-500 text-emerald-600 font-bold dark:bg-emerald-950/20 dark:text-emerald-400'
 : 'bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-50/50 dark:hover:bg-zinc-850/50'
 }`}
 >
 <span className="text-lg font-black">{t.bangla}</span>
 <span className="text-xs opacity-75">বাংলা সংস্করণ</span>
 </button>
 </div>
 </div>

 {/* 2. THEME AND LIGHTING TOGGLE CARD */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-md space-y-4">
 <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
 <Settings className="w-5 h-5 text-emerald-500" />
 {t.themeMode}
 </h2>
 <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
 {lang === 'bn' 
 ? 'ইজি ডিউ ট্র্যাকারকে আপনার সুবিধাজনক আলোতে রূপ দিন। কাজের ক্ষেত্র উজ্জ্বল রোদে বা রাতে চোখের সুরক্ষায় আরামদায়ক থিম ব্যবহার করুন।' 
 : 'Tailor Challan Track to the most comforting view. Perfect for outdoor sunny fields or dark indoor offices.'}
 </p>

 <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
 <button
 type="button"
 onClick={() => {
    if (localStorage.getItem('haptics') === 'true') window.navigator?.vibrate?.(50);
    updateTheme('light');
  }}
 className={`py-4 px-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
 activeTheme === 'light'
 ? 'bg-zinc-55 border-emerald-500 text-emerald-600 font-bold dark:bg-zinc-850'
 : 'bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-50/50 dark:hover:bg-zinc-850/50'
 }`}
 >
 <Sun className="w-6 h-6 stroke-[2]" />
 <span className="text-base">{t.lightMode}</span>
 </button>

 <button
 type="button"
 onClick={() => {
    if (localStorage.getItem('haptics') === 'true') window.navigator?.vibrate?.(50);
    updateTheme('dark');
  }}
 className={`py-4 px-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
 activeTheme === 'dark'
 ? 'bg-zinc-950 border-emerald-500 text-emerald-400 font-bold'
 : 'bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-50/50 dark:hover:bg-zinc-850/50'
 }`}
 >
 <Moon className="w-6 h-6 stroke-[2]" />
 <span className="text-base">{t.darkMode}</span>
 </button>
 </div>
 </div>

 {/* HAPTICS TOGGLE CARD */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-md space-y-4">
 <div className="flex items-center justify-between">
   <div>
     <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
       {lang === 'bn' ? 'ভাইব্রেশন' : 'Haptic Feedback'}
     </h2>
     <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
       {lang === 'bn' ? 'বাটনে চাপ দিলে হালকা ভাইব্রেশন হবে' : 'Vibrate on button press'}
     </p>
   </div>
   <button
     onClick={toggleHaptics}
     className={`w-14 h-8 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
       hapticsOn ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'
     }`}
   >
     <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform ${
       hapticsOn ? 'translate-x-6' : 'translate-x-0'
     }`} />
   </button>
 </div>
 </div>

 {/* 3. BUSINESS LEDGER INSIGHT STATISTICS */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-md space-y-4">
 <h3 className="text-lg font-bold text-zinc-850 dark:text-white uppercase tracking-wider">
 {t.ledgerInsights}
 </h3>
 <div className="grid grid-cols-2 gap-4">
 <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-850">
 <span className="text-3xs font-bold text-zinc-400 block uppercase">{t.totalClients}</span>
 <span className="text-xl font-bold text-zinc-800 dark:text-white mt-1 block">
 {formatNumber(customers.length, lang)}
 </span>
 </div>
 <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-850">
 <span className="text-3xs font-bold text-zinc-400 block uppercase">{t.totalTransactions}</span>
 <span className="text-xl font-bold text-zinc-800 dark:text-white mt-1 block">
 {formatNumber(transactions.length, lang)}
 </span>
 </div>
 </div>
 </div>

 {/* 4. AUTOMATIC CLOUD AND OFFLINE BACKUP (HUMBLE, LITERAL LABEL) */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-md space-y-4">
 <h3 className="text-lg font-bold text-zinc-800 dark:text-white flex items-center gap-2">
 <Cloud className="w-5 h-5 text-sky-500" />
 {t.databaseSafety}
 </h3>
 
 <div className="p-4 bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 rounded-xl space-y-3">
 <div className="flex items-start gap-3">
 <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
 <div>
 <div className="text-sm font-bold text-sky-900 dark:text-sky-400">{t.connectedCloud}</div>
 <p className="text-xs text-sky-700 dark:text-sky-500 mt-1 leading-snug">
 {t.allCalculationsSynced}
 </p>
 </div>
 </div>
 </div>

 {/* Offline Backup Export action */}
 <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
 <div>
 <div className="text-sm font-bold text-zinc-800 dark:text-white">{lang === 'bn' ? 'ব্যাকআপ লিখন ডাউনলোড (.json)' : 'Save Backup (.json)'}</div>
 <p className="text-xs text-zinc-500">{lang === 'bn' ? 'সরাসরি ব্যাকআপ হিসাব ডাউনলোড করে রাখুন।' : 'Download a full ledger copy for safe keeping.'}</p>
 </div>
 
 <button
 onClick={handleBackupExport}
 className="px-5 py-3.5 bg-emerald-600 hover:bg-emerald-700 font-extrabold text-white rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors"
 >
 <Download className="w-4 h-4 text-white" />
 {lang === 'bn' ? 'ব্যাকআপ ফাইল সংরক্ষণ' : 'Download Backup File'}
 </button>
 </div>
 </div>

 {/* 5. OWNER PROFILE ACCOUNT DETAIL */}
 <div className="bg-rose-50/30 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div>
 <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">{lang === 'bn' ? 'মালিকানা অ্যাকাউন্ট' : 'Owner Account'}</div>
 <div className="text-base font-black text-zinc-800 dark:text-white mt-1">
 {auth.currentUser?.displayName || (lang === 'bn' ? 'সম্মানিত লেজার মালিক' : 'Business Owner')}
 </div>
 <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{settings?.email || 'N/A'}</p>
 </div>

 <button
 onClick={onSignOut}
 className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
 >
 <LogOut className="w-4 h-4" />
 {t.signOutBtn}
 </button>
 </div>

 </div>
 );
}
