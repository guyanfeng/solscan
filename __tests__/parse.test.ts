import { Connection } from "@solana/web3.js";
import { getTransaction, hasDexInstruction, isTransferInstruction, parseDexTransaction, parseTradeTokens, parseTransferTransaction } from "../src/parse";
import Logger from "../src/logger";
const logger = new Logger('parseTest');

describe('parse transfer tokens', () => {
    it('transfer', async () => {
    // const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const connection = new Connection('https://solemn-quiet-sky.solana-mainnet.quiknode.pro/aae8fcbd78a8f90881ed7d195f9eca4273abfd7a/', 'confirmed');
        let sign = 'Bg36aYmHJoeLikVC71eq4zkCrQoXByjBMqP2K9PcGM2GahaXSRqd6MUoyzdJii6MvAyLY74u5sYnsKHekFB47Tm';
        const resp = await getTransaction(connection, sign);
        if (!resp) {
            logger.info('no resp');
            return;
        }
        const isTransfer = await isTransferInstruction(resp);
        expect(isTransfer).toBe(true);
        const transaction = await parseTransferTransaction(connection, resp);
        expect(transaction).toBeDefined();
        if (transaction) {
            expect(transaction.from).toBe('9oTsfYWULoX9V9X1xJosKquiv2RUxia6XTLZHn6aa5BN');
            expect(transaction.to).toBe('GUnZEPYDK6C8orN2Vv9KNeK37yn5iHyPZpyM3cPt7pni');
            expect(transaction.amount).toBe(3103624.804847);
            expect(transaction.token).toBe('ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY');
        }
    });
});

