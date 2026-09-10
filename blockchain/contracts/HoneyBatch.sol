// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract HoneyBatch {
    string public greeting = "NectarTrace is alive";

    function setGreeting(string memory _newGreeting) public {
        greeting = _newGreeting;
    }

    function getGreeting() public view returns (string memory) {
        return greeting;
    }
}