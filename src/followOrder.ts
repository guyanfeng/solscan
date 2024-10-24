import { DexTransaction, FollowPolicy, OrderResult } from "./definition";
import db from "./db";
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment-timezone';
import Logger from "./logger";
const logger = new Logger('followOrder');
const config = require('../config');
import { send_tg } from "./notify";

import { jupSwap, getPrice, getSignature } from "./jupiter";
import { getSplTokenMetaFromCache, getTransaction, parseDexTransaction } from "./parse";
import { clusterApiUrl, Connection, PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { getSplTokenBalance, getSplTokenMeta } from "./spltoken";

const flowWallets = config.flowWallets;
const myWallet: string = config.myWallet;
const SOLANA_NETWORK = clusterApiUrl('mainnet-beta');
const connection = new Connection(SOLANA_NETWORK, 'confirmed');

async function onDexTransaction(dexTx: DexTransaction): Promise<void> {
    //更新聪明钱的持仓
    try {
        if (dexTx.fromToken == config.SOLTOKEN) {
            await db.updateBuyInfo(dexTx.toToken, dexTx.to, dexTx.fromAmount, dexTx.toAmount, '', dexTx.tx, dexTx.wallet, dexTx.time);
        } else if (dexTx.toToken == config.SOLTOKEN) {
            await db.updateSellInfo(dexTx.fromToken, dexTx.from, dexTx.fromAmount, dexTx.toAmount, dexTx.tx, dexTx.wallet, dexTx.time, '');
        }
    } catch (e) {
        logger.error(`update smartmoney position error: ${e}`);
        // await send_tg(`跟单失败: ${e}`);
    }

    const msg = `[${dexTx.wallet}] swap ${dexTx.fromAmount} [${dexTx.from}][${dexTx.fromToken}] for ${dexTx.toAmount} [${dexTx.to}][${dexTx.toToken}] on [${dexTx.dexName}]`;
    const policy: FollowPolicy = config.policy.find((p: any) => p.wallet == dexTx.wallet);
    if (!policy) {
        return;
    }
    if (dexTx.fromToken == config.SOLTOKEN) {
        if (!config.canBuy) {
            logger.info(`当前设置为不买入`);
            return;
        }
        await buy(dexTx, policy);
    } else if (dexTx.toToken == config.SOLTOKEN) {
        if (!config.canSell) {
            logger.info(`当前设置为不卖出`);
            return;
        }
        await sell(dexTx, policy);
    }
}

/**
 * 买入
 * @param token token mint
 * @param symbol token symbol
 * @param buyAmount 买入数量，SOL
 * @param flowAddress 跟单的聪明钱地址
 */
async function buy(dexTx: DexTransaction, policy: FollowPolicy): Promise<void> {
    const smartWallet = policy.walletNote || policy.wallet;
    const msg = `聪明钱${smartWallet}在${dexTx.time}花费${Math.round(dexTx.fromAmount*100)/100}SOL买入${dexTx.toAmount}个[${dexTx.to}][${dexTx.toToken}],https://solscan.io/tx/${dexTx.tx}`;
    logger.info(msg);
    send_tg(msg);
    const token = dexTx.toToken;
    const symbol = dexTx.to;
    if (!policy.followBuy) {
        logger.info(`${smartWallet} 当前设置为不买入`);
        return;
    }

    try {
        if (await db.isBlackToken(token)) {
            logger.info(`${token} 是黑名单 token, 不跟单`);
            return;
        }
    } catch (e) {
        logger.error(`查询黑名单失败: ${e}`);
    }

    if (policy.minBuyingAmount) {
        if (dexTx.fromAmount < policy.minBuyingAmount) {
            logger.info(`买入数量 ${dexTx.fromAmount} 小于最小买入数量 ${policy.minBuyingAmount}, 不跟单`);
            return;
        }
    }

    //限制跟单总金额
    try{
        const weekAgo = moment().subtract(7, 'days').format('YYYY-MM-DD');
        const amount = await db.getRangeTokanBalance(myWallet, token, weekAgo, moment().add(1, 'days').format('YYYY-MM-DD'));
        if (amount >= 0.5) {
            logger.info(`${myWallet} 1周内净持仓已经达到 ${amount} SOL, 不再跟单`);
            send_tg(`${myWallet} 1周内净持仓已经达到 ${amount} SOL, 不再跟单`);
            return;
        }
    }catch(e){
        logger.error(`查询 1 周内净持仓失败: ${e}`);
        return;
    }

    //限制跟单市值
    if (policy.maxMarketValue) {
        try {
            const price = await getPrice(dexTx.toToken);
            const splMeta = await db.getSplTokenMeta(dexTx.toToken);
            if (!splMeta) {
                throw new Error(`未找到 ${dexTx.toToken} 的 token meta`);
            }
            const marketValue = Math.floor(splMeta.supply * price);
            if (marketValue > policy.maxMarketValue) {
                send_tg(`[${symbol}][${token}] 市值 ${marketValue} 超过最大跟单市值 ${policy.maxMarketValue}, 不跟单买入`);
                return;
            }
        } catch (e) {
            logger.error(`查询最大市值失败, 继续跟单: ${e}`);
            // send_tg(`查询最大市值失败, 继续跟单: ${e}`);
            // return;
        }
    }

    //计算跟单金额
    let followAmount = 0.1;
    if (policy.followAmount) {
        if (policy.followAmount > 0) {
            followAmount = policy.followAmount;
        }
    } else {
        if (policy.followPercent) {
            // 默认单次跟单金额不超过 0.3 SOL
            const maxFollowAmount = policy.maxFollowAmount || 0.3;
            followAmount = Math.min(Math.round(dexTx.fromAmount * policy.followPercent * 100) / 100, maxFollowAmount);
        }
    }

    //是否需要延迟跟单
    if (policy.delaySeconds && policy.delaySeconds > 0) {
        logger.info(`跟单 ${smartWallet} 延迟 ${policy.delaySeconds} 秒后购买`);
        setTimeout(() => {
            delayBuy(dexTx, policy, followAmount);
        }, policy.delaySeconds * 1000);
        return;
    }

    //调用 jupiter 的 api 进行买入
    try {
        const result = await jupiterBuy(token, symbol, followAmount);
        await db.updateBuyInfo(token, symbol, followAmount, result.toAmount, dexTx.wallet, result.txid, myWallet, moment().format('YYYY-MM-DD HH:mm:ss'));
        logger.info(`跟单 ${smartWallet} 买入了 ${result.toAmount} 的 ${symbol}[${token}], 价格 ${result.price}, 花费 ${result.fromAmount} SOL`);
        await send_tg(`跟单 ${smartWallet} 买入了 ${result.toAmount} 的 ${symbol}[${token}], 价格 ${result.price}, 花费 ${result.fromAmount} SOL`);
    } catch (e) {
        logger.error(`跟单 ${smartWallet} 买入${symbol}[${token}]失败: ${e}`);
        await send_tg(`跟单 ${smartWallet} 买入${symbol}[${token}]失败: ${e}`);
    }
}

//延迟购买，如果用户的持仓在延迟时间到达后不足 60%，则取消本次购买
async function delayBuy(dexTx: DexTransaction, policy: FollowPolicy, followAmount: number) : Promise<void>{
    const smartWallet = policy.walletNote || policy.wallet;
    const buyAmount = dexTx.toAmount;
    const token = dexTx.toToken;
    const symbol = dexTx.to;
    try{
        const pos = await db.getPositionByToken(dexTx.wallet, dexTx.toToken);
        if (!pos){
            logger.info(`未找到 ${smartWallet} 在[${symbol}][${token}]的持仓, 取消购买`);
            return;
        }
        if (pos.balance < buyAmount * 0.6){
            logger.info(`${smartWallet} 在[${symbol}][${token}]的持仓不足购买数量的 60%, 取消购买`);
            return;
        }
    }catch (e){
        logger.error(`delayBuy 查询持仓失败: ${e}`);
        return;
    }

    logger.info(`跟单${smartWallet}延迟购买 ${followAmount} SOL 的${symbol}[${token}]`);
    //调用 jupiter 的 api 进行买入
    try {
        const result = await jupiterBuy(token, symbol, followAmount);
        await db.updateBuyInfo(token, symbol, followAmount, result.toAmount, dexTx.wallet, result.txid, myWallet, moment().format('YYYY-MM-DD HH:mm:ss'));
        logger.info(`跟单 ${smartWallet} 买入了 ${result.toAmount} 的 ${symbol}[${token}], 价格 ${result.price}, 花费 ${result.fromAmount} SOL`);
        await send_tg(`跟单 ${smartWallet} 买入了 ${result.toAmount} 的 ${symbol}[${token}], 价格 ${result.price}, 花费 ${result.fromAmount} SOL`);
    } catch (e) {
        logger.error(`跟单 ${smartWallet} 买入${symbol}[${token}]失败: ${e}`);
        await send_tg(`跟单 ${smartWallet} 买入${symbol}[${token}]失败: ${e}`);
    }
}

//手动购买，不受市值和持仓限制
async function manualBuy(token: string): Promise<OrderResult> {
    const solAmount = 0.1;
    const splMeta = await getSplTokenMetaFromCache(connection, token);
    const result = await jupiterBuy(token, splMeta.symbol, solAmount);
    const followed = await db.getFollowWallet(myWallet, token);
    const followWallet = followed ? followed : '';
    await db.updateBuyInfo(token, splMeta.symbol, solAmount, result.toAmount, followWallet, result.txid, myWallet, moment().format('YYYY-MM-DD HH:mm:ss'));
    logger.info(`手动购买 ${solAmount} SOL for ${result.toAmount} ${splMeta.symbol}[${token}]`);
    return result;
}

async function jupiterBuy(token: string, symbol: string, solAmount: number): Promise<OrderResult> {
    //调用 jupiter 的 api 进行买入
    if (!config.dev) {
        //call api
        //sol 的小数为 9 位
        for (let i = 0; i < 3; i++) {
            let tx: VersionedTransactionResponse;
            try {
                tx = await jupSwap(config.SOLTOKEN, token, (solAmount * 1000000000).toString(), i);
            } catch (e) {
                logger.error(`jupiter buy failed:${e}, 重试第 ${i + 1} 次`);
                continue;
            }
            const txid = tx.transaction.signatures[0];
            // if (!tx.success) {
            //     logger.error(`jupiter swap failed, tx: ${tx.tx}, 重试第 ${i + 1} 次`);
            //     continue;
            // }
            // //等 10 秒钟获取上链信息
            // await new Promise(resolve => setTimeout(resolve, 10000));
            // let tx = await getTransaction(connection, txid);
            // if (!tx) {
            //     logger.error(`10 秒后未找到交易: ${txid}, 重试第 ${i + 1} 次`);
            //     continue;
            //     // await new Promise(resolve => setTimeout(resolve, 60000));
            //     // tx = await getTransaction(connection, txid);
            //     // if (!tx) {
            //     //     logger.error(`60 秒后未找到交易: ${txid}, 重试第 ${i+1} 次`);
            //     //     continue;
            //     // }
            // }
            const dexTx = await parseDexTransaction(connection, tx, 'Jupiter V6');
            if (!dexTx) {
                throw new Error(`Dex transaction not found: ${txid}`);
            }
            logger.info(`jupiter buy ${solAmount} SOL for ${dexTx.toAmount} ${symbol}[${token}]`);
            return { price: dexTx.fromAmount / dexTx.toAmount, fromAmount: dexTx.fromAmount, toAmount: dexTx.toAmount, txid: txid };
        }
        throw new Error('jupiter buy failed');
    } else {
        return { price: 0.001, fromAmount: solAmount, toAmount: solAmount / 0.001, txid: uuidv4() };
    }
}

async function sell(dexTx: DexTransaction, policy: FollowPolicy): Promise<void> {
    const smartWallet = policy.walletNote || policy.wallet;
    const msg = `聪明钱${smartWallet}在${dexTx.time}卖出${dexTx.fromAmount}个[${dexTx.from}][${dexTx.fromToken}],得到${Math.round(dexTx.toAmount*100)/100}SOL,https://solscan.io/tx/${dexTx.tx}`;
    logger.info(msg);
    send_tg(msg);
    const token = dexTx.fromToken;
    const symbol = dexTx.from;

    if (!policy.followSell) {
        logger.info(`${smartWallet} 当前设置为不卖出`);
        return;
    }
    //当前持仓
    let position;
    try {
        //先看自己有没有持仓
        position = await db.getPositionByToken(myWallet, token);
        if (!position) {
            logger.info(`没有找到 [${symbol}][${token}] 的持仓，无法卖出`);
            return;
        }
    } catch (e) {
        logger.error(`查询持仓失败: ${e}`);
        return;
    }

    //任意一个聪明钱卖出都跟单，不局限于买入时的聪明钱
    const smPosition = await db.getPositionByToken(dexTx.wallet, token);
    //如果聪明钱没有持仓（是在系统监控之前买入的），则全部卖掉
    //因为会先更新聪明钱的持仓，所以此处计算比例的公式不太一样
    //例如，原有 10000， 卖出了 5000， 剩余 5000，那么卖出比例为 5000 / (5000 + 5000) = 0.5
    let sellPercent = 1;
    if (smPosition) {
        sellPercent = dexTx.fromAmount / (smPosition.balance + dexTx.fromAmount);
    }
    //取整
    if (sellPercent > 0.95) {
        logger.info(`卖出比例 ${sellPercent} 大于 95%, 修正为 100%`);
        sellPercent = 1;
    }

    //计算卖出数量
    let sellAmount = position.balance * sellPercent;
    if (sellPercent == 1) {
        try {
            // 如果数量为 100%，则重新从链上获取最新余额，因为余额在数据库中不一定精确
            const balance = await getSplTokenBalance(connection, myWallet, token);
            if (balance == 0) {
                logger.info(`余额为 0, 无法卖出`);
                throw new Error(`余额为 0, 无法卖出`);
            }
            db.updateBalanceByToken(myWallet, token, balance);
            logger.info(`将卖出数量从 ${sellAmount} 修正为 ${balance}`);
            sellAmount = balance;
        } catch (e) {
            logger.error(`获取余额失败: ${e}`);
        }
    }

    logger.info(`目前持仓 ${position.balance}, 卖出比例 ${sellPercent}, 卖出 ${sellAmount}`);

    try {
        //查出 token 的小数
        const tokenInfo = await getSplTokenMetaFromCache(connection, token);

        //卖出时必须为整数
        const result = await jupiterSell(token, symbol, Math.floor(sellAmount * 10 ** tokenInfo.decimal));

        await db.updateSellInfo(token, symbol, sellAmount, result.toAmount, result.txid, myWallet, moment().format('YYYY-MM-DD HH:mm:ss'), dexTx.wallet);

        logger.info(`跟单 ${smartWallet} 卖出了 ${result.fromAmount} 的 ${dexTx.from}[${dexTx.fromToken}], 价格 ${result.price}, 获得 ${result.toAmount} SOL`);
        await send_tg(`跟单 ${smartWallet} 卖出了 ${result.fromAmount} 的 ${dexTx.from}[${dexTx.fromToken}], 价格 ${result.price}, 获得 ${result.toAmount} SOL`);

    } catch (e) {
        logger.error(`跟单 ${smartWallet} 卖出${dexTx.from}[${dexTx.fromToken}]失败: ${e}`);
        await send_tg(`跟单 ${smartWallet} 卖出${dexTx.from}[${dexTx.fromToken}]失败: ${e}`);
    }
}

///按比例卖出
async function sellByPercent(tokenId: number, sellPercent: number): Promise<OrderResult> {
    //先看自己有没有持仓
    const position = await db.getPositionById(tokenId);
    if (!position) {
        logger.info(`持仓 ID ${tokenId} 未找到,无法卖出`);
        throw new Error(`持仓 ID ${tokenId} 未找到,无法卖出`);
    }
    if (position.wallet != myWallet) {
        logger.info(`持仓 ID ${tokenId} 不是我的持仓,无法卖出`);
        throw new Error(`持仓 ID ${tokenId} 不是我的持仓,无法卖出`);
    }
    const balance = position.balance;
    const token = position.token;
    const symbol = position.symbol;
    const smWallet = position.followWallet;

    //计算卖出数量
    const sellAmount = balance * sellPercent;

    logger.info(`目前持仓 ${balance}, 卖出比例 ${sellPercent}, 卖出 ${sellAmount}`);

    //查出 token 的小数
    const tokenInfo = await getSplTokenMetaFromCache(connection, token);

    //卖出时必须为整数
    const sellResult = await jupiterSell(token, symbol, Math.floor(sellAmount * 10 ** tokenInfo.decimal));

    await db.updateSellInfo(token, symbol, sellAmount, sellResult.toAmount, uuidv4(), myWallet, moment().format('YYYY-MM-DD HH:mm:ss'), smWallet);
    logger.info(`卖出 ${sellAmount} ${symbol}[${token}] for ${sellResult.toAmount} SOL`);
    return sellResult;
}

async function jupiterSell(token: string, symbol: string, tokenAmount: number): Promise<OrderResult> {
    //调用 jupiter 的 api 进行买入
    if (!config.dev) {
        //call api
        for (let i = 0; i < 3; i++) {
            let tx: VersionedTransactionResponse;
            try {
                tx = await jupSwap(token, config.SOLTOKEN, tokenAmount.toString(), i);
            } catch (e) {
                logger.error(`jupiter sell failed, 重试第 ${i + 1} 次`);
                continue;
            }
            const txid = tx.transaction.signatures[0];
            // if (!swapResult.success) {
            //     if (swapResult.errCode == '40') { //余额不足，直接返回
            //         throw new Error(`jupiter sell failed, 余额不足`);
            //     }
            //     logger.error(`jupiter swap failed, tx: ${swapResult.tx}, 重试第 ${i + 1} 次`);
            //     continue;
            // }

            // //等 10 秒钟再获取上链信息
            // await new Promise(resolve => setTimeout(resolve, 10000));
            // let tx = await getTransaction(connection, txid);
            // if (!tx) {
            //     logger.error(`10 秒后未找到交易: ${txid}, 重试第 ${i + 1} 次`);
            //     continue;
            //     // await new Promise(resolve => setTimeout(resolve, 60000));
            //     // tx = await getTransaction(connection, txid);
            //     // if (!tx) {
            //     //     logger.error(`60 秒后未找到交易: ${txid}, 重试第 ${i+1} 次`);
            //     //     continue;
            //     // }
            // }
            const dexTx = await parseDexTransaction(connection, tx, 'Jupiter V6');
            if (!dexTx) {
                throw new Error(`Dex transaction not found: ${txid}`);
            }
            logger.info(`jupiter sell ${tokenAmount} ${symbol}[${token}] for ${dexTx.toAmount} SOL`);
            return { price: dexTx.toAmount / dexTx.fromAmount, fromAmount: dexTx.fromAmount, toAmount: dexTx.toAmount, txid: txid };
        }
        throw new Error('jupiter sell faild');
    } else {
        return { price: 0.001, fromAmount: tokenAmount, toAmount: tokenAmount * 0.001, txid: uuidv4() };
    }
}

export { onDexTransaction, buy, sell, jupiterSell, jupiterBuy, sellByPercent, manualBuy };