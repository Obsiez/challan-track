import React, { useMemo } from 'react';
import { Customer, Transaction } from '../types';
import { 
 TrendingUp, Users, ClipboardList, ArrowUpRight, ArrowDownLeft 
} from 'lucide-react';
import { translations, formatNumber, Language } from '../lib/translations';
import AnalyticsManager from './AnalyticsManager';

interface DashboardProps {
 customers: Customer[];
 transactions: Transaction[];
 onOpenQuickEntry: () => void;
 onSelectCustomer: (id: string) => void;
 lang: Language;
}

export default function Dashboard({
 customers,
 transactions,
 onOpenQuickEntry,
 onSelectCustomer,
 lang
}: DashboardProps) {
 const t = translations[lang];
 
 // Calculate statistics
 const stats = useMemo(() => {
 const totalOutstanding = customers.reduce((sum, c) => sum + (c.outstandingDue || 0), 0);
 const activeDebtorsCount = customers.filter(c => c.outstandingDue > 0).length;

 const midnight = new Date();
 midnight.setHours(0, 0, 0, 0);

 const todayTxs = transactions.filter(tx => {
 const txDate = new Date(tx.date);
 return txDate >= midnight;
 });

 const duesToday = todayTxs
 .filter(tx => tx.type === 'due')
 .reduce((sum, tx) => sum + tx.amount, 0);

 const paymentsToday = todayTxs
 .filter(tx => tx.type === 'payment')
 .reduce((sum, tx) => sum + tx.amount, 0);

 return {
 totalOutstanding,
 activeDebtorsCount,
 duesToday,
 paymentsToday,
 todayTxs
 };
 }, [customers, transactions]);

 // Payment capture percentage for progress ring
 const paymentRatio = useMemo(() => {
 const totalActiveActions = stats.duesToday + stats.paymentsToday;
 if (totalActiveActions === 0) return 0;
 return Math.round((stats.paymentsToday / totalActiveActions) * 100);
 }, [stats]);

 return (
  <div 
    className="space-y-6 no-select animate-reveal"
  >
 
 {/* 1. MAIN OUTSTANDING LEDGER HERO (GIANT CLEAR NUMBERS) */}
 <div 
 className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-lg relative overflow-hidden"
 >
 <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 bg-zinc-400/5 dark:bg-white/5 w-64 h-64 rounded-full blur-2xl"></div>
 
 <div className="space-y-1 relative z-10">
 <span className="text-xs font-bold tracking-wider text-zinc-500 dark:text-zinc-400 uppercase">
 {t.totalOutstanding}
 </span>
 <div className="flex items-baseline gap-2">
 <span className="text-4xl sm:text-5xl font-black text-zinc-900 dark:text-white">
 ৳ {formatNumber(stats.totalOutstanding, lang)}
 </span>
 <span className="text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase">{lang === 'bn' ? 'বকেয়া' : 'collectible'}</span>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800/50 relative z-10">
 <div className="flex items-center gap-3">
 <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800/50 text-amber-600 dark:text-amber-500">
 <Users className="w-5 h-5" />
 </div>
 <div>
 <div className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">
 {formatNumber(stats.activeDebtorsCount, lang)}
 </div>
 <div className="text-xs text-zinc-500 dark:text-zinc-400">{t.debtorsCount}</div>
 </div>
 </div>

 <div className="flex items-center gap-3">
 <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800/50 text-emerald-600 dark:text-emerald-400">
 <TrendingUp className="w-5 h-5" />
 </div>
 <div>
 <div className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">
 {formatNumber(transactions.length, lang)}
 </div>
 <div className="text-xs text-zinc-500 dark:text-zinc-400">{t.totalTransactions}</div>
 </div>
 </div>
 </div>
 </div>

 {/* 2. TODAY'S TOTALS (DASHBOARD AT A GLANCE) */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 
 {/* Dues Added Today card */}
 <div 
 className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-md flex items-center justify-between transition-transform"
 >
 <div className="space-y-1">
 <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">{t.duesToday}</span>
 <div className="text-3xl font-extrabold text-rose-600 dark:text-rose-450">
 ৳ {formatNumber(stats.duesToday, lang)}
 </div>
 <span className="text-xs text-zinc-500 dark:text-zinc-400">{lang === 'bn' ? 'আজকের বাকি প্রদান' : 'Credit sales logged'}</span>
 </div>
 <div className="p-4 bg-rose-50 dark:bg-rose-950/20 rounded-2xl text-rose-500">
 <ArrowUpRight className="w-8 h-8 stroke-[2.5]" />
 </div>
 </div>

 {/* Payments Collected Today card */}
 <div 
 className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-md flex items-center justify-between transition-transform"
 >
 <div className="space-y-1">
 <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">{t.paymentsToday}</span>
 <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
 ৳ {formatNumber(stats.paymentsToday, lang)}
 </div>
 <span className="text-xs text-zinc-500 dark:text-zinc-400">{lang === 'bn' ? 'আজকের পেমেন্ট গ্রহণ' : 'Cash/UPI collected'}</span>
 </div>
 <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl text-emerald-500">
 <ArrowDownLeft className="w-8 h-8 stroke-[2.5]" />
 </div>
 </div>

 {/* Collection Efficiency Ring */}
 <div 
 className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-md flex items-center gap-4 transition-transform"
 >
 {/* Circular progress */}
 <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
 <svg className="w-20 h-20 transform -rotate-90">
 <circle cx="40" cy="40" r="32" stroke="currentColor" fill="none" strokeWidth="8" className="text-gray-100 dark:text-zinc-850" />
 <circle cx="40" cy="40" r="32" stroke="currentColor" fill="none" strokeWidth="8" 
 strokeDasharray={200}
 strokeDashoffset={200 - (200 * (stats.duesToday === 0 && stats.paymentsToday === 0 ? 0 : paymentRatio)) / 100}
 className="text-emerald-500 dark:text-emerald-400 transition-all duration-500 stroke-linecap-round" 
 />
 </svg>
 <div className="absolute text-center">
 <span className="text-sm font-bold text-zinc-850 dark:text-zinc-100">
 {formatNumber(paymentRatio, lang)}%
 </span>
 </div>
 </div>
 <div>
 <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t.efficiency}</div>
 <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
 {stats.duesToday === 0 && stats.paymentsToday === 0 
 ? (lang === 'bn' ? 'আজকের কাজ খালি' : 'No transactions today')
 : (lang === 'bn' ? 'মোট লেনদেনে উসুল পেমেন্ট হার' : t.efficiencyDesc)}
 </p>
 </div>
 </div>
 </div>

 {/* 3. TODAY'S RECENT JOURNAL RECORDS */}
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
 {t.quickBook} ({formatNumber(stats.todayTxs.length, lang)})
 </span>
 <button 
 onClick={onOpenQuickEntry}
 className="text-emerald-600 dark:text-emerald-400 text-xs font-bold bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-1.5 rounded-full cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
 id="add_now_dash_btn"
 >
 + {t.recordEntry}
 </button>
 </div>

 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-md">
 {stats.todayTxs.length === 0 ? (
 <div className="p-8 text-center text-zinc-400 dark:text-zinc-500 flex flex-col items-center gap-3">
 <ClipboardList className="w-12 h-12 stroke-[1.5]" />
 <div>
 <p className="font-bold text-base text-zinc-700 dark:text-zinc-300">{t.noActivity}</p>
 <p className="text-xs mt-1">{t.recentPayments}</p>
 </div>
 </div>
 ) : (
 <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
 {stats.todayTxs.map(tx => (
 <div 
 key={tx.id}
 onClick={() => onSelectCustomer(tx.customerId)}
 className="p-4 sm:p-5 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-850 transition-colors cursor-pointer"
 >
 <div className="flex items-center gap-4 min-w-0">
 <div className={`p-3 rounded-xl shrink-0 ${
 tx.type === 'due' 
 ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-450' 
 : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
 }`}>
 {tx.type === 'due' ? <ArrowUpRight className="w-5 h-5 stroke-[2.5]" /> : <ArrowDownLeft className="w-5 h-5 stroke-[2.5]" />}
 </div>
 <div className="min-w-0">
 <div className="text-base font-bold text-zinc-800 dark:text-zinc-100 truncate">{tx.customerName}</div>
 <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5 animate-pulse-once">
 {tx.description || (tx.type === 'due' ? t.dueTrigger : t.paymentTrigger)}
 </div>
 </div>
 </div>
 <div className="text-right shrink-0">
 <div className={`text-base sm:text-lg font-black ${
 tx.type === 'due' ? 'text-rose-600 dark:text-rose-450' : 'text-emerald-600 dark:text-emerald-450'
 }`}>
 {tx.type === 'due' ? '+' : '-'} ৳ {formatNumber(tx.amount, lang)}
 </div>
 <div className="text-2xs text-zinc-400 dark:text-zinc-500 font-bold uppercase mt-0.5">
 {new Date(tx.date).toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>

 {/* 4. INTEGRATED MONTHLY ANALYTICS REPORT */}
 <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800/50">
 <AnalyticsManager 
 customers={customers}
 transactions={transactions}
 lang={lang}
 />
 </div>

  </div>
 );
}
