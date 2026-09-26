const r = $input.first().json;
const S = n => 'S/ ' + Number(n || 0).toFixed(2);
const firmado = n => (Number(n) < 0 ? '−' : '') + S(Math.abs(Number(n)));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const EMOJI = { 'Comida': '🍔', 'Transporte': '🚕', 'Ocio': '🎮', 'Compras': '🛍️', 'Salud': '💊', 'Educación': '📚', 'Servicios': '💡', 'Hogar': '🏠', 'Otros': '📦' };

// Línea de presupuesto (si la categoría tiene uno)
function lineaPresupuesto(cat, presupuesto, gastado) {
  if (presupuesto === null || presupuesto === undefined) return [];
  const p = Number(presupuesto), g = Number(gastado);
  if (!(p > 0)) return [];
  const pct = g / p * 100;
  if (pct >= 100) return ['', `🚨 <b>Te pasaste</b> del presupuesto de ${esc(cat)}: ${S(g)} de ${S(p)} (${pct.toFixed(0)}%)`];
  if (pct >= 80) return ['', `⚠️ Llevas el ${pct.toFixed(0)}% del presupuesto de ${esc(cat)}: ${S(g)} de ${S(p)}. Te quedan ${S(p - g)}.`];
  return [`🎯 ${esc(cat)}: ${S(g)} de ${S(p)} (${pct.toFixed(0)}%)`];
}

const PRIO = { 1: '🔴', 2: '🟡', 3: '⚪' };
const REP = { diario: 'todos los días', semanal: 'cada semana', mensual: 'cada mes', laborables: 'de lunes a viernes' };
const fechaLarga = iso => {
  const d = DateTime.fromISO(String(iso), { zone: 'America/Lima' }).setLocale('es');
  return d.isValid ? d.toFormat("cccc d 'de' LLLL") : String(iso);
};

const titulo = s => String(s || '').replace(/(^|\s)\S/g, c => c.toUpperCase());
const saldoTexto = (persona, saldo) => {
  const v = Number(saldo);
  if (Math.abs(v) < 0.005) return `✅ Con ${esc(titulo(persona))} están a mano.`;
  return v > 0 ? `💚 ${esc(titulo(persona))} te debe <b>${S(v)}</b>` : `🔴 Le debes <b>${S(-v)}</b> a ${esc(titulo(persona))}`;
};
const barraMeta = p => { const b = Math.min(10, Math.max(0, Math.round(p / 10))); return '▓'.repeat(b) + '░'.repeat(10 - b); };

