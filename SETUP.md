# APG Report Center — Setup Guide

This app runs on your own computer and reads your job folders directly, so
each person needs their own copy running locally. It does **not** need an
internet connection to work (aside from the one-time download below), and it
does **not** need any API key or account. The one exception is the ATS
Report Reviewer, which only the report reviewer uses — see the last section.

## Quick install (recommended)

1. Get **`Install APG Report Center.cmd`** — from whoever sent you a link
   to it, or from
   https://github.com/adamkanafani/APG-Report-Center/blob/main/Install%20APG%20Report%20Center.cmd
   with the **Download raw file** button (the down-arrow icon at the top right
   of the file).
2. Double-click it. If Windows says **"Windows protected your PC"**, click
   **More info** → **Run anyway**. If it asks to allow an installer to make
   changes, click **Yes**.
3. Wait 5–10 minutes until it says **Done!** It installs Node.js and Git if
   needed, puts the app in `C:\Users\<you>\APG-Report-Center`, and adds the
   **APG Report Center** icon (the APG spire) to your desktop.

Running it again later updates and repairs the app. If it can't install
Node.js or Git on its own (usually a missing-admin-rights issue), it opens
their download page — install it, then double-click the file again.

## Manual setup (about 10 minutes)

### 1. Install Node.js

Go to **https://nodejs.org**, download the **LTS** version, and run the
installer. Click "Next" through every screen with the default options — you
don't need to change anything.

### 2. Install Git

Go to **https://git-scm.com/downloads**, download it for Windows, and run
the installer. Same as above — default options the whole way through are
fine.

*(Git is what lets you get one-click updates later with `Update.bat`,
instead of having to re-download everything by hand each time.)*

### 3. Download the app

Open a folder where you want the app to live — e.g. your Desktop or
Documents (not a shared team folder) — right-click inside it, choose
**"Open in Terminal"** (or "Git Bash Here" if you see that option), and run:

```
git clone https://github.com/adamkanafani/APG-Report-Center.git
```

This creates a new folder called `APG-Report-Center`. Open that folder.

### 4. Run setup

Double-click **`Setup - Run This First.bat`**. A black window will open and
do some work for a few minutes (this is normal, even if it looks like
nothing is happening for a bit). It also puts an **APG Report Center**
icon (the APG spire) on your desktop. When it says "Setup complete!", you're
done — press any key to close the window.

## Using the app day-to-day

Double-click **APG Report Center** on your desktop (or in the app folder).
Two things will happen:

- A window titled **"APG Report Center - Server"** opens. **Leave this
  open** while you work (you can minimize it) — closing it shuts the app
  down. Close it when you're done for the day.
- Your web browser opens the app automatically a few seconds later.

Pick your line of business, then your report builder:

- **Repair** → Vanes & Nozzles, or Buckets & Blades
- **Inspection** → ATS Borescope Report Builder, or ATS Report Reviewer

Then pick your job folder like normal and work through the report.

**Lost the desktop icon?** In the app folder, right-click **APG Report
Center** (the one with the APG spire) → **Show more options** → **Send to** →
**Desktop (create shortcut)**. It keeps the spire icon. (Sending
`Start Report Center.bat` itself gives a plain icon instead.)

## Getting updates

Updates install themselves. Each time you open the Report Center from the
desktop icon, it checks for a new version; if there is one, an **"Updating"**
window opens for a minute or two and the app starts on its own when it's
done. With no internet it just opens the version you have.

You can also update by hand: close the app's server window and double-click
**`Update.bat`** inside the app folder. Either way, updates do **not** affect
any reports you've already started reviewing — your saved progress lives
outside this folder and is untouched.

## Coming from one of the old report builders

The Vanes & Nozzles, Tech Rep (buckets & blades), ATS Borescope and ATS
Report Reviewer apps all live inside this one now.

- Reports you'd already started in the V&N or Tech Rep app show up here as
  they were — the saved progress lives outside the app folders.
- If you uploaded your own templates in the ATS Borescope app, copy its
  `uploaded-templates` folder into this app's folder.

Close the old app before starting this one; once you're working here you can
delete the old folder.

## A couple of things worth knowing

- **No internet needed day-to-day.** Once it's set up, the app runs
  entirely on your own computer.
- **No API key, no account, no login** — for everything except the ATS
  Report Reviewer (below). The ATS Borescope Report Builder, Vanes & Nozzles
  and Buckets & Blades are open to everyone.
- **Your job folders** — the app just needs to be able to browse to
  wherever your job folders already live (network drive, OneDrive, etc.),
  same as you'd browse to them in File Explorer.
- **Microsoft Excel** — some DS sheets / NDT forms only exist as Excel files
  (no PDF print in the job folder). With Excel installed the app prints them
  to PDF for you when the report is built; without it, they're listed as
  skipped so you can print them yourself.

## Report reviewers only: the ATS Report Reviewer

The ATS Report Reviewer is for the report reviewers only. Its checks use
Claude AI, which is paid per report, so each reviewer signs in with their own
user name and password, and every review is recorded under the person who ran
it. Everyone else sees it locked; skip this section on their computers.

On a reviewer's computer only, after setup:

1. Close the app's server window if it's open.
2. Double-click **`Set Reviewer Users.bat`** in the app folder.
3. Paste the **Anthropic API key** and press Enter.
4. For each reviewer: type their **user name**, then their **password** twice.
   Press Enter with no user name when done.
5. Start the app again from the desktop icon.

Passwords are never saved as-is: a scrambled copy of each goes in a file
called `.env.local` in the app folder, which never leaves the computer. Run
`Set Reviewer Users.bat` again to add a reviewer or change a password.

Each sign-in, sign-out and review is logged on that computer in
`%LOCALAPPDATA%\APGReportCenter\ats-reviewer-usage.jsonl` (paste that into
File Explorer's address bar to find it): who, when, which reports, and how
much AI each review used.
