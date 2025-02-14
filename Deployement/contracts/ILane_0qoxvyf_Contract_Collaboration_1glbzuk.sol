// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILane_0qoxvyf_Contract_Collaboration_1glbzuk {
    enum State {
        Closed,
        Open,
        Completed
    }
    function setContracts(address[] memory addresses) external;
    function getParameter_23b2p36() external returns (uint);
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
    function Activity_1m2pw5d(uint Parameter_3a93mmd) external;
}
