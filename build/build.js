// Genera los workflows de n8n (workflows/*.json) a partir del código en src/.
// Uso: node build/build.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const HELPERS = rd('shared/sql_helpers.js');
// IDs deterministas: reconstruir no ensucia el diff de git
let seq = 0;
const uid = () => crypto.createHash('md5').update('n8n-finance-assistant-' + seq++).digest('hex')
  .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

// ---------- Fábricas de nodos ----------
const code = (name, file, pos, withHelpers = false) => ({
  parameters: { jsCode: (withHelpers ? HELPERS : '') + rd(file) },
  id: uid(), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos,
});
const pg = (name, pos, query = '{{ $json.sql }}', batching = true) => ({
  parameters: { operation: 'executeQuery', query, options: batching ? { queryBatching: 'independently' } : {} },
  id: uid(), name, type: 'n8n-nodes-base.postgres', typeVersion: 2.5, position: pos,
});
const gemini = (name, pos) => ({
  parameters: {
    method: 'POST',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}',
    options: { timeout: 60000 },
  },
  id: uid(), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
  retryOnFail: true, maxTries: 4, waitBetweenTries: 5000, onError: 'continueRegularOutput',
});
const googleHttp = (name, pos, credType, extra, opts = {}) => ({
  parameters: { authentication: 'predefinedCredentialType', nodeCredentialType: credType, options: { timeout: 60000 }, ...extra },
  id: uid(), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, ...opts,
});
const tgSend = (name, pos, chatId = '={{ $json.chat_id }}') => ({
  parameters: { chatId, text: '={{ $json.texto }}', additionalFields: { appendAttribution: false, parse_mode: 'HTML' } },
  id: uid(), name, type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: pos, webhookId: uid(),
});
const cron = (name, expr, pos) => ({
  parameters: { rule: { interval: [{ field: 'cronExpression', expression: expr }] } },
  id: uid(), name, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos,
});
const everyMinute = (name, pos) => ({
  parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } },
  id: uid(), name, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos,
});
const sw = (name, n, pos) => ({
  parameters: { mode: 'expression', numberOutputs: n, output: '={{ $json.ruta }}' },
  id: uid(), name, type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: pos,
});
const link = (...targets) => ({ main: targets.map(t => (t ? [{ node: t, type: 'main', index: 0 }] : [])) });
const chain = names => Object.fromEntries(names.slice(0, -1).map((n, i) => [n, link(names[i + 1])]));
const SETTINGS = { executionOrder: 'v1', timezone: 'America/Lima' };
const QUIET = { ...SETTINGS, saveDataSuccessExecution: 'none', saveDataErrorExecution: 'all' };

