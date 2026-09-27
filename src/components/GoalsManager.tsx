import React, { useState, useEffect } from 'react';
import { Customer, SavingGoal, GoalContribution, Reminder } from '../types';
import { 
  Target, Calendar, Plus, Users, Trash2, CheckCircle2, ChevronRight, ChevronDown, CreditCard, X, AlertCircle, ReceiptText, AlertTriangle, PiggyBank, CalendarClock, RotateCcw, Goal, Percent, Calculator, Bell, BellRing, Info 
} from 'lucide-react';
import { motion } from 'motion/react';
import { triggerHaptic } from '../lib/haptics';
import { translations, Language, formatNumber, formatIndianNumberString } from '../lib/translations';
import { toast } from 'sonner';

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
    customerName?: string,
    notes?: string,
    principalAmount?: number,
    interestRate?: number,
    interestAmount?: number,
    tenure?: number
  ) => Promise<string | null>;
  addGoalContribution: (
    goalId: string,
    amount: number,
    note?: string,
    recordAsCustomerTransaction?: boolean
  ) => Promise<SavingGoal | null | void>;
  deleteGoal: (goalId: string) => Promise<void>;
  updateGoalStatus: (goalId: string, status: 'active' | 'completed' | 'cancelled') => Promise<void>;
  reminders?: Reminder[];
  addReminder?: (
    customerId: string, 
    notes: string, 
    dueDate: Date,
    extra?: {
      type?: 'customer' | 'emi';
      goalId?: string;
      customerName?: string;
      emiDayOfMonth?: number;
      installmentAmount?: number;
    }
  ) => Promise<void>;
  deleteReminder?: (id: string) => Promise<void>;
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
  reminders = [],
  addReminder,
  deleteReminder,
  lang
}: GoalsManagerProps) {
  const t = translations[lang];

  // Tab filter: 'active' or 'history'
  const [filterTab, setFilterTab] = useState<'active' | 'history'>('active');

  // Create Goal Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [goalType, setGoalType] = useState<'savings' | 'deposit'>('deposit'); // Default to EMI as it's used most often
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'flexible'>('monthly');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // 4. EMI Custom Setup: Tenure & Interest Rate
  const [tenure, setTenure] = useState<string>('6'); // Default 6 months tenure
  const [hasInterest, setHasInterest] = useState<boolean>(false);
  const [interestRate, setInterestRate] = useState<string>('10'); // Default 10% annual/fee

  // Selected Goal Details Modal state
  const [selectedGoal, setSelectedGoal] = useState<SavingGoal | null>(null);
  const [showInstallmentForm, setShowInstallmentForm] = useState(false);
  const [isEmiBreakdownOpen, setIsEmiBreakdownOpen] = useState(false);
  const [installmentInput, setInstallmentInput] = useState('');
  const [installmentNote, setInstallmentNote] = useState('');
  const [syncToLedger, setSyncToLedger] = useState(true);

  // 1 & 2. Custom Confirmation Popups (Learned from Move Customer to Trash and Restore)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReactivateConfirm, setShowReactivateConfirm] = useState(false);

  // EMI Notification Reminder Modal State
  const [emiReminderGoal, setEmiReminderGoal] = useState<SavingGoal | null>(null);
  const [emiDueDay, setEmiDueDay] = useState<number>(5);
  const [emiAlertTime, setEmiAlertTime] = useState<string>('09:00');
  const [isSavingEmiReminder, setIsSavingEmiReminder] = useState(false);

  const handleSaveEmiReminder = async () => {
    if (!emiReminderGoal || !addReminder) return;
    setIsSavingEmiReminder(true);
    try {
      // If an existing reminder exists for this goal, delete it first
      const existing = reminders.find(r => r.goalId === emiReminderGoal.id);
      if (existing && deleteReminder) {
        await deleteReminder(existing.id);
      }

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const day = Math.min(31, Math.max(1, Number(emiDueDay)));
      
      let targetMonth = month;
      let targetYear = year;
      if (now.getDate() > day) {
        targetMonth = month + 1;
        if (targetMonth > 11) {
          targetMonth = 0;
          targetYear++;
        }
      }
      const [hours, minutes] = emiAlertTime.split(':').map(Number);
      const dueDate = new Date(targetYear, targetMonth, day, hours || 9, minutes || 0, 0);

      await addReminder(
        emiReminderGoal.customerId || '',
        lang === 'bn' 
          ? `${emiReminderGoal.title} - মাসিক কিস্তি পরিশোধের সময় এসেছে` 
          : `${emiReminderGoal.title} - Monthly Installment Due`,
        dueDate,
        {
          type: 'emi',
          goalId: emiReminderGoal.id,
          customerName: emiReminderGoal.title,
          emiDayOfMonth: day,
          installmentAmount: emiReminderGoal.installmentAmount || emiReminderGoal.targetAmount
        }
      );

      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
          Notification.requestPermission();
        }
      }

      triggerHaptic('double');
      toast.success(
        lang === 'bn' 
          ? `মাসিক কিস্তির অ্যালার্ট সক্রিয় করা হয়েছে (প্রতি মাসের ${formatNumber(day, 'bn')} তারিখ)` 
          : `EMI reminder set for day ${day} of every month!`
      );
      setEmiReminderGoal(null);
    } catch (err) {
      toast.error(lang === 'bn' ? 'রিমাইন্ডার সংরক্ষণ করা যায়নি।' : 'Failed to save reminder.');
    } finally {
      setIsSavingEmiReminder(false);
    }
  };

  const handleRemoveEmiReminder = async () => {
    if (!emiReminderGoal || !deleteReminder) return;
    const existing = reminders.find(r => r.goalId === emiReminderGoal.id);
    if (existing) {
      await deleteReminder(existing.id);
      triggerHaptic('single');
      toast.info(lang === 'bn' ? 'কিস্তির অ্যালার্ট বন্ধ করা হয়েছে' : 'EMI reminder turned off');
    }
    setEmiReminderGoal(null);
  };

  // 1. Disable background scrolling when ANY modal is active
  useEffect(() => {
    if (showCreateModal || selectedGoal || showCancelConfirm || showDeleteConfirm || showReactivateConfirm || emiReminderGoal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showCreateModal, selectedGoal, showCancelConfirm, showDeleteConfirm, showReactivateConfirm, emiReminderGoal]);

  useEffect(() => {
    setIsEmiBreakdownOpen(false);
  }, [selectedGoal?.id]);

  // Computed lists
  const activeGoals = goals.filter(g => g.status === 'active');
  const historyGoals = goals.filter(g => g.status !== 'active');
  const visibleGoals = filterTab === 'active' ? activeGoals : historyGoals;

  // Helper to parse numeric string safely supporting Bengali numerals
  const parseAmount = (val: string): number => {
    if (!val) return 0;
    const ascii = val.replace(/[০-৯]/g, d => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
    const clean = ascii.replace(/[^0-9.]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const handleAmountChange = (val: string, setter: (s: string) => void) => {
    const ascii = val.replace(/[০-৯]/g, d => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
    const clean = ascii.replace(/[^0-9.]/g, '');
    const dots = clean.split('.');
    let sanitized = clean;
    if (dots.length > 2) {
      sanitized = dots[0] + '.' + dots.slice(1).join('');
    }
    setter(formatIndianNumberString(sanitized));
  };

  // 4. Auto-calculate EMI installment when principal, tenure, frequency, or interest changes
  useEffect(() => {
    if (goalType !== 'deposit' || frequency === 'flexible') return;
    const P = parseAmount(targetAmount);
    const N = parseInt(tenure) || 0;
    if (P > 0 && N > 0) {
      let interestAmt = 0;
      if (hasInterest) {
        const r = parseFloat(interestRate) || 0;
        const years = frequency === 'monthly' ? N / 12 : frequency === 'weekly' ? N / 52 : N / 365;
        interestAmt = Math.round(P * (r / 100) * years);
      }
      const totalPayable = P + interestAmt;
      const emi = Math.ceil(totalPayable / N);
      setInstallmentAmount(formatIndianNumberString(String(emi)));
    }
  }, [targetAmount, tenure, frequency, hasInterest, interestRate, goalType]);

  // Quick helper to compute EMI calculation preview
  const emiPreview = React.useMemo(() => {
    if (goalType !== 'deposit') return null;
    const P = parseAmount(targetAmount);
    const N = parseInt(tenure) || 0;
    if (P <= 0 || N <= 0 || frequency === 'flexible') return null;
    let interestAmt = 0;
    if (hasInterest) {
      const r = parseFloat(interestRate) || 0;
      const years = frequency === 'monthly' ? N / 12 : frequency === 'weekly' ? N / 52 : N / 365;
      interestAmt = Math.round(P * (r / 100) * years);
    }
    const total = P + interestAmt;
    const emi = Math.ceil(total / N);
    return { principal: P, interest: interestAmt, total, emi, count: N };
  }, [targetAmount, tenure, frequency, hasInterest, interestRate, goalType]);

  // Helper to extract EMI specs from selectedGoal (or parse fallback from notes if legacy)
  const selectedGoalEmiDetails = React.useMemo(() => {
    if (!selectedGoal) return null;
    let principal = selectedGoal.principalAmount;
    let interestRate = selectedGoal.interestRate;
    let interestAmount = selectedGoal.interestAmount;
    let tenure = selectedGoal.tenure;

    // Fallback parser if fields not stored directly but present in legacy notes
    if (selectedGoal.notes && (!principal || !tenure)) {
      const pMatch = selectedGoal.notes.match(/Principal:\s*[৳Tk.]*\s*([0-9,]+)/i);
      if (pMatch && !principal) principal = parseAmount(pMatch[1]);

      const feeMatch = selectedGoal.notes.match(/Fee:\s*[৳Tk.]*\s*([0-9,]+)/i);
      if (feeMatch && interestAmount === undefined) interestAmount = parseAmount(feeMatch[1]);

      const rateMatch = selectedGoal.notes.match(/\((\d+(?:\.\d+)?)\s*%\)/);
      if (rateMatch && interestRate === undefined) interestRate = parseFloat(rateMatch[1]);

      const tenureMatch = selectedGoal.notes.match(/EMI:\s*(\d+)/i);
      if (tenureMatch && !tenure) tenure = parseInt(tenureMatch[1], 10);
    }

    if (!principal && selectedGoal.type === 'deposit') {
      principal = Math.max(0, selectedGoal.targetAmount - (interestAmount || 0));
    }

    const hasEmiInfo = selectedGoal.type === 'deposit' || principal !== undefined || tenure !== undefined;
    if (!hasEmiInfo) return null;

    const tenureUnit = selectedGoal.frequency === 'monthly' 
      ? (lang === 'bn' ? 'মাস' : 'Months') 
      : selectedGoal.frequency === 'weekly' 
        ? (lang === 'bn' ? 'সপ্তাহ' : 'Weeks') 
        : (lang === 'bn' ? 'দিন' : 'Days');

    const cleanNotes = selectedGoal.notes 
      ? selectedGoal.notes.replace(/\s*•?\s*EMI:\s*\d+.*$/i, '').trim() 
      : '';

    return {
      principal: principal || selectedGoal.targetAmount,
      interestRate,
      interestAmount: interestAmount || 0,
      tenure,
      tenureUnit,
      cleanNotes
    };
  }, [selectedGoal, lang]);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    triggerHaptic('single');

    if (!goalTitle.trim()) {
      setFormError(lang === 'bn' ? 'লক্ষ্যের শিরোনাম লিখুন' : 'Please enter a goal title');
      return;
    }

    const principalVal = parseAmount(targetAmount);
    if (!principalVal || principalVal <= 0) {
      setFormError(lang === 'bn' ? 'টার্গেট পরিমাণ সঠিক নয়' : 'Please enter a valid target amount');
      return;
    }

    // Determine target amount (with interest if applicable)
    let finalTargetVal = principalVal;
    let finalNote = notes.trim();

    if (goalType === 'deposit' && frequency !== 'flexible') {
      const N = parseInt(tenure) || 0;
      if (N <= 0) {
        setFormError(lang === 'bn' ? 'কিস্তির মেয়াদ সঠিক নয়' : 'Please enter a valid tenure');
        return;
      }
      if (hasInterest) {
        const r = parseFloat(interestRate) || 0;
        const years = frequency === 'monthly' ? N / 12 : frequency === 'weekly' ? N / 52 : N / 365;
        const interestAmt = Math.round(principalVal * (r / 100) * years);
        finalTargetVal = principalVal + interestAmt;
        const tenureUnit = frequency === 'monthly' 
          ? (lang === 'bn' ? 'মাস' : 'Months') 
          : frequency === 'weekly' 
            ? (lang === 'bn' ? 'সপ্তাহ' : 'Weeks') 
            : (lang === 'bn' ? 'দিন' : 'Days');
        const emiSpec = `EMI: ${N} ${tenureUnit} | Principal: ৳${formatNumber(principalVal, lang)} | Fee: ৳${formatNumber(interestAmt, lang)} (${interestRate}%)`;
        finalNote = finalNote ? `${finalNote} • ${emiSpec}` : emiSpec;
      }
    }

    const instVal = installmentAmount ? parseAmount(installmentAmount) : undefined;
    if (instVal !== undefined && instVal <= 0) {
      setFormError(lang === 'bn' ? 'কিস্তির পরিমাণ সঠিক নয়' : 'Please enter a valid installment amount');
      return;
    }
    if (instVal !== undefined && instVal > finalTargetVal) {
      setFormError(lang === 'bn' ? 'কিস্তির পরিমাণ মোট লক্ষ্যের চেয়ে বেশি হতে পারে না' : 'Installment cannot be greater than target amount');
      return;
    }

    setIsSubmitting(true);

    const linkedCust = customers.find(c => c.id === selectedCustomerId);
    const tenureNum = parseInt(tenure) || 0;
    const interestAmt = (goalType === 'deposit' && hasInterest)
      ? Math.round(principalVal * ((parseFloat(interestRate) || 0) / 100) * (frequency === 'monthly' ? tenureNum / 12 : frequency === 'weekly' ? tenureNum / 52 : tenureNum / 365))
      : 0;

    try {
      const [res] = await Promise.all([
        createGoal(
          goalTitle.trim(),
          finalTargetVal,
          frequency,
          instVal,
          goalType,
          selectedCustomerId || undefined,
          linkedCust?.name,
          finalNote || undefined,
          goalType === 'deposit' ? principalVal : undefined,
          goalType === 'deposit' && hasInterest ? parseFloat(interestRate) : undefined,
          goalType === 'deposit' && hasInterest ? interestAmt : 0,
          goalType === 'deposit' && frequency !== 'flexible' ? tenureNum : undefined
        ),
        new Promise(resolve => setTimeout(resolve, 600))
      ]);

      if (res) {
        setGoalTitle('');
        setTargetAmount('');
        setGoalType('deposit');
        setFrequency('monthly');
        setInstallmentAmount('');
        setTenure('6');
        setHasInterest(false);
        setInterestRate('10');
        setSelectedCustomerId('');
        setNotes('');
        setShowCreateModal(false);
        toast.success(lang === 'bn' ? 'নতুন লক্ষ্য সফলভাবে তৈরি হয়েছে' : 'Goal created successfully');
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

    const amt = parseAmount(installmentInput);
    if (!amt || amt <= 0) return;

    setIsSubmitting(true);
    try {
      const [updated] = await Promise.all([
        addGoalContribution(selectedGoal.id, amt, installmentNote, syncToLedger),
        new Promise(resolve => setTimeout(resolve, 600))
      ]);
      
      const newSavedAmount = (Number(selectedGoal.savedAmount) || 0) + amt;
      const isCompleted = newSavedAmount >= (Number(selectedGoal.targetAmount) || 0);
      const newStatus = isCompleted ? 'completed' : selectedGoal.status;

      const fallbackUpdated: SavingGoal = updated || {
        ...selectedGoal,
        savedAmount: newSavedAmount,
        status: newStatus,
        contributions: [
          ...(selectedGoal.contributions || []),
          {
            id: 'temp-' + Date.now(),
            amount: amt,
            date: new Date().toISOString(),
            note: installmentNote.trim()
          }
        ]
      };

      setSelectedGoal(fallbackUpdated);
      setInstallmentInput('');
      setInstallmentNote('');
      setShowInstallmentForm(false);
      
      if (isCompleted) {
        toast.success(lang === 'bn' ? 'অভিনন্দন! লক্ষ্য সম্পূর্ণ অর্জিত হয়েছে 🎉' : 'Congratulations! Goal fully achieved 🎉');
      } else {
        toast.success(lang === 'bn' ? 'কিস্তি সফলভাবে জমা হয়েছে' : 'Contribution recorded successfully');
      }
    } catch (err) {
      console.warn("Failed to record installment", err);
      toast.error(lang === 'bn' ? 'কিস্তি জমা দেওয়া সম্ভব হয়নি' : 'Failed to record contribution');
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
      {/* 3 & 4. HEADER SECTION (MATCHING CLIENTS HEADER & BUTTON EXACTLY) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <Goal className="w-5 h-5 text-emerald-500" />
          <span>{t.goalsHeaderTitle}</span>
          <span className="text-sm font-semibold text-zinc-400 dark:text-zinc-500">
            ({formatNumber(goals.length, lang)})
          </span>
        </h2>

        <button
          onClick={() => { triggerHaptic('single'); setShowCreateModal(true); }}
          className="px-5 py-3 bg-emerald-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-emerald-100 dark:shadow-none hover:bg-emerald-700 transition-colors cursor-pointer text-base shrink-0"
          id="create_goal_btn"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          {t.createGoal}
        </button>
      </div>

      {/* 2. FILTER TABS (FILLS OUT SCREEN LEFT TO RIGHT) */}
      <div className="flex w-full bg-zinc-100 dark:bg-zinc-900 p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => { triggerHaptic('single'); setFilterTab('active'); }}
          className={`flex-1 py-3 text-center text-sm font-black rounded-xl transition-all cursor-pointer ${
            filterTab === 'active'
              ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          {lang === 'bn' ? 'চলমান লক্ষ্যসমূহ' : 'Active Goals'} ({activeGoals.length})
        </button>
        <button
          onClick={() => { triggerHaptic('single'); setFilterTab('history'); }}
          className={`flex-1 py-3 text-center text-sm font-black rounded-xl transition-all cursor-pointer ${
            filterTab === 'history'
              ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
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
          <p className="text-xs max-w-xs">{lang === 'bn' ? 'ইএমআই বা সঞ্চয় লক্ষ্য তৈরি করতে উপরের বাটনে চাপ দিন।' : 'Create EMI installment plans or savings targets using the button above.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleGoals.map(goal => {
            const percent = Math.min(100, Math.round(((goal.savedAmount || 0) / (goal.targetAmount || 1)) * 100));
            const isSavings = goal.type === 'savings';
            
            return (
              <div 
                key={goal.id}
                onClick={() => { triggerHaptic('single'); setSelectedGoal(goal); }}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/30 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all cursor-pointer relative group flex flex-col justify-between min-h-[180px]"
              >
                <div>
                  {/* Title & Badge (Consistent Distinct Icons) */}
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
                    <div className="flex items-center gap-1.5 shrink-0">
                      {goal.status === 'active' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerHaptic('single');
                            setEmiReminderGoal(goal);
                            const existing = reminders.find(r => r.goalId === goal.id && r.active);
                            if (existing?.emiDayOfMonth) {
                              setEmiDueDay(existing.emiDayOfMonth);
                            }
                          }}
                          className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                            reminders.some(r => r.goalId === goal.id && r.active)
                              ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                              : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                          title={
                            reminders.some(r => r.goalId === goal.id && r.active)
                              ? (lang === 'bn' ? 'কিস্তির অ্যালার্ট সক্রিয় (৭ দিন আগে তাগাদা)' : 'EMI Alert Active (7-day advance reminder)')
                              : (lang === 'bn' ? 'কিস্তির অ্যালার্ট সেট করুন' : 'Set EMI Reminder')
                          }
                        >
                          {reminders.some(r => r.goalId === goal.id && r.active) ? (
                            <BellRing className="w-4 h-4 text-amber-500 animate-pulse" />
                          ) : (
                            <Bell className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase shrink-0 flex items-center gap-1 ${
                        isSavings 
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400' 
                          : 'bg-rose-50 text-[#e0385e] dark:bg-rose-950/20 dark:text-rose-400'
                      }`}>
                        {isSavings ? (
                          <PiggyBank className="w-3.5 h-3.5" />
                        ) : (
                          <CalendarClock className="w-3.5 h-3.5" />
                        )}
                        {isSavings ? t.savings : t.deposit}
                      </span>
                    </div>
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
                      ৳{formatNumber(goal.savedAmount || 0, lang)} / ৳{formatNumber(goal.targetAmount, lang)}
                    </span>
                    <span className="text-zinc-400">{percent}%</span>
                  </div>
                  
                  <div className="w-full h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-700 ${
                        goal.status === 'completed' 
                          ? 'bg-emerald-500' 
                          : isSavings ? 'bg-emerald-500/80' : 'bg-[#e0385e]'
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

      {/* ── CREATE GOAL MODAL ── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 no-select overflow-y-auto hide-scrollbar">
          <div className="absolute inset-0" onClick={() => setShowCreateModal(false)} />
          
          <div className="bg-white dark:bg-zinc-900 w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col animate-slide-up relative z-10">
            {/* Header (No icon - matches Add New Ledger Entry) */}
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                {t.createGoal}
              </h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="p-3 bg-zinc-100 touch-target-height hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer"
                aria-label="Close"
                id="close_goal_modal_btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGoal} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto hide-scrollbar p-5 space-y-6">
                
                {/* 1. Goal Type Selection (EMI / INSTALLMENT vs SAVINGS GOAL) */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                    {t.goalType}
                  </span>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => { triggerHaptic('single'); setGoalType('deposit'); }}
                      className={`py-5 px-4 rounded-2xl flex flex-col items-center justify-center gap-2 border-3 transition-all cursor-pointer ${
                        goalType === 'deposit'
                          ? 'bg-rose-50 border-[#e0385e] text-[#e0385e] dark:bg-rose-950/20 dark:border-[#e0385e] dark:text-rose-400 font-bold shadow-lg shadow-rose-100 dark:shadow-none'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-150 dark:bg-zinc-850 dark:border-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      <CalendarClock className="w-7 h-7 stroke-[2.5]" />
                      <span className="text-lg font-black">{t.deposit}</span>
                      <span className="text-xs opacity-80">{lang === 'bn' ? 'লোন, বাকি বা পণ্যের কিস্তি পরিশোধ' : 'Loan, credit or product EMI'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { triggerHaptic('single'); setGoalType('savings'); }}
                      className={`py-5 px-4 rounded-2xl flex flex-col items-center justify-center gap-2 border-3 transition-all cursor-pointer ${
                        goalType === 'savings'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-500 dark:text-emerald-400 font-bold shadow-lg shadow-emerald-100 dark:shadow-none'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-150 dark:bg-zinc-850 dark:border-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      <PiggyBank className="w-7 h-7 stroke-[2.5]" />
                      <span className="text-lg font-black">{t.savings}</span>
                      <span className="text-xs opacity-80">{lang === 'bn' ? 'ভবিষ্যতের জন্য সঞ্চয় বা ডিপিএস' : 'Savings or DPS Scheme'}</span>
                    </button>
                  </div>
                </div>

                {/* 2. Title Input */}
                <div className="space-y-1">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                    {t.goalTitle} *
                  </span>
                  <input
                    type="text"
                    required
                    placeholder={
                      goalType === 'deposit'
                        ? (lang === 'bn' ? 'লক্ষ্যের শিরোনাম লিখুন (যেমন: টিভি কিস্তি, বাইক লোন)' : 'Enter goal title (e.g. TV Installment, Bike Loan)')
                        : (lang === 'bn' ? 'লক্ষ্যের শিরোনাম লিখুন (যেমন: বাড়ি নির্মাণ, সঞ্চয় স্কিম)' : 'Enter goal title (e.g. House Construction, Savings Scheme)')
                    }
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-bold text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* 3. Target Amount */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                    {goalType === 'deposit' 
                      ? (lang === 'bn' ? 'মোট ঋণের পরিমাণ / আসল টাকা *' : 'Total Principal / Loan Amount *')
                      : `${t.targetAmount} *`
                    }
                  </span>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-zinc-400 dark:text-zinc-500 select-none">
                      ৳
                    </span>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      placeholder="0"
                      value={targetAmount}
                      onChange={(e) => handleAmountChange(e.target.value, setTargetAmount)}
                      className="w-full pl-10 pr-4 py-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-extrabold text-2xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Speedy Pad helpers */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[5000, 10000, 25000, 50000, 100000].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          triggerHaptic('single');
                          const cur = parseAmount(targetAmount);
                          setTargetAmount(formatIndianNumberString(String(cur + val)));
                        }}
                        className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 font-bold rounded-xl transition-all text-2xs cursor-pointer"
                      >
                        +{formatNumber(val, lang)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tick');
                        setTargetAmount('');
                      }}
                      className="px-3 py-2 bg-rose-50 dark:bg-rose-950/20 text-[#e0385e] font-bold rounded-xl transition-all text-2xs cursor-pointer"
                    >
                      {lang === 'bn' ? 'মুছুন' : 'Clear'}
                    </button>
                  </div>
                </div>

                {/* 4. EMI CUSTOM SETUP: TENURE & INTEREST RATE (Only for EMI / Installment) */}
                {goalType === 'deposit' && (
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
                      <Calculator className="w-4 h-4 text-[#e0385e]" />
                      <span className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                        {lang === 'bn' ? 'ইএমআই ক্যালকুলেটর ও কিস্তির হিসাব' : 'EMI & Tenure Auto-Calculator'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Frequency */}
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                          {t.frequency}
                        </span>
                        <select
                          value={frequency}
                          onChange={(e: any) => setFrequency(e.target.value)}
                          className="w-full px-3 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-850 dark:text-white font-bold text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                        >
                          <option value="monthly">{t.monthly}</option>
                          <option value="weekly">{t.weekly}</option>
                          <option value="daily">{t.daily}</option>
                          <option value="flexible">{t.flexible}</option>
                        </select>
                      </div>

                      {/* Tenure if not flexible */}
                      {frequency !== 'flexible' && (
                        <div className="space-y-1">
                          <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                            {frequency === 'monthly' && (lang === 'bn' ? 'মেয়াদ (মাস)' : 'Tenure (Months)')}
                            {frequency === 'weekly' && (lang === 'bn' ? 'মেয়াদ (সপ্তাহ)' : 'Tenure (Weeks)')}
                            {frequency === 'daily' && (lang === 'bn' ? 'মেয়াদ (দিন)' : 'Tenure (Days)')}
                          </span>
                          <input
                            type="number"
                            min="1"
                            max="360"
                            value={tenure}
                            onChange={(e) => setTenure(e.target.value)}
                            placeholder="6"
                            className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-bold text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      )}
                    </div>

                    {/* Quick Tenure Preset Chips */}
                    {frequency !== 'flexible' && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {frequency === 'monthly' && [3, 6, 12, 18, 24].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => { triggerHaptic('single'); setTenure(String(n)); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              tenure === String(n)
                                ? 'bg-[#e0385e] text-white shadow-sm'
                                : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-650 dark:text-zinc-300 hover:bg-zinc-100'
                            }`}
                          >
                            {formatNumber(n, lang)} {lang === 'bn' ? 'মাস' : 'Mo'}
                          </button>
                        ))}
                        {frequency === 'weekly' && [4, 8, 12, 24, 52].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => { triggerHaptic('single'); setTenure(String(n)); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              tenure === String(n)
                                ? 'bg-[#e0385e] text-white shadow-sm'
                                : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-650 dark:text-zinc-300 hover:bg-zinc-100'
                            }`}
                          >
                            {formatNumber(n, lang)} {lang === 'bn' ? 'সপ্তাহ' : 'Wk'}
                          </button>
                        ))}
                        {frequency === 'daily' && [30, 60, 90, 180, 365].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => { triggerHaptic('single'); setTenure(String(n)); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              tenure === String(n)
                                ? 'bg-[#e0385e] text-white shadow-sm'
                                : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-650 dark:text-zinc-300 hover:bg-zinc-100'
                            }`}
                          >
                            {formatNumber(n, lang)} {lang === 'bn' ? 'দিন' : 'Days'}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Interest / Additional Fee Checkmark */}
                    <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 space-y-3">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          id="interest_checkbox"
                          checked={hasInterest}
                          onChange={(e) => setHasInterest(e.target.checked)}
                          className="w-4.5 h-4.5 accent-[#e0385e] rounded cursor-pointer"
                        />
                        <label htmlFor="interest_checkbox" className="text-xs font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
                          {lang === 'bn' ? 'সুদ বা অতিরিক্ত ফি / চার্জ যুক্ত করুন' : 'Add Interest / Additional Fee Rate'}
                        </label>
                      </div>

                      {hasInterest && (
                        <div className="space-y-2 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl animate-reveal">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                              {lang === 'bn' ? 'বার্ষিক সুদের হার / ফি (%)' : 'Interest / Fee Rate (% p.a.)'}
                            </span>
                            <span className="text-xs font-black text-[#e0385e]">{interestRate}%</span>
                          </div>
                          <div className="relative">
                            <Percent className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={interestRate}
                              onChange={(e) => setInterestRate(e.target.value)}
                              placeholder="10"
                              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white font-bold text-sm focus:outline-none focus:border-[#e0385e]"
                            />
                          </div>
                          {/* Quick interest chips */}
                          <div className="flex gap-1.5 pt-1">
                            {[5, 10, 12, 15, 20].map(r => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => { triggerHaptic('single'); setInterestRate(String(r)); }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  interestRate === String(r)
                                    ? 'bg-[#e0385e] text-white'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-300 hover:bg-zinc-200'
                                }`}
                              >
                                {r}%
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Auto Calculated Live Preview Banner */}
                    {emiPreview && (
                      <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-[#e0385e]/20 rounded-xl space-y-2">
                        <div className="flex justify-between items-center text-xs font-bold text-zinc-600 dark:text-zinc-400">
                          <span>{lang === 'bn' ? 'মূল আসল' : 'Principal'}: ৳{formatNumber(emiPreview.principal, lang)}</span>
                          {emiPreview.interest > 0 && (
                            <span className="text-[#e0385e]">
                              +{lang === 'bn' ? 'সুদ' : 'Fee'}: ৳{formatNumber(emiPreview.interest, lang)}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-between items-baseline border-t border-[#e0385e]/20 pt-2">
                          <span className="text-xs font-black text-zinc-700 dark:text-zinc-300 uppercase">
                            {lang === 'bn' ? 'স্বয়ংক্রিয় কিস্তি' : 'Auto Installment'}:
                          </span>
                          <span className="text-base font-black text-[#e0385e]">
                            ৳{formatNumber(emiPreview.emi, lang)} / {frequency === 'monthly' ? t.monthly : frequency === 'weekly' ? t.weekly : t.daily}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Savings Installment & Frequency Grid (When not EMI) */}
                {goalType === 'savings' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                        {t.installmentAmount}
                      </span>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-zinc-400 dark:text-zinc-500 select-none">
                          ৳
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={installmentAmount}
                          onChange={(e) => handleAmountChange(e.target.value, setInstallmentAmount)}
                          className="w-full pl-9 pr-3 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-bold text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                        {t.frequency}
                      </span>
                      <select
                        value={frequency}
                        onChange={(e: any) => setFrequency(e.target.value)}
                        className="w-full px-3 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-850 dark:text-white font-bold text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                      >
                        <option value="monthly">{t.monthly}</option>
                        <option value="weekly">{t.weekly}</option>
                        <option value="daily">{t.daily}</option>
                        <option value="flexible">{t.flexible}</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* 5. Link Customer (Optional) */}
                <div className="space-y-1">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                    {t.linkCustomer}
                  </span>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-850 dark:text-white font-bold text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="">{lang === 'bn' ? 'কোনো নির্দিষ্ট গ্রাহক নয় (ব্যক্তিগত লক্ষ্য)' : 'None (Personal Goal)'}</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''} — ৳{formatNumber(c.outstandingDue, lang)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 6. Optional Description / Notes */}
                <div className="space-y-1">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
                    {t.notes}
                  </span>
                  <input
                    type="text"
                    placeholder={lang === 'bn' ? 'অতিরিক্ত কোনো মন্তব্য বা শর্ত (ঐচ্ছিক)' : 'Additional notes or remarks (Optional)'}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-850 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 font-medium text-sm"
                  />
                </div>

              </div>

              {/* 3. Sticky Bottom Actions (Red when EMI/Installment, Emerald when Savings) */}
              <div className="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
                {formError && (
                  <div className="p-4 mb-4 bg-rose-50 dark:bg-rose-900/35 rounded-xl text-[#e0385e] font-semibold text-sm flex items-start gap-2">
                    <AlertCircle className="w-4.5 h-4.5 text-[#e0385e] shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full py-4.5 rounded-2xl font-extrabold text-lg flex items-center justify-center shadow-lg transition-all cursor-pointer ${
                    goalType === 'deposit'
                      ? 'bg-[#e0385e] hover:bg-[#c92a4f] text-white shadow-rose-200 dark:shadow-none'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 shadow-emerald-200 dark:shadow-none'
                  } ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t.saving}
                    </span>
                  ) : (
                    lang === 'bn' ? 'লক্ষ্য সংরক্ষণ করুন' : 'Confirm & Save Goal'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── GOAL DETAIL VIEW MODAL ── */}
      {selectedGoal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 no-select overflow-hidden">
          <div className="absolute inset-0" onClick={() => setSelectedGoal(null)} />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-zinc-900 w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col relative z-10"
          >
            
            {/* Header (Consistent distinct icons) */}
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
              <div className="min-w-0 pr-2">
                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 ${
                  selectedGoal.type === 'savings' 
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400' 
                    : 'bg-rose-50 text-[#e0385e] dark:bg-rose-950/20 dark:text-rose-400'
                }`}>
                  {selectedGoal.type === 'savings' ? (
                    <PiggyBank className="w-3.5 h-3.5" />
                  ) : (
                    <CalendarClock className="w-3.5 h-3.5" />
                  )}
                  {selectedGoal.type === 'savings' ? t.savings : t.deposit}
                </span>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white truncate leading-snug mt-1.5">
                  {selectedGoal.title}
                </h3>
              </div>
              
              <div className="flex items-center gap-1.5 shrink-0">
                {selectedGoal.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('single');
                      setEmiReminderGoal(selectedGoal);
                      const existing = reminders.find(r => r.goalId === selectedGoal.id && r.active);
                      if (existing?.emiDayOfMonth) {
                        setEmiDueDay(existing.emiDayOfMonth);
                      }
                    }}
                    className={`p-3 rounded-full transition-colors cursor-pointer ${
                      reminders.some(r => r.goalId === selectedGoal.id && r.active)
                        ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-550 dark:text-zinc-400 hover:text-amber-500'
                    }`}
                    title={lang === 'bn' ? 'কিস্তির নোটিফিকেশন রিমাইন্ডার' : 'EMI Notification Reminder'}
                  >
                    {reminders.some(r => r.goalId === selectedGoal.id && r.active) ? (
                      <BellRing className="w-5 h-5 text-amber-500 animate-pulse" />
                    ) : (
                      <Bell className="w-5 h-5" />
                    )}
                  </button>
                )}
                <button
                  onClick={openDeleteConfirmModal}
                  className="p-3 bg-zinc-100 hover:bg-rose-50 dark:bg-zinc-800 dark:hover:bg-rose-950/30 rounded-full text-zinc-550 hover:text-[#e0385e] dark:text-zinc-400 transition-colors cursor-pointer"
                  title={lang === 'bn' ? 'মুছে ফেলুন' : 'Delete Goal'}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
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
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-1 block">৳{formatNumber(selectedGoal.savedAmount || 0, lang)}</span>
                </div>
                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-850 rounded-2xl">
                  <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider block">{t.remaining}</span>
                  <span className="text-base font-black text-[#e0385e] mt-1 block">৳{formatNumber(Math.max(0, selectedGoal.targetAmount - (selectedGoal.savedAmount || 0)), lang)}</span>
                </div>
              </div>

              {/* Visual Progress Bar */}
              <div className="space-y-2">
                <div className="w-full h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-700 ${
                      selectedGoal.status === 'completed' 
                        ? 'bg-emerald-500' 
                        : selectedGoal.type === 'savings' ? 'bg-emerald-500/80' : 'bg-[#e0385e]'
                    }`}
                    style={{ width: `${Math.min(100, Math.round(((selectedGoal.savedAmount || 0) / (selectedGoal.targetAmount || 1)) * 100))}%` }}
                  />
                </div>
                <div className="text-right text-xs font-black text-zinc-400">
                  {Math.min(100, Math.round(((selectedGoal.savedAmount || 0) / (selectedGoal.targetAmount || 1)) * 100))}% {lang === 'bn' ? 'সম্পন্ন হয়েছে' : 'Achieved'}
                </div>
              </div>

              {/* Dedicated EMI & Loan Details Card - Compact & Collapsible by default */}
              {selectedGoalEmiDetails && (
                <div className="bg-zinc-50 dark:bg-zinc-950/40 rounded-2xl border border-zinc-200/80 dark:border-zinc-850/80 overflow-hidden transition-all shadow-xs">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('single');
                      setIsEmiBreakdownOpen(prev => !prev);
                    }}
                    className="w-full p-3.5 flex items-center justify-between text-left hover:bg-zinc-100/70 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CreditCard className="w-4 h-4 text-[#e0385e] shrink-0" />
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">
                        {lang === 'bn' ? 'ইএমআই ও ঋণ বিবরণী' : 'EMI & Loan Breakdown'}
                      </span>
                      {selectedGoalEmiDetails.tenure && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#e0385e]/10 text-[#e0385e] shrink-0">
                          {formatNumber(selectedGoalEmiDetails.tenure, lang)} {selectedGoalEmiDetails.tenureUnit}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                        ৳{formatNumber(selectedGoalEmiDetails.principal, lang)}
                      </span>
                      <ChevronDown 
                        className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
                          isEmiBreakdownOpen ? 'rotate-180 text-zinc-700 dark:text-zinc-200' : ''
                        }`} 
                      />
                    </div>
                  </button>

                  {/* Collapsible Content */}
                  {isEmiBreakdownOpen && (
                    <div className="px-3 pb-3 pt-1 border-t border-zinc-200/60 dark:border-zinc-850/80 animate-in fade-in duration-150">
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800/70">
                          <span className="text-[10px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase block">
                            {lang === 'bn' ? 'মূল পরিমাণ (Principal)' : 'Principal Amount'}
                          </span>
                          <span className="text-xs font-black text-zinc-900 dark:text-white mt-0.5 block">
                            ৳{formatNumber(selectedGoalEmiDetails.principal, lang)}
                          </span>
                        </div>

                        <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800/70">
                          <span className="text-[10px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase block">
                            {lang === 'bn' ? 'মুনাফা / ফি (Fee)' : 'Interest / Fee'}
                          </span>
                          <span className="text-xs font-black text-[#e0385e] mt-0.5 block">
                            {selectedGoalEmiDetails.interestAmount > 0 
                              ? `+৳${formatNumber(selectedGoalEmiDetails.interestAmount, lang)} ${selectedGoalEmiDetails.interestRate ? `(${selectedGoalEmiDetails.interestRate}%)` : ''}` 
                              : (lang === 'bn' ? '০% (ফি প্রযোজ্য নয়)' : '0% (No Fee)')}
                          </span>
                        </div>

                        <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800/70">
                          <span className="text-[10px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase block">
                            {lang === 'bn' ? 'প্রতি কিস্তি (Per Installment)' : 'Installment Rate'}
                          </span>
                          <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                            ৳{formatNumber(selectedGoal.installmentAmount || Math.ceil(selectedGoal.targetAmount / (selectedGoalEmiDetails.tenure || 1)), lang)}
                          </span>
                        </div>

                        <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800/70">
                          <span className="text-[10px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase block">
                            {lang === 'bn' ? 'মোট প্রদেয় (Total Payable)' : 'Total Payable'}
                          </span>
                          <span className="text-xs font-black text-zinc-900 dark:text-white mt-0.5 block">
                            ৳{formatNumber(selectedGoal.targetAmount, lang)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                {(selectedGoalEmiDetails?.cleanNotes || (!selectedGoalEmiDetails && selectedGoal.notes)) && (
                  <div className="flex justify-between items-center text-zinc-500 dark:text-zinc-400 border-t border-zinc-200/50 dark:border-zinc-800/50 pt-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{t.notes}</span>
                    <span className="font-medium text-zinc-700 dark:text-zinc-300 text-xs">
                      {selectedGoalEmiDetails?.cleanNotes || selectedGoal.notes}
                    </span>
                  </div>
                )}
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
                        <label className="text-xs font-extrabold text-zinc-400 uppercase tracking-wider">{t.amountPaid} *</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-bold text-zinc-400 dark:text-zinc-500 select-none">
                            ৳
                          </span>
                          <input
                            type="text"
                            required
                            inputMode="numeric"
                            placeholder="0"
                            value={installmentInput}
                            onChange={(e) => handleAmountChange(e.target.value, setInstallmentInput)}
                            className="w-full pl-9 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-black text-xl text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        {/* Quick helper to fill regular installment if configured */}
                        {selectedGoal.installmentAmount && selectedGoal.installmentAmount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('single');
                              setInstallmentInput(formatIndianNumberString(String(selectedGoal.installmentAmount)));
                            }}
                            className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 pt-1"
                          >
                            <span>{lang === 'bn' ? 'নির্ধারিত কিস্তি বসান' : 'Fill regular installment'} (৳{formatNumber(selectedGoal.installmentAmount, lang)})</span>
                          </button>
                        )}

                        {/* Quick chips */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {[500, 1000, 2000, 5000].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => {
                                triggerHaptic('single');
                                const cur = parseAmount(installmentInput);
                                setInstallmentInput(formatIndianNumberString(String(cur + val)));
                              }}
                              className="px-2.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 font-bold rounded-lg transition-all text-2xs cursor-pointer"
                            >
                              +{formatNumber(val, lang)}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('tick');
                              setInstallmentInput('');
                            }}
                            className="px-2.5 py-1.5 bg-rose-50 dark:bg-rose-950/20 text-[#e0385e] font-bold rounded-lg transition-all text-2xs cursor-pointer"
                          >
                            {lang === 'bn' ? 'মুছুন' : 'Clear'}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-zinc-400 uppercase tracking-wider">{lang === 'bn' ? 'নোট / বিবরণ (ঐচ্ছিক)' : 'Note / Description (Optional)'}</label>
                        <input
                          type="text"
                          placeholder={lang === 'bn' ? 'যেমন: ১ম কিস্তি, নগদ জমা' : 'e.g. 1st installment, cash deposit'}
                          value={installmentNote}
                          onChange={(e) => setInstallmentNote(e.target.value)}
                          className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      {/* Checkbox for Ledger Sync */}
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
                            {t.recordTxInLedger} ({selectedGoal.customerName || (lang === 'bn' ? 'গ্রাহকের খাতা' : "Customer's Ledger")})
                          </label>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className={`w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all cursor-pointer text-xs flex items-center justify-center gap-2 shadow-sm ${
                          isSubmitting ? 'opacity-70 cursor-not-allowed' : ''
                        }`}
                      >
                        {isSubmitting ? (
                          <span className="flex items-center gap-2">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t.saving}
                          </span>
                        ) : (
                          lang === 'bn' ? 'জমা সম্পন্ন করুন' : 'Confirm Deposit'
                        )}
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

                <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-850 rounded-2xl overflow-hidden shadow-xs">
                  <div className="max-h-[220px] overflow-y-auto divide-y divide-zinc-200/50 dark:divide-zinc-850 pr-1.5 mr-0.5">
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
              </div>

              {/* Status Actions */}
              {selectedGoal.status === 'active' ? (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('single');
                      setShowCancelConfirm(true);
                    }}
                    className="text-xs font-extrabold text-[#e0385e] hover:underline cursor-pointer"
                  >
                    {lang === 'bn' ? 'লক্ষ্যটি বাতিল করুন' : 'Cancel this Goal'}
                  </button>
                </div>
              ) : (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('single');
                      setShowReactivateConfirm(true);
                    }}
                    className="text-xs font-extrabold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 cursor-pointer hover:underline flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'লক্ষ্যটি পুনরায় চালু করুন' : 'Reactivate this Goal'}</span>
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* ── 1 & 2. CUSTOM REACTIVATION CONFIRMATION POPUP (LEARNED FROM RESTORE CUSTOMER) ── */}
      {showReactivateConfirm && selectedGoal && (
        <div 
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-[2px] animate-in fade-in duration-150"
          onClick={() => setShowReactivateConfirm(false)}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-zinc-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <RotateCcw className="w-8 h-8 text-emerald-600 dark:text-emerald-500" />
              </div>
              <h3 className="text-lg font-black text-emerald-600 dark:text-emerald-400 mb-2">
                {lang === 'bn' ? 'লক্ষ্য পুনরায় চালুকরণ' : 'Reactivate Goal'}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {lang === 'bn' 
                  ? 'আপনি কি নিশ্চিত এই লক্ষ্যটি পুনরায় চলমান তালিকায় ফিরিয়ে নিতে চান?' 
                  : 'Are you sure you want to restore this goal back to your active list?'}
              </p>
              
              {/* Details Card */}
              <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-left space-y-2.5 mt-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'লক্ষ্য' : 'Goal'}</span>
                  <span className="text-sm font-extrabold text-zinc-850 dark:text-zinc-150 truncate max-w-[200px]">{selectedGoal.title}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'ধরন' : 'Type'}</span>
                  <span className="text-xs font-extrabold text-zinc-700 dark:text-zinc-300">{selectedGoal.type === 'savings' ? t.savings : t.deposit}</span>
                </div>
                {selectedGoal.customerName && (
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'গ্রাহক' : 'Customer'}</span>
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{selectedGoal.customerName}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'লক্ষ্যমাত্রা' : 'Target'}</span>
                  <span className="text-sm font-black text-zinc-900 dark:text-white">৳ {formatNumber(selectedGoal.targetAmount, lang)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'জমা হয়েছে' : 'Saved'}</span>
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">৳ {formatNumber(selectedGoal.savedAmount || 0, lang)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={async () => {
                  triggerHaptic('double');
                  await updateGoalStatus(selectedGoal.id, 'active');
                  setSelectedGoal(prev => prev ? { ...prev, status: 'active' } : null);
                  setShowReactivateConfirm(false);
                  toast.success(lang === 'bn' ? 'লক্ষ্যটি সফলভাবে পুনরায় চালু করা হয়েছে' : 'Goal reactivated successfully');
                }}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl cursor-pointer transition-colors"
              >
                {lang === 'bn' ? 'হ্যাঁ, পুনরায় চালু করুন' : 'Yes, Reactivate Goal'}
              </button>
              <button
                type="button"
                onClick={() => setShowReactivateConfirm(false)}
                className="w-full py-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 font-bold rounded-xl cursor-pointer transition-colors"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── 2. CUSTOM CANCEL CONFIRMATION POPUP (LEARNED FROM MOVE CUSTOMER TO TRASH) ── */}
      {showCancelConfirm && selectedGoal && (
        <div 
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-[2px] animate-in fade-in duration-150"
          onClick={() => setShowCancelConfirm(false)}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-zinc-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-500" />
              </div>
              <h3 className="text-lg font-black text-amber-600 dark:text-amber-500 mb-2">
                {lang === 'bn' ? 'লক্ষ্য বাতিল নিশ্চিতকরণ' : 'Confirm Goal Cancellation'}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {lang === 'bn' 
                  ? 'আপনি কি নিশ্চিতভাবে এই লক্ষ্যটি বাতিল করতে চান? এটি আর্কাইভে সংরক্ষিত থাকবে।' 
                  : 'Are you sure you want to cancel this goal? It will be moved to History.'}
              </p>
              
              {/* Details Card */}
              <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-left space-y-2.5 mt-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'লক্ষ্য' : 'Goal'}</span>
                  <span className="text-sm font-extrabold text-zinc-850 dark:text-zinc-150 truncate max-w-[200px]">{selectedGoal.title}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'ধরন' : 'Type'}</span>
                  <span className="text-xs font-extrabold text-zinc-700 dark:text-zinc-300">{selectedGoal.type === 'savings' ? t.savings : t.deposit}</span>
                </div>
                {selectedGoal.customerName && (
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'গ্রাহক' : 'Customer'}</span>
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{selectedGoal.customerName}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'লক্ষ্যমাত্রা' : 'Target'}</span>
                  <span className="text-sm font-black text-zinc-900 dark:text-white">৳ {formatNumber(selectedGoal.targetAmount, lang)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'জমা হয়েছে' : 'Saved'}</span>
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">৳ {formatNumber(selectedGoal.savedAmount || 0, lang)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={async () => {
                  triggerHaptic('double');
                  await updateGoalStatus(selectedGoal.id, 'cancelled');
                  setShowCancelConfirm(false);
                  setSelectedGoal(null);
                  toast.success(lang === 'bn' ? 'লক্ষ্যটি বাতিল করা হয়েছে' : 'Goal cancelled');
                }}
                className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl cursor-pointer transition-colors"
              >
                {lang === 'bn' ? 'হ্যাঁ, বাতিল করুন' : 'Yes, Cancel Goal'}
              </button>
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="w-full py-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 font-bold rounded-xl cursor-pointer transition-colors"
              >
                {lang === 'bn' ? 'না, ফেরত যান' : 'No, Go Back'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── 2. CUSTOM DELETE CONFIRMATION POPUP (LEARNED FROM MOVE CUSTOMER TO TRASH) ── */}
      {showDeleteConfirm && selectedGoal && (
        <div 
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-[2px] animate-in fade-in duration-150"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-zinc-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-[#e0385e]" />
              </div>
              <h3 className="text-lg font-black text-[#e0385e] mb-2">
                {lang === 'bn' ? 'লক্ষ্য স্থায়ীভাবে মুছুন' : 'Delete Goal Permanently'}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {lang === 'bn' 
                  ? 'আপনি কি নিশ্চিত এই লক্ষ্যটি চিরতরে মুছে ফেলতে চান? এর কিস্তির সকল তথ্য চিরতরে মুছে যাবে।' 
                  : 'Are you sure you want to delete this goal permanently? All contribution records will be permanently lost.'}
              </p>
              
              {/* Details Card */}
              <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-left space-y-2.5 mt-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'লক্ষ্য' : 'Goal'}</span>
                  <span className="text-sm font-extrabold text-zinc-850 dark:text-zinc-150 truncate max-w-[200px]">{selectedGoal.title}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'ধরন' : 'Type'}</span>
                  <span className="text-xs font-extrabold text-zinc-700 dark:text-zinc-300">{selectedGoal.type === 'savings' ? t.savings : t.deposit}</span>
                </div>
                {selectedGoal.customerName && (
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'গ্রাহক' : 'Customer'}</span>
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{selectedGoal.customerName}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'লক্ষ্যমাত্রা' : 'Target'}</span>
                  <span className="text-sm font-black text-zinc-900 dark:text-white">৳ {formatNumber(selectedGoal.targetAmount, lang)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'জমা হয়েছে' : 'Saved'}</span>
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">৳ {formatNumber(selectedGoal.savedAmount || 0, lang)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={async () => {
                  triggerHaptic('double');
                  await deleteGoal(selectedGoal.id);
                  setShowDeleteConfirm(false);
                  setSelectedGoal(null);
                  toast.success(lang === 'bn' ? 'লক্ষ্যটি মুছে ফেলা হয়েছে' : 'Goal deleted successfully');
                }}
                className="w-full py-4 bg-[#e0385e] hover:bg-[#c92a4f] text-white font-bold rounded-xl cursor-pointer transition-colors"
              >
                {lang === 'bn' ? 'হ্যাঁ, স্থায়ীভাবে মুছুন' : 'Yes, Delete Permanently'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full py-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 font-bold rounded-xl cursor-pointer transition-colors"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── EMI NOTIFICATION REMINDER MODAL ── */}
      {emiReminderGoal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 no-select overflow-hidden">
          <div className="absolute inset-0" onClick={() => setEmiReminderGoal(null)} />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-zinc-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col relative z-10"
          >
            {/* Header */}
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
                  <BellRing className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-zinc-900 dark:text-white leading-tight">
                    {lang === 'bn' ? 'কিস্তি রিমাইন্ডার' : 'Monthly EMI Reminder'}
                  </h3>
                  <p className="text-xs text-zinc-450 dark:text-zinc-500 font-semibold truncate max-w-[220px]">
                    {emiReminderGoal.title}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEmiReminderGoal(null)}
                className="p-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto hide-scrollbar">
              {/* 7-day prior notice banner */}
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/50 rounded-2xl text-xs text-amber-800 dark:text-amber-300 font-bold flex items-start gap-2.5 leading-relaxed">
                <Info className="w-4.5 h-4.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <span>
                  {lang === 'bn'
                    ? 'প্রতি মাসে আপনার কিস্তির নির্ধারিত তারিখের ৭ দিন আগে থেকে প্রতিদিন নোটিফিকেশন অ্যালার্ট পাঠানো হবে যাতে সময়মতো কিস্তি পরিশোধ করা যায়।'
                    : 'A notification will be sent each day 7 days prior to remind you that your upcoming monthly EMI installment is due.'}
                </span>
              </div>

              {/* Goal Snapshot */}
              <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 p-4 rounded-2xl flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold uppercase text-zinc-400 dark:text-zinc-500 block">
                    {lang === 'bn' ? 'কিস্তির পরিমাণ' : 'Installment Amount'}
                  </span>
                  <span className="text-lg font-black text-zinc-900 dark:text-white">
                    ৳{formatNumber(emiReminderGoal.installmentAmount || emiReminderGoal.targetAmount, lang)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-extrabold uppercase text-zinc-400 dark:text-zinc-500 block">
                    {lang === 'bn' ? 'ধরন' : 'Type'}
                  </span>
                  <span className="text-xs font-black text-rose-500 uppercase">
                    {emiReminderGoal.type === 'deposit' ? 'EMI / কিস্তি' : 'Savings Goal'}
                  </span>
                </div>
              </div>

              {/* Day of Month Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-[#e0385e]" />
                  {lang === 'bn' ? 'প্রতি মাসের কিস্তির তারিখ' : 'Day of Month for EMI'} *
                </label>
                <select
                  value={emiDueDay}
                  onChange={(e) => setEmiDueDay(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl text-zinc-900 dark:text-zinc-100 text-base font-bold focus:outline-none transition-all cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                    <option 
                      key={day} 
                      value={day}
                      className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-bold"
                    >
                      {lang === 'bn' ? `প্রতি মাসের ${formatNumber(day, 'bn')} তারিখ` : `Day ${day} of every month`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Daily Alert Time */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-amber-500" />
                  {lang === 'bn' ? 'নোটিফিকেশন অ্যালার্টের সময়' : 'Notification Alert Time'}
                </label>
                <input
                  type="time"
                  value={emiAlertTime}
                  onChange={(e) => setEmiAlertTime(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl text-zinc-900 dark:text-zinc-100 text-base font-bold focus:outline-none transition-all"
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              {/* Existing active reminder status */}
              {reminders.some(r => r.goalId === emiReminderGoal.id && r.active) && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    {lang === 'bn'
                      ? 'এই কিস্তির রিমাইন্ডার বর্তমানে সক্রিয় রয়েছে।'
                      : 'An EMI reminder is currently active for this goal.'}
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2.5">
              <button
                type="button"
                disabled={isSavingEmiReminder}
                onClick={handleSaveEmiReminder}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-base shadow-md cursor-pointer transition-colors flex items-center justify-center gap-2"
              >
                <Bell className="w-5 h-5" />
                {reminders.some(r => r.goalId === emiReminderGoal.id && r.active)
                  ? (lang === 'bn' ? 'রিমাইন্ডার আপডেট করুন' : 'Update EMI Reminder')
                  : (lang === 'bn' ? 'কিস্তির অ্যালার্ট চালু করুন' : 'Enable EMI Reminder')}
              </button>

              {reminders.some(r => r.goalId === emiReminderGoal.id) && (
                <button
                  type="button"
                  onClick={handleRemoveEmiReminder}
                  className="w-full py-3.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-[#e0385e] dark:text-rose-400 font-bold rounded-xl text-sm cursor-pointer transition-colors"
                >
                  {lang === 'bn' ? 'রিমাইন্ডার বন্ধ করুন' : 'Turn Off Reminder'}
                </button>
              )}

              <button
                type="button"
                onClick={() => setEmiReminderGoal(null)}
                className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold rounded-xl text-sm cursor-pointer transition-colors"
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
