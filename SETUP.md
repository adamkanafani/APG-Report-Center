# APG Report Center — Setup Guide

This app runs on your own computer and reads your job folders directly, so
each tech rep needs their own copy running locally. It does **not** need an
internet connection to work (aside from the one-time download below), and it
does **not** need any account. The one exception is the ATS Report Reviewer's AI
checks, which need the Anthropic API key that setup asks report reviewers for.

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
Documents — right-click inside it, choose **"Open in Terminal"** (or
"Git Bash Here" if you see that option), and run:

```
git clone https://github.com/adamkanafani/APG-Report-Center.git
```

This creates a new folder called `APG-Report-Center`. Open that folder.

### 4. Run setup

Double-click **`Setup - Run This First.bat`**. A black window opens.

1. It asks **"Is this a report reviewer's computer? (y/N)"**.
   - Most people: just press **Enter**. The ATS Report Reviewer stays locked
     on this computer; everything else works.
   - Report reviewers: type **y** and press Enter, paste the **Anthropic API
     key**, then type the **6-digit reviewer PIN** twice.
2. It then does some work for a few minutes (this is normal, even if it
   looks like nothing is happening for a bit). When it says "Setup
   complete!", you're done — press any key to close the window.

The ATS Report Reviewer's AI checks are paid per report, so it only opens
with the reviewer PIN. The PIN is never saved as-is: setup keeps a scrambled
copy in a file called `.env.local` in the app folder, which never leaves the
computer. To change the key or PIN later, close the app, double-click
**`Set Reviewer PIN.bat`**, then start the app again.

## Using the app day-to-day

Double-click **`Start Report Center.bat`**. Two things will happen:

- A window titled **"APG Report Center - Server"** opens. **Leave this
  open** while you work (you can minimize it) — closing it shuts the app
  down. Close it when you're done for the day.
- Your web browser opens the app automatically a few seconds later.

Pick your line of business (Parts, Repair, Inspection, …), then the report
builder for your part, then your job folder, and work through the report.

## Coming from one of the old report builders

The Vanes & Nozzles, Tech Rep (buckets & blades), ATS Borescope and ATS Report
Reviewer apps all live inside this one now (Parts → Vanes & Nozzles or Buckets
& Blades; Inspection → ATS Borescope Report Builder or ATS Report Reviewer).

- Reports you'd already started in the V&N or Tech Rep app show up here as they
  were -- the saved progress lives outside the app folders.
- If you uploaded your own templates in the ATS Borescope app, copy its
  `uploaded-templates` folder into this app's folder.
- Report reviewers: if you answered "N" during setup, double-click
  `Set Reviewer PIN.bat` to add the API key and PIN.

Close the old app before starting this one; once you're working here you can
delete the old folder.

## Getting updates

Whenever there's a new version of the app, double-click **`Update.bat`**
inside the app folder. It downloads the changes and rebuilds automatically.
This does **not** affect any reports you've already started reviewing —
your saved progress lives outside this folder and is untouched.

## A couple of things worth knowing

- **No internet needed day-to-day.** Once it's set up, the app runs
  entirely on your own computer.
- **No account, no login.** The only settings are the API key and PIN for
  report reviewers, asked for during setup.
- **Your job folders** — the app just needs to be able to browse to
  wherever your job folders already live (network drive, OneDrive, etc.),
  same as you'd browse to them in File Explorer.
- **Microsoft Excel** — some DS sheets / NDT forms only exist as Excel files
  (no PDF print in the job folder). With Excel installed the app prints them
  to PDF for you when the report is built; without it, they're listed as
  skipped so you can print them yourself.
