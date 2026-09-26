const ctx = $('Clasificar mensaje').first().json;
const CATEGORIAS = 'Comida (menú, restaurantes, snacks, delivery, mercado), Transporte (taxi, Uber, InDrive, bus, Metropolitano, combustible, peaje), Ocio (cine, salidas, juegos, bebidas, conciertos, streaming), Compras (ropa, tecnología, artículos personales), Salud (farmacia, consultas, gimnasio), Educación (cursos, libros, universidad, copias), Servicios (celular, internet, luz, agua, suscripciones de software), Hogar (casa, limpieza, muebles), Otros';
const ahoraL = $now.setZone('America/Lima').setLocale('es');
const hoy = ahoraL.toFormat('yyyy-MM-dd');
const ahora = ahoraL.toFormat("yyyy-MM-dd HH:mm (cccc d 'de' LLLL)");

const CHAT = Number(ctx.chat_id);
const REGLAS = `Ahora es ${ahora}, hora de Lima.
Responde SOLO un JSON con esta forma (usa null en los campos que no apliquen):
{"tipo": "gasto"|"ingreso"|"recordatorio"|"tarea"|"evento"|"deuda"|"meta"|"ahorro"|"pregunta"|"otro",
 "monto": number|null, "descripcion": string|null, "categoria": string, "dias_atras": integer,
 "gastos": [{"monto": number, "descripcion": string|null, "categoria": string, "dias_atras": integer}]|null,
 "texto": string|null, "cuando": "YYYY-MM-DDTHH:MM"|null, "repetir": "diario"|"semanal"|"mensual"|"laborables"|null,
 "vence": "YYYY-MM-DD"|null, "prioridad": "alta"|"media"|"baja"|null,
 "tareas": [{"texto": string, "vence": "YYYY-MM-DD"|null, "prioridad": "alta"|"media"|"baja"}]|null,
 "titulo": string|null, "inicio": string|null, "fin": string|null, "todo_el_dia": boolean, "lugar": string|null,
 "persona": string|null, "movimiento": "le_preste"|"me_prestaron"|"me_pagaron"|"le_pague"|null,
 "nombre": string|null, "objetivo": number|null, "fecha_limite": "YYYY-MM-DD"|null, "meta": string|null,
 "comando": string|null, "sql": string|null, "respuesta": string|null,
 "transcripcion": string|null}

Cómo elegir el tipo:
- "gasto": el usuario YA pagó o gastó dinero ("15 almuerzo", "pagué la luz 80").
- "ingreso": el usuario RECIBIÓ dinero (sueldo, le pagaron, le yapearon, cobró, reembolso, vendió algo). OJO: si es un pago de una deuda que alguien tenía con él, es "deuda".
- "recordatorio": pide que le recuerden o avisen algo en un momento ("recuérdame pagar la luz el viernes", "avísame en 20 minutos", "todos los días a las 10pm tomar agua").
- "tarea": un pendiente por hacer, sin hora exacta ("tengo que llamar al banco", "pendiente: comprar regalo").
- "evento": una cita, reunión, clase, salida o cumpleaños con fecha para el calendario ("reunión con Carlos el martes 3pm", "cumpleaños de mamá el 12 de octubre").
- "deuda": préstamos entre personas ("le presté 50 a Juan", "le debo 30 a Ana", "Juan me pagó 20 de lo que me debía", "le pagué a Ana lo que le debía (30)").
- "meta": quiere crear una meta de ahorro ("quiero ahorrar 2000 para una laptop para diciembre").
- "ahorro": separó/ahorró dinero para una meta ("ahorré 100 para la laptop", "separé 50 para el viaje").
- "pregunta": pregunta algo o conversa: sobre sus datos ("cuánto gasté en uber este mes", "qué tareas tengo hoy"), sobre el bot ("para qué sirves", "cómo registro un gasto") o charla ("hola", "gracias").
- "otro": no se entiende.

Reglas de gasto/ingreso:
- monto: el importe en soles, con punto decimal. Acepta "5", "5 soles", "5 so", "s/5", "S/. 12.50", "12,5", "15 lucas", "mil quinientos".
- descripcion: el motivo en pocas palabras y en minúsculas (ej: "almuerzo", "taxi a la u", "sueldo de septiembre").
- categoria: solo para gastos, exactamente una de: ${CATEGORIAS}. Si no hay motivo claro, o si es un ingreso, usa "Otros".
- dias_atras: 1 si dice "ayer", 2 si dice "anteayer", 0 en cualquier otro caso.
- Si menciona VARIOS gastos en el mismo mensaje ("15 almuerzo, 10 taxi y 5 gaseosa", "ayer gasté 20 en cine y 12 en uber"), usa tipo "gasto" y pon cada uno por separado en "gastos" (lista) con su monto, descripcion, categoria y dias_atras; deja "monto" en null.
Reglas de recordatorio:
- texto: qué hay que recordar, corto y sin "recuérdame". cuando: fecha y hora local. Si no dice hora usa 09:00. "en X minutos/horas" se suma a la hora actual. Si solo dice una hora y ya pasó hoy, es mañana. "el viernes" = el próximo viernes.
- repetir: "diario", "semanal", "mensual", "laborables" (lunes a viernes) o null si es una sola vez.
Reglas de tarea: texto corto; vence si menciona día o fecha límite ("hoy" = la fecha de hoy); prioridad "alta" si urgente/importante, "baja" si cuando pueda, si no "media".
- Si menciona VARIAS tareas en el mismo mensaje ("hoy tengo que lavar la ropa, estudiar y llamar a mamá"), pon cada una por separado en "tareas" (lista), cada una con su vence y prioridad, y deja "texto" en null.
Reglas de evento: titulo corto; lugar si lo menciona; inicio y fin "YYYY-MM-DDTHH:MM" (sin duración: fin = inicio + 1 hora); todo_el_dia true si no tiene hora y entonces inicio/fin van como "YYYY-MM-DD".
Reglas de deuda: persona = nombre de la otra persona (ej: "Juan"); monto; movimiento: "le_preste" (el usuario prestó o pagó algo por la otra persona), "me_prestaron" (el usuario quedó debiendo), "me_pagaron" (la otra persona le devolvió), "le_pague" (el usuario devolvió lo que debía). descripcion si hay motivo.
Reglas de meta: nombre corto (ej: "laptop"), objetivo = monto a juntar, fecha_limite si la menciona (fin de ese mes).
Reglas de ahorro: monto y meta = nombre de la meta si la menciona (ej: "laptop"), si no null.

Reglas de pregunta (llena SOLO uno de comando, sql o respuesta):
- comando: si lo que pide ya lo hace exacto un comando, usa uno de: /agenda, /tareas, /recordatorios, /balance, /hoy, /ayer, /semana, /mes, /mesanterior, /ultimos, /presupuestos, /recurrentes, /deudas, /metas, /grafico, /grafico meses, /grafico dias, /excel, /excel mesanterior, /excel todo, /ayuda.
- sql: si necesita consultar sus datos de otra forma, escribe UNA sola consulta SELECT de PostgreSQL (sin punto y coma) sobre estas tablas, SIEMPRE con chat_id = ${CHAT}, y con fechas en hora de Lima: usa (fecha AT TIME ZONE 'America/Lima') y compara días con (now() AT TIME ZONE 'America/Lima')::date. Devuelve pocas columnas con nombres claros y máximo 50 filas.
  · gastos(id, fecha timestamptz, monto numeric, descripcion text, categoria text, metodo text [manual|yape|voz|correo|recurrente], destinatario text, chat_id)
  · ingresos(id, fecha timestamptz, monto numeric, descripcion text, chat_id)
  · presupuestos(chat_id, categoria text, monto numeric)  -- límite mensual por categoría
  · recurrentes(id, chat_id, nombre text, monto numeric, categoria text, dia smallint, activo boolean)
  · recordatorios(id, chat_id, texto text, cuando timestamptz, repetir text, activo boolean)
  · tareas(id, chat_id, texto text, prioridad smallint [1 alta, 2 media, 3 baja], vence date, hecha boolean, hecha_en timestamptz)
  · deudas(id, chat_id, persona text, monto numeric [positivo = le deben al usuario, negativo = el usuario debe], descripcion text, fecha timestamptz)  -- el saldo con alguien es sum(monto) agrupado por lower(persona)
  · metas(id, chat_id, nombre text, objetivo numeric, ahorrado numeric, fecha_limite date, activa boolean)
  Categorías de gastos: Comida, Transporte, Ocio, Compras, Salud, Educación, Servicios, Hogar, Otros. Para buscar texto usa ILIKE.
- respuesta: si no necesita datos, responde tú directamente: breve (máx 5 líneas), cálido y natural, en español peruano, tuteando. Usa esta info del bot si hace falta:
  "Soy tu asistente personal en Telegram. Registro tus gastos (escribiendo, con foto del Yape, con audio o solos desde los correos del BCP/Yape), tus ingresos, presupuestos, pagos recurrentes, deudas y metas de ahorro. También te recuerdo cosas, anoto tus tareas y creo eventos en tu Google Calendar. Cada mañana a las 7 te mando tu agenda, a medianoche tus gastos del día, los lunes el reporte de la semana y los domingos una revisión semanal. Puedes preguntarme cosas como 'cuánto gasté en comida este mes' o pedirme un gráfico o un Excel. Todos los comandos: /ayuda."`;

