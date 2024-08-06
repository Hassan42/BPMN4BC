// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./ILane_14pkjzp_Contract.sol";
import "./ILane_0cbowdc_Contract.sol";
contract Lane_14pkjzp_Contract {
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

    constructor() {
        state["Activity_0swvw0f"] = State.Open;
    }

    function setContracts(address[] memory addresses) public {
        contracts["Lane_14pkjzp_Contract"] = addresses[0];
        contracts["Lane_0cbowdc_Contract"] = addresses[1];
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

    function Activity_0swvw0f() public isAccessible("a1", "Activity_0swvw0f") {
        state["Activity_0swvw0f"] = State.Completed;
    }
}
