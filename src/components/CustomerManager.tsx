import React, { useState, useMemo } from 'react';
import { Customer, Transaction } from '../types';
import { 
  Users, Search, UserPlus, Phone, ArrowUpRight, ArrowDownLeft, Trash2, 
  X, MessageSquare, Send, ReceiptText, ArrowLeft, Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { translations, formatNumber, formatIndianNumberString, Language } from '../lib/translations';

interface CustomerManagerProps {
  customers: Customer[];
  transactions: Transaction[];
  createCustomer: (name: string, phone: string) => Promise<string | null | undefined>;
  addTransaction: (
    customerId: string, 
    type: 'due' | 'payment', 
    amount: number, 
    description: string,
    date?: Date,
    fallbackCustomerInfo?: { name: string; phone: string }
  ) => Promise<void>;
  updateCustomerDetails: (customerId: string, name: string, phone: string) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  selectedCustomerId: string | null;
  setSelectedCustomerId: (id: string | null) => void;
  lang: Language;
  triggerConfirm?: (title: string, message: string, onConfirm: () => void) => void;
}

export default function CustomerManager({
  customers,
  transactions,
  createCustomer,
  addTransaction,
  updateCustomerDetails,
  deleteCustomer,
  selectedCustomerId,
  setSelectedCustomerId,
  lang,
  triggerConfirm
}: CustomerManagerProps) {
  const t = translations[lang];

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [formError, setFormError] = useState('');
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  // Individual Customer transaction adding form state
  const [openActionType, setOpenActionType] = useState<'due' | 'payment' | null>(null);
  const [actionAmount, setActionAmount] = useState('');
  const [actionDesc, setActionDesc] = useState('');
  const [txSubmitting, setTxSubmitting] = useState(false);

  const [filterStatus, setFilterStatus] = useState<'all' | 'due' | 'settled'>('all');

  // Editing state for customer details
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editError, setEditError] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Selected message template for reminder alerts
  const [selectedTemplate, setSelectedTemplate] = useState<1 | 2 | 3>(1);

  // Filter customers list
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      // Basic query match
      const queryMatch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         c.phone.includes(searchQuery);
      if (!queryMatch) return false;

      // Filter status categories
      if (filterStatus === 'due') {
        return c.outstandingDue > 0;
      }
      if (filterStatus === 'settled') {
        return c.outstandingDue === 0;
      }
      return true;
    });
  }, [customers, searchQuery, filterStatus]);

  // Selected customer object & transactions
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  const selectedCustomerTransactions = useMemo(() => {
    if (!selectedCustomerId) return [];
    return transactions.filter(t => t.customerId === selectedCustomerId);
  }, [transactions, selectedCustomerId]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newName.trim()) {
      setFormError(lang === 'bn' ? 'অনুগ্রহ করে গ্রাহকের নাম লিখুন' : 'Please enter a customer name');
      return;
    }

    setIsCreatingCustomer(true);
    try {
      const [newId] = await Promise.all([
        createCustomer(newName, newPhone),
        new Promise(resolve => setTimeout(resolve, 600))
      ]);
      if (newId) {
        setNewName('');
        setNewPhone('');
        setShowAddForm(false);
        setSelectedCustomerId(newId as string); // open their profile immediately!
      }
    } catch (err: any) {
      if (err.message === 'DUPLICATE_NAME') {
        setFormError(lang === 'bn' ? 'এই নামের গ্রাহক ইতিমধ্যে খতিয়ানে সংরক্ষিত আছে।' : 'A customer with this name already exists.');
      } else {
        setFormError(lang === 'bn' ? 'অ্যাকাউন্ট সংরক্ষণ করা সম্ভব হয়নি। পুনরায় চেষ্টা করুন।' : 'Failed to save customer account. Try again.');
      }
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  const handleAddInlineTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !openActionType) return;
    const cleaned = actionAmount.replace(/,/g, '');
    const amountVal = parseFloat(cleaned);
    if (!amountVal || amountVal <= 0) return;

    setTxSubmitting(true);
    try {
      await Promise.all([
        addTransaction(selectedCustomerId, openActionType, amountVal, actionDesc),
        new Promise(resolve => setTimeout(resolve, 600))
      ]);
      setActionAmount('');
      setActionDesc('');
      setOpenActionType(null);
    } catch (err) {
      console.error(err);
    } finally {
      setTxSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (triggerConfirm) {
      triggerConfirm(
        lang === 'bn' ? 'গ্রাহক অ্যাকাউন্ট মুছে ফেলুন' : 'Delete Customer Account',
        t.confirmDelete,
        async () => {
          await deleteCustomer(id);
          setSelectedCustomerId(null);
        }
      );
    } else if (confirm(t.confirmDelete)) {
      await deleteCustomer(id);
      setSelectedCustomerId(null);
    }
  };

  // Generate message text based on selected template index
  const getMessageText = (c: Customer, templateIdx: number) => {
    if (lang === 'bn') {
      if (templateIdx === 1) {
        return `আসসালামু আলাইকুম ${c.name}, এটি একটি বন্ধুত্বপূর্ণ রিমাইন্ডার যে আপনার কাছে আমাদের বকেয়া পাওনা টাকার পরিমাণ হল ৳${formatNumber(c.outstandingDue, 'bn')}। অনুগ্রহ করে শীঘ্রই এই পাওনা পরিশোধ করুন। ধন্যবাদ!`;
      } else if (templateIdx === 2) {
        return `আসসালামু আলাইকুম ${c.name}, আশা করি ভালো আছেন। আমাদের খতিয়ান অনুযায়ী আপনার বকেয়া হিসাবটি হল ৳${formatNumber(c.outstandingDue, 'bn')}। সম্ভব হলে হিসাবটি পরিশোধ বা আংশিক সমন্বয় করার অনুরোধ জানাচ্ছি। ধন্যবাদ!`;
      } else {
        return `আসসালামু আলাইকুম জনাব/জনাবা ${c.name}, অনুগ্রহ করে লক্ষ্য করুন যে আপনার মোট বকেয়া পাওনা হল ৳${formatNumber(c.outstandingDue, 'bn')}। আমাদের ব্যবসার সুবিধার্থে অতিসত্বর এই বাকি পরিশোধ করার জন্য বিশেষভাবে অনুরোধ করা হলো।`;
      }
    } else {
      if (templateIdx === 1) {
        return `Hello ${c.name}, this is a friendly reminder that your outstanding balance in our ledger account is ৳${formatNumber(c.outstandingDue, 'en')}. Please clear your balance at your earliest convenience. Thank you!`;
      } else if (templateIdx === 2) {
        return `Hello ${c.name}, hope you are doing well. According to our ledger, your outstanding due is ৳${formatNumber(c.outstandingDue, 'en')}. We request you to kindly settle or partially clear this balance. Thank you!`;
      } else {
        return `Dear ${c.name}, please note that your total outstanding due is ৳${formatNumber(c.outstandingDue, 'en')}. We kindly request you to clear this remaining balance as soon as possible for our business convenience. Thank you.`;
      }
    }
  };

  // Generate customized shareable WhatsApp link
  const getShareLink = (c: Customer, format: 'whatsapp' | 'sms') => {
    const text = getMessageText(c, selectedTemplate);
    const encodedText = encodeURIComponent(text);
    if (format === 'whatsapp') {
      let phoneNum = c.phone ? c.phone.replace(/[^0-9]/g, '') : '';
      if (phoneNum.startsWith('01')) phoneNum = '88' + phoneNum;
      return `https://wa.me/${phoneNum}?text=${encodedText}`;
    }
    return `sms:${c.phone}?body=${encodedText}`;
  };

  return (
    <div className="space-y-6 no-select">
      
      {/* 1. LIST VIEW OF ALL CUSTOMERS */}
      {!selectedCustomer ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-500" />
              {t.customerAccounts} ({formatNumber(customers.length, lang)})
            </h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-5 py-3 bg-emerald-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-emerald-100 dark:shadow-none hover:bg-emerald-700 transition-colors cursor-pointer text-base"
              id="add_customer_btn"
            >
              <UserPlus className="w-5 h-5" />
              + {t.createAccount}
            </button>
          </div>

          {/* Form to add new customer */}
          <AnimatePresence>
            {showAddForm && (
              <motion.form 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleCreateCustomer}
                className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-xs overflow-hidden"
              >
                <div className="text-base font-bold text-zinc-800 dark:text-white">{t.newAccountDetails}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase">{t.customerName}</label>
                    <input
                      type="text"
                      placeholder="e.g. Wahid Zaman"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-white text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase">{t.phoneNumber}</label>
                    <input
                      type="tel"
                      placeholder={t.phoneSmsNotice}
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-white text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {formError && <div className="text-rose-500 text-sm font-semibold">⚠️ {formError}</div>}

                <div className="flex justify-end gap-3 touch-target-height">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-5 py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold rounded-xl"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingCustomer}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isCreatingCustomer ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin -ml-1 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {t.saving || (lang === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...')}
                      </span>
                    ) : (
                      t.saveAndOpen
                    )}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-white text-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Simple 3-Way balance category filter chips row for father's speedy control */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`px-4 py-2.5 rounded-xl font-bold transition-colors shrink-0 cursor-pointer ${
                filterStatus === 'all'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'bg-white text-zinc-650 border border-zinc-200 dark:bg-zinc-900 dark:text-zinc-450 dark:border-zinc-800'
              }`}
            >
              {lang === 'bn' ? 'সব গ্রাহক' : 'All Customers'} ({formatNumber(customers.length, lang)})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('due')}
              className={`px-4 py-2.5 rounded-xl font-bold transition-colors shrink-0 cursor-pointer ${
                filterStatus === 'due'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white text-rose-600 border border-rose-200 dark:bg-zinc-900 dark:border-rose-950/40 dark:text-rose-400'
              }`}
            >
              {lang === 'bn' ? 'বকেয়া খতিয়ান' : 'Has Outstanding'} ({formatNumber(customers.filter(c => c.outstandingDue > 0).length, lang)})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('settled')}
              className={`px-4 py-2.5 rounded-xl font-bold transition-colors shrink-0 cursor-pointer ${
                filterStatus === 'settled'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-emerald-650 border border-emerald-250 dark:bg-zinc-900 dark:border-emerald-950/40 dark:text-emerald-400'
              }`}
            >
              {lang === 'bn' ? 'পরিশোধিত/০ টাকা' : 'Settled (৳0)'} ({formatNumber(customers.filter(c => c.outstandingDue === 0).length, lang)})
            </button>
          </div>

          {/* Customer list database */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredCustomers.map(c => (
              <div
                key={c.id}
                onClick={() => setSelectedCustomerId(selectedCustomerId === c.id ? null : c.id)}
                className={`bg-white dark:bg-zinc-900 border p-5 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between group ${
                  selectedCustomerId === c.id 
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 dark:ring-emerald-400/20' 
                    : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="text-lg font-bold text-zinc-800 dark:text-zinc-100 truncate group-hover:text-emerald-600 transition-colors">
                    {c.name}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1.5 mt-1">
                    <Phone className="w-3 h-3 shrink-0" />
                    {c.phone || (lang === 'bn' ? '(ফোন নম্বর নেই)' : '(No phone listed)')}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-2xs font-bold text-zinc-400 uppercase tracking-wide">{lang === 'bn' ? 'ব্যালেন্স' : 'Outstanding'}</div>
                  <div className={`text-xl font-black mt-0.5 ${
                    c.outstandingDue > 0 
                      ? 'text-rose-600 dark:text-rose-450' 
                      : c.outstandingDue < 0 
                        ? 'text-cyan-600 dark:text-cyan-400' 
                        : 'text-zinc-400 dark:text-zinc-500'
                  }`}>
                    ৳ {formatNumber(c.outstandingDue || 0, lang)}
                  </div>
                </div>
              </div>
            ))}

            {filteredCustomers.length === 0 && (
              <div className="col-span-1 sm:col-span-2 p-10 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-400">
                <Users className="w-12 h-12 mx-auto stroke-[1.5] mb-2 text-zinc-300" />
                <p className="font-bold text-zinc-650 dark:text-zinc-300">{t.noCustomersFound}</p>
                <p className="text-xs mt-1 text-zinc-400">{t.createOneAbove}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        
        /* 2. CHOSEN CUSTOMER DETAIL SHEET VIEW */
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* Back button */}
          <button
            onClick={() => {
              setSelectedCustomerId(null);
              setOpenActionType(null);
              setIsEditingCustomer(false);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-bold text-zinc-700 dark:text-zinc-200 rounded-full cursor-pointer transition-colors"
            id="back_to_list_btn"
          >
            <ArrowLeft className="w-5 h-5" />
            {t.backToList}
          </button>

          {/* Customer Profile card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-6 shadow-xs dark:shadow-md dark:shadow-black/10 space-y-6 relative overflow-hidden">
            {/* Ambient decorative gradient corner inside dark mode */}
            <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 bg-emerald-500/5 w-48 h-48 rounded-full blur-2xl hidden dark:block pointer-events-none"></div>
            
            {/* Edit Button on the Top Right Side of the Card */}
            {!isEditingCustomer && (
              <button
                onClick={() => {
                  setEditName(selectedCustomer.name);
                  setEditPhone(selectedCustomer.phone || '');
                  setEditError('');
                  setIsEditingCustomer(true);
                }}
                className="absolute right-4 top-4 p-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-full transition-all cursor-pointer z-25 flex items-center justify-center shadow-xs"
                title={lang === 'bn' ? 'তথ্য পরিবর্তন করুন' : 'Edit Customer Info'}
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10 pt-2">
              {isEditingCustomer ? (
                <div className="flex-1 space-y-3 max-w-sm">
                  <div>
                    <label className="block text-3xs font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">
                      {lang === 'bn' ? 'গ্রাহকের নাম' : 'Customer Name'}
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 text-sm font-bold"
                      placeholder={lang === 'bn' ? 'নাম লিখুন' : 'Enter name'}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-3xs font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">
                      {lang === 'bn' ? 'মোবাইল নম্বর' : 'Mobile Number'}
                    </label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 text-sm font-bold"
                      placeholder={lang === 'bn' ? 'যেমন: ০১৭...' : 'e.g. 017...'}
                    />
                  </div>
                  {editError && (
                    <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{editError}</p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSavingEdit}
                      onClick={async () => {
                        if (!editName.trim()) {
                          setEditError(lang === 'bn' ? 'নাম অবশ্যই দিতে হবে' : 'Name is required');
                          return;
                        }
                        setIsSavingEdit(true);
                        try {
                          await updateCustomerDetails(selectedCustomer.id, editName, editPhone);
                          setIsEditingCustomer(false);
                        } catch (err) {
                          setEditError(lang === 'bn' ? 'সংরক্ষণ করতে ব্যর্থ হয়েছে' : 'Failed to save changes');
                        } finally {
                          setIsSavingEdit(false);
                        }
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-zinc-950 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      {isSavingEdit ? (lang === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...') : (lang === 'bn' ? 'সংরক্ষণ করুন' : 'Save')}
                    </button>
                    <button
                      type="button"
                      disabled={isSavingEdit}
                      onClick={() => setIsEditingCustomer(false)}
                      className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <h2 className="text-2xl font-black text-zinc-900 dark:text-white">{selectedCustomer.name}</h2>
                  {selectedCustomer.phone && (
                    <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-1.5">
                      <Phone className="w-4 h-4 text-emerald-500" />
                      {selectedCustomer.phone}
                      <a 
                        href={`tel:${selectedCustomer.phone}`}
                        className="ml-2 text-xs font-bold bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-md text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 inline-block cursor-pointer transition-colors"
                      >
                        {lang === 'bn' ? 'কল করুন' : 'Call Now'}
                      </a>
                    </p>
                  )}
                </div>
              )}

              {/* OUTSTANDING SCORE */}
              <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-850 flex flex-col justify-center min-w-44 text-right">
                <span className="text-2xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block">{t.currentBalance}</span>
                <span className={`text-2xl font-black mt-1 ${
                  selectedCustomer.outstandingDue > 0 
                    ? 'text-rose-600 dark:text-rose-450' 
                    : selectedCustomer.outstandingDue < 0 
                      ? 'text-cyan-600 dark:text-cyan-400' 
                      : 'text-zinc-500 dark:text-zinc-400'
                }`}>
                  {selectedCustomer.outstandingDue === 0 ? t.settled : `৳ ${formatNumber(selectedCustomer.outstandingDue, lang)}`}
                </span>
                <span className="text-3xs text-zinc-400 mt-1">
                  {selectedCustomer.outstandingDue > 0 ? t.customerOwes : selectedCustomer.outstandingDue < 0 ? t.youOweCustomer : t.allClear}
                </span>
              </div>
            </div>

            {/* Quick message template picker card for Dad */}
            {selectedCustomer.phone && selectedCustomer.outstandingDue > 0 && (
              <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3 relative z-10">
                <div className="text-xs font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wide flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                  {t.predefinedMessages}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => setSelectedTemplate(1)}
                    className={`p-3 text-left rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      selectedTemplate === 1
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-400 dark:text-emerald-400'
                        : 'bg-white border-zinc-200 text-zinc-650 hover:bg-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-850'
                    }`}
                  >
                    {t.templatePolite}
                  </button>
                  <button
                    onClick={() => setSelectedTemplate(2)}
                    className={`p-3 text-left rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      selectedTemplate === 2
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-400 dark:text-emerald-400'
                        : 'bg-white border-zinc-200 text-zinc-650 hover:bg-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-850'
                    }`}
                  >
                    {t.templateRespect}
                  </button>
                  <button
                    onClick={() => setSelectedTemplate(3)}
                    className={`p-3 text-left rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      selectedTemplate === 3
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-400 dark:text-emerald-400'
                        : 'bg-white border-zinc-200 text-zinc-650 hover:bg-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-850'
                    }`}
                  >
                    {t.templateFormal}
                  </button>
                </div>
                
                {/* Live Message Preview for senior ease-of-mind */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-xl text-xs italic text-zinc-600 dark:text-zinc-300 leading-relaxed font-bold">
                  "{getMessageText(selectedCustomer, selectedTemplate)}"
                </div>
              </div>
            )}

            {/* SEND REMINDERS / ACTIONS FOR DAD */}
            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap gap-3">
              {selectedCustomer.phone && selectedCustomer.outstandingDue > 0 && (
                <>
                  <a
                    href={getShareLink(selectedCustomer, 'whatsapp')}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 min-w-[170px] py-3.5 px-4 bg-[#25D366] hover:bg-[#20ba59] font-black text-white rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer text-sm"
                  >
                    <MessageSquare className="w-5 h-5" />
                    {t.remindWhatsApp}
                  </a>

                  <a
                    href={getShareLink(selectedCustomer, 'sms')}
                    className="flex-1 min-w-[170px] py-3.5 px-4 bg-blue-600 hover:bg-blue-700 font-black text-white rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer text-sm"
                  >
                    <Send className="w-4 h-4" />
                    {t.sendSmsReminder}
                  </a>
                </>
              )}
              
              {/* DELETE ACCOUNT BUTTON */}
              <button
                onClick={() => handleDelete(selectedCustomer.id)}
                className="py-3 px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 dark:text-rose-400 rounded-xl flex items-center justify-center gap-2 cursor-pointer text-xs font-semibold"
              >
                <Trash2 className="w-4 h-4" />
                {t.deleteAccount}
              </button>
            </div>
          </div>

          {/* TWO DUAL BIG DIRECT ENTRY BUTTONS */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setOpenActionType('due')}
              className={`py-5 px-4 rounded-2xl border-3 flex flex-col items-center justify-center gap-2 shadow-xs cursor-pointer transition-all ${
                openActionType === 'due' 
                  ? 'bg-rose-600 border-rose-700 text-white dark:bg-rose-500 dark:border-rose-600 dark:text-zinc-950 shadow-rose-100 dark:shadow-none'
                  : 'bg-zinc-50 hover:bg-zinc-100 border-rose-200 text-rose-600 dark:bg-zinc-900 dark:border-rose-800/80 dark:text-rose-450 dark:hover:bg-zinc-800'
              }`}
            >
              <ArrowUpRight className="w-6 h-6 stroke-[2.5]" />
              <span className="font-extrabold text-base sm:text-lg">+ {t.letThemBuy}</span>
            </button>

            <button
              onClick={() => setOpenActionType('payment')}
              className={`py-5 px-4 rounded-2xl border-3 flex flex-col items-center justify-center gap-2 shadow-xs cursor-pointer transition-all ${
                openActionType === 'payment' 
                  ? 'bg-emerald-600 border-emerald-700 text-white dark:bg-emerald-500 dark:border-emerald-600 dark:text-zinc-950 shadow-emerald-100 dark:shadow-none' 
                  : 'bg-zinc-50 hover:bg-zinc-100 border-emerald-200 text-emerald-600 dark:bg-zinc-900 dark:border-emerald-800/80 dark:text-emerald-400 dark:hover:bg-zinc-800'
              }`}
            >
              <ArrowDownLeft className="w-6 h-6 stroke-[2.5]" />
              <span className="font-extrabold text-base sm:text-lg">+ {t.gotCash}</span>
            </button>
          </div>

          {/* INLINE INJECT TRANSACTION MODIFIER FORM */}
          <AnimatePresence>
            {openActionType && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-zinc-900 border-2 border-dashed border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-extrabold text-zinc-800 dark:text-white">
                    {openActionType === 'due' ? (lang === 'bn' ? 'নতুন বাকি বিবরণ' : 'Record New Due') : (lang === 'bn' ? 'পেমেন্ট আদায়ের বিবরণ' : 'Record Received Payment')} {lang === 'bn' ? 'যুক্ত হচ্ছে' : 'for'} {selectedCustomer.name}
                  </h4>
                  <button onClick={() => setOpenActionType(null)} className="p-1 hover:bg-zinc-100 rounded-full cursor-pointer">
                    <X className="w-5 h-5 text-zinc-400" />
                  </button>
                </div>

                <form onSubmit={handleAddInlineTransaction} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-500 uppercase">{t.amount} (৳) *</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={actionAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          const clean = val.replace(/[^0-9.]/g, '');
                          const dots = clean.split('.');
                          let sanitized = clean;
                          if (dots.length > 2) {
                            sanitized = dots[0] + '.' + dots.slice(1).join('');
                          }
                          setActionAmount(formatIndianNumberString(sanitized));
                        }}
                        className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white text-lg font-bold focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                        required
                        autoFocus
                      />

                      {/* Tap amount quick-add preset buttons for elderly easy input */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {[50, 100, 500, 1000, 5000].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              const cleaned = actionAmount.replace(/,/g, '');
                              const currentVal = parseFloat(cleaned) || 0;
                              const newVal = (currentVal + preset).toString();
                              setActionAmount(formatIndianNumberString(newVal));
                            }}
                            className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg text-2xs font-bold text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                          >
                            +৳{formatNumber(preset, lang)}
                          </button>
                        ))}
                        <button
                          key="clear"
                          type="button"
                          onClick={() => setActionAmount('')}
                          className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 px-2.5 py-1.5 rounded-lg text-2xs font-bold transition-colors cursor-pointer"
                        >
                          {lang === 'bn' ? 'মুছে ফেলুন' : 'Clear'}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-500 uppercase">{t.notes}</label>
                      <input
                        type="text"
                        placeholder={t.notesPlaceholder}
                        value={actionDesc}
                        onChange={(e) => setActionDesc(e.target.value)}
                        className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-white text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 touch-target-height pt-2">
                    <button
                      type="button"
                      onClick={() => setOpenActionType(null)}
                      className="px-5 py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-850 dark:text-zinc-200 font-bold rounded-xl"
                    >
                      {t.cancel}
                    </button>
                    <button
                      type="submit"
                      disabled={txSubmitting}
                      className={`px-6 py-3 text-white font-extrabold rounded-xl transition-all cursor-pointer ${
                        openActionType === 'due' 
                          ? 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600 dark:text-zinc-950' 
                          : 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-zinc-950'
                      } disabled:opacity-70 disabled:cursor-not-allowed`}
                    >
                      {txSubmitting ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin -ml-1 h-5 w-5 text-current" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          {t.saving || (lang === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...')}
                        </span>
                      ) : (
                        t.addToLedger
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* HISTORICAL LEDGER FOR THIS CUSTOMER */}
          <div className="space-y-3">
            <span className="text-xs font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
              {t.statements} ({formatNumber(selectedCustomerTransactions.length, lang)})
            </span>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-850 rounded-2xl overflow-hidden shadow-xs">
              {selectedCustomerTransactions.length === 0 ? (
                <div className="p-8 text-center text-zinc-400 dark:text-zinc-500 flex flex-col items-center gap-2">
                  <ReceiptText className="w-10 h-10 stroke-[1.5]" />
                  <p className="font-bold text-zinc-700 dark:text-zinc-350">{t.noHistory}</p>
                  <p className="text-xs text-zinc-400">{t.duesVisibleHere}</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-850">
                  {selectedCustomerTransactions.map(tx => (
                    <div 
                      key={tx.id} 
                      className="p-4 flex items-center justify-between hover:bg-zinc-50/50 dark:hover:bg-zinc-850/50 transition-colors"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          tx.type === 'due' 
                            ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-500' 
                            : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500'
                        }`}>
                          {tx.type === 'due' ? <ArrowUpRight className="w-4.5 h-4.5 stroke-[2.5]" /> : <ArrowDownLeft className="w-4.5 h-4.5 stroke-[2.5]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-base font-semibold text-zinc-850 dark:text-zinc-200 truncate">
                            {tx.description || (tx.type === 'due' ? t.dueTrigger : t.paymentTrigger)}
                          </div>
                          <div className="text-xs text-zinc-400 dark:text-zinc-500 font-bold mt-0.5 uppercase">
                            {new Date(tx.date).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {' • '}
                            {new Date(tx.date).toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>

                      <div className={`text-base sm:text-lg font-black shrink-0 ${
                        tx.type === 'due' ? 'text-rose-600 dark:text-rose-450' : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {tx.type === 'due' ? '+' : '-'} ৳ {formatNumber(tx.amount, lang)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
        </motion.div>
      )}

    </div>
  );
}
