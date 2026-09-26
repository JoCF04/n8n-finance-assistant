// Define qué rango de fechas mirar según quién pidió la agenda
//  manana  → resumen de las 7 am (hoy)
//  semana  → revisión del domingo (la semana que viene)
//  comando → /agenda (de ahora a 7 días)
const j = $input.first().json;
const origen = j.origen || 'comando';
const hoy = $now.setZone('America/Lima').startOf('day');
let desde, hasta;
if (origen === 'manana') { desde = hoy; hasta = hoy.plus({ days: 1 }); }
else if (origen === 'semana') { desde = hoy.plus({ days: 1 }); hasta = desde.plus({ days: 7 }); }
else { desde = $now.setZone('America/Lima'); hasta = hoy.plus({ days: 8 }); }
return [{ json: { origen, clima: j.clima || null, desde: desde.toISO(), hasta: hasta.toISO() } }];
