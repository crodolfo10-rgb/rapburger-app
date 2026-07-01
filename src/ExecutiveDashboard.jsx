import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, PieChart, Pie, Cell,
} from "recharts";

// ══════════════════════════════════════════════════════════
// BRAND
// ══════════════════════════════════════════════════════════
const B = {
  red:'#E8191A', yellow:'#FFD000', green:'#00C48C', blue:'#38BDF8',
  purple:'#A78BFA', orange:'#FB923C', pink:'#F472B6',
  bg:'#070707', surface:'#0C0C0C', card:'#111111', card2:'#161616',
  border:'#1A1A1A', border2:'#242424', border3:'#2E2E2E',
  muted:'#3A3A3A', dim:'#666', text:'#F0F0F0', textDim:'#888', textSub:'#555',
};

const IVA_FACTOR = 19/119; // IVA contenido dentro del precio bruto (método correcto Chile)
const fmt  = v => new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(v||0);
const fmtM = v => { const a=Math.abs(v||0); if(a>=1000000) return (v/1000000).toFixed(1)+'M'; if(a>=1000) return (v/1000).toFixed(0)+'K'; return Math.round(v||0).toString(); };
const pct  = v => (v||0).toFixed(1)+'%';

// ══════════════════════════════════════════════════════════
// COMPONENTES BASE
// ══════════════════════════════════════════════════════════

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:'#080808',border:`1px solid ${B.border2}`,borderRadius:8,padding:'10px 14px',minWidth:170}}>
      <div style={{fontSize:9,color:B.dim,fontWeight:800,marginBottom:8,letterSpacing:1.5,textTransform:'uppercase'}}>{label}</div>
      {payload.map((p,i)=>(
        <div key={i} style={{display:'flex',justifyContent:'space-between',gap:20,fontSize:11,marginBottom:3,fontFamily:'monospace'}}>
          <span style={{color:B.textDim}}>{p.name}</span>
          <span style={{fontWeight:700,color:p.color}}>{typeof p.value==='number'&&Math.abs(p.value)>100?fmt(p.value):typeof p.value==='number'?p.value.toFixed(1):p.value}</span>
        </div>
      ))}
    </div>
  );
};

const GradDefs = () => (
  <defs>
    {[['gR',B.red],['gG',B.green],['gB',B.blue],['gY',B.yellow],['gP',B.purple],['gO',B.orange]].map(([id,c])=>(
      <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={c} stopOpacity={0.35}/>
        <stop offset="100%" stopColor={c} stopOpacity={0}/>
      </linearGradient>
    ))}
  </defs>
);

const ax = {fontSize:9,fill:B.dim,fontFamily:'monospace'};

function Card({children,style={}}) {
  return <div style={{background:B.card,border:`1px solid ${B.border}`,borderRadius:12,padding:'18px 20px',...style}}>{children}</div>;
}

function SecTitle({label,sub,color=B.red}) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,margin:'26px 0 12px',paddingBottom:10,borderBottom:`1px solid ${B.border}`}}>
      <div style={{width:3,height:15,background:color,borderRadius:2,flexShrink:0}}/>
      <div style={{fontSize:10,fontWeight:800,letterSpacing:2,color:B.text,textTransform:'uppercase'}}>{label}</div>
      {sub&&<div style={{fontSize:9,color:B.dim,marginLeft:2}}>{sub}</div>}
    </div>
  );
}

function Pill({label,value,color=B.green,bench,benchDir='up',suffix='%'}) {
  const v = parseFloat(value)||0;
  const b = parseFloat(bench)||0;
  const ok = benchDir==='up' ? v>=b : v<=b;
  const warn = benchDir==='up' ? v>=b*0.8 : v<=b*1.2;
  const dot = ok ? B.green : warn ? B.yellow : B.red;
  return (
    <div style={{background:B.card2,border:`1px solid ${B.border}`,borderRadius:8,padding:'12px 16px',borderLeft:`3px solid ${color}`}}>
      <div style={{fontSize:8,fontWeight:800,letterSpacing:1.8,color:B.dim,textTransform:'uppercase',marginBottom:6}}>{label}</div>
      <div style={{display:'flex',alignItems:'baseline',gap:6}}>
        <div style={{fontFamily:'monospace',fontSize:20,fontWeight:800,color:B.text}}>{typeof value==='number'&&Math.abs(value)>999?fmt(value):value}{suffix&&typeof value==='number'&&Math.abs(value)<=999?suffix:''}</div>
        <div style={{width:7,height:7,borderRadius:'50%',background:dot,flexShrink:0,boxShadow:`0 0 6px ${dot}`}}/>
      </div>
      {bench&&<div style={{fontSize:9,color:B.textSub,marginTop:3}}>Meta: {benchDir==='up'?'≥':'≤'}{bench}{suffix}</div>}
    </div>
  );
}

function FiltroBtn({label,active,onClick}) {
  return (
    <button onClick={onClick} style={{
      padding:'6px 13px',fontSize:9,fontWeight:800,cursor:'pointer',letterSpacing:.5,textTransform:'uppercase',
      border:`1px solid ${active?B.red:B.border2}`,background:active?B.red+'1A':'transparent',
      color:active?B.red:B.dim,borderRadius:6,transition:'all .15s',fontFamily:'inherit',
    }}>{label}</button>
  );
}

// ══════════════════════════════════════════════════════════
// FLUJO DE CAJA — STORE
// ══════════════════════════════════════════════════════════
const CATS_INGRESO  = ['Ventas Efectivo','Ventas Tarjeta','Delivery','Otros Ingresos'];
const CATS_EGRESO   = ['Proveedores','Arriendo','Sueldos','Servicios Básicos','IVA','Mutual/AFP','Insumos','Publicidad','Mantenimiento','Otros Pagos'];

const emptyMovimiento = (fecha='',tipo='egreso') => ({
  id: Date.now().toString(),
  fecha, tipo,
  categoria: tipo==='ingreso' ? CATS_INGRESO[0] : CATS_EGRESO[0],
  descripcion: '', monto: '', estado: 'pendiente', // pendiente | pagado | vencido
});

