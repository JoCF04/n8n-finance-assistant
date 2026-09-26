const ctx = $('Clasificar mensaje').first().json;
const r = $input.first().json;
const CATS = ['Comida', 'Transporte', 'Ocio', 'Compras', 'Salud', 'Educación', 'Servicios', 'Hogar', 'Otros'];
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const q = v => (v === null || v === undefined || v === '') ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 1) Leer el JSON que devolvió Gemini
let data = null;
try {
  const txt = r.candidates[0].content.parts.map(p => p.text || '').join('');
  data = JSON.parse(txt.replace(/```json|```/g, '').trim());
  if (Array.isArray(data)) data = data[0];
} catch (e) { data = null; }

// 1b) Camino rápido (ya viene interpretado, sin IA)
if (r.rapido) data = { tipo: 'gasto', ...r.rapido };
if (data && !data.tipo && 'es_gasto' in data) data.tipo = data.es_gasto ? 'gasto' : 'otro';

// 2) Plan B sin IA (si Gemini falla): saca el número del texto
const PARECE_AGENDA = /recu[eé]rd|av[ií]s|alarma|tarea|pendiente|tengo que|debo|debe|prest|ahorr|meta|reuni[oó]n|cita|agenda|evento|cumplea|cu[aá]nt|qu[eé] |[?¿]/i;
if (!data && ctx.tipo === 'texto' && !PARECE_AGENDA.test(ctx.texto)) {
  const m = ctx.texto.replace(',', '.').match(/(\d+(?:\.\d{1,2})?)/);
  if (m) {
    const desc = ctx.texto.replace(/,/g, '.').replace(m[0], '')
      .replace(/s\/\.?/gi, ' ')
      .replace(/(^|\s)(soles|sol|so|lucas|luca)(?=\s|$)/gi, ' ')
      .replace(/\s+/g, ' ').trim().toLowerCase();
    data = { tipo: 'gasto', monto: parseFloat(m[1]), descripcion: desc || null, categoria: 'Otros', dias_atras: 0 };
  }
}

const tipo = data ? norm(data.tipo) : '';
const chatId = Number(ctx.chat_id);

// Solo deja pasar una consulta de lectura sobre tus datos (la envuelve para que no pueda modificar nada)
function sqlSeguro(s, chat) {
  const t = s.trim().replace(/;+\s*$/, '');
  if (!/^(select|with)\b/i.test(t) || t.includes(';')) return null;
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|comment|call|execute|prepare|listen|notify|lock|set_config|current_setting|dblink)\b|\bpg_\w+|information_schema/i.test(t)) return null;
  if (!new RegExp(`chat_id\\s*=\\s*${chat}\\b`).test(t)) return null;
  return `SELECT COALESCE(json_agg(t), '[]'::json) AS filas FROM (SELECT * FROM (${t}) s LIMIT 50) t`;
}
// Suma un ahorro a la meta que coincida por nombre (o a la única meta activa)
function sqlAhorro(chat, monto, meta) {
  return `
WITH m AS (
  SELECT id FROM metas
  WHERE chat_id = ${chat} AND activa
    AND ((${q(meta)}::text IS NOT NULL AND lower(nombre) LIKE '%' || ${q(meta)} || '%')
         OR (${q(meta)}::text IS NULL AND (SELECT count(*) FROM metas WHERE chat_id = ${chat} AND activa) = 1))
  ORDER BY id LIMIT 1
), u AS (
  UPDATE metas SET ahorrado = ahorrado + ${monto} WHERE id = (SELECT id FROM m) RETURNING *
)
SELECT 'ahorro' AS clase, ${chat}::bigint AS chat_id, ${monto} AS monto, (SELECT row_to_json(u) FROM u) AS meta,
       COALESCE((SELECT json_agg(x) FROM (SELECT id, nombre FROM metas WHERE chat_id = ${chat} AND activa ORDER BY id) x), '[]'::json) AS metas;`;
}
const ZONA = { zone: 'America/Lima' };
const ahora = $now.setZone('America/Lima');
const errorAgenda = msg => [{ json: { ruta: 1, chat_id: ctx.chat_id, texto: msg } }];

