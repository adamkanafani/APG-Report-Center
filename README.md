# APG Report Center

One app for Allied Power Group's report builders. The home screen asks for the line of business,
then the report builder:

| Line of business | Builders |
|---|---|
| Repair | Vanes & Nozzles (nozzles, vanes, compressor diaphragms, blade rings, ISOs, air seals, support rings); Buckets & Blades |
| Inspection | ATS Borescope Report Builder; ATS Report Reviewer |
| Field Service | Coming soon |
| Generator | Coming soon |

The lines of business and their builders are listed in `src/app/(home)/lobs.ts`.

## How the code is laid out

Each builder keeps its own screens, styles, API and library, so they can't step on each other:

| Builder | Screens | API | Library | Saved job state |
|---|---|---|---|---|
| Home screens | `src/app/(home)` | -- | -- | -- |
| Vanes & Nozzles | `src/app/(vanes-nozzles)` → `/parts/vanes-nozzles` | `/api/vn/*` | `src/lib` | `%LOCALAPPDATA%\VNReportApp` |
| Buckets & Blades | `src/app/(buckets-blades)` → `/parts/buckets-blades` | `/api/bb/*` | `src/bucketsBlades/lib` | `%LOCALAPPDATA%\TechRepReportApp` |
| ATS Borescope | `src/app/(ats-borescope)` → `/inspection/borescope` | `/api/ats-borescope/*` | `src/atsBorescope/lib` | uploaded templates in `uploaded-templates/` (not committed) |
| ATS Report Reviewer | `src/app/(ats-reviewer)` → `/inspection/reviewer` | `/api/ats-reviewer/*` | `src/atsReviewer/lib` | none (finished reviews are held in memory until downloaded) |

Each `(group)` folder has its own root layout and stylesheet; moving between builders is a full page
load, so one builder's CSS never reaches another's pages. Both builders' saved state stays where the
old standalone apps kept it, so reviews in progress carry over.

The ATS Report Reviewer needs `ANTHROPIC_API_KEY` in `.env.local` for its AI checks, and opens only
for its named reviewers, each signing in with their own user name and password, since those checks
are paid per report. `Set Reviewer Users.bat` (`scripts/set-reviewer-users.mjs`, run only on the
reviewers' computers) writes the key and a salted scrypt hash of each password (`ATS_REVIEWER_USERS`)
to `.env.local`; passwords are never stored, and never belong in this public repo.
`src/atsReviewer/lib/reviewerAuth.ts` checks them: a right sign-in sets a signed, httpOnly cookie
naming the user, good for 12 hours; every Reviewer API route refuses without it; wrong guesses slow to
one per 30 seconds after five. Every sign-in (good or bad), sign-out and review is appended to
`%LOCALAPPDATA%\APGReportCenter\ats-reviewer-usage.jsonl` on that computer -- who, when, which reports,
and each review's AI calls, tokens and estimated cost -- and each Claude request carries the
reviewer's opaque id as `metadata.user_id`. The ATS apps' test scripts and sample reports stayed in
their old repos (ATS-Borescope-Report-App, ATS-Report-Reviewer): the samples are customer reports and
this repo is public.

## ATS Borescope builder: every model

The builder fills any model's blank ATS template, not just GE frames:

- **Layouts.** GE 7EA-style and 7FA-style templates use their hand-checked layouts
  (`templateFamilies.ts`). Every other template (501D5A, 501F, 501G, W251, Frame 5/6, 7B, LM6000,
  Mitsubishi, V84, RB211, Trent, generators, ...) is read from the template itself: its Photos
  sections are the headings under "Photos" (`genericFamily.ts`).
- **Sorting photos.** Each photo's borescope component is sorted by what ATS's own past reports did
  with it (`componentKnowledge.json`, learned from ~1,500 reports in `T:\!Jobs!\Working Jobs\400000 (ATS)`),
  then keyword rules (`sectionKinds.ts`). Against those reports it puts 95-96% of photos in the same
  section ATS did; the tech rep reviews and moves the rest. Refresh it with `scripts/ats-borescope/`.
- **Observations.** Compressor and turbine Condition cells are filled for any template whose rows it
  recognizes (GE "R1/S1", Westinghouse/Siemens "R1B/R1D", "Row N Vanes/Blades/Ring Segment"), in ATS's
  wording: "Impact damage at the leading edge (1)".
- **Checked against ATS's own Inspection Center** (2026-11-12): every model's blank Cover Page template
  is recognized (GE 6B/6FA/7B-7C/7EA/7FA/7HA/9FA/Frame 5/GE10; Westinghouse 191/251/501AA/501B/501D5A/
  501F/501G; Mitsubishi 501G/501GAC/501J/701F; Siemens SGT-800/SGT6-5000F/V84.2/V84.3; Alstom GT24;
  ABB 11N; LM2500/LM5000/LM6000/LMS100; Allison 501; Avon 200; RB211; Trent 60; FT4/FT8/GG4;
  generators; steam), and every component in each model's borescope setup sorts into a section --
  except a generic steam setup's bare "Stage N"/"Valve N" and Avon's "Intermediate Pressure Section",
  which the tech places. A test report per model, built from one of its past reports' captions,
  matches ATS's own placement 98-100% (ABB 11N and LM6000 lower only where finished reports renamed
  photos the borescope names plainly) and fills its Observations tables.
