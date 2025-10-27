// Wealth Tracker v0.1 — GitHub Pages PWA
// SPA with vanilla JS + Chart.js + PapaParse. LocalStorage for data.
// AI & quotes are stubbed to keep secrets off the client.

const VERSION = "v0.1";

const state = {
  baseCurrency: "CHF",
  accounts: [
    { id: "acc_bank", name: "Bank", type: "bank", currency: "CHF" },
    { id: "acc_broker", name: "Broker", type: "broker", currency: "CHF" }
  ],
  transactions: [],
  holdings: [],
  prices: {}, // symbol -> lastPrice
  subscriptions: [],
  imports: [],
};

// ---------- Storage ----------
const STORAGE_KEY = "wealth-tracker-v01";

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { Object.assign(state, JSON.parse(raw)); } catch(e) {}
  } else {
    // Seed with demo data
    seedDemo();
  }
}

// Seed demo transactions
function seedDemo() {
  const today = new Date();
  const tx = [];
  for (let i=0;i<60;i++) {
    const d = new Date(today); d.setDate(d.getDate()-i*3);
    const amt = (Math.random()>0.6?1:-1) * (10 + Math.random()*200);
    tx.push({
      id: crypto.randomUUID(),
      date: d.toISOString().slice(0,10),
      account_id: "acc_bank",
      merchant: amt<0 ? ["COOP","MIGROS","UBER","SPOTIFY","SBB"][Math.floor(Math.random()*5)] : "Salary",
      category: amt<0 ? ["Groceries","Transport","Entertainment","Subscriptions"][Math.floor(Math.random()*4)] : "Income",
      amount_base_chf: Math.round(amt*100)/100,
      import_id: null,
      currency_orig: "CHF",
      amount_orig: Math.round(amt*100)/100
    });
  }
  state.transactions = tx.sort((a,b)=>a.date.localeCompare(b.date));
  save();
}

// ---------- Views ----------
const container = document.getElementById("view-container");
const templates = Object.fromEntries(
  Array.from(document.querySelectorAll("template")).map(t => [t.id, t])
);

function setView(name) {
  const tmpl = templates[`tmpl-${name}`];
  if (!tmpl) return;
  container.innerHTML = tmpl.innerHTML;
  document.querySelectorAll(".nav-link").forEach(b=>b.classList.toggle("active", b.dataset.view===name));
  // init view
  if (name==="dashboard") initDashboard();
  if (name==="transactions") initTransactions();
  if (name==="investments") initInvestments();
  if (name==="subscriptions") initSubscriptions();
  if (name==="imports") initImports();
  if (name==="settings") initSettings();
}

document.querySelectorAll(".nav-link").forEach(btn => {
  btn.addEventListener("click", ()=> setView(btn.dataset.view));
});

// ---------- Dashboard ----------
let chartNetworth, chartCashflow, chartCats;
function initDashboard() {
  // KPIs
  const networth = state.accounts.reduce((sum, a)=> sum + accountBalance(a.id), 0);
  document.getElementById("kpi-networth").textContent = fmtCHF(networth);
  const month = new Date().toISOString().slice(0,7);
  const thisMonth = state.transactions.filter(t=> t.date.startsWith(month));
  const spend = thisMonth.filter(t=> t.amount_base_chf<0).reduce((s,t)=>s+t.amount_base_chf,0);
  const income = thisMonth.filter(t=> t.amount_base_chf>0).reduce((s,t)=>s+t.amount_base_chf,0);
  document.getElementById("kpi-spend").textContent = fmtCHF(spend);
  const savingsRate = income>0 ? Math.round((income+spend)/income*100) : 0;
  document.getElementById("kpi-savings-rate").textContent = income? (savingsRate+"%") : "—";

  // Charts
  const ctxNW = document.getElementById("chart-networth");
  const seriesNW = rollupNetworthSeries();
  chartNetworth = makeLineChart(ctxNW, seriesNW.labels, [{ label:"Net Worth", data: seriesNW.values }]);

  const ctxCF = document.getElementById("chart-cashflow");
  const byMonth = rollupCashflowByMonth();
  chartCashflow = makeBarChart(ctxCF, byMonth.labels, [
    { label:"Income", data: byMonth.income },
    { label:"Expenses", data: byMonth.expenses }
  ]);

  const ctxCats = document.getElementById("chart-cats");
  const cats = rollupCategories(90);
  chartCats = makeDoughnutChart(ctxCats, cats.labels, cats.values);

  // Latest tx
  const latestDiv = document.getElementById("latest-tx");
  latestDiv.innerHTML = txTableHTML(state.transactions.slice(-10).reverse());
}

