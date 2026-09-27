import React, { useState } from 'react';
import { Customer, Reminder, SavingGoal } from '../types';
import { 
  Bell, Calendar, User, Clock, AlertTriangle, CheckSquare, Square, 
  Volume2, X, CreditCard, CalendarClock, Info 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { translations, formatNumber, Language } from '../lib/translations';
import { triggerHaptic } from '../lib/haptics';
import { toast } from 'sonner';
import { showNotification } from '../lib/notifications';

interface RemindersManagerProps {
  reminders: Reminder[];
  customers: Customer[];
  goals?: SavingGoal[];
  addReminder: (
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
  toggleReminder: (id: string, active: boolean) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  dailyReminderTime: string;
  updateSettings: (time: string) => Promise<void>;
  lang: Language;
}

export default function RemindersManager({
  reminders,
  customers,
  goals = [],
  addReminder,
  toggleReminder,
  deleteReminder,
  dailyReminderTime,
  updateSettings,
  lang
}: RemindersManagerProps) {
  const t = translations[lang];

  const [showAddForm, setShowAddForm] = useState(false);
  const [reminderCategory, setReminderCategory] = useState<'customer' | 'emi'>('customer');
  
  // Customer Due Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDateStr, setDueDateStr] = useState('');
  const [dueTimeStr, setDueTimeStr] = useState('10:00');

  // EMI Installment Form State
  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [emiTitle, setEmiTitle] = useState('');
  const [emiDayOfMonth, setEmiDayOfMonth] = useState<number>(5);
  const [emiAmount, setEmiAmount] = useState('');
  const [emiTimeStr, setEmiTimeStr] = useState('09:00');

  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // In-app test trigger alert state
  const [testAlertText, setTestAlertText] = useState<string | null>(null);

  const handleGoalSelect = (goalId: string) => {
    setSelectedGoalId(goalId);
    const g = goals.find(item => item.id === goalId);
    if (g) {
      setEmiTitle(g.title);
      if (g.installmentAmount) {
        setEmiAmount(String(g.installmentAmount));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (reminderCategory === 'customer') {
      if (!selectedCustomerId) {
        setErrorMsg(lang === 'bn' ? 'অনুগ্রহ করে গ্রাহক নির্বাচন করুন।' : 'Choose a customer to remind.');
        return;
      }
      if (!dueDateStr) {
        setErrorMsg(lang === 'bn' ? 'অনুগ্রহ করে তারিখ বেছে নিন।' : 'Please choose a due date.');
        return;
      }

      setIsSubmitting(true);
      try {
        const fullDate = new Date(`${dueDateStr}T${dueTimeStr}:00`);
        await addReminder(selectedCustomerId, notes, fullDate, {
          type: 'customer'
        });
        
        setSelectedCustomerId('');
        setNotes('');
        setDueDateStr('');
        setDueTimeStr('10:00');
        setShowAddForm(false);
        
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
          }
        }
        toast.success(lang === 'bn' ? 'গ্রাহক রিমাইন্ডার সংরক্ষণ করা হয়েছে' : 'Customer reminder scheduled successfully');
      } catch (err) {
        setErrorMsg(lang === 'bn' ? 'রিমাইন্ডার সংরক্ষণ করা যায়নি।' : 'Failed to save reminder.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // EMI Reminder
      const title = emiTitle.trim();
      if (!title) {
        setErrorMsg(lang === 'bn' ? 'কিস্তি বা ঋণের শিরোনাম লিখুন।' : 'Please enter an EMI title.');
        return;
      }
      if (!emiDayOfMonth || emiDayOfMonth < 1 || emiDayOfMonth > 31) {
        setErrorMsg(lang === 'bn' ? 'মাসের ১ থেকে ৩১ তারিখের মধ্যে একটি দিন নির্বাচন করুন।' : 'Choose a day of month between 1 and 31.');
        return;
      }

      setIsSubmitting(true);
      try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const day = Math.min(31, Math.max(1, Number(emiDayOfMonth)));
        
        let targetMonth = month;
        let targetYear = year;
        if (now.getDate() > day) {
          targetMonth = month + 1;
          if (targetMonth > 11) {
            targetMonth = 0;
            targetYear++;
          }
        }
        const [hours, minutes] = emiTimeStr.split(':').map(Number);
        const fullDate = new Date(targetYear, targetMonth, day, hours || 9, minutes || 0, 0);

        await addReminder(
          selectedGoalId || '',
          notes.trim() || (lang === 'bn' ? `${title} - মাসিক কিস্তির তাগাদা` : `${title} - Monthly Installment Due`),
          fullDate,
          {
            type: 'emi',
            goalId: selectedGoalId || undefined,
            customerName: title,
            emiDayOfMonth: day,
            installmentAmount: parseFloat(emiAmount) || 0
          }
        );

        setSelectedGoalId('');
        setEmiTitle('');
        setEmiAmount('');
        setNotes('');
        setShowAddForm(false);

        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
          }
        }
        toast.success(lang === 'bn' ? 'মাসিক কিস্তির রিমাইন্ডার সক্রিয় করা হয়েছে' : 'Monthly EMI reminder activated successfully');
      } catch (err) {
        setErrorMsg(lang === 'bn' ? 'কিস্তি রিমাইন্ডার সংরক্ষণ করা যায়নি।' : 'Failed to save EMI reminder.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const currentActiveReminders = reminders.filter(r => r.active);

  // Trigger simulated alarm instantly for testing
  const triggerDemoAlert = () => {
    const randomPick = currentActiveReminders[0] || {
      customerName: lang === 'bn' ? 'ওয়াহিদ জামান' : 'Wahid Zaman',
      notes: lang === 'bn' ? 'বকেয়া ১২০০ টাকা পরিশোধের ফলো-আপ।' : 'Follow up on ৳1,200 pending due.'
    };
    
    const message = `${lang === 'bn' ? 'খাতা রিমাইন্ডার' : 'LEDGER REMINDER'}: ${randomPick.customerName}! ${lang === 'bn' ? 'নোট' : 'Note'}: "${randomPick.notes}"`;
    setTestAlertText(message);

    // Try HTML5 browser notifications with custom logo icon
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      showNotification(lang === 'bn' ? "চালান ট্র্যাক অ্যালার্ট" : "Challan Track Alert", {
        body: lang === 'bn' 
          ? `বকেয়া আদায়ের জন্য ${randomPick.customerName}-এর সাথে যোগাযোগ করতে মনে রাখুন!` 
          : `Remember to contact ${randomPick.customerName} for pending dues!`,
        icon: '/icon-192.png'
      });
    }

    if (typeof window !== 'undefined') {
      triggerHaptic([200, 100, 200]);
    }
  };

  return (
    <div className="space-y-6 no-select">
      
      {/* Test alert banner popup */}
      <AnimatePresence>
        {testAlertText && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-x-4 top-4 bg-amber-500 text-zinc-950 p-5 rounded-2xl shadow-2xl z-50 flex flex-col gap-3 border border-amber-400"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-black flex items-center gap-1.5 uppercase tracking-wider">
                <Bell className="w-5 h-5 animate-swing" />
                {t.liveNotification}
              </span>
              <button onClick={() => setTestAlertText(null)} className="p-1 hover:bg-black/10 rounded-full cursor-pointer">
                <X className="w-5 h-5 text-zinc-950" />
              </button>
            </div>
            <p className="font-extrabold text-base md:text-lg leading-snug">{testAlertText}</p>
            <div className="flex items-center gap-2">
              <span className="text-2xs font-extrabold bg-zinc-950/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 shrink-0" />
                {t.vibrationDemo}
              </span>
              <button 
                onClick={() => setTestAlertText(null)}
                className="ml-auto text-xs font-black bg-zinc-950 text-white px-4 py-2 rounded-xl"
              >
                {t.clearAlert}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header section with Daily Reminder trigger settings */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-md space-y-4">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <Bell className="w-5 h-5 text-amber-500" />
          {t.alarmTitle}
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {t.alarmDesc}
        </p>

        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-zinc-400" />
            <div>
              <div className="text-sm font-bold text-zinc-800 dark:text-white">{t.dailyRecap}</div>
              <p className="text-xs text-zinc-500">{t.dailyRecapDesc}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2.5">
            <input 
              type="time"
              defaultValue={dailyReminderTime}
              onChange={(e) => updateSettings(e.target.value)}
              className="px-4 py-3 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-white font-bold"
              style={{ colorScheme: 'dark' }}
            />
            <button
              onClick={triggerDemoAlert}
              className="px-4 py-3 bg-amber-500 text-zinc-950 hover:bg-amber-600 font-extrabold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Volume2 className="w-4 h-4" />
              {t.testAlarm}
            </button>
          </div>
        </div>
      </div>

      {/* Primary Reminder Add action */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">
          {lang === 'bn' ? 'সংরক্ষিত অ্যালার্ট তালিকা' : 'Scheduled Follow-ups'}
        </h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-emerald-600 dark:text-emerald-400 text-sm font-bold bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2 rounded-full cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
        >
          {showAddForm ? (lang === 'bn' ? 'ফর্ম বন্ধ করুন' : 'Close Scheduler') : `+ ${t.scheduleTitle}`}
        </button>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <motion.form
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onSubmit={handleSubmit}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-md space-y-4"
          >
            <div className="text-base font-extrabold text-zinc-800 dark:text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-500" />
                {t.scheduleContact}
              </div>
            </div>

            {/* Category Switcher: Customer Due vs Monthly EMI */}
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-zinc-100 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => { setReminderCategory('customer'); setErrorMsg(''); }}
                className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  reminderCategory === 'customer'
                    ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                {lang === 'bn' ? 'গ্রাহক বকেয়া তাগাদা' : 'Customer Follow-up'}
              </button>
              <button
                type="button"
                onClick={() => { setReminderCategory('emi'); setErrorMsg(''); }}
                className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  reminderCategory === 'emi'
                    ? 'bg-white dark:bg-zinc-800 text-[#e0385e] dark:text-rose-400 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700'
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5" />
                {lang === 'bn' ? 'মাসিক কিস্তি / EMI' : 'Monthly EMI / Installment'}
              </button>
            </div>

            {/* Conditional Form Inputs */}
            {reminderCategory === 'customer' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase flex items-center gap-1">
                    <User className="w-3 h-3"/>
                    {lang === 'bn' ? 'গ্রাহক অ্যাকাউন্ট' : 'Customer'}
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border-2 border-emerald-500/30 focus:border-emerald-500 dark:border-zinc-700 dark:focus:border-emerald-500 rounded-xl text-zinc-900 dark:text-zinc-100 text-base focus:outline-none transition-all"
                    style={{ colorScheme: 'dark' }}
                    required
                  >
                    <option value="" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                      {t.selectCustomerPrompt}
                    </option>
                    {customers.map(c => (
                      <option 
                        key={c.id} 
                        value={c.id} 
                        className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                      >
                        {c.name} (Due: ৳ {formatNumber(c.outstandingDue || 0, lang)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">
                    {lang === 'bn' ? 'রিমাইন্ডার নোট/বিবরণ' : 'Reminder Note'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Call for rice payment"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl text-zinc-900 dark:text-zinc-100 text-base focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">
                    {t.targetDate}
                  </label>
                  <input
                    type="date"
                    value={dueDateStr}
                    onChange={(e) => setDueDateStr(e.target.value)}
                    className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl text-zinc-900 dark:text-zinc-100 text-base focus:outline-none transition-all"
                    style={{ colorScheme: 'dark' }}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">
                    {t.targetTime}
                  </label>
                  <input
                    type="time"
                    value={dueTimeStr}
                    onChange={(e) => setDueTimeStr(e.target.value)}
                    className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl text-zinc-900 dark:text-zinc-100 text-base focus:outline-none transition-all"
                    style={{ colorScheme: 'dark' }}
                    required
                  />
                </div>
              </div>
            ) : (
              /* EMI / Installment Reminder Form */
              <div className="space-y-4">
                {/* 7-day alert helper banner */}
                <div className="p-3.5 bg-rose-50 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs text-rose-800 dark:text-rose-300 font-bold flex items-start gap-2.5">
                  <Info className="w-4.5 h-4.5 shrink-0 text-[#e0385e] mt-0.5" />
                  <p className="leading-relaxed">
                    {lang === 'bn' 
                      ? 'প্রতি মাসে কিস্তির নির্দিষ্ট তারিখের ৭ দিন আগে থেকে প্রতিদিন নোটিফিকেশন পাঠানো হবে যাতে আপনার কিস্তির প্রস্তুতি থাকে।' 
                      : 'A notification will be sent each day 7 days prior to remind you that your upcoming monthly EMI installment is coming.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Select Goal (optional link) */}
                  {goals.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase flex items-center gap-1">
                        <CreditCard className="w-3 h-3"/>
                        {lang === 'bn' ? 'সংরক্ষিত লক্ষ্য বা কিস্তি (ঐচ্ছিক)' : 'Linked Goal / EMI (Optional)'}
                      </label>
                      <select
                        value={selectedGoalId}
                        onChange={(e) => handleGoalSelect(e.target.value)}
                        className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none transition-all"
                        style={{ colorScheme: 'dark' }}
                      >
                        <option value="" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                          {lang === 'bn' ? '-- নতুন কিস্তির নাম লিখুন --' : '-- Custom EMI Title --'}
                        </option>
                        {goals.filter(g => g.status === 'active').map(g => (
                          <option 
                            key={g.id} 
                            value={g.id}
                            className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                          >
                            {g.title} ({g.type === 'deposit' ? 'EMI' : 'Savings'} - ৳{formatNumber(g.installmentAmount || g.targetAmount, lang)})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* EMI Title */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">
                      {lang === 'bn' ? 'কিস্তি/ঋণের নাম' : 'EMI Title'} *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. TV Installment, Bank Loan"
                      value={emiTitle}
                      onChange={(e) => setEmiTitle(e.target.value)}
                      className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl text-zinc-900 dark:text-zinc-100 text-base focus:outline-none transition-all"
                      required
                    />
                  </div>

                  {/* Day of Month Selector (1-31) */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase flex items-center gap-1">
                      <CalendarClock className="w-3 h-3 text-[#e0385e]"/>
                      {lang === 'bn' ? 'প্রতি মাসের কিস্তির তারিখ' : 'Monthly Due Day'} *
                    </label>
                    <select
                      value={emiDayOfMonth}
                      onChange={(e) => setEmiDayOfMonth(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl text-zinc-900 dark:text-zinc-100 text-base font-bold focus:outline-none transition-all"
                      style={{ colorScheme: 'dark' }}
                      required
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <option 
                          key={day} 
                          value={day}
                          className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                        >
                          {lang === 'bn' ? `প্রতি মাসের ${formatNumber(day, 'bn')} তারিখ` : `Every month on day ${day}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Installment Amount */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">
                      {lang === 'bn' ? 'কিস্তির পরিমাণ (৳)' : 'Installment Amount (৳)'}
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 5000"
                      value={emiAmount}
                      onChange={(e) => setEmiAmount(e.target.value)}
                      className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl text-zinc-900 dark:text-zinc-100 text-base focus:outline-none transition-all font-bold"
                    />
                  </div>

                  {/* Notification Time */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">
                      {lang === 'bn' ? 'নোটিফিকেশন সময়' : 'Daily Alert Time'}
                    </label>
                    <input
                      type="time"
                      value={emiTimeStr}
                      onChange={(e) => setEmiTimeStr(e.target.value)}
                      className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl text-zinc-900 dark:text-zinc-100 text-base focus:outline-none transition-all font-bold"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>

                  {/* Additional Note */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">
                      {lang === 'bn' ? 'নোট বা মন্তব্য (ঐচ্ছিক)' : 'Note (Optional)'}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Pay via Bkash or bank transfer"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-xl text-zinc-900 dark:text-zinc-100 text-base focus:outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="text-rose-500 text-sm font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 touch-target-height pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-5 py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-850 dark:text-zinc-200 font-bold rounded-xl text-sm cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`px-6 py-3 text-white font-bold rounded-xl text-sm flex items-center gap-1.5 cursor-pointer shadow-md ${
                  reminderCategory === 'emi'
                    ? 'bg-[#e0385e] hover:bg-[#c92a4f]'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {reminderCategory === 'emi' 
                  ? (lang === 'bn' ? 'কিস্তি অ্যালার্ট চালু করুন' : 'Enable EMI Alert')
                  : t.scheduleNow
                }
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* List of active scheduled alarms */}
      <div className="space-y-3">
        {reminders.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-10 text-center rounded-2xl text-zinc-400">
            <AlertTriangle className="w-12 h-12 mx-auto stroke-[1.5] mb-2 text-zinc-300 dark:text-zinc-700" />
            <p className="font-bold text-zinc-600 dark:text-zinc-300">{t.noRemindersYet}</p>
            <p className="text-xs mt-1">{t.scheduleOneNotice}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reminders.map(rem => {
              const isEmi = rem.type === 'emi';
              return (
                <div 
                  key={rem.id}
                  className={`p-5 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                    rem.active 
                      ? 'bg-white border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 shadow-md' 
                      : 'bg-zinc-50 border-zinc-200/50 dark:bg-zinc-950 dark:border-zinc-900 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <button 
                      onClick={() => toggleReminder(rem.id, !rem.active)}
                      className="p-1 shrink-0 text-zinc-400 hover:text-emerald-600 cursor-pointer text-lg rounded-md"
                    >
                      {rem.active ? (
                        <CheckSquare className={`w-6 h-6 stroke-[2] ${isEmi ? 'text-[#e0385e]' : 'text-emerald-500'}`} />
                      ) : (
                        <Square className="w-6 h-6 text-zinc-300 dark:text-zinc-750" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-base font-black truncate ${rem.active ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-500 line-through'}`}>
                          {rem.customerName}
                        </span>

                        {isEmi ? (
                          <span className="shrink-0 px-2 py-0.5 text-3xs font-black bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400 rounded-md uppercase tracking-wider flex items-center gap-1">
                            <CalendarClock className="w-3 h-3" />
                            {lang === 'bn' ? 'মাসিক কিস্তি' : 'Monthly EMI'}
                          </span>
                        ) : (
                          rem.active && (
                            <span className="shrink-0 px-2.5 py-0.5 text-3xs font-black bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 rounded-md uppercase tracking-wider">
                              {t.activeAlert}
                            </span>
                          )
                        )}

                        {isEmi && rem.active && (
                          <span className="shrink-0 px-2 py-0.5 text-3xs font-black bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 rounded-md">
                            {lang === 'bn' ? '৭ দিন আগে তাগাদা' : '7d Daily Alert'}
                          </span>
                        )}
                      </div>
                      
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 truncate">
                        {rem.notes || (isEmi ? (lang === 'bn' ? 'মাসিক কিস্তি পরিশোধ' : 'Monthly installment payment') : t.contactRegardingDue)}
                        {rem.installmentAmount ? ` • ৳${formatNumber(rem.installmentAmount, lang)}` : ''}
                      </p>

                      <div className="flex items-center gap-1.5 text-2xs text-zinc-400 dark:text-zinc-500 font-bold mt-2.5 uppercase tracking-wide flex-wrap">
                        {isEmi && rem.emiDayOfMonth ? (
                          <>
                            <CalendarClock className="w-3.5 h-3.5 text-[#e0385e]" />
                            <span>
                              {lang === 'bn' ? `প্রতি মাসের ${formatNumber(rem.emiDayOfMonth, 'bn')} তারিখ` : `Every month on day ${rem.emiDayOfMonth}`}
                            </span>
                            {' • '}
                            <span>{lang === 'bn' ? 'পরবর্তী:' : 'Next:'}</span>
                          </>
                        ) : (
                          <Calendar className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {new Date(rem.dueDate).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        {' • '}
                        <Clock className="w-3.5 h-3.5 ml-1" />
                        <span>
                          {new Date(rem.dueDate).toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <button
                      onClick={() => {
                        deleteReminder(rem.id);
                        toast.info(lang === 'bn' ? 'রিমাইন্ডার মুছে ফেলা হয়েছে' : 'Reminder deleted');
                      }}
                      className="p-3 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:hover:bg-rose-900/30 rounded-xl cursor-pointer"
                      title="Delete reminder alarm"
                    >
                      <X className="w-4.5 h-4.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
