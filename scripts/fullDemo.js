const assert = require("node:assert/strict");
const hre = require("hardhat");

const THREE_DAYS = 3 * 24 * 60 * 60;

async function expectRevert(txPromise, label) {
  let reverted = false;
  try {
    const tx = await txPromise;
    await tx.wait();
  } catch (error) {
    reverted = true;
    console.log(`[ok] ${label}`);
  }
  assert.equal(reverted, true, `${label}: expected transaction to revert`);
}

async function main() {
  const { ethers, network } = hre;
  const [deployer, alice, manager, receiver] = await ethers.getSigners();

  console.log("== Deploying contracts ==");
  console.log(`deployer: ${deployer.address}`);
  console.log(`alice:    ${alice.address}`);
  console.log(`manager:  ${manager.address}`);
  console.log(`receiver: ${receiver.address}`);

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

  console.log("== Mint + deposit ==");
  await (await usde.mint(alice.address, ethers.parseUnits("1000", 18))).wait();
  await (await usde.connect(alice).approve(teller.target, ethers.parseUnits("100", 18))).wait();
  await (await teller.connect(alice).deposit(ethers.parseUnits("100", 18), alice.address)).wait();

  assert.equal(await vault.balanceOf(alice.address), ethers.parseUnits("100", 18));
  assert.equal(await usde.balanceOf(vault.target), ethers.parseUnits("100", 18));
  console.log("[ok] Alice deposited 100 USDe and received 100 shares");

  console.log("== Manager authorization checks ==");
  const transfer10Call = usde.interface.encodeFunctionData("transfer", [
    receiver.address,
    ethers.parseUnits("10", 18)
  ]);

  await expectRevert(
    vault.connect(manager).managerCall(usde.target, 0, transfer10Call),
    "Unauthorized manager cannot call vault"
  );

  await (await authority.setManager(manager.address, true)).wait();
  await (await vault.connect(manager).managerCall(usde.target, 0, transfer10Call)).wait();
  assert.equal(await usde.balanceOf(receiver.address), ethers.parseUnits("10", 18));
  console.log("[ok] Authorized manager executed unrestricted USDe transfer from vault");

  const setStrategyValue = strategy.interface.encodeFunctionData("setValue", [777]);
  await (await vault.connect(manager).managerCall(strategy.target, 0, setStrategyValue)).wait();
  assert.equal(await strategy.value(), 777n);
  console.log("[ok] Authorized manager executed arbitrary strategy call");

  console.log("== 3-day withdraw queue ==");
  await (await vault.connect(alice).approve(teller.target, ethers.parseUnits("40", 18))).wait();
  await (await teller.connect(alice).requestWithdraw(ethers.parseUnits("40", 18))).wait();
  assert.equal(await teller.nextRequestId(), 1n);

  await expectRevert(
    teller.connect(alice).claimWithdraw(1, alice.address),
    "Cannot claim before 3-day queue maturity"
  );

  await network.provider.send("evm_increaseTime", [THREE_DAYS]);
  await network.provider.send("evm_mine");

  await (await teller.connect(alice).claimWithdraw(1, alice.address)).wait();
  assert.equal(await vault.balanceOf(alice.address), ethers.parseUnits("60", 18));
  assert.equal(await usde.balanceOf(alice.address), ethers.parseUnits("936", 18));
  console.log("[ok] Matured queue claimed; shares burned and USDe returned");

  console.log("== Revoke manager ==");
  await (await authority.setManager(manager.address, false)).wait();
  const setStrategyValueAgain = strategy.interface.encodeFunctionData("setValue", [999]);
  await expectRevert(
    vault.connect(manager).managerCall(strategy.target, 0, setStrategyValueAgain),
    "Revoked manager loses access immediately"
  );

  console.log("== Demo complete ==");
  console.log(`Vault USDe balance: ${await usde.balanceOf(vault.target)} wei`);
  console.log(`Alice share balance: ${await vault.balanceOf(alice.address)} wei`);
  console.log(`Alice USDe balance: ${await usde.balanceOf(alice.address)} wei`);
  console.log(`Receiver USDe balance: ${await usde.balanceOf(receiver.address)} wei`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
