// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IManagerAuthority} from "../interfaces/IManagerAuthority.sol";
import {Ownable} from "../utils/Ownable.sol";

contract SimpleManagerAuthority is Ownable, IManagerAuthority {
    mapping(address => bool) public managerPermissions;

    event ManagerPermissionSet(address indexed manager, bool allowed);

    constructor(address owner_) Ownable(owner_) {}

    function setManager(address manager, bool allowed) external onlyOwner {
        managerPermissions[manager] = allowed;
        emit ManagerPermissionSet(manager, allowed);
    }

    function isAuthorizedManager(address manager) external view returns (bool) {
        return managerPermissions[manager];
    }
}