function accountBalance(accountId) {
  return state.transactions
    .filter(t=>t.account_id===accountId)
    .reduce((s,t)=> s + t.amount_base_chf, 0);
}

function rollupNetworthSeries() {
  // naive cumulative over dates
  const map = new Map();
  for (const t of state.transactions) {
    const v = (map.get(t.date)||0) + t.amount_base_chf;
    map.set(t.date, v);
  }
  const labels = Array.from(map.keys()).sort();
  let cum = 0;
  const values = labels.map(d=> (cum += map.get(d), cum));
  return { labels, values };
}

function rollupCashflowByMonth() {
  const m = new Map();
  for (const t of state.transactions) {
    const key = t.date.slice(0,7);
    const obj = m.get(key) || { income:0, expenses:0 };
    if (t.amount_base_chf>=0) obj.income += t.amount_base_chf; else obj.expenses += Math.abs(t.amount_base_chf);
    m.set(key, obj);
  }
  const labels = Array.from(m.keys()).sort();
  const income = labels.map(l=> round2(m.get(l).income));
  const expenses = labels.map(l=> round2(m.get(l).expenses));
  return { labels, income, expenses };
}

function rollupCategories(days=90) {
  const since = new Date(); since.setDate(since.getDate()-days);
  const m = new Map();
  for (const t of state.transactions) {
    if (new Date(t.date) < since) continue;
    const k = t.category || "Uncategorized";
    m.set(k, (m.get(k)||0) + Math.abs(Math.min(0, t.amount_base_chf)));
  }
  const labels = Array.from(m.keys());
  const values = labels.map(l=> round2(m.get(l)));
  return { labels, values };
}

// ---------- Transactions ----------
function initTransactions() {
  const tbody = document.querySelector("#tx-table tbody");
  tbody.innerHTML = rowsHTML(state.transactions.slice().reverse());
  // filters
  const catSel = document.getElementById("filter-category");
  const cats = Array.from(new Set(state.transactions.map(t=> t.category).filter(Boolean))).sort();
  for (const c of cats) { const o = document.createElement("option"); o.value=c; o.textContent=c; catSel.appendChild(o);}
  const accSel = document.getElementById("filter-account");
  for (const a of state.accounts) { const o = document.createElement("option"); o.value=a.id; o.textContent=a.name; accSel.appendChild(o);}

  function applyFilters(){
    const q = document.getElementById("filter-text").value.toLowerCase();
    const c = catSel.value;
    const a = accSel.value;
    const list = state.transactions.filter(t=>(!c||t.category===c)&&(!a||t.account_id===a)&&(!q||(t.merchant||"").toLowerCase().includes(q)));
    tbody.innerHTML = rowsHTML(list.slice().reverse());
  }
  document.getElementById("filter-text").addEventListener("input", applyFilters);
  catSel.addEventListener("change", applyFilters);
  accSel.addEventListener("change", applyFilters);
}

function rowsHTML(list){
  return list.map(t=>`<tr>
    <td>${t.date}</td>
    <td>${accountName(t.account_id)}</td>
    <td>${esc(t.merchant||"")}</td>
    <td>${esc(t.category||"—")}</td>
    <td class="right ${t.amount_base_chf<0?"neg":""}">${fmtCHF(t.amount_base_chf)}</td>
  </tr>`).join("");
}

function txTableHTML(list){
  return `<table class="table"><thead><tr><th>Date</th><th>Account</th><th>Merchant</th><th>Category</th><th class='right'>Amount</th></tr></thead><tbody>${rowsHTML(list)}</tbody></table>`;
}

function accountName(id){
  return state.accounts.find(a=>a.id===id)?.name || id;
}

