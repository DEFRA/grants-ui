import { createSumValidatedController } from '~/src/server/common/controllers/sum-validated-task-page.controller.js'

const woodlandHectaresRules = {
  '/total-area-of-land-over-10-years-old': {
    fieldName: 'hectaresTenOrOverYearsOld',
    sumFields: ['hectaresTenOrOverYearsOld'],
    maxField: 'totalHectaresAppliedFor',
    errorText: (remaining) =>
      `Area of woodland over 10 years old must not be more than the total area of land parcels. You have ${remaining}ha available`
  },
  '/total-area-of-land-under-10-years-old': {
    fieldName: 'hectaresUnderTenYearsOld',
    sumFields: ['hectaresTenOrOverYearsOld', 'hectaresUnderTenYearsOld'],
    maxField: 'totalHectaresAppliedFor',
    errorText: (remaining) =>
      `Combined area of woodland over 10 years old and under 10 years old must not be more than the total area of land parcels. You have ${remaining}ha remaining`
  }
}

export default createSumValidatedController(woodlandHectaresRules)
