const S = n => 'S/ ' + Number(n || 0).toFixed(2);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const EMOJI = { 'Comida': '🍔', 'Transporte': '🚕', 'Ocio': '🎮', 'Compras': '🛍️', 'Salud': '💊', 'Educación': '📚', 'Servicios': '💡', 'Hogar': '🏠', 'Otros': '📦' };

const out = [];
for (const it of $input.all()) {
  const r = it.json;
  if (!Number(r.insertado)) continue;   // duplicado → no avisa
  const L = [
    '🏦 <b>Gasto detectado en tu correo</b>',
    `💸 <b>${S(r.monto)}</b>${r.descripcion ? ' — ' + esc(r.descripcion) : ''}`,
    `${EMOJI[r.categoria] || '📦'} ${esc(r.categoria)} · 🕒 ${r.fecha_local}`,
    '',
    `Este mes: <b>${S(r.total_mes)}</b>`,
  ];
  if (r.presupuesto !== null && r.presupuesto !== undefined && Number(r.presupuesto) > 0) {
    const p = Number(r.presupuesto), g = Number(r.gastado_cat_mes), pct = g / p * 100;
    if (pct >= 100) L.push('', `🚨 <b>Te pasaste</b> del presupuesto de ${esc(r.categoria)}: ${S(g)} de ${S(p)} (${pct.toFixed(0)}%)`);
    else if (pct >= 80) L.push('', `⚠️ Llevas el ${pct.toFixed(0)}% del presupuesto de ${esc(r.categoria)}. Te quedan ${S(p - g)}.`);
    else L.push(`🎯 ${esc(r.categoria)}: ${S(g)} de ${S(p)} (${pct.toFixed(0)}%)`);
  }
  L.push('', '<i>¿Mal categorizado? /cat comida · ¿No era un gasto? /borrar</i>');
  out.push({ json: { chat_id: r.chat_id, texto: L.join('\n') } });
}
return out;
