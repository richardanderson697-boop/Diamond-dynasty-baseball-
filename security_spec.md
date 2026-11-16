# Firestore Security Specification — Diamond Dynasty GM

## 1. Data Invariants
1. **Franchise Ownership**: Every `/franchises/{franchiseId}` document must have `ownerId == request.auth.uid`, valid `userTeamId`, valid `phase`, `teams.size() <= 32`, and server-enforced `createdAt`/`updatedAt == request.time`.
2. **Master Gate Sync**: Every subcollection document (`stateChunks`, `savedPlayers`, `seasonSnapshots`, `records`) under `/franchises/{franchiseId}` must carry `ownerId == request.auth.uid` AND `franchiseId == franchiseId`, and single-document operations must verify via `get()` that the parent `/franchises/{franchiseId}` exists and belongs to `request.auth.uid`.
3. **Zero Client Query Trust**: Every `allow list` rule enforces `resource.data.ownerId == request.auth.uid` directly without any `get()` or `exists()` calls.
4. **Strict Payload & Shadow Field Rejection**: Every entity enforces `keys().hasAll(...)` and `keys().hasOnly(...)` alongside field-level type, length, enum, and bounded array size checks.
5. **Immutable Identity & Timestamps**: `ownerId`, `franchiseId`, and `createdAt` can never be mutated on update.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Franchise Read/Write**: Anonymous caller attempts to `create` `/franchises/f1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: Caller with `email_verified: false` attempts to `create` a franchise -> `PERMISSION_DENIED`.
3. **Owner Spoofing on Create**: User A sets `ownerId: "userB"` when creating `/franchises/f1` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection on Franchise**: User A includes `isAdmin: true` in `/franchises/f1` -> `PERMISSION_DENIED`.
5. **Oversized ID Poisoning**: User A writes to `/franchises/${"a".repeat(200)}` -> `PERMISSION_DENIED`.
6. **Client Timestamp Forgery**: User A supplies a static past date for `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
7. **Cross-Tenant Subcollection Read**: User B attempts `get` on `/franchises/userA_franchise/savedPlayers/card1` -> `PERMISSION_DENIED`.
8. **Cross-Tenant List Scraping**: User B runs an unfiltered `list` query on `savedPlayers` without matching `ownerId` -> `PERMISSION_DENIED`.
9. **Parent Franchise Hijack**: User B creates a `savedPlayers` card under User A's `franchiseId` with `ownerId: "userB"` -> `PERMISSION_DENIED` (blocked by Master Gate `get()`).
10. **Owner Mutation on Update**: User A attempts to change `ownerId` on an existing `/franchises/f1` -> `PERMISSION_DENIED`.
11. **Invalid Enum / Value Poisoning**: User A submits `cardTheme: "HACKED_THEME"` or `ovr: "99"` (string instead of int) on `savedPlayers` -> `PERMISSION_DENIED`.
12. **Unbounded Array Exhaustion**: User A submits 50 teams in `teams` array (max 32) or 100 items in `seasonHistory` (max 30) -> `PERMISSION_DENIED`.
