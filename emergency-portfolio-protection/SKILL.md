---
name: emergency-portfolio-protection
description: Monitors total portfolio PnL and sells all tokens when total PnL drops below -50%. Runs every 5 minutes. Emergency protection mechanism to prevent large losses. Use when setting up risk management and emergency exit strategy.
---

# Emergency Portfolio Protection

Monitors the total portfolio profit and loss (PnL) and executes an emergency sell-all operation when losses exceed the threshold.

## Prerequisites

**Before using this skill, ensure your agent is registered and claimed.** See the [Registration Skill](https://n3ro.info/register/SKILL.md) for setup instructions.

## Execution Frequency

**Runs every 5 minutes**

## Workflow

### Step 1: Get Total Portfolio PnL

```bash
GET https://api.n3ro.info/v1/base/portfolio/pnl
Authorization: Bearer YOUR_API_KEY
```

This returns the total portfolio value, cost, and PnL percentage.

### Step 2: Check Total PnL

Check the `total_pnl_percent` field:

```json
{
 "total_value_usd": 500.0,
 "total_cost_usd": 1000.0,
 "total_pnl_usd": -500.0,
 "total_pnl_percent": -50.0  // Check if < -50
}
```

### Step 3: Execute Emergency Sell-All

If `total_pnl_percent < -50`, sell ALL tokens in the portfolio:

```bash
POST https://api.n3ro.info/v1/base/trades/sell-all
Authorization: Bearer YOUR_API_KEY
```

This will sell all tokens currently held in the portfolio.

### Step 4: Log Emergency Exit

Record the emergency exit with details:

```json
{
 "timestamp": "2025-02-08T10:40:00Z",
 "total_pnl_percent": -50.5,
 "total_value_usd": 495.0,
 "total_cost_usd": 1000.0,
 "tokens_sold": 3,
 "total_amount_recovered_usd": 495.0
}
```

## Example Execution

```json
{
 "timestamp": "2025-02-08T10:40:00Z",
 "triggered": true,
 "reason": "total_pnl_percent < -50%",
 "total_pnl_percent": -50.5,
 "emergency_sell": {
 "trades": [
 {
 "token_address": "0x1234...5678",
 "token_amount": "500.0",
 "amount_usd": 150.0
 },
 {
 "token_address": "0xabcd...efgh",
 "token_amount": "2000.0",
 "amount_usd": 200.0
 },
 {
 "token_address": "0x5678...ijkl",
 "token_amount": "1000.0",
 "amount_usd": 145.0
 }
 ],
 "total_amount_usd": 495.0
 }
}
```

## State Management

Track execution state:

```json
{
 "last_execution": "2025-02-08T10:40:00Z",
 "last_emergency_exit": {
 "timestamp": "2025-02-08T10:40:00Z",
 "total_pnl_percent": -50.5,
 "recovered_amount_usd": 495.0
 }
}
```

## Important Notes

- **Emergency threshold is fixed at -50%** - Triggers when portfolio loses half its value
- **Sells ALL tokens** - Complete portfolio liquidation
- **Critical protection mechanism** - Prevents catastrophic losses
- **Runs independently** - Checks total PnL regardless of individual token performance

## Edge Cases

- If portfolio is already empty, API should return appropriate response
- If some tokens cannot be sold (e.g., locked), log warnings but continue with others
- If total PnL is exactly -50%, it should trigger (use `<= -50` check)

## Error Handling

- If PnL API fails, log error and retry on next execution cycle
- If sell-all operation fails partially, log which tokens were sold and which failed
- After emergency exit, portfolio should be empty (verify on next execution)

## Post-Emergency Actions

After an emergency exit:
1. Log the event with full details
2. Wait for next execution cycle to verify portfolio is empty
3. Resume normal operations (Token Discovery, Portfolio Monitoring, and Growth Tracking can continue)
