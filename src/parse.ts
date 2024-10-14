import { Connection, Message, MessageV0, PublicKey, SystemProgram, VersionedTransactionResponse } from "@solana/web3.js";
import { DexInstruction, DexTransaction, TransactionToken, TransactionType, TransferTransaction } from "./definition";

import Logger from "./logger";
import { Client, Token } from '@solflare-wallet/utl-sdk';
import moment from 'moment-timezone';
import { getSplTokenMetaFromCache } from "./spltoken";
const utl = new Client();
const logger = new Logger('parse');

import base58 from "bs58";

//是否包括交易所账号
// Jupiter V6 / Raydium
const dexAccounts = ['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', 'routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS', '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB'];
const dexNames = ['Jupiter V6', 'Raydium V4', 'Raydium Routing', 'Pump.fun', 'Meteora'];

//有一些黑名单，例如 jupiter DCA 的账号，不需要解析
const blackList = ['DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23M']

//解析在两个账户间发送代币的交易，必须先调用 isTransferInstruction 来判断是否是 transfer 交易
//返回结果中，第一个为发送方，第二个为接收方
async function parseTransferTransaction(connection: Connection, txResp: VersionedTransactionResponse): Promise<TransferTransaction | undefined> {
    const signer = txResp.transaction.message.staticAccountKeys[0].toString();

    const preFromToken = txResp.meta?.preTokenBalances?.findLast(token => token.owner === signer);
    if (!preFromToken) {
        return undefined;
    }
    const from = preFromToken.owner || '';
    const token = preFromToken.mint;
    const fromAmountPre = preFromToken.uiTokenAmount.uiAmount || 0;

    const postFromToken = txResp.meta?.postTokenBalances?.findLast(token => token.owner === signer);
    if (!postFromToken) {
        return undefined;
    }
    const fromAmountPost = postFromToken.uiTokenAmount.uiAmount || 0;

    const postToToken = txResp.meta?.postTokenBalances?.findLast(token => token.mint === preFromToken.mint);
    if (!postToToken) {
        return undefined;
    }
    const to = postToToken.owner || '';
    const toAmountPost = postToToken.uiTokenAmount.uiAmount || 0;

    const preToToken = txResp.meta?.preTokenBalances?.findLast(token => token.owner === to);
    let toAmountPre = 0;
    if (preToToken) {
        toAmountPre = preToToken.uiTokenAmount.uiAmount || 0;
    }
    //至记录 signer 发送代币的交易
    if (fromAmountPre < fromAmountPost) {
        return undefined;
    }
    const symbol = (await getSplTokenMetaFromCache(connection, token)).symbol;

    return { from: from, to: to, token: token, symbol:symbol, amount: fromAmountPre - fromAmountPost, tx: txResp.transaction.signatures[0], time: moment.unix(txResp.blockTime || 0).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss') };
}

//解析在交易所账户间的交易
function parseTradeTokens(txResp: VersionedTransactionResponse): TransactionToken[] {
    const signer = txResp.transaction.message.staticAccountKeys[0].toString();

    // 过滤出 owner 为 'a' 的 tokens
    const preFiltered = txResp.meta?.preTokenBalances?.filter(token => token.owner === signer);
    const postFiltered = txResp.meta?.postTokenBalances?.filter(token => token.owner === signer);

    const tokenMap = new Map<string, number>();
    // 遍历 preTokens 并将 token 和 balance 存入 Map
    preFiltered?.forEach(({ mint, uiTokenAmount }) => {
        tokenMap.set(mint, (tokenMap.get(mint) || 0) - (uiTokenAmount.uiAmount || 0));
    });

    // 遍历 postTokens 并从 Map 中减去 balance
    postFiltered?.forEach(({ mint, uiTokenAmount }) => {
        //如果 pre 和 post 都为 0， 则删除，目前出现的案例是两个 SOL 的 token 都为 0
        if (((tokenMap.get(mint) || 0) == 0) && (uiTokenAmount.uiAmount || 0) == 0) {
            tokenMap.delete(mint);
        } else {
            tokenMap.set(mint, (tokenMap.get(mint) || 0) + (uiTokenAmount.uiAmount || 0));
        }
    });
    const result = Array.from(tokenMap);
    // logger.debug(`[tx:${txResp.transaction.signatures[0]}], trade tokens:${result.length}}`);
    if (result.length === 0 || result.length > 2) {
        logger.error(`tx:${txResp.transaction.signatures[0]}, token count cant be ${result.length}`)
        throw new Error(`token count cant be ${result.length}`);
    }

    const token1 = result[0][0];
    const token1Amount = result[0][1];
    let token2 = '';
    let token2Amount = 0;
    if (result.length === 1) {
        //另一个为 post balance 中的 SOL
        token2 = 'So11111111111111111111111111111111111111112';
        token2Amount = ((txResp.meta?.postBalances[0] || 0) - (txResp.meta?.preBalances[0] || 0)) / (10 ** 9);
    } else {
        token2 = result[1][0];
        token2Amount = result[1][1];
    }
    return [{ mint: token1, amount: token1Amount, name: '' }, { mint: token2, amount: token2Amount, name: '' }];
}

async function parseDexTransaction(connection: Connection, txResp: VersionedTransactionResponse, dexName: string): Promise<DexTransaction | null> {
    if (!txResp.meta || !txResp.meta.preTokenBalances || !txResp.meta.postTokenBalances) {
        return null;
    }
    //此处做简易处理，不一定正确
    //signer 为 message 中 staticAccountKeys 的第一个
    //posttoken/pretoken balance 为 token 余额变更，找到所有 owner 为签名者的账户，如果有两个，则是交易双方，如果只有一个，那么另一个交易方就是 SOL，从 post balance 中获取
    //post/pre balance 为 SOL 的余额变更，如果有两个 posttoken/pretoken，则另一个为 SOL
    //通过 mint 账户能找到 token 的 metadata， 从而获取 token 的 symbol
    //通过 mint 账户的余额是增加还是减少，来判断是买还是卖

    const tradeTokens = parseTradeTokens(txResp);
    if (tradeTokens.length !== 2) {
        logger.error(`tx:${txResp.transaction.signatures[0]}, trade token count cant be ${tradeTokens.length}`)
        return null;
    }
    tradeTokens[0].name = (await getSplTokenMetaFromCache(connection, tradeTokens[0].mint)).symbol;
    tradeTokens[1].name = (await getSplTokenMetaFromCache(connection, tradeTokens[1].mint)).symbol;
    let from, to, fromToken, toToken = '';
    let fromAmount, toAmount;
    if (tradeTokens[0].amount < 0) {
        from = tradeTokens[0].name;
        fromToken = tradeTokens[0].mint;
        fromAmount = Math.abs(tradeTokens[0].amount);
        to = tradeTokens[1].name;
        toToken = tradeTokens[1].mint;
        toAmount = tradeTokens[1].amount;
    } else {
        from = tradeTokens[1].name;
        fromToken = tradeTokens[1].mint;
        fromAmount = Math.abs(tradeTokens[1].amount);
        to = tradeTokens[0].name;
        toToken = tradeTokens[0].mint;
        toAmount = tradeTokens[0].amount;
    }
    let time = '1970-01-01 00:00:00';
    if (txResp.blockTime) {
        time = moment.unix(txResp.blockTime).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss');
    }
    const wallet = txResp.transaction.message.staticAccountKeys[0].toString();
    return { dexName: dexName, from: from, fromToken: fromToken, fromAmount: fromAmount, to: to, toToken: toToken, toAmount: toAmount, tx: txResp.transaction.signatures[0], time: time, wallet: wallet };
}

async function hasDexInstruction(connection: Connection, tx: VersionedTransactionResponse): Promise<string | null> {
    if (tx.meta?.postTokenBalances?.length == 0 && tx.meta?.preTokenBalances?.length == 0) {
        return null;
    }

    //整个 account keys 等于 message.accountKeys + meta.loadedAddresses.writable + meta.loadedAddresses.readonly
    const accountKeys: PublicKey[] = [];
    accountKeys.push(...tx.transaction.message.staticAccountKeys, ...tx.meta?.loadedAddresses?.writable || [], ...tx.meta?.loadedAddresses?.readonly || []);
    const accounts = accountKeys.map(account => account.toString());
    if (accounts.some(account => blackList.includes(account))) {
        return null;
    }
    for (let i = 0; i < dexAccounts.length; i++) {
        const dexAccount = dexAccounts[i];
        if (accounts.includes(dexAccount)) {
            return dexNames[i];
        }
    }
    return null;
}

async function isTransferInstruction(tx: VersionedTransactionResponse): Promise<boolean> {
    if (tx.meta?.postTokenBalances?.length == 0 && tx.meta?.preTokenBalances?.length == 0) {
        return false;
    }
    const message = tx.transaction.message;
    if (message instanceof Message) {
        return message.instructions.some(instruction => {
            const data = base58.decode(instruction.data);
            return data[0] === 2;
        });
    }
    return false;
}

async function getTransaction(connection: Connection, tx: string): Promise<VersionedTransactionResponse | null> {
    const txResp = await connection.getTransaction(tx, { maxSupportedTransactionVersion: 0 });
    if (txResp?.meta?.err) {
        return null;
    }
    return txResp;
}

export { parseDexTransaction, hasDexInstruction, parseTradeTokens, getSplTokenMetaFromCache, getTransaction, isTransferInstruction, parseTransferTransaction};