import { Connection, PublicKey } from "@solana/web3.js";
import { getTransaction, hasDexInstruction, parseDexTransaction } from "../src/parse";
import { describe, it, expect } from "@jest/globals";
import Logger from "../src/logger";
const logger = new Logger('IndexTest');
import db from "../src/db";

describe('index', () => {
    it('onDexTransaction', async () => {
        
    });
    it('temp', async () => {
        // const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
        const connection = new Connection('https://solemn-quiet-sky.solana-mainnet.quiknode.pro/aae8fcbd78a8f90881ed7d195f9eca4273abfd7a/', 'confirmed');
        const sign = '32bxRwnN24noH67QQTjggtbvhc5Wv73Dpie3254o5BYdQBkXE8rwKRZiqCWtNo7VextkTHuNhoYc32euJkWJJNNy';
        const resp = await getTransaction(connection, sign);
        if (!resp) {
            logger.info('no resp');
            return;
        }

        const dexName = await hasDexInstruction(connection, resp);
        if (!dexName) {
            logger.info('Not a dex transaction');
            return;
        }
        logger.info(dexName);
        const dexTx = await parseDexTransaction(connection, resp, dexName);
        if (!dexTx) {
            logger.info('Failed to parse dex transaction');
            return;
        }
        logger.info(`wallet: ${dexTx.wallet}, dexName: ${dexTx.dexName}, from: ${dexTx.from}, fromAmount: ${dexTx.fromAmount}, to: ${dexTx.to}, toAmount: ${dexTx.toAmount}, tx: ${dexTx.tx}, time:${dexTx.time}`);

        // if (resp.transaction.message instanceof MessageV0) {
        //     resp.transaction.message.compiledInstructions.forEach(instruction => {
        //         console.log(`v0 instruction ${i} start`);
        //         console.log(instruction.programIdIndex);
        //         console.log(instruction.accountKeyIndexes);
        //         console.log(instruction.data);
        //         console.log(`v0 instruction ${i} end\n`);
        //         i++;
        //     });
        // } else {
        //     resp.transaction.message.instructions.forEach(instruction => {
        //         console.log(`legacy instruction ${i} start`);
        //         console.log(instruction.programIdIndex);
        //         console.log(instruction.accounts);
        //         console.log(instruction.data);
        //         console.log(`legacy instruction end\n`);
        //     });
        // }
    });
});

afterAll(async () => {
    await db.close();
});