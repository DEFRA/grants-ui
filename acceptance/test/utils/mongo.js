import { MongoClient } from 'mongodb'
import Backend from './backend.js'

const STATE_COLLECTION = 'state__grant_application_state'
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/?directConnection=true'
const MONGO_DATABASE = 'grants-ui-backend'

let client

async function getDb() {
  if (!client) {
    client = new MongoClient(MONGO_URI)
    await client.connect()
  }
  return client.db(MONGO_DATABASE)
}

class Mongo {
  async setApplicationStatus(crn, sbi, grantCode, applicationStatus) {
    const grantVersion = (await Backend.resolveGrantVersion(crn, sbi, grantCode)) ?? 1
    const db = await getDb()
    const result = await db
      .collection(STATE_COLLECTION)
      .updateOne(
        { sbi, grantCode, grantVersion: String(grantVersion) },
        { $set: { 'state.applicationStatus': applicationStatus }, $currentDate: { updatedAt: true } }
      )

    if (result.matchedCount === 0) {
      throw new Error(
        `No application state found for SBI ${sbi}, grant ${grantCode}, grantVersion ${grantVersion} to set applicationStatus`
      )
    }
  }
}

export default new Mongo()
