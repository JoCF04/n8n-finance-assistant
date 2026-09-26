const j = $input.first().json;
const cfg = $('Preparar sync').first().json;
const P = typeof j.payload === 'string' ? JSON.parse(j.payload) : j.payload;

// 1) Borra solo las celdas de datos (las fórmulas y formatos se quedan)
const clear = { ranges: ['Movimientos!A2:G', 'Presupuestos!A2:B', 'Deudas!A2:C', 'Deudas!E2:H', 'Metas!A2:D',
  'Tareas!A2:F', 'Recurrentes!A2:E', 'Recordatorios!A2:C'] };

// 2) Escribe todo de nuevo desde tu base de datos
const data = [];
const add = (range, rows) => { if (rows && rows.length) data.push({ range, values: rows }); };
add('Movimientos!A2', P.mov);
add('Presupuestos!A2', P.pres);
add('Deudas!A2', P.deu_res);
add('Deudas!E2', P.deu_mov);
add('Metas!A2', P.metas);
add('Tareas!A2', P.tareas);
add('Recurrentes!A2', P.recu);
add('Recordatorios!A2', P.reco);
data.push({ range: 'Resumen!B2', values: [[$now.setZone('America/Lima').toFormat('dd/MM/yyyy HH:mm')]] });

return [{ json: { sheet_id: cfg.sheet_id, hash: j.hash, filas: (P.mov || []).length, clear, update: { valueInputOption: 'RAW', data } } }];
