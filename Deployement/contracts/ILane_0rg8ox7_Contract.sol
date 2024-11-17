// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILane_0rg8ox7_Contract {
    enum State {
        Closed,
        Open,
        Completed
    }
    function setContracts(address[] memory addresses) external;
    function emit_Property_Transferred() external;
    function emit_Property_Mint() external;
    function getProperty_owner() external returns (string memory);
    function getProperty_id() external returns (uint);
    function getZone() external returns (uint);
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
    function Activity_1ue8g60(string memory new_owner) external;
    function Activity_0doea6v(string memory owner, uint id) external;
    function Activity_0hnfduf(uint zone) external;
    function Activity_11aq4w4(
        uint req_zone,
        string memory prop_owner,
        uint prop_id
    ) external;
}
