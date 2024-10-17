import { Wallet } from "@project-serum/anchor";
import { Connection, Keypair, RpcResponseAndContext, SignatureResult, Transaction, VersionedTransaction, VersionedTransactionResponse } from "@solana/web3.js";
import bs58 from 'bs58';
import axios from "axios";
const config = require('../config');
import Logger from "./logger";
import { SwapResult } from "./definition";
import { randomUUID } from "crypto";
import { createJupiterApiClient, QuoteGetRequest } from "@jup-ag/api";
import { transactionSenderAndConfirmationWaiter } from "./transactionSender";
const logger = new Logger('jupiter');

const jupiterRpc = config.jupiterRpc;
const jitoRpc = config.jitoRpc;

const jupiterQuoteApi = createJupiterApiClient();

async function getPrice(token: string): Promise<number> {
    if (config.dev) {
        logger.info('dev mode, skip getPrice');
        return 0.01;
    }
    const url = `https://price.jup.ag/v6/price?ids=${token}`;
    const response = await axios.get(url);
    return response.data.data[token].price as number;
}

function getSignature(
    transaction: Transaction | VersionedTransaction
): string | undefined {
    let signature: Buffer | Uint8Array | null = null;
    signature =
        "signature" in transaction
            ? transaction.signature
            : transaction.signatures[0];
    if (!signature) {
        return undefined;
    }
    return bs58.encode(signature as Uint8Array);
}

async function jupSwap(swap: string, to: string, amount: string, retry: number = 0): Promise<VersionedTransactionResponse> {
    if (!config.myWalletPrivateKey) {
        throw new Error('myWalletPrivateKey is not set');
    }
    const connection = new Connection(config.tradeRpc);

    const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(config.myWalletPrivateKey)));

    const params: QuoteGetRequest = {
        inputMint: swap,
        outputMint: to,
        amount: parseInt(amount),
        autoSlippage: true,
        autoSlippageCollisionUsdValue: 1_000,
        maxAutoSlippageBps: 1000, // 10%
        minimizeSlippage: true,
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
    };

    // get quote
    const quote = await jupiterQuoteApi.quoteGet(params);

    if (!quote) {
        logger.error('Failed to get quote');
        throw new Error('Failed to get quote');
    }
    logger.debug(`quote: ${JSON.stringify(quote)}`);
    //修改 quote 中的滑点
    if (quote.computedAutoSlippage) {
        quote.slippageBps = Math.min(quote.computedAutoSlippage, 1000);
    }
    const swapObj = await jupiterQuoteApi.swapPost({
        swapRequest: {
            quoteResponse: quote,
            userPublicKey: wallet.publicKey.toBase58(),
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: "auto",
        },
    });

    // Serialize the transaction
    const swapTransactionBuf = Buffer.from(swapObj.swapTransaction, "base64");
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // Sign the transaction
    transaction.sign([wallet.payer]);
    const signature = getSignature(transaction);
    if (!signature) {
        logger.error('Failed to get signature');
        throw new Error('Failed to get signature');
    }

    logger.debug(`signature: ${signature}`);

    // We first simulate whether the transaction would be successful
    const { value: simulatedTransactionResponse } =
        await connection.simulateTransaction(transaction, {
            replaceRecentBlockhash: true,
            commitment: "processed",
        });
    const { err, logs } = simulatedTransactionResponse;

    if (err) {
        // Simulation error, we can check the logs for more details
        // If you are getting an invalid account error, make sure that you have the input mint account to actually swap from.
        logger.error("Simulation Error:");
        logger.error({ err, logs });
        throw new Error('Simulation Error');
    }

    const serializedTransaction = Buffer.from(transaction.serialize());
    const blockhash = transaction.message.recentBlockhash;

    const transactionResponse = await transactionSenderAndConfirmationWaiter({
        connection,
        serializedTransaction,
        blockhashWithExpiryBlockHeight: {
            blockhash,
            lastValidBlockHeight: swapObj.lastValidBlockHeight,
        },
    });

    // If we are not getting a response back, the transaction has not confirmed.
    if (!transactionResponse) {
        logger.error("Transaction not confirmed");
        throw new Error('Transaction not confirmed');
    }

    if (transactionResponse.meta?.err) {
        logger.error("Transaction Error:");
        logger.error(transactionResponse.meta?.err);
        throw new Error('Transaction Error');
    }
    return transactionResponse;
}

/**
 *  使用 jupiter 进行交换
 * @param swap 
 * @param to 
 * @param amount 
 * @param retry 重试次数，0开头
 * @returns 
 */
// async function jupSwap(swap: string, to: string, amount: string, retry: number = 0): Promise<SwapResult> {
//     if (config.dev) {
//         logger.info('dev mode, skip swap');
//         return { success: true, tx: 'TestTx' + randomUUID(), errCode: '' };
//     }
//     if (!config.myWalletPrivateKey) {
//         throw new Error('myWalletPrivateKey is not set');
//     }
//     const connection = new Connection(config.tradeRpc);

//     const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(config.myWalletPrivateKey)));