// ══════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════
export default function ExecutiveDashboard({ records }) {
  const [tab, setTab]     = useState('resumen');  // resumen | semanal | mensual | graficos
  const [range, setRange] = useState(30);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [customRange, setCustomRange] = useState(false);

  // Flujo de caja state
  const [movimientos, setMovimientos] = useState([]);
  const [semana, setSemana]  = useState(() => {
    const d = new Date(); d.setDate(d.getDate()-d.getDay()+1);
    return d.toISOString().slice(0,10);
  });
  const [mesFlujo, setMesFlujo] = useState(() => new Date().toISOString().slice(0,7));
  const [nuevoMov, setNuevoMov] = useState(emptyMovimiento());
  const [saldoInicial, setSaldoInicial] = useState('');
  const [loadingFlujo, setLoadingFlujo] = useState(true);

  // ── LOAD/SAVE FLUJO ──
  const loadFlujo = useCallback(async() => {
    setLoadingFlujo(true);
    try {
      const r = await window.storage.get('rb-flujo:movimientos');
      if(r) setMovimientos(JSON.parse(r.value));
      const s = await window.storage.get('rb-flujo:saldoInicial');
      if(s) setSaldoInicial(s.value);
    } catch {}
    setLoadingFlujo(false);
  },[]);

  useEffect(()=>{ loadFlujo(); },[loadFlujo]);

  const saveFlujo = async(movs) => {
    try { await window.storage.set('rb-flujo:movimientos', JSON.stringify(movs)); } catch {}
  };
  const saveSaldo = async(v) => {
    try { await window.storage.set('rb-flujo:saldoInicial', v); } catch {}
  };

  const agregarMov = () => {
    if(!nuevoMov.monto||!nuevoMov.fecha) return;
    const nuevo = [...movimientos, { ...nuevoMov, id:Date.now().toString() }];
    setMovimientos(nuevo); saveFlujo(nuevo);
    setNuevoMov(emptyMovimiento(nuevoMov.fecha, nuevoMov.tipo));
  };

  const toggleEstado = (id) => {
    const estados = ['pendiente','pagado','vencido'];
    const updated = movimientos.map(m => m.id===id ? {...m, estado:estados[(estados.indexOf(m.estado)+1)%3]} : m);
    setMovimientos(updated); saveFlujo(updated);
  };

  const eliminarMov = (id) => {
    const updated = movimientos.filter(m=>m.id!==id);
    setMovimientos(updated); saveFlujo(updated);
  };

  // ── FILTER RECORDS ──
  const filtered = useMemo(() => {
    let data = [...records].sort((a,b)=>a.date.localeCompare(b.date));
    if(customRange&&dateFrom&&dateTo) data=data.filter(r=>r.date>=dateFrom&&r.date<=dateTo);
    else data=data.slice(-range);
    return data;
  },[records,range,dateFrom,dateTo,customRange]);

  const chartData = useMemo(()=>filtered.map(r=>({
    fecha: r.date.slice(5), fechaFull: r.date,
    ventasBrutas: r.ind.ventasBrutas||0,
    iva: r.ind.iva || ((r.ind.ventasBrutas||0)*19/119),
    // Recalculamos ventas netas siempre desde brutas para garantizar consistencia
    ventas: r.ind.ventasBrutas > 0 ? (r.ind.ventasBrutas/1.19) - (r.ind.descuentos||0) : (r.ind.ventasNetas||0),
    costo: r.ind.costoVenta||0,
    margen: r.ind.margenBruto||0,
    sueldos: r.ind.sueldos||0,
    gastosFijos: r.ind.gastosFijos||0,
    otrosGastos: r.ind.otrosGastos||0,
    ebitda: r.ind.ebitda||0,
    utilidad: r.ind.utilidadNeta||0,
    flujo: r.ind.flujoCaja||0,
    mbPct: r.ind.mbPct||0,
    sueldosPct: r.ind.sueldosPct||0,
    ebitdaPct: r.ind.ebitdaPct||0,
    costoPct: r.ind.costoVentaPct||0,
    ticket: r.ind.ticket||0,
    clientes: r.ind.clientes||0,
    avancePE: Math.min(r.ind.avancePE||0,150),
  })),[filtered]);

  const kpis = useMemo(()=>{
    if(!filtered.length) return {};
    const sum = k => filtered.reduce((s,r)=>s+(r.ind[k]||0),0);
    const ventasBrutas = sum('ventasBrutas');
    // Recalcular ventasNetas desde brutas para corregir registros históricos
    const ventasNetas  = filtered.reduce((s,r)=>{
      const brutas = r.ind.ventasBrutas||0;
      return s + (brutas > 0 ? (brutas/1.19) - (r.ind.descuentos||0) : (r.ind.ventasNetas||0));
    }, 0);
    const ivaTotal = filtered.reduce((s,r)=>s+(r.ind.iva||(r.ind.ventasBrutas||0)*19/119),0);
    const costoVenta   = sum('costoVenta');
    const sueldos      = sum('sueldos');
    const ebitda       = sum('ebitda');
    const margenBruto  = ventasNetas - costoVenta;
    const mbPct        = ventasNetas>0?(margenBruto/ventasNetas)*100:0;
    const costoPct     = ventasNetas>0?(costoVenta/ventasNetas)*100:0;
    const sueldosPct   = ventasNetas>0?(sueldos/ventasNetas)*100:0;
    const ebitdaPct    = ventasNetas>0?(ebitda/ventasNetas)*100:0;
    const half = Math.floor(filtered.length/2);
    const v1=filtered.slice(0,half).reduce((s,r)=>{const b=r.ind.ventasBrutas||0;return s+(b>0?(b/1.19)-(r.ind.descuentos||0):(r.ind.ventasNetas||0));},0);
    const v2=filtered.slice(half).reduce((s,r)=>{const b=r.ind.ventasBrutas||0;return s+(b>0?(b/1.19)-(r.ind.descuentos||0):(r.ind.ventasNetas||0));},0);
    const deltaV = v1>0?((v2-v1)/v1)*100:0;
    return {
      ventasBrutas, ventasNetas, ivaTotal, costoVenta, sueldos, ebitda, margenBruto,
      mbPct, costoPct, sueldosPct, ebitdaPct,
      avgTicket: sum('clientes')>0?ventasNetas/sum('clientes'):0,
      totalClientes: sum('clientes'),
      flujo: sum('flujoCaja'), dias: filtered.length, deltaV,
      diasConVentas: filtered.filter(r=>r.ind.ventasBrutas>0||r.ind.ventasNetas>0).length,
    };
  },[filtered]);

  const pieData = useMemo(()=>{
    if(!filtered.length) return [];
    const sum = k=>filtered.reduce((s,r)=>s+(r.ind[k]||0),0);
    return [
      {name:'Costo de Venta',value:Math.max(sum('costoVenta'),0),color:B.red},
      {name:'Sueldos',value:Math.max(sum('sueldos'),0),color:B.yellow},
      {name:'Gastos Fijos',value:Math.max(sum('gastosFijos'),0),color:B.blue},
      {name:'Otros',value:Math.max(sum('otrosGastos'),0),color:B.purple},
      {name:'EBITDA',value:Math.max(sum('ebitda'),0),color:B.green},
    ].filter(d=>d.value>0);
  },[filtered]);

  // ── SEMANA: generar 7 días ──
  const diasSemana = useMemo(()=>{
    const base = new Date(semana+'T12:00:00');
    return Array.from({length:7},(_,i)=>{
      const d = new Date(base); d.setDate(base.getDate()+i);
      return d.toISOString().slice(0,10);
    });
  },[semana]);

  const movSemana = useMemo(()=>movimientos.filter(m=>diasSemana.includes(m.fecha)),[movimientos,diasSemana]);

  const resumenSemana = useMemo(()=>{
    const saldo0 = parseFloat(saldoInicial)||0;
    let acum = saldo0;
    return diasSemana.map(fecha=>{
      const movsD = movimientos.filter(m=>m.fecha===fecha);
      const ingresos = movsD.filter(m=>m.tipo==='ingreso').reduce((s,m)=>s+(parseFloat(m.monto)||0),0);
      const egresos  = movsD.filter(m=>m.tipo==='egreso').reduce((s,m)=>s+(parseFloat(m.monto)||0),0);
      const pendiente= movsD.filter(m=>m.tipo==='egreso'&&m.estado==='pendiente').reduce((s,m)=>s+(parseFloat(m.monto)||0),0);
      const ventasDia= records.find(r=>r.date===fecha)?.ind.ventasNetas||0;
      acum += ingresos - egresos;
      const dow=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][new Date(fecha+'T12:00:00').getDay()];
      return {fecha,dow,ingresos,egresos,pendiente,saldo:acum,ventasDia};
    });
  },[diasSemana,movimientos,saldoInicial,records]);

  // ── MES: agrupar por semana ──
  const resumenMes = useMemo(()=>{
    const movsMes = movimientos.filter(m=>m.fecha.slice(0,7)===mesFlujo);
    const byWeek = {};
    movsMes.forEach(m=>{
      const d=new Date(m.fecha+'T12:00:00');
      const semN=Math.ceil(d.getDate()/7);
      const k=`Semana ${semN}`;
      if(!byWeek[k]) byWeek[k]={semana:k,ingresos:0,egresos:0,pendiente:0};
      if(m.tipo==='ingreso') byWeek[k].ingresos+=parseFloat(m.monto)||0;
      else { byWeek[k].egresos+=parseFloat(m.monto)||0; if(m.estado==='pendiente') byWeek[k].pendiente+=parseFloat(m.monto)||0; }
    });
    // ventas del mes desde records
    const ventasMes = records.filter(r=>r.date.slice(0,7)===mesFlujo);
    const totalVentas = ventasMes.reduce((s,r)=>s+(r.ind.ventasNetas||0),0);
    const totalBrutas = ventasMes.reduce((s,r)=>s+(r.ind.ventasBrutas||0),0);
    const ivaDelMes = ventasMes.reduce((s,r)=>s+(r.ind.iva||r.ind.ventasBrutas*19/119),0);
    return { semanas:Object.values(byWeek), totalVentas, totalBrutas, ivaDelMes, movsMes };
  },[movimientos,mesFlujo,records]);

  // ══════════════════════════════════════════════════════════
  // RENDERS
  // ══════════════════════════════════════════════════════════

  const TABS = [
    {k:'resumen', label:'📊 Resumen Ejecutivo'},
    {k:'semanal', label:'📅 Flujo Semanal'},
    {k:'mensual', label:'🗓 Flujo Mensual'},
    {k:'graficos', label:'📈 Gráficos'},
  ];

  const statColor = e => e==='pagado'?B.green:e==='vencido'?B.red:B.yellow;
  const statLabel = e => e==='pagado'?'PAGADO':e==='vencido'?'VENCIDO':'PENDIENTE';

  const inp = {background:'#0A0A0A',border:`1px solid ${B.border2}`,color:B.text,padding:'7px 10px',borderRadius:6,fontFamily:'monospace',fontSize:12,outline:'none'};
  const btnR = {padding:'8px 18px',fontSize:10,fontWeight:800,cursor:'pointer',border:'none',background:B.red,color:'#fff',borderRadius:6,fontFamily:'inherit',letterSpacing:.5,textTransform:'uppercase'};
  const btnG = {padding:'8px 18px',fontSize:10,fontWeight:800,cursor:'pointer',border:`1px solid ${B.border2}`,background:'transparent',color:B.dim,borderRadius:6,fontFamily:'inherit',letterSpacing:.5,textTransform:'uppercase'};

  const noData = chartData.length===0;
  const emptyMsg = <div style={{height:180,display:'grid',placeItems:'center',color:B.muted,fontSize:12}}>Sin datos para este período</div>;

  // ── RESUMEN EJECUTIVO ──
  const renderResumen = () => (
    <div>
      {/* FILTROS */}
      <div style={{background:B.surface,border:`1px solid ${B.border}`,borderRadius:10,padding:'12px 16px',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:20}}>
        <span style={{fontSize:9,fontWeight:800,letterSpacing:1.5,color:B.dim,textTransform:'uppercase'}}>Período</span>
        {[7,14,30,60,90].map(n=><FiltroBtn key={n} label={`${n}D`} active={!customRange&&range===n} onClick={()=>{setRange(n);setCustomRange(false);}}/>)}
        <FiltroBtn label="Todo" active={!customRange&&range===999} onClick={()=>{setRange(999);setCustomRange(false);}}/>
        <div style={{width:1,height:20,background:B.border2,margin:'0 4px'}}/>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{...inp,width:'auto',fontSize:11}}/>
        <span style={{color:B.dim,fontSize:10}}>→</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{...inp,width:'auto',fontSize:11}}/>
        <button onClick={()=>{if(dateFrom&&dateTo)setCustomRange(true);}} style={{...btnR,padding:'6px 12px'}}>Aplicar</button>
        {customRange&&<button onClick={()=>{setCustomRange(false);setDateFrom('');setDateTo('');}} style={{...btnG,padding:'6px 10px'}}>✕</button>}
      </div>

      {/* VENTAS HERO */}
      <div style={{background:`linear-gradient(135deg,#0F0000,${B.surface})`,border:`1px solid ${B.border}`,borderRadius:12,padding:'20px 24px',marginBottom:12,display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:16}}>
        <div>
          <div style={{fontSize:9,fontWeight:800,letterSpacing:2,color:B.red,textTransform:'uppercase',marginBottom:6}}>Período analizado · {kpis.dias||0} días</div>
          <div style={{fontFamily:'monospace',fontSize:30,fontWeight:900,color:B.text,lineHeight:1}}>{fmt(kpis.ventasNetas)}</div>
          <div style={{fontSize:10,color:B.dim,marginTop:4}}>Ventas Netas (sin IVA) · {kpis.diasConVentas||0} días con ventas</div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,minWidth:300}}>
          <div style={{background:B.card,borderRadius:8,padding:'10px 14px',border:`1px solid ${B.border}`}}>
            <div style={{fontSize:8,color:B.dim,fontWeight:800,letterSpacing:1.5,marginBottom:4}}>VENTAS BRUTAS</div>
            <div style={{fontFamily:'monospace',fontSize:16,fontWeight:800,color:B.text}}>{fmt(kpis.ventasBrutas)}</div>
          </div>
          <div style={{background:B.card,borderRadius:8,padding:'10px 14px',border:`1px solid ${B.border}`}}>
            <div style={{fontSize:8,color:B.dim,fontWeight:800,letterSpacing:1.5,marginBottom:4}}>IVA 19% DEL PERÍODO</div>
            <div style={{fontFamily:'monospace',fontSize:16,fontWeight:800,color:B.yellow}}>{fmt(kpis.ivaTotal)}</div>
          </div>
          <div style={{background:B.card,borderRadius:8,padding:'10px 14px',border:`1px solid ${B.border}`}}>
            <div style={{fontSize:8,color:B.dim,fontWeight:800,letterSpacing:1.5,marginBottom:4}}>TICKET PROMEDIO</div>
            <div style={{fontFamily:'monospace',fontSize:16,fontWeight:800,color:B.text}}>{fmt(kpis.avgTicket)}</div>
          </div>
          <div style={{background:B.card,borderRadius:8,padding:'10px 14px',border:`1px solid ${B.border}`}}>
            <div style={{fontSize:8,color:B.dim,fontWeight:800,letterSpacing:1.5,marginBottom:4}}>TOTAL CLIENTES</div>
            <div style={{fontFamily:'monospace',fontSize:16,fontWeight:800,color:B.text}}>{(kpis.totalClientes||0).toLocaleString('es-CL')}</div>
          </div>
        </div>
      </div>

      {/* MÁRGENES % - Los más importantes */}
      <SecTitle label="Márgenes de Rentabilidad" sub="% sobre ventas netas — benchmarks industria restaurantes" color={B.green}/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:10,marginBottom:8}}>
        <Pill label="Margen de Contribución" value={(kpis.mbPct||0).toFixed(1)} bench="65" benchDir="up" color={B.green}/>
        <Pill label="Costo de Venta %" value={(kpis.costoPct||0).toFixed(1)} bench="32" benchDir="down" color={B.red}/>
        <Pill label="Nómina / Remunerac. %" value={(kpis.sueldosPct||0).toFixed(1)} bench="30" benchDir="down" color={B.yellow}/>
        <Pill label="EBITDA %" value={(kpis.ebitdaPct||0).toFixed(1)} bench="15" benchDir="up" color={B.blue}/>
        <Pill label="EBITDA ($)" value={kpis.ebitda} bench={null} color={B.blue} suffix=""/>
        <Pill label="Flujo de Caja" value={kpis.flujo} bench={null} color={kpis.flujo>=0?B.green:B.red} suffix=""/>
      </div>

      {/* SEMÁFORO VISUAL */}
      <SecTitle label="Panel de Control — Semáforo Financiero" color={B.red}/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:8}}>
        {[
          {label:'Margen de Contribución',val:kpis.mbPct,unit:'%',good:65,warn:50,invert:false,bench:'≥65%'},
          {label:'Costo de Venta',val:kpis.costoPct,unit:'%',good:32,warn:38,invert:true,bench:'≤32%'},
          {label:'Nómina sobre ventas',val:kpis.sueldosPct,unit:'%',good:30,warn:36,invert:true,bench:'≤30%'},
          {label:'EBITDA',val:kpis.ebitdaPct,unit:'%',good:15,warn:8,invert:false,bench:'≥15%'},
          {label:'Flujo de Caja',val:kpis.flujo,unit:'',good:0,warn:-100000,invert:false,bench:'Positivo'},
          {label:'IVA por pagar (est.)',val:kpis.ivaTotal,unit:'',good:null,warn:null,bench:'19/119 de ventas brutas'},
        ].map(({label,val,unit,good,warn,invert,bench})=>{
          const v=parseFloat(val)||0;
          let ok,alerta;
          if(good!==null){ ok=invert?v<=good:v>=good; alerta=invert?v>warn:v<warn; }
          const color=good===null?B.blue:ok?B.green:alerta?B.red:B.yellow;
          const estado=good===null?'INFO':ok?'✔ OK':alerta?'✘ ALERTA':'⚡ REVISAR';
          const barPct=unit==='%'?Math.min(Math.abs(v),100):null;
          return (
            <div key={label} style={{background:B.card2,border:`1px solid ${B.border}`,borderRadius:8,padding:'12px 14px',borderLeft:`3px solid ${color}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                <div style={{fontSize:9,fontWeight:800,letterSpacing:1.5,color:B.dim,textTransform:'uppercase',lineHeight:1.3}}>{label}</div>
                <span style={{fontSize:8,fontWeight:800,padding:'2px 7px',borderRadius:4,background:color+'22',color,letterSpacing:.5}}>{estado}</span>
              </div>
              <div style={{fontFamily:'monospace',fontSize:18,fontWeight:800,color:B.text}}>{unit==='%'?v.toFixed(1)+'%':fmt(v)}</div>
              <div style={{fontSize:9,color:B.textSub,marginTop:4}}>Benchmark: {bench}</div>
              {barPct!==null&&(
                <div style={{height:3,background:B.border2,borderRadius:2,marginTop:8,overflow:'hidden'}}>
                  <div style={{height:'100%',width:barPct+'%',background:color,borderRadius:2,transition:'width .5s'}}/>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* MINI CHARTS */}
      <SecTitle label="Ventas Brutas vs Netas vs IVA" color={B.red}/>
      <Card style={{height:240}}>
        {noData?emptyMsg:(
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{top:8,right:10,left:-10,bottom:0}}>
              <GradDefs/>
              <CartesianGrid strokeDasharray="3 3" stroke={B.border} vertical={false}/>
              <XAxis dataKey="fecha" tick={ax} axisLine={{stroke:B.border}} tickLine={false}/>
              <YAxis tick={ax} axisLine={false} tickLine={false} tickFormatter={fmtM}/>
              <Tooltip content={<Tip/>}/>
              <Legend wrapperStyle={{fontSize:10,color:B.dim}}/>
              <Area type="monotone" dataKey="ventasBrutas" name="Ventas Brutas" stroke={B.orange} fill="url(#gO)" strokeWidth={2} dot={false}/>
              <Area type="monotone" dataKey="ventas" name="Ventas Netas" stroke={B.red} fill="url(#gR)" strokeWidth={2} dot={false}/>
              <Bar dataKey="iva" name="IVA (19/119)" fill={B.yellow} fillOpacity={0.7} radius={[2,2,0,0]}/>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );

  // ── FLUJO SEMANAL ──
  const renderSemanal = () => {
    const totalIngresos = resumenSemana.reduce((s,d)=>s+d.ingresos,0);
    const totalEgresos  = resumenSemana.reduce((s,d)=>s+d.egresos,0);
    const totalPendiente= resumenSemana.reduce((s,d)=>s+d.pendiente,0);
    const saldoFinal    = resumenSemana.length>0?resumenSemana[resumenSemana.length-1].saldo:0;

    return (
      <div>
        {/* CONTROLES */}
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,flexWrap:'wrap'}}>
          <div>
            <div style={{fontSize:9,color:B.dim,fontWeight:800,letterSpacing:1.5,marginBottom:4}}>SEMANA DESDE</div>
            <input type="date" value={semana} onChange={e=>setSemana(e.target.value)} style={{...inp,width:'auto'}}/>
          </div>
          <div>
            <div style={{fontSize:9,color:B.dim,fontWeight:800,letterSpacing:1.5,marginBottom:4}}>SALDO INICIAL ($)</div>
            <input type="number" placeholder="0" value={saldoInicial}
              onChange={e=>{setSaldoInicial(e.target.value);saveSaldo(e.target.value);}}
              style={{...inp,width:160}}/>
          </div>
        </div>

        {/* RESUMEN SEMANAL HEADER */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
          {[
            {label:'Total Ingresos',val:totalIngresos,color:B.green},
            {label:'Total Egresos',val:totalEgresos,color:B.red},
            {label:'Compromisos Pendientes',val:totalPendiente,color:B.yellow},
            {label:'Saldo Estimado al Cierre',val:saldoFinal,color:saldoFinal>=0?B.green:B.red},
          ].map(({label,val,color})=>(
            <div key={label} style={{background:B.card,border:`1px solid ${B.border}`,borderRadius:8,padding:'12px 14px',borderTop:`2px solid ${color}`}}>
              <div style={{fontSize:8,color:B.dim,fontWeight:800,letterSpacing:1.5,textTransform:'uppercase',marginBottom:6}}>{label}</div>
              <div style={{fontFamily:'monospace',fontSize:18,fontWeight:800,color}}>{fmt(val)}</div>
            </div>
          ))}
        </div>

        {/* TABLA 7 DÍAS */}
        <Card style={{padding:0,overflow:'hidden',marginBottom:16}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'#090909'}}>
                  {['Día','Fecha','Ventas (app)','Ingresos','Egresos','Pendiente','Saldo'].map(h=>(
                    <th key={h} style={{padding:'10px 14px',fontSize:8,fontWeight:800,letterSpacing:1.5,color:B.dim,textAlign:'left',borderBottom:`1px solid ${B.border}`,textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resumenSemana.map((d,i)=>(
                  <tr key={d.fecha} style={{borderBottom:`1px solid ${B.border}`,background:i%2===0?B.card:'#0E0E0E'}}>
                    <td style={{padding:'10px 14px',fontSize:12,fontWeight:800,color:B.red}}>{d.dow}</td>
                    <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:11,color:B.textDim}}>{d.fecha}</td>
                    <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:B.textDim}}>{d.ventasDia>0?fmt(d.ventasDia):'—'}</td>
                    <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:B.green,fontWeight:700}}>{d.ingresos>0?fmt(d.ingresos):'—'}</td>
                    <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:B.red}}>{d.egresos>0?fmt(d.egresos):'—'}</td>
                    <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:B.yellow}}>{d.pendiente>0?fmt(d.pendiente):'—'}</td>
                    <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:13,fontWeight:800,color:d.saldo>=0?B.green:B.red}}>{fmt(d.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* AGREGAR MOVIMIENTO */}
        <SecTitle label="Ingresar Compromiso o Ingreso" color={B.blue}/>
        <Card>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10}}>
            <div>
              <div style={{fontSize:8,color:B.dim,fontWeight:800,letterSpacing:1.5,marginBottom:4}}>FECHA</div>
              <input type="date" value={nuevoMov.fecha} onChange={e=>setNuevoMov(p=>({...p,fecha:e.target.value}))} style={{...inp,width:'100%'}}/>
            </div>
            <div>
              <div style={{fontSize:8,color:B.dim,fontWeight:800,letterSpacing:1.5,marginBottom:4}}>TIPO</div>
              <select value={nuevoMov.tipo} onChange={e=>setNuevoMov(p=>({...p,tipo:e.target.value,categoria:e.target.value==='ingreso'?CATS_INGRESO[0]:CATS_EGRESO[0]}))} style={{...inp,width:'100%'}}>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Compromiso / Egreso</option>
              </select>
            </div>
            <div>
              <div style={{fontSize:8,color:B.dim,fontWeight:800,letterSpacing:1.5,marginBottom:4}}>CATEGORÍA</div>
              <select value={nuevoMov.categoria} onChange={e=>setNuevoMov(p=>({...p,categoria:e.target.value}))} style={{...inp,width:'100%'}}>
                {(nuevoMov.tipo==='ingreso'?CATS_INGRESO:CATS_EGRESO).map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:8,color:B.dim,fontWeight:800,letterSpacing:1.5,marginBottom:4}}>DESCRIPCIÓN</div>
              <input type="text" placeholder="Ej: Pago proveedor" value={nuevoMov.descripcion} onChange={e=>setNuevoMov(p=>({...p,descripcion:e.target.value}))} style={{...inp,width:'100%'}}/>
            </div>
            <div>
              <div style={{fontSize:8,color:B.dim,fontWeight:800,letterSpacing:1.5,marginBottom:4}}>MONTO ($)</div>
              <input type="number" placeholder="0" value={nuevoMov.monto} onChange={e=>setNuevoMov(p=>({...p,monto:e.target.value}))} style={{...inp,width:'100%'}}/>
            </div>
            <div style={{display:'flex',alignItems:'flex-end'}}>
              <button style={{...btnR,width:'100%',padding:'9px'}} onClick={agregarMov}>+ Agregar</button>
            </div>
          </div>
        </Card>

        {/* LISTA MOVIMIENTOS SEMANA */}
        {movSemana.length>0&&(
          <>
            <SecTitle label={`Movimientos de la semana (${movSemana.length})`} color={B.purple}/>
            <Card style={{padding:0,overflow:'hidden'}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr style={{background:'#090909'}}>
                      {['Fecha','Tipo','Categoría','Descripción','Monto','Estado',''].map(h=>(
                        <th key={h} style={{padding:'9px 12px',fontSize:8,fontWeight:800,letterSpacing:1.5,color:B.dim,textAlign:'left',borderBottom:`1px solid ${B.border}`,textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movSemana.sort((a,b)=>a.fecha.localeCompare(b.fecha)).map((m,i)=>(
                      <tr key={m.id} style={{borderBottom:`1px solid ${B.border}`,background:i%2===0?B.card:'#0E0E0E'}}>
                        <td style={{padding:'8px 12px',fontFamily:'monospace',fontSize:11,color:B.textDim}}>{m.fecha}</td>
                        <td style={{padding:'8px 12px'}}>
                          <span style={{fontSize:9,fontWeight:800,padding:'2px 8px',borderRadius:4,background:m.tipo==='ingreso'?B.green+'22':B.red+'22',color:m.tipo==='ingreso'?B.green:B.red}}>{m.tipo==='ingreso'?'INGRESO':'EGRESO'}</span>
                        </td>
                        <td style={{padding:'8px 12px',fontSize:11,color:B.textDim}}>{m.categoria}</td>
                        <td style={{padding:'8px 12px',fontSize:11,color:B.text}}>{m.descripcion||'—'}</td>
                        <td style={{padding:'8px 12px',fontFamily:'monospace',fontSize:12,fontWeight:700,color:m.tipo==='ingreso'?B.green:B.red}}>{m.tipo==='ingreso'?'+':'-'}{fmt(parseFloat(m.monto)||0)}</td>
                        <td style={{padding:'8px 12px'}}>
                          <button onClick={()=>toggleEstado(m.id)} style={{fontSize:8,fontWeight:800,padding:'2px 8px',borderRadius:4,background:statColor(m.estado)+'22',color:statColor(m.estado),border:'none',cursor:'pointer',fontFamily:'inherit',letterSpacing:.5}}>
                            {statLabel(m.estado)}
                          </button>
                        </td>
                        <td style={{padding:'8px 12px'}}>
                          <button onClick={()=>eliminarMov(m.id)} style={{fontSize:10,background:'transparent',border:'none',cursor:'pointer',color:B.dim}}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    );
  };

  // ── FLUJO MENSUAL ──
  const renderMensual = () => {
    const totalI = resumenMes.movsMes.filter(m=>m.tipo==='ingreso').reduce((s,m)=>s+(parseFloat(m.monto)||0),0);
    const totalE = resumenMes.movsMes.filter(m=>m.tipo==='egreso').reduce((s,m)=>s+(parseFloat(m.monto)||0),0);
    const pendM  = resumenMes.movsMes.filter(m=>m.tipo==='egreso'&&m.estado==='pendiente').reduce((s,m)=>s+(parseFloat(m.monto)||0),0);
    return (
      <div>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,flexWrap:'wrap'}}>
          <div>
            <div style={{fontSize:9,color:B.dim,fontWeight:800,letterSpacing:1.5,marginBottom:4}}>MES</div>
            <input type="month" value={mesFlujo} onChange={e=>setMesFlujo(e.target.value)} style={{...inp,width:'auto'}}/>
          </div>
        </div>

        {/* RESUMEN MES */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10,marginBottom:16}}>
          {[
            {label:'Ventas Brutas del mes',val:resumenMes.totalBrutas,color:B.orange},
            {label:'Ventas Netas del mes',val:resumenMes.totalVentas,color:B.red},
            {label:'IVA a pagar (19%)',val:resumenMes.ivaDelMes,color:B.yellow},
            {label:'Total Ingresos registrados',val:totalI,color:B.green},
            {label:'Total Compromisos',val:totalE,color:B.red},
            {label:'Compromisos pendientes',val:pendM,color:B.yellow},
          ].map(({label,val,color})=>(
            <div key={label} style={{background:B.card,border:`1px solid ${B.border}`,borderRadius:8,padding:'12px 14px',borderTop:`2px solid ${color}`}}>
              <div style={{fontSize:8,color:B.dim,fontWeight:800,letterSpacing:1.5,textTransform:'uppercase',marginBottom:6,lineHeight:1.4}}>{label}</div>
              <div style={{fontFamily:'monospace',fontSize:17,fontWeight:800,color}}>{fmt(val)}</div>
            </div>
          ))}
        </div>

        {/* IVA DESTACADO */}
        <div style={{background:'#110A00',border:`1px solid ${B.yellow}44`,borderRadius:10,padding:'16px 20px',marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
          <div>
            <div style={{fontSize:9,fontWeight:800,letterSpacing:2,color:B.yellow,textTransform:'uppercase',marginBottom:4}}>⚠ IVA Mensual estimado a declarar al SII</div>
            <div style={{fontSize:11,color:B.dim}}>Corresponde al 19% sobre las ventas brutas del mes · Declarar antes del día 12</div>
          </div>
          <div style={{fontFamily:'monospace',fontSize:28,fontWeight:900,color:B.yellow}}>{fmt(resumenMes.ivaDelMes)}</div>
        </div>

        {/* POR SEMANA */}
        {resumenMes.semanas.length>0&&(
          <>
            <SecTitle label="Flujo por semana del mes" color={B.purple}/>
            <Card style={{padding:0,overflow:'hidden',marginBottom:16}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'#090909'}}>
                    {['Semana','Ingresos','Egresos','Pendientes','Balance'].map(h=>(
                      <th key={h} style={{padding:'10px 14px',fontSize:8,fontWeight:800,letterSpacing:1.5,color:B.dim,textAlign:'left',borderBottom:`1px solid ${B.border}`,textTransform:'uppercase'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resumenMes.semanas.map((s,i)=>{
                    const bal=s.ingresos-s.egresos;
                    return (
                      <tr key={s.semana} style={{borderBottom:`1px solid ${B.border}`,background:i%2===0?B.card:'#0E0E0E'}}>
                        <td style={{padding:'10px 14px',fontSize:12,fontWeight:700,color:B.text}}>{s.semana}</td>
                        <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:B.green,fontWeight:700}}>{fmt(s.ingresos)}</td>
                        <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:B.red}}>{fmt(s.egresos)}</td>
                        <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:12,color:B.yellow}}>{fmt(s.pendiente)}</td>
                        <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:13,fontWeight:800,color:bal>=0?B.green:B.red}}>{fmt(bal)}</td>
                      </tr>
                    );
                  })}
                  <tr style={{background:'#0A0A0A',borderTop:`2px solid ${B.border2}`}}>
                    <td style={{padding:'10px 14px',fontSize:11,fontWeight:800,color:B.text}}>TOTAL MES</td>
                    <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:13,fontWeight:800,color:B.green}}>{fmt(totalI)}</td>
                    <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:13,fontWeight:800,color:B.red}}>{fmt(totalE)}</td>
                    <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:13,fontWeight:800,color:B.yellow}}>{fmt(pendM)}</td>
                    <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:14,fontWeight:800,color:totalI-totalE>=0?B.green:B.red}}>{fmt(totalI-totalE)}</td>
                  </tr>
                </tbody>
              </table>
            </Card>
          </>
        )}

        {/* GRÁFICO MENSUAL */}
        {resumenMes.semanas.length>0&&(
          <Card style={{height:220}}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={resumenMes.semanas} margin={{top:10,right:10,left:-10,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={B.border} vertical={false}/>
                <XAxis dataKey="semana" tick={ax} axisLine={{stroke:B.border}} tickLine={false}/>
                <YAxis tick={ax} axisLine={false} tickLine={false} tickFormatter={fmtM}/>
                <Tooltip content={<Tip/>}/>
                <Legend wrapperStyle={{fontSize:10,color:B.dim}}/>
                <Bar dataKey="ingresos" name="Ingresos" fill={B.green} fillOpacity={0.85} radius={[3,3,0,0]}/>
                <Bar dataKey="egresos" name="Egresos" fill={B.red} fillOpacity={0.85} radius={[3,3,0,0]}/>
                <Bar dataKey="pendiente" name="Pendiente" fill={B.yellow} fillOpacity={0.85} radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>
    );
  };

  // ── GRÁFICOS ──
  const renderGraficos = () => (
    <div>
      <SecTitle label="Ventas Netas vs Costo de Venta" sub="evolución y spread" color={B.red}/>
      <Card style={{height:260}}>
        {noData?emptyMsg:(
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{top:8,right:10,left:-10,bottom:0}}>
              <GradDefs/>
              <CartesianGrid strokeDasharray="3 3" stroke={B.border} vertical={false}/>
              <XAxis dataKey="fecha" tick={ax} axisLine={{stroke:B.border}} tickLine={false}/>
              <YAxis tick={ax} axisLine={false} tickLine={false} tickFormatter={fmtM}/>
              <Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:10,color:B.dim}}/>
              <Area type="monotone" dataKey="ventas" name="Ventas Netas" stroke={B.red} fill="url(#gR)" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="costo" name="Costo de Venta" stroke={B.yellow} strokeWidth={1.5} dot={false} strokeDasharray="5 3"/>
              <Area type="monotone" dataKey="margen" name="Margen Bruto" stroke={B.green} fill="url(#gG)" strokeWidth={1.5} dot={false}/>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div>
          <SecTitle label="Márgenes % — Tendencia" color={B.green}/>
          <Card style={{height:240}}>
            {noData?emptyMsg:(
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{top:8,right:10,left:-10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={B.border} vertical={false}/>
                  <XAxis dataKey="fecha" tick={ax} axisLine={{stroke:B.border}} tickLine={false}/>
                  <YAxis tick={ax} axisLine={false} tickLine={false} unit="%"/>
                  <Tooltip content={<Tip/>} formatter={v=>v.toFixed(1)+'%'}/>
                  <Legend wrapperStyle={{fontSize:10,color:B.dim}}/>
                  <ReferenceLine y={65} stroke={B.green} strokeDasharray="4 4" strokeOpacity={0.4} label={{value:'MB 65%',position:'insideTopRight',fontSize:8,fill:B.green}}/>
                  <ReferenceLine y={30} stroke={B.yellow} strokeDasharray="4 4" strokeOpacity={0.4} label={{value:'Nóm 30%',position:'insideBottomRight',fontSize:8,fill:B.yellow}}/>
                  <Line type="monotone" dataKey="mbPct" name="Margen Bruto %" stroke={B.green} strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="costoPct" name="Costo Venta %" stroke={B.red} strokeWidth={1.5} dot={false} strokeDasharray="4 3"/>
                  <Line type="monotone" dataKey="sueldosPct" name="Nómina %" stroke={B.yellow} strokeWidth={1.5} dot={false}/>
                  <Line type="monotone" dataKey="ebitdaPct" name="EBITDA %" stroke={B.blue} strokeWidth={2} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
        <div>
          <SecTitle label="Composición de Costos" sub="promedio período" color={B.blue}/>
          <Card style={{height:240}}>
            {pieData.length===0?emptyMsg:(
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {pieData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Pie>
                  <Tooltip content={<Tip/>} formatter={v=>fmt(v)}/>
                  <Legend wrapperStyle={{fontSize:9,color:B.dim}} layout="vertical" align="right" verticalAlign="middle"/>
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      </div>

      <SecTitle label="Evolución Nómina" sub="monto y % sobre ventas" color={B.yellow}/>
      <Card style={{height:240}}>
        {noData?emptyMsg:(
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{top:8,right:40,left:-10,bottom:0}}>
              <GradDefs/>
              <CartesianGrid strokeDasharray="3 3" stroke={B.border} vertical={false}/>
              <XAxis dataKey="fecha" tick={ax} axisLine={{stroke:B.border}} tickLine={false}/>
              <YAxis yAxisId="l" tick={ax} axisLine={false} tickLine={false} tickFormatter={fmtM}/>
              <YAxis yAxisId="r" orientation="right" tick={ax} axisLine={false} tickLine={false} unit="%"/>
              <Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:10,color:B.dim}}/>
              <Area yAxisId="l" type="monotone" dataKey="sueldos" name="Nómina ($)" stroke={B.yellow} fill="url(#gY)" strokeWidth={2} dot={false}/>
              <Line yAxisId="r" type="monotone" dataKey="sueldosPct" name="Nómina % ventas" stroke={B.orange} strokeWidth={2} dot={false} strokeDasharray="5 3"/>
              <ReferenceLine yAxisId="r" y={30} stroke={B.yellow} strokeDasharray="4 4" strokeOpacity={0.5} label={{value:'Bench 30%',position:'insideTopRight',fontSize:8,fill:B.yellow}}/>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div>
          <SecTitle label="Estructura de Costos apilada" color={B.purple}/>
          <Card style={{height:220}}>
            {noData?emptyMsg:(
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{top:8,right:10,left:-10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={B.border} vertical={false}/>
                  <XAxis dataKey="fecha" tick={ax} axisLine={{stroke:B.border}} tickLine={false}/>
                  <YAxis tick={ax} axisLine={false} tickLine={false} tickFormatter={fmtM}/>
                  <Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:10,color:B.dim}}/>
                  <Bar dataKey="costo" name="Costo Venta" stackId="a" fill={B.red} fillOpacity={0.85}/>
                  <Bar dataKey="sueldos" name="Sueldos" stackId="a" fill={B.yellow} fillOpacity={0.85}/>
                  <Bar dataKey="gastosFijos" name="G. Fijos" stackId="a" fill={B.blue} fillOpacity={0.85}/>
                  <Bar dataKey="otrosGastos" name="Otros" stackId="a" fill={B.purple} fillOpacity={0.85} radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
        <div>
          <SecTitle label="Flujo de Caja diario" color={B.green}/>
          <Card style={{height:220}}>
            {noData?emptyMsg:(
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{top:8,right:10,left:-10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={B.border} vertical={false}/>
                  <XAxis dataKey="fecha" tick={ax} axisLine={{stroke:B.border}} tickLine={false}/>
                  <YAxis tick={ax} axisLine={false} tickLine={false} tickFormatter={fmtM}/>
                  <Tooltip content={<Tip/>}/>
                  <ReferenceLine y={0} stroke={B.border2}/>
                  <Bar dataKey="flujo" name="Flujo de Caja" radius={[3,3,0,0]}>
                    {chartData.map((d,i)=><Cell key={i} fill={d.flujo>=0?B.green:B.red} fillOpacity={0.85}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ══════════════════════════════════════════════════════════
  return (
    <div style={{background:B.bg,minHeight:'100vh',color:B.text,fontFamily:"'Inter','Helvetica Neue',sans-serif"}}>
      {/* HERO */}
      <div style={{background:`linear-gradient(135deg,#0D0000 0%,${B.surface} 70%,#000 100%)`,borderBottom:`1px solid ${B.border}`,padding:'18px 24px 14px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
          <div>
            <div style={{fontSize:9,fontWeight:800,letterSpacing:3,color:B.red,textTransform:'uppercase',marginBottom:3}}>Panel de Control Ejecutivo</div>
            <div style={{fontSize:20,fontWeight:900,letterSpacing:-0.5}}>House <span style={{color:B.red}}>Rap Burger</span></div>
          </div>
          <div style={{fontFamily:'monospace',fontSize:11,color:B.dim,background:B.card,border:`1px solid ${B.border}`,padding:'5px 14px',borderRadius:6}}>
            {new Date().toLocaleDateString('es-CL',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}
          </div>
        </div>
        {/* SUB-TABS */}
        <div style={{display:'flex',gap:4,marginTop:14,flexWrap:'wrap'}}>
          {TABS.map(t=>(
            <button key={t.k} onClick={()=>setTab(t.k)} style={{
              padding:'9px 16px',fontSize:10,fontWeight:800,cursor:'pointer',background:'none',
              border:'none',borderBottom:tab===t.k?`2px solid ${B.red}`:'2px solid transparent',
              color:tab===t.k?B.red:B.dim,letterSpacing:.5,textTransform:'uppercase',whiteSpace:'nowrap',
              transition:'color .15s',fontFamily:'inherit',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{padding:'16px 24px 40px',maxWidth:1400,margin:'0 auto'}}>
        {tab==='resumen'  && renderResumen()}
        {tab==='semanal'  && renderSemanal()}
        {tab==='mensual'  && renderMensual()}
        {tab==='graficos' && renderGraficos()}
        <div style={{textAlign:'center',fontSize:8,color:B.muted,marginTop:32,paddingTop:12,borderTop:`1px solid ${B.border}`,letterSpacing:1.5}}>
          HOUSE RAP BURGER · CONTROL FINANCIERO EJECUTIVO · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
