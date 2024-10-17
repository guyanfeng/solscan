import knex from 'knex';
import { DexTransaction, FollowRecord, HoldRecord, SplTokenMeta as SplToken } from './definition';
const config = require('../config');
import moment from 'moment';

class MainDB {
    db: knex.Knex<any, unknown[]>;
    // dbFile: string = config.dev?'dbTest.sqlite':'db.sqlite';
    dbFile: string = 'db.sqlite';
    constructor(file?: string) {
        if (file) {
            this.dbFile = file;
        }
        this.db = knex({
            client: 'sqlite3',
            connection: {
                filename: this.dbFile
            },
            useNullAsDefault: true
        });
    }

    public async insertTransaction(row: DexTransaction): Promise<number> {
        const result = await this.db('trans').insert(row);
        return result[0];
    }

    public async getTransactionByTx(tx: string): Promise<DexTransaction | null> {
        const transaction = await this.db('trans').where('tx', tx).first();
        return transaction || null;
    };

    public async deleteTransactionByTx(tx: string): Promise<number | null> {
        const transaction = await this.db('trans').where('tx', tx).delete();
        return transaction || null;
    };
    
    public async insertSplTokenMeta(row: SplToken): Promise<number> {
        const result = await this.db('spltoken').insert(row);
        return result[0];
    }

    public async getSplTokenMetas(): Promise<SplToken[]> {
        const tokens = await this.db('spltoken');
        return tokens;
    }

    public async updateSplTokenMeta(mint: string, symbol: string, name: string, supply: number): Promise<void> {
        await this.db('spltoken').where('address', mint).update({symbol, name, supply});
    }

    public async updateBuyInfo(token:string, symbol:string, solAmount:number, tokenAmount:number, flowAddress:string, tx:string, wallet:string, time:string) : Promise<void> {
        const row: DexTransaction = {
            tx: tx,
            wallet: wallet,
            from: 'SOL',
            fromToken: config.SOLTOKEN,
            fromAmount: solAmount,
            to: symbol,
            toToken: token,
            toAmount: tokenAmount,
            time: time,
            dexName: 'Jupiter V6',
            note: flowAddress
        };

        //sqlite 中不能在一个事务中运行非事务的查询，会挂住
        const exists = await this.getTransactionByTx(tx) !== null;
        const trx = await this.db.transaction();
        try{
            if (!exists){
                await trx('trans').insert(row);
            }
            const pos = await trx('position').where('wallet', wallet).andWhere('token', token).first();
            if (pos){
                await trx('position').where('wallet', wallet).andWhere('token', token).update({balance:pos.balance+tokenAmount, updateTime:time});
            }else{
                await trx('position').insert({wallet:wallet, token:token, symbol:symbol, balance:tokenAmount, updateTime:time, followWallet:flowAddress});
            }

            await trx.commit();
        }catch(e){
            await trx.rollback();
            throw e;
        }
    }

    public async updateBuyPosition(token:string, symbol:string, solAmount:number, tokenAmount:number, flowAddress:string, wallet:string, time:string) : Promise<void> {
        const pos = await this.db('position').where('wallet', wallet).andWhere('token', token).first();
        if (pos){
            await this.db('position').where('wallet', wallet).andWhere('token', token).update({balance:pos.balance+tokenAmount, updateTime:time});
        }else{
            await this.db('position').insert({wallet:wallet, token:token, symbol:symbol, balance:tokenAmount, updateTime:time, followWallet:flowAddress});
        }
    }

    public async updateSellInfo(token:string, symbol:string, tokenAmount:number, solAmount:number, tx:string, wallet:string, time:string, followWallet:string) : Promise<void> {
        const row: DexTransaction = {
            tx: tx,
            wallet: wallet,
            from: symbol,
            fromToken: token,
            fromAmount: tokenAmount,
            to: 'SOL',
            toToken: config.SOLTOKEN,
            toAmount: solAmount,
            time: time,
            dexName: 'Jupiter V6',
            note:followWallet
        };
        //sqlite 中不能在一个事务中运行非事务的查询，会挂住
        const exists = await this.getTransactionByTx(tx) !== null;
        const trx = await this.db.transaction();
        try{
            if (!exists){
                await trx('trans').insert(row);
            }
            const pos = await trx('position').where('wallet', wallet).andWhere('token', token).first();
            //有一种可能是系统中并没有记录聪明钱的买入，那么它在卖出时就不会有持仓记录
            if (pos){
                if (pos.balance - tokenAmount <= 0){
                    await trx('position').where('wallet', wallet).andWhere('token', token).delete();
                }else{
                    await trx('position').where('wallet', wallet).andWhere('token', token).update({balance:pos.balance-tokenAmount, updateTime:time});
                }
            }

            await trx.commit();
        }catch(e){
            await trx.rollback();
            throw e;
        }
    }

