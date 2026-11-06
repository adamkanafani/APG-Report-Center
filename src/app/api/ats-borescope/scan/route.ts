import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { loadDocx } from "@/atsBorescope/lib/docx/zip";
import { parseRawMdiPhotoUnits } from "@/atsBorescope/lib/docx/rawMdiParser";
import type { PhotosSection } from "@/atsBorescope/lib/docx/photosSectionMap";
import { familyForTemplate, resolveClassify, resolvePhotosSubsections } from "@/atsBorescope/lib/docx/templateFamilies";
import { findPhotosHeading } from "@/atsBorescope/lib/docx/xmlTextUtils";
import { createSession } from "@/atsBorescope/lib/reviewSession";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const rawPath: string | undefined = body.rawPath;
  const templatePath: string | undefined = body.templatePath;
  if (!rawPath || !templatePath) {
    return NextResponse.json({ error: "rawPath and templatePath are required" }, { status: 400 });
  }

  try {
    const [rawBuffer, templateBuffer] = await Promise.all([fs.readFile(rawPath), fs.readFile(templatePath)]);
    const rawLoaded = await loadDocx(rawBuffer);
    const templateLoaded = await loadDocx(templateBuffer);
    const units = parseRawMdiPhotoUnits(rawLoaded);

    const family = familyForTemplate(templateLoaded.documentXml);
    if (!family) {
      return NextResponse.json(
        { error: "This doesn't look like a blank ATS report template: it has no \"Photos\" section with headings under it. Pick the model's blank Cover Page template." },
        { status: 400 },
      );
    }
    const photosHeading = findPhotosHeading(templateLoaded.documentXml, 0);
    if (!photosHeading) {
      return NextResponse.json({ error: 'Could not find a "Photos" (Heading1) heading in the template.' }, { status: 400 });
    }
    const photosSubsections = resolvePhotosSubsections(family, templateLoaded.documentXml, photosHeading.paragraphStart);
    const classify = resolveClassify(family, new Set(photosSubsections));

    const bySection = Object.fromEntries(photosSubsections.map((name) => [name, 0])) as Record<PhotosSection, number>;
    let unassignedCount = 0;

    const unitSummaries = units.map((unit) => {
      const section = unit.component && unit.imageBytes ? classify(unit.component) : null;
      if (section) bySection[section]++;
      else unassignedCount++;
      return {
        index: unit.index,
        component: unit.component,
        location: unit.location,
        measurements: unit.measurements,
        observation: unit.observation,
        comments: unit.comments,
        filenameCaption: unit.filenameCaption,
        hasImage: !!unit.imageBytes,
        section,
      };
    });

    const sessionId = createSession(templateLoaded, units);

    return NextResponse.json({
      sessionId,
      units: unitSummaries,
      bySection,
      unassignedCount,
      photosSubsections,
    });
  } catch (err) {
    console.error("scan failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Scan failed" }, { status: 500 });
  }
}
