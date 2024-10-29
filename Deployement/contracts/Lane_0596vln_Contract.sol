// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./ILane_0njnftu_Contract.sol";
import "./ILane_0596vln_Contract.sol";
contract Lane_0596vln_Contract {
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

    event Event_0gsykkh();

    struct LocalStorage {
        uint varA;
    }
    LocalStorage public localStorage;

    constructor() {
        state["Activity_00u26c4"] = State.Open;
        state["Activity_0a3i83j"] = State.Closed;
    }

    function setContracts(address[] memory addresses) public {
        contracts["Lane_0njnftu_Contract"] = addresses[0];
        contracts["Lane_0596vln_Contract"] = addresses[1];
    }

    function emit_Event_0gsykkh() public {
        emit Event_0gsykkh();
    }

    function getVarA() public view returns (uint) {
        return localStorage.varA;
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

    function Activity_00u26c4()
        public
        isAccessible("Activity_00u26c4", "Participant2")
    {
        if (!checkGateway_Gateway_1xdxejg()) {
            state["Activity_00u26c4"] = State.Completed;
            return;
        }
        uint varD;
        (varD) = Activity_1dpwadr();
        emit_Event_0gsykkh();
        state["Activity_0a3i83j"] = State.Open;

        state["Activity_00u26c4"] = State.Completed;
    }

    function Activity_1dpwadr() public returns (uint) {
        localStorage.varA = 1;
        uint varD = 3;
        return (varD);
    }

    function Activity_0a3i83j()
        public
        isAccessible("Activity_0a3i83j", "Participant2")
    {
        state["Activity_0a3i83j"] = State.Completed;
    }

    uint256 private checkGateway_Gateway_1xdxejgCount = 0;

    function checkGateway_Gateway_1xdxejg() public returns (bool) {
        checkGateway_Gateway_1xdxejgCount += 1;

        if (checkGateway_Gateway_1xdxejgCount == 2) {
            checkGateway_Gateway_1xdxejgCount = 0;
            return true;
        }

        return false;
    }
}
