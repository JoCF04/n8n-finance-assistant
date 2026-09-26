// ⚙️ Tu chat_id de Telegram
const CHAT_ID = 'TU_CHAT_ID';
const chat = Number(CHAT_ID);
const CATS = ['Comida', 'Transporte', 'Ocio', 'Compras', 'Salud', 'Educación', 'Servicios', 'Hogar', 'Otros'];
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const q = v => (v === null || v === undefined || v === '') ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";
const TZ = "'America/Lima'";
const INI_MES = `(date_trunc('month', now() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ})`;

const out = [];
$input.all().forEach((it, i) => {
  const r = it.json;
  const mail = $('Gmail Trigger').itemMatching(i).json;

  let data = null;
  try {
    const txt = r.candidates[0].content.parts.map(p => p.text || '').join('');
    data = JSON.parse(txt.replace(/```json|```/g, '').trim());
    if (Array.isArray(data)) data = data[0];
  } catch (e) { data = null; }
  if (!data || !data.es_consumo || !(Number(data.monto) > 0)) return;   // no es un gasto → se ignora

  const monto = Math.round(Number(data.monto) * 100) / 100;
  const cat = CATS.find(c => norm(c) === norm(data.categoria)) || 'Otros';
  const comercio = data.comercio ? String(data.comercio).trim().slice(0, 120) : null;
  let desc = data.descripcion ? String(data.descripcion).trim().toLowerCase().slice(0, 190) : (comercio ? comercio.toLowerCase() : null);
  if (String(data.moneda || '').toUpperCase() === 'USD') desc = (desc ? desc + ' ' : '') + '(USD)';

  // Fecha: la del correo o la de la operación si viene en el texto
  let fechaExpr = 'now()';
  const fMail = mail.date ? DateTime.fromJSDate(new Date(mail.date)) : null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(data.fecha || '')) {
    const hora = /^\d{2}:\d{2}$/.test(data.hora || '') ? data.hora : '12:00';
    const f = DateTime.fromISO(`${data.fecha}T${hora}`, { zone: 'America/Lima' });
    const dias = f.isValid ? $now.diff(f, 'days').days : 999;
    if (dias >= -1 && dias <= 30) fechaExpr = `(${q(data.fecha + ' ' + hora)}::timestamp AT TIME ZONE 'America/Lima')`;
  } else if (fMail && fMail.isValid) {
    fechaExpr = `${q(fMail.toISO())}::timestamptz`;
  }

  const sql = `
WITH nuevo AS (
  SELECT ${fechaExpr}::timestamptz AS fecha, ${monto}::numeric AS monto, ${q(desc)}::text AS descripcion,
         ${q(cat)}::text AS categoria, 'correo'::text AS metodo, ${q(comercio)}::text AS destinatario,
         ${chat}::bigint AS chat_id, ${q(String(mail.subject || '').slice(0, 300))}::text AS mensaje_original,
         ${q(mail.id)}::text AS email_id
), ins AS (
  INSERT INTO gastos (fecha, monto, descripcion, categoria, metodo, destinatario, chat_id, mensaje_original, email_id)
  SELECT n.* FROM nuevo n
  WHERE NOT EXISTS (   -- ya lo registraste a mano o por captura (mismo monto, ±20 min)
    SELECT 1 FROM gastos g
    WHERE g.chat_id = n.chat_id AND g.monto = n.monto
      AND g.fecha BETWEEN n.fecha - interval '20 minutes' AND n.fecha + interval '20 minutes')
  ON CONFLICT (email_id) DO NOTHING
  RETURNING *
)
SELECT (SELECT count(*) FROM ins)::int AS insertado,
       n.chat_id, n.monto, n.descripcion, n.categoria, n.destinatario,
       to_char(n.fecha AT TIME ZONE ${TZ}, 'DD/MM HH24:MI') AS fecha_local,
       (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = n.chat_id AND fecha >= ${INI_MES})
         + (SELECT COALESCE(sum(monto), 0) FROM ins WHERE fecha >= ${INI_MES}) AS total_mes,
       (SELECT monto FROM presupuestos WHERE chat_id = n.chat_id AND categoria = n.categoria) AS presupuesto,
       (SELECT COALESCE(sum(monto), 0) FROM gastos WHERE chat_id = n.chat_id AND categoria = n.categoria AND fecha >= ${INI_MES})
         + (SELECT COALESCE(sum(monto), 0) FROM ins WHERE fecha >= ${INI_MES}) AS gastado_cat_mes
FROM nuevo n;`;
  out.push({ json: { sql }, pairedItem: i });
});
return out;
