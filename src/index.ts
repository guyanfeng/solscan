import express from 'express';
import path from 'path';
import db from './db';
import { jupiterBuy, manualBuy, sell, sellByPercent } from './followOrder';
import Logger from './logger';
const logger = new Logger('web');
const config = require('../config.js');

const app = express();
const host = config.host;
const port = config.port;

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Define routes
app.get('/', async (req, res) => {
    const data:any = {};
    const followCount = await db.getFollowCount();
    data.buyOrders = followCount[0];
    data.sellOrders = followCount[1];
    data.totalOrders = data.buyOrders + data.sellOrders;

    const solCount = await db.getSolAmount();
    data.buySOL = solCount[0];
    data.sellSOL = solCount[1];
    data.netPositionSOL = Math.round((data.sellSOL - data.buySOL)*100)/100;

    //最近7天的净持仓
    const solNetPositionHistory = await db.getLast7DaysDailyData(config.myWallet);
    data.solNetPositionHistory = solNetPositionHistory;

    //当前持仓
    const currentPositions = await db.getCurrentHold();
    //把钱包地址脱敏
    currentPositions.forEach((x:any)=>{
        x.followWallet = x.followWallet.slice(0, 3) + '*********' + x.followWallet.slice(-3);
    });
    data.currentPositions = currentPositions;

    //钱包收益
    const walletProfits = await db.getTop10WalletProfit();
    //把钱包地址脱敏
    walletProfits.forEach((x:any)=>{
        x.wallet = x.wallet.slice(0, 3) + '*********' + x.wallet.slice(-3);
    });
    data.walletProfits = walletProfits;

    //币种收益
    const tokenProfits = await db.getTop10TokenProfit();
    data.tokenProfits = tokenProfits;

    //跟单详情
    const followDetails = await db.getFollowDetail();
    //把钱包地址脱敏
    followDetails.forEach((x:any)=>{
        x.followWallet = x.followWallet.slice(0, 3) + '*********' + x.followWallet.slice(-3);
    });

    data.followDetails = followDetails;

    res.render('index', data);
});

app.get('/trade/:id(\\d+)', async (req, res) => {
    const id = parseInt(req.params.id);
    const data:any = {};
    data.id = id;
    data.position = await db.getPositionById(id);
    if (!data.position){
        return res.status(404).send('Position not found');
    }
    res.render('trade', data);
});

// 卖出代币的处理逻辑
app.post('/api/sell', async (req, res) => {
    const { positionId, percent } = req.body;
    
    // 确保传递了 tokenId 和 percentage
    if (!positionId || !percent) {
        return res.status(400).json({ error: '必须提供代币ID和百分比' });
    }
    
    try{
        const result = await sellByPercent(parseInt(positionId), parseFloat(percent));
        logger.info(`sell: ${positionId}, ${percent}`);
        return res.json(result);
    }catch(e:any){
        logger.error(`sell error: ${e.message}`);
        return res.status(500).json({ error: e.message });
    }
});

app.post('/api/updateBalance', async (req, res) => {
    const { positionId, balance } = req.body;
    
    if (!positionId || !balance) {
        return res.status(400).json({ error: '必须提供代币ID和余额' });
    }
    
    try{
        await db.updateBalance(parseInt(positionId), parseFloat(balance));
        logger.info(`update balance: ${positionId}, ${balance}`);
        return res.json({ message: '更新成功' });
    }catch(e:any){
        logger.error(`update balance error: ${e.message}`);
        return res.status(500).json({ error: e.message });
    }
});

app.post('/api/delete/:id(\\d+)', async (req, res) => {
    const id = parseInt(req.params.id);
    try{
        await db.deletePosition(id);
        logger.info(`delete position: ${id}`);
        return res.json({ message: '删除成功' });
    }catch(e:any){
        logger.error(`delete position error: ${e.message}`);
        return res.status(500).json({ error: e.message });
    }
});

app.post('/api/buy', async (req, res) => {
    const { token} = req.body;
    if (!token) {
        return res.status(400).json({ error: '必须提供代币ID' });
    }
    try{
        const result = await manualBuy(token);
        logger.info(`buy: ${token}`);
        return res.json(result);
    }catch(e:any){
        logger.error(`buy error: ${e.message}`);
        return res.status(500).json({ error: e.message });
    }
});

app.listen(port, host, () => {
    console.log(`Server is running at http://${host}:${port}`);
});