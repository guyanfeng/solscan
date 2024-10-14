import { ConfirmedSignatureInfo, Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import Logger from "./logger";
import { getTransaction, hasDexInstruction, isTransferInstruction, parseDexTransaction, parseTradeTokens, parseTransferTransaction } from "./parse";
import { DexTransaction } from "./definition";
import db from "./db";
import moment from 'moment-timezone';
import { getSplTokenMeta, getSplTokenMetaFromCache } from "./spltoken";

const config = require('../config');

const logger = new Logger('analyse');

interface TokenData {
    token: string,
    symbol: string,
    balance: number,
    solBalance: number,//SOL余额，用于计算在单币上的收益,如果是 USDT 之类的，按照 170 的单价转换为 SOL
}
let tokens = new Map<string, TokenData>();

//找出 100 笔有效的 Dex 交易，最多读取 1000 笔交易
async function getRecentSignatures(connection: Connection, address: string, limit: number, max: number, forceUpdate:boolean=false): Promise<void> {
    let beforeSignature: string | undefined;
    let founedCount = 0;

    const options = {
        limit: max, // Maximum limit per request
        before: beforeSignature,
    };

    const result = await connection.getSignaturesForAddress(new PublicKey(address), options);
    if (result.length === 0) {
        return;
    }
    for (let i = 0; i < result.length; i++) {
        const signature = result[i];
        if (signature.err === null) {
            if (await analyseTransaction(connection, signature, founedCount, forceUpdate))
            {
                founedCount++;
            }
        }
        if (founedCount >= limit) {
            logger.info(`Found ${founedCount} dex transactions, break`);
            break;
        }
    }
    if (founedCount < limit) {
        logger.info(`raise max retry, but just found ${founedCount} dex transactions`);
    }
}

function getSolBalance(token: string, amount: number): number {
    let solBalance = 0;
    switch (token) {
        case 'So11111111111111111111111111111111111111112'://SOL
            solBalance = amount;
            break;
        case 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'://USDC
            solBalance = amount / 170;
            break;
        default:
            break;
    }
    return solBalance;
}

async function analyseTransaction(connection: Connection, signature: ConfirmedSignatureInfo, index: number, forceUpdate:boolean=false) : Promise<boolean> {

    const tx = signature.signature;
    let dexTx: DexTransaction | null = null;
    let cached = false;
    try {
        dexTx = await db.getTransactionByTx(tx);
        if (dexTx) {
            //logger.info(`loaded transaction ${index} [${tx}]`);
            if (forceUpdate){
                //删除旧的记录以重新更新
                await db.deleteTransactionByTx(tx);
                dexTx = null;
            }else{
                cached = true;
            }
        }
    } catch (e: any) {
        logger.error(`Error: ${e}`);
    }
    if (!dexTx) {
        try {
            const transaction = await getTransaction(connection, tx);
            if (!transaction) {
                logger.error(`Transaction not found: ${tx}`);
                return false;
            }
            let row: DexTransaction = {
                wallet: transaction.transaction.message.staticAccountKeys[0].toString(),
                tx: tx,
                from: '',
                fromToken: '',
                fromAmount: 0,
                to: '',
                toToken: '',
                toAmount: 0,
                dexName: '',
                time: ''
            }
            if (transaction.blockTime) {
                row.time = moment.unix(transaction.blockTime).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss');
            }
            const dexName = await hasDexInstruction(connection, transaction);
            if (!dexName) {
                if (await isTransferInstruction(transaction)) {
                    const transferTran = await parseTransferTransaction(connection, transaction);
                    if (transferTran) {
                        logger.info(`Transaction ${index} [${tx}]: Transfer ${transferTran?.amount} ${transferTran?.symbol}[${transferTran?.token}] from ${transferTran.from} to ${transferTran.to} `);
                    }
                } else {
                    logger.info(`Transaction ${index} [${tx}]: Not a dex transaction`);
                }
            }else{
                dexTx = await parseDexTransaction(connection, transaction, dexName);
                if (dexTx) {
                    row = dexTx;
                }
            }
            //不管是不是 dex 交易，都要保存到数据库，这样下次再执行分析的时候就不会再重复从链上获取了
            await db.insertTransaction(row);
            if (!dexName){
                return false;
            }
        } catch (e: any) {
            logger.error(`Error: ${e}`);
        }
    }else{
        if (dexTx.dexName === '') {
            logger.info(`Transaction ${index} [${tx}]: Not a dex transaction`);
            return false;
        }
    }
    if (!dexTx) {
        logger.error(`Transaction ${index} [${tx}]: Failed to parse dex transaction`);
        return false;
    }
    try {
        const fromSolBalance = getSolBalance(dexTx.fromToken, dexTx.fromAmount);
        const toSolBalance = getSolBalance(dexTx.toToken, dexTx.toAmount);
        if (fromSolBalance > 0) { // from 是 SOL，to 是 spl 币
            const token = tokens.get(dexTx.toToken);
            if (token) {
                token.balance += dexTx.toAmount;
                token.solBalance -= fromSolBalance;
            } else {
                tokens.set(dexTx.toToken, { token: dexTx.toToken, symbol: dexTx.to, balance: dexTx.toAmount, solBalance: -fromSolBalance });
            }
        } else {
            if (toSolBalance > 0) { // from 是 spl 币，to 是 SOL
                const token = tokens.get(dexTx.fromToken);
                if (token) {
                    token.balance -= dexTx.fromAmount;
                    token.solBalance += toSolBalance;
                } else {
                    tokens.set(dexTx.fromToken, { token: dexTx.fromToken, symbol: dexTx.from, balance: -dexTx.fromAmount, solBalance: toSolBalance });
                }
            } else {
                //两个都是 spl 币
                const tokenFrom = tokens.get(dexTx.fromToken);
                if (tokenFrom) {
                    tokenFrom.balance -= dexTx.fromAmount;
                } else {
                    tokens.set(dexTx.fromToken, { token: dexTx.fromToken, symbol: dexTx.from, balance: -dexTx.fromAmount, solBalance: 0 });
                }
                const tokenTo = tokens.get(dexTx.toToken);
                if (tokenTo) {
                    tokenTo.balance += dexTx.toAmount;
                } else {
                    tokens.set(dexTx.toToken, { token: dexTx.toToken, symbol: dexTx.to, balance: dexTx.toAmount, solBalance: 0 });
                }
            }
        }
        logger.info(`Transaction ${index} [${dexTx.tx}]: ${dexTx.from} ${dexTx.fromAmount} -> ${dexTx.to} ${dexTx.toAmount}${cached ? ',cached' : ''}`);
        return true;
    } catch (e: any) {
        logger.error(`Error: ${e}`);
        return false;
    }
}

(async () => {
    //从参数中读取地址
    const address = process.argv[2];
    const forceUpdate = process.argv[3] === 'force';
    // const address = 'Cc3W4pX1oQHR1LT1Tk2J8uE7c4RsoyGJWSDX2MwysTVM';
    try {
        new PublicKey(address);
    } catch (e: any) {
        logger.error(`Invalid address: ${address}`);
        return;
    }
    // const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
    const connection = new Connection(config.tradeRpc, 'confirmed');
    await getRecentSignatures(connection, address, 100, 1000, forceUpdate);
    logger.info(`-------------------`);
    let solBalance = 0;
    tokens.forEach((value, key) => {
        logger.info(`${value.symbol} Balance: ${value.balance}, Sol Balance: ${value.solBalance}`);
        solBalance += value.solBalance;
    });
    logger.info(`Total Sol Balance: ${solBalance}`);
    await db.close();
    // const token = await getSplTokenMetaFromCache('SHARKSYJjqaNyxVfrpnBN9pjgkhwDhatnMyicWPnr1s');
    // console.log(token);
    // await db.close();
})();