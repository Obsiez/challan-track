import { useState, useEffect, useRef, useMemo } from 'react';
import { 
 collection, 
 doc, 
 setDoc,
 updateDoc, 
 deleteDoc, 
 onSnapshot, 
 query, 
 orderBy, 
 increment, 
 serverTimestamp,
 writeBatch,
 limit,
 where,
 getCountFromServer,
 getDocs
} from 'firebase/firestore';
import { db, auth, OperationType } from '../firebase';
import { Customer, Transaction, Reminder, UserSettings, SavingGoal, GoalContribution } from '../types';
import { cleanBangladeshiPhone } from '../lib/phoneUtils';

export function useLedger(
  userId: string | undefined, 
  selectedDailyDate?: Date,
  activeCustomerId?: string | null
) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [trashCustomers, setTrashCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customerTransactions, setCustomerTransactions] = useState<Transaction[]>([]);
  const [allCustomerTxs, setAllCustomerTxs] = useState<Transaction[]>([]);
  const [archiveTransactions, setArchiveTransactions] = useState<Transaction[]>([]);
    const [monthlySummaries, setMonthlySummaries] = useState<any[]>([]);

  // Robust date parser to handle Firestore plain-serialized, timestamp and Date formats safely
  const parseTxDate = (dateField: any): Date => {
    if (!dateField) return new Date();
    if (dateField instanceof Date) return dateField;
    if (typeof dateField.toDate === 'function') return dateField.toDate();
    if (typeof dateField.seconds === 'number') return new Date(dateField.seconds * 1000);
    const parsed = new Date(dateField);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  // Atomically adjust monthly summaries state locally for instant offline sync
  const adjustLocalMonthlySummaries = (
    oldTx: Transaction | null,
    newTx: Transaction | null
  ) => {
    const getTxMonthKey = (tx: Transaction) => {
      const d = parseTxDate(tx.date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const targetMonth = newTx ? getTxMonthKey(newTx) : (oldTx ? getTxMonthKey(oldTx) : null);
    if (!targetMonth) return;

    setMonthlySummaries(prev => {
      const list = [...prev];
      let summary = list.find(s => s.id === targetMonth);
      if (!summary) {
        summary = {
          id: targetMonth,
          dues: 0,
          payments: 0,
          count: 0,
          customerPayments: {}
        };
        list.push(summary);
      }

      if (oldTx) {
        summary.count = Math.max(0, (summary.count || 0) - 1);
        if (oldTx.type === 'due') {
          summary.dues = (summary.dues || 0) - oldTx.amount;
        } else {
          summary.payments = (summary.payments || 0) - oldTx.amount;
          if (summary.customerPayments && summary.customerPayments[oldTx.customerId]) {
            summary.customerPayments[oldTx.customerId].total = Math.max(
              0,
              (summary.customerPayments[oldTx.customerId].total || 0) - oldTx.amount
            );
          }
        }
      }

      if (newTx) {
        summary.count = (summary.count || 0) + 1;
        if (newTx.type === 'due') {
          summary.dues = (summary.dues || 0) + newTx.amount;
        } else {
          summary.payments = (summary.payments || 0) + newTx.amount;
          if (!summary.customerPayments) summary.customerPayments = {};
          if (!summary.customerPayments[newTx.customerId]) {
            summary.customerPayments[newTx.customerId] = {
              name: newTx.customerName || 'Unknown',
              total: 0
            };
          }
          summary.customerPayments[newTx.customerId].total = (summary.customerPayments[newTx.customerId].total || 0) + newTx.amount;
        }
      }

      const filteredList = list.filter(s => s.count > 0);
      localStorage.setItem(`easy_due_monthly_summaries_${userId}`, JSON.stringify(filteredList));
      return filteredList;
    });
  };
  const [activeCustomerTxCount, setActiveCustomerTxCount] = useState<number>(0);

  // Sync count of total transactions for the selected customer
  useEffect(() => {
    if (!userId || !activeCustomerId) {
      setActiveCustomerTxCount(0);
      return;
    }
    if (userId === 'local-guest-session') {
      try {
        const stored = localStorage.getItem(`easy_due_transactions_${userId}`);
        if (stored) {
          const count = JSON.parse(stored).filter((t: any) => t.customerId === activeCustomerId).length;
          setActiveCustomerTxCount(count);
        }
      } catch (e) {
        console.warn(e);
      }
      return;
    }
    
    const fetchCount = async () => {
      try {
        const txRef = collection(db, 'users', userId, 'transactions');
        const q = query(txRef, where('customerId', '==', activeCustomerId));
        const snap = await getCountFromServer(q);
        setActiveCustomerTxCount(snap.data().count);
      } catch (err) {
        console.warn("Failed to fetch customer tx count:", err);
      }
    };
    
    fetchCount();
  }, [userId, activeCustomerId]);

  const [goals, setGoals] = useState<SavingGoal[]>([]);
  const [goalsSynced, setGoalsSynced] = useState(false);

  const saveLocalGoals = (list: SavingGoal[]) => {
    localStorage.setItem(`easy_due_goals_${userId}`, JSON.stringify(list));
  };
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [customersSynced, setCustomersSynced] = useState(false);
  const [transactionsSynced, setTransactionsSynced] = useState(false);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);
  const [customerTxLimit, setCustomerTxLimit] = useState(5);

const lastSubmitRef = useRef<{
   timestamp: number;
   customerId: string;
   type: 'due' | 'payment';
   amount: number;
 } | null>(null);

 // Helper: Load all ledger data from local storage
 const loadLocalData = () => {
 if (!userId) return;
 try {
 const storedCustomers = localStorage.getItem(`easy_due_customers_${userId}`);
 const storedTxs = localStorage.getItem(`easy_due_transactions_${userId}`);
 const storedReminders = localStorage.getItem(`easy_due_reminders_${userId}`);
 const storedSettings = localStorage.getItem(`easy_due_settings_${userId}`);
      const storedSummaries = localStorage.getItem(`easy_due_monthly_summaries_${userId}`);
      const storedGoals = localStorage.getItem(`easy_due_goals_${userId}`);

 if (storedCustomers) {
 const parsed = JSON.parse(storedCustomers).map((c: any) => ({
 ...c,
 createdAt: new Date(c.createdAt),
 updatedAt: new Date(c.updatedAt),
 deletedAt: c.deletedAt ? new Date(c.deletedAt) : null
 }));
 setCustomers(parsed.filter((c: any) => !c.isDeleted));
 setTrashCustomers(parsed.filter((c: any) => c.isDeleted));
 } else {
 setCustomers([]);
 setTrashCustomers([]);
 }

 if (storedTxs) {
 setTransactions(JSON.parse(storedTxs).map((t: any) => ({
 ...t,
 date: new Date(t.date),
 createdAt: new Date(t.createdAt)
 })));
 } else {
 setTransactions([]);
 }

 if (storedReminders) {
 setReminders(JSON.parse(storedReminders).map((r: any) => ({
 ...r,
 dueDate: new Date(r.dueDate),
 createdAt: new Date(r.createdAt)
 })));
 } else {
 setReminders([]);
      }

      if (storedSummaries) {
        setMonthlySummaries(JSON.parse(storedSummaries));
      } else {
        setMonthlySummaries([]);
      }

      if (storedGoals) {
        setGoals(JSON.parse(storedGoals).map((g: any) => ({
          ...g,
          createdAt: new Date(g.createdAt),
          updatedAt: new Date(g.updatedAt)
        })));
      } else {
        setGoals([]);
      }

 if (storedSettings) {
        const parsed = JSON.parse(storedSettings);
        if (!parsed.theme || (parsed.theme !== 'light' && parsed.theme !== 'dark')) {
          parsed.theme = 'dark';
        }
        setSettings(parsed);
 } else {
        setSettings({
          uid: userId,
          email: auth.currentUser?.email || 'guest@challantrack.local',
          theme: 'dark',
          dailyReminderTime: '09:00',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
 }
 } catch (e) {
 console.warn("Failed to parse local stored ledger data:", e);
 }
 };

 // Local storage save operations
 const saveLocalCustomers = (list: Customer[]) => {
 localStorage.setItem(`easy_due_customers_${userId}`, JSON.stringify(list));
 };
 const saveLocalTransactions = (list: Transaction[]) => {
 localStorage.setItem(`easy_due_transactions_${userId}`, JSON.stringify(list));
 };
 const saveLocalReminders = (list: Reminder[]) => {
 localStorage.setItem(`easy_due_reminders_${userId}`, JSON.stringify(list));
 };
 const saveLocalSettings = (val: UserSettings) => {
 localStorage.setItem(`easy_due_settings_${userId}`, JSON.stringify(val));
 };

  // Load cache immediately on userId change to populate UI with 0ms delay, and set up sync timeout
  useEffect(() => {
    if (userId) {
      loadLocalData();
      setLoading(false);
      
      // Initialize sync tracking states
      setCustomersSynced(false);
      setTransactionsSynced(true);
      
      // If we are offline, mark synced immediately to skip waiting
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setCustomersSynced(true);
        setTransactionsSynced(true);
        return;
      }
      
      // Max wait time for server sync to complete (prevents long loader for slow internet)
      const timer = setTimeout(() => {
        setCustomersSynced(true);
        setTransactionsSynced(true);
      }, 1000);
      
      return () => clearTimeout(timer);
    } else {
      setCustomers([]);
      setTransactions([]);
      setReminders([]);
      setSettings(null);
      setCustomersSynced(true);
      setTransactionsSynced(true);
      setLoading(false);
    }
  }, [userId]);

 // 1. Sync User settings
 useEffect(() => {
 if (!userId) {
 setLoading(false);
 return;
 }

 if (userId === 'local-guest-session' || isOfflineFallback) {
 loadLocalData();
 setLoading(false);
 return;
 }

 const userDocRef = doc(db, 'users', userId);
 const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
 if (docSnap.exists()) {
        const data = docSnap.data() as UserSettings;
        if (!data.theme || (data.theme !== 'light' && data.theme !== 'dark')) {
          data.theme = 'dark';
        }
        setSettings(data);
        saveLocalSettings(data);
 } else {
        // Initialize default user settings if not exists (Dark mode default for new accounts)
        const defaultSettings: UserSettings = {
          uid: userId,
          email: auth.currentUser?.email || '',
          theme: 'dark',
          dailyReminderTime: '09:00',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setDoc(userDocRef, defaultSettings)
 .then(() => {
 setSettings(defaultSettings);
 saveLocalSettings(defaultSettings);
 })
 .catch(err => {
 console.warn("Firestore error creating user settings, using offline cache fallback:", err);
 loadLocalData();
 });
 }
 }, (error) => {
 console.warn("Firestore error loading user settings, using offline cache fallback:", error);
 loadLocalData();
 });

 return () => unsubscribe();
 }, [userId]);

 // 2. Sync Customers collection
 useEffect(() => {
 if (!userId) return;
 if (userId === 'local-guest-session') {
 return;
 }

 const customersRef = collection(db, 'users', userId, 'customers');
 const q = query(customersRef, orderBy('createdAt', 'desc'));

 const storedCustomers = localStorage.getItem(`easy_due_customers_${userId}`);
 const unsubscribe = onSnapshot(q, (snapshot) => {
   const list: Customer[] = [];
   snapshot.forEach((docSnap) => {
   const data = docSnap.data();
   list.push({
   ...data,
   id: docSnap.id,
   createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
   updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
   deletedAt: data.deletedAt?.toDate ? data.deletedAt.toDate() : (data.deletedAt ? new Date(data.deletedAt) : null)
   } as Customer);
   });
   setCustomers(list.filter(c => !c.isDeleted));
   setTrashCustomers(list.filter(c => c.isDeleted));
   saveLocalCustomers(list);
   if (!snapshot.metadata.fromCache) {
     setCustomersSynced(true);
   }
  }, (error) => {
  console.warn("Firestore error syncing customers list, using offline cache fallback:", error);
  loadLocalData();
  setCustomersSynced(true);
  });

 return () => unsubscribe();
 }, [userId]);

// 3. Sync Customer Transactions on-demand (Option A: Client-Side Sorting - No composite index required!)
  useEffect(() => {
    if (!userId || userId === 'local-guest-session' || isOfflineFallback) {
      return;
    }
    if (!activeCustomerId) {
      setAllCustomerTxs([]);
      setCustomerTransactions([]);
      return;
    }

    // Try loading immediately from local cache if available for instant display
    try {
      const cached = localStorage.getItem(`easy_due_txs_${userId}_${activeCustomerId}`);
      if (cached) {
        const parsed: Transaction[] = JSON.parse(cached).map((t: any) => ({
          ...t,
          date: parseTxDate(t.date),
          createdAt: parseTxDate(t.createdAt)
        }));
        setAllCustomerTxs(parsed);
      }
    } catch (e) {
      console.warn("Failed to load cached customer txs:", e);
    }

    const txRef = collection(db, 'users', userId, 'transactions');
    // Equality query only on 'customerId' - supported by default single-field index without requiring composite index!
    const q = query(
      txRef,
      where('customerId', '==', activeCustomerId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Transaction[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          ...data,
          id: docSnap.id,
          date: parseTxDate(data.date),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt).toISOString() : new Date()),
        } as Transaction);
      });

      // Client-side sort descending by date (newest first)
      list.sort((a, b) => {
        const dateA = parseTxDate(a.date).getTime();
        const dateB = parseTxDate(b.date).getTime();
        return dateB - dateA;
      });

      setAllCustomerTxs(list);
      setActiveCustomerTxCount(list.length);

      // Save to local cache for instant future loads
      try {
        localStorage.setItem(`easy_due_txs_${userId}_${activeCustomerId}`, JSON.stringify(list));
      } catch (e) {
        console.warn("Failed to cache customer txs:", e);
      }
    }, (error) => {
      console.warn("Firestore error syncing customer transactions:", error);
    });

    return () => unsubscribe();
  }, [userId, activeCustomerId, isOfflineFallback]);

  // 3a. Slice Customer Transactions according to pagination limit (for both cloud & guest sessions)
  useEffect(() => {
    if (!activeCustomerId) {
      setCustomerTransactions([]);
      return;
    }

    if (userId === 'local-guest-session' || isOfflineFallback) {
      const filtered = transactions
        .filter(t => t.customerId === activeCustomerId)
        .sort((a, b) => {
          const dateA = parseTxDate(a.date).getTime();
          const dateB = parseTxDate(b.date).getTime();
          return dateB - dateA;
        })
        .slice(0, customerTxLimit);
      setCustomerTransactions(filtered);
    } else {
      setCustomerTransactions(allCustomerTxs.slice(0, customerTxLimit));
    }
  }, [userId, isOfflineFallback, activeCustomerId, transactions, allCustomerTxs, customerTxLimit]);