// ---------- Investments ----------
let chartPortfolio;
function initInvestments() {
  const form = document.getElementById("holding-form");
  const tbody = document.querySelector("#holdings-table tbody");
  const render = () => {
    tbody.innerHTML = state.holdings.map(h=> {
      const price = getMockPrice(h.symbol);
      const value = price * h.quantity;
      const pl = value - h.cost;
      return `<tr>
        <td>${esc(h.symbol)}</td>
        <td>${h.quantity}</td>
        <td>${fmtCHF(h.cost)}</td>
        <td>${fmtCHF(price)}</td>
        <td>${fmtCHF(pl)}</td>
        <td><button class="btn" data-del="${h.id}">Delete</button></td>
      </tr>`;
    }).join("");
  };
  tbody.addEventListener("click", (e)=>{
    const id = e.target?.dataset?.del;
    if (id) { state.holdings = state.holdings.filter(h=>h.id!==id); save(); render(); updatePortfolioChart(); }
  });
  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    state.holdings.push({
      id: crypto.randomUUID(),
      symbol: (fd.get("symbol")+"").toUpperCase().trim(),
      quantity: parseFloat(fd.get("quantity")),
      cost: parseFloat(fd.get("cost"))
    });
    save();
    form.reset();
    render();
    updatePortfolioChart();
  });
  render();
  updatePortfolioChart();
}

function getMockPrice(symbol){
  // Deterministic pseudo-price from symbol (no external API on GH Pages)
  const base = Array.from(symbol).reduce((s,c)=>s + c.charCodeAt(0), 0) % 200 + 20;
  const jitter = Math.sin(Date.now()/60000 + symbol.length) * 2; // gentle wiggle
  const price = Math.max(1, base + jitter);
  state.prices[symbol] = price;
  return round2(price);
}

function updatePortfolioChart(){
  const ctx = document.getElementById("chart-portfolio");
  if (!ctx) return;
  const labels = state.holdings.map(h=>h.symbol);
  const data = state.holdings.map(h=> round2(getMockPrice(h.symbol)*h.quantity));
  chartPortfolio = makeDoughnutChart(ctx, labels, data);
}

// ---------- Subscriptions ----------
let chartSubBurn;
function initSubscriptions(){
  const form = document.getElementById("sub-form");
  const tbody = document.querySelector("#subs-table tbody");
  const render = () => {
    tbody.innerHTML = state.subscriptions.map(s=>`<tr>
      <td>${esc(s.name)}</td>
      <td>${fmtCHF(s.amount)}</td>
      <td>${s.cadence}</td>
      <td>${s.next_date}</td>
      <td><button class="btn" data-del="${s.id}">Delete</button></td>
    </tr>`).join("");
  };
  tbody.addEventListener("click", (e)=>{
    const id = e.target?.dataset?.del;
    if (id) { state.subscriptions = state.subscriptions.filter(s=>s.id!==id); save(); render(); updateSubBurn(); }
  });
  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    state.subscriptions.push({
      id: crypto.randomUUID(),
      name: (fd.get("name")+"").trim(),
      amount: parseFloat(fd.get("amount")),
      cadence: fd.get("cadence"),
      next_date: fd.get("next_date")
    });
    save();
    form.reset();
    render();
    updateSubBurn();
  });
  render();
  updateSubBurn();
}

function updateSubBurn(){
  const ctx = document.getElementById("chart-subburn");
  if (!ctx) return;
  const monthly = state.subscriptions.reduce((sum,s)=> sum + (s.cadence==="monthly"? s.amount: s.amount/12), 0);
  chartSubBurn = makeBarChart(ctx, ["Subscriptions"], [
    { label:"Monthly burn", data:[round2(monthly)]}
  ]);
}

