import db from "./db";
import moment from "moment";
const config = require("../config");
import Logger from "./logger";
const logger = new Logger('daily');

//进行日结算

async function daily(day:string) {
    let [lastDay, balance] = await db.getLastDailyData(config.myWallet);
    let currentDay = moment();
    if (!lastDay){
        currentDay = moment().subtract(1, 'months');
        balance = 0;
    }else{
        currentDay = moment(lastDay).add(1, 'days');
    }
    while (currentDay.isBefore(moment(day))){
        const buyAmount = await db.getDailyBuy(config.myWallet, currentDay.format("YYYY-MM-DD"));
        const sellAmount = await db.getDailySell(config.myWallet, currentDay.format("YYYY-MM-DD"));
        balance = (balance||0) - buyAmount + sellAmount;

        logger.info(`daily ${currentDay.format("YYYY-MM-DD")}, buyAmount: ${buyAmount}, sellAmount: ${sellAmount}, balance: ${balance}`);
        await db.updateDailyData(config.myWallet, currentDay.format("YYYY-MM-DD"), balance);
        currentDay.add(1, 'days');
    }
}

(async () => {
    await daily(moment().format("YYYY-MM-DD"));
    db.close();
})();