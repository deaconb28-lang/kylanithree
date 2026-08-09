import { google } from "googleapis";
import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";

interface GoogleAccountDoc {
  _id: ObjectId;
  userId: ObjectId;
  provider: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

async function getAccountsCollection() {
  return (await getDb()).collection<GoogleAccountDoc>("accounts");
}

async function getOAuthClient(userId: string) {
  const accounts = await getAccountsCollection();
  const account = await accounts.findOne({ userId: new ObjectId(userId), provider: "google" });
  if (!account?.refresh_token) {
    throw new Error("No Gmail access on file — sign out and back in to grant send permission.");
  }

  const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  oauth2Client.on("tokens", (tokens) => {
    const update: Record<string, unknown> = {};
    if (tokens.access_token) update.access_token = tokens.access_token;
    if (tokens.refresh_token) update.refresh_token = tokens.refresh_token;
    if (tokens.expiry_date) update.expires_at = Math.floor(tokens.expiry_date / 1000);
    if (Object.keys(update).length > 0) {
      accounts.updateOne({ _id: account._id }, { $set: update }).catch(() => {});
    }
  });

  return oauth2Client;
}

function encodeHeaderWord(text: string) {
  return /^[\x00-\x7F]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, "utf-8").toString("base64")}?=`;
}

function buildRawMessage({ to, from, subject, body }: { to: string; from: string; subject: string; body: string }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderWord(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ];
  return Buffer.from(lines.join("\r\n"), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendGmail(
  userId: string,
  opts: { to: string; from: string; subject: string; body: string },
) {
  const auth = await getOAuthClient(userId);
  const gmail = google.gmail({ version: "v1", auth });
  const raw = buildRawMessage(opts);
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}
