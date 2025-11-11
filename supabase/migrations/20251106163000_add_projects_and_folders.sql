-- Create projects and folders for hierarchical organization
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists projects_user_name_unique on public.projects (user_id, name);

alter table public.projects enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policy where polname = 'Projects can be viewed by owner' and polrelid = 'public.projects'::regclass
  ) then
    create policy "Projects can be viewed by owner" on public.projects
      for select using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policy where polname = 'Projects can be inserted by owner' and polrelid = 'public.projects'::regclass
  ) then
    create policy "Projects can be inserted by owner" on public.projects
      for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policy where polname = 'Projects can be updated by owner' and polrelid = 'public.projects'::regclass
  ) then
    create policy "Projects can be updated by owner" on public.projects
      for update using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policy where polname = 'Projects can be deleted by owner' and polrelid = 'public.projects'::regclass
  ) then
    create policy "Projects can be deleted by owner" on public.projects
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Folders inside projects
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid null references public.folders(id) on delete set null,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists folders_unique_siblings on public.folders (project_id, parent_id, name);

alter table public.folders enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policy where polname = 'Folders can be viewed by owner' and polrelid = 'public.folders'::regclass
  ) then
    create policy "Folders can be viewed by owner" on public.folders
      for select using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policy where polname = 'Folders can be inserted by owner' and polrelid = 'public.folders'::regclass
  ) then
    create policy "Folders can be inserted by owner" on public.folders
      for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policy where polname = 'Folders can be updated by owner' and polrelid = 'public.folders'::regclass
  ) then
    create policy "Folders can be updated by owner" on public.folders
      for update using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policy where polname = 'Folders can be deleted by owner' and polrelid = 'public.folders'::regclass
  ) then
    create policy "Folders can be deleted by owner" on public.folders
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Link existing content to projects/folders
alter table public.scripts add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.scripts add column if not exists folder_id uuid references public.folders(id) on delete set null;

alter table public.recordings add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.recordings add column if not exists folder_id uuid references public.folders(id) on delete set null;

-- Optional helper: touch updated_at on change
create or replace function public.touch_projects_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.touch_projects_updated_at();

create or replace function public.touch_folders_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

drop trigger if exists folders_set_updated_at on public.folders;
create trigger folders_set_updated_at before update on public.folders
for each row execute function public.touch_folders_updated_at();