# Security Policy

## Sensitive local data

The application stores Codex authentication files and account metadata under
`D:\codex-account-manager-data`. Never attach that directory, `auth.json`, an
account index, access tokens, browser session data, or unredacted logs to a
public issue.

The repository ignores known local credential and account-data filenames. Run
`git status --ignored` before publishing changes that touch authentication or
data-storage code.

## Reporting a vulnerability

Use GitHub's private security advisory feature for reports that include a
reproduction, credential-handling issue, destructive data-loss path, or other
sensitive details. Include the affected version, Windows version, Codex CLI
version, reproduction steps, and the smallest redacted log needed to diagnose
the issue.

Public feature requests and non-sensitive defects can use GitHub Issues.

