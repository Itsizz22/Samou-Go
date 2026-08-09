Set-Content -Path "todo.md" -Value @'
# Samou' Go — Full-Repo Audit, Fix & Verification Taskboard

> **Operating Standard:** No speculative passes (`PASS` requires explicit command execution evidence). Zero tolerance for error suppression (`as any`, `@ts-ignore`, or `skip`).

---

## Phase 1: System Discovery & Architecture Mapping
- [ ] **1.1 Workspace Topography Audit**
  - [ ] Inspect Root `package.json` & all Workspace `package.json` files
  - [ ] Review TypeScript configurations (`tsconfig.json` & project references)
  - [ ] Review Prisma schema (`schema.prisma`), migrations, and seed scripts
  - [ ] Review API controllers, services, and middleware (`apps/api`)
  - [ ] Review shared types & API clients (`packages/shared`, `packages/database`, etc.)
  - [ ] Review Web Frontends (`themes/web-customer`, `themes/web-admin`, `themes/web-driver`, etc.)
  - [ ] Review CI/CD workflows (`.github/workflows/`) and Root scripts
- [ ] **1.2 Architecture Matrix Documented**
  - [ ] Map out `Architecture`, `Packages`, `Applications`, `Database`, `API`, `Auth/RBAC`, `CI/CD`, `Env Vars`

---

## Phase 2: Baseline Execution Measurement
- [ ] **2.1 Baseline Commands Execution & Logging**
  - [ ] Run `npm install` and log output/failures
  - [ ] Run `npm run typecheck` / `typecheck:all` and record baseline errors
  - [ ] Run `npm run build` and log build failures
  - [ ] Run `npm test` and record test failures
  - [ ] Run `npm run test:e2e` (if existing) and record status
- [ ] **2.2 Baseline Log Creation**
  - [ ] Document initial `COMMAND`, `RESULT`, `ERROR OUTPUT`, and `ROOT CAUSE` for all failures

---

## Phase 3: Dependency & Workspace Audit
- [ ] **3.1 Dependency Hygiene Check**
  - [ ] Identify duplicate dependencies across workspaces
  - [ ] Audit for unused packages or missing declared dependencies
  - [ ] Verify script references to non-existent packages/commands
  - [ ] Resolve version conflicts (only update if breaking/vulnerable; document rationale)
- [ ] **3.2 Lockfile & Install Verification**
  - [ ] Verify clean installation via `npm install` / `npm ls`

---

## Phase 4: TypeScript & Strict Type Audit
- [ ] **4.1 Workspace Type Checking**
  - [ ] Typecheck `apps/api`
  - [ ] Typecheck `packages/shared` / `shared-types`
  - [ ] Typecheck `packages/database`
  - [ ] Typecheck `themes/web-customer`
  - [ ] Typecheck `themes/web-admin`
  - [ ] Typecheck `themes/web-driver`
  - [ ] Typecheck any other existing workspaces
- [ ] **4.2 Type Remediation**
  - [ ] Resolve frontend/backend API contract mismatches
  - [ ] Fix broken path aliases, missing imports/exports
  - [ ] Fix implicit `any`, `null`/`undefined` handling errors
  - [ ] **Enforce Rule:** Remove all `as any`, `@ts-ignore`, `@ts-nocheck` workarounds

---

## Phase 5: Database & Prisma Audit
- [ ] **5.1 Schema & Relation Validation**
  - [ ] Validate relations, foreign keys, unique constraints, and indexes
  - [ ] Audit cascading deletes, nullability, enum consistency, and defaults
  - [ ] Run `npx prisma validate`
  - [ ] Run `npx prisma generate`
- [ ] **5.2 Migration & Query Alignment**
  - [ ] Ensure `schema.prisma`, SQL migrations, seed, and app queries align
  - [ ] Resolve migration drift safely without dropping existing migrations

---

## Phase 6: Seed & Environment Sanitization
- [ ] **6.1 Seed Script Execution**
  - [ ] Test clean database initialization and seed execution
  - [ ] Ensure zero duplicate key violations or foreign key errors during seed
