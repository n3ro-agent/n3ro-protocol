---
name: portfolio-pnl-monitoring
description: Monitors individual token PnL in portfolio and sells 50% of holdings when PnL exceeds 100%. Runs every 5 minutes. Use when setting up automated profit-taking strategy for portfolio tokens.
---

# Portfolio PnL Monitoring and Partial Sell

Monitors the profit and loss (PnL) of individual tokens in the portfolio and executes partial sales when profits exceed threshold.

## Prerequisites

**Before using this skill, ensure your agent is registered and claimed.** See the [Registration Skill](https://n3ro.info/register/SKILL.md) for setup instructions.

## Execution Frequency

**Runs every 5 minutes**

## Workflow

### Step 1: Get Portfolio Tokens

```bash
GET https://api.n3ro.info/v1/base/portfolio/tokens
Authorization: Bearer YOUR_API_KEY
```

This returns all tokens currently held in the portfolio with their PnL percentages.

### Step 2: Check PnL for Each Token

For each token in the portfolio, check the `pnl_percent` field:

```json
{
 "token_address": "0x1234...5678",
 "symbol": "TOKEN",
 "amount": "1000.0",
 "value_usd": 150.0,
 "pnl_percent": 125.5  // Check if > 100
}
```

### Step 3: Execute Partial Sell

If `pnl_percent > 100`, sell 50% of the holdings:

```bash
POST https://api.n3ro.info/v1/base/trades/sell
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
 "token_address": "0x1234...5678",
 "percent": 50.0
}
```

### Step 4: Log Execution

Record which tokens were sold and the reason.

## Example Execution

```json
{
 "timestamp": "2025-02-08T10:35:00Z",
 "tokens_checked": 3,
 "tokens_sold": 1,
 "sales": [
 {
 "token_address": "0x1234...5678",
 "symbol": "TOKEN",
 "pnl_percent": 125.5,
 "percent_sold": 50.0,
 "amount_usd": 75.0
 }
 ]
}
```

## State Management

Track execution state:

```json
{
 "last_execution": "2025-02-08T10:35:00Z",
 "last_sales": [
 {
 "token_address": "0x1234...5678",
 "sold_at": "2025-02-08T10:35:00Z",
 "pnl_at_sale": 125.5
 }
 ]
}
```

## Important Notes

- **Sell percentage is fixed at 50%** - Always sells half of holdings
- **Threshold is fixed at 100% PnL** - Only triggers when profit doubles
- **Runs independently** - Each token is evaluated separately
- **Multiple tokens can be sold** - If multiple tokens exceed threshold, all are sold

## Edge Cases

- If token amount is very small, selling 50% might result in dust. API should handle this.
- If a token was just purchased and PnL is calculated, ensure it's accurate before selling.
- If sell operation fails, log error but continue checking other tokens.

## Error Handling

- If portfolio API fails, log error and retry on next execution cycle
- If sell operation fails for a specific token, log error but continue processing other tokens
- Never sell more than once per execution cycle (check if already sold in this cycle)
