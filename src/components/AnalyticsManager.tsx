import React, { useState, useMemo } from 'react';
import { Customer, Transaction } from '../types';
import { 
 BarChart3, Calendar, ArrowUpRight, ArrowDownLeft, TrendingUp, Users, Award, Percent
} from 'lucide-react';
import { translations, formatNumber, Language } from '../lib/translations';

// Handles Firestore Timestamp, { seconds } objects, Date instances, and ISO strings
const parseFirestoreDate = (dateVal: any): Date => {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) return dateVal;
  if (typeof dateVal.toDate === 'function') return dateVal.toDate();
  if (dateVal.seconds !== undefined) return new Date(dateVal.seconds * 1000);
  const parsed = new Date(dateVal);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

// Compact formatter for chart labels ONLY (K/M/B). Not used anywhere else in the app.
// 394000 → "394K", 1548000 → "1.55M", 45500 → "45.5K", 999 → "999"
function compactChart(val: number, lang: Language): string {
  const bengaliDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
  const toBn = (s: string) => lang === 'bn' ? s.replace(/[0-9]/g, d => bengaliDigits[+d]) : s;
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000) {
    const n = abs / 1_000_000_000;
    return toBn((n % 1 === 0 ? n.toFixed(0) : parseFloat(n.toFixed(2)).toString()) + 'B');
  }
  if (abs >= 1_000_000) {
    const n = abs / 1_000_000;
    return toBn((n % 1 === 0 ? n.toFixed(0) : parseFloat(n.toFixed(2)).toString()) + 'M');
  }
  if (abs >= 1_000) {
    const n = abs / 1_000;
    return toBn((n % 1 === 0 ? n.toFixed(0) : parseFloat(n.toFixed(1)).toString()) + 'K');
  }
  return toBn(abs.toString());
}

interface AnalyticsManagerProps {
 customers: Customer[];
 monthlySummaries: any[];
 lang: Language;
}

