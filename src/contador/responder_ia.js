const p = $('Interpretar respuesta').first().json;
const r = $input.first().json;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let txt = '';
try { txt = r.candidates[0].content.parts.map(x => x.text || '').join('').trim(); } catch (e) {}
if (!txt) txt = 'Uy, no pude armar la respuesta ahorita 😅 Intenta de nuevo en un ratito o mira /ayuda.';
txt = esc(txt.slice(0, 3500))
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/^\s*[-*]\s+/gm, '• ');
return [{ json: { chat_id: p.chat_id, texto: txt } }];