// 3b. Sync Daily Archive Transactions (Option A: Instant local cache + windowed Firestore query)
  useEffect(() => {
    if (!userId || userId === 'local-guest-session' || isOfflineFallback || !selectedDailyDate) {
      setArchiveTransactions([]);
      return;
    }

    const dayKey = `${selectedDailyDate.getFullYear()}-${String(selectedDailyDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDailyDate.getDate()).padStart(2, '0')}`;

    // Try loading immediately from local cache if available for instant display
    try {
      const cached = localStorage.getItem(`easy_due_daily_${userId}_${dayKey}`);
      if (cached) {
        const parsed: Transaction[] = JSON.parse(cached).map((t: any) => ({
          ...t,
          date: parseTxDate(t.date),
          createdAt: parseTxDate(t.createdAt)
        }));
        setArchiveTransactions(parsed);
      }
    } catch (e) {
      console.warn("Failed to load cached daily txs:", e);
    }

    // Query firestore directly for the selected date range
    const startOfDay = new Date(selectedDailyDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDailyDate);
    endOfDay.setHours(23, 59, 59, 999);

    const txRef = collection(db, 'users', userId, 'transactions');
    const q = query(
      txRef,
      orderBy('date', 'desc'),
      where('date', '>=', startOfDay),
      where('date', '<=', endOfDay)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Transaction[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          ...data,
          id: docSnap.id,
          date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
        } as Transaction);
      });

      list.sort((a, b) => {
        const dateA = parseTxDate(a.date).getTime();
        const dateB = parseTxDate(b.date).getTime();
        return dateB - dateA;
      });

      setArchiveTransactions(list);

      // Save to local cache for instant future loads
      try {
        localStorage.setItem(`easy_due_daily_${userId}_${dayKey}`, JSON.stringify(list));
      } catch (e) {
        console.warn("Failed to cache daily txs:", e);
      }
    }, (error) => {
      console.warn("Firestore error syncing daily archive transactions:", error);
    });

    return () => unsubscribe();
  }, [userId, selectedDailyDate, isOfflineFallback]);

// Compute daily transactions dynamically based on date context
  const dailyTransactions = useMemo(() => {
    if (!selectedDailyDate) return [];
    
    const filterDateStr = selectedDailyDate.toDateString();
    const map = new Map<string, Transaction>();

    archiveTransactions.forEach(tx => {
      const d = parseTxDate(tx.date);
      if (d.toDateString() === filterDateStr) {
        map.set(tx.id, tx);
      }
    });

    transactions.forEach(tx => {
      const d = parseTxDate(tx.date);
      if (d.toDateString() === filterDateStr) {
        map.set(tx.id, tx);
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const dateA = parseTxDate(a.date).getTime();
      const dateB = parseTxDate(b.date).getTime();
      return dateB - dateA;
    });
  }, [transactions, selectedDailyDate, archiveTransactions]);

  const todayTransactions = useMemo(() => {
    const todayStr = new Date().toDateString();
    const map = new Map<string, Transaction>();

    archiveTransactions.forEach(tx => {
      const d = parseTxDate(tx.date);
      if (d.toDateString() === todayStr) {
        map.set(tx.id, tx);
      }
    });

    transactions.forEach(tx => {
      const d = parseTxDate(tx.date);
      if (d.toDateString() === todayStr) {
        map.set(tx.id, tx);
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const dateA = parseTxDate(a.date).getTime();
      const dateB = parseTxDate(b.date).getTime();
      return dateB - dateA;
    });
  }, [transactions, archiveTransactions]);

  // 3c. Sync Monthly Summaries (retention last 6 months)
  useEffect(() => {
    if (!userId || userId === 'local-guest-session' || isOfflineFallback) {
      return;
    }
    const summariesRef = collection(db, 'users', userId, 'monthly_summaries');
    const q = query(summariesRef, limit(12));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      list.sort((a, b) => b.id.localeCompare(a.id));
      setMonthlySummaries(list);
      localStorage.setItem(`easy_due_monthly_summaries_${userId}`, JSON.stringify(list));
    }, (error) => {
      console.warn("Firestore error syncing monthly summaries:", error);
    });

    return () => unsubscribe();
  }, [userId, isOfflineFallback]);

  const effectiveMonthlySummaries = useMemo(() => {
    if (monthlySummaries && monthlySummaries.length > 0) {
      return monthlySummaries;
    }
    const summaries: Record<string, any> = {};
    const allTxs = [...transactions, ...archiveTransactions];
    const seenIds = new Set<string>();

    allTxs.forEach(tx => {
      if (seenIds.has(tx.id)) return;
      seenIds.add(tx.id);

      const d = parseTxDate(tx.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!summaries[monthKey]) {
        summaries[monthKey] = {
          id: monthKey,
          dues: 0,
          payments: 0,
          count: 0,
          customerPayments: {}
        };
      }
      const s = summaries[monthKey];
      s.count++;
      if (tx.type === 'due') {
        s.dues += tx.amount;
      } else {
        s.payments += tx.amount;
        if (!s.customerPayments[tx.customerId]) {
          s.customerPayments[tx.customerId] = {
            name: tx.customerName || 'Unknown',
            total: 0
          };
        }
        s.customerPayments[tx.customerId].total += tx.amount;
      }
    });

    return Object.values(summaries).sort((a: any, b: any) => b.id.localeCompare(a.id));
  }, [monthlySummaries, transactions, archiveTransactions]);

