/* =========================================================
   APP.JS — Cumplimiento (CSV ';') + barras 100% + líneas arriba
========================================================= */

const csvUrl = "./CUMPLIMIENTO_2025.csv";
const DELIM = ";";

const FECHA_COL = "FECHA ENTREGA ESPERADA";
const AT_COL = "ENTREGADOS AT";
const FT_COL = "ENTREGADOS FT";
const NO_COL = "NO ENTREGADOS";
const DEMORA_COL = "DIAS DE DEMORA";

const CLIENT_CANDIDATES = ["CLIENTE / OBRA", "CLIENTE NRO.", "CLIENTE"];

const COLORS = {
  green: "#16a34a",
  amber: "#f59e0b",
  red: "#ef4444",
  greenDark: "#0a5a2a",
  magenta: "#ff00b8",
  text: "#0b1220",
  muted: "#526172",
  grid: "rgba(15, 23, 42, 0.10)",
};

let headers = [];
let data = [];
let CLIENT_COL = null;

let chartMes = null;
let chartTendencia = null;

function $(id){ return document.getElementById(id); }
function setText(id,t){ const el=$(id); if(el) el.textContent=t; }
function errorUI(msg){
  console.error(msg);
  const el=$("msg");
  if(el) el.innerHTML = `<div style="padding:10px;border:1px solid #fca5a5;background:#fff1f2;color:#7f1d1d;border-radius:10px;font-weight:900">${msg}</div>`;
  setText("status","Error");
}
function info(msg){ console.log(msg); setText("status", msg); }

const clean = (v)=> (v ?? "").toString().trim();
function toNumber(v){
  let x = clean(v);
  if(!x) return 0;
  x = x.replace(/\s/g,"");
  if(x.includes(",")) x = x.replace(/\./g,"").replace(",",".");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
function fmtInt(n){ return Number(n||0).toLocaleString("es-AR",{maximumFractionDigits:0}); }
function fmtPct01(p01){ if(!isFinite(p01)) return "-"; return (p01*100).toFixed(1).replace(".",",")+"%"; }

function parseDateAny(s){
  const t = clean(s);
  if(!t) return null;
  let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m) return new Date(+m[3], +m[2]-1, +m[1]);
  m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if(m) return new Date(+m[1], +m[2]-1, +m[3]);
  return null;
}
function monthKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function getMonthKeyFromRow(r){ const d=parseDateAny(r[FECHA_COL]); return d?monthKey(d):null; }

/* CSV parser con comillas */
function parseDelimited(text, delimiter=";"){
  const rows=[]; let row=[]; let cur=""; let inQuotes=false;
  text = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n");
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch === '"'){
      if(inQuotes && text[i+1] === '"'){ cur+='"'; i++; }
      else inQuotes=!inQuotes;
    } else if(ch===delimiter && !inQuotes){
      row.push(cur); cur="";
    } else if(ch==="\n" && !inQuotes){
      row.push(cur); rows.push(row);
      row=[]; cur="";
    } else cur+=ch;
  }
  if(cur.length || row.length){ row.push(cur); rows.push(row); }
  return rows.filter(r=>r.some(c=>clean(c)!==""));
}

function applyChartDefaults(){
  if(!window.Chart){ errorUI("No se cargó Chart.js."); return false; }
  if(window.ChartDataLabels) Chart.register(ChartDataLabels);

  Chart.defaults.color = COLORS.text;
  Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  Chart.defaults.font.weight = "900";
  Chart.defaults.interaction.mode = "index";
  Chart.defaults.interaction.intersect = false;

  Chart.defaults.plugins.tooltip.backgroundColor = "rgba(255,255,255,0.97)";
  Chart.defaults.plugins.tooltip.titleColor = COLORS.text;
  Chart.defaults.plugins.tooltip.bodyColor = COLORS.text;
  Chart.defaults.plugins.tooltip.borderColor = "rgba(2,8,20,.18)";
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 10;
  return true;
}

/* filtros */
function filteredRowsByCliente(){
  const sel=$("clienteSelect");
  const c=sel ? sel.value : "";
  if(!c) return data;
  return data.filter(r=>clean(r[CLIENT_COL])===c);
}
function filteredRowsByClienteYMes(){
  const rows=filteredRowsByCliente();
  const mes=$("mesSelect")?.value || "";
  if(!mes) return rows;
  return rows.filter(r=>getMonthKeyFromRow(r)===mes);
}

