# CommerceFlow — Production Database Backup & Recovery Runbook

**Audience**: DevOps, SRE, Database Administrators, Infrastructure Engineers<br>
**System**: CommerceFlow Production MongoDB Cluster<br>
**Classification**: Operational Runbook (P1 Production Readiness)

> [!CAUTION]
> **Application Readiness Is NOT a Backup Guarantee**:<br>
> The backend `/ready` health probe only confirms that the MongoDB instance is currently reachable and responding to commands. It provides zero guarantees regarding data durability, point-in-time recovery, replica integrity, or snapshot freshness. Dedicated backup and recovery automation must operate independently of the Node.js application process.

---

## 1. Core Terminology & Operational Distinctions

To prevent operational ambiguity during high-stress recovery scenarios, engineers must clearly distinguish the following operational concepts:

| Term | Operational Definition & Scope | Primary Mechanism |
|---|---|---|
| **Backup** | An overarching data protection process resulting in independent, durable copies of database state (logical dumps or physical images) stored outside the primary database cluster. | Automated oplog streaming, archive exports, and storage lifecycle policies. |
| **Snapshot** | An instantaneous, point-in-time image of the underlying storage volume or database cluster data files. Fast to create and provision, capturing block-level consistency. | Cloud/infrastructure storage snapshots (e.g. cloud-managed cluster snapshots). |
| **Restore** | The active operational procedure of retrieving a verified snapshot or backup copy and recreating a functioning database instance or cluster to resume normal operations. | Point-in-time restoration, oplog replay, or targeted logical archive import. |
| **Restore Drill** | A planned, non-emergency operational exercise in an isolated staging environment to validate that backups are restorable, data integrity is intact, and RTO/RPO targets are met. | Quarterly simulated recovery drill without affecting production services. |
| **Disaster Recovery (DR)** | The comprehensive business continuity strategy for recovering entire environments and infrastructure after catastrophic events (e.g., regional cloud outage, catastrophic compromise). | Multi-region cluster failover, cold-site restore, DNS routing reallocation. |

> [!IMPORTANT]
> **Backups Are Untrusted Until Verified**:<br>
> Simply generating backups does not guarantee business continuity. Backups must be treated as unverified assumptions until proven recoverable through periodic, automated or manual **restore drills**.

---

## 2. Production MongoDB Backup Strategy

CommerceFlow requires a multi-tiered backup strategy combining **automated continuous snapshots** with **periodic logical export archives**:

| Tier | Mechanism | Purpose | Frequency | Retention |
|---|---|---|---|---|
| **Tier 1 (Continuous)** | Managed Cloud Snapshots (e.g., MongoDB Atlas Cloud Backup or managed replica snapshots) | Point-in-time recovery (PITR) for transaction loss or hardware failure | Continuous oplog streaming + hourly snapshots | 7 days PITR; daily snapshots for 35 days |
| **Tier 2 (Long-Term)** | Weekly / Monthly Archive Snapshots | Disaster recovery, compliance, and legal audit hold | Weekly snapshot (Sunday 02:00 UTC) | 52 weeks (1 year) |
| **Tier 3 (Logical)** | Manual `mongodump` logical exports | Pre-migration baselines, major schema overhauls, isolated drills | On-demand before releases | 30 days |

---

## 3. Recovery Objectives (RPO & RTO)

* **Recovery Point Objective (RPO)**:
  * **Target**: $\le$ **5 minutes** during operational hours.
  * **Implementation**: Continuous oplog archiving ensures that in the event of an unexpected replica primary failure or data corruption event, transactions can be restored to within 5 minutes of the failure point.
* **Recovery Time Objective (RTO)**:
  * **Target**: $\le$ **30 minutes** for critical commerce restoration.
  * **Implementation**: Managed snapshot restoration provisions a replacement cluster or rolls back the active cluster without needing multi-hour network data transfers.

---

## 4. Encryption, Access Separation & Restore Authority

1. **Encryption Standards**:
   * **In-Transit**: All cluster and backup agent communication must enforce TLS 1.3 (or TLS 1.2 minimum). Unencrypted MongoDB connections are rejected.
   * **At-Rest**: Automated snapshots and logical archive storage must use customer-managed or provider-managed AES-256 envelope encryption with KMS key rotation.
2. **Principle of Least Privilege**:
   * Application connection credentials (`MONGODB_URI` used by Node.js) must **only** possess `readWrite` permissions on the operational database (e.g. `commerceflow`).
   * Application credentials must **never** possess administrative roles (`backup`, `restore`, `clusterAdmin`, `root`).
3. **Dedicated Backup Credentials & Automation**:
   * Automated snapshot daemons or agents must use dedicated IAM identities or database users with strictly limited `backup` permissions.
   * Backup storage repositories (e.g., encrypted S3 buckets, cloud backup targets) must be network-isolated from and completely inaccessible to application containers.
4. **Restore Authority & Authorization**:
   * **Who Has Authority**: Production data restoration is restricted exclusively to designated Lead Site Reliability Engineers (SREs) and Database Administrators (DBAs). Application developers and automated deployment pipelines have **zero** restore permissions.
   * **Dual Authorization (Two-Person Rule)**: Any non-drill restore operation affecting production or disaster recovery clusters requires explicit dual sign-off (e.g. SRE Lead + Security Officer) before execution.
   * **Audited Access**: Credentials for restore operations are stored in an audited, privileged access vault (e.g., HashiCorp Vault, AWS Secrets Manager) with multi-factor authentication (MFA) and access logs.

