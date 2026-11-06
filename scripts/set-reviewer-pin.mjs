// Sets up the ATS Report Reviewer on the report reviewer's computer (it's one person's tool): the
// Anthropic API key its AI checks use, and the 6-digit PIN that unlocks it. Run by
// "Set Reviewer PIN.bat" -- only on that computer; nothing else in the Report Center needs it (the ATS Borescope Report Builder included).
//
// Both go into .env.local in the app folder, which is never uploaded to GitHub. The PIN itself is
// not stored: only a salted scrypt hash of it (ATS_REVIEWER_PIN_HASH), in the same form
// src/atsReviewer/lib/pinLock.ts checks against.

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

function readEnv() {
  if (!existsSync(ENV_FILE)) return [];
  return readFileSync(ENV_FILE, "utf8").split(/\r?\n/).filter((line) => line.trim() !== "");
}

function setVar(lines, name, value) {
  const kept = lines.filter((line) => !line.startsWith(`${name}=`));
  return [...kept, `${name}=${value}`];
}

const hashPin = (pin) => {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`;
};

try {
  let lines = readEnv();
  const hasKey = lines.some((line) => /^ANTHROPIC_API_KEY=\S+/.test(line));

  const keyPrompt = hasKey ? "Anthropic API key (press Enter to keep the one already saved): " : "Anthropic API key (press Enter to skip): ";
  const key = (await ask(keyPrompt)).trim();
  if (key) lines = setVar(lines, "ANTHROPIC_API_KEY", key);

  let pin = "";
  for (;;) {
    pin = (await ask("Reviewer PIN (6 digits): ")).trim();
    if (!pin && pending.length === 0 && rl.closed) throw new Error("No PIN entered.");
    if (!/^\d{6}$/.test(pin)) {
      console.log("  The PIN must be exactly 6 digits.");
      continue;
    }
    const again = (await ask("Type the PIN again: ")).trim();
    if (again === pin) break;
    console.log("  Those didn't match -- try again.");
  }
  lines = setVar(lines, "ATS_REVIEWER_PIN_HASH", hashPin(pin));

  writeFileSync(ENV_FILE, lines.join("\r\n") + "\r\n");
  console.log("Saved. If the Report Center is running, close its server window and start it again.");
} finally {
  rl.close();
}
