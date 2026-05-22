import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const args = parseArgs(process.argv.slice(2));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const packageJsonPath = join(projectRoot, "package.json");
const manifestPath = join(projectRoot, "public", "manifest.json");
const packageJson = await readJson(packageJsonPath);
const sourceManifest = await readJson(manifestPath);
const version = args.version ?? packageJson.version;
const expectedTag = args.tag ?? `v${version}`;
const zipPath = join(projectRoot, "release", `${packageJson.name}-${version}.zip`);

const checks = [];

try {
  check(packageJson.version === sourceManifest.version, "package.json version matches manifest.json version", {
    packageVersion: packageJson.version,
    manifestVersion: sourceManifest.version
  });
  check(version === packageJson.version, "requested version matches package.json version", {
    requestedVersion: version,
    packageVersion: packageJson.version
  });

  await checkGitStatus();
  await checkGitTag(expectedTag);

  await run(npmCommand, ["test"]);
  await run(npmCommand, ["run", "build"]);
  await run(npmCommand, ["run", "package"]);

  const zip = await readZip(zipPath);
  checkZip(zip, zipPath);

  printSummary();
} catch (error) {
  printSummary();
  console.error(`\nRelease check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

function parseArgs(values) {
  const parsed = {
    allowDirty: false,
    requireTag: false,
    tag: undefined,
    version: undefined
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--allow-dirty") {
      parsed.allowDirty = true;
    } else if (value === "--require-tag") {
      parsed.requireTag = true;
    } else if (value === "--tag") {
      parsed.tag = requireValue(values, (index += 1), "--tag");
    } else if (value === "--version") {
      parsed.version = requireValue(values, (index += 1), "--version");
    } else if (value === "--help" || value === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }

  return parsed;
}

function requireValue(values, index, flag) {
  const value = values[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage: node scripts/release-check.mjs [options]

Options:
  --version <version>   Expected package and manifest version. Defaults to package.json version.
  --tag <tag>           Expected Git tag. Defaults to v<version>.
  --require-tag         Require the expected tag to exist and point at HEAD.
  --allow-dirty         Allow a dirty working tree. Useful while developing this script.
`);
}

async function checkGitStatus() {
  const { stdout } = await capture("git", ["status", "--short"]);
  const dirtyLines = stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !line.startsWith("?? dist/") && !line.startsWith("?? release/"));

  if (args.allowDirty) {
    note(`Working tree dirty check skipped by --allow-dirty (${dirtyLines.length} tracked/unignored line(s)).`);
    return;
  }

  check(dirtyLines.length === 0, "working tree is clean", dirtyLines);
}

async function checkGitTag(tag) {
  const head = (await capture("git", ["rev-parse", "HEAD"])).stdout.trim();
  const tagResult = await capture("git", ["rev-parse", "--verify", `${tag}^{}`], { allowFailure: true });

  if (tagResult.code !== 0) {
    if (args.requireTag) {
      fail(`expected tag exists: ${tag}`);
    }
    note(`Expected tag ${tag} does not exist yet. Re-run with --require-tag after creating the tag if needed.`);
    return;
  }

  const tagCommit = tagResult.stdout.trim();
  if (args.requireTag) {
    check(tagCommit === head, `expected tag ${tag} points at HEAD`, { tagCommit, head });
  } else if (tagCommit !== head) {
    note(`Expected tag ${tag} exists but does not point at HEAD.`);
  } else {
    pass(`expected tag ${tag} points at HEAD`);
  }
}

function checkZip(zip, path) {
  check(zip.entries.has("manifest.json"), "ZIP contains manifest.json at root", relative(projectRoot, path));

  const manifest = JSON.parse(zip.entries.get("manifest.json").toString("utf8"));
  check(manifest.version === version, "packaged manifest version matches expected version", {
    packagedVersion: manifest.version,
    expectedVersion: version
  });

  check(!("devtools_page" in manifest), "packaged manifest does not include devtools_page");
  check(!containsForbiddenHost(manifest), "manifest does not request broad host permissions");
  check(!containsForbiddenPermissions(manifest), "manifest does not request forbidden permissions");
  checkExtensionPageCsp(manifest);

  for (const requiredPath of requiredManifestPaths(manifest)) {
    check(zip.entries.has(requiredPath), `ZIP contains manifest-referenced file: ${requiredPath}`);
  }

  const fileNames = [...zip.entries.keys()];
  check(!fileNames.some((name) => name.endsWith(".map")), "ZIP does not include sourcemaps");
  check(!fileNames.some(isForbiddenZipEntry), "ZIP does not include development-only files", fileNames.filter(isForbiddenZipEntry));
}

