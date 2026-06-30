import React, { useState, useMemo } from 'react';
import { Customer, Transaction } from '../types';
import { 
  Users, Search, UserPlus, Phone, ArrowUpRight, ArrowDownLeft, Trash2, 
  X, MessageSquare, Send, ReceiptText, ArrowLeft, Pencil, ChevronDown, ChevronUp, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence, useAnimation } from 'motion/react';
import { translations, formatNumber, formatIndianNumberString, Language } from '../lib/translations';
import { triggerHaptic } from '../lib/haptics';
import { toast } from 'sonner';

const WhatsAppIcon = () => (
	<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" className="shrink-0">
		<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
	</svg>
);

interface SwipeableCustomerItemProps {
	customer: Customer;
	lang: Language;
	onClick: () => void;
	isSelected: boolean;
	onWhatsApp: () => void;
	onDelete: () => void;
	swipeGesturesEnabled: boolean;
	isDeleting: boolean;
	children: React.ReactNode;
}

const SwipeableCustomerItem = ({
	customer,
	lang,
	onClick,
	isSelected,
	onWhatsApp,
	onDelete,
	swipeGesturesEnabled,
	isDeleting,
	children
}: SwipeableCustomerItemProps) => {
	const cardRef = React.useRef<HTMLDivElement>(null);
	const controls = useAnimation();
	const [startX, setStartX] = useState(0);
	const [startY, setStartY] = useState(0);
	const [isSwiping, setIsSwiping] = useState(false);
	const [hasVibrated, setHasVibrated] = useState(false);
	const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null);
	const isSnappingRef = React.useRef(false);

	React.useEffect(() => {
		if (isDeleting) {
			const cardWidth = cardRef.current?.offsetWidth || 350;
			setSwipeDir('left');
			controls.start({
				x: -cardWidth * 0.4,
				transition: { type: 'spring', stiffness: 300, damping: 15, mass: 0.6 }
			});
		} else {
			controls.start({
				x: 0,
				transition: { type: 'spring', stiffness: 300, damping: 25 }
			}).then(() => {
				setSwipeDir(null);
				setIsSwiping(false);
			});
		}
	}, [isDeleting, controls]);

	const handleSnap = (targetX: number) => {
		if (isSnappingRef.current) return;
		isSnappingRef.current = true;

		// Rapidly accelerate card to targetX (underdamped spring physics: overshoot and bounce back)
		controls.start({
			x: targetX,
			transition: { type: 'spring', stiffness: 350, damping: 15, mass: 0.6 }
		}).then(() => {
			if (targetX > 0) {
				// WhatsApp action: trigger and close immediately
				onWhatsApp();
				controls.start({
					x: 0,
					transition: { type: 'spring', stiffness: 200, damping: 25 }
				}).then(() => {
					setSwipeDir(null);
					setIsSwiping(false);
					isSnappingRef.current = false;
				});
			} else {
				// Delete action: trigger and let the isDeleting prop control the open state/closing
				onDelete();
				isSnappingRef.current = false;
			}
		});
	};

	const handleTouchStart = (e: React.TouchEvent) => {
		if (!swipeGesturesEnabled || isSnappingRef.current || isDeleting) return;
		setStartX(e.touches[0].clientX);
		setStartY(e.touches[0].clientY);
		setIsSwiping(false);
		setHasVibrated(false);
	};

	const handleTouchMove = (e: React.TouchEvent) => {
		if (!swipeGesturesEnabled || isSnappingRef.current || isDeleting) return;
		const diffX = e.touches[0].clientX - startX;
		const diffY = e.touches[0].clientY - startY;

		if (!isSwiping) {
			// Accidental diagonal scrolls check: require diffX to be greater than diffY, and at least 15px threshold to activate swipe.
			if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 15) {
				setIsSwiping(true);
			}
		}

		if (isSwiping) {
			const cardWidth = cardRef.current?.offsetWidth || 350;
			const thresholdX = cardWidth * 0.4; // 40% threshold of card width

			// 1. Rubber Banding: Apply high non-linear resistance to active horizontal drag.
			// Moves MUCH slower than actual finger distance.
			const resistanceX = Math.sign(diffX) * Math.pow(Math.abs(diffX), 0.7) * 0.85;

			const dir = resistanceX > 0 ? 'right' : (resistanceX < 0 ? 'left' : null);
			if (dir !== swipeDir) {
				setSwipeDir(dir);
			}

			// Update motion transform position directly
			controls.set({ x: resistanceX });

			// Threshold haptic tick when finger distance reaches the threshold (thresholdX)
			if (Math.abs(diffX) >= thresholdX && !hasVibrated) {
				triggerHaptic('tick');
				setHasVibrated(true);
			} else if (Math.abs(diffX) < thresholdX && hasVibrated) {
				setHasVibrated(false);
			}

			// 2. Threshold Override: instantly accelerate forward to 40% open state if finger crosses threshold
			if (Math.abs(diffX) >= thresholdX) {
				handleSnap(diffX > 0 ? thresholdX : -thresholdX);
				return;
			}

			if (e.cancelable) {
				e.preventDefault();
			}
		}
	};

	const handleTouchEnd = () => {
		if (!swipeGesturesEnabled || isSnappingRef.current || isDeleting) return;
		if (isSwiping) {
			// Cancel Phase: Snap back to 0% if released before the 40% threshold
			controls.start({
				x: 0,
				transition: { type: 'spring', stiffness: 400, damping: 30 }
			}).then(() => {
				setSwipeDir(null);
				setIsSwiping(false);
				setHasVibrated(false);
			});
		}
	};

	return (
		<div ref={cardRef} className="relative overflow-hidden rounded-2xl w-full">
			{swipeDir === 'right' && (
				<div className="absolute inset-0 bg-emerald-600 dark:bg-emerald-500 flex items-center justify-start pl-8 text-white rounded-2xl">
					<WhatsAppIcon />
				</div>
			)}
			{swipeDir === 'left' && (
				<div className="absolute inset-0 bg-rose-600 flex items-center justify-end pr-8 text-white rounded-2xl">
					<Trash2 className="w-7 h-7 text-white" />
				</div>
			)}
			<motion.div
				animate={controls}
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}
				onClick={onClick}
				className="w-full relative touch-pan-y"
			>
				{children}
			</motion.div>
		</div>
	);
};


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
 editTransaction?: (transactionId: string, newType: 'due' | 'payment', newAmount: number, newDescription: string) => Promise<void>;
 deleteTransaction?: (transactionId: string) => Promise<void>;
 deleteCustomer: (id: string) => Promise<void>;
 selectedCustomerId: string | null;
 setSelectedCustomerId: (id: string | null) => void;
 lang: Language;
 triggerConfirm?: (title: string, message: string, onConfirm: () => void) => void;
  swipeGesturesEnabled?: boolean;
  highlightedTxId?: string | null;
  setHighlightedTxId?: (id: string | null) => void;
  hasMoreTxs: boolean;
  loadMoreTransactions: () => void;
}

