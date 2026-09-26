// --- Helpers SQL (zona horaria Lima) ---
const TZ = "'America/Lima'";
const q = v => (v === null || v === undefined || v === '') ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";
const INI_DIA = `(date_trunc('day', now() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ})`;
const INI_SEMANA = `(date_trunc('week', now() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ})`;
const INI_MES = `(date_trunc('month', now() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ})`;
const INI_MES_ANT = `(${INI_MES} - interval '1 month')`;
const FUTURO = `(now() + interval '10 years')`;

// Un reporte = 1 fila con totales, categorías, días y detalle (en JSON)
function reporte(chat, tipo, titulo, desde, hasta, opts = {}) {
  return `
WITH g AS (
  SELECT * FROM gastos WHERE chat_id = ${Number(chat)} AND fecha >= ${desde} AND fecha < ${hasta}
)
SELECT ${q(tipo)} AS tipo, ${Number(chat)}::bigint AS chat_id, ${q(titulo)} AS titulo,
  ${opts.detalle ? 'true' : 'false'} AS mostrar_detalle, ${opts.dias ? 'true' : 'false'} AS mostrar_dias,
  (SELECT COALESCE(sum(monto), 0) FROM g) AS total,
  (SELECT count(*) FROM g)::int AS n,
  COALESCE((SELECT json_agg(c) FROM (
     SELECT categoria, sum(monto) AS total, count(*)::int AS n FROM g GROUP BY categoria ORDER BY 2 DESC) c), '[]'::json) AS categorias,
  COALESCE((SELECT json_agg(d) FROM (
     SELECT to_char(dia, 'YYYY-MM-DD') AS dia, total FROM (
       SELECT date_trunc('day', fecha AT TIME ZONE ${TZ}) AS dia, sum(monto) AS total FROM g GROUP BY 1) s
     ORDER BY s.dia) d), '[]'::json) AS por_dia,
  COALESCE((SELECT json_agg(x) FROM (
     SELECT to_char(fecha AT TIME ZONE ${TZ}, 'DD/MM') AS dia, to_char(fecha AT TIME ZONE ${TZ}, 'HH24:MI') AS hora,
            monto, descripcion, categoria, metodo
     FROM g ORDER BY fecha) x), '[]'::json) AS detalle;`;
}

// Ingresos vs gastos del mes (y del mes anterior)
function sqlBalance(chat, origen) {
  const c = Number(chat);
  return `
SELECT 'balance' AS tipo, ${c}::bigint AS chat_id, ${q(origen)} AS origen,
  (SELECT COALESCE(sum(monto), 0) FROM ingresos WHERE chat_id = ${c} AND fecha >= ${INI_MES}) AS ingresos,
  (SELECT COALESCE(sum(monto), 0) FROM gastos   WHERE chat_id = ${c} AND fecha >= ${INI_MES}) AS gastos,
  (SELECT COALESCE(sum(monto), 0) FROM ingresos WHERE chat_id = ${c} AND fecha >= ${INI_MES_ANT} AND fecha < ${INI_MES}) AS ingresos_ant,
  (SELECT COALESCE(sum(monto), 0) FROM gastos   WHERE chat_id = ${c} AND fecha >= ${INI_MES_ANT} AND fecha < ${INI_MES}) AS gastos_ant,
  COALESCE((SELECT json_agg(x) FROM (
     SELECT to_char(fecha AT TIME ZONE ${TZ}, 'DD/MM') AS dia, monto, descripcion
     FROM ingresos WHERE chat_id = ${c} AND fecha >= ${INI_MES} ORDER BY fecha) x), '[]'::json) AS detalle;`;
}

// Estado de los presupuestos del mes
function sqlPresupuestos(chat, origen) {
  const c = Number(chat);
  return `
SELECT 'presupuestos' AS tipo, ${c}::bigint AS chat_id, ${q(origen)} AS origen,
  COALESCE((SELECT json_agg(x) FROM (
     SELECT p.categoria, p.monto AS presupuesto,
            COALESCE((SELECT sum(g.monto) FROM gastos g
                      WHERE g.chat_id = p.chat_id AND g.categoria = p.categoria AND g.fecha >= ${INI_MES}), 0) AS gastado
     FROM presupuestos p WHERE p.chat_id = ${c} ORDER BY p.categoria) x), '[]'::json) AS filas;`;
}
