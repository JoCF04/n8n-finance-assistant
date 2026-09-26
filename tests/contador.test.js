const test = require('node:test');
const assert = require('node:assert/strict');
const { conectar, cargar, CHAT, DateTime } = require('./harness');
const crearBot = require('./bot');

let db, telegram;
const total = async (tabla, where = 'true') => Number((await db.rows(`select count(*) n from ${tabla} where ${where}`))[0].n);
test.before(async () => { db = await conectar(); telegram = crearBot(db); });
test.after(() => db.end());

test('gasto rápido sin IA: "15 almuerzo"', async () => {
  const r = await telegram('15 almuerzo');
  assert.equal(r.ruta, 4, 'debería ir por la ruta rápida (sin gastar llamadas a Gemini)');
  assert.match(r.texto, /Gasto registrado/);
  const [g] = await db.rows('select monto, categoria from gastos');
  assert.equal(Number(g.monto), 15);
  assert.equal(g.categoria, 'Comida');
});

test('"recuérdame pagar 80…" NO se registra como gasto', async () => {
  const antes = await total('gastos');
  const r = await telegram('recuérdame pagar 80 de luz mañana a las 9', {
    tipo: 'recordatorio', texto: 'pagar 80 de luz', cuando: DateTime.now().setZone('America/Lima').plus({ days: 1 }).toFormat("yyyy-MM-dd'T'09:00"), repetir: null,
  });
  assert.equal(r.ruta, 2, 'debe pasar por la IA');
  assert.equal(await total('gastos'), antes);
  assert.equal(await total('recordatorios'), 1);
  assert.match(r.texto, /Te lo recuerdo/);
});

test('varios gastos en una sola frase', async () => {
  const antes = await total('gastos');
  const r = await telegram('10 taxi, 5 gaseosa y 30 cine', { tipo: 'gasto', monto: null, gastos: [
    { monto: 10, descripcion: 'taxi', categoria: 'Transporte', dias_atras: 0 },
    { monto: 5, descripcion: 'gaseosa', categoria: 'Comida', dias_atras: 0 },
    { monto: 30, descripcion: 'cine', categoria: 'Ocio', dias_atras: 0 }] });
  assert.match(r.texto, /Registré 3 gastos/);
  assert.equal(await total('gastos'), antes + 3);
});

test('varias tareas en una sola frase', async () => {
  const hoy = DateTime.now().setZone('America/Lima').toFormat('yyyy-MM-dd');
  const r = await telegram('hoy tengo que lavar la ropa, estudiar y llamar a mamá', { tipo: 'tarea', tareas: [
    { texto: 'lavar la ropa', vence: hoy, prioridad: 'media' },
    { texto: 'estudiar', vence: hoy, prioridad: 'alta' },
    { texto: "llamar a mamá (d'Onofrio)", vence: hoy, prioridad: 'baja' }] });
  assert.match(r.texto, /Anoté 3 tareas/);
  assert.equal(await total('tareas', 'not hecha'), 3);
});

test('comandos: /presupuesto avisa al pasar el 80 %', async () => {
  await telegram('/presupuesto comida 20');
  const r = await telegram('3 pan');                 // 15 + 5 + 3 = 23 de 20 en Comida
  assert.match(r.texto, /Te pasaste/);
});

test('deudas: saldo firmado por persona', async () => {
  await telegram('le presté 50 a Juan', { tipo: 'deuda', persona: 'Juan', monto: 50, movimiento: 'le_preste' });
  const r = await telegram('juan me pagó 20', { tipo: 'deuda', persona: 'juan', monto: 20, movimiento: 'me_pagaron' });
  assert.match(r.texto, /Juan te debe <b>S\/ 30.00<\/b>/);
});

test('metas: un ahorro sin nombre va a la única meta activa', async () => {
  await telegram('quiero ahorrar 2000 para una laptop', { tipo: 'meta', nombre: 'laptop', objetivo: 2000, fecha_limite: null });
  const r = await telegram('ahorré 500', { tipo: 'ahorro', monto: 500, meta: null });
  assert.match(r.texto, /25%/);
});

test('pregunta libre → SQL de solo lectura + respuesta en lenguaje natural', async () => {
  const r = await telegram('¿cuánto gasté en taxi?',
    { tipo: 'pregunta', sql: `SELECT sum(monto) AS total FROM gastos WHERE chat_id = ${CHAT} AND descripcion ILIKE '%taxi%'` },
    'Gastaste **S/ 10.00** en taxi.');
  assert.equal(r.interpretado.ruta, 6);
  assert.match(r.interpretado.sql, /LIMIT 50/);
  assert.equal(Number(r.datos.filas[0].total), 10);
  assert.ok(r.prompt.includes('¿cuánto gasté en taxi?'));
  assert.equal(r.texto, 'Gastaste <b>S/ 10.00</b> en taxi.');
});

for (const [nombre, sql] of [
  ['DELETE directo', `DELETE FROM gastos WHERE chat_id = ${CHAT}`],
  ['DELETE escondido en un CTE', `WITH d AS (DELETE FROM gastos RETURNING *) SELECT * FROM d WHERE chat_id = ${CHAT}`],
  ['dos sentencias', `SELECT 1 FROM gastos WHERE chat_id = ${CHAT}; DROP TABLE gastos`],
  ['sin filtrar por chat_id', 'SELECT * FROM gastos'],
  ['otro usuario', 'SELECT * FROM gastos WHERE chat_id = 999'],
  ['funciones del sistema', `SELECT pg_read_file('/etc/passwd') FROM gastos WHERE chat_id = ${CHAT}`],
]) {
  test(`guardarraíl text→SQL bloquea: ${nombre}`, async () => {
    const antes = await total('gastos');
    const r = await telegram('trampa', { tipo: 'pregunta', sql });
    assert.notEqual(r.interpretado.ruta, 6, 'no debe llegar a ejecutarse');
    assert.equal(await total('gastos'), antes);
  });
}

test('/excel devuelve gastos en negativo e ingresos en positivo', async () => {
  await telegram('/ingreso 1500 sueldo');
  const r = await telegram('/excel');
  assert.match(r.out[0].json.excel, /^movimientos_\d{4}-\d{2}\.xlsx$/);
  assert.ok(r.out[0].json.filas.some(f => f.Tipo === 'Ingreso' && f.Monto === 1500));
  assert.ok(r.out[0].json.filas.filter(f => f.Tipo === 'Gasto').every(f => f.Monto < 0));
});

test('/grafico arma una URL de QuickChart', async () => {
  const r = await telegram('/grafico');
  assert.match(r.out[0].json.foto_url, /^https:\/\/quickchart\.io\/chart/);
});

test('mensajes de otro chat se ignoran', async () => {
  const C = cargar('contador');
  const out = await C.run('Clasificar mensaje', [{ message: { message_id: 1, chat: { id: 555 }, text: '15 almuerzo' } }]);
  assert.equal(out.length, 0);
});
