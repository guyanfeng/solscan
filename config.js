const configData = 
{
    //监控的钱包
    wallets:[
        "111",
        "222"
    ],
    myWallet:"1",
    myWalletPrivateKey:"1",
    //跟单钱包
    flowWallets:[
        "TEST_FOLLOW_ADDRESS"
    ],
    dev: true,
    canBuy: true,
    canSell: true,
    maxFollowMarketValue: 1000000,
    SOLTOKEN: "So11111111111111111111111111111111111111112",
    tradeRpc: "https://api.mainnet-beta.solana.com",
    jupiterRpc: "https://public.jupiterapi.com",
    //web ui
    host:"127.0.0.1",
    port:8020,
    tgbotKey: 'xxxxx',
    //tg 频道编号
    tgid: '23xxxxxxxxx'
}

module.exports = configData;
// export default configData;