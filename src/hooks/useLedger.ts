import { useState, useEffect } from 'react';
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
 writeBatch
} from 'firebase/firestore';
import { db, auth, OperationType } from '../firebase';
import { Customer, Transaction, Reminder, UserSettings } from '../types';

export function useLedger(userId: string | undefined) {
 const [customers, setCustomers] = useState<Customer[]>([]);
 const [trashCustomers, setTrashCustomers] = useState<Customer[]>([]);
 const [transactions, setTransactions] = useState<Transaction[]>([]);
 const [reminders, setReminders] = useState<Reminder[]>([]);
 const [settings, setSettings] = useState<UserSettings | null>(null);
 const [loading, setLoading] = useState(true);
 const [isOfflineFallback, setIsOfflineFallback] = useState(false);

 // Helper: Load all ledger data from local storage
 const loadLocalData = () => {
 if (!userId) return;
 try {
 const storedCustomers = localStorage.getItem(`easy_due_customers_${userId}`);
 const storedTxs = localStorage.getItem(`easy_due_transactions_${userId}`);
 const storedReminders = localStorage.getItem(`easy_due_reminders_${userId}`);
 const storedSettings = localStorage.getItem(`easy_due_settings_${userId}`);

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

 // Load cache immediately on userId change to populate UI with 0ms delay
 useEffect(() => {
 if (userId) {
 loadLocalData();
 // If we already have cached customers, hide initial loader to show dashboard instantly
 const storedCustomers = localStorage.getItem(`easy_due_customers_${userId}`);
 if (storedCustomers && JSON.parse(storedCustomers).length > 0) {
 setLoading(false);
 } else {
 setLoading(true);
 }
 } else {
 setCustomers([]);
 setTransactions([]);
 setReminders([]);
 setSettings(null);
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
 const q = query(customersRef, orderBy('updatedAt', 'desc'));

 const storedCustomers = localStorage.getItem(`easy_due_customers_${userId}`);
 if (!storedCustomers || JSON.parse(storedCustomers).length === 0) {
 setLoading(true);
 }
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
  setLoading(false);
 }, (error) => {
 console.warn("Firestore error syncing customers list, using offline cache fallback:", error);
 loadLocalData();
 setLoading(false);
 });

 return () => unsubscribe();
 }, [userId]);

 // 3. Sync Transactions collection
 useEffect(() => {
 if (!userId) return;
 if (userId === 'local-guest-session' || isOfflineFallback) {
 return;
 }

 const txRef = collection(db, 'users', userId, 'transactions');
 const q = query(txRef, orderBy('date', 'desc'));

 const unsubscribe = onSnapshot(q, (snapshot) => {
 const list: Transaction[] = [];
 snapshot.forEach((docSnap) => {
 const data = docSnap.data();
 list.push({
 ...data,
 id: docSnap.id,
 date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
 createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
 } as Transaction);
 });
 setTransactions(list);
 saveLocalTransactions(list);
 }, (error) => {
 console.warn("Firestore error syncing transactions, using offline cache fallback:", error);
 loadLocalData();
 });

 return () => unsubscribe();
 }, [userId]);

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
 const addTransaction = async (
 customerId: string, 
 type: 'due' | 'payment', 
 amount: number, 
 description: string = '', 
 date: Date = new Date(),
 fallbackCustomerInfo?: { name: string; phone: string }
 ) => {
 if (!userId) return;
 
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

    const tx = transactions.find(t => t.id === transactionId);
    if (!tx) return;

    const diffOld = tx.type === 'due' ? -tx.amount : tx.amount; // reverse old effect
    const diffNew = newType === 'due' ? newAmount : -newAmount; // apply new effect
    const netDiff = diffOld + diffNew;

    const updatedTxs = transactions.map(t => 
      t.id === transactionId 
        ? { ...t, type: newType, amount: newAmount, description: newDescription.trim() } 
        : t
    );

    const updatedCustomers = customers.map(c => 
      c.id === tx.customerId 
        ? { ...c, outstandingDue: c.outstandingDue + netDiff, updatedAt: new Date() }
        : c
    );

    setTransactions(updatedTxs);
    setCustomers(updatedCustomers);
    saveLocalTransactions(updatedTxs);
    saveLocalCustomers(updatedCustomers);

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

    try {
      await batch.commit();
    } catch (err) {
      console.warn("Firestore editTransaction failed, saved locally:", err);
    }
  };

  // Delete a transaction
  const deleteTransaction = async (transactionId: string) => {
    if (!userId) return;

    const tx = transactions.find(t => t.id === transactionId);
    if (!tx) return;

    const diff = tx.type === 'due' ? -tx.amount : tx.amount;

    const updatedTxs = transactions.filter(t => t.id !== transactionId);
    const updatedCustomers = customers.map(c => 
      c.id === tx.customerId 
        ? { ...c, outstandingDue: c.outstandingDue + diff, updatedAt: new Date() }
        : c
    );

    setTransactions(updatedTxs);
    setCustomers(updatedCustomers);
    saveLocalTransactions(updatedTxs);
    saveLocalCustomers(updatedCustomers);

    if (userId === 'local-guest-session' || isOfflineFallback) return;

    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', userId, 'transactions', transactionId));
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

  // 5. Automatic cleanup of trashed items older than 7 days
  useEffect(() => {
    if (!userId || loading || trashCustomers.length === 0) return;

    const now = new Date().getTime();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    
    const expiredCustomers = trashCustomers.filter(c => {
      if (!c.deletedAt) return false;
      const deletedTime = new Date(c.deletedAt).getTime();
      return (now - deletedTime) > sevenDaysInMs;
    });

    if (expiredCustomers.length > 0) {
      expiredCustomers.forEach(c => {
        permanentlyDeleteCustomer(c.id);
      });
    }
  }, [userId, loading, trashCustomers]);

  return {
    customers,
    trashCustomers,
    transactions: transactions.filter(t => customers.some(c => c.id === t.customerId)),
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
    emptyTrash
  };
}