- **Templates.** Found in the Inspection Center (OEM/Model/Cover Page) when it's synced, the
  ATS Cover Page Templates folder, a folder picked with "Choose templates folder...", or a plugged-in
  drive, and matched to the raw file's unit (e.g. `501D5A_...docx` finds "501D5 _501D5A").

# Vanes & Nozzles builder

Built around how the V&N tech reps write their reports (Alfredo Resendiz on nozzles and support rings;
Adan Aguirre and Elmer Gomez on vanes, compressor diaphragms, blade rings, ISOs and air seals). The two
report types are the I&A Report ("Incoming Report") and the Final Report ("Repair Report").
Generate PDF builds the finished report straight from the app, and each report the app builds
carries a record that the next job of the same part learns from.

## Setup

```bash
npm install
npm run dev -- -p 3002
```

Open http://localhost:3002. Port 3002 keeps it clear of the old standalone apps (3000 and 3001) while people move over. For day-to-day use, see `SETUP.md`: double-click `Setup - Run This First.bat` once, then `Start Report Center.bat`.

Requirements:
- **Chrome or Edge**, for PDF rendering.
- **Desktop Excel**, only for exhibits that exist only as `.xlsx` (common for final DS sheets). They're printed through Excel; without it they're listed as skipped.
- `ANTHROPIC_API_KEY` is optional:
  - It's only used for "Revise with instruction" and for photo duplicate/blur screening.
  - Without it, scanning, every draft and both exports work normally.

## How the drafts are made

**Starting from the last report of the same product.** Alfredo's reports reuse most of their wording per product:
- Across 9 F7EA 1st stage nozzle I&A reports, 21 Repair Recommendations lines appear in every one, and 85–95% of each list is shared.
- The Engineering Summary has the same subheadings every time, with many findings repeated word for word.

So for a new job the app finds the **most recent finished report deck of the same model and stage/row** in the same Working Jobs tree, and starts from its wording (`src/lib/draft/priorReport.ts`).

**Then this job's values are filled in** (`src/lib/ingest/measurements.ts`), all confirmed against Job 20564:
- **Received date:** from the 3A Incoming\Shipping folder name, e.g. "… 03-18-26" → 3/18/2026.
- **Total area deviation and throat range:** from the area-check workbook (DS-0045 / 0337 / 0346 / 0388 / 0945) in 7A.
- **Flow ranges (OD T/E, ID L/E):** from the incoming airflow workbook's "Range:" cells.

**Every other job-specific value** from the old report (counts like "Twenty one (21)", inch readings) is kept but wrapped in **[brackets]**, so it gets checked.

**The Repair Summary is this job's own Repair Recommendations in the past tense**, line for line, exactly how Alfredo writes it. On his 20564 report, 17 of 17 lines match.

**Fallback:** with no earlier report of the same product, the drafts come from the job's I&A and repair routers instead. Each narrative section shows where its draft came from, with **Start over from last report** and **Start over from router** buttons.

## Vanes and nozzles, one app

