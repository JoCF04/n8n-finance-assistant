// La IA ya consultó tus datos: ahora redacta la respuesta como una persona
const p = $('Interpretar respuesta').first().json;
const r = $input.first().json;
const hoy = $now.setZone('America/Lima').setLocale('es').toFormat("cccc d 'de' LLLL yyyy, HH:mm");

let datos, error = null;
if (r && r.error) error = String(r.error.message || r.error.description || r.error).slice(0, 200);
else {
  datos = r ? r.filas : [];
  if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch (e) {} }
}

const prompt = `Eres el asistente personal del usuario en Telegram (finanzas y agenda, Perú, moneda soles). Hoy es ${hoy}.
El usuario te preguntó: """${p.pregunta}"""
${error
  ? `Intentaste consultar su base de datos pero falló (${error}). Dile en una línea que no pudiste sacar ese dato y sugiérele preguntarlo de otra forma o usar /ayuda.`
  : `Esto salió de su base de datos (JSON): ${JSON.stringify(datos).slice(0, 6000)}`}
Responde en español peruano, cálido y directo, tuteando, como una persona (no como un robot). Máximo 6 líneas.
- Montos con formato "S/ 12.50". Fechas legibles (ej: "el martes 29"). No menciones SQL, tablas ni JSON.
- Si los datos están vacíos, dilo con naturalidad (ej: "No tienes tareas para hoy 🙌").
- Si ayuda a leer, usa viñetas "•". Puedes usar **negritas** para lo importante y 1 emoji como mucho.`;

return [{ json: { body: {
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  generationConfig: { temperature: 0.4 },
} } }];