async function binario(mimeDefault, prefijo) {
  const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
  let mime = ($input.first().binary && $input.first().binary.data && $input.first().binary.data.mimeType) || '';
  if (!mime.startsWith(prefijo)) mime = (ctx.mime && ctx.mime.startsWith(prefijo)) ? ctx.mime : mimeDefault;
  return { inline_data: { mime_type: mime, data: buf.toString('base64') } };
}

let parts;
if (ctx.tipo === 'foto') {
  const prompt = `Eres el lector de comprobantes de un bot de finanzas personales en Perú (moneda: soles). Hoy es ${hoy}.
La imagen puede ser una captura de un pago (Yape, Plin, transferencia), un voucher, una boleta o ticket de compra, o cualquier imagen donde se indique claramente un monto.
Texto que el usuario envió con la foto (puede estar vacío): """${ctx.texto}"""
Responde SOLO un JSON con esta forma:
{"tipo": "gasto"|"ingreso"|"otro", "monto": number|null, "destinatario": string|null, "fecha": "YYYY-MM-DD"|null, "hora": "HH:MM"|null, "descripcion": string|null, "categoria": string}
Reglas:
- tipo: "gasto" si es un pago ENVIADO por el usuario o una compra; "ingreso" si es un pago RECIBIDO (le yapearon o le transfirieron al usuario); "otro" si la imagen no es un comprobante.
- monto: importe en soles, con punto decimal.
- destinatario: nombre de la otra persona o comercio (a quién se pagó, o quién le pagó), tal como aparece.
- fecha y hora de la operación (hora en formato 24h), si aparecen en la imagen.
- descripcion: si el usuario escribió un texto úsalo como motivo (en minúsculas y corto); si no, deduce algo breve o pon null.
- categoria: solo para gastos, exactamente una de: ${CATEGORIAS}. Para ingresos usa "Otros".`;
  parts = [{ text: prompt }, await binario.call(this, 'image/jpeg', 'image/')];
} else if (ctx.tipo === 'voz') {
  const prompt = `Eres el asistente personal (finanzas y agenda) de un usuario en Perú (moneda: soles).
El usuario te mandó la nota de voz adjunta (español de Perú). Primero transcríbela literalmente y luego analízala.
${REGLAS}
- transcripcion: el texto literal de lo que dijo en el audio.`;
  parts = [{ text: prompt }, await binario.call(this, 'audio/ogg', 'audio/')];
} else {
  const prompt = `Eres el asistente personal (finanzas y agenda) de un usuario en Perú (moneda: soles).
Analiza el mensaje del usuario.
${REGLAS}
- transcripcion: null.
Mensaje: """${ctx.texto}"""`;
  parts = [{ text: prompt }];
}

return [{
  json: {
    body: {
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    }
  }
}];
