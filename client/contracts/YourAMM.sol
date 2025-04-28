// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

contract YourAMM {
  // deposit function
  function depositETH() external payable {}

  // withdraw function
  function withdrawETH(uint256 amount) external {
    require(address(this).balance >= amount, "Insufficient balance");
    payable(msg.sender).transfer(amount);
  }
}
