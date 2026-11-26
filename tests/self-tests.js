#!/usr/bin/env node
/* self-tests — Ledger. No framework, no dependencies.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * The spec's "done means" is countable to the paisa, so it is counted:
 *
 *   "Recording a ₹1,000 expense from a bank account into 'food' leaves total debits equal to total
 *    credits and reduces net worth by exactly ₹1,000; a transaction that does not balance cannot be
 *    saved. The balance sheet's totals agree with the sum of its account rows, the income/expense
 *    report's net equals income minus expense, and a full export re-imports on a second device with
 *    identical totals."
 *
 *   node tests/self-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var L = require(path.join(ROOT, "docs", "play", "ledger-core.js"));

var passed = 0, failed = [], group = "";
function section(n) { group = n; }
function ok(name, cond, detail) { if (cond) { passed++; return; } failed.push(group + " :: " + name + (detail ? " — " + detail : "")); }
function eq(name, a, b) { ok(name, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }
function read(f) { return fs.readFileSync(path.join(ROOT, f), "utf8"); }

function seeded() {
  var l = L.emptyLedger();
  [["Bank", "asset"], ["Food", "expense"], ["Salary", "income"], ["Card", "liability"]].forEach(function (p) {
    l = L.addAccount(l, { name: p[0], type: p[1] }).ledger;
  });
  return l;
}
function thousandExpense(l) {
  return L.post(l, { date: "26/11/2026", payee: "Groceries", now: 1, lines: [
    { account: "Food", side: "debit", amount: "1,000" },
    { account: "Bank", side: "credit", amount: "1,000" }
  ] });
}

/* ================================================ the spec's own "done means" */

section("done means — a ₹1,000 expense leaves debits equal to credits and cuts net worth by exactly ₹1,000");
var before = L.balanceSheet(seeded()).netWorth;
var posted = thousandExpense(seeded());
eq("the transaction posts", posted.ok, true);
var l = posted.ledger;
var bs = L.balanceSheet(l);
eq("total debits equal total credits", bs.totalDebits, bs.totalCredits);
eq("and they are ₹1,000", bs.totalDebits, 100000);
eq("net worth falls by exactly ₹1,000", bs.netWorth - before, -100000);
eq("in paise, not floating point", bs.netWorth, -100000);
ok("the money reads as rupees", L.formatMoney(bs.netWorth) === "\u2212\u20b91,000.00", L.formatMoney(bs.netWorth));

section("done means — a transaction that does not balance cannot be saved");
var unbalanced = L.post(seeded(), { date: "26/11/2026", lines: [
  { account: "Food", side: "debit", amount: "500" },
  { account: "Bank", side: "credit", amount: "400" }
] });
eq("it is refused", unbalanced.ok, false);
eq("the field is the balance", unbalanced.field, "balance");
ok("both totals are shown", /debits \u20b9500\.00, credits \u20b9400\.00/.test(unbalanced.reason), unbalanced.reason);
eq("no ledger is returned to save", unbalanced.ledger, undefined);

section("done means — the balance sheet's totals agree with the sum of its rows");
var rowsSum = bs.rows.reduce(function (s, r) { return s + (r.type === "liability" ? -r.balance : r.balance); }, 0);
eq("the rows add up to the net worth", rowsSum, bs.netWorth);
eq("and the app says so", bs.rowSumAgrees, true);
eq("assets minus liabilities is the net worth", bs.assets - bs.liabilities, bs.netWorth);
eq("the asset row is the bank", bs.rows.filter(function (r) { return r.name === "Bank"; })[0].balance, -100000);

section("done means — the income/expense report's net equals income minus expense");
var withIncome = L.post(l, { date: "26/11/2026", payee: "Salary", now: 2, lines: [
  { account: "Bank", side: "debit", amount: "50,000" },
  { account: "Salary", side: "credit", amount: "50,000" }
] }).ledger;
var ie = L.incomeExpense(withIncome);
eq("income is ₹50,000", ie.income, 5000000);
eq("expense is ₹1,000", ie.expense, 100000);
eq("net is income minus expense", ie.net, ie.income - ie.expense);
eq("which is ₹49,000", ie.net, 4900000);
eq("and the app says the net agrees", ie.netAgrees, true);
eq("net worth after both is ₹49,000", L.balanceSheet(withIncome).netWorth, 4900000);