function renderClientes(){
  const sel=$("clienteSelect");
  if(!sel) return;
  sel.innerHTML = `<option value="">Todos</option>`;
  const clientes=[...new Set(data.map(r=>clean(r[CLIENT_COL])).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
  for(const c of clientes){
    const o=document.createElement("option");
    o.value=c; o.textContent=c;
    sel.appendChild(o);
  }
}

function buildMesSelect(rows){
  const sel=$("mesSelect");
  if(!sel) return [];
  const months=[...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))].sort();
  const keep=sel.value;
  sel.innerHTML="";
  for(const m of months){
    const o=document.createElement("option");
    o.value=m; o.textContent=m;
    sel.appendChild(o);
  }
  sel.value = months.includes(keep) ? keep : (months[months.length-1] || "");
  setText("mesHint", sel.value ? `Mes seleccionado: ${sel.value}` : "Sin meses");
  return months;
}

/* KPIs */
function calcTotals(rows){
  let at=0,ft=0,no=0;
  for(const r of rows){
    at+=toNumber(r[AT_COL]);
    ft+=toNumber(r[FT_COL]);
    no+=toNumber(r[NO_COL]);
  }
  const total=at+ft+no;
  return {at,ft,no,total};
}
function calcMonthTotals(rows, month){
  let at=0,ft=0,no=0;
  for(const r of rows){
    if(getMonthKeyFromRow(r)!==month) continue;
    at+=toNumber(r[AT_COL]);
    ft+=toNumber(r[FT_COL]);
    no+=toNumber(r[NO_COL]);
  }
  const total=at+ft+no;
  return {at,ft,no,total, pctAT: total?at/total:NaN, pctFT: total?ft/total:NaN, pctNO: total?no/total:NaN};
}
function updateKPIsGeneral(rows){
  const t=calcTotals(rows);
  setText("kpiTotal", fmtInt(t.total));
  setText("kpiATpct", fmtPct01(t.total?t.at/t.total:NaN));
  setText("kpiATqty", `Cantidad: ${fmtInt(t.at)}`);
  setText("kpiFTpct", fmtPct01(t.total?t.ft/t.total:NaN));
  setText("kpiFTqty", `Cantidad: ${fmtInt(t.ft)}`);
  setText("kpiNOpct", fmtPct01(t.total?t.no/t.total:NaN));
  setText("kpiNOqty", `Cantidad: ${fmtInt(t.no)}`);
}
function deltaInfo(curr, prev){
  if(!isFinite(curr)||!isFinite(prev)) return {text:"Sin mes anterior", diff:NaN};
  const diff=curr-prev;
  if(Math.abs(diff)<1e-9) return {text:"• 0,0% vs mes anterior", diff:0};
  const arrow=diff>0?"▲":"▼";
  return {text:`${arrow} ${(Math.abs(diff)*100).toFixed(1).replace(".",",")}% vs mes anterior`, diff};
}
function setDelta(el,text,cls){
  if(!el) return;
  el.classList.remove("delta-good","delta-bad","delta-neutral");
  if(cls) el.classList.add(cls);
  el.textContent=text;
}
function updateKPIsMonthly(rows, months){
  const mes=$("mesSelect")?.value || "";
  if(!mes) return;

  const idx=months.indexOf(mes);
  const prevMes=idx>0?months[idx-1]:null;

  const cur=calcMonthTotals(rows, mes);
  const prev=prevMes?calcMonthTotals(rows, prevMes):null;

  setText("kpiTotalMes", fmtInt(cur.total));
  setText("kpiATmes", fmtPct01(cur.pctAT));
  setText("kpiFTmes", fmtPct01(cur.pctFT));
  setText("kpiNOmes", fmtPct01(cur.pctNO));

  const atSub=$("kpiATmesSub"), ftSub=$("kpiFTmesSub"), noSub=$("kpiNOmesSub");

  if(!prev){
    setDelta(atSub, `Cant: ${fmtInt(cur.at)} · Sin mes anterior`, "");
    setDelta(ftSub, `Cant: ${fmtInt(cur.ft)} · Sin mes anterior`, "");
    setDelta(noSub, `Cant: ${fmtInt(cur.no)} · Sin mes anterior`, "");
    return;
  }

  const dAT=deltaInfo(cur.pctAT, prev.pctAT);
  const dFT=deltaInfo(cur.pctFT, prev.pctFT);
  const dNO=deltaInfo(cur.pctNO, prev.pctNO);

  let clsAT="delta-good"; if(dAT.diff<0) clsAT="delta-bad";
  let clsFT="delta-bad";  if(dFT.diff<0) clsFT="delta-good";
  let clsNO="delta-good"; if(dNO.diff>0) clsNO="delta-bad";

  setDelta(atSub, `Cant: ${fmtInt(cur.at)} · ${dAT.text}`, clsAT);
  setDelta(ftSub, `Cant: ${fmtInt(cur.ft)} · ${dFT.text}`, clsFT);
  setDelta(noSub, `Cant: ${fmtInt(cur.no)} · ${dNO.text}`, clsNO);
}

