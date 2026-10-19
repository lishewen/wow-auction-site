// WoW 拍卖行数据浏览器
const SCAN_DAY_0 = new Date(Date.UTC(2020, 0, 1)); // UTC+8 本地零点等效
const PAGE_SIZE = 50;

let DATA = null;          // auction_data.json 全量
let view = {
  q: "", realm: "all", sortKey: "minPrice", sortDir: -1,
  onlyNamed: false, page: 1,
};

// ===== 工具 =====
function dayToDate(day) {
  const d = new Date(2020, 0, 1);
  d.setDate(d.getDate() + parseInt(day, 10));
  const m = (d.getMonth() + 1 + "").padStart(2, "0");
  const dd = (d.getDate() + "").padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + dd;
}
function fmtCopper(c) {
  if (c == null || isNaN(c)) return '<span class="dim">-</span>';
  c = Math.max(0, Math.floor(c));
  const g = Math.floor(c / 10000), s = Math.floor((c % 10000) / 100), cp = c % 100;
  if (g >= 1000000) return '<span class="g">' + (g / 10000).toFixed(1) + "万</span>";
  if (g > 0) return '<span class="g">' + g + "金</span><span class=s>" + s + "银</span>";
  if (s > 0) return '<span class="s">' + s + "银</span><span class=c>" + cp + "铜</span>";
  return '<span class="c">' + cp + "铜</span>";
}
function fmtGold(c) { return (c / 10000).toFixed(2).replace(/\.00$/, ""); }

// 解析 dbKey: "130200" | "g:240956:180" | "p:1234:..." 
function parseKey(dbKey) {
  const m = dbKey.match(/^g:(\d+):(\d+)$/);
  if (m) return { id: m[1], kind: "宝石", suffix: "ilvl" + m[2] };
  if (dbKey.startsWith("p:")) return { id: dbKey.split(":")[1], kind: "宠物", suffix: "" };
  return { id: dbKey, kind: null, suffix: "" };
}

// 取某物品在某服务器的价格历史（合并 h/l，按天排序）
function history(rd) {
  const days = new Set([...Object.keys(rd.h || {}), ...Object.keys(rd.l || {}), ...Object.keys(rd.a || {})]);
  return [...days].map(d => ({
    day: d, date: dayToDate(d),
    hi: rd.h && rd.h[d], lo: (rd.l && rd.l[d]) || (rd.h && rd.h[d]),
    av: rd.a && rd.a[d],
  })).sort((a, b) => parseInt(a.day) - parseInt(b.day));
}

// 价格变化: 最新有数据天 vs 前一天有数据
function priceChange(rd) {
  const hist = history(rd).filter(x => x.hi != null);
  if (hist.length < 2) return null;
  const last = hist[hist.length - 1], prev = hist[hist.length - 2];
  if (!prev.hi) return null;
  const diff = last.hi - prev.hi;
  if (diff === 0) return { pct: 0, diff: 0 };
  return { pct: (diff / prev.hi) * 100, diff };
}

// 最新有数据的天
function lastSeen(rd) {
  const hist = history(rd);
  return hist.length ? hist[hist.length - 1].date : "无记录";
}

// ===== 渲染列表 =====
function filteredItems() {
  let list = Object.entries(DATA.items).map(([dbKey, item]) => {
    const pk = parseKey(dbKey);
    const realms = item.realms;
    const prices = {};
    for (const [r, rd] of Object.entries(realms)) prices[r] = rd.m || 0;
    const minPrice = Object.values(prices).length ? Math.min(...Object.values(prices)) : 0;
    // 用任一服务器算变化（取最新的）
    let chg = null;
    for (const rd of Object.values(realms)) { const c = priceChange(rd); if (c) { chg = c; break; } }
    return { dbKey, id: pk.id, kind: pk.kind, name: item.name, named: item.named,
             prices, minPrice, chg, realmCount: Object.keys(realms).length };
  });
  if (view.onlyNamed) list = list.filter(i => i.named);
  if (view.realm !== "all") list = list.filter(i => i.prices[view.realm] != null);
  if (view.q) {
    const q = view.q.trim().toLowerCase();
    list = list.filter(i => i.name.toLowerCase().includes(q) || i.id.includes(q));
  }
  const dir = view.sortDir;
  list.sort((a, b) => {
    let va = a[view.sortKey], vb = b[view.sortKey];
    if (typeof va === "string") { va = va.localeCompare(vb, "zh"); return va * dir; }
    return (va - vb) * dir;
  });
  return list;
}

