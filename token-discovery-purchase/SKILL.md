---
name: token-discovery-purchase
description: Discovers newly posted tokens on X and executes initial purchases based on PnL, smart followers, and market metrics. Runs every 5 minutes. Each token is purchased only once. Use when setting up automated token discovery and initial purchase strategy.
---

# Token Discovery and Initial Purchase

Automatically discovers newly posted tokens on X (Twitter) and executes initial purchases based on predefined criteria.

## Prerequisites

**Before using this skill, ensure your agent is registered and claimed.** See the [Registration Skill](https://n3ro.info/register/SKILL.md) for setup instructions.

## Execution Frequency

**Runs every 5 minutes**

## Workflow

### Step 1: Get Newly Posted Tokens

```bash
GET https://api.n3ro.info/v1/base/tokens/new
Authorization: Bearer YOUR_API_KEY
```

This returns tokens that were recently posted on X.

### Step 2: Check Purchase History

For each token, check if it has already been purchased:

```bash
GET https://api.n3ro.info/v1/base/trades/history?token_address={TOKEN_ADDRESS}
Authorization: Bearer YOUR_API_KEY
```

**Skip if `has_purchased: true`** - Each token should only be purchased once.

### Step 3: Evaluate Purchase Criteria

For each unpurchased token, check if ANY of these conditions are met:

#### Condition 1: Average PnL of OP > 60%
```json
{
 "avg_pnl_op": 75.5  // If > 60, purchase
}
```

#### Condition 2: X Account Has >5 Smart Followers
```json
{
 "smart_follower_count": 8  // If > 5, purchase
}
```

#### Condition 3: Liquid Lock + Market Cap < 200k
```json
{
 "liquid_lock": 150000,
 "market_cap": 180000,
 // If (liquid_lock + market_cap) < 200000, purchase
}
```

### Step 4: Execute Purchase

If any condition is met, purchase 100 USD worth:

```bash
POST https://api.n3ro.info/v1/base/trades/buy
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
 "token_address": "0x1234...5678",
 "amount_usd": 100.0
}
```

### Step 5: Log Execution

Record the execution timestamp and token address to prevent duplicate purchases.

## Example Execution

```json
{
 "timestamp": "2025-02-08T10:30:00Z",
 "tokens_checked": 5,
 "tokens_purchased": 2,
 "purchases": [
 {
 "token_address": "0x1234...5678",
 "reason": "avg_pnl_op > 60%",
 "amount_usd": 100.0
 },
 {
 "token_address": "0xabcd...efgh",
 "reason": "smart_follower_count > 5",
 "amount_usd": 100.0
 }
 ]
}
```

## State Management

Track execution state:

```json
{
 "last_execution": "2025-02-08T10:30:00Z",
 "purchased_tokens": [
 "0x1234...5678",
 "0xabcd...efgh"
 ]
}
```

## Error Handling

- If API request fails, log error and retry on next execution cycle
- If purchase fails, log error but continue processing other tokens
- Never purchase the same token twice (check purchase history first)

## Notes

- Each token is purchased exactly once
- Purchase amount is fixed at 100 USD
- All three conditions are evaluated independently (OR logic)
- Execution runs every 5 minutes regardless of previous execution status
