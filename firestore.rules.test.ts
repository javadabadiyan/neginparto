/**
 * Firestore Security Rules Adversarial Verification Suite ("Dirty Dozen" Payloads)
 * Designed for execution against the Firebase Rules Unit Testing Emulator.
 */
import assert from 'node:assert/strict';

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'get' | 'list';
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on Personnel Create',
    collectionPath: 'personnel/p_shadow_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@org.ir', email_verified: true },
    payload: {
      id: 'p_shadow_1',
      ownerUid: 'user_1',
      accessUids: ['user_1'],
      personnelCode: '9001',
      fullName: 'Test User',
      employmentType: 'رسمی',
      status: 'فعال',
      baseSalary: 100000000,
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Email Spoofing Without Verification',
    collectionPath: 'personnel/p_spoof_2',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'javadabadiyangoshi@gmail.com', email_verified: false },
    payload: { id: 'p_spoof_2', ownerUid: 'attacker_uid' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Self-Assigned Admin Escalation',
    collectionPath: 'admins/attacker_uid',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'attacker@evil.com', email_verified: true },
    payload: { uid: 'attacker_uid', email: 'attacker@evil.com', role: 'super_admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Owner UID Spoofing',
    collectionPath: 'karaneh/k_spoof_4',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@org.ir', email_verified: true },
    payload: {
      id: 'k_spoof_4',
      ownerUid: 'victim_uid',
      accessUids: ['user_1'],
      personnelCode: '10101',
      fullName: 'Victim',
      period: '1403-08',
      baseKaraneh: 1000,
      overtimeBonus: 0,
      deductions: 0,
      finalKaraneh: 1000,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Client Timestamp Forgery',
    collectionPath: 'jobGroups/jg_time_5',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@org.ir', email_verified: true },
    payload: {
      id: 'jg_time_5',
      ownerUid: 'user_1',
      accessUids: ['user_1'],
      code: 'G99',
      title: 'Forged Time',
      grade: 10,
      minBaseSalary: 100,
      maxBaseSalary: 200,
      maxKaranehCeiling: 50,
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'ID Poisoning with Oversized or Invalid Characters',
    collectionPath: `personnel/${'A'.repeat(200)}`,
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@org.ir', email_verified: true },
    payload: { id: 'A'.repeat(200), ownerUid: 'user_1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Denial-of-Wallet String Bloat',
    collectionPath: 'karaneh/k_bloat_7',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@org.ir', email_verified: true },
    payload: {
      id: 'k_bloat_7',
      ownerUid: 'user_1',
      accessUids: ['user_1'],
      personnelCode: '10101',
      fullName: 'Bloat',
      period: '1403-08',
      baseKaraneh: 0,
      overtimeBonus: 0,
      deductions: 0,
      finalKaraneh: 0,
      notes: 'X'.repeat(5000),
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'PII Blanket Read Across User Private Info',
    collectionPath: 'users/victim_uid/private/info',
    operation: 'get',
    auth: { uid: 'non_owner_uid', email: 'other@org.ir', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Unscoped Collection List Query Without Owner Filter',
    collectionPath: 'personnel',
    operation: 'list',
    auth: { uid: 'non_admin_uid', email: 'other@org.ir', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Terminal Commitment State Tampering by Non-Admin',
    collectionPath: 'commitments/cmt_terminal_10',
    operation: 'update',
    auth: { uid: 'user_1', email: 'user1@org.ir', email_verified: true },
    payload: { amount: 999999999 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Value Poisoning on Whitelisted Update Field',
    collectionPath: 'commitments/cmt_poison_11',
    operation: 'update',
    auth: { uid: 'user_1', email: 'user1@org.ir', email_verified: true },
    payload: { isArchived: 'not-a-boolean' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Orphaned Personnel Subcollection Document',
    collectionPath: 'personnel/non_existent_parent/documents/doc_12',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@org.ir', email_verified: true },
    payload: {
      id: 'doc_12',
      personnelId: 'non_existent_parent',
      ownerUid: 'user_1',
      docType: 'national_card',
      dataUrl: 'data:image/png;base64,AAAA',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 13,
    name: 'Orphaned Personnel Relative Subcollection Record',
    collectionPath: 'personnel/non_existent_parent/relatives/rel_13',
    operation: 'create',
    auth: { uid: 'user_1', email: 'user1@org.ir', email_verified: true },
    payload: {
      id: 'rel_13',
      personnelId: 'non_existent_parent',
      ownerUid: 'user_1',
      fullName: 'علی رضایی',
      relation: 'فرزند (پسر)',
    },
    expected: 'PERMISSION_DENIED',
  },
];

assert.equal(DIRTY_DOZEN_CASES.length, 13, 'Must define all 13 adversarial payloads');
