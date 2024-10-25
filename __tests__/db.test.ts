import { describe, it, expect } from "@jest/globals";
import db from "../src/db";
import moment from "moment";
import { v4 as uuidv4 } from 'uuid';
const configData = require('../config');

const myWallet:string = configData.myWallet;
const TEST_FOLLOW_WALLET = 'TEST_FOLLOW_ADDRESS';

describe('db', () => {
    it('trans', async () => {
        let tx1 = uuidv4();
        let tx2 = uuidv4();
        let id = await db.insertTransaction({
            wallet: '111',
            tx: tx1,
            from: 'sol',
            fromToken: '111111111',
            fromAmount: 1,
            to: 'meta',
            toToken: '222',
            toAmount: 2,
            time: moment().format('YYYY-MM-DD HH:mm:ss'),
            dexName: 'rad'
        });

        id = await db.insertTransaction({
            wallet: '222',
            tx: tx2,
            from: 'eth',
            fromToken: 'eth1111111',
            fromAmount: 1,
            to: 'grap',
            toToken: 'grap21212121',
            toAmount: 2,
            time: moment().format('YYYY-MM-DD HH:mm:ss'),
            dexName: 'pal'
        });

        let row = await db.getTransactionByTx(tx1);
        expect(row).toBeDefined();
        if (row) {
            expect(row.wallet).toBe('111');
            expect(row.tx).toBe(tx1);
            expect(row.from).toBe('sol');
            expect(row.fromToken).toBe('111111111');
            expect(row.fromAmount).toBe(1);
            expect(row.to).toBe('meta');
            expect(row.toToken).toBe('222');
            expect(row.toAmount).toBe(2);
            expect(row.dexName).toBe('rad');
        }
        row = await db.getTransactionByTx(tx2);
        expect(row).toBeDefined();
        if (row) {
            expect(row.wallet).toBe('222');
            expect(row.tx).toBe(tx2);
            expect(row.from).toBe('eth');
            expect(row.fromToken).toBe('eth1111111');
            expect(row.fromAmount).toBe(1);
            expect(row.to).toBe('grap');
            expect(row.toToken).toBe('grap21212121');
            expect(row.toAmount).toBe(2);
            expect(row.dexName).toBe('pal');
        }
    })

    it('updateBuyInfo', async () => {
        const token = 'eth1111111';
        const symbol = 'eth';
        const wallet = configData.myWallet;

        let position = await db.getPositionByToken(wallet, token);
        const balanceBefore = position ? position.balance : 0;
        await db.updateBuyInfo(token, symbol, 0.2, 100, TEST_FOLLOW_WALLET, uuidv4(), myWallet, moment().format('YYYY-MM-DD HH:mm:ss'));
        position = await db.getPositionByToken(wallet, token);
        const balanceAfter = position ? position.balance : 0;
        expect(balanceAfter).toBe(balanceBefore + 100);

    });

    it('updateSellInfo', async () => {
        const token = 'eth1111111';
        const symbol = 'eth';
        const wallet = configData.myWallet;

        //先买入，要不然没法卖出
        await db.updateBuyInfo(token, symbol, 0.2, 100, TEST_FOLLOW_WALLET, uuidv4(), myWallet, moment().format('YYYY-MM-DD HH:mm:ss'));

        let position = await db.getPositionByToken(wallet, token);
        const balanceBefore = position ? position.balance : 0;
        await db.updateSellInfo(token, symbol, 100, 0.1, uuidv4(), myWallet, moment().format('YYYY-MM-DD HH:mm:ss'), TEST_FOLLOW_WALLET);
        position = await db.getPositionByToken(wallet, token);
        const balanceAfter = position ? position.balance : 0;
        expect(balanceAfter).toBe(balanceBefore - 100);
    });

    it('getFollowWallet', async () => {
        const wallet = await db.getFollowWallet(myWallet, 'tokennotexists');
        expect(wallet).toBeUndefined();
    });

    it('getTokenBalance', async () => {
        const token = uuidv4();
        await db.updateBuyInfo(token, 'token', 0.02, 100000, TEST_FOLLOW_WALLET, uuidv4(), myWallet, moment().format('YYYY-MM-DD HH:mm:ss'));
        let position = await db.getPositionByToken(myWallet, token);
        let balance = position ? position.balance : 0;
        expect(balance).toBe(100000);

        await db.updateBuyInfo(token, 'token', 0.02, 100000, TEST_FOLLOW_WALLET, uuidv4(), myWallet, moment().format('YYYY-MM-DD HH:mm:ss'));
        position = await db.getPositionByToken(myWallet, token);
        balance = position ? position.balance : 0;
        expect(balance).toBe(200000);

        await db.updateSellInfo(token, 'token', 100000, 0.02, uuidv4(), myWallet, moment().format('YYYY-MM-DD HH:mm:ss'), TEST_FOLLOW_WALLET);
        position = await db.getPositionByToken(myWallet, token);
        balance = position ? position.balance : 0;
        expect(balance).toBe(100000);

        await db.updateSellInfo(token, 'token', 100000, 0.02, uuidv4(), myWallet, moment().format('YYYY-MM-DD HH:mm:ss'), TEST_FOLLOW_WALLET);
        position = await db.getPositionByToken(myWallet, token);
        balance = position ? position.balance : 0;
        expect(balance).toBe(0);
    });

    it('getAllTokenBalance', async () => {
        const token = uuidv4();
        const balance = await db.getAllTokenBalance(token, myWallet);
        expect(balance).toBe(0);
    });

    it('isBlackToken', async () => {
        let token = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        let isBlack = await db.isBlackToken(token);
        expect(isBlack).toBe(true);

        token = uuidv4();
        isBlack = await db.isBlackToken(token);
        expect(isBlack).toBe(false);
    });

    it('getRangeTokanBalance', async () => {
        const token = '6ogzHhzdrQr9Pgv6hZ2MNze7UrzBMAFyBBWUYp1Fhitx';
        const amount = await db.getRangeTokanBalance(myWallet, token, '2024-08-15', '2024-08-22');
        expect(amount).toBeCloseTo(0.1045);
    });

    it('getLastDailyData', async () => {
        const [day, balance] = await db.getLastDailyData(myWallet);
        expect(day).not.toBeUndefined();
        expect(balance).not.toBeUndefined();
    });

    it('getDailyBuy', async () => {
        const amount = await db.getDailyBuy(myWallet, '2024-08-22');
        expect(amount).toBe(0.2);
    });

    it('getdailysell', async () => {
        const amount = await db.getDailySell(myWallet, '2024-08-22');
        expect(amount).toBe(0.080687634);
    });
});

afterAll(async () => {
    await db.close();
});