// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./ILane_1kp4cd9_Contract.sol";
import "./ILane_1kovz2d_Contract.sol";
contract Lane_1kp4cd9_Contract {
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

        require(hasRequiredRole, "Caller does not have the required role");
        _;
    }

    mapping(address => uint) public votes;

    event VotingEnabled();

    event Event_0cj1jjv();

    event Event_1k3khsw();

    struct LocalStorage {
        uint voteCount;
        uint votePassed;
        uint ID;
        uint goal;
    }
    LocalStorage public localStorage;

    constructor() {
        state["Activity_03jdiqi"] = State.Open;
        state["Activity_11erdqp"] = State.Closed;
        activitytoRole["Activity_03jdiqi"] = ["Startupper"];
        activitytoRole["Activity_11erdqp"] = ["judge1", "judge2", "judge3"];

        localStorage.voteCount = 0;
        localStorage.votePassed = 0;
    }

    function setContracts(address[] memory addresses) public {
        contracts["Lane_1kp4cd9_Contract"] = addresses[0];
        contracts["Lane_1kovz2d_Contract"] = addresses[1];
    }

    function emit_VotingEnabled() public {
        emit VotingEnabled();
    }

    function emit_Event_0cj1jjv() public {
        emit Event_0cj1jjv();
    }

    function emit_Event_1k3khsw() public {
        emit Event_1k3khsw();
    }

    function getVoteCount() public view returns (uint) {
        return localStorage.voteCount;
    }

    function getVotePassed() public view returns (uint) {
        return localStorage.votePassed;
    }

    function getID() public view returns (uint) {
        return localStorage.ID;
    }

    function getGoal() public view returns (uint) {
        return localStorage.goal;
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

    function Activity_03jdiqi(
        uint ID,
        uint goal
    ) public payable isAccessible("Activity_03jdiqi") {
        localStorage.ID = ID;
        localStorage.goal = goal;

        emit_VotingEnabled();
        state["Activity_11erdqp"] = State.Open;

        state["Activity_03jdiqi"] = State.Completed;
    }

    function Activity_11erdqp(
        uint vote
    ) public payable isAccessible("Activity_11erdqp") {
        uint256 branch = checkXOR_Gateway_15y8zmy();
        if ((branch & (1 << 0)) != 0) {
            Activity_0t2d44f(vote);
            uint256 branch = checkXOR_Gateway_065diar();
            if ((branch & (1 << 0)) != 0) {
                uint256 branch = checkXOR_Gateway_09hv6pg();
                if ((branch & (1 << 0)) != 0) {
                    emit_Event_0cj1jjv();
                } else if ((branch & (1 << 1)) != 0) {
                    emit_Event_1k3khsw();

                    ILane_1kovz2d_Contract(contracts["Lane_1kovz2d_Contract"])
                        .Activity_1matq2v(localStorage.goal);
                    ILane_1kovz2d_Contract(contracts["Lane_1kovz2d_Contract"])
                        .setState("Activity_0cpz3qj", 1);
                    ILane_1kovz2d_Contract(contracts["Lane_1kovz2d_Contract"])
                        .setState("Activity_1n5l3yg", 1);
                }
            } else if ((branch & (1 << 1)) != 0) {
                state["Activity_11erdqp"] = State.Open;
            }
        } else if ((branch & (1 << 1)) != 0) {
            revert("End Event reached: Event_0h0x9tb, Already Voted");
        }
    }

    function Activity_0t2d44f(uint vote) public payable {
        require(uint256(state["Activity_11erdqp"]) == uint256(State.Open));

        votes[msg.sender] = vote;
        if (vote == 1) {
            localStorage.votePassed++;
        }
        localStorage.voteCount++;
    }

    function checkXOR_Gateway_065diar() public returns (uint256) {
        require(uint256(state["Activity_11erdqp"]) == uint256(State.Open));
        return
            ((localStorage.voteCount == 3) ? (1 << 0) : 0) |
            ((localStorage.voteCount != 3) ? (1 << 1) : 0);
    }

    function checkXOR_Gateway_15y8zmy() public returns (uint256) {
        require(uint256(state["Activity_11erdqp"]) == uint256(State.Open));
        return
            ((votes[msg.sender] == 0) ? (1 << 0) : 0) |
            ((votes[msg.sender] != 0) ? (1 << 1) : 0);
    }

    function checkXOR_Gateway_09hv6pg() public returns (uint256) {
        require(uint256(state["Activity_11erdqp"]) == uint256(State.Open));
        return
            ((localStorage.votePassed != 3) ? (1 << 0) : 0) |
            ((localStorage.votePassed == 3) ? (1 << 1) : 0);
    }
}
