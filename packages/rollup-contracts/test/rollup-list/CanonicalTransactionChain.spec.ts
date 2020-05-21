import '../setup'

/* External Imports */
import { getLogger } from '@eth-optimism/core-utils'
import { createMockProvider, deployContract, getWallets } from 'ethereum-waffle'
import { Contract } from 'ethers'

/* Internal Imports */
import { DefaultRollupBatch, RollupQueueBatch } from './RLhelper'

/* Logging */
const log = getLogger('rollup-tx-queue', true)

/* Contract Imports */
import * as CanonicalTransactionChain from '../../build/CanonicalTransactionChain.json'
import * as L1ToL2TransactionQueue from '../../build/L1ToL2TransactionQueue.json'
import * as RollupMerkleUtils from '../../build/RollupMerkleUtils.json'

/* Begin tests */
describe('CanonicalTransactionChain', () => {
  const provider = createMockProvider()
  const [
    wallet,
    sequencer,
    canonicalTransactionChain,
    l1ToL2TransactionPasser,
  ] = getWallets(provider)
  let canonicalTxChain
  let rollupMerkleUtils

  /* Link libraries before tests */
  before(async () => {
    rollupMerkleUtils = await deployContract(wallet, RollupMerkleUtils, [], {
      gasLimit: 6700000,
    })
  })

  /* Deploy a new RollupChain before each test */
  beforeEach(async () => {
    canonicalTxChain = await deployContract(
      wallet,
      CanonicalTransactionChain,
      [
        rollupMerkleUtils.address,
        sequencer.address,
        l1ToL2TransactionPasser.address,
        600, //600 seconds = 10 min
      ],
      {
        gasLimit: 6700000,
      }
    )
  })
  const appendBatch = async (batch: string[]): Promise<number> => {
    const timestamp = Math.floor(Date.now() / 1000)
    // Submit the rollup batch on-chain
    await canonicalTxChain
      .connect(sequencer)
      .appendTransactionBatch(batch, timestamp)
    return timestamp
  }
  const appendAndGenerateBatch = async (
    batch: string[],
    batchIndex: number,
    cumulativePrevElements: number
  ): Promise<DefaultRollupBatch> => {
    const timestamp = await appendBatch(batch)
    // Generate a local version of the rollup batch
    const localBatch = new DefaultRollupBatch(
      timestamp,
      false,
      batchIndex,
      cumulativePrevElements,
      batch
    )
    await localBatch.generateTree()
    return localBatch
  }

  /*
   * Test appendTransactionBatch()
   */
  describe('appendTransactionBatch()', async () => {
    it('should not throw as long as it gets a bytes array (even if its invalid)', async () => {
      const batch = ['0x1234', '0x1234']
      await appendBatch(batch)
    })

    it('should throw if submitting an empty batch', async () => {
      const emptyBatch = []
      await appendBatch(emptyBatch).should.be.revertedWith(
        'VM Exception while processing transaction: revert Cannot submit an empty batch'
      )
    })

    it('should add to batches array', async () => {
      const batch = ['0x1234', '0x6578']
      await appendBatch(batch)
      const batchesLength = await canonicalTxChain.getBatchesLength()
      batchesLength.toNumber().should.equal(1)
    })

    it('should update cumulativeNumElements correctly', async () => {
      const batch = ['0x1234', '0x5678']
      await appendBatch(batch)
      const cumulativeNumElements = await canonicalTxChain.cumulativeNumElements.call()
      cumulativeNumElements.toNumber().should.equal(2)
    })
    it('should allow appendTransactionBatch from sequencer', async () => {
      const batch = ['0x1234', '0x6578']
      await appendBatch(batch)
    })
    it('should not allow appendTransactionBatch from non-sequencer', async () => {
      const batch = ['0x1234', '0x6578']
      const timestamp = Math.floor(Date.now() / 1000)
      // Submit the rollup batch on-chain
      await canonicalTxChain
        .appendTransactionBatch(batch, timestamp)
        .should.be.revertedWith(
          'VM Exception while processing transaction: revert Message sender does not have permission to append a batch'
        )
    })
    it('should calculate batchHeaderHash correctly', async () => {
      const batch = ['0x1234', '0x5678']
      const batchIndex = 0
      const cumulativePrevElements = 0
      const localBatch = await appendAndGenerateBatch(
        batch,
        batchIndex,
        cumulativePrevElements
      )
      //Check batchHeaderHash
      const expectedBatchHeaderHash = await localBatch.hashBatchHeader()
      const calculatedBatchHeaderHash = await canonicalTxChain.batches(0)
      calculatedBatchHeaderHash.should.equal(expectedBatchHeaderHash)
    })
    it('should add multiple batches correctly', async () => {
      const batch = ['0x1234', '0x5678']
      const numBatchs = 10
      for (let batchIndex = 0; batchIndex < numBatchs; batchIndex++) {
        const cumulativePrevElements = batch.length * batchIndex
        const localBatch = await appendAndGenerateBatch(
          batch,
          batchIndex,
          cumulativePrevElements
        )
        //Check batchHeaderHash
        const expectedBatchHeaderHash = await localBatch.hashBatchHeader()
        const calculatedBatchHeaderHash = await canonicalTxChain.batches(
          batchIndex
        )
        calculatedBatchHeaderHash.should.equal(expectedBatchHeaderHash)
      }
      //check cumulativeNumElements
      const cumulativeNumElements = await canonicalTxChain.cumulativeNumElements.call()
      cumulativeNumElements.toNumber().should.equal(numBatchs * batch.length)
      //check batches length
      const batchesLength = await canonicalTxChain.getBatchesLength()
      batchesLength.toNumber().should.equal(numBatchs)
    })
  })

  describe('appendL1ToL2Batch()', async () => {
    let l1ToL2Queue
    const localL1ToL2Queue = []
    const tx = '0x1234'
    const enqueueAndGenerateBatch = async (
      _tx: string
    ): Promise<RollupQueueBatch> => {
      // Submit the rollup batch on-chain
      const enqueueTx = await l1ToL2Queue
        .connect(l1ToL2TransactionPasser)
        .enqueueTx(_tx)
      const txReceipt = await provider.getTransactionReceipt(enqueueTx.hash)
      const timestamp = (await provider.getBlock(txReceipt.blockNumber))
        .timestamp
      // Generate a local version of the rollup batch
      const localBatch = new RollupQueueBatch(_tx, timestamp)
      await localBatch.generateTree()
      return localBatch
    }
    beforeEach(async () => {
      const l1ToL2QueueAddress = await canonicalTxChain.l1ToL2Queue()
      l1ToL2Queue = new Contract(
        l1ToL2QueueAddress,
        L1ToL2TransactionQueue.abi,
        provider
      )
      const localBatch = await enqueueAndGenerateBatch(tx)
      localL1ToL2Queue.push(localBatch)
    })
    it('should successfully dequeue a L1ToL2Batch', async () => {
      await canonicalTxChain.connect(sequencer).appendL1ToL2Batch()
      const front = await l1ToL2Queue.front()
      front.should.equal(1)
      const { timestamp, txHash } = await l1ToL2Queue.batches(0)
      timestamp.should.equal(0)
      txHash.should.equal(
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      )
    })
    it('should successfully append a L1ToL2Batch', async () => {
      const { timestamp, txHash } = await l1ToL2Queue.batches(0)
      const localBatch = new DefaultRollupBatch(
        timestamp,
        true, // isL1ToL2Tx
        0, //batchIndex
        0, // cumulativePrevElements
        [tx] // elements
      )
      await localBatch.generateTree()
      const localBatchHeaderHash = await localBatch.hashBatchHeader()
      await canonicalTxChain.connect(sequencer).appendL1ToL2Batch()
      const batchHeaderHash = await canonicalTxChain.batches(0)
      batchHeaderHash.should.equal(localBatchHeaderHash)
    })
    it('should now allow non-sequencer to appendL1ToL2Batch if less than 10 minutes old', async () => {
      await canonicalTxChain
        .appendL1ToL2Batch()
        .should.be.revertedWith(
          'VM Exception while processing transaction: revert Message sender does not have permission to append this batch'
        )
    })
  })

  describe('verifyElement() ', async () => {
    it('should return true for valid elements for different batchIndexes', async () => {
      const maxBatchNumber = 5
      const minBatchNumber = 0
      const batch = ['0x1234', '0x4567', '0x890a', '0x4567', '0x890a', '0xabcd']
      for (
        let batchIndex = minBatchNumber;
        batchIndex < maxBatchNumber + 1;
        batchIndex++
      ) {
        const timestamp = batchIndex
        const cumulativePrevElements = batch.length * batchIndex
        const localBatch = await appendAndGenerateBatch(
          batch,
          batchIndex,
          cumulativePrevElements
        )
        // Create inclusion proof for the element at elementIndex
        const elementIndex = 3
        const element = batch[elementIndex]
        const position = localBatch.getPosition(elementIndex)
        const elementInclusionProof = await localBatch.getElementInclusionProof(
          elementIndex
        )
        const isIncluded = await canonicalTxChain.verifyElement(
          element,
          position,
          elementInclusionProof
        )
        isIncluded.should.equal(true)
      }
    })

    it('should return false for wrong position with wrong indexInBatch', async () => {
      const batch = ['0x1234', '0x4567', '0x890a', '0x4567', '0x890a', '0xabcd']
      const cumulativePrevElements = 0
      const batchIndex = 0
      const timestamp = 0
      const localBatch = await appendAndGenerateBatch(
        batch,
        batchIndex,
        cumulativePrevElements
      )
      const elementIndex = 1
      const element = batch[elementIndex]
      const position = localBatch.getPosition(elementIndex)
      const elementInclusionProof = await localBatch.getElementInclusionProof(
        elementIndex
      )
      //Give wrong position so inclusion proof is wrong
      const wrongPosition = position + 1
      const isIncluded = await canonicalTxChain.verifyElement(
        element,
        wrongPosition,
        elementInclusionProof
      )
      isIncluded.should.equal(false)
    })

    it('should return false for wrong position and matching indexInBatch', async () => {
      const batch = ['0x1234', '0x4567', '0x890a', '0xabcd']
      const cumulativePrevElements = 0
      const batchIndex = 0
      const timestamp = 0
      const localBatch = await appendAndGenerateBatch(
        batch,
        batchIndex,
        cumulativePrevElements
      )
      //generate inclusion proof
      const elementIndex = 1
      const element = batch[elementIndex]
      const position = localBatch.getPosition(elementIndex)
      const elementInclusionProof = await localBatch.getElementInclusionProof(
        elementIndex
      )
      //Give wrong position so inclusion proof is wrong
      const wrongPosition = position + 1
      //Change index to also be false (so position = index + cumulative)
      elementInclusionProof.indexInBatch++
      const isIncluded = await canonicalTxChain.verifyElement(
        element,
        wrongPosition,
        elementInclusionProof
      )
      isIncluded.should.equal(false)
    })
  })
})
