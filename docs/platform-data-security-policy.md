# Sally's Bar — Platform Data Security Policy

**Owner:** Sally's Bar (Skala, Kefalonia, Greece)
**Effective date:** 2026-04-20
**Scope:** All Platform Data received from Meta (name, email, Facebook user ID, profile data, access tokens) through Facebook Login used by the Sally's Bar loyalty application.

---

## 1. Data Sensitivity Classification

All Platform Data received from Meta is classified as **Confidential (highest sensitivity tier)** and is subject to the protections described in this document. This classification applies regardless of where or how the data is processed.

---

## 2. Encryption at Rest (REQUIRED)

**All Platform Data stored in our backend environment MUST be protected with encryption at rest at all times.**

- Platform Data is stored exclusively in our managed Supabase (PostgreSQL) database.
- Supabase enforces **AES-256 encryption at rest** on all database storage, backups, and object storage buckets by default.
- Encryption at rest is applied to:
  - Primary database tables containing user profile data (name, email)
  - Automated database backups
  - Any file/object storage (e.g., uploaded assets)
- No Platform Data is stored in any system that does not provide encryption at rest.
- Writing Platform Data to unencrypted storage (local disk, USB drives, email, spreadsheets, etc.) is strictly prohibited.

> **Highlighted requirement:** Platform Data must never be stored in any backend system that lacks AES-256 (or equivalent) encryption at rest.

---

## 3. Encryption in Transit

- All network transmission of Platform Data uses **TLS 1.2 or higher**.
- SSL 2.0 and SSL 3.0 are never used.
- Cloudflare and Supabase enforce TLS 1.2+ on all public endpoints.

---

## 4. No Local / Device Storage

- Platform Data must **never** be stored on laptops, personal devices, USB drives, removable storage, or personal cloud accounts (Dropbox, Google Drive, etc.).
- Platform Data is only stored in the approved Supabase backend environment.

---

## 5. Access Control

- Access to Platform Data in the backend is restricted to the application owner.
- Multi-factor authentication (MFA) is enforced on all administrative tools: Cloudflare, Supabase, GitHub, and Google Workspace.

---

## 6. Deletion

Platform Data is deleted when:
- The user deletes their loyalty account
- The user requests deletion (via email or in-app)
- Retention is no longer necessary for providing the service
- Required by applicable law (GDPR)

---

## 7. Policy Acknowledgement

All personnel with access to the Sally's Bar backend environment are informed of this policy during onboarding and must acknowledge compliance. As the sole operator, the application owner has reviewed and acknowledged this policy.

---

**Acknowledged by:** Nikolaos Katsilidis (Owner/Operator)
**Date:** 2026-04-20
