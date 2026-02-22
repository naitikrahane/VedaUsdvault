// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status = _NOT_ENTERED;

    error ReentrancyDetected();

    modifier nonReentrant() {
        if (_status == _ENTERED) revert ReentrancyDetected();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}
