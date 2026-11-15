# Security Specification — 古文単語 40選 (No.41–80)

## 1. Data Invariants
1. **Strict User Isolation (PII & Progress)**: A user's `users/{userId}` profile (containing email and displayName) and all subcollections (`wordProgress`, `studySessions`) are strictly readable and writable only by the authenticated, email-verified user whose `request.auth.uid == userId`.
2. **Master Gate Relational Sync**: Documents in `users/{userId}/wordProgress/{wordId}` and `users/{userId}/studySessions/{sessionLogId}` cannot exist or be written unless the parent `users/{userId}` document exists and its `uid` matches `request.auth.uid`.
3. **Immutable Ownership & Creation Timestamps**: `uid`, `userId`, `createdAt`, `wordId`, and `wordNumber` cannot be altered on updates. `createdAt`, `updatedAt`, `lastStudiedAt`, and `completedAt` must strictly equal `request.time`.
4. **Strict Schema & Bounds**: Every document enforces exact `hasAll` and `hasOnly` key sets, valid integer bounds (`masteryLevel` 0..5, `wordNumber` 41..80, non-negative counts), bounded array lengths (`completedSessions <= 10`, `mistakenWordIds <= 40`), and bounded string lengths.
5. **Immutable Session Logs**: Completed `studySessions` logs cannot be updated after creation (`allow update: if false`).
6. **No Blanket List / No Client Query Trust**: `/users` forbids `list` entirely. Subcollection `list` rules require `isOwner(userId) && resource.data.userId == request.auth.uid`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read/Write**: Unauthenticated user attempts `get` or `create` on `/users/uid1` -> `PERMISSION_DENIED`.
2. **Cross-User PII Read**: Authenticated `uid2` attempts `get` on `/users/uid1` -> `PERMISSION_DENIED`.
3. **Directory Enumeration (List Users)**: Authenticated `uid1` attempts `list` on `/users` -> `PERMISSION_DENIED`.
4. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts `create` on `/users/uid1` -> `PERMISSION_DENIED`.
5. **Identity Spoofing on Create**: `uid1` attempts `create` on `/users/uid1/wordProgress/w41` with `userId: "uid2"` -> `PERMISSION_DENIED`.
6. **Shadow / Ghost Field Injection**: `uid1` attempts `create` or `update` on `/users/uid1` with extra key `isAdmin: true` -> `PERMISSION_DENIED`.
7. **ID Poisoning**: `uid1` attempts `create` on `/users/uid1/wordProgress/../../../etc/passwd` or 200-char ID -> `PERMISSION_DENIED`.
8. **Out-of-Range Word Number / Mastery**: `uid1` attempts `create` on `/users/uid1/wordProgress/w41` with `masteryLevel: 99` or `wordNumber: 999` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: `uid1` attempts `create` on `/users/uid1` with `createdAt` set to a custom past timestamp instead of `request.time` -> `PERMISSION_DENIED`.
10. **Immutable Field Mutation**: `uid1` attempts `update` on `/users/uid1` changing `createdAt` or `uid` -> `PERMISSION_DENIED`.
11. **Terminal State Mutation (Session Log Tampering)**: `uid1` attempts `update` on `/users/uid1/studySessions/log1` to inflate `firstTryCorrect` -> `PERMISSION_DENIED`.
12. **Array Overflow / Denial of Wallet**: `uid1` attempts `create` on `/users/uid1` with `completedSessions` array containing 25 items or 500-char strings -> `PERMISSION_DENIED`.
