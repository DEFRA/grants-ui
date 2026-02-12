import tryCatchAllowedFunctions from './try-catch-allowed-functions.js'
import { RuleTester } from 'eslint'

const ruleTester = new RuleTester()

ruleTester.run('try-catch-allowed-functions', tryCatchAllowedFunctions, {
  valid: [
    {
      code: 'try { } catch (error) { log(error) }',
      options: [{ include: ['log'] }]
    },
    {
      code: 'try { log(`hello`) } catch (error) { }',
      options: [{ exclude: ['log'] }]
    }
  ],

  invalid: [
    {
      code: 'try { } catch (error) { log(error) }',
      options: [{ exclude: ['log'] }],
      errors: 1
    }
  ]
})

// eslint-disable-next-line no-console
console.log('All tests passed!')
