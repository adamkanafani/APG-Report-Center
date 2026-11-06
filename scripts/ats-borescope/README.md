# ATS Borescope builder: learning from past reports

The builder sorts each borescope photo into the right section of any model's template using what
ATS's own past reports did with that component (`src/atsBorescope/lib/docx/componentKnowledge.json`).
To refresh that knowledge as new reports come in (all read-only on T:):

```bash
node scripts/ats-borescope/inventory-reports.js "T:\!Jobs!\Working Jobs\400000 (ATS)" reports.tsv
node scripts/ats-borescope/harvest-reports.mjs reports.tsv reports.jsonl 4
node scripts/ats-borescope/build-knowledge.mjs reports.jsonl src/atsBorescope/lib/docx/componentKnowledge.json models.json
```

- `inventory-reports.js` lists every file in each ATS job's `7 Reports` folder.
- `harvest-reports.mjs` opens each report (the emailed `.msg` files' PDF attachments, or PDFs) and
  records the model, section headings, and each photo caption's Component / Location /
  Observation and section. It's resumable: rerun it and it skips reports already done.
- `build-knowledge.mjs` writes the component knowledge and prints a per-model summary.

Keep `sectionKind()` in `build-knowledge.mjs` the same as in `src/atsBorescope/lib/docx/sectionKinds.ts`.
