const S = n => 'S/ ' + Number(n || 0).toFixed(2);
const firmado = n => (Number(n) < 0 ? '−' : '') + S(Math.abs(Number(n)));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const J = v => (typeof v === 'string' ? JSON.parse(v) : (v || null));
const EMOJI = { 'Comida': '🍔', 'Transporte': '🚕', 'Ocio': '🎮', 'Compras': '🛍️', 'Salud': '💊', 'Educación': '📚', 'Servicios': '💡', 'Hogar': '🏠', 'Otros': '📦' };
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const barra = p => { const b = Math.min(10, Math.max(1, Math.round(p / 10))); return '▓'.repeat(b) + '░'.repeat(10 - b); };
const cuando = iso => DateTime.fromISO(String(iso)).setZone('America/Lima').toFormat('dd/MM HH:mm');
const hoyL = $now.setZone('America/Lima');
const nombreMes = hoyL.setLocale('es').toFormat('LLLL');

const AYUDA = [
  '🤖 <b>Contador personal</b>',
  '',
  '<b>Registrar</b>',
  '• Escribe: <i>15 almuerzo</i>, <i>taxi 12.50</i>, <i>ayer 30 cine</i>',
  '• 📱 Mándame la captura del Yape (pago enviado o recibido)',
  '• 🎙️ Mándame una nota de voz: <i>"gasté veinte en taxi"</i>',
  '• 💰 Ingresos: <i>me pagaron 1500 de sueldo</i> o /ingreso 1500 sueldo',
  '• 🏦 Los consumos que te llegan al correo del banco se registran solos',
  '',
  '<b>Consultas</b>',
  '/hoy · /ayer · /semana · /mes · /mesanterior',
  '/ultimos – últimos 10 gastos',
  '/balance – ingresos vs gastos del mes',
  '',
  '<b>Presupuestos</b>',
  '/presupuesto comida 400 – límite mensual',
  '/presupuesto comida 0 – lo quita',
  '/presupuestos – cómo vas este mes',
  '',
  '<b>Pagos recurrentes</b>',
  '/recurrente 29.90 spotify dia 5',
  '/recurrentes – ver todos',
  '/quitarrec 3 – quitar el #3',
  '',
  '<b>Corregir</b>',
  '/cat comida · /motivo almuerzo · /borrar – último gasto',
  '/borraringreso – último ingreso',
  '',
  'Categorías: ' + Object.keys(EMOJI).join(', '),
  '',
  '📅 <b>Agenda</b> (escribe o manda audio normal)',
  '• <i>recuérdame pagar la luz el viernes a las 6pm</i>',
  '• <i>todos los días a las 10pm tomar pastilla</i>',
  '• <i>tengo que llamar al banco el lunes</i> → tarea',
  '• <i>reunión con Carlos el martes a las 3pm</i> → Google Calendar',
  '/agenda – eventos, recordatorios y tareas de la semana',
  '/tareas · /tarea texto · /hecha 3 · /borrartarea 3',
  '/recordatorios · /cancelar 3 · /posponer 15',
  '',
  '📈 <b>Análisis</b>',
  '/grafico – gastos del mes por categoría',
  '/grafico meses · /grafico dias',
  '/excel – tus movimientos en Excel (/excel mesanterior · /excel todo)',
  '',
  '🤝 <b>Deudas</b>: <i>le presté 50 a Juan</i>, <i>le debo 30 a Ana</i>, <i>Juan me pagó 20</i>',
  '/deudas · /saldar juan · /borrardeuda',
  '',
  '🎯 <b>Metas de ahorro</b>: <i>quiero ahorrar 2000 para una laptop para diciembre</i>',
  '/metas · /meta 2000 laptop · /ahorro 100 laptop · /quitarmeta 2',
  '',
  '💬 <b>Pregúntame lo que quieras</b>',
  '<i>¿cuánto gasté en uber este mes?</i> · <i>¿qué tareas tengo hoy?</i> · <i>¿para qué sirves?</i>',
  '',
  '⏰ Agenda 7 am · Recurrentes 8 am · Gastos del día 12 am',
  '📊 Reporte de gastos lunes 7 am · 🗓️ Revisión semanal domingo 8 pm',
].join('\n');

