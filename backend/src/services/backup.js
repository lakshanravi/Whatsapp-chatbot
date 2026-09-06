const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { pipeline } = require("stream/promises");
const { ZipArchive } = require("archiver");
const unzipper = require("unzipper");
const mongoose = require("mongoose");
const { EJSON } = require("bson");

const config = require("../config");
const ragClient = require("./ragClient");

const FORMAT = "rag-system-portable-backup";
const VERSION = 2;
const MAX_ENTRIES = 100000;
const MAX_UNCOMPRESSED_BYTES = Number(process.env.BACKUP_MAX_UNCOMPRESSED_BYTES || 10 * 1024 ** 3);

function safeArchivePath(name) {
  const normalized = String(name || "").replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts.join("/");
}

async function writeCollection(filePath, collection) {
  const output = fs.createWriteStream(filePath, { encoding: "utf8" });
  let count = 0;
  for await (const record of collection.find({})) {
    if (!output.write(`${EJSON.stringify(record, { relaxed: false })}\n`)) {
      await new Promise((resolve) => output.once("drain", resolve));
    }
    count += 1;
  }
  output.end();
  await new Promise((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);
  });
  return count;
}

async function createBackup(res) {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "rag-backup-"));
  try {
    console.log("[backup] Creating Chroma index snapshot");
    const databaseDir = path.join(tempDir, "database");
    await fsp.mkdir(databaseDir);
    const indexBackupPath = path.join(tempDir, "chroma-index.zip");
    await ragClient.downloadIndexBackup(indexBackupPath);
    console.log("[backup] Chroma index snapshot ready");
    const collections = await mongoose.connection.db
      .listCollections({}, { nameOnly: true })
      .toArray();
    const manifestCollections = [];

    for (const { name } of collections.filter(({ name }) => !name.startsWith("system.")).sort((a, b) => a.name.localeCompare(b.name))) {
      const count = await writeCollection(
        path.join(databaseDir, `${name}.ndjson`),
        mongoose.connection.db.collection(name)
      );
      manifestCollections.push({ name, count, file: `database/${name}.ndjson` });
    }

    const manifest = {
      format: FORMAT,
      version: VERSION,
      createdAt: new Date().toISOString(),
      database: mongoose.connection.db.databaseName,
      collections: manifestCollections,
      indexStrategy: "physical-chroma-copy",
      chromaIndexFile: "chroma-index.zip",
    };
    await fsp.writeFile(path.join(tempDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    console.log("[backup] MongoDB export ready; streaming ZIP to client");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.attachment(`rag-system-backup-${timestamp}.zip`);
    res.type("application/zip");
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("warning", (error) => {
      if (error.code !== "ENOENT") res.destroy(error);
    });
    archive.on("error", (error) => res.destroy(error));
    archive.pipe(res);
    archive.file(path.join(tempDir, "manifest.json"), { name: "manifest.json" });
    archive.file(indexBackupPath, { name: "chroma-index.zip" });
    archive.directory(databaseDir, "database");
    if (fs.existsSync(config.uploadDir)) archive.directory(config.uploadDir, "uploads");
    await archive.finalize();
    console.log("[backup] ZIP stream completed");
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

async function extractAndValidate(zipPath, destination) {
  const archive = await unzipper.Open.file(zipPath);
  let totalSize = 0;
  if (archive.files.length > MAX_ENTRIES) throw new Error("Backup contains too many files");

  for (const entry of archive.files) {
    const safeName = safeArchivePath(entry.path.replace(/\/$/, ""));
    if (entry.type === "Directory" && !entry.path.replace(/\/$/, "")) continue;
    if (!safeName) throw new Error(`Unsafe path in backup: ${entry.path}`);
    totalSize += Number(entry.uncompressedSize || 0);
    if (totalSize > MAX_UNCOMPRESSED_BYTES) throw new Error("Expanded backup is too large");
    const target = path.join(destination, ...safeName.split("/"));
    if (entry.type === "Directory") {
      await fsp.mkdir(target, { recursive: true });
    } else {
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await pipeline(entry.stream(), fs.createWriteStream(target, { flags: "wx" }));
    }
  }

  const manifestPath = path.join(destination, "manifest.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  if (manifest.format !== FORMAT || manifest.version !== VERSION || !Array.isArray(manifest.collections)) {
    throw new Error("This is not a supported RAG System backup");
  }
  if (manifest.indexStrategy !== "physical-chroma-copy" || manifest.chromaIndexFile !== "chroma-index.zip") {
    throw new Error("Backup does not contain a directly restorable Chroma index");
  }
  await fsp.access(path.join(destination, "chroma-index.zip"));
  for (const item of manifest.collections) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(item.name) || safeArchivePath(item.file) !== item.file) {
      throw new Error("Backup manifest contains an invalid collection");
    }
    await fsp.access(path.join(destination, ...item.file.split("/")));
  }
  return manifest;
}

async function forEachRecord(filePath, callback) {
  const input = fs.createReadStream(filePath, "utf8");
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let count = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    await callback(EJSON.parse(line), count);
    count += 1;
  }
  return count;
}

async function validateCollection(filePath, expectedCount) {
  const count = await forEachRecord(filePath, async () => {});
  if (count !== expectedCount) throw new Error("Backup collection is incomplete");
}

async function replaceCollection(collection, filePath) {
  await collection.deleteMany({});
  let batch = [];
  await forEachRecord(filePath, async (record) => {
    batch.push(record);
    if (batch.length === 1000) {
      await collection.insertMany(batch, { ordered: true });
      batch = [];
    }
  });
  if (batch.length) await collection.insertMany(batch, { ordered: true });
}

async function emptyDirectory(directory) {
  await fsp.mkdir(directory, { recursive: true });
  const entries = await fsp.readdir(directory);
  await Promise.all(
    entries.map((entry) => fsp.rm(path.join(directory, entry), { recursive: true, force: true }))
  );
}

async function restoreBackup(zipPath) {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "rag-restore-"));
  try {
    const manifest = await extractAndValidate(zipPath, tempDir);
    for (const item of manifest.collections) {
      try {
        await validateCollection(path.join(tempDir, ...item.file.split("/")), item.count);
      } catch (error) {
        throw new Error(`Collection ${item.name} is invalid: ${error.message}`);
      }
    }

    const backupCollectionNames = new Set(manifest.collections.map((item) => item.name));
    const currentCollections = await mongoose.connection.db
      .listCollections({}, { nameOnly: true })
      .toArray();
    for (const { name } of currentCollections) {
      if (!name.startsWith("system.") && !backupCollectionNames.has(name)) {
        await mongoose.connection.db.collection(name).deleteMany({});
      }
    }
    for (const item of manifest.collections) {
      const collection = mongoose.connection.db.collection(item.name);
      await replaceCollection(collection, path.join(tempDir, ...item.file.split("/")));
    }

    const restoredUploads = path.join(tempDir, "uploads");
    // The upload directory is commonly a Docker volume mount point. Removing
    // the mount itself fails with EBUSY, so clear only its children.
    await emptyDirectory(config.uploadDir);
    if (fs.existsSync(restoredUploads)) {
      await fsp.cp(restoredUploads, config.uploadDir, { recursive: true, force: true });
    }
    await ragClient.restoreIndexBackup(path.join(tempDir, "chroma-index.zip"));
    return manifest;
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
    await fsp.rm(zipPath, { force: true });
  }
}

module.exports = {
  createBackup,
  restoreBackup,
  safeArchivePath,
  emptyDirectory,
};
