import { Wallet } from "@project-serum/anchor";
import { Connection, Keypair, Transaction, VersionedTransaction, VersionedTransactionResponse } from "@solana/web3.js";
import bs58 from 'bs58';
import axios from "axios";
const config = require('../config');
import Logger from "./logger";
import { wait } from "./wait";
import { getTransaction } from "./parse";
const logger = new Logger('gmgn');

async function getPrice(token: string): Promise<number> {
    if (config.dev) {
        logger.info('dev mode, skip getPrice');
        return 0.01;
    }
    const url = `https://price.jup.ag/v6/price?ids=${token}`;
    const response = await axios.get(url);
    return response.data.data[token].price as number;
}

//和 jupiter 的不一样，gmgn 的滑点设置是百分位，假设滑点为 10%， jupiter 应该设置 1000，而 gmgn 应该设置 10
const slippage = config.maxAutoSlippageBps / 100;
const API_HOST = 'https://gmgn.ai';

async function gmgnSwap(swap: string, to: string, amount: string, retry: number = 0): Promise<VersionedTransactionResponse> {
    if (!config.myWalletPrivateKey) {
        throw new Error('myWalletPrivateKey is not set');
    }
    const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(config.myWalletPrivateKey)));

    // 获取quote以及待签名交易
    const quoteUrl = `${API_HOST}/defi/router/v1/sol/tx/get_swap_route?token_in_address=${swap}&token_out_address=${to}&in_amount=${amount}&from_address=${config.myWallet}&slippage=${slippage}&fee=${config.priorityFee}`
    logger.debug(`quoteUrl: ${quoteUrl}`);
    const route = (await axios.get(quoteUrl)).data;
    logger.debug(`route: ${JSON.stringify(route.data)}`);
    // 签名交易
    const swapTransactionBuf = Buffer.from(route.data.raw_tx.swapTransaction, 'base64')
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf)
    transaction.sign([wallet.payer])
    const signedTx = Buffer.from(transaction.serialize()).toString('base64')
    // logger.debug(`signedTx: ${signedTx}`);
    // 提交交易
    const res = (await axios.post(`${API_HOST}/defi/router/v1/sol/tx/submit_signed_transaction`,
        {
            "signed_tx": signedTx
        })).data;
    logger.debug(`submit_signed_transaction: ${JSON.stringify(res.data)}`);
    // 查询tx状态
    // 如果上链成功，则success返回true
    // 如果没上链，60秒就会返回expired=true
    let status;
    for (let i = 0; i < 60; i++) {
        const hash = res.data.hash;
        const lastValidBlockHeight = route.data.raw_tx.lastValidBlockHeight;
        const statusUrl = `${API_HOST}/defi/router/v1/sol/tx/get_transaction_status?hash=${hash}&last_valid_height=${lastValidBlockHeight}`;
        status = (await axios.get(statusUrl)).data;
        logger.debug(`status: ${JSON.stringify(status.data)}`);
        if (status && (status.data.success === true || status.data.expired === true)){
            break;
        }
        await wait(1000);
    }
    if (status.data.success !== true) {
        logger.error('Transaction not confirmed');
        throw new Error('Transaction not confirmed');
    }
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

    const tx = await getTransaction(connection, res.data.hash);
    if (!tx) {
        logger.error('Transaction not found');
        throw new Error('Transaction not found');
    }
    return tx;
}

export { getPrice, gmgnSwap };

// (async () => {
//     // const swapResult = await gmgnSwap('7bCTaMF64WrhqyDqwri9XMsXsufEKGjUByDLnXGwpump', 'So11111111111111111111111111111111111111112', (4959145.894159 * 1000000).toString(), 2);
//     const swapResult = await gmgnSwap('So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', (0.1 * 1000000000).toString(), 2);
//     logger.info(swapResult);
// })();