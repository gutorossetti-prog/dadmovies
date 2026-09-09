import { createHash, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export type RemotePersonalState = "watch" | "seen" | "dismissed";

export type RemoteStateRow = {
  movieKey: string;
  state: RemotePersonalState;
  updatedAt: string;
};

const PIN_SETTING_KEY = "personal_state_pin_hash";

function sqlClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;
  return neon(databaseUrl);
}

function hashPin(pin: string) {
  return createHash("sha256").update(pin, "utf8").digest("hex");
}

function hashesEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
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

  await sql`
    create table if not exists dadmovies_settings (
      key text primary key,
      value text not null,
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

export async function hasStatePin() {
  const sql = sqlClient();
  if (!sql) return null;
  await ensurePersonalStateSchema();
  const rows = await sql`
    select 1
    from dadmovies_settings
    where key = ${PIN_SETTING_KEY}
    limit 1
  `;
  return rows.length > 0;
}

export async function verifyStatePin(pin: string): Promise<"valid" | "invalid" | "missing" | "unconfigured"> {
  const sql = sqlClient();
  if (!sql) return "unconfigured";
  await ensurePersonalStateSchema();
  const rows = await sql`
    select value
    from dadmovies_settings
    where key = ${PIN_SETTING_KEY}
    limit 1
  `;
  if (rows.length === 0) return "missing";
  const expected = String(rows[0].value);
  return hashesEqual(hashPin(pin), expected) ? "valid" : "invalid";
}

export async function createStatePin(pin: string) {
  const sql = sqlClient();
  if (!sql) return false;
  if (!/^\d{4,6}$/.test(pin)) return false;
  await ensurePersonalStateSchema();
  const pinHash = hashPin(pin);
  await sql`
    insert into dadmovies_settings (key, value, updated_at)
    values (${PIN_SETTING_KEY}, ${pinHash}, now())
    on conflict (key) do nothing
  `;
  return (await verifyStatePin(pin)) === "valid";
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
