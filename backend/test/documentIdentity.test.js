const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { documentKey, hashFile } = require("../src/services/documentIdentity");

test("copy and version suffixes resolve to the same document family", () => {
  assert.equal(documentKey("manuals/IC1230150.pdf"), "manuals/ic1230150");
  assert.equal(documentKey("manuals/IC1230150 (1).pdf"), "manuals/ic1230150");
  assert.equal(documentKey("manuals/IC1230150_copy_2.pdf"), "manuals/ic1230150");
  assert.equal(documentKey("manuals/IC1230150_v2.pdf"), "manuals/ic1230150");
});

test("different model suffixes remain different document families", () => {
  assert.notEqual(documentKey("IC121040.pdf"), documentKey("IC121040I.pdf"));
});

test("same generic filename in different folders remains distinct", () => {
  assert.notEqual(
    documentKey("controllers/manual.pdf"),
    documentKey("inverters/manual.pdf")
  );
});

test("duplicate identity depends on file content, not filename", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "document-hash-test-"));
  const first = path.join(directory, "manual.pdf");
  const renamedCopy = path.join(directory, "manual-copy.pdf");
  const sameNameDifferentFolder = path.join(directory, "other", "manual.pdf");
  await fs.mkdir(path.dirname(sameNameDifferentFolder));
  await fs.writeFile(first, "first PDF content");
  await fs.writeFile(renamedCopy, "first PDF content");
  await fs.writeFile(sameNameDifferentFolder, "different PDF content");

  assert.equal(await hashFile(first), await hashFile(renamedCopy));
  assert.notEqual(await hashFile(first), await hashFile(sameNameDifferentFolder));
  await fs.rm(directory, { recursive: true, force: true });
});
