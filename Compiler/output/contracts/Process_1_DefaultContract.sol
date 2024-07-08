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

    event Event_1u7oaso();

    constructor(address[] memory addresses) {
        state["Activity_09vj509"] = State.Open;
        state["Activity_12fgwl3"] = State.Open;
    }

    function setState(string memory _activity, uint8 _state) public {
        require(_state <= 3, "Not Valid State");
        state[_activity] = State(_state);
    }

    function Activity_09vj509() public isOpen("Activity_09vj509") {
        Activity_0dgknha();
        emit Event_1u7oaso();

        state["Activity_09vj509"] = State.Completed;
    }

    function Activity_0dgknha() public {}

    function Activity_12fgwl3() public isOpen("Activity_12fgwl3") {
        state["Activity_12fgwl3"] = State.Completed;
    }
}
