// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {USDeBoringVault} from "./USDeBoringVault.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

contract TellerWith3DayQueue is ReentrancyGuard {
    uint256 public constant WITHDRAW_DELAY = 3 days;

    USDeBoringVault public immutable vault;
    IERC20 public immutable asset;

    uint256 public nextRequestId;

    struct WithdrawRequest {
        address owner;
        uint256 shares;
        uint64 unlockTimestamp;
        bool handled;
    }

    mapping(uint256 => WithdrawRequest) public withdrawRequests;

    event Deposited(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event WithdrawRequested(uint256 indexed requestId, address indexed owner, uint256 shares, uint256 unlockTimestamp);
    event WithdrawCancelled(uint256 indexed requestId, address indexed owner, uint256 shares);
    event WithdrawClaimed(
        uint256 indexed requestId,
        address indexed owner,
        address indexed receiver,
        uint256 shares,
        uint256 assets
    );

    error InvalidAddress();
    error ZeroAmount();
    error NotRequestOwner();
    error RequestHandled();
    error RequestNotMatured();
    error TransferFailed();
    error NoAssetsAvailable();

    constructor(address vault_) {
        if (vault_ == address(0)) revert InvalidAddress();
        vault = USDeBoringVault(payable(vault_));
        asset = vault.asset();
    }

    function deposit(uint256 assets, address receiver) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0)) revert InvalidAddress();

        shares = previewDeposit(assets);
        if (shares == 0) revert ZeroAmount();

        if (!asset.transferFrom(msg.sender, address(vault), assets)) revert TransferFailed();
        vault.mintShares(receiver, shares);

        emit Deposited(msg.sender, receiver, assets, shares);
    }

    function requestWithdraw(uint256 shares) external nonReentrant returns (uint256 requestId) {
        if (shares == 0) revert ZeroAmount();

        if (!vault.transferFrom(msg.sender, address(this), shares)) revert TransferFailed();

        requestId = ++nextRequestId;
        uint64 unlockTimestamp = uint64(block.timestamp + WITHDRAW_DELAY);
        withdrawRequests[requestId] = WithdrawRequest({
            owner: msg.sender,
            shares: shares,
            unlockTimestamp: unlockTimestamp,
            handled: false
        });

        emit WithdrawRequested(requestId, msg.sender, shares, unlockTimestamp);
    }

    function cancelWithdraw(uint256 requestId) external nonReentrant {
        WithdrawRequest storage request = withdrawRequests[requestId];
        if (request.owner != msg.sender) revert NotRequestOwner();
        if (request.handled) revert RequestHandled();

        request.handled = true;

        if (!vault.transfer(msg.sender, request.shares)) revert TransferFailed();
        emit WithdrawCancelled(requestId, msg.sender, request.shares);
    }

    function claimWithdraw(uint256 requestId, address receiver) external nonReentrant returns (uint256 assetsOut) {
        if (receiver == address(0)) revert InvalidAddress();

        WithdrawRequest storage request = withdrawRequests[requestId];
        if (request.owner != msg.sender) revert NotRequestOwner();
        if (request.handled) revert RequestHandled();
        if (block.timestamp < request.unlockTimestamp) revert RequestNotMatured();

        assetsOut = previewRedeem(request.shares);
        if (assetsOut == 0) revert NoAssetsAvailable();

        request.handled = true;

        vault.burnShares(address(this), request.shares);
        vault.transferAsset(receiver, assetsOut);

        emit WithdrawClaimed(requestId, msg.sender, receiver, request.shares, assetsOut);
    }

    function previewDeposit(uint256 assets) public view returns (uint256 shares) {
        return vault.convertToShares(assets);
    }

    function previewRedeem(uint256 shares) public view returns (uint256 assetsOut) {
        return vault.convertToAssets(shares);
    }
}