/* ✅ GRÁFICO: barras + líneas arriba */
function buildChartMes(rows){
  const canvas=$("chartMes");
  if(!canvas) return;

  const agg=new Map();
  const monthsSet=new Set();

  for(const r of rows){
    const d=parseDateAny(r[FECHA_COL]);
    if(!d) continue;
    const mk=monthKey(d);
    monthsSet.add(mk);

    if(!agg.has(mk)) agg.set(mk,{at:0,ft:0,no:0,demoraSum:0,demoraCnt:0});
    const c=agg.get(mk);

    c.at+=toNumber(r[AT_COL]);
    c.ft+=toNumber(r[FT_COL]);
    c.no+=toNumber(r[NO_COL]);

    const ddRaw=clean(r[DEMORA_COL]);
    if(ddRaw!==""){
      c.demoraSum+=toNumber(ddRaw);
      c.demoraCnt+=1;
    }
  }

  const months=[...monthsSet].sort();
  const qAT=months.map(m=>agg.get(m)?.at??0);
  const qFT=months.map(m=>agg.get(m)?.ft??0);
  const qNO=months.map(m=>agg.get(m)?.no??0);

  const pAT=qAT.map((v,i)=>{const t=qAT[i]+qFT[i]+qNO[i]; return t?(v/t)*100:0;});
  const pFT=qFT.map((v,i)=>{const t=qAT[i]+qFT[i]+qNO[i]; return t?(v/t)*100:0;});
  const pNO=qNO.map((v,i)=>{const t=qAT[i]+qFT[i]+qNO[i]; return t?(v/t)*100:0;});

  const demoraAvg=months.map(m=>{
    const c=agg.get(m);
    if(!c||!c.demoraCnt) return 0;
    return c.demoraSum/c.demoraCnt;
  });

  const line75=months.map(()=>75);
  const line7=months.map(()=>7);
  const maxY2=Math.ceil(Math.max(7,...demoraAvg,0)*1.25);

  if(chartMes) chartMes.destroy();

  // 👇 IMPORTANTE: barras primero, líneas al final (dibujadas arriba)
  const datasets = [
    // BARRAS (order bajo)
    { type:"bar", label:"Entregados AT", data:pAT, _q:qAT, stack:"s", backgroundColor:COLORS.green, yAxisID:"y", order:1 },
    { type:"bar", label:"Entregados FT", data:pFT, _q:qFT, stack:"s", backgroundColor:COLORS.amber, yAxisID:"y", order:1 },
    { type:"bar", label:"No entregados", data:pNO, _q:qNO, stack:"s", backgroundColor:COLORS.red, yAxisID:"y", order:1 },

    // LÍNEAS (order alto + clip false para que SIEMPRE estén arriba)
    { type:"line", label:"Meta 75%", data:line75, yAxisID:"y",
      borderColor:COLORS.greenDark, borderWidth:3, borderDash:[6,6],
      pointRadius:0, tension:0, order:99, clip:false },

    { type:"line", label:"Prom. días de demora", data:demoraAvg, yAxisID:"y2",
      borderColor:COLORS.magenta, backgroundColor:COLORS.magenta, borderWidth:3,
      pointRadius:4, pointHoverRadius:6, tension:0, order:100, clip:false },

    { type:"line", label:"Límite 7 días", data:line7, yAxisID:"y2",
      borderColor:COLORS.red, borderWidth:3, borderDash:[6,6],
      pointRadius:0, tension:0, order:101, clip:false },
  ];

  chartMes = new Chart(canvas.getContext("2d"),{
    data:{ labels:months, datasets },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      scales:{
        x:{ stacked:true, grid:{ color:"transparent" }, ticks:{ color:COLORS.muted, font:{weight:"900"} } },

        y:{
          stacked:true,
          beginAtZero:true,
          max:100,
          grid:{ color:COLORS.grid },
          ticks:{
            callback:(v)=>v+"%",
            color:(ctx)=>Number(ctx.tick?.value)===75 ? COLORS.greenDark : COLORS.muted,
            font:(ctx)=>Number(ctx.tick?.value)===75 ? {weight:"1000"} : {weight:"900"}
          }
        },

        y2:{
          position:"right",
          beginAtZero:true,
          suggestedMax:maxY2,
          grid:{ drawOnChartArea:false },
          ticks:{
            callback:(v)=>v,
            color:(ctx)=>Number(ctx.tick?.value)===7 ? COLORS.red : COLORS.red,
            font:(ctx)=>Number(ctx.tick?.value)===7 ? {weight:"1000"} : {weight:"900"}
          },
          title:{ display:true, text:"días de demora", color:COLORS.red, font:{weight:"1000"} }
        }
      },
      plugins:{
        legend:{ position:"bottom" },
        tooltip:{
          callbacks:{
            label:(c)=>{
              if(c.dataset.type==="bar"){
                const pct=(c.parsed.y??0).toFixed(1).replace(".",",");
                const qty=c.dataset._q?.[c.dataIndex]??0;
                return ` ${c.dataset.label}: ${fmtInt(qty)} (${pct}%)`;
              }
              if(c.dataset.yAxisID==="y2"){
                return ` ${c.dataset.label}: ${Number(c.parsed.y??0).toFixed(1).replace(".",",")} días`;
              }
              return ` ${c.dataset.label}: ${Number(c.parsed.y??0).toFixed(1).replace(".",",")}%`;
            }
          }
        },
        datalabels: window.ChartDataLabels ? {
          formatter:(v,ctx)=>{
            if(ctx.dataset.type!=="bar") return "";
            const qty=ctx.dataset._q?.[ctx.dataIndex]??0;
            if(!qty || v<7) return "";
            return `${fmtInt(qty)} (${v.toFixed(0)}%)`;
          },
          anchor:"center",
          align:"center",
          clamp:true,
          color:"#fff",
          font:{weight:"1000", size:11}
        } : undefined
      }
    }
  });
}

