// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./ILane_0njnftu_Contract.sol";
import "./ILane_0596vln_Contract.sol";
contract Lane_0njnftu_Contract {
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

    struct LocalStorage {
        uint varA;
        uint varB;
    }
    LocalStorage public localStorage;

    constructor() {
        state["Activity_0n0iqht"] = State.Open;
        localStorage.varB = 2;
    }

    function setContracts(address[] memory addresses) public {
        contracts["Lane_0njnftu_Contract"] = addresses[0];
        contracts["Lane_0596vln_Contract"] = addresses[1];
    }

    function getVarA() public view returns (uint) {
        return localStorage.varA;
    }

    function getVarB() public view returns (uint) {
        return localStorage.varB;
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

    function Activity_0n0iqht(
        uint varC
    ) public isAccessible("Activity_0n0iqht", "Participant1") {
        Activity_0twexfp(varC);

        if (
            !ILane_0596vln_Contract(contracts["Lane_0596vln_Contract"])
                .checkGateway_Gateway_1xdxejg()
        ) {
            state["Activity_0n0iqht"] = State.Completed;
            return;
        }
        uint varD;
        (varD) = ILane_0596vln_Contract(contracts["Lane_0596vln_Contract"])
            .Activity_1dpwadr();
        ILane_0596vln_Contract(contracts["Lane_0596vln_Contract"])
            .emit_Event_0gsykkh();
        ILane_0596vln_Contract(contracts["Lane_0596vln_Contract"]).setState(
            "Activity_0a3i83j",
            1
        );

        state["Activity_0n0iqht"] = State.Completed;
    }

    function Activity_0twexfp(uint varC) public {
        localStorage.varA = varC;
    }
}
