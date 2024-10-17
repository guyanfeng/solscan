import { Connection } from '@solana/web3.js';
import db from '../src/db';
import { getSplTokenMeta, getSplTokenMetaFromCache, getSplTokenBalance } from '../src/spltoken';
import { randomUUID } from 'crypto';
import { SplTokenMeta } from '../src/definition';


describe('mtl', () => {
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    it('getSplToken', async () => {
        const mint = 'So11111111111111111111111111111111111111112';
        const token = await getSplTokenMeta(mint);
        expect(token.address).toBe(mint);
        expect(token.decimal).toBe(9);
        expect(token.name).toBe('Wrapped Solana');
        expect(token.symbol).toBe('SOL');
    });

    it('getSplTokenFromCache', async () => {
        // const mint = 'So11111111111111111111111111111111111111112';
        const mint = '6wo6TKVebW8RRxyT9CUFGFNHhoV8nwqwdZzm2QJXpump';
        const token = await getSplTokenMetaFromCache(connection, mint);
        expect(token.address).toBe(mint);
        expect(token.decimal).toBe(9);
        expect(token.name).toBe('Wrapped Solana');
        expect(token.symbol).toBe('SOL');
        expect(token.supply).toBeGreaterThan(0);
    });

    it('getTokenBalance', async () => {
        const wallet = 'narhjFTwcEQ12L9ukMVfnQR51L4PyTAMujkidYADm4r';
        const mint = '8HfFvgutvKBjdbTqm8h6qZ2VSJ3TxwrZxHT3m34Cpump';
        const balance = await getSplTokenBalance(connection, wallet, mint);
    });

    it('insertSplTokenMeta', async () => {
        const mint = randomUUID();
        const row:SplTokenMeta = {
            address: mint,
            decimal: 9,
            name: 'Test Token Name',
            symbol: 'TEST Token',
            supply: 999999999
        }
        await db.insertSplTokenMeta(row);
        const token = await db.getSplTokenMeta(mint);
        expect(token).toBeDefined();
        if (!token) {
            return;
        }
        expect(token.address).toBe(mint);
        expect(token.decimal).toBe(9);
        expect(token.name).toBe('Test Token Name');
        expect(token.symbol).toBe('TEST Token');
        expect(token.supply).toBe(999999999);
    });

});

afterAll(async () => {
    await db.close();
});