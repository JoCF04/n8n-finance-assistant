
// ⚙️ Tu chat_id de Telegram
const CHAT_ID = 'TU_CHAT_ID';
if (CHAT_ID === 'TU_CHAT_ID') return [];

// Corre los lunes 7:00 → semana pasada + mes en curso + balance + presupuestos
// (+ cierre del mes anterior la 1ra semana del mes)
const hoy = $now.setZone('America/Lima');
const items = [
  { json: { sql: reporte(CHAT_ID, 'semanal', 'Semana pasada (lun–dom)', `(${INI_SEMANA} - interval '7 days')`, INI_SEMANA, { dias: true }) } },
  { json: { sql: reporte(CHAT_ID, 'mes', `Mes en curso (${hoy.setLocale('es').toFormat('LLLL')})`, INI_MES, FUTURO, {}) } },
  { json: { sql: sqlBalance(CHAT_ID, 'reporte') } },
  { json: { sql: sqlPresupuestos(CHAT_ID, 'reporte') } },
];
if (hoy.day <= 7) {
  const mesPasado = hoy.minus({ months: 1 }).setLocale('es').toFormat('LLLL');
  items.push({ json: { sql: reporte(CHAT_ID, 'mes', `Cierre de ${mesPasado}`, INI_MES_ANT, INI_MES, {}) } });
}
return items;
