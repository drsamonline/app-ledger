#!/usr/bin/env node
/* ui-tests — the Ledger page in a real DOM (jsdom).
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 *   npm install --no-save jsdom && node tests/ui-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var { JSDOM } = require("jsdom");

var ROOT = path.join(__dirname, "..");
var PLAY = path.join(ROOT, "docs", "play");
var PAGE = path.join(PLAY, "index.html");

var passed = 0, failed = [];
function ok(n, c, d) { if (c) { passed++; return; } failed.push(n + (d ? " — " + d : "")); }
function eq(n, a, b) { ok(n, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }

function build(seed) {
  var dom = new JSDOM(fs.readFileSync(PAGE, "utf8"), { url: "https://example.test/play/index.html", runScripts: "outside-only", pretendToBeVisual: true });
  var w = dom.window;
  if (seed) Object.keys(seed).forEach(function (k) { w.localStorage.setItem(k, seed[k]); });
  w.URL.createObjectURL = function () { return "blob:x"; };
  w.URL.revokeObjectURL = function () {};
  w.HTMLAnchorElement.prototype.click = function () {};
  ["web-kit.js", "export-kit.js", "ledger-core.js", "app.js"].forEach(function (f) {
    w.eval(fs.readFileSync(path.join(PLAY, f), "utf8"));
  });
  return dom;
}

var dom = build(null), w = dom.window, d = w.document;
var $ = function (id) { return d.getElementById(id); };

ok("the engine loaded", !!w.LedgerCore);
eq("net worth starts at zero", $("netWorth").textContent, "\u20b90.00");

/* the four accounts, then the ₹1,000 expense, through the page */
$("seed").click();
eq("four accounts are listed", d.querySelectorAll("#acctTable tbody tr").length, 4);

function fillLine(i, accountName, side, amount) {
  var row = d.querySelectorAll("#lines .line")[i];
  var sel = row.querySelector(".ln-acct");
  var opt = Array.prototype.filter.call(sel.options, function (o) { return o.textContent === accountName; })[0];
  sel.value = opt.value;
  row.querySelector(".ln-side").value = side;
  row.querySelector(".ln-amt").value = amount;
  row.querySelector(".ln-amt").dispatchEvent(new w.Event("input", { bubbles: true }));
}

$("txnDate").value = "26/11/2026";
fillLine(0, "Food", "debit", "1,000");
fillLine(1, "Bank", "credit", "1,000");
ok("the page says it is balanced", /balanced/.test($("balanceNote").textContent) && !/not balanced/.test($("balanceNote").textContent), $("balanceNote").textContent);

$("postBtn").click();
ok("the transaction posts", /Posted \u20b91,000\.00/.test($("status").textContent), $("status").textContent);
eq("net worth is minus ₹1,000", $("netWorth").textContent, "\u2212\u20b91,000.00");
ok("the totals balance on screen", /Totals balance/.test($("netNote").textContent), $("netNote").textContent);
ok("the expense shows in the income/expense report", /\u2212\u20b91,000\.00/.test($("ieTable").textContent), $("ieTable").textContent);

/* an unbalanced entry is refused, and nothing changes */
fillLine(0, "Food", "debit", "500");
fillLine(1, "Bank", "credit", "400");
ok("the page warns before posting", /not balanced, and this cannot be saved/.test($("balanceNote").textContent), $("balanceNote").textContent);
$("postBtn").click();
ok("the post is refused", /does not balance/.test($("status").textContent), $("status").textContent);
eq("net worth is unchanged", $("netWorth").textContent, "\u2212\u20b91,000.00");

/* export */
$("exportBtn").click();
ok("the ledger exports", /Wrote ledger-\d{4}-\d\d-\d\d\.json/.test($("ioNote").textContent), $("ioNote").textContent);

/* reload keeps the totals */
var saved = w.localStorage.getItem("ledger:state");
ok("the ledger was saved", !!saved);
var dom2 = build({ "ledger:state": saved });
var d2 = dom2.window.document;
eq("the reload keeps the net worth", d2.getElementById("netWorth").textContent, "\u2212\u20b91,000.00");
eq("the reload keeps four accounts", d2.querySelectorAll("#acctTable tbody tr").length, 4);

/* an unreadable ledger */
var dom3 = build({ "ledger:state": "{ broken ledger" });
var d3 = dom3.window.document;
ok("an unreadable ledger is reported", /cannot be read/.test(d3.getElementById("status").textContent), d3.getElementById("status").textContent);
ok("it says it was not rebuilt", /not rebuilt from a partial read/.test(d3.getElementById("status").textContent));
ok("it offers an export of the unreadable ledger",
  Array.prototype.some.call(d3.querySelectorAll("button"), function (b) { return /Export the unreadable ledger/.test(b.textContent); }));

/* a failed save says the balance does not include the entry */
var dom4 = build(null), w4 = dom4.window, d4 = dom4.window.document;
Object.defineProperty(w4, "localStorage", { configurable: true, get: function () {
  return { getItem: function () { return null; }, setItem: function () { var e = new Error("q"); e.name = "QuotaExceededError"; throw e; }, removeItem: function () {}, clear: function () {} };
} });
d4.getElementById("seed").click();
ok("a failed save says NOT SAVED", /NOT SAVED:/.test(d4.getElementById("status").textContent), d4.getElementById("status").textContent);
ok("and says the balance does not include it", /balance does NOT include this entry/.test(d4.getElementById("status").textContent));

var total = passed + failed.length;
if (!total) { console.error("ui-tests: 0 assertions ran."); process.exit(1); }
if (failed.length) { console.error("ui-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED"); failed.forEach(function (f) { console.error("  FAIL " + f); }); process.exit(1); }
console.log("ui-tests: " + passed + "/" + total + " assertions passed");
dom.window.close(); dom2.window.close(); dom3.window.close(); dom4.window.close();
