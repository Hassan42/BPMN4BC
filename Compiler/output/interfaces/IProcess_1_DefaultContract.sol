// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IProcess_1_DefaultContract {
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
    function Activity_0hnfduf(uint zone) external;
    function Activity_03z2h2j(string memory landID) external;
    function Activity_0twj7n8(string memory new_owner) external;
    function Activity_063mdk6() external;
    function Activity_11aq4w4(uint request_zone, string memory owner) external;
    function Activity_0doea6v(string memory owner) external;
    function Activity_1ue8g60(string memory new_owner) external;
}