function renderTable() {
  const list = filteredItems();
  const tbody = document.getElementById("tbody");
  const realmNames = Object.keys(DATA.realms);
  let html = "";
  const show = list.slice(0, view.page * PAGE_SIZE);
  for (const it of show) {
    let chgHtml = '<span class="flat">-</span>';
    if (it.chg) {
      const pct = it.chg.pct.toFixed(1);
      if (it.chg.diff > 0) chgHtml = '<span class="chg up">▲ ' + pct + "%</span>";
      else if (it.chg.diff < 0) chgHtml = '<span class="chg down">▼ ' + pct + '%</span>';
    }
    const realmCells = realmNames.map(r => {
      const p = it.prices[r];
      return '<td class="hide-sm">' + (p != null ? fmtCopper(p) : '<span class="flat">-</span>') + "</td>";
    }).join("");
    html += '<tr class="item-row" data-key="' + it.dbKey + '">' +
      '<td><div class="name-cell"><span>' + it.name + (it.kind ? ' <span class="badge">' + it.kind + "</span>" : "") +
      '</span><span class="id">#' + it.id + "</span></div></td>" +
      '<td class="price">' + fmtCopper(it.minPrice) + "</td>" +
      '<td>' + chgHtml + "</td>" + realmCells + "</tr>";
  }
  tbody.innerHTML = html || "";
  document.getElementById("count").textContent =
    "共 " + list.length + " 个物品，显示 " + show.length + " 条 · 数据更新于 " + DATA.generatedAt;
  const btn = document.getElementById("loadmore");
  btn.style.display = show.length < list.length ? "block" : "none";
  tbody.querySelectorAll(".item-row").forEach(tr => {
    tr.onclick = () => openDetail(tr.dataset.key);
  });
}

// ===== 详情弹窗 =====
let detailRealm = null;
function openDetail(dbKey) {
  const item = DATA.items[dbKey];
  if (!item) return;
  const pk = parseKey(dbKey);
  const realms = Object.keys(item.realms);
  if (!detailRealm || !realms.includes(detailRealm)) detailRealm = realms[0];
  document.getElementById("modal-title").innerHTML =
    item.name + (pk.kind ? ' <span class="badge">' + pk.kind + "</span>" : "");
  document.getElementById("modal-meta").textContent =
    "物品ID " + pk.id + (pk.suffix ? " (" + pk.suffix + ")" : "") + " · 数据更新 " + DATA.generatedAt;
  // realm tabs
  const tabs = document.getElementById("realm-tabs");
  tabs.innerHTML = realms.map(r =>
    '<button class="' + (r === detailRealm ? "active" : "") + '" data-r="' + r + '">' + r +
    " (" + item.realms[r].m + ')</button>').join("");
  tabs.querySelectorAll("button").forEach(b => b.onclick = () => { detailRealm = b.dataset.r; openDetail(dbKey); });
  renderDetail(item, detailRealm);
  document.getElementById("modal-bg").classList.add("open");
}
function renderDetail(item, realm) {
  const rd = item.realms[realm];
  const hist = history(rd);
  document.getElementById("detail-now").innerHTML =
    "当前最低价 <span class=\"price\">" + fmtCopper(rd.m) + "</span> · 最后扫描 " + lastSeen(rd);
  document.getElementById("chart").innerHTML = buildChart(hist);
  renderHistoryCards(hist);
}
function renderHistoryCards(hist) {
  const recent = hist.slice(-12).reverse();
  document.getElementById("hist-cards").innerHTML = recent.map(h => {
    const range = (h.lo != null && h.hi != null && h.lo !== h.hi)
      ? fmtCopper(h.lo) + " ~ " + fmtCopper(h.hi) : fmtCopper(h.hi);
    return '<div class="hcard"><div class="d">' + h.date + (h.av != null ? " · 数量 " + h.av : "") +
      '</div><div class="v">' + range + "</div></div>";
  }).join("");
}

