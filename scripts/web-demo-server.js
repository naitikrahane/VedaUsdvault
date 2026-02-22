const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");

const { ethers, network } = hre;

const rootDir = path.join(__dirname, "..", "website");
const port = Number(process.env.PORT || 4173);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const WITHDRAW_DELAY_SECONDS = 3 * 24 * 60 * 60;
let ctx = null;

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

function safePath(urlPath) {
  const cleaned = urlPath.split("?")[0].split("#")[0];
  const target = cleaned === "/" ? "/index.html" : cleaned;
  const resolved = path.normalize(path.join(rootDir, target));
  if (!resolved.startsWith(rootDir)) return null;
  return resolved;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk.toString();
      if (data.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON payload"));
      }
    });
    req.on("error", reject);
  });
}

function ensureCtx() {
  if (!ctx) throw new Error("Demo not initialized. Click 'Init / Create Vault' first.");
  return ctx;
}

function units(v) {
  return ethers.parseUnits(String(v), 18);
}

function format(v) {
  return ethers.formatUnits(v, 18);
}

async function snapshot() {
  if (!ctx) {
    return { initialized: false };
  }

  const managerAuthorized = await ctx.authority.isAuthorizedManager(ctx.manager.address);
  const nextRequestId = await ctx.teller.nextRequestId();

  let request1 = null;
  if (nextRequestId >= 1n) {
    const r = await ctx.teller.withdrawRequests(1);
    request1 = {
      owner: r.owner,
      shares: format(r.shares),
      unlockTimestamp: Number(r.unlockTimestamp),
      handled: r.handled
    };
  }

  return {
    initialized: true,
    actors: {
      deployer: ctx.deployer.address,
      alice: ctx.alice.address,
      manager: ctx.manager.address,
      receiver: ctx.receiver.address
    },
    contracts: {
      usde: ctx.usde.target,
      authority: ctx.authority.target,
      registry: ctx.registry.target,
      vault: ctx.vault.target,
      teller: ctx.teller.target,
      strategy: ctx.strategy.target
    },
    managerAuthorized,
    nextRequestId: Number(nextRequestId),
    balances: {
      aliceUsde: format(await ctx.usde.balanceOf(ctx.alice.address)),
      aliceShares: format(await ctx.vault.balanceOf(ctx.alice.address)),
      vaultUsde: format(await ctx.usde.balanceOf(ctx.vault.target)),
      tellerShares: format(await ctx.vault.balanceOf(ctx.teller.target)),
      receiverUsde: format(await ctx.usde.balanceOf(ctx.receiver.address))
    },
    request1
  };
}

async function initDemo() {
  await network.provider.send("hardhat_reset");

  const [deployer, alice, , manager, receiver] = await ethers.getSigners();

  const MockUSDe = await ethers.getContractFactory("MockUSDe");
  const usde = await MockUSDe.deploy(deployer.address);

  const SimpleManagerAuthority = await ethers.getContractFactory("SimpleManagerAuthority");
  const authority = await SimpleManagerAuthority.deploy(deployer.address);

  const ManagerRegistry = await ethers.getContractFactory("ManagerRegistry");
  const registry = await ManagerRegistry.deploy(deployer.address, authority.target);

  const USDeBoringVault = await ethers.getContractFactory("USDeBoringVault");
  const vault = await USDeBoringVault.deploy(
    deployer.address,
    usde.target,
    registry.target,
    "Veda USDe Vault Share",
    "vUSDe"
  );

  const TellerWith3DayQueue = await ethers.getContractFactory("TellerWith3DayQueue");
  const teller = await TellerWith3DayQueue.deploy(vault.target);
  await (await vault.setTeller(teller.target)).wait();

  const MockStrategyTarget = await ethers.getContractFactory("MockStrategyTarget");
  const strategy = await MockStrategyTarget.deploy();

  await (await usde.mint(alice.address, units(1000))).wait();

  ctx = {
    deployer,
    alice,
    manager,
    receiver,
    usde,
    authority,
    registry,
    vault,
    teller,
    strategy
  };

  return {
    message: "Vault stack deployed and Alice funded with 1000 USDe.",
    state: await snapshot()
  };
}

async function doDeposit(body) {
  const c = ensureCtx();
  const amount = units(body.amount || 100);
  await (await c.usde.connect(c.alice).approve(c.teller.target, amount)).wait();
  await (await c.teller.connect(c.alice).deposit(amount, c.alice.address)).wait();
  return {
    message: `Alice deposited ${format(amount)} USDe.`,
    state: await snapshot()
  };
}

async function enableManager() {
  const c = ensureCtx();
  await (await c.authority.setManager(c.manager.address, true)).wait();
  return {
    message: "Manager enabled in external authority.",
    state: await snapshot()
  };
}

