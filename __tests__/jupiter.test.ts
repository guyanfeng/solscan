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

    // it('buy', async () => {
    //     const token = '8jT2uVGpC6PbsPcQJ5bmEH9D8pQq41WEUMaUpo9Npump';
    //     const amount = 0.02 * 10 ** 6;
    //     const swapResult = await jupSwap(config.SOLTOKEN, token, amount.toString());
    // });

    // it('sell', async () => {
    //     const token = 'A3Y1xWobiHkbRcbfn2nHCbfMFEMupGw1UkUucUFUpump';
    //     const amount = 100 * 10 ** 6;
    //     const swapResult = await jupSwap(config.SOLTOKEN, token, amount.toString());
    // });
});

afterAll(async () => {
    await db.close();
});