//     //具体参数见https://station.jup.ag/docs/apis/payments-api
//     //以下设置自动滑点，并设置最大滑点为1000个基点 10%
//     //如果失败一次，那么设置滑点固定为 10%
//     let fetchUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${swap}&outputMint=${to}&amount=${amount}`;
//     switch (retry) {
//         case 0:
//             fetchUrl += '&autoSlippage=true&maxAutoSlippageBps=1000';
//             break;
//         default:
//             fetchUrl += '&autoSlippage=false&slippageBps=1000';
//             break;
//     }
//     // const fetchUrl = `${jupiterRpc}/quote?inputMint=${swap}&outputMint=${to}&amount=${amount}&autoSlippage=true&maxAutoSlippageBps=1000`;
//     const quoteResponse = await (
//         await fetch(fetchUrl)).json();
//     logger.debug(`call url: ${fetchUrl}`);

//     if (quoteResponse.error) {
//         throw new Error(quoteResponse.error);
//     }

//     interface SwapObj {
//         quoteResponse: any;
//         userPublicKey: string;
//         wrapAndUnwrapSol: boolean;
//         prioritizationFeeLamports: string | number | { autoMultiplier: number };
//     }

//     const swapObj: SwapObj = {
//         quoteResponse,
//         userPublicKey: wallet.publicKey.toString(),
//         wrapAndUnwrapSol: true,
//         prioritizationFeeLamports: 200000
//     }
//     switch (retry) {
//         case 1:
//             swapObj.prioritizationFeeLamports = 1000000;
//             break;
//         case 2:
//             swapObj.prioritizationFeeLamports = 1500000;
//             break;
//     }
//     logger.debug(`swapObj: ${JSON.stringify(swapObj)}`);
//     // get serialized transactions for the swap
//     const { swapTransaction } = await (
//         await fetch(`${jupiterRpc}/swap`, {
//             // await fetch(`${jupiterRpc}/v6/swap`, {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json'
//             },
//             body: JSON.stringify(
//                 swapObj
//             )
//         })
//     ).json();

//     // deserialize the transaction
//     const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
//     var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
//     // 获取最新的 blockhash 从 Jito RPC
//     const { data: blockhashData } = await axios.post(jitoRpc, {
//         jsonrpc: '2.0',
//         id: 1,
//         method: 'getLatestBlockhash',
//         params: []
//     });
//     const blockhash = blockhashData.result.value.blockhash;
//     transaction.message.recentBlockhash = blockhash;

//     // sign the transaction
//     transaction.sign([wallet.payer]);

//     // 序列化签名后的交易
//     const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');

//     const result: SwapResult = { success: true, tx: '', errCode: '' };
//     // 发送交易到 Jito RPC
//     const { data: txData } = await axios.post(jitoRpc, {
//         jsonrpc: '2.0',
//         id: 1,
//         method: 'sendTransaction',
//         params: [serializedTransaction, { encoding: 'base64', maxRetries: 5 }]
//     });

//     const txid = txData.result;
//     console.log('交易成功，交易ID:', txid);

//     // Execute the transaction
//     // const rawTransaction = transaction.serialize();
//     // const txid = await connection.sendRawTransaction(rawTransaction, {
//     //     skipPreflight: true,
//     //     maxRetries: 2
//     // });

//     // // 有三种结果，1 是超时， 2 是成功， 3 是失败
//     // // 超时时触发 TransactionExpiredTimeoutError，默认在 60 秒后触发
//     // // 这是失败的报文 {"context":{"slot":293757123},"value":{"err":{"InstructionError":[3,{"Custom":1}]}}}
//     // // 这是成功的报文 {"context":{"slot":293757046},"value":{"err":null}}
//     // // 如果返回超时，不代表交易失败，只是超时了，可以继续等待确认
//     // // 对于调用者来说，返回超时和成功，需要继续等待确认，如果返回失败，则可以直接返回失败

//     // // Custom 为 40 表示余额不足 {"context":{"slot":294536746},"value":{"err":{"InstructionError":[2,{"Custom":40}]}}}
//     // try {
//     //     const latestBlockHash = await connection.getLatestBlockhash();
//     //     const confirmResult = await connection.confirmTransaction({
//     //         blockhash: latestBlockHash.blockhash,
//     //         lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
//     //         signature: txid,
//     //     });
//     //     logger.debug(`confirmTransaction result: ${JSON.stringify(confirmResult)}`);
//     //     if (confirmResult.value.err) {
//     //         result.success = false;
//     //         // 具体的错误值
//     //         result.errCode = generateErrCode(confirmResult);
//     //         return result;
//     //     }
//     // } catch (e) {
//     //     logger.error(`confirmTransaction error: ${e}`);
//     // }
//     logger.debug(`tx: ${txid}, result: ${JSON.stringify(result)}`);
//     return result;
// }

// 提取错误码
function generateErrCode(obj: any) {
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
    } catch (error: any) {
        logger.error(`Error generating error code: ${error.message}`);
        return '';
    }
}

export { getPrice, jupSwap, getSignature };

// (async () => {
//     const swapResult = await jupSwap2('7bCTaMF64WrhqyDqwri9XMsXsufEKGjUByDLnXGwpump', 'So11111111111111111111111111111111111111112', (4959145.894159 * 1000000).toString(), 2);
//     // const swapResult = await jupSwap2('So11111111111111111111111111111111111111112', '7bCTaMF64WrhqyDqwri9XMsXsufEKGjUByDLnXGwpump', (0.1 * 1000000000).toString(), 2);
//     logger.info(swapResult);
// })();