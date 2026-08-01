import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import "@testing-library/jest-dom/vitest";

// Saved settings persist to disk, so point the suite at a scratch folder rather
// than overwriting the character prompt and reference images of whoever is
// running the tests.
process.env.DATA_ROOT ??= fs.mkdtempSync(path.join(os.tmpdir(), "easy-media-test-"));