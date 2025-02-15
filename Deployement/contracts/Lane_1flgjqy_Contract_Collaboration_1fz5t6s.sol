// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./ILane_1t3anxw_Contract_Collaboration_1fz5t6s.sol";
import "./ILane_1flgjqy_Contract_Collaboration_1fz5t6s.sol";
contract Lane_1flgjqy_Contract_Collaboration_1fz5t6s {
    enum State {
        Closed,
        Open,
        Completed
    }

    mapping(string => State) public state;

    uint receiveFunctionCount = 2;

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
        uint x;
    }
    LocalStorage public localStorage;

    constructor() {
        state["Activity_0wsix1v"] = State.Closed;
        state["Activity_1be3ygs"] = State.Closed;
        activitytoRole["Activity_0wsix1v"] = ["p1"];
        activitytoRole["Activity_1be3ygs"] = ["p1"];
        localStorage.x = 23;
    }

    function setContracts(address[] memory addresses) public {
        contracts["Lane_1t3anxw_Contract_Collaboration_1fz5t6s"] = addresses[0];
        contracts["Lane_1flgjqy_Contract_Collaboration_1fz5t6s"] = addresses[1];
    }

    function getX() public view returns (uint) {
        return localStorage.x;
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

    function Activity_0wsix1v()
        public
        payable
        isAccessible("Activity_0wsix1v")
    {
        state["Activity_0wsix1v"] = State.Completed;
    }

    function Activity_1be3ygs()
        public
        payable
        isAccessible("Activity_1be3ygs")
    {
        state["Activity_1be3ygs"] = State.Completed;
    }

    function checkXOR_Gateway_0zdwok1(uint y) public returns (uint256) {
        require(
            uint256(
                ILane_1t3anxw_Contract_Collaboration_1fz5t6s(
                    contracts["Lane_1t3anxw_Contract_Collaboration_1fz5t6s"]
                ).getState("Activity_0duu9ah")
            ) == uint256(State.Open)
        );
        return ((localStorage.x > y) ? (1 << 0) : 0) | (1 << 1);
    }
}
