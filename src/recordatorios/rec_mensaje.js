const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const REP = { diario: 'todos los días', semanal: 'cada semana', mensual: 'cada mes', laborables: 'de lunes a viernes' };
const out = [];
for (const it of $input.all()) {
  const r = it.json;
  const avisos = typeof r.avisos === 'string' ? JSON.parse(r.avisos) : (r.avisos || []);
  for (const a of avisos) {
    const evento = String(a.texto).startsWith('📅');
    out.push({ json: { chat_id: r.chat_id, texto: [
      evento ? esc(a.texto) : `⏰ <b>Recordatorio</b>\n${esc(a.texto)}`,
      a.repetir ? `🔁 <i>Se repite ${REP[a.repetir] || a.repetir}</i>` : null,
      '',
      '<i>/posponer 10 · /posponer 1h</i>',
    ].filter(l => l !== null).join('\n') } });
  }
}
return out;
