# Guía de instalación

Tiempo estimado: 1–2 horas. Todo es gratis.

## 1. Servidor (Oracle Cloud Always Free)

1. Crea una cuenta en [Oracle Cloud](https://www.oracle.com/cloud/free/).
2. Crea una instancia **VM.Standard.E2.1.Micro** (Always Free) con Ubuntu. Si hay capacidad, también sirve Ampere A1.
3. En la VNIC, asígnale una **IP pública**. En el Network Security Group abre los puertos **22, 80 y 443**.
4. Crea un subdominio gratis en [DuckDNS](https://www.duckdns.org) que apunte a esa IP.
5. Conéctate por SSH, instala Docker y levanta n8n:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

git clone https://github.com/JoCF04/n8n-finance-assistant.git
cd n8n-finance-assistant/infra
./swap.sh                  # 2 GB de swap (la VM tiene 1 GB de RAM)
cp .env.example .env
nano .env                  # DOMINIO=tu-subdominio.duckdns.org
docker compose up -d
```

Abre `https://tu-subdominio.duckdns.org` y crea tu usuario de n8n. Caddy saca el certificado HTTPS solo.

## 2. Base de datos (Supabase)

1. Crea un proyecto en [Supabase](https://supabase.com).
2. En **SQL Editor**, pega [`database/schema.sql`](../database/schema.sql) y dale **Run**.
3. En **Connect → Session pooler** copia host, puerto, usuario y contraseña.

## 3. Credenciales en n8n

| Credencial | Dónde sacarla | Notas |
|---|---|---|
| **Telegram API** | [@BotFather](https://t.me/BotFather) → `/newbot` | |
| **Postgres** | Datos del session pooler de Supabase | Activa *Ignore SSL Issues* |
| **Header Auth** (Gemini) | [Google AI Studio](https://aistudio.google.com/apikey) | Name: `x-goog-api-key`, Value: tu API key |
| **Gmail OAuth2** | Google Cloud → OAuth client (Web) | Redirect URI: la que muestra n8n |
| **Google Calendar OAuth2** | El mismo OAuth client | Habilita Calendar API |
| **Google Sheets OAuth2** | El mismo OAuth client | Habilita Sheets API |

En la pantalla de consentimiento de Google agrega tu correo como *test user*.

## 4. Importar los workflows

En n8n: **Workflows → Import from file** e importa los 5 archivos de [`workflows/`](../workflows). En cada nodo con credencial, elige la tuya.

## 5. Configurar

| Placeholder | Dónde | Qué poner |
|---|---|---|
| `TU_CHAT_ID` | Nodos Code con `const CHAT_ID` | Tu chat id de Telegram (ver abajo) |
| `PON_AQUI_EL_CORREO_DEL_BANCO` | Nodo *Gmail Trigger* | Remitente de las notificaciones, ej. `notificaciones@banco.com` |
| `PEGA_AQUI_EL_ID_DE_TU_HOJA` | *Sincronizar Sheets → Preparar sync* | ID de la hoja (lo que va entre `/d/` y `/edit`) |
| `TU-DOMINIO` | *Alertas de error → Preparar alerta* | Tu subdominio de DuckDNS |

**Cómo saber tu chat id:** publica el workflow *Contador* con el placeholder tal cual y escríbele cualquier cosa al bot. Te responde con tu chat id.

**Hoja de cálculo:** sube [`sheets/Mis finanzas.xlsx`](../sheets) a Google Drive y ábrela con Google Sheets (*Archivo → Guardar como Hoja de cálculo de Google*). El ID que necesitas es el de esa copia convertida.

## 6. Publicar

1. Publica los 5 workflows con el botón **Publish**.
2. En cada uno, excepto *Alertas de error*, entra a **⋯ → Settings → Error Workflow** y elige *Alertas de error*. El dropdown solo lo muestra cuando ya está publicado.

Escríbele `/ayuda` al bot y listo.

## Desarrollo

```bash
npm install
npm run build        # src/ → workflows/*.json
npm test             # necesita PGHOST/PGUSER/PGPASSWORD/PGDATABASE
```

Edita el código en `src/`, corre `npm run build` y vuelve a importar el workflow en n8n.