// ---------- Agenda ----------
const PRIO = { 1: '🔴', 2: '🟡', 3: '⚪' };
const REP = { diario: 'diario', semanal: 'semanal', mensual: 'mensual', laborables: 'lun–vie' };
const DIA_L = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const hoyYMD = hoyL.toFormat('yyyy-MM-dd'), mananaYMD = hoyL.plus({ days: 1 }).toFormat('yyyy-MM-dd');
const diaCorto = ymd => {
  if (ymd === hoyYMD) return 'Hoy';
  if (ymd === mananaYMD) return 'Mañana';
  const d = DateTime.fromISO(ymd).setLocale('es');
  return `${DIA_L[d.weekday]} ${d.day} ${d.toFormat('LLL').replace('.', '')}`;
};
const lineaTarea = t => {
  const v = t.vence ? (t.vencida ? ` · ⚠️ venció ${diaCorto(t.vence).toLowerCase()}` : ` · 📅 ${diaCorto(t.vence).toLowerCase()}`) : '';
  return `${PRIO[t.prioridad] || '🟡'} #${t.id} ${esc(t.texto)}${v}`;
};
const lineaEvento = e => `• ${e.hora ? e.hora + (e.hasta ? '–' + e.hasta : '') : 'Todo el día'} ${esc(e.titulo)}${e.lugar ? ' 📍 ' + esc(e.lugar) : ''}`;
function porDia(lista, fmt) {
  const L = [];
  let ult = null;
  for (const x of lista) {
    if (x.dia !== ult) { L.push(`<u>${diaCorto(x.dia)}</u>`); ult = x.dia; }
    L.push(fmt(x));
  }
  return L;
}
function climaTexto(c) {
  if (!c || c.max === undefined || c.max === null) return null;
  const k = Number(c.code);
  const [ico, txt] = k === 0 ? ['☀️', 'despejado'] : k <= 2 ? ['🌤️', 'parcialmente nublado'] : k === 3 ? ['☁️', 'nublado']
    : k <= 48 ? ['🌫️', 'neblina'] : k <= 57 ? ['🌦️', 'llovizna'] : k <= 67 ? ['🌧️', 'lluvia'] : k <= 82 ? ['🌧️', 'chubascos'] : ['⛈️', 'tormenta'];
  return `${ico} Lima: ${Math.round(c.min)}°–${Math.round(c.max)}°, ${txt}${c.lluvia ? ` · lluvia ${c.lluvia}%` : ''}`;
}
function agendaTexto(r) {
  const ev = J(r.eventos) || [], rec = J(r.recordatorios) || [], tar = J(r.tareas) || [];
  const L = [];
  const calAviso = r.cal_ok ? null : '<i>⚠️ No pude leer tu Google Calendar (revisa la credencial del nodo "Calendar eventos").</i>';
  const bloqueTareas = (titulo) => {
    if (!tar.length) return ['✅ Sin tareas pendientes'];
    const B = [`📝 <b>${titulo}</b> (${r.n_pendientes}${Number(r.n_vencidas) ? `, ${r.n_vencidas} vencida${Number(r.n_vencidas) === 1 ? '' : 's'}` : ''})`];
    B.push(...tar.map(lineaTarea));
    if (Number(r.n_pendientes) > tar.length) B.push(`<i>… y ${r.n_pendientes - tar.length} más en /tareas</i>`);
    return B;
  };

  if (r.origen === 'manana') {
    L.push(`☀️ <b>Buenos días</b> — ${hoyL.setLocale('es').toFormat("cccc d 'de' LLLL")}`);
    const cl = climaTexto(J(r.clima));
    if (cl) L.push(cl);
    L.push('', '📅 <b>Hoy</b>');
    if (ev.length) L.push(...ev.map(lineaEvento)); else if (r.cal_ok) L.push('Nada en el calendario 🙌');
    if (calAviso) L.push(calAviso);
    if (rec.length) { L.push('', '⏰ <b>Recordatorios</b>'); L.push(...rec.map(x => `• ${x.hora} ${esc(x.texto)}${x.repetir ? ' 🔁' : ''}`)); }
    L.push('', ...bloqueTareas('Tareas'));
    L.push('', `💸 Ayer gastaste <b>${S(r.gasto_ayer)}</b> · En el mes: ${S(r.gasto_mes)}`);
    return L.join('\n');
  }

  if (r.origen === 'semana') {
    L.push('🗓️ <b>Revisión semanal</b>', '');
    const hechas = J(r.hechas_semana) || [];
    if (hechas.length) {
      L.push(`✅ <b>Completaste ${r.n_hechas_semana} tarea${Number(r.n_hechas_semana) === 1 ? '' : 's'}</b>`);
      L.push(...hechas.slice(0, 8).map(t => `• ${esc(t.texto)}`));
      if (Number(r.n_hechas_semana) > 8) L.push(`<i>… y ${r.n_hechas_semana - 8} más</i>`);
    } else L.push('Esta semana no marcaste tareas como hechas.');
    L.push('', ...bloqueTareas('Pendientes'));
    L.push('', '📅 <b>Tu próxima semana</b>');
    if (ev.length) L.push(...porDia(ev, lineaEvento)); else if (r.cal_ok) L.push('Nada en el calendario todavía.');
    if (calAviso) L.push(calAviso);
    if (rec.length) { L.push('', '⏰ <b>Recordatorios de la semana</b>'); L.push(...porDia(rec, x => `• ${x.hora} ${esc(x.texto)}${x.repetir ? ' 🔁' : ''}`)); }
    L.push('', `💸 Esta semana gastaste <b>${S(r.gasto_semana)}</b> · En el mes: ${S(r.gasto_mes)}`);
    if (Number(r.te_deben) || Number(r.debes)) L.push(`🤝 Te deben ${S(r.te_deben)} · Debes ${S(r.debes)} (/deudas)`);
    const mts = J(r.metas) || [];
    if (mts.length) L.push('', '🎯 <b>Metas</b>', ...metasTexto(mts, true));
    L.push('', '<i>Tip: marca lo que ya hiciste con /hecha y borra lo que ya no va con /borrartarea.</i>');
    return L.join('\n');
  }

  // /agenda
  L.push('📅 <b>Tu agenda</b> (próximos 7 días)', '');
  if (ev.length) L.push(...porDia(ev, lineaEvento)); else if (r.cal_ok) L.push('Nada en el calendario 🙌');
  if (calAviso) L.push(calAviso);
  if (rec.length) { L.push('', '⏰ <b>Recordatorios</b>'); L.push(...porDia(rec, x => `• ${x.hora} ${esc(x.texto)}${x.repetir ? ' 🔁' : ''}`)); }
  L.push('', ...bloqueTareas('Tareas'));
  return L.join('\n');
}

