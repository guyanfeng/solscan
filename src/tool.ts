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

async function increaseBuy(token:string, followWallet:string){
    const tokenInfo = await getSplTokenMetaFromCache(connection, token);
    const buyResult = await buy(token, tokenInfo.symbol, 1, 1, followWallet);
    console.log(buyResult);
}

async function increaseSell(token:string, smAmount:number){
    const tokenInfo = await getSplTokenMetaFromCache(connection, token);
    const smWallet = await db.getFollowWallet(config.myWallet, token);
    if (!smWallet){
        console.log(`No follow wallet for token: ${token}`);
        return;
    }
    const sellResult = await sell(token, tokenInfo.symbol, smWallet, smAmount);
    console.log(sellResult);
}

(async () => {
    const args = process.argv.slice(2);
    if (args.length === 0){
        console.log('Please provide a command');
        return;
    }
    const command = args[0];
    if (command === 'buy'){
        if (args.length < 3){
            console.log('usage: buy token followWallet');
            return;
        }
        const token = args[1];
        const followWallet = args[2];
        await increaseBuy(token, followWallet);
    } else if (command === 'sell'){
        if (args.length < 3){
            console.log('usage: sell token amount');
            return;
        }
        const token = args[1];
        const amount = parseInt(args[2]);
        await increaseSell(token, amount);
    } else if (command === 'test')
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