import { useState, useEffect, useCallback } from "react";

// ══════════════════════════════════════════════════════════
// BRAND
// ══════════════════════════════════════════════════════════
const B = {
  red:'#E8191A', yellow:'#FFD000', green:'#22c55e', blue:'#38bdf8', purple:'#a78bfa', orange:'#f97316',
  bg:'#0A0A0A', card:'#141414', card2:'#181818', border:'#2a2a2a', border2:'#333',
  muted:'#555', dim:'#777', text:'#F0F0F0', textDim:'#999',
};

// ══════════════════════════════════════════════════════════
// PARÁMETROS LEGALES CHILE 2026
// ══════════════════════════════════════════════════════════
const PARAM_DEFAULT = {
  UF: 39200,
  UTM: 68647,
  IMM: 539000,                   // Ingreso Mínimo Mensual
  TOPE_AFP_SALUD_UF: 87.8,
  TOPE_AFC_UF: 131.8,
  AFP_TASA: 10.0,
  AFP_COMISION_DEFAULT: 0.58,
  SALUD_TASA: 7.0,
  AFC_TRABAJADOR_INDEFINIDO: 0.6,
  AFC_EMPLEADOR_INDEFINIDO: 2.4,
  AFC_EMPLEADOR_PLAZOFIJO: 3.0,
  SIS_EMPLEADOR: 1.49,
  MUTUAL_BASICA: 0.90,
};

// Tabla IUT mensual en UTM
const TRAMOS_IUT = [
  { desde:0,    hasta:13.5,  factor:0,     rebaja:0     },
  { desde:13.5, hasta:30,    factor:0.04,  rebaja:0.54  },
  { desde:30,   hasta:50,    factor:0.08,  rebaja:1.74  },
  { desde:50,   hasta:70,    factor:0.135, rebaja:4.49  },
  { desde:70,   hasta:90,    factor:0.23,  rebaja:11.14 },
  { desde:90,   hasta:120,   factor:0.304, rebaja:17.80 },
  { desde:120,  hasta:310,   factor:0.35,  rebaja:23.32 },
  { desde:310,  hasta:Infinity, factor:0.40, rebaja:38.82 },
];

function calcIUT(baseTributable, utm) {
  const enUTM = baseTributable / utm;
  const t = TRAMOS_IUT.find(t => enUTM > t.desde && enUTM <= t.hasta) || TRAMOS_IUT[0];
  if (t.factor === 0) return 0;
  return Math.max(0, (enUTM * t.factor - t.rebaja) * utm);
}

// ══════════════════════════════════════════════════════════
// CÁLCULO DE LIQUIDACIÓN
// ══════════════════════════════════════════════════════════
function calcLiq(form, params) {
  const p = params;
  const sueldoBase     = parseFloat(form.sueldoBase)     || 0;
  const diasTrab       = parseFloat(form.diasTrabajados)  || 30;
  const horasExtra     = parseFloat(form.horasExtra)      || 0;
  const valorHE        = parseFloat(form.valorHoraExtra)   || 0;
  const diasDomingo    = parseFloat(form.diasDomingo)      || 0;
  const valorDiaDom    = parseFloat(form.valorDiaDom)      || 0;
  const cargas         = parseFloat(form.cargas)           || 0;
  const valorCarga     = parseFloat(form.valorCarga)       || 2749;
  const afpComisionPct = parseFloat(form.afpComision)      || p.AFP_COMISION_DEFAULT;
  // Seguro de Cesantía: ingreso MANUAL (0 si no aplica, ej. trabajadores > 10 años)
  const afcManual      = parseFloat(form.afcManual)        || 0;
  const anticipos      = parseFloat(form.anticipos)        || 0;
  const otrosDesc      = parseFloat(form.otrosDescuentos)  || 0;

  // ── HABERES IMPONIBLES ──
  // 1. Sueldo proporcional
  const sueldoProporcional = diasTrab < 30 ? Math.round((sueldoBase / 30) * diasTrab) : sueldoBase;

  // 2. Diferencia sueldo mínimo — ingreso MANUAL
  const difSueldoMinimo = parseFloat(form.difSueldoMinimo) || 0;

  // 3. Horas extra
  const recargHorasExtra = Math.round(horasExtra * valorHE);

  // 4. Días domingo y festivos trabajados
  const recargDiasDomingo = Math.round(diasDomingo * valorDiaDom);

  // 5. Gratificación legal = 25% de (sueldoProporcional + difSueldoMinimo + recargHorasExtra + recargDiasDomingo)
  const baseGratificacion = sueldoProporcional + difSueldoMinimo + recargHorasExtra + recargDiasDomingo;
  const gratificacion = Math.round(baseGratificacion * 0.25);

  const totalImponible = sueldoProporcional + difSueldoMinimo + recargHorasExtra + recargDiasDomingo + gratificacion;

  // ── HABERES NO IMPONIBLES ──
  const asigCargas = Math.round(cargas * valorCarga);
  const colacion   = parseFloat(form.colacion)    || 0;
  const movilizacion = parseFloat(form.movilizacion) || 0;
  const totalNoImponible = asigCargas + colacion + movilizacion;

  const totalHaberes = totalImponible + totalNoImponible;

  // ── TOPES ──
  const topeAfpSalud = p.TOPE_AFP_SALUD_UF * p.UF;
  const baseAfpSalud = Math.min(totalImponible, topeAfpSalud);

  // ── DESCUENTOS LEGALES TRABAJADOR ──
  // AFP: SOLO la comisión ingresada (sin sumar el 10% obligatorio)
  // La cotización obligatoria del 10% va directo a la cuenta individual del trabajador
  // y NO se refleja como descuento en la liquidación chilena estándar
  const dscAfpTotal = Math.round(baseAfpSalud * (afpComisionPct / 100));

  // Salud: sobre total imponible (con tope)
  let dscSalud;
  if (form.salud === 'isapre' && parseFloat(form.planIsapreUF) > 0) {
    dscSalud = Math.max(
      Math.round(parseFloat(form.planIsapreUF) * p.UF),
      Math.round(baseAfpSalud * (p.SALUD_TASA / 100))
    );
  } else {
    dscSalud = Math.round(baseAfpSalud * (p.SALUD_TASA / 100));
  }

  // Seguro de Cesantía: MANUAL — el usuario ingresa el monto directamente
  // (aplica 0 para trabajadores con > 10 años de servicio u otros casos)
  const dscAfcTrab = afcManual;

  // Base tributable = total imponible - descuentos previsionales
  const baseTributable = totalImponible - dscAfpTotal - dscSalud - dscAfcTrab;
  const impuestoUnico  = Math.round(calcIUT(baseTributable, p.UTM));

  const totalDescuentosLegales = dscAfpTotal + dscSalud + dscAfcTrab + impuestoUnico;
  const totalOtrosDesc = anticipos + otrosDesc;

  // Alcance líquido = total haberes - descuentos legales
  const alcanceLiquido = totalHaberes - totalDescuentosLegales;
  // Total líquido a pagar = alcance líquido - otros descuentos
  const liquidoAPagar  = alcanceLiquido - totalOtrosDesc;

  // ── APORTES EMPLEADOR ──
  const topeAfc = p.TOPE_AFC_UF * p.UF;
  const baseAfc = Math.min(totalImponible, topeAfc);
  const aporteAfcEmp  = form.tipoContrato === 'indefinido'
    ? Math.round(baseAfc * (p.AFC_EMPLEADOR_INDEFINIDO / 100))
    : Math.round(baseAfc * (p.AFC_EMPLEADOR_PLAZOFIJO / 100));
  const aporteSis     = Math.round(baseAfpSalud * (p.SIS_EMPLEADOR / 100));
  const aporteMutual  = Math.round(baseAfpSalud * (p.MUTUAL_BASICA / 100));
  const totalAportesEmp = aporteAfcEmp + aporteSis + aporteMutual;

  const costoTotalEmpresa = totalHaberes + totalAportesEmp;
  const totalImposiciones = dscAfpTotal + dscSalud + dscAfcTrab + aporteAfcEmp + aporteSis + aporteMutual;

  return {
    sueldoProporcional, difSueldoMinimo, recargHorasExtra, recargDiasDomingo, gratificacion,
    totalImponible, asigCargas, colacion, movilizacion, totalNoImponible, totalHaberes,
    baseAfpSalud, baseAfc, baseTributable,
    dscAfpTotal, dscSalud, dscAfcTrab,
    impuestoUnico, totalDescuentosLegales,
    anticipos, otrosDesc, totalOtrosDesc,
    alcanceLiquido, liquidoAPagar,
    aporteAfcEmp, aporteSis, aporteMutual, totalAportesEmp,
    costoTotalEmpresa, totalImposiciones,
  };
}

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════
const fmt  = v => new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(v||0);
const num  = v => parseFloat(v)||0;
const mes  = m => { const [y,mo] = m.split('-'); return new Date(parseInt(y), parseInt(mo)-1, 1).toLocaleDateString('es-CL',{month:'long',year:'numeric'}).replace(/^\w/,c=>c.toUpperCase()); };