Vane reports (Elmer Gomez, Adan Aguirre) and nozzle reports (Alfredo Resendiz) share one format: the same deck layout, the same report order and the same exhibit blocks. Checked against Jobs 20381, 20387, 19820, 19714, 19886, 19608, 19168 and 20564.

What differs is by author, so on a job's first scan of each report type the app copies these from the **last same-product report deck of that type** (`seedLayout` in `src/lib/draft/autoDraft.ts`):
- **Divider wording**, e.g. "Flow Test" vs "Incoming Air Flow", "Heat Treat Chart" vs "Heat Treat Charts", "Incoming NDT Report" vs "Reports". Matching ignores wording (`src/lib/report-templates/titles.ts`), so any author's edited deck still lines up in the final PDF.
- **Which optional blocks appear:** Certifications (APG's "… Cert for TMG" sheets), Heat Treat Certification, and the Repair Report's repeated incoming blocks.
- **Cover conventions:** "EQ#" vs "Asset#", plus extra rows such as Adan's "WO#", added blank to fill in.

Any section's title can also be changed with **Rename** in its panel.

Inner support rings (Alfredo's) and GT11 vane carriers (Adan's and Elmer's; whole carriers and "Row N Vane Carrier Segments" kept apart) are their own products, so they draft only from earlier reports of the same kind. Pilot nozzles, combustor tile carriers, carrier heat shields and stator carrier rings are not included yet.

Product grouping uses model + stage/row. MHI 501F is kept apart from Siemens 501F, recognized from the folder or the deck name.

## Report structure

Section lists live in `src/lib/report-templates/` and the file-matching rules in `vn-rules.ts`. They follow Alfredo's 20564 decks.

**Incoming Report:**
1. Customer pages (before the cover)
2. Cover + component details
3. Incoming Engineering Summary
4. Repair Recommendations
5. Then, each behind a divider:
   - Serial Number List
   - Incoming Dimensional Sheets
   - Incoming NDT Reports
   - Incoming Photographs
   - Incoming Air Flow
   - Heat Treat Charts
   - Metallurgical Sample Analysis

**Repair Report:**
1. Customer pages
2. Cover + component details
3. Incoming Engineering Summary
4. Serial Number List
5. Repair Summary
6. Then, each behind a divider:
   - Final Dimensional Sheets
   - Final NDT Report
   - Final Photographs
   - Air Flow Test
   - Heat Treat Charts
   - Coating Certification

The incoming exhibit blocks are also available in the Repair Report. Some of his reports repeat them (Job 20505), others don't (Job 20564), so they start out left out and can be added back from the sidebar.

**Adding your own section.** "+ Add section" at the bottom of the sidebar adds a block with any title (e.g. "Eddy Current Map"):
- Attach its file(s) in the section's panel. PDFs go in as-is; Excel files are printed through Excel.
- It prints like every built-in block: its own divider page/slide, then the files.
- It can be renamed, reordered, left out or deleted like any other section.
- It's saved per job and per report type.

Details:
- **Serial Number List:** the real completed DS-0404 form, previewed in the review screen and embedded as-is behind its divider, the same as the other data sheets. The standard incoming PDF is picked by default; other copies (the working .xlsx, a field-service print) are listed one click away. A list that only exists as an Excel file is printed through Excel.
- **Cover fields:** his labels, including **Asset#** (read from the "EQ 10925569" in Calpine folder names) and a separate **Customer** on the details page (20564's cover says Zion Gas, the details page says Calpine). Blank standard fields stay in the PowerPoint so they can be filled in there.
- **Photo slides:** titled by folder the way he titles them: Shipping Photos, NDT Photos (Segments / Ret. Ring / Cores & Covers / …), Final Photos. Shipping photos are capped at one slide (6) by default.
- **Field-service copies:** "… FS.pdf" files beside the standard file are collapsed into it.
- **Heat treat charts:** print in the order the cycles ran (by file date).

## Where job-review state lives

Per-job edits, drafts and selections are saved to `%LOCALAPPDATA%\VNReportApp\jobs\<hash>.json`, keyed by the job folder's path:
- The Incoming and Repair reports share one job's state, so the summary, cover and exhibit picks carry over. Each report keeps its own page order.
- Nothing is written into the job folder except files attached manually (`_Manual Attachments\`).
- Excel-printed exhibits and deck exports are made under `%TEMP%`.
