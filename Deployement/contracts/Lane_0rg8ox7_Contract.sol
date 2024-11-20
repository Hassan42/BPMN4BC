// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./ILane_0rg8ox7_Contract.sol";
contract Lane_0rg8ox7_Contract {
    enum State {
        Closed,
        Open,
        Completed
    }

    mapping(string => State) public state;

    uint receiveFunctionCount = 5;

    mapping(string => address) public contracts;

    mapping(address => string) public addressToRole;

    mapping(string => string) public activitytoRole;

    modifier isAccessible(string memory _activity) {
        require(state[_activity] == State.Open, "Activity is not open");
        require(
            compareStrings(
                addressToRole[msg.sender],
                activitytoRole[_activity]
            ),
            "Caller does not have the required role"
        );
        _;
    }

    event Property_Transfer_Rejection();

    event Property_Transferred();

    event Property_Mint();

    event Event_1ay6qvq();

    struct LocalStorage {
        string property_owner;
        uint property_id;
        uint zone;
    }
    LocalStorage public localStorage;

    constructor() {
        state["Activity_0twj7n8"] = State.Closed;
        state["Activity_063mdk6"] = State.Closed;
        state["Activity_0hnfduf"] = State.Open;
        state["Activity_11aq4w4"] = State.Closed;
        state["Activity_03z2h2j"] = State.Open;
        activitytoRole["Activity_0twj7n8"] = "PropertyOwner";
        activitytoRole["Activity_063mdk6"] = "PropertyOwner";

        activitytoRole["Activity_0hnfduf"] = "Authority";
        activitytoRole["Activity_11aq4w4"] = "PropertyOwner";
        activitytoRole["Activity_03z2h2j"] = "Buyer";
    }

    function setContracts(address[] memory addresses) public {
        contracts["Lane_0rg8ox7_Contract"] = addresses[0];
    }

    function emit_Property_Transfer_Rejection() public {
        emit Property_Transfer_Rejection();
    }

    function emit_Property_Transferred() public {
        emit Property_Transferred();
    }

    function emit_Property_Mint() public {
        emit Property_Mint();
    }

    function emit_Event_1ay6qvq() public {
        emit Event_1ay6qvq();
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

    function Activity_0twj7n8(
        string memory new_owner
    ) public isAccessible("Activity_0twj7n8") {
        state["Activity_063mdk6"] = State.Closed;

        Activity_1ue8g60(new_owner);
        emit_Property_Transferred();

        state["Activity_0twj7n8"] = State.Completed;
    }

    function Activity_063mdk6() public isAccessible("Activity_063mdk6") {
        state["Activity_0twj7n8"] = State.Closed;
        emit_Property_Transfer_Rejection();

        state["Activity_063mdk6"] = State.Completed;
    }

    function Activity_1ue8g60(string memory new_owner) public {
        require(uint256(state["Activity_0twj7n8"]) == uint256(State.Open));

        localStorage.property_owner = new_owner;
    }

    function Activity_0doea6v(string memory owner, uint id) public {
        require(uint256(state["Activity_11aq4w4"]) == uint256(State.Open));

        localStorage.property_owner = owner;
        localStorage.property_id = id;
    }

    function Activity_0hnfduf(
        uint zone
    ) public isAccessible("Activity_0hnfduf") {
        localStorage.zone = zone;

        state["Activity_11aq4w4"] = State.Open;

        state["Activity_0hnfduf"] = State.Completed;
    }

    function Activity_11aq4w4(
        uint req_zone,
        string memory prop_owner,
        uint prop_id
    ) public isAccessible("Activity_11aq4w4") {
        uint256 branch = checkXOR_Gateway_0yfeqnu(req_zone);
        if ((branch & (1 << 0)) != 0) {
            Activity_0doea6v(prop_owner, prop_id);
            emit_Property_Mint();
        } else if ((branch & (1 << 1)) != 0) {
            revert(
                "End Event reached: Event_15zrmvl, Zone not open for registration."
            );
        }

        state["Activity_11aq4w4"] = State.Completed;
    }

    function Activity_03z2h2j(
        uint req_prop_id
    ) public isAccessible("Activity_03z2h2j") {
        uint256 branch = checkXOR_Gateway_10zbfi1(req_prop_id);
        if ((branch & (1 << 0)) != 0) {
            emit_Event_1ay6qvq();
            // Logic for Gateway_1jfy03i
            state["Activity_0twj7n8"] = State.Open;
            state["Activity_063mdk6"] = State.Open;
        } else if ((branch & (1 << 1)) != 0) {
            revert("End Event reached: Event_1ojo7cp, Property Not Available");
        }

        state["Activity_03z2h2j"] = State.Completed;
    }

    function checkXOR_Gateway_0yfeqnu(uint req_zone) public returns (uint256) {
        require(uint256(state["Activity_11aq4w4"]) == uint256(State.Open));
        return ((localStorage.zone == req_zone) ? (1 << 0) : 0) | (1 << 1);
    }

    function checkXOR_Gateway_10zbfi1(
        uint req_prop_id
    ) public returns (uint256) {
        require(uint256(state["Activity_03z2h2j"]) == uint256(State.Open));
        return
            (
                (ILane_0rg8ox7_Contract(contracts["Lane_0rg8ox7_Contract"])
                    .getProperty_id() == req_prop_id)
                    ? (1 << 0)
                    : 0
            ) | (1 << 1);
    }
}