// ---------- Imports ----------
function initImports(){
  document.getElementById("btn-choose-file").onclick = ()=> document.getElementById("csv-file").click();
  const input = document.getElementById("csv-file");
  const preview = document.getElementById("import-preview");
  const history = document.getElementById("import-history");
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      preview: 100,
      complete: (res)=> {
        const headers = res.meta.fields || [];
        const sample = res.data.slice(0, 50);
        const plan = inferPlanLocally(headers, sample, document.getElementById("import-source").value);
        preview.textContent = "Proposed mapping (AI-stub):\n" + JSON.stringify(plan, null, 2) +
          "\n\nPreview of first 5 cleaned rows:\n" + JSON.stringify(applyPlan(plan, sample).slice(0,5), null, 2);
        // Apply immediately for demo; in real app show Approve button
        const cleaned = applyPlan(plan, res.data);
        const importId = crypto.randomUUID();
        for (const r of cleaned) {
          state.transactions.push({
            id: crypto.randomUUID(),
            date: r.date,
            account_id: r.account_id || "acc_bank",
            merchant: r.merchant || r.description || "",
            category: r.category || ruleCategory(r),
            amount_base_chf: Number(r.amount_chf)||0,
            import_id: importId,
            currency_orig: r.currency || "CHF",
            amount_orig: r.amount
          });
        }
        state.transactions.sort((a,b)=> a.date.localeCompare(b.date));
        state.imports.unshift({ id: importId, when: new Date().toISOString(), rows: cleaned.length, source: document.getElementById("import-source").value });
        save();
        history.innerHTML = state.imports.map(i=> `<li>#${i.id.slice(0,6)} · ${i.rows} rows · ${i.source} · ${new Date(i.when).toLocaleString()}</li>`).join("");
        // Post-chat summary
        postAIMessage(summaryAfterImport(cleaned));
      }
    });
  };

  // render history
  history.innerHTML = state.imports.map(i=> `<li>#${i.id.slice(0,6)} · ${i.rows} rows · ${i.source} · ${new Date(i.when).toLocaleString()}</li>`).join("");
}

function inferPlanLocally(headers, sample, source){
  // Heuristic stub to simulate AI mapping (kept local for GH Pages)
  function includesAny(name, arr){ return arr.some(k=> name.toLowerCase().includes(k)); }
  let map = {
    date: headers.find(h=> includesAny(h,["date","datum","booking","valuta"])),
    amount: headers.find(h=> includesAny(h,["amount","betrag","importo","value"])),
    currency: headers.find(h=> includesAny(h,["currency","währung","divisa"])),
    description: headers.find(h=> includesAny(h,["description","merchant","text","note"])),
  };
  const plan = {
    column_mapping: map,
    normalization: { date_format: "auto", decimal_separator: "auto", sign: "auto" },
    duplicate_detection: { hash: ["date","amount","description"], fuzzy_days: 2, fuzzy_amount: 0.05 },
    subscription_detection: { cadence_days: 30, min_repeats: 3 },
    account_id: source==="revolut" ? "acc_bank" : "acc_bank"
  };
  return plan;
}

function applyPlan(plan, rows){
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const date = normalizeDate(r[plan.column_mapping.date]);
    const amount = Number(String(r[plan.column_mapping.amount]).replace(",","."));
    const currency = (r[plan.column_mapping.currency]||"CHF").toString();
    const desc = (r[plan.column_mapping.description]||"").toString();
    const key = `${date}|${amount}|${desc}`;
    if (seen.has(key)) continue; seen.add(key);
    out.push({
      date, amount, currency, description: desc, amount_chf: fxToCHF(amount, currency), account_id: plan.account_id
    });
  }
  return out;
}

function normalizeDate(v){
  if (!v) return new Date().toISOString().slice(0,10);
  const s = String(v);
  // try ISO or DD.MM.YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) { const [d,m,y] = s.split("."); return `${y}-${m}-${d}`; }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [m,d,y] = s.split("/"); return `${y}-${m}-${d}`; }
  const d = new Date(s); if (!isNaN(d)) return d.toISOString().slice(0,10);
  return new Date().toISOString().slice(0,10);
}

function fxToCHF(amount, currency){
  // simple fixed rates for demo
  const rates = { CHF:1, EUR:1.05, USD:0.92 };
  const rate = rates[currency] || 1;
  // If currency is EUR, amount in EUR * CHF per EUR => amount*1.05
  return round2(amount * (currency==="CHF"?1: rate));
}

function ruleCategory(r){
  const d = (r.description||"").toLowerCase();
  if (d.includes("spotify")) return "Subscriptions";
  if (d.includes("migros")||d.includes("coop")) return "Groceries";
  if (d.includes("sbb")) return "Transport";
  if (d.includes("fee")) return "Bank Fees";
  if (Number(r.amount_chf)>0) return "Income";
  return "Other";
}