section("done means — a full export re-imports with identical totals");
var file = L.serialize(withIncome);
var back = L.parseState(file);
eq("the file parses", back.ok, true);
eq("the transaction count matches", back.ledger.txns.length, withIncome.txns.length);
eq("the net worth matches", L.balanceSheet(back.ledger).netWorth, L.balanceSheet(withIncome).netWorth);
eq("the totals match", L.balanceSheet(back.ledger).totalDebits, L.balanceSheet(withIncome).totalDebits);
eq("income/expense matches", L.incomeExpense(back.ledger).net, L.incomeExpense(withIncome).net);
eq("and the file says what it is", JSON.parse(file).format, "ledger-json-1");

/* ============================================================ must-nots */

section("must-not — bad input is refused, with the value shown");
var badAmt = L.post(seeded(), { date: "26/11/2026", lines: [
  { account: "Food", side: "debit", amount: "abc" }, { account: "Bank", side: "credit", amount: "1" }
] });
eq("an unparseable amount is refused", badAmt.ok, false);
eq("the value is shown back", badAmt.shown, "abc");
ok("and the reason quotes it", /abc/.test(badAmt.reason), badAmt.reason);
eq("no date is refused rather than dated today", L.post(seeded(), { lines: [] }).field, "date");
ok("and says so", /rather than dated today/.test(L.post(seeded(), {}).reason), L.post(seeded(), {}).reason);
eq("an impossible date is refused", L.post(seeded(), { date: "31/02/2026", lines: [] }).field, "date");
eq("a zero amount is refused", L.post(seeded(), { date: "26/11/2026", lines: [
  { account: "Food", side: "debit", amount: "0" }, { account: "Bank", side: "credit", amount: "0" }
] }).ok, false);
eq("an unknown account is refused", L.post(seeded(), { date: "26/11/2026", lines: [
  { account: "Nowhere", side: "debit", amount: "10" }, { account: "Bank", side: "credit", amount: "10" }
] }).field, "account");

section("must-not — two identical entries are both kept and flagged, never merged");
var once = thousandExpense(seeded());
var twice = L.post(once.ledger, { date: "26/11/2026", payee: "Groceries", now: 3, lines: [
  { account: "Food", side: "debit", amount: "1000" }, { account: "Bank", side: "credit", amount: "1000" }
] });
eq("both transactions are in the ledger", twice.ledger.txns.length, 2);
ok("the second is flagged as a duplicate", !!twice.txn.duplicateOf, twice.txn.duplicateOf);
ok("and the app says nothing was merged", /nothing was merged/.test(twice.says), twice.says);
eq("net worth counts both", L.balanceSheet(twice.ledger).netWorth, -200000);