// 3a) RECORDATORIO → tabla recordatorios
if (tipo === 'recordatorio') {
  const texto = String(data.texto || data.descripcion || '').trim().slice(0, 300);
  let dt = DateTime.fromISO(String(data.cuando || ''), ZONA);
  if (!texto || !dt.isValid) return errorAgenda('No entendí qué o cuándo recordarte 🤔\nEj: <i>recuérdame pagar la luz el viernes a las 6pm</i>');
  const REP = ['diario', 'semanal', 'mensual', 'laborables'];
  const repetir = REP.includes(norm(data.repetir)) ? norm(data.repetir) : null;
  const paso = repetir === 'semanal' ? { weeks: 1 } : (repetir === 'mensual' ? { months: 1 } : { days: 1 });
  for (let k = 0; k < 400 && dt < ahora.minus({ minutes: 1 }); k++) dt = dt.plus(paso);   // nunca en el pasado
  if (repetir === 'laborables') { while (dt.weekday > 5) dt = dt.plus({ days: 1 }); }
  const sql = `
WITH ins AS (
  INSERT INTO recordatorios (chat_id, texto, cuando, repetir)
  VALUES (${chatId}, ${q(texto)}, ${q(dt.toISO())}::timestamptz, ${q(repetir)}) RETURNING *
)
SELECT 'recordatorio' AS clase, ${chatId}::bigint AS chat_id, i.id, i.texto, i.repetir,
       to_char(i.cuando AT TIME ZONE 'America/Lima', 'YYYY-MM-DD"T"HH24:MI') AS cuando_local
FROM ins i;`;
  return [{ json: { ruta: 0, sql } }];
}

// 3b) TAREA(S) → tabla tareas (acepta varias en un solo mensaje)
if (tipo === 'tarea') {
  const PRI = { alta: 1, media: 2, baja: 3 };
  const lista = (Array.isArray(data.tareas) && data.tareas.length ? data.tareas : [data])
    .map(t => ({
      texto: String((t && (t.texto || t.descripcion)) || '').trim().slice(0, 300),
      vence: /^\d{4}-\d{2}-\d{2}$/.test((t && t.vence) || '') ? t.vence : (/^\d{4}-\d{2}-\d{2}$/.test(data.vence || '') ? data.vence : null),
      prioridad: PRI[norm(t && t.prioridad)] || PRI[norm(data.prioridad)] || 2,
    }))
    .filter(t => t.texto)
    .slice(0, 20);
  if (!lista.length) return errorAgenda('No entendí la tarea 🤔\nEj: <i>tengo que llamar al banco el lunes</i> o /tarea llamar al banco');
  const valores = lista.map(t => `(${chatId}, ${q(t.texto)}, ${t.prioridad}, ${q(t.vence)})`).join(',\n    ');
  const sql = `
WITH ins AS (
  INSERT INTO tareas (chat_id, texto, prioridad, vence) VALUES
    ${valores}
  RETURNING *
)
SELECT 'tarea' AS clase, ${chatId}::bigint AS chat_id,
       (SELECT json_agg(json_build_object('id', id, 'texto', texto, 'prioridad', prioridad, 'vence', to_char(vence, 'YYYY-MM-DD')) ORDER BY id) FROM ins) AS nuevas,
       (SELECT count(*) FROM tareas WHERE chat_id = ${chatId} AND NOT hecha)::int + (SELECT count(*) FROM ins)::int AS pendientes;`;
  return [{ json: { ruta: 0, sql } }];
}

