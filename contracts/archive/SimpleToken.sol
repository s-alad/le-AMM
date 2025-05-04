// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SimpleToken is ERC20, Ownable {
    // Constructor sets the token name and symbol
    constructor(string memory name, string memory symbol) 
        ERC20(name, symbol) 
        Ownable(msg.sender) 
    {}
    
    // Function to mint new tokens to any address
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
    
    // Optional: Add a burn function
    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }
}