export default function CustomerManager({
 customers,
 transactions,
 createCustomer,
 addTransaction,
 updateCustomerDetails,
 editTransaction,
 deleteTransaction,
 deleteCustomer,
 selectedCustomerId,
 setSelectedCustomerId,
 lang,
 triggerConfirm
,
  swipeGesturesEnabled = true
, highlightedTxId = null, setHighlightedTxId = () => {}, hasMoreTxs, loadMoreTransactions}: CustomerManagerProps) {
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

 const [filterStatus, setFilterStatus] = useState<'all' | 'due' | 'settled' | 'overpaid'>('all');

 // Editing state for customer details
 const [isEditingCustomer, setIsEditingCustomer] = useState(false);
 const [editName, setEditName] = useState('');
 const [editPhone, setEditPhone] = useState('');
 const [editError, setEditError] = useState('');
 const [isSavingEdit, setIsSavingEdit] = useState(false);

 // Selected message template for reminder alerts
 const [selectedTemplate, setSelectedTemplate] = useState<1 | 2 | 3>(1);

 // Transaction Edit/Delete Modal states
 const [editingTx, setEditingTx] = useState<Transaction | null>(null);
 const [editTxAmount, setEditTxAmount] = useState('');
 const [editTxDesc, setEditTxDesc] = useState('');
 const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [ledgerLimit, setLedgerLimit] = useState(5);

    const [duplicateTxWarning, setDuplicateTxWarning] = useState<Transaction | null>(null);
  const [hasShownDuplicateWarning, setHasShownDuplicateWarning] = useState(false);

  React.useEffect(() => {
    setLedgerLimit(5);
    setDuplicateTxWarning(null);
    setHasShownDuplicateWarning(false);
  }, [selectedCustomerId]);

  React.useEffect(() => {
    setDuplicateTxWarning(null);
    setHasShownDuplicateWarning(false);
  }, [openActionType]);

  // Disable background scrolling when any modal popup is active
  React.useEffect(() => {
    if (deletingCustomer || editingTx || deletingTx || duplicateTxWarning) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [deletingCustomer, editingTx, deletingTx, duplicateTxWarning]);

   // Handle history for modals (mobile back gesture)
  React.useEffect(() => {
    const handlePopState = () => {
      if (editingTx || deletingTx || deletingCustomer || duplicateTxWarning) {
        setEditingTx(null);
        setDeletingTx(null);
        setDeletingCustomer(null);
        setDuplicateTxWarning(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [editingTx, deletingTx, deletingCustomer, duplicateTxWarning]);

  // Smooth scroll and highlight effect for target transaction
  React.useEffect(() => {
    if (highlightedTxId) {
      const element = document.getElementById(`tx-row-${highlightedTxId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const timer = setTimeout(() => {
          if (setHighlightedTxId) {
            setHighlightedTxId(null);
          }
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [highlightedTxId, selectedCustomerId]);

  const getDuplicate = (actionType: 'due' | 'payment', amountStr: string) => {
    if (!selectedCustomerId || !amountStr) return null;
    const cleaned = amountStr.replace(/,/g, '');
    const amountVal = parseFloat(cleaned);
    if (isNaN(amountVal) || amountVal <= 0) return null;

    const customerTxs = transactions
      .filter(t => t.customerId === selectedCustomerId)
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(a.date);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(b.date);
        return dateB.getTime() - dateA.getTime();
      });
    const last5 = customerTxs.slice(0, 5);
    const now = Date.now();
    return last5.find(t => {
      const tDate = t.createdAt ? new Date(t.createdAt) : new Date(t.date);
      return t.type === actionType && 
             Math.abs(t.amount - amountVal) < 0.01 && 
             (now - tDate.getTime()) < 24 * 60 * 60 * 1000;
    }) || null;
  };

 const openEditTxModal = (tx: Transaction) => {
   setEditingTx(tx);
   setEditTxAmount(tx.amount.toString());
   setEditTxDesc(tx.description || '');
   window.history.pushState({ modal: 'editTx' }, '');
 };

 const openDeleteTxModal = (tx: Transaction) => {
   setDeletingTx(tx);
   window.history.pushState({ modal: 'deleteTx' }, '');
 };

 const closeTxModals = () => {
   if (window.history.state?.modal === 'editTx' || window.history.state?.modal === 'deleteTx') {
     window.history.back(); // This triggers popstate, which sets states to null
   } else {
     setEditingTx(null);
     setDeletingTx(null);
   }
 };


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
 if (filterStatus === 'overpaid') {
 return c.outstandingDue < 0;
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
 toast.success(lang === 'bn' ? 'গ্রাহক তৈরি সম্পন্ন হয়েছে' : 'Customer created successfully');
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
    await executeInlineTransaction(false);
  };

  const executeInlineTransaction = async (bypassDuplicateCheck = false) => {
    if (!selectedCustomerId || !openActionType) return;
    const cleaned = actionAmount.replace(/,/g, '');
    const amountVal = parseFloat(cleaned);
    if (!amountVal || amountVal <= 0) return;

    if (!bypassDuplicateCheck && !hasShownDuplicateWarning) {
      const duplicate = getDuplicate(openActionType, actionAmount);
      if (duplicate) {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        setDuplicateTxWarning(duplicate);
        return;
      }
    }

    setTxSubmitting(true);
    try {
      await Promise.all([
        addTransaction(selectedCustomerId, openActionType, amountVal, actionDesc),
        new Promise(resolve => setTimeout(resolve, 600))
      ]);
      setActionAmount('');
      setActionDesc('');
      setOpenActionType(null);
      setDuplicateTxWarning(null);
      setHasShownDuplicateWarning(false);
      toast.success(lang === 'bn' ? 'হিসাব সফলভাবে যোগ হয়েছে' : 'Transaction added successfully');
    } catch (err) {
      console.error(err);
    } finally {
      setTxSubmitting(false);
    }
  };

  const handleDelete = (c: Customer) => {
    window.history.pushState({ modal: 'deleteCustomer' }, '');
    setDeletingCustomer(c);
  };

 // Generate message text based on selected template index
  const getMessageText = (c: Customer, templateIdx: number) => {
    if (lang === 'bn') {
      if (templateIdx === 1) {
        return `আসসালামু আলাইকুম ${c.name}। আপনার কাছে আমাদের বকেয়া পাওনা ৳${formatNumber(c.outstandingDue, 'bn')}। সম্ভব হলে অনুগ্রহ করে দ্রুত পরিশোধ করুন। ধন্যবাদ!`;
      } else if (templateIdx === 2) {
        return `আসসালামু আলাইকুম ${c.name}। আশা করি ভালো আছেন। আপনার বকেয়া হিসাব ৳${formatNumber(c.outstandingDue, 'bn')} পরিশোধ বা সমন্বয় করার অনুরোধ রইল। ধন্যবাদ!`;
      } else {
        return `প্রিয় ${c.name}। আপনার মোট বকেয়া পাওনা ৳${formatNumber(c.outstandingDue, 'bn')}। অনুগ্রহ করে দ্রুত পরিশোধ করার জন্য অনুরোধ করা হলো। ধন্যবাদ!`;
      }
    } else {
      if (templateIdx === 1) {
        return `Hi ${c.name}, a friendly reminder that your outstanding balance is ৳${formatNumber(c.outstandingDue, 'en')}. Please clear it at your earliest convenience. Thanks!`;
      } else if (templateIdx === 2) {
        return `Hi ${c.name}, hope you are doing well. According to our ledger, your outstanding due is ৳${formatNumber(c.outstandingDue, 'en')}. Kindly settle this balance. Thanks!`;
      } else {
        return `Dear ${c.name}, your total outstanding due is ৳${formatNumber(c.outstandingDue, 'en')}. We request you to clear it as soon as possible. Thank you!`;
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
 onClick={() => {
 triggerHaptic('single');
 setShowAddForm(!showAddForm);
 }}
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
 transition={{ duration: 0.2, ease: "easeInOut" }}
 onSubmit={handleCreateCustomer}
 className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-md overflow-hidden"
 >
 <div className="p-5 space-y-4">
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

 {formError && (
    <div className="text-rose-500 text-sm font-semibold flex items-center gap-1.5">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
      <span>{formError}</span>
    </div>
  )}

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
 ? 'bg-rose-600 text-white shadow-md'
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
 ? 'bg-emerald-600 text-white shadow-md'
 : 'bg-white text-emerald-650 border border-emerald-500 dark:bg-zinc-900 dark:border-emerald-950/40 dark:text-emerald-400'
 }`}
 >
 {lang === 'bn' ? 'পরিশোধিত/০ টাকা' : 'Settled (৳0)'} ({formatNumber(customers.filter(c => c.outstandingDue === 0).length, lang)})
 </button>
 <button
 type="button"
 onClick={() => setFilterStatus('overpaid')}
 className={`px-4 py-2.5 rounded-xl font-bold transition-colors shrink-0 cursor-pointer ${
 filterStatus === 'overpaid'
 ? 'bg-cyan-600 text-white shadow-md'
 : 'bg-white text-cyan-650 border border-cyan-500 dark:bg-zinc-900 dark:border-cyan-950/40 dark:text-cyan-400'
 }`}
 >
 {lang === 'bn' ? 'অতিরিক্ত জমা' : 'Overpaid'} ({formatNumber(customers.filter(c => c.outstandingDue < 0).length, lang)})
 </button>
 </div>

 {/* Customer list database */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 {filteredCustomers.map(c => (
		<SwipeableCustomerItem
			key={c.id}
			customer={c}
			lang={lang}
			onClick={() => setSelectedCustomerId(selectedCustomerId === c.id ? null : c.id)}
			isSelected={selectedCustomerId === c.id}
			swipeGesturesEnabled={swipeGesturesEnabled}
			isDeleting={deletingCustomer?.id === c.id}
			onWhatsApp={() => {
				triggerHaptic('single');
				window.open(getShareLink(c, 'whatsapp'), '_blank');
			}}
			onDelete={() => {
				triggerHaptic('double');
				handleDelete(c);
			}}
		>
			<div
				className={`bg-white dark:bg-zinc-900 border p-5 rounded-2xl shadow-md hover:shadow-md transition-all cursor-pointer flex items-center justify-between group ${
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
							? 'text-rose-600 dark:text-rose-455' 
							: c.outstandingDue < 0 
								? 'text-cyan-600 dark:text-cyan-400' 
								: 'text-zinc-400 dark:text-zinc-500'
					}`}>
						৳ {formatNumber(c.outstandingDue || 0, lang)}
					</div>
				</div>
			</div>
		</SwipeableCustomerItem>
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
  setLedgerLimit(5);
  }}
  className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-bold text-zinc-700 dark:text-zinc-200 rounded-full cursor-pointer transition-colors"
 id="back_to_list_btn"
 >
 <ArrowLeft className="w-5 h-5" />
 {t.backToList}
 </button>

 {/* Customer Profile card */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-6 shadow-md dark:shadow-md dark:shadow-black/10 space-y-6 relative overflow-hidden">
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
 className="absolute right-4 top-4 p-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-full transition-all cursor-pointer z-25 flex items-center justify-center shadow-md"
 title={lang === 'bn' ? 'তথ্য পরিবর্তন করুন' : 'Edit Customer Info'}
 >
 <Pencil className="w-4 h-4" />
 </button>
 )}

 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10 pt-2">
 {isEditingCustomer ? (
 <div className="flex-1 space-y-3 max-w-sm">
 <div>
 <label className="block text-2xs font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">
 {lang === 'bn' ? 'গ্রাহকের নাম' : 'Customer Name'}
 </label>
 <input
 type="text"
 value={editName}
 onChange={(e) => setEditName(e.target.value)}
 className="w-full px-3 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 text-base font-extrabold"
 placeholder={lang === 'bn' ? 'নাম লিখুন' : 'Enter name'}
 required
 />
 </div>
 <div>
 <label className="block text-2xs font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">
 {lang === 'bn' ? 'মোবাইল নম্বর' : 'Mobile Number'}
 </label>
 <input
 type="text"
 value={editPhone}
 onChange={(e) => setEditPhone(e.target.value)}
 className="w-full px-3 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 text-base font-extrabold"
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
 toast.success(lang === 'bn' ? 'তথ্য আপডেট করা হয়েছে' : 'Profile updated');
     } catch (err) {
      if (err && (err as any).message === 'DUPLICATE_NAME') {
        setEditError(lang === 'bn' ? 'এই নামের গ্রাহক ইতিমধ্যে খতিয়ানে সংরক্ষিত আছে।' : 'A customer with this name already exists.');
      } else {
        setEditError(lang === 'bn' ? 'সংরক্ষণ করতে ব্যর্থ হয়েছে' : 'Failed to save changes');
      }
    } finally {
 setIsSavingEdit(false);
 }
 }}
 className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-zinc-950 font-bold text-sm rounded-lg transition-colors cursor-pointer"
 >
 {isSavingEdit ? (lang === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...') : (lang === 'bn' ? 'সংরক্ষণ করুন' : 'Save')}
 </button>
 <button
 type="button"
 disabled={isSavingEdit}
 onClick={() => setIsEditingCustomer(false)}
 className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-sm rounded-lg transition-colors cursor-pointer"
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
  <details className="bg-zinc-50 dark:bg-zinc-950 px-4 pt-[18px] pb-[6px] open:pb-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3 relative z-10 group [&_summary::-webkit-details-marker]:hidden">
 <summary className="text-xs font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wide flex items-center justify-between cursor-pointer list-none select-none">
      <div className="flex items-center gap-2">
 <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
 {t.predefinedMessages}
      </div>
      <ChevronDown className="w-4 h-4 transition-transform group-open:-rotate-180" />
    </summary>
    <div className="pt-3">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
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
  </details>
 )}

 {/* SEND REMINDERS / ACTIONS FOR DAD */}
 <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap gap-3">
 {selectedCustomer.phone && selectedCustomer.outstandingDue > 0 && (
 <>
 <a
 href={getShareLink(selectedCustomer, 'whatsapp')}
 target="_blank"
 rel="noreferrer"
 className="flex-1 min-w-[170px] py-3.5 px-4 bg-[#25D366] hover:bg-[#20ba59] font-black text-white rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer text-sm"
 >
 <MessageSquare className="w-5 h-5" />
 {t.remindWhatsApp}
 </a>

 <a
 href={getShareLink(selectedCustomer, 'sms')}
 className="flex-1 min-w-[170px] py-3.5 px-4 bg-blue-600 hover:bg-blue-700 font-black text-white rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer text-sm"
 >
 <Send className="w-4 h-4" />
 {t.sendSmsReminder}
 </a>
 </>
 )}
 
 {/* DELETE ACCOUNT BUTTON */}
 <button
              onClick={() => {
                triggerHaptic('double');
                handleDelete(selectedCustomer);
              }}
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
 className={`py-5 px-4 rounded-2xl border-3 flex flex-col items-center justify-center gap-2 shadow-md cursor-pointer transition-all ${
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
 className={`py-5 px-4 rounded-2xl border-3 flex flex-col items-center justify-center gap-2 shadow-md cursor-pointer transition-all ${
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

              {openActionType && !txSubmitting && getDuplicate(openActionType, actionAmount) && (
                <p className="text-xs font-bold text-amber-600 dark:text-amber-500 mt-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {t.duplicateRealtimeWarning}
                </p>
              )}

              {openActionType === 'payment' && selectedCustomer && selectedCustomer.outstandingDue > 0 && (
                <div className="flex items-center gap-2 mt-2.5 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <input
                    type="checkbox"
                    id="payFullDueInline"
                    className="w-4 h-4 text-emerald-600 rounded border-zinc-300 focus:ring-emerald-500 cursor-pointer"
                    checked={actionAmount.replace(/,/g, '') === selectedCustomer.outstandingDue.toString()}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setActionAmount(formatIndianNumberString(selectedCustomer.outstandingDue.toString()));
                      } else {
                        setActionAmount('');
                      }
                    }}
                  />
                  <label htmlFor="payFullDueInline" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
                    {lang === 'bn' ? 'সম্পূর্ণ বকেয়া পরিশোধ করুন' : 'Settle complete due'} (৳{formatNumber(selectedCustomer.outstandingDue, lang)})
                  </label>
                </div>
              )}

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
  <div id="statements_timeline" className="space-y-3">
 <span className="text-xs font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">
 {t.statements} ({formatNumber(selectedCustomerTransactions.length, lang)})
 </span>

 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-md">
 {selectedCustomerTransactions.length === 0 ? (
 <div className="p-8 text-center text-zinc-400 dark:text-zinc-500 flex flex-col items-center gap-2">
 <ReceiptText className="w-10 h-10 stroke-[1.5]" />
 <p className="font-bold text-zinc-700 dark:text-zinc-350">{t.noHistory}</p>
 <p className="text-xs text-zinc-400">{t.duesVisibleHere}</p>
 </div>
 ) : (
 <div className="divide-y divide-zinc-100 dark:divide-zinc-850">
 {selectedCustomerTransactions.slice(0, ledgerLimit).map(tx => (
 <div 
   key={tx.id} 
   id={`tx-row-${tx.id}`}
   className={`p-4 flex flex-col hover:bg-zinc-50/50 dark:hover:bg-zinc-850/50 transition-all duration-500 group cursor-default ${
     highlightedTxId === tx.id 
       ? 'ring-4 ring-inset ring-amber-500/80 dark:ring-amber-400/80 bg-amber-50 dark:bg-amber-950/40 rounded-2xl' 
       : ''
   }`}
   >
  <div className="flex items-center justify-between">
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

  <div className="flex flex-col items-end shrink-0">
  <div className={`text-base sm:text-lg font-black ${
  tx.type === 'due' ? 'text-rose-600 dark:text-rose-450' : 'text-emerald-600 dark:text-emerald-400'
  }`}>
  {tx.type === 'due' ? '+' : '-'} ৳ {formatNumber(tx.amount, lang)}
  </div>
  <div className="flex items-center gap-2 mt-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
    <button 
      onClick={(e) => {
        e.stopPropagation();
        triggerHaptic('single');
        openEditTxModal(tx);
      }}
      className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
      title={lang === 'bn' ? 'পরিবর্তন' : 'Edit'}
    >
      <Pencil className="w-4 h-4" />
    </button>
    <button 
      onClick={(e) => {
        e.stopPropagation();
        triggerHaptic('double');
        openDeleteTxModal(tx);
      }}
      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
      title={lang === 'bn' ? 'মুছুন' : 'Delete'}
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
  </div>
  </div>
 </div>
 ))}

  {selectedCustomerTransactions.length > 5 && (
    <div className="p-4 text-center flex justify-center gap-3">
      {(ledgerLimit < selectedCustomerTransactions.length || (selectedCustomerTransactions.length % 150 === 0 && hasMoreTxs)) && (
        <button 
          type="button"
          onClick={() => {
            triggerHaptic('single');
            setLedgerLimit(prev => {
              const newLimit = prev + 20;
              if (newLimit > selectedCustomerTransactions.length && hasMoreTxs) {
                loadMoreTransactions();
              }
              return newLimit;
            });
          }}
          className="flex items-center gap-1 px-5 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-full transition-colors cursor-pointer"
        >
          {lang === 'bn' ? 'আরও দেখুন' : 'Show More'}
          <ChevronDown className="w-4 h-4" />
        </button>
      )}
      {ledgerLimit > 5 && (
        <button 
          type="button"
          onClick={() => {
            triggerHaptic('single');
            setLedgerLimit(5);
          }}
          className="flex items-center gap-1 px-5 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-full transition-colors cursor-pointer"
        >
          {lang === 'bn' ? 'কম দেখুন' : 'Show Less'}
          <ChevronUp className="w-4 h-4" />
        </button>
      )}
    </div>
  )}
 </div>
 )}
 </div>
 </div>
 
 </motion.div>
 )}

 {/* Edit Transaction Modal */}
  {editingTx && (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="bg-white dark:bg-zinc-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white">
            {lang === 'bn' ? 'লেনদেন পরিবর্তন' : 'Edit Transaction'}
          </h3>
          <button onClick={closeTxModals} className="p-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full cursor-pointer">
            <X className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
          </button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-500 uppercase">{t.amount} (৳)</label>
            <input
              type="text"
              inputMode="decimal"
              value={editTxAmount}
              onChange={(e) => {
                const clean = e.target.value.replace(/[^0-9.]/g, '');
                setEditTxAmount(clean);
              }}
              className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white text-lg font-bold focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-500 uppercase">{t.notes}</label>
            <input
              type="text"
              value={editTxDesc}
              onChange={(e) => setEditTxDesc(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-white text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={() => {
              const newAmount = parseFloat(editTxAmount.replace(/,/g, ''));
              if (newAmount > 0 && editTransaction) {
                editTransaction(editingTx.id, editingTx.type, newAmount, editTxDesc);
                closeTxModals();
              }
            }}
            className="w-full py-4 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl cursor-pointer"
          >
            {lang === 'bn' ? 'সংরক্ষণ করুন' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>
  )}

 {/* Delete Transaction Modal */}
  {deletingTx && (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="bg-white dark:bg-zinc-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
      >
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-8 h-8 text-rose-600 dark:text-rose-500" />
          </div>
          <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white mb-2">
            {lang === 'bn' ? 'হিসাব মুছুন' : 'Delete Transaction'}
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {lang === 'bn' ? 'আপনি কি নিশ্চিত এই লেনদেন মুছে ফেলতে চান?' : 'Are you sure you want to delete this transaction?'}
          </p>
          
          {/* Details Card showing what is being deleted */}
          <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-left space-y-2.5 mt-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'ধরন' : 'Type'}</span>
              <span className={`text-xs font-black px-2.5 py-1 rounded-full uppercase ${
                deletingTx.type === 'due' 
                  ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400' 
                  : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450'
              }`}>
                {deletingTx.type === 'due' ? (lang === 'bn' ? 'বকেয়া (+)' : 'Due (+)') : (lang === 'bn' ? 'আদায় (-)' : 'Payment (-)')}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'পরিমাণ' : 'Amount'}</span>
              <span className={`text-base font-black ${
                deletingTx.type === 'due' ? 'text-rose-600 dark:text-rose-450' : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                ৳ {formatNumber(deletingTx.amount, lang)}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'তারিখ' : 'Date'}</span>
              <span className="text-xs font-bold text-zinc-750 dark:text-zinc-300">
                {new Date(deletingTx.date).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', { dateStyle: 'medium' })}
              </span>
            </div>
            {deletingTx.description && (
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-between items-start gap-4">
                <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase shrink-0">{lang === 'bn' ? 'বিবরণ' : 'Notes'}</span>
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 text-right truncate max-w-[200px]">{deletingTx.description}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              if (deleteTransaction) {
                deleteTransaction(deletingTx.id);
                closeTxModals();
              }
            }}
            className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl cursor-pointer"
          >
            {lang === 'bn' ? 'হ্যাঁ, মুছুন' : 'Yes, Delete'}
          </button>
          <button
            onClick={closeTxModals}
            className="w-full py-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 font-bold rounded-xl cursor-pointer"
          >
            {lang === 'bn' ? 'বাতিল' : 'Cancel'}
          </button>
        </div>
      </motion.div>
    </div>
  )}


  {/* Delete Customer Account Modal (Red-themed warning modal) */}
  {deletingCustomer && (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-zinc-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
      >
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-rose-600 dark:text-rose-500" />
          </div>
          <h3 className="text-lg font-black text-rose-600 dark:text-rose-455 mb-2">
            {lang === 'bn' ? 'গ্রাহক অ্যাকাউন্ট ট্র্যাশে সরান' : 'Move Customer to Trash'}
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {lang === 'bn' 
              ? 'আপনি কি নিশ্চিত এই গ্রাহকের সম্পূর্ণ অ্যাকাউন্ট ট্র্যাশে স্থানান্তর করতে চান? এটি ৭ দিন পর স্থায়ীভাবে মুছে যাবে।' 
              : 'Are you sure you want to move this customer account to the trash? It will be permanently deleted after 7 days.'}
          </p>
          
          {/* Details Card showing customer name, phone, and outstanding balance */}
          <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-left space-y-2.5 mt-4">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'নাম' : 'Name'}</span>
              <span className="text-sm font-extrabold text-zinc-850 dark:text-zinc-150 truncate max-w-[200px]">{deletingCustomer.name}</span>
            </div>
            {deletingCustomer.phone && (
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'মোবাইল' : 'Mobile'}</span>
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{deletingCustomer.phone}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{lang === 'bn' ? 'বর্তমান ব্যালেন্স' : 'Current Balance'}</span>
              <span className={`text-sm font-black ${
                deletingCustomer.outstandingDue > 0 
                  ? 'text-rose-600 dark:text-rose-455' 
                  : deletingCustomer.outstandingDue < 0 
                  ? 'text-cyan-600 dark:text-cyan-400' 
                  : 'text-zinc-500'
              }`}>
                {deletingCustomer.outstandingDue === 0 ? (lang === 'bn' ? 'পরিশোধিত' : 'Settled') : `৳ ${formatNumber(deletingCustomer.outstandingDue, lang)}`}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={async () => {
              const id = deletingCustomer.id;
              setDeletingCustomer(null);
              if (window.history.state?.modal === 'deleteCustomer') {
                window.history.back();
              }
              await deleteCustomer(id);
              setSelectedCustomerId(null);
              toast.info(lang === 'bn' ? 'গ্রাহক ট্র্যাশে স্থানান্তরিত হয়েছে' : 'Customer account moved to trash');
            }}
            className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl cursor-pointer"
          >
            {lang === 'bn' ? 'হ্যাঁ, ট্র্যাশে পাঠান' : 'Yes, Trash'}
          </button>
          <button
            onClick={() => {
              setDeletingCustomer(null);
              if (window.history.state?.modal === 'deleteCustomer') {
                window.history.back();
              }
            }}
            className="w-full py-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 font-bold rounded-xl cursor-pointer"
          >
            {lang === 'bn' ? 'বাতিল' : 'Cancel'}
          </button>
        </div>
      </motion.div>
    </div>
  )}
  {/* Duplicate Entry Warning Modal */}
  {duplicateTxWarning && (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-zinc-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
      >
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-500" />
          </div>
          <h3 className="text-lg font-black text-amber-600 dark:text-amber-500 mb-2">
            {t.duplicateWarningTitle}
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t.duplicateWarningDesc}
          </p>
          
          {/* Details Card */}
          <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-left space-y-2.5 mt-4">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{t.type}</span>
              <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                duplicateTxWarning.type === 'due' 
                  ? 'bg-rose-100 text-rose-600 dark:bg-rose-955/40 dark:text-rose-400' 
                  : 'bg-cyan-100 text-cyan-600 dark:bg-cyan-955/40 dark:text-cyan-400'
              }`}>
                {duplicateTxWarning.type === 'due' ? t.duePlus : t.paymentMinus}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">{t.amount}</span>
              <span className={`text-sm font-black ${
                duplicateTxWarning.type === 'due' ? 'text-rose-600 dark:text-rose-505' : 'text-cyan-600 dark:text-cyan-400'
              }`}>
                ৳ {formatNumber(duplicateTxWarning.amount, lang)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              if (setHighlightedTxId) {
                setHighlightedTxId(duplicateTxWarning.id);
              }
              setDuplicateTxWarning(null);
            }}
            className="w-full py-4 bg-zinc-900 hover:bg-zinc-850 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-bold rounded-xl cursor-pointer text-center"
          >
            {t.viewExistingEntry}
          </button>
          <button
            type="button"
            onClick={async () => {
              setHasShownDuplicateWarning(true);
              setDuplicateTxWarning(null);
              await executeInlineTransaction(true);
            }}
            className="w-full py-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 font-bold rounded-xl cursor-pointer"
          >
            {t.addAnyway}
          </button>
          <button
            type="button"
            onClick={() => {
              setDuplicateTxWarning(null);
            }}
            className="w-full py-4 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-bold rounded-xl cursor-pointer"
          >
            {t.cancel}
          </button>
        </div>
      </motion.div>
    </div>
  )}
 </div>
 );
}
