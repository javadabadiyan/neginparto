# Security Specification — Persian HR, Karaneh & Payroll Portal

## 1. Data Invariants
1. **Default-Deny & Zero-Trust**: Any unmatched path under `/databases/{database}/documents` is unconditionally denied (`allow read, write: if false`).
2. **Verified Identity**: All reads and writes (except `/test/connection` diagnostic check) require `request.auth != null && request.auth.token.email_verified == true`.
3. **Bootstrapped Super Admin & DB-Backed Admin Registry**: Only `javadabadiyangoshi@gmail.com` (with `email_verified == true`) or UIDs registered in `/admins/{uid}` possess administrative privileges. Custom JWT claims (`request.auth.token.role` or `.admin`) are never trusted.
4. **PII Isolation**: User contact PII (`email`, `phone`, `lastLogin`) is isolated under `/users/{userId}/private/{infoId}` and restricted strictly to the owning user (`isOwner(userId)`) or an admin (`isAdmin()`). Personnel dossiers contain PII (`nationalId`, `phone`, `email`) and are never exposed via blanket `isSignedIn()` reads.
5. **Relational & Subcollection Master Gate**:
   - `/personnel/{personnelId}/documents/{docId}` enforces `get()` on parent `/personnel/{personnelId}` to verify active ownership or admin authority.
   - `/karaneh/{recordId}` and `/commitments/{commitmentId}` enforce `exists()` on `/personnel/$(personnelId)` whenever a `personnelId` reference is provided.
6. **Temporal & Immutable Field Integrity**:
   - `createdAt` must equal `request.time` on `create` and remain immutable (`incoming().createdAt == existing().createdAt`) on `update`.
   - `updatedAt` must equal `request.time` on both `create` and `update`.
   - `ownerUid` must equal `request.auth.uid` on `create` and remain immutable on `update`.
7. **Terminal State Locking**:
   - Committed instruments (`PersonnelCommitment`) whose `status` is `'پایان یافته'`, `'عودت داده شده'`, or `'به اجرا گذاشته شده'` cannot be mutated by non-admin contributors; only `isAdmin()` can override terminal states.
8. **No `get()`/`exists()` inside `allow list`**:
   - All `allow list` rules strictly evaluate `resource.data` (or `isBootstrappedAdmin()`) to guarantee bounded cost and no `O(n)` read explosions.

## 2. The "Dirty Dozen" Payloads (Adversarial Security Test Cases)
1. **Shadow Field Injection on Personnel Create**: Sending `{ ..., "isAdmin": true }` or `{ ..., "ghostField": 123 }` to `/personnel/{id}` → Rejected by `hasOnly(...)` in `isValidPersonnel`.
2. **Email Spoofing Without Verification**: Authenticating with `email: "javadabadiyangoshi@gmail.com"` and `email_verified: false` → Rejected by `isEmailVerified()`.
3. **Self-Assigned Admin Escalation**: Non-admin user creating `/admins/{theirUid}` with `{ uid: theirUid, email: "attacker@evil.com", role: "super_admin", createdAt: request.time }` → Rejected by `allow write: if isAdmin()`.
4. **Owner UID Spoofing**: Non-admin creating `/personnel/p_fake` with `ownerUid: "another_user_uid"` → Rejected by `incoming().ownerUid == request.auth.uid`.
5. **Client Timestamp Forgery**: Creating a `/karaneh/k_1` document with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time` → Rejected by `incoming().createdAt == request.time`.
6. **ID Poisoning / Oversized Document ID**: Attempting `setDoc` on `/personnel/` + 300-character ID or ID containing `/` or `$` → Rejected by `isValidId(personnelId)`.
7. **Denial-of-Wallet String Bloat**: Updating `notes` on `/karaneh/{id}` with a 50,000-character string → Rejected by `notes.size() <= 1000`.
8. **PII Blanket Read**: Authenticated non-admin, non-owner user performing `getDoc` on `/users/otherUserId/private/info` or `/personnel/otherPersonnelId` → Rejected by owner/accessUids/admin check.
9. **Unscoped List Query**: Authenticated non-admin running `getDocs(collection(db, "personnel"))` without matching `where("ownerUid", "==", uid)` or `where("accessUids", "array-contains", uid)` → Rejected by `allow list`.
10. **Terminal Commitment State Tampering**: Non-admin contributor modifying `amount` of a `/commitments/{id}` record whose `status` is `'پایان یافته'` → Rejected by terminal state lock.
11. **Value Poisoning on Update**: Whitelisted action update on `/commitments/{id}` changing `isArchived` to string `"yes"` instead of `boolean` → Rejected because `isValidPersonnelCommitment(incoming())` wraps the entire `allow update` block.
12. **Orphaned Personnel Document**: Creating `/personnel/nonExistentId/documents/doc1` when parent `/personnel/nonExistentId` does not exist → Rejected by parent `get()` gate.
