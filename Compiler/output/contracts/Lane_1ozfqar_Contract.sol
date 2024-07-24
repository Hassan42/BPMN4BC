// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "../interfaces/ILane_1ozfqar_Contract.sol";
contract Lane_1ozfqar_Contract {
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

    struct LocalStorage {
        uint p1;
        uint p2;
    }
    LocalStorage public localStorage;

    constructor(address[] memory addresses) {
        state["Activity_1vyo8jt"] = State.Open;
        contracts["Lane_1ozfqar_Contract"] = addresses[0];
    }

    function setState(string memory _activity, uint8 _state) public {
        require(_state <= 3, "Not Valid State");
        state[_activity] = State(_state);
    }

    function Activity_18ch3uu() public {}

    function Activity_1lmivzj() public {}

    function Activity_02k9g7g() public {}

    function Activity_1vyo8jt() public isOpen("Activity_1vyo8jt") {
        localStorage.p1 = 4;
        localStorage.p2 = 2;

        if (localStorage.p1 > 1) {
            Activity_18ch3uu();
        } else if (localStorage.p2 > 2) {
            Activity_1lmivzj();
        } else {
            Activity_02k9g7g();
        }

        state["Activity_1vyo8jt"] = State.Completed;
    }
}
