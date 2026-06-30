import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ComposedChart
} from "recharts";

// ── BRAND TOKENS ──
const BRAND = {
  red: '#E8191A', redDark: '#B01010', yellow: '#FFD000', black: '#0A0A0A',
  dark: '#111111', card: '#181818', border: '#2a2a2a', muted: '#555555',
  dim: '#888888', text: '#F0F0F0', green: '#22c55e', blue: '#38bdf8', purple: '#a78bfa',
};

// ── HELPERS ──
const fmt = v => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v || 0);
const fmtShort = v => {
  const a = Math.abs(v || 0);
  if (a >= 1000000) return (v/1000000).toFixed(1)+'M';
  if (a >= 1000) return (v/1000).toFixed(0)+'K';
  return Math.round(v||0).toString();
};
const pctFmt = v => (v || 0).toFixed(1) + '%';
const today = () => new Date().toISOString().split('T')[0];
const num = v => parseFloat(v) || 0;

const EMPTY_FORM = {
  ventasBrutas: '', descuentos: '', numClientes: '', compras: '',
  inventarioInicial: '', inventarioFinal: '', sueldos: '', gastosFijos: '',
  depreciacion: '', intereses: '', otrosGastos: '', cobros: '', pagos: '',
  impuestos: ''
};

function calcIndicadores(f) {
  const ventasBrutas   = num(f.ventasBrutas);
  const descuentos     = num(f.descuentos);
  const ventasNetas    = ventasBrutas - descuentos;
  const clientes       = num(f.numClientes);
  const compras        = num(f.compras);
  const invInicial     = num(f.inventarioInicial);
  const invFinal       = num(f.inventarioFinal);
  const sueldos        = num(f.sueldos);
  const gastosFijos    = num(f.gastosFijos);
  const depreciacion   = num(f.depreciacion);
  const intereses      = num(f.intereses);
  const otrosGastos    = num(f.otrosGastos);
  const cobros         = num(f.cobros);
  const pagos          = num(f.pagos);
  const impuestos      = num(f.impuestos);

  const ticket         = clientes > 0 ? ventasNetas / clientes : 0;
  const costoVenta     = invInicial + compras - invFinal;
  const margenBruto    = ventasNetas - costoVenta;
  const mbPct          = ventasNetas > 0 ? (margenBruto / ventasNetas) * 100 : 0;
  const costoVentaPct  = ventasNetas > 0 ? (costoVenta / ventasNetas) * 100 : 0;
  const sueldosPct     = ventasNetas > 0 ? (sueldos / ventasNetas) * 100 : 0;
  const gastosPct      = ventasNetas > 0 ? (gastosFijos / ventasNetas) * 100 : 0;

  // ── ESTADO DE RESULTADOS ──
  const utilidadOperativa = margenBruto - sueldos - gastosFijos - otrosGastos; // EBIT antes de D&A
  const ebitda             = utilidadOperativa + depreciacion; // EBITDA = EBIT + Depreciacion (sin intereses)
  const ebitdaPct          = ventasNetas > 0 ? (ebitda / ventasNetas) * 100 : 0;
  const ebit                = utilidadOperativa; // resultado operacional (ya neto de D&A incluida en gastosFijos o aparte)
  const resultadoAntesImp  = utilidadOperativa - intereses;
  const utilidadNeta       = resultadoAntesImp - impuestos;
  const margenNetoPct      = ventasNetas > 0 ? (utilidadNeta / ventasNetas) * 100 : 0;

  const flujoCaja      = cobros - pagos;
  const invPromedio    = (invInicial + invFinal) / 2;
  const diasInv        = costoVenta > 0 && invPromedio > 0 ? (invPromedio / costoVenta) * 30 : 0;
  const rotacion       = invPromedio > 0 ? costoVenta / invPromedio : 0;
  const gastosTotales  = sueldos + gastosFijos + otrosGastos;
  const mcPct          = ventasNetas > 0 ? margenBruto / ventasNetas : 0;
  const puntoEquilibrio = mcPct > 0 ? gastosTotales / mcPct : 0;
  const avancePE       = puntoEquilibrio > 0 ? Math.min((ventasNetas / puntoEquilibrio) * 100, 200) : 0;

  return {
    ventasBrutas, descuentos, ventasNetas, ticket, clientes, compras,
    costoVenta, costoVentaPct, margenBruto, mbPct, sueldos, sueldosPct,
    gastosFijos, gastosPct, otrosGastos, depreciacion, intereses, impuestos,
    utilidadOperativa, ebitda, ebitdaPct, resultadoAntesImp, utilidadNeta, margenNetoPct,
    flujoCaja, diasInv, rotacion, puntoEquilibrio, avancePE
  };
}

// ════════════════════════════════════════════════════════
// PARÁMETROS LEGALES CHILE 2026 (Junio 2026)
// Fuente: Dirección del Trabajo, Superintendencia de Pensiones, Previred
// ════════════════════════════════════════════════════════
const PARAM_LEGAL = {
  UF: 39200,                     // valor UF referencial junio 2026 (editable por el usuario)
  IMM: 539000,                   // Ingreso Mínimo Mensual 2026 (Ley 21.751)
  TOPE_AFP_SALUD_UF: 87.8,       // tope imponible AFP/Salud/Mutual (UF) - vigente hasta antes del ajuste de marzo
  TOPE_AFC_UF: 131.8,            // tope imponible Seguro de Cesantía (UF)
  AFP_TASA: 10.0,                // % cotización obligatoria AFP (cuenta individual)
  AFP_COMISION_DEFAULT: 0.58,    // % comisión AFP promedio referencial (varía por AFP)
  SALUD_TASA: 7.0,                // % cotización salud (Fonasa o Isapre 7% legal)
  AFC_TRABAJADOR_INDEFINIDO: 0.6, // % AFC trabajador (solo contrato indefinido)
  AFC_EMPLEADOR_INDEFINIDO: 2.4,  // % AFC empleador (contrato indefinido)
  AFC_EMPLEADOR_PLAZOFIJO: 3.0,   // % AFC empleador (contrato a plazo fijo, no aporta trabajador)
  SIS_EMPLEADOR: 1.49,            // % SIS - 100% empleador (referencial 2026)
  MUTUAL_BASICA: 0.90,            // % mutual básica (accidentes del trabajo) - cargo empleador
  GRATIFICACION_TOPE_MENSUAL: 220785, // tope gratificación legal mensual (4.75 IMM /12 aprox, referencial)
};

const TRAMOS_IUT_MENSUAL_UTM = [
  // [desde UTM, hasta UTM, factor, rebaja UTM] - Tabla Impuesto Único de Segunda Categoría
  { desde: 0,      hasta: 13.5,   factor: 0,      rebaja: 0      },
  { desde: 13.5,   hasta: 30,     factor: 0.04,   rebaja: 0.54   },
  { desde: 30,     hasta: 50,     factor: 0.08,   rebaja: 1.74   },
  { desde: 50,     hasta: 70,     factor: 0.135,  rebaja: 4.49   },
  { desde: 70,     hasta: 90,     factor: 0.23,   rebaja: 11.14  },
  { desde: 90,     hasta: 120,    factor: 0.304,  rebaja: 17.80  },
  { desde: 120,    hasta: 310,    factor: 0.35,   rebaja: 23.32  },
  { desde: 310,    hasta: Infinity, factor: 0.40, rebaja: 38.82  },
];
const UTM_VALOR = 68647; // valor referencial UTM junio 2026 (editable)

function calcImpuestoUnico(baseImponibleTributable) {
  const enUTM = baseImponibleTributable / UTM_VALOR;
  const tramo = TRAMOS_IUT_MENSUAL_UTM.find(t => enUTM > t.desde && enUTM <= t.hasta) || TRAMOS_IUT_MENSUAL_UTM[0];
  if (tramo.factor === 0) return 0;
  const impuestoUTM = enUTM * tramo.factor - tramo.rebaja;
  return Math.max(0, impuestoUTM * UTM_VALOR);
}

const EMPTY_EMPLEADO = {
  nombre: '', rut: '', cargo: '', tipoContrato: 'indefinido', // indefinido | plazofijo
  sueldoBase: '', diasTrabajados: '30', horasExtra: '0', valorHoraExtra: '',
  gratificacion: '', bonos: '', comisiones: '', colacion: '', movilizacion: '',
  asignacionFamiliar: '', afpComision: PARAM_LEGAL.AFP_COMISION_DEFAULT.toString(),
  salud: 'fonasa', planIsapreUF: '', anticipos: '', otrosDescuentos: '',
};

