const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("Veda-style USDe Vault", function () {
  let deployer;
  let alice;
  let bob;
  let manager;
  let receiver;

  let usde;
  let authority;
  let registry;
  let vault;
  let teller;
  let strategy;

  beforeEach(async function () {
    [deployer, alice, bob, manager, receiver] = await ethers.getSigners();

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

    const mintAmount = ethers.parseUnits("1000", 18);
    await usde.mint(alice.address, mintAmount);
    await usde.mint(bob.address, mintAmount);
  });

  it("mints vault shares when user deposits USDe", async function () {
    const assets = ethers.parseUnits("100", 18);
    await usde.connect(alice).approve(teller.target, assets);

    await expect(teller.connect(alice).deposit(assets, alice.address))
      .to.emit(teller, "Deposited")
      .withArgs(alice.address, alice.address, assets, assets);

    expect(await vault.balanceOf(alice.address)).to.equal(assets);
    expect(await usde.balanceOf(vault.target)).to.equal(assets);
  });

  it("enforces authority-based managers for unrestricted manager calls", async function () {
    const assets = ethers.parseUnits("100", 18);
    await usde.connect(alice).approve(teller.target, assets);
    await teller.connect(alice).deposit(assets, alice.address);

    const callData = usde.interface.encodeFunctionData("transfer", [receiver.address, ethers.parseUnits("10", 18)]);

    await expect(vault.connect(manager).managerCall(usde.target, 0, callData))
      .to.be.revertedWithCustomError(vault, "NotManager");

    await authority.setManager(manager.address, true);

    await expect(vault.connect(manager).managerCall(usde.target, 0, callData))
      .to.emit(vault, "ManagerCall");

    expect(await usde.balanceOf(receiver.address)).to.equal(ethers.parseUnits("10", 18));
  });

  it("lets managers execute arbitrary strategy calls when authorized", async function () {
    await authority.setManager(manager.address, true);

    const callData = strategy.interface.encodeFunctionData("setValue", [777]);
    await vault.connect(manager).managerCall(strategy.target, 0, callData);

    expect(await strategy.value()).to.equal(777);
  });

  it("enforces a strict 3 day queue before withdrawals can be claimed", async function () {
    const assets = ethers.parseUnits("120", 18);
    const withdrawShares = ethers.parseUnits("40", 18);

    await usde.connect(alice).approve(teller.target, assets);
    await teller.connect(alice).deposit(assets, alice.address);

    await vault.connect(alice).approve(teller.target, withdrawShares);
    await teller.connect(alice).requestWithdraw(withdrawShares);

    await expect(teller.connect(alice).claimWithdraw(1, alice.address))
      .to.be.revertedWithCustomError(teller, "RequestNotMatured");

    const request = await teller.withdrawRequests(1);
    const unlockTimestamp = Number(request.unlockTimestamp);

    await network.provider.send("evm_setNextBlockTimestamp", [unlockTimestamp - 1]);

    await expect(teller.connect(alice).claimWithdraw(1, alice.address))
      .to.be.revertedWithCustomError(teller, "RequestNotMatured");

    await network.provider.send("evm_setNextBlockTimestamp", [unlockTimestamp]);

    await expect(teller.connect(alice).claimWithdraw(1, alice.address))
      .to.emit(teller, "WithdrawClaimed");

    expect(await vault.balanceOf(alice.address)).to.equal(assets - withdrawShares);
    expect(await usde.balanceOf(alice.address)).to.equal(ethers.parseUnits("920", 18));
  });

  it("removes manager powers immediately when authority revokes", async function () {
    await authority.setManager(manager.address, true);

    const enableData = strategy.interface.encodeFunctionData("setValue", [123]);
    await vault.connect(manager).managerCall(strategy.target, 0, enableData);
    expect(await strategy.value()).to.equal(123);

    await authority.setManager(manager.address, false);

    const disableData = strategy.interface.encodeFunctionData("setValue", [999]);
    await expect(vault.connect(manager).managerCall(strategy.target, 0, disableData))
      .to.be.revertedWithCustomError(vault, "NotManager");
  });
});
