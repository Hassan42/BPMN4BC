// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./ILane_19y529f_Contract_Collaboration_1glbzukaax.sol";
import "./ILane_0qoxvyf_Contract_Collaboration_1glbzukaax.sol";
contract Lane_0qoxvyf_Contract_Collaboration_1glbzukaax {
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
        uint x;
    }
    LocalStorage public localStorage;

    constructor() {
        state["Activity_0i3wqng"] = State.Closed;

        activitytoRole["Activity_0i3wqng"] = ["p1"];
        localStorage.x = 1;
    }

    function setContracts(address[] memory addresses) public {
        contracts["Lane_19y529f_Contract_Collaboration_1glbzukaax"] = addresses[
            0
        ];
        contracts["Lane_0qoxvyf_Contract_Collaboration_1glbzukaax"] = addresses[
            1
        ];
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

    function Activity_1m2pw5d() public payable {
        require(
            uint256(
                ILane_19y529f_Contract_Collaboration_1glbzukaax(
                    contracts["Lane_19y529f_Contract_Collaboration_1glbzukaax"]
                ).getState("Activity_0biddql")
            ) == uint256(State.Open)
        );

        localStorage.x = 3;
    }

    function Activity_0i3wqng()
        public
        payable
        isAccessible("Activity_0i3wqng")
    {
        state["Activity_0i3wqng"] = State.Completed;
    }

    function checkXOR_Gateway_0x9om75(uint256 x) public returns (uint256) {
        require(
            uint256(
                ILane_19y529f_Contract_Collaboration_1glbzukaax(
                    contracts["Lane_19y529f_Contract_Collaboration_1glbzukaax"]
                ).getState("Activity_0biddql")
            ) == uint256(State.Open)
        );
        return ((x == 1) ? (1 << 0) : 0) | (1 << 1);
    }
}