function calcLiquidacion(e, params) {
  const sueldoBase     = num(e.sueldoBase);
  const diasTrab       = num(e.diasTrabajados) || 30;
  const horasExtra     = num(e.horasExtra);
  const valorHE        = num(e.valorHoraExtra);
  const gratificacion  = num(e.gratificacion);
  const bonos          = num(e.bonos);
  const comisiones     = num(e.comisiones);
  const colacion       = num(e.colacion);
  const movilizacion   = num(e.movilizacion);
  const asigFamiliar   = num(e.asignacionFamiliar);
  const anticipos      = num(e.anticipos);
  const otrosDesc      = num(e.otrosDescuentos);
  const afpComisionPct = num(e.afpComision) || PARAM_LEGAL.AFP_COMISION_DEFAULT;

  // proporcional por días trabajados (si no son 30)
  const sueldoProporcional = diasTrab < 30 ? (sueldoBase / 30) * diasTrab : sueldoBase;
  const pagoHorasExtra = horasExtra * valorHE;

  // ── HABERES IMPONIBLES (afectos a cotizaciones) ──
  const totalImponible = sueldoProporcional + pagoHorasExtra + gratificacion + bonos + comisiones;

  // ── HABERES NO IMPONIBLES ──
  const totalNoImponible = colacion + movilizacion + asigFamiliar;

  const totalHaberes = totalImponible + totalNoImponible;

  // ── TOPES ──
  const topeAfpSalud = params.TOPE_AFP_SALUD_UF * params.UF;
  const topeAfc = params.TOPE_AFC_UF * params.UF;
  const baseAfpSalud = Math.min(totalImponible, topeAfpSalud);
  const baseAfc = Math.min(totalImponible, topeAfc);

  // ── DESCUENTOS LEGALES TRABAJADOR ──
  const dscAfpObligatorio = baseAfpSalud * (params.AFP_TASA / 100);
  const dscAfpComision    = baseAfpSalud * (afpComisionPct / 100);
  const dscAfpTotal       = dscAfpObligatorio + dscAfpComision;

  const dscSalud = e.salud === 'isapre' && num(e.planIsapreUF) > 0
    ? Math.max(num(e.planIsapreUF) * params.UF, baseAfpSalud * (params.SALUD_TASA/100))
    : baseAfpSalud * (params.SALUD_TASA / 100);

  const dscAfcTrabajador = e.tipoContrato === 'indefinido'
    ? baseAfc * (params.AFC_TRABAJADOR_INDEFINIDO / 100)
    : 0;

  // ── BASE TRIBUTABLE (imponible - cotizaciones trabajador) ──
  const baseTributable = totalImponible - dscAfpTotal - dscSalud - dscAfcTrabajador;
  const impuestoUnico = calcImpuestoUnico(baseTributable);

  const totalDescuentosLegales = dscAfpTotal + dscSalud + dscAfcTrabajador + impuestoUnico;
  const totalOtrosDescuentos = anticipos + otrosDesc;
  const totalDescuentos = totalDescuentosLegales + totalOtrosDescuentos;

  const sueldoLiquido = totalHaberes - totalDescuentos;

  // ── APORTES DEL EMPLEADOR (no se descuentan al trabajador, son costo extra) ──
  const aporteAfcEmpleador = e.tipoContrato === 'indefinido'
    ? baseAfc * (params.AFC_EMPLEADOR_INDEFINIDO / 100)
    : baseAfc * (params.AFC_EMPLEADOR_PLAZOFIJO / 100);
  const aporteSis = baseAfpSalud * (params.SIS_EMPLEADOR / 100);
  const aporteMutual = baseAfpSalud * (params.MUTUAL_BASICA / 100);
  const totalAportesEmpleador = aporteAfcEmpleador + aporteSis + aporteMutual;

  const costoTotalEmpresa = totalHaberes + totalAportesEmpleador;

  // ── TOTAL IMPOSICIONES A PAGAR (lo que va a Previred: trabajador + empleador) ──
  const totalImposicionesAPagar = dscAfpTotal + dscSalud + dscAfcTrabajador + aporteAfcEmpleador + aporteSis + aporteMutual;

  return {
    sueldoProporcional, pagoHorasExtra, gratificacion, bonos, comisiones,
    totalImponible, colacion, movilizacion, asigFamiliar, totalNoImponible, totalHaberes,
    baseAfpSalud, baseAfc,
    dscAfpObligatorio, dscAfpComision, dscAfpTotal, dscSalud, dscAfcTrabajador,
    baseTributable, impuestoUnico, totalDescuentosLegales,
    anticipos, otrosDesc, totalOtrosDescuentos, totalDescuentos, sueldoLiquido,
    aporteAfcEmpleador, aporteSis, aporteMutual, totalAportesEmpleador,
    costoTotalEmpresa, totalImposicionesAPagar,
  };
}

// ── PILL ──
function Pill({ value, good, warn, invert = false }) {
  const v = parseFloat(value);
  let status, color;
  if (invert) { status = v <= good ? 'OK' : v <= warn ? 'Revisar' : 'Alerta'; color = v <= good ? BRAND.green : v <= warn ? BRAND.yellow : BRAND.red; }
  else { status = v >= good ? 'OK' : v >= warn ? 'Revisar' : 'Alerta'; color = v >= good ? BRAND.green : v >= warn ? BRAND.yellow : BRAND.red; }
  return <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 3, background: color + '25', color, fontFamily: 'monospace', letterSpacing: .5, textTransform: 'uppercase' }}>{status}</span>;
}

// ── KPI CARD ──
function KpiCard({ label, value, sub, accent = BRAND.red, bar, barGood = 60 }) {
  const barPct = bar !== undefined ? Math.min(Math.max(bar, 0), 100) : null;
  const barColor = barPct !== null ? (barPct >= barGood ? BRAND.green : barPct >= barGood * 0.6 ? BRAND.yellow : BRAND.red) : accent;
  return (
    <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, borderLeft: `3px solid ${accent}` }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color: BRAND.muted, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: BRAND.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: BRAND.dim }}>{sub}</div>}
      {barPct !== null && (
        <div style={{ height: 3, borderRadius: 2, background: BRAND.border, marginTop: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: barPct + '%', background: barColor, borderRadius: 2, transition: 'width .5s' }} />
        </div>
      )}
    </div>
  );
}

function RapBurgerLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="8" fill={BRAND.red} />
      <rect x="8" y="10" width="24" height="3" rx="1.5" fill={BRAND.yellow} />
      <rect x="6" y="15" width="28" height="3" rx="1.5" fill={BRAND.text} />
      <ellipse cx="20" cy="22" rx="14" ry="5" fill="#8B4513" />
      <rect x="6" y="25" width="28" height="3" rx="1.5" fill={BRAND.text} />
      <rect x="8" y="30" width="24" height="3" rx="1.5" fill="#c8a060" />
    </svg>
  );
}

// custom tooltip for charts
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0d0d0d', border: `1px solid ${BRAND.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
      <div style={{ color: BRAND.dim, marginBottom: 4, fontWeight: 700 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontFamily: 'monospace' }}>{p.name}: {typeof p.value === 'number' ? fmt(p.value) : p.value}</div>
      ))}
    </div>
  );
};

const VIEWS = ['🎵 Registrar día', '📋 Historial', '📈 Gráficos', '📑 Estado de Resultados', '👥 RRHH · Liquidaciones'];

