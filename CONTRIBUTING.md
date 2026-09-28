# Contributing

## Development setup

```powershell
npm install
npm test
npm run dev
```

Before opening a pull request, run:

```powershell
npm test
npm run build
```

## Project rules

- Keep account credentials and real account data outside the repository.
- Preserve the D-drive data directory and recovery behavior on Windows.
- Treat reset cards as real only when an ID is present, the status is
  `available`, and the card has not expired.
- Keep destructive account actions behind an explicit confirmation.
- Add focused tests for storage recovery, quota normalization, and concurrent
  account operations.
- Keep UI changes usable at both `1440 x 960` and the `920 x 640` minimum
  window size.

Pull requests should describe the user-visible behavior, data migration impact,
and verification commands that were run.