function reporteTexto(r) {
  const total = Number(r.total), n = Number(r.n);
  const icono = r.tipo === 'diario' ? '🌙' : (r.tipo === 'semanal' ? '📅' : '📊');
  if (!n) {
    return `${icono} <b>${esc(r.titulo)}</b>\nSin gastos registrados${r.tipo === 'diario' ? ' 🎉' : '.'}`;
  }
  const L = [`${icono} <b>${esc(r.titulo)}</b>`, `Total: <b>${S(total)}</b> en ${n} gasto${n === 1 ? '' : 's'}`, ''];
  for (const c of J(r.categorias) || []) {
    const pct = total ? (Number(c.total) / total) * 100 : 0;
    L.push(`${EMOJI[c.categoria] || '📦'} ${esc(c.categoria)}: <b>${S(c.total)}</b> (${pct.toFixed(0)}%)`);
    L.push(`<code>${barra(pct)}</code>`);
  }
  if (r.mostrar_dias) {
    const dias = J(r.por_dia) || [];
    if (dias.length) {
      L.push('', '<b>Por día</b>');
      for (const d of dias) {
        const dt = DateTime.fromISO(d.dia);
        L.push(`${DIAS[dt.weekday % 7]} ${dt.toFormat('dd/MM')}: ${S(d.total)}`);
      }
      L.push(`<i>Promedio por día con gastos: ${S(total / dias.length)}</i>`);
    }
  }
  if (r.mostrar_detalle) {
    const det = J(r.detalle) || [];
    L.push('', '<b>Detalle</b>');
    const ICON = { yape: ' 📱', voz: ' 🎙️', correo: ' 🏦', recurrente: ' 🔁' };
    for (const d of det.slice(0, 30)) {
      L.push(`${d.hora} · ${S(d.monto)} · ${esc(d.descripcion || 'sin motivo')} ${EMOJI[d.categoria] || ''}${ICON[d.metodo] || ''}`);
    }
    if (det.length > 30) L.push(`… y ${det.length - 30} más`);
  }
  return L.join('\n');
}

