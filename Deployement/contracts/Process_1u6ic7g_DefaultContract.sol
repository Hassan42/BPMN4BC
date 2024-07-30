// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Process_1u6ic7g_DefaultContract {
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

    modifier isSender(address _sender) {
        require(msg.sender == _sender, "Not the sender");
        _;
    }

    constructor() {
        state["Activity_00bmswp"] = State.Closed;
    }

    function setContracts(address[] memory addresses) public {}

    function setState(string memory _activity, uint8 _state) public {
        require(_state <= 3, "Not Valid State");
        state[_activity] = State(_state);
    }

    function Activity_00bmswp()
        public
        isSender(test)
        isOpen("Activity_00bmswp")
    {
        state["Activity_00bmswp"] = State.Completed;
    }
}
