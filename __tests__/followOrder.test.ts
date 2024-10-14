import { Connection } from "@solana/web3.js";
import Logger from "../src/logger";
const logger = new Logger('followOrderTest');
import {buy, sell, onDexTransaction} from '../src/followOrder';
import db from "../src/db";
import {v4 as uuidv4} from 'uuid';

const config = require('../config');
import { DexTransaction } from "../src/definition";
import moment from "moment";
import { getSplTokenMetaFromCache } from "../src/spltoken";
const TEST_FOLLOW_WALLET = 'TEST_FOLLOW_ADDRESS';
const myWallet = config.myWallet;

describe('buy', () => {
    it('正常购买', async () => {
        const token = uuidv4();
        const wallet = config.myWallet;
        await db.cleanAllTestData(token, wallet);
        await db.cleanAllTestData(token, TEST_FOLLOW_WALLET);

        await db.updateBuyPosition(token, 'tokenbuy', 1, 10000, '', TEST_FOLLOW_WALLET, moment().format('YYYY-MM-DD HH:mm:ss'));

        const buyResult = await buy(token, 'tokenbuy', 1, TEST_FOLLOW_WALLET);
        expect(buyResult).toBeDefined();
        if (!buyResult) {
            return;
        }
        const position = await db.getPositionByToken(wallet, token);
        expect(position?.balance).toBe(buyResult.toAmount);
    });

    // it('补充购买', async () => {
    //     const token = '9Gtss9HWbJBX4bw2m1Hos6yggnAcZrUdQL6xwXrZpump';
    //     const flow = '4rXiu7Vw9rdpHHKFLBGzzTWTWpgHVmUq2jJEKCt6FPGY';
    //     const tokenInfo = await getSplTokenMetaFromCache(token);
    //     const wallet = configData.myWallet;

    //     const buyResult = await buy(token, tokenInfo.symbol, 1, flow);
    //     expect(buyResult).toBeDefined();
    //     if (!buyResult) {
    //         return;
    //     }
    //     const balance = await db.getTokenBalance(wallet, token);
    //     expect(balance).toBe(buyResult.toAmount);
    // });
});

describe('sell', () => {
    it('正常卖', async () => {
        const token = uuidv4();
        logger.info(`正常卖 token: ${token}`);
        const symbol = 'tokentosell';
        await db.cleanAllTestData(token, myWallet);
        await db.cleanAllTestData(token, TEST_FOLLOW_WALLET);

        //自己先买入
        await db.updateBuyInfo(token, symbol, 0.1, 1000, TEST_FOLLOW_WALLET, uuidv4(), myWallet, moment().format('YYYY-MM-DD HH:mm:ss'));

        //更新跟单人的持仓,买入 10000，卖出一半，剩余5000
        await db.updateBuyPosition(token, symbol, 1, 5000, '', TEST_FOLLOW_WALLET, moment().format('YYYY-MM-DD HH:mm:ss'));

        //跟单人卖掉一半
        let sellResult = await sell(token, symbol, TEST_FOLLOW_WALLET, 5000);
        expect(sellResult).toBeDefined();
        if (!sellResult) {
            return;
        }
        
        //检查余额
        const position = await db.getPositionByToken(myWallet, token);
        expect(position?.balance).toBe(500);
    });

    it('没有持仓', async () => {
        const token = uuidv4();
        const symbol = 'tokentosell';
        await db.cleanAllTestData(token, myWallet);
        await expect(sell(token, symbol, TEST_FOLLOW_WALLET, 5000)).rejects.toThrow();
    });
});

describe('onDex', () => {
    it('onDexBuy', async () => {
        const token = uuidv4();
        const dexTx:DexTransaction = {
            dexName: 'Ray V4',
            wallet: TEST_FOLLOW_WALLET,
            from: 'SOL',
            fromToken: 'So11111111111111111111111111111111111111112',
            fromAmount: 10,
            to: 'tokenbuy',
            toToken: token,
            toAmount: 10000,
            tx: uuidv4(),
            time: moment().format('YYYY-MM-DD HH:mm:ss'),
        };
        
        await onDexTransaction(dexTx);
        const pos = await db.getPositionByToken(token, TEST_FOLLOW_WALLET);
        expect(pos).toBeDefined();
        if (!pos) {
            return;
        }
        expect(pos.balance).toBe(10000);
    });

    it('onDexSell', async () => {
        const token = uuidv4();
        const symbol = 'tokentosell';
        
        // 先买入
        await db.updateBuyInfo(token, symbol, 0.1, 1000, TEST_FOLLOW_WALLET, uuidv4(), myWallet, moment().format('YYYY-MM-DD HH:mm:ss'));
        await db.updateBuyInfo(token, symbol, 1, 10000, '', uuidv4(), TEST_FOLLOW_WALLET, moment().format('YYYY-MM-DD HH:mm:ss'));

        const dexTx:DexTransaction = {
            dexName: 'Ray V4',
            wallet: TEST_FOLLOW_WALLET,
            from: symbol,
            fromToken: token,
            fromAmount: 5000,
            to: 'SOL',
            toToken: 'So11111111111111111111111111111111111111112',
            toAmount: 1,
            tx: uuidv4(),
            time: moment().format('YYYY-MM-DD HH:mm:ss'),
        };
        await onDexTransaction(dexTx);
    });
});

afterAll(async () => {
    await db.close();
});