function balanceTexto(r) {
  const ing = Number(r.ingresos), gas = Number(r.gastos), bal = ing - gas;
  const L = [
    `💼 <b>Balance de ${nombreMes}</b>`,
    `➕ Ingresos: <b>${S(ing)}</b>`,
    `➖ Gastos: <b>${S(gas)}</b>`,
    `${bal >= 0 ? '🟢' : '🔴'} Balance: <b>${firmado(bal)}</b>`,
  ];
  if (ing > 0) L.push(`<i>Llevas gastado el ${(gas / ing * 100).toFixed(0)}% de lo que ingresó</i>`);
  const ia = Number(r.ingresos_ant), ga = Number(r.gastos_ant);
  if (ia || ga) L.push('', `Mes anterior: ${S(ia)} − ${S(ga)} = <b>${firmado(ia - ga)}</b>`);
  const det = J(r.detalle) || [];
  if (r.origen !== 'reporte' && det.length) {
    L.push('', '<b>Ingresos del mes</b>');
    for (const d of det) L.push(`${d.dia} · ${S(d.monto)} · ${esc(d.descripcion || 'sin motivo')}`);
  }
  if (!ing) L.push('', '<i>Registra ingresos con /ingreso 1500 sueldo o escribiendo "me pagaron 1500".</i>');
  return L.join('\n');
}

function presupuestosTexto(r) {
  const filas = J(r.filas) || [];
  if (!filas.length) {
    if (r.origen === 'reporte') return null;
    return '🎯 Aún no tienes presupuestos.\nCrea uno con /presupuesto comida 400';
  }
  const fin = hoyL.daysInMonth, dia = hoyL.day, quedanDias = fin - dia + 1;
  const L = [`🎯 <b>Presupuestos de ${nombreMes}</b>`, ''];
  let tp = 0, tg = 0;
  for (const f of filas) {
    const p = Number(f.presupuesto), g = Number(f.gastado), pct = p ? g / p * 100 : 0;
    tp += p; tg += g;
    const flag = pct >= 100 ? '🚨' : (pct >= 80 ? '⚠️' : '✅');
    L.push(`${flag} ${EMOJI[f.categoria] || '📦'} ${esc(f.categoria)}: <b>${S(g)}</b> de ${S(p)} (${pct.toFixed(0)}%)`);
    L.push(`<code>${barra(pct)}</code>${pct < 100 ? ` quedan ${S(p - g)}` : ` te pasaste ${S(g - p)}`}`);
  }
  const libre = tp - tg;
  L.push('', `Total: ${S(tg)} de ${S(tp)}`);
  if (libre > 0) L.push(`Te quedan <b>${S(libre)}</b> para ${quedanDias} día${quedanDias === 1 ? '' : 's'} (≈ ${S(libre / quedanDias)} por día)`);
  L.push(`<i>Van ${dia} de ${fin} días del mes (${(dia / fin * 100).toFixed(0)}%).</i>`);
  return L.join('\n');
}


// ---------- Gráficos (QuickChart → imagen) ----------
// Cada categoría tiene SIEMPRE el mismo color (paleta validada, orden fijo; "Otros" en gris)
const COLOR_CAT = { 'Comida': '#2a78d6', 'Transporte': '#eb6834', 'Ocio': '#1baf7a', 'Compras': '#eda100', 'Salud': '#e87ba4',
  'Educación': '#008300', 'Servicios': '#4a3aa7', 'Hogar': '#e34948', 'Otros': '#8a8986' };
