-- =====================================================================
--  n8n Finance Assistant · esquema completo (PostgreSQL / Supabase)
--  Pega todo en Supabase → SQL Editor → Run. Es idempotente: se puede
--  correr varias veces sin borrar nada.
-- =====================================================================

-- ---------- Finanzas ----------
create table if not exists gastos (
  id               bigserial primary key,
  fecha            timestamptz not null default now(),
  monto            numeric(10,2) not null,
  descripcion      text,
  categoria        text not null default 'Otros',
  metodo           text not null default 'manual',   -- manual · voz · yape · correo · recurrente
  destinatario     text,
  chat_id          bigint not null,
  mensaje_original text,
  email_id         text,                              -- id del correo del banco (dedupe)
  creado_en        timestamptz not null default now()
);
create unique index if not exists gastos_email_id   on gastos (email_id);
create index        if not exists gastos_chat_fecha on gastos (chat_id, fecha);

create table if not exists ingresos (
  id          bigserial primary key,
  fecha       timestamptz not null default now(),
  monto       numeric(10,2) not null,
  descripcion text,
  chat_id     bigint not null,
  creado_en   timestamptz not null default now()
);
create index if not exists ingresos_chat_fecha on ingresos (chat_id, fecha);

create table if not exists presupuestos (
  chat_id   bigint not null,
  categoria text not null,
  monto     numeric(10,2) not null,
  primary key (chat_id, categoria)
);

create table if not exists recurrentes (
  id         bigserial primary key,
  chat_id    bigint not null,
  nombre     text not null,
  monto      numeric(10,2) not null,
  categoria  text not null default 'Servicios',
  dia        smallint not null check (dia between 1 and 31),
  activo     boolean not null default true,
  ultimo_mes text,                                    -- 'YYYY-MM' del último cargo registrado
  creado_en  timestamptz not null default now()
);

create table if not exists deudas (
  id          bigserial primary key,
  chat_id     bigint not null,
  persona     text not null,
  monto       numeric(10,2) not null,                 -- + te deben · − debes
  descripcion text,
  fecha       timestamptz not null default now()
);
create index if not exists deudas_chat_persona on deudas (chat_id, lower(persona));

create table if not exists metas (
  id           bigserial primary key,
  chat_id      bigint not null,
  nombre       text not null,
  objetivo     numeric(10,2) not null,
  ahorrado     numeric(10,2) not null default 0,
  fecha_limite date,
  activa       boolean not null default true,
  creado_en    timestamptz not null default now()
);

-- ---------- Productividad ----------
create table if not exists recordatorios (
  id         bigserial primary key,
  chat_id    bigint not null,
  texto      text not null,
  cuando     timestamptz not null,
  repetir    text check (repetir in ('diario', 'semanal', 'mensual', 'laborables')),
  activo     boolean not null default true,
  enviado_en timestamptz,
  creado_en  timestamptz not null default now()
);
create index if not exists recordatorios_activos on recordatorios (chat_id, cuando) where activo;

create table if not exists tareas (
  id        bigserial primary key,
  chat_id   bigint not null,
  texto     text not null,
  prioridad smallint not null default 2 check (prioridad between 1 and 3),  -- 1 alta · 2 media · 3 baja
  vence     date,
  hecha     boolean not null default false,
  hecha_en  timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists tareas_pendientes on tareas (chat_id) where not hecha;

-- ---------- Sistema ----------
create table if not exists sync_estado (          -- huella md5 de lo último enviado a Google Sheets
  clave       text primary key,
  hash        text,
  actualizado timestamptz
);

create table if not exists alertas (              -- anti-spam de alertas de error (1 cada 30 min)
  clave  text primary key,
  ultima timestamptz not null default now(),
  veces  int not null default 1
);

-- Cierra la API pública de Supabase; n8n entra como postgres y no le afecta.
alter table gastos        enable row level security;
alter table ingresos      enable row level security;
alter table presupuestos  enable row level security;
alter table recurrentes   enable row level security;
alter table deudas        enable row level security;
alter table metas         enable row level security;
alter table recordatorios enable row level security;
alter table tareas        enable row level security;
alter table sync_estado   enable row level security;
alter table alertas       enable row level security;
