-- Modo Escena sobre el guion + reportes de error con código de referencia.
--
-- scene_analyses: el Modo Escena ya no analiza grabaciones sino el texto de una escena para un
-- personaje. Se guarda el último análisis por (usuario, escena, personaje); lo escribe el servidor
-- (service role) y la app solo lo lee. coach_feedback (análisis antiguos sobre grabaciones) se deja
-- intacta: la app nueva ya no la muestra, pero las versiones instaladas siguen usándola.
--
-- error_reports: cuando algo falla, el usuario ve un mensaje legible con un código (SC-XXXXXX) y el
-- detalle técnico se guarda aquí. El servidor inserta los errores ('server'); la app inserta los
-- reportes que el usuario envía con el botón "Reportar" ('app'). Los usuarios no pueden leerlos.

create table if not exists public.scene_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  script_id uuid not null references public.scripts(id) on delete cascade,
  scene_id uuid not null references public.scenes(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  analysis jsonb not null,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scene_id, character_id)
);

create index if not exists scene_analyses_script_idx on public.scene_analyses (script_id);

alter table public.scene_analyses enable row level security;

create policy "Users can view their own scene analyses" on public.scene_analyses
  for select using (auth.uid() = user_id);

create policy "Users can delete their own scene analyses" on public.scene_analyses
  for delete using (auth.uid() = user_id);

create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('server', 'app')),
  mode text,
  message text,
  details jsonb not null default '{}'::jsonb,
  user_note text,
  created_at timestamptz not null default now()
);

create index if not exists error_reports_reference_idx on public.error_reports (reference);
create index if not exists error_reports_created_at_idx on public.error_reports (created_at desc);

alter table public.error_reports enable row level security;

create policy "Users can send their own error reports" on public.error_reports
  for insert with check (auth.uid() = user_id and source = 'app');
