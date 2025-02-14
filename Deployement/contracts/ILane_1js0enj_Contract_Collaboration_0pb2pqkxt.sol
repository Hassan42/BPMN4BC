// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILane_1js0enj_Contract_Collaboration_0pb2pqkxt {
    enum State {
        Closed,
        Open,
        Completed
    }
    function setContracts(address[] memory addresses) external;
    function getY() external returns (uint);
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
    function Activity_1w1utp5() external;
    function checkXOR_Gateway_051yoek(uint256 y) external returns (uint256);
}
