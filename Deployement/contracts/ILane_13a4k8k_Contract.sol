// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILane_13a4k8k_Contract {
    enum State {
        Closed,
        Open,
        Completed
    }
    function setContracts(address[] memory addresses) external;
    function setResources(
        string[] memory _roles,
        address[] memory _addresses
    ) external;
    function setResource(string memory _role, address _address) external;
    function setState(string memory _activity, uint8 _state) external;
    function getState(string memory _activity) external returns (State);
    function compareStrings(
        string memory a,
        string memory b
    ) external returns (bool);
    function Activity_0eoqjan(uint vote) external;
    function Activity_024v18h(uint vote) external;
    function checkXOR_Gateway_0uaw77k() external returns (uint256);
    function checkXOR_Gateway_059heui() external returns (uint256);
}
