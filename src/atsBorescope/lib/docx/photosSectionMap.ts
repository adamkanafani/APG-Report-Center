/**
 * A Photos subsection, named exactly by its Heading2 text in the template -- e.g. "Compressor
 * Section", "Combustion Section Hot Side", "Number One Bearing Area". Any text: the two GE
 * families (templateFamilies.ts) use a fixed set, and every other model's template (501D5A, 501F,
 * W251, Frame 6, LM6000, ...) brings its own headings, read straight from the template by
 * genericFamily.ts.
 */
export type PhotosSection = string;
