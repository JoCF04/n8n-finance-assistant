
const ctx = $input.first().json;   // viene de un comando o de una pregunta que la IA convirtió en comando
const chat = Number(ctx.chat_id);
const CATS = ['Comida', 'Transporte', 'Ocio', 'Compras', 'Salud', 'Educación', 'Servicios', 'Hogar', 'Otros'];
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const buscarCat = tok => {
  const t = norm(tok);
  if (!t) return null;
  return CATS.find(c => norm(c) === t) || (t.length >= 3 ? CATS.find(c => norm(c).startsWith(t)) : null) || null;
};
const num = s => { const m = String(s).replace(/(\d),(\d)/g, '$1.$2').match(/\d+(?:\.\d{1,2})?/); return m ? parseFloat(m[0]) : null; };
const limpiar = s => String(s).replace(/s\/\.?/gi, ' ')
  .replace(/(^|\s)(soles|sol|so|lucas|luca|al mes|mensual|cada mes)(?=\s|$)/gi, ' ')
  .replace(/\s+/g, ' ').trim();
const uso = msg => `SELECT 'uso' AS tipo, ${chat}::bigint AS chat_id, ${q(msg)} AS msg;`;

const partes = ctx.texto.split(/\s+/);
const cmd = partes[0].toLowerCase().replace(/@.*$/, '');
const arg = partes.slice(1).join(' ').trim();
const ULTIMO = `(SELECT max(id) FROM gastos WHERE chat_id = ${chat})`;

