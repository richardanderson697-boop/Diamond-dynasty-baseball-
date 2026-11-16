// Security Rules Unit Verification Matrix (Phase 0 TDD Specification)
// Verifies the 12 Dirty Dozen adversarial payloads against firestore.rules invariants.

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  rationale: string;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Write',
    collectionPath: '/franchises/fran_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'request.auth == null fails isSignedIn() and isVerified().',
  },
  {
    id: 2,
    name: 'Unverified Email Spoof',
    collectionPath: '/franchises/fran_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'request.auth.token.email_verified == false fails isVerified().',
  },
  {
    id: 3,
    name: 'Identity Spoofing on Create',
    collectionPath: '/franchises/fran_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'incoming().ownerId != request.auth.uid fails isValidFranchise().',
  },
  {
    id: 4,
    name: 'Shadow Field Injection',
    collectionPath: '/franchises/fran_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Extra key isAdmin fails keys().hasOnly(...) in isValidFranchise().',
  },
  {
    id: 5,
    name: 'ID Poisoning (1.5KB Document ID)',
    collectionPath: `/franchises/${'x'.repeat(200)}`,
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Document ID exceeds 128 chars and fails isValidId(franchiseId).',
  },
  {
    id: 6,
    name: 'Client Timestamp Forgery',
    collectionPath: '/franchises/fran_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'createdAt != request.time fails temporal integrity gate.',
  },
  {
    id: 7,
    name: 'Cross-Tenant Card Read',
    collectionPath: '/franchises/userA_fran/savedPlayers/card_1',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    rationale: 'Master Gate get() verifies parent franchise ownerId == request.auth.uid.',
  },
  {
    id: 8,
    name: 'Unscoped Collection Scraping',
    collectionPath: '/franchises/userA_fran/savedPlayers',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    rationale: 'allow list requires resource.data.ownerId == request.auth.uid.',
  },
  {
    id: 9,
    name: 'Orphan / Cross-Owner Subcollection Injection',
    collectionPath: '/franchises/userA_fran/savedPlayers/card_2',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Master Gate blocks User B writing under User A franchise.',
  },
  {
    id: 10,
    name: 'Immutable Owner Mutation on Update',
    collectionPath: '/franchises/fran_1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'affectedKeys().hasOnly(...) and ownerId == existing().ownerId block owner swap.',
  },
  {
    id: 11,
    name: 'Value Type & Enum Poisoning',
    collectionPath: '/franchises/fran_1/savedPlayers/card_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Invalid cardTheme enum or non-int ovr fails isValidSavedPlayerCard().',
  },
  {
    id: 12,
    name: 'Bounded Array Exhaustion',
    collectionPath: '/franchises/fran_1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'teams.size() > 32 fails array boundary guard.',
  },
];