const EMPTY_TRABAJADOR = {
  nombre:'', apellidos:'', rut:'', cargo:'', tipoContrato:'indefinido',
  salud:'fonasa', planIsapreUF:'', afpNombre:'Capital', afpComision:'0.58',
  regimenPrevisional:'AFP',
};

const EMPTY_FORM = {
  trabajadorId:'', sueldoBase:'', diasTrabajados:'30',
  difSueldoMinimo:'0',
  horasExtra:'0', valorHoraExtra:'', diasDomingo:'0', valorDiaDom:'',
  cargas:'0', valorCarga:'2749',
  colacion:'', movilizacion:'',
  afcManual:'0',
  anticipos:'', otrosDescuentos:'',
  tipoContrato:'indefinido', salud:'fonasa', planIsapreUF:'', afpComision:'0.58',
};

// ══════════════════════════════════════════════════════════
// IMPRIMIR LIQUIDACIÓN
// ══════════════════════════════════════════════════════════
function imprimirLiq(trab, form, liq, periodo, params, empresa) {
  const fmtP = v => new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(v||0);
  const periodoTexto = mes(periodo);
  const nombreCompleto = `${trab.nombre} ${trab.apellidos}`.trim();

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Liquidación ${nombreCompleto} - ${periodoTexto}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:11px;padding:20px}
  .page{max-width:780px;margin:0 auto}
  /* HEADER */
  .header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #E8191A;padding-bottom:10px;margin-bottom:14px}
  .header img{height:45px}
  .header-right{text-align:right}
  .titulo{font-size:16px;font-weight:900;letter-spacing:1px;color:#111}
  .subtitulo{font-size:10px;color:#666;margin-top:2px}
  /* BLOQUES INFO */
  .bloque{margin-bottom:10px;border:1px solid #ddd;border-radius:4px;overflow:hidden}
  .bloque-titulo{background:#111;color:#fff;padding:5px 10px;font-size:9px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase}
  .bloque-body{padding:8px 10px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 16px}
  .dato{display:flex;gap:4px;font-size:10px;padding:2px 0}
  .dato .lbl{color:#666;font-weight:600;min-width:160px}
  .dato .val{font-weight:700;color:#111}
  /* TABLA LIQUIDACIÓN */
  table{width:100%;border-collapse:collapse;margin-bottom:10px}
  .table-titulo{background:#E8191A;color:#fff;padding:5px 10px;font-size:9px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase}
  th{background:#f5f5f5;padding:5px 8px;font-size:9px;font-weight:800;text-align:left;border-bottom:1px solid #ddd;text-transform:uppercase;letter-spacing:.5px}
  td{padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:11px}
  td.monto{text-align:right;font-family:'Courier New',monospace;font-weight:600}
  tr.subtotal td{background:#f9f9f9;font-weight:700;border-top:1px solid #ddd}
  tr.total td{background:#111;color:#fff;font-weight:800;font-size:12px}
  tr.total td.monto{font-size:13px}
  tr.alcance td{background:#E8191A;color:#fff;font-weight:800;font-size:12px}
  tr.alcance td.monto{font-size:13px}
  tr.liquido td{background:#1a6b3a;color:#fff;font-weight:900;font-size:13px}
  tr.liquido td.monto{font-size:15px}
  tr.empleador td{background:#f0f4ff;color:#333;font-size:10px}
  /* FIRMAS */
  .firmas{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:40px}
  .firma{border-top:1px solid #333;padding-top:6px;text-align:center;font-size:10px;color:#666}
  .firma strong{display:block;font-size:11px;color:#111;margin-bottom:2px}
  /* FOOTER */
  .footer{margin-top:16px;font-size:8px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:8px}
  @media print{body{padding:8px}.no-print{display:none}}
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <img src="/logo.png" alt="Rap Burger"/>
    <div class="header-right">
      <div class="titulo">LIQUIDACIÓN DE REMUNERACIONES</div>
      <div class="subtitulo">Período: ${periodoTexto}</div>
    </div>
  </div>

  <!-- DATOS EMPRESA -->
  <div class="bloque">
    <div class="bloque-titulo">Datos de la Empresa</div>
    <div class="bloque-body grid2">
      <div class="dato"><span class="lbl">Razón Social:</span><span class="val">${empresa.razonSocial||'House Rap Burger'}</span></div>
      <div class="dato"><span class="lbl">RUT Empresa:</span><span class="val">${empresa.rut||'—'}</span></div>
      <div class="dato"><span class="lbl">Dirección:</span><span class="val">${empresa.direccion||'—'}</span></div>
      <div class="dato"><span class="lbl">Actividad:</span><span class="val">Restaurante</span></div>
    </div>
  </div>

  <!-- DATOS TRABAJADOR -->
  <div class="bloque">
    <div class="bloque-titulo">Datos del Trabajador</div>
    <div class="bloque-body grid2">
      <div class="dato"><span class="lbl">Nombre Completo:</span><span class="val">${nombreCompleto}</span></div>
      <div class="dato"><span class="lbl">RUT:</span><span class="val">${trab.rut||'—'}</span></div>
      <div class="dato"><span class="lbl">Cargo:</span><span class="val">${trab.cargo||'—'}</span></div>
      <div class="dato"><span class="lbl">Tipo de Contrato:</span><span class="val">${form.tipoContrato==='indefinido'?'Indefinido':'Plazo Fijo'}</span></div>
    </div>
  </div>

  <!-- INFORMACIÓN PREVISIONAL -->
  <div class="bloque">
    <div class="bloque-titulo">Información Previsional</div>
    <div class="bloque-body grid3">
      <div class="dato"><span class="lbl">Base Imponible:</span><span class="val">${fmtP(liq.totalImponible)}</span></div>
      <div class="dato"><span class="lbl">Días Trabajados:</span><span class="val">${form.diasTrabajados||30} de 30</span></div>
      <div class="dato"><span class="lbl">Valor UF:</span><span class="val">${fmtP(params.UF)}</span></div>
      <div class="dato"><span class="lbl">Base Tributable:</span><span class="val">${fmtP(liq.baseTributable)}</span></div>
      <div class="dato"><span class="lbl">Tope Imponible:</span><span class="val">${fmtP(liq.baseAfpSalud)}</span></div>
      <div class="dato"><span class="lbl">Valor UTM:</span><span class="val">${fmtP(params.UTM)}</span></div>
      <div class="dato"><span class="lbl">Cotiz. Pactada Salud:</span><span class="val">${form.salud==='isapre'&&form.planIsapreUF?form.planIsapreUF+' UF':'7% (Fonasa)'}</span></div>
      <div class="dato"><span class="lbl">Régimen Previsional:</span><span class="val">${trab.regimenPrevisional||'AFP'}</span></div>
      <div class="dato"><span class="lbl">AFP:</span><span class="val">${trab.afpNombre||'—'} (${form.afpComision||0.58}%)</span></div>
    </div>
  </div>

  <!-- TABLA LIQUIDACIÓN -->
  <div class="table-titulo">Detalle de la Liquidación</div>
  <table>
    <thead>
      <tr><th>Concepto</th><th style="text-align:right">Monto ($)</th></tr>
    </thead>
    <tbody>
      <!-- HABERES IMPONIBLES -->
      <tr><td colspan="2" style="background:#fff8f8;font-weight:800;color:#E8191A;font-size:9px;letter-spacing:1px;padding:6px 8px">HABERES IMPONIBLES</td></tr>
      <tr><td>Sueldo Base</td><td class="monto">${fmtP(liq.sueldoProporcional)}</td></tr>
      <tr><td>Diferencia Sueldo Mínimo</td><td class="monto">${fmtP(liq.difSueldoMinimo)}</td></tr>
      ${liq.recargHorasExtra>0?`<tr><td>Recargo Horas Extra (${form.horasExtra} hrs)</td><td class="monto">${fmtP(liq.recargHorasExtra)}</td></tr>`:''}
      ${liq.recargDiasDomingo>0?`<tr><td>Días Domingos y Festivos (${form.diasDomingo} días)</td><td class="monto">${fmtP(liq.recargDiasDomingo)}</td></tr>`:''}
      <tr><td>Gratificación Legal (25% base imponible sin gratificación)</td><td class="monto">${fmtP(liq.gratificacion)}</td></tr>
      <tr class="subtotal"><td>TOTAL IMPONIBLE</td><td class="monto">${fmtP(liq.totalImponible)}</td></tr>

      <!-- HABERES NO IMPONIBLES -->
      ${(liq.asigCargas>0||liq.colacion>0||liq.movilizacion>0)?`
      <tr><td colspan="2" style="background:#f0fff4;font-weight:800;color:#1a6b3a;font-size:9px;letter-spacing:1px;padding:6px 8px">HABERES NO IMPONIBLES</td></tr>
      ${liq.asigCargas>0?`<tr><td>Cargas Familiares (${form.cargas} cargas)</td><td class="monto">${fmtP(liq.asigCargas)}</td></tr>`:''}
      ${liq.colacion>0?`<tr><td>Colación</td><td class="monto">${fmtP(liq.colacion)}</td></tr>`:''}
      ${liq.movilizacion>0?`<tr><td>Movilización</td><td class="monto">${fmtP(liq.movilizacion)}</td></tr>`:''}
      <tr class="subtotal"><td>TOTAL NO IMPONIBLE</td><td class="monto">${fmtP(liq.totalNoImponible)}</td></tr>
      `:''}

      <!-- TOTAL HABERES -->
      <tr class="total"><td>TOTAL HABERES</td><td class="monto">${fmtP(liq.totalHaberes)}</td></tr>

      <!-- DESCUENTOS -->
      <tr><td colspan="2" style="background:#fff8f8;font-weight:800;color:#E8191A;font-size:9px;letter-spacing:1px;padding:6px 8px">DESCUENTOS LEGALES</td></tr>
      <tr><td>AFP — Comisión (${form.afpComision||0.58}%)</td><td class="monto">-${fmtP(liq.dscAfpTotal)}</td></tr>
      <tr><td>Cotización de Salud (${form.salud==='isapre'?'Isapre':'Fonasa 7%'})</td><td class="monto">-${fmtP(liq.dscSalud)}</td></tr>
      ${liq.dscAfcTrab>0?`<tr><td>Seguro de Cesantía Trabajador (0.6%)</td><td class="monto">-${fmtP(liq.dscAfcTrab)}</td></tr>`:''}
      ${liq.impuestoUnico>0?`<tr><td>Impuesto Único 2ª Categoría</td><td class="monto">-${fmtP(liq.impuestoUnico)}</td></tr>`:''}
      <tr class="subtotal"><td>TOTAL DESCUENTOS LEGALES</td><td class="monto">-${fmtP(liq.totalDescuentosLegales)}</td></tr>

      <!-- ALCANCE LÍQUIDO -->
      <tr class="alcance"><td>ALCANCE LÍQUIDO</td><td class="monto">${fmtP(liq.alcanceLiquido)}</td></tr>

      <!-- OTROS DESCUENTOS -->
      ${(liq.anticipos>0||liq.otrosDesc>0)?`
      <tr><td colspan="2" style="background:#f5f5f5;font-weight:800;color:#333;font-size:9px;letter-spacing:1px;padding:6px 8px">OTROS DESCUENTOS</td></tr>
      ${liq.anticipos>0?`<tr><td>Anticipos de Sueldo</td><td class="monto">-${fmtP(liq.anticipos)}</td></tr>`:''}
      ${liq.otrosDesc>0?`<tr><td>Otros Descuentos</td><td class="monto">-${fmtP(liq.otrosDesc)}</td></tr>`:''}
      `:''}

      <!-- TOTAL LÍQUIDO -->
      <tr class="liquido"><td>TOTAL LÍQUIDO A PAGAR</td><td class="monto">${fmtP(liq.liquidoAPagar)}</td></tr>
    </tbody>
  </table>

  <!-- FIRMAS -->
  <div class="firmas">
    <div class="firma">
      <strong>${nombreCompleto}</strong>
      RUT: ${trab.rut||'—'}<br/>
      Firma del Trabajador
    </div>
    <div class="firma">
      <strong>${empresa.razonSocial||'House Rap Burger'}</strong>
      RUT: ${empresa.rut||'—'}<br/>
      Firma del Empleador / Representante Legal
    </div>
  </div>

  <div class="footer">
    Liquidación generada el ${new Date().toLocaleDateString('es-CL')} · House Rap Burger · Período ${periodoTexto}
  </div>
</div>
<script class="no-print">window.onload=()=>window.print();</script>
</body>
</html>`;

  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
}

// ══════════════════════════════════════════════════════════
// LIBRO DE REMUNERACIONES (PDF para Previred)
// ══════════════════════════════════════════════════════════
function imprimirLibro(liquidaciones, periodo, empresa, params) {
  const fmtP = v => new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(v||0);
  const periodoTexto = mes(periodo);

  const totales = liquidaciones.reduce((acc, e) => {
    const l = e.liq;
    acc.totalImponible    += l.totalImponible    || 0;
    acc.totalHaberes      += l.totalHaberes      || 0;
    acc.dscAfpTotal       += l.dscAfpTotal       || 0;
    acc.dscSalud          += l.dscSalud          || 0;
    acc.dscAfcTrab        += l.dscAfcTrab        || 0;
    acc.impuestoUnico     += l.impuestoUnico     || 0;
    acc.totalDescuentos   += l.totalDescuentosLegales || 0;
    acc.liquidoAPagar     += l.liquidoAPagar     || 0;
    acc.aporteAfcEmp      += l.aporteAfcEmp      || 0;
    acc.aporteSis         += l.aporteSis         || 0;
    acc.aporteMutual      += l.aporteMutual      || 0;
    acc.totalImposiciones += l.totalImposiciones || 0;
    acc.costoTotal        += l.costoTotalEmpresa || 0;
    return acc;
  }, { totalImponible:0, totalHaberes:0, dscAfpTotal:0, dscSalud:0, dscAfcTrab:0, impuestoUnico:0, totalDescuentos:0, liquidoAPagar:0, aporteAfcEmp:0, aporteSis:0, aporteMutual:0, totalImposiciones:0, costoTotal:0 });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Libro de Remuneraciones - ${periodoTexto}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:9px;padding:16px}
  .header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #E8191A;padding-bottom:8px;margin-bottom:12px}
  .header img{height:40px}
  .titulo{font-size:14px;font-weight:900;text-align:right}
  .sub{font-size:9px;color:#666;text-align:right;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:8px}
  th{background:#111;color:#fff;padding:5px 4px;text-align:center;font-size:7px;font-weight:800;letter-spacing:.3px;border:1px solid #333}
  td{padding:4px;border:1px solid #ddd;text-align:right;white-space:nowrap}
  td.nombre{text-align:left;font-weight:600}
  tr:nth-child(even){background:#fafafa}
  tr.total-row td{background:#111;color:#fff;font-weight:800;border-color:#333;font-size:8.5px}
  tr.total-row td.nombre{text-align:left}
  .imposiciones{margin-top:14px;border:2px solid #E8191A;border-radius:4px;overflow:hidden}
  .imp-titulo{background:#E8191A;color:#fff;padding:6px 10px;font-size:10px;font-weight:800;letter-spacing:1px}
  .imp-body{padding:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  .imp-item{border:1px solid #ddd;border-radius:3px;padding:6px 8px}
  .imp-lbl{font-size:7px;color:#666;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
  .imp-val{font-size:11px;font-weight:800;color:#111;font-family:'Courier New',monospace}
  .footer{margin-top:12px;font-size:7px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:6px}
  @media print{body{padding:6px;font-size:8px}}
</style>
</head>
<body>
  <div class="header">
    <img src="/logo.png" alt="Rap Burger"/>
    <div>
      <div class="titulo">LIBRO DE REMUNERACIONES</div>
      <div class="sub">Período: ${periodoTexto} · ${empresa.razonSocial||'House Rap Burger'} · RUT: ${empresa.rut||'—'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align:left">Trabajador</th>
        <th>RUT</th>
        <th>Cargo</th>
        <th>Total Impon.</th>
        <th>Total Haberes</th>
        <th>AFP</th>
        <th>Salud</th>
        <th>AFC Trab.</th>
        <th>Imp. Único</th>
        <th>Total Dsc.</th>
        <th>Líquido a Pagar</th>
        <th>AFC Emp.</th>
        <th>SIS</th>
        <th>Mutual</th>
        <th>Total Imposic.</th>
        <th>Costo Empresa</th>
      </tr>
    </thead>
    <tbody>
      ${liquidaciones.map(e => {
        const t = e.trabajador || {};
        const l = e.liq;
        const nombre = `${t.nombre||''} ${t.apellidos||''}`.trim() || e.form?.nombre || '—';
        return `<tr>
          <td class="nombre">${nombre}</td>
          <td style="text-align:center">${t.rut||'—'}</td>
          <td style="text-align:left">${t.cargo||'—'}</td>
          <td>${fmtP(l.totalImponible)}</td>
          <td>${fmtP(l.totalHaberes)}</td>
          <td>${fmtP(l.dscAfpTotal)}</td>
          <td>${fmtP(l.dscSalud)}</td>
          <td>${fmtP(l.dscAfcTrab)}</td>
          <td>${fmtP(l.impuestoUnico)}</td>
          <td>${fmtP(l.totalDescuentosLegales)}</td>
          <td style="font-weight:800">${fmtP(l.liquidoAPagar)}</td>
          <td>${fmtP(l.aporteAfcEmp)}</td>
          <td>${fmtP(l.aporteSis)}</td>
          <td>${fmtP(l.aporteMutual)}</td>
          <td style="color:#E8191A;font-weight:800">${fmtP(l.totalImposiciones)}</td>
          <td style="font-weight:800">${fmtP(l.costoTotalEmpresa)}</td>
        </tr>`;
      }).join('')}
      <tr class="total-row">
        <td class="nombre" colspan="3">TOTALES (${liquidaciones.length} trabajadores)</td>
        <td>${fmtP(totales.totalImponible)}</td>
        <td>${fmtP(totales.totalHaberes)}</td>
        <td>${fmtP(totales.dscAfpTotal)}</td>
        <td>${fmtP(totales.dscSalud)}</td>
        <td>${fmtP(totales.dscAfcTrab)}</td>
        <td>${fmtP(totales.impuestoUnico)}</td>
        <td>${fmtP(totales.totalDescuentos)}</td>
        <td>${fmtP(totales.liquidoAPagar)}</td>
        <td>${fmtP(totales.aporteAfcEmp)}</td>
        <td>${fmtP(totales.aporteSis)}</td>
        <td>${fmtP(totales.aporteMutual)}</td>
        <td>${fmtP(totales.totalImposiciones)}</td>
        <td>${fmtP(totales.costoTotal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="imposiciones">
    <div class="imp-titulo">⚠ Resumen de Imposiciones a Pagar en Previred — ${periodoTexto}</div>
    <div class="imp-body">
      <div class="imp-item"><div class="imp-lbl">AFP (trabajadores)</div><div class="imp-val">${fmtP(totales.dscAfpTotal)}</div></div>
      <div class="imp-item"><div class="imp-lbl">Salud (trabajadores)</div><div class="imp-val">${fmtP(totales.dscSalud)}</div></div>
      <div class="imp-item"><div class="imp-lbl">AFC Trabajadores</div><div class="imp-val">${fmtP(totales.dscAfcTrab)}</div></div>
      <div class="imp-item"><div class="imp-lbl">AFC Empleador</div><div class="imp-val">${fmtP(totales.aporteAfcEmp)}</div></div>
      <div class="imp-item"><div class="imp-lbl">SIS Empleador</div><div class="imp-val">${fmtP(totales.aporteSis)}</div></div>
      <div class="imp-item"><div class="imp-lbl">Mutual Empleador</div><div class="imp-val">${fmtP(totales.aporteMutual)}</div></div>
      <div class="imp-item"><div class="imp-lbl">Impuesto Único (Fisco)</div><div class="imp-val">${fmtP(totales.impuestoUnico)}</div></div>
      <div class="imp-item" style="border-color:#E8191A"><div class="imp-lbl" style="color:#E8191A">TOTAL PREVIRED</div><div class="imp-val" style="color:#E8191A;font-size:14px">${fmtP(totales.totalImposiciones)}</div></div>
    </div>
  </div>

  <div class="footer">
    Libro de Remuneraciones generado el ${new Date().toLocaleDateString('es-CL')} · House Rap Burger · Período ${periodoTexto} · Declarar en Previred antes del día 10 de cada mes
  </div>
<script>window.onload=()=>window.print();</script>
</body>
</html>`;

  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
}

// ══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function RRHHModule() {
  const [tab, setTab]           = useState('trabajadores');
  const [trabajadores, setTrab] = useState([]);
  const [liquidaciones, setLiqs] = useState([]);
  const [params, setParams]     = useState(PARAM_DEFAULT);
  const [empresa, setEmpresa]   = useState({ razonSocial:'House Rap Burger', rut:'', direccion:'' });
  const [periodo, setPeriodo]   = useState(new Date().toISOString().slice(0,7));
  const [toast, setToast]       = useState(null);
  const [loading, setLoading]   = useState(true);

  // Forms
  const [formTrab, setFormTrab] = useState(EMPTY_TRABAJADOR);
  const [editTrabId, setEditTrabId] = useState(null);
  const [formLiq, setFormLiq]   = useState(EMPTY_FORM);
  const [editLiqId, setEditLiqId] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);

  const showToast = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  // ── LOAD ──
  const loadAll = useCallback(async() => {
    setLoading(true);
    try {
      // trabajadores
      const kt = await window.storage.list('rb-trab:');
      const trabs = await Promise.all(kt.keys.map(async k => {
        try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; }
      }));
      setTrab(trabs.filter(Boolean).sort((a,b)=>a.nombre.localeCompare(b.nombre)));

      // liquidaciones del período
      const kl = await window.storage.list('rb-liq:'+periodo+':');
      const liqs = await Promise.all(kl.keys.map(async k => {
        try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; }
      }));
      setLiqs(liqs.filter(Boolean));

      // params
      const rp = await window.storage.get('rb-params:legal2');
      if (rp) setParams({...PARAM_DEFAULT,...JSON.parse(rp.value)});

      // empresa
      const re = await window.storage.get('rb-empresa');
      if (re) setEmpresa(JSON.parse(re.value));
    } catch {}
    setLoading(false);
  }, [periodo]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── GUARDAR TRABAJADOR ──
  const saveTrab = async() => {
    if (!formTrab.nombre || !formTrab.rut) { showToast('Nombre y RUT son obligatorios','err'); return; }
    const id = editTrabId || 'trab_'+Date.now();
    await window.storage.set('rb-trab:'+id, JSON.stringify({...formTrab, id}));
    showToast('✔ Trabajador guardado');
    setFormTrab(EMPTY_TRABAJADOR); setEditTrabId(null);
    await loadAll();
  };

  const deleteTrab = async(id) => {
    await window.storage.delete('rb-trab:'+id);
    showToast('Trabajador eliminado'); setDelConfirm(null); await loadAll();
  };

  // ── GUARDAR LIQUIDACIÓN ──
  const saveLiq = async() => {
    if (!formLiq.trabajadorId) { showToast('Selecciona un trabajador','err'); return; }
    if (!formLiq.sueldoBase)   { showToast('Ingresa el sueldo base','err'); return; }
    const trab = trabajadores.find(t=>t.id===formLiq.trabajadorId);
    if (!trab) { showToast('Trabajador no encontrado','err'); return; }

    // Merge contrato/salud del trabajador al form si no están seteados en el form
    const formFinal = {
      ...formLiq,
      tipoContrato: formLiq.tipoContrato || trab.tipoContrato,
      salud: formLiq.salud || trab.salud,
      afpComision: formLiq.afpComision || trab.afpComision,
    };

    const liq = calcLiq(formFinal, params);
    const id  = editLiqId || 'liq_'+Date.now();
    await window.storage.set('rb-liq:'+periodo+':'+id, JSON.stringify({
      id, periodo, trabajadorId: trab.id, trabajador: trab, form: formFinal, liq,
      savedAt: new Date().toISOString()
    }));
    showToast('✔ Liquidación guardada');
    setFormLiq(EMPTY_FORM); setEditLiqId(null); setTab('lista');
    await loadAll();
  };

  const deleteLiq = async(id) => {
    await window.storage.delete('rb-liq:'+periodo+':'+id);
    showToast('Liquidación eliminada'); setDelConfirm(null); await loadAll();
  };

  // Preview en tiempo real
  const trabSel = trabajadores.find(t=>t.id===formLiq.trabajadorId);
  const formPreview = {
    ...formLiq,
    tipoContrato: formLiq.tipoContrato || trabSel?.tipoContrato || 'indefinido',
    salud: formLiq.salud || trabSel?.salud || 'fonasa',
    afpComision: formLiq.afpComision || trabSel?.afpComision || '0.58',
  };
  const liqPreview = formLiq.sueldoBase ? calcLiq(formPreview, params) : null;

  // ── TOTALES PERÍODO ──
  const totalesPeriodo = liquidaciones.reduce((acc, e) => {
    const l = e.liq;
    acc.haberes    += l.totalHaberes    || 0;
    acc.liquido    += l.liquidoAPagar   || 0;
    acc.afp        += l.dscAfpTotal     || 0;
    acc.salud      += l.dscSalud        || 0;
    acc.afc        += l.dscAfcTrab      || 0;
    acc.impuesto   += l.impuestoUnico   || 0;
    acc.afcEmp     += l.aporteAfcEmp    || 0;
    acc.sis        += l.aporteSis       || 0;
    acc.mutual     += l.aporteMutual    || 0;
    acc.imposic    += l.totalImposiciones||0;
    acc.costoTotal += l.costoTotalEmpresa||0;
    return acc;
  }, {haberes:0,liquido:0,afp:0,salud:0,afc:0,impuesto:0,afcEmp:0,sis:0,mutual:0,imposic:0,costoTotal:0});

  // ── ESTILOS ──
  const s = {
    card: {background:B.card,border:`1px solid ${B.border}`,borderRadius:10,padding:'16px 18px'},
    inp:  {background:'#0A0A0A',border:`1px solid ${B.border2}`,color:B.text,padding:'8px 10px',borderRadius:6,fontFamily:'monospace',fontSize:12,outline:'none',width:'100%'},
    sel:  {background:'#0A0A0A',border:`1px solid ${B.border2}`,color:B.text,padding:'8px 10px',borderRadius:6,fontSize:12,outline:'none',width:'100%'},
    lbl:  {fontSize:8,color:B.dim,fontWeight:800,letterSpacing:1.5,textTransform:'uppercase',marginBottom:4,display:'block'},
    btn:  (bg=B.red,c='#fff')=>({padding:'8px 18px',fontSize:10,fontWeight:800,cursor:'pointer',border:'none',background:bg,color:c,borderRadius:6,fontFamily:'inherit',letterSpacing:.5,textTransform:'uppercase'}),
    grid: (cols)=>({display:'grid',gridTemplateColumns:`repeat(auto-fill,minmax(${cols}px,1fr))`,gap:10}),
    secTitle: (color=B.red)=>({fontSize:9,fontWeight:800,letterSpacing:2,color,textTransform:'uppercase',margin:'18px 0 10px',paddingBottom:8,borderBottom:`1px solid ${B.border}`}),
    subtabBtn: (active)=>({padding:'8px 14px',fontSize:10,fontWeight:800,cursor:'pointer',border:`1px solid ${active?B.red:B.border2}`,background:active?B.red+'18':'transparent',color:active?B.red:B.dim,borderRadius:6,fontFamily:'inherit',letterSpacing:.5,textTransform:'uppercase'}),
    thStyle: {padding:'9px 12px',fontSize:8,fontWeight:800,letterSpacing:1.5,color:B.dim,textAlign:'left',borderBottom:`1px solid ${B.border}`,textTransform:'uppercase',whiteSpace:'nowrap',background:'#0A0A0A'},
    tdStyle: {padding:'8px 12px',fontSize:11,borderBottom:`1px solid ${B.border}`,color:B.text},
  };

  // ── ROW LIQUIDACIÓN ──
  const LiqRow = ({label,value,indent=false,bold=false,color=B.text,border=false,sub=''}) => (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:bold?'10px 14px':`7px 14px 7px ${indent?'28px':'14px'}`,borderTop:border?`1px solid ${B.border}`:'none',background:bold?'#111':'transparent'}}>
      <span style={{fontSize:bold?12:11,fontWeight:bold?800:500,color:bold?B.text:B.textDim,textTransform:bold?'uppercase':'none'}}>
        {label}{sub&&<span style={{fontSize:9,color:B.dim,marginLeft:6}}>{sub}</span>}
      </span>
      <span style={{fontFamily:'monospace',fontSize:bold?14:12,fontWeight:bold?800:600,color}}>{fmt(value)}</span>
    </div>
  );

  // ════════════════════════════════════════
  // TAB: TRABAJADORES
  // ════════════════════════════════════════
  const renderTrabajadores = () => (
    <div>
      <div style={s.card}>
        <div style={{fontSize:11,fontWeight:800,color:B.red,marginBottom:14,textTransform:'uppercase',letterSpacing:1}}>
          {editTrabId ? '✏️ Editando trabajador' : '➕ Nuevo trabajador'}
        </div>
        <div style={s.grid(185)}>
          {[['nombre','Nombre'],['apellidos','Apellidos'],['rut','RUT (ej: 12.345.678-9)'],['cargo','Cargo']].map(([id,label])=>(
            <div key={id}><label style={s.lbl}>{label}</label>
              <input type="text" value={formTrab[id]} onChange={e=>setFormTrab(p=>({...p,[id]:e.target.value}))} style={s.inp} placeholder={label}/>
            </div>
          ))}
          <div><label style={s.lbl}>Tipo de Contrato</label>
            <select value={formTrab.tipoContrato} onChange={e=>setFormTrab(p=>({...p,tipoContrato:e.target.value}))} style={s.sel}>
              <option value="indefinido">Indefinido</option>
              <option value="plazofijo">Plazo Fijo</option>
            </select>
          </div>
          <div><label style={s.lbl}>Sistema de Salud</label>
            <select value={formTrab.salud} onChange={e=>setFormTrab(p=>({...p,salud:e.target.value}))} style={s.sel}>
              <option value="fonasa">Fonasa (7%)</option>
              <option value="isapre">Isapre</option>
            </select>
          </div>
          {formTrab.salud==='isapre'&&(
            <div><label style={s.lbl}>Plan Isapre (UF)</label>
              <input type="number" step="0.01" value={formTrab.planIsapreUF} onChange={e=>setFormTrab(p=>({...p,planIsapreUF:e.target.value}))} style={s.inp} placeholder="0.00"/>
            </div>
          )}
          <div><label style={s.lbl}>AFP</label>
            <select value={formTrab.afpNombre} onChange={e=>setFormTrab(p=>({...p,afpNombre:e.target.value}))} style={s.sel}>
              {['Capital','Cuprum','Habitat','Modelo','PlanVital','Provida','Uno'].map(a=><option key={a}>{a}</option>)}
            </select>
          </div>
          <div><label style={s.lbl}>Comisión AFP (%)</label>
            <input type="number" step="0.01" value={formTrab.afpComision} onChange={e=>setFormTrab(p=>({...p,afpComision:e.target.value}))} style={s.inp}/>
          </div>
          <div><label style={s.lbl}>Régimen Previsional</label>
            <select value={formTrab.regimenPrevisional} onChange={e=>setFormTrab(p=>({...p,regimenPrevisional:e.target.value}))} style={s.sel}>
              <option value="AFP">AFP</option>
              <option value="IPS/INP">IPS/INP (antiguo)</option>
            </select>
          </div>
        </div>
        <div style={{display:'flex',gap:8,marginTop:14,justifyContent:'flex-end'}}>
          {editTrabId&&<button style={s.btn(B.border,B.text)} onClick={()=>{setFormTrab(EMPTY_TRABAJADOR);setEditTrabId(null);}}>Cancelar</button>}
          <button style={s.btn()} onClick={saveTrab}>💾 {editTrabId?'Actualizar':'Guardar'} trabajador</button>
        </div>
      </div>

      {trabajadores.length>0&&(
        <>
          <div style={s.secTitle()}>👥 Trabajadores registrados ({trabajadores.length})</div>
          <div style={{...s.card,padding:0,overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Nombre','Apellidos','RUT','Cargo','Contrato','Salud','AFP',''].map(h=><th key={h} style={s.thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {trabajadores.map((t,i)=>(
                  <tr key={t.id} style={{background:i%2===0?B.card:'#111'}}>
                    <td style={{...s.tdStyle,fontWeight:700,color:B.red}}>{t.nombre}</td>
                    <td style={s.tdStyle}>{t.apellidos}</td>
                    <td style={{...s.tdStyle,fontFamily:'monospace',fontSize:11}}>{t.rut}</td>
                    <td style={s.tdStyle}>{t.cargo}</td>
                    <td style={s.tdStyle}><span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:4,background:t.tipoContrato==='indefinido'?B.blue+'22':B.yellow+'22',color:t.tipoContrato==='indefinido'?B.blue:B.yellow}}>{t.tipoContrato==='indefinido'?'Indefinido':'Plazo Fijo'}</span></td>
                    <td style={s.tdStyle}>{t.salud==='isapre'?'Isapre':'Fonasa'}</td>
                    <td style={s.tdStyle}>{t.afpNombre}</td>
                    <td style={{...s.tdStyle,whiteSpace:'nowrap'}}>
                      <div style={{display:'flex',gap:5}}>
                        <button style={{...s.btn(B.border,B.text),padding:'3px 8px',fontSize:10}} onClick={()=>{setFormTrab(t);setEditTrabId(t.id);}}>✏️</button>
                        <button style={{...s.btn(B.red+'22',B.red),padding:'3px 8px',fontSize:10}} onClick={()=>setDelConfirm({type:'trab',id:t.id,nombre:`${t.nombre} ${t.apellidos}`})}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );

  // ════════════════════════════════════════
  // TAB: NUEVA LIQUIDACIÓN
  // ════════════════════════════════════════
  const renderNueva = () => (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14,flexWrap:'wrap'}}>
        <div><label style={s.lbl}>Período</label>
          <input type="month" value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{...s.inp,width:'auto'}}/>
        </div>
      </div>

      {trabajadores.length===0?(
        <div style={{...s.card,textAlign:'center',color:B.dim,padding:40}}>
          <div style={{fontSize:24,marginBottom:8}}>👥</div>
          Primero registra los trabajadores en la pestaña "Trabajadores".
        </div>
      ):(
        <>
          {/* SELECTOR TRABAJADOR */}
          <div style={s.card}>
            <div style={{fontSize:11,fontWeight:800,color:B.red,marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>👤 Seleccionar trabajador</div>
            <select value={formLiq.trabajadorId} onChange={e=>{
              const t = trabajadores.find(w=>w.id===e.target.value);
              setFormLiq(p=>({...p, trabajadorId:e.target.value,
                tipoContrato:t?.tipoContrato||'indefinido',
                salud:t?.salud||'fonasa',
                planIsapreUF:t?.planIsapreUF||'',
                afpComision:t?.afpComision||'0.58',
              }));
            }} style={{...s.sel,fontSize:14,padding:'10px 12px',border:`1px solid ${B.red}`}}>
              <option value="">— Selecciona un trabajador —</option>
              {trabajadores.map(t=><option key={t.id} value={t.id}>{t.nombre} {t.apellidos} · {t.cargo} · {t.rut}</option>)}
            </select>
            {trabSel&&(
              <div style={{display:'flex',gap:16,marginTop:10,flexWrap:'wrap'}}>
                {[['Contrato',trabSel.tipoContrato==='indefinido'?'Indefinido':'Plazo Fijo'],['Salud',trabSel.salud==='isapre'?'Isapre':'Fonasa'],['AFP',`${trabSel.afpNombre} (${trabSel.afpComision}%)`],['Régimen',trabSel.regimenPrevisional]].map(([k,v])=>(
                  <div key={k} style={{fontSize:10,color:B.textDim}}><span style={{color:B.dim}}>{k}: </span><strong style={{color:B.text}}>{v}</strong></div>
                ))}
              </div>
            )}
          </div>

          {/* HABERES */}
          <div style={s.secTitle(B.green)}>💵 Haberes Imponibles</div>
          <div style={s.card}>
            <div style={s.grid(185)}>
              {[
                ['sueldoBase','Sueldo Base ($)','number'],
                ['diasTrabajados','Días Trabajados (de 30)','number'],
              ].map(([id,label,type])=>(
                <div key={id}><label style={s.lbl}>{label}</label>
                  <input type={type} placeholder="0" value={formLiq[id]} onChange={e=>setFormLiq(p=>({...p,[id]:e.target.value}))} style={s.inp}/>
                </div>
              ))}
              <div>
                <label style={s.lbl}>Diferencia Sueldo Mínimo ($)</label>
                <input type="number" placeholder="0" value={formLiq.difSueldoMinimo} onChange={e=>setFormLiq(p=>({...p,difSueldoMinimo:e.target.value}))} style={s.inp}/>
                <div style={{fontSize:9,color:B.dim,marginTop:3}}>Ingresa manualmente si aplica</div>
              </div>
              {[
                ['horasExtra','Horas Extra','number'],
                ['valorHoraExtra','Valor Hora Extra ($)','number'],
                ['diasDomingo','Días Domingo/Festivo trabajados','number'],
                ['valorDiaDom','Valor día Domingo ($)','number'],
              ].map(([id,label,type])=>(
                <div key={id}><label style={s.lbl}>{label}</label>
                  <input type={type} placeholder="0" value={formLiq[id]} onChange={e=>setFormLiq(p=>({...p,[id]:e.target.value}))} style={s.inp}/>
                </div>
              ))}
            </div>
            {liqPreview&&(
              <div style={{marginTop:12,background:'#0A0A0A',borderRadius:8,padding:'10px 14px',fontSize:11,color:B.textDim}}>
                <strong style={{color:B.yellow}}>Gratificación Legal calculada: </strong>
                <span style={{fontFamily:'monospace',color:B.green,fontWeight:700}}>{fmt(liqPreview.gratificacion)}</span>
                <span style={{color:B.dim,marginLeft:8,fontSize:10}}>= 25% de {fmt(liqPreview.sueldoProporcional+liqPreview.difSueldoMinimo+liqPreview.recargHorasExtra+liqPreview.recargDiasDomingo)}</span>
              </div>
            )}
          </div>

          <div style={s.secTitle(B.blue)}>🏠 Haberes No Imponibles</div>
          <div style={s.card}>
            <div style={s.grid(185)}>
              {[['cargas','N° Cargas Familiares','number'],['valorCarga','Valor por Carga ($)','number'],['colacion','Colación ($)','number'],['movilizacion','Movilización ($)','number']].map(([id,label,type])=>(
                <div key={id}><label style={s.lbl}>{label}</label>
                  <input type={type} placeholder="0" value={formLiq[id]} onChange={e=>setFormLiq(p=>({...p,[id]:e.target.value}))} style={s.inp}/>
                </div>
              ))}
            </div>
          </div>

          <div style={s.secTitle(B.dim)}>➖ Otros Descuentos</div>
          <div style={s.card}>
            <div style={s.grid(185)}>
              <div>
                <label style={s.lbl}>Seguro de Cesantía ($) — ingreso manual</label>
                <input type="number" placeholder="0" value={formLiq.afcManual} onChange={e=>setFormLiq(p=>({...p,afcManual:e.target.value}))} style={s.inp}/>
                <div style={{fontSize:9,color:B.dim,marginTop:3}}>Dejar en 0 si no aplica (ej. &gt;10 años servicio)</div>
              </div>
              {[['anticipos','Anticipos ($)','number'],['otrosDescuentos','Otros Descuentos ($)','number']].map(([id,label,type])=>(
                <div key={id}><label style={s.lbl}>{label}</label>
                  <input type={type} placeholder="0" value={formLiq[id]} onChange={e=>setFormLiq(p=>({...p,[id]:e.target.value}))} style={s.inp}/>
                </div>
              ))}
            </div>
          </div>

          {/* PREVIEW LIQUIDACIÓN */}
          {liqPreview&&trabSel&&(
            <>
              <div style={s.secTitle(B.red)}>📄 Vista Previa — {trabSel.nombre} {trabSel.apellidos}</div>
              <div style={{...s.card,padding:0,overflow:'hidden'}}>
                <div style={{padding:'12px 14px',background:'#0A0A0A',borderBottom:`1px solid ${B.border}`}}>
                  <div style={{fontSize:13,fontWeight:800}}>{trabSel.nombre} {trabSel.apellidos}</div>
                  <div style={{fontSize:10,color:B.dim}}>{trabSel.cargo} · {trabSel.rut} · {mes(periodo)}</div>
                </div>

                <div style={{fontSize:9,fontWeight:800,color:B.green,padding:'8px 14px 2px',letterSpacing:1,textTransform:'uppercase'}}>Haberes Imponibles</div>
                <LiqRow label="Sueldo Base" value={liqPreview.sueldoProporcional} indent sub={`${formLiq.diasTrabajados||30}/30 días`}/>
                <LiqRow label="Diferencia Sueldo Mínimo" value={liqPreview.difSueldoMinimo} indent/>
                {liqPreview.recargHorasExtra>0&&<LiqRow label="Recargo Horas Extra" value={liqPreview.recargHorasExtra} indent sub={`${formLiq.horasExtra||0} hrs`}/>}
                {liqPreview.recargDiasDomingo>0&&<LiqRow label="Días Domingos y Festivos" value={liqPreview.recargDiasDomingo} indent sub={`${formLiq.diasDomingo||0} días`}/>}
                <LiqRow label="Gratificación Legal (25%)" value={liqPreview.gratificacion} indent/>
                <LiqRow label="Total Imponible" value={liqPreview.totalImponible} bold border/>

                {liqPreview.totalNoImponible>0&&(
                  <>
                    <div style={{fontSize:9,fontWeight:800,color:B.blue,padding:'8px 14px 2px',letterSpacing:1,textTransform:'uppercase'}}>Haberes No Imponibles</div>
                    {liqPreview.asigCargas>0&&<LiqRow label={`Cargas Familiares (${formLiq.cargas||0})`} value={liqPreview.asigCargas} indent/>}
                    {liqPreview.colacion>0&&<LiqRow label="Colación" value={liqPreview.colacion} indent/>}
                    {liqPreview.movilizacion>0&&<LiqRow label="Movilización" value={liqPreview.movilizacion} indent/>}
                    <LiqRow label="Total No Imponible" value={liqPreview.totalNoImponible} bold border/>
                  </>
                )}

                <LiqRow label="TOTAL HABERES" value={liqPreview.totalHaberes} bold border color={B.text}/>

                <div style={{fontSize:9,fontWeight:800,color:B.red,padding:'8px 14px 2px',letterSpacing:1,textTransform:'uppercase'}}>Descuentos Legales</div>
                <LiqRow label={`AFP — Comisión (${formPreview.afpComision||0.58}%)`} value={-liqPreview.dscAfpTotal} indent color={B.red}/>
                <LiqRow label={`Salud (${formPreview.salud==='isapre'?'Isapre':'Fonasa 7%'})`} value={-liqPreview.dscSalud} indent color={B.red}/>
                {liqPreview.dscAfcTrab>0&&<LiqRow label="Seguro de Cesantía" value={-liqPreview.dscAfcTrab} indent color={B.red}/>}
                {liqPreview.impuestoUnico>0&&<LiqRow label="Impuesto Único 2ª Cat." value={-liqPreview.impuestoUnico} indent color={B.red}/>}
                <LiqRow label="Total Descuentos Legales" value={-liqPreview.totalDescuentosLegales} bold border color={B.red}/>

                <LiqRow label="ALCANCE LÍQUIDO" value={liqPreview.alcanceLiquido} bold border color={B.orange}/>

                {liqPreview.totalOtrosDesc>0&&(
                  <>
                    {liqPreview.anticipos>0&&<LiqRow label="Anticipos" value={-liqPreview.anticipos} indent color={B.red}/>}
                    {liqPreview.otrosDesc>0&&<LiqRow label="Otros Descuentos" value={-liqPreview.otrosDesc} indent color={B.red}/>}
                  </>
                )}

                <LiqRow label="TOTAL LÍQUIDO A PAGAR" value={liqPreview.liquidoAPagar} bold border color={B.green}/>

                <div style={{fontSize:9,fontWeight:800,color:B.yellow,padding:'8px 14px 2px',letterSpacing:1,textTransform:'uppercase'}}>Aportes Empleador</div>
                <LiqRow label={`AFC Empleador (${formPreview.tipoContrato==='indefinido'?'2.4%':'3.0%'})`} value={liqPreview.aporteAfcEmp} indent color={B.dim}/>
                <LiqRow label="SIS (1.49%)" value={liqPreview.aporteSis} indent color={B.dim}/>
                <LiqRow label="Mutual (0.90%)" value={liqPreview.aporteMutual} indent color={B.dim}/>
                <LiqRow label="Total Aportes Empleador" value={liqPreview.totalAportesEmp} bold border color={B.yellow}/>
                <LiqRow label="COSTO TOTAL EMPRESA" value={liqPreview.costoTotalEmpresa} bold color={B.text}/>
                <LiqRow label="Total Imposiciones a Pagar (Previred)" value={liqPreview.totalImposiciones} bold border color={B.purple}/>
              </div>
            </>
          )}

          <div style={{display:'flex',justifyContent:'flex-end',marginTop:14,gap:8}}>
            <button style={s.btn(B.border,B.text)} onClick={()=>{setFormLiq(EMPTY_FORM);setEditLiqId(null);setTab('lista');}}>Cancelar</button>
            <button style={s.btn()} onClick={saveLiq}>💾 Guardar Liquidación</button>
          </div>
        </>
      )}
    </div>
  );

  // ════════════════════════════════════════
  // TAB: LISTA LIQUIDACIONES
  // ════════════════════════════════════════
  const renderLista = () => (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:10}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <label style={{...s.lbl,marginBottom:0}}>PERÍODO</label>
          <input type="month" value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{...s.inp,width:'auto'}}/>
          <span style={{fontSize:11,color:B.dim}}>{liquidaciones.length} liquidaciones</span>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button style={s.btn(B.purple)} onClick={()=>imprimirLibro(liquidaciones,periodo,empresa,params)}>📚 Libro Remuneraciones PDF</button>
          <button style={s.btn()} onClick={()=>{setFormLiq(EMPTY_FORM);setEditLiqId(null);setTab('nueva');}}>+ Nueva liquidación</button>
        </div>
      </div>

      {liquidaciones.length===0?(
        <div style={{...s.card,textAlign:'center',color:B.dim,padding:48}}>
          <div style={{fontSize:32,marginBottom:8}}>📄</div>
          <div style={{fontWeight:700}}>Sin liquidaciones para {mes(periodo)}</div>
        </div>
      ):(
        <>
          {/* RESUMEN TOTALES */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10,marginBottom:14}}>
            {[
              {label:'Total Haberes',val:totalesPeriodo.haberes,color:B.text},
              {label:'Total Líquido a Pagar',val:totalesPeriodo.liquido,color:B.green},
              {label:'Total Imposiciones',val:totalesPeriodo.imposic,color:B.purple},
              {label:'Costo Total Empresa',val:totalesPeriodo.costoTotal,color:B.yellow},
            ].map(({label,val,color})=>(
              <div key={label} style={{...s.card,borderTop:`2px solid ${color}`}}>
                <div style={{fontSize:8,color:B.dim,fontWeight:800,letterSpacing:1.5,textTransform:'uppercase',marginBottom:6}}>{label}</div>
                <div style={{fontFamily:'monospace',fontSize:17,fontWeight:800,color}}>{fmt(val)}</div>
              </div>
            ))}
          </div>

          <div style={{...s.card,padding:0,overflow:'hidden'}}>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr>{['Trabajador','Cargo','Total Impon.','Haberes','Descuentos','Líquido a Pagar','Imposiciones',''].map(h=><th key={h} style={s.thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {liquidaciones.map((e,i)=>{
                    const l = e.liq;
                    const nombre = e.trabajador ? `${e.trabajador.nombre} ${e.trabajador.apellidos}` : e.form?.nombre||'—';
                    return (
                      <tr key={e.id} style={{background:i%2===0?B.card:'#111',borderBottom:`1px solid ${B.border}`}}>
                        <td style={{...s.tdStyle,fontWeight:700,color:B.red,whiteSpace:'nowrap'}}>{nombre}</td>
                        <td style={s.tdStyle}>{e.trabajador?.cargo||'—'}</td>
                        <td style={{...s.tdStyle,fontFamily:'monospace'}}>{fmt(l.totalImponible)}</td>
                        <td style={{...s.tdStyle,fontFamily:'monospace'}}>{fmt(l.totalHaberes)}</td>
                        <td style={{...s.tdStyle,fontFamily:'monospace',color:B.red}}>{fmt(l.totalDescuentosLegales)}</td>
                        <td style={{...s.tdStyle,fontFamily:'monospace',fontWeight:800,color:B.green}}>{fmt(l.liquidoAPagar)}</td>
                        <td style={{...s.tdStyle,fontFamily:'monospace',color:B.purple}}>{fmt(l.totalImposiciones)}</td>
                        <td style={{...s.tdStyle,whiteSpace:'nowrap'}}>
                          <div style={{display:'flex',gap:4}}>
                            <button style={{...s.btn(B.border,B.text),padding:'3px 7px',fontSize:10}} onClick={()=>{
                              setFormLiq({...e.form,trabajadorId:e.trabajadorId||e.form?.trabajadorId});
                              setEditLiqId(e.id); setTab('nueva');
                            }}>✏️</button>
                            <button style={{...s.btn(B.blue+'22',B.blue),padding:'3px 7px',fontSize:10}} onClick={()=>imprimirLiq(e.trabajador||{},e.form,l,periodo,params,empresa)} title="Imprimir">🖨️</button>
                            <button style={{...s.btn(B.red+'22',B.red),padding:'3px 7px',fontSize:10}} onClick={()=>setDelConfirm({type:'liq',id:e.id,nombre})}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* DESGLOSE IMPOSICIONES */}
          <div style={s.secTitle(B.purple)}>📊 Desglose Imposiciones — {mes(periodo)}</div>
          <div style={{...s.card,padding:0,overflow:'hidden'}}>
            {[
              ['AFP (trabajadores)',totalesPeriodo.afp],
              ['Salud (Fonasa/Isapre)',totalesPeriodo.salud],
              ['Seg. Cesantía Trabajadores',totalesPeriodo.afc],
              ['Seg. Cesantía Empleador',totalesPeriodo.afcEmp],
              ['SIS Empleador',totalesPeriodo.sis],
              ['Mutual Empleador',totalesPeriodo.mutual],
              ['Impuesto Único (al Fisco)',totalesPeriodo.impuesto],
            ].map(([l,v])=><LiqRow key={l} label={l} value={v} indent/>)}
            <LiqRow label="TOTAL A PAGAR EN PREVIRED" value={totalesPeriodo.imposic} bold border color={B.purple}/>
          </div>
        </>
      )}
    </div>
  );

  // ════════════════════════════════════════
  // TAB: PARÁMETROS
  // ════════════════════════════════════════
  const renderParams = () => (
    <div>
      <div style={s.secTitle(B.red)}>🏢 Datos de la Empresa</div>
      <div style={s.card}>
        <div style={s.grid(220)}>
          {[['razonSocial','Razón Social'],['rut','RUT Empresa'],['direccion','Dirección']].map(([id,label])=>(
            <div key={id}><label style={s.lbl}>{label}</label>
              <input type="text" value={empresa[id]||''} onChange={e=>setEmpresa(p=>({...p,[id]:e.target.value}))} style={s.inp} placeholder={label}/>
            </div>
          ))}
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}>
          <button style={s.btn()} onClick={async()=>{await window.storage.set('rb-empresa',JSON.stringify(empresa));showToast('✔ Empresa guardada');}}>💾 Guardar</button>
        </div>
      </div>

      <div style={s.secTitle(B.yellow)}>⚙️ Parámetros Legales Chile 2026</div>
      <div style={s.card}>
        <div style={s.grid(200)}>
          {[
            ['UF','Valor UF ($)'],['UTM','Valor UTM ($)'],['IMM','Ingreso Mínimo Mensual ($)'],
            ['TOPE_AFP_SALUD_UF','Tope AFP/Salud (UF)'],['TOPE_AFC_UF','Tope AFC (UF)'],
            ['AFP_TASA','AFP Obligatorio (%)'],['SALUD_TASA','Salud (%)'],
            ['AFC_TRABAJADOR_INDEFINIDO','AFC Trabajador Indef. (%)'],
            ['AFC_EMPLEADOR_INDEFINIDO','AFC Empleador Indef. (%)'],
            ['AFC_EMPLEADOR_PLAZOFIJO','AFC Empleador Plazo Fijo (%)'],
            ['SIS_EMPLEADOR','SIS Empleador (%)'],['MUTUAL_BASICA','Mutual Básica (%)'],
          ].map(([id,label])=>(
            <div key={id}><label style={s.lbl}>{label}</label>
              <input type="number" step="0.01" value={params[id]} onChange={e=>setParams(p=>({...p,[id]:parseFloat(e.target.value)||0}))} style={s.inp}/>
            </div>
          ))}
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}>
          <button style={s.btn()} onClick={async()=>{await window.storage.set('rb-params:legal2',JSON.stringify(params));showToast('✔ Parámetros guardados');}}>💾 Guardar parámetros</button>
        </div>
      </div>

      <div style={{...s.card,marginTop:12,fontSize:11,color:B.dim,lineHeight:1.7}}>
        <strong style={{color:B.text}}>📌 Notas legales:</strong><br/>
        • Gratificación = 25% de (sueldo proporcional + dif. sueldo mínimo + horas extra + días domingo)<br/>
        • AFP y Salud se calculan sobre el <strong style={{color:B.text}}>Total Imponible</strong> (con tope de {params.TOPE_AFP_SALUD_UF} UF)<br/>
        • El Impuesto Único se calcula sobre la <strong style={{color:B.text}}>Base Tributable</strong> = Total Imponible - AFP - Salud - AFC<br/>
        • Verificar valores actualizados en <strong style={{color:B.text}}>previred.com</strong> y <strong style={{color:B.text}}>dt.gob.cl</strong>
      </div>
    </div>
  );

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  const TABS = [
    {k:'trabajadores',label:'👥 Trabajadores'},
    {k:'nueva',label:'➕ Nueva Liquidación'},
    {k:'lista',label:'📋 Lista del Período'},
    {k:'params',label:'⚙️ Parámetros'},
  ];

  return (
    <div style={{fontFamily:"'Inter','Helvetica Neue',sans-serif",color:B.text,fontSize:14}}>
      <div style={{display:'flex',gap:6,marginBottom:18,flexWrap:'wrap'}}>
        {TABS.map(t=>(
          <button key={t.k} style={s.subtabBtn(tab===t.k)} onClick={()=>setTab(t.k)}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{textAlign:'center',color:B.dim,padding:40}}>Cargando…</div>
      ) : (
        <>
          {tab==='trabajadores' && renderTrabajadores()}
          {tab==='nueva'        && renderNueva()}
          {tab==='lista'        && renderLista()}
          {tab==='params'       && renderParams()}
        </>
      )}

      {/* CONFIRM DELETE */}
      {delConfirm&&(
        <div style={{position:'fixed',inset:0,background:'#000c',display:'grid',placeItems:'center',zIndex:300}}>
          <div style={{background:B.card,border:`1px solid ${B.red}`,borderRadius:10,padding:28,maxWidth:320,textAlign:'center'}}>
            <div style={{fontSize:28,marginBottom:8}}>🗑️</div>
            <div style={{fontSize:14,fontWeight:800,marginBottom:8}}>¿Eliminar {delConfirm.nombre}?</div>
            <div style={{fontSize:12,color:B.dim,marginBottom:20}}>Esta acción no se puede deshacer.</div>
            <div style={{display:'flex',gap:10,justifyContent:'center'}}>
              <button style={s.btn(B.red)} onClick={()=>delConfirm.type==='trab'?deleteTrab(delConfirm.id):deleteLiq(delConfirm.id)}>Eliminar</button>
              <button style={s.btn(B.border,B.text)} onClick={()=>setDelConfirm(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast&&(
        <div style={{position:'fixed',bottom:24,right:24,zIndex:400,background:toast.type==='err'?B.red:B.green,color:'#000',padding:'10px 20px',borderRadius:8,fontSize:13,fontWeight:800,boxShadow:'0 4px 24px #0009'}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
