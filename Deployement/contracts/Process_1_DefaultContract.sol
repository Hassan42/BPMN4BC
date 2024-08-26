// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Process_1_DefaultContract {
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

    event Event_1d691ho();

    struct LocalStorage {
        uint ReserveA;
        uint ReserveB;
    }
    LocalStorage public localStorage;

    constructor() {
        state["Activity_0hg1f91"] = State.Open;
        localStorage.ReserveA = 100;
        localStorage.ReserveB = 100;
    }

    function setContracts(address[] memory addresses) public {}

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

    function Activity_15dqul7(uint _amountIn) public view returns (uint) {
        require(_amountIn > 0, " INSUFFICIENT_INPUT_AMOUNT");

        uint amountOut;

        amountOut = (_amountIn * localStorage.ReserveB) / localStorage.ReserveA;
        return (amountOut);
    }

    function Activity_0hg1f91(
        uint _deadline,
        uint _amountIn,
        uint _minAmountOut
    ) public isAccessible("Activity_0hg1f91", "User") {
        if (_deadline >= block.timestamp) {
            uint amountOut;
            (amountOut) = Activity_15dqul7(_amountIn);
            if (amountOut > _minAmountOut) {
                Activity_11u68g6(amountOut, _amountIn);
                emit Event_1d691ho();
            } else {
                revert(
                    "End Event reached: Event_0lvec7f, Amount is less than minimum"
                );
            }
        } else {
            revert("End Event reached: Event_06wt5e1, Deadline reached");
        }

        state["Activity_0hg1f91"] = State.Completed;
    }

    function Activity_11u68g6(uint amountOut, uint _amountIn) public {
        localStorage.ReserveB -= amountOut;
        localStorage.ReserveA += _amountIn;
    }
}
