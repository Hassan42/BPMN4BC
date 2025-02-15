// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./ILane_1t3anxw_Contract_Collaboration_1fz5t6s.sol";
import "./ILane_1flgjqy_Contract_Collaboration_1fz5t6s.sol";
contract Lane_1t3anxw_Contract_Collaboration_1fz5t6s {
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

    constructor() {
        state["Activity_0duu9ah"] = State.Open;
        activitytoRole["Activity_0duu9ah"] = ["p1"];
    }

    function setContracts(address[] memory addresses) public {
        contracts["Lane_1t3anxw_Contract_Collaboration_1fz5t6s"] = addresses[0];
        contracts["Lane_1flgjqy_Contract_Collaboration_1fz5t6s"] = addresses[1];
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

    function Activity_0duu9ah()
        public
        payable
        isAccessible("Activity_0duu9ah")
    {
        uint y = 1;
        uint256 branch = ILane_1flgjqy_Contract_Collaboration_1fz5t6s(
            contracts["Lane_1flgjqy_Contract_Collaboration_1fz5t6s"]
        ).checkXOR_Gateway_0zdwok1(y);
        if ((branch & (1 << 0)) != 0) {
            ILane_1flgjqy_Contract_Collaboration_1fz5t6s(
                contracts["Lane_1flgjqy_Contract_Collaboration_1fz5t6s"]
            ).setState("Activity_0wsix1v", 1);
        } else if ((branch & (1 << 1)) != 0) {
            ILane_1flgjqy_Contract_Collaboration_1fz5t6s(
                contracts["Lane_1flgjqy_Contract_Collaboration_1fz5t6s"]
            ).setState("Activity_1be3ygs", 1);
        }

        state["Activity_0duu9ah"] = State.Completed;
    }
}
