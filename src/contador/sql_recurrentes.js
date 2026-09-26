// ⚙️ Tu chat_id de Telegram
const CHAT_ID = 'TU_CHAT_ID';
if (CHAT_ID === 'TU_CHAT_ID') return [];
const c = Number(CHAT_ID);
const q = v => (v === null || v === undefined || v === '') ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";

// Corre todos los días 8:00 → registra los pagos recurrentes que tocan hoy
// (y los atrasados, si el servidor estuvo apagado) + avisa los de mañana
const hoy = $now.setZone('America/Lima');
const ym = hoy.toFormat('yyyy-MM');
const d = hoy.day, fin = hoy.endOf('month').day;
const man = hoy.plus({ days: 1 });
const ymMan = man.toFormat('yyyy-MM'), dMan = man.day, finMan = man.endOf('month').day;

const sql = `
WITH due AS (
  SELECT * FROM recurrentes
  WHERE chat_id = ${c} AND activo AND COALESCE(ultimo_mes, '') <> ${q(ym)} AND LEAST(dia, ${fin}) <= ${d}
), ins AS (
  INSERT INTO gastos (fecha, monto, descripcion, categoria, metodo, chat_id, mensaje_original)
  SELECT now(), monto, lower(nombre), categoria, 'recurrente', chat_id, 'recurrente #' || id FROM due
  RETURNING id
), upd AS (
  UPDATE recurrentes r SET ultimo_mes = ${q(ym)} FROM due WHERE r.id = due.id
  RETURNING r.id
)
SELECT 'recurrentes_dia' AS tipo, ${c}::bigint AS chat_id,
  COALESCE((SELECT json_agg(json_build_object('nombre', nombre, 'monto', monto, 'categoria', categoria) ORDER BY dia) FROM due), '[]'::json) AS cobrados,
  COALESCE((SELECT json_agg(json_build_object('nombre', nombre, 'monto', monto) ORDER BY id) FROM recurrentes
            WHERE chat_id = ${c} AND activo AND LEAST(dia, ${finMan}) = ${dMan} AND COALESCE(ultimo_mes, '') <> ${q(ymMan)}), '[]'::json) AS manana,
  (SELECT count(*) FROM ins)::int AS n_ins,
  (SELECT count(*) FROM upd)::int AS n_upd;`;

return [{ json: { sql } }];
