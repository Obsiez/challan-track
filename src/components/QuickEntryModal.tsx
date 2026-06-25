import React, { useState } from 'react';
import { Customer } from '../types';
import { X, Search, UserPlus, Check, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { translations, formatNumber, formatIndianNumberString, Language } from '../lib/translations';
import { toast } from 'sonner';

interface QuickEntryModalProps {
 isOpen: boolean;
 onClose: () => void;
 customers: Customer[];
 createCustomer: (name: string, phone: string) => Promise<string | null | undefined>;
 addTransaction: (
 customerId: string, 
 type: 'due' | 'payment', 
 amount: number, 
 description: string,
 date?: Date,
 fallbackCustomerInfo?: { name: string; phone: string }
 ) => Promise<void>;
 preselectedCustomerId?: string;
 lang: Language;
}

export default function QuickEntryModal({
 isOpen,
 onClose,
 customers,
 createCustomer,
 addTransaction,
 preselectedCustomerId,
 lang
}: QuickEntryModalProps) {
 const t = translations[lang];

 const [type, setType] = useState<'due' | 'payment'>('due');
 const [searchQuery, setSearchQuery] = useState('');
 const [selectedCustomerId, setSelectedCustomerId] = useState(preselectedCustomerId || '');
 const [customerNameInput, setCustomerNameInput] = useState('');
 const [customerPhoneInput, setCustomerPhoneInput] = useState('');
 const [showAddNewCustomer, setShowAddNewCustomer] = useState(false);
 const [showAllCustomers, setShowAllCustomers] = useState(false);
 
 const [amountInput, setAmountInput] = useState('');
 const [description, setDescription] = useState('');
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [errorMsg, setErrorMsg] = useState('');

 // Keep state in sync when preselectedCustomerId or open state changes
 React.useEffect(() => {
 if (isOpen) {
 setSelectedCustomerId(preselectedCustomerId || '');
 setErrorMsg('');
 setAmountInput('');
 setDescription('');
 setSearchQuery('');
 setShowAddNewCustomer(false);
 setShowAllCustomers(false);
 }
 }, [isOpen, preselectedCustomerId]);

 React.useEffect(() => {
 if (isOpen) {
 document.body.style.overflow = 'hidden';
 } else {
 document.body.style.overflow = '';
 }
 return () => { document.body.style.overflow = ''; };
 }, [isOpen]);

 // Handle immediate selection
 const filteredCustomers = searchQuery.trim() === '' 
 ? customers 
 : customers.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));

 const currentCustomer = customers.find(c => c.id === selectedCustomerId);

 const handleQuickAddAmount = (add: number) => {
 const cleaned = amountInput.replace(/,/g, '');
 const current = parseFloat(cleaned) || 0;
 const newVal = (current + add).toString();
 setAmountInput(formatIndianNumberString(newVal));
 };

 const handleSave = async (e: React.FormEvent) => {
 e.preventDefault();
 setErrorMsg('');

 let custId = selectedCustomerId;
 const cleanedAmount = amountInput.replace(/,/g, '');
 const amountVal = parseFloat(cleanedAmount);

 if (!amountVal || amountVal <= 0) {
 setErrorMsg(lang === 'bn' ? 'অনুগ্রহ করে সঠিক পরিমাণ দিন (০ টাকার বেশি)' : 'Please enter a valid amount (greater than 0)');
 return;
 }

 setIsSubmitting(true);
 try {
 if (showAddNewCustomer) {
 if (!customerNameInput.trim()) {
 setErrorMsg(lang === 'bn' ? 'গ্রাহকের নাম খালি থাকতে পারবে না' : 'Customer name cannot be empty');
 setIsSubmitting(false);
 return;
 }
 
 try {
 // Create customer first
 const newId = await createCustomer(customerNameInput, customerPhoneInput);
 if (newId) {
 custId = newId;
 } else {
 throw new Error('Failed to create customer');
 }
 } catch (err: any) {
 if (err.message === 'DUPLICATE_NAME') {
 setErrorMsg(lang === 'bn' ? 'এই নামের গ্রাহক ইতিমধ্যে খতিয়ানে সংরক্ষিত আছে।' : 'A customer with this name already exists.');
 } else {
 setErrorMsg(lang === 'bn' ? 'গ্রাহক তৈরি করতে সমস্যা হয়েছে।' : 'Failed to create customer.');
 }
 setIsSubmitting(false);
 return;
 }
 }

 if (!custId) {
 setErrorMsg(lang === 'bn' ? 'অনুগ্রহ করে একজন গ্রাহক নির্বাচন করুন বা নতুনভাবে যুক্ত করুন' : 'Please select or add a customer first');
 setIsSubmitting(false);
 return;
 }

 // Pass fallbackCustomerInfo to bypass React state re-render delay
 const fallbackCustomer = showAddNewCustomer 
 ? { name: customerNameInput, phone: customerPhoneInput } 
 : undefined;

 await Promise.all([
 addTransaction(custId, type, amountVal, description, new Date(), fallbackCustomer),
 new Promise(resolve => setTimeout(resolve, 600))
 ]);
 
 // Reset & Close
 setType('due');
 setSearchQuery('');
 setSelectedCustomerId('');
 setCustomerNameInput('');
 setCustomerPhoneInput('');
 setShowAddNewCustomer(false);
 setAmountInput('');
 setDescription('');
 onClose();
 toast.success(lang === 'bn' ? 'হিসাব সফলভাবে যোগ হয়েছে' : 'Transaction saved successfully');
 } catch (err) {
 console.error(err);
 setErrorMsg(lang === 'bn' ? 'হিসাব সংরক্ষণে ত্রুটি ঘটেছে। পুনরায় চেষ্টা করুন।' : 'Error saving. Please check connection and try again.');
 } finally {
 setIsSubmitting(false);
 }
 };

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 no-select overflow-y-auto hide-scrollbar">
 <div 
 className="bg-white dark:bg-zinc-900 w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col animate-slide-up"
 >
 {/* Header */}
 <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
 <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
 <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
 {t.quickEntryTitle}
 </h3>
 <button 
 onClick={onClose}
 className="p-3 bg-zinc-100 touch-target-height hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer animate-once"
 aria-label="Close"
 id="close_modal_btn"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 <form onSubmit={handleSave} className="flex-1 overflow-y-auto hide-scrollbar p-5 space-y-6">
 
 {/* 1. ENTRY TYPE SELECTION (GIANT BUTTONS) */}
 <div className="space-y-2">
 <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
 {t.chooseType}
 </span>
 <div className="grid grid-cols-2 gap-4">
 <button
 type="button"
 onClick={() => setType('due')}
 className={`py-5 px-4 rounded-2xl flex flex-col items-center justify-center gap-2 border-3 transition-all cursor-pointer ${
 type === 'due'
 ? 'bg-rose-50 border-rose-500 text-rose-700 dark:bg-rose-950/20 dark:border-rose-500 dark:text-rose-400 font-bold shadow-lg shadow-rose-100 dark:shadow-none'
 : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-150 dark:bg-zinc-850 dark:border-zinc-800 dark:text-zinc-400'
 }`}
 id="tab_give_due"
 >
 <ArrowUpRight className="w-7 h-7 stroke-[2.5]" />
 <span className="text-lg font-black">{t.giveDue}</span>
 <span className="text-xs opacity-80">{lang === 'bn' ? 'গ্রাহক পরে পেমেন্ট দেবে' : 'Customer owes you'}</span>
 </button>

 <button
 type="button"
 onClick={() => setType('payment')}
 className={`py-5 px-4 rounded-2xl flex flex-col items-center justify-center gap-2 border-3 transition-all cursor-pointer ${
 type === 'payment'
 ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-500 dark:text-emerald-400 font-bold shadow-lg shadow-emerald-100 dark:shadow-none'
 : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-150 dark:bg-zinc-850 dark:border-zinc-800 dark:text-zinc-400'
 }`}
 id="tab_get_payment"
 >
 <ArrowDownLeft className="w-7 h-7 stroke-[2.5]" />
 <span className="text-lg font-black">{t.getPayment}</span>
 <span className="text-xs opacity-80">{lang === 'bn' ? 'গ্রাহক নগদ পরিশোধ করল' : 'Customer paid you'}</span>
 </button>
 </div>
 </div>

 {/* 2. CUSTOMER CHIP SELECTION OR INLINE ADD */}
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
 {lang === 'bn' ? 'গ্রাহক নির্বাচন' : 'Customer Account'}
 </span>
 <button
 type="button"
 onClick={() => setShowAddNewCustomer(!showAddNewCustomer)}
 className="text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 rounded-xl cursor-pointer"
 id="toggle_new_cust_btn"
 >
 {showAddNewCustomer ? (
 lang === 'bn' ? '← তালিকায় ফিরুন' : '← Back to List'
 ) : (
 <>
 <UserPlus className="w-4 h-4" />
 + {lang === 'bn' ? 'নতুন গ্রাহক যোগ' : 'Add New Customer'}
 </>
 )}
 </button>
 </div>

 {!showAddNewCustomer ? (
 <div className="space-y-3">
 {/* Select Customer search */}
 <div className="relative">
 <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
 <input
 type="text"
 placeholder={lang === 'bn' ? 'গ্রাহক পছন্দ করতে খুঁজুন...' : 'Search to pick customer...'}
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-white text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
 />
 </div>

 {/* Customer Names Grid */}
  <div className="relative pt-1">
    <div className={`grid grid-cols-2 gap-2 ${!showAllCustomers ? 'grid-rows-3' : ''}`}>
      {(showAllCustomers ? filteredCustomers : filteredCustomers.slice(0, 6)).map(c => (
      <button
      key={c.id}
      type="button"
      onClick={() => setSelectedCustomerId(selectedCustomerId === c.id ? '' : c.id)}
      className={`p-3 text-left rounded-xl border transition-all text-sm truncate flex items-center justify-between cursor-pointer ${
      selectedCustomerId === c.id
      ? type === 'due'
      ? 'bg-rose-600 text-white border-rose-600 font-bold dark:bg-rose-500 dark:text-zinc-950 dark:border-rose-500'
      : 'bg-emerald-600 text-white border-emerald-600 font-bold dark:bg-emerald-500 dark:text-zinc-950 dark:border-emerald-500'
      : 'bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
      }`}
      >
      <span className="truncate">{c.name}</span>
      {selectedCustomerId === c.id && <Check className="w-4 h-4 shrink-0 label-icon ml-1" />}
      </button>
      ))}

      {filteredCustomers.length === 0 && (
      <div className="col-span-2 w-full text-center py-4 bg-zinc-50 dark:bg-zinc-850 rounded-xl text-zinc-500 text-xs shrink-0">
      {lang === 'bn' ? 'কোনো গ্রাহক মেলেনি। উপরে "+ নতুন গ্রাহক যোগ" চাপুন।' : 'No customer matches. Click "+ Add New Customer" above.'}
      </div>
      )}
    </div>

    {filteredCustomers.length > 6 && (
      <div className="flex justify-end mt-3 pr-1">
        <button
          type="button"
          onClick={() => setShowAllCustomers(!showAllCustomers)}
          className="text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
        >
          {showAllCustomers 
            ? (lang === 'bn' ? 'কম দেখুন' : 'Show less') 
            : (lang === 'bn' ? 'আরও দেখুন' : 'Show more')}
          <svg className={`w-3.5 h-3.5 transition-transform ${showAllCustomers ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
        </button>
      </div>
    )}
  </div>
 </div>
 ) : (
 /* INLINE NEW CUSTOMER FORM */
 <div className="p-4 bg-zinc-50 dark:bg-zinc-850 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 space-y-3">
 <div className="space-y-1">
 <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">{t.customerName}</label>
 <input
 type="text"
 placeholder="e.g. Wahid Zaman"
 value={customerNameInput}
 onChange={(e) => setCustomerNameInput(e.target.value)}
 className="w-full px-4 py-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-850 dark:text-white"
 />
 </div>
 <div className="space-y-1">
 <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">{t.phoneNumber}</label>
 <input
 type="tel"
 placeholder="e.g. 01712345678"
 value={customerPhoneInput}
 onChange={(e) => setCustomerPhoneInput(e.target.value)}
 className="w-full px-4 py-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-850 dark:text-white"
 />
 </div>
 </div>
 )}
 </div>

 {/* 3. DUES OR TRANSACTION AMOUNT */}
 <div className="space-y-2">
 <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
 {t.amountLabel}
 </span>
 <div className="relative">
 <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-zinc-400 dark:text-zinc-500">৳</span>
 <input
 type="text"
 inputMode="decimal"
 placeholder="0"
 value={amountInput}
 onChange={(e) => {
 const val = e.target.value;
 const clean = val.replace(/[^0-9.]/g, '');
 const dots = clean.split('.');
 let sanitized = clean;
 if (dots.length > 2) {
 sanitized = dots[0] + '.' + dots.slice(1).join('');
 }
 setAmountInput(formatIndianNumberString(sanitized));
 }}
 className="w-full pl-10 pr-4 py-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-extrabold text-2xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
 required
 />
 </div>

 {type === 'payment' && currentCustomer && (currentCustomer as any).outstandingDue > 0 && (
    <div className="flex items-center gap-2 mt-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-800">
      <input
        type="checkbox"
        id="payFullDue"
        className="w-4 h-4 text-emerald-600 rounded border-zinc-300 focus:ring-emerald-500"
        onChange={(e) => {
          if (e.target.checked) {
            setAmountInput(formatIndianNumberString((currentCustomer as any).outstandingDue.toString()));
          } else {
            setAmountInput('');
          }
        }}
      />
      <label htmlFor="payFullDue" className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
        {lang === 'bn' ? 'সম্পূর্ণ বকেয়া পরিশোধ করুন' : 'Settle complete due'} (৳{formatNumber((currentCustomer as any).outstandingDue, lang)})
      </label>
    </div>
  )}

 {/* Speedy Pad helpers */}
 <div className="flex flex-wrap gap-1.5 pt-1">
 {[50, 100, 500, 1000, 5000].map(val => (
 <button
 key={val}
 type="button"
 onClick={() => handleQuickAddAmount(val)}
 className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 font-bold rounded-xl transition-all text-2xs cursor-pointer"
 >
 +{formatNumber(val, lang)}
 </button>
 ))}
 <button
 type="button"
 onClick={() => setAmountInput('')}
 className="px-3 py-2 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 font-bold rounded-xl transition-all text-2xs cursor-pointer"
 >
 {lang === 'bn' ? 'মুছুন' : 'Clear'}
 </button>
 </div>
 </div>

 {/* 4. OPTIONAL DESCRIPTION */}
 <div className="space-y-1">
 <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
 {t.notes}
 </span>
 <input
 type="text"
 placeholder={t.notesPlaceholder}
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-850 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
 />
 </div>

 {/* Error Message */}
 {errorMsg && (
 <div className="p-4 bg-rose-50 dark:bg-rose-950/20 rounded-xl text-rose-600 dark:text-rose-400 font-semibold text-sm">
 ⚠️ {errorMsg}
 </div>
 )}

 {/* Actions Submit */}
 <div className="pt-4 pb-2">
 <button
 type="submit"
 disabled={isSubmitting}
 className={`w-full py-4.5 rounded-2xl font-extrabold text-lg flex items-center justify-center shadow-lg transition-all cursor-pointer ${
 type === 'due' 
 ? 'bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-500 dark:hover:bg-rose-400 dark:text-zinc-950 shadow-rose-200 dark:shadow-none' 
 : 'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 shadow-emerald-200 dark:shadow-none'
 } ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
 id="save_transaction_btn"
 >
 {isSubmitting ? (
 <span className="flex items-center gap-2">
 <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
 </svg>
 {t.speedyNotice}
 </span>
 ) : (
 type === 'due' ? t.confirmGive : t.confirmReceive
 )}
 </button>
 </div>

 </form>
 </div>
 </div>
 );
}
