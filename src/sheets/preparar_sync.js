// ⚙️ Pega aquí el ID de tu hoja "Mis finanzas" (lo que va entre /d/ y /edit en el link)
const SHEET_ID = 'PEGA_AQUI_EL_ID_DE_TU_HOJA';
// ⚙️ Tu chat_id de Telegram
const CHAT_ID = 'TU_CHAT_ID';
if (SHEET_ID.startsWith('PEGA_AQUI')) return [];
const C = Number(CHAT_ID);
const TZ = "'America/Lima'";
// Fechas como número de serie de hoja de cálculo (así no importa el idioma de la hoja)
const S = x => `round((extract(epoch from (${x} AT TIME ZONE ${TZ})) / 86400.0 + 25569)::numeric, 6)`;
const SL = x => `round((extract(epoch from ${x}) / 86400.0 + 25569)::numeric, 6)`;
const SD = x => `(${x} - date '1899-12-30')`;

const sql = `
WITH mov AS (
  SELECT fecha, 'Gasto'::text AS tipo, monto, categoria, COALESCE(descripcion, '') AS d, metodo AS m FROM gastos WHERE chat_id = ${C}
  UNION ALL
  SELECT fecha, 'Ingreso', monto, '', COALESCE(descripcion, ''), '' FROM ingresos WHERE chat_id = ${C}
), p AS (
  SELECT json_build_object(
    'mov', COALESCE((SELECT json_agg(json_build_array(${S('fecha')}, tipo, monto, categoria, d, m, ${SL(`date_trunc('week', fecha AT TIME ZONE ${TZ})`)}) ORDER BY fecha DESC, tipo) FROM mov), '[]'::json),
    'pres', COALESCE((SELECT json_agg(json_build_array(categoria, monto) ORDER BY categoria) FROM presupuestos WHERE chat_id = ${C}), '[]'::json),
    'deu_res', COALESCE((SELECT json_agg(json_build_array(persona, saldo, CASE WHEN saldo > 0 THEN 'te debe' ELSE 'le debes' END) ORDER BY saldo DESC) FROM (
        SELECT (array_agg(persona ORDER BY id DESC))[1] AS persona, sum(monto) AS saldo FROM deudas WHERE chat_id = ${C}
        GROUP BY lower(persona) HAVING abs(sum(monto)) >= 0.01) x), '[]'::json),
    'deu_mov', COALESCE((SELECT json_agg(json_build_array(${S('fecha')}, persona, monto, COALESCE(descripcion, '')) ORDER BY fecha DESC, id DESC) FROM deudas WHERE chat_id = ${C}), '[]'::json),
    'metas', COALESCE((SELECT json_agg(json_build_array(nombre, objetivo, ahorrado, CASE WHEN fecha_limite IS NULL THEN NULL ELSE ${SD('fecha_limite')} END) ORDER BY id) FROM metas WHERE chat_id = ${C} AND activa), '[]'::json),
    'tareas', COALESCE((SELECT json_agg(json_build_array(texto, CASE prioridad WHEN 1 THEN 'Alta' WHEN 2 THEN 'Media' ELSE 'Baja' END,
        CASE WHEN vence IS NULL THEN NULL ELSE ${SD('vence')} END, CASE WHEN hecha THEN 'Hecha' ELSE 'Pendiente' END,
        CASE WHEN hecha_en IS NULL THEN NULL ELSE ${S('hecha_en')} END, ${S('creado_en')})
        ORDER BY hecha, vence NULLS LAST, prioridad, id) FROM tareas WHERE chat_id = ${C}), '[]'::json),
    'recu', COALESCE((SELECT json_agg(json_build_array(nombre, monto, categoria, dia, CASE WHEN activo THEN 'Sí' ELSE 'No' END) ORDER BY activo DESC, dia, id) FROM recurrentes WHERE chat_id = ${C}), '[]'::json),
    'reco', COALESCE((SELECT json_agg(json_build_array(texto, ${S('cuando')}, COALESCE(repetir, 'una vez')) ORDER BY cuando) FROM recordatorios WHERE chat_id = ${C} AND activo), '[]'::json)
  ) AS payload
)
-- Solo devuelve algo si cambió desde la última vez
SELECT md5(payload::text) AS hash, payload FROM p
WHERE md5(payload::text) IS DISTINCT FROM (SELECT hash FROM sync_estado WHERE clave = 'sheets');`;

return [{ json: { sheet_id: SHEET_ID, sql } }];