async function managerTransfer(body) {
  const c = ensureCtx();
  const amount = units(body.amount || 10);
  const callData = c.usde.interface.encodeFunctionData("transfer", [c.receiver.address, amount]);
  await (await c.vault.connect(c.manager).managerCall(c.usde.target, 0, callData)).wait();
  return {
    message: `Manager moved ${format(amount)} USDe from vault to receiver via unrestricted managerCall.`,
    state: await snapshot()
  };
}

async function requestWithdraw(body) {
  const c = ensureCtx();
  const shares = units(body.shares || 40);
  await (await c.vault.connect(c.alice).approve(c.teller.target, shares)).wait();
  await (await c.teller.connect(c.alice).requestWithdraw(shares)).wait();
  return {
    message: `Alice queued ${format(shares)} shares for withdrawal (3-day maturity).`,
    state: await snapshot()
  };
}

async function tryClaimEarly() {
  const c = ensureCtx();
  try {
    await c.teller.connect(c.alice).claimWithdraw(1, c.alice.address);
    return {
      message: "Unexpected: early claim succeeded (should fail).",
      state: await snapshot()
    };
  } catch {
    return {
      message: "Expected behavior: early claim reverted before 3-day maturity.",
      state: await snapshot()
    };
  }
}

async function advanceTime() {
  ensureCtx();
  await network.provider.send("evm_increaseTime", [WITHDRAW_DELAY_SECONDS]);
  await network.provider.send("evm_mine");
  return {
    message: "Advanced chain time by 3 days.",
    state: await snapshot()
  };
}

async function claimWithdraw() {
  const c = ensureCtx();
  await (await c.teller.connect(c.alice).claimWithdraw(1, c.alice.address)).wait();
  return {
    message: "Mature withdrawal claimed successfully.",
    state: await snapshot()
  };
}

async function revokeManager() {
  const c = ensureCtx();
  await (await c.authority.setManager(c.manager.address, false)).wait();
  return {
    message: "Manager revoked in external authority.",
    state: await snapshot()
  };
}

async function tryManagerAfterRevoke() {
  const c = ensureCtx();
  const callData = c.strategy.interface.encodeFunctionData("setValue", [999]);
  try {
    await c.vault.connect(c.manager).managerCall(c.strategy.target, 0, callData);
    return {
      message: "Unexpected: revoked manager call succeeded (should fail).",
      state: await snapshot()
    };
  } catch {
    return {
      message: "Expected behavior: revoked manager call reverted.",
      state: await snapshot()
    };
  }
}

async function runFullFlow() {
  const steps = [];
  steps.push((await initDemo()).message);
  steps.push((await doDeposit({ amount: 100 })).message);
  steps.push((await enableManager()).message);
  steps.push((await managerTransfer({ amount: 10 })).message);
  steps.push((await requestWithdraw({ shares: 40 })).message);
  steps.push((await tryClaimEarly()).message);
  steps.push((await advanceTime()).message);
  steps.push((await claimWithdraw()).message);
  steps.push((await revokeManager()).message);
  steps.push((await tryManagerAfterRevoke()).message);
  return {
    message: "Full quest flow completed.",
    steps,
    state: await snapshot()
  };
}

const routes = {
  "POST /api/init": () => initDemo(),
  "GET /api/state": () => snapshot(),
  "POST /api/deposit": (body) => doDeposit(body),
  "POST /api/enable-manager": () => enableManager(),
  "POST /api/manager-transfer": (body) => managerTransfer(body),
  "POST /api/request-withdraw": (body) => requestWithdraw(body),
  "POST /api/claim-early": () => tryClaimEarly(),
  "POST /api/advance-3days": () => advanceTime(),
  "POST /api/claim-withdraw": () => claimWithdraw(),
  "POST /api/revoke-manager": () => revokeManager(),
  "POST /api/manager-after-revoke": () => tryManagerAfterRevoke(),
  "POST /api/run-full": () => runFullFlow()
};

const server = http.createServer(async (req, res) => {
  try {
    const method = req.method || "GET";
    const reqUrl = req.url || "/";

    const routeKey = `${method} ${reqUrl.split("?")[0]}`;
    const handler = routes[routeKey];

    if (handler) {
      const body = method === "POST" ? await parseBody(req) : {};
      const data = await handler(body);
      return json(res, 200, { ok: true, data });
    }

    if (method !== "GET") {
      return json(res, 404, { ok: false, error: "Route not found" });
    }

    const filePath = safePath(reqUrl);
    if (!filePath) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad request");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
      res.end(data);
    });
  } catch (error) {
    json(res, 400, { ok: false, error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Interactive demo website running at http://localhost:${port}`);
  console.log("Use the UI buttons to create vault and run the full quest flow.");
});
