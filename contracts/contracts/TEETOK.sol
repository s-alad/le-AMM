// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TEETOK
 * @dev A simple ERC20 token implementation for testing
 */
contract TEETOK is ERC20, Ownable {
    constructor(
        string memory name, 
        string memory symbol
    ) ERC20(name, symbol) Ownable(msg.sender) {}

    /**
     * @dev Mints tokens to a specified account
     * @param to The address that will receive the minted tokens
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
} 