// 3c) EVENTO → Google Calendar (ruta 2) y luego un recordatorio 30 min antes
if (tipo === 'evento') {
  const titulo = String(data.titulo || data.texto || data.descripcion || '').trim().slice(0, 200);
  const todoElDia = data.todo_el_dia === true || /^\d{4}-\d{2}-\d{2}$/.test(String(data.inicio || ''));
  let ini = DateTime.fromISO(String(data.inicio || ''), ZONA);
  let fin = DateTime.fromISO(String(data.fin || ''), ZONA);
  if (!titulo || !ini.isValid) return errorAgenda('No entendí el evento 🤔\nEj: <i>reunión con Carlos el martes a las 3pm</i>');
  let body;
  if (todoElDia) {
    ini = ini.startOf('day');
    fin = (fin.isValid && fin > ini) ? fin.startOf('day').plus({ days: 1 }) : ini.plus({ days: 1 });
    body = { start: { date: ini.toFormat('yyyy-MM-dd') }, end: { date: fin.toFormat('yyyy-MM-dd') } };
  } else {
    if (!fin.isValid || fin <= ini) fin = ini.plus({ hours: 1 });
    body = {
      start: { dateTime: ini.toFormat("yyyy-MM-dd'T'HH:mm:ss"), timeZone: 'America/Lima' },
      end: { dateTime: fin.toFormat("yyyy-MM-dd'T'HH:mm:ss"), timeZone: 'America/Lima' },
    };
  }
  body.summary = titulo;
  if (data.lugar) body.location = String(data.lugar).slice(0, 200);
  body.description = 'Creado desde Telegram (Contador)';
  return [{ json: { ruta: 2, chat_id: chatId, evento: body, todo_el_dia: todoElDia, inicio_iso: ini.toISO(), titulo } }];
}

