const configData = require('../config');
import base58 from "bs58";
import { jupSwap } from "./jupiter";
import { getSplTokenMetaFromCache } from "./spltoken";
import { buy, sell } from "./followOrder";
import { getTransaction, hasDexInstruction, parseDexTransaction } from "./parse";
import { Connection, PublicKey } from "@solana/web3.js";
import db from "./db";
const config = require('../config');
import Logger from "./logger";
const logger = new Logger('tool');

const connection: Connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

(async () => {
    const args = process.argv.slice(2);
    if (args.length === 0){
        console.log('Please provide a command');
        return;
    }
    const command = args[0];
    if (command === 'test')
    {
        const tx = await jupSwap('7bCTaMF64WrhqyDqwri9XMsXsufEKGjUByDLnXGwpump', 'So11111111111111111111111111111111111111112', (2951775.567491 * 1000000).toString(), 2);
        const txid = tx.transaction.signatures[0];
        if (!tx){
            logger.error(`Transaction ${txid} not found`);
            return;
        }
        const dexTx = await parseDexTransaction(connection, tx, 'test');
        if (!dexTx){
            logger.error(`Transaction ${txid} is not a dex transaction`);
            return;
        }
        logger.debug(`Dex instruction: ${dexTx}`);
    } else if (command === 'updatesupply'){
        const tokens = await db.getSplTokenMetas();
        for (const token of tokens){
            const supply = await connection.getTokenSupply(new PublicKey(token.address));
            await db.updateSplTokenMeta(token.address, token.symbol, token.name, Math.floor(supply.value.uiAmount||0));
            logger.info(`Update supply for ${token.symbol} to ${Math.floor(supply.value.uiAmount||0)}`);
        }
    }
     else {
        console.log(`Unknown command: ${command}`);
    }
    await db.close();
})();