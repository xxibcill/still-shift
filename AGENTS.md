# Repository instructions

## GitHub Actions

GitHub Actions are prohibited in this project. Do not add, restore, enable, or
recommend GitHub Actions workflows, including files under `.github/workflows/`.
Keep repository Actions disabled. Run verification locally using the existing
pnpm commands. This rule remains in effect unless the user explicitly revokes it.

## Development log

Keep [`docs/dev-log.md`](docs/dev-log.md) current. At the start of a session,
read its **Current state** section and latest entries. Before finishing a
session or after committing a completed slice, add a short dated entry at the
top of **Entries** and update **Current state** (in-flight work, blockers,
pending owner decisions, rejected experiments). Keep detailed evidence in the
milestone plans and results files and link to them from the entry.