function requiredManifestPaths(manifest) {
  const paths = [];

  if (manifest.background?.service_worker) {
    paths.push(manifest.background.service_worker);
  }
  if (manifest.side_panel?.default_path) {
    paths.push(manifest.side_panel.default_path);
  }
  for (const script of manifest.content_scripts ?? []) {
    paths.push(...(script.js ?? []));
    paths.push(...(script.css ?? []));
  }
  for (const iconPath of Object.values(manifest.icons ?? {})) {
    paths.push(iconPath);
  }
  for (const iconPath of Object.values(manifest.action?.default_icon ?? {})) {
    paths.push(iconPath);
  }

  return [...new Set(paths)];
}

function containsForbiddenHost(manifest) {
  const hostPermissions = manifest.host_permissions ?? [];
  const contentScriptMatches = (manifest.content_scripts ?? []).flatMap((script) => script.matches ?? []);
  return [...hostPermissions, ...contentScriptMatches].some((host) => host === "<all_urls>" || host === "*://*/*");
}

function containsForbiddenPermissions(manifest) {
  const forbidden = new Set(["cookies", "debugger", "webRequest", "webRequestBlocking"]);
  return (manifest.permissions ?? []).some((permission) => forbidden.has(permission));
}

function checkExtensionPageCsp(manifest) {
  const csp = manifest.content_security_policy?.extension_pages;
  if (!csp) {
    note("No extension_pages CSP found in manifest.");
    return;
  }

  const scriptSrc = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("script-src"));
  check(Boolean(scriptSrc), "extension_pages CSP defines script-src", csp);
  check(!/https?:\/\//.test(scriptSrc), "extension_pages script-src does not allow remote code", scriptSrc);
}

function isForbiddenZipEntry(name) {
  const normalized = name.replace(/\\/g, "/");
  return (
    normalized.startsWith("node_modules/") ||
    normalized.startsWith("tests/") ||
    normalized.startsWith("src/devtools/") ||
    normalized.startsWith("json_sample/") ||
    normalized.startsWith(".git/") ||
    normalized === "package-lock.json" ||
    normalized === "package.json" ||
    normalized === "vite.config.ts" ||
    normalized === "tsconfig.json" ||
    normalized === "README.md" ||
    normalized === "PRIVACY.md" ||
    normalized === "AGENTS.md"
  );
}

async function readZip(path) {
  const buffer = await readFile(path).catch(() => {
    throw new Error(`${relative(projectRoot, path)} was not found. Run npm run package first.`);
  });
  const entries = new Map();
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory at offset ${offset}.`);
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);
    entries.set(name, readLocalZipEntry(buffer, name, method, compressedSize, localHeaderOffset));
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return { path, entries };
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("Could not find ZIP end of central directory.");
}

function readLocalZipEntry(buffer, name, method, compressedSize, localHeaderOffset) {
  if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error(`Invalid local ZIP header for ${name}.`);
  }
  if (method !== 0) {
    throw new Error(`Unsupported ZIP compression method ${method} for ${name}.`);
  }

  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataOffset = localHeaderOffset + 30 + fileNameLength + extraLength;
  return buffer.subarray(dataOffset, dataOffset + compressedSize);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function run(command, commandArgs) {
  const printable = [command, ...commandArgs].join(" ");
  console.log(`\n$ ${printable}`);
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: projectRoot, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        pass(printable);
        resolve();
      } else {
        reject(new Error(`${printable} exited with code ${code}.`));
      }
    });
  });
}

async function capture(command, commandArgs, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = {
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      };
      if (code === 0 || options.allowFailure) {
        resolve(result);
      } else {
        reject(new Error(`${command} ${commandArgs.join(" ")} failed: ${result.stderr.trim()}`));
      }
    });
  });
}

function check(condition, label, details) {
  if (condition) {
    pass(label);
    return;
  }
  fail(label, details);
}

function pass(label) {
  checks.push({ status: "pass", label });
  console.log(`ok - ${label}`);
}

function fail(label, details) {
  checks.push({ status: "fail", label });
  if (details !== undefined) {
    console.error(JSON.stringify(details, null, 2));
  }
  throw new Error(label);
}

function note(label) {
  checks.push({ status: "note", label });
  console.log(`note - ${label}`);
}

function printSummary() {
  const passed = checks.filter((item) => item.status === "pass").length;
  const notes = checks.filter((item) => item.status === "note").length;
  const failed = checks.filter((item) => item.status === "fail").length;
  const zipName = basename(zipPath);
  console.log(`\nRelease check summary: ${passed} passed, ${notes} note(s), ${failed} failed`);
  console.log(`Version: ${version}`);
  console.log(`Expected ZIP: release/${zipName}`);
}
