// Después de crear el evento en Google Calendar: arma la confirmación y un aviso 30 min antes
const ev = $('Interpretar respuesta').first().json;
const r = $input.first().json;
const q = v => (v === null || v === undefined || v === '') ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";
const chat = Number(ev.chat_id);

if (!r || r.error || !r.id) {
  const e = r && r.error;
  const detalle = e ? String(e.message || e.description || JSON.stringify(e)) : 'Google Calendar no respondió';
  return [{ json: { sql: `SELECT 'evento_error' AS clase, ${chat}::bigint AS chat_id, ${q(detalle.slice(0, 200))} AS detalle;` } }];
}

const ini = DateTime.fromISO(ev.inicio_iso).setZone('America/Lima').setLocale('es');
let cuandoTxt, aviso, textoAviso;
if (ev.todo_el_dia) {
  cuandoTxt = ini.toFormat("cccc d 'de' LLLL") + ' (todo el día)';
  aviso = ini.set({ hour: 8, minute: 0 });
  textoAviso = `📅 Hoy: ${ev.titulo}`;
} else {
  const fin = DateTime.fromISO(ev.evento.end.dateTime, { zone: 'America/Lima' });
  cuandoTxt = ini.toFormat("cccc d 'de' LLLL, HH:mm") + (fin.isValid ? '–' + fin.toFormat('HH:mm') : '');
  aviso = ini.minus({ minutes: 30 });
  textoAviso = `📅 En 30 min: ${ev.titulo}${r.location ? ' (' + r.location + ')' : ''}`;
}
const crearAviso = aviso > $now.plus({ minutes: 1 });

const sql = `
WITH ins AS (
  ${crearAviso
    ? `INSERT INTO recordatorios (chat_id, texto, cuando) VALUES (${chat}, ${q(textoAviso)}, ${q(aviso.toISO())}::timestamptz) RETURNING id`
    : 'SELECT NULL::bigint AS id WHERE false'}
)
SELECT 'evento' AS clase, ${chat}::bigint AS chat_id, ${q(ev.titulo)} AS titulo, ${q(cuandoTxt)} AS cuando_txt,
       ${q(r.location || null)} AS lugar, ${q(r.htmlLink || null)} AS link, ${ev.todo_el_dia ? 'true' : 'false'} AS todo_el_dia,
       (SELECT count(*) FROM ins)::int AS con_aviso;`;

return [{ json: { sql } }];
