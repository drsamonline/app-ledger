# Ledger

Real double-entry bookkeeping on this device. **A transaction that does not balance cannot be saved**,
and nothing ever connects to a bank.

- **Demo (the app itself):** https://drsamonline.github.io/app-ledger/play/index.html
- **Landing page:** https://drsamonline.github.io/app-ledger/
- **Release:** https://github.com/drsamonline/app-ledger/releases/tag/app-latest
- **Plan row:** #17 of 37 in `drsamonline/forge` → `QUEUE/PLAN.json`
- **Specs absorbed:** `app-ledger` (lead), `app-subscriptions`
- **Licence:** PolyForm Noncommercial 1.0.0
- **Sponsor:** [github.com/sponsors/drsamonline](https://github.com/sponsors/drsamonline) — free, offline, no account

## Status

| | |
|---|---|
| **Built** | Five account types; double-entry posting with a hard balance rule; net worth derived; balance sheet and income/expense checked against their own rows; budgets and repeats evaluated on device; JSON export/import with identical totals; duplicates kept and flagged. |
| **Release** | Windows EXE, Android APK and Linux binary, built from this source by `app-builder` in CI. |
| **Not built** | **Reading a receipt photo.** No OCR exists in this estate, so entries are typed — said on the page rather than shipping a camera button that does nothing. |
| **Untested** | A real year of someone's accounts. The arithmetic is asserted to the paisa; whether the account structure fits how a household actually thinks about money is a judgement no test makes. |

## The spec's "done means", counted to the paisa

> "Recording a ₹1,000 expense from a bank account into 'food' leaves total debits equal to total
> credits and reduces net worth by exactly ₹1,000; a transaction that does not balance cannot be
> saved. The balance sheet's totals agree with the sum of its account rows, the income/expense
> report's net equals income minus expense, and a full export re-imports on a second device with
> identical totals."

| The spec says | The test |
|---|---|
| debits equal credits | `totalDebits === totalCredits === 100000` paise |
| net worth falls by exactly ₹1,000 | `netWorth - before === -100000`, and the screen reads `−₹1,000.00` |
| an unbalanced transaction cannot be saved | refused, `field: "balance"`, both totals shown, **no ledger returned** |
| balance-sheet totals agree with the rows | the rows are summed in the test and compared to `netWorth` |
| income/expense net = income − expense | ₹50,000 income, ₹1,000 expense, net ₹49,000 |
| export re-imports with identical totals | round trip, then net worth and totals compared |

## Why integer paise, and not rupees

```
4.35 × 100  =  434.99999999999994      (a double)
8.20 × 100  =  819.9999999999999
```

"Exactly ₹1,000" is a claim floating point cannot keep. Every amount in this engine is an integer
number of paise, and the suite pins 4.35 and 8.20 specifically — those are the values where rupee
arithmetic drifts.

## What it will not do

- **Connect to a bank.** No `fetch`, no XHR, no WebSocket, no URL in the engine; CSP `connect-src 'none'`.
- **Save an unbalanced transaction.** Both totals shown instead.
- **Date an entry for you.** No date is refused.
- **Merge duplicates.** Both kept, one flagged.
- **Rebuild an unreadable ledger.** A wrong balance is worse than no balance.
- **Post a repeat by itself.**

## When things go wrong

| Case | Behaviour |
|---|---|
| **Bad input** | Each refusal names the field and shows the value; an unparseable amount is never guessed at. |
| **No network** | Nothing changes — there is nothing remote to change. |
| **Storage full or unavailable** | **NOT SAVED**, and the balance does not include the entry. |
| **Corrupt saved state** | Reported, offered for export, never rebuilt; a ledger with an unbalanced transaction is refused at that transaction. |

## Tests

```bash
npm test                      # all three suites
node tests/self-tests.js      # engine — 88 assertions, the done-means to the paisa
node tests/ui-tests.js        # the page in jsdom — 20 assertions (needs the dev-only jsdom)
node tests/page-smoke.js      # every local src/href resolves, nothing off-origin
```

Mutation-tested six ways on 26/11/2026. Five failed immediately (unbalanced saved, 4 failures;
duplicates merged, 3; no date dated today, 2; unreadable rebuilt, 4; repeats posting themselves, 1).
**One survived twice before it failed**, and it was the most instructive: replacing integer paise with
float rupees gave the *same answers* at 1000.10 and 8,000.05, because JavaScript's rounding hides the
drift at those magnitudes. It only went red once the suite pinned **4.35** and **8.20** — the values
where `× 100` really does drift. A mutation that survives can mean the test is too weak *or* the
mutation is equivalent, and telling those apart took three attempts.

## Layout

```
docs/index.html            landing page
docs/play/index.html       the app — accounts, posting, net worth, reports, budgets, export
docs/play/app.js           DOM wiring: the lines, the balance note, the reports, import/export
docs/play/ledger-core.js   the engine — money, double entry, reports, budgets, repeats, storage
docs/play/web-kit.js       vendored kit (unmodified)
docs/play/export-kit.js    vendored kit (unmodified)
tests/self-tests.js        engine suite (88)
tests/ui-tests.js          page suite (20, jsdom)
tests/page-smoke.js        shape on disk
PAGES.json                 landing = docs/index.html, app = docs/play/index.html
```

## Where the spec was silent, and what was chosen

- **Amounts are positive, the side decides the direction.** A negative amount is refused, because "−₹500 debit" is a credit wearing a disguise.
- **Duplicates are detected on date + amount + the exact set of lines**, and both are kept. A stricter rule would flag legitimate repeated purchases; a looser one would miss a double entry.
- **Repeats are listed, never posted.** The spec says the rules are evaluated on device, and posting money without a human is the one thing a ledger must not do.
- **Net worth is never stored.** A stored balance can disagree with the transactions; a derived one cannot.
- **The export is plain JSON with a `format` field**, so a future version can refuse a file it does not understand rather than half-read it.

## What is not built, and why

**Receipt OCR.** There is no OCR or vision component anywhere in this estate, so the entry is typed.
A camera button that opens nothing would be worse than the honest absence.

**Bank sync, of course.** That is the whole point of the app: it is a finance app whose selling point
is what it refuses to do.