    public async updateSellPosition(token:string, symbol:string, solAmount:number, tokenAmount:number, flowAddress:string, wallet:string, time:string) : Promise<void> {
        const pos = await this.db('position').where('wallet', wallet).andWhere('token', token).first();
        if (!pos){
            throw new Error(`钱包 ${wallet} 没有 ${token}的持仓`);
        }
        if (pos.balance - tokenAmount <= 0){
            await this.db('position').where('wallet', wallet).andWhere('token', token).delete();
        }else{
            await this.db('position').where('wallet', wallet).andWhere('token', token).update({balance:pos.balance-tokenAmount, updateTime:time});
        }     
    }

    public async getSplTokenMeta(mint: string): Promise<SplToken | null> {
        const token = await this.db('spltoken').where('address', mint).first();
        return token || null;
    }

    // 废弃
    // public async getTokenBalance(wallet:string, token: string): Promise<number> {
    //     const pos = await this.db('position').where('wallet', wallet).andWhere('token', token).first();
    //     return pos?.balance || 0;
    // }

    /**
     * 找到最后一次跟单时的聪明钱地址
     * @param token token mint
     * @returns smart money wallet address
     */
    public async getFollowWallet(wallet:string, token: string): Promise<string | undefined> {
        const pos = await this.db('position').where('wallet', wallet).andWhere('token', token).first();
        if (!pos){
            return undefined;
        }
        return pos.followWallet;
    }

    public async isBlackToken(token:string) : Promise<boolean> {
        const blackToken = await this.db('blackToken').where('token', token).first();
        return blackToken !== undefined;
    }

    /**
     * 获取一段时间内 token的净持仓
     * @returns 
     */
    public async getRangeTokanBalance(wallet:string, token:string, start:string, end:string) : Promise<number> {
        const result = await this.db.raw(`select buy.amount-sell.amount as netposition
from (
select sum(fromAmount) as amount
from trans
where wallet = ?
and fromToken = ?
and toToken = ?
and time >= ?
and time < ?
)buy,
(select sum(toAmount) as amount
from trans
where wallet = ?
and toToken = ?
and fromToken = ?
and time >= ?
and time < ?
)sell`, [wallet, config.SOLTOKEN, token, start,end,wallet, config.SOLTOKEN, token, start,end]);
        return result[0].netposition || 0;
    }

    public async getLastDailyData(wallet:string) : Promise<(number|undefined)[]> {
        const result = await this.db.raw('select day, balance from soldaily where wallet=? order by day desc limit 1', [wallet]);
        return [result[0]?.day, result[0]?.balance];
    }

    public async getDailyBuy(wallet:string, time:string) : Promise<number> {
        const currentDay = moment(time);
        const result = await this.db.raw('select sum(fromAmount) as amount from trans where wallet =? and fromToken=? and time >=? and time < ?', [config.myWallet, 'So11111111111111111111111111111111111111112', currentDay.format("YYYY-MM-DD"), currentDay.add(1, 'days').format("YYYY-MM-DD")]);
        return result[0].amount || 0;
    }

    public async getDailySell(wallet:string, time:string) : Promise<number> {
        const currentDay = moment(time);
        const result = await this.db.raw('select sum(toAmount) as amount from trans where wallet =? and toToken=? and time >=? and time < ?', [config.myWallet, 'So11111111111111111111111111111111111111112', currentDay.format("YYYY-MM-DD"), currentDay.add(1, 'days').format("YYYY-MM-DD")]);
        return result[0].amount || 0;
    }

    public async updateDailyData(wallet:string, day:string, balance:number) : Promise<void> {
        const pos = await this.db('soldaily').where('wallet', wallet).andWhere('day', day).first();
        if (pos){
            await this.db('soldaily').where('wallet', wallet).andWhere('day', day).update({balance:balance});
        }else{
            await this.db('soldaily').insert({wallet:wallet, day:day, balance:balance});
        }
    }

    // 获取跟单次数
    public async getFollowCount(): Promise<number[]> {
        const buyCount = await this.db.raw('select count(*) as count from trans where fromToken=? and wallet=?', ['So11111111111111111111111111111111111111112', config.myWallet]);
        const sellCount = await this.db.raw('select count(*) as count from trans where toToken=? and wallet=?', ['So11111111111111111111111111111111111111112', config.myWallet]);
        return [(buyCount[0].count), sellCount[0].count];
    }

