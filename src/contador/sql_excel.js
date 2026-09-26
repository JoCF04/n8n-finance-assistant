
// /excel [mesanterior | todo | 2026-08] → movimientos (gastos + ingresos) para el archivo
const j = $input.first().json;
const chat = Number(j.chat_id);
const arg = String(j.texto || '').split(/\s+/).slice(1).join(' ').trim().toLowerCase();
const hoy = $now.setZone('America/Lima');

let desde = INI_MES, hasta = FUTURO, etiqueta = hoy.toFormat('yyyy-MM'), nombre = hoy.setLocale('es').toFormat('LLLL yyyy');
if (/anterior|pasado/.test(arg)) {
  desde = INI_MES_ANT; hasta = INI_MES;
  const m = hoy.minus({ months: 1 });
  etiqueta = m.toFormat('yyyy-MM'); nombre = m.setLocale('es').toFormat('LLLL yyyy');
} else if (/todo|todos|completo/.test(arg)) {
  desde = `'2000-01-01'::timestamptz`; etiqueta = 'todo'; nombre = 'todo el historial';
} else if (/^\d{4}-\d{2}$/.test(arg)) {
  const m = DateTime.fromISO(arg + '-01', { zone: 'America/Lima' });
  desde = `${q(m.toISO())}::timestamptz`; hasta = `${q(m.plus({ months: 1 }).toISO())}::timestamptz`;
  etiqueta = arg; nombre = m.setLocale('es').toFormat('LLLL yyyy');
}

const sql = `
SELECT * FROM (
  SELECT to_char(fecha AT TIME ZONE ${TZ}, 'YYYY-MM-DD HH24:MI') AS "Fecha", 'Gasto' AS "Tipo", -monto::float AS "Monto",
         categoria AS "Categoría", COALESCE(descripcion, '') AS "Descripción", metodo AS "Método"
  FROM gastos WHERE chat_id = ${chat} AND fecha >= ${desde} AND fecha < ${hasta}
  UNION ALL
  SELECT to_char(fecha AT TIME ZONE ${TZ}, 'YYYY-MM-DD HH24:MI'), 'Ingreso', monto::float, '', COALESCE(descripcion, ''), ''
  FROM ingresos WHERE chat_id = ${chat} AND fecha >= ${desde} AND fecha < ${hasta}
) m ORDER BY "Fecha";`;

return [{ json: {
  sql,
  chat_id: chat,
  archivo: `movimientos_${etiqueta}.xlsx`,
  caption: `📄 Tus movimientos de ${nombre}. Los gastos van en negativo y los ingresos en positivo.\n<i>Otros periodos: /excel mesanterior · /excel todo · /excel 2026-08</i>`,
} }];
