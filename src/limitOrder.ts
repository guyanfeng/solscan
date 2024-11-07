import { getPrice } from './jupiter'; 
import { sellByPercent } from './followOrder'; 
import db from './db'; 
const config = require('../config');
import Logger from './logger';
import { wait } from './wait';
import axios from 'axios';
import { send_tg } from './notify';
const logger = new Logger('limitOrder');

async function checkAndSellLimitOrders() {
    // 查询数据库中的 limitOrder 表
    const limitOrders = await db.getActivedLimitOrders();
    const priceIds = config.SOLTOKEN + ',' + limitOrders.map((x) => x.token).join(',');
    const url = `https://api.jup.ag/price/v2?ids=${priceIds}`;
    const priceResult = (await axios.get(url)).data;
    const solPrice = priceResult.data[config.SOLTOKEN].price;

    for (const order of limitOrders) {
        const { limitPrice, sellPercent, token } = order;
        //库中的价格是基于 SOL 的价格，需要转换为基于 USDT 的价格
        const currentPrice = priceResult.data[token].price / solPrice;
        // logger.debug(`Checking limit order: ${order.symbol}, solPrice: ${solPrice}, current price: ${currentPrice}, limit price: ${limitPrice}`);
        // 检查当前价格是否达到了 limitPrice
        if (currentPrice >= limitPrice) {
            const pos = await db.getPositionByToken(config.myWallet, order.token);
            if (!pos){
                logger.info('No position found for token', order.token);
                continue;
            }
            logger.debug(`Selling ${sellPercent}% of ${pos.balance} ${pos.symbol} at price ${currentPrice}`);
            await send_tg(`限价单触发: Selling ${sellPercent}% of ${pos.balance} ${pos.symbol} at price ${currentPrice}`);
            // 卖出 sellPercent 比例的代币
            try{
                await sellByPercent(pos.id, sellPercent);
                // 更新数据库中的 limitOrder 表
                await db.deactivateLimitOrder(order.id);
            }catch(e){
                logger.error('Failed to sell by percent', e);
            }
        }
        await wait(1000);
    }
}

export {checkAndSellLimitOrders};