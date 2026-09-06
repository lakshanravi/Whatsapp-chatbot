const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { ZipArchive } = require("archiver");

const { emptyDirectory, safeArchivePath } = require("../src/services/backup");

test("safeArchivePath accepts portable backup paths", () => {
  assert.equal(safeArchivePath("database/companies.ndjson"), "database/companies.ndjson");
  assert.equal(safeArchivePath("uploads/company-id/document.pdf"), "uploads/company-id/document.pdf");
  assert.equal(safeArchivePath("uploads\\company-id\\document.pdf"), "uploads/company-id/document.pdf");
});

test("safeArchivePath rejects absolute and traversal paths", () => {
  assert.equal(safeArchivePath("../secret"), null);
  assert.equal(safeArchivePath("uploads/../../secret"), null);
  assert.equal(safeArchivePath("/etc/passwd"), null);
  assert.equal(safeArchivePath("uploads//document.pdf"), null);
  assert.equal(safeArchivePath("uploads/./document.pdf"), null);
});

test("installed Archiver creates a ZIP stream", async () => {
  const archive = new ZipArchive({ zlib: { level: 1 } });
  const chunks = [];
  archive.on("data", (chunk) => chunks.push(chunk));
  const ended = once(archive, "end");
  archive.append("backup-check", { name: "check.txt" });
  await archive.finalize();
  await ended;
  const output = Buffer.concat(chunks);
  assert.equal(output.subarray(0, 2).toString("ascii"), "PK");
  assert.ok(output.length > 20);
});

test("emptyDirectory preserves its root and removes all children", async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "rag-empty-test-"));
  await fsp.mkdir(path.join(directory, "company", "nested"), { recursive: true });
  await fsp.writeFile(path.join(directory, "company", "nested", "document.pdf"), "test");
  await fsp.writeFile(path.join(directory, "root.txt"), "test");

  await emptyDirectory(directory);

  assert.deepEqual(await fsp.readdir(directory), []);
  await fsp.access(directory);
  await fsp.rm(directory, { recursive: true, force: true });
});
