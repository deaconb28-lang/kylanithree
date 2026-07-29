import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/mongodb";

export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail, password } = await req.json();
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const db = await getDb();
    const users = db.collection("users");

    const existing = await users.findOne({ email });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await users.insertOne({
      email,
      name: email.split("@")[0],
      emailVerified: null,
      image: null,
      passwordHash,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Surface the real cause (e.g. "MONGODB_URI is not set...") instead of a bare 500 with no
    // body, which shows up client-side as an opaque "Something went wrong."
    const message = err instanceof Error ? err.message : "Couldn't create that account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
