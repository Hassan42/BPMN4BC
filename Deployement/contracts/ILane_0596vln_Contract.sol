// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILane_0596vln_Contract {
    enum State {
        Closed,
        Open,
        Completed
    }
    function setContracts(address[] memory addresses) external;
    function emit_Event_0gsykkh() external;
    function getVarA() external returns (uint);
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
    function Activity_00u26c4() external;
    function Activity_1dpwadr() external returns (uint);
    function Activity_0a3i83j() external;
    function checkGateway_Gateway_1xdxejg() external returns (bool);
}
