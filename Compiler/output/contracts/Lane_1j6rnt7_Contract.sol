// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./ILane_03zow9n_Contract.sol";
import "./ILane_0sutvb9_Contract.sol";
import "./ILane_1j6rnt7_Contract.sol";
contract Lane_1j6rnt7_Contract {
    enum State {
        Closed,
        Open,
        Completed
    }

    mapping(string => State) public state;

    uint receiveFunctionCount = 1;

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
        state["Activity_1seaphb"] = State.Open;
    }

    function setContracts(address[] memory addresses) public {
        contracts["Lane_03zow9n_Contract"] = addresses[0];
        contracts["Lane_0sutvb9_Contract"] = addresses[1];
        contracts["Lane_1j6rnt7_Contract"] = addresses[2];
    }

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

    function Activity_1seaphb()
        public
        isSender("test")
        isOpen("Activity_1seaphb")
    {
        state["Activity_1seaphb"] = State.Completed;
    }
}
