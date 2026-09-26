// Ejecuta el JavaScript de los nodos Code de n8n fuera de n8n, contra un Postgres real.
// Simula $input, $('Nodo'), $now y DateTime tal como los expone n8n.
const fs = require('fs');
const path = require('path');
const { DateTime } = require('luxon');
const { Client } = require('pg');

const CHAT = 123456789;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function cargar(nombre) {
  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'workflows', nombre + '.json'), 'utf8'));
  return {
    wf,
    code(nodo) {
      const n = wf.nodes.find(x => x.name === nodo);
      if (!n) throw new Error(`No existe el nodo "${nodo}" en ${nombre}`);
      return n.parameters.jsCode
        .replace(/const CHAT_ID = 'TU_CHAT_ID'/g, `const CHAT_ID = '${CHAT}'`)
        .replace('PEGA_AQUI_EL_ID_DE_TU_HOJA', 'ID_DE_PRUEBA');
    },
    async run(nodo, input, refs = {}) {
      const items = input.map(j => ({ json: j }));
      const $input = { all: () => items, first: () => items[0] };
      const $ = n => {
        const v = refs[n]; const arr = Array.isArray(v) ? v : [v];
        return { first: () => ({ json: arr[0] }), all: () => arr.map(j => ({ json: j })), itemMatching: i => ({ json: arr[i] }) };
      };
      const self = { helpers: { getBinaryDataBuffer: async () => Buffer.from('X') } };
      const fn = new AsyncFunction('$input', '$', '$now', 'DateTime', this.code(nodo));
      return (await fn.call(self, $input, $, DateTime.now(), DateTime)) || [];
    },
  };
}

// Conexión por variables de entorno estándar: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
async function conectar() {
  const db = new Client();
  await db.connect();
  await db.query(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
  await db.query(`truncate gastos, ingresos, presupuestos, recurrentes, recordatorios, tareas, deudas, metas,
                  sync_estado, alertas restart identity`);
  db.rows = async sql => (await db.query(sql)).rows;
  return db;
}

// Respuesta falsa con el formato de la API de Gemini
const gemini = obj => ({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] });
const mensaje = text => ({ message: { message_id: 1, chat: { id: CHAT }, text } });

module.exports = { cargar, conectar, gemini, mensaje, CHAT, DateTime };
