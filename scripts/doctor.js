const { execSync } = require("node:child_process");

const checks = [];

function runCheck(name, fn) {
  try {
    const message = fn();
    checks.push({ name, ok: true, message });
  } catch (error) {
    checks.push({ name, ok: false, message: error.message });
  }
}

function cmd(command) {
  return execSync(command, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

runCheck("Node.js", () => {
  const version = process.version;
  const major = Number(version.replace("v", "").split(".")[0]);
  if (major < 20) throw new Error(`requires Node >= 20, found ${version}`);
  return `ok (${version})`;
});

runCheck("npm", () => {
  const version = cmd("npm --version");
  return `ok (${version})`;
});

runCheck("git", () => {
  const version = cmd("git --version");
  return `ok (${version})`;
});

runCheck("hardhat", () => {
  const version = cmd("npx hardhat --version");
  return `ok (${version})`;
});

console.log("Environment check:");
for (const result of checks) {
  const mark = result.ok ? "[ok]" : "[fail]";
  console.log(`${mark} ${result.name}: ${result.message}`);
}

if (checks.some((c) => !c.ok)) {
  process.exit(1);
}