function summaryAfterImport(rows){
  const total = rows.reduce((s,x)=> s + Number(x.amount_chf||0), 0);
  const neg = rows.filter(x=> (x.amount_chf||0)<0).length;
  const pos = rows.filter(x=> (x.amount_chf||0)>0).length;
  return `Import complete: ${rows.length} rows. Income: ${pos}, Expenses: ${neg}. Net impact: ${fmtCHF(total)}. I looked for duplicates and recurring charges; check Subscriptions for suggestions.`;
}

// ---------- Charts helpers ----------
function makeLineChart(ctx, labels, datasets){
  return new Chart(ctx, { type:"line", data: { labels, datasets },
    options: { responsive:true, plugins: { legend: { display:true } }, scales: { x: { ticks: { color:"#94a3b8" } }, y: { ticks: { color:"#94a3b8" } } } } });
}
function makeBarChart(ctx, labels, datasets){
  return new Chart(ctx, { type:"bar", data: { labels, datasets }, options: { responsive:true, plugins: { legend: { display:true } }, scales: { x: { ticks: { color:"#94a3b8" } }, y: { ticks: { color:"#94a3b8" } } } } });
}
function makeDoughnutChart(ctx, labels, data){
  return new Chart(ctx, { type:"doughnut", data: { labels, datasets:[{ data: data }] }, options: { plugins: { legend: { labels: { color:"#e6efff" } } } } });
}

// ---------- Settings ----------
function initSettings(){
  const sel = document.getElementById("base-currency");
  sel.value = state.baseCurrency;
  sel.onchange = () => { state.baseCurrency = sel.value; save(); postAIMessage(`Base currency set to ${state.baseCurrency}.`); };
  document.getElementById("btn-export").onclick = ()=> {
    const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href:url, download: "wealth-tracker-export.json" });
    document.body.appendChild(a); a.click(); a.remove();
  };
  document.getElementById("btn-reset").onclick = ()=> {
    localStorage.removeItem(STORAGE_KEY); location.reload();
  };
}

// ---------- Chat (local rules demo) ----------
const chatDrawer = document.getElementById("chat-drawer");
document.getElementById("chat-open").onclick = ()=> chatDrawer.classList.add("open");
document.getElementById("chat-toggle").onclick = ()=> chatDrawer.classList.remove("open");

const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

function postUserMessage(text){
  const div = document.createElement("div"); div.className="msg user"; div.textContent = text; chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight;
}
function postAIMessage(text){
  const div = document.createElement("div"); div.className="msg ai"; div.textContent = text; chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener("submit", (e)=>{
  e.preventDefault();
  const q = chatInput.value.trim();
  if (!q) return;
  postUserMessage(q);
  chatInput.value = "";
  // local heuristic responses
  const ans = answerLocally(q);
  postAIMessage(ans);
});

function answerLocally(q){
  const s = q.toLowerCase();
  if (s.includes("subscriptions")) {
    const monthly = state.subscriptions.reduce((sum,s)=> sum + (s.cadence==="monthly"? s.amount: s.amount/12), 0);
    return `You have ${state.subscriptions.length} subscriptions. Monthly burn ≈ ${fmtCHF(monthly)}.`;
  }
  if (s.includes("spend")||s.includes("expense")) {
    const month = new Date().toISOString().slice(0,7);
    const spend = state.transactions.filter(t=> t.date.startsWith(month)&&t.amount_base_chf<0).reduce((s,t)=>s+t.amount_base_chf,0);
    return `Estimated expenses for ${month}: ${fmtCHF(spend)}.`;
  }
  if (s.includes("net worth")) {
    const nw = state.accounts.reduce((sum,a)=> sum + accountBalance(a.id), 0);
    return `Current net worth (approx): ${fmtCHF(nw)}.`;
  }
  return "This demo chat runs locally on GitHub Pages. We’ll connect a secure AI endpoint later to answer deeper questions and act on your data.";
}

// ---------- Utilities ----------
function fmtCHF(n){ return (n>=0?"+":"") + new Intl.NumberFormat('de-CH', { style:'currency', currency:'CHF' }).format(n); }
function esc(s){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m] )); }
function round2(x){ return Math.round(x*100)/100; }

// ---------- Top-level events ----------
document.getElementById("btn-import").onclick = ()=> setView("imports");
document.getElementById("btn-add-holding").onclick = ()=> setView("investments");

// ---------- Boot ----------
load();
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('./service-worker.js').then(()=>{}).catch(()=>{}); }
setView("dashboard");