const INK = '#52514e', GRID = '#e8e7e3';
const MESES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const quickchart = cfg => 'https://quickchart.io/chart?version=4&w=720&h=460&bkg=white&f=png&c=' + encodeURIComponent(JSON.stringify(cfg));
const ejes = (moneda = true) => ({
  x: { grid: { display: false }, ticks: { color: INK } },
  y: { beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { color: INK, ...(moneda ? {} : {}) } },
});
function grafico(r) {
  const d = J(r.datos) || [];
  if (r.subtipo === 'meses') {
    if (!d.some(x => Number(x.gastos) || Number(x.ingresos))) return { texto: '📊 Todavía no hay datos de los últimos meses para graficar.' };
    const labels = d.map(x => MESES[Number(x.mes.slice(5, 7))] + ' ' + x.mes.slice(2, 4));
    const cfg = { type: 'bar', data: { labels, datasets: [
      { label: 'Ingresos', data: d.map(x => Number(x.ingresos)), backgroundColor: '#2a78d6', borderRadius: 4, borderSkipped: 'start', maxBarThickness: 28 },
      { label: 'Gastos', data: d.map(x => Number(x.gastos)), backgroundColor: '#eb6834', borderRadius: 4, borderSkipped: 'start', maxBarThickness: 28 },
    ] }, options: { plugins: { title: { display: true, text: 'Ingresos vs gastos (S/) — últimos 6 meses', color: '#0b0b0b', font: { size: 16 } },
      legend: { position: 'top', labels: { color: INK } } }, scales: ejes() } };
    const ult = d[d.length - 1];
    return { foto: quickchart(cfg), texto: `📊 <b>Ingresos vs gastos</b>\nEste mes: ingresaste ${S(ult.ingresos)} y gastaste ${S(ult.gastos)}.` };
  }
  if (r.subtipo === 'dias') {
    const total = d.reduce((a, x) => a + Number(x.total), 0);
    if (!total) return { texto: '📊 Este mes todavía no tienes gastos para graficar.' };
    const cfg = { type: 'bar', data: { labels: d.map(x => String(Number(x.dia.slice(8, 10)))), datasets: [
      { label: 'Gasto del día', data: d.map(x => Number(x.total)), backgroundColor: '#2a78d6', borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22 },
    ] }, options: { plugins: { title: { display: true, text: `Gasto por día (S/) — ${nombreMes}`, color: '#0b0b0b', font: { size: 16 } }, legend: { display: false } }, scales: ejes() } };
    const top = d.reduce((a, x) => Number(x.total) > Number(a.total) ? x : a, d[0]);
    return { foto: quickchart(cfg), texto: `📊 <b>Gasto por día</b> (${nombreMes})\nTotal: ${S(total)} · Día más caro: ${Number(top.dia.slice(8, 10))} (${S(top.total)})` };
  }
  const total = d.reduce((a, x) => a + Number(x.total), 0);
  if (!total) return { texto: '📊 Este mes todavía no tienes gastos para graficar.' };
  const cfg = { type: 'doughnut', data: {
    labels: d.map(x => `${x.categoria}  S/ ${Number(x.total).toFixed(0)} (${(Number(x.total) / total * 100).toFixed(0)}%)`),
    datasets: [{ data: d.map(x => Number(x.total)), backgroundColor: d.map(x => COLOR_CAT[x.categoria] || '#8a8986'), borderColor: '#ffffff', borderWidth: 2 }],
  }, options: { cutout: '58%', plugins: {
    title: { display: true, text: `Gastos de ${nombreMes}: S/ ${total.toFixed(2)}`, color: '#0b0b0b', font: { size: 16 } },
    legend: { position: 'right', labels: { color: INK, boxWidth: 14, padding: 12 } },
    datalabels: { display: false } } } };
  return { foto: quickchart(cfg), texto: `📊 <b>Gastos de ${nombreMes}</b>: ${S(total)}\nLo que más pesa: ${esc(d[0].categoria)} (${(Number(d[0].total) / total * 100).toFixed(0)}%).\n<i>Más gráficos: /grafico meses · /grafico dias</i>` };
}

