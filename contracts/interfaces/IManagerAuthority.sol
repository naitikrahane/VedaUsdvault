// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IManagerAuthority {
    function isAuthorizedManager(address manager) external view returns (bool);
}