// ================= 1. Contador (bot de Telegram) =================
const C = f => `contador/${f}`;
const contador = {
  name: 'Contador',
  nodes: [
    { parameters: { updates: ['message'], additionalFields: {} }, id: uid(), name: 'Telegram Trigger',
      type: 'n8n-nodes-base.telegramTrigger', typeVersion: 1.2, position: [-384, 256], webhookId: uid() },
    code('Clasificar mensaje', C('clasificar.js'), [-160, 256]),
    sw('Ruta mensaje', 7, [64, 256]),
    { parameters: { resource: 'file', fileId: '={{ $json.file_id }}', additionalFields: {} }, id: uid(),
      name: 'Descargar foto', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [304, 16], webhookId: uid() },
    code('Preparar IA', C('preparar_ia.js'), [528, 128]),
    gemini('Gemini', [752, 128]),
    code('Interpretar respuesta', C('interpretar.js'), [960, 240]),
    sw('¿Guardar?', 7, [1184, 128]),
    googleHttp('Crear evento', [1408, -160], 'googleCalendarOAuth2Api', {
      method: 'POST', url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.evento) }}',
    }, { onError: 'continueRegularOutput' }),
    code('SQL evento', C('sql_evento.js'), [1632, -160]),
    pg('Guardar registro', [1632, 16], '{{ $json.sql }}', false),
    code('Confirmar', C('confirmar.js'), [1856, 16]),
    code('SQL comando', C('sql_comando.js'), [304, 384], true),
    cron('Diario 12am', '0 0 * * *', [64, 608]),
    code('SQL diario', C('sql_diario.js'), [304, 608], true),
    cron('Lunes 7am', '0 7 * * 1', [64, 784]),
    code('SQL semanal', C('sql_semanal.js'), [304, 784], true),
    cron('Recurrentes 8am', '0 8 * * *', [64, 960]),
    code('SQL recurrentes', C('sql_recurrentes.js'), [304, 960]),
    cron('Agenda 7am', '0 7 * * *', [-384, 1152]),
    { parameters: {
        url: 'https://api.open-meteo.com/v1/forecast?latitude=-12.05&longitude=-77.04&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=America%2FLima&forecast_days=1',
        options: { timeout: 20000 } },
      id: uid(), name: 'Clima Lima', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [-160, 1152], onError: 'continueRegularOutput' },
    code('Origen mañana', C('origen_manana.js'), [64, 1152]),
    cron('Domingo 8pm', '0 20 * * 0', [-160, 1328]),
    { parameters: { jsCode: "return [{ json: { origen: 'semana' } }];" }, id: uid(), name: 'Origen semana',
      type: 'n8n-nodes-base.code', typeVersion: 2, position: [64, 1328] },
    code('Rango agenda', C('rango_agenda.js'), [304, 1152]),
    googleHttp('Calendar eventos', [528, 1152], 'googleCalendarOAuth2Api', {
      url: '=https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=50&timeMin={{ encodeURIComponent($json.desde) }}&timeMax={{ encodeURIComponent($json.hasta) }}',
    }, { onError: 'continueRegularOutput' }),
    code('SQL agenda', C('sql_agenda.js'), [752, 1152], true),
    pg('Consultar DB', [976, 576]),
    code('Formatear reporte', C('formatear.js'), [1216, 576]),
    sw('¿Foto?', 2, [1440, 576]),
    { parameters: { operation: 'sendPhoto', chatId: '={{ $json.chat_id }}', file: '={{ $json.foto_url }}',
        additionalFields: { caption: '={{ $json.texto }}', parse_mode: 'HTML' } },
      id: uid(), name: 'Enviar foto', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [1664, 576], webhookId: uid() },
    tgSend('Responder', [2080, 368]),
    code('SQL excel', C('sql_excel.js'), [304, 1500], true),
    { ...pg('Datos excel', [528, 1500]), alwaysOutputData: true },
    { parameters: { operation: 'xlsx', options: { fileName: "={{ $('SQL excel').first().json.archivo }}", sheetName: 'Movimientos' } },
      id: uid(), name: 'Convertir a Excel', type: 'n8n-nodes-base.convertToFile', typeVersion: 1.1, position: [752, 1500] },
    { parameters: { operation: 'sendDocument', chatId: "={{ $('SQL excel').first().json.chat_id }}",
        binaryData: true, binaryPropertyName: 'data',
        additionalFields: { caption: "={{ $('SQL excel').first().json.caption }}", parse_mode: 'HTML' } },
      id: uid(), name: 'Enviar Excel', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [976, 1500], webhookId: uid() },
    { ...pg('Consultar pregunta', [1408, 720]), onError: 'continueRegularOutput', alwaysOutputData: true },
    code('Preparar respuesta', C('preparar_respuesta.js'), [1632, 720]),
    gemini('Gemini respuesta', [1856, 720]),
    code('Responder IA', C('responder_ia.js'), [2080, 720]),
  ],
  connections: {
    'Telegram Trigger': link('Clasificar mensaje'),
    'Clasificar mensaje': link('Ruta mensaje'),
    // 0 foto/voz · 1 comando · 2 texto con IA · 3 configuración · 4 gasto rápido · 5 /agenda · 6 /excel
    'Ruta mensaje': link('Descargar foto', 'SQL comando', 'Preparar IA', 'Responder', 'Interpretar respuesta', 'Rango agenda', 'SQL excel'),
    'Descargar foto': link('Preparar IA'),
    'Preparar IA': link('Gemini'),
    'Gemini': link('Interpretar respuesta'),
    'Interpretar respuesta': link('¿Guardar?'),
    // 0 guardar · 1 responder · 2 evento · 3 comando · 4 agenda · 5 excel · 6 pregunta a la BD
    '¿Guardar?': link('Guardar registro', 'Responder', 'Crear evento', 'SQL comando', 'Rango agenda', 'SQL excel', 'Consultar pregunta'),
    'Crear evento': link('SQL evento'),
    'SQL evento': link('Guardar registro'),
    'Guardar registro': link('Confirmar'),
    'Confirmar': link('Responder'),
    'SQL comando': link('Consultar DB'),
    'Diario 12am': link('SQL diario'), 'SQL diario': link('Consultar DB'),
    'Lunes 7am': link('SQL semanal'), 'SQL semanal': link('Consultar DB'),
    'Recurrentes 8am': link('SQL recurrentes'), 'SQL recurrentes': link('Consultar DB'),
    'Agenda 7am': link('Clima Lima'), 'Clima Lima': link('Origen mañana'), 'Origen mañana': link('Rango agenda'),
    'Domingo 8pm': link('Origen semana'), 'Origen semana': link('Rango agenda'),
    'Rango agenda': link('Calendar eventos'), 'Calendar eventos': link('SQL agenda'), 'SQL agenda': link('Consultar DB'),
    'Consultar DB': link('Formatear reporte'),
    'Formatear reporte': link('¿Foto?'),
    '¿Foto?': link('Responder', 'Enviar foto'),
    'SQL excel': link('Datos excel'), 'Datos excel': link('Convertir a Excel'), 'Convertir a Excel': link('Enviar Excel'),
    'Consultar pregunta': link('Preparar respuesta'), 'Preparar respuesta': link('Gemini respuesta'),
    'Gemini respuesta': link('Responder IA'), 'Responder IA': link('Responder'),
  },
  pinData: {}, settings: SETTINGS,
};

