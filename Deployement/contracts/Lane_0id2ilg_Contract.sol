// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./ILane_0rg8ox7_Contract.sol";
import "./ILane_0id2ilg_Contract.sol";
contract Lane_0id2ilg_Contract {
    enum State {
        Closed,
        Open,
        Completed
    }

    mapping(string => State) public state;

    uint receiveFunctionCount = 3;

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

    event Purchase_Request();

    event Property_Transfer_Rejection();

    struct LocalStorage {
        string new_owner;
    }
    LocalStorage public localStorage;

    constructor() {
        state["Activity_03z2h2j"] = State.Open;
        state["Activity_0twj7n8"] = State.Closed;
        state["Activity_063mdk6"] = State.Closed;
    }

    function setContracts(address[] memory addresses) public {
        contracts["Lane_0rg8ox7_Contract"] = addresses[0];
        contracts["Lane_0id2ilg_Contract"] = addresses[1];
    }

    function emit_Purchase_Request() public {
        emit Purchase_Request();
    }

    function emit_Property_Transfer_Rejection() public {
        emit Property_Transfer_Rejection();
    }

    function getNew_owner() public view returns (string memory) {
        return localStorage.new_owner;
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

    function Activity_03z2h2j(
        uint property_id,
        string memory new_owner
    ) public isAccessible("Activity_03z2h2j", "Buyer") {
        localStorage.new_owner = new_owner;

        if (
            ILane_0rg8ox7_Contract(contracts["Lane_0rg8ox7_Contract"])
                .getProperty_id() == property_id
        ) {
            emit_Purchase_Request();
            // Logic for Gateway_10wlqkf
            state["Activity_0twj7n8"] = State.Open;
            state["Activity_063mdk6"] = State.Open;
        } else {
            revert("End Event reached: Event_1jfl4aw, undefined");
        }

        state["Activity_03z2h2j"] = State.Completed;
    }

    function Activity_0twj7n8()
        public
        isAccessible("Activity_0twj7n8", "Landlord")
    {
        state["Activity_063mdk6"] = State.Closed;

        ILane_0rg8ox7_Contract(contracts["Lane_0rg8ox7_Contract"])
            .Activity_1ue8g60(localStorage.new_owner);
        ILane_0rg8ox7_Contract(contracts["Lane_0rg8ox7_Contract"])
            .emit_Property_Transferred();

        state["Activity_0twj7n8"] = State.Completed;
    }

    function Activity_063mdk6()
        public
        isAccessible("Activity_063mdk6", "Landlord")
    {
        state["Activity_0twj7n8"] = State.Closed;
        emit_Property_Transfer_Rejection();
        state["Activity_03z2h2j"] = State.Open;

        state["Activity_063mdk6"] = State.Completed;
    }
}
