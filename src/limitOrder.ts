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
    const priceIds = limitOrders.map((x) => x.token).join(',');
    const url = `https://api.jup.ag/price/v2?ids=${priceIds}`;
    const priceResult = (await axios.get(url)).data;

    for (const order of limitOrders) {
        const { limitPrice, sellPercent, token } = order;
        const currentPrice = priceResult.data[token].price;
        logger.debug(`Checking limit order: ${order.symbol}, current price: ${currentPrice}, limit price: ${limitPrice}`);
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

checkAndSellLimitOrders();