// Deterministic fake data shared by the file-management redesign prototypes. Unlike
// src/lib/mockUpload.ts's random generator, everything here is fixed so stories render
// identically on every visit (and in visual snapshots).
import type { DroppedFile } from "../../src/lib/fileTree";

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

/** Fake `File` reporting `size` bytes without allocating content (same trick as mockUpload.ts). */
export function makeMockFile(name: string, size: number): File {
  const file = new File([], name);
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

/** Name of the base folder the user is imagined to have picked. */
export const FIXTURE_FOLDER_NAME = "smith-lab-foraging-2025";

// [relativePath (inside the picked folder), filename, size]
const LOCAL_SPEC: [string, string, number][] = [
  ["", "dataset_description.json", 2 * KB],
  ["", "notes.txt", 14 * KB],
  ["sub-01/ses-20250110/videos", "camera-top.mp4", 48 * GB],
  ["sub-01/ses-20250110/videos", "camera-side.mp4", 45 * GB],
  ["sub-01/ses-20250110/audio", "mic-array.wav", 3 * GB + 200 * MB],
  ["sub-01/ses-20250110", "events.csv", 240 * KB],
  ["sub-01/ses-20250117/videos", "camera-top.mp4", 52 * GB],
  ["sub-01/ses-20250117/videos", "camera-side.mp4", 49 * GB],
  ["sub-01/ses-20250117/audio", "mic-array.wav", 3 * GB + 412 * MB],
  ["sub-01/ses-20250117", "events.csv", 198 * KB],
  ["sub-02/ses-20250112/videos", "camera-top.mp4", 51 * GB],
  ["sub-02/ses-20250112/videos", "camera-side.mp4", 47 * GB],
  ["sub-02/ses-20250112", "events.csv", 233 * KB],
  ["scratch", "preview-render.tmp", 900 * MB],
  ["scratch", "align-debug.log", 4 * MB],
];

/** The contents of the picked base folder, as the dropzone would hand them over. */
export function localFolderFixture(): DroppedFile[] {
  return LOCAL_SPEC.map(([relativePath, name, size]) => ({
    file: makeMockFile(name, size),
    relativePath,
  }));
}

export interface RemoteFile {
  /** Path relative to sourcedata/raw/, forward-slash joined, including the filename. */
  path: string;
  size: number;
}

/**
 * What the archive already holds under sourcedata/raw/: the first sub-01 session plus the
 * top-level metadata file, with one file (camera-side.mp4) whose size no longer matches the
 * local copy so the "Changed" state has something to show.
 */
export function remoteListingFixture(): RemoteFile[] {
  return [
    { path: "dataset_description.json", size: 2 * KB },
    { path: "sub-01/ses-20250110/videos/camera-top.mp4", size: 48 * GB },
    { path: "sub-01/ses-20250110/videos/camera-side.mp4", size: 44 * GB },
    { path: "sub-01/ses-20250110/audio/mic-array.wav", size: 3 * GB + 200 * MB },
    { path: "sub-01/ses-20250110/events.csv", size: 240 * KB },
  ];
}

export function remoteListingAsMap(listing: RemoteFile[]): Map<string, number> {
  return new Map(listing.map((f) => [f.path, f.size]));
}