section("must-not — it never connects to a bank, and has no network code at all");
var core = read("docs/play/ledger-core.js");
ok("no fetch, XHR, WebSocket or beacon", !/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(core + read("docs/play/app.js")));
ok("no URL anywhere in the engine", !/https?:\/\//.test(core));
ok("no bank or account-sync field", !/\b(bankSync|plaid|openBanking|accessToken|accountNumber)\s*[:=]/i.test(core));
ok("the page forbids connections", /connect-src 'none'/.test(read("docs/play/index.html")));

section("must-not — an unreadable ledger is never rebuilt from a partial read");
var bad = L.parseState("{ broken ledger");
eq("it is reported", bad.ok, false);
eq("it is marked unreadable", bad.unreadable, true);
ok("it says it was not rebuilt", /not rebuilt from a partial read/.test(bad.reason), bad.reason);
ok("and why a wrong balance is worse", /a wrong balance is worse than no balance/.test(bad.reason), bad.reason);
eq("the raw text is kept for export", bad.raw, "{ broken ledger");
var brokenTxn = L.parseState(JSON.stringify({ ledger: { accounts: [], txns: [{ id: "t1", date: "26/11/2026", lines: [], debitTotal: 100, creditTotal: 90 }] } }));
eq("a ledger with an unbalanced transaction is refused", brokenTxn.ok, false);
eq("at the transaction that fails", brokenTxn.brokenAt, 0);
ok("and is not rebuilt", /was not rebuilt/.test(brokenTxn.reason), brokenTxn.reason);
eq("nothing saved yet is distinguished from a broken ledger", L.parseState("").empty, true);

section("budgets and repeats — evaluated on device, nothing posts by itself");
var budgeted = L.addBudget(withIncome, { account: "Food", amount: "800" });
eq("a budget is set", budgeted.ok, true);
var br = L.budgetReport(budgeted.ledger);
eq("one budget", br.length, 1);
eq("spent is ₹1,000", br[0].spent, 100000);
eq("against a budget of ₹800", br[0].budget, 80000);
eq("so it is over", br[0].over, true);
eq("by ₹200", br[0].left, -20000);
var rec = L.addRecurring(withIncome, { account: "Card", amount: "500", everyDays: 30, nextDueAt: 0, name: "Card bill" });
eq("a repeat is added", rec.ok, true);
eq("it is due now", L.dueRecurring(rec.ledger, 1000).length, 1);
eq("and nothing was posted by it", rec.ledger.txns.length, withIncome.txns.length);
eq("a budget on a non-expense account is refused", L.addBudget(withIncome, { account: "Bank", amount: "100" }).field, "account");

section("failure case — storage full or unavailable");
var thrown = L.exportFile("ledger", { ledger: withIncome }, { when: "26/11/2026" }, function () {
  var e = new Error("quota"); e.name = "QuotaExceededError"; throw e;
});
eq("a failed write is reported as failed", thrown.ok, false);
ok("it says the file was not written", /not written/.test(thrown.reason), thrown.reason);
ok("it names the cause", /storage is full/.test(thrown.reason));
eq("no writer means no file", L.exportFile("ledger", { ledger: withIncome }, {}, null).ok, false);
ok("the page says the balance does not include it", /balance does NOT include this entry/.test(read("docs/play/app.js")));

section("money parsing — the values a person actually types");
eq("1,000", L.parseAmount("1,000").paise, 100000);
eq("₹1,000", L.parseAmount("\u20b91,000").paise, 100000);
eq("1000.50", L.parseAmount("1000.50").paise, 100050);
eq("1000.5", L.parseAmount("1000.5").paise, 100050);
eq("with spaces", L.parseAmount(" 1 000 ").paise, 100000);
eq("empty is refused", L.parseAmount("").ok, false);
eq("a word is refused", L.parseAmount("a lot").ok, false);
eq("three decimals is refused", L.parseAmount("10.555").ok, false);
eq("formatting groups in lakhs", L.formatMoney(1234567890), "\u20b91,23,45,678.90");
/* the amounts where floating-point rupees drift: 1000.10 * 100 is 100009.99999999999 in a float,
 * which is why the engine keeps every amount as integer paise */
eq("1000.10 is exactly 100010 paise", L.parseAmount("1000.10").paise, 100010);
eq("0.10 is exactly 10 paise", L.parseAmount("0.10").paise, 10);
eq("8,000.05 is exactly 800005 paise", L.parseAmount("8,000.05").paise, 800005);
eq("1,23,456.78 is exactly 12345678 paise", L.parseAmount("1,23,456.78").paise, 12345678);
/* 4.35 * 100 is 434.99999999999994 in a double, and 8.20 * 100 is 819.9999999999999: these are the
 * values that prove the engine is not doing rupee arithmetic in floating point */
eq("4.35 is exactly 435 paise", L.parseAmount("4.35").paise, 435);
eq("8.20 is exactly 820 paise", L.parseAmount("8.20").paise, 820);
eq("2.675 is refused rather than rounded", L.parseAmount("2.675").ok, false);

section("shape — every script the page loads exists beside it");
var page = read("docs/play/index.html");
var srcs = (page.match(/<script[^>]+src="([^"]+)"/g) || []).map(function (t) { return t.replace(/.*src="([^"]+)"/, "$1"); });
srcs.forEach(function (s) { ok("script src resolves: " + s, fs.existsSync(path.join(ROOT, "docs", "play", s.replace(/^\.\//, "")))); });
ok("the landing page exists", fs.existsSync(path.join(ROOT, "docs", "index.html")));
ok("the page manifest exists", fs.existsSync(path.join(ROOT, "PAGES.json")));

var total = passed + failed.length;
if (!total) { console.error("self-tests: 0 assertions ran. That is a failure, not a pass."); process.exit(1); }
if (failed.length) {
  console.error("self-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.slice(0, 12).forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("self-tests: " + passed + "/" + total + " assertions passed");
