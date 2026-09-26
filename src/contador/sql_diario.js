
// ⚙️ Tu chat_id de Telegram
const CHAT_ID = 'TU_CHAT_ID';
if (CHAT_ID === 'TU_CHAT_ID') return [];

// Corre a las 00:00 → resume el día que acaba de terminar
const ayer = $now.setZone('America/Lima').minus({ days: 1 }).toFormat('dd/MM');
return [{ json: { sql: reporte(CHAT_ID, 'diario', `Resumen de ayer (${ayer})`, `(${INI_DIA} - interval '1 day')`, INI_DIA, { detalle: true }) } }];