export default function App() {
  const [view, setView]             = useState(0);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [date, setDate]             = useState(today());
  const [records, setRecords]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState(null);
  const [clock, setClock]           = useState('');
  const [delConfirm, setDelConfirm] = useState(null);
  const [perRange, setPerRange]     = useState(14);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, []);

  const showToast = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const keys = await window.storage.list('rb:');
      const all = await Promise.all(keys.keys.map(async k => {
        try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; }
      }));
      setRecords(all.filter(Boolean).sort((a, b) => b.date.localeCompare(a.date)));
    } catch { setRecords([]); }
    setLoading(false);
  }, []);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  useEffect(() => {
    const ex = records.find(r => r.date === date);
    setForm(ex ? { ...EMPTY_FORM, ...ex.form } : EMPTY_FORM);
  }, [date, records]);

  const saveDay = async () => {
    if (!num(form.ventasBrutas)) { showToast('Ingresa al menos las ventas brutas', 'err'); return; }
    setSaving(true);
    try {
      const ind = calcIndicadores(form);
      await window.storage.set('rb:' + date, JSON.stringify({ date, form, ind, savedAt: new Date().toISOString() }));
      showToast('🍔 Día guardado correctamente');
      await loadRecords();
    } catch { showToast('Error al guardar', 'err'); }
    setSaving(false);
  };

  const deleteDay = async (d) => {
    try { await window.storage.delete('rb:' + d); showToast('Registro eliminado'); setDelConfirm(null); await loadRecords(); }
    catch { showToast('Error al eliminar', 'err'); }
  };

  const ind = calcIndicadores(form);

  const exportCSV = () => {
    if (!records.length) return;
    const hdr = ['Fecha','VentasNetas','Clientes','Ticket','Compras','CostoVenta','CostoVenta%','MargenBruto','MargenBruto%','Sueldos%','GastosFijos%','EBITDA','EBITDA%','UtilidadNeta','FlujoCaja','DiasInventario','Rotacion','PuntoEquilibrio'];
    const rows = records.map(r => { const i = r.ind; return [r.date,i.ventasNetas,i.clientes,i.ticket.toFixed(0),i.compras,i.costoVenta,i.costoVentaPct.toFixed(1),i.margenBruto,i.mbPct.toFixed(1),i.sueldosPct.toFixed(1),i.gastosPct.toFixed(1),i.ebitda,i.ebitdaPct.toFixed(1),i.utilidadNeta,i.flujoCaja,i.diasInv.toFixed(1),i.rotacion.toFixed(2),i.puntoEquilibrio.toFixed(0)].join(','); });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([[hdr.join(','),...rows].join('\n')],{type:'text/csv'})); a.download='rapburger-historial.csv'; a.click();
    showToast('CSV exportado');
  };

  // ── STYLES ──
  const card = { background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: 18 };
  const grid  = cols => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${cols}px, 1fr))`, gap: 10 });
  const sTitle = { fontSize: 9, fontWeight: 800, letterSpacing: 2.5, color: BRAND.muted, textTransform: 'uppercase', margin: '20px 0 10px', paddingBottom: 8, borderBottom: `1px solid ${BRAND.border}` };
  const inp = { background: BRAND.dark, border: `1px solid ${BRAND.border}`, color: BRAND.text, padding: '8px 10px', borderRadius: 6, fontFamily: 'monospace', fontSize: 13, outline: 'none', width: '100%' };
  const btn = (bg = BRAND.red, color = '#fff') => ({ padding: '9px 20px', borderRadius: 6, fontSize: 12, fontWeight: 800, cursor: 'pointer', border: 'none', background: bg, color, fontFamily: 'inherit', letterSpacing: .5, textTransform: 'uppercase' });

  // ════════════════════════════════════════
  // VIEW 0: REGISTRAR
  // ════════════════════════════════════════
  const renderRegistrar = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 9, color: BRAND.muted, marginBottom: 4, fontWeight: 800, letterSpacing: 1.5 }}>FECHA</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, width: 'auto' }} />
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
          <button style={btn()} onClick={saveDay} disabled={saving}>{saving ? '⏳ Guardando…' : '💾 Guardar día'}</button>
          <button style={btn(BRAND.border, BRAND.text)} onClick={() => setForm(EMPTY_FORM)}>↺ Limpiar</button>
        </div>
        {records.find(r => r.date === date) &&
          <div style={{ marginTop: 20, fontSize: 11, color: BRAND.green, background: BRAND.green + '15', padding: '5px 12px', borderRadius: 6, fontWeight: 700 }}>✔ Este día ya tiene registro</div>}
      </div>

      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.red, marginBottom: 14, letterSpacing: 1, textTransform: 'uppercase' }}>📥 Datos de operación diaria</div>
        <div style={grid(185)}>
          {[
            ['ventasBrutas','Ventas Brutas ($)'],['descuentos','Descuentos / Devoluciones ($)'],
            ['numClientes','N° de Clientes'],['compras','Compras del día ($)'],
            ['inventarioInicial','Inventario Inicial ($)'],['inventarioFinal','Inventario Final ($)'],
            ['sueldos','Sueldos / Nómina ($)'],['gastosFijos','Gastos Fijos ($)'],
            ['depreciacion','Depreciación ($)'],['intereses','Intereses ($)'],
            ['otrosGastos','Otros Gastos ($)'],['impuestos','Impuestos ($)'],
            ['cobros','Cobros Efectivos ($)'],['pagos','Pagos Realizados ($)'],
          ].map(([id, label]) => (
            <div key={id}>
              <div style={{ fontSize: 9, color: BRAND.muted, marginBottom: 4, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
              <input type="number" step="1" placeholder="0" value={form[id]}
                onChange={e => setForm(p => ({ ...p, [id]: e.target.value }))} style={inp} />
            </div>
          ))}
        </div>
      </div>

      <div style={sTitle}>💰 Ventas & Operación</div>
      <div style={grid(175)}>
        <KpiCard label="Ventas Netas"     value={fmt(ind.ventasNetas)}  sub="ingreso real"                accent={BRAND.red}    />
        <KpiCard label="Ticket Promedio"  value={fmt(ind.ticket)}       sub={ind.clientes + ' clientes'}  accent={BRAND.blue}   />
        <KpiCard label="N° Clientes"      value={ind.clientes}          sub="personas atendidas"          accent={BRAND.blue}   />
        <KpiCard label="Compras"          value={fmt(ind.compras)}      sub="mercadería ingresada"        accent={BRAND.yellow} />
        <KpiCard label="Costo Venta Real" value={fmt(ind.costoVenta)}   sub={pctFmt(ind.costoVentaPct) + ' ventas'} accent={BRAND.red} />
      </div>

      <div style={sTitle}>📈 Márgenes & Rentabilidad</div>
      <div style={grid(200)}>
        <KpiCard label="Margen Bruto"       value={fmt(ind.margenBruto)}    sub={pctFmt(ind.mbPct)}        accent={BRAND.green}  bar={ind.mbPct}                   barGood={60} />
        <KpiCard label="Sueldos % ventas"   value={pctFmt(ind.sueldosPct)}  sub="Bench ≤ 30%"              accent={BRAND.yellow} bar={Math.max(0,100-ind.sueldosPct)} barGood={70} />
        <KpiCard label="Gastos Fijos %"     value={pctFmt(ind.gastosPct)}   sub="Bench ≤ 15%"              accent={BRAND.blue}   bar={Math.max(0,100-ind.gastosPct)}  barGood={85} />
        <KpiCard label="EBITDA"             value={fmt(ind.ebitda)}         sub={pctFmt(ind.ebitdaPct)}    accent={BRAND.green}  bar={Math.min(ind.ebitdaPct*3,100)} barGood={45} />
      </div>

      <div style={sTitle}>🏦 Caja & Inventario</div>
      <div style={grid(200)}>
        <KpiCard label="Flujo de Caja"       value={fmt(ind.flujoCaja)}                  sub={ind.flujoCaja >= 0 ? '✔ Positivo' : '⚠ Negativo'} accent={ind.flujoCaja >= 0 ? BRAND.green : BRAND.red} />
        <KpiCard label="Días de Inventario"  value={ind.diasInv.toFixed(1) + ' días'}    sub="Bench 5–10 días"                accent={BRAND.blue}   />
        <KpiCard label="Rotación Inventario" value={ind.rotacion.toFixed(2) + 'x'}       sub="veces / período"                accent={BRAND.yellow} />
        <KpiCard label="Punto de Equilibrio" value={fmt(ind.puntoEquilibrio)}            sub={'Avance: ' + Math.min(ind.avancePE,100).toFixed(1)+'%'} accent={BRAND.red} />
      </div>

      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.text, marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' }}>⚖️ Avance al Punto de Equilibrio</div>
        <div style={{ height: 14, borderRadius: 7, background: BRAND.border, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 7, transition: 'width .5s', width: Math.min(ind.avancePE, 100) + '%', background: ind.avancePE >= 100 ? BRAND.green : ind.avancePE >= 70 ? BRAND.yellow : BRAND.red }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: BRAND.dim }}>
          <span>$0</span>
          <span style={{ fontWeight: 800, color: BRAND.text, fontFamily:'monospace' }}>{Math.min(ind.avancePE, 100).toFixed(1)}% alcanzado</span>
          <span>PE: {fmt(ind.puntoEquilibrio)}</span>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: BRAND.dim }}>
          {ind.avancePE >= 100
            ? <span style={{ color: BRAND.green, fontWeight: 700 }}>✅ ¡Punto de equilibrio superado! Excedente: {fmt(ind.ventasNetas - ind.puntoEquilibrio)}</span>
            : ind.avancePE >= 70
            ? <span style={{ color: BRAND.yellow, fontWeight: 700 }}>⚡ Cerca. Faltan {fmt(ind.puntoEquilibrio - ind.ventasNetas)} en ventas.</span>
            : <span style={{ color: BRAND.red, fontWeight: 700 }}>⚠ Se necesitan {fmt(ind.puntoEquilibrio - ind.ventasNetas)} más en ventas.</span>}
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════
  // VIEW 1: HISTORIAL
  // ════════════════════════════════════════
  const renderHistorial = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: BRAND.text }}>{records.length} días registrados</div>
        <button style={btn(BRAND.border, BRAND.text)} onClick={exportCSV}>⬇ Exportar CSV</button>
      </div>

      {loading ? (
        <div style={{ ...card, textAlign: 'center', color: BRAND.muted, padding: 40 }}>Cargando historial…</div>
      ) : records.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: BRAND.muted, padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🍔</div>
          <div style={{ fontWeight: 700 }}>Aún no hay registros.</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Guarda tu primer día en "Registrar día".</div>
        </div>
      ) : (
        <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: BRAND.dark }}>
                  {['Fecha','Ventas Netas','Clientes','Ticket','Costo V.%','Margen B.%','Sueldos%','GF%','EBITDA%','Flujo Caja','PE %','Estado',''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', fontSize: 8, fontWeight: 800, letterSpacing: 1.5, color: BRAND.muted, textAlign: 'left', borderBottom: `1px solid ${BRAND.border}`, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const d = r.ind;
                  return (
                    <tr key={r.date} style={{ borderBottom: `1px solid ${BRAND.border}`, background: i % 2 === 0 ? BRAND.card : '#141414' }}>
                      <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 12, fontWeight: 800, color: BRAND.red, whiteSpace: 'nowrap' }}>{r.date}</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap', color: BRAND.text }}>{fmt(d.ventasNetas)}</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 12, color: BRAND.text }}>{d.clientes}</td>
                      <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap', color: BRAND.text }}>{fmt(d.ticket)}</td>
                      <td style={{ padding: '9px 12px' }}><Pill value={d.costoVentaPct} good={30} warn={38} invert /></td>
                      <td style={{ padding: '9px 12px' }}><Pill value={d.mbPct} good={65} warn={50} /></td>
                      <td style={{ padding: '9px 12px' }}><Pill value={d.sueldosPct} good={30} warn={38} invert /></td>
                      <td style={{ padding: '9px 12px' }}><Pill value={d.gastosPct} good={15} warn={25} invert /></td>
                      <td style={{ padding: '9px 12px' }}><Pill value={d.ebitdaPct} good={15} warn={5} /></td>
                      <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 12, color: d.flujoCaja >= 0 ? BRAND.green : BRAND.red, whiteSpace: 'nowrap' }}>{fmt(d.flujoCaja)}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ height: 6, width: 70, background: BRAND.border, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: Math.min(d.avancePE,100)+'%', background: d.avancePE>=100 ? BRAND.green : d.avancePE>=70 ? BRAND.yellow : BRAND.red, borderRadius: 3 }} />
                        </div>
                        <div style={{ fontSize: 9, color: BRAND.muted, marginTop: 2, fontFamily:'monospace' }}>{Math.min(d.avancePE,100).toFixed(0)}%</div>
                      </td>
                      <td style={{ padding: '9px 12px' }}><Pill value={d.ebitdaPct} good={15} warn={5} /></td>
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button style={{ ...btn(BRAND.border, BRAND.text), padding:'3px 8px', fontSize:10 }} onClick={() => { setDate(r.date); setView(0); }}>✏️</button>
                          <button style={{ ...btn(BRAND.red+'22', BRAND.red), padding:'3px 8px', fontSize:10 }} onClick={() => setDelConfirm(r.date)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {delConfirm && (
        <div style={{ position:'fixed', inset:0, background:'#000c', display:'grid', placeItems:'center', zIndex:200 }}>
          <div style={{ background: BRAND.card, border: `1px solid ${BRAND.red}`, borderRadius: 10, padding: 28, maxWidth: 320, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🗑️</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>¿Eliminar {delConfirm}?</div>
            <div style={{ fontSize: 12, color: BRAND.muted, marginBottom: 20 }}>Esta acción no se puede deshacer.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button style={btn(BRAND.red)} onClick={() => deleteDay(delConfirm)}>Eliminar</button>
              <button style={btn(BRAND.border, BRAND.text)} onClick={() => setDelConfirm(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════
  // VIEW 2: GRÁFICOS (Recharts)
  // ════════════════════════════════════════
  const renderGraficos = () => {
    const last = records.slice(0, perRange).reverse();
    if (last.length < 2) return (
      <div style={{ ...card, textAlign:'center', color: BRAND.muted, padding: 48 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📈</div>
        <div style={{ fontWeight: 700 }}>Necesitas al menos 2 días registrados.</div>
      </div>
    );

    const chartData = last.map(r => ({
      fecha: r.date.slice(5),
      ventas: r.ind.ventasNetas,
      costoVenta: r.ind.costoVenta,
      margenBruto: r.ind.margenBruto,
      ebitda: r.ind.ebitda,
      utilidadNeta: r.ind.utilidadNeta,
      flujoCaja: r.ind.flujoCaja,
      mbPct: r.ind.mbPct,
      sueldosPct: r.ind.sueldosPct,
      ebitdaPct: r.ind.ebitdaPct,
      gastosPct: r.ind.gastosPct,
      ticket: r.ind.ticket,
      clientes: r.ind.clientes,
    }));

    // composicion de costos promedio (para pie)
    const avgSum = (key) => last.reduce((s, r) => s + (r.ind[key] || 0), 0) / last.length;
    const pieData = [
      { name: 'Costo Venta', value: Math.max(avgSum('costoVenta'),0), color: BRAND.red },
      { name: 'Sueldos', value: Math.max(avgSum('sueldos'),0), color: BRAND.yellow },
      { name: 'Gastos Fijos', value: Math.max(avgSum('gastosFijos'),0), color: BRAND.blue },
      { name: 'Otros Gastos', value: Math.max(avgSum('otrosGastos'),0), color: BRAND.purple },
      { name: 'Utilidad Neta', value: Math.max(avgSum('utilidadNeta'),0), color: BRAND.green },
    ].filter(d => d.value > 0);

    const axisStyle = { fontSize: 10, fill: BRAND.muted, fontFamily: 'monospace' };

    return (
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: BRAND.text }}>Análisis visual — últimos {last.length} días</div>
          <div style={{ display:'flex', gap: 6 }}>
            {[7,14,30].map(n => (
              <button key={n} onClick={() => setPerRange(n)} style={{
                ...btn(perRange===n ? BRAND.red : BRAND.border, perRange===n ? '#fff' : BRAND.text),
                padding:'6px 14px', fontSize: 10
              }}>{n}D</button>
            ))}
          </div>
        </div>

        {/* VENTAS VS COSTO VENTA - composed */}
        <div style={sTitle}>Ventas Netas vs Costo de Venta</div>
        <div style={{ ...card, marginBottom: 16, height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} vertical={false} />
              <XAxis dataKey="fecha" tick={axisStyle} axisLine={{ stroke: BRAND.border }} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: BRAND.dim }} />
              <Bar dataKey="ventas" name="Ventas Netas" fill={BRAND.red} radius={[3,3,0,0]} />
              <Bar dataKey="costoVenta" name="Costo de Venta" fill={BRAND.yellow} radius={[3,3,0,0]} />
              <Line type="monotone" dataKey="margenBruto" name="Margen Bruto" stroke={BRAND.green} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* EBITDA & UTILIDAD NETA */}
        <div style={grid(380)}>
          <div>
            <div style={sTitle}>EBITDA vs Utilidad Neta</div>
            <div style={{ ...card, height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ebitdaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND.blue} stopOpacity={0.4}/>
                      <stop offset="100%" stopColor={BRAND.blue} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND.green} stopOpacity={0.4}/>
                      <stop offset="100%" stopColor={BRAND.green} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} vertical={false} />
                  <XAxis dataKey="fecha" tick={axisStyle} axisLine={{ stroke: BRAND.border }} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: BRAND.dim }} />
                  <Area type="monotone" dataKey="ebitda" name="EBITDA" stroke={BRAND.blue} fill="url(#ebitdaGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="utilidadNeta" name="Utilidad Neta" stroke={BRAND.green} fill="url(#netGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <div style={sTitle}>Composición de Costos (promedio)</div>
            <div style={{ ...card, height: 220, display:'flex', alignItems:'center' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: BRAND.dim }} layout="vertical" align="right" verticalAlign="middle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* % METRICS LINE CHART */}
        <div style={sTitle}>Márgenes en % — evolución</div>
        <div style={{ ...card, marginBottom: 16, height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} vertical={false} />
              <XAxis dataKey="fecha" tick={axisStyle} axisLine={{ stroke: BRAND.border }} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} unit="%" />
              <Tooltip content={<ChartTooltip />} formatter={(v) => v.toFixed(1)+'%'} />
              <Legend wrapperStyle={{ fontSize: 11, color: BRAND.dim }} />
              <Line type="monotone" dataKey="mbPct" name="Margen Bruto %" stroke={BRAND.green} strokeWidth={2} dot={{ r:3 }} />
              <Line type="monotone" dataKey="sueldosPct" name="Sueldos %" stroke={BRAND.yellow} strokeWidth={2} dot={{ r:3 }} />
              <Line type="monotone" dataKey="ebitdaPct" name="EBITDA %" stroke={BRAND.blue} strokeWidth={2} dot={{ r:3 }} />
              <Line type="monotone" dataKey="gastosPct" name="Gastos Fijos %" stroke={BRAND.purple} strokeWidth={2} dot={{ r:3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* TICKET & CLIENTES */}
        <div style={grid(380)}>
          <div>
            <div style={sTitle}>Ticket Promedio</div>
            <div style={{ ...card, height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} vertical={false} />
                  <XAxis dataKey="fecha" tick={axisStyle} axisLine={{ stroke: BRAND.border }} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="ticket" name="Ticket Promedio" stroke={BRAND.red} strokeWidth={2} dot={{ r:3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <div style={sTitle}>Flujo de Caja diario</div>
            <div style={{ ...card, height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} vertical={false} />
                  <XAxis dataKey="fecha" tick={axisStyle} axisLine={{ stroke: BRAND.border }} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="flujoCaja" name="Flujo de Caja" radius={[3,3,0,0]}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.flujoCaja >= 0 ? BRAND.green : BRAND.red} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ fontFamily:"'Inter','Helvetica Neue',sans-serif", background: BRAND.black, minHeight:'100vh', color: BRAND.text, fontSize:14 }}>

      <div style={{ background: BRAND.dark, borderBottom:`1px solid ${BRAND.border}`, padding:'0 20px', height:60, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <RapBurgerLogo size={36} />
          <div>
            <div style={{ fontWeight:900, fontSize:16, letterSpacing:-0.5, lineHeight:1 }}>RAP <span style={{ color: BRAND.red }}>BURGER</span></div>
            <div style={{ fontSize:9, color: BRAND.muted, letterSpacing:2, textTransform:'uppercase', fontWeight:700 }}>Control Financiero</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background: BRAND.green, boxShadow:`0 0 8px ${BRAND.green}` }} />
          <div style={{ fontFamily:'monospace', fontSize:11, color: BRAND.muted, background:'#1a1a1a', border:`1px solid ${BRAND.border}`, padding:'4px 12px', borderRadius:5 }}>{clock}</div>
        </div>
      </div>

      <div style={{ display:'flex', background: BRAND.dark, borderBottom:`1px solid ${BRAND.border}`, padding:'0 20px', gap:2, overflowX:'auto' }}>
        {VIEWS.map((v, i) => (
          <button key={v} onClick={() => setView(i)} style={{
            padding:'13px 16px', fontSize:11, fontWeight:800, cursor:'pointer', background:'none', border:'none',
            borderBottom: view===i ? `2px solid ${BRAND.red}` : '2px solid transparent',
            color: view===i ? BRAND.red : BRAND.muted, letterSpacing:.5, textTransform:'uppercase', whiteSpace:'nowrap'
          }}>{v}</button>
        ))}
      </div>

      <div style={{ padding:'16px 20px', maxWidth:1200, margin:'0 auto' }}>
        {view === 0 && renderRegistrar()}
        {view === 1 && renderHistorial()}
        {view === 2 && renderGraficos()}
        {view === 3 && <EstadoResultadosView ind={ind} records={records} date={date} card={card} sTitle={sTitle} btn={btn} />}
        {view === 4 && <RRHHView card={card} sTitle={sTitle} btn={btn} inp={inp} grid={grid} showToast={showToast} />}
      </div>

      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, zIndex:300, background: toast.type==='err' ? BRAND.red : BRAND.green, color:'#000', padding:'10px 20px', borderRadius:8, fontSize:13, fontWeight:800, boxShadow:'0 4px 24px #0009', letterSpacing:.5 }}>{toast.msg}</div>
      )}

      <style>{`
        input[type=number]::-webkit-inner-spin-button{opacity:.4}
        input:focus{border-color:${BRAND.red} !important;}
        *{box-sizing:border-box;margin:0;padding:0}
      `}</style>
    </div>
  );
}

// ════════════════════════════════════════
// COMPONENTE: ESTADO DE RESULTADOS
// ════════════════════════════════════════
function EstadoResultadosView({ ind, records, date, card, sTitle, btn }) {
  const BRAND = { red: '#E8191A', yellow: '#FFD000', card: '#181818', border: '#2a2a2a', muted: '#555555', dim: '#888888', text: '#F0F0F0', green: '#22c55e', blue: '#38bdf8' };
  const [periodo, setPeriodo] = useState('dia');

  const agg = (n) => {
    const slice = records.slice(0, n);
    if (slice.length === 0) return ind;
    const sum = (key) => slice.reduce((s, r) => s + (r.ind[key] || 0), 0);
    const ventasNetas = sum('ventasNetas');
    return {
      ventasBrutas: sum('ventasBrutas'), descuentos: sum('descuentos'), ventasNetas,
      costoVenta: sum('costoVenta'), margenBruto: sum('margenBruto'),
      sueldos: sum('sueldos'), gastosFijos: sum('gastosFijos'), otrosGastos: sum('otrosGastos'),
      depreciacion: sum('depreciacion'), intereses: sum('intereses'), impuestos: sum('impuestos'),
      utilidadOperativa: sum('utilidadOperativa'), ebitda: sum('ebitda'),
      resultadoAntesImp: sum('resultadoAntesImp'), utilidadNeta: sum('utilidadNeta'),
      mbPct: ventasNetas > 0 ? (sum('margenBruto')/ventasNetas)*100 : 0,
      ebitdaPct: ventasNetas > 0 ? (sum('ebitda')/ventasNetas)*100 : 0,
      margenNetoPct: ventasNetas > 0 ? (sum('utilidadNeta')/ventasNetas)*100 : 0,
    };
  };

  const data = periodo === 'dia' ? ind : periodo === '7d' ? agg(7) : periodo === '30d' ? agg(30) : agg(records.length);

  const Row = ({ label, value, bold, indent, color, border }) => (
    <div style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding: bold ? '12px 16px' : '8px 16px 8px ' + (indent ? '32px' : '16px'),
      borderTop: border ? `1px solid ${BRAND.border}` : 'none',
      background: bold ? '#1a1a1a' : 'transparent',
    }}>
      <span style={{ fontSize: bold ? 13 : 12, fontWeight: bold ? 800 : 500, color: color || (bold ? BRAND.text : BRAND.dim), textTransform: bold ? 'uppercase' : 'none', letterSpacing: bold ? .5 : 0 }}>{label}</span>
      <span style={{ fontFamily:'monospace', fontSize: bold ? 15 : 13, fontWeight: bold ? 800 : 600, color: color || BRAND.text }}>{fmt(value)}</span>
    </div>
  );

  const periodLabel = { dia: `Día ${date}`, '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', total: 'Histórico completo' }[periodo];

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16, flexWrap:'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: BRAND.text }}>📑 Estado de Resultados — {periodLabel}</div>
        <div style={{ display:'flex', gap: 6 }}>
          {[['dia','Día'],['7d','7 días'],['30d','30 días'],['total','Total']].map(([k,l]) => (
            <button key={k} onClick={() => setPeriodo(k)} style={{
              ...btn(periodo===k ? BRAND.red : BRAND.border, periodo===k ? '#fff' : BRAND.text),
              padding:'7px 14px', fontSize: 10
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ background: BRAND.card, border:`1px solid ${BRAND.border}`, borderRadius: 10, overflow:'hidden' }}>

        <Row label="Ventas Brutas" value={data.ventasBrutas} indent />
        <Row label="(–) Descuentos y Devoluciones" value={-data.descuentos} indent color={BRAND.red} />
        <Row label="VENTAS NETAS" value={data.ventasNetas} bold border color={BRAND.text} />

        <Row label="(–) Costo de Venta (CMV)" value={-data.costoVenta} indent color={BRAND.red} />
        <Row label="MARGEN BRUTO" value={data.margenBruto} bold border color={BRAND.green} />
        <div style={{ padding:'0 16px 10px 16px', fontSize: 10, color: BRAND.muted, fontFamily:'monospace' }}>margen: {pctFmt(data.mbPct)}</div>

        <Row label="(–) Sueldos y Nómina" value={-data.sueldos} indent color={BRAND.red} />
        <Row label="(–) Gastos Fijos (arriendo, luz, etc)" value={-data.gastosFijos} indent color={BRAND.red} />
        <Row label="(–) Otros Gastos Operativos" value={-data.otrosGastos} indent color={BRAND.red} />
        <Row label="UTILIDAD OPERATIVA (EBIT)" value={data.utilidadOperativa} bold border color={BRAND.blue} />

        <Row label="(+) Depreciación" value={data.depreciacion} indent color={BRAND.dim} />
        <Row label="EBITDA" value={data.ebitda} bold border color={BRAND.yellow} />
        <div style={{ padding:'0 16px 10px 16px', fontSize: 10, color: BRAND.muted, fontFamily:'monospace' }}>margen EBITDA: {pctFmt(data.ebitdaPct)}</div>

        <Row label="(–) Intereses Financieros" value={-data.intereses} indent color={BRAND.red} />
        <Row label="RESULTADO ANTES DE IMPUESTOS" value={data.resultadoAntesImp} bold border />

        <Row label="(–) Impuestos" value={-data.impuestos} indent color={BRAND.red} />
        <Row label="UTILIDAD NETA" value={data.utilidadNeta} bold border color={data.utilidadNeta >= 0 ? BRAND.green : BRAND.red} />
        <div style={{ padding:'0 16px 16px 16px', fontSize: 11, color: BRAND.muted, fontFamily:'monospace' }}>margen neto: {pctFmt(data.margenNetoPct)}</div>
      </div>

      {/* RESUMEN VISUAL */}
      <div style={sTitle}>Resumen de rentabilidad</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px,1fr))', gap: 10 }}>
        <div style={{ ...card, borderLeft:`3px solid ${BRAND.green}` }}>
          <div style={{ fontSize:9, color:BRAND.muted, letterSpacing:1.5, textTransform:'uppercase', fontWeight:800, marginBottom:6 }}>Margen Bruto %</div>
          <div style={{ fontFamily:'monospace', fontSize:22, fontWeight:700, color:BRAND.green }}>{pctFmt(data.mbPct)}</div>
        </div>
        <div style={{ ...card, borderLeft:`3px solid ${BRAND.yellow}` }}>
          <div style={{ fontSize:9, color:BRAND.muted, letterSpacing:1.5, textTransform:'uppercase', fontWeight:800, marginBottom:6 }}>Margen EBITDA %</div>
          <div style={{ fontFamily:'monospace', fontSize:22, fontWeight:700, color:BRAND.yellow }}>{pctFmt(data.ebitdaPct)}</div>
        </div>
        <div style={{ ...card, borderLeft:`3px solid ${data.margenNetoPct>=0?BRAND.green:BRAND.red}` }}>
          <div style={{ fontSize:9, color:BRAND.muted, letterSpacing:1.5, textTransform:'uppercase', fontWeight:800, marginBottom:6 }}>Margen Neto %</div>
          <div style={{ fontFamily:'monospace', fontSize:22, fontWeight:700, color:data.margenNetoPct>=0?BRAND.green:BRAND.red }}>{pctFmt(data.margenNetoPct)}</div>
        </div>
        <div style={{ ...card, borderLeft:`3px solid ${BRAND.blue}` }}>
          <div style={{ fontSize:9, color:BRAND.muted, letterSpacing:1.5, textTransform:'uppercase', fontWeight:800, marginBottom:6 }}>Utilidad Neta</div>
          <div style={{ fontFamily:'monospace', fontSize:22, fontWeight:700, color:data.utilidadNeta>=0?BRAND.green:BRAND.red }}>{fmt(data.utilidadNeta)}</div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// COMPONENTE: RRHH · LIQUIDACIONES DE SUELDO
// ════════════════════════════════════════════════════════
function RRHHView({ card, sTitle, btn, inp, grid, showToast }) {
  const BRAND = { red:'#E8191A', yellow:'#FFD000', card:'#181818', border:'#2a2a2a', muted:'#555555', dim:'#888888', text:'#F0F0F0', green:'#22c55e', blue:'#38bdf8', purple:'#a78bfa' };
  const [tab, setTab]                 = useState('lista'); // lista | nueva | resumen | parametros
  const [empleados, setEmpleados]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [form, setForm]               = useState(EMPTY_EMPLEADO);
  const [editId, setEditId]           = useState(null);
  const [periodo, setPeriodo]         = useState(new Date().toISOString().slice(0,7)); // YYYY-MM
  const [params, setParams]           = useState(PARAM_LEGAL);
  const [delConfirm, setDelConfirm]   = useState(null);

  const loadEmpleados = useCallback(async () => {
    setLoading(true);
    try {
      const keys = await window.storage.list('liq:');
      const all = await Promise.all(keys.keys.map(async k => {
        try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; }
      }));
      setEmpleados(all.filter(Boolean).filter(e => e.periodo === periodo).sort((a,b)=>a.form.nombre.localeCompare(b.form.nombre)));
    } catch { setEmpleados([]); }
    setLoading(false);
  }, [periodo]);

  useEffect(() => { loadEmpleados(); }, [loadEmpleados]);

  // load saved legal params (persisted)
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get('rb-params:legal');
        if (r) setParams({ ...PARAM_LEGAL, ...JSON.parse(r.value) });
      } catch {}
    })();
  }, []);

  const saveParams = async () => {
    try { await window.storage.set('rb-params:legal', JSON.stringify(params)); showToast('Parámetros legales actualizados'); }
    catch { showToast('Error al guardar parámetros', 'err'); }
  };

  const saveEmpleado = async () => {
    if (!form.nombre || !num(form.sueldoBase)) { showToast('Ingresa nombre y sueldo base', 'err'); return; }
    try {
      const id = editId || ('emp_' + Date.now());
      const liq = calcLiquidacion(form, params);
      await window.storage.set('liq:' + periodo + ':' + id, JSON.stringify({ id, periodo, form, liq, savedAt: new Date().toISOString() }));
      showToast('🍔 Liquidación guardada');
      setForm(EMPTY_EMPLEADO); setEditId(null); setTab('lista');
      await loadEmpleados();
    } catch { showToast('Error al guardar', 'err'); }
  };

  const editEmpleado = (emp) => { setForm(emp.form); setEditId(emp.id); setTab('nueva'); };

  const deleteEmpleado = async (id) => {
    try { await window.storage.delete('liq:' + periodo + ':' + id); showToast('Eliminado'); setDelConfirm(null); await loadEmpleados(); }
    catch { showToast('Error al eliminar', 'err'); }
  };

  const liqPreview = calcLiquidacion(form, params);

  // ── RESUMEN TOTALES ──
  const totales = empleados.reduce((acc, e) => {
    const l = e.liq;
    acc.totalHaberes += l.totalHaberes;
    acc.totalLiquido += l.sueldoLiquido;
    acc.dscAfp += l.dscAfpTotal;
    acc.dscSalud += l.dscSalud;
    acc.dscAfc += l.dscAfcTrabajador;
    acc.impuesto += l.impuestoUnico;
    acc.aporteAfc += l.aporteAfcEmpleador;
    acc.aporteSis += l.aporteSis;
    acc.aporteMutual += l.aporteMutual;
    acc.totalImposiciones += l.totalImposicionesAPagar;
    acc.costoEmpresa += l.costoTotalEmpresa;
    return acc;
  }, { totalHaberes:0, totalLiquido:0, dscAfp:0, dscSalud:0, dscAfc:0, impuesto:0, aporteAfc:0, aporteSis:0, aporteMutual:0, totalImposiciones:0, costoEmpresa:0 });

  const subtabBtn = (active) => ({
    padding:'8px 16px', fontSize:11, fontWeight:800, cursor:'pointer', border:'none',
    background: active ? BRAND.red : BRAND.border, color: active ? '#fff' : BRAND.text,
    borderRadius:6, letterSpacing:.5, textTransform:'uppercase'
  });

  const Row = ({ label, value, bold, indent, color, border, sub }) => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding: bold ? '10px 14px' : '7px 14px 7px ' + (indent?'28px':'14px'), borderTop: border ? `1px solid ${BRAND.border}` : 'none', background: bold ? '#1a1a1a' : 'transparent' }}>
      <span style={{ fontSize: bold?12:11.5, fontWeight: bold?800:500, color: color || (bold?BRAND.text:BRAND.dim), textTransform: bold?'uppercase':'none' }}>{label}{sub && <span style={{ fontSize:9, color:BRAND.muted, marginLeft:6 }}>{sub}</span>}</span>
      <span style={{ fontFamily:'monospace', fontSize: bold?14:12.5, fontWeight: bold?800:600, color: color || BRAND.text }}>{fmt(value)}</span>
    </div>
  );

  // ════════ TAB: LISTA ════════
  const renderLista = () => (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:9, color:BRAND.muted, fontWeight:800, letterSpacing:1.5 }}>PERÍODO</span>
          <input type="month" value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{ ...inp, width:'auto' }} />
        </div>
        <button style={btn()} onClick={() => { setForm(EMPTY_EMPLEADO); setEditId(null); setTab('nueva'); }}>+ Nueva liquidación</button>
      </div>

      {loading ? (
        <div style={{ ...card, textAlign:'center', color:BRAND.muted, padding:40 }}>Cargando…</div>
      ) : empleados.length === 0 ? (
        <div style={{ ...card, textAlign:'center', color:BRAND.muted, padding:48 }}>
          <div style={{ fontSize:32, marginBottom:12 }}>👥</div>
          <div style={{ fontWeight:700 }}>Sin liquidaciones para {periodo}.</div>
          <div style={{ fontSize:12, marginTop:6 }}>Crea la primera liquidación del mes.</div>
        </div>
      ) : (
        <div style={{ background:BRAND.card, border:`1px solid ${BRAND.border}`, borderRadius:8, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#111' }}>
                  {['Trabajador','Cargo','Contrato','Total Haberes','Total Desc.','Líquido a Pago','Imposiciones',''].map(h => (
                    <th key={h} style={{ padding:'10px 12px', fontSize:8, fontWeight:800, letterSpacing:1.5, color:BRAND.muted, textAlign:'left', borderBottom:`1px solid ${BRAND.border}`, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {empleados.map((e,i) => {
                  const l = e.liq;
                  return (
                    <tr key={e.id} style={{ borderBottom:`1px solid ${BRAND.border}`, background: i%2===0?BRAND.card:'#141414' }}>
                      <td style={{ padding:'9px 12px', fontSize:12, fontWeight:700, color:BRAND.text, whiteSpace:'nowrap' }}>{e.form.nombre}</td>
                      <td style={{ padding:'9px 12px', fontSize:11, color:BRAND.dim }}>{e.form.cargo || '—'}</td>
                      <td style={{ padding:'9px 12px', fontSize:10 }}>
                        <span style={{ padding:'2px 8px', borderRadius:4, background: e.form.tipoContrato==='indefinido'?BRAND.blue+'22':BRAND.yellow+'22', color: e.form.tipoContrato==='indefinido'?BRAND.blue:BRAND.yellow, fontWeight:700 }}>
                          {e.form.tipoContrato==='indefinido'?'Indefinido':'Plazo Fijo'}
                        </span>
                      </td>
                      <td style={{ padding:'9px 12px', fontFamily:'monospace', fontSize:12 }}>{fmt(l.totalHaberes)}</td>
                      <td style={{ padding:'9px 12px', fontFamily:'monospace', fontSize:12, color:BRAND.red }}>{fmt(l.totalDescuentos)}</td>
                      <td style={{ padding:'9px 12px', fontFamily:'monospace', fontSize:13, fontWeight:800, color:BRAND.green }}>{fmt(l.sueldoLiquido)}</td>
                      <td style={{ padding:'9px 12px', fontFamily:'monospace', fontSize:12, color:BRAND.yellow }}>{fmt(l.totalImposicionesAPagar)}</td>
                      <td style={{ padding:'9px 12px' }}>
                        <div style={{ display:'flex', gap:5 }}>
                          <button style={{ ...btn(BRAND.border, BRAND.text), padding:'3px 8px', fontSize:10 }} onClick={()=>editEmpleado(e)}>✏️</button>
                          <button style={{ ...btn(BRAND.red+'22', BRAND.red), padding:'3px 8px', fontSize:10 }} onClick={()=>setDelConfirm(e.id)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {delConfirm && (
        <div style={{ position:'fixed', inset:0, background:'#000c', display:'grid', placeItems:'center', zIndex:200 }}>
          <div style={{ background:BRAND.card, border:`1px solid ${BRAND.red}`, borderRadius:10, padding:28, maxWidth:320, textAlign:'center' }}>
            <div style={{ fontSize:28, marginBottom:8 }}>🗑️</div>
            <div style={{ fontSize:14, fontWeight:800, marginBottom:8 }}>¿Eliminar esta liquidación?</div>
            <div style={{ fontSize:12, color:BRAND.muted, marginBottom:20 }}>Esta acción no se puede deshacer.</div>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button style={btn(BRAND.red)} onClick={()=>deleteEmpleado(delConfirm)}>Eliminar</button>
              <button style={btn(BRAND.border, BRAND.text)} onClick={()=>setDelConfirm(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ════════ TAB: NUEVA / EDITAR LIQUIDACIÓN ════════
  const renderNueva = () => (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:800 }}>{editId ? '✏️ Editando liquidación' : '➕ Nueva liquidación'} — {periodo}</div>
        <button style={btn(BRAND.border, BRAND.text)} onClick={()=>{ setForm(EMPTY_EMPLEADO); setEditId(null); setTab('lista'); }}>← Volver a lista</button>
      </div>

      {/* DATOS DEL TRABAJADOR */}
      <div style={card}>
        <div style={{ fontSize:11, fontWeight:800, color:BRAND.red, marginBottom:14, letterSpacing:1, textTransform:'uppercase' }}>👤 Datos del trabajador</div>
        <div style={grid(185)}>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>NOMBRE COMPLETO</div>
            <input type="text" placeholder="Juan Pérez" value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>RUT</div>
            <input type="text" placeholder="12.345.678-9" value={form.rut} onChange={e=>setForm(p=>({...p,rut:e.target.value}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>CARGO</div>
            <input type="text" placeholder="Cocinero / Cajero / etc" value={form.cargo} onChange={e=>setForm(p=>({...p,cargo:e.target.value}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>TIPO DE CONTRATO</div>
            <select value={form.tipoContrato} onChange={e=>setForm(p=>({...p,tipoContrato:e.target.value}))} style={inp}>
              <option value="indefinido">Indefinido</option>
              <option value="plazofijo">Plazo Fijo</option>
            </select></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>SISTEMA DE SALUD</div>
            <select value={form.salud} onChange={e=>setForm(p=>({...p,salud:e.target.value}))} style={inp}>
              <option value="fonasa">Fonasa (7%)</option>
              <option value="isapre">Isapre</option>
            </select></div>
          {form.salud === 'isapre' &&
            <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>PLAN ISAPRE (UF)</div>
              <input type="number" step="0.01" placeholder="0.00" value={form.planIsapreUF} onChange={e=>setForm(p=>({...p,planIsapreUF:e.target.value}))} style={inp} /></div>}
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>COMISIÓN AFP (%)</div>
            <input type="number" step="0.01" placeholder="0.58" value={form.afpComision} onChange={e=>setForm(p=>({...p,afpComision:e.target.value}))} style={inp} /></div>
        </div>
      </div>

      {/* HABERES */}
      <div style={sTitle}>💵 Haberes (días y horas trabajadas)</div>
      <div style={card}>
        <div style={grid(185)}>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>SUELDO BASE MENSUAL ($)</div>
            <input type="number" placeholder="539000" value={form.sueldoBase} onChange={e=>setForm(p=>({...p,sueldoBase:e.target.value}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>DÍAS TRABAJADOS (de 30)</div>
            <input type="number" placeholder="30" value={form.diasTrabajados} onChange={e=>setForm(p=>({...p,diasTrabajados:e.target.value}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>HORAS EXTRA</div>
            <input type="number" placeholder="0" value={form.horasExtra} onChange={e=>setForm(p=>({...p,horasExtra:e.target.value}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>VALOR HORA EXTRA ($)</div>
            <input type="number" placeholder="0" value={form.valorHoraExtra} onChange={e=>setForm(p=>({...p,valorHoraExtra:e.target.value}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>GRATIFICACIÓN LEGAL ($)</div>
            <input type="number" placeholder="0" value={form.gratificacion} onChange={e=>setForm(p=>({...p,gratificacion:e.target.value}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>BONOS / INCENTIVOS ($)</div>
            <input type="number" placeholder="0" value={form.bonos} onChange={e=>setForm(p=>({...p,bonos:e.target.value}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>COMISIONES ($)</div>
            <input type="number" placeholder="0" value={form.comisiones} onChange={e=>setForm(p=>({...p,comisiones:e.target.value}))} style={inp} /></div>
        </div>
      </div>

      <div style={sTitle}>🍔 Haberes no imponibles</div>
      <div style={card}>
        <div style={grid(185)}>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>COLACIÓN ($)</div>
            <input type="number" placeholder="0" value={form.colacion} onChange={e=>setForm(p=>({...p,colacion:e.target.value}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>MOVILIZACIÓN ($)</div>
            <input type="number" placeholder="0" value={form.movilizacion} onChange={e=>setForm(p=>({...p,movilizacion:e.target.value}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>ASIGNACIÓN FAMILIAR ($)</div>
            <input type="number" placeholder="0" value={form.asignacionFamiliar} onChange={e=>setForm(p=>({...p,asignacionFamiliar:e.target.value}))} style={inp} /></div>
        </div>
      </div>

      <div style={sTitle}>➖ Otros descuentos</div>
      <div style={card}>
        <div style={grid(185)}>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>ANTICIPOS DE SUELDO ($)</div>
            <input type="number" placeholder="0" value={form.anticipos} onChange={e=>setForm(p=>({...p,anticipos:e.target.value}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>OTROS DESCUENTOS ($)</div>
            <input type="number" placeholder="0" value={form.otrosDescuentos} onChange={e=>setForm(p=>({...p,otrosDescuentos:e.target.value}))} style={inp} /></div>
        </div>
      </div>

      {/* PREVIEW LIQUIDACIÓN */}
      <div style={sTitle}>📄 Vista previa de la liquidación de sueldo</div>
      <div style={{ background:BRAND.card, border:`1px solid ${BRAND.border}`, borderRadius:10, overflow:'hidden' }}>
        <div style={{ padding:'14px 14px 8px', borderBottom:`1px solid ${BRAND.border}` }}>
          <div style={{ fontSize:13, fontWeight:800 }}>{form.nombre || 'Nombre del trabajador'}</div>
          <div style={{ fontSize:11, color:BRAND.muted }}>{form.cargo || 'Cargo'} · {form.rut || 'RUT'} · Período {periodo} · {form.tipoContrato === 'indefinido' ? 'Contrato Indefinido' : 'Contrato a Plazo Fijo'}</div>
        </div>

        <div style={{ fontSize:10, fontWeight:800, color:BRAND.green, padding:'10px 14px 2px', letterSpacing:1, textTransform:'uppercase' }}>Haberes imponibles</div>
        <Row label="Sueldo base (proporcional)" value={liqPreview.sueldoProporcional} indent sub={`${form.diasTrabajados||30}/30 días`} />
        {liqPreview.pagoHorasExtra > 0 && <Row label="Horas extra" value={liqPreview.pagoHorasExtra} indent sub={`${form.horasExtra||0} hrs`} />}
        {liqPreview.gratificacion > 0 && <Row label="Gratificación legal" value={liqPreview.gratificacion} indent />}
        {liqPreview.bonos > 0 && <Row label="Bonos / incentivos" value={liqPreview.bonos} indent />}
        {liqPreview.comisiones > 0 && <Row label="Comisiones" value={liqPreview.comisiones} indent />}
        <Row label="Total Imponible" value={liqPreview.totalImponible} bold border />

        <div style={{ fontSize:10, fontWeight:800, color:BRAND.blue, padding:'10px 14px 2px', letterSpacing:1, textTransform:'uppercase' }}>Haberes no imponibles</div>
        {liqPreview.colacion > 0 && <Row label="Colación" value={liqPreview.colacion} indent />}
        {liqPreview.movilizacion > 0 && <Row label="Movilización" value={liqPreview.movilizacion} indent />}
        {liqPreview.asigFamiliar > 0 && <Row label="Asignación familiar" value={liqPreview.asigFamiliar} indent />}
        <Row label="Total No Imponible" value={liqPreview.totalNoImponible} bold border />

        <Row label="TOTAL HABERES" value={liqPreview.totalHaberes} bold border color={BRAND.text} />

        <div style={{ fontSize:10, fontWeight:800, color:BRAND.red, padding:'10px 14px 2px', letterSpacing:1, textTransform:'uppercase' }}>Descuentos legales</div>
        <Row label={`AFP (${PARAM_LEGAL.AFP_TASA}% + ${form.afpComision||PARAM_LEGAL.AFP_COMISION_DEFAULT}% comisión)`} value={-liqPreview.dscAfpTotal} indent color={BRAND.red} />
        <Row label={`Salud (${form.salud==='isapre'?'Isapre':'Fonasa 7%'})`} value={-liqPreview.dscSalud} indent color={BRAND.red} />
        {liqPreview.dscAfcTrabajador > 0 && <Row label="Seguro Cesantía (0,6%)" value={-liqPreview.dscAfcTrabajador} indent color={BRAND.red} />}
        <Row label="Impuesto Único 2ª Categoría" value={-liqPreview.impuestoUnico} indent color={BRAND.red} />
        {liqPreview.anticipos > 0 && <Row label="Anticipos" value={-liqPreview.anticipos} indent color={BRAND.red} />}
        {liqPreview.otrosDesc > 0 && <Row label="Otros descuentos" value={-liqPreview.otrosDesc} indent color={BRAND.red} />}
        <Row label="TOTAL DESCUENTOS" value={-liqPreview.totalDescuentos} bold border color={BRAND.red} />

        <Row label="SUELDO LÍQUIDO A PAGO" value={liqPreview.sueldoLiquido} bold border color={BRAND.green} />

        <div style={{ fontSize:10, fontWeight:800, color:BRAND.yellow, padding:'10px 14px 2px', letterSpacing:1, textTransform:'uppercase' }}>Aportes del empleador (costo adicional)</div>
        <Row label="AFC Empleador" value={liqPreview.aporteAfcEmpleador} indent color={BRAND.dim} sub={form.tipoContrato==='indefinido' ? '2,4%' : '3,0%'} />
        <Row label="SIS (Seguro Invalidez y Sobrevivencia)" value={liqPreview.aporteSis} indent color={BRAND.dim} sub="1,49%" />
        <Row label="Mutual (Ley 16.744)" value={liqPreview.aporteMutual} indent color={BRAND.dim} sub="0,90% básica" />
        <Row label="TOTAL APORTES EMPLEADOR" value={liqPreview.totalAportesEmpleador} bold border color={BRAND.yellow} />

        <Row label="COSTO TOTAL EMPRESA" value={liqPreview.costoTotalEmpresa} bold border color={BRAND.text} />
        <Row label="TOTAL IMPOSICIONES A PAGAR (Previred)" value={liqPreview.totalImposicionesAPagar} bold color={BRAND.purple} />
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16, gap:8 }}>
        <button style={btn()} onClick={saveEmpleado}>💾 {editId ? 'Actualizar' : 'Guardar'} liquidación</button>
      </div>
    </div>
  );

  // ════════ TAB: RESUMEN GENERAL ════════
  const renderResumen = () => (
    <div>
      <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>📊 Cuadro Resumen — Imposiciones {periodo} ({empleados.length} trabajadores)</div>

      {empleados.length === 0 ? (
        <div style={{ ...card, textAlign:'center', color:BRAND.muted, padding:48 }}>No hay liquidaciones registradas para este período.</div>
      ) : (
        <>
          <div style={grid(180)}>
            <div style={{ ...card, borderLeft:`3px solid ${BRAND.text}` }}>
              <div style={{ fontSize:9, color:BRAND.muted, fontWeight:800, letterSpacing:1.5, marginBottom:6 }}>TOTAL HABERES</div>
              <div style={{ fontFamily:'monospace', fontSize:20, fontWeight:700, color:BRAND.text }}>{fmt(totales.totalHaberes)}</div>
            </div>
            <div style={{ ...card, borderLeft:`3px solid ${BRAND.green}` }}>
              <div style={{ fontSize:9, color:BRAND.muted, fontWeight:800, letterSpacing:1.5, marginBottom:6 }}>TOTAL LÍQUIDOS A PAGAR</div>
              <div style={{ fontFamily:'monospace', fontSize:20, fontWeight:700, color:BRAND.green }}>{fmt(totales.totalLiquido)}</div>
            </div>
            <div style={{ ...card, borderLeft:`3px solid ${BRAND.purple}` }}>
              <div style={{ fontSize:9, color:BRAND.muted, fontWeight:800, letterSpacing:1.5, marginBottom:6 }}>TOTAL IMPOSICIONES (PREVIRED)</div>
              <div style={{ fontFamily:'monospace', fontSize:20, fontWeight:700, color:BRAND.purple }}>{fmt(totales.totalImposiciones)}</div>
            </div>
            <div style={{ ...card, borderLeft:`3px solid ${BRAND.yellow}` }}>
              <div style={{ fontSize:9, color:BRAND.muted, fontWeight:800, letterSpacing:1.5, marginBottom:6 }}>COSTO TOTAL EMPRESA</div>
              <div style={{ fontFamily:'monospace', fontSize:20, fontWeight:700, color:BRAND.yellow }}>{fmt(totales.costoEmpresa)}</div>
            </div>
          </div>

          <div style={sTitle}>Detalle de imposiciones a pagar (consolidado para Previred)</div>
          <div style={{ background:BRAND.card, border:`1px solid ${BRAND.border}`, borderRadius:8, overflow:'hidden' }}>
            <Row label="AFP (cotización + comisión) — trabajadores" value={totales.dscAfp} indent />
            <Row label="Salud (Fonasa / Isapre) — trabajadores" value={totales.dscSalud} indent />
            <Row label="Seguro de Cesantía — trabajadores" value={totales.dscAfc} indent />
            <Row label="Impuesto Único 2ª Categoría (al Fisco, no Previred)" value={totales.impuesto} indent color={BRAND.dim} />
            <Row label="Seguro de Cesantía — aporte empleador" value={totales.aporteAfc} indent />
            <Row label="SIS — aporte empleador" value={totales.aporteSis} indent />
            <Row label="Mutual (Ley 16.744) — aporte empleador" value={totales.aporteMutual} indent />
            <Row label="TOTAL A PAGAR EN PREVIRED" value={totales.totalImposiciones} bold border color={BRAND.purple} />
          </div>

          <div style={sTitle}>Detalle por trabajador</div>
          <div style={{ background:BRAND.card, border:`1px solid ${BRAND.border}`, borderRadius:8, overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#111' }}>
                    {['Trabajador','AFP','Salud','AFC Trab.','Impuesto','AFC Emp.','SIS','Mutual','Total Imposiciones'].map(h=>(
                      <th key={h} style={{ padding:'8px 10px', fontSize:8, fontWeight:800, color:BRAND.muted, textAlign:'left', borderBottom:`1px solid ${BRAND.border}`, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {empleados.map((e,i) => {
                    const l = e.liq;
                    return (
                      <tr key={e.id} style={{ borderBottom:`1px solid ${BRAND.border}`, background:i%2===0?BRAND.card:'#141414' }}>
                        <td style={{ padding:'8px 10px', fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>{e.form.nombre}</td>
                        <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:11 }}>{fmtShort(l.dscAfpTotal)}</td>
                        <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:11 }}>{fmtShort(l.dscSalud)}</td>
                        <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:11 }}>{fmtShort(l.dscAfcTrabajador)}</td>
                        <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:11, color:BRAND.dim }}>{fmtShort(l.impuestoUnico)}</td>
                        <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:11 }}>{fmtShort(l.aporteAfcEmpleador)}</td>
                        <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:11 }}>{fmtShort(l.aporteSis)}</td>
                        <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:11 }}>{fmtShort(l.aporteMutual)}</td>
                        <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:12, fontWeight:800, color:BRAND.purple }}>{fmt(l.totalImposicionesAPagar)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ════════ TAB: PARÁMETROS LEGALES ════════
  const renderParametros = () => (
    <div>
      <div style={{ fontSize:13, fontWeight:800, marginBottom:6 }}>⚙️ Parámetros legales vigentes</div>
      <div style={{ fontSize:11, color:BRAND.muted, marginBottom:16 }}>
        Valores referenciales Chile 2026 (Dirección del Trabajo / Previred / Superintendencia de Pensiones). Actualízalos cuando cambien oficialmente.
      </div>
      <div style={card}>
        <div style={grid(220)}>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>VALOR UF ($)</div>
            <input type="number" value={params.UF} onChange={e=>setParams(p=>({...p,UF:num(e.target.value)}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>INGRESO MÍNIMO MENSUAL ($)</div>
            <input type="number" value={params.IMM} onChange={e=>setParams(p=>({...p,IMM:num(e.target.value)}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>TOPE IMPONIBLE AFP/SALUD (UF)</div>
            <input type="number" step="0.1" value={params.TOPE_AFP_SALUD_UF} onChange={e=>setParams(p=>({...p,TOPE_AFP_SALUD_UF:num(e.target.value)}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>TOPE IMPONIBLE AFC (UF)</div>
            <input type="number" step="0.1" value={params.TOPE_AFC_UF} onChange={e=>setParams(p=>({...p,TOPE_AFC_UF:num(e.target.value)}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>AFP OBLIGATORIO (%)</div>
            <input type="number" step="0.01" value={params.AFP_TASA} onChange={e=>setParams(p=>({...p,AFP_TASA:num(e.target.value)}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>SALUD (%)</div>
            <input type="number" step="0.01" value={params.SALUD_TASA} onChange={e=>setParams(p=>({...p,SALUD_TASA:num(e.target.value)}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>AFC TRABAJADOR INDEF. (%)</div>
            <input type="number" step="0.01" value={params.AFC_TRABAJADOR_INDEFINIDO} onChange={e=>setParams(p=>({...p,AFC_TRABAJADOR_INDEFINIDO:num(e.target.value)}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>AFC EMPLEADOR INDEF. (%)</div>
            <input type="number" step="0.01" value={params.AFC_EMPLEADOR_INDEFINIDO} onChange={e=>setParams(p=>({...p,AFC_EMPLEADOR_INDEFINIDO:num(e.target.value)}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>AFC EMPLEADOR PLAZO FIJO (%)</div>
            <input type="number" step="0.01" value={params.AFC_EMPLEADOR_PLAZOFIJO} onChange={e=>setParams(p=>({...p,AFC_EMPLEADOR_PLAZOFIJO:num(e.target.value)}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>SIS EMPLEADOR (%)</div>
            <input type="number" step="0.01" value={params.SIS_EMPLEADOR} onChange={e=>setParams(p=>({...p,SIS_EMPLEADOR:num(e.target.value)}))} style={inp} /></div>
          <div><div style={{ fontSize:9, color:BRAND.muted, marginBottom:4, fontWeight:700 }}>MUTUAL BÁSICA (%)</div>
            <input type="number" step="0.01" value={params.MUTUAL_BASICA} onChange={e=>setParams(p=>({...p,MUTUAL_BASICA:num(e.target.value)}))} style={inp} /></div>
        </div>
        <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end' }}>
          <button style={btn()} onClick={saveParams}>💾 Guardar parámetros</button>
        </div>
      </div>

      <div style={{ ...card, marginTop:14, fontSize:11, color:BRAND.dim, lineHeight:1.6 }}>
        <strong style={{ color:BRAND.text }}>📌 Notas legales:</strong><br/>
        • El Impuesto Único de 2ª Categoría se calcula con la tabla progresiva vigente en UTM sobre la base tributable mensual.<br/>
        • El Seguro de Cesantía (AFC) solo lo aporta el trabajador en contratos indefinidos; en plazo fijo el empleador aporta 3% y el trabajador no cotiza.<br/>
        • El SIS (Seguro de Invalidez y Sobrevivencia) es 100% de cargo del empleador desde 2009.<br/>
        • La tasa de Mutual puede variar según el rubro y siniestralidad de la empresa (0,90% básica + adicional diferenciado).<br/>
        • Verifica siempre los valores actualizados en <strong style={{ color:BRAND.text }}>previred.com</strong> y <strong style={{ color:BRAND.text }}>dt.gob.cl</strong> antes de declarar.
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display:'flex', gap:6, marginBottom:18, flexWrap:'wrap' }}>
        <button style={subtabBtn(tab==='lista')} onClick={()=>setTab('lista')}>📋 Lista</button>
        <button style={subtabBtn(tab==='nueva')} onClick={()=>setTab('nueva')}>➕ Nueva / Editar</button>
        <button style={subtabBtn(tab==='resumen')} onClick={()=>setTab('resumen')}>📊 Resumen Imposiciones</button>
        <button style={subtabBtn(tab==='parametros')} onClick={()=>setTab('parametros')}>⚙️ Parámetros</button>
      </div>
      {tab === 'lista' && renderLista()}
      {tab === 'nueva' && renderNueva()}
      {tab === 'resumen' && renderResumen()}
      {tab === 'parametros' && renderParametros()}
    </div>
  );
}
