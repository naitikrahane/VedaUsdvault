// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockStrategyTarget {
    uint256 public value;

    event ValueSet(uint256 nextValue);

    function setValue(uint256 nextValue) external {
        value = nextValue;
        emit ValueSet(nextValue);
    }
}
