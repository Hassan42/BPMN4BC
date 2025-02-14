// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILane_0w29kx0_Contract_Collaboration_0pb2pqkxt {
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
    function Activity_0d2uaqj() external;
}
