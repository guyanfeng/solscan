export interface Config {
    wallets: string[];
};

export enum TransactionType {
    None = 0,
    Transfer = 1,
    Dex = 2
}

export interface DexInstruction {
    name: string;//交易所名称
    accountIndex: number;//交易所账号索引
    instructionIndex: number;//交易所指令索引
}

// 交易所交易记录
export interface DexTransaction {
    wallet: string;
    dexName: string;
    // 卖出币种
    from: string;
    fromToken: string;
    fromAmount: number;
    // 买入币种
    to: string;
    toToken: string;
    toAmount: number;
    tx: string;
    time: string;
    note?: string;
}

export interface TransferTransaction {
    // 发送方
    from: string;
    // 接收方
    to: string;
    // 交易币种
    token: string;
    symbol: string;
    amount: number;
    tx: string;
    time: string;
}

export interface TokenData {
    mint: string;
    decimals: number;
    name: string;
    symbol: string;
}

export interface TransactionToken {
    mint: string;
    amount: number;
    name: string;
}

export interface SplTokenMeta {
    address: string;
    name: string;
    symbol: string;
    decimal: number;
    //总供应量
    supply: number;
}

export interface MonitorData {
    wallet: string;
    tx: string;
    time: string;
}

// jupiter v6 api 的结果
interface SwapResult {
    success: boolean;
    errCode: string;
    tx: string;
}

interface OrderResult {
    txid: string;
    fromAmount: number;
    price: number;
    toAmount: number;
}

interface FollowRecord {
    updateTime: string,
    symbol: string,
    solAmount: number,
    tokenAmount: number,
    followWallet: string,
    tradeType: string
}

interface HoldRecord {
    id: number,
    token: string
    symbol: string,
    balance: number,
    wallet: string,
    followWallet: string
}

//跟单策略
interface FollowPolicy {
    wallet: string,
    walletNote: string | undefined,
    followBuy: boolean | undefined,
    followSell: boolean | undefined,
    minBuyingAmount: number | undefined,
    maxMarketValue: number | undefined,
    followPercent: number | undefined,
    followAmount: number | undefined,
    maxFollowAmount: number | undefined,
    //延迟时间，单位秒，买入后延迟一段时间再跟单，如果在延迟时间内卖出，则不跟单
    delaySeconds: number | undefined,
}

//限价单
interface LimitOrder{
    id: number,
    token: string,
    symbol: string,
    limitPrice: number,
    sellPercent: number,
    actived: boolean,
}

export { OrderResult, FollowRecord, HoldRecord, SwapResult, FollowPolicy, LimitOrder };