// ⚙️ Tu chat_id de Telegram (solo tú puedes usar el bot)
const CHAT_ID = 'TU_CHAT_ID';

// --- Camino rápido: registra gastos sin IA cuando el texto es claro ---
const L = 'a-z0-9áéíóúñü';
const w = lista => new RegExp(`(^|[^${L}])(${lista})s?(?=$|[^${L}])`, 'i');
const REGLAS = {
  'Comida': w('almuerzo|desayuno|cena|lonche|menu|menú|comida|pollo|pollería|polleria|pizza|burger|hamburguesa|cafe|café|snack|galleta|gaseosa|chifa|ceviche|delivery|rappi|pedidosya|mercado|pan|fruta|helado|chocolate|juane|salchipapa|sanguche|sandwich|kfc|bembos|starbucks|mcdonalds|tambo|oxxo'),
  'Transporte': w('taxi|uber|indrive|didi|cabify|bus|combi|micro|metro|metropolitano|corredor|pasaje|gasolina|combustible|peaje|mototaxi|moto|estacionamiento|cochera'),
  'Ocio': w('cine|juego|salida|chela|cerveza|trago|bar|discoteca|disco|concierto|netflix|spotify|steam|playstation|psn|xbox|fiesta|entrada|karaoke|bowling|billar'),
  'Compras': w('ropa|zapatilla|polo|pantalón|pantalon|casaca|audifono|audífono|cable|cargador|amazon|aliexpress|temu|compra|regalo|mochila'),
  'Salud': w('farmacia|pastilla|medicina|doctor|consulta|gym|gimnasio|dentista|inkafarma|mifarma|vitamina'),
  'Educación': w('curso|libro|copia|impresión|impresion|upc|universidad|udemy|platzi|matrícula|matricula|útiles|utiles'),
  'Servicios': w('recarga|celular|internet|luz|plan|suscripción|suscripcion|icloud|claude|chatgpt|google one|youtube premium|corte|peluquería|peluqueria|barbería|barberia|lavandería|lavanderia'),
  'Hogar': w('casa|limpieza|detergente|mueble|foco|alquiler|jabón|jabon|papel'),
};
// Si suena a ingreso o a agenda (recordatorio, tarea, evento), siempre lo decide la IA
const INGRESO = w('sueldo|salario|pagaron|yapearon|plinearon|depositaron|transfirieron|cobr[eé]|ingreso|quincena|propina|reembolso|reembolsaron|devolvieron|gan[eé]|vend[ií]');
const AGENDA = w('recu[eé]rdame|recordar|recordatorio|av[ií]same|alarma|tarea|pendiente|agenda|agendar|ag[eé]ndame|evento|reuni[oó]n|cita|cumplea[nñ]os|tengo que|debo|mañana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|a las');

// Preguntas, deudas y ahorros también van a la IA
const OTROS = w('cu[aá]nto|cu[aá]ntos|cu[aá]ntas|qu[eé]|c[oó]mo|cu[aá]l|cu[aá]les|d[oó]nde|cu[aá]ndo|por qu[eé]|muestra|mu[eé]strame|dame|debe|deben|deb[ií]a|prest[eé]|prest[oó]|prestaron|ahorr[eé]|ahorro|ahorrar|separ[eé]|meta|hola|gracias');

function rapido(texto) {
  const t = texto.toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  if (INGRESO.test(t) || AGENDA.test(t) || OTROS.test(t) || /[?¿]/.test(t)) return null;
  const nums = t.match(/\d+(?:\.\d{1,2})?/g);
  if (!nums || nums.length !== 1) return null;           // sin número o varios números → IA
  const monto = parseFloat(nums[0]);
  if (!(monto > 0)) return null;
  let resto = t.replace(nums[0], ' ');
  let dias = 0;
  if (w('anteayer').test(resto)) { dias = 2; resto = resto.replace(/anteayer/, ' '); }
  else if (w('ayer').test(resto)) { dias = 1; resto = resto.replace(/ayer/, ' '); }
  resto = resto.replace(/s\/\.?/g, ' ')
    .replace(new RegExp(`(^|[^${L}])(soles|sol|so|lucas|luca|pe|pen)(?=$|[^${L}])`, 'g'), ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^(en|de|por|para|del)\s+/, '').trim();
  if (!resto) return { monto, descripcion: null, categoria: 'Otros', dias_atras: dias };
  const categoria = Object.keys(REGLAS).find(c => REGLAS[c].test(resto));
  if (!categoria) return null;                            // motivo raro → IA
  return { monto, descripcion: resto.slice(0, 200), categoria, dias_atras: dias };
}

const out = [];
for (const item of $input.all()) {
  const m = item.json.message;
  if (!m || !m.chat) continue;
  const base = { chat_id: m.chat.id, message_id: m.message_id };

  // Modo configuración: si aún no pusiste tu chat_id, el bot te lo dice
  if (CHAT_ID === 'TU_CHAT_ID') {
    out.push({ json: { ...base, ruta: 3, texto: `⚙️ Tu chat_id es: <code>${m.chat.id}</code>\nReemplaza TU_CHAT_ID por ese número en todos los nodos que tengan <code>const CHAT_ID</code> (Contador, Recordatorios, Correos, Sheets y Alertas).` } });
    continue;
  }
  // Ignora a cualquier otra persona que le escriba al bot
  if (String(m.chat.id) !== String(CHAT_ID)) continue;

  const caption = (m.caption || '').trim();
  if (m.photo && m.photo.length) {
    const foto = m.photo[m.photo.length - 1]; // la de mayor resolución
    out.push({ json: { ...base, ruta: 0, tipo: 'foto', file_id: foto.file_id, texto: caption } });
  } else if (m.document && /^image\//.test(m.document.mime_type || '')) {
    out.push({ json: { ...base, ruta: 0, tipo: 'foto', file_id: m.document.file_id, texto: caption } });
  } else if (m.voice || m.audio) {
    const a = m.voice || m.audio;                          // 🎙️ nota de voz
    out.push({ json: { ...base, ruta: 0, tipo: 'voz', file_id: a.file_id, mime: a.mime_type || 'audio/ogg', texto: caption } });
  } else if (typeof m.text === 'string' && /^\/excel(@\w+)?(\s|$)/i.test(m.text.trim())) {
    out.push({ json: { ...base, ruta: 6, tipo: 'comando', texto: m.text.trim() } });  // 📄 archivo Excel
  } else if (typeof m.text === 'string' && /^\/agenda(@\w+)?(\s|$)/i.test(m.text.trim())) {
    out.push({ json: { ...base, ruta: 5, tipo: 'comando', texto: m.text.trim() } });  // 📅 necesita Google Calendar
  } else if (typeof m.text === 'string' && m.text.trim().startsWith('/')) {
    out.push({ json: { ...base, ruta: 1, tipo: 'comando', texto: m.text.trim() } });
  } else if (typeof m.text === 'string' && m.text.trim()) {
    const texto = m.text.trim();
    const r = rapido(texto);
    if (r) out.push({ json: { ...base, ruta: 4, tipo: 'texto', texto, rapido: r } });   // sin IA ⚡
    else out.push({ json: { ...base, ruta: 2, tipo: 'texto', texto } });              // con IA 🤖
  }
}
return out;
