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

export function useLedger(
  userId: string | undefined, 
  selectedDailyDate?: Date,
  activeCustomerId?: string | null
) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [trashCustomers, setTrashCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customerTransactions, setCustomerTransactions] = useState<Transaction[]>([]);
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
        const loginTheme = sessionStorage.getItem('login_intent_theme');
        if (loginTheme && loginTheme !== parsed.theme) {
          parsed.theme = loginTheme as 'light' | 'dark';
          saveLocalSettings(parsed);
        }
        sessionStorage.removeItem('login_intent_theme');
        setSettings(parsed);
 } else {
        const loginTheme = sessionStorage.getItem('login_intent_theme') || 'light';
        sessionStorage.removeItem('login_intent_theme');
        setSettings({
          uid: userId,
          email: auth.currentUser?.email || 'guest@challantrack.local',
          theme: loginTheme as 'light' | 'dark',
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
        
        const loginTheme = sessionStorage.getItem('login_intent_theme');
        if (loginTheme && loginTheme !== data.theme) {
          data.theme = loginTheme as 'light' | 'dark';
          updateDoc(userDocRef, { theme: loginTheme, updatedAt: serverTimestamp() }).catch(e => console.warn(e));
        }
        sessionStorage.removeItem('login_intent_theme');

        setSettings(data);
        saveLocalSettings(data);
 } else {
        const loginTheme = sessionStorage.getItem('login_intent_theme') || 'light';
        sessionStorage.removeItem('login_intent_theme');
        
        // Initialize default user settings if not exists
        const defaultSettings: UserSettings = {
          uid: userId,
          email: auth.currentUser?.email || '',
          theme: loginTheme as 'light' | 'dark',
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

// 3. Sync Paginated Customer Transactions (only when a customer profile is open)
  useEffect(() => {
    if (!userId || userId === 'local-guest-session' || isOfflineFallback) {
      return;
    }
    if (!activeCustomerId) {
      setCustomerTransactions([]);
      return;
    }

    const txRef = collection(db, 'users', userId, 'transactions');
    const q = query(
      txRef,
      where('customerId', '==', activeCustomerId),
      orderBy('date', 'desc'),
      limit(customerTxLimit)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Transaction[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          ...data,
          id: docSnap.id,
          date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt).toISOString() : new Date()),
        } as Transaction);
      });
      setCustomerTransactions(list);
    }, (error) => {
      console.warn("Firestore error syncing customer transactions:", error);
    });

    return () => unsubscribe();
  }, [userId, activeCustomerId, customerTxLimit, isOfflineFallback]);

  // 3a. Compute Customer Transactions locally in guest session or offline fallback
  useEffect(() => {
    if (!userId) return;
    if (userId === 'local-guest-session' || isOfflineFallback) {
      if (!activeCustomerId) {
        setCustomerTransactions([]);
        return;
      }
      const filtered = transactions
        .filter(t => t.customerId === activeCustomerId)
        .sort((a, b) => {
          const dateA = a.date instanceof Date ? a.date : new Date(a.date);
          const dateB = b.date instanceof Date ? b.date : new Date(b.date);
          return dateB.getTime() - dateA.getTime();
        })
        .slice(0, customerTxLimit);
      setCustomerTransactions(filtered);
    }
  }, [userId, transactions, activeCustomerId, customerTxLimit, isOfflineFallback]);

// 3b. Sync Daily Archive Transactions (only for past dates when online)
  useEffect(() => {
    if (!userId || userId === 'local-guest-session' || isOfflineFallback || !selectedDailyDate) {
      setArchiveTransactions([]);
      return;
    }

    const filterDateStr = selectedDailyDate.toDateString();
    const isToday = filterDateStr === new Date().toDateString();

    if (isToday) {
      setArchiveTransactions([]);
      return;
    }

    // Archive Date: Query firestore directly for the selected date range
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
      setArchiveTransactions(list);
    }, (error) => {
      console.warn("Firestore error syncing daily archive transactions:", error);
    });

    return () => unsubscribe();
  }, [userId, selectedDailyDate, isOfflineFallback]);

