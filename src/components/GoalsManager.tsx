import React, { useState } from 'react';
import { Customer, SavingGoal, GoalContribution } from '../types';
import { 
  HandCoins, Target, Calendar, Plus, Users, ArrowUpRight, ArrowDownLeft, Trash2, CheckCircle2, ChevronRight, X, Clock, AlertCircle, HelpCircle, ReceiptText, AlertTriangle 
} from 'lucide-react';
import { triggerHaptic } from '../lib/haptics';
import { translations, Language, formatNumber } from '../lib/translations';

interface GoalsManagerProps {
  goals: SavingGoal[];
  goalsSynced: boolean;
  customers: Customer[];
  createGoal: (
    title: string,
    targetAmount: number,
    frequency: 'daily' | 'weekly' | 'monthly' | 'flexible',
    installmentAmount?: number,
    type?: 'savings' | 'deposit',
    customerId?: string,
    customerName?: string
  ) => Promise<string | null>;
  addGoalContribution: (
    goalId: string,
    amount: number,
    note?: string,
    recordAsCustomerTransaction?: boolean
  ) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;
  updateGoalStatus: (goalId: string, status: 'active' | 'completed' | 'cancelled') => Promise<void>;
  lang: Language;
}

export default function GoalsManager({
  goals,
  goalsSynced,
  customers,
  createGoal,
  addGoalContribution,
  deleteGoal,
  updateGoalStatus,
  lang
}: GoalsManagerProps) {
  const t = translations[lang];

  // Tab filter: 'active' or 'history'
  const [filterTab, setFilterTab] = useState<'active' | 'history'>('active');

  // Create Goal Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [goalType, setGoalType] = useState<'savings' | 'deposit'>('savings');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'flexible'>('weekly');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Selected Goal Details Modal state
  const [selectedGoal, setSelectedGoal] = useState<SavingGoal | null>(null);
  const [showInstallmentForm, setShowInstallmentForm] = useState(false);
  const [installmentInput, setInstallmentInput] = useState('');
  const [installmentNote, setInstallmentNote] = useState('');
  const [syncToLedger, setSyncToLedger] = useState(true);

  // Custom Confirmation Popups
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Computed lists
  const activeGoals = goals.filter(g => g.status === 'active');
  const historyGoals = goals.filter(g => g.status !== 'active');
  const visibleGoals = filterTab === 'active' ? activeGoals : historyGoals;

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    triggerHaptic('single');

    if (!goalTitle.trim()) {
      setFormError(lang === 'bn' ? 'লক্ষ্যের শিরোনাম লিখুন' : 'Please enter a goal title');
      return;
    }

    const targetVal = parseFloat(targetAmount.replace(/,/g, ''));
    if (!targetVal || targetVal <= 0) {
      setFormError(lang === 'bn' ? 'টার্গেট পরিমাণ সঠিক নয়' : 'Please enter a valid target amount');
      return;
    }

    setIsSubmitting(true);

    const linkedCust = customers.find(c => c.id === selectedCustomerId);
    const instVal = installmentAmount ? parseFloat(installmentAmount.replace(/,/g, '')) : undefined;

    try {
      const res = await createGoal(
        goalTitle,
        targetVal,
        frequency,
        instVal,
        goalType,
        selectedCustomerId || undefined,
        linkedCust?.name
      );

      if (res) {
        // Reset form
        setGoalTitle('');
        setTargetAmount('');
        setGoalType('savings');
        setFrequency('weekly');
        setInstallmentAmount('');
        setSelectedCustomerId('');
        setNotes('');
        setShowCreateModal(false);
      }
    } catch (err) {
      setFormError(lang === 'bn' ? 'লক্ষ্য তৈরি করা যায়নি' : 'Failed to create goal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoal) return;
    triggerHaptic('double');

    const amt = parseFloat(installmentInput.replace(/,/g, ''));
    if (!amt || amt <= 0) return;

    setIsSubmitting(true);
    try {
      await addGoalContribution(selectedGoal.id, amt, installmentNote, syncToLedger);
      
      // Update local goal reference for details view update
      const updatedGoal = goals.find(g => g.id === selectedGoal.id);
      if (updatedGoal) {
        setSelectedGoal({
          ...updatedGoal,
          savedAmount: updatedGoal.savedAmount + amt,
          contributions: [
            ...updatedGoal.contributions,
            {
              id: 'temp',
              amount: amt,
              date: new Date().toISOString(),
              note: installmentNote.trim()
            }
          ]
        });
      }

      setInstallmentInput('');
      setInstallmentNote('');
      setShowInstallmentForm(false);
      
      // Close detail view if completed
      if (selectedGoal.savedAmount + amt >= selectedGoal.targetAmount) {
        setSelectedGoal(null);
      }
    } catch (err) {
      console.warn("Failed to record installment", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteConfirmModal = () => {
    triggerHaptic('single');
    setShowDeleteConfirm(true);
  };

  return (
    <div className="space-y-6 no-select">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
            {t.goals}
          </h1>
        </div>

        <button
          onClick={() => { triggerHaptic('single'); setShowCreateModal(true); }}
          className="px-5 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer text-sm shrink-0"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          {t.createGoal}
        </button>
      </div>

      {/* FILTER TABS */}
      <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 max-w-sm">
        <button
          onClick={() => { triggerHaptic('single'); setFilterTab('active'); }}
          className={`flex-1 py-2.5 text-center text-xs font-black rounded-xl transition-all cursor-pointer ${
            filterTab === 'active'
              ? 'bg-white dark:bg-zinc-800 text-emerald-650 dark:text-emerald-400 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          {lang === 'bn' ? 'চলমান লক্ষ্যসমূহ' : 'Active Goals'} ({activeGoals.length})
        </button>
        <button
          onClick={() => { triggerHaptic('single'); setFilterTab('history'); }}
          className={`flex-1 py-2.5 text-center text-xs font-black rounded-xl transition-all cursor-pointer ${
            filterTab === 'history'
              ? 'bg-white dark:bg-zinc-800 text-emerald-650 dark:text-emerald-400 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          {lang === 'bn' ? 'আর্কাইভ খতিয়ান' : 'History'} ({historyGoals.length})
        </button>
      </div>

      {/* GOALS GRID */}
      {visibleGoals.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-12 text-center text-zinc-400 dark:text-zinc-500 flex flex-col items-center justify-center gap-3 animate-fade-in">
          <Target className="w-12 h-12 stroke-[1.5] text-zinc-300 dark:text-zinc-600" />
          <p className="font-bold text-base text-zinc-700 dark:text-zinc-300">{t.noGoals}</p>
          <p className="text-xs max-w-xs">{lang === 'bn' ? 'ডিপিএস কিস্তি বা ব্যাংকের মতো সঞ্চয় লক্ষ্য যুক্ত করতে উপরে তৈরি বাটনে চাপুন।' : 'Create savings structures or installment repayment goals using the button above.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleGoals.map(goal => {
            const percent = Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100));
            
            return (
              <div 
                key={goal.id}
                onClick={() => { triggerHaptic('single'); setSelectedGoal(goal); }}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/30 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all cursor-pointer relative group flex flex-col justify-between min-h-[180px]"
              >
                <div>
                  {/* Title & Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[17px] font-black text-zinc-850 dark:text-white truncate leading-snug">
                        {goal.title}
                      </h3>
                      {goal.customerName && (
                        <p className="text-xs text-zinc-450 dark:text-zinc-450 font-bold flex items-center gap-1 mt-1 uppercase tracking-wider">
                          <Users className="w-3.5 h-3.5 text-emerald-500" />
                          {goal.customerName}
                        </p>
                      )}
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase shrink-0 flex items-center gap-1 ${
                      goal.type === 'savings' 
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400' 
                        : 'bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-455'
                    }`}>
                      <HandCoins className="w-3.5 h-3.5" />
                      {goal.type === 'savings' ? t.savings : t.deposit}
                    </span>
                  </div>

                  {/* Installment details */}
                  <div className="flex items-center gap-2 mt-4 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    <Calendar className="w-4 h-4 text-zinc-450" />
                    <span>
                      {goal.installmentAmount ? `৳${formatNumber(goal.installmentAmount, lang)}` : ''}{' '}
                      {goal.frequency === 'daily' && t.daily}
                      {goal.frequency === 'weekly' && t.weekly}
                      {goal.frequency === 'monthly' && t.monthly}
                      {goal.frequency === 'flexible' && t.flexible}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-6 space-y-2">
                  <div className="flex items-center justify-between text-xs font-extrabold">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ৳{formatNumber(goal.savedAmount, lang)} / ৳{formatNumber(goal.targetAmount, lang)}
                    </span>
                    <span className="text-zinc-400">{percent}%</span>
                  </div>
                  
                  <div className="w-full h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-700 ${
                        goal.status === 'completed' 
                          ? 'bg-emerald-500' 
                          : goal.type === 'savings' ? 'bg-emerald-500/80' : 'bg-rose-500/85'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                {/* Status indicator overlay for finished */}
                {goal.status !== 'active' && (
                  <div className="absolute inset-0 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-[1px] rounded-3xl flex items-center justify-center">
                    <span className={`px-4 py-2 rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-1.5 shadow-sm border ${
                      goal.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50'
                        : 'bg-zinc-150 text-zinc-500 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                    }`}>
                      {goal.status === 'completed' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          {lang === 'bn' ? 'সম্পন্ন' : 'Completed'}
                        </>
                      ) : (
                        lang === 'bn' ? 'বাতিল' : 'Cancelled'
                      )}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── CREATE GOAL MODAL (LEGACY ALIGNED DESIGN) ── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 no-select overflow-y-auto hide-scrollbar">
          <div className="absolute inset-0" onClick={() => setShowCreateModal(false)} />
          
          <div className="bg-white dark:bg-zinc-900 w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col animate-slide-up relative z-10">
            {/* Header */}
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <HandCoins className="w-6 h-6 text-emerald-500" />
                {t.createGoal}
              </h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="p-3 bg-zinc-100 touch-target-height hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGoal} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto hide-scrollbar p-5 space-y-6">
                
                {/* 1. Switcher (Giant Legacy buttons) */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                    {t.goalType}
                  </span>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => { triggerHaptic('single'); setGoalType('savings'); }}
                      className={`py-5 px-4 rounded-2xl flex flex-col items-center justify-center gap-2 border-3 transition-all cursor-pointer ${
                        goalType === 'savings'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-500 dark:text-emerald-400 font-bold shadow-lg shadow-emerald-100 dark:shadow-none'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-650 hover:bg-zinc-150 dark:bg-zinc-850 dark:border-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      <HandCoins className="w-7 h-7 stroke-[2.5]" />
                      <span className="text-lg font-black">{t.savings}</span>
                      <span className="text-xs opacity-80">{lang === 'bn' ? 'সঞ্চয় বা ডিপিএস স্কিম' : 'Savings or DPS Scheme'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { triggerHaptic('single'); setGoalType('deposit'); }}
                      className={`py-5 px-4 rounded-2xl flex flex-col items-center justify-center gap-2 border-3 transition-all cursor-pointer ${
                        goalType === 'deposit'
                          ? 'bg-rose-50 border-rose-500 text-rose-700 dark:bg-rose-950/20 dark:border-rose-500 dark:text-rose-450 font-bold shadow-lg shadow-rose-100 dark:shadow-none'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-650 hover:bg-zinc-150 dark:bg-zinc-850 dark:border-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      <Clock className="w-7 h-7 stroke-[2.5]" />
                      <span className="text-lg font-black">{t.deposit}</span>
                      <span className="text-xs opacity-80">{lang === 'bn' ? 'ফিক্সড ডিপোজিট / লোন কিস্তি' : 'Fixed Deposit / Repayment'}</span>
                    </button>
                  </div>
                </div>

                {/* 2. Title Input */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                    {t.goalTitle}
                  </span>
                  <input
                    type="text"
                    required
                    placeholder={lang === 'bn' ? 'উদা: নতুন ঘর তৈরি, করিমের ৫০ হাজার লোন' : 'e.g. Purchase Land, Karim 50k repayment'}
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    className="w-full px-4 py-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold text-sm text-zinc-800 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* 3. Target Amount */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                    {t.targetAmount} (৳) *
                  </span>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    placeholder="50,000"
                    value={targetAmount}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9.]/g, '');
                      setTargetAmount(clean ? formatNumber(parseFloat(clean), lang) : '');
                    }}
                    className="w-full px-4 py-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl font-black text-2xl text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* 4. Installment details */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                      {t.installmentAmount} (৳)
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="1,000"
                      value={installmentAmount}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^0-9.]/g, '');
                        setInstallmentAmount(clean ? formatNumber(parseFloat(clean), lang) : '');
                      }}
                      className="w-full px-4 py-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold text-sm text-zinc-800 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                      {t.frequency}
                    </span>
                    <select
                      value={frequency}
                      onChange={(e: any) => setFrequency(e.target.value)}
                      className="w-full px-3 py-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold text-sm text-zinc-800 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="daily">{t.daily}</option>
                      <option value="weekly">{t.weekly}</option>
                      <option value="monthly">{t.monthly}</option>
                      <option value="flexible">{t.flexible}</option>
                    </select>
                  </div>
                </div>

                {/* 5. Link Customer */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                    {t.linkCustomer}
                  </span>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full px-3 py-3 bg-white dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-850 rounded-xl font-bold text-sm text-zinc-800 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- {lang === 'bn' ? 'গ্রাহক সিলেক্ট করুন (ঐচ্ছিক)' : 'Select client (Optional)'} --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} (৳{formatNumber(c.outstandingDue, lang)})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
                {formError && (
                  <div className="p-4 mb-4 bg-rose-50 dark:bg-rose-900/30 rounded-xl text-rose-600 dark:text-rose-400 font-semibold text-sm flex items-start gap-2">
                    <AlertCircle className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-lg rounded-2xl shadow-lg shadow-emerald-100 dark:shadow-none transition-all cursor-pointer flex items-center justify-center"
                >
                  {isSubmitting ? t.saving : (lang === 'bn' ? 'লক্ষ্য সংরক্ষণ করুন' : 'Confirm & Save Goal')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── GOAL DETAIL VIEW MODAL (LEGACY ALIGNED DESIGN) ── */}
      {selectedGoal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 no-select overflow-y-auto hide-scrollbar">
          <div className="absolute inset-0" onClick={() => setSelectedGoal(null)} />

          <div className="bg-white dark:bg-zinc-900 w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col animate-slide-up relative z-10">
            
            {/* Header */}
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
              <div className="min-w-0">
                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 ${
                  selectedGoal.type === 'savings' 
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400' 
                    : 'bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-455'
                }`}>
                  <HandCoins className="w-3.5 h-3.5" />
                  {selectedGoal.type === 'savings' ? t.savings : t.deposit}
                </span>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white truncate leading-snug mt-1.5">
                  {selectedGoal.title}
                </h3>
              </div>
              
              <div className="flex items-center gap-1.5 shrink-0">
                {selectedGoal.status === 'active' && (
                  <button
                    onClick={openDeleteConfirmModal}
                    className="p-3 bg-zinc-100 hover:bg-rose-50 dark:bg-zinc-800 dark:hover:bg-rose-950/30 rounded-full text-zinc-550 hover:text-rose-600 dark:text-zinc-400 transition-colors cursor-pointer"
                    title={lang === 'bn' ? 'মুছে ফেলুন' : 'Delete Goal'}
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <button 
                  onClick={() => setSelectedGoal(null)}
                  className="p-3 bg-zinc-100 touch-target-height hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Modal Content */}
            <div className="flex-1 overflow-y-auto hide-scrollbar p-5 space-y-6">
              
              {/* Goal Statistics Info Grid */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 rounded-2xl">
                  <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider block">{t.targetAmount}</span>
                  <span className="text-base font-black text-zinc-800 dark:text-white mt-1 block">৳{formatNumber(selectedGoal.targetAmount, lang)}</span>
                </div>
                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 rounded-2xl">
                  <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider block">{t.savedAmount}</span>
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-1 block">৳{formatNumber(selectedGoal.savedAmount, lang)}</span>
                </div>
                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 rounded-2xl">
                  <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider block">{t.remaining}</span>
                  <span className="text-base font-black text-rose-600 dark:text-rose-455 mt-1 block">৳{formatNumber(Math.max(0, selectedGoal.targetAmount - selectedGoal.savedAmount), lang)}</span>
                </div>
              </div>

              {/* Visual Progress Bar */}
              <div className="space-y-2">
                <div className="w-full h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-700 ${
                      selectedGoal.status === 'completed' 
                        ? 'bg-emerald-500' 
                        : selectedGoal.type === 'savings' ? 'bg-emerald-500/80' : 'bg-rose-500/85'
                    }`}
                    style={{ width: `${Math.min(100, Math.round((selectedGoal.savedAmount / selectedGoal.targetAmount) * 100))}%` }}
                  />
                </div>
                <div className="text-right text-xs font-black text-zinc-400">
                  {Math.min(100, Math.round((selectedGoal.savedAmount / selectedGoal.targetAmount) * 100))}% {lang === 'bn' ? 'পূর্ণ হয়েছে' : 'Completed'}
                </div>
              </div>

              {/* Installment Info & Client Linked */}
              <div className="bg-zinc-50 dark:bg-zinc-950/40 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-850 text-sm font-semibold space-y-2">
                {selectedGoal.customerName && (
                  <div className="flex justify-between items-center text-zinc-500 dark:text-zinc-400">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{lang === 'bn' ? 'সংযুক্ত গ্রাহক' : 'Linked Customer'}</span>
                    <span className="font-extrabold text-zinc-800 dark:text-zinc-200">{selectedGoal.customerName}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-zinc-500 dark:text-zinc-400">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{lang === 'bn' ? 'কিস্তি শিডিউল' : 'Installment Details'}</span>
                  <span className="font-extrabold text-zinc-800 dark:text-zinc-200">
                    {selectedGoal.installmentAmount ? `৳${formatNumber(selectedGoal.installmentAmount, lang)} / ` : ''}
                    {selectedGoal.frequency === 'daily' && t.daily}
                    {selectedGoal.frequency === 'weekly' && t.weekly}
                    {selectedGoal.frequency === 'monthly' && t.monthly}
                    {selectedGoal.frequency === 'flexible' && t.flexible}
                  </span>
                </div>
              </div>

              {/* INSTALLMENT FORM SECTION */}
              {selectedGoal.status === 'active' && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                  {!showInstallmentForm ? (
                    <button
                      onClick={() => { triggerHaptic('single'); setShowInstallmentForm(true); }}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer text-sm"
                    >
                      <Plus className="w-5 h-5" />
                      {t.addInstallment}
                    </button>
                  ) : (
                    <form onSubmit={handleAddContribution} className="space-y-4 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-150 dark:border-zinc-850 animate-reveal">
                      <div className="flex items-center justify-between border-b border-zinc-250 dark:border-zinc-850 pb-2">
                        <span className="font-black text-sm text-zinc-700 dark:text-zinc-300">{t.addInstallment}</span>
                        <button 
                          type="button"
                          onClick={() => setShowInstallmentForm(false)}
                          className="p-1 text-zinc-400 hover:text-rose-500 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-zinc-400 uppercase tracking-wider">{t.amountPaid} (৳) *</label>
                        <input
                          type="text"
                          required
                          inputMode="numeric"
                          placeholder={selectedGoal.installmentAmount ? String(selectedGoal.installmentAmount) : '1,000'}
                          value={installmentInput}
                          onChange={(e) => {
                            const clean = e.target.value.replace(/[^0-9.]/g, '');
                            setInstallmentInput(clean ? formatNumber(parseFloat(clean), lang) : '');
                          }}
                          className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-black text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-zinc-400 uppercase tracking-wider">{lang === 'bn' ? 'নোট / মন্তব্য (ঐচ্ছিক)' : 'Note / Reference (Optional)'}</label>
                        <input
                          type="text"
                          placeholder={lang === 'bn' ? 'উদা: ১ম সপ্তাহের কিস্তি' : 'e.g. Week 1 installment'}
                          value={installmentNote}
                          onChange={(e) => setInstallmentNote(e.target.value)}
                          className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      {/* Checkbox for Ledger Sync (Recommended Settings) */}
                      {selectedGoal.customerId && (
                        <div className="flex items-start gap-2.5 pt-1.5">
                          <input
                            type="checkbox"
                            id="ledger_sync_checkbox"
                            checked={syncToLedger}
                            onChange={(e) => setSyncToLedger(e.target.checked)}
                            className="w-4.5 h-4.5 accent-emerald-600 rounded cursor-pointer mt-0.5"
                          />
                          <label htmlFor="ledger_sync_checkbox" className="text-xs font-bold text-zinc-500 dark:text-zinc-400 cursor-pointer selection-none leading-normal">
                            {t.recordTxInLedger}
                          </label>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors cursor-pointer text-xs"
                      >
                        {isSubmitting ? t.saving : (lang === 'bn' ? 'জমা করুন' : 'Confirm Deposit')}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* CONTRIBUTION LOGS TIMELINE */}
              <div className="space-y-3">
                <span className="text-xs font-extrabold text-zinc-400 uppercase tracking-wider block">
                  {lang === 'bn' ? 'জমার বিবরণী' : 'Contribution Ledger'} ({selectedGoal.contributions?.length || 0})
                </span>

                <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-850 rounded-2xl overflow-hidden max-h-[220px] overflow-y-auto divide-y divide-zinc-200/50 dark:divide-zinc-850">
                  {(!selectedGoal.contributions || selectedGoal.contributions.length === 0) ? (
                    <div className="p-6 text-center text-xs font-bold text-zinc-400 dark:text-zinc-500 flex flex-col items-center gap-1.5">
                      <ReceiptText className="w-8 h-8 stroke-[1.5] text-zinc-350 dark:text-zinc-700" />
                      {lang === 'bn' ? 'কোন কিস্তি বা জমার রেকর্ড পাওয়া যায়নি' : 'No payments logged yet'}
                    </div>
                  ) : (
                    [...selectedGoal.contributions].reverse().map((c, index) => (
                      <div key={index} className="p-3 flex items-center justify-between gap-4 text-xs">
                        <div className="min-w-0">
                          <div className="font-extrabold text-zinc-800 dark:text-zinc-200 truncate">
                            {c.note || (lang === 'bn' ? 'কিস্তি জমা' : 'Installment Added')}
                          </div>
                          <div className="text-[10px] text-zinc-400 font-bold mt-0.5">
                            {new Date(c.date).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{' • '}{new Date(c.date).toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <span className="font-black text-emerald-600 dark:text-emerald-400 shrink-0 text-sm">
                          + ৳{formatNumber(c.amount, lang)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Cancel Goal button if active */}
              {selectedGoal.status === 'active' && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      triggerHaptic('single');
                      setShowCancelConfirm(true);
                    }}
                    className="text-xs font-extrabold text-rose-600 hover:text-rose-700 dark:text-rose-455 cursor-pointer hover:underline"
                  >
                    {lang === 'bn' ? 'লক্ষ্যটি বাতিল করুন' : 'Cancel this Goal'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTOM CANCEL CONFIRMATION POPUP ── */}
      {showCancelConfirm && selectedGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-reveal">
          <div className="absolute inset-0" onClick={() => setShowCancelConfirm(false)} />
          
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 w-full max-w-xs rounded-3xl shadow-2xl p-5 relative z-10 space-y-4 animate-scaleIn text-center">
            <div className="flex flex-col items-center gap-2">
              <AlertCircle className="w-12 h-12 text-rose-500 stroke-[2]" />
              <h3 className="text-base font-black text-zinc-900 dark:text-white leading-snug">
                {lang === 'bn' ? 'লক্ষ্য বাতিল নিশ্চিতকরণ' : 'Confirm Goal Cancellation'}
              </h3>
              <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold leading-relaxed mt-1">
                {lang === 'bn' 
                  ? 'আপনি কি নিশ্চিতভাবে এই লক্ষ্যটি বাতিল করতে চান? এটি আর পরিবর্তন করা যাবে না।' 
                  : 'Are you sure you want to cancel this goal? This action is permanent.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => { triggerHaptic('single'); setShowCancelConfirm(false); }}
                className="py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                {lang === 'bn' ? 'না, ফেরত যান' : 'No, Go Back'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  triggerHaptic('double');
                  await updateGoalStatus(selectedGoal.id, 'cancelled');
                  setShowCancelConfirm(false);
                  setSelectedGoal(null);
                }}
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                {lang === 'bn' ? 'হ্যাঁ, বাতিল করুন' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTOM DELETE CONFIRMATION POPUP ── */}
      {showDeleteConfirm && selectedGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-reveal">
          <div className="absolute inset-0" onClick={() => setShowDeleteConfirm(false)} />
          
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 w-full max-w-xs rounded-3xl shadow-2xl p-5 relative z-10 space-y-4 animate-scaleIn text-center">
            <div className="flex flex-col items-center gap-2">
              <Trash2 className="w-12 h-12 text-rose-500 stroke-[2]" />
              <h3 className="text-base font-black text-zinc-900 dark:text-white leading-snug">
                {lang === 'bn' ? 'লক্ষ্য ডিলিট নিশ্চিতকরণ' : 'Confirm Goal Deletion'}
              </h3>
              <p className="text-xs text-zinc-550 dark:text-zinc-400 font-semibold leading-relaxed mt-1">
                {lang === 'bn' 
                  ? 'আপনি কি নিশ্চিতভাবে এই লক্ষ্যটি ডিলিট করতে চান? এর কিস্তির সকল তথ্য চিরতরে মুছে যাবে।' 
                  : 'Are you sure you want to delete this goal? All contribution logs will be permanently deleted.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => { triggerHaptic('single'); setShowDeleteConfirm(false); }}
                className="py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                {lang === 'bn' ? 'না, ফেরত যান' : 'No, Go Back'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  triggerHaptic('double');
                  await deleteGoal(selectedGoal.id);
                  setShowDeleteConfirm(false);
                  setSelectedGoal(null);
                }}
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                {lang === 'bn' ? 'হ্যাঁ, ডিলিট করুন' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
