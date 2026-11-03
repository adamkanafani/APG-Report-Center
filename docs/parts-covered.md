# Parts this app reports on

**Source:** confirmed with Elmer Gomez (11/2026) and a survey of T: jobs 20000–20999, counting reports with Adan's, Elmer's or Alfredo's name on the deck.
**Recognition:** each job's part is read from its folder name (`productKeyFor` in `src/lib/draft/priorReport.ts`). The part, model and row decide which earlier report it learns from:
- the summary and recommendations wording
- cover labels
- divider titles
- photo page titles

| Part | Recognized from | Who | Jobs (2 yrs) | Deck code |
|---|---|---|---|---|
| Compressor diaphragms | "COMPRESSOR DIAPHRAGM", by row (1–19) | Elmer, Adan | ~46 | `Row 7 CD` |
| Blade rings | "ROW n BLADE RING" (also DISASSEMBLY / ASSEMBLY / VANE SWAP) | Elmer, Adan | ~25 | `R2BR` |
| Blade ring segments | "BLADE RING SEGMENTS" (W501D5A) | Elmer, Adan | 5 | `R4BR Segments` |
| Compressor blade rings | "NUM. 1" / "NUMB. 2" / "#3 COMPRESSOR BLADE RING" | Elmer, Adan | 11 | `#3 Compressor Blade Ring` |
| Vanes, vane carriers | "ROW n VANES", "VANE CARRIER" | Elmer, Adan | ~20 | `R3V`, `R1V Carrier Segments` |
| Air seals = inner stage seal housings | "AIR SEAL", "INNER STAGE SEAL HOUSING", "ISSH" (the same component, per Elmer) | Elmer, Adan | ~14 | `R2 ISSH` |
| ISOs / isolation segments | "ISOS", "ISOLATION SEGMENTS" (Repair Report only; no I&A) | Elmer, Adan | 5 | `R2BR Iso's` |
| Nozzles, inner support rings | "1ST STAGE NOZZLE", "SUPPORT RING" | Alfredo | ~46 | `S1N`, `INSR` |
| Anything else | the part's own words from the folder name | mostly Adan | ~12 | the part's name |

## Notes

- **Scope words don't change the part.** DISASSEMBLY, ASSEMBLY, VANE SWAP, "ISOS FROM 20479" and the like are ignored. "(VANE SWAP)" on a blade ring job doesn't make it a vane job.
- **No model in the folder name** (e.g. "CALPINE BT-GT4 ROW 1 ISOS"): the job still matches earlier jobs of the same part and row, on any model.
- **Parts with no I&A** (ISOs): the Final drafts from the last same-part Repair Report, whose Repair Summary is already in past tense.
- **Not this team's:** fuel / pilot nozzles, parts sales and combustion liners. These stay out of drafting; liners belong to another team.
- **Photo page titles:**
  - **Default:** taken from the shop's photo folders, e.g. "NDT Photos (Blade Ring)", "(Downstream ISOS)", "(Seal Holder)". A folder named after the component's code ("CM2") is just "NDT Photos".
  - **Learned:** then replaced by the author's own title from their last same-part report, e.g. "Shipping" instead of "Shipping Photos".
  - **In-process:** 3B photos are grouped as "In-Process Photos".