// ================= 2. Recordatorios (cada minuto) =================
const recordatorios = {
  name: 'Recordatorios',
  nodes: [
    everyMinute('Cada minuto', [0, 0]),
    code('SQL recordatorios', 'recordatorios/rec_sql.js', [224, 0]),
    pg('Buscar recordatorios', [448, 0]),
    code('Mensaje recordatorio', 'recordatorios/rec_mensaje.js', [672, 0]),
    tgSend('Enviar recordatorio', [896, 0]),
  ],
  connections: chain(['Cada minuto', 'SQL recordatorios', 'Buscar recordatorios', 'Mensaje recordatorio', 'Enviar recordatorio']),
  pinData: {}, settings: QUIET,
};

// ================= 3. Correos del banco =================
const correos = {
  name: 'Correos del banco',
  nodes: [
    { parameters: { pollTimes: { item: [{ mode: 'everyMinute' }] }, simple: false,
        filters: { q: 'from:(PON_AQUI_EL_CORREO_DEL_BANCO)', readStatus: 'both' }, options: {} },
      id: uid(), name: 'Gmail Trigger', type: 'n8n-nodes-base.gmailTrigger', typeVersion: 1.2, position: [0, 0] },
    code('Preparar IA correo', 'correos/correo_preparar.js', [224, 0]),
    gemini('Gemini correo', [448, 0]),
    code('SQL correo', 'correos/correo_sql.js', [672, 0]),
    pg('Guardar correo', [896, 0]),
    code('Mensaje correo', 'correos/correo_mensaje.js', [1120, 0]),
    tgSend('Avisar en Telegram', [1344, 0]),
  ],
  connections: chain(['Gmail Trigger', 'Preparar IA correo', 'Gemini correo', 'SQL correo', 'Guardar correo', 'Mensaje correo', 'Avisar en Telegram']),
  pinData: {}, settings: SETTINGS,
};

// ================= 4. Sincronizar Google Sheets =================
const sheets = {
  name: 'Sincronizar Sheets',
  nodes: [
    everyMinute('Cada minuto', [0, 0]),
    code('Preparar sync', 'sheets/preparar_sync.js', [224, 0]),
    { ...pg('Datos para la hoja', [448, 0]), parameters: { operation: 'executeQuery', query: '{{ $json.sql }}', options: {} } },
    code('Armar escritura', 'sheets/armar_escritura.js', [672, 0]),
    googleHttp('Limpiar hoja', [896, 0], 'googleSheetsOAuth2Api', {
      method: 'POST', url: '=https://sheets.googleapis.com/v4/spreadsheets/{{ $json.sheet_id }}/values:batchClear',
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.clear) }}',
    }, { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 }),
    googleHttp('Escribir hoja', [1120, 0], 'googleSheetsOAuth2Api', {
      method: 'POST', url: "=https://sheets.googleapis.com/v4/spreadsheets/{{ $('Armar escritura').first().json.sheet_id }}/values:batchUpdate",
      sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify($('Armar escritura').first().json.update) }}",
    }, { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 }),
    { ...pg('Guardar huella', [1344, 0]), parameters: { operation: 'executeQuery', options: {},
        query: "INSERT INTO sync_estado (clave, hash, actualizado) VALUES ('sheets', '{{ $('Armar escritura').first().json.hash }}', now()) ON CONFLICT (clave) DO UPDATE SET hash = EXCLUDED.hash, actualizado = now();" } },
  ],
  connections: chain(['Cada minuto', 'Preparar sync', 'Datos para la hoja', 'Armar escritura', 'Limpiar hoja', 'Escribir hoja', 'Guardar huella']),
  pinData: {}, settings: QUIET,
};

// ================= 5. Alertas de error =================
const alertas = {
  name: 'Alertas de error',
  nodes: [
    { parameters: {}, id: uid(), name: 'Error Trigger', type: 'n8n-nodes-base.errorTrigger', typeVersion: 1, position: [0, 0] },
    code('Preparar alerta', 'alertas/preparar_alerta.js', [224, 0]),
    { ...pg('Anti-spam', [448, 0]), parameters: { operation: 'executeQuery', query: '{{ $json.sql }}', options: {} },
      onError: 'continueRegularOutput', alwaysOutputData: true },
    code('Mensaje alerta', 'alertas/mensaje_alerta.js', [672, 0]),
    tgSend('Avisar por Telegram', [896, 0]),
  ],
  connections: chain(['Error Trigger', 'Preparar alerta', 'Anti-spam', 'Mensaje alerta', 'Avisar por Telegram']),
  pinData: {}, settings: SETTINGS,
};

const out = { contador, recordatorios, correos_banco: correos, sincronizar_sheets: sheets, alertas_error: alertas };
fs.mkdirSync(path.join(ROOT, 'workflows'), { recursive: true });
for (const [file, wf] of Object.entries(out)) {
  fs.writeFileSync(path.join(ROOT, 'workflows', `${file}.json`), JSON.stringify(wf, null, 2) + '\n');
  console.log(`workflows/${file}.json  (${wf.nodes.length} nodos)`);
}