---

## 5. Operational Recovery & Restore Procedures

### Scenario A: Managed Cluster Point-in-Time Restore (Recommended)

When utilizing managed MongoDB (e.g., MongoDB Atlas or cloud provider managed replica sets):

1. **Declare Incident**: Notify on-call leads and place the frontend into maintenance mode if active data corruption is occurring.
2. **Identify Target Timestamp**: Determine the exact UTC timestamp immediately preceding the corruption or deletion event.
3. **Initiate Restore via Management Console or Cloud CLI**:
   * Select the affected cluster.
   * Choose **Point-in-Time Restore**.
   * Specify the target timestamp.
   * Select destination: **Restore to a New Cluster** (strongly recommended to prevent accidental overwrites of diagnostic logs).
4. **Update Application Configuration**:
   * Update `MONGODB_URI` in the backend secrets manager to point to the restored cluster endpoint.
   * Trigger a rolling restart of the backend application containers.
5. **Verify Application Readiness**:
   * Query `GET /ready` to confirm the application establishes a healthy connection.
   * Execute smoke tests (orders, user login, catalog retrieval).

### Scenario B: Logical Archive Restore (`mongorestore` Operational Example)

> *The following commands are illustrative operational templates. Never hardcode real credentials or cluster endpoints in source control.*

#### 1. Pre-Restore Safety Snapshot
Before restoring, capture a cold snapshot of the current state for forensic analysis:
```bash
# OPERATIONAL EXAMPLE ONLY
mongodump \
  --uri="mongodb+srv://<BACKUP_USER>:<PASSWORD>@<CLUSTER_HOST>/commerceflow" \
  --archive="safety_pre_restore_$(date +%Y%m%d_%H%M%S).archive" \
  --gzip
```

#### 2. Restore from Verified Archive
Restore the verified backup archive into the target database:
```bash
# OPERATIONAL EXAMPLE ONLY
mongorestore \
  --uri="mongodb+srv://<RESTORE_USER>:<PASSWORD>@<CLUSTER_HOST>/commerceflow" \
  --archive="/secure/backups/commerceflow_backup_verified.archive" \
  --gzip \
  --drop \
  --noIndexRestore
```
*Note: `--noIndexRestore` allows Mongoose schema initialization to rebuild optimized indexes declarative in code, or indexes can be validated manually.*

---

## 6. Post-Restore Verification Checklist

After any restore procedure, execute the following operational validation steps before lifting maintenance mode:

- [ ] **Document Counts Verification**: Validate total counts across critical collections against pre-incident benchmarks:
  ```javascript
  // MongoDB Shell verification script
  db.users.countDocuments({});
  db.products.countDocuments({});
  db.orders.countDocuments({});
  db.reviews.countDocuments({});
  db.coupons.countDocuments({});
  db.auditlogs.countDocuments({});
  ```
- [ ] **Index Health & Schema Compatibility**: Confirm required unique and compound indexes are intact and match current Mongoose schemas:
  ```javascript
  db.users.getIndexes();
  db.products.getIndexes();
  db.orders.getIndexes();
  db.auditlogs.getIndexes();
  ```
- [ ] **Data Integrity Spot Check**:
  * Verify recent paid orders retain their financial snapshots and shipping addresses.
  * Verify user email uniqueness constraint is enforced.
  * Verify product variant stock counts are non-negative integers.
- [ ] **Application Readiness**:
  * Query `GET /api/v1/health/ready` $\rightarrow$ Expect `200 { success: true, data: { status: "ready" } }`.
  * Validate customer login and order history retrieval.

---

## 7. Pre-Production Restore Drills

1. **Drill Frequency**: A full restore drill must be executed **quarterly** in a dedicated staging or sandbox environment.
2. **Procedure**:
   * Clone the latest production automated snapshot into the staging environment.
   * Run the full end-to-end regression test suite (`npm test` in both API and Web).
   * Measure and record actual RTO against the 30-minute target.
3. **Audit Trail**: Record the drill date, operator, measured RTO, document count deltas, and retrospective notes in the engineering operations log.

---

## 8. Incident Escalation Protocol

In the event of accidental mass data deletion, malicious modification, or database disk corruption:

1. **T+0m (Containment)**:
   * Immediately redirect edge ingress traffic to a static 503 Maintenance page.
   * Revoke write access tokens or suspend application deployments to halt compounding corruption.
2. **T+5m (Assessment)**:
   * Identify incident scope: specific collection vs. whole cluster.
   * Determine exact corruption timestamp from application audit logs and MongoDB oplog.
3. **T+10m (Execution)**:
   * Provision target restore cluster from nearest pre-incident snapshot + oplog point.
4. **T+25m (Verification)**:
   * Perform verification checklist (Section 6).
5. **T+30m (Resolution)**:
   * Switch application `MONGODB_URI` connection string.
   * Confirm `/ready` probe returns 200.
   * Remove maintenance page and monitor error rates via Pino logs.
