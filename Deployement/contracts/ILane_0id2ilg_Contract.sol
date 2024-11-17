// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILane_0id2ilg_Contract {
    enum State {
        Closed,
        Open,
        Completed
    }
    function setContracts(address[] memory addresses) external;
    function emit_Property_Transfer_Rejection() external;
    function emit_Event_1ay6qvq() external;
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
    function Activity_0twj7n8(string memory new_owner) external;
    function Activity_063mdk6() external;
    function Activity_03z2h2j(uint req_prop_id) external;
}
