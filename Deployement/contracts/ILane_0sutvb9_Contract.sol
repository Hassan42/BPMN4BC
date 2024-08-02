// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILane_0sutvb9_Contract {
    enum State {
        Closed,
        Open,
        Completed
    }
    function setContracts(address[] memory addresses) external;
    function setResources(
        string[] memory roles,
        address[] memory addresses
    ) external;
    function setState(string memory _activity, uint8 _state) external;
    function getState(string memory _activity) external returns (State);
    function compareStrings(
        string memory a,
        string memory b
    ) external returns (bool);
}
