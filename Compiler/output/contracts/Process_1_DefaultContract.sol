// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Process_1_DefaultContract {
    enum State {
        Closed,
        Open,
        Completed
    }

    mapping(string => State) public state;

    uint receiveFunctionCount = 5;

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

    event Owner_Registered();

    event Event_1o3n0dt();

    event Event_1n4z8ak();

    struct LocalStorage {
        string property_owner;
        uint zone;
        string landID;
    }
    LocalStorage public localStorage;

    constructor() {
        state["Activity_0hnfduf"] = State.Open;
        state["Activity_11aq4w4"] = State.Closed;
        state["Activity_03z2h2j"] = State.Open;
        state["Activity_0twj7n8"] = State.Closed;
        state["Activity_063mdk6"] = State.Closed;
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

    function Activity_0hnfduf(
        uint zone
    ) public isAccessible("Activity_0hnfduf", "Authority") {
        localStorage.zone = zone;

        state["Activity_11aq4w4"] = State.Open;

        state["Activity_0hnfduf"] = State.Completed;
    }

    function Activity_11aq4w4(
        uint request_zone,
        string memory owner
    ) public isAccessible("Activity_11aq4w4", "Landlord") {
        if (localStorage.zone == request_zone) {
            Activity_0doea6v(owner);
            emit Owner_Registered();
        } else {
            revert("End Event reached: Event_15zrmvl");
        }

        state["Activity_11aq4w4"] = State.Completed;
    }

    function Activity_0doea6v(string memory owner) public {
        localStorage.property_owner = owner;
    }

    function Activity_03z2h2j(
        string memory landID
    ) public isAccessible("Activity_03z2h2j", "Buyer") {
        localStorage.landID = landID;

        // Logic for Gateway_10wlqkf
        state["Activity_0twj7n8"] = State.Open;
        state["Activity_063mdk6"] = State.Open;

        state["Activity_03z2h2j"] = State.Completed;
    }

    function Activity_0twj7n8(
        string memory property_owner
    ) public isAccessible("Activity_0twj7n8", "Landlord") {
        localStorage.property_owner = property_owner;

        state["Activity_063mdk6"] = State.Closed;
        emit Event_1o3n0dt();

        state["Activity_0twj7n8"] = State.Completed;
    }

    function Activity_063mdk6()
        public
        isAccessible("Activity_063mdk6", "Landlord")
    {
        state["Activity_0twj7n8"] = State.Closed;
        emit Event_1n4z8ak();
        state["Activity_03z2h2j"] = State.Open;

        state["Activity_063mdk6"] = State.Completed;
    }
}
