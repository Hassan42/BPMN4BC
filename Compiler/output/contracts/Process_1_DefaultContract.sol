// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Process_1_DefaultContract {
    enum State {
        Closed,
        Open,
        Completed
    }

    mapping(string => State) public state;

    uint receiveFunctionCount = 1;

    mapping(string => address) public contracts;

    mapping(address => string) public addressToRole;

    modifier isAccessible(string memory _activity, string memory _role) {
        require(state[_activity] == State.Open, "Activity is not open");
        require(
            compareStrings(addressToRole[msg.sender], _role),
            "Caller does not have the required role"
        );
        _;
    }

    struct LocalStorage {
        uint cost;
    }
    LocalStorage public localStorage;

    constructor() {
        state["Activity_1338c96"] = State.Open;
    }

    function setContracts(address[] memory addresses) public {}

    function setResources(
        string[] memory _roles,
        address[] memory _addresses
    ) public {
        require(
            _roles.length == _addresses.length,
            "Roles and addresses arrays must be of the same length"
        );

        for (uint i = 0; i < _addresses.length; i++) {
            addressToRole[_addresses[i]] = _roles[i];
        }
    }

    function setResource(string memory _role, address _address) public {
        addressToRole[_address] = _role;
    }

    function setState(string memory _activity, uint8 _state) public {
        require(_state <= 3, "Not Valid State");
        state[_activity] = State(_state);
    }

    function getState(string memory _activity) public view returns (State) {
        return state[_activity];
    }

    //To be replaced with ENUM
    function compareStrings(
        string memory a,
        string memory b
    ) internal pure returns (bool) {
        return keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b));
    }

    function Activity_1338c96(
        uint cost
    ) public isAccessible("Activity_1338c96", "a1") {
        localStorage.cost = cost;

        if (localStorage.cost > 3) {
            Activity_0z6ea92();
        } else {
            Activity_1lu73bj();
        }

        state["Activity_1338c96"] = State.Completed;
    }

    function Activity_0z6ea92() public {
        localStorage.cost = 100;
    }

    function Activity_1lu73bj() public {
        localStorage.cost = 10;
    }
}
