export const HELP_TOPICS = {
    architecture: `# Architecture

This page describes the cross-cutting patterns shared across the VibeSQL product family.

## Envelope Encryption Pattern

vsql-vault, vsql-backup, and vsql-sync all use **envelope encryption**. The pattern separates the key that encrypts data (DEK) from the key that protects the DEK (KEK).

\`\`\`
plaintext
   |
   v  AES-256-GCM (DEK)
ciphertext  -->  stored

DEK  -->  RSA wrap (KEK)  -->  wrapped DEK stored alongside ciphertext
\`\`\`

**Why envelope encryption?**
- The DEK can be rotated or revoked by replacing only the wrapped DEK — no re-encryption of data required.
- The KEK never touches the data storage layer; it lives in CryptAply.
- Compromising one DEK affects only the data it encrypted, not the KEK or other DEKs.

| Product | DEK scope | KEK source |
|---------|-----------|------------|
| vsql-vault | Per blob | CryptAply (RSA) |
| vsql-backup | Per backup set | CryptAply (RSA) |
| vsql-sync | Per session/batch | CryptAply (RSA) |

## Hash Chains

vsql-sync uses a **hash chain** to guarantee audit trail integrity. Each audit entry includes the hash of the previous entry. Any modification to a historical entry breaks the chain from that point forward, making tampering immediately detectable during verification.

## Merkle Trees (Backup Manifest Verification)

vsql-backup organizes its SHA-256 segment hashes into a **Merkle tree**. Each leaf is the hash of one backup segment. Parent nodes are hashes of their children. The root hash represents the entire backup set. To verify any single segment, you only need the segment's sibling hashes along the path to the root.

## Ed25519 Signing (Sync Audit Entries)

vsql-sync signs each audit trail entry with an **Ed25519** private key held by CryptAply. 64-byte signatures, fast verification, no key material on sync nodes.

## Dev vs Prod Mode

| Feature | Dev mode | Prod mode |
|---------|----------|-----------|
| TLS | Optional (HTTP allowed) | Required (HTTPS only) |
| KEK source | Local key file | CryptAply (remote) |
| Audit trail signing | Disabled or local key | Ed25519 via CryptAply |
| Access log retention | Short (debugging) | Configured per policy |
| PITR window | Hours | Days to weeks |

## How All Products Connect

\`\`\`
vibesql-micro (PostgreSQL HTTP server)
      |  query
      v
  application layer
      |  store blobs          |  replicate changes
      v                       v
  vsql-vault             vsql-sync
      |  backup               |  audit signing
      v                       |
  vsql-backup                 |
      |                       |
      +---------------------->|
                         CryptAply
                    (KEK management, key lifecycle,
                     directive enforcement, compliance)
\`\`\`

CryptAply is the trust anchor. All encrypted services depend on it for KEK operations.`,
    products: `# VibeSQL Product Family

VibeSQL is a family of seven products delivering a compliant, governed, globally synchronized database ecosystem. Each product can be used independently or together as an integrated stack.

## Products at a Glance

| Product | Role | Port |
|---------|------|------|
| vibesql-micro | PostgreSQL-over-HTTP database server | 5173 |
| vsql-vault | Encrypted blob storage | 8443 |
| vsql-backup | Governed backup with pgBackRest engine | 8445 |
| vsql-sync | Governed data movement — PCI-scoped replication | 8444 |
| vsql-cryptaply | Key governance and compliance engine | — |
| vibesql-admin | Unified admin hub + MCP server | 5174 |
| vibesql (core) | Core database library | — |

## vibesql-micro

Lightweight PostgreSQL-over-HTTP database server with embedded PostgreSQL 16.1. Ships as a single binary with zero configuration required.

Key endpoints:
- POST /v1/query — Execute SQL statements
- GET /v1/health — Service health check

Designed for edge deployments, local-first applications, and embedded use cases.

## vsql-vault

Encrypted blob storage with envelope encryption. All data is encrypted at rest using AES-256-GCM. RSA key wrapping protects the data encryption keys. Features: access logging, configurable retention policies.

## vsql-backup

Rust binary wrapping pgBackRest (MIT, C) as the backup engine. Envelope encryption per backup set, manifest verification, PITR mechanics. CryptAply provides key governance authority.

## vsql-sync

Governed data movement layer. Encrypted replication payloads with envelope encryption. CRDT-based conflict resolution (LWW), Ed25519-signed audit trail with hash chaining, publication-based selective replication with column exclusion for PCI scope reduction.

## vsql-cryptaply (CryptAply)

Key governance and compliance engine. Directive-based policies over encryption keys used by vault, backup, and sync. Full key lifecycle management.

## vibesql-admin

Unified administration hub. One web UI for humans, one MCP server for AI agents, one help system for everyone.

## How the Products Work Together

\`\`\`
vibesql-micro  -->  vsql-vault   -->  vsql-backup (Rust + pgBackRest)
                        |                  |
                    vsql-sync              |
                    (governed wire)         |
                        |                  |
                    CryptAply <------------+
                (KEK management, key lifecycle,
                 directive enforcement, compliance)
                        |
                  vibesql-admin
              (unified hub + MCP server)
\`\`\``,
    glossary: `# Glossary

Reference definitions for terms used across VibeSQL documentation.

## AES-256-GCM
Advanced Encryption Standard with a 256-bit key in Galois/Counter Mode. Provides both confidentiality and authenticated integrity. Used by vsql-vault, vsql-backup, and vsql-sync for data encryption.

## Blob
An opaque binary object stored in vsql-vault. A blob has an ID, metadata, and an encrypted payload.

## CDE (Cardholder Data Environment)
The systems and processes that store, process, or transmit cardholder data. PCI DSS controls apply to everything in scope of the CDE.

## CRDT (Conflict-free Replicated Data Type)
A data structure designed so that concurrent updates on different nodes can always be merged without coordination. vsql-sync uses CRDTs for conflict resolution.

## DEK (Data Encryption Key)
The symmetric key that directly encrypts data. An AES-256-GCM key. Generated per blob (vault), per backup set (backup), or per session (sync). Always stored wrapped by a KEK.

## Directive
A policy document in CryptAply that governs a key or key family. Specifies algorithm, rotation schedule, allowed consumers, and expiry behavior.

## Ed25519
An elliptic-curve digital signature algorithm using Curve25519. Produces 64-byte signatures with fast verification. Used by vsql-sync for audit trail signing.

## Envelope Encryption
A two-layer encryption pattern: a DEK encrypts the data; a KEK encrypts (wraps) the DEK. Only the wrapped DEK is stored alongside the ciphertext.

## Hash Chain
A sequence of records where each record contains the hash of the previous record. Modification of any historical record invalidates all subsequent hashes.

## KEK (Key Encryption Key)
The key that wraps (encrypts) a DEK. Managed by CryptAply and never exposed to the storage layer. In VibeSQL, KEKs are RSA keys.

## LWW (Last Writer Wins)
A CRDT conflict resolution strategy. The update with the higher logical timestamp is kept. Used by vsql-sync.

## Merkle Tree
A binary tree of hashes for efficient partial verification of backup segments.

## PCI DSS
Payment Card Industry Data Security Standard. Relevant VibeSQL features: envelope encryption (Req 3), access logging (Req 10), column exclusion (scope reduction).

## PITR (Point-in-Time Recovery)
The ability to restore a database to any recorded moment in time, not just the most recent backup.

## Publication
A named configuration in vsql-sync defining which tables and columns replicate to which subscriber nodes.

## RSA
Asymmetric encryption algorithm used as the KEK algorithm for wrapping DEKs.

## SHA-256
Secure Hash Algorithm 2 with 256-bit output. Used for segment integrity hashes and hash chain linking.`,
};
export function getHelp(topic) {
    const key = topic.toLowerCase().trim();
    const content = HELP_TOPICS[key];
    if (content)
        return content;
    return `Unknown topic "${topic}". Available topics: ${Object.keys(HELP_TOPICS).join(', ')}`;
}