// Sync Goals collection
  useEffect(() => {
    if (!userId) return;
    if (userId === 'local-guest-session') {
      return;
    }

    const goalsRef = collection(db, 'users', userId, 'goals');
    const q = query(goalsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: SavingGoal[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          ...data,
          id: docSnap.id,
          savedAmount: Number(data.savedAmount) || 0,
          targetAmount: Number(data.targetAmount) || 0,
          installmentAmount: data.installmentAmount ? Number(data.installmentAmount) : undefined,
          contributions: Array.isArray(data.contributions) ? data.contributions : [],
          status: data.status || 'active',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt)
        } as SavingGoal);
      });
      setGoals(list);
      saveLocalGoals(list);
      setGoalsSynced(true);
    }, (error) => {
      console.warn("Firestore error syncing goals, using offline cache fallback:", error);
      try {
        const stored = localStorage.getItem(`easy_due_goals_${userId}`);
        if (stored) {
          setGoals(JSON.parse(stored).map((g: any) => ({
            ...g,
            savedAmount: Number(g.savedAmount) || 0,
            targetAmount: Number(g.targetAmount) || 0,
            installmentAmount: g.installmentAmount ? Number(g.installmentAmount) : undefined,
            contributions: Array.isArray(g.contributions) ? g.contributions : [],
            status: g.status || 'active',
            createdAt: new Date(g.createdAt),
            updatedAt: new Date(g.updatedAt)
          })));
        }
      } catch (e) {
        console.warn(e);
      }
      setGoalsSynced(true);
    });

    return () => unsubscribe();
  }, [userId]);

  // Sync count from server once on startup using server aggregation count
  useEffect(() => {
    if (!userId || userId === 'local-guest-session' || isOfflineFallback) {
      if (userId === 'local-guest-session') {
        const stored = localStorage.getItem(`easy_due_transactions_${userId}`);
        const count = stored ? JSON.parse(stored).length : 0;
        if (settings && settings.transactionsCount !== count) {
          const newSettings = { ...settings, transactionsCount: count };
          setSettings(newSettings);
          saveLocalSettings(newSettings);
        }
      }
      return;
    }
    
    const syncCount = async () => {
      try {
        const txRef = collection(db, 'users', userId, 'transactions');
        const snap = await getCountFromServer(txRef);
        const count = snap.data().count;
        
        if (settings && settings.transactionsCount !== count) {
          const newSettings = { ...settings, transactionsCount: count };
          setSettings(newSettings);
          saveLocalSettings(newSettings);
          
          const userDocRef = doc(db, 'users', userId);
          await updateDoc(userDocRef, { transactionsCount: count, updatedAt: serverTimestamp() });
        }
      } catch (err) {
        console.warn("Failed to sync total transaction count:", err);
      }
    };
    
    if (settings) {
      syncCount();
    }
  }, [userId, !settings, isOfflineFallback] /* triggers count sync */);

  // 4. Sync Reminders collection
 useEffect(() => {
 if (!userId) return;
 if (userId === 'local-guest-session') {
 return;
 }

 const remindersRef = collection(db, 'users', userId, 'reminders');

 const unsubscribe = onSnapshot(remindersRef, (snapshot) => {
 const list: Reminder[] = [];
 snapshot.forEach((docSnap) => {
 const data = docSnap.data();
 const rawDue = data.dueDate;
 const parsedDueDate = rawDue?.toDate ? rawDue.toDate() : (rawDue ? new Date(rawDue) : new Date());
 const rawCreated = data.createdAt;
 const parsedCreatedAt = rawCreated?.toDate ? rawCreated.toDate() : (rawCreated ? new Date(rawCreated) : new Date());
 list.push({
 ...data,
 id: docSnap.id,
 dueDate: parsedDueDate,
 createdAt: parsedCreatedAt,
 } as Reminder);
 });
 list.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
 setReminders(list);
 saveLocalReminders(list);
 }, (error) => {
 console.warn("Firestore error syncing reminders, using offline cache fallback:", error);
 loadLocalData();
 });

 return () => unsubscribe();
 }, [userId]);

 // --- ACTIONS ---

 // Update theme setting
 const updateTheme = async (theme: 'light' | 'dark') => {
 if (!userId) return;
 const updatedSettings = settings ? { ...settings, theme, updatedAt: new Date() } : {
 uid: userId,
 email: auth.currentUser?.email || 'guest@challantrack.local',
 theme,
 dailyReminderTime: '09:00',
 createdAt: new Date(),
 updatedAt: new Date()
 };
 setSettings(updatedSettings);
 saveLocalSettings(updatedSettings);

 if (userId === 'local-guest-session' || isOfflineFallback) {
 return;
 }

 const userDocRef = doc(db, 'users', userId);
 try {
 await updateDoc(userDocRef, {
 theme,
 updatedAt: serverTimestamp()
 });
 } catch (err) {
 console.warn("Firestore updateTheme failed, saved locally:", err);
 }
 };

 // Update general settings
 const updateSettings = async (time: string) => {
 if (!userId) return;
 const updatedSettings = settings ? { ...settings, dailyReminderTime: time, updatedAt: new Date() } : {
 uid: userId,
 email: auth.currentUser?.email || 'guest@challantrack.local',
 theme: 'dark' as const,
 dailyReminderTime: time,
 createdAt: new Date(),
 updatedAt: new Date()
 };
 setSettings(updatedSettings);
 saveLocalSettings(updatedSettings);

 if (userId === 'local-guest-session' || isOfflineFallback) {
 return;
 }

 const userDocRef = doc(db, 'users', userId);
 try {
 await updateDoc(userDocRef, {
 dailyReminderTime: time,
 updatedAt: serverTimestamp()
 });
 } catch (err) {
 console.warn("Firestore updateSettings failed, saved locally:", err);
 }
 };

 // Create new customer
 const createCustomer = async (name: string, phone: string) => {
 if (!userId) return null;
 
 const trimmedName = name.trim();
 // Case-insensitive duplicate name check
 const isDuplicate = customers.some(c => c.name.toLowerCase() === trimmedName.toLowerCase());
 if (isDuplicate) {
 throw new Error('DUPLICATE_NAME');
 }

 const customId = doc(collection(db, 'temp')).id;
 const newCustomer: Customer = {
 id: customId,
 userId,
 name: trimmedName,
 phone: cleanBangladeshiPhone(phone),
 outstandingDue: 0,
 createdAt: new Date(),
 updatedAt: new Date()
 };

 const updatedList = [newCustomer, ...customers];
 setCustomers(updatedList);
 saveLocalCustomers(updatedList);

 if (userId === 'local-guest-session' || isOfflineFallback) {
 return customId;
 }

 const customersRef = collection(db, 'users', userId, 'customers');
 const newDocRef = doc(customersRef, customId);
 try {
 await setDoc(newDocRef, {
 ...newCustomer,
 createdAt: serverTimestamp(),
 updatedAt: serverTimestamp()
 });
 return customId;
 } catch (err) {
 console.warn("Firestore createCustomer failed, saved locally:", err);
 return customId;
 }
 };

 // Record a new transaction (due or payment) and update customer balance
  // Helper to adjust monthly summary documents atomically inside a batch
  const adjustMonthlySummary = (
    batch: any, 
    uid: string, 
    oldTx: Transaction | null, 
    newTx: Transaction | null
  ) => {
    const getTxMonthKey = (tx: Transaction) => {
      const d = parseTxDate(tx.date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const targetMonth = newTx ? getTxMonthKey(newTx) : (oldTx ? getTxMonthKey(oldTx) : null);
    if (!targetMonth) return;

    const summaryRef = doc(db, 'users', uid, 'monthly_summaries', targetMonth);

    // Calculate changes
    let diffDues = 0;
    let diffPayments = 0;
    let diffCount = 0;

    if (oldTx) {
      diffCount--;
      if (oldTx.type === 'due') diffDues -= oldTx.amount;
      else diffPayments -= oldTx.amount;
    }
    if (newTx) {
      diffCount++;
      if (newTx.type === 'due') diffDues += newTx.amount;
      else diffPayments += newTx.amount;
    }

    const updates: any = {
      dues: increment(diffDues),
      payments: increment(diffPayments),
      count: increment(diffCount),
      updatedAt: serverTimestamp()
    };

    if (newTx) {
      updates[`customerPayments.${newTx.customerId}.name`] = newTx.customerName;
      updates[`customerPayments.${newTx.customerId}.total`] = increment(newTx.type === 'payment' ? newTx.amount : 0);
    }
    if (oldTx) {
      updates[`customerPayments.${oldTx.customerId}.total`] = increment(oldTx.type === 'payment' ? -oldTx.amount : 0);
    }

    batch.set(summaryRef, updates, { merge: true });
  };

  // Helper to adjust daily summary documents atomically inside a batch (Option A: Quickbook Sync)
  const adjustDailySummary = (
    batch: any, 
    uid: string, 
    oldTx: Transaction | null, 
    newTx: Transaction | null
  ) => {
    const getTxDayKey = (tx: Transaction) => {
      const d = parseTxDate(tx.date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const targetDay = newTx ? getTxDayKey(newTx) : (oldTx ? getTxDayKey(oldTx) : null);
    if (!targetDay) return;

    const summaryRef = doc(db, 'users', uid, 'daily_summaries', targetDay);

    let diffDues = 0;
    let diffPayments = 0;
    let diffCount = 0;

    if (oldTx) {
      diffCount--;
      if (oldTx.type === 'due') diffDues -= oldTx.amount;
      else diffPayments -= oldTx.amount;
    }
    if (newTx) {
      diffCount++;
      if (newTx.type === 'due') diffDues += newTx.amount;
      else diffPayments += newTx.amount;
    }

    const updates: any = {
      id: targetDay,
      dateStr: targetDay,
      dues: increment(diffDues),
      payments: increment(diffPayments),
      count: increment(diffCount),
      updatedAt: serverTimestamp()
    };

    batch.set(summaryRef, updates, { merge: true });
  };

  const rebuildMonthlySummaries = async (uid: string) => {
    if (!uid || uid === 'local-guest-session') return;
    if ((window as any).isRebuildingSummaries) return;
    (window as any).isRebuildingSummaries = true;
    console.log("Rebuilding monthly summaries for user:", uid);
    
    try {
      const txRef = collection(db, 'users', uid, 'transactions');
      const qSnap = await getDocs(txRef);
      
      const summaries = {};
      let totalCount = 0;
      
      qSnap.forEach(docSnap => {
        const tx = docSnap.data() as Transaction;
        tx.id = docSnap.id;
        const d = parseTxDate(tx.date);
        
        totalCount++;
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        
        if (!summaries[monthKey]) {
          summaries[monthKey] = {
            dues: 0,
            payments: 0,
            count: 0,
            customerPayments: {}
          };
        }
        
        const summary = summaries[monthKey];
        summary.count++;
        if (tx.type === 'due') {
          summary.dues += tx.amount;
        } else {
          summary.payments += tx.amount;
          if (!summary.customerPayments[tx.customerId]) {
            summary.customerPayments[tx.customerId] = {
              name: tx.customerName || 'Unknown',
              total: 0
            };
          }
          summary.customerPayments[tx.customerId].total += tx.amount;
        }
      });

      const batch = writeBatch(db);
      
      // Update User Settings count
      const userDocRef = doc(db, 'users', uid);
      batch.set(userDocRef, {
        transactionsCount: totalCount,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Write each summary (overwrite to clear deleted client payments completely)
      Object.keys(summaries).forEach(monthKey => {
        const summaryRef = doc(db, 'users', uid, 'monthly_summaries', monthKey);
        batch.set(summaryRef, {
          ...summaries[monthKey],
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();
      
      // Update local settings count
      if (settings) {
        const newSettings = { ...settings, transactionsCount: totalCount };
        setSettings(newSettings);
        saveLocalSettings(newSettings);
      }
    } catch (e) {
      console.warn("Failed to rebuild monthly summaries:", e);
    } finally {
      (window as any).isRebuildingSummaries = false;
    }
  };

  const addTransaction = async (
   customerId: string, 
   type: 'due' | 'payment', 
   amount: number, 
   description: string = '', 
   date: Date = new Date(),
   fallbackCustomerInfo?: { name: string; phone: string }
 ) => {
   if (!userId) return;

   // Accidental Time-Based Double-Click prevention
   const now = Date.now();
   if (lastSubmitRef.current) {
     const { timestamp, customerId: prevCustId, type: prevType, amount: prevAmount } = lastSubmitRef.current;
     if (
       now - timestamp < 1000 &&
       prevCustId === customerId &&
       prevType === type &&
       prevAmount === amount
     ) {
       console.warn("Blocked duplicate transaction submission within 1 second.");
       return;
     }
   }
   lastSubmitRef.current = { timestamp: now, customerId, type, amount };
 
 let customer = customers.find(c => c.id === customerId);
 let customerName = customer?.name || fallbackCustomerInfo?.name;
 if (!customerName) throw new Error('Customer not found');

 const customTxId = doc(collection(db, 'temp')).id;
 const diff = type === 'due' ? amount : -amount;

 const newTx: Transaction = {
 id: customTxId,
 userId,
 customerId,
 customerName: customerName,
 type,
 amount,
 description: description.trim(),
 date,
 createdAt: new Date()
 };

 const updatedTxs = [newTx, ...transactions];
 
 let found = false;
 let updatedCustomers = customers.map(c => {
 if (c.id === customerId) {
 found = true;
 return { ...c, outstandingDue: c.outstandingDue + diff, updatedAt: new Date() };
 }
 return c;
 });

 // If customer was newly created and not yet in the stale customers state list, add them inline
 if (!found && fallbackCustomerInfo) {
 const newCustomer: Customer = {
 id: customerId,
 userId,
 name: fallbackCustomerInfo.name.trim(),
 phone: fallbackCustomerInfo.phone.trim(),
 outstandingDue: diff,
 createdAt: new Date(),
 updatedAt: new Date()
 };
 updatedCustomers = [newCustomer, ...updatedCustomers];
 }

 setTransactions(updatedTxs);
 setCustomers(updatedCustomers);
 saveLocalTransactions(updatedTxs);
 saveLocalCustomers(updatedCustomers);

 if (customerId === activeCustomerId) {
   setAllCustomerTxs(prev => [newTx, ...prev.filter(t => t.id !== newTx.id)]);
   setActiveCustomerTxCount(prev => prev + 1);
 }

 if (selectedDailyDate && parseTxDate(date).toDateString() === selectedDailyDate.toDateString()) {
   setArchiveTransactions(prev => [newTx, ...prev.filter(t => t.id !== newTx.id)]);
 }

 adjustLocalMonthlySummaries(null, newTx);

 if (settings) {
   const newSettings = {
     ...settings,
     transactionsCount: (settings.transactionsCount || 0) + 1
   };
   setSettings(newSettings);
   saveLocalSettings(newSettings);
 }

 if (userId === 'local-guest-session' || isOfflineFallback) {
 return;
 }

 const txRef = collection(db, 'users', userId, 'transactions');
 const newTxDoc = doc(txRef, customTxId);
 const customerDocRef = doc(db, 'users', userId, 'customers', customerId);

 const batch = writeBatch(db);
 batch.set(newTxDoc, {
 ...newTx,
 date,
 createdAt: serverTimestamp()
 });
 
 // In Firestore, if this customer was just created, updateDoc or setDoc is safe since we did await setDoc earlier
 batch.update(customerDocRef, {
 outstandingDue: increment(diff),
 updatedAt: serverTimestamp()
 });

 adjustMonthlySummary(batch, userId, null, newTx);
 adjustDailySummary(batch, userId, null, newTx);

 const userDocRef = doc(db, 'users', userId);
 batch.update(userDocRef, {
 transactionsCount: increment(1),
 updatedAt: serverTimestamp()
 });

 try {
 await batch.commit();
 } catch (err) {
 console.warn("Firestore addTransaction failed, saved locally:", err);
 }
 };

 // Add a reminder for customer or EMI installment
 const addReminder = async (
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
 ) => {
 if (!userId) return;
 const customer = customers.find(c => c.id === customerId);
 const resolvedName = extra?.customerName || customer?.name || 'EMI Account';
 const reminderType = extra?.type || 'customer';

 // Prevent duplicate active reminders for the same person or same EMI
 const duplicateReminders = reminders.filter(r => {
   if (!r.active) return false;
   if (reminderType === 'emi') {
     if (r.type !== 'emi') return false;
     if (extra?.goalId && r.goalId === extra.goalId) return true;
     if (resolvedName && r.customerName && r.customerName.trim().toLowerCase() === resolvedName.trim().toLowerCase()) return true;
     return false;
   } else {
     if (r.type === 'emi') return false;
     return customerId && r.customerId === customerId;
   }
 });

 const customRemId = doc(collection(db, 'temp')).id;
 const newReminder: Reminder = {
 id: customRemId,
 userId,
 customerId: customerId || extra?.goalId || '',
 customerName: resolvedName,
 notes: notes.trim(),
 dueDate,
 active: true,
 createdAt: new Date(),
 type: reminderType,
 goalId: extra?.goalId,
 emiDayOfMonth: extra?.emiDayOfMonth,
 installmentAmount: extra?.installmentAmount
 };

 const filteredReminders = reminders.filter(r => !duplicateReminders.some(d => d.id === r.id));
 const updatedReminders = [newReminder, ...filteredReminders];
 setReminders(updatedReminders);
 saveLocalReminders(updatedReminders);

 if (userId === 'local-guest-session' || isOfflineFallback) {
 return;
 }

 // Delete duplicates from Firestore asynchronously
 for (const dup of duplicateReminders) {
   try {
     deleteDoc(doc(db, 'users', userId, 'reminders', dup.id));
   } catch (err) {
     console.warn("Failed to remove duplicate reminder from Firestore:", err);
   }
 }

 const remindersRef = collection(db, 'users', userId, 'reminders');
 const newReminderRef = doc(remindersRef, customRemId);
 const firestoreReminder: any = {
 id: customRemId,
 userId,
 customerId: customerId || extra?.goalId || '',
 customerName: resolvedName,
 notes: notes.trim(),
 dueDate,
 active: true,
 createdAt: serverTimestamp(),
 type: reminderType
 };
 if (extra?.goalId) firestoreReminder.goalId = extra.goalId;
 if (extra?.emiDayOfMonth !== undefined) firestoreReminder.emiDayOfMonth = Number(extra.emiDayOfMonth);
 if (extra?.installmentAmount !== undefined && !isNaN(Number(extra.installmentAmount))) {
 firestoreReminder.installmentAmount = Number(extra.installmentAmount);
 }

 try {
 await setDoc(newReminderRef, firestoreReminder);
 } catch (err) {
 console.warn("Firestore addReminder failed, saved locally:", err);
 }
 };

 // Toggle/Edit a Reminder status
 const toggleReminder = async (reminderId: string, active: boolean) => {
 if (!userId) return;
 const updatedReminders = reminders.map(r => r.id === reminderId ? { ...r, active } : r);
 setReminders(updatedReminders);
 saveLocalReminders(updatedReminders);

 if (userId === 'local-guest-session' || isOfflineFallback) {
 return;
 }

 const reminderRef = doc(db, 'users', userId, 'reminders', reminderId);
 try {
 await updateDoc(reminderRef, { active });
 } catch (err) {
 console.warn("Firestore toggleReminder failed, saved locally:", err);
 }
 };

 // Delete a Reminder
 const deleteReminder = async (reminderId: string) => {
 if (!userId) return;
 const updatedReminders = reminders.filter(r => r.id !== reminderId);
 setReminders(updatedReminders);
 saveLocalReminders(updatedReminders);

 if (userId === 'local-guest-session' || isOfflineFallback) {
 return;
 }

 const reminderRef = doc(db, 'users', userId, 'reminders', reminderId);
 try {
 await deleteDoc(reminderRef);
 } catch (err) {
 console.warn("Firestore deleteReminder failed, saved locally:", err);
 }
 };

  // Delete a customer (soft delete to Trash)
  const deleteCustomer = async (customerId: string) => {
    if (!userId) return;
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    const deletedCustomer = { ...customer, isDeleted: true, deletedAt: new Date() };

    const updatedCustomers = customers.filter(c => c.id !== customerId);
    const updatedTrash = [deletedCustomer, ...trashCustomers];

    setCustomers(updatedCustomers);
    setTrashCustomers(updatedTrash);
    saveLocalCustomers([...updatedCustomers, ...updatedTrash]);

    if (userId === 'local-guest-session' || isOfflineFallback) {
      return;
    }

    const customerDocRef = doc(db, 'users', userId, 'customers', customerId);
    try {
      await updateDoc(customerDocRef, {
        isDeleted: true,
        deletedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn("Firestore soft deleteCustomer failed, saved locally:", err);
    }
  };

  // Restore a customer from Trash
  const restoreCustomer = async (customerId: string) => {
    if (!userId) return;
    const customer = trashCustomers.find(c => c.id === customerId);
    if (!customer) return;

    const restoredCustomer = { ...customer, isDeleted: false, deletedAt: null };

    const updatedTrash = trashCustomers.filter(c => c.id !== customerId);
    const updatedCustomers = [restoredCustomer, ...customers];

    setCustomers(updatedCustomers);
    setTrashCustomers(updatedTrash);
    saveLocalCustomers([...updatedCustomers, ...updatedTrash]);

    if (userId === 'local-guest-session' || isOfflineFallback) {
      return;
    }

    const customerDocRef = doc(db, 'users', userId, 'customers', customerId);
    try {
      await updateDoc(customerDocRef, {
        isDeleted: false,
        deletedAt: null
      });
    } catch (err) {
      console.warn("Firestore restoreCustomer failed, saved locally:", err);
    }
  };

  // Permanently delete a customer, their transactions, and reminders
  const permanentlyDeleteCustomer = async (customerId: string) => {
    if (!userId) return;

    const updatedTrash = trashCustomers.filter(c => c.id !== customerId);
    const updatedCustomers = customers.filter(c => c.id !== customerId);

    setCustomers(updatedCustomers);
    setTrashCustomers(updatedTrash);
    saveLocalCustomers([...updatedCustomers, ...updatedTrash]);

    const updatedTxs = transactions.filter(t => t.customerId !== customerId);
    const updatedReminders = reminders.filter(r => r.type === 'emi' || r.customerId !== customerId);
    setTransactions(updatedTxs);
    setReminders(updatedReminders);
    saveLocalTransactions(updatedTxs);
    saveLocalReminders(updatedReminders);

    if (userId === 'local-guest-session' || isOfflineFallback) {
      return;
    }

    const customerDocRef = doc(db, 'users', userId, 'customers', customerId);
    const relatedTxs = transactions.filter(t => t.customerId === customerId);
    const relatedReminders = reminders.filter(r => r.type !== 'emi' && r.customerId === customerId);

    const batch = writeBatch(db);
    batch.delete(customerDocRef);
    relatedTxs.forEach(tx => {
      batch.delete(doc(db, 'users', userId, 'transactions', tx.id));
      adjustMonthlySummary(batch, userId, tx, null);
      adjustDailySummary(batch, userId, tx, null);
    });
    relatedReminders.forEach(rem => {
      batch.delete(doc(db, 'users', userId, 'reminders', rem.id));
    });

    try {
      await batch.commit();
    } catch (err) {
      console.warn("Firestore permanentlyDeleteCustomer failed, saved locally:", err);
    }
  };

  // Empty the entire Trash
  const emptyTrash = async () => {
    if (!userId) return;

    const idsToDelete = trashCustomers.map(c => c.id);

    setTrashCustomers([]);
    saveLocalCustomers(customers);

    const updatedTxs = transactions.filter(t => !idsToDelete.includes(t.customerId));
    const updatedReminders = reminders.filter(r => r.type === 'emi' || !idsToDelete.includes(r.customerId));
    setTransactions(updatedTxs);
    setReminders(updatedReminders);
    saveLocalTransactions(updatedTxs);
    saveLocalReminders(updatedReminders);

    if (userId === 'local-guest-session' || isOfflineFallback) {
      return;
    }

    try {
      for (const customerId of idsToDelete) {
        const customerDocRef = doc(db, 'users', userId, 'customers', customerId);
        const relatedTxs = transactions.filter(t => t.customerId === customerId);
        const relatedReminders = reminders.filter(r => r.type !== 'emi' && r.customerId === customerId);

        const batch = writeBatch(db);
        batch.delete(customerDocRef);
        relatedTxs.forEach(tx => {
          batch.delete(doc(db, 'users', userId, 'transactions', tx.id));
          adjustMonthlySummary(batch, userId, tx, null);
          adjustDailySummary(batch, userId, tx, null);
        });
        relatedReminders.forEach(rem => {
          batch.delete(doc(db, 'users', userId, 'reminders', rem.id));
        });
        await batch.commit();
      }
    } catch (err) {
      console.warn("Firestore emptyTrash failed, saved locally:", err);
    }
  };

  const updateCustomerDetails = async (customerId: string, name: string, phone: string) => {
    if (!userId) return;
    const trimmedName = name.trim();
    const trimmedPhone = cleanBangladeshiPhone(phone);

    // Check for duplicate name excluding the customer being updated
    const isDuplicate = customers.some(c => c.id !== customerId && c.name.toLowerCase() === trimmedName.toLowerCase());
    if (isDuplicate) {
      throw new Error('DUPLICATE_NAME');
    }

    const updatedList = customers.map(c => 
      c.id === customerId ? { ...c, name: trimmedName, phone: trimmedPhone, updatedAt: new Date() } : c
    );
    setCustomers(updatedList);
    saveLocalCustomers(updatedList);

    if (userId === 'local-guest-session' || isOfflineFallback) {
      return;
    }

    const customerDocRef = doc(db, 'users', userId, 'customers', customerId);
    try {
      await updateDoc(customerDocRef, {
        name: trimmedName,
        phone: trimmedPhone,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn("Firestore updateCustomerDetails failed, saved locally:", err);
    }
  };

  // Edit a transaction
  const editTransaction = async (
    transactionId: string,
    newType: 'due' | 'payment',
    newAmount: number,
    newDescription: string
  ) => {
    if (!userId) return;

    let tx = customerTransactions.find(t => t.id === transactionId) ||
             allCustomerTxs.find(t => t.id === transactionId) ||
             archiveTransactions.find(t => t.id === transactionId) ||
             transactions.find(t => t.id === transactionId);

    if (!tx) {
      try {
        const stored = localStorage.getItem(`easy_due_transactions_${userId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          tx = parsed.find((t: any) => t.id === transactionId);
        }
      } catch (e) {
        console.warn(e);
      }
    }
    if (!tx) return;

    const diffOld = tx.type === 'due' ? -tx.amount : tx.amount; // reverse old effect
    const diffNew = newType === 'due' ? newAmount : -newAmount; // apply new effect
    const netDiff = diffOld + diffNew;

    const updatedCustomers = customers.map(c => 
      c.id === tx.customerId 
        ? { ...c, outstandingDue: c.outstandingDue + netDiff, updatedAt: new Date() }
        : c
    );

    setCustomers(updatedCustomers);
    saveLocalCustomers(updatedCustomers);

    const updatedTx: Transaction = {
      ...tx,
      type: newType,
      amount: newAmount,
      description: newDescription.trim()
    };

    // Update local cache in localStorage
    try {
      const stored = localStorage.getItem(`easy_due_transactions_${userId}`);
      if (stored) {
        const parsed = JSON.parse(stored).map((t: any) => {
          if (t.id === transactionId) {
            return {
              ...t,
              type: newType,
              amount: newAmount,
              description: newDescription.trim()
            };
          }
          return t;
        });
        localStorage.setItem(`easy_due_transactions_${userId}`, JSON.stringify(parsed));
      }
    } catch (e) {
      console.warn("Failed to update edited tx in local cache:", e);
    }

    // Update local states optimistically
    setCustomerTransactions(prev => prev.map(t => t.id === transactionId ? updatedTx : t));
    setAllCustomerTxs(prev => prev.map(t => t.id === transactionId ? updatedTx : t));
    setArchiveTransactions(prev => prev.map(t => t.id === transactionId ? updatedTx : t));
    setTransactions(prev => prev.map(t => t.id === transactionId ? updatedTx : t));

    adjustLocalMonthlySummaries(tx, updatedTx);

    if (userId === 'local-guest-session' || isOfflineFallback) return;

    const batch = writeBatch(db);
    batch.update(doc(db, 'users', userId, 'transactions', transactionId), {
      type: newType,
      amount: newAmount,
      description: newDescription.trim()
    });
    batch.update(doc(db, 'users', userId, 'customers', tx.customerId), {
      outstandingDue: increment(netDiff),
      updatedAt: serverTimestamp()
    });

    adjustMonthlySummary(batch, userId, tx, updatedTx);
    adjustDailySummary(batch, userId, tx, updatedTx);

    try {
      await batch.commit();
    } catch (err) {
      console.warn("Firestore editTransaction failed, saved locally:", err);
    }
  };

  // Delete a transaction
  const deleteTransaction = async (transactionId: string) => {
    if (!userId) return;

    let tx = customerTransactions.find(t => t.id === transactionId) ||
             allCustomerTxs.find(t => t.id === transactionId) ||
             archiveTransactions.find(t => t.id === transactionId) ||
             transactions.find(t => t.id === transactionId);

    if (!tx) {
      try {
        const stored = localStorage.getItem(`easy_due_transactions_${userId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          tx = parsed.find((t: any) => t.id === transactionId);
        }
      } catch (e) {
        console.warn(e);
      }
    }
    if (!tx) return;

    const diff = tx.type === 'due' ? -tx.amount : tx.amount;

    const updatedCustomers = customers.map(c => 
      c.id === tx.customerId 
        ? { ...c, outstandingDue: c.outstandingDue + diff, updatedAt: new Date() }
        : c
    );

    setCustomers(updatedCustomers);
    saveLocalCustomers(updatedCustomers);

    // Delete from localStorage cache
    try {
      const stored = localStorage.getItem(`easy_due_transactions_${userId}`);
      if (stored) {
        const parsed = JSON.parse(stored).filter((t: any) => t.id !== transactionId);
        localStorage.setItem(`easy_due_transactions_${userId}`, JSON.stringify(parsed));
      }
    } catch (e) {
      console.warn("Failed to delete transaction from local cache:", e);
    }

    // Update memory states optimistically
    setCustomerTransactions(prev => prev.filter(t => t.id !== transactionId));
    setAllCustomerTxs(prev => prev.filter(t => t.id !== transactionId));
    setArchiveTransactions(prev => prev.filter(t => t.id !== transactionId));
    setTransactions(prev => prev.filter(t => t.id !== transactionId));

    adjustLocalMonthlySummaries(tx, null);

    setActiveCustomerTxCount(prev => Math.max(0, prev - 1));
    // Update settings count locally
    if (settings) {
      const newSettings = {
        ...settings,
        transactionsCount: Math.max(0, (settings.transactionsCount || 0) - 1)
      };
      setSettings(newSettings);
      saveLocalSettings(newSettings);
    }

    if (userId === 'local-guest-session' || isOfflineFallback) return;

    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', userId, 'transactions', transactionId));

    // Decrement total transactions count in settings
    const userDocRef = doc(db, 'users', userId);
    batch.update(userDocRef, {
      transactionsCount: increment(-1),
      updatedAt: serverTimestamp()
    });

    adjustMonthlySummary(batch, userId, tx, null);
    adjustDailySummary(batch, userId, tx, null);
    batch.update(doc(db, 'users', userId, 'customers', tx.customerId), {
      outstandingDue: increment(diff),
      updatedAt: serverTimestamp()
    });

    try {
      await batch.commit();
    } catch (err) {
      console.warn("Firestore deleteTransaction failed, saved locally:", err);
    }
  };

  const importLedgerData = async (
    backupData: any,
    choice: 'merge' | 'clear' | 'skip'
  ) => {
    if (!userId) return;

    const isLocal = userId === 'local-guest-session' || isOfflineFallback;

    // Validate structure
    if (!backupData || !Array.isArray(backupData.customers) || !Array.isArray(backupData.ledgerTransactions)) {
      throw new Error('INVALID_BACKUP_FILE');
    }

    // List of Firestore operations to commit
    const operations: { ref: any; data: any; type: 'set' | 'update' | 'delete' }[] = [];

    // Local copies of states we'll update
    let newCustomers: Customer[] = [...customers];
    let newTrash: Customer[] = [...trashCustomers];
    let newTransactions: Transaction[] = [...transactions];
    let newReminders: Reminder[] = [...reminders];

    if (choice === 'clear') {
      // Clear Firestore references for existing customers, transactions, and reminders
      if (!isLocal) {
        // Collect deletes for existing customers (both active and trash)
        for (const c of customers) {
          operations.push({
            ref: doc(db, 'users', userId, 'customers', c.id),
            data: null,
            type: 'delete'
          });
        }
        for (const c of trashCustomers) {
          operations.push({
            ref: doc(db, 'users', userId, 'customers', c.id),
            data: null,
            type: 'delete'
          });
        }
        // Collect deletes for transactions
        for (const tx of transactions) {
          operations.push({
            ref: doc(db, 'users', userId, 'transactions', tx.id),
            data: null,
            type: 'delete'
          });
        }
        // Collect deletes for reminders
        for (const r of reminders) {
          operations.push({
            ref: doc(db, 'users', userId, 'reminders', r.id),
            data: null,
            type: 'delete'
          });
        }
      }

      // Reset local variables
      newCustomers = [];
      newTrash = [];
      newTransactions = [];
      newReminders = [];

      // Create new customers from backup
      const customerMap = new Map<string, Customer>(); // name lowercased -> Customer object
      
      for (const bc of backupData.customers) {
        if (!bc.name) continue;
        const customId = doc(collection(db, 'temp')).id;
        const cDate = bc.createdAt ? new Date(bc.createdAt) : new Date();
        const customerObj: Customer = {
          id: customId,
          userId,
          name: bc.name.trim(),
          phone: (bc.phone || '').trim(),
          outstandingDue: bc.outstandingDue || 0,
          createdAt: cDate,
          updatedAt: new Date()
        };
        customerMap.set(bc.name.trim().toLowerCase(), customerObj);
        newCustomers.push(customerObj);

        if (!isLocal) {
          operations.push({
            ref: doc(db, 'users', userId, 'customers', customId),
            data: {
              id: customId,
              userId,
              name: bc.name.trim(),
              phone: (bc.phone || '').trim(),
              outstandingDue: bc.outstandingDue || 0,
              createdAt: cDate,
              updatedAt: new Date()
            },
            type: 'set'
          });
        }
      }

      // Create transactions from backup
      for (const bt of backupData.ledgerTransactions) {
        const cName = bt.customer || (bt as any).customerName; if (!cName) continue;
        const customerNameLower = cName.trim().toLowerCase();
        let matchedCustomer = customerMap.get(customerNameLower);
        
        // If the customer isn't in the customer list for some reason, create them
        if (!matchedCustomer) {
          const customId = doc(collection(db, 'temp')).id;
          const customerObj: Customer = {
            id: customId,
            userId,
            name: cName.trim(),
            phone: '',
            outstandingDue: 0,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          customerMap.set(customerNameLower, customerObj);
          newCustomers.push(customerObj);
          matchedCustomer = customerObj;

          if (!isLocal) {
            operations.push({
              ref: doc(db, 'users', userId, 'customers', customId),
              data: {
                id: customId,
                userId,
                name: cName.trim(),
                phone: '',
                outstandingDue: 0,
                createdAt: new Date(),
                updatedAt: new Date()
              },
              type: 'set'
            });
          }
        }

        const customTxId = doc(collection(db, 'temp')).id;
        const txDate = bt.date ? new Date(bt.date) : new Date();
        const txObj: Transaction = {
          id: customTxId,
          userId,
          customerId: matchedCustomer.id,
          customerName: matchedCustomer.name,
          type: bt.type,
          amount: bt.amount,
          description: (bt.description || '').trim(),
          date: txDate,
          createdAt: txDate
        };
        newTransactions.push(txObj);

        if (!isLocal) {
          operations.push({
            ref: doc(db, 'users', userId, 'transactions', customTxId),
            data: {
              id: customTxId,
              userId,
              customerId: matchedCustomer.id,
              customerName: matchedCustomer.name,
              type: bt.type,
              amount: bt.amount,
              description: (bt.description || '').trim(),
              date: txDate,
              createdAt: txDate
            },
            type: 'set'
          });
        }
      }
    } else {
      // choice === 'merge' or 'skip'
      // 1. Process customers
      // Keep track of the current active customers by name
      const customerMap = new Map<string, Customer>();
      for (const c of newCustomers) {
        customerMap.set(c.name.trim().toLowerCase(), c);
      }

      for (const bc of backupData.customers) {
        if (!bc.name) continue;
        const key = bc.name.trim().toLowerCase();
        const existing = customerMap.get(key);

        if (existing) {
          if (choice === 'merge') {
            // Update phone if different
            const backupPhone = (bc.phone || '').trim();
            if (backupPhone && existing.phone !== backupPhone) {
              existing.phone = backupPhone;
              existing.updatedAt = new Date();
              
              if (!isLocal) {
                operations.push({
                  ref: doc(db, 'users', userId, 'customers', existing.id),
                  data: { phone: backupPhone, updatedAt: new Date() },
                  type: 'update'
                });
              }
            }
          }
        } else {
          // Customer does not exist, create new one
          const customId = doc(collection(db, 'temp')).id;
          const cDate = bc.createdAt ? new Date(bc.createdAt) : new Date();
          const customerObj: Customer = {
            id: customId,
            userId,
            name: bc.name.trim(),
            phone: (bc.phone || '').trim(),
            outstandingDue: 0, // will accumulate from new transactions
            createdAt: cDate,
            updatedAt: new Date()
          };
          customerMap.set(key, customerObj);
          newCustomers.push(customerObj);

          if (!isLocal) {
            operations.push({
              ref: doc(db, 'users', userId, 'customers', customId),
              data: {
                id: customId,
                userId,
                name: bc.name.trim(),
                phone: (bc.phone || '').trim(),
                outstandingDue: 0,
                createdAt: cDate,
                updatedAt: new Date()
              },
              type: 'set'
            });
          }
        }
      }

      // 2. Process transactions
      for (const bt of backupData.ledgerTransactions) {
        const cName = bt.customer || (bt as any).customerName; if (!cName) continue;
        const key = cName.trim().toLowerCase();
        let matchedCustomer = customerMap.get(key);

        // If customer doesn't exist (can happen if transactions contains entries for someone not in customers list)
        if (!matchedCustomer) {
          const customId = doc(collection(db, 'temp')).id;
          const customerObj: Customer = {
            id: customId,
            userId,
            name: cName.trim(),
            phone: '',
            outstandingDue: 0,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          customerMap.set(key, customerObj);
          newCustomers.push(customerObj);
          matchedCustomer = customerObj;

          if (!isLocal) {
            operations.push({
              ref: doc(db, 'users', userId, 'customers', customId),
              data: {
                id: customId,
                userId,
                name: cName.trim(),
                phone: '',
                outstandingDue: 0,
                createdAt: new Date(),
                updatedAt: new Date()
              },
              type: 'set'
            });
          }
        }

        // Check if transaction already exists in our live transaction list
        const btDateMs = bt.date ? new Date(bt.date).getTime() : 0;
        const exists = newTransactions.some(tx => {
          if (tx.customerId !== matchedCustomer!.id) return false;
          if (tx.type !== bt.type) return false;
          if (tx.amount !== bt.amount) return false;
          if ((tx.description || '').trim() !== (bt.description || '').trim()) return false;
          // Compare dates with tolerance (within 1 second)
          const txDateMs = new Date(tx.date).getTime();
          return Math.abs(txDateMs - btDateMs) < 1000;
        });

        if (!exists) {
          const customTxId = doc(collection(db, 'temp')).id;
          const txDate = bt.date ? new Date(bt.date) : new Date();
          const txObj: Transaction = {
            id: customTxId,
            userId,
            customerId: matchedCustomer.id,
            customerName: matchedCustomer.name,
            type: bt.type,
            amount: bt.amount,
            description: (bt.description || '').trim(),
            date: txDate,
            createdAt: txDate
          };
          newTransactions.push(txObj);

          if (!isLocal) {
            operations.push({
              ref: doc(db, 'users', userId, 'transactions', customTxId),
              data: {
                id: customTxId,
                userId,
                customerId: matchedCustomer.id,
                customerName: matchedCustomer.name,
                type: bt.type,
                amount: bt.amount,
                description: (bt.description || '').trim(),
                date: txDate,
                createdAt: txDate
              },
              type: 'set'
            });
          }

          // Accumulate balance
          const diff = bt.type === 'due' ? bt.amount : -bt.amount;
          matchedCustomer.outstandingDue += diff;
          matchedCustomer.updatedAt = new Date();
        }
      }

      // Sync customer balance updates to Firestore for customers that had updates
      if (!isLocal) {
        for (const c of newCustomers) {
          const opIndex = operations.findIndex(op => op.type === 'set' && op.ref.id === c.id);
          if (opIndex >= 0) {
            // Update the set operation data
            operations[opIndex].data.outstandingDue = c.outstandingDue;
            operations[opIndex].data.updatedAt = c.updatedAt;
          } else {
            // Check if customer outstandingDue changed from original.
            const original = customers.find(orig => orig.id === c.id);
            if (original && (original.outstandingDue !== c.outstandingDue || original.phone !== c.phone)) {
              operations.push({
                ref: doc(db, 'users', userId, 'customers', c.id),
                data: { 
                  outstandingDue: c.outstandingDue, 
                  phone: c.phone, 
                  updatedAt: c.updatedAt 
                },
                type: 'update'
              });
            }
          }
        }
      }
    }

    // Execute Firestore operations in chunks of 400
    if (!isLocal && operations.length > 0) {
      const chunkArray = <T>(arr: T[], size: number): T[][] => {
        const chunks: T[][] = [];
        for (let i = 0; i < arr.length; i += size) {
          chunks.push(arr.slice(i, i + size));
        }
        return chunks;
      };

      const chunks = chunkArray(operations, 400);
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const op of chunk) {
          if (op.type === 'set') {
            batch.set(op.ref, op.data);
          } else if (op.type === 'update') {
            batch.update(op.ref, op.data);
          } else if (op.type === 'delete') {
            batch.delete(op.ref);
          }
        }
        await batch.commit();
      }
    }

    // Update local state
    setCustomers(newCustomers.filter(c => !c.isDeleted));
    setTrashCustomers(newTrash);
    setTransactions(newTransactions);
    setReminders(newReminders);

    // Save to local storage
    saveLocalCustomers([...newCustomers, ...newTrash]);
    saveLocalTransactions(newTransactions);
    saveLocalReminders(newReminders);

    if (settings) {
      const newSettings = {
        ...settings,
        transactionsCount: newTransactions.length
      };
      setSettings(newSettings);
      saveLocalSettings(newSettings);
    }

    setTransactions(newTransactions);
    setCustomerTransactions([]);
    setAllCustomerTxs([]);
    setArchiveTransactions([]);

    if (!isLocal) {
      await rebuildMonthlySummaries(userId);
    }
  };

  // Note: Automated full-database scans on startup were decommissioned to protect Firebase read limits.
  // Rebuilding summaries is available on-demand via SettingsManager ("Rebuild & Repair") and during data imports.

  // 5. Automatic cleanup of trashed items older than 14 days
  useEffect(() => {
    if (!userId || loading || trashCustomers.length === 0) return;

    const now = new Date().getTime();
    const fourteenDaysInMs = 14 * 24 * 60 * 60 * 1000;
    
    const expiredCustomers = trashCustomers.filter(c => {
      if (!c.deletedAt) return false;
      const deletedTime = new Date(c.deletedAt).getTime();
      return (now - deletedTime) > fourteenDaysInMs;
    });

    if (expiredCustomers.length > 0) {
      expiredCustomers.forEach(c => {
        permanentlyDeleteCustomer(c.id);
      });
    }
  }, [userId, loading, trashCustomers]);

  // Goal CRUD actions
  const createGoal = async (
    title: string,
    targetAmount: number,
    frequency: 'daily' | 'weekly' | 'monthly' | 'flexible',
    installmentAmount?: number,
    type: 'savings' | 'deposit' = 'savings',
    customerId?: string,
    customerName?: string,
    notes?: string,
    principalAmount?: number,
    interestRate?: number,
    interestAmount?: number,
    tenure?: number
  ) => {
    if (!userId) return null;
    const customGoalId = doc(collection(db, 'temp')).id;
    const newGoal: SavingGoal = {
      id: customGoalId,
      userId,
      title: title.trim(),
      targetAmount: Number(targetAmount) || 0,
      savedAmount: 0,
      frequency,
      installmentAmount: installmentAmount && installmentAmount > 0 ? Number(installmentAmount) : undefined,
      type,
      customerId: customerId || undefined,
      customerName: customerName || undefined,
      notes: notes?.trim() || undefined,
      principalAmount: principalAmount ? Number(principalAmount) : undefined,
      interestRate: interestRate !== undefined ? Number(interestRate) : undefined,
      interestAmount: interestAmount !== undefined ? Number(interestAmount) : undefined,
      tenure: tenure ? Number(tenure) : undefined,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      contributions: []
    };

    const updatedGoals = [newGoal, ...goals];
    setGoals(updatedGoals);
    saveLocalGoals(updatedGoals);

    if (userId === 'local-guest-session' || isOfflineFallback) {
      return customGoalId;
    }

    const goalDocRef = doc(db, 'users', userId, 'goals', customGoalId);
    const firestoreGoal: any = {
      id: customGoalId,
      userId,
      title: title.trim(),
      targetAmount: Number(targetAmount) || 0,
      savedAmount: 0,
      frequency,
      type,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      contributions: []
    };
    if (installmentAmount && installmentAmount > 0) firestoreGoal.installmentAmount = Number(installmentAmount);
    if (customerId) firestoreGoal.customerId = customerId;
    if (customerName) firestoreGoal.customerName = customerName;
    if (notes) firestoreGoal.notes = notes.trim();
    if (principalAmount) firestoreGoal.principalAmount = Number(principalAmount);
    if (interestRate !== undefined) firestoreGoal.interestRate = Number(interestRate);
    if (interestAmount !== undefined) firestoreGoal.interestAmount = Number(interestAmount);
    if (tenure) firestoreGoal.tenure = Number(tenure);

    try {
      await setDoc(goalDocRef, firestoreGoal);
      return customGoalId;
    } catch (err) {
      console.warn("Firestore createGoal failed, saved locally:", err);
      return customGoalId;
    }
  };

  const addGoalContribution = async (
    goalId: string,
    amount: number,
    note: string = '',
    recordAsCustomerTransaction: boolean = false
  ): Promise<SavingGoal | null> => {
    if (!userId || !amount || amount <= 0) return null;

    const goal = goals.find(g => g.id === goalId);
    if (!goal) return null;

    const contributionId = doc(collection(db, 'temp')).id;
    const newContribution: GoalContribution = {
      id: contributionId,
      amount,
      date: new Date().toISOString(),
      note: note.trim()
    };

    const currentContributions = Array.isArray(goal.contributions) ? goal.contributions : [];
    const updatedContributions = [...currentContributions, newContribution];
    const newSavedAmount = (Number(goal.savedAmount) || 0) + amount;
    const isCompleted = newSavedAmount >= (Number(goal.targetAmount) || 0);
    const newStatus = isCompleted ? ('completed' as const) : goal.status;

    const updatedGoal: SavingGoal = {
      ...goal,
      savedAmount: newSavedAmount,
      status: newStatus,
      contributions: updatedContributions,
      updatedAt: new Date()
    };

    const updatedGoals = goals.map(g => (g.id === goalId ? updatedGoal : g));

    setGoals(updatedGoals);
    saveLocalGoals(updatedGoals);

    // Handle optional ledger recording (log as payment transaction in customer's account)
    if (recordAsCustomerTransaction && goal.customerId) {
      const linkedCust = customers.find(c => c.id === goal.customerId);
      const cName = goal.customerName || linkedCust?.name || 'Customer';
      const cPhone = linkedCust?.phone || '';
      const txDesc = note.trim()
        ? `${note.trim()} (${goal.title})`
        : `Goal: ${goal.title}`;

      await addTransaction(
        goal.customerId,
        'payment',
        amount,
        txDesc,
        new Date(),
        { name: cName, phone: cPhone }
      );
    }

    if (userId === 'local-guest-session' || isOfflineFallback) {
      return updatedGoal;
    }

    const goalDocRef = doc(db, 'users', userId, 'goals', goalId);
    try {
      await updateDoc(goalDocRef, {
        savedAmount: newSavedAmount,
        status: newStatus,
        contributions: updatedContributions,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn("Firestore addGoalContribution failed, saved locally:", err);
    }

    return updatedGoal;
  };

  const deleteGoal = async (goalId: string) => {
    if (!userId) return;

    const updatedGoals = goals.filter(g => g.id !== goalId);
    setGoals(updatedGoals);
    saveLocalGoals(updatedGoals);

    if (userId === 'local-guest-session' || isOfflineFallback) return;

    const goalDocRef = doc(db, 'users', userId, 'goals', goalId);
    try {
      await deleteDoc(goalDocRef);
    } catch (err) {
      console.warn("Firestore deleteGoal failed, saved locally:", err);
    }
  };

  const updateGoalStatus = async (goalId: string, status: 'active' | 'completed' | 'cancelled') => {
    if (!userId) return;

    const updatedGoals = goals.map(g => 
      g.id === goalId ? { ...g, status, updatedAt: new Date() } : g
    );
    setGoals(updatedGoals);
    saveLocalGoals(updatedGoals);

    if (userId === 'local-guest-session' || isOfflineFallback) return;

    const goalDocRef = doc(db, 'users', userId, 'goals', goalId);
    try {
      await updateDoc(goalDocRef, {
        status,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn("Firestore updateGoalStatus failed, saved locally:", err);
    }
  };

  const updateGoalTitle = async (goalId: string, newTitle: string) => {
    if (!userId || !newTitle.trim()) return;
    const trimmed = newTitle.trim();
    const updatedGoals = goals.map(g => 
      g.id === goalId ? { ...g, title: trimmed, updatedAt: new Date() } : g
    );
    setGoals(updatedGoals);
    saveLocalGoals(updatedGoals);

    if (userId === 'local-guest-session' || isOfflineFallback) return;

    const goalDocRef = doc(db, 'users', userId, 'goals', goalId);
    try {
      await updateDoc(goalDocRef, {
        title: trimmed,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn("Firestore updateGoalTitle failed, saved locally:", err);
    }
  };

  const editGoalContribution = async (
    goalId: string,
    contributionId: string,
    newAmount: number,
    newNote: string
  ) => {
    if (!userId || newAmount <= 0) return;
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    const currentContribs = goal.contributions || [];
    const targetContrib = currentContribs.find(c => (c.id && c.id === contributionId) || (!c.id && c.date === contributionId));
    if (!targetContrib) return;

    const diff = newAmount - targetContrib.amount;
    const updatedContribs = currentContribs.map(c => 
      ((c.id && c.id === contributionId) || (!c.id && c.date === contributionId))
        ? { ...c, id: c.id || contributionId, amount: newAmount, note: newNote.trim() }
        : c
    );
    const newSaved = Math.max(0, (goal.savedAmount || 0) + diff);
    const isCompleted = newSaved >= (Number(goal.targetAmount) || 0);
    const newStatus = isCompleted ? ('completed' as const) : (goal.status === 'completed' ? 'active' : goal.status);

    const updatedGoal: SavingGoal = {
      ...goal,
      savedAmount: newSaved,
      status: newStatus,
      contributions: updatedContribs,
      updatedAt: new Date()
    };

    const updatedGoals = goals.map(g => (g.id === goalId ? updatedGoal : g));
    setGoals(updatedGoals);
    saveLocalGoals(updatedGoals);

    if (userId === 'local-guest-session' || isOfflineFallback) return;

    const goalDocRef = doc(db, 'users', userId, 'goals', goalId);
    try {
      await updateDoc(goalDocRef, {
        savedAmount: newSaved,
        status: newStatus,
        contributions: updatedContribs,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn("Firestore editGoalContribution failed, saved locally:", err);
    }
  };

  const deleteGoalContribution = async (goalId: string, contributionId: string) => {
    if (!userId) return;
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    const currentContribs = goal.contributions || [];
    const targetContrib = currentContribs.find(c => (c.id && c.id === contributionId) || (!c.id && c.date === contributionId));
    if (!targetContrib) return;

    const updatedContribs = currentContribs.filter(c => 
      !((c.id && c.id === contributionId) || (!c.id && c.date === contributionId))
    );
    const newSaved = Math.max(0, (goal.savedAmount || 0) - targetContrib.amount);
    const isCompleted = newSaved >= (Number(goal.targetAmount) || 0);
    const newStatus = isCompleted ? ('completed' as const) : (goal.status === 'completed' ? 'active' : goal.status);

    const updatedGoal: SavingGoal = {
      ...goal,
      savedAmount: newSaved,
      status: newStatus,
      contributions: updatedContribs,
      updatedAt: new Date()
    };

    const updatedGoals = goals.map(g => (g.id === goalId ? updatedGoal : g));
    setGoals(updatedGoals);
    saveLocalGoals(updatedGoals);

    if (userId === 'local-guest-session' || isOfflineFallback) return;

    const goalDocRef = doc(db, 'users', userId, 'goals', goalId);
    try {
      await updateDoc(goalDocRef, {
        savedAmount: newSaved,
        status: newStatus,
        contributions: updatedContribs,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn("Firestore deleteGoalContribution failed, saved locally:", err);
    }
  };

  const exportBackup = async () => {
    if (!userId) return null;
    let allTxs: Transaction[] = [];
    if (userId === 'local-guest-session' || isOfflineFallback) {
      allTxs = transactions;
    } else {
      try {
        const txRef = collection(db, 'users', userId, 'transactions');
        const q = query(txRef, orderBy('date', 'desc'));
        const querySnap = await getDocs(q);
        querySnap.forEach((docSnap) => {
          const data = docSnap.data();
          allTxs.push({
            ...data,
            id: docSnap.id,
            date: data.date?.toDate ? data.date.toDate().toISOString() : new Date(data.date).toISOString(),
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString()),
          } as any);
        });
      } catch (err) {
        console.warn("Failed to fetch transactions for backup:", err);
        allTxs = transactions;
      }
    }

    return {
      backupTimestamp: new Date().toISOString(),
      ownerEmail: settings?.email || 'unknown',
      customers: customers.map(c => ({
        name: c.name,
        phone: c.phone,
        outstandingDue: c.outstandingDue,
        createdAt: c.createdAt
      })),
      ledgerTransactions: allTxs.map(t => ({
        customer: t.customerName,
        type: t.type,
        amount: t.amount,
        description: t.description,
        date: t.date
      }))
    };
  };

  return {
    customers,
    trashCustomers,
    customerTransactions: customerTransactions.filter(t => customers.some(c => c.id === t.customerId)),
    dailyTransactions: dailyTransactions.filter(t => customers.some(c => c.id === t.customerId)),
    todayTransactions: todayTransactions.filter(t => customers.some(c => c.id === t.customerId)),
    reminders: reminders.filter(r => r.type === 'emi' || Boolean(r.goalId) || customers.some(c => c.id === r.customerId)),
    settings,
    loading,
    isOfflineFallback,
    updateTheme,
    updateSettings,
    createCustomer,
    updateCustomerDetails,
    addTransaction,
    editTransaction,
    deleteTransaction,
    addReminder,
    toggleReminder,
    deleteReminder,
    deleteCustomer,
    restoreCustomer,
    permanentlyDeleteCustomer,
    emptyTrash,
    importLedgerData,
    activeCustomerTxCount,
    hasMoreCustomerTxs: customerTransactions.length < activeCustomerTxCount && activeCustomerTxCount > 5,
    customerTxLimit,
    loadMoreCustomerTransactions: () => setCustomerTxLimit(prev => prev + 10),
    resetCustomerTxLimit: () => setCustomerTxLimit(5),
    monthlySummaries: effectiveMonthlySummaries,
    goals,
    goalsSynced,
    createGoal,
    addGoalContribution,
    deleteGoal,
    updateGoalStatus,
    updateGoalTitle,
    editGoalContribution,
    deleteGoalContribution,
    exportBackup,
    rebuildMonthlySummaries: () => rebuildMonthlySummaries(userId)
  };
}