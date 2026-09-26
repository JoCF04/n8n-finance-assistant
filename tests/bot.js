// Recorre el workflow "contador" igual que n8n: Clasificar → (IA) → Interpretar → SQL → Confirmar/Formatear
const { cargar, gemini, mensaje } = require('./harness');
const C = cargar('contador');

module.exports = function bot(db) {
  const formatear = async rows => C.run('Formatear reporte', rows);
  const comando = async c => formatear(await db.rows((await C.run('SQL comando', [c]))[0].json.sql));
  const excel = async c => {
    const s = (await C.run('SQL excel', [c]))[0].json;
    return [{ json: { excel: s.archivo, filas: await db.rows(s.sql) } }];
  };

  return async function telegram(text, respuestaIA, respuestaFinal = 'ok') {
    const c = (await C.run('Clasificar mensaje', [mensaje(text)]))[0].json;
    const res = { ruta: c.ruta };
    if (c.ruta === 1) res.out = await comando(c);
    else if (c.ruta === 6) res.out = await excel(c);
    else {
      const it = (await C.run('Interpretar respuesta', [c.ruta === 2 ? gemini(respuestaIA) : c], { 'Clasificar mensaje': c }))[0].json;
      res.interpretado = it;
      if (it.ruta === 1) res.out = [{ json: it }];
      else if (it.ruta === 3) res.out = await comando(it);
      else if (it.ruta === 5) res.out = await excel(it);
      else if (it.ruta === 4) res.out = [{ json: { texto: '[agenda]' } }];
      else if (it.ruta === 6) {
        const datos = (await db.rows(it.sql))[0];
        res.datos = datos;
        const prep = (await C.run('Preparar respuesta', [datos], { 'Interpretar respuesta': it }))[0].json;
        res.prompt = prep.body.contents[0].parts[0].text;
        res.out = await C.run('Responder IA', [gemini(respuestaFinal)], { 'Interpretar respuesta': it });
      } else res.out = await C.run('Confirmar', await db.rows(it.sql));
    }
    res.texto = res.out.map(o => o.json.texto || '').join('\n');
    return res;
  };
};
