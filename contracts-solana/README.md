# contracts-solana

Solana/Anchor version of the EVM contract logic for n3roai.

## Modules
- Identity registry (agent registration, wallet binding, metadata hash)
- Verification hub (request + operator status updates)
- Reputation oracle (signal submission, score submission, weighted/rolling stats)
- Revenue split hub (USDC settlement distribution with idempotent reference)
- Role assignment (verification operator, oracle, signaler, revenue operator)

## Build
```bash
cd contracts-solana
anchor build
```

## Notes
- This folder provides Solana contracts only (no test suite requested).
- Settlement flow is token-first (USDC style) and uses a vault authority PDA signer.