// SVG 折线/区间图
function buildChart(hist) {
  const data = hist.filter(h => h.hi != null);
  if (data.length < 1) return '<div class="empty">无价格历史</div>';
  const W = 780, H = 260, P = { l: 56, r: 14, t: 16, b: 34 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const days = hist.map(h => parseInt(h.day));
  const dMin = Math.min(...days), dMax = Math.max(...days);
  const spanX = Math.max(1, dMax - dMin);
  let vals = []; data.forEach(h => { vals.push(h.hi); if (h.lo != null) vals.push(h.lo); });
  let vMin = Math.min(...vals), vMax = Math.max(...vals);
  if (vMax === vMin) { vMax = vMin + 1; }
  const pad = (vMax - vMin) * 0.08; vMin = Math.max(0, vMin - pad); vMax += pad;
  const x = d => P.l + ((d - dMin) / spanX) * iw;
  const y = v => P.t + ih - ((v - vMin) / (vMax - vMin)) * ih;
  // y 轴刻度（金）
  let gridLines = "", labels = "";
  for (let i = 0; i <= 4; i++) {
    const v = vMin + ((vMax - vMin) * i) / 4;
    const yy = y(v);
    gridLines += '<line x1="' + P.l + '" y1="' + yy + '" x2="' + (W - P.r) + '" y2="' + yy + '" stroke="#2e3648" stroke-width="1"/>';
    labels += '<text x="' + (P.l - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="10" fill="#8b93a7">' + fmtGold(v) + "g</text>";
  }
  // x 轴日期（最多8个）
  let xLabels = "";
  const step = Math.max(1, Math.ceil(data.length / 8));
  for (let i = 0; i < data.length; i += step) {
    xLabels += '<text x="' + x(parseInt(data[i].day)) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="9" fill="#8b93a7">' + data[i].date.slice(5) + "</text>";
  }
  // 区间带 (lo~hi)
  const pts = data.map(h => [x(parseInt(h.day)), y(h.hi)]);
  const loPts = data.map(h => [x(parseInt(h.day)), y(h.lo != null ? h.lo : h.hi)]);
  let band = "";
  if (data.length > 1) {
    band = '<polygon points="' + pts.map(p => p[0] + "," + p[1]).join(" ") + " " +
      loPts.slice().reverse().map(p => p[0] + "," + p[1]).join(" ") +
      '" fill="rgba(245,215,110,0.15)" stroke="none"/>';
  }
  const lineHi = data.length > 1 ? '<polyline points="' + pts.map(p => p[0] + "," + p[1]).join(" ") + '" fill="none" stroke="#f5d76e" stroke-width="1.8"/>' : "";
  const lineLo = data.length > 1 ? '<polyline points="' + loPts.map(p => p[0] + "," + p[1]).join(" ") + '" fill="none" stroke="#6aa9e0" stroke-width="1.2" stroke-dasharray="4 3"/>' : "";
  const dots = pts.map((p, i) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.6" fill="#f5d76e"><title>' + data[i].date + " 最高 " + fmtGold(data[i].hi) + "g</title></circle>").join("");
  return '<svg viewBox="0 0 ' + W + " " + H + '" style="width:100%">' + gridLines + labels + xLabels + band + lineHi + lineLo + dots + "</svg>";
}

// ===== 初始化 =====
async function init() {
  const r = await fetch("../data/auction_data.json");
  DATA = await r.json();
  const sel = document.getElementById("realm-sel");
  for (const [realm, cnt] of Object.entries(DATA.realms)) {
    const opt = document.createElement("option");
    opt.value = realm; opt.textContent = realm + " (" + cnt + ")";
    sel.appendChild(opt);
  }
  const realmTh = document.getElementById("realm-cols-th");
  if (realmTh) {
    const tr = realmTh.parentElement;
    for (const realm of Object.keys(DATA.realms)) {
      const th = document.createElement("th");
      th.className = "hide-sm";
      th.textContent = realm;
      tr.insertBefore(th, realmTh);
    }
    tr.removeChild(realmTh);
  }
  const q = document.getElementById("q");
  let deb;
  q.oninput = () => { clearTimeout(deb); deb = setTimeout(() => { view.q = q.value; view.page = 1; renderTable(); }, 150); };
  sel.onchange = () => { view.realm = sel.value; view.page = 1; renderTable(); };
  document.getElementById("only-named").onchange = e => { view.onlyNamed = e.target.checked; view.page = 1; renderTable(); };
  document.getElementById("loadmore").onclick = () => { view.page++; renderTable(); };
  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.onclick = () => {
      const k = th.dataset.sort;
      if (view.sortKey === k) view.sortDir *= -1; else { view.sortKey = k; view.sortDir = -1; }
      view.page = 1; renderTable();
      document.querySelectorAll("th[data-sort]").forEach(t => t.querySelector(".arrow").textContent = "");
      th.querySelector(".arrow").textContent = view.sortDir < 0 ? "▼" : "▲";
    };
  });
  document.getElementById("modal-bg").onclick = e => {
    if (e.target.id === "modal-bg" || e.target.closest(".close")) e.currentTarget.classList.remove("open");
  };
  document.addEventListener("keydown", e => { if (e.key === "Escape") document.getElementById("modal-bg").classList.remove("open"); });
  renderTable();
}
init();
