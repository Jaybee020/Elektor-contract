// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IncrementalBinaryTree.sol";


contract Tree{
    using IncrementalBinaryTree for IncrementalTreeData;
    IncrementalTreeData public tree;
    mapping(uint256 => uint256) public roots;//to store previous roots
    uint32 public constant ROOT_HISTORY_SIZE = 24;
    uint32 public currentRootIndex = 0;

    constructor(uint256 _depth){
        tree.initWithDefaultZeroes(_depth);
    }
     function getIndex() public view returns(uint256){
        return tree.numberOfLeaves;
    }

    function getDepth()public view returns(uint256){
        return tree.depth;
    }

    function getRoot()public view returns(uint256){
        return tree.root;
    }


    function isKnownRoot(uint256 _root) public view returns (bool) {
    if (_root == 0) {
      return false;
    }
    uint32 _currentRootIndex = currentRootIndex;
    uint32 i = _currentRootIndex;
    do {
      if (_root == roots[i]) {
        return true;
      }
      if (i == 0) {
        i = ROOT_HISTORY_SIZE;
      }
      i--;
    } while (i != _currentRootIndex);
    return false;
  }

  function insertLeaf(uint256 _leaf)internal returns (uint256){
    uint256 root=tree.insert(_leaf);
    uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
    currentRootIndex = newRootIndex;
    roots[newRootIndex] = root;
    return root;
  }


}
