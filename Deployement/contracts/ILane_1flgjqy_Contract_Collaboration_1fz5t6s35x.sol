// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILane_1flgjqy_Contract_Collaboration_1fz5t6s35x {
    enum State {
        Closed,
        Open,
        Completed
    }
    function setContracts(address[] memory addresses) external;
    function getX() external returns (uint);
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
    function Activity_0wsix1v() external;
    function Activity_1be3ygs() external;
    function checkXOR_Gateway_0zdwok1(
        uint y,
        uint xy
    ) external returns (uint256);
}
