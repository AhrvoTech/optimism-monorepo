pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

/* Interface Imports */
import { IL1MessageSender } from "./L1MessageSender.interface.sol";

/* Contract Imports */
import { ExecutionManager } from "../ExecutionManager.sol";

/**
 * @title L1MessageSender
 */
contract L1MessageSender is IL1MessageSender {
    /*
     * Contract Variables
     */

    ExecutionManager private executionManager;


    /*
     * Constructor
     */

    /**
     * @param _executionManagerAddress Address of the ExecutionManager contract.
     */
    constructor(
        address _executionManagerAddress
    )
        public
    {
        executionManager = ExecutionManager(_executionManagerAddress);
    }


    /*
     * Public Functions
     */

    /**
     * @return L1 message sender address (msg.sender).
     */
    function getL1MessageSender()
        public
        returns (address)
    {
        return executionManager.getL1MessageSender();
    }
}