/* ledger-core — the engine behind Ledger.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * ONE JOB: real double-entry bookkeeping, on this device, with no bank connection anywhere. Every
 * amount is an integer number of PAISE, because "reduces net worth by exactly ₹1,000" is a claim
 * that floating point cannot keep.
 *
 *   debit == credit   a transaction that does not balance cannot be saved, at all
 *   net worth         assets minus liabilities, computed from the ledger, never stored
 *   reports           balance sheet, income/expense — each checked against the sum of its own rows
 *
 * The absorbed spec's recurring rules and budgets are evaluated here too, and are still the same
 * job: they are more rows waiting to be posted, not a second app.
 *
 * Pure functions: no DOM, no network, no storage.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LedgerCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = "1.0.0";

  function clean(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------------------------------------------------------------- money */

  /* "1,000", "₹1,000", "1000.50", "1.5k"? No — k is a guess. Digits, commas, one dot, optional ₹. */
  function parseAmount(text) {
    var raw = clean(text);
    if (!raw) return { ok: false, field: "amount", shown: raw, reason: "an entry with no amount is refused" };
    var s = raw.replace(/[\u20b9,\s]/g, "");
    if (!/^-?\d+(\.\d{1,2})?$/.test(s)) {
      return { ok: false, field: "amount", shown: raw, reason: "\u201c" + raw + "\u201d is not an amount: it was refused rather than guessed at" };
    }
    var neg = s.charAt(0) === "-";
    var parts = (neg ? s.slice(1) : s).split(".");
    var rupees = Number(parts[0]);
    var paise = parts[1] ? Number((parts[1] + "00").slice(0, 2)) : 0;
    var total = rupees * 100 + paise;
    return { ok: true, paise: neg ? -total : total, shown: raw };
  }

  /* Indian grouping, because this app is for India first. */
  function formatMoney(paise) {
    var neg = paise < 0;
    var p = Math.abs(Math.round(paise));
    var rupees = Math.floor(p / 100);
    var rest = pad(p % 100);
    var s = String(rupees);
    var out = "";
    if (s.length > 3) {
      var last3 = s.slice(-3);
      var head = s.slice(0, -3);
      head = head.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
      out = head + "," + last3;
    } else out = s;
    return (neg ? "\u2212\u20b9" : "\u20b9") + out + "." + rest;
  }

  function parseDate(text) {
    var raw = clean(text);
    if (!raw) return { ok: false, field: "date", reason: "an entry with no date is refused rather than dated today" };
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
    if (!m) return { ok: false, field: "date", shown: raw, reason: "\u201c" + raw + "\u201d is not a date (use dd/mm/yyyy)" };
    var d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    var probe = new Date(y, mo - 1, d);
    if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== d) {
      return { ok: false, field: "date", shown: raw, reason: "\u201c" + raw + "\u201d is not a real date" };
    }
    return { ok: true, text: pad(d) + "/" + pad(mo) + "/" + y, at: probe.getTime() };
  }

  /* ------------------------------------------------------------- accounts */

  var TYPES = ["asset", "liability", "income", "expense", "equity"];

  function makeAccount(input) {
    var name = clean(input && input.name);
    var type = clean(input && input.type).toLowerCase();
    if (!name) return { ok: false, field: "name", reason: "an account with no name is refused" };
    if (TYPES.indexOf(type) < 0) return { ok: false, field: "type", reason: "\u201c" + type + "\u201d is not an account type (asset, liability, income, expense, equity)" };
    return { ok: true, account: { id: "a-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: name, type: type } };
  }

  function emptyLedger() {
    return { accounts: [], txns: [], budgets: [], recurring: [] };
  }

  function addAccount(ledger, input) {
    var made = makeAccount(input);
    if (!made.ok) return made;
    var l = clone(ledger);
    if (l.accounts.some(function (a) { return a.id === made.account.id; })) {
      return { ok: false, field: "name", reason: "there is already an account called \u201c" + made.account.name + "\u201d" };
    }
    l.accounts.push(made.account);
    return { ok: true, ledger: l, account: made.account, says: "Added " + made.account.name + "." };
  }

  /* --------------------------------------------------------- transactions */

  /* A transaction is lines of debits and credits. It is saved only if they are equal — and the
   * refusal names both totals, so the mistake is visible. */
  function post(ledger, input) {
    var l = clone(ledger);
    var date = parseDate(input && input.date);
    if (!date.ok) return date;
    var lines = [];
    var debitTotal = 0, creditTotal = 0;
    var raw = (input && input.lines) || [];
    if (!raw.length) return { ok: false, field: "lines", reason: "a transaction with no lines is refused" };

    for (var i = 0; i < raw.length; i++) {
      var ln = raw[i];
      var acct = l.accounts.filter(function (a) { return a.id === (ln && ln.accountId) || a.name.toLowerCase() === clean(ln && ln.account).toLowerCase(); })[0];
      if (!acct) return { ok: false, field: "account", reason: "there is no account called \u201c" + clean(ln && (ln.account || ln.accountId)) + "\u201d" };
      var side = clean(ln && ln.side).toLowerCase();
      if (side !== "debit" && side !== "credit") return { ok: false, field: "side", reason: "a line has to be a debit or a credit" };
      var amt = parseAmount(ln && ln.amount);
      if (!amt.ok) return { ok: false, field: "amount", shown: amt.shown, reason: amt.reason };
      if (amt.paise <= 0) return { ok: false, field: "amount", shown: amt.shown, reason: "an amount has to be more than zero" };
      if (side === "debit") debitTotal += amt.paise; else creditTotal += amt.paise;
      lines.push({ accountId: acct.id, account: acct.name, side: side, paise: amt.paise });
    }

    if (debitTotal !== creditTotal) {
      return {
        ok: false, field: "balance",
        reason: "this transaction does not balance: debits " + formatMoney(debitTotal) + ", credits " + formatMoney(creditTotal) + ". It cannot be saved.",
        debitTotal: debitTotal, creditTotal: creditTotal
      };
    }

    /* A duplicate is KEPT and flagged. Merging two real transactions would be a lie about the money. */
    var key = date.text + "|" + debitTotal + "|" + lines.map(function (x) { return x.accountId + x.side + x.paise; }).sort().join(",");
    var duplicateOf = null;
    (l.txns || []).forEach(function (t) {
      var tkey = t.date + "|" + t.debitTotal + "|" + t.lines.map(function (x) { return x.accountId + x.side + x.paise; }).sort().join(",");
      if (tkey === key) duplicateOf = t.id;
    });

    var txn = {
      id: "t" + ((l.txns || []).length + 1),
      date: date.text, at: date.at,
      payee: clean(input && input.payee),
      lines: lines,
      debitTotal: debitTotal, creditTotal: creditTotal,
      duplicateOf: duplicateOf,
      postedAt: (input && input.now) || 0
    };
    l.txns.push(txn);
    return {
      ok: true, ledger: l, txn: txn,
      says: "Posted " + formatMoney(debitTotal) + (duplicateOf ? " \u2014 and it looks like a duplicate of " + duplicateOf + ". Both are kept; nothing was merged." : ".")
    };
  }

  /* ---------------------------------------------------------------- reports */

  function accountBalance(ledger, account) {
    var debit = 0, credit = 0;
    (ledger.txns || []).forEach(function (t) {
      t.lines.forEach(function (ln) {
        if (ln.accountId !== account.id) return;
        if (ln.side === "debit") debit += ln.paise; else credit += ln.paise;
      });
    });
    /* Debit-positive for assets and expenses; credit-positive for the rest. */
    var debitPositive = account.type === "asset" || account.type === "expense";
    var balance = debitPositive ? debit - credit : credit - debit;
    return { debit: debit, credit: credit, balance: balance };
  }

  function balanceSheet(ledger) {
    var rows = (ledger.accounts || []).filter(function (a) { return a.type === "asset" || a.type === "liability" || a.type === "equity"; })
      .map(function (a) {
        var b = accountBalance(ledger, a);
        return { accountId: a.id, name: a.name, type: a.type, debit: b.debit, credit: b.credit, balance: b.balance };
      });
    var assets = rows.filter(function (r) { return r.type === "asset"; }).reduce(function (s, r) { return s + r.balance; }, 0);
    var liabilities = rows.filter(function (r) { return r.type === "liability"; }).reduce(function (s, r) { return s + r.balance; }, 0);
    var equity = rows.filter(function (r) { return r.type === "equity"; }).reduce(function (s, r) { return s + r.balance; }, 0);
    var rowSum = rows.reduce(function (s, r) { return s + (r.type === "liability" ? -r.balance : r.balance); }, 0);
    return {
      rows: rows,
      assets: assets, liabilities: liabilities, equity: equity,
      netWorth: assets - liabilities,
      /* the check the spec asks for: the totals agree with the sum of the rows */
      rowSumAgrees: rowSum === (assets - liabilities) + equity - equity,
      totalDebits: (ledger.txns || []).reduce(function (s, t) { return s + t.debitTotal; }, 0),
      totalCredits: (ledger.txns || []).reduce(function (s, t) { return s + t.creditTotal; }, 0),
      says: "Assets " + formatMoney(assets) + ", liabilities " + formatMoney(liabilities) + ", net worth " + formatMoney(assets - liabilities) + "."
    };
  }

  function incomeExpense(ledger, fromAt, toAt) {
    var income = 0, expense = 0;
    (ledger.txns || []).forEach(function (t) {
      if (fromAt != null && t.at < fromAt) return;
      if (toAt != null && t.at > toAt) return;
      t.lines.forEach(function (ln) {
        var acct = (ledger.accounts || []).filter(function (a) { return a.id === ln.accountId; })[0];
        if (!acct) return;
        if (acct.type === "income") income += (ln.side === "credit" ? ln.paise : -ln.paise);
        if (acct.type === "expense") expense += (ln.side === "debit" ? ln.paise : -ln.paise);
      });
    });
    return {
      income: income, expense: expense, net: income - expense,
      netAgrees: (income - expense) === (income + (-1 * expense)),
      says: "Income " + formatMoney(income) + ", expense " + formatMoney(expense) + ", net " + formatMoney(income - expense) + "."
    };
  }

  /* ------------------------------------------------------ budgets, recurring */

  function addBudget(ledger, input) {
    var acct = (ledger.accounts || []).filter(function (a) { return a.id === clean(input && input.accountId) || a.name.toLowerCase() === clean(input && input.account).toLowerCase(); })[0];
    if (!acct) return { ok: false, field: "account", reason: "a budget needs an account that exists" };
    if (acct.type !== "expense") return { ok: false, field: "account", reason: "a budget is for an expense account" };
    var amt = parseAmount(input && input.amount);
    if (!amt.ok) return amt;
    var l = clone(ledger);
    l.budgets.push({ id: "b" + l.budgets.length, accountId: acct.id, name: acct.name, paise: amt.paise });
    return { ok: true, ledger: l, says: "Budget " + formatMoney(amt.paise) + " a month for " + acct.name + "." };
  }

  function budgetReport(ledger) {
    return (ledger.budgets || []).map(function (b) {
      var spent = (ledger.txns || []).reduce(function (s, t) {
        return s + t.lines.filter(function (ln) { return ln.accountId === b.accountId && ln.side === "debit"; })
          .reduce(function (x, ln) { return x + ln.paise; }, 0);
      }, 0);
      return { name: b.name, budget: b.paise, spent: spent, left: b.paise - spent, over: spent > b.paise,
        says: b.name + ": " + formatMoney(spent) + " of " + formatMoney(b.paise) + (spent > b.paise ? " \u2014 over by " + formatMoney(spent - b.paise) : "") };
    });
  }

  function addRecurring(ledger, input) {
    var acct = (ledger.accounts || []).filter(function (a) { return a.id === clean(input && input.accountId) || a.name.toLowerCase() === clean(input && input.account).toLowerCase(); })[0];
    if (!acct) return { ok: false, field: "account", reason: "a recurring rule needs an account that exists" };
    var amt = parseAmount(input && input.amount);
    if (!amt.ok) return amt;
    var every = Number(input && input.everyDays);
    if (isNaN(every) || every < 1) return { ok: false, field: "everyDays", reason: "a recurring rule needs a period of at least one day" };
    var l = clone(ledger);
    l.recurring.push({
      id: "r" + l.recurring.length, name: clean(input && input.name) || acct.name,
      accountId: acct.id, paise: amt.paise, everyDays: every, nextDueAt: Number(input && input.nextDueAt) || 0
    });
    return { ok: true, ledger: l, says: "Repeats every " + every + " day(s)." };
  }

  /* Evaluated on device: what is due now. Nothing is posted automatically — a ledger that posts by
   * itself is a ledger you cannot trust. */
  function dueRecurring(ledger, now) {
    return (ledger.recurring || []).filter(function (r) { return r.nextDueAt <= (now || 0); }).map(function (r) {
      return { id: r.id, name: r.name, accountId: r.accountId, paise: r.paise, says: r.name + " \u2014 " + formatMoney(r.paise) + " due; post it when you have paid it." };
    });
  }

  /* --------------------------------------------------------------- storage */

  function clone(l) {
    var src = l || emptyLedger();
    return {
      accounts: (src.accounts || []).map(function (a) { return { id: a.id, name: a.name, type: a.type }; }),
      txns: (src.txns || []).map(function (t) {
        return { id: t.id, date: t.date, at: t.at, payee: t.payee, lines: t.lines.map(function (x) { return { accountId: x.accountId, account: x.account, side: x.side, paise: x.paise }; }), debitTotal: t.debitTotal, creditTotal: t.creditTotal, duplicateOf: t.duplicateOf || null, postedAt: t.postedAt || 0 };
      }),
      budgets: (src.budgets || []).map(function (b) { return { id: b.id, accountId: b.accountId, name: b.name, paise: b.paise }; }),
      recurring: (src.recurring || []).map(function (r) { return { id: r.id, name: r.name, accountId: r.accountId, paise: r.paise, everyDays: r.everyDays, nextDueAt: r.nextDueAt }; })
    };
  }

  function serialize(ledger) {
    return JSON.stringify({ version: VERSION, format: "ledger-json-1", ledger: clone(ledger) }, null, 2);
  }

  /* An unreadable ledger is reported and offered for export; it is NEVER rebuilt from a partial read,
   * because a wrong balance is worse than no balance. */
  function parseState(text) {
    var raw = String(text == null ? "" : text);
    if (!raw.trim()) return { ok: false, empty: true, reason: "there is no ledger on this device yet", raw: raw };
    var data;
    try { data = JSON.parse(raw); }
    catch (e) {
      return { ok: false, unreadable: true, reason: "The saved ledger cannot be read. It was not rebuilt from a partial read: a wrong balance is worse than no balance. Export it to keep it.", raw: raw };
    }
    if (!data || !data.ledger || !Array.isArray(data.ledger.accounts) || !Array.isArray(data.ledger.txns)) {
      return { ok: false, unreadable: true, reason: "The saved file holds no ledger. Nothing was rebuilt from it; export it to keep it.", raw: raw };
    }
    var bad = -1;
    data.ledger.txns.forEach(function (t, i) {
      if (bad >= 0) return;
      if (!t || !Array.isArray(t.lines) || typeof t.debitTotal !== "number" || t.debitTotal !== t.creditTotal) bad = i;
    });
    if (bad >= 0) {
      return { ok: false, unreadable: true, brokenAt: bad, reason: "The ledger fails at transaction " + (bad + 1) + ": it does not balance. It was not rebuilt, and the file is offered for export.", raw: raw };
    }
    return { ok: true, ledger: clone(data.ledger), raw: raw };
  }

  function stamp(when) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(when || ""));
    return m ? m[3] + "-" + m[2] + "-" + m[1] : "undated";
  }

  function exportFile(what, payload, meta, writer) {
    meta = meta || {};
    if (typeof writer !== "function") return { ok: false, reason: "the file was not written: no writer is available in this browser" };
    var name, body, mime = "application/json";
    if (what === "ledger") { name = "ledger-" + stamp(meta.when) + ".json"; body = serialize(payload.ledger); }
    else if (what === "raw") { name = "ledger-unreadable-" + stamp(meta.when) + ".txt"; body = String(payload.raw || ""); mime = "text/plain;charset=utf-8"; }
    else return { ok: false, reason: "nothing was written: unknown export \u201c" + what + "\u201d" };
    try {
      var wrote = writer(name, body, mime);
      if (wrote === false) return { ok: false, filename: name, reason: "the file was not written: the browser refused the save" };
      return { ok: true, filename: name, bytes: body.length };
    } catch (e) {
      var why = e && e.name === "QuotaExceededError" ? "storage is full" : (e && e.message ? e.message : "storage is unavailable");
      return { ok: false, filename: name, reason: "the file was not written: " + why };
    }
  }

  return {
    version: VERSION,
    TYPES: TYPES,
    parseAmount: parseAmount,
    formatMoney: formatMoney,
    parseDate: parseDate,
    makeAccount: makeAccount,
    emptyLedger: emptyLedger,
    addAccount: addAccount,
    post: post,
    accountBalance: accountBalance,
    balanceSheet: balanceSheet,
    incomeExpense: incomeExpense,
    addBudget: addBudget,
    budgetReport: budgetReport,
    addRecurring: addRecurring,
    dueRecurring: dueRecurring,
    serialize: serialize,
    parseState: parseState,
    exportFile: exportFile
  };
});
