import React, { useState, useEffect } from 'react';
import { Customer, Transaction, UserSettings } from '../types';
import { 
 Settings, Moon, Sun, Cloud, Download, Upload, LogOut, CheckCircle2, Globe, AlertTriangle, X, RotateCcw, Trash2, Contrast 
} from 'lucide-react';
import { auth } from '../firebase';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { translations, formatNumber, Language } from '../lib/translations';
import { triggerHaptic } from '../lib/haptics';

interface SettingsManagerProps {
  theme: 'light' | 'dark';
  trashCustomers: Customer[];
  restoreCustomer: (customerId: string) => Promise<void>;
  permanentlyDeleteCustomer: (customerId: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  swipeGesturesEnabled: boolean;
  onSwipeGesturesToggle: (val: boolean) => void;
 settings: UserSettings | null;
 updateTheme: (theme: 'light' | 'dark') => Promise<void>;
 customers: Customer[];
 transactions: Transaction[];
 onSignOut: () => void;
 lang: Language;
 onLangChange: (lang: Language) => void;
 deferredPrompt: any;
 onInstallComplete: () => void;
 importLedgerData: (backupData: any, choice: 'merge' | 'clear' | 'skip') => Promise<void>;
}

export default function SettingsManager({
  theme,
  trashCustomers,
  restoreCustomer,
  permanentlyDeleteCustomer,
  emptyTrash,
  swipeGesturesEnabled,
  onSwipeGesturesToggle,
 settings,
 updateTheme,
 customers,
 transactions,
 onSignOut,
 lang,
 onLangChange,
 deferredPrompt,
 onInstallComplete,
 importLedgerData
}: SettingsManagerProps) {
 const t = translations[lang];

  const [hapticsOn, setHapticsOn] = useState(() => localStorage.getItem('haptics') === 'true');
  const [confirmAction, setConfirmAction] = useState<any>(null);
  const [hapticIntensity, setHapticIntensity] = useState(() => 
    parseInt(localStorage.getItem('haptic_intensity') || '3')
  );

  const [importState, setImportState] = useState<{
    showModal: boolean;
    backupData: any;
    choice: 'merge' | 'clear' | 'skip';
    confirmText: string;
    loading: boolean;
  }>({
    showModal: false,
    backupData: null,
    choice: 'merge',
    confirmText: '',
    loading: false
  });

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    triggerHaptic('single');
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json || !Array.isArray(json.customers) || !Array.isArray(json.ledgerTransactions)) {
          toast.error(lang === 'bn' ? 'অকার্যকর ব্যাকআপ ফাইল!' : 'Invalid backup file structure!');
          return;
        }
        setImportState({
          showModal: true,
          backupData: json,
          choice: 'merge',
          confirmText: '',
          loading: false
        });
        triggerHaptic('single');
      } catch (err) {
        toast.error(lang === 'bn' ? 'ফাইলটি পড়তে সমস্যা হয়েছে!' : 'Failed to parse JSON file!');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Scroll lock when modal is active
  useEffect(() => {
    if (confirmAction || importState.showModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [confirmAction, importState.showModal]);
  const [isDismissed, setIsDismissed] = useState(() => localStorage.getItem('install_card_dismissed') === 'true');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;

 const toggleHaptics = () => {
    const newVal = !hapticsOn;
    setHapticsOn(newVal);
    localStorage.setItem('haptics', String(newVal));
    if (newVal) triggerHaptic('single');
  };

  const changeHapticIntensity = (val: number) => {
    setHapticIntensity(val);
    localStorage.setItem('haptic_intensity', String(val));
    triggerHaptic('single');
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
    triggerHaptic('single');
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
    triggerHaptic('single');
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
  <Contrast className="w-5 h-5 text-emerald-500" />
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
    triggerHaptic('single');
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
    triggerHaptic('single');
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

  {hapticsOn && (
    <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
      <div className="flex justify-between items-center text-sm font-bold text-zinc-700 dark:text-zinc-300">
        <span>{t.hapticIntensity}</span>
        <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
          {hapticIntensity === 1 ? t.intensityLight
           : hapticIntensity === 2 ? t.intensitySoft
           : hapticIntensity === 3 ? t.intensityMedium
           : hapticIntensity === 4 ? t.intensityFirm
           : t.intensityStrong}
        </span>
      </div>
      <input 
        type="range"
        min="1"
        max="5"
        step="1"
        value={hapticIntensity}
        onChange={(e) => changeHapticIntensity(Number(e.target.value))}
        className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 dark:accent-emerald-400"
      />
      <div className="flex justify-between text-[10px] font-extrabold text-zinc-400 dark:text-zinc-500 px-1">
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5</span>
      </div>
    </div>
  )}
  </div>

   {/* SWIPE GESTURES TOGGLE CARD */}
  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-md space-y-4">
  <div className="flex items-center justify-between">
    <div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
        {lang === 'bn' ? 'স্লাইড জেসচার' : 'Swipe Gestures'}
      </h2>
      <p className="text-sm text-zinc-555 dark:text-zinc-400 mt-1">
        {lang === 'bn' ? 'টেনে রিমাইন্ডার পাঠানো বা ডিলিট করা' : 'Swipe to remind or delete customers'}
      </p>
    </div>
    <button
      onClick={() => onSwipeGesturesToggle(!swipeGesturesEnabled)}
      className={`w-14 h-8 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
        swipeGesturesEnabled ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'
      }`}
    >
      <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform ${
        swipeGesturesEnabled ? 'translate-x-6' : 'translate-x-0'
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
  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
    <button
    onClick={handleBackupExport}
    className="px-5 py-3.5 bg-emerald-600 hover:bg-emerald-700 font-extrabold text-white rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors"
    >
    <Download className="w-4 h-4 text-white" />
    {lang === 'bn' ? 'ব্যাকআপ ফাইল সংরক্ষণ' : 'Download Backup File'}
    </button>

    <button
    type="button"
    onClick={handleImportClick}
    className="px-5 py-3.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-extrabold text-zinc-800 dark:text-zinc-200 border border-zinc-250 dark:border-zinc-700 rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors"
    >
    <Upload className="w-4 h-4" />
    {lang === 'bn' ? 'ব্যাকআপ ফাইল আপলোড' : 'Upload Backup File'}
    </button>
    
    <input
      type="file"
      ref={fileInputRef}
      onChange={handleFileChange}
      accept=".json"
      className="hidden"
    />
  </div>
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

  {/* 6. NATIVE PWA INSTALL APP */}
  {!isDismissed && !isStandalone && deferredPrompt && (
     <div className="relative bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
       {/* Dismiss Button */}
       <button 
         onClick={() => {
           localStorage.setItem('install_card_dismissed', 'true');
           setIsDismissed(true);
         }}
         className="absolute top-3 right-3 p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-full cursor-pointer transition-colors sm:hidden"
         title={lang === 'bn' ? 'বন্ধ করুন' : 'Dismiss'}
       >
         <X className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
       </button>
      <div>
        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-wide">
          {lang === 'bn' ? 'অ্যাপ ইনস্টল করুন' : 'Install App'}
        </div>
        <div className="text-base font-black text-zinc-900 dark:text-white mt-1">
          {lang === 'bn' ? 'হোম স্ক্রিনে যুক্ত করুন' : 'Add to Home Screen'}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          {lang === 'bn' ? 'দ্রুত অ্যাক্সেস এবং ফুলস্ক্রিন অভিজ্ঞতার জন্য অ্যাপটি ইনস্টল করুন।' : 'Install the app for quick access and a fullscreen experience.'}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto">
        {/* Dismiss Button (Desktop only) */}
        <button 
          type="button"
          onClick={() => {
            localStorage.setItem('install_card_dismissed', 'true');
            setIsDismissed(true);
          }}
          className="hidden sm:inline-flex px-5 py-3 border border-emerald-250 dark:border-emerald-800 bg-transparent hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-500 font-extrabold rounded-xl text-sm justify-center items-center cursor-pointer transition-colors"
        >
          {lang === 'bn' ? 'বন্ধ করুন' : 'Dismiss'}
        </button>
        <button
          onClick={async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
              onInstallComplete();
            }
          }}
          className="flex-1 sm:flex-none px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors shrink-0"
        >
          <Download className="w-4 h-4 text-white" />
          {lang === 'bn' ? 'ইনস্টল' : 'Install'}
        </button>
      </div>
    </div>
  )}

 

  {/* TRASH / DELETED CUSTOMER ACCOUNTS CARD */}
  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-md space-y-4">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-rose-600 dark:text-rose-455 flex items-center gap-2">
          <Trash2 className="w-5 h-5" />
          {lang === 'bn' ? 'অস্থায়ী ট্র্যাশ (মুছে ফেলা গ্রাহক)' : 'Trash (Deleted Customers)'}
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          {lang === 'bn' 
            ? 'ভুলবশত মুছে ফেলা গ্রাহক এখান থেকে উদ্ধার করা যাবে। ৭ দিন পর স্থায়ীভাবে ডিলিট হবে।' 
            : 'Recover mistakenly deleted customers. Items are automatically permanently deleted after 7 days.'}
        </p>
      </div>

      {trashCustomers.length > 0 && (
        <button
          onClick={() => setConfirmAction({ type: 'empty_trash' })}
          className="px-4 py-2 border-2 border-rose-500 hover:bg-rose-500 hover:text-white dark:hover:text-zinc-950 font-bold text-rose-500 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {lang === 'bn' ? 'ট্র্যাশ খালি করুন' : 'Empty Trash'}
        </button>
      )}
    </div>

    {trashCustomers.length > 0 ? (
      <div className="space-y-3 pt-2 max-h-96 overflow-y-auto pr-1">
        {trashCustomers.map(c => {
          const deletionTime = c.deletedAt ? new Date(c.deletedAt).getTime() : new Date().getTime();
          const msPassed = new Date().getTime() - deletionTime;
          const daysRemaining = Math.max(1, 7 - Math.floor(msPassed / (24 * 60 * 60 * 1000)));

          return (
            <div 
              key={c.id} 
              className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-base font-bold text-zinc-900 dark:text-white truncate">
                  {c.name}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {c.phone || (lang === 'bn' ? '(ফোন নম্বর নেই)' : '(No phone)')}
                </div>
                <div className="text-xs font-semibold text-rose-500 mt-1">
                  {lang === 'bn' 
                    ? `স্থায়ীভাবে মুছতে ${formatNumber(daysRemaining, 'bn')} দিন বাকি` 
                    : `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining`}
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                <div className="text-left sm:text-right">
                  <div className="text-3xs font-bold text-zinc-400 uppercase tracking-wide">
                    {lang === 'bn' ? 'ব্যালেন্স' : 'Balance'}
                  </div>
                  <div className={`text-base font-black ${
                    c.outstandingDue > 0 
                      ? 'text-rose-600 dark:text-rose-455' 
                      : c.outstandingDue < 0 
                        ? 'text-cyan-600 dark:text-cyan-400' 
                        : 'text-zinc-400 dark:text-zinc-500'
                  }`}>
                    ৳ {formatNumber(c.outstandingDue || 0, lang)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfirmAction({ type: 'restore', customer: c })}
                    title={lang === 'bn' ? 'পুনরুদ্ধার করুন' : 'Restore'}
                    className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-650 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 dark:text-emerald-450 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setConfirmAction({ type: 'delete_perm', customer: c })}
                    title={lang === 'bn' ? 'স্থায়ীভাবে মুছুন' : 'Delete Permanently'}
                    className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-655 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 dark:text-rose-455 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-400 text-sm font-semibold">
        {lang === 'bn' ? 'ট্র্যাশ খালি আছে' : 'Trash is empty'}
      </div>
    )}
  </div>

  {/* Trash Action Confirmation Modal */}
  {confirmAction && (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-zinc-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
      >
        <div className="text-center mb-6">
          <div className={"w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 " + (
            confirmAction.type === 'restore' 
              ? 'bg-emerald-100 dark:bg-emerald-900/30' 
              : 'bg-rose-100 dark:bg-rose-900/30'
          )}>
            {confirmAction.type === 'restore' ? (
              <RotateCcw className="w-8 h-8 text-emerald-600 dark:text-emerald-500" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-rose-600 dark:text-rose-500" />
            )}
          </div>
          
          <h3 className={"text-lg font-black mb-2 " + (
            confirmAction.type === 'restore' 
              ? 'text-emerald-600 dark:text-emerald-455' 
              : 'text-rose-600 dark:text-rose-455'
          )}>
            {confirmAction.type === 'empty_trash' && (lang === 'bn' ? 'ট্র্যাশ সম্পূর্ণ খালি করুন' : 'Empty Trash')}
            {confirmAction.type === 'restore' && (lang === 'bn' ? 'গ্রাহক অ্যাকাউন্ট পুনরুদ্ধার' : 'Restore Customer Account')}
            {confirmAction.type === 'delete_perm' && (lang === 'bn' ? 'স্থায়ীভাবে মুছে ফেলুন' : 'Delete Account Permanently')}
          </h3>
          
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {confirmAction.type === 'empty_trash' && (
              lang === 'bn' 
                ? 'আপনি কি নিশ্চিত সব ট্র্যাশ স্থায়ীভাবে খালি করতে চান? এই হিসাব আর কখনো ফিরে পাওয়া যাবে না!' 
                : 'Are you sure you want to permanently empty the trash? All customer profiles, ledger entries, and reminders will be deleted forever!'
            )}
            {confirmAction.type === 'restore' && (
              lang === 'bn' 
                ? 'আপনি কি নিশ্চিত এই গ্রাহকের সম্পূর্ণ অ্যাকাউন্ট এবং আগের লেনদেনের বিবরণ পুনরুদ্ধার করতে চান?' 
                : 'Are you sure you want to restore this customer account and all their historical transactions?'
            )}
            {confirmAction.type === 'delete_perm' && (
              lang === 'bn' 
                ? 'আপনি কি নিশ্চিত এই গ্রাহকের অ্যাকাউন্টটি স্থায়ীভাবে মুছে ফেলতে চান? এটি আর পুনরুদ্ধার করা সম্ভব হবে না!' 
                : 'Are you sure you want to permanently delete this customer account? All ledger entries and reminders will be lost forever.'
            )}
          </p>
          
          {/* Details Card */}
          {confirmAction.customer && (
            <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-left space-y-2.5 mt-4">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'নাম' : 'Name'}</span>
                <span className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200 truncate max-w-[200px]">{confirmAction.customer.name}</span>
              </div>
              {confirmAction.customer.phone && (
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'মোবাইল' : 'Mobile'}</span>
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{confirmAction.customer.phone}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'বর্তমান ব্যালেন্স' : 'Current Balance'}</span>
                <span className={"text-sm font-black " + (
                  confirmAction.customer.outstandingDue > 0 
                    ? 'text-rose-600 dark:text-rose-455' 
                    : confirmAction.customer.outstandingDue < 0 
                      ? 'text-cyan-600 dark:text-cyan-400' 
                      : 'text-zinc-500'
                )}>
                  {confirmAction.customer.outstandingDue === 0 ? (lang === 'bn' ? 'পরিশোধিত' : 'Settled') : "৳ " + formatNumber(confirmAction.customer.outstandingDue, lang)}
                </span>
              </div>
            </div>
          )}
        </div>
        
        <div className="flex flex-col gap-3">
          <button
            onClick={async () => {
              const type = confirmAction.type;
              const customer = confirmAction.customer;
              setConfirmAction(null);
              
              triggerHaptic('single');
              
              if (type === 'empty_trash') {
                await emptyTrash();
                toast.success(lang === 'bn' ? 'ট্র্যাশ সফলভাবে খালি করা হয়েছে' : 'Trash emptied successfully');
              } else if (type === 'restore' && customer) {
                await restoreCustomer(customer.id);
                toast.success(lang === 'bn' ? 'গ্রাহক পুনরুদ্ধার করা হয়েছে' : 'Customer restored successfully');
              } else if (type === 'delete_perm' && customer) {
                await permanentlyDeleteCustomer(customer.id);
                toast.success(lang === 'bn' ? 'গ্রাহক স্থায়ীভাবে ডিলিট হয়েছে' : 'Customer permanently deleted');
              }
            }}
            className={"w-full py-4 text-white font-bold rounded-xl cursor-pointer " + (
              confirmAction.type === 'restore' 
                ? 'bg-emerald-600 hover:bg-emerald-700' 
                : 'bg-rose-600 hover:bg-rose-700'
            )}
          >
            {confirmAction.type === 'restore' && (lang === 'bn' ? 'হ্যাঁ, পুনরুদ্ধার করুন' : 'Yes, Restore')}
            {confirmAction.type === 'empty_trash' && (lang === 'bn' ? 'হ্যাঁ, খালি করুন' : 'Yes, Empty Trash')}
            {confirmAction.type === 'delete_perm' && (lang === 'bn' ? 'হ্যাঁ, স্থায়ীভাবে মুছুন' : 'Yes, Delete Permanently')}
          </button>
          
          <button
            onClick={() => setConfirmAction(null)}
            className="w-full py-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 font-bold rounded-xl cursor-pointer"
          >
            {lang === 'bn' ? 'বাতিল' : 'Cancel'}
          </button>
        </div>
      </motion.div>
    </div>
  )}

  {/* JSON Backup Import Modal */}
  {importState.showModal && (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-zinc-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-lg font-black text-zinc-900 dark:text-white">
            {lang === 'bn' ? 'ব্যাকআপ ডাটা ইম্পোর্ট করুন' : 'Import Backup Data'}
          </h3>
          <button
            onClick={() => setImportState(prev => ({ ...prev, showModal: false }))}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full cursor-pointer transition-colors"
            disabled={importState.loading}
          >
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {/* File Meta Info */}
          <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl space-y-1.5 text-xs text-zinc-650 dark:text-zinc-400">
            <div className="flex justify-between">
              <span>{lang === 'bn' ? 'ব্যাকআপ সময়:' : 'Backup Date:'}</span>
              <span className="font-bold">
                {importState.backupData.backupTimestamp 
                  ? new Date(importState.backupData.backupTimestamp).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US') 
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{lang === 'bn' ? 'গ্রাহক সংখ্যা:' : 'Total Customers:'}</span>
              <span className="font-bold">{importState.backupData.customers?.length || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>{lang === 'bn' ? 'লেনদেনের সংখ্যা:' : 'Total Transactions:'}</span>
              <span className="font-bold">{importState.backupData.ledgerTransactions?.length || 0}</span>
            </div>
          </div>

          <div className="space-y-3">
            {/* Choice 1 Option Card */}
            <button
              onClick={() => setImportState(prev => ({ ...prev, choice: 'merge' }))}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all cursor-pointer flex gap-3 ${
                importState.choice === 'merge'
                  ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/10'
                  : 'border-zinc-200 dark:border-zinc-850 bg-transparent hover:bg-zinc-50/50 dark:hover:bg-zinc-850/50'
              }`}
              disabled={importState.loading}
            >
              <div className="shrink-0 mt-0.5">
                <input
                  type="radio"
                  checked={importState.choice === 'merge'}
                  onChange={() => {}}
                  className="accent-emerald-500 w-4 h-4 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-zinc-800 dark:text-white">
                    {lang === 'bn' ? '১. মার্জ ও আপডেট (সুপারিশকৃত)' : 'Choice 1: Merge & Update (Recommended Default)'}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 rounded-full">
                    {lang === 'bn' ? 'প্রস্তাবিত' : 'Recommended'}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-normal">
                  {lang === 'bn' 
                    ? 'ফাইলটি লাইভ ডাটাবেসের সাথে তুলনা করে অনুপস্থিত এন্ট্রি যোগ করবে এবং কোনো পরিবর্তন থাকলে আপডেট করবে। একাধিক ডিভাইসে সিঙ্ক করার জন্য উপযুক্ত।' 
                    : 'Compares the file with the live database. It adds missing entries and updates existing ones if changes are found. Good for syncing across multiple devices.'}
                </p>
              </div>
            </button>

            {/* Choice 3 Option Card */}
            <button
              onClick={() => setImportState(prev => ({ ...prev, choice: 'skip' }))}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all cursor-pointer flex gap-3 ${
                importState.choice === 'skip'
                  ? 'border-sky-500 bg-sky-50/20 dark:bg-sky-950/10'
                  : 'border-zinc-200 dark:border-zinc-850 bg-transparent hover:bg-zinc-50/50 dark:hover:bg-zinc-850/50'
              }`}
              disabled={importState.loading}
            >
              <div className="shrink-0 mt-0.5">
                <input
                  type="radio"
                  checked={importState.choice === 'skip'}
                  onChange={() => {}}
                  className="accent-sky-500 w-4 h-4 cursor-pointer"
                />
              </div>
              <div>
                <span className="text-sm font-black text-zinc-800 dark:text-white">
                  {lang === 'bn' ? '৩. ডুপ্লিকেট এড়িয়ে যান' : 'Choice 3: Skip Duplicates'}
                </span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-normal">
                  {lang === 'bn' 
                    ? 'শুধুমাত্র নতুন এন্ট্রিগুলো যুক্ত করবে যা বর্তমান ডাটাবেসে নেই। বিদ্যমান রেকর্ডগুলোকে সম্পূর্ণ অপরিবর্তিত রাখবে। ভুলবশত মুছে ফেলা রেকর্ড উদ্ধারে সহায়ক।' 
                    : 'Only imports entries from the .json file that do not exist at all in the current live database. Leaves existing records untouched. Good for recovering deleted items safely.'}
                </p>
              </div>
            </button>

            {/* Choice 2 Option Card */}
            <button
              onClick={() => setImportState(prev => ({ ...prev, choice: 'clear' }))}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all cursor-pointer flex gap-3 ${
                importState.choice === 'clear'
                  ? 'border-rose-500 bg-rose-50/25 dark:bg-rose-950/20'
                  : 'border-zinc-200 dark:border-zinc-850 bg-transparent hover:bg-rose-50/10 dark:hover:bg-rose-950/10'
              }`}
              disabled={importState.loading}
            >
              <div className="shrink-0 mt-0.5">
                <input
                  type="radio"
                  checked={importState.choice === 'clear'}
                  onChange={() => {}}
                  className="accent-rose-500 w-4 h-4 cursor-pointer"
                />
              </div>
              <div>
                <span className="text-sm font-black text-rose-600 dark:text-rose-455">
                  {lang === 'bn' ? '২. মুছুন ও প্রতিস্থাপন করুন (সম্পূর্ণ রিস্টোর)' : 'Choice 2: Clear & Replace (Full Restore)'}
                </span>
                <p className="text-xs text-rose-600/90 dark:text-rose-400/90 mt-1 leading-normal">
                  {lang === 'bn' 
                    ? 'সতর্কতা: বর্তমান ডাটাবেসের সমস্ত তথ্য মুছে ফেলবে এবং ব্যাকআপ ফাইল দিয়ে প্রতিস্থাপন করবে। সম্পূর্ণ নতুন ডিভাইসে স্থানান্তর বা নষ্ট ডাটাবেস মেরামতের জন্য।' 
                    : 'WARNING: Completely wipes the existing live database and replaces it entirely with the data from the .json file. Good for new devices or fixing corrupted databases.'}
                </p>
              </div>
            </button>

            {/* Choice 2 Secondary Verification Input */}
            {importState.choice === 'clear' && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 p-4 rounded-xl space-y-2.5"
              >
                <label className="text-xs font-bold text-rose-700 dark:text-rose-400 block leading-tight">
                  {lang === 'bn' 
                    ? 'ডাটাবেস সম্পূর্ণ মুছে ফেলার জন্য নিচে "RESTORE" শব্দটি টাইপ করুন:' 
                    : 'To confirm full restore and deletion of all current data, please type "RESTORE" below:'}
                </label>
                <input
                  type="text"
                  value={importState.confirmText}
                  onChange={(e) => setImportState(prev => ({ ...prev, confirmText: e.target.value }))}
                  placeholder="RESTORE"
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-rose-300 dark:border-rose-800 rounded-lg text-sm text-center font-bold tracking-widest text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  disabled={importState.loading}
                />
              </motion.div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-3">
          <button
            onClick={async () => {
              if (importState.choice === 'clear' && importState.confirmText !== 'RESTORE') {
                toast.error(lang === 'bn' ? 'নিশ্চিতকরণের জন্য "RESTORE" শব্দটি টাইপ করুন!' : 'Please type "RESTORE" to confirm!');
                return;
              }

              setImportState(prev => ({ ...prev, loading: true }));
              triggerHaptic('single');

              try {
                await importLedgerData(importState.backupData, importState.choice);
                toast.success(lang === 'bn' ? 'ডাটা সফলভাবে ইম্পোর্ট করা হয়েছে!' : 'Data imported successfully!');
                triggerHaptic('double');
                setImportState(prev => ({ ...prev, showModal: false }));
              } catch (err) {
                console.error(err);
                toast.error(lang === 'bn' ? 'ইম্পোর্ট করতে সমস্যা হয়েছে!' : 'Failed to import data!');
              } finally {
                setImportState(prev => ({ ...prev, loading: false }));
              }
            }}
            disabled={importState.loading || (importState.choice === 'clear' && importState.confirmText !== 'RESTORE')}
            className={`w-full py-4 text-white font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-md ${
              importState.choice === 'clear'
                ? 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-600/40 disabled:cursor-not-allowed'
                : importState.choice === 'skip'
                  ? 'bg-sky-600 hover:bg-sky-700 disabled:bg-sky-600/40'
                  : 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/40'
            }`}
          >
            {importState.loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                {lang === 'bn' ? 'ইম্পোর্ট করা হচ্ছে...' : 'Importing...'}
              </>
            ) : (
              lang === 'bn' ? 'ইম্পোর্ট শুরু করুন' : 'Confirm Import'
            )}
          </button>

          <button
            onClick={() => setImportState(prev => ({ ...prev, showModal: false }))}
            disabled={importState.loading}
            className="w-full py-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 font-bold rounded-xl cursor-pointer transition-colors"
          >
            {lang === 'bn' ? 'বাতিল' : 'Cancel'}
          </button>
        </div>
      </motion.div>
    </div>
  )}
  </div>
 );
}
