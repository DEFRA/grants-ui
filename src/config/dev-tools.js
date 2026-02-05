const isDevelopment = process.env.NODE_ENV === 'development'

/**
 * Dev tools configuration schema for convict
 * @type {import('convict').Schema<DevToolsConfig>}
 */
export const devToolsSchema = {
  enabled: {
    doc: 'Enable development tools and routes',
    format: Boolean,
    default: isDevelopment,
    env: 'DEV_TOOLS_ENABLED'
  },
  demoData: {
    referenceNumber: {
      doc: 'Demo reference number for dev tools',
      format: String,
      default: 'DEV2024001',
      env: 'DEV_DEMO_REF_NUMBER'
    },
    businessName: {
      doc: 'Demo business name for dev tools',
      format: String,
      default: 'Demo Test Farm Ltd',
      env: 'DEV_DEMO_BUSINESS_NAME'
    },
    sbi: {
      doc: 'Demo SBI number for dev tools',
      format: String,
      default: '999888777',
      env: 'DEV_DEMO_SBI'
    },
    contactName: {
      doc: 'Demo contact name for dev tools',
      format: String,
      default: 'Demo Test User',
      env: 'DEV_DEMO_CONTACT_NAME'
    },
    crn: {
      doc: 'Demo CRN for dev tools',
      format: String,
      default: '1234567890',
      env: 'DEV_DEMO_CRN'
    }
  },
  mappedData: {
    doc: 'Demo mapped API response data for dev tools details page preview',
    format: Object,
    default: {
      customer: {
        name: {
          first: 'John',
          middle: 'William',
          last: 'Smith'
        }
      },
      business: {
        name: 'Demo Test Farm Ltd',
        address: {
          line1: '123 Farm Road',
          line2: 'Little Village',
          city: 'Manchester',
          postalCode: 'M1 1AA'
        },
        phone: {
          mobile: '07123456789',
          landline: '01234567890'
        },
        email: {
          address: 'demo@testfarm.com'
        },
        type: {
          type: 'Limited Company'
        },
        vat: 'GB123456789'
      },
      countyParishHoldings: '12/345/6789'
    }
  }
}

/**
 * @typedef {object} DevToolsConfig
 * @property {boolean} enabled
 * @property {object} demoData
 * @property {string} demoData.referenceNumber
 * @property {string} demoData.businessName
 * @property {string} demoData.sbi
 * @property {string} demoData.contactName
 * @property {string} demoData.crn
 * @property {object} mappedData
 */
