// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILane_1kp4cd9_Contract {
    enum State {
        Closed,
        Open,
        Completed
    }
    function setContracts(address[] memory addresses) external;
    function emit_VotingEnabled() external;
    function emit_Event_0cj1jjv() external;
    function emit_Event_1k3khsw() external;
    function getVoteCount() external returns (uint);
    function getVotePassed() external returns (uint);
    function getID() external returns (uint);
    function getGoal() external returns (uint);
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
    function Activity_03jdiqi(uint ID, uint goal) external;
    function Activity_11erdqp(uint vote) external;
    function Activity_0t2d44f(uint vote) external;
    function checkXOR_Gateway_065diar() external returns (uint256);
    function checkXOR_Gateway_15y8zmy() external returns (uint256);
    function checkXOR_Gateway_09hv6pg() external returns (uint256);
}