describe('parse trade token', () => {
    // const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const connection = new Connection('https://solemn-quiet-sky.solana-mainnet.quiknode.pro/aae8fcbd78a8f90881ed7d195f9eca4273abfd7a/', 'confirmed');
    it('2 token', async () => {
        const sign = 'FaSCJFN7bJUQZFBuoeUXziDKZyQWj2VCXQqiUsfXPp2bFbvVZ3LFwXYGdTZK9NGFVEwumjGZwpJus2GFih5mU9E';
        const resp = await getTransaction(connection, sign);
        if (!resp) {
            logger.info('no resp');
            return;
        }
        const tradeTokens = parseTradeTokens(resp);
        expect(tradeTokens.length).toBe(2);
        expect(tradeTokens[0].mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');//USDC
        expect(tradeTokens[0].amount).toBe(-10000);
        expect(tradeTokens[1].mint).toBe('8wXtPeU6557ETkp9WHFY1n1EcU6NxDvbAggHGsMYiHsB');//GME
        expect(tradeTokens[1].amount).toBe(480728.650256442);
    });

    it('1 token', async () => {
        const sign = '2oNSyxuTqNQ3qyZxPecTM22sF36bEqandtb23R7vnew6xbfWX9cvGeXtfhB6XHA4nMa3g9sGjRydhYUkyTTzi1BA';
        const resp = await getTransaction(connection, sign);
        if (!resp) {
            logger.info('no resp');
            return;
        }
        const tradeTokens = parseTradeTokens(resp);
        expect(tradeTokens.length).toBe(2);
        expect(tradeTokens[0].mint).toBe('MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5');//MEW
        expect(tradeTokens[0].amount).toBe(9486903.31651);
        expect(tradeTokens[1].mint).toBe('So11111111111111111111111111111111111111112');//SOL
        expect(tradeTokens[1].amount).toBe(-250.000054013);
    });

    it('2 token include WSOL', async () => {
        const sign = '315KvUzui8qbqwtgTaQ31GWkHbi1DkGpsqP8mqKUTUvo3AS1oaS1fSgitgxV2XsK2shHx3iDpU2mJB8c57KckuTt';
        const resp = await getTransaction(connection, sign);
        if (!resp) {
            logger.info('no resp');
            return;
        }
        const tradeTokens = parseTradeTokens(resp);
        expect(tradeTokens.length).toBe(2);
        expect(tradeTokens[0].mint).toBe('4jDXp8nR3MmJEeCLJtP4vSaz4UcG7TdWDRqNzr7Hpump');//Papi
        expect(tradeTokens[0].amount).toBe(-41712293.694442);
        expect(tradeTokens[1].mint).toBe('So11111111111111111111111111111111111111112');//SOL
        expect(tradeTokens[1].amount).toBe(3.7836739310000027);
    });

});

describe('parse dex', () => {
    // const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const connection = new Connection('https://solemn-quiet-sky.solana-mainnet.quiknode.pro/aae8fcbd78a8f90881ed7d195f9eca4273abfd7a/', 'confirmed');

    it('1 token', async () => {
        // pre 和 post 里面只有 1 个 token，最常见的情况
        const tx = '3MBeZfxKSvGVQdf2b4qXNbbonXo3S3k59zGrTreaDPHpDKzCAJEhv3Efra8bQNQRhtLimkQrhXcWPHssMBYoXSr1';
        const txResp = await getTransaction(connection, tx);
        expect(txResp).not.toBeNull();
        if (!txResp) {
            return;
        }
        const dexName = 'Raydium V4';
        const dexTx = await parseDexTransaction(connection, txResp, dexName);
        expect(dexTx).not.toBeNull();
        if (!dexTx) {
            return;
        }
        expect(dexTx.wallet).toBe('FSf2fXYsBqfyZqghtsD9apUgM5kMe3Jj3CHnqt5wmpGZ');
        expect(dexTx.dexName).toBe(dexName);
        expect(dexTx.from).toBe('SOL');
        expect(dexTx.fromAmount).toBe(4.500005003);
        expect(dexTx.to).toBe('BIEBER');
        expect(dexTx.toAmount).toBe(1969436.438946);
        expect(dexTx.tx).toBe(tx);
        expect(dexTx.time).toBe('2024-05-31 20:55:48');
    });

    it('2 token', async () => {
        // pre 和 post 里面是 2 个 token
        const tx = '5sJWMvDtdnRvMuC6CbuhtvL27ALmmtCSqieMW8os7Cg5eS8TLikHefJb1hJ3mMtVrX9nY5edNZyX4fsfkJ8deRVe';
        const txResp = await getTransaction(connection, tx);
        expect(txResp).not.toBeNull();
        if (!txResp) {
            return;
        }
        const dexName = 'Jupiter V6';
        const dexTx = await parseDexTransaction(connection, txResp, dexName);
        expect(dexTx).not.toBeNull();
        if (!dexTx) {
            return;
        }
        expect(dexTx.wallet).toBe('5PcwCtE9aAoU7yK8fnqMUVdkabWHa6ZWoTSYSijT11aE');
        expect(dexTx.dexName).toBe(dexName);
        expect(dexTx.from).toBe('SHARK');
        expect(dexTx.fromAmount).toBe(2.556888);
        expect(dexTx.to).toBe('DJT');
        expect(dexTx.toAmount).toBe(10.7924264);
        expect(dexTx.tx).toBe(tx);
        expect(dexTx.time).toBe('2024-06-19 17:02:05');
    });

    it('test', async () => {
        logger.info('hello');
        logger.debug(new Error('error'));
        logger.error('error', new Error('error'));
        return;
        // const tx = '5XLQpD71dMVnDuy7kJGsutwoVkFLpL9wefZ1V91VBeBT7Sw316M8czEAWoHx4T6BWuprmnCi7mhb9rmXH2EHNds1';
        // const txResp = await getTransaction(connection, tx);
        // expect(txResp).not.toBeNull();
        // if (!txResp) {
        //     return;
        // }
        // const dexName = await hasDexInstruction(connection, txResp);
        // if (!dexName) {
        //     const isTransfer = await isTransferInstruction(txResp);
        //     console.log(isTransfer);
        // }else{
        //     const dexTx = await parseDexTransaction(connection, txResp, dexName);
        //     console.log(dexTx);
        // }
    });
});