let sql;
switch (cmd) {
  // ---------- Reportes ----------
  case '/hoy':
    sql = reporte(chat, 'hoy', 'Gastos de hoy', INI_DIA, FUTURO, { detalle: true }); break;
  case '/ayer':
    sql = reporte(chat, 'ayer', 'Gastos de ayer', `(${INI_DIA} - interval '1 day')`, INI_DIA, { detalle: true }); break;
  case '/semana':
    sql = reporte(chat, 'semana', 'Esta semana (desde el lunes)', INI_SEMANA, FUTURO, { dias: true }); break;
  case '/mes':
    sql = reporte(chat, 'mes', 'Este mes', INI_MES, FUTURO, { dias: true }); break;
  case '/mesanterior':
    sql = reporte(chat, 'mes', 'Mes anterior', INI_MES_ANT, INI_MES, {}); break;
  case '/ultimos':
    sql = `SELECT 'ultimos' AS tipo, ${chat}::bigint AS chat_id, COALESCE((SELECT json_agg(x) FROM (
             SELECT to_char(fecha AT TIME ZONE ${TZ}, 'DD/MM HH24:MI') AS cuando, monto, descripcion, categoria, metodo
             FROM gastos WHERE chat_id = ${chat} ORDER BY fecha DESC, id DESC LIMIT 10) x), '[]'::json) AS filas;`;
    break;
  case '/balance':
    sql = sqlBalance(chat, 'comando'); break;

  // ---------- Corregir el último gasto ----------
  case '/borrar':
    sql = `WITH d AS (DELETE FROM gastos WHERE id = ${ULTIMO} RETURNING *)
           SELECT 'borrar' AS tipo, ${chat}::bigint AS chat_id, (SELECT row_to_json(d) FROM d) AS fila;`;
    break;
  case '/cat': {
    const cat = buscarCat(arg);
    if (!cat) { sql = `SELECT 'cat_invalida' AS tipo, ${chat}::bigint AS chat_id;`; break; }
    sql = `WITH u AS (UPDATE gastos SET categoria = ${q(cat)} WHERE id = ${ULTIMO} RETURNING *)
           SELECT 'editado' AS tipo, ${chat}::bigint AS chat_id, (SELECT row_to_json(u) FROM u) AS fila;`;
    break;
  }
  case '/motivo':
    if (!arg) { sql = `SELECT 'motivo_vacio' AS tipo, ${chat}::bigint AS chat_id;`; break; }
    sql = `WITH u AS (UPDATE gastos SET descripcion = ${q(arg.slice(0, 200).toLowerCase())} WHERE id = ${ULTIMO} RETURNING *)
           SELECT 'editado' AS tipo, ${chat}::bigint AS chat_id, (SELECT row_to_json(u) FROM u) AS fila;`;
    break;

  // ---------- Ingresos ----------
  case '/ingreso': {
    const monto = num(arg);
    if (!(monto > 0)) { sql = uso('Escribe el monto y el motivo. Ej: /ingreso 1500 sueldo'); break; }
    const desc = limpiar(arg.replace(/(\d),(\d)/g, '$1.$2').replace(/\d+(?:\.\d{1,2})?/, ' ')).toLowerCase().slice(0, 200) || null;
    sql = `WITH ins AS (INSERT INTO ingresos (monto, descripcion, chat_id) VALUES (${monto}, ${q(desc)}, ${chat}) RETURNING *)
           SELECT 'ingreso_ok' AS tipo, ${chat}::bigint AS chat_id, (SELECT row_to_json(ins) FROM ins) AS fila,
             (SELECT COALESCE(sum(monto), 0) FROM ingresos WHERE chat_id = ${chat} AND fecha >= ${INI_MES}) + ${monto} AS ingresos_mes,
             (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = ${chat} AND fecha >= ${INI_MES}) AS gastos_mes;`;
    break;
  }
  case '/borraringreso':
    sql = `WITH d AS (DELETE FROM ingresos WHERE id = (SELECT max(id) FROM ingresos WHERE chat_id = ${chat}) RETURNING *)
           SELECT 'borrar_ingreso' AS tipo, ${chat}::bigint AS chat_id, (SELECT row_to_json(d) FROM d) AS fila;`;
    break;

  // ---------- Presupuestos ----------
  case '/presupuestos':
    sql = sqlPresupuestos(chat, 'comando'); break;
  case '/presupuesto': {
    if (!arg) { sql = sqlPresupuestos(chat, 'comando'); break; }
    const cat = arg.split(/\s+/).map(buscarCat).find(Boolean);
    const monto = num(arg);
    if (!cat || monto === null) {
      sql = uso('Escribe la categoría y el monto mensual. Ej: /presupuesto comida 400\nPara quitarlo: /presupuesto comida 0\nCategorías: ' + CATS.join(', '));
      break;
    }
    if (monto === 0) {
      sql = `WITH d AS (DELETE FROM presupuestos WHERE chat_id = ${chat} AND categoria = ${q(cat)} RETURNING *)
             SELECT 'presupuesto_borrado' AS tipo, ${chat}::bigint AS chat_id, ${q(cat)} AS categoria, (SELECT count(*) FROM d)::int AS n;`;
      break;
    }
    sql = `WITH up AS (
             INSERT INTO presupuestos (chat_id, categoria, monto) VALUES (${chat}, ${q(cat)}, ${monto})
             ON CONFLICT (chat_id, categoria) DO UPDATE SET monto = EXCLUDED.monto
             RETURNING *)
           SELECT 'presupuesto_ok' AS tipo, ${chat}::bigint AS chat_id, (SELECT categoria FROM up) AS categoria, (SELECT monto FROM up) AS monto,
             (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = ${chat} AND categoria = ${q(cat)} AND fecha >= ${INI_MES}) AS gastado;`;
    break;
  }

  // ---------- Pagos recurrentes ----------
  case '/recurrente': {
    let s = arg.replace(/(\d),(\d)/g, '$1.$2');
    let dia = null;
    const md = s.match(/(?:^|\s)(?:d[ií]a|el)\s+(\d{1,2})(?=\s|$)/i);
    if (md) { dia = parseInt(md[1], 10); s = s.replace(md[0], ' '); }
    let categoria = null;
    s = s.split(/\s+/).filter(tok => {
      if (categoria) return true;
      const c = CATS.find(c => norm(c) === norm(tok));
      if (c) { categoria = c; return false; }
      return true;
    }).join(' ');
    const nums = s.match(/\d+(?:\.\d{1,2})?/g) || [];
    const monto = nums.length ? parseFloat(nums[0]) : null;
    let resto = s.replace(nums[0] || '', ' ');
    if (!dia && nums.length >= 2) { dia = parseInt(nums[1], 10); resto = resto.replace(nums[1], ' '); }
    const nombre = limpiar(resto).slice(0, 80);
    if (!(monto > 0) || !(dia >= 1 && dia <= 31) || !nombre) {
      sql = uso('Escribe monto, nombre y día de cobro. Ej:\n/recurrente 29.90 spotify dia 5\n/recurrente 600 alquiler dia 1 hogar');
      break;
    }
    if (!categoria) {
      const GUIAS = [
        [/gym|gimnasio|seguro|eps|oncosalud/i, 'Salud'],
        [/alquiler|renta|mantenimiento|condominio/i, 'Hogar'],
        [/upc|curso|platzi|udemy|pensi[oó]n|universidad|colegio|ingl[eé]s/i, 'Educación'],
        [/netflix|spotify|disney|hbo|max|prime|crunchyroll|xbox|psn|playstation|steam/i, 'Ocio'],
      ];
      categoria = (GUIAS.find(([re]) => re.test(nombre)) || [null, 'Servicios'])[1];
    }
    // Si el día de cobro de este mes ya pasó, asumimos que ya lo pagaste: arranca el próximo mes
    const hoyL = $now.setZone('America/Lima');
    const ultimo = Math.min(dia, hoyL.endOf('month').day) <= hoyL.day ? hoyL.toFormat('yyyy-MM') : null;
    sql = `WITH ins AS (
             INSERT INTO recurrentes (chat_id, nombre, monto, categoria, dia, ultimo_mes)
             VALUES (${chat}, ${q(nombre)}, ${monto}, ${q(categoria)}, ${dia}, ${q(ultimo)}) RETURNING *)
           SELECT 'recurrente_ok' AS tipo, ${chat}::bigint AS chat_id, (SELECT row_to_json(ins) FROM ins) AS fila;`;
    break;
  }
  case '/recurrentes':
    sql = `SELECT 'recurrentes' AS tipo, ${chat}::bigint AS chat_id, COALESCE((SELECT json_agg(x) FROM (
             SELECT id, nombre, monto, categoria, dia, ultimo_mes FROM recurrentes
             WHERE chat_id = ${chat} AND activo ORDER BY dia, id) x), '[]'::json) AS filas;`;
    break;
  case '/quitarrec': {
    const id = parseInt(arg.replace(/[^0-9]/g, ''), 10);
    if (!id) { sql = uso('Escribe el número del recurrente. Ej: /quitarrec 3\nMíralos con /recurrentes'); break; }
    sql = `WITH u AS (UPDATE recurrentes SET activo = false WHERE id = ${id} AND chat_id = ${chat} AND activo RETURNING *)
           SELECT 'recurrente_quitado' AS tipo, ${chat}::bigint AS chat_id, (SELECT row_to_json(u) FROM u) AS fila;`;
    break;
  }

  // ---------- Tareas ----------
  case '/tarea': {
    let texto = arg.trim();
    if (!texto) { sql = uso('Escribe la tarea. Ej: /tarea llamar al banco\nTambién puedes escribirla normal: "tengo que llamar al banco el lunes"'); break; }
    let prioridad = 2;
    if (/^!|urgente|importante/i.test(texto)) prioridad = 1;
    texto = texto.replace(/^!+\s*/, '').slice(0, 300);
    sql = `WITH ins AS (INSERT INTO tareas (chat_id, texto, prioridad) VALUES (${chat}, ${q(texto)}, ${prioridad}) RETURNING *)
           SELECT 'tarea_ok' AS tipo, ${chat}::bigint AS chat_id, (SELECT row_to_json(ins) FROM ins) AS fila,
             (SELECT count(*) FROM tareas WHERE chat_id = ${chat} AND NOT hecha)::int + 1 AS pendientes;`;
    break;
  }
  case '/tareas':
    sql = `SELECT 'tareas' AS tipo, ${chat}::bigint AS chat_id, COALESCE((SELECT json_agg(x) FROM (
             SELECT id, texto, prioridad, to_char(vence, 'YYYY-MM-DD') AS vence,
                    (vence < (now() AT TIME ZONE ${TZ})::date) AS vencida
             FROM tareas WHERE chat_id = ${chat} AND NOT hecha
             ORDER BY (vence IS NULL), vence, prioridad, id LIMIT 40) x), '[]'::json) AS filas,
             (SELECT count(*) FROM tareas WHERE chat_id = ${chat} AND hecha AND hecha_en >= ${INI_SEMANA})::int AS hechas_semana;`;
    break;
  case '/hecha':
  case '/hechas': {
    const ids = (arg.match(/\d+/g) || []).map(Number).filter(n => n > 0).slice(0, 20);
    if (!ids.length) { sql = uso('Escribe el número de la tarea. Ej: /hecha 3  (o varias: /hecha 3 5 8)\nMíralas con /tareas'); break; }
    sql = `WITH u AS (UPDATE tareas SET hecha = true, hecha_en = now()
                      WHERE chat_id = ${chat} AND NOT hecha AND id IN (${ids.join(',')}) RETURNING id, texto)
           SELECT 'hecha' AS tipo, ${chat}::bigint AS chat_id,
             COALESCE((SELECT json_agg(u ORDER BY id) FROM u), '[]'::json) AS filas,
             (SELECT count(*) FROM tareas WHERE chat_id = ${chat} AND NOT hecha)::int - (SELECT count(*) FROM u)::int AS pendientes;`;
    break;
  }
  case '/borrartarea': {
    const id = parseInt(arg.replace(/[^0-9]/g, ''), 10);
    if (!id) { sql = uso('Escribe el número de la tarea. Ej: /borrartarea 3'); break; }
    sql = `WITH d AS (DELETE FROM tareas WHERE id = ${id} AND chat_id = ${chat} RETURNING *)
           SELECT 'tarea_borrada' AS tipo, ${chat}::bigint AS chat_id, (SELECT row_to_json(d) FROM d) AS fila;`;
    break;
  }

  // ---------- Recordatorios ----------
  case '/recordatorios':
    sql = `SELECT 'recordatorios' AS tipo, ${chat}::bigint AS chat_id, COALESCE((SELECT json_agg(x) FROM (
             SELECT id, texto, repetir, to_char(cuando AT TIME ZONE ${TZ}, 'YYYY-MM-DD"T"HH24:MI') AS cuando
             FROM recordatorios WHERE chat_id = ${chat} AND activo ORDER BY cuando LIMIT 40) x), '[]'::json) AS filas;`;
    break;
  case '/cancelar': {
    const id = parseInt(arg.replace(/[^0-9]/g, ''), 10);
    if (!id) { sql = uso('Escribe el número del recordatorio. Ej: /cancelar 3\nMíralos con /recordatorios'); break; }
    sql = `WITH u AS (UPDATE recordatorios SET activo = false WHERE id = ${id} AND chat_id = ${chat} AND activo RETURNING *)
           SELECT 'cancelado' AS tipo, ${chat}::bigint AS chat_id, (SELECT row_to_json(u) FROM u) AS fila;`;
    break;
  }
  case '/posponer': {
    const n = num(arg) || 10;
    const minutos = Math.min(Math.round(/h/i.test(arg) ? n * 60 : n), 7 * 24 * 60);
    sql = `WITH ult AS (
             SELECT * FROM recordatorios WHERE chat_id = ${chat} AND enviado_en IS NOT NULL ORDER BY enviado_en DESC LIMIT 1
           ), ins AS (
             INSERT INTO recordatorios (chat_id, texto, cuando)
             SELECT chat_id, texto, now() + interval '${minutos} minutes' FROM ult RETURNING *
           )
           SELECT 'pospuesto' AS tipo, ${chat}::bigint AS chat_id, (SELECT row_to_json(ins) FROM ins) AS fila, ${minutos} AS minutos;`;
    break;
  }

  // ---------- Gráficos ----------
  case '/grafico':
  case '/graficos': {
    const tipoG = /mes(es)?|meses|6/i.test(arg) && !/^mes$/i.test(arg.trim()) ? 'meses' : (/d[ií]a/i.test(arg) ? 'dias' : 'categorias');
    if (tipoG === 'meses') {
      sql = `SELECT 'grafico' AS tipo, 'meses' AS subtipo, ${chat}::bigint AS chat_id, COALESCE((SELECT json_agg(x ORDER BY x.mes) FROM (
               SELECT to_char(m, 'YYYY-MM') AS mes,
                 (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = ${chat} AND fecha >= (m AT TIME ZONE ${TZ}) AND fecha < ((m + interval '1 month') AT TIME ZONE ${TZ})) AS gastos,
                 (SELECT COALESCE(sum(monto), 0) FROM ingresos WHERE chat_id = ${chat} AND fecha >= (m AT TIME ZONE ${TZ}) AND fecha < ((m + interval '1 month') AT TIME ZONE ${TZ})) AS ingresos
               FROM generate_series(date_trunc('month', now() AT TIME ZONE ${TZ}) - interval '5 months', date_trunc('month', now() AT TIME ZONE ${TZ}), interval '1 month') m) x), '[]'::json) AS datos;`;
    } else if (tipoG === 'dias') {
      sql = `SELECT 'grafico' AS tipo, 'dias' AS subtipo, ${chat}::bigint AS chat_id, COALESCE((SELECT json_agg(x ORDER BY x.dia) FROM (
               SELECT to_char(d, 'YYYY-MM-DD') AS dia,
                 (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = ${chat} AND fecha >= (d AT TIME ZONE ${TZ}) AND fecha < ((d + interval '1 day') AT TIME ZONE ${TZ})) AS total
               FROM generate_series(date_trunc('month', now() AT TIME ZONE ${TZ}), date_trunc('day', now() AT TIME ZONE ${TZ}), interval '1 day') d) x), '[]'::json) AS datos;`;
    } else {
      sql = `SELECT 'grafico' AS tipo, 'categorias' AS subtipo, ${chat}::bigint AS chat_id, COALESCE((SELECT json_agg(x) FROM (
               SELECT categoria, sum(monto) AS total FROM gastos WHERE chat_id = ${chat} AND fecha >= ${INI_MES}
               GROUP BY categoria ORDER BY 2 DESC) x), '[]'::json) AS datos;`;
    }
    break;
  }

  // ---------- Deudas ----------
  case '/deudas':
    sql = `SELECT 'deudas' AS tipo, ${chat}::bigint AS chat_id, COALESCE((SELECT json_agg(x ORDER BY x.saldo DESC) FROM (
             SELECT (array_agg(persona ORDER BY id DESC))[1] AS persona, sum(monto) AS saldo, max(fecha) AS ultima
             FROM deudas WHERE chat_id = ${chat} GROUP BY lower(persona) HAVING abs(sum(monto)) >= 0.01) x), '[]'::json) AS filas;`;
    break;
  case '/saldar': {
    const persona = arg.trim();
    if (!persona) { sql = uso('Escribe con quién quedaron a mano. Ej: /saldar juan\nMira tus deudas con /deudas'); break; }
    sql = `WITH s AS (SELECT sum(monto) AS saldo, (array_agg(persona ORDER BY id DESC))[1] AS persona FROM deudas
                      WHERE chat_id = ${chat} AND lower(persona) = lower(${q(persona)})),
                ins AS (INSERT INTO deudas (chat_id, persona, monto, descripcion)
                        SELECT ${chat}, persona, -saldo, 'saldado' FROM s WHERE abs(COALESCE(saldo, 0)) >= 0.01 RETURNING *)
           SELECT 'saldado' AS tipo, ${chat}::bigint AS chat_id, COALESCE((SELECT persona FROM s), ${q(persona)}) AS persona,
                  (SELECT saldo FROM s) AS saldo_anterior, (SELECT count(*) FROM ins)::int AS n;`;
    break;
  }
  case '/borrardeuda':
    sql = `WITH d AS (DELETE FROM deudas WHERE id = (SELECT max(id) FROM deudas WHERE chat_id = ${chat}) RETURNING *)
           SELECT 'deuda_borrada' AS tipo, ${chat}::bigint AS chat_id, (SELECT row_to_json(d) FROM d) AS fila;`;
    break;

  // ---------- Metas de ahorro ----------
  case '/metas':
    sql = `SELECT 'metas' AS tipo, ${chat}::bigint AS chat_id, COALESCE((SELECT json_agg(x ORDER BY x.id) FROM (
             SELECT id, nombre, objetivo, ahorrado, to_char(fecha_limite, 'YYYY-MM-DD') AS fecha_limite FROM metas
             WHERE chat_id = ${chat} AND activa) x), '[]'::json) AS filas;`;
    break;
  case '/meta': {
    const objetivo = num(arg);
    const nombre = limpiar(arg.replace(/(\d),(\d)/g, '$1.$2').replace(/\d+(?:\.\d{1,2})?/, ' ')).toLowerCase().slice(0, 80);
    if (!(objetivo > 0) || !nombre) { sql = uso('Escribe el monto y para qué. Ej: /meta 2000 laptop\nO escríbelo normal: "quiero ahorrar 2000 para una laptop para diciembre"'); break; }
    sql = `WITH ins AS (INSERT INTO metas (chat_id, nombre, objetivo) VALUES (${chat}, ${q(nombre)}, ${objetivo}) RETURNING *)
           SELECT 'meta_ok' AS tipo, ${chat}::bigint AS chat_id, (SELECT row_to_json(ins) FROM ins) AS fila;`;
    break;
  }
  case '/ahorro': {
    const monto = num(arg);
    const meta = limpiar(arg.replace(/(\d),(\d)/g, '$1.$2').replace(/\d+(?:\.\d{1,2})?/, ' ')).toLowerCase().replace(/^(para|en|a)\s+(la|el|mi)?\s*/, '').slice(0, 80) || null;
    if (!(monto > 0)) { sql = uso('Escribe cuánto y para qué meta. Ej: /ahorro 100 laptop'); break; }
    sql = `WITH m AS (
             SELECT id FROM metas WHERE chat_id = ${chat} AND activa
               AND ((${q(meta)}::text IS NOT NULL AND lower(nombre) LIKE '%' || ${q(meta)} || '%')
                    OR (${q(meta)}::text IS NULL AND (SELECT count(*) FROM metas WHERE chat_id = ${chat} AND activa) = 1))
             ORDER BY id LIMIT 1
           ), u AS (UPDATE metas SET ahorrado = ahorrado + ${monto} WHERE id = (SELECT id FROM m) RETURNING *)
           SELECT 'ahorro_ok' AS tipo, ${chat}::bigint AS chat_id, ${monto} AS monto, (SELECT row_to_json(u) FROM u) AS meta,
             COALESCE((SELECT json_agg(x) FROM (SELECT id, nombre FROM metas WHERE chat_id = ${chat} AND activa ORDER BY id) x), '[]'::json) AS metas;`;
    break;
  }
  case '/quitarmeta': {
    const id = parseInt(arg.replace(/[^0-9]/g, ''), 10);
    if (!id) { sql = uso('Escribe el número de la meta. Ej: /quitarmeta 2\nMíralas con /metas'); break; }
    sql = `WITH u AS (UPDATE metas SET activa = false WHERE id = ${id} AND chat_id = ${chat} AND activa RETURNING *)
           SELECT 'meta_quitada' AS tipo, ${chat}::bigint AS chat_id, (SELECT row_to_json(u) FROM u) AS fila;`;
    break;
  }

  default: // /start, /ayuda, /help y cualquier otro
    sql = `SELECT 'ayuda' AS tipo, ${chat}::bigint AS chat_id;`;
}
return [{ json: { sql } }];