// Compute daily transactions dynamically based on date context
  const dailyTransactions = useMemo(() => {
    if (!selectedDailyDate) return [];
    
    const filterDateStr = selectedDailyDate.toDateString();
    const isToday = filterDateStr === new Date().toDateString();

    if (isToday || isOfflineFallback || userId === 'local-guest-session') {
      return transactions
        .filter(tx => {
          const d = tx.date instanceof Date ? tx.date : new Date(tx.date);
          return d.toDateString() === filterDateStr;
        })
        .sort((a, b) => {
          const dateA = a.date instanceof Date ? a.date : new Date(a.date);
          const dateB = b.date instanceof Date ? b.date : new Date(b.date);
          return dateB.getTime() - dateA.getTime();
        });
    }

    return archiveTransactions;
  }, [transactions, selectedDailyDate, isOfflineFallback, userId, archiveTransactions]);

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
 const q = query(remindersRef, orderBy('dueDate', 'asc'));

 const unsubscribe = onSnapshot(q, (snapshot) => {
 const list: Reminder[] = [];
 snapshot.forEach((docSnap) => {
 const data = docSnap.data();
 list.push({
 ...data,
 id: docSnap.id,
 dueDate: data.dueDate?.toDate ? data.dueDate.toDate() : new Date(data.dueDate),
 createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
 } as Reminder);
 });
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
 theme: 'light' as const,
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
 phone: phone.trim(),
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

 try {
 await batch.commit();
 } catch (err) {
 console.warn("Firestore addTransaction failed, saved locally:", err);
 }
 };

 // Add a reminder for customer
 const addReminder = async (customerId: string, notes: string, dueDate: Date) => {
 if (!userId) return;
 const customer = customers.find(c => c.id === customerId);
 if (!customer) return;

 const customRemId = doc(collection(db, 'temp')).id;
 const newReminder: Reminder = {
 id: customRemId,
 userId,
 customerId,
 customerName: customer.name,
 notes: notes.trim(),
 dueDate,
 active: true,
 createdAt: new Date()
 };

 const updatedReminders = [newReminder, ...reminders];
 setReminders(updatedReminders);
 saveLocalReminders(updatedReminders);

 if (userId === 'local-guest-session' || isOfflineFallback) {
 return;
 }

 const remindersRef = collection(db, 'users', userId, 'reminders');
 const newReminderRef = doc(remindersRef, customRemId);
 try {
 await setDoc(newReminderRef, {
 ...newReminder,
 dueDate,
 createdAt: serverTimestamp()
 });
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
    const updatedReminders = reminders.filter(r => r.customerId !== customerId);
    setTransactions(updatedTxs);
    setReminders(updatedReminders);
    saveLocalTransactions(updatedTxs);
    saveLocalReminders(updatedReminders);

    if (userId === 'local-guest-session' || isOfflineFallback) {
      return;
    }

    const customerDocRef = doc(db, 'users', userId, 'customers', customerId);
    const relatedTxs = transactions.filter(t => t.customerId === customerId);
    const relatedReminders = reminders.filter(r => r.customerId === customerId);

    const batch = writeBatch(db);
    batch.delete(customerDocRef);
    relatedTxs.forEach(tx => {
      batch.delete(doc(db, 'users', userId, 'transactions', tx.id));
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
    const updatedReminders = reminders.filter(r => !idsToDelete.includes(r.customerId));
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
        const relatedReminders = reminders.filter(r => r.customerId === customerId);

        const batch = writeBatch(db);
        batch.delete(customerDocRef);
        relatedTxs.forEach(tx => {
          batch.delete(doc(db, 'users', userId, 'transactions', tx.id));
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
    const trimmedPhone = phone.trim();

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
    setArchiveTransactions([]);

    if (!isLocal) {
      await rebuildMonthlySummaries(userId);
    }
  };

  // 6. Background Migration: Initialize transaction count and monthly summaries if missing
  useEffect(() => {
    if (!userId || userId === 'local-guest-session' || isOfflineFallback || !settings) return;
    if (settings.transactionsCount === undefined) {
      console.log("Initializing transaction count and monthly summaries...");
      rebuildMonthlySummaries(userId).catch(e => console.warn(e));
    }
  }, [userId, settings, isOfflineFallback]);

  // Auto-heal Monthly Summaries: rebuild if user has transactions but summaries is empty
  useEffect(() => {
    if (!userId || userId === 'local-guest-session' || isOfflineFallback || !settings) return;
    const txCount = settings.transactionsCount || 0;
    if (txCount > 0 && monthlySummaries.length === 0) {
      console.log("Monthly summaries empty but user has transactions. Auto-healing summaries...");
      rebuildMonthlySummaries(userId).catch(e => console.warn(e));
    }
  }, [userId, settings?.transactionsCount, monthlySummaries.length, isOfflineFallback]);

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
    customerName?: string
  ) => {
    if (!userId) return null;
    const customGoalId = doc(collection(db, 'temp')).id;
    const newGoal: SavingGoal = {
      id: customGoalId,
      userId,
      title: title.trim(),
      targetAmount,
      savedAmount: 0,
      frequency,
      installmentAmount,
      type,
      customerId,
      customerName,
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
    try {
      await setDoc(goalDocRef, {
        ...newGoal,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
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
  ) => {
    if (!userId) return;

    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    const contributionId = doc(collection(db, 'temp')).id;
    const newContribution: GoalContribution = {
      id: contributionId,
      amount,
      date: new Date().toISOString(),
      note: note.trim()
    };

    const updatedContributions = [...goal.contributions, newContribution];
    const newSavedAmount = goal.savedAmount + amount;
    const isCompleted = newSavedAmount >= goal.targetAmount;
    const newStatus = isCompleted ? 'completed' as const : goal.status;

    const updatedGoals = goals.map(g => 
      g.id === goalId 
        ? { ...g, savedAmount: newSavedAmount, status: newStatus, contributions: updatedContributions, updatedAt: new Date() }
        : g
    );

    setGoals(updatedGoals);
    saveLocalGoals(updatedGoals);

    // Handle optional ledger recording (Recommended Settings: log as gotCash/payment transaction)
    if (recordAsCustomerTransaction && goal.customerId && goal.customerName) {
      await addTransaction(
        goal.customerId,
        'payment',
        amount,
        note.trim() || `${note.trim() || 'Installment'} - ${goal.title}`,
        new Date(),
        { name: goal.customerName, phone: '' }
      );
    }

    if (userId === 'local-guest-session' || isOfflineFallback) return;

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
    reminders: reminders.filter(r => customers.some(c => c.id === r.customerId)),
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
    monthlySummaries,
    goals,
    goalsSynced,
    createGoal,
    addGoalContribution,
    deleteGoal,
    updateGoalStatus,
    exportBackup,
    rebuildMonthlySummaries: () => rebuildMonthlySummaries(userId)
  };
}