let texto;
if (r.clase === 'gastos') {
  const nuevos = (typeof r.nuevos === 'string' ? JSON.parse(r.nuevos) : r.nuevos) || [];
  const pres = (typeof r.presupuestos === 'string' ? JSON.parse(r.presupuestos) : r.presupuestos) || [];
  const L = [`✅ <b>Registré ${nuevos.length} gastos</b> · ${S(r.total)}`];
  for (const g of nuevos) L.push(`${EMOJI[g.categoria] || '📦'} <b>${S(g.monto)}</b>${g.descripcion ? ' — ' + esc(g.descripcion) : ''}`);
  L.push('', `Hoy llevas: <b>${S(r.total_hoy)}</b>`, `Este mes: <b>${S(r.total_mes)}</b>`);
  for (const p of pres) L.push(...lineaPresupuesto(p.categoria, p.presupuesto, p.gastado));
  L.push('', '<i>¿Alguno mal? /ultimos para verlos y /borrar quita el último.</i>');
  texto = L.join('\n');
} else if (r.clase === 'deuda') {
  const QUE = {
    le_preste: `Le prestaste ${S(r.monto)} a ${esc(titulo(r.persona))}`,
    me_prestaron: `Le debes ${S(r.monto)} a ${esc(titulo(r.persona))}`,
    me_pagaron: `${esc(titulo(r.persona))} te devolvió ${S(r.monto)}`,
    le_pague: `Le devolviste ${S(r.monto)} a ${esc(titulo(r.persona))}`,
  };
  texto = [`🤝 <b>Anotado</b>`, QUE[r.movimiento] || S(r.monto), '', saldoTexto(r.persona, r.saldo), '', '<i>Ver todas: /deudas</i>'].join('\n');
} else if (r.clase === 'meta') {
  texto = [
    '🎯 <b>Meta creada</b>',
    `${esc(titulo(r.nombre))}: juntar <b>${S(r.objetivo)}</b>${r.fecha_limite ? ` para el ${fechaLarga(r.fecha_limite)}` : ''}`,
    '',
    `Cuando separes plata dime <i>"ahorré 100 para ${esc(r.nombre)}"</i> o usa /ahorro 100 ${esc(r.nombre)}.`,
    '<i>Ver tus metas: /metas</i>',
  ].join('\n');
} else if (r.clase === 'ahorro') {
  const m = typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta;
  if (!m) {
    const metas = (typeof r.metas === 'string' ? JSON.parse(r.metas) : r.metas) || [];
    texto = metas.length
      ? `🤔 ¿Para qué meta son los ${S(r.monto)}? Tienes: ${metas.map(x => esc(x.nombre)).join(', ')}.\nEj: /ahorro ${r.monto} ${esc(metas[0].nombre)}`
      : '🎯 Aún no tienes metas de ahorro. Crea una: <i>quiero ahorrar 2000 para una laptop</i> o /meta 2000 laptop';
  } else {
    const p = Number(m.objetivo) ? Number(m.ahorrado) / Number(m.objetivo) * 100 : 0;
    texto = [
      p >= 100 ? '🎉 <b>¡Meta cumplida!</b>' : '💰 <b>Ahorro anotado</b>',
      `+${S(r.monto)} para ${esc(titulo(m.nombre))}`,
      `<code>${barraMeta(p)}</code> ${p.toFixed(0)}%`,
      `${S(m.ahorrado)} de ${S(m.objetivo)}${p < 100 ? ` · faltan ${S(Number(m.objetivo) - Number(m.ahorrado))}` : ''}`,
    ].join('\n');
  }
} else if (r.clase === 'recordatorio') {
  const d = DateTime.fromISO(String(r.cuando_local), { zone: 'America/Lima' }).setLocale('es');
  texto = [
    '⏰ <b>Te lo recuerdo</b>',
    `📝 ${esc(r.texto)}`,
    `🗓️ ${d.toFormat("cccc d 'de' LLLL, HH:mm")} (${d.toRelative({ locale: 'es' })})`,
    r.repetir ? `🔁 Se repite ${REP[r.repetir] || r.repetir}` : null,
    '',
    `<i>Ver todos: /recordatorios · Cancelar este: /cancelar ${r.id}</i>`,
  ].filter(l => l !== null).join('\n');
} else if (r.clase === 'tarea') {
  const nuevas = (typeof r.nuevas === 'string' ? JSON.parse(r.nuevas) : r.nuevas) || [];
  const linea = t => `${PRIO[t.prioridad] || '🟡'} #${t.id} ${esc(t.texto)}${t.vence ? ` · 📅 ${fechaLarga(t.vence)}` : ''}`;
  texto = [
    nuevas.length === 1 ? '📝 <b>Tarea anotada</b>' : `📝 <b>Anoté ${nuevas.length} tareas</b>`,
    ...nuevas.map(linea),
    '',
    `Tienes ${r.pendientes} pendiente${Number(r.pendientes) === 1 ? '' : 's'}.`,
    `<i>Ver todas: /tareas · Marcar hecha: /hecha ${nuevas.map(t => t.id).join(' ')}</i>`,
  ].join('\n');
} else if (r.clase === 'evento') {
  texto = [
    '📅 <b>Evento creado en tu Google Calendar</b>',
    `<b>${esc(r.titulo)}</b>`,
    `🗓️ ${esc(r.cuando_txt)}`,
    r.lugar ? `📍 ${esc(r.lugar)}` : null,
    Number(r.con_aviso) ? (r.todo_el_dia ? '⏰ Te aviso ese día a las 8 am.' : '⏰ Te aviso 30 min antes.') : null,
    r.link ? `<a href="${esc(r.link)}">Abrir en Calendar</a>` : null,
  ].filter(l => l !== null).join('\n');
} else if (r.clase === 'evento_error') {
  texto = `⚠️ No pude crear el evento en Google Calendar.\n<i>${esc(r.detalle)}</i>\n\nRevisa que el nodo "Crear evento" tenga la credencial de Google Calendar.`;
} else if (r.clase === 'ingreso') {
  const bal = Number(r.ingresos_mes) - Number(r.gastos_mes);
  texto = [
    '💰 <b>Ingreso registrado</b>',
    `➕ <b>${S(r.monto)}</b>${r.descripcion ? ' — ' + esc(r.descripcion) : ''}`,
    `🕒 ${r.fecha_local}${r.metodo === 'voz' ? ' · 🎙️ por voz' : ''}${r.metodo === 'yape' ? ' · 📱 Yape' : ''}`,
    '',
    `Ingresos del mes: <b>${S(r.ingresos_mes)}</b>`,
    `Gastos del mes: <b>${S(r.gastos_mes)}</b>`,
    `${bal >= 0 ? '🟢' : '🔴'} Balance: <b>${firmado(bal)}</b>`,
    '',
    '<i>¿No era un ingreso? /borraringreso lo elimina.</i>',
  ].join('\n');
} else if (!Number(r.insertado)) {
  texto = `♻️ Ese Yape ya estaba registrado (${S(r.monto)}${r.destinatario ? ' a ' + esc(r.destinatario) : ''}, ${r.fecha_local}). No lo dupliqué.`;
} else {
  const lineas = [
    '✅ <b>Gasto registrado</b>',
    `💸 <b>${S(r.monto)}</b>${r.descripcion ? ' — ' + esc(r.descripcion) : ''}`,
    `${EMOJI[r.categoria] || '📦'} ${esc(r.categoria)} · 🕒 ${r.fecha_local}${r.metodo === 'voz' ? ' · 🎙️ por voz' : ''}`,
  ];
  if (r.metodo === 'yape' && r.destinatario) lineas.push(`📱 Yape a ${esc(r.destinatario)}`);
  lineas.push('', `Hoy llevas: <b>${S(r.total_hoy)}</b>`, `Este mes: <b>${S(r.total_mes)}</b>`);
  lineas.push(...lineaPresupuesto(r.categoria, r.presupuesto, r.gastado_cat_mes));
  if (!r.descripcion || r.categoria === 'Otros') {
    lineas.push('', '<i>Tip: /motivo almuerzo o /cat comida corrigen el último gasto.</i>');
  }
  texto = lineas.join('\n');
}
return [{ json: { chat_id: r.chat_id, texto } }];
