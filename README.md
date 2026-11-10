# SQLপাঠ — Interactive SQL Learning

A buildless Bangla/English learning platform. No account, backend, production database, or paid API is needed.

## Run locally

Use Node 18+ for tests and Python 3 for serving:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. Use HTTP rather than opening `index.html` as a file: workers and WebAssembly need an HTTP origin. All runtime assets are bundled locally; there are no CDN requests.

```sh
node tests/sql.test.cjs
```

No package installation or build is required. Static hosts can serve the repository directly. Serve `.wasm` as `application/wasm`.

## Features

- Separate responsive pages for SQL lessons, the SQLite playground, practice challenges, data types, and the cheat sheet.
- Every page starts with the shared "Learn SQL by Writing Real Queries" banner.
- Homepage shows the original HSC simulator directly below the banner as a permanently visible section.
- Shared navigation, theme toggle, keyboard-accessible controls, and reduced-motion support.
- 30 searchable lessons across DDL/DML/DQL/DCL/TCL and relationships; 28 executable SQLite examples, two server permission reference lessons.
- Local SQLite playground with indentation, copy/clear, example selector, Ctrl/Cmd+Enter, multiple result sets, row counts and timing.
- Live database schema, primary/foreign keys, relationship list, and four seeded school tables.
- 12 challenges with hints, solutions and behavior-based checking against fresh, isolated sample databases.
- Lesson/challenge completion and ten recent successful queries saved in localStorage. Storage failures do not prevent learning.
- Original strict HSC simulator remains directly visible on the homepage. Its interactive type lab includes live checks and custom values.
- A data-type quick guide, SQL cheat sheet, and local progress reset.

## Execution and limits

The new playground runs **SQLite**, bundled through sql.js 1.13.0 (MIT, see `assets/SQLJS-LICENSE.txt`). The actual bundled SQLite version appears in the UI. SQL runs in a disposable Web Worker, only against an in-memory database. It has no application database connection, server credentials or server filesystem access.

A 5-second query timeout terminates the worker. Recover database starts a fresh seed; it cannot preserve an unfinished transaction. Initialization gets 15 seconds. Queries are limited to 50,000 characters and 10,000 returned rows per statement; results display the first 300 rows and explorer tables the first 100. This is a lightweight browser learning environment, not a server-grade resource sandbox: large allocations can still consume tab memory before timeout.

Multiple statements execute in sequence. Earlier statements may remain committed when a later statement fails; use explicit transactions when appropriate. Database state lasts until reload/reset. Progress and recent query text persist on this device; no database or query is uploaded.

Challenges use fresh seed data, never the current playground. Read challenges compare column count and row values (ignoring aliases; ordering checked for sorting tasks), and reject persistent database mutations. Mutation challenges compare all table definitions and row values. Equivalent SQL is accepted; this is a learning checker, not an adversarial grading system.

### Dialects

- The original simulator is a deliberately strict, simplified MySQL-style teaching implementation, including simplified CHAR/BOOLEAN/TIME behavior and JavaScript safe-integer limits.
- SQLite uses affinity: `VARCHAR(n)` lengths and `DECIMAL(p,s)` precision are not enforced. Use `CHECK` constraints, or integer minor currency units, when appropriate. SQLite has no dedicated DATE/DATETIME or BOOLEAN storage class. Large 64-bit integer results may lose precision when exposed as JavaScript numbers.
- SQLite supports the demonstrated JOINs, aggregation, subqueries, transactions, ADD COLUMN and RENAME. MySQL `MODIFY COLUMN`, `RENAME TABLE`, `TRUNCATE`, `GRANT`, `REVOKE`, and inline `ENUM` are not supported in this playground. DCL lessons are explicitly reference-only; TRUNCATE teaches the executable DELETE alternative.
- No Monaco/CodeMirror dependency, SQL formatter, autocomplete, or syntax highlighting is included; the lightweight editor supports tab indentation.
- Documentation is bilingual rather than a complete language-switching translation system. Progress is local, with no cross-device account synchronization.

References: [SQLite data types](https://www.sqlite.org/datatype3.html), [ALTER TABLE](https://www.sqlite.org/lang_altertable.html).

## Files

- `index.html`: homepage banner and original HSC simulator.
- `learn.html`, `playground.html`, `practice.html`, `data-types.html`, `cheat-sheet.html`: dedicated learning pages.
- `assets/app.css`: shared page and HSC simulator styles.
- `assets/pages.js`: page-specific lesson, playground, practice, data-type, and cheat-sheet interactions.
- `assets/platform.css`: responsive design and themes.
- `assets/platform.js`: retained legacy single-page runtime; the dedicated pages use `assets/pages.js`.
- `assets/curriculum.js`: shared lessons, exercises and seed data.
- `assets/sql-worker.js`: isolated execution, limits and challenge checks.
- `assets/sql-wasm.js`, `assets/sql-wasm.wasm`: vendored sql.js runtime.
- `tests/sql.test.cjs`: executable curriculum and SQL behavior checks.
