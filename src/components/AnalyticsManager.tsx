import React, { useState, useMemo } from 'react';
import { Customer, Transaction } from '../types';
import { 
  BarChart3, Calendar, ArrowUpRight, ArrowDownLeft, TrendingUp, Users, Award, Percent, ChevronLeft, ChevronRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { translations, formatNumber, Language } from '../lib/translations';

interface AnalyticsManagerProps {
  customers: Customer[];
  transactions: Transaction[];
  lang: Language;
}

export default function AnalyticsManager({ customers, transactions, lang }: AnalyticsManagerProps) {
  const t = translations[lang];

  // Helper to list all months with transactions
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    
    // Default to include current month
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthsSet.add(currentMonthKey);

    transactions.forEach(tx => {
      const d = new Date(tx.date);
      if (!isNaN(d.getTime())) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthsSet.add(key);
      }
    });

    // Sort descending
    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const [selectedMonth, setSelectedMonth] = useState<string>(availableMonths[0] || '');

  // Helper to convert English digits to Bengali digits without commas for years
  const toBnNum = (n: string | number) => n.toString().replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)]);

  // Helper to get printable name for month keys e.g. "2026-06"
  const getMonthName = (monthKey: string) => {
    if (!monthKey) return '';
    const [year, monthStr] = monthKey.split('-');
    const monthIndex = parseInt(monthStr, 10) - 1;
    
    const enMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const bnMonths = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
    
    const mName = lang === 'bn' ? bnMonths[monthIndex] : enMonths[monthIndex];
    const yName = lang === 'bn' ? toBnNum(year) : year;
    return `${mName} ${yName}`;
  };

  // 1. Calculate Monthly Metrics
  const monthlyMetrics = useMemo(() => {
    if (!selectedMonth) return { dues: 0, payments: 0, count: 0, efficiency: 0 };
    
    const [year, month] = selectedMonth.split('-').map(Number);
    
    let duesTotal = 0;
    let paymentsTotal = 0;
    let txCount = 0;

    transactions.forEach(tx => {
      const d = new Date(tx.date);
      if (d.getFullYear() === year && (d.getMonth() + 1) === month) {
        txCount++;
        if (tx.type === 'due') {
          duesTotal += tx.amount;
        } else if (tx.type === 'payment') {
          paymentsTotal += tx.amount;
        }
      }
    });

    const efficiency = duesTotal > 0 ? Math.round((paymentsTotal / duesTotal) * 100) : (paymentsTotal > 0 ? 100 : 0);

    return {
      dues: duesTotal,
      payments: paymentsTotal,
      count: txCount,
      efficiency: Math.min(100, efficiency)
    };
  }, [transactions, selectedMonth]);

  // 2. Custom SVG Bar Chart - Monthly Trends (Last 6 Months)
  const chartData = useMemo(() => {
    // Get last 6 months list
    const list: { key: string; label: string; dues: number; payments: number }[] = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      
      let dSum = 0;
      let pSum = 0;
      
      transactions.forEach(tx => {
        const tDate = new Date(tx.date);
        if (tDate.getFullYear() === d.getFullYear() && tDate.getMonth() === d.getMonth()) {
          if (tx.type === 'due') dSum += tx.amount;
          else if (tx.type === 'payment') pSum += tx.amount;
        }
      });

      const monthNameShort = lang === 'bn' 
        ? ["জানু", "ফেব্রু", "মার্চ", "এপ্রি", "মে", "জুন", "জুলা", "আগ", "সেপ্টে", "অক্টো", "নভে", "ডিসে"][d.getMonth()]
        : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];

      list.push({
        key,
        label: monthNameShort,
        dues: dSum,
        payments: pSum
      });
    }

    return list;
  }, [transactions, lang]);

  // Max value in chart for scaling
  const maxChartValue = useMemo(() => {
    let max = 1000;
    chartData.forEach(d => {
      if (d.dues > max) max = d.dues;
      if (d.payments > max) max = d.payments;
    });
    return max * 1.1; // Add 10% breathing room
  }, [chartData]);

  // 3. Top debtors list based on outstanding due
  const topDebtors = useMemo(() => {
    return [...customers]
      .filter(c => c.outstandingDue > 0)
      .sort((a, b) => b.outstandingDue - a.outstandingDue)
      .slice(0, 5);
  }, [customers]);

  // 4. Top cash payers in selected month
  const topPayers = useMemo(() => {
    if (!selectedMonth) return [];
    const [year, month] = selectedMonth.split('-').map(Number);
    const payersMap: Record<string, { name: string; total: number }> = {};

    transactions.forEach(tx => {
      const d = new Date(tx.date);
      if (d.getFullYear() === year && (d.getMonth() + 1) === month && tx.type === 'payment') {
        if (!payersMap[tx.customerId]) {
          payersMap[tx.customerId] = { name: tx.customerName, total: 0 };
        }
        payersMap[tx.customerId].total += tx.amount;
      }
    });

    return Object.values(payersMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [transactions, selectedMonth]);

  return (
    <div className="space-y-6">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-zinc-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-emerald-500" />
            {t.analytics}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mt-1">
            {lang === 'bn' ? 'দোকানের মাসিক বাকি এবং কালেকশন ট্র্যাক করার সহজ ড্যাশবোর্ড।' : 'Easy insights to monitor sales performance and outstanding balances.'}
          </p>
        </div>

        {/* MONTH DROP-DOWN FILTER */}
        <div className="flex items-center gap-2 shrink-0">
          <Calendar className="w-5 h-5 text-zinc-400 shrink-0" />
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {availableMonths.map(m => (
              <option key={m} value={m}>
                {getMonthName(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* METRICS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Credit Sales card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-2xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
              {lang === 'bn' ? 'বাকি দেওয়া হয়েছে' : 'Credit Sales (Dues Given)'}
            </span>
            <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-450">
              ৳ {formatNumber(monthlyMetrics.dues, lang)}
            </div>
            <span className="text-2xs text-zinc-500 dark:text-zinc-400">
              {lang === 'bn' ? 'চলতি মাসে মোট বাকি বিক্রি' : 'Total credit sales logged'}
            </span>
          </div>
          <div className="p-3 bg-rose-50 dark:bg-rose-950/20 rounded-xl text-rose-500 shrink-0">
            <ArrowUpRight className="w-7 h-7" />
          </div>
        </div>

        {/* Cash Collected card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-2xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
              {lang === 'bn' ? 'নগদ আদায় হয়েছে' : 'Cash Collected (Payments Got)'}
            </span>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
              ৳ {formatNumber(monthlyMetrics.payments, lang)}
            </div>
            <span className="text-2xs text-zinc-500 dark:text-zinc-400">
              {lang === 'bn' ? 'চলতি মাসে নগদ আদায়' : 'Total payments received'}
            </span>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl text-emerald-500 shrink-0">
            <ArrowDownLeft className="w-7 h-7" />
          </div>
        </div>

        {/* Collection Efficiency card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-2xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
              {t.efficiency}
            </span>
            <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-500">
              {formatNumber(monthlyMetrics.efficiency, lang)}%
            </div>
            <span className="text-2xs text-zinc-500 dark:text-zinc-400 text-ellipsis overflow-hidden whitespace-nowrap block">
              {lang === 'bn' ? 'বাকি আদায়ের সাফল্য হার' : 'Cash recovery progress percentage'}
            </span>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl text-amber-500 shrink-0">
            <Percent className="w-7 h-7" />
          </div>
        </div>

      </div>

      {/* CHART & LISTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* SVG MONTHLY TRENDS CHART */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-black text-zinc-800 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              {t.salesVsCollections}
            </h3>
            <p className="text-3xs text-zinc-450 mt-0.5">{lang === 'bn' ? 'গত ৬ মাসের হিসাব তুলনা' : 'Comparison of credit sales & payments got over last 6 months.'}</p>
          </div>

          {/* Simple Highly Responsive Pure SVG Bar Chart */}
          <div className="relative pt-2">
            <div className="flex justify-end gap-4 text-2xs font-bold pb-2 pr-2">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-rose-500 rounded-xs block"></span>
                <span className="text-zinc-500">{lang === 'bn' ? 'বাকি' : 'Due'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-emerald-500 rounded-xs block"></span>
                <span className="text-zinc-500">{lang === 'bn' ? 'আদায়' : 'Payment'}</span>
              </div>
            </div>

            <div className="h-48 w-full flex items-end justify-between gap-2 sm:gap-4 px-2 pt-4 border-b border-zinc-200 dark:border-zinc-800">
              {chartData.map((data, index) => {
                const dueHeight = Math.max(4, (data.dues / maxChartValue) * 100);
                const paymentHeight = Math.max(4, (data.payments / maxChartValue) * 100);

                return (
                  <div key={data.key} className="flex-1 flex flex-col items-center h-full justify-end group">
                    <div className="w-full flex items-end justify-center gap-1 sm:gap-2 h-[85%]">
                      {/* Dues bar */}
                      <div className="w-3.5 sm:w-5 relative flex justify-center group-hover:scale-y-[1.03] transition-transform">
                        <div 
                          style={{ height: `${dueHeight}%` }} 
                          className="w-full bg-rose-500 rounded-t-md cursor-pointer transition-all hover:bg-rose-600"
                          title={`Dues: ৳${data.dues}`}
                        />
                        {/* Custom Tooltip */}
                        <span className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-950 text-white text-[9px] font-black py-0.5 px-1.5 rounded-sm pointer-events-none whitespace-nowrap z-20">
                          ৳{formatNumber(data.dues, lang)}
                        </span>
                      </div>

                      {/* Payments bar */}
                      <div className="w-3.5 sm:w-5 relative flex justify-center group-hover:scale-y-[1.03] transition-transform">
                        <div 
                          style={{ height: `${paymentHeight}%` }} 
                          className="w-full bg-emerald-500 rounded-t-md cursor-pointer transition-all hover:bg-emerald-600"
                          title={`Payments: ৳${data.payments}`}
                        />
                        {/* Custom Tooltip */}
                        <span className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-950 text-white text-[9px] font-black py-0.5 px-1.5 rounded-sm pointer-events-none whitespace-nowrap z-20">
                          ৳{formatNumber(data.payments, lang)}
                        </span>
                      </div>
                    </div>
                    
                    {/* Month Label */}
                    <div className="text-[10px] font-black text-zinc-500 mt-2 text-center truncate w-full">
                      {data.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* INSIGHTS COLUMN */}
        <div className="space-y-6">
          
          {/* TOP DEBTORS */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-xs space-y-4">
            <h3 className="text-base font-black text-zinc-800 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-rose-500" />
              {t.topDebtors}
            </h3>
            
            {topDebtors.length === 0 ? (
              <p className="text-xs text-zinc-400 italic font-medium">{lang === 'bn' ? 'কোনো বকেয়া বাকি অ্যাকাউন্ট নেই!' : 'No customer accounts with unpaid balance.'}</p>
            ) : (
              <div className="space-y-2">
                {topDebtors.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-black text-zinc-400 w-4">#{formatNumber(i+1, lang)}</span>
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">{c.name}</span>
                    </div>
                    <span className="text-xs font-black text-rose-600 dark:text-rose-400 shrink-0">৳ {formatNumber(c.outstandingDue, lang)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TOP PAYERS OF MONTH */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-xs space-y-4">
            <h3 className="text-base font-black text-zinc-800 dark:text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-500" />
              {t.topEarners}
            </h3>
            
            {topPayers.length === 0 ? (
              <p className="text-xs text-zinc-400 italic font-medium">{lang === 'bn' ? 'এই মাসে কোনো আদায় নেই!' : 'No payments received in this month.'}</p>
            ) : (
              <div className="space-y-2">
                {topPayers.map((p, i) => (
                  <div key={p.name} className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-black text-zinc-400 w-4">#{formatNumber(i+1, lang)}</span>
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">{p.name}</span>
                    </div>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 shrink-0">৳ {formatNumber(p.total, lang)}</span>
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
