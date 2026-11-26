/* app — the Ledger page. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * Wiring only: the balancing rule, the reports and the storage live in ledger-core.js.
 */
(function () {
  "use strict";

  var L = window.LedgerCore;
  var $ = function (id) { return document.getElementById(id); };

  var K = "ledger:state";
  var state = { ledger: L.emptyLedger(), unreadable: null };

  var els = {
    status: $("status"), acctName: $("acctName"), acctType: $("acctType"), addAcct: $("addAcct"),
    acctTable: $("acctTable"), seed: $("seed"),
    txnDate: $("txnDate"), txnPayee: $("txnPayee"), lines: $("lines"), addLine: $("addLine"), postBtn: $("postBtn"), balanceNote: $("balanceNote"),
    netWorth: $("netWorth"), netNote: $("netNote"), bsTable: $("bsTable"),
    ieSays: $("ieSays"), ieTable: $("ieTable"),
    budgetAcct: $("budgetAcct"), budgetAmt: $("budgetAmt"), addBudget: $("addBudget"), budgetTable: $("budgetTable"), recurringSays: $("recurringSays"),
    exportBtn: $("exportBtn"), importFile: $("importFile"), ioNote: $("ioNote")
  };

  function today() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }
  function setStatus(kind, msg) { els.status.className = "status show " + kind; els.status.textContent = msg; }
  function node(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function persist() {
    try { window.localStorage.setItem(K, L.serialize(state.ledger)); return true; }
    catch (e) {
      setStatus("bad", "NOT SAVED: " + (e && e.name === "QuotaExceededError" ? "storage is full" : "storage is unavailable") +
        ". The balance does NOT include this entry.");
      return false;
    }
  }

  /* --------------------------------------------------------------- render */

  function renderLines() {
    els.lines.textContent = "";
    [0, 1].forEach(function (i) {
      var row = node("div", "line");
      var acct = document.createElement("select");
      acct.className = "ln-acct";
      var blank = document.createElement("option");
      blank.value = ""; blank.textContent = "account";
      acct.appendChild(blank);
      state.ledger.accounts.forEach(function (a) {
        var o = document.createElement("option"); o.value = a.id; o.textContent = a.name; acct.appendChild(o);
      });
      var side = document.createElement("select");
      side.className = "ln-side";
      ["debit", "credit"].forEach(function (s) { var o = document.createElement("option"); o.value = s; o.textContent = s; side.appendChild(o); });
      if (i === 1) side.value = "credit";
      var amt = document.createElement("input");
      amt.type = "text"; amt.className = "ln-amt"; amt.placeholder = "amount";
      row.appendChild(acct); row.appendChild(side); row.appendChild(amt);
      row.appendChild(node("span", "hint", ""));
      els.lines.appendChild(row);
    });
    updateBalanceNote();
  }

  function readLines() {
    return Array.prototype.map.call(document.querySelectorAll("#lines .line"), function (row) {
      return {
        accountId: row.querySelector(".ln-acct").value,
        side: row.querySelector(".ln-side").value,
        amount: row.querySelector(".ln-amt").value
      };
    }).filter(function (x) { return x.accountId || x.amount; });
  }

  function updateBalanceNote() {
    var lines = readLines(), d = 0, c = 0, bad = false;
    lines.forEach(function (ln) {
      var a = L.parseAmount(ln.amount);
      if (!a.ok) { bad = true; return; }
      if (ln.side === "debit") d += a.paise; else c += a.paise;
    });
    els.balanceNote.textContent = bad && !lines.length ? "" :
      "Debits " + L.formatMoney(d) + " \u00b7 credits " + L.formatMoney(c) + (d === c ? " \u2014 balanced." : " \u2014 not balanced, and this cannot be saved.");
    els.balanceNote.style.color = (d === c && !bad) ? "var(--muted)" : "var(--bad)";
  }

  function render() {
    var l = state.ledger;

    var tb = els.acctTable.querySelector("tbody");
    tb.textContent = "";
    l.accounts.forEach(function (a) {
      var b = L.accountBalance(l, a);
      var tr = node("tr");
      tr.appendChild(node("td", null, a.name));
      tr.appendChild(node("td", null, a.type));
      var td = node("td", "num" + (b.balance < 0 ? " neg" : ""), L.formatMoney(b.balance));
      tr.appendChild(td);
      tb.appendChild(tr);
    });

    var bs = L.balanceSheet(l);
    els.netWorth.textContent = L.formatMoney(bs.netWorth);
    els.netWorth.className = "big" + (bs.netWorth < 0 ? " neg" : "");
    els.netNote.textContent = bs.says + " Totals " + (bs.totalDebits === bs.totalCredits ? "balance" : "do NOT balance") +
      " (" + L.formatMoney(bs.totalDebits) + " of debits, " + L.formatMoney(bs.totalCredits) + " of credits).";
    els.bsTable.hidden = bs.rows.length === 0;
    var bsb = els.bsTable.querySelector("tbody");
    bsb.textContent = "";
    bs.rows.forEach(function (r) {
      var tr = node("tr");
      tr.appendChild(node("td", null, r.name));
      tr.appendChild(node("td", null, r.type));
      tr.appendChild(node("td", "num", L.formatMoney(r.debit)));
      tr.appendChild(node("td", "num", L.formatMoney(r.credit)));
      tr.appendChild(node("td", "num" + (r.balance < 0 ? " neg" : ""), L.formatMoney(r.balance)));
      bsb.appendChild(tr);
    });

    var ie = L.incomeExpense(l);
    els.ieSays.textContent = ie.says;
    els.ieTable.hidden = false;
    var ieb = els.ieTable.querySelector("tbody");
    ieb.textContent = "";
    [["Income", ie.income], ["Expense", ie.expense], ["Net", ie.net]].forEach(function (p) {
      var tr = node("tr");
      tr.appendChild(node("td", null, p[0]));
      tr.appendChild(node("td", "num" + (p[1] < 0 ? " neg" : ""), L.formatMoney(p[1])));
      ieb.appendChild(tr);
    });

    var budgets = L.budgetReport(l);
    els.budgetTable.hidden = budgets.length === 0;
    var bt = els.budgetTable.querySelector("tbody");
    bt.textContent = "";
    budgets.forEach(function (b) {
      var tr = node("tr");
      tr.appendChild(node("td", null, b.name));
      tr.appendChild(node("td", "num", L.formatMoney(b.spent)));
      tr.appendChild(node("td", "num", L.formatMoney(b.budget)));
      tr.appendChild(node("td", "num" + (b.over ? " neg" : ""), L.formatMoney(b.left)));
      bt.appendChild(tr);
    });

    var due = L.dueRecurring(l, Date.now());
    els.recurringSays.textContent = due.length ? due.map(function (r) { return r.says; }).join(" ") : "No repeat is due. Nothing posts by itself \u2014 a ledger that posts by itself is a ledger you cannot trust.";

    renderLines();
  }

  /* -------------------------------------------------------------- actions */

  function addAccount() {
    var out = L.addAccount(state.ledger, { name: els.acctName.value, type: els.acctType.value });
    if (!out.ok) { setStatus("bad", out.reason); return; }
    state.ledger = out.ledger;
    var saved = persist();
    els.acctName.value = "";
    render();
    if (saved) setStatus("ok", out.says);
  }

  function seed() {
    var l = state.ledger;
    [["Bank", "asset"], ["Food", "expense"], ["Salary", "income"], ["Card", "liability"]].forEach(function (pair) {
      var out = L.addAccount(l, { name: pair[0], type: pair[1] });
      if (out.ok) l = out.ledger;
    });
    state.ledger = l;
    var saved = persist();
    render();
    if (saved) setStatus("ok", "Four accounts added.");
  }

  function postIt() {
    var lines = readLines().map(function (ln) {
      var acct = state.ledger.accounts.filter(function (a) { return a.id === ln.accountId; })[0];
      return { account: acct ? acct.name : "", side: ln.side, amount: ln.amount };
    });
    var out = L.post(state.ledger, { date: els.txnDate.value, payee: els.txnPayee.value, lines: lines, now: Date.now() });
    if (!out.ok) { setStatus("bad", out.reason); return; }
    state.ledger = out.ledger;
    var saved = persist();
    render();
    if (saved) {
      els.txnPayee.value = "";
      setStatus(out.txn.duplicateOf ? "warn" : "ok", out.says);
    }
  }

  function addBudget() {
    var out = L.addBudget(state.ledger, { account: els.budgetAcct.value, amount: els.budgetAmt.value });
    if (!out.ok) { setStatus("bad", out.reason); return; }
    state.ledger = out.ledger;
    var saved = persist();
    render();
    if (saved) setStatus("ok", out.says);
  }

  function doExport() {
    var out = L.exportFile("ledger", { ledger: state.ledger }, { when: today() }, function (name, text, mime) {
      if (!window.Export || typeof window.Export.save !== "function") throw new Error("the export kit did not load");
      window.Export.save(name, text, mime);
      return true;
    });
    if (out.ok) { els.ioNote.textContent = "Wrote " + out.filename + " \u2014 your ledger, in a file you own."; setStatus("ok", "Exported."); }
    else setStatus("bad", out.reason + ".");
  }

  function doImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed = L.parseState(String(reader.result || ""));
      if (!parsed.ok) { setStatus("bad", parsed.reason); return; }
      state.ledger = parsed.ledger;
      var saved = persist();
      render();
      if (saved) {
        var bs = L.balanceSheet(state.ledger);
        setStatus("ok", "Imported. " + state.ledger.txns.length + " transaction(s); net worth " + L.formatMoney(bs.netWorth) + ".");
      }
    };
    reader.onerror = function () { setStatus("bad", "The file could not be read."); };
    reader.readAsText(file);
  }

  /* ----------------------------------------------------------------- wire */

  els.addAcct.addEventListener("click", addAccount);
  els.seed.addEventListener("click", seed);
  els.postBtn.addEventListener("click", postIt);
  els.addBudget.addEventListener("click", addBudget);
  els.exportBtn.addEventListener("click", doExport);
  els.importFile.addEventListener("change", function () { if (els.importFile.files[0]) doImport(els.importFile.files[0]); });
  els.addLine.addEventListener("click", function () {
    var row = node("div", "line");
    var acct = document.createElement("select"); acct.className = "ln-acct";
    var blank = document.createElement("option"); blank.value = ""; blank.textContent = "account"; acct.appendChild(blank);
    state.ledger.accounts.forEach(function (a) { var o = document.createElement("option"); o.value = a.id; o.textContent = a.name; acct.appendChild(o); });
    var side = document.createElement("select"); side.className = "ln-side";
    ["debit", "credit"].forEach(function (s) { var o = document.createElement("option"); o.value = s; o.textContent = s; side.appendChild(o); });
    var amt = document.createElement("input"); amt.type = "text"; amt.className = "ln-amt"; amt.placeholder = "amount";
    row.appendChild(acct); row.appendChild(side); row.appendChild(amt);
    els.lines.appendChild(row);
    row.addEventListener("input", updateBalanceNote);
    updateBalanceNote();
  });
  els.lines.addEventListener("input", updateBalanceNote);

  /* ------------------------------------------------------------ start up */

  els.txnDate.value = today();

  var raw = null;
  try { raw = window.localStorage.getItem(K); } catch (e) { raw = null; }
  if (raw) {
    var parsed = L.parseState(raw);
    if (parsed.ok) state.ledger = parsed.ledger;
    else {
      state.unreadable = parsed;
      setStatus("bad", parsed.reason);
      var keep = node("button", "small", "Export the unreadable ledger");
      keep.addEventListener("click", function () {
        var out = L.exportFile("raw", parsed, { when: today() }, function (name, text, mime) {
          if (!window.Export || typeof window.Export.save !== "function") throw new Error("the export kit did not load");
          window.Export.save(name, text, mime);
          return true;
        });
        setStatus(out.ok ? "ok" : "bad", out.ok ? "Wrote " + out.filename + "." : out.reason);
      });
      els.ioNote.parentNode.insertBefore(keep, els.ioNote);
    }
  }

  render();
  if (window.Loom && window.Loom.pwa) window.Loom.pwa.register("sw.js");
})();
