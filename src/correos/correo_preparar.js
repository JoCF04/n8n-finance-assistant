const CATEGORIAS = 'Comida (menú, restaurantes, snacks, delivery, supermercado), Transporte (taxi, Uber, InDrive, bus, combustible, peaje), Ocio (cine, salidas, juegos, bebidas, conciertos, streaming), Compras (ropa, tecnología, tiendas, artículos personales), Salud (farmacia, clínica, gimnasio), Educación (cursos, libros, universidad), Servicios (celular, internet, luz, agua, suscripciones de software), Hogar (casa, limpieza, muebles, ferretería), Otros';
const hoy = $now.setZone('America/Lima').toFormat('yyyy-MM-dd');

return $input.all().map((it, i) => {
  const e = it.json;
  const texto = String(e.text || e.textAsHtml || e.snippet || '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
  const de = (e.from && (e.from.text || (e.from.value && e.from.value[0] && e.from.value[0].address))) || '';
  const prompt = `Eres el lector de notificaciones bancarias de un bot de finanzas personales en Perú. Hoy es ${hoy}.
Analiza este correo y responde SOLO un JSON con esta forma:
{"es_consumo": boolean, "monto": number|null, "moneda": "PEN"|"USD"|null, "comercio": string|null, "fecha": "YYYY-MM-DD"|null, "hora": "HH:MM"|null, "categoria": string, "descripcion": string|null}
Reglas:
- es_consumo=true SOLO si el correo avisa de dinero que SALIÓ de la cuenta o tarjeta del titular: compra o consumo con tarjeta, pago de servicio, yapeo/plin enviado, transferencia enviada, retiro.
- es_consumo=false para: dinero recibido, publicidad, promociones, estados de cuenta, códigos de verificación, alertas de inicio de sesión, operaciones rechazadas o anuladas.
- monto: el importe con punto decimal. moneda: "PEN" para soles (S/), "USD" para dólares (US$ o $).
- comercio: nombre del comercio o persona a la que se pagó, tal como aparece.
- fecha y hora de la operación (24h), si aparecen.
- descripcion: muy corta y en minúsculas, basada en el comercio (ej: "plaza vea", "uber", "pago de luz").
- categoria: exactamente una de: ${CATEGORIAS}.

De: ${de}
Asunto: ${e.subject || ''}
Correo: """${texto}"""`;
  return {
    json: {
      body: {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' }
      }
    },
    pairedItem: i,
  };
});
