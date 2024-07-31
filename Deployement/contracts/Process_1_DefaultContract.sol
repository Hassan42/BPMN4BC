// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Process_1_DefaultContract {
    enum State {
        Closed,
        Open,
        Completed
    }
    mapping(string => State) public state;

    mapping(string => address) public contracts;

    mapping(address => string) public addressToRole;

    modifier isOpen(string memory _activity) {
        require(state[_activity] == State.Open, "Activity is not open");
        _;
    }

    modifier isSender(string memory _role) {
        require(
            compareStrings(addressToRole[msg.sender], _role),
            "Caller does not have the required role"
        );
        _;
    }

    constructor() {
        state["Activity_1nhshfn"] = State.Open;
    }

    function setContracts(address[] memory addresses) public {}

    function setResources(
        string[] memory roles,
        address[] memory addresses
    ) public {
        require(
            roles.length == addresses.length,
            "Roles and addresses arrays must be of the same length"
        );

        for (uint i = 0; i < addresses.length; i++) {
            addressToRole[addresses[i]] = roles[i];
        }
    }

    function setState(string memory _activity, uint8 _state) public {
        require(_state <= 3, "Not Valid State");
        state[_activity] = State(_state);
    }

    //To be replaced with ENUM
    function compareStrings(
        string memory a,
        string memory b
    ) internal pure returns (bool) {
        return keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b));
    }

    function Activity_1nhshfn()
        public
        isSender("Test")
        isOpen("Activity_1nhshfn")
    {
        state["Activity_1nhshfn"] = State.Completed;
    }
}
