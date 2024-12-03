// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./ILane_1kp4cd9_Contract.sol";
import "./ILane_1kovz2d_Contract.sol";
contract Lane_1kovz2d_Contract {
    enum State {
        Closed,
        Open,
        Completed
    }

    mapping(string => State) public state;

    uint receiveFunctionCount = 4;

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

    mapping(address => uint256) public investors;

    event Event_1vezxs6();

    event Event_05nynt3();

    struct LocalStorage {
        uint status;
        uint totalAmount;
        uint goal;
    }
    LocalStorage public localStorage;

    constructor() {
        state["Activity_0cpz3qj"] = State.Closed;
        state["Activity_1udilui"] = State.Closed;
        state["Activity_1n5l3yg"] = State.Closed;
        state["Activity_11x0c4m"] = State.Closed;
        activitytoRole["Activity_0cpz3qj"] = ["Startupper"];

        activitytoRole["Activity_1udilui"] = ["Startupper"];

        activitytoRole["Activity_1n5l3yg"] = [""];
        activitytoRole["Activity_11x0c4m"] = [""];

        localStorage.status = 0;
        localStorage.totalAmount = 0;
        localStorage.goal = 0;
    }

    function setContracts(address[] memory addresses) public {
        contracts["Lane_1kp4cd9_Contract"] = addresses[0];
        contracts["Lane_1kovz2d_Contract"] = addresses[1];
    }

    function emit_Event_1vezxs6() public {
        emit Event_1vezxs6();
    }

    function emit_Event_05nynt3() public {
        emit Event_05nynt3();
    }

    function getStatus() public view returns (uint) {
        return localStorage.status;
    }

    function getTotalAmount() public view returns (uint) {
        return localStorage.totalAmount;
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

    function Activity_0cpz3qj()
        public
        payable
        isAccessible("Activity_0cpz3qj")
    {
        localStorage.status = 1;

        state["Activity_11x0c4m"] = State.Open;

        state["Activity_0cpz3qj"] = State.Completed;
    }

    function Activity_0vsdd61() public payable {
        require(uint256(state["Activity_1n5l3yg"]) == uint256(State.Open));

        localStorage.status = 2;
    }

    function Activity_1udilui()
        public
        payable
        isAccessible("Activity_1udilui")
    {
        Activity_0r34n3f();

        state["Activity_1udilui"] = State.Completed;
    }

    function Activity_0r34n3f() public payable {
        require(uint256(state["Activity_1udilui"]) == uint256(State.Open));

        payable(msg.sender).transfer(localStorage.totalAmount);
        localStorage.totalAmount = 0;
    }

    function Activity_0rx20jd() public payable {
        require(uint256(state["Activity_1n5l3yg"]) == uint256(State.Open));

        investors[msg.sender] = msg.value;
        localStorage.totalAmount += msg.value;
    }

    function Activity_1n5l3yg()
        public
        payable
        isAccessible("Activity_1n5l3yg")
    {
        uint256 branch = checkXOR_Gateway_0ijdg26();
        if ((branch & (1 << 0)) != 0) {
            Activity_0rx20jd();
            emit_Event_1vezxs6();
            uint256 branch = checkXOR_Gateway_10aocgk();
            if ((branch & (1 << 0)) != 0) {
                emit_Event_05nynt3();

                Activity_0vsdd61();
                state["Activity_1udilui"] = State.Open;
            } else if ((branch & (1 << 1)) != 0) {
                state["Activity_1n5l3yg"] = State.Open;
            }
        } else if ((branch & (1 << 1)) != 0) {
            revert("End Event reached: Event_0zksck4, undefined");
        }
    }

    function Activity_11x0c4m()
        public
        payable
        isAccessible("Activity_11x0c4m")
    {
        uint256 branch = checkXOR_Gateway_0o9wgik();
        if ((branch & (1 << 0)) != 0) {
            Activity_0uoubyt();
            state["Activity_11x0c4m"] = State.Open;
        } else if ((branch & (1 << 1)) != 0) {
            revert("End Event reached: Event_1kukr8p, undefined");
        }
    }

    function Activity_0uoubyt() public payable {
        require(uint256(state["Activity_11x0c4m"]) == uint256(State.Open));

        uint amount = investors[msg.sender];
        payable(msg.sender).transfer(amount);
        investors[msg.sender] = 0;
        localStorage.totalAmount -= amount;
    }

    function Activity_1matq2v(uint goal) public payable {
        require(
            uint256(
                ILane_1kp4cd9_Contract(contracts["Lane_1kp4cd9_Contract"])
                    .getState("Activity_11erdqp")
            ) == uint256(State.Open)
        );

        localStorage.goal = goal * 1 ether;
    }

    function checkXOR_Gateway_10aocgk() public returns (uint256) {
        require(uint256(state["Activity_1n5l3yg"]) == uint256(State.Open));
        return
            ((localStorage.totalAmount >= localStorage.goal) ? (1 << 0) : 0) |
            ((localStorage.totalAmount < localStorage.goal) ? (1 << 1) : 0);
    }

    function checkXOR_Gateway_0o9wgik() public returns (uint256) {
        require(uint256(state["Activity_11x0c4m"]) == uint256(State.Open));
        return
            ((investors[msg.sender] != 0) ? (1 << 0) : 0) |
            ((investors[msg.sender] == 0) ? (1 << 1) : 0);
    }

    function checkXOR_Gateway_0ijdg26() public returns (uint256) {
        require(uint256(state["Activity_1n5l3yg"]) == uint256(State.Open));
        return
            ((localStorage.status == 0) ? (1 << 0) : 0) |
            ((localStorage.status != 0) ? (1 << 1) : 0);
    }
}
