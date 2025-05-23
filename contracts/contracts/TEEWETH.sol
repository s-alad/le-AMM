// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TEEWETH
 * @dev A simple WETH (Wrapped Ether) implementation for testing
 */
contract TEEWETH is ERC20 {
    constructor() ERC20("Wrapped Ether", "WETH") {}

    // Deposit ETH and receive WETH tokens
    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    // Burn WETH tokens and receive ETH
    function withdraw(uint256 amount) external {
        require(balanceOf(msg.sender) >= amount, "TEEWETH: insufficient balance");
        _burn(msg.sender, amount);
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "TEEWETH: ETH transfer failed");
    }

    // Ensure the contract can receive ETH
    receive() external payable {}
}