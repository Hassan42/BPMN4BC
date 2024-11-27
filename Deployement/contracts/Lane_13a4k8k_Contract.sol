// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./ILane_13a4k8k_Contract.sol";
contract Lane_13a4k8k_Contract {
    enum State {
        Closed,
        Open,
        Completed
    }

    mapping(string => State) public state;

    uint receiveFunctionCount = 1;

    mapping(string => address) public contracts;

    mapping(address => string) public addressToRole;

    mapping(string => string[]) public activitytoRole;

    modifier isAccessible(string memory _activity) {
        require(state[_activity] == State.Open, "Activity is not open");

        string memory userRole = addressToRole[msg.sender];
        bool hasRequiredRole = false;

        // Iterate through the array of roles for the activity
        for (uint256 i = 0; i < activitytoRole[_activity].length; i++) {
            if (compareStrings(userRole, activitytoRole[_activity][i])) {
                hasRequiredRole = true;
                break;
            }
        }

        require(hasRequiredRole, "Caller does not have the required role");
        _;
    }

    mapping(address => uint) public votes;

    constructor() {
        state["Activity_024v18h"] = State.Open;

        activitytoRole["Activity_024v18h"] = ["test"];
    }

    function setContracts(address[] memory addresses) public {
        contracts["Lane_13a4k8k_Contract"] = addresses[0];
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

    function Activity_0eoqjan(uint vote) public {
        require(uint256(state["Activity_024v18h"]) == uint256(State.Open));

        votes[msg.sender] = vote;
    }

    function Activity_024v18h(
        uint vote
    ) public isAccessible("Activity_024v18h") {
        uint256 branch = checkXOR_Gateway_059heui();
        if ((branch & (1 << 0)) != 0) {
            Activity_0eoqjan(vote);
            uint256 branch = checkXOR_Gateway_0uaw77k();
            if ((branch & (1 << 0)) != 0) {
                revert("End Event reached: Event_0istpln, voted false");
            } else if ((branch & (1 << 1)) != 0) {
                state["Activity_024v18h"] = State.Open;
            }
        } else if ((branch & (1 << 1)) != 0) {
            revert("End Event reached: Event_1rbks68, already voted");
        }
    }

    function checkXOR_Gateway_0uaw77k() public returns (uint256) {
        require(uint256(state["Activity_024v18h"]) == uint256(State.Open));
        return
            ((votes[msg.sender] == 1) ? (1 << 0) : 0) |
            ((votes[msg.sender] == 2) ? (1 << 1) : 0);
    }

    function checkXOR_Gateway_059heui() public returns (uint256) {
        require(uint256(state["Activity_024v18h"]) == uint256(State.Open));
        return
            ((votes[msg.sender] == 0) ? (1 << 0) : 0) |
            ((votes[msg.sender] != 0) ? (1 << 1) : 0);
    }
}