export default function AnalyticsManager({ customers, monthlySummaries, lang }: AnalyticsManagerProps) {
 const t = translations[lang];

 // ── Helper: list all months that have transactions, sorted descending ──────
 const availableMonths = useMemo(() => {
   const monthsSet = new Set<string>();
   const now = new Date();
   const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
   monthsSet.add(currentMonthKey);

   monthlySummaries.forEach(s => {
    if (s.id) {
     monthsSet.add(s.id);
    }
   });

   return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [monthlySummaries]);

  const [selectedMonth, setSelectedMonth] = useState<string>(availableMonths[0] || '');

  // ── Helpers ───────────────────────────────────────────────────────────────
  const toBnNum = (n: string | number) =>
   n.toString().replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)]);

  const getMonthName = (monthKey: string) => {
   if (!monthKey) return '';
   const [year, monthStr] = monthKey.split('-');
   const monthIndex = parseInt(monthStr, 10) - 1;
   const enMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
   const bnMonths = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
   const mName = lang === 'bn' ? bnMonths[monthIndex] : enMonths[monthIndex];
   const yName = lang === 'bn' ? toBnNum(year) : year;
   return `${mName} ${yName}`;
  };

  // ── 1. Monthly summary metrics for the selected month ─────────────────────
  const monthlyMetrics = useMemo(() => {
   if (!selectedMonth) return { dues: 0, payments: 0, count: 0, efficiency: 0 };
   const summary = monthlySummaries.find(s => s.id === selectedMonth);

   const duesTotal = summary?.dues || 0;
   const paymentsTotal = summary?.payments || 0;
   const txCount = summary?.count || 0;

   const efficiency = duesTotal > 0
    ? Math.round((paymentsTotal / duesTotal) * 100)
    : paymentsTotal > 0 ? 100 : 0;

   return { dues: duesTotal, payments: paymentsTotal, count: txCount, efficiency: Math.min(100, efficiency) };
  }, [monthlySummaries, selectedMonth]);

  // ── 2. Chart data: last 6 months ──────────────────────────────────────────
  const chartData = useMemo(() => {
   const EN_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
   const BN_SHORT = ['জানু','ফেব্রু','মার্চ','এপ্রি','মে','জুন','জুলা','আগ','সেপ্টে','অক্টো','নভে','ডিসে'];
   const now = new Date();
   const list: { key: string; label: string; dues: number; payments: number }[] = [];

   for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yr = d.getFullYear();
    const mo = d.getMonth(); // 0-indexed
    const key = `${yr}-${String(mo + 1).padStart(2, '0')}`;

    const summary = monthlySummaries.find(s => s.id === key);
    const dSum = summary?.dues || 0;
    const pSum = summary?.payments || 0;

    list.push({
     key,
     label: lang === 'bn' ? BN_SHORT[mo] : EN_SHORT[mo],
     dues: dSum,
     payments: pSum,
    });
   }

   return list;
  }, [monthlySummaries, lang]);

  // ── 3. Scale ──────────────────────────────────────────────────────────────
  const maxChartValue = useMemo(() => {
   let max = 0;
   chartData.forEach(d => {
    if (d.dues > max) max = d.dues;
    if (d.payments > max) max = d.payments;
   });
   return max > 0 ? max * 1.15 : 1000;
  }, [chartData]);

  const hasAnyData = chartData.some(d => d.dues > 0 || d.payments > 0);

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // ── 4. Top debtors ─────────────────────────────────────────────────────────
  const topDebtors = useMemo(() =>
   [...customers]
    .filter(c => c.outstandingDue > 0)
    .sort((a, b) => b.outstandingDue - a.outstandingDue)
    .slice(0, 5),
   [customers]);

  // ── 5. Top payers in the selected month ───────────────────────────────────
  const topPayers = useMemo(() => {
   if (!selectedMonth) return [];
   const summary = monthlySummaries.find(s => s.id === selectedMonth);
   if (!summary || !summary.customerPayments) return [];

   return Object.values(summary.customerPayments)
    .map((val: any) => ({ name: val.name, total: val.total }))
    .sort((a: any, b: any) => b.total - a.total)
    .slice(0, 5);
  }, [monthlySummaries, selectedMonth]);

 // ── Render ─────────────────────────────────────────────────────────────────
 return (
  <div className="space-y-6">

   {/* HEADER */}
   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
     <h2 className="text-2xl font-black text-zinc-900 dark:text-white flex items-center gap-2">
      <BarChart3 className="w-7 h-7 text-emerald-500" />
      {t.analytics}
     </h2>
     <p className="text-sm text-zinc-500 dark:text-zinc-400 font-semibold mt-1">
      {lang === 'bn'
       ? 'দোকানের মাসিক বাকি এবং কালেকশন ট্র্যাক করার সহজ ড্যাশবোর্ড।'
       : 'Easy insights to monitor sales performance and outstanding balances.'}
     </p>
    </div>

    {/* Month filter */}
    <div className="flex items-center gap-2 shrink-0">
     <Calendar className="w-5 h-5 text-zinc-400 shrink-0" />
     <select
      value={selectedMonth}
      onChange={e => setSelectedMonth(e.target.value)}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
     >
      {availableMonths.map(m => (
       <option key={m} value={m}>{getMonthName(m)}</option>
      ))}
     </select>
    </div>
   </div>

   {/* METRICS ROW */}
   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

    {/* Credit Sales */}
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-md flex items-center justify-between">
     <div className="space-y-1">
      <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
       {lang === 'bn' ? 'বাকি দেওয়া হয়েছে' : 'Credit Sales (Dues Given)'}
      </span>
      <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-450">
       ৳ {formatNumber(monthlyMetrics.dues, lang)}
      </div>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
       {lang === 'bn' ? 'চলতি মাসে মোট বাকি বিক্রি' : 'Total credit sales logged'}
      </span>
     </div>
     <div className="p-3 bg-rose-50 dark:bg-rose-950/20 rounded-xl text-rose-500 shrink-0">
      <ArrowUpRight className="w-7 h-7" />
     </div>
    </div>

    {/* Cash Collected */}
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-md flex items-center justify-between">
     <div className="space-y-1">
      <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
       {lang === 'bn' ? 'নগদ আদায় হয়েছে' : 'Cash Collected (Payments Got)'}
      </span>
      <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
       ৳ {formatNumber(monthlyMetrics.payments, lang)}
      </div>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
       {lang === 'bn' ? 'চলতি মাসে নগদ আদায়' : 'Total payments received'}
      </span>
     </div>
     <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl text-emerald-500 shrink-0">
      <ArrowDownLeft className="w-7 h-7" />
     </div>
    </div>

    {/* Efficiency */}
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-md flex items-center justify-between">
     <div className="space-y-1">
      <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
       {t.efficiency}
      </span>
      <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-500">
       {formatNumber(monthlyMetrics.efficiency, lang)}%
      </div>
      <span className="text-xs text-zinc-500 dark:text-zinc-400 text-ellipsis overflow-hidden whitespace-nowrap block">
       {lang === 'bn' ? 'বাকি আদায়ের সাফল্য হার' : 'Cash recovery progress percentage'}
      </span>
     </div>
     <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl text-amber-500 shrink-0">
      <Percent className="w-7 h-7" />
     </div>
    </div>

   </div>

   {/* CHART + LISTS GRID */}
   <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

    {/* ── CHART PANEL ─────────────────────────────────────────────────── */}
    <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-md space-y-4 overflow-hidden">

     {/* Panel header */}
     <div>
      <h3 className="text-base font-black text-zinc-800 dark:text-white flex items-center gap-2">
       <TrendingUp className="w-5 h-5 text-emerald-500" />
       {t.salesVsCollections}
      </h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
       {lang === 'bn'
        ? 'গত ৬ মাসের বাকি বিক্রি ও নগদ আদায়ের তুলনা'
        : 'Last 6 months – credit given vs. cash collected'}
      </p>
     </div>

     {/* Legend */}
     <div className="flex items-center justify-end gap-5 text-xs font-bold">
      <div className="flex items-center gap-2">
       <span className="w-3 h-3 rounded-sm bg-rose-500 block shrink-0" />
       <span className="text-zinc-600 dark:text-zinc-400">
        {lang === 'bn' ? 'বাকি দেওয়া' : 'Credit Sales'}
       </span>
      </div>
      <div className="flex items-center gap-2">
       <span className="w-3 h-3 rounded-sm bg-emerald-500 block shrink-0" />
       <span className="text-zinc-600 dark:text-zinc-400">
        {lang === 'bn' ? 'নগদ আদায়' : 'Cash Collected'}
       </span>
      </div>
     </div>

     {/* Chart or empty state */}
     {!hasAnyData ? (
      <div className="h-52 flex flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-600">
       <BarChart3 className="w-12 h-12 stroke-[1.5]" />
       <p className="text-sm font-semibold text-center">
        {lang === 'bn'
         ? 'গত ৬ মাসে কোনো লেনদেন পাওয়া যায়নি'
         : 'No transactions found in the last 6 months'}
       </p>
      </div>
     ) : (
      <div className="relative mt-2 overflow-x-hidden">
       {/* Y-axis gridlines */}
       <div className="absolute left-0 top-0 w-full h-[175px] pointer-events-none">
        {[1, 0.75, 0.5, 0.25, 0].map((frac, i) => {
         const val = Math.round(maxChartValue * frac);
         return (
          <div
           key={i}
           className="absolute left-0 right-0 flex items-center"
           style={{ top: `${(1 - frac) * 100}%` }}
          >
           <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 w-10 text-right shrink-0 leading-none">
            {compactChart(val, lang)}
           </span>
           <div className="flex-1 ml-2 border-t border-dashed border-zinc-100 dark:border-zinc-800" />
          </div>
         );
        })}
       </div>

       {/* Bars */}
       <div className="ml-12 h-[175px] flex items-end justify-around gap-1 border-b-2 border-zinc-200 dark:border-zinc-700">
        {chartData.map((data, idx) => {
         const opacity = 0.35 + (idx / 5) * 0.65;
         const isCurrent = data.key === currentMonthKey;
         const dueH  = data.dues     > 0 ? Math.max(3, (data.dues     / maxChartValue) * 100) : 0;
         const payH  = data.payments > 0 ? Math.max(3, (data.payments / maxChartValue) * 100) : 0;
         const net   = data.payments - data.dues;

         return (
          <div
           key={data.key}
           className="relative flex-1 flex items-end justify-center gap-0.5 sm:gap-1 h-full group"
           style={{ opacity }}
          >
           {/* Hover tooltip */}
           <div className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 z-30 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 bg-zinc-950 text-white rounded-xl shadow-xl px-3 py-2.5 text-xs font-bold whitespace-nowrap min-w-[120px]">
            <div className="text-zinc-300 font-black text-xs uppercase mb-1.5">{data.label}</div>
            <div className="flex justify-between gap-4">
             <span className="text-rose-400">{lang === 'bn' ? 'বাকি' : 'Due'}</span>
             <span>৳{compactChart(data.dues, lang)}</span>
            </div>
            <div className="flex justify-between gap-4">
             <span className="text-emerald-400">{lang === 'bn' ? 'আদায়' : 'Paid'}</span>
             <span>৳{compactChart(data.payments, lang)}</span>
            </div>
            <div className="border-t border-zinc-700 mt-1.5 pt-1.5 flex justify-between gap-4">
             <span className="text-zinc-400">{lang === 'bn' ? 'নেট' : 'Net'}</span>
             <span className={net >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {net >= 0 ? '+' : ''}৳{compactChart(Math.abs(net), lang)}
             </span>
            </div>
           </div>

           {/* Bar pair */}
           <div className="flex items-end justify-center gap-0.5 sm:gap-1 h-full">
            <div
             className={`w-4 sm:w-5 rounded-t-lg transition-all duration-500 ease-out bg-rose-500`}
             style={{ height: `${dueH}%` }}
            />
            <div
             className={`w-4 sm:w-5 rounded-t-lg transition-all duration-500 ease-out bg-emerald-500`}
             style={{ height: `${payH}%` }}
            />
           </div>
          </div>
         );
        })}
       </div>

       {/* Month labels — outside the fixed-height bars row, no scrollbar risk */}
       <div className="ml-12 flex justify-around gap-1 pt-1.5">
        {chartData.map((data, idx) => {
         const isCurrent = data.key === currentMonthKey;
         const opacity = 0.35 + (idx / 5) * 0.65;
         return (
          <div
           key={data.key}
           className={`flex-1 text-xs font-black text-center ${
            isCurrent ? 'text-zinc-800 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'
           }`}
           style={{ opacity }}
          >
           {data.label}
          </div>
         );
        })}
       </div>
      </div>
     )}
    </div>
    {/* ── END CHART PANEL ─────────────────────────────────────────────── */}

    {/* INSIGHTS COLUMN */}
    <div className="space-y-6">

     {/* TOP DEBTORS */}
     <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-md space-y-4">
      <h3 className="text-base font-black text-zinc-800 dark:text-white flex items-center gap-2">
       <Users className="w-5 h-5 text-rose-500" />
       {t.topDebtors}
      </h3>
      {topDebtors.length === 0 ? (
       <p className="text-sm text-zinc-400 italic font-medium">
        {lang === 'bn' ? 'কোনো বকেয়া বাকি অ্যাকাউন্ট নেই!' : 'No customer accounts with unpaid balance.'}
       </p>
      ) : (
       <div className="space-y-2">
        {topDebtors.map((c, i) => (
         <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850">
          <div className="flex items-center gap-2 min-w-0">
           <span className="text-xs font-black text-zinc-400 w-5 shrink-0">#{formatNumber(i + 1, lang)}</span>
           <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate">{c.name}</span>
          </div>
          <span className="text-sm font-black text-[#e0385e] shrink-0 ml-2">৳ {formatNumber(c.outstandingDue, lang)}</span>
         </div>
        ))}
       </div>
      )}
     </div>

     {/* TOP PAYERS */}
     <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-md space-y-4">
      <h3 className="text-base font-black text-zinc-800 dark:text-white flex items-center gap-2">
       <Award className="w-5 h-5 text-emerald-500" />
       {t.topEarners}
      </h3>
      {topPayers.length === 0 ? (
       <p className="text-sm text-zinc-400 italic font-medium">
        {lang === 'bn' ? 'এই মাসে কোনো আদায় নেই!' : 'No payments received in this month.'}
       </p>
      ) : (
       <div className="space-y-2">
        {topPayers.map((p, i) => (
         <div key={p.name} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850">
          <div className="flex items-center gap-2 min-w-0">
           <span className="text-xs font-black text-zinc-400 w-5 shrink-0">#{formatNumber(i + 1, lang)}</span>
           <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate">{p.name}</span>
          </div>
          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 shrink-0 ml-2">৳ {formatNumber(p.total, lang)}</span>
         </div>
        ))}
       </div>
      )}
     </div>

    </div>
   </div>

  </div>
 );
}
