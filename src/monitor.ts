import { Connection, PublicKey, clusterApiUrl, Message, MessageV0 } from '@solana/web3.js';
// import { TOKEN_PROGRAM_ID, AccountLayout } from '@solana/spl-token';
import { send_tg } from './notify';
const config = require('../config');
import { Config, DexInstruction, DexTransaction, FollowPolicy, MonitorData, TransferTransaction } from './definition';
import { getTransaction, hasDexInstruction, isTransferInstruction, parseDexTransaction, parseTransferTransaction } from './parse';
import Logger from './logger';
import {onDexTransaction} from './followOrder';
import db from "./db";
import * as fs from 'fs';
import { checkAndSellLimitOrders } from './limitOrder';

const logger = new Logger();

// 配置监控的 Solana 网络
const connection = new Connection(config.monitorRpc, 'confirmed');

//储存消息队列
const txQueue: MonitorData[] = [];
const tradeQueue: DexTransaction[] = [];
const transferQueue: TransferTransaction[] = [];
let errorCount = 0;

async function processTradeQueue(){
    let tx:DexTransaction|undefined;
    try {
        //每次只处理一笔交易
        tx = tradeQueue.shift();
        if (!tx) {
            return;
        }
        await onDexTransaction(tx);
    } catch (err: any) {
        logger.error(err);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    finally{
        setTimeout(processTradeQueue, 1000);
    }
}

async function processTransferQueue() {
    let tx: TransferTransaction | undefined;
    try {
        // 每次只处理一笔交易
        tx = transferQueue.shift();
        if (!tx) {
            return;
        }
        const transferToken = tx.token;
        if (await db.isInPosition(transferToken)) {
            // 如果是持仓币种，则告警
            await send_tg(`钱包[${tx.from}]在[${tx.time}]有新的交易,发送了${tx.amount}个${tx.symbol}[${transferToken}]到${tx.to},点击查看\nhttps://solscan.io/tx/${tx.tx}`);
        }
    } catch (err: any) {
        logger.error(err);
        await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
        setTimeout(processTransferQueue, 1000);
    }
}

async function processMonitorQueue() {

    //判断是否需要紧急关闭程序
    if (fs.existsSync('stop.txt')) {
        send_tg('程序被紧急关闭');
        process.exit(0);
    }

    let tx:MonitorData|undefined;
    try {
        //每次只处理一笔记录, 如果出错，每次等待时间加倍, 4/8/16/32/64/128/256/512/1024
        tx = txQueue.shift();
        if (!tx) {
            return;
        }
        const resp = await getTransaction(connection, tx.tx);
        if (!resp) {
            return;
        }
        //每次处理成功后，重置错误次数
        errorCount = 0;
        const accounts = resp.transaction.message.staticAccountKeys;
        const dexName = await hasDexInstruction(connection, resp);
        //分别处理交易所交易和转账交易
        if (dexName){
            const dexTx = await parseDexTransaction(connection, resp, dexName);
            if (!dexTx) {
                return;
            }
            // if ((dexTx.fromToken == config.SOLTOKEN && dexTx.fromAmount >= 9) || (dexTx.toToken == config.SOLTOKEN)) {
            //     const msg = `swap ${dexTx.fromAmount} ${dexTx.from}[${dexTx.fromToken}] for ${dexTx.toAmount} ${dexTx.to}[${dexTx.toToken}] on ${dexTx.dexName}`;
            //     // send_tg(`钱包[${tx.wallet}]在[${tx.time}]有新的交易,${msg},点击查看\nhttps://solscan.io/tx/${tx.tx}`);
            // }
    
            //跟单
            tradeQueue.push(dexTx);
            return;
        }
        //如果不是交易所交易，那么再判断是否为转账交易
        if (await isTransferInstruction(resp)){
            const transferTx = await parseTransferTransaction(connection, resp);
            if (transferTx) {
                transferQueue.push(transferTx);
                return;
            }
            return;
        }

    } catch (err: any) {
        logger.error(err);
        //每次等待时间加倍, 4/8/16/32/64/128/256/512/1024
        await new Promise(resolve => setTimeout(resolve, 8000 * (2 ** errorCount)));
        errorCount++;
    }
    finally {
        setTimeout(processMonitorQueue, 1000);
    }
}

async function processLimitOrders() {
    try {
        await checkAndSellLimitOrders();
    } catch (err: any) {
        logger.error(err);
        await send_tg(`处理限价订单出错`);
    }
    finally {
        setTimeout(processLimitOrders, 60*1000);
    }
}

async function monitorWallet(connection: Connection, wallet: string) {
    try {
        const walletPublicKey = new PublicKey(wallet);

        logger.info(`Monitoring transactions for wallet: ${wallet}`);

        connection.onLogs(walletPublicKey, async (logs, context) => {
            const transactionSignature = logs.signature;
            txQueue.push({ wallet: wallet, tx: transactionSignature, time: new Date().toISOString() });
        });
    } catch (err: any) {
        logger.error(err);
        send_tg(`监控钱包[${wallet}]出错`);
    }
}

async function main() {
    if (fs.existsSync('stop.txt')) {
        logger.info('程序被紧急关闭,停止监控');
        await send_tg('程序被紧急关闭,停止监控');
        process.exit(0);
    }
    try {
        config.policy.forEach((p: FollowPolicy) => {
            monitorWallet(connection, p.wallet);
        });
        setTimeout(processMonitorQueue, 1000);
        setTimeout(processTradeQueue, 1000);
        setTimeout(processTransferQueue, 1000);
        setTimeout(processLimitOrders, 60*1000);

        //测试队列程序
        // setInterval(() => {
        //     txQueue.push({ wallet: 'test', tx: 'test', time: new Date().toISOString() });
        // }, 1000);
        //测试结束
    } catch (err: any) {
        logger.error(err);
        send_tg(`监控出错`);
    }
}

main().catch(err => {
    console.error(err);
});
