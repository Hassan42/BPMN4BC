// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./ILane_0rg8ox7_Contract.sol";
import "./ILane_0id2ilg_Contract.sol";
contract Lane_0rg8ox7_Contract {
    enum State {
        Closed,
        Open,
        Completed
    }

    mapping(string => State) public state;

    uint receiveFunctionCount = 2;

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

    event Property_Transferred();

    event Property_Mint();

    struct LocalStorage {
        string property_owner;
        uint property_id;
        uint zone;
    }
    LocalStorage public localStorage;

    constructor() {
        state["Activity_0hnfduf"] = State.Open;
        state["Activity_11aq4w4"] = State.Closed;
    }

    function setContracts(address[] memory addresses) public {
        contracts["Lane_0rg8ox7_Contract"] = addresses[0];
        contracts["Lane_0id2ilg_Contract"] = addresses[1];
    }

    function emit_Property_Transferred() public {
        emit Property_Transferred();
    }

    function emit_Property_Mint() public {
        emit Property_Mint();
    }

    function getProperty_owner() public view returns (string memory) {
        return localStorage.property_owner;
    }

    function getProperty_id() public view returns (uint) {
        return localStorage.property_id;
    }

    function getZone() public view returns (uint) {
        return localStorage.zone;
    }

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

    function Activity_1ue8g60(string memory new_owner) public {
        localStorage.property_owner = new_owner;
    }

    function Activity_0doea6v(string memory owner, uint id) public {
        localStorage.property_owner = owner;
        localStorage.property_id = id;
    }

    function Activity_0hnfduf(
        uint zone
    ) public isAccessible("Activity_0hnfduf", "Authority") {
        localStorage.zone = zone;

        state["Activity_11aq4w4"] = State.Open;

        state["Activity_0hnfduf"] = State.Completed;
    }

    function Activity_11aq4w4(
        uint req_zone,
        string memory prop_owner,
        uint prop_id
    ) public isAccessible("Activity_11aq4w4", "PropertyOwner") {
        if (localStorage.zone == req_zone) {
            Activity_0doea6v(prop_owner, prop_id);
            emit_Property_Mint();
        } else {
            revert(
                "End Event reached: Event_15zrmvl, Zone not open for registration."
            );
        }

        state["Activity_11aq4w4"] = State.Completed;
    }
}
