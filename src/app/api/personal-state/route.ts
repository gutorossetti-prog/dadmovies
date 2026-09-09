import { NextResponse } from "next/server";
import {
  createStatePin,
  hasStatePin,
  listPersonalStates,
  setPersonalState,
  verifyStatePin,
  type RemotePersonalState,
} from "@/lib/neon-state";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await listPersonalStates();
    if (rows === null) {
      return NextResponse.json({ configured: false, hasPin: false, states: {} }, { status: 503 });
    }

    const pinConfigured = (await hasStatePin()) ?? false;
    const states = Object.fromEntries(rows.map((row) => [row.movieKey, row.state]));
    return NextResponse.json(
      { configured: true, hasPin: pinConfigured, states },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to read personal states", error);
    return NextResponse.json({ configured: true, hasPin: false, states: {}, error: "state-read-failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { movieKey?: unknown; state?: unknown; pin?: unknown };
    const movieKey = typeof body.movieKey === "string" ? body.movieKey.trim() : "";
    const state = body.state as RemotePersonalState;
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";

    if (!movieKey || !["watch", "seen", "dismissed"].includes(state) || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ ok: false, error: "invalid-payload" }, { status: 400 });
    }

    let pinStatus = await verifyStatePin(pin);
    if (pinStatus === "unconfigured") {
      return NextResponse.json({ ok: false, error: "neon-not-configured" }, { status: 503 });
    }
    if (pinStatus === "missing") {
      const created = await createStatePin(pin);
      if (!created) {
        pinStatus = await verifyStatePin(pin);
      } else {
        pinStatus = "valid";
      }
    }
    if (pinStatus !== "valid") {
      return NextResponse.json({ ok: false, error: "invalid-pin" }, { status: 401 });
    }

    const saved = await setPersonalState(movieKey, state);
    if (!saved) {
      return NextResponse.json({ ok: false, error: "neon-not-configured" }, { status: 503 });
    }

    return NextResponse.json({ ok: true, movieKey, state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to update personal state", error);
    return NextResponse.json({ ok: false, error: "state-write-failed" }, { status: 500 });
  }
}