    // 获取 sol 持仓
    public async getSolAmount(): Promise<number[]> {
        const buyAmount = await this.db.raw('select round(sum(fromAmount),2) as amount from trans where fromToken=? and wallet=?', ['So11111111111111111111111111111111111111112', config.myWallet]);
        const sellAmount = await this.db.raw('select round(sum(toAmount),2) as amount from trans where toToken=? and wallet=?', ['So11111111111111111111111111111111111111112', config.myWallet]);
        return [buyAmount[0].amount, sellAmount[0].amount];
    }

    public async getLast7DaysDailyData(wallet: string): Promise<Record<string, number>[]> {
        const result = await this.db.raw('select * from (select day, round(balance,2) as balance from soldaily where wallet=? order by day desc limit 7) order by day', [wallet]);
        return result;
    }

    public async getTop10WalletProfit(): Promise<Record<string, number>[]> {
        const oneMonthAgo = moment().subtract(1, 'months').format("YYYY-MM-DD");
        const result = await this.db.raw(`select s.wallet, round(ifnull(b.amount,0)-ifnull(s.amount,0),2) as profit from (select wallet, sum(fromAmount) as amount from trans where fromToken='So11111111111111111111111111111111111111112' and [time] >='${oneMonthAgo}'
group by wallet) as s left join 
(select wallet, sum(toAmount) as amount from trans where toToken='So11111111111111111111111111111111111111112' and [time] >='${oneMonthAgo}'
group by wallet) as b on s.wallet=b.wallet
order by 2 desc
limit 10`);
        return result;
    }

    public async getTop10TokenProfit(): Promise<Record<string, number>[]> {
        const result = await this.db.raw(`
select s.symbol, round(b.solAmount-s.solAmount,2) as profit from (select [to] as symbol, sum(fromAmount) as solAmount from trans where wallet =? and fromToken='So11111111111111111111111111111111111111112'
group by [to]) as s left join 
(select [from] as symbol, sum(toAmount) as solAmount from trans where wallet =? and toToken='So11111111111111111111111111111111111111112'
group by [from]) as b on s.symbol=b.symbol
order by 2 desc
limit 10`, [config.myWallet, config.myWallet]);
        return result;
    }

    //当前持仓
    public async getCurrentHold(): Promise<HoldRecord[]> {
        const data = await this.db('position').where('wallet', config.myWallet).orderBy('updateTime');
        return data;
    }

    //是否在持仓中
    public async isInPosition(token:string): Promise<boolean> {
        const pos = await this.db('position').where('wallet', config.myWallet).andWhere('token', token).first();
        return pos !== undefined;
    }

    public async getFollowDetail(): Promise<FollowRecord[]> {
        const result = await this.db.raw(`select * from (
select time as updateTime, [to] as symbol, fromAmount as solAmount, toAmount as tokenAmount, note as followWallet, '买入' as tradeType  from trans where wallet=? and fromToken='So11111111111111111111111111111111111111112'
union
select time as updateTime, [from] as symbol, round(toAmount,2) as solAmount, fromAmount as tokenAmount, note as followWallet, '卖出' as tradeType  from trans where wallet=? and toToken='So11111111111111111111111111111111111111112'
)
order by updateTime desc limit 24`, [config.myWallet, config.myWallet]);
        return result;
    }

    public async getPositionById(id:number): Promise<HoldRecord | null> {
        const pos = await this.db('position').where('id', id).first();
        return pos || null;
    }

    public async getPositionByToken(wallet:string, token:string): Promise<HoldRecord | null> {
        const pos = await this.db('position').where('wallet', wallet).andWhere('token', token).first();
        return pos || null;
    }

    public async updateBalance(id:number, balance:number): Promise<void> {
        await this.db('position').where('id', id).update({balance:balance});
    }

    public async updateBalanceByToken(wallet:string, token:string, balance:number): Promise<void> {
        await this.db('position').where('wallet', wallet).andWhere('token', token).update({balance:balance});
    }

    public async deletePosition(id:number):Promise<void>{
        await this.db('position').where('id', id).delete();
    }

    public async close() {
        await this.db.destroy();
    }

    /**
     * 仅供测试用，在测试之前删除所有测试数据
     * @param token token mint
     */
    public async cleanAllTestData(wallet:string, token:string) {
        await this.db.raw('delete from trans where (toToken=? or fromToken=?) and wallet=?', [token, token, wallet]);
    }
}

export default new MainDB();