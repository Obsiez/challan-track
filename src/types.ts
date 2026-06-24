export interface UserSettings {
  uid: string;
  email: string;
  theme: 'light' | 'dark';
  dailyReminderTime: string; // e.g. "09:00"
  createdAt: any; // Firestore Timestamp or ISO string
  updatedAt: any;
}

export interface Customer {
  id: string;
  userId: string;
  name: string;
  phone: string;
  outstandingDue: number; // calculated balance sum
  createdAt: any;
  updatedAt: any;
}

export interface Transaction {
  id: string;
  userId: string;
  customerId: string;
  customerName: string;
  type: 'due' | 'payment';
  amount: number;
  description: string;
  date: any;
  createdAt: any;
}

export interface Reminder {
  id: string;
  userId: string;
  customerId: string;
  customerName: string;
  notes: string;
  dueDate: any; // Target pay date
  active: boolean;
  createdAt: any;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}
