// Recibe el error de cualquier workflow y arma la alerta (con una pista de cómo arreglarlo)
const e = $input.first().json;
const wf = (e.workflow && e.workflow.name) || 'Workflow';
const wfId = (e.workflow && e.workflow.id) || '';
const ex = e.execution || {};
const trig = e.trigger || {};
const nodo = ex.lastNodeExecuted || (trig.error && trig.error.node && trig.error.node.name) || '¿?';
const err = ex.error || trig.error || {};
const msg = String(err.message || err.description || 'Error desconocido').replace(/\s+/g, ' ').slice(0, 300);
// ⚙️ URL de tu n8n (para el link a la ejecución)
const N8N_URL = 'https://TU-DOMINIO.duckdns.org';
const q = v => "'" + String(v).replace(/'/g, "''") + "'";

const PISTAS = [
  [/invalid_grant|unauthorized|401|token.*(expired|revoked)|credentials? (not found|could not)/i, 'Reconecta la credencial de Google/Telegram en n8n (Credentials → abre la credencial → Sign in / Save).'],
  [/429|quota|rate limit|resource.?exhausted/i, 'Llegaste al límite gratis (probablemente de Gemini). Suele volver solo en unas horas.'],
  [/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timeout|connection terminated|too many clients|pooler/i, 'No hubo conexión con un servicio (Supabase, Google o Telegram). Si se repite, revisa que tu proyecto de Supabase no esté pausado.'],
  [/relation .* does not exist|column .* does not exist/i, 'Falta una tabla o columna: corre en Supabase el SQL de la última fase que instalaste.'],
  [/403|permission|forbidden/i, 'Falta un permiso: revisa que la API esté habilitada en Google Cloud y que la credencial tenga acceso.'],
];
const pista = (PISTAS.find(([re]) => re.test(msg)) || [null, null])[1];
const clave = `${wf}|${nodo}|${msg.slice(0, 80)}`;
const link = wfId && ex.id ? `${N8N_URL}/workflow/${wfId}/executions/${ex.id}` : null;

// Anti-spam: la misma falla se avisa como máximo una vez cada 30 minutos
const sql = `
INSERT INTO alertas (clave, ultima, veces) VALUES (${q(clave)}, now(), 1)
ON CONFLICT (clave) DO UPDATE SET
  veces = CASE WHEN alertas.ultima < now() - interval '30 minutes' THEN 1 ELSE alertas.veces + 1 END,
  ultima = CASE WHEN alertas.ultima < now() - interval '30 minutes' THEN now() ELSE alertas.ultima END
RETURNING veces;`;

return [{ json: { sql, wf, nodo, msg, pista, link } }];
