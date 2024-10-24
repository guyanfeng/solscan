
const configData =
{
    myWallet: '1',
    myWalletPrivateKey: '1',
    //是否是开发模式，开发模式不会真实买入卖出，线上要改为 false
    dev: true,
    canBuy: true,
    canSell: true,
    SOLTOKEN: 'So11111111111111111111111111111111111111112',
    tradeRpc: 'https://api.mainnet-beta.solana.com',
    policy: [
        {
            wallet: '1',
            walletNote: '钱包备注',
            //聪明钱最小买入金额，单位 SOL，小于此金额不买入
            minBuyingAmount: 10,
            //土狗最大市值，超过此市值不买入
            maxMarketValue: 1000000,
            followBuy: true,
            followSell: true,
            //跟单金额百分比，0.01就是1%，如果 followAmount大于0，followPercent 无效
            followPercent: 0.01,
            //跟单金额固定值，单位 SOL，如果 followAmount大于0，followPercent 无效
            followAmount: 0.1,
            //单次最大跟单金额，单位 SOL
            maxFollowAmount: 0.3,
            //延迟时间，单位秒，买入后延迟一段时间再跟单，如果在延迟时间内卖出，则不跟单
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
