/* External Imports */
import { Contract } from 'ethers'

export interface MockContractFunction {
  functionName: string
  inputTypes?: string[]
  outputTypes?: string[]
  returnValues?: any[] | ((...params: any[]) => any[])
}

export interface MockContract extends Contract {
  getCallCount: (functionName: string) => number
  getCallData: (functionName: string, callIndex: number) => any[]
  __fns: {
    [sighash: string]: MockContractFunction
  }
}
