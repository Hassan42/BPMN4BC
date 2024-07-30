// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IProcess_1u6ic7g_DefaultContract {
    enum State {
        Closed,
        Open,
        Completed
    }
    function setContracts(address[] memory addresses) external;
    function setState(string memory _activity, uint8 _state) external;
}