- [ ] **6.2 Environment & Secrets Audit**
  - [ ] Audit code for hardcoded secrets, passwords, or production keys
  - [ ] Verify `.env.example` mirrors all required variables without real credentials

---

## Phase 7: API, Authentication & Authorization Audit
- [ ] **7.1 Endpoint Logic & Validation**
  - [ ] Validate runtime input validation (Zod/Yup/Joi) across all API endpoints
  - [ ] Verify standard HTTP status codes, structured response format, and error handling
- [ ] **7.2 Authentication & RBAC Audit**
  - [ ] Audit registration, login, logout, password hashing, and JWT/session management
  - [ ] Test access controls for all roles: `Customer`, `Store Manager`, `Captain`, `Admin`
  - [ ] Check for authorization bypasses, IDOR/BOLA, and information leaks
  - [ ] **CRITICAL:** Fix any privilege escalation or authorization bypass

---

## Phase 8: Frontend Workspaces Audit
- [ ] **8.1 Web Applications Functional Check**
  - [ ] Audit `web-customer` (build, routes, forms, API integration, loading/error states)
  - [ ] Audit `web-admin` (build, dashboard, RBAC guards, forms)
  - [ ] Audit `web-driver` / `web-captain` (build, order workflow states)
- [ ] **8.2 User Experience Defect Remediation**
  - [ ] Fix broken routes, dead links, unhandled form errors, and auth redirects

---

## Phase 9: Core Business Workflows & E2E Audit
- [ ] **9.1 End-to-End Workflow Verification**
  - [ ] **Customer:** Browse $\rightarrow$ Cart $\rightarrow$ Checkout $\rightarrow$ Order Creation $\rightarrow$ Tracking
  - [ ] **Store Manager:** Login $\rightarrow$ Inventory $\rightarrow$ Order Reception $\rightarrow$ Status Update
  - [ ] **Captain:** Login $\rightarrow$ Available Orders $\rightarrow$ Accept $\rightarrow$ Delivery Update
  - [ ] **Admin:** Dashboard telemetry $\rightarrow$ User/Store Management
  - [ ] Mark missing features strictly as `NOT IMPLEMENTED` (no fake implementations)

---

## Phase 10: Security & Repository Hygiene
- [ ] **10.1 Security Vulnerability Scan**
  - [ ] Audit for SQL Injection, XSS, unsafe redirects, and CORS configurations
- [ ] **10.2 Git & Repository Scrubbing**
  - [ ] Verify `.gitignore` excludes `node_modules`, `dist`, `build`, `.env`, and logs
  - [ ] Ensure Git history is free of committed API keys or real secrets

---

## Phase 11: CI/CD & Script Remediation
- [ ] **11.1 Workflow & Script Audit**
  - [ ] Audit `.github/workflows/` and root/workspace `scripts`
  - [ ] Remove `continue-on-error: true`, `|| true`, `|| exit 0` or error-hiding mechanisms
  - [ ] Ensure CI strictly fails on lint, typecheck, build, or test failure

---

## Phase 12: Final Verification & Mandatory Report Generation
- [ ] **12.1 Documentation Update**
  - [ ] Update `README.md` with architecture, environment setup, seed, and running instructions
- [ ] **12.2 Final Verification Suite**
  - [ ] Execute `npm install`
  - [ ] Execute `npm run typecheck` / `typecheck:all`
  - [ ] Execute `npm run build` / `build:all`
  - [ ] Execute `npm test` & `npm run test:e2e`
  - [ ] Execute `npx prisma validate` & `npx prisma generate`
- [ ] **12.3 Complete Final Audit Report Output**
  - [ ] Populate Final Status (`PASS` / `FAIL` / `BLOCKED`)
  - [ ] Populate Build Matrix Table
  - [ ] Populate Test Suite Execution Table
  - [ ] Populate Application Workspace Table
  - [ ] Document Resolved Problems (`FIXED` Log)
  - [ ] Document Remaining Blockers (`REMAINING PROBLEMS`)
'@