// ---------- Deudas y metas ----------
const titulo = s => String(s || '').replace(/(^|\s)\S/g, c => c.toUpperCase());
function metasTexto(filas, compacto = false) {
  const L = [];
  for (const m of filas) {
    const obj = Number(m.objetivo), aho = Number(m.ahorrado), pct = obj ? aho / obj * 100 : 0;
    L.push(`${pct >= 100 ? '🎉' : '🎯'} ${compacto ? '' : `#${m.id} `}<b>${esc(titulo(m.nombre))}</b>: ${S(aho)} de ${S(obj)}`);
    let extra = '';
    if (pct < 100 && m.fecha_limite) {
      const lim = DateTime.fromISO(m.fecha_limite, { zone: 'America/Lima' });
      const meses = Math.max(1, Math.ceil(lim.diff(hoyL, 'months').months));
      extra = ` · ${S((obj - aho) / meses)}/mes hasta ${MESES[lim.month]} ${lim.year}`;
    }
    L.push(`<code>${barra(pct)}</code> ${pct.toFixed(0)}%${extra}`);
  }
  return L;
}

function texto(r) {
  switch (r.tipo) {
    case 'ayuda': return AYUDA;
    case 'uso': return 'ℹ️ ' + esc(r.msg);
    case 'ultimos': {
      const filas = J(r.filas) || [];
      if (!filas.length) return 'Todavía no registraste gastos.';
      return ['🧾 <b>Últimos gastos</b>', ...filas.map(f =>
        `${f.cuando} · <b>${S(f.monto)}</b> · ${esc(f.descripcion || 'sin motivo')} ${EMOJI[f.categoria] || ''}`)].join('\n');
    }
    case 'borrar': {
      const f = J(r.fila);
      if (!f) return 'No hay gastos para borrar.';
      return `🗑️ Borré: <b>${S(f.monto)}</b> · ${esc(f.descripcion || 'sin motivo')} (${esc(f.categoria)}, ${cuando(f.fecha)})`;
    }
    case 'editado': {
      const f = J(r.fila);
      if (!f) return 'No hay gastos para editar.';
      return `✏️ Actualizado: <b>${S(f.monto)}</b> · ${esc(f.descripcion || 'sin motivo')} → ${EMOJI[f.categoria] || ''} ${esc(f.categoria)}`;
    }
    case 'cat_invalida': return 'Categoría no válida. Usa una de: ' + Object.keys(EMOJI).join(', ') + '\nEj: /cat transporte';
    case 'motivo_vacio': return 'Escribe el motivo después del comando. Ej: /motivo almuerzo con amigos';

    case 'ingreso_ok': {
      const f = J(r.fila) || {};
      const bal = Number(r.ingresos_mes) - Number(r.gastos_mes);
      return [
        '💰 <b>Ingreso registrado</b>',
        `➕ <b>${S(f.monto)}</b>${f.descripcion ? ' — ' + esc(f.descripcion) : ''}`,
        '',
        `Ingresos del mes: <b>${S(r.ingresos_mes)}</b>`,
        `Gastos del mes: <b>${S(r.gastos_mes)}</b>`,
        `${bal >= 0 ? '🟢' : '🔴'} Balance: <b>${firmado(bal)}</b>`,
      ].join('\n');
    }
    case 'borrar_ingreso': {
      const f = J(r.fila);
      if (!f) return 'No hay ingresos para borrar.';
      return `🗑️ Borré el ingreso: <b>${S(f.monto)}</b> · ${esc(f.descripcion || 'sin motivo')} (${cuando(f.fecha)})`;
    }
    case 'balance': return balanceTexto(r);

    case 'presupuestos': return presupuestosTexto(r);
    case 'presupuesto_ok': {
      const p = Number(r.monto), g = Number(r.gastado), pct = p ? g / p * 100 : 0;
      return `🎯 Presupuesto de ${EMOJI[r.categoria] || ''} ${esc(r.categoria)}: <b>${S(p)}</b> al mes.\nEste mes llevas ${S(g)} (${pct.toFixed(0)}%).\nTe aviso cuando llegues al 80% y si te pasas.`;
    }
    case 'presupuesto_borrado':
      return Number(r.n) ? `🗑️ Quité el presupuesto de ${esc(r.categoria)}.` : `No tenías presupuesto de ${esc(r.categoria)}.`;

    case 'recurrente_ok': {
      const f = J(r.fila) || {};
      return [
        '🔁 <b>Pago recurrente guardado</b>',
        `#${f.id} · ${esc(f.nombre)}: <b>${S(f.monto)}</b> el día ${f.dia} de cada mes (${EMOJI[f.categoria] || ''} ${esc(f.categoria)})`,
        f.ultimo_mes
          ? 'Como el día de cobro de este mes ya pasó, lo di por pagado: lo registro solo desde el próximo mes.'
          : 'Lo registro solo ese día a las 8 am.',
        'Te aviso un día antes. /recurrentes para ver todos.',
      ].join('\n');
    }
    case 'recurrentes': {
      const filas = J(r.filas) || [];
      if (!filas.length) return '🔁 No tienes pagos recurrentes.\nEj: /recurrente 29.90 spotify dia 5';
      const total = filas.reduce((a, f) => a + Number(f.monto), 0);
      return ['🔁 <b>Pagos recurrentes</b>', ...filas.map(f =>
        `#${f.id} · día ${f.dia} · ${esc(f.nombre)} · <b>${S(f.monto)}</b> ${EMOJI[f.categoria] || ''}`),
        '', `Total al mes: <b>${S(total)}</b>`, '<i>Para quitar uno: /quitarrec número</i>'].join('\n');
    }
    case 'recurrente_quitado': {
      const f = J(r.fila);
      if (!f) return 'No encontré ese recurrente. Míralos con /recurrentes';
      return `🗑️ Quité el recurrente #${f.id}: ${esc(f.nombre)} (${S(f.monto)}). Ya no lo registraré.`;
    }
    case 'recurrentes_dia': {
      const cob = J(r.cobrados) || [], man = J(r.manana) || [];
      if (!cob.length && !man.length) return null;
      const L = [];
      if (cob.length) {
        L.push('🔁 <b>Registré tus pagos recurrentes</b>');
        for (const f of cob) L.push(`• ${esc(f.nombre)}: <b>${S(f.monto)}</b> ${EMOJI[f.categoria] || ''}`);
        L.push('<i>Si alguno no se cobró, bórralo con /borrar.</i>');
      }
      if (man.length) {
        if (L.length) L.push('');
        L.push('⏰ <b>Mañana se cobra</b>');
        for (const f of man) L.push(`• ${esc(f.nombre)}: <b>${S(f.monto)}</b>`);
      }
      return L.join('\n');
    }
    // ---------- Agenda ----------
    case 'agenda': return agendaTexto(r);
    case 'tarea_ok': {
      const f = J(r.fila) || {};
      return `📝 <b>Tarea anotada</b> #${f.id}\n${PRIO[f.prioridad] || '🟡'} ${esc(f.texto)}\n\nTienes ${r.pendientes} pendiente${Number(r.pendientes) === 1 ? '' : 's'}. /tareas para verlas.`;
    }
    case 'tareas': {
      const filas = J(r.filas) || [];
      if (!filas.length) return `✅ No tienes tareas pendientes.${Number(r.hechas_semana) ? `\nEsta semana completaste ${r.hechas_semana} 💪` : ''}\nAnota una: <i>tengo que llamar al banco</i> o /tarea llamar al banco`;
      return ['📝 <b>Tareas pendientes</b>', ...filas.map(lineaTarea), '',
        Number(r.hechas_semana) ? `Esta semana completaste ${r.hechas_semana} 💪` : null,
        '<i>Marcar hecha: /hecha número · Borrar: /borrartarea número</i>'].filter(l => l !== null).join('\n');
    }
    case 'hecha': {
      const filas = J(r.filas) || [];
      if (!filas.length) return 'No encontré esa tarea pendiente. Míralas con /tareas';
      return [`✅ <b>¡Hecho${filas.length > 1 ? 's' : ''}!</b>`, ...filas.map(t => `• <s>${esc(t.texto)}</s>`), '',
        Number(r.pendientes) ? `Te quedan ${r.pendientes} pendiente${Number(r.pendientes) === 1 ? '' : 's'}.` : '🎉 ¡No te queda ninguna pendiente!'].join('\n');
    }
    case 'tarea_borrada': {
      const f = J(r.fila);
      return f ? `🗑️ Borré la tarea #${f.id}: ${esc(f.texto)}` : 'No encontré esa tarea. Míralas con /tareas';
    }
    case 'recordatorios': {
      const filas = J(r.filas) || [];
      if (!filas.length) return '⏰ No tienes recordatorios activos.\nCrea uno: <i>recuérdame llamar a mamá mañana a las 6pm</i>';
      return ['⏰ <b>Recordatorios activos</b>', ...filas.map(f => {
        const d = DateTime.fromISO(f.cuando, { zone: 'America/Lima' });
        return `#${f.id} · ${diaCorto(d.toFormat('yyyy-MM-dd'))} ${d.toFormat('HH:mm')} · ${esc(f.texto)}${f.repetir ? ` 🔁 ${REP[f.repetir] || f.repetir}` : ''}`;
      }), '', '<i>Para cancelar uno: /cancelar número</i>'].join('\n');
    }
    case 'cancelado': {
      const f = J(r.fila);
      return f ? `🔕 Cancelé el recordatorio #${f.id}: ${esc(f.texto)}` : 'No encontré ese recordatorio activo. Míralos con /recordatorios';
    }
    case 'pospuesto': {
      const f = J(r.fila);
      if (!f) return 'Todavía no te he mandado ningún recordatorio para posponer.';
      const m = Number(r.minutos);
      return `😴 Listo, te recuerdo "${esc(f.texto)}" en ${m >= 60 && m % 60 === 0 ? (m / 60) + ' h' : m + ' min'}.`;
    }
    // ---------- Análisis ----------
    case 'grafico': return grafico(r);

    // ---------- Deudas ----------
    case 'deudas': {
      const filas = J(r.filas) || [];
      if (!filas.length) return '🤝 No tienes deudas pendientes. Todo a mano ✅\nAnota una: <i>le presté 50 a Juan</i> o <i>le debo 30 a Ana</i>';
      const meDeben = filas.filter(f => Number(f.saldo) > 0), debo = filas.filter(f => Number(f.saldo) < 0);
      const L = ['🤝 <b>Deudas</b>'];
      if (meDeben.length) {
        L.push('', `💚 <b>Te deben</b> (${S(meDeben.reduce((a, f) => a + Number(f.saldo), 0))})`);
        L.push(...meDeben.map(f => `• ${esc(titulo(f.persona))}: ${S(f.saldo)}`));
      }
      if (debo.length) {
        L.push('', `🔴 <b>Debes</b> (${S(-debo.reduce((a, f) => a + Number(f.saldo), 0))})`);
        L.push(...debo.map(f => `• ${esc(titulo(f.persona))}: ${S(-Number(f.saldo))}`));
      }
      L.push('', '<i>Quedaron a mano: /saldar nombre</i>');
      return L.join('\n');
    }
    case 'saldado':
      return Number(r.n)
        ? `✅ Listo, con ${esc(titulo(r.persona))} ya están a mano (${Number(r.saldo_anterior) > 0 ? 'te debía' : 'le debías'} ${S(Math.abs(Number(r.saldo_anterior)))}).`
        : `No tenías nada pendiente con ${esc(titulo(r.persona))}.`;
    case 'deuda_borrada': {
      const f = J(r.fila);
      return f ? `🗑️ Borré el último movimiento de deudas: ${esc(titulo(f.persona))} ${S(Math.abs(Number(f.monto)))}` : 'No hay movimientos de deudas para borrar.';
    }

    // ---------- Metas ----------
    case 'metas': {
      const filas = J(r.filas) || [];
      if (!filas.length) return '🎯 No tienes metas de ahorro.\nCrea una: <i>quiero ahorrar 2000 para una laptop para diciembre</i> o /meta 2000 laptop';
      return ['🎯 <b>Tus metas de ahorro</b>', '', ...metasTexto(filas), '', '<i>Sumar: /ahorro 100 nombre · Quitar: /quitarmeta número</i>'].join('\n');
    }
    case 'meta_ok': {
      const f = J(r.fila) || {};
      return `🎯 <b>Meta creada</b> #${f.id}\n${esc(titulo(f.nombre))}: juntar <b>${S(f.objetivo)}</b>\n\nCuando separes plata: /ahorro 100 ${esc(f.nombre)}`;
    }
    case 'ahorro_ok': {
      const m = J(r.meta);
      if (!m) {
        const metas = J(r.metas) || [];
        return metas.length
          ? `🤔 ¿Para qué meta son los ${S(r.monto)}? Tienes: ${metas.map(x => esc(x.nombre)).join(', ')}.\nEj: /ahorro ${r.monto} ${esc(metas[0].nombre)}`
          : '🎯 Aún no tienes metas. Crea una con /meta 2000 laptop';
      }
      const pct = Number(m.objetivo) ? Number(m.ahorrado) / Number(m.objetivo) * 100 : 0;
      return `${pct >= 100 ? '🎉 <b>¡Meta cumplida!</b>' : '💰 <b>Ahorro anotado</b>'}\n+${S(r.monto)} para ${esc(titulo(m.nombre))}\n<code>${barra(pct)}</code> ${pct.toFixed(0)}% · ${S(m.ahorrado)} de ${S(m.objetivo)}`;
    }
    case 'meta_quitada': {
      const f = J(r.fila);
      return f ? `🗑️ Quité la meta #${f.id}: ${esc(titulo(f.nombre))}` : 'No encontré esa meta. Míralas con /metas';
    }
    default: return reporteTexto(r);
  }
}

// Junta los textos del mismo chat en un solo mensaje; los gráficos van como foto aparte
const porChat = {}, fotos = [];
for (const it of $input.all()) {
  const r = it.json;
  if (r.chat_id === undefined || r.chat_id === null) continue;
  const t = texto(r);
  if (!t) continue;
  if (typeof t === 'object') {
    if (t.foto) { fotos.push({ json: { ruta: 1, chat_id: r.chat_id, foto_url: t.foto, texto: t.texto } }); continue; }
    (porChat[r.chat_id] = porChat[r.chat_id] || []).push(t.texto);
    continue;
  }
  (porChat[r.chat_id] = porChat[r.chat_id] || []).push(t);
}
return [
  ...Object.entries(porChat).map(([chat_id, textos]) => ({ json: { ruta: 0, chat_id, texto: textos.join('\n\n━━━━━━━━━━\n\n') } })),
  ...fotos,
];