/* Tendencia */
function buildChartTendencia(rows){
  const canvas=$("chartTendencia");
  if(!canvas) return;

  const agg=new Map();
  const monthsSet=new Set();
  for(const r of rows){
    const d=parseDateAny(r[FECHA_COL]);
    if(!d) continue;
    const mk=monthKey(d);
    monthsSet.add(mk);
    if(!agg.has(mk)) agg.set(mk,{at:0,ft:0,no:0});
    const c=agg.get(mk);
    c.at+=toNumber(r[AT_COL]);
    c.ft+=toNumber(r[FT_COL]);
    c.no+=toNumber(r[NO_COL]);
  }
  const months=[...monthsSet].sort();
  const pAT=months.map(m=>{const c=agg.get(m); const t=c.at+c.ft+c.no; return t?(c.at/t)*100:0;});
  const pFT=months.map(m=>{const c=agg.get(m); const t=c.at+c.ft+c.no; return t?(c.ft/t)*100:0;});
  const pNO=months.map(m=>{const c=agg.get(m); const t=c.at+c.ft+c.no; return t?(c.no/t)*100:0;});

  if(chartTendencia) chartTendencia.destroy();

  chartTendencia=new Chart(canvas.getContext("2d"),{
    type:"line",
    data:{
      labels:months,
      datasets:[
        {label:"A Tiempo %", data:pAT, borderColor:COLORS.green, backgroundColor:COLORS.green, tension:0, pointRadius:4},
        {label:"Fuera Tiempo %", data:pFT, borderColor:COLORS.amber, backgroundColor:COLORS.amber, tension:0, pointRadius:4},
        {label:"No Entregados %", data:pNO, borderColor:COLORS.red, backgroundColor:COLORS.red, tension:0, pointRadius:4},
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      scales:{
        x:{ grid:{color:"transparent"}, ticks:{color:COLORS.muted,font:{weight:"900"}}},
        y:{ beginAtZero:true, max:100, grid:{color:COLORS.grid}, ticks:{color:COLORS.muted, callback:(v)=>v+"%"}}
      },
      plugins:{
        legend:{position:"bottom"},
        tooltip:{callbacks:{label:(c)=>` ${c.dataset.label}: ${c.parsed.y.toFixed(1).replace(".",",")}%`}},
        datalabels: window.ChartDataLabels ? {
          align:"top",
          anchor:"end",
          offset:6,
          formatter:(v)=>`${Number(v).toFixed(0)}%`,
          color:COLORS.text,
          font:{size:11, weight:"1000"}
        } : undefined
      }
    }
  });
}

/* download NO entregados */
function escapeCSV(v){
  const s=(v??"").toString();
  if(/[;"\n\r]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}
function downloadCSV(filename, rows, cols){
  const header=cols.map(escapeCSV).join(";");
  const lines=rows.map(r=>cols.map(c=>escapeCSV(r[c])).join(";"));
  const csv=[header,...lines].join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function applyAll(){
  const rows=filteredRowsByCliente();
  const months=buildMesSelect(rows);
  updateKPIsGeneral(rows);
  updateKPIsMonthly(rows, months);
  buildChartMes(rows);
  buildChartTendencia(rows);
}

window.addEventListener("DOMContentLoaded", async ()=>{
  if(!applyChartDefaults()) return;

  const today=new Date();
  setText("lastUpdate", `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`);

  try{
    info(`Cargando CSV: ${csvUrl} ...`);
    const resp=await fetch(csvUrl,{cache:"no-store"});
    if(!resp.ok) throw new Error(`No pude abrir ${csvUrl} (HTTP ${resp.status})`);

    const text=await resp.text();
    const matrix=parseDelimited(text,DELIM);
    if(matrix.length<2) throw new Error("El CSV está vacío o sin filas.");

    headers=matrix[0].map(clean);

    CLIENT_COL = CLIENT_CANDIDATES.find(c=>headers.includes(c));
    if(!CLIENT_COL) throw new Error(`No encuentro columna cliente. Probé: ${CLIENT_CANDIDATES.join(" / ")}`);

    const required=[FECHA_COL,AT_COL,FT_COL,NO_COL,DEMORA_COL];
    const missing=required.filter(c=>!headers.includes(c));
    if(missing.length) throw new Error(`Faltan columnas: ${missing.join(", ")}`);

    data=matrix.slice(1).map(row=>{
      const o={};
      headers.forEach((h,i)=>o[h]=clean(row[i]));
      return o;
    });

    setText("clienteHint", `Columna cliente: ${CLIENT_COL}`);
    info(`OK: ${data.length.toLocaleString("es-AR")} filas cargadas`);

    renderClientes();
    applyAll();

    $("clienteSelect")?.addEventListener("change", applyAll);
    $("mesSelect")?.addEventListener("change", ()=>{
      const rows=filteredRowsByCliente();
      const months=[...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))].sort();
      updateKPIsMonthly(rows, months);
    });

    $("btnDownloadNO")?.addEventListener("click", ()=>{
      const rowsFilt=filteredRowsByClienteYMes();
      const noRows=rowsFilt.filter(r=>toNumber(r[NO_COL])>0);
      if(!noRows.length){ alert("No hay NO ENTREGADOS para el filtro actual."); return; }
      const cols=[CLIENT_COL,FECHA_COL,AT_COL,FT_COL,NO_COL,DEMORA_COL];
      downloadCSV(`NO_ENTREGADOS_${$("mesSelect")?.value||"Todos"}.csv`, noRows, cols);
    });

  }catch(e){
    errorUI(e.message || String(e));
  }
});
