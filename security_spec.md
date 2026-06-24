# Security Specification for Easy Due Tracker

## 1. Data Invariants

1. **User Ownership Isolation**: A user can only read, create, update, or delete records where the `{userId}` in the path matches their authenticated `request.auth.uid`. No user can access or tamper with another user's customers, transactions, or settings.
2. **Customer Balance Integrity**: High-level balance changes must correspond to transaction logs (handled by transactions, but verified types on client-side writes).
3. **Immutable Identifiers**: Fields critical to identity tracking (e.g., `userId`, `customerId`, `createdAt`) are immutable after creation.
4. **Valid Names and Numbers**: Customer name must be a realistic non-empty string under 100 characters. Transaction amount must be a positive number.
5. **System Timestamps**: Creation and update timestamps are backed by `request.time`.

---

## 2. The "Dirty Dozen" Payloads (Denial Scenarios)

These represent payloads attempting to breach our data invariants. They must all yield `PERMISSION_DENIED`:

1. **Identity Spoofing - Impersonating User in Path**:
   Attempt to create a customer under user `A` while authenticated as user `B`.
   `Path: /users/userA/customers/cust1` (Authenticated as `userB`)

2. **Privilege Escalation on User Preferences**:
   Attempt to write settings containing administrative flags that aren't defined.
   `Path: /users/userA` (Authenticated as `userA`) with fields: `{ "uid": "userA", "isAdmin": true, ... }`

3. **Orphaned Customer Creation**:
   Attempt to create a customer without specifying a valid, matching `userId` property.
   `Path: /users/userA/customers/cust1` with payload containing `userId: "userX"`.

4. **Empty Customer Name**:
   Attempt to register a customer with an empty name or whitespace-only name.
   `Path: /users/userA/customers/cust1` with `name: ""`.

5. **Exorbitant String Injection (Denial of Wallet)**:
   Attempt to inject a 10MB string as the customer name.
   `Path: /users/userA/customers/cust1` with `name: "A..."` (10KB+).

6. **Invalid Customer ID Format**:
   Attempt to use path variables with special characters like nested paths or escape sequences.
   `Path: /users/userA/customers/cust_$$$!%^`

7. **Negative Transaction Amount**:
   Attempt to log a due transaction with an amount <= 0.
   `Path: /users/userA/transactions/tx1` with `amount: -250`.

8. **Shadow Field Injection on Customer**:
   Attempt to slip an unverified custom field `"hackEnabled": true` into a Customer document.
   `Path: /users/userA/customers/cust1`

9. **Bypassing Server Timestamp for Creation**:
   Attempt to supply a client-side hardcoded timestamp for `createdAt`.
   `Path: /users/userA/customers/cust1` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`.

10. **Tampering with Immortal Fields (Immutability Violation)**:
    Attempt to update the `customerId` of an existing transaction.
    `Path: /users/userA/transactions/tx1`, modifying `customerId` from `cust1` to `cust2`.

11. **Altering Creation Date on Update**:
    Attempt to change the `createdAt` timestamp during an update.
    `Path: /users/userA/customers/cust1` resetting `createdAt` to a different time.

12. **Blanket Query Attempt (No Filter)**:
    Attempting an `allow list` query spanning all users' customers or transactions without bounding queries to the authenticated user ID.

---

## 3. The Test Runner

The Firestore Emulator can run the test suite to secure these boundaries. The test file `firestore.rules.test.ts` will demonstrate the protection. Runs validation before final rules deployment.
