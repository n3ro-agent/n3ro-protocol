---
name: token-tracking-growth-purchase
description: Tracks newly posted tokens, monitors growth metrics (KOL count and smart follower count), and purchases tokens when growth exceeds 50% threshold. Runs every 5 minutes. Use when setting up token tracking and growth-based purchase strategy.
---

# Token Tracking and Growth-Based Purchase

Tracks newly posted tokens and executes purchases based on growth metrics (KOL count and smart follower count increases).

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

### Step 2: Start Tracking New Tokens

For each newly posted token, start tracking it:

```bash
POST https://api.n3ro.info/v1/base/tokens/track
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
 "token_address": "0x1234...5678"
}
```

This records the initial KOL count and smart follower count as baseline metrics.

### Step 3: Get Tracked Tokens (Older Than 3 Days)

```bash
GET https://api.n3ro.info/v1/base/tokens/tracked?min_days=3
Authorization: Bearer YOUR_API_KEY
```

This returns tokens that have been tracked for more than 3 days with current growth metrics.

### Step 4: Evaluate Growth Criteria

For each tracked token (older than 3 days), check if ANY of these conditions are met:

#### Condition 1: KOL Count Increased 50%

```json
{
 "initial_kol_count": 12,
 "current_kol_count": 18,
 "kol_growth_percent": 50.0  // If >= 50, purchase
}
```

#### Condition 2: Smart Follower Count Increased 50%

```json
{
 "initial_smart_follower_count": 8,
 "current_smart_follower_count": 12,
 "smart_follower_growth_percent": 50.0  // If >= 50, purchase
}
```

### Step 5: Check Purchase History

Before purchasing, verify the token hasn't been purchased already:

```bash
GET https://api.n3ro.info/v1/base/trades/history?token_address={TOKEN_ADDRESS}
Authorization: Bearer YOUR_API_KEY
```

**Skip if `has_purchased: true`** - Each token should only be purchased once.

### Step 6: Execute Purchase

If growth condition is met and token hasn't been purchased, buy 100 USD worth:

```bash
POST https://api.n3ro.info/v1/base/trades/buy
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
 "token_address": "0x1234...5678",
 "amount_usd": 100.0
}
```

### Step 7: Log Execution

Record the execution with growth metrics:

```json
{
 "timestamp": "2025-02-08T10:45:00Z",
 "new_tokens_tracked": 2,
 "tracked_tokens_checked": 5,
 "tokens_purchased": 1,
 "purchases": [
 {
 "token_address": "0x1234...5678",
 "reason": "kol_growth_percent >= 50%",
 "kol_growth": 50.0,
 "amount_usd": 100.0
 }
 ]
}
```

## Example Execution

### Cycle 1: Track New Token
```json
{
 "timestamp": "2025-02-08T10:30:00Z",
 "action": "tracking_started",
 "token_address": "0x1234...5678",
 "initial_kol_count": 12,
 "initial_smart_follower_count": 8
}
```

### Cycle 2-3: Continue Tracking (No Purchase Yet)
```json
{
 "timestamp": "2025-02-08T10:35:00Z",
 "action": "tracking_continued",
 "token_address": "0x1234...5678",
 "days_tracked": 1.0,
 "current_kol_count": 14,
 "kol_growth_percent": 16.7  // Not enough yet
}
```

### Cycle 4: Purchase Triggered
```json
{
 "timestamp": "2025-02-08T10:45:00Z",
 "action": "purchase_executed",
 "token_address": "0x1234...5678",
 "days_tracked": 3.5,
 "initial_kol_count": 12,
 "current_kol_count": 18,
 "kol_growth_percent": 50.0,
 "amount_usd": 100.0
}
```

## State Management

Track execution state:

```json
{
 "last_execution": "2025-02-08T10:45:00Z",
 "tracked_tokens": [
 {
 "token_address": "0x1234...5678",
 "tracked_at": "2025-02-05T10:30:00Z",
 "initial_kol_count": 12,
 "initial_smart_follower_count": 8,
 "purchased": true,
 "purchased_at": "2025-02-08T10:45:00Z"
 }
 ]
}
```

## Important Notes

- **Minimum tracking period: 3 days** - Only evaluates tokens tracked for 3+ days
- **Growth threshold: 50%** - Both KOL and smart follower growth use same threshold
- **Purchase amount: 100 USD** - Fixed purchase amount per token
- **One purchase per token** - Each token is purchased only once
- **OR logic** - Either KOL growth OR smart follower growth can trigger purchase

## Edge Cases

- If a token is tracked but then removed from X, handle gracefully
- If growth metrics are unavailable, skip evaluation for that token
- If tracking API fails for a new token, retry on next cycle
- If a token was already purchased by Token Discovery skill, it won't be purchased again

## Error Handling

- If new tokens API fails, log error and retry on next execution cycle
- If tracking API fails, log error but continue with existing tracked tokens
- If purchase fails, log error but continue processing other tokens
- Never purchase the same token twice (check purchase history first)

## Relationship with Other Skills

- **Token Discovery** may purchase tokens immediately based on initial metrics
- **Token Tracking and Growth Purchase** tracks tokens and purchases based on growth over time
- A token can be purchased by either Token Discovery or Token Tracking, but not both (enforced by purchase history check)
