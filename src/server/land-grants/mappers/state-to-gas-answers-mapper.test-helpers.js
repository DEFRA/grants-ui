export const applicant = {
  business: {
    name: 'Test Business',
    email: 'test@test.com',
    mobilePhoneNumber: '01234567890',
    address: {
      line1: 'A place',
      line2: '',
      line3: null,
      line4: null,
      line5: null,
      street: 'A Street',
      city: 'A City',
      postalCode: 'AA1 1AA'
    }
  },
  customer: {
    name: {
      title: 'Mr.',
      first: 'Test',
      middle: 'Customer',
      last: 'Test'
    }
  }
}

export const payment = {
  agreementStartDate: '2025-09-01',
  agreementEndDate: '2028-09-01',
  frequency: 'Quarterly',
  agreementTotalPence: 96018,
  annualTotalPence: 32006,
  parcelItems: {
    1: {
      code: 'CSAM1',
      description: 'CSAM1: Assess moorland and produce a written record',
      durationYears: 3,
      version: 1,
      unit: 'ha',
      quantity: 4.53411078,
      rateInPence: 1060,
      annualPaymentPence: 4806,
      sheetId: 'SX0679',
      parcelId: '9238'
    }
  },
  agreementLevelItems: {
    1: {
      code: 'CSAM1',
      description: 'CSAM1: Assess moorland and produce a written record',
      version: 1,
      durationYears: 3,
      annualPaymentPence: 27200
    }
  },
  payments: [
    {
      totalPaymentPence: 8007,
      paymentDate: '2025-12-05',
      lineItems: [
        {
          parcelItemId: 1,
          paymentPence: 1201
        },
        {
          agreementLevelItemId: 1,
          paymentPence: 6800
        }
      ]
    },
    {
      totalPaymentPence: 8001,
      paymentDate: '2026-03-05',
      lineItems: [
        {
          parcelItemId: 1,
          paymentPence: 1201
        },
        {
          agreementLevelItemId: 1,
          paymentPence: 6800
        }
      ]
    },
    {
      totalPaymentPence: 8001,
      paymentDate: '2026-06-05',
      lineItems: [
        {
          parcelItemId: 1,
          paymentPence: 1201
        },
        {
          agreementLevelItemId: 1,
          paymentPence: 6800
        }
      ]
    }
  ]
}
