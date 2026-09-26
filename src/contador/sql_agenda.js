
// ⚙️ Tu chat_id de Telegram
const CHAT_ID = 'TU_CHAT_ID';
if (CHAT_ID === 'TU_CHAT_ID') return [];
const c = Number(CHAT_ID);

const rango = $('Rango agenda').first().json;
const r = $input.first().json;

// Eventos de Google Calendar (si la credencial falla, la agenda sale igual sin eventos)
const calOk = !!(r && Array.isArray(r.items));
const eventos = calOk ? r.items.filter(e => e.status !== 'cancelled').slice(0, 40).map(e => {
  const todo = !!(e.start && e.start.date && !e.start.dateTime);
  const ini = todo ? DateTime.fromISO(e.start.date, { zone: 'America/Lima' }) : DateTime.fromISO(e.start.dateTime).setZone('America/Lima');
  const fin = (!todo && e.end && e.end.dateTime) ? DateTime.fromISO(e.end.dateTime).setZone('America/Lima') : null;
  return {
    dia: ini.toFormat('yyyy-MM-dd'),
    hora: todo ? null : ini.toFormat('HH:mm'),
    hasta: fin ? fin.toFormat('HH:mm') : null,
    titulo: String(e.summary || '(sin título)').slice(0, 120),
    lugar: e.location ? String(e.location).slice(0, 80) : null,
  };
}) : [];
const calError = calOk ? null : String((r && r.error && (r.error.message || r.error.description)) || 'sin conexión').slice(0, 160);

const desde = `${q(rango.desde)}::timestamptz`, hasta = `${q(rango.hasta)}::timestamptz`;
const sql = `
SELECT 'agenda' AS tipo, ${c}::bigint AS chat_id, ${q(rango.origen)} AS origen,
  ${q(JSON.stringify(eventos))}::json AS eventos, ${calOk} AS cal_ok, ${q(calError)} AS cal_error,
  ${q(JSON.stringify(rango.clima || null))}::json AS clima,
  COALESCE((SELECT json_agg(x) FROM (
     SELECT id, texto, repetir, to_char(cuando AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS dia, to_char(cuando AT TIME ZONE ${TZ}, 'HH24:MI') AS hora
     FROM recordatorios WHERE chat_id = ${c} AND activo AND cuando >= ${desde} AND cuando < ${hasta}
       AND texto NOT LIKE '📅%'          -- los avisos de eventos ya salen en el calendario
     ORDER BY cuando LIMIT 25) x), '[]'::json) AS recordatorios,
  COALESCE((SELECT json_agg(x) FROM (
     SELECT id, texto, prioridad, to_char(vence, 'YYYY-MM-DD') AS vence, (vence < (now() AT TIME ZONE ${TZ})::date) AS vencida
     FROM tareas WHERE chat_id = ${c} AND NOT hecha
     ORDER BY (vence IS NULL), vence, prioridad, id LIMIT 12) x), '[]'::json) AS tareas,
  (SELECT count(*) FROM tareas WHERE chat_id = ${c} AND NOT hecha)::int AS n_pendientes,
  (SELECT count(*) FROM tareas WHERE chat_id = ${c} AND NOT hecha AND vence < (now() AT TIME ZONE ${TZ})::date)::int AS n_vencidas,
  COALESCE((SELECT json_agg(x) FROM (
     SELECT id, texto FROM tareas WHERE chat_id = ${c} AND hecha AND hecha_en >= now() - interval '7 days' ORDER BY hecha_en LIMIT 15) x), '[]'::json) AS hechas_semana,
  (SELECT count(*) FROM tareas WHERE chat_id = ${c} AND hecha AND hecha_en >= now() - interval '7 days')::int AS n_hechas_semana,
  (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = ${c} AND fecha >= (${INI_DIA} - interval '1 day') AND fecha < ${INI_DIA}) AS gasto_ayer,
  (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = ${c} AND fecha >= ${INI_SEMANA}) AS gasto_semana,
  (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = ${c} AND fecha >= ${INI_MES}) AS gasto_mes,
  (SELECT COALESCE(sum(s), 0) FROM (SELECT sum(monto) AS s FROM deudas WHERE chat_id = ${c} GROUP BY lower(persona)) d WHERE s > 0) AS te_deben,
  (SELECT COALESCE(-sum(s), 0) FROM (SELECT sum(monto) AS s FROM deudas WHERE chat_id = ${c} GROUP BY lower(persona)) d WHERE s < 0) AS debes,
  COALESCE((SELECT json_agg(x ORDER BY x.id) FROM (
     SELECT id, nombre, objetivo, ahorrado, to_char(fecha_limite, 'YYYY-MM-DD') AS fecha_limite FROM metas WHERE chat_id = ${c} AND activa) x), '[]'::json) AS metas;`;

return [{ json: { sql } }];
