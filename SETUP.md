# APG Report Center — Setup Guide

This app runs on your own computer and reads your job folders directly, so
each person needs their own copy running locally. It does **not** need an
internet connection to work (aside from the one-time download below), and it
does **not** need any API key or account. The one exception is the ATS
Report Reviewer, which only the report reviewer uses — see the last section.

## One-time setup (about 10 minutes)

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

Double-click **APG Report Center** on your desktop (or
**`Start Report Center.bat`** in the app folder). Two things will happen:

- A window titled **"APG Report Center - Server"** opens. **Leave this
  open** while you work (you can minimize it) — closing it shuts the app
  down. Close it when you're done for the day.
- Your web browser opens the app automatically a few seconds later.

Pick your line of business, then your report builder:

- **Parts** → Vanes & Nozzles, or Buckets & Blades
- **Inspection** → ATS Borescope Report Builder, or ATS Report Reviewer

Then pick your job folder like normal and work through the report.

## Getting updates

Whenever there's a new version of the app, double-click **`Update.bat`**
inside the app folder. It downloads the changes and rebuilds automatically.
This does **not** affect any reports you've already started reviewing —
your saved progress lives outside this folder and is untouched.

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

## The report reviewer only: the ATS Report Reviewer

The ATS Report Reviewer is for one person, the report reviewer. Its checks
use Claude AI, which is paid per report, so it opens only with the
reviewer's 6-digit PIN. Everyone else sees it locked; skip this section on
their computers.

On the report reviewer's computer only, after setup:

1. Close the app's server window if it's open.
2. Double-click **`Set Reviewer PIN.bat`** in the app folder.
3. Paste the **Anthropic API key** and press Enter.
4. Type the **reviewer PIN**, press Enter, and type it again.
5. Start the app again with **`Start Report Center.bat`**.

The PIN is never saved as-is: a scrambled copy goes in a file called
`.env.local` in the app folder, which never leaves the computer. Run
`Set Reviewer PIN.bat` again any time the key or PIN changes.
