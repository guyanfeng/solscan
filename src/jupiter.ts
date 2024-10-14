import { Wallet } from "@project-serum/anchor";
import { Connection, Keypair, RpcResponseAndContext, SignatureResult, VersionedTransaction } from "@solana/web3.js";
import bs58 from 'bs58';
import axios from "axios";
const config = require('../config');
import Logger from "./logger";
import { SwapResult } from "./definition";
import { randomUUID } from "crypto";
const logger = new Logger('jupiter');

const jupiterRpc = config.jupiterRpc;
async function getPrice(token: string): Promise<number> {
    if (config.dev){
        logger.info('dev mode, skip getPrice');
        return 0.01;
    }
    const url = `https://price.jup.ag/v6/price?ids=${token}`;
    const response = await axios.get(url);
    return response.data.data[token].price as number;
}

/**
 *  使用 jupiter 进行交换
 * @param swap 
 * @param to 
 * @param amount 
 * @param retry 重试次数，0开头
 * @returns 
 */
async function jupSwap(swap: string, to: string, amount: string, retry: number = 0): Promise<SwapResult> {
    if (config.dev){
        logger.info('dev mode, skip swap');
        return {success: true, tx: 'TestTx' + randomUUID(), errCode: ''};
    }
    if (!config.myWalletPrivateKey) {
        throw new Error('myWalletPrivateKey is not set');
    }
    const connection = new Connection(config.tradeRpc);

    const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(config.myWalletPrivateKey)));

    //具体参数见https://station.jup.ag/docs/apis/payments-api
    //以下设置自动滑点，并设置最大滑点为1000个基点 10%
    //如果失败一次，那么设置滑点固定为 10%
    let fetchUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${swap}&outputMint=${to}&amount=${amount}`;
    switch (retry) {
        case 0:
            fetchUrl += '&autoSlippage=true&maxAutoSlippageBps=1000';
            break;
        default:
            fetchUrl += '&autoSlippage=false&slippageBps=1000';
            break;
    }
    // const fetchUrl = `${jupiterRpc}/quote?inputMint=${swap}&outputMint=${to}&amount=${amount}&autoSlippage=true&maxAutoSlippageBps=1000`;
    const quoteResponse = await (
        await fetch(fetchUrl)).json();
    logger.debug(`call url: ${fetchUrl}`);

    if (quoteResponse.error) {
        throw new Error(quoteResponse.error);
    }

    interface SwapObj {
        quoteResponse: any;
        userPublicKey: string;
        wrapAndUnwrapSol: boolean;
        prioritizationFeeLamports: string | number | { autoMultiplier: number };
    }

    const swapObj: SwapObj = {
        quoteResponse,
        userPublicKey: wallet.publicKey.toString(),
        wrapAndUnwrapSol: true,
        prioritizationFeeLamports: 200000
    }
    switch (retry) {
        case 1:
            swapObj.prioritizationFeeLamports = 1000000;
            break;
        case 2:
            swapObj.prioritizationFeeLamports = 1500000;
            break;
    }
    logger.debug(`swapObj: ${JSON.stringify(swapObj)}`);
    // get serialized transactions for the swap
    const { swapTransaction } = await (
        await fetch(`${jupiterRpc}/swap`, {
            // await fetch(`${jupiterRpc}/v6/swap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(
                swapObj
            )
        })
    ).json();

    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    // console.log(transaction);

    // sign the transaction
    transaction.sign([wallet.payer]);

    // Execute the transaction
    const rawTransaction = transaction.serialize();
    const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2
    });

    // 有三种结果，1 是超时， 2 是成功， 3 是失败
    // 超时时触发 TransactionExpiredTimeoutError，默认在 60 秒后触发
    // 这是失败的报文 {"context":{"slot":293757123},"value":{"err":{"InstructionError":[3,{"Custom":1}]}}}
    // 这是成功的报文 {"context":{"slot":293757046},"value":{"err":null}}
    // 如果返回超时，不代表交易失败，只是超时了，可以继续等待确认
    // 对于调用者来说，返回超时和成功，需要继续等待确认，如果返回失败，则可以直接返回失败

    // Custom 为 40 表示余额不足 {"context":{"slot":294536746},"value":{"err":{"InstructionError":[2,{"Custom":40}]}}}
    const result: SwapResult = { success: true, tx: txid, errCode: '' };
    try {
        const latestBlockHash = await connection.getLatestBlockhash();
        const confirmResult = await connection.confirmTransaction({
            blockhash: latestBlockHash.blockhash,
            lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            signature: txid,
        });
        logger.debug(`confirmTransaction result: ${JSON.stringify(confirmResult)}`);
        if (confirmResult.value.err) {
            result.success = false;
            // 具体的错误值
            result.errCode = generateErrCode(confirmResult);
            return result;
        }
    } catch (e) {
        logger.error(`confirmTransaction error: ${e}`);
    }
    logger.debug(`tx: ${txid}, result: ${JSON.stringify(result)}`);
    return result;
}

// 提取错误码
function generateErrCode(obj:any) {
    try {
      // 使用可选链操作符 (?.) 来安全地访问可能不存在的属性
      const instructionError = obj.value?.err?.InstructionError;
      if (!Array.isArray(instructionError) || instructionError.length < 2) {
        throw new Error('Invalid InstructionError format');
      }
  
      const instructionErrorCode = instructionError[0];
      const customCode = instructionError[1]?.Custom;
  
      // 检查是否成功获取到了两个所需的值
      if (typeof instructionErrorCode !== 'number' || typeof customCode !== 'number') {
        throw new Error('Missing required values');
      }
  
      return `${customCode}`;
    } catch (error:any) {
      console.error('Error generating error code:', error.message);
      return '';
    }
  }

export { getPrice, jupSwap };