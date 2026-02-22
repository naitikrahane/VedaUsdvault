// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IManagerAuthority} from "./interfaces/IManagerAuthority.sol";
import {Ownable} from "./utils/Ownable.sol";

contract ManagerRegistry is Ownable {
    address public authority;

    mapping(address => bool) public isManager;

    event AuthorityUpdated(address indexed previousAuthority, address indexed newAuthority);
    event ManagerSynced(address indexed manager, bool active);

    error InvalidAuthority();

    constructor(address owner_, address authority_) Ownable(owner_) {
        if (authority_ == address(0)) revert InvalidAuthority();
        authority = authority_;
    }

    function setAuthority(address newAuthority) external onlyOwner {
        if (newAuthority == address(0)) revert InvalidAuthority();
        address previous = authority;
        authority = newAuthority;
        emit AuthorityUpdated(previous, newAuthority);
    }

    function syncManager(address manager) public returns (bool active) {
        active = IManagerAuthority(authority).isAuthorizedManager(manager);
        isManager[manager] = active;
        emit ManagerSynced(manager, active);
    }

    function syncManagers(address[] calldata managers) external {
        uint256 length = managers.length;
        for (uint256 i = 0; i < length; ++i) {
            syncManager(managers[i]);
        }
    }

    function isAuthorizedManager(address manager) external view returns (bool) {
        return IManagerAuthority(authority).isAuthorizedManager(manager);
    }
}
