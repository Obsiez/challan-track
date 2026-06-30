import React, { useState } from 'react';
import { Customer, Reminder } from '../types';
import { 
 Bell, Calendar, User, Clock, AlertTriangle, CheckSquare, Square, 
 Volume2, X 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { translations, formatNumber, Language } from '../lib/translations';
import { triggerHaptic } from '../lib/haptics';
import { toast } from 'sonner';
import { showNotification } from '../lib/notifications';

interface RemindersManagerProps {
 reminders: Reminder[];
 customers: Customer[];
 addReminder: (customerId: string, notes: string, dueDate: Date) => Promise<void>;
 toggleReminder: (id: string, active: boolean) => Promise<void>;
 deleteReminder: (id: string) => Promise<void>;
 dailyReminderTime: string;
 updateSettings: (time: string) => Promise<void>;
 lang: Language;
}

export default function RemindersManager({
 reminders,
 customers,
 addReminder,
 toggleReminder,
 deleteReminder,
 dailyReminderTime,
 updateSettings,
 lang
}: RemindersManagerProps) {
 const t = translations[lang];

 const [showAddForm, setShowAddForm] = useState(false);
 const [selectedCustomerId, setSelectedCustomerId] = useState('');
 const [notes, setNotes] = useState('');
 const [dueDateStr, setDueDateStr] = useState('');
 const [dueTimeStr, setDueTimeStr] = useState('10:00');
 const [errorMsg, setErrorMsg] = useState('');
 const [isSubmitting, setIsSubmitting] = useState(false);

 // In-app test trigger alert state
 const [testAlertText, setTestAlertText] = useState<string | null>(null);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setErrorMsg('');

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
 await addReminder(selectedCustomerId, notes, fullDate);
 
 setSelectedCustomerId('');
 setNotes('');
 setDueDateStr('');
 setDueTimeStr('10:00');
 setShowAddForm(false);
 
 // Request permission
 if (typeof window !== 'undefined' && 'Notification' in window) {
 if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
 Notification.requestPermission();
 }
 }
 toast.success(lang === 'bn' ? 'রিমাইন্ডার যোগ করা হয়েছে' : 'Reminder scheduled successfully');
 } catch (err) {
 setErrorMsg(lang === 'bn' ? 'রিমাইন্ডার সংরক্ষণ করা যায়নি।' : 'Failed to save reminder.');
 } finally {
 setIsSubmitting(false);
 }
 };

 const currentActiveReminders = reminders.filter(r => r.active);

 // Trigger simulated alarm instantly for dad to test
 const triggerDemoAlert = () => {
 const randomPick = currentActiveReminders[0] || {
 customerName: lang === 'bn' ? 'ওয়াহিদ জামান' : 'Wahid Zaman',
 notes: lang === 'bn' ? 'বকেয়া ১২০০ টাকা পরিশোধের ফলো-আপ।' : 'Follow up on ৳1,200 pending due.'
 };
 
 const message = `${lang === 'bn' ? 'খাতা রিমাইন্ডার' : 'LEDGER REMINDER'}: ${randomPick.customerName}! ${lang === 'bn' ? 'নোট' : 'Note'}: "${randomPick.notes}"`;
 setTestAlertText(message);

 // Try HTML5 browser notifications as well!
 if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
  showNotification(lang === 'bn' ? "ইজি ডিউ ট্র্যাকার অ্যালার্ট" : "Challan Track Alert", {
    body: lang === 'bn' 
      ? `বকেয়া আদায়ের জন্য ${randomPick.customerName}-এর সাথে যোগাযোগ করতে মনে রাখুন!` 
      : `Remember to contact ${randomPick.customerName} for pending dues!`,
    icon: '/favicon.svg' // path to load
  });
 }

 // Try Web Vibration API
 if (typeof window !== 'undefined' && navigator.vibrate) {
 navigator.vibrate([200, 100, 200]);
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
  <span className="text-2xs font-extrabold bg-zinc-950/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Volume2 className="w-3.5 h-3.5 shrink-0" />{t.vibrationDemo}</span>
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
 <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">{lang === 'bn' ? 'সংরক্ষিত অ্যালার্ট তালিকা' : 'Scheduled Follow-ups'}</h3>
 <button
 onClick={() => setShowAddForm(!showAddForm)}
 className="text-emerald-600 dark:text-emerald-400 text-sm font-bold bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2 rounded-full cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
 >
 {showAddForm ? (lang === 'bn' ? 'ফলাফল বন্ধ করুন' : 'Close Scheduler') : `+ ${t.scheduleTitle}`}
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
 <div className="text-base font-extrabold text-zinc-800 dark:text-white flex items-center gap-2">
 <Calendar className="w-5 h-5 text-emerald-500" />
 {t.scheduleContact}
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 
 <div className="space-y-1">
 <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-1"><User className="w-3 h-3"/>{lang === 'bn' ? 'গ্রাহক অ্যাকাউন্ট' : 'Customer'}</label>
 <select
 value={selectedCustomerId}
 onChange={(e) => setSelectedCustomerId(e.target.value)}
 className="w-full px-4 py-3 bg-[#009966]/5 dark:bg-[#009966]/5 border-2 border-[#009966]/30 focus:border-[#009966] dark:border-[#009966]/20 dark:focus:border-[#009966] rounded-xl text-zinc-850 dark:text-white text-base focus:outline-none transition-all"
 required
 >
 <option value="">{t.selectCustomerPrompt}</option>
 {customers.map(c => (
 <option key={c.id} value={c.id}>{c.name} (Due: ৳ {formatNumber(c.outstandingDue || 0, lang)})</option>
 ))}
 </select>
 </div>

 <div className="space-y-1">
 <label className="text-xs font-bold text-zinc-500 uppercase">{lang === 'bn' ? 'রিমাইন্ডার নোট/বিবরণ' : 'Reminder Note'}</label>
 <input
 type="text"
 placeholder="e.g. Call for rice payment"
 value={notes}
 onChange={(e) => setNotes(e.target.value)}
 className="w-full px-4 py-3 bg-[#009966]/5 dark:bg-[#009966]/5 border-2 border-[#009966]/30 focus:border-[#009966] dark:border-[#009966]/20 dark:focus:border-[#009966] rounded-xl text-zinc-850 dark:text-white text-base focus:outline-none transition-all"
 />
 </div>

 <div className="space-y-1">
 <label className="text-xs font-bold text-zinc-500 uppercase">{t.targetDate}</label>
 <input
 type="date"
 value={dueDateStr}
 onChange={(e) => setDueDateStr(e.target.value)}
 className="w-full px-4 py-3 bg-[#009966]/5 dark:bg-[#009966]/5 border-2 border-[#009966]/30 focus:border-[#009966] dark:border-[#009966]/20 dark:focus:border-[#009966] rounded-xl text-zinc-850 dark:text-white text-base focus:outline-none transition-all"
 required
 />
 </div>

 <div className="space-y-1">
 <label className="text-xs font-bold text-zinc-500 uppercase">{t.targetTime}</label>
 <input
 type="time"
 value={dueTimeStr}
 onChange={(e) => setDueTimeStr(e.target.value)}
 className="w-full px-4 py-3 bg-[#009966]/5 dark:bg-[#009966]/5 border-2 border-[#009966]/30 focus:border-[#009966] dark:border-[#009966]/20 dark:focus:border-[#009966] rounded-xl text-zinc-850 dark:text-white text-base focus:outline-none transition-all"
 required
 />
 </div>

 </div>

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
 className="px-5 py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-850 dark:text-zinc-200 font-bold rounded-xl text-sm"
 >
 {t.cancel}
 </button>
 <button
 type="submit"
 disabled={isSubmitting}
 className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm flex items-center gap-1.5 cursor-pointer"
 >
 {t.scheduleNow}
 </button>
 </div>
 </motion.form>
 )}
 </AnimatePresence>

 {/* List of active scheduled alarms */}
 <div className="space-y-3">
 {reminders.length === 0 ? (
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-10 text-center rounded-2xl text-zinc-400">
 <AlertTriangle className="w-12 h-12 mx-auto stroke-[1.5] mb-2 text-zinc-300" />
 <p className="font-bold text-zinc-600 dark:text-zinc-300">{t.noRemindersYet}</p>
 <p className="text-xs mt-1">{t.scheduleOneNotice}</p>
 </div>
 ) : (
 <div className="space-y-3">
 {reminders.map(rem => (
 <div 
 key={rem.id}
 className={`p-5 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
 rem.active 
 ? 'bg-white border-zinc-150 dark:bg-zinc-900 dark:border-zinc-850 shadow-md' 
 : 'bg-zinc-50 border-zinc-200/50 dark:bg-zinc-950 dark:border-zinc-900 opacity-60'
 }`}
 >
 <div className="flex items-start gap-3.5 min-w-0">
 <button 
 onClick={() => toggleReminder(rem.id, !rem.active)}
 className="p-1 shrink-0 text-zinc-400 hover:text-emerald-600 cursor-pointer text-lg rounded-md"
 >
 {rem.active ? (
 <CheckSquare className="w-6 h-6 text-emerald-500 stroke-[2]" />
 ) : (
 <Square className="w-6 h-6 text-zinc-300 dark:text-zinc-750" />
 )}
 </button>

 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <span className={`text-base font-black truncate ${rem.active ? 'text-zinc-850 dark:text-white' : 'text-zinc-400 dark:text-zinc-500 line-through'}`}>
 {rem.customerName}
 </span>
 {rem.active && (
 <span className="shrink-0 px-2.5 py-0.5 text-3xs font-black bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 rounded-md uppercase tracking-wider">
 {t.activeAlert}
 </span>
 )}
 </div>
 
 <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 truncate">
 {rem.notes || t.contactRegardingDue}
 </p>

 <div className="flex items-center gap-1.5 text-2xs text-zinc-400 dark:text-zinc-500 font-bold mt-2.5 uppercase tracking-wide">
 <Calendar className="w-3.5 h-3.5" />
 {new Date(rem.dueDate).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
 {' • '}
 <Clock className="w-3.5 h-3.5 ml-1" />
 {new Date(rem.dueDate).toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
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
 ))}
 </div>
 )}
 </div>

 </div>
 );
}
