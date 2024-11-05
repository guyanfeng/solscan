const configData = 
{
    myWallet: '1',
    myWalletPrivateKey: '1',
    //是否是开发模式，开发模式不会真实买入卖出，线上要改为 false
    dev: true,
    //最大滑点百分比， 50 = 50%
    maxAutoSlippageBps: 50,
    //优先费，单位 SOL
    priorityFee: 0.001,
    //交易机器人 jupiter,gmgn
    tradingBot: 'gmgn',
    canBuy: true,
    canSell: true,
    SOLTOKEN: "So11111111111111111111111111111111111111112",
    monitorRpc: "https://api.mainnet-beta.solana.com",
    tradeRpc: "https://api.mainnet-beta.solana.com",
    policy: [
        {
            //钱包地址
            wallet: 'ABCDEFG',
            //钱包备注
            walletNote: '印钞机',
            //聪明钱最小买入金额，单位 SOL，小于此金额不买入
            minBuyingAmount: 10,
            //土狗最大市值，超过此市值不买入
            maxMarketValue: 1000000,
            //开启后才跟单买入
            followBuy: true,
            //开启后才跟单卖出
            followSell: true,
            //跟单金额百分比，0.01 就是 1%，如果定义了固定跟单金额，则此配置无效
            followPercent: 0.01,
            //跟单金额固定值，单位 SOL，如果 followAmount大于0，则followPercent 失效
            followAmount: 0.1,
            //单次最大跟单金额，单位 SOL
            maxFollowAmount: 0.3,
            //延迟时间，单位秒，买入后延迟一段时间再跟单，如果在延迟时间内聪明钱包卖出了，则不跟单
            delaySeconds: 60,
        }
    ],
    host: "0.0.0.0",
    port: 8020,
    //tg机器人key
    tgbotKey: 'xxx',
    //tg频道编号
    tgid: "xxx"
}

module.exports = configData;
// export default configData;
