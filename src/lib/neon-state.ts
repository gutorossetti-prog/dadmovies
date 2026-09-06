import { neon } from "@neondatabase/serverless";

export type RemotePersonalState = "watch" | "seen" | "dismissed";

export type RemoteStateRow = {
  movieKey: string;
  state: RemotePersonalState;
  updatedAt: string;
};

function sqlClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;
  return neon(databaseUrl);
}

export async function ensurePersonalStateSchema() {
  const sql = sqlClient();
  if (!sql) return false;

  await sql`
    create table if not exists dadmovies_personal_state (
      movie_key text primary key,
      state text not null check (state in ('watch', 'seen', 'dismissed')),
      updated_at timestamptz not null default now()
    )
  `;

  return true;
}

export async function listPersonalStates(): Promise<RemoteStateRow[] | null> {
  const sql = sqlClient();
  if (!sql) return null;
  await ensurePersonalStateSchema();
  const rows = await sql`
    select movie_key, state, updated_at
    from dadmovies_personal_state
    order by movie_key asc
  `;
  return rows.map((row) => ({
    movieKey: String(row.movie_key),
    state: row.state as RemotePersonalState,
    updatedAt: new Date(row.updated_at as string | number | Date).toISOString(),
  }));
}

export async function setPersonalState(movieKey: string, state: RemotePersonalState) {
  const sql = sqlClient();
  if (!sql) return false;
  await ensurePersonalStateSchema();

  if (state === "watch") {
    await sql`delete from dadmovies_personal_state where movie_key = ${movieKey}`;
    return true;
  }

  await sql`
    insert into dadmovies_personal_state (movie_key, state, updated_at)
    values (${movieKey}, ${state}, now())
    on conflict (movie_key)
    do update set state = excluded.state, updated_at = now()
  `;
  return true;
}

export function verifyStatePin(pin: string) {
  const expected = process.env.DADMOVIES_STATE_PIN;
  if (!expected) return false;
  return pin === expected;
}
