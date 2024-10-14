import { Client, Token } from '@solflare-wallet/utl-sdk';
import { SplTokenMeta as SplToken } from './definition';
import { Connection, PublicKey } from '@solana/web3.js';
import db from './db';
const utl = new Client();

async function getSplTokenMetaFromCache(connection:Connection, tokenMintAddress: string): Promise<SplToken> {
    let metaData = await db.getSplTokenMeta(tokenMintAddress);
    if (metaData) {
        return metaData;
    }

    metaData = await getSplTokenMeta(tokenMintAddress);
    if (metaData.name !== 'Unknown') {
        //再查询代币的总供应量，和其它信息一起存储到数据库
        const tokenAmount = await connection.getTokenSupply(new PublicKey(tokenMintAddress));
        metaData.supply = Math.floor(tokenAmount.value.uiAmount||0);
        await db.insertSplTokenMeta(metaData);
    }
    return metaData;
}

async function getSplTokenMeta(mint: string): Promise<SplToken> {
    try {
        const token = await utl.fetchMint(new PublicKey(mint));
        if (!token) {
            throw new Error(`spltoken [${mint}] not found`);
        }
        return { address: mint, decimal: token.decimals || 0, name: token.name, symbol: token.symbol, supply: 0};
    } catch (e) {
        return { address: mint, decimal: 0, name: 'Unknown', symbol: 'Unknown', supply: 0};
    }
}

export { getSplTokenMeta, getSplTokenMetaFromCache};