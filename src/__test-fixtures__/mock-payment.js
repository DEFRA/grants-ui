export const MOCK_PAYMENT = {
  annualTotalPence: 150000,
  parcelItems: {
    item1: {
      sheetId: 'AB1234',
      parcelId: '0001',
      code: 'SAM1',
      description: 'Assess and record soil organic matter',
      quantity: '10.50',
      annualPaymentPence: 100000
    },
    item2: {
      sheetId: 'AB1234',
      parcelId: '0001',
      code: 'SAM2',
      description: 'Multi-species winter cover crop',
      quantity: '5.00',
      annualPaymentPence: 30000
    },
    item3: {
      sheetId: 'CD5678',
      parcelId: '0002',
      code: 'SAM1',
      description: 'Assess and record soil organic matter',
      quantity: '8.00',
      annualPaymentPence: 20000
    }
  },
  agreementLevelItems: {
    agl1: {
      code: 'AGR1',
      description: 'Agreement level action',
      annualPaymentPence: 50000
    }
  }
}
