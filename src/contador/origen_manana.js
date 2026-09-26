// Resumen de la mañana: guarda el clima de Lima (Open-Meteo) y marca el origen
const c = $input.first().json;
let clima = null;
if (c && c.daily && Array.isArray(c.daily.temperature_2m_max)) {
  clima = {
    max: c.daily.temperature_2m_max[0],
    min: c.daily.temperature_2m_min[0],
    lluvia: c.daily.precipitation_probability_max ? c.daily.precipitation_probability_max[0] : null,
    code: c.daily.weather_code ? c.daily.weather_code[0] : null,
  };
}
return [{ json: { origen: 'manana', clima } }];
