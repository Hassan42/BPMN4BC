// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Process_1_DefaultContract {
    enum State {
        Closed,
        Open,
        Completed
    }
    mapping(string => State) public state;

    mapping(string => address) public contracts;

    modifier isOpen(string memory _activity) {
        require(state[_activity] == State.Open, "Activity is not open");
        _;
    }

    constructor(address[] memory addresses) {
        state["Activity_0or79ow"] = State.Open;
    }

    function setState(string memory _activity, uint8 _state) public {
        require(_state <= 3, "Not Valid State");
        state[_activity] = State(_state);
    }

    function Activity_0or79ow() public isOpen("Activity_0or79ow") {
        if (localStorage.p2 > 3) {
            Activity_0s5co9l();
        } else {
            Activity_1pq06pu();
        }

        state["Activity_0or79ow"] = State.Completed;
    }

    function Activity_0s5co9l() public {}

    function Activity_1pq06pu() public {}
}
