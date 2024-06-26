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
    // Logic for Event_1dds2x5

    event Event_06ev6l6();

    // Logic for Event_0i7t51l

    constructor(address[] memory addresses) {
        state["Activity_1wps2m8"] = State.Open;
    }

    function setState(string memory _activity, uint8 _state) public {
        require(_state <= 3, "Not Valid State");
        state[_activity] = State(_state);
    }

    function Activity_1wps2m8() public isOpen("Activity_1wps2m8") {
        emit Event_06ev6l6();
        revert("End Event reached: Event_0i7t51l");

        state["Activity_1wps2m8"] = State.Completed;
    }
}
