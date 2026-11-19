import { promises as fs } from "fs";
import path from "path";
import { toLongPath } from "../util/longPath";

export interface JobFile {
  absolutePath: string;
  /** Relative to the job folder root, using forward slashes. */
  relativePath: string;
  baseName: string;
  ext: string;
  /** Relative parent folder path, forward slashes, e.g. "7 Reports/7A Inspection Report". */
  folderPath: string;
}

const SKIP_FILE_NAMES = new Set(["thumbs.db", "desktop.ini"]);
const SKIP_EXTENSIONS = new Set([".lnk", ".msg", ".db", ".ini"]);

/**
 * Every file in a job folder, in folder order. Sub-folders are read in parallel -- on the network
 * drive one folder at a time was 5.5 s for a 1,164-file job (20564) -- and the results are put back
 * in the same order a one-at-a-time walk would give, so nothing that picks "the first match"
 * changes. Reads go through the extended-length path form (toLongPath): a job's own path plus a
 * nested photo or sheet name routinely passes Windows' 260-character limit, and a too-long folder
 * used to be skipped without a word.
 */
export async function walkJobFolder(jobRoot: string): Promise<JobFile[]> {
  async function walk(dir: string): Promise<JobFile[]> {
    let entries;
    try {
      entries = await fs.readdir(toLongPath(dir), { withFileTypes: true });
    } catch {
      return []; // permission errors etc. -- skip rather than fail the whole scan
    }
    const parts = await Promise.all(
      entries.map(async (entry): Promise<JobFile[]> => {
        const absolutePath = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(absolutePath);
        if (!entry.isFile()) {
          // Some network/cloud-synced drives (OneDrive placeholders, certain mapped/network
          // shares) report every plain file's dirent as a symlink rather than a regular file,
          // so entry.isFile() alone silently drops the entire job folder's contents. Fall back
          // to a real stat() (which follows the reparse point/symlink to what it actually is)
          // before giving up on it.
          const stat = await fs.stat(toLongPath(absolutePath)).catch(() => null);
          if (!stat) return []; // broken link, permission error, etc.
          if (stat.isDirectory()) return walk(absolutePath);
          if (!stat.isFile()) return [];
        }
        const lowerName = entry.name.toLowerCase();
        if (SKIP_FILE_NAMES.has(lowerName)) return [];
        // Office's own lock files ("~$INCOMING UT LE.xlsx") left next to a workbook someone has
        // open -- not real files, and they'd otherwise match the same name patterns as the real one.
        if (lowerName.startsWith("~$")) return [];
        const ext = path.extname(entry.name).toLowerCase();
        if (SKIP_EXTENSIONS.has(ext)) return [];

        const relativePath = path.relative(jobRoot, absolutePath).split(path.sep).join("/");
        const folderPath = path.dirname(relativePath) === "." ? "" : path.dirname(relativePath).split(path.sep).join("/");
        return [{ absolutePath, relativePath, baseName: entry.name, ext, folderPath }];
      }),
    );
    return parts.flat();
  }

  return walk(jobRoot);
}