// 3d) DEUDA → tabla deudas (positivo = te deben · negativo = debes)
if (tipo === 'deuda') {
  const persona = String(data.persona || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const monto = Math.round(Number(data.monto) * 100) / 100;
  const SIGNO = { le_preste: 1, le_pague: 1, me_prestaron: -1, me_pagaron: -1 };
  const signo = SIGNO[norm(data.movimiento)];
  if (!persona || !(monto > 0) || !signo) return errorAgenda('No entendí la deuda 🤔\nEj: <i>le presté 50 a Juan</i>, <i>le debo 30 a Ana</i> o <i>Juan me pagó 20</i>');
  const desc = data.descripcion ? String(data.descripcion).trim().toLowerCase().slice(0, 200) : null;
  const sql = `
WITH ins AS (
  INSERT INTO deudas (chat_id, persona, monto, descripcion) VALUES (${chatId}, ${q(persona)}, ${signo * monto}, ${q(desc)}) RETURNING *
)
SELECT 'deuda' AS clase, ${chatId}::bigint AS chat_id, ${q(persona)} AS persona, ${q(norm(data.movimiento))} AS movimiento, ${monto} AS monto,
       (SELECT COALESCE(sum(monto), 0) FROM deudas WHERE chat_id = ${chatId} AND lower(persona) = lower(${q(persona)})) + ${signo * monto} AS saldo
FROM ins;`;
  return [{ json: { ruta: 0, sql } }];
}

// 3e) META de ahorro → tabla metas
if (tipo === 'meta') {
  const nombre = String(data.nombre || data.descripcion || '').trim().toLowerCase().slice(0, 80);
  const objetivo = Math.round(Number(data.objetivo || data.monto) * 100) / 100;
  if (!nombre || !(objetivo > 0)) return errorAgenda('No entendí la meta 🤔\nEj: <i>quiero ahorrar 2000 para una laptop para diciembre</i> o /meta 2000 laptop');
  const limite = /^\d{4}-\d{2}-\d{2}$/.test(data.fecha_limite || '') ? data.fecha_limite : null;
  const sql = `
WITH ins AS (
  INSERT INTO metas (chat_id, nombre, objetivo, fecha_limite) VALUES (${chatId}, ${q(nombre)}, ${objetivo}, ${q(limite)}) RETURNING *
)
SELECT 'meta' AS clase, ${chatId}::bigint AS chat_id, i.id, i.nombre, i.objetivo, to_char(i.fecha_limite, 'YYYY-MM-DD') AS fecha_limite FROM ins i;`;
  return [{ json: { ruta: 0, sql } }];
}

// 3f) AHORRO para una meta
if (tipo === 'ahorro') {
  const monto = Math.round(Number(data.monto) * 100) / 100;
  if (!(monto > 0)) return errorAgenda('No entendí cuánto ahorraste 🤔\nEj: <i>ahorré 100 para la laptop</i> o /ahorro 100 laptop');
  const meta = data.meta ? String(data.meta).trim().toLowerCase().slice(0, 80) : null;
  return [{ json: { ruta: 0, sql: sqlAhorro(chatId, monto, meta) } }];
}

// 3g) PREGUNTA → comando, consulta a tus datos o respuesta directa
if (tipo === 'pregunta') {
  const PERMITIDOS = ['/agenda', '/tareas', '/recordatorios', '/balance', '/hoy', '/ayer', '/semana', '/mes', '/mesanterior', '/ultimos',
    '/presupuestos', '/recurrentes', '/deudas', '/metas', '/grafico', '/excel', '/ayuda'];
  const cmd = String(data.comando || '').trim().toLowerCase();
  if (cmd && PERMITIDOS.includes(cmd.split(/\s+/)[0])) {
    const base = { chat_id: chatId, tipo: 'comando', texto: cmd };
    if (cmd.startsWith('/agenda')) return [{ json: { ...base, ruta: 4 } }];
    if (cmd.startsWith('/excel')) return [{ json: { ...base, ruta: 5 } }];
    return [{ json: { ...base, ruta: 3 } }];
  }
  const pregunta = ctx.tipo === 'voz' ? (data.transcripcion || '') : ctx.texto;
  if (data.sql) {
    const seguro = sqlSeguro(String(data.sql), chatId);
    if (seguro) return [{ json: { ruta: 6, chat_id: chatId, pregunta, sql: seguro } }];
  }
  if (data.respuesta) {
    const txt = esc(String(data.respuesta).slice(0, 1500)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    return [{ json: { ruta: 1, chat_id: chatId, texto: txt } }];
  }
  return errorAgenda('Uy, no supe cómo responder eso 😅 Prueba preguntándolo de otra forma, o mira /ayuda.');
}

// 3h) VARIOS GASTOS en un solo mensaje
if (tipo === 'gasto' && Array.isArray(data.gastos) && data.gastos.filter(g => g && Number(g.monto) > 0).length > 1) {
  const metodoM = ctx.tipo === 'voz' ? 'voz' : 'manual';
  const originalM = ctx.tipo === 'voz' ? (data.transcripcion ? String(data.transcripcion).slice(0, 500) : '(nota de voz)') : ctx.texto;
  const lista = data.gastos.filter(g => g && Number(g.monto) > 0).slice(0, 20).map(g => {
    const d = Number(g.dias_atras) > 0 && Number(g.dias_atras) <= 7 ? parseInt(g.dias_atras, 10) : 0;
    return {
      monto: Math.round(Number(g.monto) * 100) / 100,
      desc: g.descripcion ? String(g.descripcion).trim().toLowerCase().slice(0, 200) : null,
      cat: CATS.find(c => norm(c) === norm(g.categoria)) || 'Otros',
      fecha: d ? `(now() - interval '${d} day')` : 'now()',
    };
  });
  const TZm = "'America/Lima'";
  const INI_DIAm = `(date_trunc('day', now() AT TIME ZONE ${TZm}) AT TIME ZONE ${TZm})`;
  const INI_MESm = `(date_trunc('month', now() AT TIME ZONE ${TZm}) AT TIME ZONE ${TZm})`;
  const valores = lista.map(g => `(${g.fecha}, ${g.monto}, ${q(g.desc)}, ${q(g.cat)}, ${q(metodoM)}, ${chatId}, ${q(originalM)})`).join(',\n    ');
  const sql = `
WITH ins AS (
  INSERT INTO gastos (fecha, monto, descripcion, categoria, metodo, chat_id, mensaje_original) VALUES
    ${valores}
  RETURNING *
)
SELECT 'gastos' AS clase, ${chatId}::bigint AS chat_id,
  (SELECT json_agg(json_build_object('monto', monto, 'descripcion', descripcion, 'categoria', categoria,
      'fecha', to_char(fecha AT TIME ZONE ${TZm}, 'DD/MM HH24:MI')) ORDER BY id) FROM ins) AS nuevos,
  (SELECT sum(monto) FROM ins) AS total,
  (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = ${chatId} AND fecha >= ${INI_DIAm})
    + (SELECT COALESCE(sum(monto), 0) FROM ins WHERE fecha >= ${INI_DIAm}) AS total_hoy,
  (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = ${chatId} AND fecha >= ${INI_MESm})
    + (SELECT COALESCE(sum(monto), 0) FROM ins WHERE fecha >= ${INI_MESm}) AS total_mes,
  COALESCE((SELECT json_agg(x) FROM (
     SELECT p.categoria, p.monto AS presupuesto,
       (SELECT COALESCE(sum(g.monto), 0) FROM gastos g WHERE g.chat_id = p.chat_id AND g.categoria = p.categoria AND g.fecha >= ${INI_MESm})
       + (SELECT COALESCE(sum(i.monto), 0) FROM ins i WHERE i.categoria = p.categoria AND i.fecha >= ${INI_MESm}) AS gastado
     FROM presupuestos p WHERE p.chat_id = ${chatId} AND p.categoria IN (SELECT categoria FROM ins)) x), '[]'::json) AS presupuestos;`;
  return [{ json: { ruta: 0, sql } }];
}

// 3i) No es gasto ni ingreso → responder directo
if (!data || !['gasto', 'ingreso'].includes(tipo) || !(Number(data.monto) > 0)) {
  let msg;
  if (ctx.tipo === 'foto') {
    msg = 'No pude leer un pago en esa imagen 🤔\nMándame la captura del Yape o escribe el monto, ej: <i>almuerzo 15</i>';
  } else if (ctx.tipo === 'voz') {
    msg = 'No entendí qué hacer con el audio 🤔';
    if (data && data.transcripcion) msg += `\nEntendí: <i>"${esc(String(data.transcripcion).slice(0, 300))}"</i>`;
    msg += '\nPrueba con <i>"gasté quince soles en almuerzo"</i> o <i>"recuérdame llamar a mamá a las seis"</i>.';
  } else {
    msg = 'No entendí eso 🤔\nPrueba con: <i>15 almuerzo</i>, <i>me pagaron 1500</i>, <i>recuérdame llamar al banco mañana a las 10</i>, <i>tengo que comprar un regalo</i> o <i>reunión con Carlos el martes 3pm</i>.\nUsa /ayuda para ver los comandos.';
  }
  if (!data && r.error) msg += '\n\n⚠️ La IA no respondió: ' + esc(String(r.error.message || r.error).slice(0, 150));
  return [{ json: { ruta: 1, chat_id: ctx.chat_id, texto: msg } }];
}

// 4) Datos comunes
const chat = Number(ctx.chat_id);
const monto = Math.round(Number(data.monto) * 100) / 100;
const desc0 = data.descripcion ? String(data.descripcion).trim().toLowerCase().slice(0, 200) : null;
const destinatario = data.destinatario ? String(data.destinatario).trim().slice(0, 120) : null;
const metodo = ctx.tipo === 'foto' ? 'yape' : (ctx.tipo === 'voz' ? 'voz' : 'manual');
const original = ctx.tipo === 'voz'
  ? (data.transcripcion ? String(data.transcripcion).slice(0, 500) : '(nota de voz)')
  : ctx.texto;

let fechaExpr = 'now()';
if (ctx.tipo === 'foto' && /^\d{4}-\d{2}-\d{2}$/.test(data.fecha || '')) {
  const hora = /^\d{2}:\d{2}$/.test(data.hora || '') ? data.hora : '12:00';
  const f = DateTime.fromISO(`${data.fecha}T${hora}`, { zone: 'America/Lima' });
  const dias = f.isValid ? $now.diff(f, 'days').days : 999;
  if (dias >= -1 && dias <= 60) fechaExpr = `(${q(data.fecha + ' ' + hora)}::timestamp AT TIME ZONE 'America/Lima')`;
} else if (Number(data.dias_atras) > 0 && Number(data.dias_atras) <= 7) {
  fechaExpr = `(now() - interval '${parseInt(data.dias_atras, 10)} day')`;
}

const TZ = "'America/Lima'";
const INI_DIA = `(date_trunc('day', now() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ})`;
const INI_MES = `(date_trunc('month', now() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ})`;

// 5a) INGRESO
if (tipo === 'ingreso') {
  const desc = desc0 || (destinatario ? 'de ' + destinatario.toLowerCase() : null);
  const sql = `
WITH ins AS (
  INSERT INTO ingresos (fecha, monto, descripcion, chat_id)
  VALUES (${fechaExpr}, ${monto}, ${q(desc)}, ${chat})
  RETURNING *
)
SELECT 'ingreso' AS clase, 1 AS insertado, i.chat_id, i.monto, i.descripcion, ${q(metodo)} AS metodo,
       to_char(i.fecha AT TIME ZONE ${TZ}, 'DD/MM HH24:MI') AS fecha_local,
       (SELECT COALESCE(sum(monto), 0) FROM ingresos WHERE chat_id = i.chat_id AND fecha >= ${INI_MES})
         + CASE WHEN i.fecha >= ${INI_MES} THEN i.monto ELSE 0 END AS ingresos_mes,
       (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = i.chat_id AND fecha >= ${INI_MES}) AS gastos_mes
FROM ins i;`;
  return [{ json: { ruta: 0, sql } }];
}

// 5b) GASTO
const cat = CATS.find(c => norm(c) === norm(data.categoria)) || 'Otros';
const sql = `
WITH nuevo AS (
  SELECT ${fechaExpr}::timestamptz AS fecha, ${monto}::numeric AS monto, ${q(desc0)}::text AS descripcion,
         ${q(cat)}::text AS categoria, ${q(metodo)}::text AS metodo, ${q(destinatario)}::text AS destinatario,
         ${chat}::bigint AS chat_id, ${q(original)}::text AS mensaje_original
), ins AS (
  INSERT INTO gastos (fecha, monto, descripcion, categoria, metodo, destinatario, chat_id, mensaje_original)
  SELECT n.* FROM nuevo n
  WHERE NOT (n.metodo = 'yape' AND EXISTS (
    SELECT 1 FROM gastos g
    WHERE g.chat_id = n.chat_id AND g.metodo = 'yape' AND g.monto = n.monto
      AND g.fecha = n.fecha AND COALESCE(g.destinatario, '') = COALESCE(n.destinatario, '')))
  RETURNING *
)
SELECT 'gasto' AS clase, (SELECT count(*) FROM ins)::int AS insertado,
       n.chat_id, n.monto, n.descripcion, n.categoria, n.metodo, n.destinatario,
       to_char(n.fecha AT TIME ZONE ${TZ}, 'DD/MM HH24:MI') AS fecha_local,
       (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = n.chat_id AND fecha >= ${INI_DIA})
         + (SELECT COALESCE(sum(monto), 0) FROM ins WHERE fecha >= ${INI_DIA}) AS total_hoy,
       (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = n.chat_id AND fecha >= ${INI_MES})
         + (SELECT COALESCE(sum(monto), 0) FROM ins WHERE fecha >= ${INI_MES}) AS total_mes,
       (SELECT monto FROM presupuestos WHERE chat_id = n.chat_id AND categoria = n.categoria) AS presupuesto,
       (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = n.chat_id AND categoria = n.categoria AND fecha >= ${INI_MES})
         + (SELECT COALESCE(sum(monto), 0) FROM ins WHERE fecha >= ${INI_MES}) AS gastado_cat_mes
FROM nuevo n;`;

return [{ json: { ruta: 0, sql } }];
