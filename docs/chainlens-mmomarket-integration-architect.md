# Chainlens & MMOMarket Integration Architecture

**Date:** 2026-05-11
**Context:** Integration of the Agent Marketplace feature, allowing users to Sell Custom AI Agents created on Chainlens via the MMOMarket platform.

---

## 1. Executive Overview

This document outlines the simplified, pragmatic architectural specifications for integrating Chainlens with MMOMarket. The architecture favors developer productivity and time-to-market by using API Keys instead of OAuth2, and Polling instead of complex Webhooks.

### Core Principles:
- **API Key Auth:** Secure, simple Personal Access Tokens (API Keys) are used for server-to-server integration.
- **Polling over Webhooks:** Order synchronization is handled via periodic polling and manual sync buttons to eliminate webhook reliability and infrastructure overhead.
- **Auto-Clone (Sell) First:** MVP focuses on selling agents via Auto-Clone.
- **Multi-Tenant Execution Architecture:**
  - **Tier 1 (Free Users):** Agents run in a "Shared Pool" (Data-Driven Engine). No arbitrary code execution (Python/Bash) is allowed. Highly scalable, near-zero cost.
  - **Tier 2 (Premium Users):** Agents are provisioned with dedicated Daytona Sandboxes, allowing full arbitrary code execution and true OS-level isolation.

---

## 2. API Contract (Data Synchronization)

### 2.1. Account Linking (API Key Setup)
Sellers must link their MMOMarket accounts within Chainlens.

- **Workflow:** User generates an API Key in MMOMarket Settings and pastes it into Chainlens Integration settings. Chainlens encrypts and stores this key.
- **Usage:** All subsequent API calls from Chainlens to MMOMarket use `Authorization: Bearer <API_Key>`.

### 2.2. Product Listing (Publishing)
When a user publishes an Agent from Chainlens, it pushes the metadata to MMOMarket.

- **Endpoint (MMOMarket):** `POST /api/v1/marketplace/listings`
- **Headers:** `Authorization: Bearer <API_Key>`
- **Request Payload:**
  ```json
  {
    "external_item_id": "agent_uuid",
    "title": "Crypto Backtest Agent V2",
    "listing_type": "SELL",
    "price": 49.99,
    "currency": "USD",
    "warranty_days": 14,
    "metadata": {
      "platform": "chainlens",
      "tier_requirement": "premium"
    }
  }
  ```

---

## 3. "One-Click Publish" Workflow (Chainlens UI)

1. **Trigger:** The user clicks **"Publish to MMOMarket"**.
2. **Account Verification:** System checks for a valid `MMOMarket API Key`.
3. **Automated Validation:** Static analysis and linter checks run on the Agent (replacing complex AI validators for MVP).
4. **Configuration Modal:** Set Price and Warranty.
5. **Execution:** Chainlens invokes the MMOMarket API.

---

## 4. Order Lifecycle (Polling & Fulfillment)

### 4.1. Order Synchronization (Polling)
- **Mechanism:** Chainlens runs a background cron job (e.g., every 5 minutes) to fetch new paid orders from MMOMarket: `GET /api/v1/orders?status=paid`.
- **Manual Override:** A "Sync Orders" button in the Chainlens UI allows sellers to force an immediate fetch.

### 4.2. Provisioning Logic (Tier-Aware)
Upon detecting a new order:
1. Map the buyer's email to a Chainlens user.
2. Auto-Clone the Agent's configuration and assign ownership.
3. **Routing based on User Tier:**
   - *If Buyer is Tier 1 (Free):* The cloned Agent is flagged to run on the `global-tier1-sandbox-01`. Dangerous tools (`execute_bash`, `run_python`) are disabled.
   - *If Buyer is Tier 2 (Premium):* The Daytona provider spins up a dedicated, isolated sandbox for the new clone.

### 4.3. Event: `Fulfillment`
- **Trigger:** Chainlens successfully clones the Agent.
- **Endpoint (MMOMarket):** `POST /api/v1/orders/{order_id}/fulfill`
- **MMOMarket Processing Logic:** Updates the order status to "Delivered" and begins the Escrow Warranty period countdown.

### 4.4. Dispute Handling
- Handled manually via MMOMarket Customer Support in Phase 1. Admins have a "Suspend Agent" button on Chainlens if a dispute requires freezing the asset.
