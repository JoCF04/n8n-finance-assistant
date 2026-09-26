// Workflows secundarios: recordatorios, correos del banco, Google Sheets y alertas de error
const test = require('node:test');
const assert = require('node:assert/strict');
const { conectar, cargar, gemini, CHAT } = require('./harness');

let db;
test.before(async () => { db = await conectar(); });
test.after(() => db.end());

test('recordatorios: dispara los vencidos y reprograma los que se repiten', async () => {
  const R = cargar('recordatorios');
  await db.query(`insert into recordatorios (chat_id, texto, cuando, repetir) values
    (${CHAT}, 'tomar agua', now() - interval '3 days 2 minutes', 'diario'),
    (${CHAT}, 'pagar luz',  now() - interval '1 minute', null),
    (${CHAT}, 'futuro',     now() + interval '1 hour',   null)`);
  const tick = async () => R.run('Mensaje recordatorio', await db.rows((await R.run('SQL recordatorios', [{}]))[0].json.sql));

  const primera = await tick();
  assert.equal(primera.length, 2, 'solo los 2 vencidos');
  assert.match(primera.map(o => o.json.texto).join(), /todos los días/);

  const [agua] = await db.rows(`select activo, cuando > now() as futuro, cuando < now() + interval '1 day' as manana from recordatorios where texto = 'tomar agua'`);
  assert.deepEqual(agua, { activo: true, futuro: true, manana: true }, 'salta los días perdidos, no manda 3 avisos atrasados');
  const [luz] = await db.rows(`select activo from recordatorios where texto = 'pagar luz'`);
  assert.equal(luz.activo, false);

  assert.equal((await tick()).length, 0, 'el minuto siguiente no repite nada');
});

test('correos del banco: registra el consumo una sola vez', async () => {
  const W = cargar('correos_banco');
  const mails = [
    { id: 'm1', subject: 'Consumo con tu tarjeta', date: new Date().toISOString(), text: 'Realizaste un consumo de S/ 45.90 en PLAZA VEA', from: { text: 'BCP' } },
    { id: 'm2', subject: 'Promo', date: new Date().toISOString(), text: 'Gana puntos', from: { text: 'BCP' } },
  ];
  const ia = [gemini({ es_consumo: true, monto: 45.9, moneda: 'PEN', comercio: 'PLAZA VEA', categoria: 'Comida', descripcion: 'plaza vea' }),
              gemini({ es_consumo: false })];
  const correr = async () => {
    const sqls = await W.run('SQL correo', ia, { 'Gmail Trigger': mails });
    let rows = [];
    for (const s of sqls) rows = rows.concat(await db.rows(s.json.sql));
    return W.run('Mensaje correo', rows);
  };
  assert.equal((await correr()).length, 1, 'la promo se ignora');
  assert.equal((await correr()).length, 0, 'el mismo correo no se duplica');
  assert.equal(Number((await db.rows(`select count(*) n from gastos where email_id = 'm1'`))[0].n), 1);
});

test('correos del banco: no duplica un gasto que ya anotaste a mano', async () => {
  const W = cargar('correos_banco');
  await db.query(`insert into gastos (fecha, monto, descripcion, categoria, chat_id) values (now() - interval '5 minutes', 33.3, 'cine', 'Ocio', ${CHAT})`);
  const mail = [{ id: 'm3', subject: 'Consumo', date: new Date().toISOString(), text: 'consumo 33.30 cineplanet', from: {} }];
  const [s] = await W.run('SQL correo', [gemini({ es_consumo: true, monto: 33.3, moneda: 'PEN', comercio: 'CINEPLANET', categoria: 'Ocio' })], { 'Gmail Trigger': mail });
  const [r] = await db.rows(s.json.sql);
  assert.equal(Number(r.insertado), 0);
});

test('Google Sheets: solo escribe cuando cambian los datos (huella md5)', async () => {
  const S = cargar('sincronizar_sheets');
  const huella = S.wf.nodes.find(n => n.name === 'Guardar huella').parameters.query;
  const ciclo = async () => {
    const p = (await S.run('Preparar sync', [{}]))[0].json;
    const rows = await db.rows(p.sql);
    if (!rows.length) return null;
    const a = (await S.run('Armar escritura', rows, { 'Preparar sync': p }))[0].json;
    await db.query(huella.replace("{{ $('Armar escritura').first().json.hash }}", a.hash));
    return a;
  };
  const a = await ciclo();
  assert.ok(a, 'la primera vez escribe');
  assert.equal(a.update.valueInputOption, 'RAW');
  assert.ok(a.filas >= 2);
  assert.equal(await ciclo(), null, 'sin cambios → no llama a la API');
  await db.query(`update gastos set categoria = 'Transporte' where id = (select max(id) from gastos)`);
  assert.ok(await ciclo(), 'una corrección vuelve a sincronizar');
});

test('alertas de error: avisa una vez cada 30 min por falla', async () => {
  const A = cargar('alertas_error');
  const ev = (msg, nodo = 'Escribir hoja') => ({ execution: { id: '231', lastNodeExecuted: nodo, error: { message: msg }, mode: 'trigger' },
                                                 workflow: { id: 'aBc123', name: 'Sincronizar Sheets' } });
  const alerta = async (e, dbCaida = false) => {
    const p = (await A.run('Preparar alerta', [e]))[0].json;
    const r = dbCaida ? { error: { message: 'connect ECONNREFUSED' } } : (await db.rows(p.sql))[0];
    return A.run('Mensaje alerta', [r], { 'Preparar alerta': p });
  };
  const token = ev('invalid_grant: Token has been expired or revoked.');
  const [msg] = await alerta(token);
  assert.equal(msg.json.chat_id, String(CHAT));
  assert.match(msg.json.texto, /Sincronizar Sheets/);
  assert.equal((await alerta(token)).length, 0, 'misma falla al minuto → silencio');
  assert.equal((await alerta(ev('429 Too Many Requests', 'Gemini'))).length, 1, 'falla distinta → avisa');
  assert.equal((await alerta(token, true)).length, 1, 'si la BD está caída igual avisa');
  await db.query(`update alertas set ultima = now() - interval '31 minutes'`);
  assert.equal((await alerta(token)).length, 1, 'pasados 30 min vuelve a avisar');
});
