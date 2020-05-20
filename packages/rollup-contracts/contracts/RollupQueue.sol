pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

/* Internal Imports */
import {DataTypes as dt} from "./DataTypes.sol";
import {RollupMerkleUtils} from "./RollupMerkleUtils.sol";

contract RollupQueue {
  // How many elements in total have been appended
  uint public cumulativeNumElements;
  // List of batch header hashes
  dt.TimestampedHash[] public batches;
  uint256 public front; //Index of the first batchHeaderHash in the list

  // The Rollup Merkle Tree library (currently a contract for ease of testing)
  RollupMerkleUtils merkleUtils;

  /***************
   * Constructor *
   **************/
  constructor(address _rollupMerkleUtilsAddress) public {
    merkleUtils = RollupMerkleUtils(_rollupMerkleUtilsAddress);
    front = 0;
  }
  // for testing: returns length of batch list
  function getBatchesLength() public view returns (uint) {
    return batches.length;
  }

  function getFrontBatch() public view returns (dt.TimestampedHash memory) {
    require(front < batches.length, "Cannot get front batch from an empty queue");
    return batches[front];
  }

  function hashBatchHeader(
    dt.TxQueueBatchHeader memory _batchHeader
  ) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(
      _batchHeader.elementsMerkleRoot,
      _batchHeader.numElementsInBatch
    ));
  }

  function authenticateEnqueue(address _sender) public view returns (bool) { return true; }
  function authenticateDequeue(address _sender) public view returns (bool) { return true; }

  // enqueues to the end of the current queue of batches
  function enqueueBatch(bytes[] memory _rollupBatch) public {
    //Check that msg.sender is authorized to append
    require(authenticateEnqueue(msg.sender), "Message sender does not have permission to enqueue");
    require(_rollupBatch.length > 0, "Cannot submit an empty batch");
    // calculate batch header
    bytes32 batchHeaderHash = keccak256(
      abi.encodePacked(
        merkleUtils.getMerkleRoot(_rollupBatch), // elementsMerkleRoot
        _rollupBatch.length // numElementsInBatch
      )
    );
    dt.TimestampedHash memory timestampedBatchHeaderHash = dt.TimestampedHash(now, batchHeaderHash);
    // store batch header
    batches.push(timestampedBatchHeaderHash);
    // update cumulative elements
    cumulativeNumElements += _rollupBatch.length;
  }

  // dequeues the first (oldest) batch
  // Note: keep in mind that front can point to a non-existent batch if the list is empty.
  function dequeueBatch() public {
    require(authenticateDequeue(msg.sender), "Message sender does not have permission to dequeue");
    require(front < batches.length, "Cannot dequeue from an empty queue");
    delete batches[front];
    front++;
  }
}
