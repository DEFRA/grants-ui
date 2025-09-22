import { config } from '~/src/config/config.js'
export const sbiStore = new Map().set('sbi', config.get('landGrants.defaultSbi'))
