import Logger from "./logger";
const logger = new Logger('test');

logger.info('hello');
logger.debug(new Error('error'));
logger.error('error', new Error('error'));