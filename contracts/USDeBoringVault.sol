// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {ManagerRegistry} from "./ManagerRegistry.sol";
import {Ownable} from "./utils/Ownable.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

contract USDeBoringVault is Ownable, ReentrancyGuard {
    IERC20 public immutable asset;
    ManagerRegistry public immutable managerRegistry;

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    address public teller;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event TellerUpdated(address indexed previousTeller, address indexed newTeller);
    event ManagerCall(address indexed manager, address indexed target, uint256 value, bytes data, bytes result);

    error InvalidAddress();
    error NotTeller();
    error NotManager();
    error InsufficientBalance();
    error InsufficientAllowance();
    error ManagerCallFailed();

    constructor(
        address owner_,
        address asset_,
        address managerRegistry_,
        string memory name_,
        string memory symbol_
    ) Ownable(owner_) {
        if (asset_ == address(0) || managerRegistry_ == address(0)) revert InvalidAddress();
        asset = IERC20(asset_);
        managerRegistry = ManagerRegistry(managerRegistry_);
        name = name_;
        symbol = symbol_;
    }

    modifier onlyTeller() {
        if (msg.sender != teller) revert NotTeller();
        _;
    }

    modifier onlyManager() {
        if (!managerRegistry.isAuthorizedManager(msg.sender)) revert NotManager();
        _;
    }

    function setTeller(address newTeller) external onlyOwner {
        if (newTeller == address(0)) revert InvalidAddress();
        address previous = teller;
        teller = newTeller;
        emit TellerUpdated(previous, newTeller);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance();
            unchecked {
                allowance[from][msg.sender] = allowed - amount;
            }
        }
        _transfer(from, to, amount);
        return true;
    }

    function mintShares(address to, uint256 shares) external onlyTeller {
        _mint(to, shares);
    }

    function burnShares(address from, uint256 shares) external onlyTeller {
        _burn(from, shares);
    }

    function transferAsset(address to, uint256 amount) external onlyTeller returns (bool) {
        if (!asset.transfer(to, amount)) revert ManagerCallFailed();
        return true;
    }

    function managerCall(
        address target,
        uint256 value,
        bytes calldata data
    ) external onlyManager nonReentrant returns (bytes memory result) {
        if (target == address(0) || target == address(this)) revert InvalidAddress();
        (bool success, bytes memory returndata) = target.call{value: value}(data);
        if (!success) revert ManagerCallFailed();
        emit ManagerCall(msg.sender, target, value, data, returndata);
        return returndata;
    }

    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function convertToShares(uint256 assets) public view returns (uint256 shares) {
        uint256 supply = totalSupply;
        uint256 assetsInVault = totalAssets();
        if (supply == 0 || assetsInVault == 0) return assets;
        return assets * supply / assetsInVault;
    }

    function convertToAssets(uint256 shares) public view returns (uint256 assetsAmount) {
        uint256 supply = totalSupply;
        uint256 assetsInVault = totalAssets();
        if (supply == 0 || assetsInVault == 0) return shares;
        return shares * assetsInVault / supply;
    }

    receive() external payable {}

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidAddress();
        uint256 fromBalance = balanceOf[from];
        if (fromBalance < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = fromBalance - amount;
        }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidAddress();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        uint256 fromBalance = balanceOf[from];
        if (fromBalance < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = fromBalance - amount;
            totalSupply -= amount;
        }
        emit Transfer(from, address(0), amount);
    }
}
