// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./ILane_0w29kx0_Contract_Collaboration_0pb2pqkxt.sol";
import "./ILane_1js0enj_Contract_Collaboration_0pb2pqkxt.sol";
contract Lane_1js0enj_Contract_Collaboration_0pb2pqkxt {
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

        // If no roles are defined for the activity, grant access
        if (activitytoRole[_activity].length == 0) {
            hasRequiredRole = true;
        } else {
            // Iterate through the array of roles for the activity
            for (uint256 i = 0; i < activitytoRole[_activity].length; i++) {
                if (
                    bytes(activitytoRole[_activity][i]).length == 0 ||
                    compareStrings(userRole, activitytoRole[_activity][i])
                ) {
                    hasRequiredRole = true;
                    break;
                }
            }
        }

        require(hasRequiredRole, "Caller does not have the required role");
        _;
    }

    struct LocalStorage {
        uint y;
    }
    LocalStorage public localStorage;

    constructor() {
        state["Activity_1w1utp5"] = State.Closed;
        activitytoRole["Activity_1w1utp5"] = ["p1"];
        localStorage.y = 1;
    }

    function setContracts(address[] memory addresses) public {
        contracts["Lane_0w29kx0_Contract_Collaboration_0pb2pqkxt"] = addresses[
            0
        ];
        contracts["Lane_1js0enj_Contract_Collaboration_0pb2pqkxt"] = addresses[
            1
        ];
    }

    function getY() public view returns (uint) {
        return localStorage.y;
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

    function Activity_1w1utp5()
        public
        payable
        isAccessible("Activity_1w1utp5")
    {
        state["Activity_1w1utp5"] = State.Completed;
    }

    function checkXOR_Gateway_051yoek(uint256 y) public returns (uint256) {
        require(
            uint256(
                ILane_0w29kx0_Contract_Collaboration_0pb2pqkxt(
                    contracts["Lane_0w29kx0_Contract_Collaboration_0pb2pqkxt"]
                ).getState("Activity_0d2uaqj")
            ) == uint256(State.Open)
        );
        return ((y != 1) ? (1 << 0) : 0) | ((y == 1) ? (1 << 1) : 0);
    }
}
