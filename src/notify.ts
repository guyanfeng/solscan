import axios from 'axios';
const config = require('../config')
import Logger from './logger';
const logger = new Logger('notify');

export async function send_tg(msg: string) {
    logger.info(`发送消息: ${msg}`);
    const TG_KEY = config.tgbotKey;
    const TG_CHAT_ID = `-100${config.tgid}`;
    const url = `https://api.telegram.org/bot${TG_KEY}/sendMessage?chat_id=${TG_CHAT_ID}&text=${encodeURIComponent(msg)}`;
    try {
        if (config.dev) {
            logger.info(`[dev 环境下不发送消息] : ${msg}`);
        } else {
            await axios.get(url);
        }
    } catch (e:any) {
        logger.error(e);
    }
}
