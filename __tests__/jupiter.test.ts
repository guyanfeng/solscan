const config = require('../config')
import {getPrice, jupSwap} from '../src/jupiter';
import db from '../src/db';

describe('jupiter', () => {
    it('getPrice', async () => {
        const token = 'A3Y1xWobiHkbRcbfn2nHCbfMFEMupGw1UkUucUFUpump';
        const price = await getPrice(token);
        console.log(`Token:${token}, Price: ${price}`);
        expect(price).toBeGreaterThan(0);
    });

    it('buy', async () => {
        const token = '4rXiu7Vw9rdpHHKFLBGzzTWTWpgHVmUq2jJEKCt6FPGY';
        const amount = 0.02 * 10 ** 6;
        const swapResult = await jupSwap(config.SOLTOKEN, token, amount.toString());
        expect(swapResult.success).toBeTruthy();
        console.log(`Buy ${amount} SOL for ${token}, txid: ${swapResult.tx}`);
    });

    it('sell', async () => {
        const token = 'A3Y1xWobiHkbRcbfn2nHCbfMFEMupGw1UkUucUFUpump';
        const amount = 100 * 10 ** 6;
        const swapResult = await jupSwap(config.SOLTOKEN, token, amount.toString());
        expect(swapResult.success).toBeTruthy();
        console.log(`Buy ${amount} SOL for ${token}, txid: ${swapResult.tx}`);
    });
});

afterAll(async () => {
    await db.close();
});