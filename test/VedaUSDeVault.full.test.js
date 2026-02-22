const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("Veda USDe Vault full flow", function () {
  const THREE_DAYS = 3 * 24 * 60 * 60;

  let deployer;
  let alice;
  let bob;
  let managerA;
  let managerB;
  let receiver;

  let usde;
  let authority;
  let registry;
  let vault;
  let teller;
  let strategy;

  beforeEach(async function () {
    [deployer, alice, bob, managerA, managerB, receiver] = await ethers.getSigners();

    const MockUSDe = await ethers.getContractFactory("MockUSDe");
    usde = await MockUSDe.deploy(deployer.address);

    const SimpleManagerAuthority = await ethers.getContractFactory("SimpleManagerAuthority");
    authority = await SimpleManagerAuthority.deploy(deployer.address);

    const ManagerRegistry = await ethers.getContractFactory("ManagerRegistry");
    registry = await ManagerRegistry.deploy(deployer.address, authority.target);

    const USDeBoringVault = await ethers.getContractFactory("USDeBoringVault");
    vault = await USDeBoringVault.deploy(
      deployer.address,
      usde.target,
      registry.target,
      "Veda USDe Vault Share",
      "vUSDe"
    );

    const TellerWith3DayQueue = await ethers.getContractFactory("TellerWith3DayQueue");
    teller = await TellerWith3DayQueue.deploy(vault.target);
    await vault.setTeller(teller.target);

    const MockStrategyTarget = await ethers.getContractFactory("MockStrategyTarget");
    strategy = await MockStrategyTarget.deploy();

    await usde.mint(alice.address, ethers.parseUnits("1000", 18));
    await usde.mint(bob.address, ethers.parseUnits("1000", 18));
  });

  it("runs complete lifecycle: deposit, manager action, 3-day queue claim, manager revoke", async function () {
    const depositAssets = ethers.parseUnits("100", 18);
    const withdrawShares = ethers.parseUnits("40", 18);

    await usde.connect(alice).approve(teller.target, depositAssets);
    await teller.connect(alice).deposit(depositAssets, alice.address);

    expect(await vault.balanceOf(alice.address)).to.equal(depositAssets);
    expect(await usde.balanceOf(vault.target)).to.equal(depositAssets);

    const transfer10Call = usde.interface.encodeFunctionData("transfer", [receiver.address, ethers.parseUnits("10", 18)]);
    await expect(vault.connect(managerA).managerCall(usde.target, 0, transfer10Call))
      .to.be.revertedWithCustomError(vault, "NotManager");

    await authority.setManager(managerA.address, true);
    await expect(vault.connect(managerA).managerCall(usde.target, 0, transfer10Call))
      .to.emit(vault, "ManagerCall");
    expect(await usde.balanceOf(receiver.address)).to.equal(ethers.parseUnits("10", 18));

    await vault.connect(alice).approve(teller.target, withdrawShares);
    await teller.connect(alice).requestWithdraw(withdrawShares);

    await expect(teller.connect(alice).claimWithdraw(1, alice.address))
      .to.be.revertedWithCustomError(teller, "RequestNotMatured");

    await network.provider.send("evm_increaseTime", [THREE_DAYS]);
    await network.provider.send("evm_mine");

    await expect(teller.connect(alice).claimWithdraw(1, alice.address))
      .to.emit(teller, "WithdrawClaimed");

    expect(await usde.balanceOf(alice.address)).to.equal(ethers.parseUnits("936", 18));
    expect(await vault.balanceOf(alice.address)).to.equal(ethers.parseUnits("60", 18));

    await authority.setManager(managerA.address, false);
    const strategyCall = strategy.interface.encodeFunctionData("setValue", [777]);
    await expect(vault.connect(managerA).managerCall(strategy.target, 0, strategyCall))
      .to.be.revertedWithCustomError(vault, "NotManager");
  });

  it("supports multiple managers controlled by authority", async function () {
    await authority.setManager(managerA.address, true);
    await authority.setManager(managerB.address, true);

    const set111 = strategy.interface.encodeFunctionData("setValue", [111]);
    const set222 = strategy.interface.encodeFunctionData("setValue", [222]);

    await vault.connect(managerA).managerCall(strategy.target, 0, set111);
    expect(await strategy.value()).to.equal(111);

    await vault.connect(managerB).managerCall(strategy.target, 0, set222);
    expect(await strategy.value()).to.equal(222);

    await authority.setManager(managerA.address, false);
    await expect(vault.connect(managerA).managerCall(strategy.target, 0, set111))
      .to.be.revertedWithCustomError(vault, "NotManager");
  });

  it("allows users to cancel queued withdrawal and recover shares", async function () {
    const depositAssets = ethers.parseUnits("80", 18);
    const queuedShares = ethers.parseUnits("20", 18);

    await usde.connect(bob).approve(teller.target, depositAssets);
    await teller.connect(bob).deposit(depositAssets, bob.address);

    await vault.connect(bob).approve(teller.target, queuedShares);
    await teller.connect(bob).requestWithdraw(queuedShares);

    expect(await vault.balanceOf(bob.address)).to.equal(ethers.parseUnits("60", 18));
    expect(await vault.balanceOf(teller.target)).to.equal(queuedShares);

    await expect(teller.connect(bob).cancelWithdraw(1))
      .to.emit(teller, "WithdrawCancelled")
      .withArgs(1, bob.address, queuedShares);

    expect(await vault.balanceOf(bob.address)).to.equal(depositAssets);
    expect(await vault.balanceOf(teller.target)).to.equal(0);
  });
});
