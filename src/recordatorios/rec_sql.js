// ⚙️ Tu chat_id de Telegram
const CHAT_ID = 'TU_CHAT_ID';
const c = Number(CHAT_ID);

// Corre cada minuto: toma los recordatorios que ya tocan, los marca como enviados
// y, si se repiten, calcula la próxima fecha.
const sig = (paso, extra, filtro = '') => `(SELECT min(t) FROM generate_series(r.cuando + interval '${paso}', now() + interval '${extra}', interval '${paso}') t WHERE t > now()${filtro})`;
const sql = `
WITH due AS (
  SELECT * FROM recordatorios WHERE chat_id = ${c} AND activo AND cuando <= now() ORDER BY cuando LIMIT 20
), upd AS (
  UPDATE recordatorios r SET
    enviado_en = now(),
    activo = (r.repetir IS NOT NULL),
    cuando = COALESCE(CASE r.repetir
      WHEN 'diario'     THEN ${sig('1 day', '2 days')}
      WHEN 'semanal'    THEN ${sig('7 days', '8 days')}
      WHEN 'mensual'    THEN ${sig('1 month', '32 days')}
      WHEN 'laborables' THEN ${sig('1 day', '5 days', " AND extract(isodow FROM t AT TIME ZONE 'America/Lima') < 6")}
      ELSE r.cuando END, now() + interval '1 day')
  FROM due WHERE r.id = due.id
  RETURNING r.id
)
SELECT ${c}::bigint AS chat_id,
  COALESCE((SELECT json_agg(json_build_object('id', id, 'texto', texto, 'repetir', repetir) ORDER BY cuando) FROM due), '[]'::json) AS avisos,
  (SELECT count(*) FROM upd)::int AS n;`;
return [{ json: { sql } }];
