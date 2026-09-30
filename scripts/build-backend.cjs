const { existsSync, rmSync } = require("fs");
const { join } = require("path");
const { spawnSync } = require("child_process");

const rootDir = join(__dirname, "..");
const distPath = join(rootDir, "build", "backend");
const workPath = join(rootDir, "build", "pyinstaller-work");
const entryPath = join(rootDir, "backend", "app.py");
const pythonCandidates = process.env.PYTHON ? [process.env.PYTHON] : ["python", "py", "python3"];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });

  return result.status === 0;
}

function pythonArgs(pythonCommand, args) {
  return pythonCommand === "py" ? ["-3", ...args] : args;
}

function findPython() {
  for (const candidate of pythonCandidates) {
    const args = pythonArgs(candidate, ["--version"]);

    if (run(candidate, args)) {
      return candidate;
    }
  }

  return null;
}

const pythonCommand = findPython();

if (!pythonCommand) {
  console.error("Python was not found. Install Python 3, then run `npm run dist` again.");
  process.exit(1);
}

if (existsSync(distPath)) {
  rmSync(distPath, { recursive: true, force: true });
}

if (existsSync(workPath)) {
  rmSync(workPath, { recursive: true, force: true });
}

if (!run(pythonCommand, pythonArgs(pythonCommand, ["-m", "PyInstaller", "--version"]))) {
  console.error("PyInstaller could not run. Install it with `python -m pip install pyinstaller`.");
  console.error("If PyInstaller reports enum34 is incompatible, run `python -m pip uninstall enum34`.");
  process.exit(1);
}

const pyinstallerArgs = pythonArgs(pythonCommand, [
  "-m",
  "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onedir",
  "--name",
  "airleakage-backend",
  "--distpath",
  distPath,
  "--workpath",
  workPath,
  "--specpath",
  join(rootDir, "build"),
  entryPath,
]);

if (!run(pythonCommand, pyinstallerArgs)) {
  process.exit(1);
}
