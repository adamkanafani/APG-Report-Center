// Sets up the ATS Report Reviewer on a reviewer's computer: the Anthropic API key its AI checks use,
// and the reviewers who can sign in to it, each with their own user name and password (so every
// review is recorded under the person who ran it). Run by "Set Reviewer Users.bat" -- only on the
// reviewers' computers; nothing else in the Report Center needs it.
//
// Both go into .env.local in the app folder, which is never uploaded to GitHub. Passwords
// themselves are not stored: only a salted scrypt hash of each (ATS_REVIEWER_USERS =
// "USER=scrypt:<salt>:<hash>;..."), in the form src/atsReviewer/lib/reviewerAuth.ts checks.
// Running it again adds users or changes a user's password; users already saved are kept.

import { randomBytes, scryptSync } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const ENV_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Answers are queued as lines arrive, so typed and piped input both work (readline's own question()
// drops lines that arrive before it's asked).
const pending = [];
const waiting = [];
rl.on("line", (line) => (waiting.length ? waiting.shift()(line) : pending.push(line)));
rl.on("close", () => waiting.splice(0).forEach((resolve) => resolve("")));
const ask = (prompt) => {
  process.stdout.write(prompt);
  return pending.length ? Promise.resolve(pending.shift()) : new Promise((resolve) => waiting.push(resolve));
};
const inputClosed = () => pending.length === 0 && rl.closed;

function readEnv() {
  if (!existsSync(ENV_FILE)) return [];
  return readFileSync(ENV_FILE, "utf8").split(/\r?\n/).filter((line) => line.trim() !== "");
}

function setVar(lines, name, value) {
  const kept = lines.filter((line) => !line.startsWith(`${name}=`));
  return value === null ? kept : [...kept, `${name}=${value}`];
}

const hashPassword = (password) => {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`;
};

try {
  let lines = readEnv();
  const hasKey = lines.some((line) => /^ANTHROPIC_API_KEY=\S+/.test(line));
  const keyPrompt = hasKey ? "Anthropic API key (press Enter to keep the one already saved): " : "Anthropic API key (press Enter to skip): ";
  const key = (await ask(keyPrompt)).trim();
  if (key) lines = setVar(lines, "ANTHROPIC_API_KEY", key);

  // Users already saved on this computer.
  const users = new Map();
  const existing = lines.find((l) => l.startsWith("ATS_REVIEWER_USERS="));
  for (const entry of (existing?.slice("ATS_REVIEWER_USERS=".length) ?? "").split(";")) {
    const i = entry.indexOf("=");
    if (i > 0) users.set(entry.slice(0, i).trim().toUpperCase(), entry.slice(i + 1).trim());
  }
  if (users.size) console.log(`Reviewers already set up here: ${[...users.keys()].join(", ")}`);

  console.log("Add each reviewer (or a new password for one already set up). Press Enter with no user name when done.");
  for (;;) {
    const user = (await ask("Reviewer user name: ")).trim().toUpperCase();
    if (!user) break;
    if (!/^[A-Z0-9._-]+$/.test(user)) {
      console.log("  User names are letters and numbers only (e.g. BFULLER).");
      continue;
    }
    const password = (await ask(`Password for ${user}: `)).trim();
    if (!password) {
      console.log("  No password entered -- skipped.");
      if (inputClosed()) break;
      continue;
    }
    const again = (await ask("Type it again: ")).trim();
    if (again !== password) {
      console.log("  Those didn't match -- try that user again.");
      continue;
    }
    users.set(user, hashPassword(password));
    console.log(`  Saved ${user}.`);
  }

  lines = setVar(lines, "ATS_REVIEWER_USERS", users.size ? [...users].map(([u, h]) => `${u}=${h}`).join(";") : null);
  lines = setVar(lines, "ATS_REVIEWER_PIN_HASH", null); // the old single PIN, replaced by named users
  writeFileSync(ENV_FILE, lines.join("\r\n") + "\r\n");
  console.log(`Saved. Reviewers on this computer: ${[...users.keys()].join(", ") || "(none)"}`);
  console.log("If the Report Center is running, close its server window and start it again.");
} finally {
  rl.close();
}
