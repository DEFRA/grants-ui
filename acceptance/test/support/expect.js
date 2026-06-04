import { expect } from '@playwright/test'
import { PLAYWRIGHT_EXPECT_TIMEOUT_MS } from './world.js'

export default expect.configure({ timeout: PLAYWRIGHT_EXPECT_TIMEOUT_MS })
