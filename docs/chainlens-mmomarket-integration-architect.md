# Chainlens & MMOMarket Integration Architecture

**Date:** 2026-05-11
**Context:** Integration of the Agent Marketplace feature, allowing users to Sell or Rent Custom AI Agents created on Chainlens via the MMOMarket platform.

---

## 1. Executive Overview

This document outlines the architectural specifications for integrating Chainlens (Creator Studio & Sandbox Execution) with MMOMarket (Social Commerce, Escrow, and Wallet). The architecture is fundamentally decentralized—each system maintains its independent databases and operations, communicating strictly via securely scoped APIs and Webhooks.

### Core Principles:
- **Separation of Concerns:** MMOMarket handles payments, escrow, user reviews, and community governance. Chainlens handles code execution, sandbox environments, agent cloning, and validation.
- **Single Currency:** All marketplace transactions are standardized to USD (`$`).
- **Data Privacy & IP Protection:** Renting an agent grants **Execution-Role** access (blind execution) without exposing source code. Buying an agent triggers an **Auto-Clone** of the configuration and code.

---

## 2. API Contract (Data Synchronization)

To facilitate seamless interactions, Chainlens and MMOMarket will implement the following RESTful API endpoints. 

### 2.1. Account Linking & Authentication (SSO)
Sellers and Buyers must link their MMOMarket accounts within Chainlens.

- **Endpoint (Chainlens):** `POST /api/v1/auth/link-mmomarket`
- **Description:** Authenticates and securely stores the MMOMarket OAuth2 Access Token. This token has a restricted scope (Create/Edit/Delete Listings only).
- **Request Payload:**
  ```json
  {
    "authorization_code": "string",
    "redirect_uri": "string"
  }
  ```
- **Response:**
  ```json
  {
    "status": "success",
    "chainlens_user_id": "string",
    "linked_mmo_account_id": "string"
  }
  ```

### 2.2. Product Listing (Publishing)
When a user publishes an Agent from Chainlens, it pushes the metadata to MMOMarket.

- **Endpoint (MMOMarket):** `POST /api/v1/marketplace/listings`
- **Headers:** `Authorization: Bearer <MMOMarket_Access_Token>`
- **Description:** Creates a new product listing under the "Agents" category.
- **Request Payload:**
  ```json
  {
    "external_item_id": "agent_uuid",
    "title": "Crypto Backtest Agent V2",
    "description": "High-frequency backtesting agent for US and VN stock markets.",
    "version": "2.1.0",
    "listing_type": "SELL | RENT",
    "price": 49.99,
    "currency": "USD",
    "warranty_days": 14,
    "tags": ["finance", "crypto", "trading"],
    "metadata": {
      "platform": "chainlens",
      "sandbox_requirements": {"ram": "2GB", "cpu": "1vCPU"}
    }
  }
  ```
- **Response:**
  ```json
  {
    "status": "published",
    "listing_id": "mmo_listing_uuid",
    "listing_url": "https://mmomarket.com/agents/crypto-backtest-agent-v2"
  }
  ```

---

## 3. "One-Click Publish" Workflow (Chainlens UI)

The "One-Click Publish" button converts a completed Agent into a monetizable asset seamlessly.

### Workflow Steps:
1. **Trigger:** The user navigates to their Agent Dashboard on Chainlens and clicks the **"Publish to MMOMarket"** button.
2. **Account Verification:** System checks for a valid `mmomarket_access_token` in the secure vault. If absent, the user is redirected to the MMOMarket OAuth consent screen.
3. **Automated Validation:** Chainlens triggers the internal **Validator Agent**. 
   - Scans the Agent for malicious code (Sandbox escape attempts).
   - Verifies the Agent's performance metrics and versioning standards.
   - Rejects the publish request if it fails to meet security or quality criteria.
4. **Configuration Modal:** Upon successful validation, a modal prompts the user to configure:
   - **Pricing:** Set the price in USD.
   - **Model:** Select `Sell` (Transfer Code) or `Rent` (API/Execution Access).
   - **Warranty:** Set the Escrow warranty period (e.g., 7 days, 30 days) to compete on trust.
5. **Execution:** Chainlens invokes the MMOMarket `POST /marketplace/listings` API.
6. **Completion:** The UI updates the Agent's status to `Published` and displays the live MMOMarket link.

---

## 4. Webhook Logic (Order Lifecycle)

The lifecycle of an order (Buy/Rent) is managed asynchronously via Webhooks to guarantee consistency across both platforms.

**Chainlens Webhook Receiver:** `POST /api/v1/webhooks/mmomarket`

### 4.1. Event: `Payment_Confirmed`
- **Trigger:** Buyer completes payment on MMOMarket. Funds are locked in the MMOMarket Escrow Wallet.
- **Payload:**
  ```json
  {
    "event": "Payment_Confirmed",
    "order_id": "ord_uuid",
    "buyer_mmo_id": "buyer_uuid",
    "external_item_id": "agent_uuid",
    "listing_type": "SELL | RENT"
  }
  ```
- **Chainlens Processing Logic:**
  1. Validate the webhook signature to ensure it originated from MMOMarket.
  2. Map the `buyer_mmo_id` to a `chainlens_user_id`. (If the buyer does not have a Chainlens account, hold the provisioning in a pending state and email the buyer an invite link).
  3. **If `listing_type == SELL` (Auto-Clone):**
     - Duplicate the Agent's source code, configurations, and environment variables.
     - Assign ownership of the clone to the Buyer's workspace.
  4. **If `listing_type == RENT` (Execution-Role Grant):**
     - Generate a restricted **Execution Role**.
     - The Buyer's dashboard is updated with an interface to pass parameters/prompts to the Agent, but the source code and internal configurations remain hidden (Blind Execution).

### 4.2. Event: `Access_Granted`
- **Trigger:** Chainlens successfully provisions the Agent (Clone or Role Grant).
- **Payload (Chainlens -> MMOMarket):**
  ```json
  {
    "event": "Access_Granted",
    "order_id": "ord_uuid",
    "status": "success",
    "chainlens_access_url": "https://app.chainlens.com/agents/run/..."
  }
  ```
- **MMOMarket Processing Logic:**
  - Updates the order status to "Delivered".
  - Begins the countdown for the Escrow Warranty period.

### 4.3. Event: `Dispute_Raised`
- **Trigger:** Buyer reports a critical issue (e.g., Agent not functioning as described) within the warranty period on MMOMarket.
- **Payload:**
  ```json
  {
    "event": "Dispute_Raised",
    "order_id": "ord_uuid",
    "reason": "Agent fails to scrape Google Maps as advertised."
  }
  ```
- **Chainlens Processing Logic:**
  1. **Suspend Access:** Temporarily revoke the Buyer's Execution-Role (Rent) or freeze the cloned Agent instance (Sell) to prevent further usage during the dispute.
  2. **Audit Generation:** Extract the recent execution logs from the Sandbox environment for the specific Agent version.
  3. **Resolution:**
     - *If Buyer wins:* MMOMarket refunds the Buyer, and Chainlens permanently revokes access/deletes the cloned Agent.
     - *If Seller wins:* MMOMarket releases the Escrow to the Seller, and Chainlens restores the Buyer's access.
