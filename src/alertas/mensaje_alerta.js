// ⚙️ Tu chat_id de Telegram
const CHAT_ID = 'TU_CHAT_ID';
const a = $('Preparar alerta').first().json;
const r = $input.first().json;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Si la base de datos respondió y ya avisamos hace poco, no repetimos
if (r && !r.error && Number(r.veces) > 1) return [];
const L = [
  '🚨 <b>Algo falló en tu bot</b>',
  `Workflow: <b>${esc(a.wf)}</b>`,
  `Nodo: ${esc(a.nodo)}`,
  `Error: <i>${esc(a.msg)}</i>`,
];
if (a.pista) L.push('', `💡 ${esc(a.pista)}`);
if (r && r.error) L.push('', '<i>(Tampoco pude conectarme a la base de datos para registrar la alerta.)</i>');
if (a.link) L.push('', `<a href="${esc(a.link)}">Ver la ejecución en n8n</a>`);
L.push('', '<i>Si sigue fallando te vuelvo a avisar en 30 min.</i>');
return [{ json: { chat_id: CHAT_ID, texto: L.join('\n') } }];
