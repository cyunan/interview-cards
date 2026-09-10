# Remembered Device Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an opted-in browser profile to unlock the current encrypted card publication after refresh without persisting the plaintext password.

**Architecture:** Derive the existing per-publication AES-GCM key once, store the non-exportable `CryptoKey` and public envelope metadata in a separate IndexedDB database, and validate both metadata and authenticated decryption before restoring cards. The React app waits for this check before rendering the password form, then deletes the remembered key when the user locks.

**Tech Stack:** React 19, TypeScript, Web Crypto API, IndexedDB via `idb`, Vitest, Testing Library, Playwright.

## Global Constraints

- Do not persist the plaintext password in browser storage, URLs, logs, environment files, or build output.
- Keep PBKDF2-HMAC-SHA256 600,000 iterations, AES-256-GCM, random per-publication salt and IV unchanged.
- Cache only application assets and `cards.enc.json`; never cache decrypted card content.
- A storage or browser capability failure must degrade to ordinary password unlock.
- A changed publication salt/build ID invalidates the remembered key and requires one password unlock.
- Manual lock clears both in-memory payload and the remembered device key.

### Task 1: Cryptographic session-key primitives

**Files:**
- Modify: `src/crypto/envelope.ts`
- Test: `src/crypto/envelope.test.ts`

- [x] Add failing coverage for deriving a non-exportable key and decrypting with it.
- [x] Implement `deriveEnvelopeKey` and `decryptEnvelopeWithKey` using the existing envelope validation and authenticated-decryption path.
- [x] Run the crypto tests and verify the existing password API remains compatible.

### Task 2: IndexedDB remembered-key store

**Files:**
- Create: `src/security/remembered-unlock.ts`
- Test: `src/security/remembered-unlock.test.ts`

- [x] Add failing coverage for storing one record without the password.
- [x] Implement a separate `interview-cards-unlock` database with one `keys` record containing `CryptoKey`, `buildId`, salt and timestamp.
- [x] Make `get`, `put`, `clear` and `close` failures safe for optional functionality.

### Task 3: Envelope loading and restore flow

**Files:**
- Modify: `src/app/load-cards.ts`
- Test: `src/app/load-cards.test.ts`

- [x] Add failing coverage for session-key return, matching restore and publication-salt invalidation.
- [x] Return a password-unlock session containing parsed payload, envelope and key.
- [x] Restore only when the stored public metadata matches; preserve the record for an offline cache miss and clear it for mismatch or authenticated-decryption failure.

### Task 4: React unlock experience

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/UnlockScreen.tsx`
- Modify: `src/app/app.css`
- Test: `src/app/App.test.tsx`

- [x] Add failing coverage for startup checking, remembered restore, opt-in persistence and manual lock cleanup.
- [x] Hold the password page until remembered-key checking finishes to prevent a flash.
- [x] Add an unchecked “记住此设备” option and `current-password` autocomplete.
- [x] Keep ordinary password unlock working when IndexedDB or remembered-key persistence is unavailable.

### Task 5: Browser regression coverage and documentation

**Files:**
- Modify: `tests/app.spec.ts`
- Modify: `README.md`

- [x] Add Chromium/WebKit coverage for opted-in refresh restore while retaining the no-memory refresh case.
- [x] Document the key-storage boundary, manual lock behavior and re-verification after publication changes.
- [x] Run `npm run verify`, `npm run test:e2e` and `git diff --check`.
