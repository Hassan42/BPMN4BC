// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILane_1kovz2d_Contract {
    enum State {
        Closed,
        Open,
        Completed
    }
    function setContracts(address[] memory addresses) external;
    function emit_Event_1vezxs6() external;
    function emit_Event_05nynt3() external;
    function getStatus() external returns (uint);
    function getTotalAmount() external returns (uint);
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
    function Activity_0cpz3qj() external;
    function Activity_0vsdd61() external;
    function Activity_1udilui() external;
    function Activity_0r34n3f() external;
    function Activity_0rx20jd() external;
    function Activity_1n5l3yg() external;
    function Activity_11x0c4m() external;
    function Activity_0uoubyt() external;
    function Activity_1matq2v(uint goal) external;
    function checkXOR_Gateway_10aocgk() external returns (uint256);
    function checkXOR_Gateway_0o9wgik() external returns (uint256);
    function checkXOR_Gateway_0ijdg26() external returns (uint256);
}
